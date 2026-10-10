/**
 * Day grouping and day-divider labels for chat, in the READER's timezone.
 *
 * Every comparison here goes through the device's local calendar day, never
 * UTC. The distinction is not cosmetic: a message sent at 19:00 in Denver is
 * already "tomorrow" in UTC, so any grouping that reaches for toISOString() or
 * getUTCDate() puts that evening's messages under tomorrow's heading and
 * strands them on the wrong side of the "Today" divider.
 *
 * Pure and clock-injectable (`now`) so the timezone cases are testable rather
 * than only observable on a device at the wrong hour.
 */

/** Pad to two digits without pulling in a date library. */
function two(n: number): string {
  return `${n}`.padStart(2, '0');
}

/**
 * The LOCAL calendar day as `YYYY-MM-DD`, or '' when the value is missing or
 * unparseable.
 *
 * '' is deliberate: an unparseable timestamp groups with its neighbours
 * instead of forcing a divider labelled "Invalid Date".
 */
export function localDayKey(value: string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  // getFullYear/getMonth/getDate are LOCAL accessors. This is the whole point.
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}

/**
 * Does `current` start a new local day compared with `previous`?
 *
 * No previous message means yes -- the oldest message in the loaded window
 * always carries a divider. Two unparseable timestamps group together ('' ===
 * ''), which is the quiet behaviour we want over a spurious divider.
 */
export function isNewLocalDay(
  current: string | null | undefined,
  previous: string | null | undefined
): boolean {
  if (previous === undefined || previous === null) return true;
  return localDayKey(current) !== localDayKey(previous);
}

/**
 * The divider label: `Today`, `Yesterday`, or a weekday + date.
 *
 * Both sides are reduced to a local day key first, so "today" means the
 * reader's today and not UTC's. Returns '' for an unparseable value, matching
 * localDayKey -- the caller renders no label rather than "Invalid Date".
 *
 * Older days read `Tue, Oct 7`, and gain the year when it is not the current
 * one (`Tue, Oct 7, 2025`) so scrolling into last season is unambiguous.
 */
export function formatDayDivider(
  value: string | null | undefined,
  now: Date = new Date()
): string {
  const key = localDayKey(value);
  if (!key) return '';

  const todayKey = localDayKey(now.toISOString());

  const yesterday = new Date(now.getTime());
  // setDate on a local Date handles month/year ends and DST shifts for us.
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = localDayKey(yesterday.toISOString());

  if (key === todayKey) return 'Today';
  if (key === yesterdayKey) return 'Yesterday';

  const d = new Date(value as string);
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

/**
 * Which rows of an INVERTED (newest-first) message list carry a day divider.
 *
 * A divider belongs to the OLDEST message of each local day, because that is
 * the row the divider sits above once the list is drawn. In a newest-first
 * array that is the HIGHEST index within each day's run, so a row qualifies
 * when the next index -- which is older -- is a different local day, or does
 * not exist.
 *
 * Returned as a Set of indices so the renderer asks one question per row
 * instead of re-deriving neighbours, and so this is unit-testable against a
 * literal inverted array rather than only observable on a device.
 *
 * @param timestamps created_at values, NEWEST FIRST (i.e. already inverted).
 */
export function invertedDayDividerIndices(
  timestamps: (string | null | undefined)[]
): Set<number> {
  const out = new Set<number>();
  for (let i = 0; i < timestamps.length; i += 1) {
    // timestamps[i + 1] is the OLDER neighbour in a newest-first array.
    if (isNewLocalDay(timestamps[i], timestamps[i + 1])) {
      out.add(i);
    }
  }
  return out;
}
