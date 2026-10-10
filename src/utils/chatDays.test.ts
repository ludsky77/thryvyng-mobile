/**
 * Tests for chat day grouping / divider labels.
 *
 * node:test + node:assert/strict, same pattern as the other suites here (this
 * repo has no test runner and adding one would be a dependency change).
 *
 * Run under a NON-UTC timezone or the timezone cases are vacuous -- in UTC,
 * local and UTC days are identical and a UTC bug cannot show itself:
 *   TZ=America/Denver node --test /tmp/chatdays/chatDays.test.js
 *   TZ=Asia/Tokyo     node --test /tmp/chatdays/chatDays.test.js
 * Denver is UTC-6/-7 (late-evening local = tomorrow in UTC) and Tokyo is
 * UTC+9 (early-morning local = yesterday in UTC), so the two runs cover both
 * directions of the off-by-one.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatDayDivider,
  invertedDayDividerIndices,
  isNewLocalDay,
  localDayKey,
} from './chatDays';

/** A Date at a given LOCAL wall-clock time, whatever the runner's timezone. */
function localDate(
  y: number,
  m: number,
  d: number,
  hh = 12,
  mm = 0,
  ss = 0
): Date {
  return new Date(y, m - 1, d, hh, mm, ss, 0);
}

const OFFSET_MINUTES = localDate(2026, 10, 10).getTimezoneOffset();

// --- localDayKey -----------------------------------------------------------

test('localDayKey returns the LOCAL calendar day, zero padded', () => {
  assert.equal(localDayKey(localDate(2026, 10, 9, 14).toISOString()), '2026-10-09');
  assert.equal(localDayKey(localDate(2026, 1, 5, 9).toISOString()), '2026-01-05');
});

test('localDayKey returns empty string for missing or unparseable values', () => {
  assert.equal(localDayKey(null), '');
  assert.equal(localDayKey(undefined), '');
  assert.equal(localDayKey(''), '');
  assert.equal(localDayKey('not-a-date'), '');
});

test('late local evening keeps TODAY even when UTC has rolled over', () => {
  // The device case: 23:30 local. West of UTC this instant is already the next
  // UTC day, so any UTC-based key would file it under tomorrow.
  const lateTonight = localDate(2026, 10, 10, 23, 30);
  assert.equal(localDayKey(lateTonight.toISOString()), '2026-10-10');

  if (OFFSET_MINUTES > 0) {
    // Runner is west of UTC (Denver): prove the UTC day really differs, so
    // this assertion is testing something.
    assert.notEqual(lateTonight.toISOString().slice(0, 10), '2026-10-10');
  }
});

test('early local morning keeps TODAY even when UTC is still yesterday', () => {
  // The mirror case, east of UTC (Tokyo): 00:30 local is still yesterday in UTC.
  const earlyToday = localDate(2026, 10, 10, 0, 30);
  assert.equal(localDayKey(earlyToday.toISOString()), '2026-10-10');

  if (OFFSET_MINUTES < 0) {
    assert.notEqual(earlyToday.toISOString().slice(0, 10), '2026-10-10');
  }
});

// --- isNewLocalDay ---------------------------------------------------------

test('no previous message always starts a new day', () => {
  assert.equal(isNewLocalDay(localDate(2026, 10, 10).toISOString(), undefined), true);
  assert.equal(isNewLocalDay(localDate(2026, 10, 10).toISOString(), null), true);
});

test('23:00 and 01:00 the next morning are different local days', () => {
  const lateNight = localDate(2026, 10, 9, 23, 0).toISOString();
  const nextMorning = localDate(2026, 10, 10, 1, 0).toISOString();
  assert.equal(isNewLocalDay(nextMorning, lateNight), true);
});

test('two messages hours apart on the same local day are the same day', () => {
  const morning = localDate(2026, 10, 10, 8, 0).toISOString();
  const night = localDate(2026, 10, 10, 22, 0).toISOString();
  assert.equal(isNewLocalDay(night, morning), false);
});

test('an evening message does not open a new day against its own morning (UTC trap)', () => {
  // Both are "2026-10-10" locally; west of UTC the evening one is 10-11 in UTC.
  // A UTC grouping would insert a divider in the middle of today.
  const morning = localDate(2026, 10, 10, 9, 0).toISOString();
  const evening = localDate(2026, 10, 10, 21, 30).toISOString();
  assert.equal(isNewLocalDay(evening, morning), false);
});

test('unparseable timestamps group together instead of forcing a divider', () => {
  assert.equal(isNewLocalDay('nonsense', 'also-nonsense'), false);
});

// --- formatDayDivider ------------------------------------------------------

test('formatDayDivider labels the local today as Today', () => {
  const now = localDate(2026, 10, 10, 15, 0);
  assert.equal(formatDayDivider(localDate(2026, 10, 10, 9, 0).toISOString(), now), 'Today');
  // And the late-evening instant that UTC calls tomorrow.
  assert.equal(formatDayDivider(localDate(2026, 10, 10, 23, 45).toISOString(), now), 'Today');
  // And the early-morning instant that UTC calls yesterday.
  assert.equal(formatDayDivider(localDate(2026, 10, 10, 0, 15).toISOString(), now), 'Today');
});

test('formatDayDivider labels the local yesterday as Yesterday', () => {
  const now = localDate(2026, 10, 10, 15, 0);
  assert.equal(formatDayDivider(localDate(2026, 10, 9, 20, 0).toISOString(), now), 'Yesterday');
});

test('yesterday across a month boundary is still Yesterday', () => {
  const now = localDate(2026, 11, 1, 10, 0);
  assert.equal(formatDayDivider(localDate(2026, 10, 31, 22, 0).toISOString(), now), 'Yesterday');
});

test('yesterday across a year boundary is still Yesterday', () => {
  const now = localDate(2027, 1, 1, 10, 0);
  assert.equal(formatDayDivider(localDate(2026, 12, 31, 23, 0).toISOString(), now), 'Yesterday');
});

test('older days in the same year read weekday + date, no year', () => {
  const now = localDate(2026, 10, 10, 15, 0);
  const label = formatDayDivider(localDate(2026, 10, 6, 12, 0).toISOString(), now);
  assert.equal(label, 'Tue, Oct 6');
  assert.ok(!label.includes('2026'));
});

test('days in another year carry the year', () => {
  const now = localDate(2026, 10, 10, 15, 0);
  const label = formatDayDivider(localDate(2025, 9, 30, 12, 0).toISOString(), now);
  assert.ok(label.includes('2025'), label);
  assert.ok(label.startsWith('Tue, Sep 30'), label);
});

test('formatDayDivider returns empty string for unparseable values', () => {
  const now = localDate(2026, 10, 10, 15, 0);
  assert.equal(formatDayDivider(null, now), '');
  assert.equal(formatDayDivider('not-a-date', now), '');
});

test('tomorrow is not labelled Today or Yesterday', () => {
  const now = localDate(2026, 10, 10, 15, 0);
  const label = formatDayDivider(localDate(2026, 10, 11, 9, 0).toISOString(), now);
  assert.notEqual(label, 'Today');
  assert.notEqual(label, 'Yesterday');
});

// --- inverted-list divider placement (the Oct 10 device bug) ---------------

test('inverted list: the divider lands on the OLDEST message of each local day', () => {
  // The exact device case: two messages minutes apart on the same local day.
  // Newest first, as the inverted FlatList receives them.
  const newer = localDate(2026, 10, 10, 15, 14, 40).toISOString();
  const older = localDate(2026, 10, 10, 15, 14, 10).toISOString();

  const indices = invertedDayDividerIndices([newer, older]);

  // Index 1 is the OLDER of the two, and is the only row with a divider.
  assert.deepEqual([...indices], [1]);
  assert.equal(indices.has(0), false, 'the newer message must NOT carry it');
});

test('inverted list: one divider per day, each on that day\'s oldest row', () => {
  // today(new), today(old), yesterday(new), yesterday(old), older day
  const stamps = [
    localDate(2026, 10, 10, 18, 0).toISOString(), // 0 today newest
    localDate(2026, 10, 10, 9, 0).toISOString(),  // 1 today oldest  <- divider
    localDate(2026, 10, 9, 20, 0).toISOString(),  // 2 yesterday newest
    localDate(2026, 10, 9, 8, 0).toISOString(),   // 3 yesterday oldest <- divider
    localDate(2026, 10, 6, 12, 0).toISOString(),  // 4 only one that day <- divider
  ];
  assert.deepEqual([...invertedDayDividerIndices(stamps)].sort((a, b) => a - b), [1, 3, 4]);
});

test('inverted list: the last (oldest) row always carries a divider', () => {
  const only = [localDate(2026, 10, 10, 12, 0).toISOString()];
  assert.deepEqual([...invertedDayDividerIndices(only)], [0]);
});

test('inverted list: an empty thread has no dividers', () => {
  assert.equal(invertedDayDividerIndices([]).size, 0);
});

test('inverted list: an evening and a morning of the SAME local day share one divider', () => {
  // West of UTC the evening message is "tomorrow" in UTC. A UTC grouping would
  // put a second divider between them, mid-day.
  const stamps = [
    localDate(2026, 10, 10, 21, 30).toISOString(),
    localDate(2026, 10, 10, 7, 30).toISOString(),
  ];
  assert.deepEqual([...invertedDayDividerIndices(stamps)], [1]);
});
