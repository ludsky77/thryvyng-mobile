import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { EVENT_TYPES } from '../../types';
import type { EventType } from '../../types';

/**
 * Step 1 of creating an event: WHICH KIND.
 *
 * The create form used to open on 'practice' with a horizontal chip strip as
 * its first control, so the other types lived off-screen to the right -- a
 * coach adding a game had to discover a sideways scroll first. This sheet
 * lists every type the form supports, all visible at once, vertically, and
 * hands the chosen one to CreateEventModal, which then titles itself after it
 * ("New Practice"). The chip strip is gone from the form.
 *
 * The list is EVENT_TYPES itself (src/types/index.ts) -- not a second copy --
 * so a type added there shows up here without touching this file, minus
 * UNRELEASED_EVENT_TYPES below.
 *
 * This is a real <Modal> because its host (CalendarScreen) is a plain screen.
 * The team picker inside CreateEventModal cannot be, because that host is
 * itself a full-screen Modal -- see DateTimeSheet's header comment.
 */

const EVENT_TYPE_ICONS: Record<string, { icon: string; color: string }> = {
  game: { icon: 'trophy', color: '#06B6D4' },
  scrimmage: { icon: 'locate', color: '#F97316' },
  practice: { icon: 'people', color: '#10B981' },
  other_event: { icon: 'calendar', color: '#8B5CF6' },
  club_event: { icon: 'business', color: '#3B82F6' },
};

const FALLBACK_ICON = { icon: 'calendar', color: '#8B5CF6' };

/**
 * Types nobody may create yet (R7, Lu 2026-10-23).
 *
 * 'club_event' is held back until the Club Events phase ships, because that
 * feature is club_admin-only and club-wide -- neither of which this form can
 * express: it creates one row for one team, from a team-staff team list.
 *
 * HIDDEN HERE ONLY, deliberately. The value stays in EVENT_TYPES and in the
 * EventType union, so club_event rows that already exist keep their CLUB badge
 * and their colour everywhere they are READ -- no display code is involved in
 * this gate. Shipping CE means deleting a line from this array, not adding a
 * type back.
 */
const UNRELEASED_EVENT_TYPES: EventType[] = ['club_event'];

/** What the sheet offers: every type the form supports, minus the unreleased. */
const CREATABLE_EVENT_TYPES = EVENT_TYPES.filter(
  (type) => !UNRELEASED_EVENT_TYPES.includes(type.value)
);

interface EventTypeSheetProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (eventType: EventType) => void;
}

export function EventTypeSheet({
  visible,
  onClose,
  onSelect,
}: EventTypeSheetProps) {
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
        <View style={styles.sheet} onStartShouldSetResponder={() => true}>
          <View style={styles.header}>
            <Text style={styles.title}>New Event</Text>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Text style={styles.close}>✕</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.subtitle}>What are you adding?</Text>

          {CREATABLE_EVENT_TYPES.map((type) => {
            const config = EVENT_TYPE_ICONS[type.value] || FALLBACK_ICON;
            return (
              <TouchableOpacity
                key={type.value}
                style={styles.row}
                onPress={() => onSelect(type.value)}
                accessibilityRole="button"
                accessibilityLabel={`New ${type.label}`}
              >
                <View
                  style={[
                    styles.iconWrap,
                    { backgroundColor: config.color + '20' },
                  ]}
                >
                  <Ionicons
                    name={config.icon as any}
                    size={22}
                    color={config.color}
                  />
                </View>
                <Text style={styles.rowLabel}>{type.label}</Text>
                <Ionicons name="chevron-forward" size={18} color="#888888" />
              </TouchableOpacity>
            );
          })}
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  sheet: {
    backgroundColor: '#2a2a4e',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 1,
    borderTopColor: '#4a4a7e',
    paddingHorizontal: 16,
    // Fixed, not useSafeAreaInsets(): same reason DateTimeSheet gives.
    paddingBottom: 28,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
  },
  title: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '600',
  },
  close: {
    color: '#aaaaaa',
    fontSize: 18,
  },
  subtitle: {
    color: '#a78bfa',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#252545',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3a3a6e',
    paddingVertical: 14,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rowLabel: {
    flex: 1,
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});
