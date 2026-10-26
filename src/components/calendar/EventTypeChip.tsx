import React from 'react';
import {
  StyleSheet,
  StyleProp,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
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

/** The types that play somebody (ruling R-K). */
const VERSUS_TYPES = new Set(['game', 'scrimmage', 'tournament']);

/** A leading "vs" / "vs." on a string that is already an opponent name. */
const VS_PREFIX = /^vs\.?\s+/i;

function stripVs(text: string): string {
  return text.replace(VS_PREFIX, '').trim();
}

function sameText(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

type OpponentEvent = {
  event_type?: string | null;
  title?: string | null;
  opponent?: string | null;
  is_cancelled?: boolean | null;
};

/**
 * WHERE THE OPPONENT COMES FROM (checked before building R-K, recorded in
 * docs/recon/calendar-teams-v2-build.md): `cal_events.opponent` is a REAL
 * column -- `CalendarEvent.opponent: string | null`, src/types/index.ts:205 --
 * written by the create and edit forms for `game` and `scrimmage` ONLY
 * (`isGameOrScrimmage`, CreateEventModal.tsx:412 / :476). Those same forms also
 * store the opponent AS THE TITLE for those two types
 * (`finalTitle = isGameOrScrimmage ? opponent : title`, CreateEventModal.tsx:425),
 * which is why a game's title and its opponent are usually the same string.
 *
 * So: the column is the source when it is there; a title that starts with
 * "vs"/"vs." is the fallback (the only route a TOURNAMENT has, since the forms
 * never write `opponent` for one). Either way the leading "vs" is stripped
 * before rendering, so `VsOpponent` cannot produce "vs vs Rapids".
 * Nothing was invented: no field outside those two is read.
 */
export function eventOpponent(event: OpponentEvent): string | null {
  if (!VERSUS_TYPES.has((event.event_type || '').toLowerCase())) return null;
  const column = stripVs((event.opponent || '').trim());
  if (column) return column;
  const title = (event.title || '').trim();
  if (VS_PREFIX.test(title)) return stripVs(title) || null;
  return null;
}

/**
 * The one decision every surface shares: what goes on the line under the
 * headline. Returns the opponent to render as "vs X" and the title to render
 * beside it -- `null` for either means "do not render it".
 *
 * Three ways a title earns nothing (R-H, R-K): it is empty, it is the type's
 * own label ("Practice" on a practice), or it IS the opponent, which is the
 * normal case for a game because the create form writes it there. A CANCELLED
 * event always keeps its title, so the strike-through stays visible, and then
 * the "vs" line gives way instead of repeating it.
 */
export function eventTitleBits(event: OpponentEvent): {
  opponent: string | null;
  title: string | null;
} {
  const opponent = eventOpponent(event);
  const raw = (event.title || '').trim();
  const titleIsOpponent = !!opponent && sameText(stripVs(raw), opponent);

  if (event.is_cancelled) {
    return { opponent: titleIsOpponent ? null : opponent, title: raw || null };
  }
  if (!raw || titleIsOpponent || isTitleRedundant(raw, event.event_type)) {
    return { opponent, title: null };
  }
  return { opponent, title: raw };
}

/**
 * Ruling R-K: "vs Rapids" -- the "vs" small, lowercase, letter-spaced and
 * muted, the name in the card's own voice. The mute is the chip's own grey at
 * 70% alpha rather than `opacity` on a nested <Text>, which is the one style
 * RN does not reliably inherit across a Text tree.
 */
export function VsOpponent({
  name,
  variant = 'card',
  style,
}: {
  name: string;
  variant?: 'card' | 'pill';
  style?: StyleProp<TextStyle>;
}) {
  const pill = variant === 'pill';
  return (
    <Text
      style={[pill ? styles.opponentPill : styles.opponent, style]}
      numberOfLines={1}
      ellipsizeMode="tail"
    >
      <Text style={pill ? styles.vsPill : styles.vs}>vs </Text>
      {name}
    </Text>
  );
}

const CHIP_BG = 'rgba(148, 163, 184, 0.18)';
const CHIP_FG = '#cbd5e1';
/** The chip's grey at 70% -- R-K's muted "vs", same colour family. */
const CHIP_FG_MUTED = 'rgba(203, 213, 225, 0.7)';

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

  // R-K. The name is the card's own text colour; only the "vs" is muted.
  opponent: {
    color: '#e2e8f0',
    fontSize: 14,
    fontWeight: '600',
    flexShrink: 1,
    minWidth: 0,
  },
  vs: {
    color: CHIP_FG_MUTED,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.2,
  },
  opponentPill: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    flexShrink: 1,
    minWidth: 0,
  },
  vsPill: {
    color: CHIP_FG_MUTED,
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1,
  },
});
