import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
  Switch,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useCreatePoll } from '../../hooks/usePolls';

const MAX_QUESTION_LENGTH = 500;
const MIN_OPTIONS = 2;
const MAX_OPTIONS = 10;

const POLL_TYPES = [
  { value: 'single' as const, label: 'Single choice' },
  { value: 'multiple' as const, label: 'Multiple choice' },
  { value: 'yes_no' as const, label: 'Yes / No' },
] as const;

export type PollType = 'single' | 'multiple' | 'yes_no';

const INITIAL_OPTIONS = ['', ''];

interface CreatePollModalProps {
  visible: boolean;
  onClose: () => void;
  channelId: string;
  onSuccess?: () => void;
}

export function CreatePollModal({
  visible,
  onClose,
  channelId,
  onSuccess,
}: CreatePollModalProps) {
  const { createPoll } = useCreatePoll();

  const [question, setQuestion] = useState('');
  const [pollType, setPollType] = useState<PollType>('single');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [showResultsLive, setShowResultsLive] = useState(true);
  const [deadlineHours, setDeadlineHours] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ question?: string; options?: string }>({});

  // Reset form when modal closes
  useEffect(() => {
    if (!visible) {
      setQuestion('');
      setPollType('single');
      setOptions(['', '']);
      setIsAnonymous(false);
      setShowResultsLive(true);
      setDeadlineHours('');
      setErrors({});
    }
  }, [visible]);

  const addOption = () => {
    if (options.length >= MAX_OPTIONS) return;
    setOptions([...options, '']);
  };

  const removeOption = (index: number) => {
    if (options.length <= MIN_OPTIONS) return;
    setOptions(options.filter((_, i) => i !== index));
  };

  const updateOption = (index: number, value: string) => {
    const next = [...options];
    next[index] = value;
    setOptions(next);
  };

  const getOptionsForSubmit = (): string[] => {
    if (pollType === 'yes_no') return ['Yes', 'No'];
    return options.map(o => o.trim()).filter(Boolean);
  };

  const validate = (): boolean => {
    const next: { question?: string; options?: string } = {};
    const q = question.trim();
    if (!q) {
      next.question = 'Question is required';
    } else if (q.length > MAX_QUESTION_LENGTH) {
      next.question = `Max ${MAX_QUESTION_LENGTH} characters`;
    }
    if (pollType !== 'yes_no') {
      const validOptions = options.map(o => o.trim()).filter(Boolean);
      if (validOptions.length < MIN_OPTIONS) {
        next.options = `Add at least ${MIN_OPTIONS} options`;
      }
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleCreate = async () => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      const opts = getOptionsForSubmit();
      const endsAt =
        deadlineHours.trim() !== ''
          ? (() => {
              const hours = parseInt(deadlineHours, 10);
              if (Number.isNaN(hours) || hours <= 0) return null;
              const d = new Date();
              d.setHours(d.getHours() + hours);
              return d;
            })()
          : null;

      const poll = await createPoll(channelId, question.trim(), pollType, opts, {
        isAnonymous,
        showResultsLive,
        endsAt,
      });

      if (poll) {
        onSuccess?.();
        onClose();
      } else {
        Alert.alert(
          'Error',
          'Failed to create poll. Please check your connection and try again.',
          [{ text: 'OK' }]
        );
      }
    } catch {
      Alert.alert(
        'Error',
        'Something went wrong. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    if (!submitting) onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={handleCancel}
    >
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={handleCancel}
            disabled={submitting}
            style={styles.headerButton}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Create Poll</Text>
          <TouchableOpacity
            onPress={handleCreate}
            disabled={submitting}
            style={[styles.headerButton, styles.headerButtonRight, submitting && styles.headerButtonDisabled]}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#8b5cf6" />
            ) : (
              <Text style={styles.createText}>Create</Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Question */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Question *</Text>
            <TextInput
              style={[styles.textArea, errors.question && styles.inputError]}
              placeholder="What do you want to ask?"
              placeholderTextColor="#666"
              value={question}
              onChangeText={setQuestion}
              multiline
              maxLength={MAX_QUESTION_LENGTH + 1}
              editable={!submitting}
            />
            <View style={styles.charRow}>
              <Text style={styles.errorText}>{errors.question}</Text>
              <Text style={styles.charCount}>
                {question.length}/{MAX_QUESTION_LENGTH}
              </Text>
            </View>
          </View>

          {/* Poll type */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Poll type</Text>
            <View style={styles.pollTypeRow}>
              {POLL_TYPES.map(({ value, label }) => (
                <TouchableOpacity
                  key={value}
                  style={[
                    styles.pollTypeOption,
                    pollType === value && styles.pollTypeOptionActive,
                  ]}
                  onPress={() => setPollType(value)}
                  disabled={submitting}
                >
                  <Text
                    style={[
                      styles.pollTypeLabel,
                      pollType === value && styles.pollTypeLabelActive,
                    ]}
                  >
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Options - hidden for yes_no */}
          {pollType !== 'yes_no' && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionLabel}>
                  Options * (2–{MAX_OPTIONS})
                </Text>
                {options.length < MAX_OPTIONS && (
                  <TouchableOpacity
                    onPress={addOption}
                    disabled={submitting}
                    style={styles.addOptionButton}
                  >
                    <Text style={styles.addOptionText}>+ Add</Text>
                  </TouchableOpacity>
                )}
              </View>
              {errors.options ? (
                <Text style={[styles.errorText, styles.errorTextBlock]}>
                  {errors.options}
                </Text>
              ) : null}
              {options.map((opt, index) => (
                <View key={index} style={styles.optionRow}>
                  <TextInput
                    style={[styles.optionInput, index < options.length && styles.optionInputWithRemove]}
                    placeholder={`Option ${index + 1}`}
                    placeholderTextColor="#666"
                    value={opt}
                    onChangeText={v => updateOption(index, v)}
                    editable={!submitting}
                  />
                  <TouchableOpacity
                    onPress={() => removeOption(index)}
                    disabled={options.length <= MIN_OPTIONS || submitting}
                    style={[
                      styles.removeOptionButton,
                      options.length <= MIN_OPTIONS && styles.removeOptionDisabled,
                    ]}
                  >
                    <Text style={styles.removeOptionText}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          {/* Settings */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Settings</Text>

            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>Anonymous voting</Text>
              <Switch
                value={isAnonymous}
                onValueChange={setIsAnonymous}
                disabled={submitting}
                trackColor={{ false: '#3a3a6e', true: '#8b5cf6' }}
                thumbColor="#fff"
              />
            </View>

            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>Show results live</Text>
              <Switch
                value={showResultsLive}
                onValueChange={setShowResultsLive}
                disabled={submitting}
                trackColor={{ false: '#3a3a6e', true: '#8b5cf6' }}
                thumbColor="#fff"
              />
            </View>

            <View style={styles.deadlineRow}>
              <Text style={styles.toggleLabel}>Deadline (hours)</Text>
              <TextInput
                style={styles.deadlineInput}
                placeholder="Optional"
                placeholderTextColor="#666"
                value={deadlineHours}
                onChangeText={setDeadlineHours}
                keyboardType="number-pad"
                editable={!submitting}
              />
            </View>
          </View>

          <View style={styles.bottomSpacer} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 12,
    backgroundColor: '#2a2a4e',
    borderBottomWidth: 1,
    borderBottomColor: '#3a3a6e',
  },
  headerButton: {
    minWidth: 72,
    alignItems: 'flex-start',
  },
  headerButtonRight: {
    alignItems: 'flex-end',
  },
  headerButtonDisabled: {
    opacity: 0.6,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  cancelText: {
    color: '#999',
    fontSize: 16,
  },
  createText: {
    color: '#8b5cf6',
    fontSize: 16,
    fontWeight: '600',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionLabel: {
    color: '#8b5cf6',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  textArea: {
    backgroundColor: '#2a2a4e',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3a3a6e',
    padding: 12,
    color: '#fff',
    fontSize: 16,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  inputError: {
    borderColor: '#ef4444',
  },
  charRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 12,
    flex: 1,
  },
  errorTextBlock: {
    marginBottom: 8,
  },
  charCount: {
    color: '#666',
    fontSize: 12,
  },
  pollTypeRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  pollTypeOption: {
    backgroundColor: '#2a2a4e',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3a3a6e',
  },
  pollTypeOptionActive: {
    borderColor: '#8b5cf6',
    backgroundColor: '#2a2a4e',
  },
  pollTypeLabel: {
    color: '#999',
    fontSize: 14,
  },
  pollTypeLabelActive: {
    color: '#8b5cf6',
    fontWeight: '600',
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  optionInput: {
    flex: 1,
    backgroundColor: '#2a2a4e',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3a3a6e',
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#fff',
    fontSize: 15,
  },
  optionInputWithRemove: {
    flex: 1,
  },
  removeOptionButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#3a3a6e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeOptionDisabled: {
    opacity: 0.4,
  },
  removeOptionText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  addOptionButton: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  addOptionText: {
    color: '#8b5cf6',
    fontSize: 14,
    fontWeight: '600',
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a4e',
  },
  toggleLabel: {
    color: '#fff',
    fontSize: 15,
    flex: 1,
  },
  deadlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  deadlineInput: {
    width: 80,
    backgroundColor: '#2a2a4e',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3a3a6e',
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#fff',
    fontSize: 15,
  },
  bottomSpacer: {
    height: 40,
  },
});
