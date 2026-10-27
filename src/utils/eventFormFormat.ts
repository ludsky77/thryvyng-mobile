/**
 * The strings the two event forms show, in one place.
 *
 * `CreateEventModal` and `EditEventModal` are separate components that have
 * always duplicated their helpers, and polish round 1 made that worse: it put
 * byte-identical copies of all three of these in both files, so the next
 * ruling about a time string would have had to be applied twice or drift. This
 * file is the fix. Both forms import from here and define none of them.
 *
 * DISPLAY ONLY. The payload serializers (`formatDateForPayload`,
 * `formatTimeForPayload` -- YYYY-MM-DD and 24-hour, what the `event_date`,
 * `start_time`, `arrival_time` and `end_time` columns take) stay local to each
 * form on purpose: mixing them in here is how a 24-hour string ends up in a
 * row and a 12-hour string ends up in the database.
 */

/** R-O: 12-hour with AM/PM -- "6:00 PM". Reads like the spinner that set it. */
export function formatTimeDisplay(d: Date): string {
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/** R-N: "Thu, Oct 29, 2026" -- weekday first, because a date row is read for the day. */
export function formatDateDisplay(d: Date): string {
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * R-T: the merged "Starts" row's value -- "Wed, Oct 28 · 6:00 PM".
 *
 * No YEAR, deliberately: the row is a glance ("which day, what time"), and the
 * two forms' Date & Time section summary still carries the full
 * `formatDateDisplay` with the year in it, so nothing is lost.
 *
 * Two arguments rather than one Date because the forms keep the date and the
 * start time in two pieces of state, which is what the payload needs
 * (`event_date` and `start_time` are separate columns). The merged row and the
 * merged wheel are a UI shape, not a data change.
 */
export function formatStartsDisplay(date: Date, time: Date): string {
  const day = date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  return `${day} · ${formatTimeDisplay(time)}`;
}

/**
 * The date parts of `date` with the clock reading of `time`.
 *
 * R-T: moving a Starts value to another day has to take arrival and end with
 * it, or the three Dates disagree about which calendar day the event is on.
 * Only the time-of-day of arrival and end ever reaches the payload, so this is
 * invisible there -- it keeps the in-memory values honest, which is what the
 * cascade and the hint both read.
 */
export function withDateOf(date: Date, time: Date): Date {
  const out = new Date(date);
  out.setHours(time.getHours(), time.getMinutes(), 0, 0);
  return out;
}

/**
 * What the muted line under the Arrival Time value says, and in which colour.
 *
 * `tone` is a semantic token, not a hex: this file is shared by two forms and
 * knows nothing about either one's palette. Each form maps 'error' onto the
 * same colour its validation lines already use.
 */
export type ArrivalHintTone = 'muted' | 'error';

export interface ArrivalHint {
  text: string;
  tone: ArrivalHintTone;
}

/**
 * R-R, three states. The third one is why this returns a value for every input
 * rather than null for the bad one: an arrival after the start used to show
 * NOTHING until the form was submitted and validation spoke up, so the one
 * state that needs explaining was the one state with no explanation.
 *
 * Minutes-of-day, not Date maths: both values carry today's date whatever day
 * the event is on, and both forms' own validation compares them exactly this
 * way, so the hint and the error can never disagree about which is later.
 */
export function arrivalHint(arrival: Date, start: Date): ArrivalHint {
  const minutes =
    start.getHours() * 60 +
    start.getMinutes() -
    (arrival.getHours() * 60 + arrival.getMinutes());

  if (minutes < 0) return { text: 'after start — check this', tone: 'error' };
  if (minutes === 0) return { text: 'same as start', tone: 'muted' };
  return { text: `${minutes} min before start`, tone: 'muted' };
}
