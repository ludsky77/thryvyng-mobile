/**
 * Pure helpers for "the team should hear about this event change".
 *
 * NO IMPORTS, deliberately: this module is the only testable part of the
 * feature, and keeping it free of react-native / supabase means it can be
 * exercised without a native runtime or a test renderer.
 *
 * WHAT OWNS WHAT
 *   This file decides (a) WHETHER anything changed and (b) the one-line
 *   summary shown in the "Notify the team?" dialog.
 *   It does NOT decide the push copy. The push title/body are built
 *   server-side by the notify-team-event edge function from `action` plus
 *   `changed_fields`; the client sends no title or body at all. So the field
 *   keys returned by diffEventFields() must stay as DB column names -- the
 *   function branches on exactly "event_date" / "start_time" /
 *   "location_name" / "location_address".
 */

export type EventChangeAction = 'updated' | 'cancelled' | 'deleted';

/** The subset of cal_events this feature reads. All optional: callers pass
 *  whatever their row/payload has. */
export interface EventSnapshot {
  title?: string | null;
  event_type?: string | null;
  event_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  arrival_time?: string | null;
  location_name?: string | null;
  location_address?: string | null;
  uniform?: string | null;
  notes?: string | null;
}

type FieldKind = 'time' | 'text';

interface ComparedField {
  /** cal_events column name -- also the value sent in changed_fields. */
  key: keyof EventSnapshot;
  /** Plain-words name for the dialog line. */
  label: string;
  kind: FieldKind;
}

/**
 * THE FIELDS COMPARED, in dialog-priority order.
 *
 * Order matters: the dialog line names the first one or two changed fields,
 * so the most consequential (date, then time) come first and cosmetic ones
 * (uniform, notes) last.
 *
 * Added here beyond what the screen compared before: title, event_type,
 * uniform, notes. arrival_time is KEPT -- dropping it would silently stop
 * notifying on arrival-time changes, which is a regression, not a cleanup.
 *
 * NOTE a field can be in this list and still not change the push BODY: the
 * edge function only has branches for date/time and location, and everything
 * else falls through to its generic "Check for details" line. Adding a field
 * here changes WHETHER a push is offered, not what it says.
 */
export const COMPARED_FIELDS: readonly ComparedField[] = [
  { key: 'event_date', label: 'date', kind: 'text' },
  { key: 'start_time', label: 'time', kind: 'time' },
  { key: 'end_time', label: 'end time', kind: 'time' },
  { key: 'arrival_time', label: 'arrival time', kind: 'time' },
  { key: 'location_name', label: 'location', kind: 'text' },
  { key: 'location_address', label: 'address', kind: 'text' },
  { key: 'title', label: 'title', kind: 'text' },
  { key: 'event_type', label: 'event type', kind: 'text' },
  { key: 'uniform', label: 'uniform', kind: 'text' },
  { key: 'notes', label: 'notes', kind: 'text' },
];

/**
 * Collapse a TIME value to HH:MM.
 *
 * ⚠️ THIS IS WHY THE DIFF NEEDS NORMALISING AT ALL.
 * The edit form serialises times as "18:30" (EditEventModal's local
 * formatTime pads only hours and minutes), but Postgres TIME comes back
 * through PostgREST as "18:30:00". A raw !== comparison is therefore ALWAYS
 * true for start_time, arrival_time and end_time, which is exactly what the
 * previous inline diff did -- so every save, even a notes-only one, told the
 * team "New time: ...". Comparing on HH:MM fixes that.
 */
export function normalizeTime(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  if (trimmed === '') return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(trimmed);
  if (!m) return trimmed;
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}

/** Trim, and treat empty string / undefined as null, so "" and null and
 *  undefined are all "not set" rather than three distinct values. */
export function normalizeText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
}

function normalizeField(field: ComparedField, snap: EventSnapshot): string | null {
  const raw = snap[field.key];
  return field.kind === 'time' ? normalizeTime(raw as string | null) : normalizeText(raw);
}

/**
 * The cal_events column names whose normalised values differ.
 *
 * An empty array means a genuine no-op save -- the caller must then show no
 * dialog and send nothing.
 */
export function diffEventFields(before: EventSnapshot, after: EventSnapshot): string[] {
  const changed: string[] = [];
  for (const field of COMPARED_FIELDS) {
    if (normalizeField(field, before) !== normalizeField(field, after)) {
      changed.push(field.key as string);
    }
  }
  return changed;
}

/** Plain-words labels for changed keys, in COMPARED_FIELDS order. */
export function changeLabels(changedFields: readonly string[]): string[] {
  return COMPARED_FIELDS.filter((f) => changedFields.includes(f.key as string)).map((f) => f.label);
}

/**
 * "time changed" / "time and location changed" /
 * "date, time and 2 more changed".
 *
 * Names at most two fields, as the spec asks, then counts the rest.
 */
export function describeChanges(changedFields: readonly string[]): string {
  const labels = changeLabels(changedFields);
  if (labels.length === 0) return 'updated';
  if (labels.length === 1) return `${labels[0]} changed`;
  if (labels.length === 2) return `${labels[0]} and ${labels[1]} changed`;
  return `${labels[0]}, ${labels[1]} and ${labels.length - 2} more changed`;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * "2026-10-09" -> "Thu".
 *
 * Parsed at local NOON, never midnight: `new Date('2026-10-09')` is UTC
 * midnight, which in any negative-offset zone is the PREVIOUS day, so a
 * midnight parse would label Thursday events "Wed". Noon is far enough from
 * both boundaries to be safe in every real zone. Same trick the
 * notify-team-event edge function uses.
 */
export function formatEventDay(eventDate: string | null | undefined): string {
  const date = normalizeText(eventDate);
  if (!date) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return '';
  const d = new Date(`${date}T12:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  return DAYS[d.getDay()];
}

/** "18:00" -> "6:00 PM". Returns '' when there is no time (all-day events). */
export function formatEventTime(startTime: string | null | undefined): string {
  const hhmm = normalizeTime(startTime);
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':');
  const hour = Number(h);
  if (Number.isNaN(hour)) return '';
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  return `${hour12}:${m} ${ampm}`;
}

/**
 * The single line under "Notify the team?".
 *
 *   "Practice Thu 6:00 PM — time changed"
 *   "Game Sat — cancelled"            (no start_time, e.g. all-day)
 *   "Practice Thu 6:00 PM — deleted"
 *   "Event deleted"                   (nothing known about the event)
 *
 * The prefix is whatever is known of title / day / time, so an all-day or
 * untitled event degrades gracefully instead of printing "undefined".
 */
export function summarizeForDialog(
  event: EventSnapshot,
  changedFields: readonly string[],
  action: EventChangeAction,
): string {
  const suffix = action === 'updated' ? describeChanges(changedFields) : action;

  const prefix = [normalizeText(event.title), formatEventDay(event.event_date), formatEventTime(event.start_time)]
    .filter((part): part is string => Boolean(part))
    .join(' ');

  if (!prefix) {
    // No title, no date, no time: say the plainest true thing.
    return action === 'updated' ? `Event ${suffix}` : `Event ${action}`;
  }
  return `${prefix} — ${suffix}`;
}
