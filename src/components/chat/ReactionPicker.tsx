import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { Feather } from '@expo/vector-icons';

/**
 * The ☺+ popover, and the full picker behind its "+".
 *
 * Ruling R8 (Lu, 2026-10-25): "☺+ popover = the quick emojis + a '+' (more)
 * that opens the full picker. Remove the 'Reply' button from the popover."
 * Ruling R7 moved the quick row OUT of the long-press sheet, so this file is now
 * the ONLY place a quick row lives.
 *
 * WHAT CHANGED IN ROUND 2:
 *   * the **Reply** button is gone (R8). It was the popover's one non-reaction
 *     control and it duplicated two other paths to the same quote -- the sheet's
 *     Reply row and R3's swipe-right. The `onReply` prop went with it.
 *   * the popover opens on the QUICK row and the "+" expands it in place to the
 *     full grid. One Modal, two modes: a second modal stacked on the first is
 *     what made the v1 flow a menu-in-between, which R1 and R8 both exist to
 *     remove.
 *   * `FULL_REACTIONS` is now a real "more" -- 30 emoji. Before round 2 the
 *     "full" list was 7 and the quick row was 6 of them, so a "+" would have
 *     revealed exactly one extra emoji. Data only; no dependency, no picker
 *     library.
 */

/**
 * R8's quick row: six, in this order. These are the six that were already the
 * app's reaction set, so nobody's habit changes.
 */
export const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🎉'];

/**
 * The full picker. The quick six FIRST and in the same order, so the grid reads
 * as an extension of the row it replaces rather than a reshuffle. ⚽ is kept near
 * the front: this is a soccer app and it is the one sport glyph the old
 * seven-emoji list carried.
 */
export const FULL_REACTIONS = [
  ...QUICK_REACTIONS,
  '⚽', '🔥', '👏', '💪', '🙌', '🤝',
  '😍', '🥳', '😅', '😭', '😡', '🤔',
  '🙏', '✅', '❌', '💯', '⭐', '🏆',
  '🥇', '⏰', '📅', '👀', '🤷', '🫡',
];

/**
 * The list every other file should read. Kept as the old name so nothing that
 * imported it breaks, and pointed at the full set because that IS the app's
 * reaction vocabulary now.
 */
export const REACTIONS = FULL_REACTIONS;

interface ReactionPickerProps {
  visible: boolean;
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

export function ReactionPicker({
  visible,
  onSelect,
  onClose,
}: ReactionPickerProps) {
  const [expanded, setExpanded] = useState(false);

  // Every open starts on the quick row. Without this, a popover that was left
  // expanded reopens as the full grid for a reaction the user wanted in one tap.
  useEffect(() => {
    if (visible) setExpanded(false);
  }, [visible]);

  const pick = (emoji: string) => {
    onSelect(emoji);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <View
          style={[styles.popover, expanded && styles.popoverExpanded]}
          onStartShouldSetResponder={() => true}
        >
          {expanded ? (
            <>
              <Text style={styles.gridHeader}>Pick a reaction</Text>
              <ScrollView
                style={styles.grid}
                contentContainerStyle={styles.gridContent}
              >
                {FULL_REACTIONS.map((emoji) => (
                  <TouchableOpacity
                    key={emoji}
                    style={styles.reactionBtn}
                    onPress={() => pick(emoji)}
                  >
                    <Text style={styles.reactionEmoji}>{emoji}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </>
          ) : (
            <View style={styles.quickRow}>
              {QUICK_REACTIONS.map((emoji) => (
                <TouchableOpacity
                  key={emoji}
                  style={styles.reactionBtn}
                  onPress={() => pick(emoji)}
                >
                  <Text style={styles.reactionEmoji}>{emoji}</Text>
                </TouchableOpacity>
              ))}
              {/* R8's "+": opens the full picker IN PLACE. */}
              <TouchableOpacity
                style={styles.moreBtn}
                onPress={() => setExpanded(true)}
                accessibilityLabel="More reactions"
              >
                <Feather name="plus" size={22} color="#8B5CF6" />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  popover: {
    backgroundColor: '#1F2937',
    borderRadius: 16,
    padding: 12,
    maxWidth: 320,
  },
  // The grid needs a bounded height or the ScrollView fills the screen.
  popoverExpanded: {
    width: 320,
    maxHeight: 320,
  },
  quickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  gridHeader: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 10,
    marginLeft: 4,
  },
  grid: {
    flexGrow: 0,
  },
  gridContent: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  reactionBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#374151',
    justifyContent: 'center',
    alignItems: 'center',
  },
  reactionEmoji: {
    fontSize: 24,
  },
  moreBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
