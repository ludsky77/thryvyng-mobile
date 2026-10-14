/**
 * Phase C smoke: the four pure decisions the build rests on.
 *
 * node:test + node:assert/strict, same pattern as the other suites here (this
 * repo has no test runner and adding one would be a dependency change):
 *   npx tsc src/lib/chatHelpers.ts src/lib/chatHelpers.test.ts \
 *     src/utils/chatDays.ts --outDir /tmp/phasec --module commonjs \
 *     --target es2020 --skipLibCheck --strict --esModuleInterop
 *   node --test /tmp/phasec/lib/chatHelpers.test.js
 *
 * (A bare directory is not a valid target on Node 24 -- it throws
 * MODULE_NOT_FOUND. Point it at the compiled file.)
 *
 * The day-divider cases want a NON-UTC timezone or they are vacuous:
 *   TZ=America/Denver node --test /tmp/phasec/lib/chatHelpers.test.js
 *
 * Only pure modules are imported. Nothing here touches supabase or React
 * Native, which is why the logic lives in chatHelpers/chatDays and the screens
 * only call it.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMemberInserts,
  buildRoleMap,
  chatNameOnEdit,
  chatNameOnGroupChange,
  checkedRecipientIds,
  filterByNameQuery,
  formatRoleLabel,
  initialChatName,
  isWholeGroupChecked,
  matchesNameQuery,
  pickHighestRole,
  resolveChatName,
  resolveRoleLabel,
  roleChipGroup,
  selectAllLabel,
  toggleWholeGroup,
} from './chatHelpers';
import { invertedDayDividerIndices } from '../utils/chatDays';

// === 1. Role-label tie-break ===============================================
// The audit's item 6: ChatInfoScreen built `new Map(rows.map(...))`, which
// keeps the LAST duplicate key, over a read with no ORDER BY. Two staff rows
// for one person therefore produced whichever label came back second.

test('tie-break: head_coach beats team_manager', () => {
  assert.equal(pickHighestRole(['head_coach', 'team_manager']), 'head_coach');
});

test('tie-break: ORDER-INDEPENDENT -- the reversed rows give the same answer', () => {
  // This is the whole bug. Both orders must agree.
  assert.equal(pickHighestRole(['head_coach', 'team_manager']), 'head_coach');
  assert.equal(pickHighestRole(['team_manager', 'head_coach']), 'head_coach');
});

test('tie-break: Cole Coachman reads "Head Coach" either way round', () => {
  assert.equal(resolveRoleLabel(['head_coach', 'team_manager']), 'Head Coach');
  assert.equal(resolveRoleLabel(['team_manager', 'head_coach']), 'Head Coach');
});

test('tie-break: assistant_coach beats team_manager, parent loses to both', () => {
  assert.equal(
    pickHighestRole(['parent', 'team_manager', 'assistant_coach']),
    'assistant_coach'
  );
  assert.equal(pickHighestRole(['parent', 'team_manager']), 'team_manager');
});

test('tie-break: a coach who is also a parent files as the coach', () => {
  assert.equal(resolveRoleLabel(['parent', 'head_coach']), 'Head Coach');
});

test('tie-break: equal priority is still deterministic, not row-order', () => {
  // Two unknown roles both score 0. Whatever the rule, it must not depend on
  // the order they arrived in.
  const a = pickHighestRole(['zzz_unknown', 'aaa_unknown']);
  const b = pickHighestRole(['aaa_unknown', 'zzz_unknown']);
  assert.equal(a, b);
});

test('tie-break: nothing known -> null, and an empty label', () => {
  assert.equal(pickHighestRole([]), null);
  assert.equal(pickHighestRole([null, undefined, '']), null);
  assert.equal(resolveRoleLabel([]), '');
});

test('tie-break: an unranked role still beats no label at all', () => {
  assert.equal(pickHighestRole(['registrar']), 'registrar');
});

test('buildRoleMap: merges user_roles and team_staff, both column spellings', () => {
  const map = buildRoleMap(
    [{ user_id: 'cole', role: 'team_manager' }],
    [{ user_id: 'cole', staff_role: 'head_coach' }]
  );
  assert.equal(map.get('cole'), 'head_coach');
});

test('buildRoleMap: order-independent across the two row sets', () => {
  const forward = buildRoleMap(
    [{ user_id: 'cole', role: 'team_manager' }],
    [{ user_id: 'cole', staff_role: 'head_coach' }]
  );
  const reverse = buildRoleMap(
    [{ user_id: 'cole', staff_role: 'head_coach' }],
    [{ user_id: 'cole', role: 'team_manager' }]
  );
  assert.equal(forward.get('cole'), reverse.get('cole'));
});

test('buildRoleMap: two team_staff rows on ONE team, both orders agree', () => {
  // Exactly the ChatInfoScreen read: .select('user_id, staff_role')
  // .eq('team_id', teamId) with no ORDER BY.
  const rowsA = [
    { user_id: 'cole', staff_role: 'head_coach' },
    { user_id: 'cole', staff_role: 'team_manager' },
  ];
  const rowsB = [...rowsA].reverse();
  assert.equal(buildRoleMap(rowsA).get('cole'), 'head_coach');
  assert.equal(buildRoleMap(rowsB).get('cole'), 'head_coach');
});

test('buildRoleMap: skips rows with no id or no role, keeps the rest', () => {
  const map = buildRoleMap([
    { user_id: 'a', role: 'parent' },
    { user_id: null, role: 'head_coach' },
    { user_id: 'b', role: null },
  ]);
  assert.equal(map.get('a'), 'parent');
  assert.equal(map.has('b'), false);
  assert.equal(map.size, 1);
});

test('buildRoleMap: a null row set is tolerated', () => {
  assert.equal(buildRoleMap(null, undefined).size, 0);
});

test('formatRoleLabel keeps its Feb 2026 wording', () => {
  // Preserved deliberately: item 4 extends chatHelpers, it does not reword it.
  assert.equal(formatRoleLabel('head_coach'), 'Head Coach');
  assert.equal(formatRoleLabel('assistant_coach'), 'Assistant Coach');
  assert.equal(formatRoleLabel('team_manager'), 'Team Manager');
  assert.equal(formatRoleLabel('player'), 'Athlete');
  assert.equal(formatRoleLabel(undefined), '');
});

// === 2. Contact role -> chip group, including player ========================
// The audit's item 2: 'player' was already being FETCHED and was then dropped
// by the mapping's `default` arm, so no Players chip could ever appear.

test('chip group: player now maps to players (was dropped)', () => {
  assert.equal(roleChipGroup('player'), 'players');
});

test('chip group: the pre-existing three are unchanged', () => {
  assert.equal(roleChipGroup('head_coach'), 'coaches');
  assert.equal(roleChipGroup('assistant_coach'), 'coaches');
  assert.equal(roleChipGroup('team_manager'), 'managers');
  assert.equal(roleChipGroup('parent'), 'parents');
});

test('chip group: an unknown role is still NOT guessed at', () => {
  assert.equal(roleChipGroup('registrar'), null);
  assert.equal(roleChipGroup('club_admin'), null);
  assert.equal(roleChipGroup(null), null);
  assert.equal(roleChipGroup(undefined), null);
});

test('chip group: a player who also coaches files under Coaches, once', () => {
  // The tie-break runs first, so the chip follows the winning role.
  assert.equal(
    roleChipGroup(pickHighestRole(['player', 'assistant_coach'])),
    'coaches'
  );
});

// === 3. Recipient filtering ================================================
// Item 5 (FND-A) and item 6. The creator must never be in the batch, and the
// unchecked must never be sent to.

const STAFF = [
  { user_id: 'coach1' },
  { user_id: 'coach2' },
  { user_id: 'mgr1' },
];

test('recipients: nothing unchecked -> the whole group', () => {
  assert.deepEqual(checkedRecipientIds(STAFF, new Set()), [
    'coach1',
    'coach2',
    'mgr1',
  ]);
});

test('recipients: an unchecked person is excluded', () => {
  assert.deepEqual(checkedRecipientIds(STAFF, new Set(['coach2'])), [
    'coach1',
    'mgr1',
  ]);
});

test('recipients: unchecking everyone yields zero, which blocks Send', () => {
  const ids = checkedRecipientIds(
    STAFF,
    new Set(['coach1', 'coach2', 'mgr1'])
  );
  assert.deepEqual(ids, []);
  // The screen disables Send on exactly this count.
  assert.equal(ids.length === 0, true);
});

test('recipients: order follows the list, not the excluded set', () => {
  assert.deepEqual(checkedRecipientIds(STAFF, new Set(['coach1'])), [
    'coach2',
    'mgr1',
  ]);
});

test('FND-A: the creator is excluded from the member batch', () => {
  // The trigger already inserted them as admin; UNIQUE (channel_id, user_id)
  // would otherwise fail the WHOLE multi-row insert.
  const rows = buildMemberInserts('chan1', ['coach1', 'me', 'mgr1'], 'me');
  assert.deepEqual(rows.map((r) => r.user_id), ['coach1', 'mgr1']);
  assert.equal(
    rows.some((r) => r.user_id === 'me'),
    false
  );
});

test('FND-A: every row carries the channel id and role member', () => {
  const rows = buildMemberInserts('chan1', ['coach1'], 'me');
  assert.deepEqual(rows, [
    { channel_id: 'chan1', user_id: 'coach1', role: 'member' },
  ]);
});

test('FND-A: duplicates are collapsed -- same constraint, same failure', () => {
  const rows = buildMemberInserts('chan1', ['coach1', 'coach1'], 'me');
  assert.equal(rows.length, 1);
});

test('FND-A: blanks are dropped', () => {
  const rows = buildMemberInserts('chan1', ['coach1', null, undefined, ''], 'me');
  assert.equal(rows.length, 1);
});

test('FND-A: a group of only the creator produces an EMPTY batch', () => {
  // Nothing to insert, and the screen refuses to send at zero recipients, so
  // this can no longer create a channel with nobody in it.
  assert.deepEqual(buildMemberInserts('chan1', ['me'], 'me'), []);
});

test('end to end: uncheck, then batch, drops both the unchecked and the creator', () => {
  const sender = 'me';
  const group = [...STAFF, { user_id: sender }];
  const ids = checkedRecipientIds(group, new Set(['coach2']));
  const rows = buildMemberInserts('chan1', ids, sender);
  assert.deepEqual(rows.map((r) => r.user_id), ['coach1', 'mgr1']);
});

// === 4. DM day dividers ====================================================
// Item 2: DMChatScreen now calls the SAME helper the team room uses. These
// assert the inverted-list contract the DM list relies on; chatDays.ts itself
// is unchanged and has its own suite.

/** A Date at a given LOCAL wall-clock time, whatever the runner's timezone. */
function localIso(
  y: number,
  m: number,
  d: number,
  hh = 12,
  mm = 0
): string {
  return new Date(y, m - 1, d, hh, mm, 0, 0).toISOString();
}

test('DM dividers: an empty thread has none', () => {
  assert.equal(invertedDayDividerIndices([]).size, 0);
});

test('DM dividers: a one-message DM labels that message', () => {
  assert.deepEqual([...invertedDayDividerIndices([localIso(2026, 10, 13)])], [0]);
});

test('DM dividers: three messages on one local day share ONE divider', () => {
  // Newest first, as DMChatScreen's invertedMessages are.
  const stamps = [
    localIso(2026, 10, 13, 18, 0),
    localIso(2026, 10, 13, 12, 0),
    localIso(2026, 10, 13, 8, 0),
  ];
  // The divider belongs to the OLDEST message of the day = the highest index.
  assert.deepEqual([...invertedDayDividerIndices(stamps)], [2]);
});

test('DM dividers: two days get two dividers, each on its oldest row', () => {
  const stamps = [
    localIso(2026, 10, 13, 9, 0),
    localIso(2026, 10, 12, 20, 0),
    localIso(2026, 10, 12, 7, 0),
  ];
  assert.deepEqual([...invertedDayDividerIndices(stamps)], [0, 2]);
});

test('DM dividers: a late-evening and an early-morning of the SAME local day share one', () => {
  // West of UTC the 21:30 message is "tomorrow" in UTC. A UTC-based grouping
  // would wedge a second divider between them, mid-day.
  const stamps = [
    localIso(2026, 10, 13, 21, 30),
    localIso(2026, 10, 13, 7, 30),
  ];
  assert.deepEqual([...invertedDayDividerIndices(stamps)], [1]);
});

// === 6. Staff Message upgrades: chat name, search, select-all (Oct 14) ======
// The three rules a sender can break by accident: a name that silently stops
// following the group, a search that quietly changes who gets the message, and
// a select-all that only acts on what happens to be on screen.

const NAMED_STAFF = [
  { user_id: 'u-cole', full_name: 'Cole Coachman' },
  { user_id: 'u-nicole', full_name: 'Nicole Parker' },
  { user_id: 'u-mara', full_name: 'Mara Manager' },
];

test('chat name: defaults to the picked group and FOLLOWS the group while untouched', () => {
  let state = initialChatName('All Staff');
  assert.equal(state.value, 'All Staff');
  state = chatNameOnGroupChange(state, 'Head Coaches Only');
  assert.equal(state.value, 'Head Coaches Only');
  state = chatNameOnGroupChange(state, 'Team Managers Only');
  assert.equal(state.value, 'Team Managers Only');
});

test('chat name: once edited it STAYS as typed through later group changes', () => {
  let state = initialChatName('All Staff');
  state = chatNameOnEdit(state, 'Tournament crew');
  assert.equal(state.edited, true);
  state = chatNameOnGroupChange(state, 'Head Coaches Only');
  assert.equal(state.value, 'Tournament crew');
  state = chatNameOnGroupChange(state, 'All Coaches');
  assert.equal(state.value, 'Tournament crew');
});

test('chat name: resolves trimmed', () => {
  const state = chatNameOnEdit(initialChatName('All Staff'), '  Tournament crew  ');
  assert.equal(resolveChatName(state, 'All Staff'), 'Tournament crew');
});

test('chat name: EMPTY (or whitespace) falls back to the current default', () => {
  const cleared = chatNameOnEdit(initialChatName('All Staff'), '');
  assert.equal(resolveChatName(cleared, 'Head Coaches Only'), 'Head Coaches Only');
  const blanks = chatNameOnEdit(initialChatName('All Staff'), '    ');
  assert.equal(resolveChatName(blanks, 'All Coaches'), 'All Coaches');
});

test('chat name: clearing the field hands the name back to the group', () => {
  // Otherwise an emptied box freezes on a group the sender has since left and
  // the field disagrees with the name the channel is actually created with.
  let state = chatNameOnEdit(initialChatName('All Staff'), 'Tournament crew');
  state = chatNameOnEdit(state, '');
  assert.equal(state.edited, false);
  state = chatNameOnGroupChange(state, 'Team Managers Only');
  assert.equal(resolveChatName(state, 'Team Managers Only'), 'Team Managers Only');
});

test('search: case-insensitive, matches ANY part of the name', () => {
  assert.equal(matchesNameQuery('Cole Coachman', 'cole'), true);
  assert.equal(matchesNameQuery('Cole Coachman', 'COLE'), true);
  assert.equal(matchesNameQuery('Cole Coachman', 'oach'), true);   // mid-word
  assert.equal(matchesNameQuery('Cole Coachman', 'coachman'), true); // last name
  assert.equal(matchesNameQuery('Cole Coachman', 'mara'), false);
});

test('search: an empty or whitespace query shows everyone', () => {
  assert.equal(filterByNameQuery(NAMED_STAFF, '').length, 3);
  assert.equal(filterByNameQuery(NAMED_STAFF, '   ').length, 3);
});

test('search HIDES rows but KEEPS the checks -- the send list is unchanged', () => {
  const excluded = new Set<string>();           // everyone checked
  const visible = filterByNameQuery(NAMED_STAFF, 'cole');
  // "cole" matches Cole Coachman AND Nicole Parker (any part of the name).
  assert.deepEqual(visible.map((s) => s.user_id), ['u-cole', 'u-nicole']);
  // The count and the send list are computed from the WHOLE group, not the view.
  assert.equal(checkedRecipientIds(NAMED_STAFF, excluded).length, 3);
});

test('search: a person hidden by the search STAYS unchecked', () => {
  const excluded = new Set(['u-mara']);          // Mara unchecked, then hidden
  const visible = filterByNameQuery(NAMED_STAFF, 'cole');
  assert.equal(visible.some((s) => s.user_id === 'u-mara'), false);
  assert.deepEqual(checkedRecipientIds(NAMED_STAFF, excluded), ['u-cole', 'u-nicole']);
});

test('toggle label: "Deselect all" only when EVERY person in the group is checked', () => {
  assert.equal(selectAllLabel(NAMED_STAFF, new Set()), 'Deselect all');
  assert.equal(selectAllLabel(NAMED_STAFF, new Set(['u-mara'])), 'Select all');
  assert.equal(isWholeGroupChecked(NAMED_STAFF, new Set()), true);
  assert.equal(isWholeGroupChecked(NAMED_STAFF, new Set(['u-mara'])), false);
});

test('toggle label: an EMPTY group offers Select all, never Deselect all', () => {
  assert.equal(selectAllLabel([], new Set()), 'Select all');
  assert.equal(isWholeGroupChecked([], new Set()), false);
});

test('toggle acts on the WHOLE group, not the search-visible rows', () => {
  // All checked + a search showing 2 of 3 -> Deselect all must clear all 3.
  const allOff = toggleWholeGroup(NAMED_STAFF, new Set());
  assert.deepEqual([...allOff].sort(), ['u-cole', 'u-mara', 'u-nicole']);
  assert.equal(checkedRecipientIds(NAMED_STAFF, allOff).length, 0);
  // None checked -> Select all must restore all 3, including the hidden one.
  const allOn = toggleWholeGroup(NAMED_STAFF, allOff);
  assert.equal(allOn.size, 0);
  assert.equal(checkedRecipientIds(NAMED_STAFF, allOn).length, 3);
});

test('toggle leaves exclusions for people OUTSIDE the group alone', () => {
  const excluded = new Set(['u-outsider']);
  const next = toggleWholeGroup(NAMED_STAFF, excluded);
  assert.equal(next.has('u-outsider'), true);
});

test('zero recipients BLOCKS the send: deselect all -> 0 -> empty insert batch', () => {
  const allOff = toggleWholeGroup(NAMED_STAFF, new Set());
  const ids = checkedRecipientIds(NAMED_STAFF, allOff);
  assert.equal(ids.length, 0);
  // The screen disables the button at 0; this is the programmatic floor behind
  // it -- nothing to insert, so no channel can be populated.
  assert.deepEqual(buildMemberInserts('ch-1', ids, 'u-creator'), []);
});

test('zero recipients: unchecking the last person also lands on 0', () => {
  const one = [{ user_id: 'u-cole', full_name: 'Cole Coachman' }];
  const off = toggleWholeGroup(one, new Set());
  assert.equal(checkedRecipientIds(one, off).length, 0);
  assert.equal(selectAllLabel(one, off), 'Select all');
});
