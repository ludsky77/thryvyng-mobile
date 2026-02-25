import React, { useState, useEffect, useMemo } from 'react';
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
import DateTimePicker from '@react-native-community/datetimepicker';
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

type DeadlineMode = '24h' | '48h' | '72h' | '1week' | 'custom';
type ReminderBefore = '1h' | '2h' | '1d';

const DEADLINE_OPTIONS: { value: DeadlineMode; label: string }[] = [
  { value: '24h', label: '24 hours' },
  { value: '48h', label: '48 hours' },
  { value: '72h', label: '72 hours' },
  { value: '1week', label: '1 week' },
  { value: 'custom', label: 'Custom' },
];

const REMINDER_OPTIONS: { value: ReminderBefore; label: string }[] = [
  { value: '1h', label: '1 hour before' },
  { value: '2h', label: '2 hours before' },
  { value: '1d', label: '1 day before' },
];

function getTomorrow(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function timeStringToDate(date: Date, timeStr: string): Date {
  const [h, m] = timeStr.split(':').map(Number);
  const d = new Date(date);
  d.setHours(h, m, 0, 0);
  return d;
}

function formatTimeDisplay(timeStr: string): string {
  const [h, m] = timeStr.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

const REMINDER_BEFORE_MINUTES: Record<ReminderBefore, number> = {
  '1h': 60,
  '2h': 120,
  '1d': 1440,
};

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
  const [deadlineMode, setDeadlineMode] = useState<DeadlineMode>('24h');
  const [customDate, setCustomDate] = useState<Date>(() => getTomorrow());
  const [customTime, setCustomTime] = useState<string>('18:00');
  const [sendReminder, setSendReminder] = useState(false);
  const [reminderBefore, setReminderBefore] = useState<ReminderBefore>('1h');
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ question?: string; options?: string }>({});
  const [customDateExpanded, setCustomDateExpanded] = useState(false);
  const [customTimeExpanded, setCustomTimeExpanded] = useState(false);

  const getClosesAt = (): Date | null => {
    const now = new Date();
    if (deadlineMode === 'custom') {
      return timeStringToDate(customDate, customTime);
    }
    if (deadlineMode === '24h') {
      const d = new Date(now);
      d.setHours(d.getHours() + 24);
      return d;
    }
    if (deadlineMode === '48h') {
      const d = new Date(now);
      d.setHours(d.getHours() + 48);
      return d;
    }
    if (deadlineMode === '72h') {
      const d = new Date(now);
      d.setHours(d.getHours() + 72);
      return d;
    }
    if (deadlineMode === '1week') {
      const d = new Date(now);
      d.setDate(d.getDate() + 7);
      return d;
    }
    return null;
  };

  const customDateTime = useMemo(
    () => timeStringToDate(customDate, customTime),
    [customDate, customTime]
  );

  // Reset form when modal closes
  useEffect(() => {
    if (!visible) {
      setQuestion('');
      setPollType('single');
      setOptions(['', '']);
      setIsAnonymous(false);
      setShowResultsLive(true);
      setDeadlineMode('24h');
      setCustomDate(getTomorrow());
      setCustomTime('18:00');
      setSendReminder(false);
      setReminderBefore('1h');
      setCustomDateExpanded(false);
      setCustomTimeExpanded(false);
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
      const endsAt = getClosesAt();

      const poll = await createPoll(channelId, question.trim(), pollType, opts, {
        isAnonymous,
        showResultsLive,
        endsAt,
        sendReminder: sendReminder || undefined,
        reminderBeforeMinutes: sendReminder ? REMINDER_BEFORE_MINUTES[reminderBefore] : undefined,
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
          </View>

          {/* Closes at */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Closes at</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.deadlinePillsScroll}
              style={styles.deadlinePillsScrollView}
            >
              {DEADLINE_OPTIONS.map(({ value, label }) => (
                <TouchableOpacity
                  key={value}
                  style={[
                    styles.deadlinePill,
                    deadlineMode === value && styles.deadlinePillActive,
                  ]}
                  onPress={() => setDeadlineMode(value)}
                  disabled={submitting}
                >
                  <Text
                    style={[
                      styles.deadlinePillLabel,
                      deadlineMode === value && styles.deadlinePillLabelActive,
                    ]}
                  >
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {deadlineMode === 'custom' && (
              <View style={styles.customDateTimeBlock}>
                <TouchableOpacity
                  style={styles.customPickerRow}
                  onPress={() => setCustomDateExpanded(!customDateExpanded)}
                  disabled={submitting}
                >
                  <Text style={styles.customPickerLabel}>Date</Text>
                  <Text style={styles.customPickerValue}>
                    {customDate.toLocaleDateString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </Text>
                  <Text style={styles.chevron}>
                    {customDateExpanded ? '▲' : '▼'}
                  </Text>
                </TouchableOpacity>
                {customDateExpanded && (
                  <DateTimePicker
                    value={customDate}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    minimumDate={(() => {
                      const today = new Date();
                      today.setHours(0, 0, 0, 0);
                      return today;
                    })()}
                    onChange={(_, d) => {
                      if (d) setCustomDate(d);
                    }}
                    textColor="#fff"
                    themeVariant="dark"
                  />
                )}

                <TouchableOpacity
                  style={styles.customPickerRow}
                  onPress={() => setCustomTimeExpanded(!customTimeExpanded)}
                  disabled={submitting}
                >
                  <Text style={styles.customPickerLabel}>Time</Text>
                  <Text style={styles.customPickerValue}>
                    {formatTimeDisplay(customTime)}
                  </Text>
                  <Text style={styles.chevron}>
                    {customTimeExpanded ? '▲' : '▼'}
                  </Text>
                </TouchableOpacity>
                {customTimeExpanded && (
                  <DateTimePicker
                    value={customDateTime}
                    mode="time"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    minuteInterval={30}
                    onChange={(_, d) => {
                      if (d) {
                        const h = d.getHours();
                        const m = d.getMinutes();
                        setCustomTime(
                          `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
                        );
                      }
                    }}
                    textColor="#fff"
                    themeVariant="dark"
                  />
                )}
              </View>
            )}
          </View>

          {/* Reminders */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Reminders</Text>
            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>Send reminder before close</Text>
              <Switch
                value={sendReminder}
                onValueChange={setSendReminder}
                disabled={submitting}
                trackColor={{ false: '#3a3a6e', true: '#8b5cf6' }}
                thumbColor="#fff"
              />
            </View>
            {sendReminder && (
              <View style={styles.reminderPillsRow}>
                {REMINDER_OPTIONS.map(({ value, label }) => (
                  <TouchableOpacity
                    key={value}
                    style={[
                      styles.reminderPill,
                      reminderBefore === value && styles.reminderPillActive,
                    ]}
                    onPress={() => setReminderBefore(value)}
                    disabled={submitting}
                  >
                    <Text
                      style={[
                        styles.reminderPillLabel,
                        reminderBefore === value && styles.reminderPillLabelActive,
                      ]}
                    >
                      {label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
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
  deadlinePillsScrollView: {
    marginHorizontal: -16,
  },
  deadlinePillsScroll: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  deadlinePill: {
    backgroundColor: '#2a2a4e',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3a3a6e',
  },
  deadlinePillActive: {
    borderColor: '#8b5cf6',
  },
  deadlinePillLabel: {
    color: '#999',
    fontSize: 14,
  },
  deadlinePillLabelActive: {
    color: '#8b5cf6',
    fontWeight: '600',
  },
  customDateTimeBlock: {
    marginTop: 12,
    backgroundColor: '#2a2a4e',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3a3a6e',
    padding: 12,
  },
  customPickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#3a3a6e',
  },
  customPickerLabel: {
    color: '#fff',
    fontSize: 15,
  },
  customPickerValue: {
    color: '#8b5cf6',
    fontSize: 15,
  },
  chevron: {
    color: '#666',
    fontSize: 12,
  },
  reminderPillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  reminderPill: {
    backgroundColor: '#2a2a4e',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#3a3a6e',
  },
  reminderPillActive: {
    borderColor: '#8b5cf6',
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
  },
  reminderPillLabel: {
    color: '#999',
    fontSize: 13,
  },
  reminderPillLabelActive: {
    color: '#8b5cf6',
    fontWeight: '600',
  },
  bottomSpacer: {
    height: 40,
  },
});
