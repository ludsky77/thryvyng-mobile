import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { CalendarEvent } from '../../types';
import EventTypeChip, { eventTitleBits, VsOpponent } from './EventTypeChip';
import { resolveTeamColor, tint } from '../../constants/teamColors';
import { isEventPast } from '../../utils/calendar';

export type CalendarEventWithTeam = CalendarEvent & {
  team?: { id?: string | null; name?: string | null; color?: string | null };
};

/**
 * The compact event pill ruling R-C specifies, shared by Week (one row per day)
 * and Month (the tapped day's events under the grid) so the two can never
 * drift. It is deliberately NOT the list card: no RSVP, no counts, no location.
 *
 * Colour is the TEAM's (ruling R-A): the fill is that colour at 18% and the
 * 4pt left bar is the colour itself. The event TYPE is the same grey
 * EventTypeChip the list card and the detail header use.
 * A past event keeps its team's colour and loses half its opacity -- greying it
 * out entirely would have made "whose team" unreadable on the Previous rows.
 *
 * Ruling R-I sets who gives way when ~275pt of row has to hold chip, time,
 * opponent/title and team: the time and the TEAM NAME never shrink, the title
 * shrinks and ellipsizes first, and a title that merely repeats the chip or the
 * opponent is dropped altogether (R-H/R-K). The pill clips its own overflow, so
 * a pathologically long team name is cut by the pill rather than spilling
 * across the day's row.
 */
function formatPillTime(event: CalendarEvent): string {
  if (event.is_all_day || !event.start_time) return 'All Day';
  const [h, m] = event.start_time.split(':');
  const hour = parseInt(h || '0', 10);
  const suffix = hour >= 12 ? 'PM' : 'AM';
  return `${hour % 12 || 12}:${m || '00'} ${suffix}`;
}

export default function EventPill({
  event,
  onPress,
  showTeam = true,
}: {
  event: CalendarEventWithTeam;
  onPress: (event: CalendarEvent) => void;
  /** Off when the whole screen is already one team. */
  showTeam?: boolean;
}) {
  const teamColor = resolveTeamColor(event.team);
  const past = isEventPast(event);
  const teamName = event.team?.name;
  // R-H/R-K, the same helper the list card and the detail header use: a
  // cancelled event keeps its title (the strike-through on it is a pill's only
  // cancellation cue), a game shows "vs Rapids" instead of repeating it.
  const { opponent, title } = eventTitleBits(event);

  return (
    <TouchableOpacity
      style={[
        styles.pill,
        { backgroundColor: tint(teamColor), borderLeftColor: teamColor },
        past && styles.pillPast,
      ]}
      onPress={() => onPress(event)}
      activeOpacity={0.8}
    >
      <EventTypeChip eventType={event.event_type} variant="pill" />
      <Text style={styles.time} numberOfLines={1}>
        {formatPillTime(event)}
      </Text>
      {opponent ? <VsOpponent name={opponent} variant="pill" /> : null}
      {title ? (
        <Text
          style={[
            styles.title,
            event.is_cancelled && styles.titleCancelled,
          ]}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {title}
        </Text>
      ) : null}
      {showTeam && teamName ? (
        <Text style={styles.team} numberOfLines={1}>
          {teamName}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
}

/**
 * The day-marker dots ruling R-D specifies: one dot per event in the team's
 * colour, in time order, up to `max`, then "+n" for the rest. One dot per
 * EVENT rather than per team, so a day with three practices still reads as a
 * full day.
 */
export function TeamDots({
  events,
  max = 3,
  size = 6,
}: {
  events: CalendarEventWithTeam[];
  max?: number;
  size?: number;
}) {
  if (events.length === 0) return null;
  const shown = events.slice(0, max);
  const extra = events.length - shown.length;

  return (
    <View style={styles.dotsRow}>
      {shown.map((event) => (
        <View
          key={event.id}
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: resolveTeamColor(event.team),
            opacity: isEventPast(event) ? 0.45 : 1,
          }}
        />
      ))}
      {extra > 0 ? (
        <Text style={[styles.dotsMore, { fontSize: size + 3 }]}>+{extra}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
    borderRadius: 8,
    borderLeftWidth: 4,
    paddingVertical: 7,
    paddingHorizontal: 8,
    marginBottom: 6,
    // R-I: the team name does not shrink, so the pill is what clips.
    overflow: 'hidden',
  },
  pillPast: {
    opacity: 0.5,
  },
  time: {
    color: '#e2e8f0',
    fontSize: 12,
    fontWeight: '700',
    flexShrink: 0,
  },
  title: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    flexShrink: 1,
    minWidth: 0,
  },
  titleCancelled: {
    textDecorationLine: 'line-through',
    color: '#94a3b8',
  },
  // R-I: flexShrink 0 -- the team name is the one thing on the pill that is
  // never shortened. marginLeft auto keeps it on the right edge.
  team: {
    color: '#e2e8f0',
    fontSize: 12,
    fontWeight: '700',
    flexShrink: 0,
    marginLeft: 'auto',
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  dotsMore: {
    color: '#9CA3AF',
    fontWeight: '600',
  },
});
