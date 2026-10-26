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
 * THE message-actions sheet. One component, every chat screen -- ruling R6 (Lu,
 * 2026-10-23): "one shared message-actions component; no per-screen copies."
 *
 * Ruling R2, which is what this file now is: "long-press on a message bubble
 * opens ONE bottom sheet: emoji quick row on top, then Reply · Copy (+ Edit for
 * own message inside the existing 5-min window ...; keep any existing Delete,
 * red). Palette max 3 tones: purple accent, grey, red destructive."
 *
 * ROUND 2 -- ruling R7 (Lu, 2026-10-25), after the device test: "emoji quick row
 * lives ONLY in the ☺+ popover. Remove the emoji row from the long-press sheet.
 * Sheet = Reply · Copy · Edit · View Read History · Delete (red, where it exists
 * today)." So round 1's quick row and its "More" button are gone from here, with
 * the `onReact` and `onMoreReactions` props -- reactions are the ☺+ popover's
 * job and this sheet's job is the actions. There is now exactly ONE place in the
 * app that shows a quick emoji row (`ReactionPicker.tsx`).
 *
 * WHAT CHANGED FROM v1, so a reader does not go looking:
 *   * the "Add Reaction" row is GONE. A row that only opened another modal was
 *     the menu-in-between R1 and R2 exist to remove; after R7, the ☺+ icon is
 *     the whole reaction path.
 *   * the ☺+ icon on the bubble no longer opens this sheet at all (R1). It opens
 *     the emoji popover directly. This sheet is reached by LONG-PRESS only.
 *   * `Reply` is gated on `canReply`, so a locked chat hides it (R5).
 *   * the `Actions` header and its green are gone; Reply is the sheet's first
 *     row, as it is in WhatsApp.
 *   * Copy raises a TOAST, not an Alert (R10) -- see `onCopied`.
 *
 * THE FILE KEEPS ITS OLD PATH (`MessageActionsModal.tsx`) because file renames
 * and deletes were outside this task's scope. The export is the honest name.
 */

/**
 * How long after sending an author may still edit. Was 3 minutes; 5 gives a
 * sender time to notice a typo after the thread has scrolled.
 */
const EDIT_WINDOW_MS = 5 * 60 * 1000;

/**
 * Three tones, and only three -- R2's ceiling.
 *
 * The v1 sheet had green, amber, blue, purple, grey and red at once, which made
 * every row look like a different severity and left nothing for the one row that
 * is actually destructive. Now: purple marks an action on the message, grey
 * marks the one row that only LOOKS at it (Read History), and red is reserved
 * for Delete.
 */
const TONE = {
  /** Positive/constructive actions. */
  accent: '#8B5CF6',
  /** Informational, acts on nothing. */
  muted: '#9CA3AF',
  /** Destructive only: Delete. */
  danger: '#EF4444',
} as const;

interface MessageActionsSheetProps {
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
  /**
   * May this person post in this chat? Ruling R5: in a locked chat a non-staff
   * member cannot reply, so Reply is HIDDEN rather than shown and refused.
   * Reactions stay available, which is why only this one row reads it.
   * Defaults TRUE so a caller with no gate (a DM) behaves as it always did.
   */
  canReply?: boolean;
  /**
   * Copy landed. R10: the confirmation is an in-app toast owned by the SCREEN,
   * because a toast rendered inside this Modal would die with the sheet -- which
   * closes on the same tap that copies. The clipboard write still happens here.
   */
  onCopied?: () => void;
  onEdit?: (messageId: string) => void;
  onDelete?: (messageId: string) => void;
  onReply?: () => void;
  onViewReadHistory?: (messageId: string) => void;
}

export function MessageActionsSheet({
  visible,
  onClose,
  message,
  currentUserId,
  isStaff,
  canReply = true,
  onCopied,
  onEdit,
  onDelete,
  onReply,
  onViewReadHistory,
}: MessageActionsSheetProps) {

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

  /**
   * R10: an iOS Alert for a copy was a modal the user had to dismiss to get back
   * to the thread -- two taps to acknowledge something that already happened.
   * The toast says it and leaves. `onCopied` fires BEFORE `onClose` so the screen
   * still has the sheet's message in hand.
   */
  const handleCopy = async () => {
    if (message?.content) {
      await Clipboard.setStringAsync(message.content);
      onCopied?.();
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

          {/* Reply -- hidden in a locked chat (R5), where the server would
              refuse the send anyway. */}
          {onReply && canReply && (
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

          {/* View Read History - Own messages or Staff.

              KEPT, and this is a judgement call: R2 lists "Reply · Copy (+ Edit)
              ... keep any existing Delete" and does not name this row, but it is
              a shipped feature with a real route behind it
              (`MessageReadHistory`), and dropping it would be a product deletion
              nobody asked for. Grey, because it changes nothing. */}
          {canViewReadHistory && onViewReadHistory && (
            <TouchableOpacity
              style={styles.actionItem}
              onPress={() => {
                onViewReadHistory(message.id);
                onClose();
              }}
            >
              <Feather name="eye" size={20} color={TONE.muted} />
              <Text style={[styles.actionText, styles.actionTextMuted]}>
                View Read History
              </Text>
            </TouchableOpacity>
          )}

          {/* Delete - Own messages or Staff. Last, and the only red. */}
          {canDelete && onDelete && (
            <TouchableOpacity
              style={[styles.actionItem, styles.actionItemLast]}
              onPress={handleDelete}
            >
              <Feather name="trash-2" size={20} color={TONE.danger} />
              <Text style={[styles.actionText, styles.actionTextDanger]}>
                Delete Message
              </Text>
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
              `onViewProfile` prop went with it in v2 (R2 lists the sheet's rows
              and it is not one); wire a real route before adding it back. */}
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
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
    gap: 14,
  },
  // Nothing follows the last row, so it carries no divider into the padding.
  actionItemLast: {
    borderBottomWidth: 0,
  },
  actionText: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  actionTextMuted: {
    color: TONE.muted,
  },
  actionTextDanger: {
    color: TONE.danger,
  },
});
