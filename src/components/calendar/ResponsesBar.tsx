import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { RSVP_TOKENS } from './RsvpPill';

/**
 * Design "F1 -- one ticket" (Lu, Oct 26): the compact replacement for the
 * three big Responses numbers, now a row inside the event card.
 *
 * Same data as before -- the caller passes the resolver's own verdict counts
 * (`summarizeEffective`), so this cannot disagree with the Attendance tab. It
 * only draws: a count line, a 6pt stacked bar, and a legend.
 *
 * Palette round 2 (Lu, Oct 26): going = brand purple, can't go = slate, no
 * reply = the near-black track showing through. No green, no red -- red is
 * reserved for destructive actions.
 */
export default function ResponsesBar({
  rosterCount,
  going,
  cant,
  noReply,
  markedByCoach,
}: {
  rosterCount: number;
  going: number;
  cant: number;
  noReply: number;
  markedByCoach?: number;
}) {
  const answered = going + cant;
  // Bar denominator is the counted verdicts, not the roster: an answer from
  // somebody no longer on the roster is still an answer, and dividing by the
  // roster would push the segments past 100%.
  const total = going + cant + noReply;
  // Typed as a percentage literal so it satisfies RN's `DimensionValue`.
  const pct = (n: number): `${number}%` =>
    total > 0 ? `${(n / total) * 100}%` : '0%';

  return (
    <View>
      <Text style={styles.countLine}>
        {`${rosterCount} on the roster  ·  ${answered} answered`}
      </Text>

      <View style={styles.bar}>
        {going > 0 ? (
          <View
            style={[
              styles.segment,
              { width: pct(going), backgroundColor: RSVP_TOKENS.accent },
            ]}
          />
        ) : null}
        {cant > 0 ? (
          <View
            style={[
              styles.segment,
              { width: pct(cant), backgroundColor: RSVP_TOKENS.slateBorder },
            ]}
          />
        ) : null}
      </View>

      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.swatch, { backgroundColor: RSVP_TOKENS.accent }]} />
          <Text style={styles.legendText}>{going} Going</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.swatch, { backgroundColor: RSVP_TOKENS.slateBorder }]} />
          <Text style={styles.legendText}>{cant} Can't go</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.swatch, styles.swatchNoReply]} />
          <Text style={styles.legendText}>{noReply} No reply</Text>
        </View>
      </View>

      {/* Provenance, not a fourth bucket -- these rows are already inside
          Going and Can't go. Carried over verbatim from the old card. */}
      {markedByCoach ? (
        <Text style={styles.coachNote}>{markedByCoach} marked by coach</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  countLine: {
    color: '#94a3b8',
    fontSize: 13,
    marginBottom: 8,
  },
  // The track itself is the "no reply" remainder; the two answered segments
  // are drawn over it from the left.
  bar: {
    flexDirection: 'row',
    height: 6,
    borderRadius: 3,
    backgroundColor: RSVP_TOKENS.track,
    overflow: 'hidden',
  },
  segment: {
    height: 6,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    marginTop: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  swatch: {
    width: 9,
    height: 9,
    borderRadius: 2,
  },
  swatchNoReply: {
    backgroundColor: RSVP_TOKENS.track,
  },
  legendText: {
    color: '#94a3b8',
    fontSize: 13,
  },
  coachNote: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 8,
  },
});
