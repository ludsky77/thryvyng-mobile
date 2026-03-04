import React, { useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';

interface MessageActionsModalProps {
  visible: boolean;
  onClose: () => void;
  message: {
    id: string;
    content: string;
    user_id: string;
    created_at: string;
    profile?: {
      full_name?: string;
    };
  } | null;
  currentUserId: string;
  isStaff: boolean;
  onEdit?: (messageId: string) => void;
  onDelete?: (messageId: string) => void;
  onReply?: () => void;
  onAddReaction?: () => void;
  onViewReadHistory?: (messageId: string) => void;
  onMuteUser?: (userId: string, userName: string) => void;
  onBlockUser?: (userId: string, userName: string) => void;
  onViewProfile?: (userId: string) => void;
}

export function MessageActionsModal({
  visible,
  onClose,
  message,
  currentUserId,
  isStaff,
  onEdit,
  onDelete,
  onReply,
  onAddReaction,
  onViewReadHistory,
  onMuteUser,
  onBlockUser,
  onViewProfile,
}: MessageActionsModalProps) {

  const isOwnMessage = message?.user_id === currentUserId;

  const canEdit = useMemo(() => {
    if (!isOwnMessage || !message) return false;
    const messageTime = new Date(message.created_at).getTime();
    const now = Date.now();
    const threeMinutes = 3 * 60 * 1000;
    return now - messageTime < threeMinutes;
  }, [isOwnMessage, message]);

  const canDelete = isOwnMessage || isStaff;
  const canViewReadHistory = isOwnMessage || isStaff;
  const senderName = message?.profile?.full_name || 'User';

  const handleCopy = async () => {
    if (message?.content) {
      await Clipboard.setStringAsync(message.content);
      Alert.alert('Copied', 'Message copied to clipboard');
    }
    onClose();
  };

  const handleEdit = () => {
    if (message && onEdit) {
      onEdit(message.id);
    }
    onClose();
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Message',
      'Are you sure you want to delete this message?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            if (message && onDelete) {
              onDelete(message.id);
            }
            onClose();
          },
        },
      ]
    );
  };

  const handleMute = () => {
    if (message && onMuteUser) {
      Alert.alert(
        `Mute ${senderName}`,
        'You will no longer receive notifications when this user sends a message in this conversation.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Mute',
            onPress: () => {
              onMuteUser(message.user_id, senderName);
              onClose();
            },
          },
        ]
      );
    }
  };

  const handleBlock = () => {
    if (message && onBlockUser) {
      Alert.alert(
        `Block ${senderName}`,
        'This user will not be able to send messages in this channel until unblocked.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Block',
            style: 'destructive',
            onPress: () => {
              onBlockUser(message.user_id, senderName);
              onClose();
            },
          },
        ]
      );
    }
  };

  if (!message) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <View style={styles.modalContainer}>
          <View style={styles.handle} />
          <Text style={styles.header}>Actions</Text>

          {/* Copy - Always available */}
          <TouchableOpacity style={styles.actionItem} onPress={handleCopy}>
            <Feather name="copy" size={20} color="#10B981" />
            <Text style={styles.actionText}>Copy</Text>
          </TouchableOpacity>

          {/* Edit - Own messages within 3 min */}
          {isOwnMessage && canEdit && onEdit && (
            <TouchableOpacity style={styles.actionItem} onPress={handleEdit}>
              <Feather name="edit-2" size={20} color="#3B82F6" />
              <Text style={styles.actionText}>Edit</Text>
            </TouchableOpacity>
          )}

          {/* Delete - Own messages or Staff */}
          {canDelete && onDelete && (
            <TouchableOpacity style={styles.actionItem} onPress={handleDelete}>
              <Feather name="trash-2" size={20} color="#EF4444" />
              <Text style={[styles.actionText, { color: '#EF4444' }]}>Delete Message</Text>
            </TouchableOpacity>
          )}

          {/* View Read History - Own messages or Staff */}
          {canViewReadHistory && onViewReadHistory && (
            <TouchableOpacity
              style={styles.actionItem}
              onPress={() => {
                onViewReadHistory(message.id);
                onClose();
              }}
            >
              <Feather name="eye" size={20} color="#10B981" />
              <Text style={styles.actionText}>View Read History</Text>
            </TouchableOpacity>
          )}

          {/* Add Reaction - Available to all */}
          {onAddReaction && (
            <TouchableOpacity
              style={styles.actionItem}
              onPress={() => {
                onAddReaction();
                onClose();
              }}
            >
              <Feather name="smile" size={20} color="#F59E0B" />
              <Text style={styles.actionText}>Add Reaction</Text>
            </TouchableOpacity>
          )}

          {/* Reply */}
          {onReply && (
            <TouchableOpacity
              style={styles.actionItem}
              onPress={() => {
                onReply();
                onClose();
              }}
            >
              <Feather name="corner-up-left" size={20} color="#8B5CF6" />
              <Text style={styles.actionText}>Reply</Text>
            </TouchableOpacity>
          )}

          {/* Mute - Others' messages only */}
          {!isOwnMessage && onMuteUser && (
            <TouchableOpacity style={styles.actionItem} onPress={handleMute}>
              <Feather name="bell-off" size={20} color="#9CA3AF" />
              <View style={styles.actionContent}>
                <Text style={styles.actionText}>Mute {senderName}</Text>
                <Text style={styles.actionDescription}>
                  Prevents notifications on your devices when user sends a message in this conversation.
                </Text>
              </View>
            </TouchableOpacity>
          )}

          {/* Block - Staff only, others' messages */}
          {!isOwnMessage && isStaff && onBlockUser && (
            <TouchableOpacity style={styles.actionItem} onPress={handleBlock}>
              <Feather name="x-square" size={20} color="#EF4444" />
              <View style={styles.actionContent}>
                <Text style={[styles.actionText, { color: '#EF4444' }]}>Block {senderName}</Text>
                <Text style={styles.actionDescription}>
                  Block the user from being able to send messages in this channel until unblocked
                </Text>
              </View>
            </TouchableOpacity>
          )}

          {/* View Profile - Others' messages */}
          {!isOwnMessage && onViewProfile && (
            <TouchableOpacity
              style={styles.actionItem}
              onPress={() => {
                onViewProfile(message.user_id);
                onClose();
              }}
            >
              <Feather name="user" size={20} color="#10B981" />
              <Text style={styles.actionText}>View Profile</Text>
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#1F2937',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 40,
    maxHeight: '80%',
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: '#4B5563',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  header: {
    fontSize: 18,
    fontWeight: '700',
    color: '#10B981',
    marginBottom: 16,
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
    gap: 14,
  },
  actionContent: {
    flex: 1,
  },
  actionText: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  actionDescription: {
    fontSize: 13,
    color: '#9CA3AF',
    marginTop: 4,
    lineHeight: 18,
  },
});
