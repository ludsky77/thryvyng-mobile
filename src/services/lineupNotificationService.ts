/**
 * Lineup notification service — triggers push + notif_history when a lineup is published.
 * Follows the same pattern as EventDetailScreen (send-push-notification) and CreateEvaluationScreen (notif_history).
 * Fire-and-forget: does not block UI.
 */

import { supabase } from '../lib/supabase';

export interface LineupPublishPayload {
  lineupId: string;
  teamId: string;
  eventId: string | null;
  lineupName: string;
  eventTitle?: string | null;
  coachName: string;
}

/**
 * Get user IDs of all players and parents on the team (excludes staff).
 * Wrapped in try-catch — returns [] on any error.
 */
async function getTeamMemberUserIds(teamId: string): Promise<string[]> {
  try {
    const userIds = new Set<string>();

    const { data: players } = await supabase
      .from('players')
      .select('user_id, parent_email, secondary_parent_email')
      .eq('team_id', teamId);

    (players || []).forEach((p: any) => {
      if (p.user_id) userIds.add(p.user_id);
    });

    const emails = new Set<string>();
    (players || []).forEach((p: any) => {
      if (p.parent_email) emails.add(p.parent_email);
      if (p.secondary_parent_email) emails.add(p.secondary_parent_email);
    });

    if (emails.size > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id')
        .in('email', Array.from(emails));
      (profiles || []).forEach((p: any) => userIds.add(p.id));
    }

    return Array.from(userIds);
  } catch {
    return [];
  }
}

/**
 * Trigger lineup published notifications. Call after a successful draft→published save.
 * Fire-and-forget — does not block or throw.
 */
export function notifyLineupPublished(payload: LineupPublishPayload): void {
  const { lineupId, teamId, eventId, lineupName, eventTitle, coachName } = payload;

  const displayName = eventTitle || lineupName;
  const title = 'Lineup Published';
  const body = `${coachName} published the lineup for ${displayName}`;

  const dataPayload = {
    type: 'lineup_published',
    lineupId,
    eventId: eventId || undefined,
    teamId,
  };

  // Fire-and-forget: run async, never throw — notification is nice-to-have
  (async () => {
    try {
      const userIds = await getTeamMemberUserIds(teamId);
      if (userIds.length === 0) return;

      try {
        const { error } = await supabase.functions.invoke('send-push-notification', {
          body: {
            user_ids: userIds,
            title,
            body,
            type: 'lineup_published',
            data: {
              ...dataPayload,
              reference_type: eventId ? 'event' : 'lineup_team',
              reference_id: eventId || teamId,
            },
          },
        });
        if (error && __DEV__) console.warn('[LineupNotification] Push error:', error);
      } catch {
        /* silent */
      }

      try {
        const referenceType = eventId ? 'event' : 'lineup_team';
        const referenceId = eventId || teamId;
        const inserts = userIds.map((userId) => ({
          user_id: userId,
          notification_type: 'lineup_published',
          title,
          body,
          reference_type: referenceType,
          reference_id: referenceId,
          is_read: false,
        }));
        const { error: notifError } = await supabase.from('notif_history').insert(inserts);
        if (notifError && __DEV__) console.warn('[LineupNotification] notif_history:', notifError);
      } catch {
        /* silent */
      }
    } catch {
      /* silent — notification never crashes the app */
    }
  })();
}
