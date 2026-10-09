/**
 * Tests for the one-truth attendance resolver.
 *
 * Uses node:test + node:assert/strict, which ship with Node -- this repo has
 * no test runner and adding one would be a dependency change. Same pattern as
 * src/lib/eventChangeSummary.test.ts.
 *
 * Run (no repo changes, compiles to a temp dir with the repo's own tsc):
 *   npx tsc src/utils/attendanceResolver.ts src/utils/attendanceResolver.test.ts \
 *     --outDir /tmp/att --module commonjs --target es2020 --skipLibCheck \
 *     --strict --esModuleInterop
 *   node --test /tmp/att/attendanceResolver.test.js
 *
 * Point node at the FILE, not the directory -- `node --test <dir>` tries to
 * run the directory path itself as a test and reports an opaque failure.
 *
 * The cases that matter are the two override directions (the bug the old
 * positional "coach wins" rule had) and the tie.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveEffectiveStatus,
  summarizeEffective,
  type ResolverRsvpRow,
  type ResolverAttendanceRow,
} from './attendanceResolver';

const T1 = '2026-10-09T10:00:00.000Z';
const T2 = '2026-10-09T11:00:00.000Z';
const T3 = '2026-10-09T12:00:00.000Z';

const coachMark = (
  status: string,
  updated_at: string | null = T1
): ResolverAttendanceRow => ({ status, updated_at, created_at: updated_at });

const rsvp = (
  status: string,
  updated_at: string | null = T1,
  extra: Partial<ResolverRsvpRow> = {}
): ResolverRsvpRow => ({ status, updated_at, ...extra });

// --- no data ---------------------------------------------------------------

test('no candidates at all resolves to no_reply with no source', () => {
  assert.deepEqual(resolveEffectiveStatus([], null), {
    status: 'no_reply',
    source: null,
    at: null,
    reason: null,
  });
});

test('null and undefined inputs are tolerated, not thrown on', () => {
  assert.deepEqual(resolveEffectiveStatus(null, null), {
    status: 'no_reply',
    source: null,
    at: null,
    reason: null,
  });
  assert.deepEqual(resolveEffectiveStatus(undefined, undefined), {
    status: 'no_reply',
    source: null,
    at: null,
    reason: null,
  });
});

// --- one side only ---------------------------------------------------------

test('coach-only: present resolves to going, attributed to the coach', () => {
  assert.deepEqual(resolveEffectiveStatus([], coachMark('present')), {
    status: 'going',
    source: 'coach',
    at: T1,
    reason: null,
  });
});

test('coach-only: absent resolves to cant_go', () => {
  const r = resolveEffectiveStatus([], coachMark('absent'));
  assert.equal(r.status, 'cant_go');
  assert.equal(r.source, 'coach');
});

test('coach-only: legacy late counts as going and excused as cant_go', () => {
  assert.equal(resolveEffectiveStatus([], coachMark('late')).status, 'going');
  assert.equal(resolveEffectiveStatus([], coachMark('excused')).status, 'cant_go');
});

test('parent-only: yes resolves to going, attributed to the parent', () => {
  assert.deepEqual(resolveEffectiveStatus([rsvp('yes')], null), {
    status: 'going',
    source: 'parent',
    at: T1,
    reason: null,
  });
});

test('parent-only: no carries its decline reason through', () => {
  assert.deepEqual(
    resolveEffectiveStatus(
      [rsvp('no', T1, { decline_reason: 'Family trip' })],
      null
    ),
    { status: 'cant_go', source: 'parent', at: T1, reason: 'Family trip' }
  );
});

test('a reason on a yes is dropped -- only a cant_go carries one', () => {
  const r = resolveEffectiveStatus(
    [rsvp('yes', T1, { decline_reason: 'stale' })],
    null
  );
  assert.equal(r.status, 'going');
  assert.equal(r.reason, null);
});

test("the player's own account is attributed to 'player', not 'parent'", () => {
  const r = resolveEffectiveStatus([rsvp('yes', T1, { source: 'player' })], null);
  assert.equal(r.source, 'player');
});

test('pending is silence, but the retraction is still attributed', () => {
  const r = resolveEffectiveStatus([rsvp('pending')], null);
  assert.equal(r.status, 'no_reply');
  assert.equal(r.source, 'parent');
});

test('an unrecognised legacy status is treated as silence, never guessed', () => {
  assert.equal(resolveEffectiveStatus([rsvp('maybe')], null).status, 'no_reply');
  assert.equal(resolveEffectiveStatus([rsvp(null as any)], null).status, 'no_reply');
  assert.equal(resolveEffectiveStatus([], coachMark('tardy')).status, 'no_reply');
});

// --- the two override directions (the old positional rule got these wrong) --

test('parent after coach: the later family answer overrides the coach mark', () => {
  const r = resolveEffectiveStatus(
    [rsvp('yes', T2)],
    coachMark('absent', T1)
  );
  assert.equal(r.status, 'going');
  assert.equal(r.source, 'parent');
  assert.equal(r.at, T2);
});

test('coach after parent: the later coach mark overrides the family answer', () => {
  const r = resolveEffectiveStatus(
    [rsvp('yes', T1)],
    coachMark('absent', T2)
  );
  assert.equal(r.status, 'cant_go');
  assert.equal(r.source, 'coach');
  assert.equal(r.at, T2);
});

test('a coach mark no longer wins just for being a coach mark', () => {
  // The exact case the old precedence got wrong: a stale mark against a fresh
  // answer. Positional precedence returned cant_go here.
  const r = resolveEffectiveStatus(
    [rsvp('no', T3, { decline_reason: 'Sick' })],
    coachMark('present', T1)
  );
  assert.equal(r.status, 'cant_go');
  assert.equal(r.source, 'parent');
  assert.equal(r.reason, 'Sick');
});

// --- ties ------------------------------------------------------------------

test('tie on the exact same timestamp: the coach wins', () => {
  const r = resolveEffectiveStatus([rsvp('yes', T1)], coachMark('absent', T1));
  assert.equal(r.status, 'cant_go');
  assert.equal(r.source, 'coach');
});

test('tie with no usable timestamps on either side: the coach still wins', () => {
  const r = resolveEffectiveStatus(
    [rsvp('yes', null)],
    coachMark('absent', null)
  );
  assert.equal(r.status, 'cant_go');
  assert.equal(r.source, 'coach');
  assert.equal(r.at, null);
});

test('a dated row beats an undated one in both directions', () => {
  const coachDated = resolveEffectiveStatus(
    [rsvp('yes', null)],
    coachMark('absent', T1)
  );
  assert.equal(coachDated.source, 'coach');

  const rsvpDated = resolveEffectiveStatus(
    [rsvp('yes', T1)],
    coachMark('absent', null)
  );
  assert.equal(rsvpDated.source, 'parent');
  assert.equal(rsvpDated.status, 'going');
});

test('an unparseable timestamp is treated as missing, not as NaN ordering', () => {
  const r = resolveEffectiveStatus(
    [rsvp('yes', 'not-a-date')],
    coachMark('absent', T1)
  );
  assert.equal(r.source, 'coach');
});

test('responded_at stands in when updated_at is missing on an old row', () => {
  const r = resolveEffectiveStatus(
    [{ status: 'yes', updated_at: null, responded_at: T3 }],
    coachMark('absent', T1)
  );
  assert.equal(r.status, 'going');
  assert.equal(r.at, T3);
});

// --- several rows for one player -------------------------------------------

test('two parents disagree: the latest answer wins', () => {
  const r = resolveEffectiveStatus(
    [
      rsvp('yes', T1),
      rsvp('no', T3, { decline_reason: 'Dentist' }),
      rsvp('yes', T2),
    ],
    null
  );
  assert.equal(r.status, 'cant_go');
  assert.equal(r.at, T3);
  assert.equal(r.reason, 'Dentist');
});

test('two rows tied with each other: the first given wins, stably', () => {
  const rows = [rsvp('yes', T1), rsvp('no', T1)];
  assert.equal(resolveEffectiveStatus(rows, null).status, 'going');
  // Same input, same answer -- no dependence on result-set order beyond the
  // caller's own ordering.
  assert.equal(resolveEffectiveStatus(rows, null).status, 'going');
});

test('null-player row and player_id row for one player: latest wins', () => {
  // The schema's UNIQUE (event_id, user_id, player_id) with NULLS NOT DISTINCT
  // lets one family hold BOTH a legacy null-player_id row and a player_id row.
  // The caller maps both onto the same player (user -> child mapping), so the
  // resolver must treat them as two answers from the same side.
  const legacyNullPlayer = rsvp('yes', T1);
  const withPlayerId = rsvp('no', T2, { decline_reason: 'Injured' });

  const r = resolveEffectiveStatus([legacyNullPlayer, withPlayerId], null);
  assert.equal(r.status, 'cant_go');
  assert.equal(r.reason, 'Injured');
  assert.equal(r.at, T2);

  // And the other way round: the legacy row is the fresher one.
  const r2 = resolveEffectiveStatus(
    [rsvp('yes', T3), rsvp('no', T1)],
    null
  );
  assert.equal(r2.status, 'going');
  assert.equal(r2.at, T3);
});

test('a coach mark competes against the newest of several rsvp rows, not the first', () => {
  const r = resolveEffectiveStatus(
    [rsvp('yes', T1), rsvp('yes', T3)],
    coachMark('absent', T2)
  );
  assert.equal(r.status, 'going');
  assert.equal(r.source, 'parent');
  assert.equal(r.at, T3);
});

// --- the strip -------------------------------------------------------------

test('summarizeEffective buckets every verdict once and counts coach marks', () => {
  const s = summarizeEffective([
    { status: 'going', source: 'coach', at: T1, reason: null },
    { status: 'going', source: 'parent', at: T1, reason: null },
    { status: 'cant_go', source: 'coach', at: T1, reason: null },
    { status: 'no_reply', source: null, at: null, reason: null },
    { status: 'no_reply', source: 'parent', at: T1, reason: null },
  ]);
  assert.deepEqual(s, { going: 2, cantGo: 1, noReply: 2, markedByCoach: 2 });
});

test('summarizeEffective on an empty roster is all zeroes', () => {
  assert.deepEqual(summarizeEffective([]), {
    going: 0,
    cantGo: 0,
    noReply: 0,
    markedByCoach: 0,
  });
});
