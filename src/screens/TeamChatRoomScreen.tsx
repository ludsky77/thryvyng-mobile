import React, { useState, useEffect, useRef } from 'react';
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
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { useMessages } from '../hooks/useMessages';
import { PollCard } from '../components/chat/PollCard';
import { CreatePollModal } from '../components/chat/CreatePollModal';
import { canCreatePoll } from '../lib/permissions';
import type { Message } from '../types';

export default function TeamChatRoomScreen({ route, navigation }: any) {
  const { channelId, channelName, teamName } = route.params;
  const { user, currentRole } = useAuth();
  const flatListRef = useRef<FlatList>(null);

  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pollModalVisible, setPollModalVisible] = useState(false);

  const { messages, loading, sendMessage, refetch } = useMessages(channelId);

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
    navigation.setOptions({
      headerTitle: () => (
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {channelName}
          </Text>
          {teamName && (
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              {teamName}
            </Text>
          )}
        </View>
      ),
    });
  }, [channelName, teamName, navigation]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages]);

  const handleSend = async () => {
    if (!messageText.trim() || sending) return;
    setSending(true);
    try {
      const success = await sendMessage(messageText.trim());
      if (success) {
        setMessageText('');
        flatListRef.current?.scrollToEnd({ animated: true });
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
    if (item.message_type === 'poll' && item.poll_id) {
      return (
        <View style={styles.messageContainer}>
          <PollCard pollId={item.poll_id} compact={true} />
        </View>
      );
    }

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
              {item.profile?.full_name || 'Unknown User'}
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

          {item.is_pinned && (
            <Text style={styles.pinnedText}>📌 Pinned</Text>
          )}
        </View>
      </View>
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
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={90}
    >
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderItem}
        keyExtractor={(item, index) => `${item.id}-${index}`}
        contentContainerStyle={styles.messagesList}
        onContentSizeChange={() =>
          flatListRef.current?.scrollToEnd({ animated: false })
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#8b5cf6"
          />
        }
      />

      <CreatePollModal
        visible={pollModalVisible}
        onClose={() => setPollModalVisible(false)}
        channelId={channelId}
        onSuccess={refetch}
      />

      <View style={styles.inputContainer}>
        {canCreatePoll(currentRole?.role) && (
          <TouchableOpacity
            style={styles.pollButton}
            onPress={() => setPollModalVisible(true)}
          >
            <Text style={styles.pollButtonText}>📊</Text>
          </TouchableOpacity>
        )}

        <TextInput
          style={styles.input}
          placeholder="Type a message..."
          placeholderTextColor="#666"
          value={messageText}
          onChangeText={setMessageText}
          multiline
          maxLength={1000}
        />

        <TouchableOpacity
          style={[
            styles.sendButton,
            !messageText.trim() && styles.sendButtonDisabled,
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
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitleContainer: {
    alignItems: 'center',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  headerSubtitle: {
    color: '#8b5cf6',
    fontSize: 12,
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
