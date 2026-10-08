import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';

/**
 * Overlay date/time picker with explicit Cancel / Done.
 *
 * Replaces the old "inline expand" pattern, where tapping a row pushed a
 * spinner into the ScrollView's document flow and every wheel settle wrote
 * straight to form state (no commit step, nothing to cancel).
 *
 * TWO DELIBERATE CONSTRAINTS, both from docs/recon/date-picker-current-state.md:
 *
 * 1. On iOS this renders an absolutely-positioned View, NOT a <Modal>. Every
 *    host (CreateEventModal, EditEventModal, CreatePollModal) is itself a
 *    full-screen <Modal>, and nothing in this app nests one modal inside
 *    another; InviteCoParentModal.tsx:308 already documents safe-area
 *    fragility around these screens. So the sheet must be mounted as the last
 *    child of the host's root flex container (inside the host's Modal, as a
 *    sibling after its ScrollView) and it fills that container.
 *
 * 2. On Android nothing changes visually: `display="default"` is an OS-owned
 *    dialog that already overlays and already has its own OK/Cancel, so
 *    wrapping it in a custom sheet would double-wrap it. What this component
 *    DOES add on Android is the dismiss handling the old inline sites were
 *    missing -- both branches call back into the host, which clears the host's
 *    open-field state, so a cancelled dialog no longer leaves a row's chevron
 *    stuck pointing up at an invisible picker.
 *
 * Draft + commit: the wheel writes to a local draft. onDone hands the draft to
 * the host, which is the only moment form state changes (and, on the create
 * form, the only moment the arrival/end cascade fires). onCancel discards the
 * draft and leaves form state untouched.
 */

type DateTimeSheetMode = 'date' | 'time';

export interface DateTimeSheetProps {
  /** Whether a field's sheet is open. */
  visible: boolean;
  /**
   * Identifies WHICH field is open. The sequence flow keeps the sheet mounted
   * while moving from one field to the next, so `visible` alone cannot tell us
   * to re-seed the draft -- this can.
   */
  fieldKey: string;
  /** Header title, e.g. "Start Time". */
  label: string;
  /** The committed form value. Seeds the draft when the sheet opens. */
  value: Date;
  mode: DateTimeSheetMode;
  minimumDate?: Date;
  maximumDate?: Date;
  minuteInterval?: 1 | 2 | 3 | 4 | 5 | 6 | 10 | 12 | 15 | 20 | 30;
  /** Defaults to "Done". The sequence flow passes e.g. "Next: End Time". */
  doneLabel?: string;
  onCancel: () => void;
  onDone: (value: Date) => void;
}

export function DateTimeSheet({
  visible,
  fieldKey,
  label,
  value,
  mode,
  minimumDate,
  maximumDate,
  minuteInterval,
  doneLabel,
  onCancel,
  onDone,
}: DateTimeSheetProps) {
  const [draft, setDraft] = useState<Date>(value);

  // Re-seed the draft from committed form state when the sheet opens, and
  // again when the sequence advances it to a different field while it stays
  // open.
  //
  // `value` is deliberately NOT a dependency: once the sheet is open the draft
  // is MEANT to diverge from form state -- that divergence is the only reason
  // Cancel has anything to discard. Re-seeding on every `value` change would
  // also fight the create form's cascade, which rewrites arrival and end the
  // moment start is committed.
  useEffect(() => {
    if (visible) setDraft(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, fieldKey]);

  if (!visible) return null;

  if (Platform.OS !== 'ios') {
    return (
      <DateTimePicker
        value={value}
        mode={mode}
        display="default"
        minimumDate={minimumDate}
        maximumDate={maximumDate}
        minuteInterval={minuteInterval}
        onChange={(event: DateTimePickerEvent, selected?: Date) => {
          // Either branch calls back, so the host always clears its open-field
          // state -- this is the chevron-stuck-up fix.
          if (event.type === 'dismissed' || !selected) {
            onCancel();
            return;
          }
          onDone(selected);
        }}
      />
    );
  }

  return (
    <View style={styles.overlay}>
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={onCancel}
        accessibilityRole="button"
        accessibilityLabel={`Cancel ${label}`}
      />

      <View style={styles.sheet}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={onCancel}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>

          <Text style={styles.title} numberOfLines={1}>
            {label}
          </Text>

          <TouchableOpacity
            onPress={() => onDone(draft)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={styles.doneText}>{doneLabel ?? 'Done'}</Text>
          </TouchableOpacity>
        </View>

        <DateTimePicker
          value={draft}
          mode={mode}
          display="spinner"
          minimumDate={minimumDate}
          maximumDate={maximumDate}
          minuteInterval={minuteInterval}
          onChange={(_event: DateTimePickerEvent, selected?: Date) => {
            if (selected) setDraft(selected);
          }}
          textColor="#ffffff"
          themeVariant="dark"
          style={styles.picker}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Fills the host's root flex container rather than creating a new Modal
  // surface. See the component comment.
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  sheet: {
    backgroundColor: '#2a2a4e',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 1,
    borderTopColor: '#4a4a7e',
    // Fixed, not useSafeAreaInsets(): insets read from inside a full-screen
    // Modal are unreliable here, which is the same fragility
    // InviteCoParentModal.tsx:308 calls out.
    paddingBottom: 28,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#4a4a7e',
  },
  title: {
    flex: 1,
    textAlign: 'center',
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
    marginHorizontal: 10,
  },
  cancelText: {
    color: '#aaaaaa',
    fontSize: 16,
  },
  doneText: {
    color: '#a78bfa',
    fontSize: 16,
    fontWeight: '600',
  },
  picker: {
    backgroundColor: '#2a2a4e',
  },
});
