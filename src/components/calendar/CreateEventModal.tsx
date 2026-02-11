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
  KeyboardAvoidingView,
  Platform,
  LayoutAnimation,
  UIManager,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import type { EventType } from '../../types';
import { EVENT_TYPES } from '../../types';
import { CollapsibleSection } from '../CollapsibleSection';
import { notifyTeamOfEvent } from '../../services/eventNotifications';

if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const colors = {
  background: '#1a1a2e',
  cardBackground: '#2a2a4e',
  inputBackground: '#3a3a6e',
  border: '#4a4a7e',
  text: '#ffffff',
  textMuted: '#aaaaaa',
  textPlaceholder: '#888888',
  accent: '#a78bfa',
  accentDim: '#8b5cf6',
};

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function formatTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function addMonths(d: Date, n: number): Date {
  const out = new Date(d);
  out.setMonth(out.getMonth() + n);
  return out;
}

type HomeAway = 'home' | 'away' | 'neutral';

interface CreateEventModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (payload: {
    title: string;
    event_type: EventType;
    event_date: string;
    start_time?: string | null;
    end_time?: string | null;
    is_all_day: boolean;
    location_name?: string | null;
    location_address?: string | null;
    opponent?: string | null;
    home_away?: HomeAway | null;
    uniform?: string | null;
    notes?: string | null;
  }) => Promise<unknown>;
  onCreateRecurring?: (payload: {
    title: string;
    event_type: EventType;
    start_time?: string | null;
    end_time?: string | null;
    is_all_day: boolean;
    location_name?: string | null;
    location_address?: string | null;
    opponent?: string | null;
    home_away?: HomeAway | null;
    uniform?: string | null;
    notes?: string | null;
    dates: string[];
    recurrence_pattern: string;
  }) => Promise<unknown>;
  onSuccess?: () => void;
}

const DAYS_OF_WEEK = [
  { key: 'Su', dayIndex: 0 },
  { key: 'M', dayIndex: 1 },
  { key: 'Tu', dayIndex: 2 },
  { key: 'W', dayIndex: 3 },
  { key: 'Th', dayIndex: 4 },
  { key: 'F', dayIndex: 5 },
  { key: 'Sa', dayIndex: 6 },
];

function calculateRecurrenceDates(
  startDate: string,
  endDate: string,
  days: string[]
): string[] {
  const dates: string[] = [];
  const dayMap: Record<string, number> = {
    Su: 0,
    M: 1,
    Tu: 2,
    W: 3,
    Th: 4,
    F: 5,
    Sa: 6,
  };
  const selectedIndices = days.map((d) => dayMap[d]);

  const current = new Date(startDate + 'T12:00:00');
  const end = new Date(endDate + 'T12:00:00');

  while (current <= end) {
    if (selectedIndices.includes(current.getDay())) {
      const y = current.getFullYear();
      const m = String(current.getMonth() + 1).padStart(2, '0');
      const d = String(current.getDate()).padStart(2, '0');
      dates.push(`${y}-${m}-${d}`);
    }
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

export function CreateEventModal({
  visible,
  onClose,
  onSubmit,
  onCreateRecurring,
  onSuccess,
}: CreateEventModalProps) {
  const today = new Date();
  const [title, setTitle] = useState('');
  const [eventType, setEventType] = useState<EventType>('practice');
  const [eventDate, setEventDate] = useState(new Date());
  const [startTime, setStartTime] = useState(new Date(today.getTime() + 60 * 60 * 1000));
  const [endTime, setEndTime] = useState(new Date(today.getTime() + 2 * 60 * 60 * 1000));
  const [isAllDay, setIsAllDay] = useState(false);
  const [locationName, setLocationName] = useState('');
  const [locationAddress, setLocationAddress] = useState('');
  const [opponent, setOpponent] = useState('');
  const [venue, setVenue] = useState<'home' | 'away' | 'neutral' | ''>('');
  const [uniform, setUniform] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [endRepeatDate, setEndRepeatDate] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ title?: string }>({});
  const [dateExpanded, setDateExpanded] = useState(true);
  const [startTimeExpanded, setStartTimeExpanded] = useState(false);
  const [endTimeExpanded, setEndTimeExpanded] = useState(false);
  const [endRepeatExpanded, setEndRepeatExpanded] = useState(false);

  useEffect(() => {
    if (eventType !== 'practice' && eventType !== 'club_event') {
      setSelectedDays([]);
      setEndRepeatDate('');
    }
  }, [eventType]);

  useEffect(() => {
    if (selectedDays.length > 0 && !endRepeatDate) {
      const max = new Date(eventDate);
      max.setMonth(max.getMonth() + 2);
      setEndRepeatDate(max.toISOString().split('T')[0]);
    } else if (selectedDays.length === 0) {
      setEndRepeatDate('');
    }
  }, [selectedDays.length, eventDate]);

  useEffect(() => {
    if (!visible) {
      const now = new Date();
      setTitle('');
      setEventType('practice');
      setEventDate(new Date());
      setStartTime(new Date(now.getTime() + 60 * 60 * 1000));
      setEndTime(new Date(now.getTime() + 2 * 60 * 60 * 1000));
      setIsAllDay(false);
      setLocationName('');
      setLocationAddress('');
      setOpponent('');
      setVenue('');
      setUniform('');
      setNotes('');
      setSelectedDays([]);
      setEndRepeatDate('');
      setDateExpanded(true);
      setStartTimeExpanded(false);
      setEndTimeExpanded(false);
      setEndRepeatExpanded(false);
      setErrors({});
    }
  }, [visible]);

  const isGameOrScrimmage = eventType === 'game' || eventType === 'scrimmage';

  const validate = (): boolean => {
    const next: { title?: string } = {};
    const finalTitle = isGameOrScrimmage ? opponent : title;
    if (!finalTitle.trim()) {
      next.title = isGameOrScrimmage ? 'Opponent is required' : 'Title is required';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleCreate = async () => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      const finalTitle = isGameOrScrimmage ? opponent.trim() : title.trim();
      const basePayload = {
        title: finalTitle,
        event_type: eventType,
        event_date: formatDate(eventDate),
        start_time: isAllDay ? null : formatTime(startTime),
        end_time: isAllDay ? null : formatTime(endTime),
        is_all_day: isAllDay,
        location_name: locationName.trim() || null,
        location_address: locationAddress.trim() || null,
        opponent: isGameOrScrimmage ? opponent.trim() || null : null,
        home_away: isGameOrScrimmage && venue ? (venue as HomeAway) : null,
        uniform: uniform.trim() || null,
        notes: notes.trim() || null,
      };

      const isRecurring =
        selectedDays.length > 0 &&
        endRepeatDate &&
        onCreateRecurring;

      if (isRecurring) {
        const dates = calculateRecurrenceDates(
          formatDate(eventDate),
          endRepeatDate,
          selectedDays
        );
        if (dates.length === 0) {
          Alert.alert(
            'Invalid recurrence',
            'No events fall within the selected date range and days.',
            [{ text: 'OK' }]
          );
          setSubmitting(false);
          return;
        }
        const result = await onCreateRecurring({
          ...basePayload,
          dates,
          recurrence_pattern: selectedDays.join(','),
        });
        if (result) {
          onSuccess?.();
          onClose();
        } else {
          Alert.alert(
            'Error',
            'Failed to create recurring events. Please check your connection and try again.',
            [{ text: 'OK' }]
          );
        }
      } else {
        const result = await onSubmit(basePayload);
        if (result) {
          // Notify team of new event
          const eventId = (result as { id?: string })?.id;
          if (eventId) {
            notifyTeamOfEvent({
              eventId,
              action: 'created',
            });
          }
          onSuccess?.();
          onClose();
        } else {
          Alert.alert(
            'Error',
            'Failed to create event. Please check your connection and try again.',
            [{ text: 'OK' }]
          );
        }
      }
    } catch {
      Alert.alert('Error', 'Something went wrong. Please try again.', [{ text: 'OK' }]);
    } finally {
      setSubmitting(false);
    }
  };

  const toggleDay = (key: string) => {
    setSelectedDays((prev) =>
      prev.includes(key) ? prev.filter((d) => d !== key) : [...prev, key]
    );
  };

  const showRecurrenceOptions =
    eventType === 'practice' || eventType === 'club_event';

  const minEndRepeatDate = (() => {
    const d = new Date(eventDate);
    d.setDate(d.getDate() + 1);
    return d;
  })();
  const recurrenceDates =
    selectedDays.length > 0 && endRepeatDate
      ? calculateRecurrenceDates(formatDate(eventDate), endRepeatDate, selectedDays)
      : [];
  const isRecurring =
    selectedDays.length > 0 &&
    endRepeatDate &&
    recurrenceDates.length > 1;
  const isValid =
    (isGameOrScrimmage ? opponent.trim() : title.trim()).length > 0;
  const creating = submitting;

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
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={handleCancel} disabled={creating}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>

          <Text style={styles.modalTitle}>Create Event</Text>

          <TouchableOpacity
            onPress={handleCreate}
            disabled={!isValid || creating}
          >
            <Text
              style={[
                styles.createText,
                (!isValid || creating) && styles.createTextDisabled,
              ]}
            >
              {creating
                ? 'Creating...'
                : isRecurring
                  ? `Create ${recurrenceDates.length}`
                  : 'Create'}
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Event Type - First */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.eventTypeContainer}
          >
            {EVENT_TYPES.map((type) => (
              <TouchableOpacity
                key={type.value}
                style={[
                  styles.eventTypeButton,
                  eventType === type.value && {
                    borderColor: type.color,
                    backgroundColor: type.color + '20',
                  },
                ]}
                onPress={() => setEventType(type.value)}
                disabled={submitting}
              >
                <Text style={styles.eventTypeIcon}>{type.icon}</Text>
                <Text
                  style={[
                    styles.eventTypeLabel,
                    eventType === type.value && { color: type.color },
                  ]}
                >
                  {type.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Dynamic Fields */}
          {isGameOrScrimmage ? (
            <View style={styles.section}>
              <Text style={styles.label}>Opponent *</Text>
              <TextInput
                style={[styles.input, errors.title && styles.inputError]}
                value={opponent}
                onChangeText={setOpponent}
                placeholder="e.g., Celtic FC"
                placeholderTextColor={colors.textPlaceholder}
                editable={!submitting}
              />
              {errors.title ? <Text style={styles.errorText}>{errors.title}</Text> : null}

              <Text style={[styles.label, styles.inputTop]}>Venue</Text>
              <View style={styles.venueContainer}>
                {(['home', 'away', 'neutral'] as const).map((v) => (
                  <TouchableOpacity
                    key={v}
                    style={[
                      styles.venueButton,
                      venue === v && styles.venueButtonSelected,
                      venue === v && v === 'home' && { backgroundColor: '#22c55e' },
                      venue === v && v === 'away' && { backgroundColor: '#ef4444' },
                      venue === v && v === 'neutral' && { backgroundColor: '#6b7280' },
                    ]}
                    onPress={() => setVenue(venue === v ? '' : v)}
                    disabled={submitting}
                  >
                    <Text style={[styles.venueText, venue === v && { color: '#fff' }]}>
                      {v === 'home' ? '🏠 Home' : v === 'away' ? '🚗 Away' : '⚖️ Neutral'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.label, styles.inputTop]}>Uniform (optional)</Text>
              <TextInput
                style={styles.input}
                value={uniform}
                onChangeText={setUniform}
                placeholder="e.g., White kit"
                placeholderTextColor={colors.textPlaceholder}
                editable={!submitting}
              />
            </View>
          ) : (
            <View style={styles.section}>
              <Text style={styles.label}>Title *</Text>
              <TextInput
                style={[styles.input, errors.title && styles.inputError]}
                value={title}
                onChangeText={setTitle}
                placeholder="e.g., Speed & Agility Training"
                placeholderTextColor={colors.textPlaceholder}
                editable={!submitting}
              />
              {errors.title ? <Text style={styles.errorText}>{errors.title}</Text> : null}

              <Text style={[styles.label, styles.inputTop]}>Uniform (optional)</Text>
              <TextInput
                style={styles.input}
                value={uniform}
                onChangeText={setUniform}
                placeholder="e.g., Training kit"
                placeholderTextColor={colors.textPlaceholder}
                editable={!submitting}
              />
            </View>
          )}

          {/* Date & Time with Sub-Collapsibles */}
          <CollapsibleSection
            title="Date & Time"
            summary={`${eventDate.toLocaleDateString()}${isAllDay ? ' • All Day' : ` • ${formatTime(startTime)} - ${formatTime(endTime)}`}`}
            defaultExpanded={true}
          >
            <TouchableOpacity
              style={styles.subCollapsible}
              onPress={() => {
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                setDateExpanded(!dateExpanded);
              }}
              disabled={submitting}
            >
              <Text style={styles.subLabel}>Date</Text>
              <Text style={styles.subValue}>{eventDate.toLocaleDateString()}</Text>
              <Text style={styles.chevron}>{dateExpanded ? '▲' : '▼'}</Text>
            </TouchableOpacity>
            {dateExpanded && (
              <DateTimePicker
                value={eventDate}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                minimumDate={new Date()}
                onChange={(_, d) => {
                  if (d) setEventDate(d);
                }}
                textColor={colors.text}
                themeVariant="dark"
              />
            )}

            {!isAllDay && (
              <>
                <TouchableOpacity
                  style={styles.subCollapsible}
                  onPress={() => {
                    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                    setStartTimeExpanded(!startTimeExpanded);
                  }}
                  disabled={submitting}
                >
                  <Text style={styles.subLabel}>Start Time</Text>
                  <Text style={styles.subValue}>{formatTime(startTime)}</Text>
                  <Text style={styles.chevron}>{startTimeExpanded ? '▲' : '▼'}</Text>
                </TouchableOpacity>
                {startTimeExpanded && (
                  <DateTimePicker
                    value={startTime}
                    mode="time"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={(_, d) => {
                      if (d) setStartTime(d);
                    }}
                    textColor={colors.text}
                themeVariant="dark"
                  />
                )}

                <TouchableOpacity
                  style={styles.subCollapsible}
                  onPress={() => {
                    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                    setEndTimeExpanded(!endTimeExpanded);
                  }}
                  disabled={submitting}
                >
                  <Text style={styles.subLabel}>End Time</Text>
                  <Text style={styles.subValue}>{formatTime(endTime)}</Text>
                  <Text style={styles.chevron}>{endTimeExpanded ? '▲' : '▼'}</Text>
                </TouchableOpacity>
                {endTimeExpanded && (
                  <DateTimePicker
                    value={endTime}
                    mode="time"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={(_, d) => {
                      if (d) setEndTime(d);
                    }}
                    textColor={colors.text}
                themeVariant="dark"
                  />
                )}
              </>
            )}

            <View style={styles.allDayRow}>
              <Text style={styles.label}>All Day</Text>
              <Switch
                value={isAllDay}
                onValueChange={setIsAllDay}
                disabled={submitting}
                trackColor={{ false: colors.inputBackground, true: colors.accentDim }}
                thumbColor="#fff"
              />
            </View>
          </CollapsibleSection>

          {showRecurrenceOptions && (
            <CollapsibleSection
              title="Repeat"
              summary={
                selectedDays.length > 0
                  ? `${selectedDays.join(', ')} until ${endRepeatDate ? new Date(endRepeatDate).toLocaleDateString() : ''}`
                  : 'No repeat'
              }
              defaultExpanded={false}
            >
              <Text style={styles.repeatLabel}>Repeat Every (optional)</Text>
              <View style={styles.dayButtonsContainer}>
                {DAYS_OF_WEEK.map(({ key }) => {
                  const isSelected = selectedDays.includes(key);
                  return (
                    <TouchableOpacity
                      key={key}
                      style={[
                        styles.dayButton,
                        isSelected && styles.dayButtonSelected,
                      ]}
                      onPress={() => toggleDay(key)}
                      disabled={submitting}
                    >
                      <Text
                        style={[
                          styles.dayButtonText,
                          isSelected && styles.dayButtonTextSelected,
                        ]}
                      >
                        {key}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {selectedDays.length > 0 && (
                <View style={styles.endRepeatContainer}>
                  <TouchableOpacity
                    style={styles.endRepeatRow}
                    onPress={() => {
                      LayoutAnimation.configureNext(
                        LayoutAnimation.Presets.easeInEaseOut
                      );
                      setEndRepeatExpanded(!endRepeatExpanded);
                    }}
                    disabled={submitting}
                  >
                    <Text style={styles.endRepeatLabel}>End Repeat</Text>
                    <View style={styles.endRepeatValue}>
                      <Text style={styles.endRepeatDate}>
                        {endRepeatDate
                          ? new Date(endRepeatDate).toLocaleDateString()
                          : 'Select date'}
                      </Text>
                      <Text style={styles.chevron}>
                        {endRepeatExpanded ? '▲' : '▼'}
                      </Text>
                    </View>
                  </TouchableOpacity>

                  {endRepeatExpanded && (
                    <DateTimePicker
                      value={
                        endRepeatDate
                          ? new Date(endRepeatDate)
                          : minEndRepeatDate
                      }
                      mode="date"
                      display={
                        Platform.OS === 'ios' ? 'spinner' : 'default'
                      }
                      minimumDate={minEndRepeatDate}
                      maximumDate={addMonths(new Date(eventDate), 2)}
                      onChange={(_, d) => {
                        if (d) setEndRepeatDate(d.toISOString().split('T')[0]);
                      }}
                      textColor="#ffffff"
                      themeVariant="dark"
                      style={styles.datePicker}
                    />
                  )}

                  {endRepeatDate && recurrenceDates.length > 0 && (
                    <View style={styles.previewCount}>
                      <Text style={styles.previewText}>
                        This will create {recurrenceDates.length} events
                      </Text>
                    </View>
                  )}
                </View>
              )}
            </CollapsibleSection>
          )}

          <CollapsibleSection
            title="Location"
            summary={locationName || locationAddress || 'No location'}
            defaultExpanded={false}
          >
            <TextInput
              style={styles.input}
              placeholder="Location name"
              placeholderTextColor={colors.textPlaceholder}
              value={locationName}
              onChangeText={setLocationName}
              editable={!submitting}
            />
            <TextInput
              style={[styles.input, styles.inputTop]}
              placeholder="Address (optional)"
              placeholderTextColor={colors.textPlaceholder}
              value={locationAddress}
              onChangeText={setLocationAddress}
              editable={!submitting}
            />
          </CollapsibleSection>

          <CollapsibleSection
            title="Notes"
            summary={notes || 'No notes'}
            defaultExpanded={false}
          >
            <TextInput
              style={styles.textArea}
              placeholder="Optional notes"
              placeholderTextColor={colors.textPlaceholder}
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={3}
              editable={!submitting}
            />
          </CollapsibleSection>

          <View style={styles.bottomSpacer} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 14,
    backgroundColor: colors.cardBackground,
    borderBottomWidth: 1,
    borderBottomColor: '#3a3a6e',
  },
  cancelText: {
    color: '#aaa',
    fontSize: 16,
  },
  modalTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  createText: {
    color: '#22c55e',
    fontSize: 16,
    fontWeight: '600',
  },
  createTextDisabled: {
    color: '#666',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  eventTypeContainer: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  eventTypeButton: {
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.inputBackground,
    backgroundColor: colors.cardBackground,
    marginRight: 10,
    minWidth: 80,
  },
  eventTypeIcon: {
    fontSize: 24,
    marginBottom: 4,
  },
  eventTypeLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  section: {
    marginBottom: 24,
  },
  label: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: colors.inputBackground,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    color: colors.text,
    fontSize: 16,
  },
  inputError: {
    borderColor: '#ef4444',
  },
  inputTop: {
    marginTop: 8,
  },
  venueContainer: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  venueButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.inputBackground,
    backgroundColor: colors.cardBackground,
    alignItems: 'center',
  },
  venueButtonSelected: {
    borderColor: 'transparent',
  },
  venueText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '500',
  },
  subCollapsible: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#252545',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.inputBackground,
  },
  subLabel: {
    color: colors.textMuted,
    fontSize: 14,
    flex: 1,
  },
  subValue: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
    marginRight: 10,
  },
  chevron: {
    color: colors.accent,
    fontSize: 12,
  },
  allDayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  textArea: {
    backgroundColor: colors.inputBackground,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    color: colors.text,
    fontSize: 16,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  errorText: {
    color: '#ef4444',
    fontSize: 12,
    marginTop: 4,
  },
  repeatLabel: {
    color: '#a78bfa',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 12,
    letterSpacing: 0.5,
  },
  dayButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  dayButton: {
    width: 42,
    height: 42,
    borderRadius: 8,
    backgroundColor: '#2a2a4e',
    borderWidth: 1,
    borderColor: '#3a3a6e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayButtonSelected: {
    backgroundColor: '#8b5cf6',
    borderColor: '#8b5cf6',
  },
  dayButtonText: {
    color: '#aaa',
    fontSize: 13,
    fontWeight: '600',
  },
  dayButtonTextSelected: {
    color: '#fff',
  },
  endRepeatContainer: {
    marginTop: 4,
  },
  endRepeatRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#252545',
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3a3a6e',
  },
  endRepeatLabel: {
    color: '#aaa',
    fontSize: 14,
  },
  endRepeatValue: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  endRepeatDate: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginRight: 8,
  },
  datePicker: {
    backgroundColor: '#1e1e3a',
    marginTop: 8,
  },
  previewCount: {
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  previewText: {
    color: '#a78bfa',
    fontSize: 14,
    textAlign: 'center',
  },
  bottomSpacer: {
    height: 40,
  },
});
