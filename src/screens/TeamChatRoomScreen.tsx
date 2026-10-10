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
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { useMessages } from '../hooks/useMessages';
import { logError } from '../utils/logError';
import { formatDayDivider, invertedDayDividerIndices } from '../utils/chatDays';
import { sendFailure } from '../utils/sendResult';
import { PollCard } from '../components/chat/PollCard';
import { CreatePollModal } from '../components/chat/CreatePollModal';
import SurveyPickerModal from '../components/chat/SurveyPickerModal';
import SurveyChatCard from '../components/chat/SurveyChatCard';
import { ChatBubble, type ReactionSummary } from '../components/chat/ChatBubble';
import { ChatInputBar, type AttachmentData, type EditingInfo } from '../components/chat/ChatInputBar';
import { ReactionPicker } from '../components/chat/ReactionPicker';
import { MessageActionsModal } from '../components/chat/MessageActionsModal';
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
import { useTypingPresence } from '../hooks/useTypingPresence';
import { TypingIndicator } from '../components/chat/TypingIndicator';
import { setActiveChannelId } from '../services/notifications';
import type { Message } from '../types';

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
  const [actionsModalVisible, setActionsModalVisible] = useState(false);
  const [actionsModalMessage, setActionsModalMessage] =
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

  const [channelTeamId, setChannelTeamId] = useState<string | null>(null);

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
        }
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

  const isCoach = isStaffInChannel;

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
          .select('team_id')
          .eq('id', channelId)
          .single();
        if (!channelData?.team_id) {
          setChannelTeamId(null);
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

  const openActionsModal = (message: Message) => {
    setActionsModalMessage(message);
    setActionsModalVisible(true);
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
   * (MessageActionsModal); by the time we are here the user has a live offer.
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

  const handleMuteUser = async (userId: string, userName: string) => {
    // TODO: Implement mute in database
    Alert.alert('Muted', `${userName} has been muted in this conversation`);
  };

  const handleBlockUser = async (userId: string, userName: string) => {
    // TODO: Implement block in database
    Alert.alert('Blocked', `${userName} has been blocked from this channel`);
  };

  const handleViewProfile = (userId: string) => {
    navigation.navigate('UserProfile', { userId });
  };

  const openReactionPickerFromActions = () => {
    setActionsModalVisible(false);
    if (actionsModalMessage) {
      setReactionPickerMessage(actionsModalMessage);
      setReactionPickerVisible(true);
    }
  };

  const startReplyFromActions = () => {
    if (actionsModalMessage) {
      setReplyingTo({
        messageId: actionsModalMessage.id,
        content:
          actionsModalMessage.content?.trim() ||
          (actionsModalMessage.attachment_name
            ? `📎 ${actionsModalMessage.attachment_name}`
            : 'Attachment'),
        // Same resolution order as the bubble renders (memberNames from the
        // gated RPC first, the profiles join only as fallback). Reading the join
        // alone made this modal show 'Unknown' on the very screen whose bubble
        // had the name -- and it is persisted into reply_to_sender.
        senderName:
          memberNames.get(actionsModalMessage.user_id)?.name ||
          (actionsModalMessage as any).profiles?.full_name ||
          actionsModalMessage.profile?.full_name ||
          'Unknown',
      });
    }
    setActionsModalVisible(false);
  };

  const startReply = () => {
    if (reactionPickerMessage) {
      setReplyingTo({
        messageId: reactionPickerMessage.id,
        content:
          reactionPickerMessage.content?.trim() ||
          (reactionPickerMessage.attachment_name
            ? `📎 ${reactionPickerMessage.attachment_name}`
            : 'Attachment'),
        // memberNames first, join as fallback -- see startReplyFromActions.
        senderName:
          memberNames.get(reactionPickerMessage.user_id)?.name ||
          (reactionPickerMessage as any).profiles?.full_name ||
          reactionPickerMessage.profile?.full_name ||
          'Unknown',
      });
    }
    setReactionPickerMessage(null);
    setReactionPickerVisible(false);
  };

  const scrollToMessageId = (messageId: string) => {
    const index = invertedMessages.findIndex((m) => m.id === messageId);
    if (index >= 0) {
      flatListRef.current?.scrollToIndex({ index, animated: true });
    }
  };

  const canUserCreatePoll = useMemo(() => {
    if (channelType === 'group_dm' || channelType === 'dm') {
      return true;
    }
    return isStaffInChannel;
  }, [channelType, isStaffInChannel]);

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
            <PollCard pollId={item.poll_id} compact={true} isStaffInChannel={isStaffInChannel} />
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
            senderName: item.reply_to_sender ?? 'Unknown',
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
          onLongPress={() => openActionsModal(item)}
          onReplyPress={
            item.reply_to_id
              ? () => scrollToMessageId(item.reply_to_id!)
              : undefined
          }
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
          {/* The TEAM is the headline. The channel name ("Team Chat" on nearly
              every row) drops to the secondary line, matching the chat list's
              card titles -- the two used to disagree about which was which.
              With no team, the channel name takes the title slot rather than
              leaving it empty. */}
          <Text style={styles.headerTitle} numberOfLines={1}>
            {teamName || channelName || 'Team Chat'}
          </Text>
          {teamName && (
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              {channelName || 'Team Chat'}
            </Text>
          )}
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
        onReply={startReply}
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

      <MessageActionsModal
        visible={actionsModalVisible}
        onClose={() => {
          setActionsModalVisible(false);
          setActionsModalMessage(null);
        }}
        message={actionsModalMessage}
        currentUserId={user?.id || ''}
        isStaff={isStaffInChannel}
        senderName={
          actionsModalMessage
            ? memberNames.get(actionsModalMessage.user_id)?.name
            : undefined
        }
        onEdit={handleEditMessage}
        onDelete={handleDeleteMessage}
        onReply={startReplyFromActions}
        onAddReaction={openReactionPickerFromActions}
        onViewReadHistory={handleViewReadHistory}
        onMuteUser={handleMuteUser}
        onBlockUser={handleBlockUser}
        onViewProfile={handleViewProfile}
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
  // Large and bold: the team name is what identifies the room.
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
