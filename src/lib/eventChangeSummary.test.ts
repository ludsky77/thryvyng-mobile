/**
 * Tests for the event-change diff and dialog summary.
 *
 * Uses node:test + node:assert/strict, which ship with Node -- this repo has
 * no test runner and adding one would be a dependency change.
 *
 * Run (no repo changes, compiles to a temp dir with the repo's own tsc):
 *   npx tsc src/lib/eventChangeSummary.ts src/lib/eventChangeSummary.test.ts \
 *     --outDir /tmp/ecs --module commonjs --target es2020 --skipLibCheck \
 *     --strict --esModuleInterop
 *   node --test /tmp/ecs/eventChangeSummary.test.js
 *
 * Point node at the FILE, not the directory -- `node --test <dir>` tries to
 * run the directory path itself as a test and reports an opaque failure.
 *
 * The cases that matter are the HH:MM vs HH:MM:SS normalisation (the bug the
 * previous inline diff had) and the no-op save.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COMPARED_FIELDS,
  describeChanges,
  diffEventFields,
  formatEventDay,
  formatEventTime,
  normalizeTime,
  summarizeForDialog,
  type EventSnapshot,
} from './eventChangeSummary';

/** A saved row as PostgREST returns it: TIME values carry seconds. */
const row: EventSnapshot = {
  title: 'Practice',
  event_type: 'practice',
  event_date: '2026-10-08',
  start_time: '18:00:00',
  end_time: '19:30:00',
  arrival_time: '17:45:00',
  location_name: 'Field 2',
  location_address: '100 Main St',
  uniform: 'Blue kit',
  notes: 'Bring water',
};

/** The same event as the edit form serialises it: TIME values are HH:MM. */
const formPayload: EventSnapshot = {
  title: 'Practice',
  event_type: 'practice',
  event_date: '2026-10-08',
  start_time: '18:00',
  end_time: '19:30',
  arrival_time: '17:45',
  location_name: 'Field 2',
  location_address: '100 Main St',
  uniform: 'Blue kit',
  notes: 'Bring water',
};

// ---------------------------------------------------------------------------
// normalizeTime -- the regression this module exists to prevent
// ---------------------------------------------------------------------------

test('normalizeTime collapses seconds so HH:MM:SS equals HH:MM', () => {
  assert.equal(normalizeTime('18:00:00'), '18:00');
  assert.equal(normalizeTime('18:00'), '18:00');
  assert.equal(normalizeTime('08:05:00'), '08:05');
  assert.equal(normalizeTime('8:05'), '08:05');
});

test('normalizeTime treats null, undefined and blank as unset', () => {
  assert.equal(normalizeTime(null), null);
  assert.equal(normalizeTime(undefined), null);
  assert.equal(normalizeTime('  '), null);
});

// ---------------------------------------------------------------------------
// diffEventFields
// ---------------------------------------------------------------------------

test('a no-op save reports no changes despite HH:MM vs HH:MM:SS', () => {
  // This is the exact case the previous inline diff got wrong: it compared
  // '18:00:00' !== '18:00' and claimed start/arrival/end time had all changed.
  assert.deepEqual(diffEventFields(row, formPayload), []);
});

test('a notes-only edit reports only notes', () => {
  assert.deepEqual(
    diffEventFields(row, { ...formPayload, notes: 'Bring water and shin pads' }),
    ['notes'],
  );
});

test('a real time change is still detected', () => {
  assert.deepEqual(diffEventFields(row, { ...formPayload, start_time: '19:00' }), ['start_time']);
});

test('null vs empty string vs whitespace are all "unset"', () => {
  const cleared = { ...formPayload, location_name: '', location_address: '   ' };
  assert.deepEqual(diffEventFields({ ...row, location_name: null, location_address: null }, cleared), []);
});

test('clearing a set field is a change', () => {
  assert.deepEqual(diffEventFields(row, { ...formPayload, location_name: '' }), ['location_name']);
});

test('fields are reported in COMPARED_FIELDS order, not input order', () => {
  const changed = diffEventFields(row, {
    ...formPayload,
    notes: 'different',
    event_date: '2026-10-09',
    location_name: 'Field 7',
  });
  assert.deepEqual(changed, ['event_date', 'location_name', 'notes']);
});

test('the spec\'s field list is covered', () => {
  const keys = COMPARED_FIELDS.map((f) => f.key);
  for (const required of [
    'event_date', 'start_time', 'end_time', 'location_name',
    'location_address', 'title', 'notes', 'uniform', 'event_type',
  ]) {
    assert.ok(keys.includes(required as never), `${required} is not compared`);
  }
  // arrival_time was compared before this change and must stay compared.
  assert.ok(keys.includes('arrival_time'));
});

test('changed_fields uses DB column names the edge function branches on', () => {
  // notify-team-event checks changed_fields.includes('event_date') etc.
  const changed = diffEventFields(row, { ...formPayload, start_time: '19:00', location_name: 'Field 7' });
  assert.ok(changed.includes('start_time'));
  assert.ok(changed.includes('location_name'));
});

// ---------------------------------------------------------------------------
// describeChanges -- names at most two fields
// ---------------------------------------------------------------------------

test('describeChanges names one, two, then counts the rest', () => {
  assert.equal(describeChanges(['start_time']), 'time changed');
  assert.equal(describeChanges(['start_time', 'location_name']), 'time and location changed');
  assert.equal(
    describeChanges(['event_date', 'start_time', 'location_name', 'notes']),
    'date, time and 2 more changed',
  );
});

test('describeChanges is ordered by priority, not by argument order', () => {
  assert.equal(describeChanges(['notes', 'event_date']), 'date and notes changed');
});

// ---------------------------------------------------------------------------
// formatters
// ---------------------------------------------------------------------------

test('formatEventDay does not drift to the previous day', () => {
  // new Date('2026-10-08') is UTC midnight, which is Oct 7 in the Americas.
  // Parsing at local noon keeps Thursday a Thursday in every real zone.
  assert.equal(formatEventDay('2026-10-08'), 'Thu');
  assert.equal(formatEventDay('2026-10-10'), 'Sat');
});

test('formatEventDay degrades quietly on missing or malformed dates', () => {
  assert.equal(formatEventDay(null), '');
  assert.equal(formatEventDay('08-10-2026'), '');
});

test('formatEventTime renders 12-hour time', () => {
  assert.equal(formatEventTime('18:00:00'), '6:00 PM');
  assert.equal(formatEventTime('09:30'), '9:30 AM');
  assert.equal(formatEventTime('00:15'), '12:15 AM');
  assert.equal(formatEventTime('12:00'), '12:00 PM');
  assert.equal(formatEventTime(null), '');
});

// ---------------------------------------------------------------------------
// summarizeForDialog -- the line the staff user reads
// ---------------------------------------------------------------------------

test('summarizeForDialog matches the spec copy for an update', () => {
  assert.equal(
    summarizeForDialog(row, ['start_time'], 'updated'),
    'Practice Thu 6:00 PM — time changed',
  );
});

test('summarizeForDialog matches the spec copy for a cancel with no time', () => {
  assert.equal(
    summarizeForDialog({ title: 'Game', event_date: '2026-10-10' }, [], 'cancelled'),
    'Game Sat — cancelled',
  );
});

test('summarizeForDialog describes a delete', () => {
  assert.equal(summarizeForDialog(row, [], 'deleted'), 'Practice Thu 6:00 PM — deleted');
});

test('summarizeForDialog falls back when the event is unknown', () => {
  assert.equal(summarizeForDialog({}, [], 'deleted'), 'Event deleted');
  assert.equal(summarizeForDialog({}, ['notes'], 'updated'), 'Event notes changed');
});

test('summarizeForDialog names at most two changed fields', () => {
  assert.equal(
    summarizeForDialog(row, ['event_date', 'start_time', 'notes', 'uniform'], 'updated'),
    'Practice Thu 6:00 PM — date, time and 2 more changed',
  );
});
