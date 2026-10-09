/**
 * ONE truth for "is this player coming?".
 *
 * Two tables answer that question and neither owns it:
 *   * cal_event_rsvps    -- the family speaking for itself (yes/no/pending)
 *   * event_attendance   -- a coach marking the headcount (present/absent/
 *                           late/excused)
 *
 * The old rule was positional: a coach mark always beat an RSVP, so a mark
 * from last week outranked an answer from five minutes ago and the reverse was
 * impossible. The rule here is LATEST ACTION WINS -- whichever row was touched
 * most recently is the answer, whoever wrote it. Both tables bump updated_at
 * on UPDATE via trigger, so the column is a true "when was this last said".
 *
 * This module is pure: no supabase, no React, no clock. It takes rows and
 * returns a verdict, which is what makes it testable and what keeps the roster
 * list and the Responses strip from drifting apart -- they both call it.
 *
 * It deliberately does NOT resolve which player an RSVP belongs to. That needs
 * the roster, the user_roles map and the parent-email bridge, all of which live
 * on the screen; the caller does that identification and hands the already
 * attributed rows in. See EventDetailScreen's resolvedRsvps memo.
 */

/** What the family can say. There is no Maybe: the DB CHECK rejects it. */
export type RsvpStatus = 'yes' | 'no' | 'pending';

/** What a coach can mark. late/excused have no UI but exist on older rows. */
export type CoachStatus = 'present' | 'absent' | 'late' | 'excused';

/** The single resolved answer every surface renders. */
export type EffectiveStatus = 'going' | 'cant_go' | 'no_reply';

/** Who said it. null only when nobody said anything. */
export type StatusSource = 'coach' | 'parent' | 'player' | null;

/**
 * One cal_event_rsvps row, already attributed to a player by the caller.
 *
 * `status` is typed loosely on purpose: it is read straight off the wire and
 * old rows can still carry values the product no longer has, such as the
 * retired Maybe. Anything unrecognised is treated as silence, never guessed.
 */
export interface ResolverRsvpRow {
  status: string | null | undefined;
  /** Bumped by trigger on every UPDATE. Falls back to responded_at on old rows. */
  updated_at?: string | null;
  responded_at?: string | null;
  decline_reason?: string | null;
  /**
   * 'player' when the responder's account IS this player, 'parent' otherwise.
   * Decided by the caller's roster identification -- never re-derived here.
   */
  source?: Exclude<StatusSource, 'coach' | null> | null;
}

/** The one event_attendance row for this player, if a coach has marked them. */
export interface ResolverAttendanceRow {
  status: string | null | undefined;
  updated_at?: string | null;
  created_at?: string | null;
}

export interface EffectiveStatusResult {
  status: EffectiveStatus;
  source: StatusSource;
  /** The winning row's timestamp, or null when we have no usable one. */
  at: string | null;
  /** The winner's decline reason. Only a family 'no' ever carries one. */
  reason: string | null;
}

const RSVP_TO_EFFECTIVE: Record<RsvpStatus, EffectiveStatus> = {
  yes: 'going',
  no: 'cant_go',
  pending: 'no_reply',
};

const COACH_TO_EFFECTIVE: Record<CoachStatus, EffectiveStatus> = {
  present: 'going',
  late: 'going',
  absent: 'cant_go',
  excused: 'cant_go',
};

/** Nobody has said anything. */
const NO_REPLY: EffectiveStatusResult = {
  status: 'no_reply',
  source: null,
  at: null,
  reason: null,
};

export function rsvpToEffective(status: string | null | undefined): EffectiveStatus {
  return RSVP_TO_EFFECTIVE[status as RsvpStatus] ?? 'no_reply';
}

export function coachToEffective(status: string | null | undefined): EffectiveStatus {
  return COACH_TO_EFFECTIVE[status as CoachStatus] ?? 'no_reply';
}

/**
 * Milliseconds for ordering, or null when there is nothing usable.
 *
 * A row with no timestamp (or an unparseable one) must not win on a coin
 * flip, so it sorts below every dated row instead.
 */
function timeOf(...candidates: (string | null | undefined)[]): number | null {
  for (const c of candidates) {
    if (!c) continue;
    const t = new Date(c).getTime();
    if (!Number.isNaN(t)) return t;
  }
  return null;
}

/** Internal: a dated verdict competing to be the answer. */
interface Candidate extends EffectiveStatusResult {
  /** null sorts below every real timestamp. */
  ms: number | null;
}

/**
 * Pick the most recent answer among every row that speaks for one player.
 *
 * @param rsvpRows      every cal_event_rsvps row attributed to this player.
 *                      More than one is normal: the family can hold both a
 *                      player_id row and a legacy null-player_id row, which
 *                      the UNIQUE (event_id, user_id, player_id) constraint
 *                      treats as different rows, and two parents of the same
 *                      player each own their own row.
 * @param attendanceRow this player's event_attendance row, if a coach marked
 *                      them.
 *
 * TIE RULE: on an exact timestamp tie -- including the case where neither side
 * has a usable timestamp -- the COACH wins. The coach is the one standing at
 * the field, and a deterministic rule beats a coin flip that would make the
 * roster flicker between refetches. Among RSVP rows tied with each other, the
 * first in the given order wins, so the caller's order decides and the result
 * is stable.
 */
export function resolveEffectiveStatus(
  rsvpRows: ResolverRsvpRow[] | null | undefined,
  attendanceRow: ResolverAttendanceRow | null | undefined
): EffectiveStatusResult {
  // The coach seeds the contest, so every later comparison needs to beat it
  // STRICTLY -- which is the tie rule, expressed as the order of the loop
  // rather than as a special case inside it.
  let best: Candidate | null = null;

  if (attendanceRow && attendanceRow.status) {
    best = {
      status: coachToEffective(attendanceRow.status),
      source: 'coach',
      at: attendanceRow.updated_at ?? attendanceRow.created_at ?? null,
      reason: null,
      ms: timeOf(attendanceRow.updated_at, attendanceRow.created_at),
    };
  }

  for (const row of rsvpRows ?? []) {
    if (!row) continue;
    const ms = timeOf(row.updated_at, row.responded_at);
    // Strictly greater: an equal timestamp leaves the incumbent (the coach, or
    // the earlier RSVP) in place. A row with no timestamp can only win when
    // nothing is in place yet.
    const beats =
      best === null ||
      (ms !== null && (best.ms === null || ms > best.ms));
    if (!beats) continue;

    const status = rsvpToEffective(row.status);
    best = {
      status,
      source: row.source ?? 'parent',
      at: row.updated_at ?? row.responded_at ?? null,
      // A reason only ever belongs to a "can't go"; a stale one on a yes is
      // noise the writer already nulls out, and this is the second guard.
      reason: status === 'cant_go' ? row.decline_reason ?? null : null,
      ms,
    };
  }

  if (best === null) return { ...NO_REPLY };

  return {
    status: best.status,
    source: best.source,
    at: best.at,
    reason: best.reason,
  };
}

/**
 * Roll resolved verdicts into the Responses strip.
 *
 * Counts one population with one rule, which is the whole point of the
 * resolver: the strip and the roster can no longer disagree. `markedByCoach`
 * is how many of those answers a coach supplied -- the muted line under the
 * strip, and the only place the override is visible as a number.
 */
export function summarizeEffective(
  results: EffectiveStatusResult[]
): { going: number; cantGo: number; noReply: number; markedByCoach: number } {
  let going = 0;
  let cantGo = 0;
  let noReply = 0;
  let markedByCoach = 0;

  for (const r of results) {
    if (r.status === 'going') going += 1;
    else if (r.status === 'cant_go') cantGo += 1;
    else noReply += 1;
    if (r.source === 'coach') markedByCoach += 1;
  }

  return { going, cantGo, noReply, markedByCoach };
}
