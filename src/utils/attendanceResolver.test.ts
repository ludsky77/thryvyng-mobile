/**
 * Tests for the pure half of the one-source attendance read
 * (src/utils/attendanceResolver.ts, wired up by src/hooks/useEventAttendance.ts).
 *
 * The latest-mark-wins / coach-tie / NULL-row rules that used to be tested here
 * moved into the prod SQL functions on 2026-11-09 and are proven there (web
 * repo docs/recon/attendance-fn-nov09.md, T1-T9). What is left on the client,
 * and tested here, is: counts can never exceed the roster, a failed or slow
 * read settles to an empty/error state (never "loading"), and a multi-kid
 * parent gets one control per child.
 *
 * Uses node:test + node:assert/strict, which ship with Node -- this repo has
 * no test runner and adding one would be a dependency change.
 *
 * Run (no repo changes, compiles to a temp dir with the repo's own tsc):
 *   npx tsc src/utils/attendanceResolver.ts src/utils/attendanceResolver.test.ts \
 *     --outDir /tmp/att --module commonjs --target es2020 --skipLibCheck \
 *     --strict --esModuleInterop
 *   node --test /tmp/att/attendanceResolver.test.js
 *
 * Point node at the FILE, not the directory.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AttendanceTimeoutError,
  attributionLabel,
  mergeOwnReasons,
  headcountFromRows,
  loadAttendanceCounts,
  loadEventAttendance,
  myAnswerRows,
  normalizeAttendanceRows,
  normalizeCounts,
  pillStatusFor,
  withTimeout,
  type EventAttendanceRow,
} from './attendanceResolver';

const row = (
  player_id: string,
  status: string,
  source: string | null = null,
  extra: Record<string, unknown> = {}
) => ({
  player_id,
  first_name: `F${player_id}`,
  last_name: `L${player_id}`,
  status,
  source,
  marked_at: source ? '2026-11-07T22:00:00Z' : null,
  marked_by_name: null,
  decline_reason: null,
  ...extra,
});

/** The Shooters game as the function returned it in T1/T2: 10 / 2 / 3 of 15. */
const SHOOTERS = [
  ...Array.from({ length: 10 }, (_, i) => row(`g${i}`, 'going', i < 4 ? 'player' : 'parent')),
  row('c0', 'cant_go', 'player'),
  row('c1', 'cant_go', 'parent'),
  row('n0', 'no_reply'),
  row('n1', 'no_reply'),
  row('n2', 'no_reply'),
];

const never = () => new Promise<never>(() => {});

// --- count <= roster -------------------------------------------------------

test('headcount: Shooters reads 10 / 2 / 3 on a roster of 15', () => {
  const h = headcountFromRows(normalizeAttendanceRows(SHOOTERS));
  assert.deepEqual(h, { roster: 15, going: 10, cantGo: 2, noReply: 3, markedByCoach: 0 });
});

test('headcount: going + cant + no reply always equals the roster, never more', () => {
  const statuses = ['going', 'cant_go', 'no_reply', 'maybe', null, 'yes'];
  for (let n = 0; n < 40; n += 1) {
    const rows = Array.from({ length: n }, (_, i) =>
      row(`p${i}`, statuses[i % statuses.length] as string)
    );
    const h = headcountFromRows(normalizeAttendanceRows(rows));
    assert.equal(h.roster, n);
    assert.equal(h.going + h.cantGo + h.noReply, h.roster);
    assert.ok(h.going <= h.roster && h.cantGo <= h.roster && h.noReply >= 0);
  }
});

test('headcount: a duplicated player_id is ONE player, not a second vote', () => {
  const rows = normalizeAttendanceRows([row('a', 'going'), row('a', 'going'), row('b', 'cant_go')]);
  const h = headcountFromRows(rows);
  assert.equal(h.roster, 2);
  assert.equal(h.going, 1);
});

test('headcount: coach marks are counted as provenance, inside going / cant go', () => {
  const h = headcountFromRows(
    normalizeAttendanceRows([row('a', 'going', 'coach'), row('b', 'cant_go', 'coach'), row('c', 'going', 'parent')])
  );
  assert.equal(h.markedByCoach, 2);
  assert.equal(h.going + h.cantGo + h.noReply, 3);
});

test('normalize: unknown status is silence (there is no Maybe); bad rows are dropped', () => {
  const rows = normalizeAttendanceRows([
    row('a', 'maybe'),
    { first_name: 'no id', status: 'going' },
    null,
    'junk',
    row('b', 'going', 'grandma'),
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].status, 'no_reply');
  assert.equal(rows[1].source, null);
  assert.deepEqual(normalizeAttendanceRows(null), []);
  assert.deepEqual(normalizeAttendanceRows({ not: 'an array' }), []);
});

test('normalize: private fields pass through only when the function sent them', () => {
  const [staffView] = normalizeAttendanceRows([
    row('a', 'cant_go', 'parent', { marked_by_name: 'Paula Q', decline_reason: 'Sick' }),
  ]);
  const [parentView] = normalizeAttendanceRows([row('a', 'cant_go', 'parent')]);
  assert.equal(staffView.marked_by_name, 'Paula Q');
  assert.equal(staffView.decline_reason, 'Sick');
  assert.equal(parentView.marked_by_name, null);
  assert.equal(parentView.decline_reason, null);
});

test('counts: a drifted counts row is capped so nothing exceeds the roster', () => {
  const m = normalizeCounts([
    { event_id: 'e1', roster: 15, going: 10, cant_go: 2, no_reply: 3 },
    // what the old raw tally produced on Shooters: 14 + 2 > 15
    { event_id: 'e2', roster: 15, going: 14, cant_go: 2, no_reply: 0 },
    { event_id: 'e3', roster: 0, going: 4, cant_go: 1, no_reply: 0 },
    { event_id: 'e4', roster: '30', going: '12', cant_go: '9', no_reply: '9' },
    { roster: 5 },
  ]);
  assert.deepEqual(m.get('e1'), { event_id: 'e1', roster: 15, going: 10, cant_go: 2, no_reply: 3 });
  assert.deepEqual(m.get('e2'), { event_id: 'e2', roster: 15, going: 14, cant_go: 1, no_reply: 0 });
  assert.deepEqual(m.get('e3'), { event_id: 'e3', roster: 0, going: 0, cant_go: 0, no_reply: 0 });
  assert.deepEqual(m.get('e4'), { event_id: 'e4', roster: 30, going: 12, cant_go: 9, no_reply: 9 });
  assert.equal(m.size, 4);
  for (const c of m.values()) {
    assert.equal(c.going + c.cant_go + c.no_reply, c.roster);
  }
});

// --- error -> empty state, never loading -----------------------------------

test('load: rows -> ready', async () => {
  const r = await loadEventAttendance(async () => ({ data: SHOOTERS, error: null }));
  assert.equal(r.state, 'ready');
  assert.equal(r.rows.length, 15);
});

test('load: zero rows (not on the team) -> empty, not error', async () => {
  const r = await loadEventAttendance(async () => ({ data: [], error: null }));
  assert.equal(r.state, 'empty');
  assert.deepEqual(r.rows, []);
});

test('load: an RPC error -> error state with no rows', async () => {
  const r = await loadEventAttendance(async () => ({ data: null, error: { message: 'boom' } }));
  assert.equal(r.state, 'error');
  assert.deepEqual(r.rows, []);
});

test('load: a thrown request -> error state, never throws', async () => {
  const r = await loadEventAttendance(async () => {
    throw new Error('network down');
  });
  assert.equal(r.state, 'error');
  assert.deepEqual(r.rows, []);
});

test('load: a request that never settles times out -> error, and the signal aborts', async () => {
  let seen: AbortSignal | null = null;
  const r = await loadEventAttendance((signal) => {
    seen = signal;
    return never();
  }, 30);
  assert.equal(r.state, 'error');
  assert.ok(r.error instanceof AttendanceTimeoutError);
  assert.equal((seen as AbortSignal | null)?.aborted, true);
});

test('counts load: failure -> ok:false and NO counts (not zeros)', async () => {
  const failed = await loadAttendanceCounts(async () => ({ data: null, error: { message: 'x' } }));
  assert.equal(failed.ok, false);
  assert.equal(failed.counts.size, 0);
  const slow = await loadAttendanceCounts(() => never(), 30);
  assert.equal(slow.ok, false);
  assert.equal(slow.counts.size, 0);
});

test('withTimeout: a fast request resolves and leaves the signal alone', async () => {
  let seen: AbortSignal | null = null;
  const v = await withTimeout(async (signal) => {
    seen = signal;
    return 7;
  }, 1000);
  assert.equal(v, 7);
  assert.equal((seen as AbortSignal | null)?.aborted, false);
});

// --- multi-kid -> per-child controls ---------------------------------------

test('my rows: a multi-kid parent gets one control per child, each with its player_id', () => {
  const rows: EventAttendanceRow[] = normalizeAttendanceRows(SHOOTERS);
  const mine = myAnswerRows(rows, ['g1', 'c0']);
  assert.deepEqual(
    mine.map((r) => r.player_id),
    ['g1', 'c0']
  );
  assert.ok(mine.every((r) => typeof r.player_id === 'string' && r.player_id.length > 0));
});

test('my rows: staff / no linked player -> no control; off-roster link -> no control', () => {
  const rows = normalizeAttendanceRows(SHOOTERS);
  assert.deepEqual(myAnswerRows(rows, []), []);
  assert.deepEqual(myAnswerRows(rows, ['not-on-this-roster']), []);
  assert.deepEqual(myAnswerRows([], ['g1']), []);
});

test('pill status: the one effective status in the family vocabulary', () => {
  assert.equal(pillStatusFor('going'), 'yes');
  assert.equal(pillStatusFor('cant_go'), 'no');
  assert.equal(pillStatusFor('no_reply'), null);
});

// --- labels (3b-2) ---------------------------------------------------------

test('label: no_reply shows NO "by ..." label, whatever the source', () => {
  for (const source of ['parent', 'player', 'coach', null]) {
    const [r] = normalizeAttendanceRows([
      row('a', 'no_reply', source, { marked_by_name: 'Paula Quintero' }),
    ]);
    assert.equal(attributionLabel(r), null, `source ${source}`);
  }
});

test('label: marked rows carry the source, plus the name only when returned', () => {
  const [parent, coach, player, staffView, coachNamed] = normalizeAttendanceRows([
    row('a', 'going', 'parent'),
    row('b', 'cant_go', 'coach'),
    row('c', 'going', 'player'),
    row('d', 'cant_go', 'parent', { marked_by_name: 'Paula Quintero' }),
    row('e', 'going', 'coach', { marked_by_name: 'Lu Sanchez' }),
  ]);
  assert.equal(attributionLabel(parent), 'by parent');
  assert.equal(attributionLabel(coach), 'by coach');
  assert.equal(attributionLabel(player), 'by player');
  assert.equal(attributionLabel(staffView), 'by parent · Paula Q.');
  assert.equal(attributionLabel(coachNamed), 'by coach · Lu');
});

// --- own decline reason (3b-2) ---------------------------------------------

const AT = '2026-11-07T22:30:00.000Z';
const EARLIER = '2026-11-07T20:00:00.000Z';

test('own reason: my own cant_go row gets the reason from MY cal_event_rsvps row', () => {
  const rows = normalizeAttendanceRows([
    row('kid', 'cant_go', 'parent', { marked_at: AT }),
    row('mate', 'cant_go', 'parent', { marked_at: AT }),
  ]);
  const merged = mergeOwnReasons(
    rows,
    [{ player_id: 'kid', status: 'no', decline_reason: 'Tournament', updated_at: AT, responded_at: EARLIER }],
    ['kid']
  );
  assert.equal(merged[0].decline_reason, 'Tournament');
});

test("own reason: a teammate's row keeps NO reason (function returned NULL to non-staff)", () => {
  const rows = normalizeAttendanceRows([
    row('kid', 'cant_go', 'parent', { marked_at: AT }),
    row('mate', 'cant_go', 'parent', { marked_at: AT }),
  ]);
  const merged = mergeOwnReasons(
    rows,
    // even a row of mine that names the teammate cannot leak onto them
    [
      { player_id: 'kid', status: 'no', decline_reason: 'Tournament', updated_at: AT },
      { player_id: 'mate', status: 'no', decline_reason: 'not mine to show', updated_at: AT },
    ],
    ['kid']
  );
  assert.equal(merged[1].decline_reason, null);
  assert.equal(merged[1], rows[1], 'teammate row returned untouched');
});

test('own reason: multi-kid parent -- each child gets only its own reason; NULL rows ignored', () => {
  const rows = normalizeAttendanceRows([
    row('k1', 'cant_go', 'parent', { marked_at: AT }),
    row('k2', 'cant_go', 'parent', { marked_at: AT }),
  ]);
  const merged = mergeOwnReasons(
    rows,
    [
      { player_id: 'k1', status: 'no', decline_reason: 'Sick', updated_at: AT },
      { player_id: null, status: 'no', decline_reason: 'ambiguous legacy row', updated_at: AT },
    ],
    ['k1', 'k2']
  );
  assert.equal(merged[0].decline_reason, 'Sick');
  assert.equal(merged[1].decline_reason, null);
});

test('own reason: a legacy NULL row counts for my only child (same as the SQL)', () => {
  const rows = normalizeAttendanceRows([row('kid', 'cant_go', 'parent', { marked_at: AT })]);
  const merged = mergeOwnReasons(
    rows,
    [{ player_id: null, status: 'no', decline_reason: 'Trip', responded_at: AT }],
    ['kid']
  );
  assert.equal(merged[0].decline_reason, 'Trip');
});

test('own reason: not merged when a coach mark or another answer won, or I later said yes', () => {
  const mineNo = { player_id: 'kid', status: 'no', decline_reason: 'Sick', updated_at: EARLIER };
  const [coachWon] = normalizeAttendanceRows([row('kid', 'cant_go', 'coach', { marked_at: AT })]);
  assert.equal(mergeOwnReasons([coachWon], [mineNo], ['kid'])[0].decline_reason, null);

  // the other parent's later "no" is the winner -- my older reason is not theirs
  const [otherWon] = normalizeAttendanceRows([row('kid', 'cant_go', 'parent', { marked_at: AT })]);
  assert.equal(mergeOwnReasons([otherWon], [mineNo], ['kid'])[0].decline_reason, null);

  const [going] = normalizeAttendanceRows([row('kid', 'going', 'parent', { marked_at: AT })]);
  const mineYes = { player_id: 'kid', status: 'yes', decline_reason: null, updated_at: AT };
  assert.equal(mergeOwnReasons([going], [mineYes, mineNo], ['kid'])[0].decline_reason, null);
});

test('own reason: a reason the function already returned (staff) is never overwritten', () => {
  const [r] = normalizeAttendanceRows([
    row('kid', 'cant_go', 'parent', { marked_at: AT, decline_reason: 'From the function' }),
  ]);
  const merged = mergeOwnReasons(
    [r],
    [{ player_id: 'kid', status: 'no', decline_reason: 'Mine', updated_at: AT }],
    ['kid']
  );
  assert.equal(merged[0].decline_reason, 'From the function');
});
