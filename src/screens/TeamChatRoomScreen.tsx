import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Image,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { useMessages } from '../hooks/useMessages';
import { logError } from '../utils/logError';
import { requestChatUnreadRefresh } from '../hooks/useTotalChatUnread';
import { formatDayDivider, invertedDayDividerIndices } from '../utils/chatDays';
import { sendFailure } from '../utils/sendResult';
import { showsClubCrest } from '../lib/chatHelpers';
import { PollCard } from '../components/chat/PollCard';
import { CreatePollModal } from '../components/chat/CreatePollModal';
import SurveyPickerModal from '../components/chat/SurveyPickerModal';
import SurveyChatCard from '../components/chat/SurveyChatCard';
import { ChatBubble, type ReactionSummary } from '../components/chat/ChatBubble';
import { ChatInputBar, type AttachmentData, type EditingInfo } from '../components/chat/ChatInputBar';
import { ReactionPicker } from '../components/chat/ReactionPicker';
import { ChatToast, useChatToast } from '../components/chat/ChatToast';
import { MessageActionsSheet } from '../components/chat/MessageActionsModal';
import {
  CelebrationOverlay,
  type CelebrationType,
} from '../components/chat/CelebrationOverlay';
import {
  ReactionDetailsModal,
  type ReactionDetailItem,
} from '../components/chat/ReactionDetailsModal';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useChannelMembers } from '../hooks/useChannelMembers';
import { useChatSenderLabels } from '../hooks/useChatSenderLabels';
import { CHAT_FALLBACK_NAME, chatPersonName } from '../lib/memberNames';
import { isChannelStaff } from '../lib/channelStaff';
import { allowsMemberText, canSendText } from '../lib/announcementChannel';
import { useTypingPresence } from '../hooks/useTypingPresence';
import { TypingIndicator } from '../components/chat/TypingIndicator';
import { setActiveChannelId } from '../services/notifications';
import type { Message } from '../types';
import { resolveTeamColor } from '../constants/teamColors';

/**
 * The shape of the club embed added to this screen's `comm_channels` read for
 * ruling 1. Spelled out rather than cast to `any` so a change in the embed is
 * a type error here instead of an undefined at runtime.
 */
type ChannelClubRow = {
  teams?: {
    /** R-M: the team's assigned colour, for the header dot and accent line. */
    color?: string | null;
    clubs?: { name?: string | null; logo_url?: string | null } | null;
  } | null;
};

/** R9's flash, and R10's toast text. */
const HIGHLIGHT_MS = 1000;
const COPIED_TOAST = 'Copied';

function getCelebrationType(
  content: string,
  isCoach: boolean
): CelebrationType | null {
  const lower = (content || '').toLowerCase().trim();
  if (lower === '/celebrate') return 'celebrate';
  if (isCoach && (lower === 'goal' || content?.trim() === '⚽')) return 'goal';
  if (lower.includes('happy birthday')) return 'birthday';
  return null;
}

function getReactionsSummary(
  reactions: Message['reactions'],
  currentUserId: string | undefined
): ReactionSummary[] {
  if (!reactions?.length) return [];
  const byEmoji: Record<string, { count: number; userReacted: boolean }> = {};
  for (const r of reactions) {
    const emoji = r.reaction ?? r.emoji ?? '';
    if (!emoji) continue;
    if (!byEmoji[emoji]) {
      byEmoji[emoji] = { count: 0, userReacted: false };
    }
    byEmoji[emoji].count += 1;
    if (r.user_id === currentUserId) byEmoji[emoji].userReacted = true;
  }
  return Object.entries(byEmoji).map(([reaction, { count, userReacted }]) => ({
    reaction,
    count,
    userReacted,
  }));
}

export default function TeamChatRoomScreen({ route, navigation }: any) {
  const { channelId, channelName, teamName, channelType } = route.params || {};
  const { user } = useAuth();
  const flatListRef = useRef<FlatList>(null);
  const prevMessagesLengthRef = useRef(0);
  // Inverted list: offset 0 IS the newest message, so "at bottom" is a small
  // offset rather than a computed distance. No timers, no layout hacks -- an
  // inverted FlatList opens pinned to the newest row and stays put when the
  // reader has scrolled into history.
  const isAtBottomRef = useRef(true);

  const handleScroll = useCallback((e: any) => {
    const atBottom = e.nativeEvent.contentOffset.y < 80;
    isAtBottomRef.current = atBottom;
    setShowJumpToBottom((prev) => (prev === !atBottom ? prev : !atBottom));
    if (atBottom) setMissedCount((c) => (c === 0 ? c : 0));
  }, []);

  const scrollToNewest = useCallback((animated = true) => {
    flatListRef.current?.scrollToOffset({ offset: 0, animated });
  }, []);

  const jumpToBottom = useCallback(() => {
    isAtBottomRef.current = true;
    setShowJumpToBottom(false);
    setMissedCount(0);
    scrollToNewest(true);
  }, [scrollToNewest]);

  const isGroupDm = channelType === 'group_dm';

  const [sending, setSending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pollModalVisible, setPollModalVisible] = useState(false);
  const [surveyPickerVisible, setSurveyPickerVisible] = useState(false);
  const [replyingTo, setReplyingTo] = useState<{
    messageId: string;
    content: string;
    senderName: string;
  } | null>(null);
  const [reactionPickerVisible, setReactionPickerVisible] = useState(false);
  const [reactionPickerMessage, setReactionPickerMessage] =
    useState<Message | null>(null);
  const [actionsSheetVisible, setActionsSheetVisible] = useState(false);
  const [actionsSheetMessage, setActionsSheetMessage] =
    useState<Message | null>(null);
  // The message being edited, or null. Replaces a dead `editingMessageId` that
  // was set and never read.
  const [editing, setEditing] = useState<EditingInfo | null>(null);
  const [celebration, setCelebration] = useState<{
    type: CelebrationType;
    visible: boolean;
  }>({ type: 'celebrate', visible: false });
  const [showReactionDetails, setShowReactionDetails] = useState(false);
  const [selectedMessageReactions, setSelectedMessageReactions] = useState<
    ReactionDetailItem[]
  >([]);
  const [permissionsLoaded, setPermissionsLoaded] = useState(false);
  // Mirror of isAtBottomRef for render, plus a count of messages that arrived
  // while the reader was scrolled up.
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);
  const [missedCount, setMissedCount] = useState(0);
  /** R9: the message a quote-tap just jumped to, flashed for ~1 s. */
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** R10: the in-app "Copied" toast. */
  const toast = useChatToast();

  const [channelTeamId, setChannelTeamId] = useState<string | null>(null);
  /** R-M: the row value of `teams.color`; resolved for render below. */
  const [channelTeamHex, setChannelTeamHex] = useState<string | null>(null);
  /**
   * Phase D slice 4b. `allowMemberText` is the chat's own
   * comm_channels.allow_member_text, read through
   * src/lib/announcementChannel.ts so a null means the same thing here, on web
   * and in the server's `channel_allows_member_text`. It starts TRUE so an
   * announcement chat does not flash a composer before the row arrives.
   *
   * `isStaffHere` is the server's `is_channel_staff` — ruling Q3 B + Q3 B+ —
   * and is DELIBERATELY NOT `isStaffInChannel` below, which comes from
   * get_channel_member_labels and means "team staff anywhere in this chat's
   * club" after 4g. Those two disagree about real people: a club admin is staff
   * for the send gate and the labels function has never heard of him, and a
   * coach of another team in the same club is the other way round. The send
   * gate must be the one the policy asks (FND-4d3).
   *
   * Slice 4i (rulings I4 A / I5 A, Lu 2026-10-18) made `isStaffHere` the
   * answer for POLL decisions too, so it is now asked in EVERY chat instead of
   * only announcement-only ones. `undefined` still means "not known yet" and
   * every gate reads it as NOT staff, so a poll button appears when the answer
   * arrives rather than flashing for someone who may not have it.
   *
   * It is not named `isChannelStaff` because that identifier is the imported
   * function this state is filled from (line 43) — the name would shadow it.
   */
  const [allowMemberText, setAllowMemberText] = useState(true);
  /** The chat's club, for the header crest + name (ruling 1). */
  const [clubName, setClubName] = useState<string | null>(null);
  const [clubLogoUrl, setClubLogoUrl] = useState<string | null>(null);
  /** The chat's own kind, for the header crest gate (Lu, Oct 20 follow-up). */
  const [rowChannelType, setRowChannelType] = useState<string | null>(null);
  const [isStaffHere, setIsStaffHere] = useState<boolean | undefined>(undefined);

  // Called on mount, on focus, and on each incoming message (via useMessages'
  // onNewMessage). A failed stamp leaves a stale unread badge, so it is logged
  // rather than swallowed -- non-fatal, never thrown.
  const markChannelAsRead = useCallback(() => {
    if (!channelId || !user?.id) return;
    supabase
      .from('comm_channel_members')
      .update({ last_read_at: new Date().toISOString() })
      .eq('channel_id', channelId)
      .eq('user_id', user.id)
      .then(({ error }) => {
        if (error) {
          logError('TeamChatRoom.markChannelAsRead', error, { channelId });
          return;
        }
        // Stamp landed: re-count now so the chat tab and the app icon drop
        // immediately instead of waiting out the hook's 3 s debounce.
        requestChatUnreadRefresh();
      });
  }, [channelId, user?.id]);

  const {
    messages,
    loading,
    sendMessage,
    editMessage,
    toggleReaction,
    refetch,
  } = useMessages(channelId, markChannelAsRead);
  const { members: channelMembers } =
    useChannelMembers(channelId);
  const { memberNames, playerLabels, labelKind } = useChatSenderLabels(
    channelId,
    channelTeamId
  );
  // Staff status comes from the same server-side label RPC the bubbles use.
  // The old client-side team_staff .maybeSingle() errored for anyone holding
  // two staff roles on one team (head_coach + team_manager), which silently
  // demoted them and hid the poll button. Undefined while labels load, so the
  // button appears once they resolve.
  const isStaffInChannel = labelKind.get(user?.id ?? '') === 'staff';
  const { typingUsers, setTyping } = useTypingPresence(channelId);
  // Prefer the membership-gated RPC name over the typist's self-reported one.
  const typingNames = useMemo(
    () =>
      typingUsers.map((t) => memberNames.get(t.userId)?.name || t.name),
    [typingUsers, memberNames]
  );


  const messageIds = messages.map((m) => m.id);
  // Newest first: index 0 renders at the bottom of an inverted list.
  const invertedMessages = useMemo(() => [...messages].reverse(), [messages]);
  /**
   * R9: "if the original isn't loaded in the list, do nothing (no crash, no
   * empty jump)." The thread holds the newest 100 rows (`useMessages` limit), so
   * a reply to something older has no target. Memoised as a Set because the
   * alternative -- scanning the array once per rendered row -- is 100x100.
   */
  const loadedMessageIds = useMemo(
    () => new Set(messages.map((m) => m.id)),
    [messages]
  );

  const isCoach = isStaffInChannel;

  /**
   * P5 (ruling, Lu 2026-10-21) -- the header's two lines, one shape for every
   * chat type. See the comment on the header itself for the shape and for why
   * `teamName` carries "N members" on a group chat.
   *
   * The kind is taken from `rowChannelType` FIRST -- that is the channel row's
   * own `channel_type`, read in the effect above -- and only then from the
   * route param, which arrives `undefined` on a push-opened room. Either way
   * the fallbacks are the ones already in use, so a chat with nothing resolved
   * yet reads exactly as it did before.
   */
  const isGroupChat = rowChannelType
    ? rowChannelType === 'group_dm'
    : isGroupDm;
  const headerTitleText = isGroupChat
    ? channelName || 'Group Chat'
    : teamName || channelName || 'Team Chat';
  const headerSubtitleText = isGroupChat
    ? // `teamName` here is the list's card line 2 = "N members".
      [clubName, teamName].filter(Boolean).join(' · ')
    : [clubName, teamName ? channelName || 'Team Chat' : null]
        .filter(Boolean)
        .join(' · ');

  /**
   * R-M: the room's team colour, or null when the room has no team. Gated on
   * `channelTeamId`, which the effect above sets ONLY from a channel row that
   * has a `team_id` -- a DM, a club chat and a group chat all leave it null,
   * so none of them grows a dot or an accent line. It stays null until that
   * read lands, so the header never flashes a guessed colour.
   */
  const teamAccent = channelTeamId
    ? resolveTeamColor({ id: channelTeamId, color: channelTeamHex })
    : null;

  useEffect(() => {
    const checkStaffPermission = async () => {
      if (!channelId || !user?.id) {
        setChannelTeamId(null);
        setPermissionsLoaded(true);
        return;
      }
      try {
        const { data: channelData } = await supabase
          .from('comm_channels')
          .select(
            // R-M adds `color` to the embed this screen already makes -- the
            // header's dot and accent line need the team's own colour, and a
            // second query for one column would be the wrong trade.
            'team_id, channel_type, allow_member_text, teams(club_id, color, clubs(name, logo_url))'
          )
          .eq('id', channelId)
          .single();
        // 4b: the flag is read for EVERY chat kind, so this runs before the
        // team_id branch below returns early. A club chat and a group chat have
        // no team_id and can still be announcement-only.
        setAllowMemberText(allowsMemberText(channelData));
        /*
         * Ruling 1: the club crest and club NAME belong in the open-chat
         * header. The club is the chat's team's club -- the same path the
         * server walks for `get_my_conversations.channel_club_id` -- so it is
         * read here as one nested embed on a query this screen already makes,
         * rather than as a second round trip. A chat with no team has no club
         * and gets no crest, which is the same answer the list reaches.
         */
        const clubRow =
          (channelData as ChannelClubRow | null)?.teams?.clubs ?? null;
        setClubName(clubRow?.name ?? null);
        setClubLogoUrl(clubRow?.logo_url ?? null);
        setChannelTeamHex(
          (channelData as ChannelClubRow | null)?.teams?.color ?? null
        );
        // Read from the ROW, not from the route param: `channelType` arrives
        // undefined on a push-opened room, so it cannot carry the crest gate.
        setRowChannelType(
          (channelData as { channel_type?: string | null } | null)
            ?.channel_type ?? null
        );
        if (!channelData?.team_id) {
          setChannelTeamId(null);
          setChannelTeamHex(null);
          setPermissionsLoaded(true);
          return;
        }
        setChannelTeamId(channelData.team_id);
      } catch (err) {
        console.log('Error resolving channel team:', err);
      } finally {
        setPermissionsLoaded(true);
      }
    };
    checkStaffPermission();
  }, [channelId, user?.id]);

  // 4b: the send gate's staff answer. 4i: also the POLL answer, so it is asked
  // for every chat now -- the `allowMemberText` early return is gone, because a
  // poll gate needs this in ordinary chats too. One call per chat opened, and
  // `undefined` while it is in flight, which ChatInputBar and both poll gates
  // read as NOT staff.
  //
  // This cannot change the send gate: `canSendText` is
  // `allowMemberText || isStaff === true`, so in a chat that allows member text
  // the composer shows whatever this answers.
  useEffect(() => {
    if (!channelId) {
      setIsStaffHere(undefined);
      return;
    }
    let cancelled = false;
    setIsStaffHere(undefined);
    isChannelStaff(channelId).then((answer) => {
      if (!cancelled) setIsStaffHere(answer);
    });
    return () => {
      cancelled = true;
    };
  }, [channelId]);

  // 1. Mark read on mount
  useEffect(() => {
    if (channelId) markChannelAsRead();
  }, [channelId]); // eslint-disable-line react-hooks/exhaustive-deps

  // 2. Mark read whenever screen regains focus (user navigates back)
  useFocusEffect(
    useCallback(() => {
      markChannelAsRead();
      // Suppress foreground banners for the room being read.
      setActiveChannelId(channelId ?? null);
      return () => {
        setActiveChannelId(null);
        setTyping(false);
      };
    }, [markChannelAsRead, channelId, setTyping])
  );
  // Note: new-message real-time case is handled via onNewMessage callback in useMessages

  // TODO: "jump to first unread" divider -- v1 always opens at the newest
  // message even when the channel has unread history.
  // No scrolling here: an inverted list already shows new rows at offset 0, and
  // leaves the viewport alone when the reader is up in history. All this does is
  // tally what they missed while scrolled away.
  useEffect(() => {
    if (messages.length === 0) return;
    if (messages.length > prevMessagesLengthRef.current) {
      const arrived = messages.length - prevMessagesLengthRef.current;
      prevMessagesLengthRef.current = messages.length;
      if (!isAtBottomRef.current) {
        setMissedCount((c) => c + arrived);
      }
    }
  }, [messages]);

  // A new channel means a new conversation to open at the bottom.
  useEffect(() => {
    isAtBottomRef.current = true;
    prevMessagesLengthRef.current = 0;
    setShowJumpToBottom(false);
    setMissedCount(0);
  }, [channelId]);

  const handleShareSurvey = async (surveyId: string, surveyTitle: string) => {
    setSurveyPickerVisible(false);
    if (!channelId || !user?.id) return;
    try {
      const { data: msgData } = await supabase
        .from('comm_messages')
        .insert({
          channel_id: channelId,
          user_id: user.id,
          content: surveyTitle,
          message_type: 'survey',
        })
        .select('id')
        .single();

      if (msgData?.id) {
        await supabase.from('sv_chat_shares').insert({
          survey_id: surveyId,
          channel_id: channelId,
          posted_by: user.id,
          message_id: msgData.id,
        });
        refetch();
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to share survey. Please try again.');
    }
  };

  const handleSendMessage = async (
    content: string,
    attachment?: AttachmentData
  ) => {
    // Intercept /survey command
    if (content.trim().toLowerCase() === '/survey' && !attachment) {
      if (!isStaffInChannel) {
        Alert.alert('Not Authorized', 'Only team staff can share surveys in chat.');
        return;
      }
      setSurveyPickerVisible(true);
      return;
    }

    if (sending) return;
    setSending(true);
    try {
      const result = await sendMessage(content, {
        attachment: attachment
          ? {
              uri: attachment.uri,
              type: attachment.type,
              name: attachment.name,
              mimeType: attachment.mimeType,
              size: attachment.size,
            }
          : undefined,
        replyTo: replyingTo
          ? {
              id: replyingTo.messageId,
              content: replyingTo.content,
              senderName: replyingTo.senderName,
            }
          : undefined,
      });
      if (result.ok) {
        setReplyingTo(null);
        isAtBottomRef.current = true;
        scrollToNewest(true);
        const celebrationType = getCelebrationType(content, isCoach ?? false);
        if (celebrationType) {
          setCelebration({ type: celebrationType, visible: true });
        }
      }
      // The reason rides back to ChatInputBar, which picks the copy. Returning
      // a bare false here is what let an insert failure claim an attachment
      // could not be uploaded.
      return result;
    } catch (error) {
      logError('TeamChatRoom.handleSendMessage', error, { channelId });
      return sendFailure(
        'unknown',
        error instanceof Error ? error.message : 'send threw'
      );
    } finally {
      setSending(false);
    }
  };

  const handleReactionSelect = async (emoji: string) => {
    if (!reactionPickerMessage?.id) return;
    try {
      // No refetch here: toggleReaction paints optimistically and the realtime
      // hub reconciles silently. The explicit refetch flipped `loading` and
      // replaced the whole thread with a spinner, undoing the optimistic paint
      // on the picker path only -- the bubble-tap path never did this.
      await toggleReaction(reactionPickerMessage.id, emoji);
    } catch (error) {
      console.error('Failed to add reaction:', error);
    } finally {
      setReactionPickerVisible(false);
      setReactionPickerMessage(null);
    }
  };

  const openReactionPicker = (message: Message) => {
    setReactionPickerMessage(message);
    setReactionPickerVisible(true);
  };

  const handleShowReactionDetails = (reactions: ReactionDetailItem[]) => {
    setSelectedMessageReactions(reactions);
    setShowReactionDetails(true);
  };

  const openActionsSheet = (message: Message) => {
    setActionsSheetMessage(message);
    setActionsSheetVisible(true);
  };

  const handleDeleteMessage = async (messageId: string) => {
    try {
      const { data, error } = await supabase.rpc('soft_delete_message', {
        p_message_id: messageId,
      });

      if (error || data === false) {
        Alert.alert('Error', 'Failed to delete message');
        return;
      }

      await refetch();
    } catch (err) {
      console.error('[DELETE] Exception:', err);
      Alert.alert('Error', 'Failed to delete message');
    }
  };

  /**
   * Enter edit mode. The input bar prefills with the current text and shows an
   * "Editing message" banner; saving goes through useMessages.editMessage,
   * which is author-scoped and sets is_edited/edited_at.
   *
   * The 5-minute window is enforced where the action is offered
   * (MessageActionsSheet); by the time we are here the user has a live offer.
   */
  const handleEditMessage = (messageId: string) => {
    const target = messages.find((m) => m.id === messageId);
    if (!target) {
      logError('TeamChatRoom.handleEditMessage', 'message not in loaded window', {
        messageId,
      });
      return;
    }
    // Editing and replying are different intents; never both at once.
    setReplyingTo(null);
    setEditing({ id: messageId, content: target.content ?? '' });
  };

  const handleSaveEdit = async (messageId: string, content: string) => {
    const result = await editMessage(messageId, content);
    // ChatInputBar alerts off the reason and keeps the draft on failure.
    return result;
  };

  /**
   * Who has read this message.
   *
   * The screen needs the message's timestamp and author, not just its id: "read"
   * means a member's last_read_at is at or after this message, and the author is
   * excluded from both lists. Passing them avoids a second read of a row we are
   * already holding.
   */
  const handleViewReadHistory = (messageId: string) => {
    const target = messages.find((m) => m.id === messageId);
    if (!target) {
      logError('TeamChatRoom.handleViewReadHistory', 'message not in loaded window', {
        messageId,
      });
      return;
    }
    navigation.navigate('MessageReadHistory', {
      channelId,
      messageId,
      messageCreatedAt: target.created_at,
      authorId: target.user_id,
    });
  };

  // `handleViewProfile` lived here. It fed the v1 sheet's "View Profile" row,
  // which was already removed for want of a registered `UserProfile` route; R2's
  // row list does not include it either, so the handler went with the prop.

  // `openReactionPickerFromActions` lived here -- the sheet's "More" button's
  // way into the picker. R7 took the emoji row out of the sheet entirely, so the
  // sheet no longer has any path into the picker: the ☺+ icon is it.

  /**
   * THE reply path. R3 added a third trigger (swipe-right) to the two that
   * existed -- the sheet's Reply row and the picker's Reply button -- and the
   * two were already byte-identical copies of this body reading two different
   * pieces of state. One function now, taking the message, so a fourth trigger
   * cannot introduce a fourth quote-resolution order.
   *
   * The senderName ladder is the one the bubble renders with (memberNames from
   * the gated RPC first, the profiles join only as fallback). Reading the join
   * alone made the sheet show 'Unknown' on the very screen whose bubble had the
   * name -- and this string is PERSISTED into reply_to_sender, so the last rung
   * is the one ruled fallback: an 'Unknown' here was written to the database and
   * outlived every later display fix.
   */
  const beginReply = (message: Message) => {
    setReplyingTo({
      messageId: message.id,
      content:
        message.content?.trim() ||
        (message.attachment_name
          ? `📎 ${message.attachment_name}`
          : 'Attachment'),
      senderName:
        memberNames.get(message.user_id)?.name ||
        (message as any).profiles?.full_name ||
        message.profile?.full_name ||
        CHAT_FALLBACK_NAME,
    });
  };

  const startReplyFromActions = () => {
    if (actionsSheetMessage) beginReply(actionsSheetMessage);
    setActionsSheetVisible(false);
  };

  // `startReply` lived here. It was the ☺+ popover's Reply button, which R8
  // removed: "remove the 'Reply' button from the popover." The two remaining
  // paths to a quote are the sheet's Reply row and R3's swipe-right, both of
  // which call `beginReply` directly.

  /**
   * R9: tap the quote block -> scroll to the original and flash it ~1 s.
   *
   * Guarded twice on purpose. The bubble is handed NO handler at all when the
   * original is outside the loaded window (so the block is not even pressable),
   * and this still re-checks the index, because the window can shift between the
   * render that drew the quote and the tap that follows it. A miss is a silent
   * no-op -- R9's "no crash, no empty jump".
   */
  const scrollToMessageId = (messageId: string) => {
    const index = invertedMessages.findIndex((m) => m.id === messageId);
    if (index < 0) return;
    flatListRef.current?.scrollToIndex({ index, animated: true });
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    setHighlightedId(messageId);
    highlightTimerRef.current = setTimeout(
      () => setHighlightedId(null),
      HIGHLIGHT_MS
    );
  };

  /**
   * Who may START a poll. Ruling I5 A (Lu, 2026-10-18): in a team or club chat,
   * the CHAT's staff; in a group chat, any member — unchanged.
   *
   * The team/club arm used to read `isStaffInChannel`, the label_kind answer,
   * which means "team staff anywhere in this chat's club". That offered the
   * poll button to a coach of a DIFFERENT team in the same club, and withheld
   * it from a club_admin the labels function has never heard of. `isStaffHere`
   * is the server's `is_channel_staff`, the same answer 4d's Close uses, so
   * creating and closing a poll now agree about who staff is.
   *
   * `=== true` on purpose: `undefined` is "not answered yet" and must not open
   * the gate.
   */
  const canUserCreatePoll = useMemo(() => {
    if (channelType === 'group_dm' || channelType === 'dm') {
      return true;
    }
    return isStaffHere === true;
  }, [channelType, isStaffHere]);

  /**
   * May THIS person post in THIS chat? Ruling R5 (Lu, 2026-10-23): in a locked
   * chat (`allow_member_text === false`) a non-staff member gets the notice
   * instead of the composer, Reply is hidden from the sheet and swipe-reply is
   * disabled -- while reactions stay available.
   *
   * It is the SAME predicate the composer uses (`canSendText`) over the SAME two
   * inputs, so the sheet, the swipe and the input bar cannot disagree about one
   * chat. `isStaffHere` is the server's `is_channel_staff` and NOT
   * `isStaffInChannel` (the label RPC's "team staff anywhere in this club"):
   * replying is a send, and the send gate must be the one `msg_insert` asks.
   * `undefined` = not answered yet = not staff, so a locked chat opens with
   * Reply hidden rather than offering a reply the server would refuse.
   */
  const canReplyHere = canSendText({
    allowMemberText,
    isStaff: isStaffHere,
  });

  // A screen left mid-flash must not come back to a pending timer.
  useEffect(
    () => () => {
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    },
    []
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  /**
   * Day grouping and labels both come from src/utils/chatDays.ts, which works
   * in the READER's local calendar day and is unit-tested across timezones
   * (Denver, Tokyo, UTC). They used to be two ad-hoc helpers here -- grouping
   * by a hand-rolled local key, labelling by toDateString() -- with no test
   * holding them to the same definition of "day".
   */
  /**
   * Which rows of the inverted list carry a day divider, computed once per
   * message change by the unit-tested helper rather than by neighbour lookups
   * inside renderItem.
   */
  const dayDividerIndices = useMemo(
    () => invertedDayDividerIndices(invertedMessages.map((m) => m.created_at)),
    [invertedMessages]
  );

  const formatDateSeparator = (dateString: string) => formatDayDivider(dateString);

  /**
   * The day divider row.
   *
   * ORDER IS LOAD-BEARING: this renders AFTER the message in JSX, not before.
   * The list is `inverted`, and an inverted cell draws its own children
   * bottom-up, so a separator placed first in JSX appeared BELOW the message it
   * belongs to -- which is why two messages a few seconds apart on the same day
   * showed "Today" wedged between them instead of above both.
   */
  const renderDaySeparator = (show: boolean, createdAt: string) => {
    if (!show) return null;
    const label = formatDateSeparator(createdAt);
    if (!label) return null; // unparseable timestamp: group, do not label
    return (
      <View style={styles.daySeparator}>
        <Text style={styles.daySeparatorText}>{label}</Text>
        <View style={styles.daySeparatorLine} />
      </View>
    );
  };

  const renderItem = ({ item, index }: { item: Message; index: number }) => {
    // Which rows carry a divider is decided once, by the tested helper, over
    // the inverted array -- the divider belongs to the OLDEST message of each
    // local day.
    const showDaySeparator = dayDividerIndices.has(index);

    if (item.message_type === 'poll' && item.poll_id) {
      return (
        <>
          <View style={styles.messageContainer}>
            {/* 4i: the `isStaffInChannel` prop is gone. PollCard's remaining
                staff jobs (reminder button, anonymous-voter names) now read
                the `is_channel_staff` answer `usePoll` ALREADY fetched for
                4d's Close, so the card needs nothing passed in and makes no
                extra call. */}
            <PollCard pollId={item.poll_id} compact={true} />
          </View>
          {renderDaySeparator(showDaySeparator, item.created_at)}
        </>
      );
    }

    if (item.message_type === 'survey') {
      return (
        <>
          <SurveyChatCard messageId={item.id} navigation={navigation} />
          {renderDaySeparator(showDaySeparator, item.created_at)}
        </>
      );
    }

    const isOwnMessage = item.user_id === user?.id;
    const reactionsSummary = getReactionsSummary(item.reactions, user?.id);
    const senderLabelKind = labelKind.get(item.user_id) ?? null;
    const playerLabel =
      senderLabelKind === 'staff' ? null : playerLabels.get(item.user_id);

    const replyTo =
      item.reply_to_id && (item.reply_to_content != null || item.reply_to_sender != null)
        ? {
            content: item.reply_to_content ?? '(message)',
            // reply_to_sender is a string persisted on the row at send time.
            // Null means it was never captured -- which is the case for every
            // reply made on the WEB before Phase D slice 4f. Ruling Q7 A fills
            // those rows' quote from the parent at read time and hands the
            // parent's author id over in reply_to_user_id (see
            // useMessages.withReplyQuoteFallback), so the middle rung resolves
            // the name through the SAME memberNames ladder the bubble below
            // uses rather than printing the fallback over a person who has one.
            // R9: "the original sender's name (resolved name, 'Thryvyng
            // member' fallback, never an email)". The ladder is unchanged; what
            // is new is that its result goes through `chatPersonName`, which is
            // the one function that turns an address, a blank or a non-name into
            // CHAT_FALLBACK_NAME. The WRITE path already did this
            // (`useMessages.ts:425`); the READ path did not, so a profile whose
            // full_name is an email -- or an old row whose persisted
            // reply_to_sender is one -- printed the address in the quote.
            senderName: chatPersonName(
              item.reply_to_sender ??
                (item.reply_to_user_id
                  ? memberNames.get(item.reply_to_user_id)?.name
                  : undefined) ??
                CHAT_FALLBACK_NAME
            ),
          }
        : undefined;

    return (
      <>
        <View style={styles.messageContainer}>
          <ChatBubble
          message={{
            id: item.id,
            content: item.content,
            user_id: item.user_id,
            created_at: item.created_at,
            is_edited: (item as any).is_edited ?? false,
            edited_at: (item as any).edited_at ?? null,
            comm_message_attachments: item.comm_message_attachments,
            attachment_url: item.attachment_url ?? undefined,
            attachment_type: item.attachment_type ?? undefined,
            attachment_name: item.attachment_name ?? undefined,
          }}
          isOwnMessage={isOwnMessage}
          senderName={
            memberNames.get(item.user_id)?.name ||
            (item as any).profiles?.full_name ||
            item.profile?.full_name
          }
          playerLabel={playerLabel ?? undefined}
          labelKind={senderLabelKind}
          senderAvatar={
            memberNames.get(item.user_id)?.avatar ||
            (item as any).profiles?.avatar_url ||
            item.profile?.avatar_url
          }
          senderRole={
            (item as any).profiles?.role ||
            (item as any).profile?.role ||
            undefined
          }
          showSenderInfo={true}
          reactions={reactionsSummary.length > 0 ? reactionsSummary : undefined}
          replyTo={replyTo}
          onLongPress={() => openActionsSheet(item)}
          onEmojiPress={() => openReactionPicker(item)}
          onSwipeReply={canReplyHere ? () => beginReply(item) : undefined}
          /* R9: a handler ONLY when the original is in the loaded window, so
             a quote with nothing to jump to is not pressable at all. */
          onReplyPress={
            item.reply_to_id && loadedMessageIds.has(item.reply_to_id)
              ? () => scrollToMessageId(item.reply_to_id!)
              : undefined
          }
          highlighted={highlightedId === item.id}
          onReactionPress={(reaction) => toggleReaction(item.id, reaction)}
          onShowReactionDetails={() =>
            handleShowReactionDetails(
              (item.reactions ?? []) as ReactionDetailItem[]
            )
          }
        />
        </View>
        {renderDaySeparator(showDaySeparator, item.created_at)}
      </>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#8b5cf6" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Custom Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Feather name="arrow-left" size={24} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.headerCenter}
          onPress={() => {
            if (isGroupDm) {
              navigation.navigate('GroupInfo', { channelId });
            }
          }}
          disabled={!isGroupDm}
        >
          {/* P5 (ruling, Lu 2026-10-21): ONE header shape for every chat
              type, and it matches the list cards -- line 1 is the chat's NAME,
              line 2 is context.
                * team chat  -> team name        / "<Club> · <channel>"
                * club chat  -> channel name     / "<Club>"
                * group chat -> GROUP NAME       / "<Club> · N members"
              A group chat used to render INVERTED -- "2 members" as the title
              and "9c hide test" underneath -- because the `teamName` route
              param is whatever the list put on the card's line 2
              (`ChatScreen.handleConversationPress` passes `displaySubtitle`),
              and for a group chat that string IS "N members". So the param is
              both the cause and, for line 2, the cure: the count is already in
              hand and no new query was added for it. The club name stays on a
              group's line 2 only because the header already showed it there
              today. */}
          <View style={styles.headerTitleRow}>
            {/* Ruling 1: the club crest sits beside the title. A club with no
                logo_url gets NO crest and no placeholder.
                Lu, Oct 20 follow-up: and only a TEAM or CLUB chat shows one at
                all -- a group chat that happens to hang off a team must not
                wear the club's crest, the same rule the chat list's cards now
                follow. The club NAME on the subtitle line is untouched; the
                ruling named the crest. */}
            {clubLogoUrl && showsClubCrest(rowChannelType) ? (
              <Image
                source={{ uri: clubLogoUrl }}
                style={styles.headerCrest}
              />
            ) : null}
            {/* R-M: the team dot before the name, a team chat only. */}
            {teamAccent ? (
              <View
                style={[styles.headerTeamDot, { backgroundColor: teamAccent }]}
              />
            ) : null}
            <Text style={styles.headerTitle} numberOfLines={1}>
              {headerTitleText}
            </Text>
          </View>
          {/* Ruling 1: the club NAME joins the secondary line. With no club it
              is omitted entirely rather than shown as an empty separator. */}
          {headerSubtitleText ? (
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              {headerSubtitleText}
            </Text>
          ) : null}
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.headerMenuButton}
          onPress={() => navigation.navigate('ChatInfo', {
            channelId,
            channelName,
            teamId: channelTeamId,
            channelType,
          })}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Feather name="more-vertical" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* R-M: a 2pt line in the team's colour, directly under the header. The
          whole of the subtle version of "this room belongs to that team" --
          bubbles, composer and send path are untouched. */}
      {teamAccent ? (
        <View style={[styles.headerTeamAccent, { backgroundColor: teamAccent }]} />
      ) : null}

      {/* Chat Area with Keyboard Handling */}
      <KeyboardAvoidingView
        style={styles.chatArea}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <View style={styles.listWrapper}>
        <FlatList
          ref={flatListRef}
          inverted
          data={invertedMessages}
          style={{ flex: 1 }}
          renderItem={renderItem}
          keyExtractor={(item, index) => `${item.id}-${index}`}
          contentContainerStyle={styles.messagesList}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          /* R9: `scrollToIndex` on a row the list has not measured throws
             without one of these. The quote-tap is the only caller and a missed
             jump must be silent, so this resolves to the nearest offset and
             leaves the thread where the user can see it. */
          onScrollToIndexFailed={(info) => {
            flatListRef.current?.scrollToOffset({
              offset: info.averageItemLength * info.index,
              animated: true,
            });
          }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#8b5cf6"
            />
          }
        />

          {/* R10: over the thread, under nothing. Inside `listWrapper` so it
              sits above the messages and clear of the composer. */}
          <ChatToast message={toast.message} />

          {showJumpToBottom && (
            <TouchableOpacity
              style={styles.jumpToBottomButton}
              onPress={jumpToBottom}
              activeOpacity={0.85}
            >
              <Feather name="chevron-down" size={22} color="#FFFFFF" />
              {missedCount > 0 && (
                <View style={styles.jumpToBottomBadge}>
                  <Text style={styles.jumpToBottomBadgeText}>
                    {missedCount > 99 ? '99+' : missedCount}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          )}
        </View>

        <TypingIndicator users={typingNames} />

        <ChatInputBar
          allowMemberText={allowMemberText}
          isChannelStaff={isStaffHere}
          /* R5: the notice's copy depends on the chat's kind. The ROW's
             channel_type first -- the route param arrives undefined on a
             push-opened room, the same reason the header crest reads the row. */
          channelKind={rowChannelType ?? channelType ?? null}
          onSendMessage={handleSendMessage}
          onTypingChange={setTyping}
          onPollPress={canUserCreatePoll ? () => setPollModalVisible(true) : undefined}
          placeholder="Type a message..."
          replyingTo={
            replyingTo
              ? { senderName: replyingTo.senderName, content: replyingTo.content }
              : null
          }
          onCancelReply={() => setReplyingTo(null)}
          editing={editing}
          onCancelEdit={() => setEditing(null)}
          onSaveEdit={handleSaveEdit}
        />
      </KeyboardAvoidingView>

      <CreatePollModal
        visible={pollModalVisible}
        onClose={() => setPollModalVisible(false)}
        channelId={channelId}
        onSuccess={async () => {
          // A new poll card is the tallest thing that can land in the list, and
          // it measures late. Pin first so the guarded follow-ups fire.
          isAtBottomRef.current = true;
          await refetch();
          scrollToNewest(true);
        }}
      />

      <SurveyPickerModal
        visible={surveyPickerVisible}
        channelId={channelId}
        teamId={channelTeamId}
        isStaff={isStaffInChannel}
        onClose={() => setSurveyPickerVisible(false)}
        onShare={handleShareSurvey}
      />

      <ReactionPicker
        visible={reactionPickerVisible}
        onSelect={handleReactionSelect}
        onClose={() => {
          setReactionPickerVisible(false);
          setReactionPickerMessage(null);
        }}
      />

      <CelebrationOverlay
        type={celebration.type}
        visible={celebration.visible}
        onComplete={() => setCelebration({ type: 'celebrate', visible: false })}
      />

      <ReactionDetailsModal
        visible={showReactionDetails}
        onClose={() => setShowReactionDetails(false)}
        reactions={selectedMessageReactions}
        nameFor={(userId) => memberNames.get(userId)?.name}
      />

      <MessageActionsSheet
        visible={actionsSheetVisible}
        onClose={() => {
          setActionsSheetVisible(false);
          setActionsSheetMessage(null);
        }}
        message={actionsSheetMessage}
        currentUserId={user?.id || ''}
        isStaff={isStaffInChannel}
        canReply={canReplyHere}
        onCopied={() => toast.show(COPIED_TOAST)}
        onEdit={handleEditMessage}
        onDelete={handleDeleteMessage}
        onReply={startReplyFromActions}
        onViewReadHistory={handleViewReadHistory}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  listWrapper: {
    flex: 1,
  },
  jumpToBottomButton: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#8b5cf6',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  jumpToBottomBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  jumpToBottomBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    backgroundColor: '#0f172a',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  // R-M: the team dot, and the 2pt accent line under the whole header.
  headerTeamDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
  headerTeamAccent: {
    height: 2,
  },
  // Large and bold: the team name is what identifies the room.
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerCrest: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 19,
    fontWeight: '700',
  },
  // Small and muted grey -- it is "Team Chat", a label, not a second title.
  headerSubtitle: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 1,
  },
  headerIconButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerMenuButton: {
    padding: 8,
  },
  chatArea: {
    flex: 1,
  },
  messagesList: {
    padding: 16,
    paddingBottom: 20,
  },
  daySeparator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
    paddingHorizontal: 12,
  },
  daySeparatorText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    marginRight: 12,
  },
  daySeparatorLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#374151',
  },
  messageContainer: {
    marginBottom: 16,
  },
  ownMessageContainer: {
    alignItems: 'flex-end',
  },
  messageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  messageSender: {
    color: '#8b5cf6',
    fontSize: 12,
    fontWeight: '600',
    marginRight: 8,
  },
  messageTime: {
    color: '#666',
    fontSize: 11,
  },
  messageContent: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 16,
  },
  ownMessageContent: {
    backgroundColor: '#8b5cf6',
    borderBottomRightRadius: 4,
  },
  otherMessageContent: {
    backgroundColor: '#2a2a4e',
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 20,
  },
  ownMessageText: {
    color: '#fff',
  },
  otherMessageText: {
    color: '#fff',
  },
  pinnedText: {
    color: '#ffd700',
    fontSize: 11,
    marginTop: 4,
    fontWeight: '500',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    paddingBottom: 30,
    backgroundColor: '#2a2a4e',
    borderTopWidth: 1,
    borderTopColor: '#3a3a5e',
    gap: 10,
  },
  pollButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#3a3a5e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pollButtonText: {
    fontSize: 18,
  },
  input: {
    flex: 1,
    backgroundColor: '#3a3a5e',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: '#fff',
    fontSize: 15,
    maxHeight: 100,
  },
  sendButton: {
    backgroundColor: '#8b5cf6',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  sendButtonDisabled: {
    backgroundColor: '#3a3a5e',
  },
  sendButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});
