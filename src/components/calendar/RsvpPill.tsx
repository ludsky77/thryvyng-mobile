import React from 'react';
import {
  StyleProp,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';

/**
 * RSVP palette, round 2 (Lu, Oct 26). The three-tone rule: **purple, grey,
 * red — and red is destructive only**. "Can't go" is an answer, not a
 * destructive act, so it is slate, not red; nothing here is green.
 *
 * These are the app's existing hues (`#8b5cf6` accent and `#a78bfa` lavender
 * appear across the calendar components already), collected here so the pill
 * and the responses bar cannot drift apart. There is no theme module in this
 * repo yet -- when one lands, these move into it.
 */
export const RSVP_TOKENS = {
  /** Brand accent: the "going" fill and the going segment of the bar. */
  accent: '#8b5cf6',
  /** Lavender: icons on unanswered outlines and on the slate fill. */
  lavender: '#a78bfa',
  /** Slate fill for the "can't go" answer. */
  slate: '#2b3350',
  /** Border on that slate fill -- a shade lighter so the edge still reads. */
  slateBorder: '#4a5479',
  /** Outline border while unanswered. */
  outline: '#3a4360',
  /** Light label text on an unanswered outline. */
  text: '#e2e8f0',
  /** White label on either filled state. */
  textOn: '#ffffff',
  /** Muted label text beside the control. */
  muted: '#94a3b8',
  /** Near-black track behind the responses bar. */
  track: '#0b1120',
} as const;

/**
 * Design "F1 -- one ticket" (Lu, Oct 26), palette revised round 2: the RSVP
 * control, used both inside the event detail card and in the calendar list
 * card's footer (`compact`).
 *
 * Unanswered, BOTH options are real buttons: a 1.5pt slate outline, light
 * text, lavender tick/cross. Answered, the chosen option fills -- purple for
 * going, slate for can't go -- and the other dims to .55 but **stays
 * tappable**, because the writer is last-tap-wins.
 *
 * It owns no write logic. `onGoing` and `onCantGo` are handed in by the screen
 * and run the SAME single writer the round ✓/✗ buttons ran before it
 * (`handleRsvp` -> `upsertRsvp`): going toggles back to pending when it is
 * already the answer, and can't-go opens the reason sheet.
 *
 * Press feedback is `activeOpacity` plus the selected segment's slight scale,
 * matching the app's existing pattern (`VoterSeat.tsx:60`). **No haptic**:
 * `expo-haptics` is not installed and nothing in `src/` calls Haptics, as
 * `ChatBubble.tsx:95` already records.
 */
export default function RsvpPill({
  status,
  disabled,
  compact,
  stretch,
  style,
  onGoing,
  onCantGo,
}: {
  // Widest shape the screen can hand over: the RSVP row's `status` column is
  // a plain string, so the pill compares rather than narrows.
  status: string | null | undefined;
  disabled?: boolean;
  /** Tighter box for the calendar list card's footer. */
  compact?: boolean;
  /** Two equal halves filling the row -- the detail card, under its caption. */
  stretch?: boolean;
  /** Layout from the caller, e.g. the list footer's `flexShrink: 0`. */
  style?: StyleProp<ViewStyle>;
  onGoing: () => void;
  onCantGo: () => void;
}) {
  const going = status === 'yes';
  const cant = status === 'no';
  const answered = going || cant;

  const segment = compact ? styles.segmentCompact : styles.segment;
  const label = styles.label;

  return (
    <View style={[styles.track, stretch && styles.trackStretch, style]}>
      <TouchableOpacity
        style={[
          segment,
          stretch && styles.segmentStretch,
          styles.segmentOutline,
          going && styles.segmentGoing,
          answered && !going && styles.segmentDimmed,
        ]}
        onPress={onGoing}
        disabled={disabled}
        activeOpacity={0.8}
      >
        <Text style={[label, styles.labelIcon, going && styles.labelOn]}>✓</Text>
        <Text style={[label, going && styles.labelOn]}>Going</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[
          segment,
          stretch && styles.segmentStretch,
          styles.segmentOutline,
          cant && styles.segmentCant,
          answered && !cant && styles.segmentDimmed,
        ]}
        onPress={onCantGo}
        disabled={disabled}
        activeOpacity={0.8}
      >
        <Text style={[label, styles.labelIcon]}>✕</Text>
        <Text style={[label, cant && styles.labelOn]}>Can't go</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    gap: 6,
  },
  // Detail card: the pill is the full row, split in two equal halves, so the
  // labels can never wrap however long the caption above them is.
  trackStretch: {
    alignSelf: 'stretch',
    gap: 8,
  },
  segmentStretch: {
    flex: 1,
  },
  segment: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 9,
  },
  segmentCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
  },
  // Unanswered: a real button, not a ghost.
  segmentOutline: {
    borderWidth: 1.5,
    borderColor: RSVP_TOKENS.outline,
  },
  segmentGoing: {
    backgroundColor: RSVP_TOKENS.accent,
    borderColor: RSVP_TOKENS.accent,
    transform: [{ scale: 1.02 }],
  },
  segmentCant: {
    backgroundColor: RSVP_TOKENS.slate,
    borderColor: RSVP_TOKENS.slateBorder,
    transform: [{ scale: 1.02 }],
  },
  // The option not chosen. Dimmed, never disabled -- latest tap wins.
  segmentDimmed: {
    opacity: 0.55,
  },
  label: {
    color: RSVP_TOKENS.text,
    fontSize: 13,
    fontWeight: '700',
  },
  labelIcon: {
    color: RSVP_TOKENS.lavender,
  },
  labelOn: {
    color: RSVP_TOKENS.textOn,
  },
});
