import React from 'react';
import { StyleSheet, StyleProp, Text, View, ViewStyle } from 'react-native';
import { getEventTypeLabel, getEventTypeMeta } from '../../constants/eventTypes';

/**
 * The event TYPE, as one neutral grey chip (ruling R-A), in the ONE place it is
 * defined. The list card, the Week/Month/Day pills and the event detail header
 * all render this component, so the type can never again be a hue on one
 * surface and a glyph on another -- which is exactly what the detail screen's
 * `eventAccent(type) + '33'` badge was doing next to a team-coloured list card.
 *
 * Grey is the whole point: colour on these surfaces means TEAM.
 *
 * Two sizes, one chip:
 *   'card' -- the list card and the detail header.
 *   'pill' -- inside a compact pill, where every point of width is contested.
 */
export default function EventTypeChip({
  eventType,
  variant = 'card',
  style,
}: {
  eventType: string | null | undefined;
  variant?: 'card' | 'pill';
  style?: StyleProp<ViewStyle>;
}) {
  const meta = getEventTypeMeta(eventType);
  const pill = variant === 'pill';
  return (
    <View style={[pill ? styles.chipPill : styles.chip, style]}>
      <Text
        style={pill ? styles.textPill : styles.text}
        numberOfLines={1}
      >
        {meta.icon} {meta.label}
      </Text>
    </View>
  );
}

/**
 * True when the event's title says nothing the type chip has not already said
 * -- "Practice" on a practice (ruling R-H). Case- and space-insensitive.
 *
 * It lives beside the chip because it is the same question: the title is
 * redundant precisely when it IS the chip's label. Callers that hide the title
 * must still show it when the event is cancelled -- the strike-through on the
 * title is the only cancellation cue a list card carries.
 */
export function isTitleRedundant(
  title: string | null | undefined,
  eventType: string | null | undefined
): boolean {
  const trimmed = (title || '').trim();
  if (!trimmed) return true;
  return trimmed.toLowerCase() === getEventTypeLabel(eventType).toLowerCase();
}

const CHIP_BG = 'rgba(148, 163, 184, 0.18)';
const CHIP_FG = '#cbd5e1';

const styles = StyleSheet.create({
  chip: {
    flexShrink: 0,
    backgroundColor: CHIP_BG,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  text: {
    color: CHIP_FG,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  chipPill: {
    flexShrink: 0,
    backgroundColor: CHIP_BG,
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  textPill: {
    color: CHIP_FG,
    fontSize: 10,
    fontWeight: '700',
  },
});
