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
