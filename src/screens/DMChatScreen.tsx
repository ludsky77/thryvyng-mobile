import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
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
import type { Message } from '../types';

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
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const { messages, loading, sendMessage, refetch } = useMessages(channelId);

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

  const handleSend = async () => {
    if (!messageText.trim() || sending || !channelId) return;
    setSending(true);
    try {
      const success = await sendMessage(messageText.trim());
      if (success) {
        setMessageText('');
        flatListRef.current?.scrollToEnd({ animated: true });
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

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const renderItem = ({ item }: { item: Message }) => {
    const isOwnMessage = item.user_id === user?.id;

    return (
      <View
        style={[
          styles.messageContainer,
          isOwnMessage && styles.ownMessageContainer,
        ]}
      >
        {!isOwnMessage && (
          <View style={styles.messageHeader}>
            <Text style={styles.messageSender}>
              {item.profile?.full_name || 'Unknown'}
            </Text>
            <Text style={styles.messageTime}>{formatTime(item.created_at)}</Text>
          </View>
        )}

        <View
          style={[
            styles.messageContent,
            isOwnMessage ? styles.ownMessageContent : styles.otherMessageContent,
          ]}
        >
          <Text
            style={[
              styles.messageText,
              isOwnMessage ? styles.ownMessageText : styles.otherMessageText,
            ]}
          >
            {item.content}
          </Text>
        </View>
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
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
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

        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Type a message..."
            placeholderTextColor="#6B7280"
            value={messageText}
            onChangeText={setMessageText}
            multiline
            maxLength={1000}
          />
          <TouchableOpacity
            style={[
              styles.sendButton,
              (!messageText.trim() || sending) && styles.sendButtonDisabled,
            ]}
            onPress={handleSend}
            disabled={!messageText.trim() || sending}
          >
            <Text style={styles.sendButtonText}>
              {sending ? '...' : 'Send'}
            </Text>
          </TouchableOpacity>
        </View>
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
