import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';

const MAX_REASON_LENGTH = 200;

interface CantGoReasonModalProps {
  visible: boolean;
  onClose: () => void;
  onSkip: () => void;
  onSubmit: (reason: string) => void;
  submitting?: boolean;
}

export function CantGoReasonModal({
  visible,
  onClose,
  onSkip,
  onSubmit,
  submitting = false,
}: CantGoReasonModalProps) {
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!visible) {
      setReason('');
    }
  }, [visible]);

  const handleSubmit = () => {
    onSubmit(reason.trim());
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={onClose}
        />
        <View style={styles.card}>
          <Text style={styles.title}>Can't make it?</Text>
          <Text style={styles.subtitle}>
            Let your coach know why (optional)
          </Text>
          <TextInput
            style={styles.input}
            placeholder="Conflict, traveling, injury, etc."
            placeholderTextColor="#666"
            value={reason}
            onChangeText={(t) =>
              setReason(t.length <= MAX_REASON_LENGTH ? t : reason)
            }
            maxLength={MAX_REASON_LENGTH + 1}
            multiline
            editable={!submitting}
          />
          <View style={styles.charRow}>
            <Text style={styles.charCount}>
              {reason.length}/{MAX_REASON_LENGTH}
            </Text>
          </View>
          <View style={styles.buttons}>
            <TouchableOpacity
              style={styles.skipButton}
              onPress={onSkip}
              disabled={submitting}
            >
              <Text style={styles.skipText}>Skip</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.submitButton, submitting && styles.submitDisabled]}
              onPress={handleSubmit}
              disabled={submitting}
            >
              <Text style={styles.submitText}>Submit</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  card: {
    width: '90%',
    maxWidth: 400,
    backgroundColor: '#1a1625',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#3a3a6e',
  },
  title: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 6,
  },
  subtitle: {
    color: '#94a3b8',
    fontSize: 14,
    marginBottom: 16,
  },
  input: {
    backgroundColor: '#2a2a4e',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3a3a6e',
    padding: 12,
    color: '#fff',
    fontSize: 16,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  charRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 4,
    marginBottom: 16,
  },
  charCount: {
    color: '#666',
    fontSize: 12,
  },
  buttons: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 12,
  },
  skipButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  skipText: {
    color: '#94a3b8',
    fontSize: 16,
  },
  submitButton: {
    backgroundColor: '#ef4444',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
  },
  submitDisabled: {
    opacity: 0.6,
  },
  submitText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
