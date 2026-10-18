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

/**
 * How long after sending an author may still edit. Was 3 minutes; 5 gives a
 * sender time to notice a typo after the thread has scrolled.
 */
const EDIT_WINDOW_MS = 5 * 60 * 1000;

/**
 * Two tones, and only two.
 *
 * The sheet had green, amber, blue, purple, grey and red at once, which made
 * every row look like a different severity and left nothing for the one row
 * that is actually destructive. Now: purple marks a positive action, and red
 * is reserved for Delete. (A neutral grey lived here for the Mute row; that
 * row is gone, so the tone went with it.)
 */
const TONE = {
  /** Positive/constructive actions. */
  accent: '#8B5CF6',
  /** Destructive only: Delete. */
  danger: '#EF4444',
} as const;

interface MessageActionsModalProps {
  visible: boolean;
  onClose: () => void;
  message: {
    id: string;
    content: string;
    user_id: string;
    created_at: string;
  } | null;
  currentUserId: string;
  isStaff: boolean;
  onEdit?: (messageId: string) => void;
  onDelete?: (messageId: string) => void;
  onReply?: () => void;
  onAddReaction?: () => void;
  onViewReadHistory?: (messageId: string) => void;
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
  onViewProfile,
}: MessageActionsModalProps) {

  const isOwnMessage = message?.user_id === currentUserId;

  /**
   * Edit your OWN message, within 5 minutes of sending it.
   *
   * Author-only and time-boxed: the window keeps an edit a correction rather
   * than a rewrite of what the team already read. An unparseable created_at
   * closes the window rather than opening it forever.
   *
   * This is the offer, not the enforcement -- useMessages.editMessage also
   * scopes the UPDATE to the author, and RLS is the backstop.
   */
  const canEdit = useMemo(() => {
    if (!isOwnMessage || !message) return false;
    const messageTime = new Date(message.created_at).getTime();
    if (Number.isNaN(messageTime)) return false;
    return Date.now() - messageTime < EDIT_WINDOW_MS;
  }, [isOwnMessage, message]);

  const canDelete = isOwnMessage || isStaff;
  const canViewReadHistory = isOwnMessage || isStaff;

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
            <Feather name="copy" size={20} color={TONE.accent} />
            <Text style={styles.actionText}>Copy</Text>
          </TouchableOpacity>

          {/* Edit - Own messages within the 5-minute window */}
          {isOwnMessage && canEdit && onEdit && (
            <TouchableOpacity style={styles.actionItem} onPress={handleEdit}>
              <Feather name="edit-2" size={20} color={TONE.accent} />
              <Text style={styles.actionText}>Edit</Text>
            </TouchableOpacity>
          )}

          {/* Delete - Own messages or Staff */}
          {canDelete && onDelete && (
            <TouchableOpacity style={styles.actionItem} onPress={handleDelete}>
              <Feather name="trash-2" size={20} color={TONE.danger} />
              <Text style={[styles.actionText, { color: TONE.danger }]}>Delete Message</Text>
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
              <Feather name="eye" size={20} color={TONE.accent} />
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
              <Feather name="smile" size={20} color={TONE.accent} />
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
              <Feather name="corner-up-left" size={20} color={TONE.accent} />
              <Text style={styles.actionText}>Reply</Text>
            </TouchableOpacity>
          )}

          {/* "Mute <user>" and "Block <user>" were removed here. Both only
              fired an Alert ('has been muted' / 'has been blocked') over a
              TODO -- nothing was ever written, so the sheet promised
              moderation the product does not have. Thryvyng has no block
              feature at all; Hide and Mute arrive later as Chat List v2 swipe
              actions, and web never shipped these buttons. Ruling 2026-10-15.
              Do not re-add a row here until the mute/hide state is real. */}

          {/* "View Profile" was removed here. It called
              navigation.navigate('UserProfile', …) and no such route is
              registered in AppNavigator -- tapping it errored. The
              `onViewProfile` prop is kept so callers do not break; wire a real
              route before rendering an action for it again. */}
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
  actionText: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '500',
  },
});
