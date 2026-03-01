import React, { useState, useEffect, useRef, useMemo } from 'react';
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
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { useMessages } from '../hooks/useMessages';
import { PollCard } from '../components/chat/PollCard';
import { CreatePollModal } from '../components/chat/CreatePollModal';
import { ChatBubble, type ReactionSummary } from '../components/chat/ChatBubble';
import { ChatInputBar, type AttachmentData } from '../components/chat/ChatInputBar';
import { ReactionPicker } from '../components/chat/ReactionPicker';
import {
  CelebrationOverlay,
  type CelebrationType,
} from '../components/chat/CelebrationOverlay';
import {
  ReactionDetailsModal,
  type ReactionDetailItem,
} from '../components/chat/ReactionDetailsModal';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useChannelMembers } from '../hooks/useChannelMembers';
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
  const isGroupDm = channelType === 'group_dm';

  const [sending, setSending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pollModalVisible, setPollModalVisible] = useState(false);
  const [replyingTo, setReplyingTo] = useState<{
    messageId: string;
    content: string;
    senderName: string;
  } | null>(null);
  const [reactionPickerVisible, setReactionPickerVisible] = useState(false);
  const [reactionPickerMessage, setReactionPickerMessage] =
    useState<Message | null>(null);
  const [celebration, setCelebration] = useState<{
    type: CelebrationType;
    visible: boolean;
  }>({ type: 'celebrate', visible: false });
  const [showReactionDetails, setShowReactionDetails] = useState(false);
  const [selectedMessageReactions, setSelectedMessageReactions] = useState<
    ReactionDetailItem[]
  >([]);
  const [isStaffInChannel, setIsStaffInChannel] = useState(false);
  const [permissionsLoaded, setPermissionsLoaded] = useState(false);
  const [channelTeamId, setChannelTeamId] = useState<string | null>(null);

  const {
    messages,
    loading,
    sendMessage,
    toggleReaction,
    refetch,
  } = useMessages(channelId);
  const { members: channelMembers, updateLastReadMessage } =
    useChannelMembers(channelId);

  const messageIds = messages.map((m) => m.id);

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
        const { data: staffData } = await supabase
          .from('team_staff')
          .select('id')
          .eq('team_id', channelData.team_id)
          .eq('user_id', user.id)
          .maybeSingle();
        setIsStaffInChannel(!!staffData);
      } catch (err) {
        console.log('Error checking staff permission:', err);
        setIsStaffInChannel(false);
      } finally {
        setPermissionsLoaded(true);
      }
    };
    checkStaffPermission();
  }, [channelId, user?.id]);

  useEffect(() => {
    if (channelId && user?.id && messages.length > 0) {
      const lastId = messages[messages.length - 1].id;
      updateLastReadMessage(lastId).catch(() => {});
    }
  }, [channelId, user?.id, messages.length, updateLastReadMessage]);

  useEffect(() => {
    if (messages.length > prevMessagesLengthRef.current) {
      prevMessagesLengthRef.current = messages.length;
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages]);

  const handleSendMessage = async (
    content: string,
    attachment?: AttachmentData
  ) => {
    if (sending) return;
    setSending(true);
    try {
      const success = await sendMessage(content, {
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
      if (success) {
        setReplyingTo(null);
        flatListRef.current?.scrollToEnd({ animated: true });
        const celebrationType = getCelebrationType(content, isCoach ?? false);
        if (celebrationType) {
          setCelebration({ type: celebrationType, visible: true });
        }
      }
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setSending(false);
    }
  };

  const handleReactionSelect = async (emoji: string) => {
    if (!reactionPickerMessage?.id) return;
    try {
      await toggleReaction(reactionPickerMessage.id, emoji);
      await refetch();
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

  const startReply = () => {
    if (reactionPickerMessage) {
      setReplyingTo({
        messageId: reactionPickerMessage.id,
        content:
          reactionPickerMessage.content?.trim() ||
          (reactionPickerMessage.attachment_name
            ? `📎 ${reactionPickerMessage.attachment_name}`
            : 'Attachment'),
        senderName:
          reactionPickerMessage.profile?.full_name ?? 'Unknown',
      });
    }
    setReactionPickerMessage(null);
    setReactionPickerVisible(false);
  };

  const scrollToMessageId = (messageId: string) => {
    const index = messages.findIndex((m) => m.id === messageId);
    if (index >= 0) {
      flatListRef.current?.scrollToIndex({ index, animated: true });
    }
  };

  const canUserCreatePoll = useMemo(() => {
    if (channelType === 'group_dm' || channelType === 'direct') {
      return true;
    }
    return isStaffInChannel;
  }, [channelType, isStaffInChannel]);

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const isNewDay = (currentMsg: Message, prevMsg: Message | undefined) => {
    if (!prevMsg) return true;
    const currentDate = new Date(currentMsg.created_at).toDateString();
    const prevDate = new Date(prevMsg.created_at).toDateString();
    return currentDate !== prevDate;
  };

  const formatDateSeparator = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    }
    if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    }
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const renderItem = ({ item, index }: { item: Message; index: number }) => {
    const prevItem = messages[index - 1];
    const showDaySeparator = isNewDay(item, prevItem);

    if (item.message_type === 'poll' && item.poll_id) {
      return (
        <>
          {showDaySeparator && (
            <View style={styles.daySeparator}>
              <Text style={styles.daySeparatorText}>
                {formatDateSeparator(item.created_at)}
              </Text>
              <View style={styles.daySeparatorLine} />
            </View>
          )}
          <View style={styles.messageContainer}>
            <PollCard pollId={item.poll_id} compact={true} isStaffInChannel={isStaffInChannel} />
          </View>
        </>
      );
    }

    const isOwnMessage = item.user_id === user?.id;
    const reactionsSummary = getReactionsSummary(item.reactions, user?.id);
    const replyTo =
      item.reply_to_id && (item.reply_to_content != null || item.reply_to_sender != null)
        ? {
            content: item.reply_to_content ?? '(message)',
            senderName: item.reply_to_sender ?? 'Unknown',
          }
        : undefined;

    return (
      <>
        {showDaySeparator && (
          <View style={styles.daySeparator}>
            <Text style={styles.daySeparatorText}>
              {formatDateSeparator(item.created_at)}
            </Text>
            <View style={styles.daySeparatorLine} />
          </View>
        )}
        <View style={styles.messageContainer}>
          <ChatBubble
          message={{
            id: item.id,
            content: item.content,
            user_id: item.user_id,
            created_at: item.created_at,
            comm_message_attachments: item.comm_message_attachments,
            attachment_url: item.attachment_url ?? undefined,
            attachment_type: item.attachment_type ?? undefined,
            attachment_name: item.attachment_name ?? undefined,
          }}
          isOwnMessage={isOwnMessage}
          senderName={
            (item as any).profiles?.full_name || item.profile?.full_name
          }
          senderAvatar={
            (item as any).profiles?.avatar_url || item.profile?.avatar_url
          }
          senderRole={
            (item as any).profiles?.role ||
            (item as any).profile?.role ||
            undefined
          }
          showSenderInfo={true}
          reactions={reactionsSummary.length > 0 ? reactionsSummary : undefined}
          replyTo={replyTo}
          onLongPress={() => openReactionPicker(item)}
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
          <Text style={styles.headerTitle} numberOfLines={1}>
            {channelName || 'Team Chat'}
          </Text>
          {teamName && (
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              {teamName}
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
        <FlatList
          ref={flatListRef}
          data={messages}
          style={{ flex: 1 }}
          renderItem={renderItem}
          keyExtractor={(item, index) => `${item.id}-${index}`}
          contentContainerStyle={styles.messagesList}
          onContentSizeChange={() => {
            const currentLength = messages?.length || 0;
            if (currentLength > prevMessagesLengthRef.current) {
              prevMessagesLengthRef.current = currentLength;
              flatListRef.current?.scrollToEnd({ animated: false });
            }
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

        <ChatInputBar
          onSendMessage={handleSendMessage}
          onPollPress={canUserCreatePoll ? () => setPollModalVisible(true) : undefined}
          placeholder="Type a message..."
          replyingTo={
            replyingTo
              ? { senderName: replyingTo.senderName, content: replyingTo.content }
              : null
          }
          onCancelReply={() => setReplyingTo(null)}
        />
      </KeyboardAvoidingView>

      <CreatePollModal
        visible={pollModalVisible}
        onClose={() => setPollModalVisible(false)}
        channelId={channelId}
        onSuccess={refetch}
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
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
  headerTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  headerSubtitle: {
    color: '#8b5cf6',
    fontSize: 12,
    marginTop: 2,
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
