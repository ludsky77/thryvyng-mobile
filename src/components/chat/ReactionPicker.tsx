import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { Feather } from '@expo/vector-icons';

const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🎉', '⚽'];

interface ReactionPickerProps {
  visible: boolean;
  onSelect: (emoji: string) => void;
  onClose: () => void;
  onReply?: () => void;
}

export function ReactionPicker({
  visible,
  onSelect,
  onClose,
  onReply,
}: ReactionPickerProps) {
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
        <View style={styles.pickerContainer} onStartShouldSetResponder={() => true}>
          {REACTIONS.map((emoji) => (
            <TouchableOpacity
              key={emoji}
              style={styles.reactionBtn}
              onPress={() => {
                onSelect(emoji);
                onClose();
              }}
            >
              <Text style={styles.reactionEmoji}>{emoji}</Text>
            </TouchableOpacity>
          ))}
          {onReply && (
            <TouchableOpacity
              style={styles.replyBtn}
              onPress={() => {
                onReply();
                onClose();
              }}
            >
              <Feather name="corner-up-left" size={22} color="#8B5CF6" />
              <Text style={styles.replyBtnText}>Reply</Text>
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
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickerContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: '#1F2937',
    borderRadius: 16,
    padding: 12,
    gap: 8,
    maxWidth: 320,
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
  replyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 22,
    backgroundColor: '#374151',
    gap: 6,
  },
  replyBtnText: {
    color: '#8B5CF6',
    fontSize: 14,
    fontWeight: '600',
  },
});
