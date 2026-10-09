/**
 * The ONE writer for cal_event_rsvps.
 *
 * There used to be four: EventDetailScreen, CalendarScreen, a dead
 * useCalendarEvents.updateRsvp, and a coach-facing "take attendance" sheet
 * that wrote the family's table under the COACH's user_id and overwrote the
 * parent's own row (now deleted).
 * Three of them hand-rolled the same select-then-update-or-insert dance keyed
 * on (event_id, user_id), and the fourth keyed on player_id, so two rows could
 * exist for one player and the counts double-counted them.
 *
 * The table now carries UNIQUE NULLS NOT DISTINCT (event_id, user_id,
 * player_id), so the dance is a single upsert against that constraint and the
 * duplicate class is gone at the source. NULLS NOT DISTINCT matters: it makes
 * a null player_id behave like a value, so a family that answered before we
 * could resolve their child keeps exactly one row rather than racing.
 *
 * status is yes | no | pending and nothing else. The DB CHECK rejects anything
 * further, the old Maybe included.
 */

import { supabase } from '../lib/supabase';
import type { RsvpStatus } from './attendanceResolver';

export const RSVPS_TABLE = 'cal_event_rsvps';

/** The unique index the upsert targets. Keep in step with the DB constraint. */
export const RSVP_CONFLICT_TARGET = 'event_id,user_id,player_id';

export interface UpsertRsvpArgs {
  eventId: string;
  userId: string;
  /** The player this answer speaks for, or null when we could not resolve one. */
  playerId?: string | null;
  status: RsvpStatus;
  /** Only ever kept on a 'no'; cleared on yes/pending so no stale reason lingers. */
  declineReason?: string | null;
}

export interface UpsertRsvpResult {
  ok: boolean;
  /** Present when the write failed, for the caller's __DEV__ log. */
  error?: unknown;
}

/**
 * Write one family answer.
 *
 * Returns ok:false rather than throwing, because RLS filters a denied write
 * out SILENTLY -- no error, no rows -- so the row count is the only honest
 * signal that the write landed. Every caller alerts off this.
 *
 * `updated_at` is deliberately not written: the table's trigger bumps it on
 * every UPDATE, and that column is what the attendance resolver orders by. A
 * client-supplied value would either be overwritten or, worse, let a device
 * with a skewed clock outrank a real action. `responded_at` is ours to set and
 * is what the resolver falls back to on a fresh insert.
 */
export async function upsertRsvp({
  eventId,
  userId,
  playerId = null,
  status,
  declineReason = null,
}: UpsertRsvpArgs): Promise<UpsertRsvpResult> {
  const { data, error } = await supabase
    .from(RSVPS_TABLE)
    .upsert(
      {
        event_id: eventId,
        user_id: userId,
        player_id: playerId,
        status,
        decline_reason: status === 'no' ? declineReason ?? null : null,
        responded_at: new Date().toISOString(),
      },
      { onConflict: RSVP_CONFLICT_TARGET }
    )
    .select('id');

  if (error || !data || data.length === 0) {
    return { ok: false, error };
  }
  return { ok: true };
}
