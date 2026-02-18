import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { useMessages } from '../hooks/useMessages';
import { formatRoleLabel, getRolePriority } from '../lib/chatHelpers';
import { ChatBubble, type ReactionSummary } from '../components/chat/ChatBubble';
import { ChatInputBar, type AttachmentData } from '../components/chat/ChatInputBar';
import { ReactionPicker } from '../components/chat/ReactionPicker';
import {
  CelebrationOverlay,
  type CelebrationType,
} from '../components/chat/CelebrationOverlay';
import type { Message } from '../types';

function getCelebrationType(content: string): CelebrationType | null {
  const lower = (content || '').toLowerCase().trim();
  if (lower === '/celebrate') return 'celebrate';
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

interface OtherPerson {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  role?: string;
}

export default function DMChatScreen({ route, navigation }: any) {
  const { channelId } = route.params || {};
  const { user } = useAuth();
  const flatListRef = useRef<FlatList>(null);

  const [otherPerson, setOtherPerson] = useState<OtherPerson | null>(null);
  const [channelLoading, setChannelLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [replyingTo, setReplyingTo] = useState<{
    messageId: string;
    content: string;
    senderName: string;
  } | null>(null);
  const [reactionPickerVisible, setReactionPickerVisible] = useState(false);
  const [reactionPickerMessage, setReactionPickerMessage] =
    useState<Message | null>(null);

  const {
    messages,
    loading,
    sendMessage,
    toggleReaction,
    refetch,
  } = useMessages(channelId);

  const fetchChannelInfo = useCallback(async () => {
    if (!channelId || !user?.id) {
      setChannelLoading(false);
      return;
    }
    setChannelLoading(true);
    try {
      const { data: channel, error } = await supabase
        .from('comm_channels')
        .select('dm_participant_1, dm_participant_2')
        .eq('id', channelId)
        .single();

      if (error || !channel) {
        setChannelLoading(false);
        return;
      }

      const otherUserId =
        channel.dm_participant_1 === user.id
          ? channel.dm_participant_2
          : channel.dm_participant_1;

      const { data: profile } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url')
        .eq('id', otherUserId)
        .single();

      const { data: userRoles } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', otherUserId);
      const { data: staffRoles } = await supabase
        .from('team_staff')
        .select('staff_role')
        .eq('user_id', otherUserId);

      let bestRole = '';
      (userRoles || []).forEach((r: any) => {
        if (getRolePriority(r.role) > getRolePriority(bestRole)) {
          bestRole = r.role;
        }
      });
      (staffRoles || []).forEach((r: any) => {
        if (getRolePriority(r.staff_role) > getRolePriority(bestRole)) {
          bestRole = r.staff_role;
        }
      });

      setOtherPerson({
        id: otherUserId,
        full_name: profile?.full_name ?? null,
        avatar_url: profile?.avatar_url ?? null,
        role: bestRole || undefined,
      });
    } catch (err) {
      console.error('Error fetching DM channel:', err);
    } finally {
      setChannelLoading(false);
    }
  }, [channelId, user?.id]);

  useEffect(() => {
    fetchChannelInfo();
  }, [fetchChannelInfo]);

  useEffect(() => {
    if (channelId && user?.id) {
      supabase
        .from('comm_channel_members')
        .update({ last_read_at: new Date().toISOString() })
        .eq('channel_id', channelId)
        .eq('user_id', user.id)
        .then(() => {});
    }
  }, [channelId, user?.id]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages.length]);

  const handleSendMessage = async (
    content: string,
    attachment?: AttachmentData
  ) => {
    if (sending || !channelId) return;
    if (!content.trim() && !attachment) return;
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
        const celebrationType = getCelebrationType(content);
        if (celebrationType) {
          setCelebration({ type: celebrationType, visible: true });
        }
        await supabase
          .from('comm_channels')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', channelId);
      }
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setSending(false);
    }
  };

  const handleReactionSelect = async (emoji: string) => {
    if (!reactionPickerMessage?.id) return;
    await toggleReaction(reactionPickerMessage.id, emoji);
    setReactionPickerMessage(null);
    setReactionPickerVisible(false);
  };

  const openReactionPicker = (message: Message) => {
    setReactionPickerMessage(message);
    setReactionPickerVisible(true);
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

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const renderItem = ({ item }: { item: Message }) => {
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
          senderName={item.profile?.full_name}
          senderAvatar={item.profile?.avatar_url}
          showSenderInfo={false}
          reactions={reactionsSummary.length > 0 ? reactionsSummary : undefined}
          replyTo={replyTo}
          onLongPress={() => openReactionPicker(item)}
          onReplyPress={
            item.reply_to_id
              ? () => scrollToMessageId(item.reply_to_id!)
              : undefined
          }
          onReactionPress={(reaction) => toggleReaction(item.id, reaction)}
        />
      </View>
    );
  };

  if (!channelId) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.backButtonText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Direct Message</Text>
        </View>
        <View style={styles.loadingContainer}>
          <Text style={styles.errorText}>Invalid conversation</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (channelLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#10B981" />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <View style={styles.headerAvatarContainer}>
            {otherPerson?.avatar_url ? (
              <Image
                source={{ uri: otherPerson.avatar_url }}
                style={styles.headerAvatar}
              />
            ) : (
              <View style={styles.headerAvatarPlaceholder}>
                <Text style={styles.headerAvatarInitial}>
                  {otherPerson?.full_name?.charAt(0)?.toUpperCase() || '?'}
                </Text>
              </View>
            )}
          </View>
          <View style={styles.headerText}>
            <Text style={styles.headerName} numberOfLines={1}>
              {otherPerson?.full_name || 'Loading...'}
            </Text>
            {otherPerson?.role ? (
              <Text style={styles.headerRole}>
                {formatRoleLabel(otherPerson.role)}
              </Text>
            ) : null}
          </View>
        </View>
        <View style={styles.headerRight} />
      </View>

      <KeyboardAvoidingView
        style={styles.chatArea}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        {loading ? (
          <View style={styles.messagesLoading}>
            <ActivityIndicator size="small" color="#10B981" />
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            renderItem={renderItem}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.messagesList}
            onContentSizeChange={() =>
              flatListRef.current?.scrollToEnd({ animated: false })
            }
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor="#10B981"
              />
            }
          />
        )}

        <ReactionPicker
          visible={reactionPickerVisible}
          onSelect={handleReactionSelect}
          onClose={() => {
            setReactionPickerVisible(false);
            setReactionPickerMessage(null);
          }}
          onReply={startReply}
        />

        <ChatInputBar
          onSendMessage={handleSendMessage}
          placeholder="Type a message..."
          replyingTo={
            replyingTo
              ? { senderName: replyingTo.senderName, content: replyingTo.content }
              : null
          }
          onCancelReply={() => setReplyingTo(null)}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
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
    marginRight: 12,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 20,
  },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
  },
  headerAvatarContainer: {
    marginRight: 10,
  },
  headerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  headerAvatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatarInitial: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  headerName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  headerRole: {
    color: '#10B981',
    fontSize: 12,
    marginTop: 1,
  },
  headerRight: {
    width: 40,
  },
  chatArea: {
    flex: 1,
  },
  messagesLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  messagesList: {
    padding: 16,
    paddingBottom: 20,
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
    color: '#10B981',
    fontSize: 12,
    fontWeight: '600',
    marginRight: 8,
  },
  messageTime: {
    color: '#6B7280',
    fontSize: 11,
  },
  messageContent: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 16,
  },
  ownMessageContent: {
    backgroundColor: '#10B981',
    borderBottomRightRadius: 4,
  },
  otherMessageContent: {
    backgroundColor: '#1e293b',
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
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    paddingBottom: 24,
    backgroundColor: '#0f172a',
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    gap: 10,
  },
  input: {
    flex: 1,
    backgroundColor: '#1e293b',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: '#fff',
    fontSize: 15,
    maxHeight: 100,
  },
  sendButton: {
    backgroundColor: '#10B981',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#374151',
  },
  sendButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#9CA3AF',
    marginTop: 8,
  },
  errorText: {
    color: '#9CA3AF',
    fontSize: 16,
  },
});
