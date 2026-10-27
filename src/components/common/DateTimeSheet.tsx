import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
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
 * the host and closes the sheet -- that is the only moment form state changes
 * (and, on the create form, the only moment the arrival/end cascade fires).
 * onCancel discards the draft and leaves form state untouched.
 *
 * R-S, the three ways out, which must all be one of exactly two outcomes:
 *
 *   Done            -> commit the draft, close.
 *   Cancel          -> restore the committed value, close.
 *   backdrop tap    -> Cancel.
 *   swipe down      -> Cancel.
 *
 * The backdrop has called onCancel since this component was written. The swipe
 * did NOT EXIST: the iOS branch is a plain absolutely-positioned View with no
 * gesture handler on it, so a downward drag landed on nothing -- never a silent
 * commit, but never the dismissal the gesture promises either. The pan
 * responder below is that missing path, and it routes to the same handler the
 * backdrop and the Cancel button use, so there is one cancel in this file and
 * not three.
 *
 * The responder is mounted on the GRAB AREA ONLY (the handle plus the header
 * row), never on the sheet as a whole: the spinner underneath needs its own
 * vertical drags. It also claims the touch on MOVE, not on start, so a tap on
 * Cancel or Done still reaches the button.
 */

/** R-S: how far down, or how fast, a drag has to go to count as Cancel. */
const SWIPE_DISMISS_DISTANCE = 80;
const SWIPE_DISMISS_VELOCITY = 0.6;

/**
 * R-T adds 'datetime': iOS's combined wheel, where the weekday rides in the
 * left-hand column ("Wed Oct 28 · 6 · 00 · PM") instead of being spelled out in
 * the header the way R-N's date sheet does.
 *
 * iOS ONLY, and the component is responsible for that, not its hosts: the
 * installed picker's own type unions are `IOSMode = 'date' | 'time' |
 * 'datetime' | 'countdown'` but `AndroidMode = 'date' | 'time'`
 * (@react-native-community/datetimepicker 8.6.0,
 * node_modules/.../src/index.d.ts:4-5). Android therefore gets the two native
 * dialogs in sequence -- see the branch below.
 */
type DateTimeSheetMode = 'date' | 'time' | 'datetime';

/** The date parts of `datePart` with the clock reading of `timePart`. */
function mergeDateAndTime(datePart: Date, timePart: Date): Date {
  const out = new Date(datePart);
  out.setHours(timePart.getHours(), timePart.getMinutes(), 0, 0);
  return out;
}

export interface DateTimeSheetProps {
  /** Whether a field's sheet is open. */
  visible: boolean;
  /** Header title, e.g. "Starts" or "Arrival Time". */
  label: string;
  /** The committed form value. Seeds the draft when the sheet opens. */
  value: Date;
  mode: DateTimeSheetMode;
  minimumDate?: Date;
  maximumDate?: Date;
  minuteInterval?: 1 | 2 | 3 | 4 | 5 | 6 | 10 | 12 | 15 | 20 | 30;
  /**
   * R-N: append the weekday UNDER THE SPINNER to the header -- "Date ·
   * Thursday" -- and keep it in step with the wheel.
   *
   * Opt-in rather than automatic for every `mode="date"` sheet, because this
   * component is shared: the event form asked for the weekday, and the poll
   * form (the other host) was out of that task's scope, so its header must
   * stay exactly as it was.
   *
   * iOS only, by construction: the Android branch is an OS-owned dialog with
   * no header of ours to write into.
   */
  showWeekdayInTitle?: boolean;
  onCancel: () => void;
  onDone: (value: Date) => void;
}

export function DateTimeSheet({
  visible,
  label,
  value,
  mode,
  minimumDate,
  maximumDate,
  minuteInterval,
  showWeekdayInTitle = false,
  onCancel,
  onDone,
}: DateTimeSheetProps) {
  const [draft, setDraft] = useState<Date>(value);

  // Which of the two Android dialogs a mode='datetime' sheet is showing. Unused
  // on iOS and on the single-step modes. R-T: commit only after BOTH steps, so
  // the date the first dialog returned lives in `draft` until the second one
  // settles.
  const [androidStep, setAndroidStep] = useState<'date' | 'time'>('date');

  // Re-seed the draft from committed form state whenever the sheet opens, so a
  // host that keeps this mounted and merely toggles `visible` still starts from
  // the current value rather than a stale draft.
  //
  // `value` is deliberately NOT a dependency: once the sheet is open the draft
  // is MEANT to diverge from form state -- that divergence is the only reason
  // Cancel has anything to discard. Re-seeding on every `value` change would
  // also fight the create form's cascade, which rewrites arrival and end the
  // moment start is committed.
  useEffect(() => {
    if (visible) {
      setDraft(value);
      setAndroidStep('date');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // How far the sheet has been dragged down, in points. Driven by the pan
  // responder and reset by it; nothing else writes it.
  const dragY = useRef(new Animated.Value(0)).current;

  // THE cancel path. Restoring the draft is belt-and-braces today -- every host
  // unmounts this component rather than toggling `visible`, so the draft dies
  // with it -- but it makes "Cancel restores" true inside this file instead of
  // true only because of how the callers happen to mount it.
  const handleCancel = () => {
    setDraft(value);
    setAndroidStep('date');
    dragY.setValue(0);
    onCancel();
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        // Claim on MOVE, and only for a clear downward drag, so taps on Cancel
        // and Done are untouched and a sideways swipe is ignored.
        onMoveShouldSetPanResponder: (_evt, gesture) =>
          gesture.dy > 6 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderMove: (_evt, gesture) => {
          // Downward only: dragging up must not lift the sheet off its edge.
          dragY.setValue(Math.max(0, gesture.dy));
        },
        onPanResponderRelease: (_evt, gesture) => {
          // Far enough, or thrown hard enough, counts as a dismissal.
          if (gesture.dy > SWIPE_DISMISS_DISTANCE || gesture.vy > SWIPE_DISMISS_VELOCITY) {
            handleCancel();
            return;
          }
          Animated.spring(dragY, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 0,
          }).start();
        },
        // An interrupted gesture settles back; it is not a dismissal.
        onPanResponderTerminate: () => {
          Animated.spring(dragY, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 0,
          }).start();
        },
      }),
    // `handleCancel` closes over `value` and `onCancel`; rebuilding the
    // responder when either changes keeps a release from cancelling against a
    // stale value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [value, onCancel]
  );

  if (!visible) return null;

  if (Platform.OS !== 'ios' && mode === 'datetime') {
    // R-T on Android: date dialog, then time dialog, then commit. A dismiss at
    // EITHER step is a full cancel -- nothing is written, which is why the
    // first dialog's answer goes to `draft` and not to the host.
    const step = androidStep;
    return (
      <DateTimePicker
        // A fresh instance per step. Flipping `mode` on a live instance is not
        // a reliable way to get the second dialog to open.
        key={step}
        // `draft`, not `value`: step two has to build on the day step one chose.
        value={draft}
        mode={step}
        display="default"
        minimumDate={step === 'date' ? minimumDate : undefined}
        maximumDate={step === 'date' ? maximumDate : undefined}
        minuteInterval={step === 'time' ? minuteInterval : undefined}
        onChange={(event: DateTimePickerEvent, selected?: Date) => {
          if (event.type === 'dismissed' || !selected) {
            handleCancel();
            return;
          }
          if (step === 'date') {
            // Keep the time the draft already had; ask for the new one next.
            setDraft(mergeDateAndTime(selected, draft));
            setAndroidStep('time');
            return;
          }
          onDone(mergeDateAndTime(draft, selected));
        }}
      />
    );
  }

  if (Platform.OS !== 'ios') {
    return (
      <DateTimePicker
        value={value}
        // 'datetime' already returned above; this says so in a way the compiler
        // can follow, since AndroidMode is only 'date' | 'time'.
        mode={mode === 'time' ? 'time' : 'date'}
        display="default"
        minimumDate={minimumDate}
        maximumDate={maximumDate}
        minuteInterval={minuteInterval}
        onChange={(event: DateTimePickerEvent, selected?: Date) => {
          // Either branch calls back, so the host always clears its open-field
          // state -- this is the chevron-stuck-up fix.
          if (event.type === 'dismissed' || !selected) {
            handleCancel();
            return;
          }
          onDone(selected);
        }}
      />
    );
  }

  // Reads `draft`, which the wheel writes on every settle, so the weekday
  // re-renders as the spinner moves -- no second piece of state to keep in
  // step with it.
  const headerTitle =
    showWeekdayInTitle && mode === 'date'
      ? `${label} · ${draft.toLocaleDateString('en-US', { weekday: 'long' })}`
      : label;

  return (
    <View style={styles.overlay}>
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={handleCancel}
        accessibilityRole="button"
        accessibilityLabel={`Cancel ${label}`}
      />

      <Animated.View
        style={[styles.sheet, { transform: [{ translateY: dragY }] }]}
      >
        {/* The grab area: handle + header. The responder lives here and not on
            the sheet, so the spinner keeps its own vertical drags. */}
        <View {...panResponder.panHandlers}>
          <View style={styles.handleArea}>
            <View style={styles.handle} />
          </View>

          <View style={styles.header}>
            <TouchableOpacity
              onPress={handleCancel}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>

            <Text style={styles.title} numberOfLines={1}>
              {headerTitle}
            </Text>

            <TouchableOpacity
              onPress={() => onDone(draft)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.doneText}>Done</Text>
            </TouchableOpacity>
          </View>
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
      </Animated.View>
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
  handleArea: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 4,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#4a4a7e',
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
