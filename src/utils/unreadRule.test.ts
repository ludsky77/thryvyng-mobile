/**
 * Tests for THE unread rule (PARITY SPEC v2).
 *
 * node:test + node:assert/strict, same pattern as the other suites here (this
 * repo has no test runner and adding one would be a dependency change).
 *
 * Run (no repo changes, compiles to a temp dir with the repo's own tsc):
 *   npx tsc src/utils/unreadRule.ts src/utils/unreadRule.test.ts \
 *     --outDir /tmp/ur --module commonjs --target es2020 --skipLibCheck \
 *     --strict --esModuleInterop
 *   node --test /tmp/ur/unreadRule.test.js
 *
 * Point node at the FILE, not the directory -- `node --test <dir>` tries to
 * run the .ts sources too and fails.
 *
 * The case that drove v2 is `is_test + archived`: v1 bucketed a test team as
 * "hidden" and COUNTED it even once retired. v2 retires it like any other team.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyConversationRows,
  countsTowardUnread,
  isPastTeamChannel,
  isQuietChannel,
  isRetiredTeam,
  type TeamLifecycleFacts,
} from './unreadRule';

/** The lookup is structural, so a plain Map is a valid TeamLifecycleLookup. */
const TEAMS = new Map<string, TeamLifecycleFacts>([
  ['active', { team_status: 'active', is_test: false }],
  ['test-active', { team_status: 'active', is_test: true }],
  ['null-status', { team_status: null, is_test: false }],
  ['weird-status', { team_status: 'mothballed', is_test: false }],
  ['retired-archived', { team_status: 'archived', is_test: false }],
  ['retired-inactive', { team_status: 'inactive', is_test: false }],
  ['test-retired', { team_status: 'archived', is_test: true }],
]);

const live = (team_id: string | null) => ({ team_id, is_archived: false });

// ---------------------------------------------------------------- COUNTS

test('active team -> counts', () => {
  assert.equal(countsTowardUnread(live('active'), TEAMS), true);
});

test('is_test team that is still active -> counts', () => {
  assert.equal(countsTowardUnread(live('test-active'), TEAMS), true);
});

test('null team_status -> counts', () => {
  assert.equal(countsTowardUnread(live('null-status'), TEAMS), true);
});

test('unknown team_status value -> counts', () => {
  assert.equal(countsTowardUnread(live('weird-status'), TEAMS), true);
});

test('team_id the client has no record for -> counts', () => {
  assert.equal(countsTowardUnread(live('never-heard-of-it'), TEAMS), true);
  // and an empty lookup must not silence everything
  assert.equal(countsTowardUnread(live('active'), new Map()), true);
});

test('no team at all (DM / group chat) -> counts', () => {
  assert.equal(countsTowardUnread(live(null), TEAMS), true);
  assert.equal(countsTowardUnread({ is_archived: false }, TEAMS), true);
});

test('mute is not part of the rule -- a muted channel is indistinguishable here', () => {
  // is_muted is not a field the predicate accepts, so it cannot affect the answer.
  assert.equal(countsTowardUnread(live('active'), TEAMS), true);
});

// ----------------------------------------------------------------- QUIET

test("team_status 'archived' -> quiet", () => {
  assert.equal(countsTowardUnread(live('retired-archived'), TEAMS), false);
  assert.equal(isQuietChannel(live('retired-archived'), TEAMS), true);
});

test("team_status 'inactive' -> quiet", () => {
  assert.equal(countsTowardUnread(live('retired-inactive'), TEAMS), false);
  assert.equal(isQuietChannel(live('retired-inactive'), TEAMS), true);
});

test("is_test team that IS retired -> quiet (this is the v1 -> v2 change)", () => {
  assert.equal(countsTowardUnread(live('test-retired'), TEAMS), false);
  assert.equal(isQuietChannel(live('test-retired'), TEAMS), true);
});

test('archived channel -> quiet, whatever its team is', () => {
  for (const teamId of [null, 'active', 'test-active', 'retired-archived']) {
    assert.equal(
      countsTowardUnread({ team_id: teamId, is_archived: true }, TEAMS),
      false,
      `team_id=${teamId}`
    );
  }
});

test('null / undefined is_archived is not archived', () => {
  assert.equal(countsTowardUnread({ team_id: 'active', is_archived: null }, TEAMS), true);
  assert.equal(countsTowardUnread({ team_id: 'active' }, TEAMS), true);
});

// ------------------------------------------------------- PAST SECTION

test('an archived channel is never "past" -- it is listed nowhere', () => {
  assert.equal(
    isPastTeamChannel({ team_id: 'retired-archived', is_archived: true }, TEAMS),
    false
  );
});

test('a retired-team channel is "past"', () => {
  assert.equal(isPastTeamChannel(live('retired-archived'), TEAMS), true);
  assert.equal(isPastTeamChannel(live('retired-inactive'), TEAMS), true);
  assert.equal(isPastTeamChannel(live('test-retired'), TEAMS), true);
});

test('isRetiredTeam ignores is_test and tolerates a missing record', () => {
  assert.equal(isRetiredTeam(undefined), false);
  assert.equal(isRetiredTeam(null), false);
  assert.equal(isRetiredTeam({}), false);
  assert.equal(isRetiredTeam({ team_status: 'archived', is_test: true }), true);
  assert.equal(isRetiredTeam({ team_status: 'archived', is_test: false }), true);
  assert.equal(isRetiredTeam({ team_status: 'active', is_test: true }), false);
});

// -------------------------------------------------- PARTITION PROPERTY

test('among non-archived rows, main list is the exact complement of Past', () => {
  const rows = [
    { channel_id: 'a', team_id: 'active', is_archived: false },
    { channel_id: 'b', team_id: 'test-active', is_archived: false },
    { channel_id: 'c', team_id: 'null-status', is_archived: false },
    { channel_id: 'd', team_id: 'weird-status', is_archived: false },
    { channel_id: 'e', team_id: 'never-heard-of-it', is_archived: false },
    { channel_id: 'f', team_id: null, is_archived: false },
    { channel_id: 'g', team_id: 'retired-archived', is_archived: false },
    { channel_id: 'h', team_id: 'retired-inactive', is_archived: false },
    { channel_id: 'i', team_id: 'test-retired', is_archived: false },
    { channel_id: 'j', team_id: 'active', is_archived: true },
    { channel_id: 'k', team_id: 'retired-archived', is_archived: true },
  ];

  const main = rows.filter((r) => countsTowardUnread(r, TEAMS)).map((r) => r.channel_id);
  const past = rows.filter((r) => isPastTeamChannel(r, TEAMS)).map((r) => r.channel_id);

  assert.deepEqual(main, ['a', 'b', 'c', 'd', 'e', 'f']);
  assert.deepEqual(past, ['g', 'h', 'i']);

  // No row is in both lists.
  assert.deepEqual(main.filter((id) => past.includes(id)), []);

  // Every non-archived row lands in exactly one of the two.
  const nonArchived = rows.filter((r) => !r.is_archived).map((r) => r.channel_id);
  assert.deepEqual([...main, ...past].sort(), [...nonArchived].sort());

  // Archived rows land in neither.
  for (const id of ['j', 'k']) {
    assert.equal(main.includes(id) || past.includes(id), false, id);
  }
});

// ------------------------------------------- classifyConversationRows
//
// The simulator FAIL was the tab badge and the list disagreeing. The guarantee
// that makes that impossible is that `total` is produced by the same pass that
// produces `mainRows`, so these tests pin that relationship rather than just
// the arithmetic.

const row = (
  channel_id: string,
  team_id: string | null,
  unread_count: number,
  is_archived = false
) => ({ channel_id, team_id, unread_count, is_archived });

test('total is exactly the sum of unread over mainRows', () => {
  const rows = [
    row('a', 'active', 2),
    row('b', 'test-active', 3),
    row('c', null, 5),
    row('g', 'retired-archived', 40), // past: listed, not counted
    row('j', 'active', 70, true), // archived: neither
  ];
  const { mainRows, pastRows, total } = classifyConversationRows(rows, TEAMS);

  assert.deepEqual(mainRows.map((r) => r.channel_id), ['a', 'b', 'c']);
  assert.deepEqual(pastRows.map((r) => r.channel_id), ['g']);
  assert.equal(total, 10);
  // The invariant, stated directly:
  assert.equal(
    total,
    mainRows.reduce((sum, r) => sum + r.unread_count, 0)
  );
});

test('a retired team contributes nothing to the total but is still listed', () => {
  const { pastRows, total } = classifyConversationRows(
    [row('g', 'retired-archived', 99), row('i', 'test-retired', 7)],
    TEAMS
  );
  assert.equal(total, 0);
  assert.deepEqual(pastRows.map((r) => r.channel_id), ['g', 'i']);
});

test('archived channels are dropped from both lists and from the total', () => {
  const { mainRows, pastRows, total } = classifyConversationRows(
    [row('j', 'active', 12, true), row('k', 'retired-archived', 8, true)],
    TEAMS
  );
  assert.deepEqual(mainRows, []);
  assert.deepEqual(pastRows, []);
  assert.equal(total, 0);
});

test('rows with no channel_id are ignored', () => {
  const { mainRows, total } = classifyConversationRows(
    [{ channel_id: null, team_id: 'active', unread_count: 9 }, row('a', 'active', 1)],
    TEAMS
  );
  assert.deepEqual(mainRows.map((r) => r.channel_id), ['a']);
  assert.equal(total, 1);
});

test('absent, null and negative unread_count never move the total', () => {
  const { total } = classifyConversationRows(
    [
      { channel_id: 'a', team_id: 'active' },
      { channel_id: 'b', team_id: 'active', unread_count: null },
      { channel_id: 'c', team_id: 'active', unread_count: -4 },
      row('d', 'active', 6),
    ],
    TEAMS
  );
  assert.equal(total, 6);
});

test('null / undefined / empty input is a clean zero, not a throw', () => {
  for (const input of [null, undefined, []]) {
    const { mainRows, pastRows, total } = classifyConversationRows(input, TEAMS);
    assert.deepEqual(mainRows, []);
    assert.deepEqual(pastRows, []);
    assert.equal(total, 0);
  }
});

test('an empty lifecycle map counts everything -- it never silences a row', () => {
  // This is the teams-load-failure shape. The provider holds its last good
  // state rather than recomputing like this, but if it ever did, the rule must
  // fail toward "visible and counted", never toward a hidden number.
  const { mainRows, pastRows, total } = classifyConversationRows(
    [row('g', 'retired-archived', 4), row('a', 'active', 1)],
    new Map()
  );
  assert.deepEqual(mainRows.map((r) => r.channel_id), ['g', 'a']);
  assert.deepEqual(pastRows, []);
  assert.equal(total, 5);
});
