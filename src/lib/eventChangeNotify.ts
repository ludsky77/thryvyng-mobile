/**
 * "Notify the team?" -- the ask, and the send.
 *
 * WHY THIS CALLS supabase.functions.invoke DIRECTLY instead of
 * services/eventNotifications.ts's notifyTeamOfEvent():
 *   It is the SAME edge function with the SAME payload shape
 *   ({ event_id, action, changed_fields }) -- no new sender, no edge function
 *   change. But notifyTeamOfEvent() catches everything and returns void
 *   (services/eventNotifications.ts), so a caller cannot tell a delivered
 *   push from a failed one. This feature has to show "Couldn't notify the
 *   team" on failure, so it needs the error. notifyTeamOfEvent() is left
 *   exactly as it is for its existing callers.
 *
 * WHAT THE PUSH SAYS IS NOT DECIDED HERE.
 *   notify-team-event builds title and body server-side from `action` and
 *   `changed_fields`. The client cannot set them, and the function re-reads
 *   the event's CURRENT row, so it never sees old values -- "time: 5:00 PM ->
 *   6:00 PM" is not expressible through this path. What the team actually
 *   receives for an update is "✏️ Event Updated: <title>" plus one of the
 *   function's three body lines. Changing that means changing the edge
 *   function, which is shared with the web app.
 *
 * RECIPIENTS are untouched: the edge function resolves them server-side with
 *   the service role (team staff + parents by email, minus the actor). This
 *   file reads no preferences and builds no user_ids.
 */

import { Alert } from 'react-native';
import { supabase } from './supabase';
import {
  type EventChangeAction,
  type EventSnapshot,
  normalizeText,
  summarizeForDialog,
} from './eventChangeSummary';

/**
 * The edge function's action vocabulary: 'created' | 'updated' | 'cancelled'
 * | 'uncancelled'. There is NO 'deleted', and the function 404s on an event
 * row it cannot fetch.
 *
 * So a delete is announced as 'cancelled', and the caller must invoke this
 * BEFORE removing the row. The dialog still says "deleted" -- that wording is
 * ours -- while the push the team receives reads "❌ Event Cancelled: ...".
 * That mismatch is the cost of not editing the shared edge function.
 */
const EDGE_ACTION: Record<EventChangeAction, 'updated' | 'cancelled'> = {
  updated: 'updated',
  cancelled: 'cancelled',
  deleted: 'cancelled',
};

/** Yes/No on "Notify the team?". Resolves false if dismissed. */
export function askNotifyTeam(summary: string): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      'Notify the team?',
      summary,
      [
        { text: 'No', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Yes', onPress: () => resolve(true) },
      ],
      // Android lets a tap-outside / back press dismiss the alert; without
      // this the promise would never settle and the caller would hang.
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

interface SendParams {
  eventId: string;
  action: EventChangeAction;
  changedFields?: readonly string[];
}

/**
 * Fire the push. Returns true on success, false on failure -- it never
 * throws, so a caller can neither be blocked nor reverted by a push problem.
 */
export async function sendTeamChangeNotification({
  eventId,
  action,
  changedFields = [],
}: SendParams): Promise<boolean> {
  try {
    const { error } = await supabase.functions.invoke('notify-team-event', {
      body: {
        event_id: eventId,
        action: EDGE_ACTION[action],
        changed_fields: changedFields,
      },
    });

    if (error) {
      console.error('[EventChangeNotify] notify-team-event error:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[EventChangeNotify] exception:', err);
    return false;
  }
}

interface ConfirmParams extends SendParams {
  /** Used only to build the dialog line. */
  event: EventSnapshot;
}

/**
 * Ask, then send if asked for. Resolves when the whole exchange is done, so a
 * delete caller can `await` this and be sure the push went out while the row
 * still existed.
 *
 * Never throws and never rethrows: the save / cancel / delete that triggered
 * it is already committed (or, for delete, about to be) and must not be
 * affected by anything here. A failed send surfaces as an alert and nothing
 * more.
 */
export async function confirmAndNotifyTeam({
  event,
  eventId,
  action,
  changedFields = [],
}: ConfirmParams): Promise<void> {
  // A no-op update must produce no dialog at all.
  if (action === 'updated' && changedFields.length === 0) return;

  const summary = summarizeForDialog(event, changedFields, action);

  const wantsToNotify = await askNotifyTeam(summary);
  if (!wantsToNotify) return;

  const ok = await sendTeamChangeNotification({ eventId, action, changedFields });

  if (!ok) {
    Alert.alert(
      "Couldn't notify the team",
      'The change went through, but the notification could not be sent. You can let the team know another way.',
    );
  }
}

// ──────────────────────────────────────────────────────────────────────────
// SERIES CANCELLATION ("This & Future Events")
//
// Kept as its own send/confirm pair rather than widening the three functions
// above, because those are the already-shipped single-event path (caa2787)
// and this needs a different action, two extra payload fields and different
// dialog copy. Nothing above is modified.
// ──────────────────────────────────────────────────────────────────────────

/**
 * "this and 7 future events will be cancelled".
 *
 * `seriesCount` is the TOTAL number of rows the delete removes -- the visible
 * event PLUS its future occurrences -- because that is what the edge function
 * prints ("and all remaining dates (8 events)"). The dialog, though, talks
 * about the visible event separately ("this and 7 future"), so the number
 * shown here is seriesCount - 1. Keeping the payload as the total and doing
 * the subtraction only for display means the dialog and the push can never
 * describe different sets of events.
 */
export function describeSeriesCancellation(seriesCount: number): string {
  const future = Number.isInteger(seriesCount) ? seriesCount - 1 : 0;
  if (future <= 0) return 'this event will be cancelled';
  return `this and ${future} future event${future === 1 ? '' : 's'} will be cancelled`;
}

/** "Practice — this and 7 future events will be cancelled". */
export function summarizeSeriesForDialog(event: EventSnapshot, seriesCount: number): string {
  const suffix = describeSeriesCancellation(seriesCount);
  const title = normalizeText(event.title);
  // No title: say the same true thing without printing "undefined — ...".
  if (!title) return `${suffix.charAt(0).toUpperCase()}${suffix.slice(1)}`;
  return `${title} — ${suffix}`;
}

interface SeriesSendParams {
  /** The VISIBLE event's id -- the row the edge function re-reads. */
  eventId: string;
  /** Total rows the delete removes, counted from the delete's own criteria. */
  seriesCount: number;
  /** The visible event's event_date, YYYY-MM-DD. */
  seriesFrom: string;
}

/**
 * Fire the series push. Returns true on success, false on failure; never
 * throws, so the delete it precedes can never be blocked by a push problem.
 */
export async function sendSeriesCancelNotification({
  eventId,
  seriesCount,
  seriesFrom,
}: SeriesSendParams): Promise<boolean> {
  try {
    const { error } = await supabase.functions.invoke('notify-team-event', {
      body: {
        event_id: eventId,
        action: 'cancelled_series',
        series_count: seriesCount,
        series_from: seriesFrom,
      },
    });

    if (error) {
      console.error('[EventChangeNotify] cancelled_series error:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[EventChangeNotify] cancelled_series exception:', err);
    return false;
  }
}

interface ConfirmSeriesParams extends SeriesSendParams {
  /** Used only to build the dialog line. */
  event: EventSnapshot;
}

/**
 * Ask, then send if asked for. Resolves when the whole exchange is done, so
 * the caller can `await` this and be sure the push went out while the series
 * rows still existed.
 *
 * Never throws: a declined or failed push falls through to the delete, which
 * is the same contract the single-event path has.
 */
export async function confirmAndNotifyTeamSeries({
  event,
  eventId,
  seriesCount,
  seriesFrom,
}: ConfirmSeriesParams): Promise<void> {
  const wantsToNotify = await askNotifyTeam(summarizeSeriesForDialog(event, seriesCount));
  if (!wantsToNotify) return;

  const ok = await sendSeriesCancelNotification({ eventId, seriesCount, seriesFrom });

  if (!ok) {
    Alert.alert(
      "Couldn't notify the team",
      'The change went through, but the notification could not be sent. You can let the team know another way.',
    );
  }
}
