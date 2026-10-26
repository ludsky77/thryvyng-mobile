import React from 'react';
import { StyleSheet, Text, View, StyleProp, ViewStyle } from 'react-native';

const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTHS = [
  'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
  'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
];

/**
 * Colour helpers. They DERIVE from whatever accent the caller passes in --
 * always `eventAccent`/`eventAccentFor` from `src/lib/eventColors.ts`, which
 * stays the single per-type colour map. Nothing here hardcodes a hue, so a
 * change in that map carries through the band, the glow and the card outlines.
 *
 * They live in this file because `eventColors.ts` was outside this task's
 * SCOPE; they belong next to the map and should move there when it is open.
 */
function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** The weekday band: the event's own colour, darkened by `amount` (0-1). */
export function darkenAccent(accent: string, amount = 0.12): string {
  const rgb = parseHex(accent);
  if (!rgb) return accent;
  const k = 1 - amount;
  const [r, g, b] = rgb.map((c) => Math.max(0, Math.round(c * k)));
  return `rgb(${r}, ${g}, ${b})`;
}

/** The card outlines: the event's own colour at `alpha`, so it reads as a frame. */
export function accentAlpha(accent: string, alpha = 0.45): string {
  const rgb = parseHex(accent);
  if (!rgb) return accent;
  const [r, g, b] = rgb;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Design "E -- calendar leaf" (Lu, Oct 26): a darker weekday band over a body
 * carrying the day number and month, rounded 20, with a soft glow in the
 * event's own colour. Two sizes, one shape:
 *   'tag'  -- 86x110, beside the detail card header.
 *   'list' -- 70x88, inside the calendar list preview card. Also a TAG, not a
 *             full-height column: it is vertically centred and inset, so the
 *             card's own outline and the glow both stay visible.
 * Both are fixed boxes with no flex, which is what keeps them off the card's
 * height. The event type is deliberately absent -- the chip beside the title
 * already carries it.
 */
export default function DateBadge({
  date,
  variant,
  color,
  style,
}: {
  date: Date;
  variant: 'tag' | 'list';
  color: string;
  style?: StyleProp<ViewStyle>;
}) {
  const tag = variant === 'tag';
  return (
    <View
      style={[
        tag ? styles.tag : styles.list,
        // Glow in the event's colour, not a generic black drop shadow.
        { shadowColor: color },
        style,
      ]}
    >
      <View
        style={[
          tag ? styles.tagBand : styles.listBand,
          { backgroundColor: darkenAccent(color) },
        ]}
      >
        <Text
          style={tag ? styles.tagDow : styles.listDow}
          numberOfLines={1}
        >
          {DAYS[date.getDay()]}
        </Text>
      </View>

      <View
        style={[
          tag ? styles.tagBody : styles.listBody,
          { backgroundColor: color },
        ]}
      >
        <Text
          style={tag ? styles.tagDay : styles.listDay}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.5}
        >
          {String(date.getDate())}
        </Text>
        <Text
          style={tag ? styles.tagMonth : styles.listMonth}
          numberOfLines={1}
        >
          {MONTHS[date.getMonth()]}
        </Text>
      </View>
    </View>
  );
}

// The band and body carry the corner radii themselves rather than relying on
// `overflow: 'hidden'` on the container -- clipping the container is what eats
// the glow (and Android's elevation shadow) on a rounded card.
const RADIUS = 20;

const styles = StyleSheet.create({
  tag: {
    width: 86,
    height: 110,
    borderRadius: RADIUS,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },
  tagBand: {
    paddingVertical: 7,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopLeftRadius: RADIUS,
    borderTopRightRadius: RADIUS,
  },
  tagDow: {
    color: 'white',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.6,
    textAlign: 'center',
  },
  tagBody: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderBottomLeftRadius: RADIUS,
    borderBottomRightRadius: RADIUS,
  },
  tagDay: {
    color: 'white',
    fontSize: 38,
    fontWeight: '800',
    lineHeight: 42,
  },
  tagMonth: {
    color: 'white',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.6,
    opacity: 0.9,
  },

  // Same leaf, scaled to the list card. Centred and inset, never stretched.
  list: {
    width: 70,
    height: 88,
    alignSelf: 'center',
    marginLeft: 10,
    marginVertical: 10,
    borderRadius: RADIUS,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },
  listBand: {
    paddingVertical: 6,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopLeftRadius: RADIUS,
    borderTopRightRadius: RADIUS,
  },
  listDow: {
    color: 'white',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.6,
    textAlign: 'center',
  },
  listBody: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderBottomLeftRadius: RADIUS,
    borderBottomRightRadius: RADIUS,
  },
  listDay: {
    color: 'white',
    fontSize: 28,
    fontWeight: '800',
    lineHeight: 32,
  },
  listMonth: {
    color: 'white',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.6,
    opacity: 0.9,
  },
});
