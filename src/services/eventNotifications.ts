import { supabase } from '../lib/supabase';

type EventAction = 'created' | 'updated' | 'cancelled' | 'uncancelled';

interface NotifyEventParams {
  eventId: string;
  action: EventAction;
  changedFields?: string[];
}

export async function notifyTeamOfEvent({
  eventId,
  action,
  changedFields = [],
}: NotifyEventParams): Promise<void> {
  try {
    console.log(`[EventNotifications] Notifying team: ${action} event ${eventId}`);

    const { data, error } = await supabase.functions.invoke('notify-team-event', {
      body: {
        event_id: eventId,
        action,
        changed_fields: changedFields,
      },
    });

    if (error) {
      console.error('[EventNotifications] Error:', error);
      return;
    }

    console.log('[EventNotifications] Success:', data);
  } catch (err) {
    console.error('[EventNotifications] Exception:', err);
    // Don't throw - notifications failing shouldn't break the app
  }
}
