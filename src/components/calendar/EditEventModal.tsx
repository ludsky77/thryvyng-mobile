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
import { supabase } from '../../lib/supabase';
import type { EventType, CalendarEvent } from '../../types';
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

function parseTime(timeStr: string | null): Date {
  if (!timeStr) return new Date();
  const [h, m] = timeStr.split(':');
  const d = new Date();
  d.setHours(parseInt(h || '0', 10), parseInt(m || '0', 10), 0, 0);
  return d;
}

/** Format date as YYYY-MM-DD (local date, no timezone shift) */
function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

type HomeAway = 'home' | 'away' | 'neutral';

interface EditEventModalProps {
  visible: boolean;
  event: CalendarEvent | null;
  onClose: () => void;
  onSuccess: () => void;
  onDelete?: () => void;
  onCancel?: () => void;
  onUncancel?: () => void;
}

export function EditEventModal({
  visible,
  event,
  onClose,
  onSuccess,
  onDelete,
  onCancel,
  onUncancel,
}: EditEventModalProps) {
  const [title, setTitle] = useState('');
  const [eventType, setEventType] = useState<EventType>('practice');
  const [eventDate, setEventDate] = useState(new Date());
  const [startTime, setStartTime] = useState(new Date());
  const [endTime, setEndTime] = useState(new Date());
  const [isAllDay, setIsAllDay] = useState(false);
  const [locationName, setLocationName] = useState('');
  const [locationAddress, setLocationAddress] = useState('');
  const [opponent, setOpponent] = useState('');
  const [venue, setVenue] = useState<HomeAway | ''>('');
  const [uniform, setUniform] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ title?: string }>({});

  const [dateExpanded, setDateExpanded] = useState(false);
  const [startTimeExpanded, setStartTimeExpanded] = useState(false);
  const [endTimeExpanded, setEndTimeExpanded] = useState(false);

  // Pre-populate form when event changes
  useEffect(() => {
    if (visible && event) {
      setTitle(event.title || '');
      setEventType((event.event_type as EventType) || 'practice');
      setEventDate(new Date(event.event_date + 'T12:00:00'));
      setStartTime(parseTime(event.start_time));
      setEndTime(parseTime(event.end_time));
      setIsAllDay(event.is_all_day || false);
      setLocationName(event.location_name || '');
      setLocationAddress(event.location_address || '');
      setOpponent(event.opponent || '');
      setVenue((event.home_away as HomeAway) || '');
      setUniform(event.uniform || '');
      setNotes(event.notes || '');
      setDateExpanded(false);
      setStartTimeExpanded(false);
      setEndTimeExpanded(false);
      setErrors({});
    }
  }, [visible, event]);

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

  const handleSave = async () => {
    if (!validate() || !event) return;
    setSubmitting(true);

    try {
      const finalTitle = isGameOrScrimmage ? opponent.trim() : title.trim();

      const updatePayload = {
        title: finalTitle,
        event_type: eventType,
        event_date: formatDate(eventDate),
        start_time: isAllDay ? null : formatTime(startTime),
        end_time: isAllDay ? null : formatTime(endTime),
        is_all_day: isAllDay,
        location_name: locationName.trim() || null,
        location_address: locationAddress.trim() || null,
        opponent: isGameOrScrimmage ? opponent.trim() || null : null,
        home_away: isGameOrScrimmage && venue ? venue : null,
        uniform: uniform.trim() || null,
        notes: notes.trim() || null,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('cal_events')
        .update(updatePayload)
        .eq('id', event.id);

      if (error) throw error;

      // Track which fields changed and notify
      const changedFields: string[] = [];
      if (event.event_date !== updatePayload.event_date) changedFields.push('event_date');
      if (event.start_time !== updatePayload.start_time) changedFields.push('start_time');
      if (event.end_time !== updatePayload.end_time) changedFields.push('end_time');
      if ((event.location_name ?? null) !== updatePayload.location_name) changedFields.push('location_name');
      if ((event.location_address ?? null) !== updatePayload.location_address) changedFields.push('location_address');

      if (changedFields.length > 0) {
        notifyTeamOfEvent({
          eventId: event.id,
          action: 'updated',
          changedFields,
        });
      }

      onSuccess();
    } catch (err) {
      console.error('Error updating event:', err);
      Alert.alert('Error', 'Failed to update event. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    if (!submitting) onClose();
  };

  const isValid = (isGameOrScrimmage ? opponent.trim() : title.trim()).length > 0;

  if (!event) return null;

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
          <TouchableOpacity onPress={handleCancel} disabled={submitting}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>

          <Text style={styles.modalTitle}>Edit Event</Text>

          <TouchableOpacity
            onPress={handleSave}
            disabled={!isValid || submitting}
          >
            <Text
              style={[
                styles.saveText,
                (!isValid || submitting) && styles.saveTextDisabled,
              ]}
            >
              {submitting ? 'Saving...' : 'Save'}
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Event Type */}
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
                placeholder="e.g., Villarreal FC"
                placeholderTextColor={colors.textPlaceholder}
                editable={!submitting}
              />
              {errors.title && <Text style={styles.errorText}>{errors.title}</Text>}

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
              {errors.title && <Text style={styles.errorText}>{errors.title}</Text>}

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

          {/* Date & Time */}
          <CollapsibleSection
            title="Date & Time"
            summary={`${eventDate.toLocaleDateString()}${isAllDay ? ' • All Day' : ` • ${formatTime(startTime)} - ${formatTime(endTime)}`}`}
            defaultExpanded={false}
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

          {/* Location */}
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

          {/* Notes */}
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

          {/* Cancel / Uncancel Button */}
          {event?.is_cancelled ? (
            onUncancel && (
              <TouchableOpacity
                style={styles.uncancelButton}
                onPress={() => {
                  onClose();
                  setTimeout(() => onUncancel(), 300);
                }}
                disabled={submitting}
              >
                <Text style={styles.uncancelButtonText}>✅ Restore Event</Text>
              </TouchableOpacity>
            )
          ) : (
            onCancel && (
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => {
                  onClose();
                  setTimeout(() => onCancel(), 300);
                }}
                disabled={submitting}
              >
                <Text style={styles.cancelButtonText}>🚫 Cancel Event</Text>
              </TouchableOpacity>
            )
          )}

          {/* Delete Button */}
          {onDelete && (
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={() => {
                onClose();
                setTimeout(() => onDelete(), 300);
              }}
              disabled={submitting}
            >
              <Text style={styles.deleteButtonText}>🗑️ Delete Event</Text>
            </TouchableOpacity>
          )}

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
  saveText: {
    color: '#22c55e',
    fontSize: 16,
    fontWeight: '600',
  },
  saveTextDisabled: {
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
  deleteButton: {
    marginTop: 24,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#7c3aed',
    backgroundColor: 'rgba(124, 58, 237, 0.1)',
    alignItems: 'center',
  },
  deleteButtonText: {
    color: '#7c3aed',
    fontWeight: '600',
    fontSize: 15,
  },
  cancelButton: {
    marginTop: 16,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#a78bfa',
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#a78bfa',
    fontWeight: '600',
    fontSize: 15,
  },
  uncancelButton: {
    marginTop: 16,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#22c55e',
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
    alignItems: 'center',
  },
  uncancelButtonText: {
    color: '#22c55e',
    fontWeight: '600',
    fontSize: 15,
  },
  bottomSpacer: {
    height: 40,
  },
});
