import { supabase } from './supabase';

/**
 * One shared realtime channel per table, fanned out to many subscribers.
 *
 * Every screen and hook that cared about comm_messages used to open its own
 * unfiltered postgres_changes subscription, so a device with the chat list, an
 * open room and the tab badge mounted held three sockets receiving the same
 * rows. Worse, two mounts that picked the same topic name could tear down each
 * other's subscription on unmount.
 *
 * The hub keeps ONE channel per table, ref-counted: it is created on the first
 * subscriber and removed after the last one unsubscribes. Callers filter the
 * rows they receive themselves -- the hub does no filtering.
 */

type RowCallback = (row: any) => void;

interface Hub {
  topic: string;
  table: string;
  event: 'INSERT' | '*';
  channel: ReturnType<typeof supabase.channel> | null;
  callbacks: Set<RowCallback>;
}

const messageInsertHub: Hub = {
  topic: 'hub:comm_messages',
  table: 'comm_messages',
  event: 'INSERT',
  channel: null,
  callbacks: new Set(),
};

const reactionChangeHub: Hub = {
  topic: 'hub:comm_message_reactions',
  table: 'comm_message_reactions',
  event: '*',
  channel: null,
  callbacks: new Set(),
};

/**
 * DELETE payloads carry the row in `old` and an empty `new`, so prefer a
 * populated `new` and fall back to `old`. INSERT/UPDATE are unaffected.
 */
function rowFromPayload(payload: any): any {
  const next = payload?.new;
  if (next && Object.keys(next).length > 0) return next;
  return payload?.old ?? null;
}

function subscribeToHub(hub: Hub, cb: RowCallback): () => void {
  hub.callbacks.add(cb);

  if (!hub.channel) {
    hub.channel = supabase
      .channel(hub.topic)
      .on(
        'postgres_changes',
        { event: hub.event, schema: 'public', table: hub.table },
        (payload: any) => {
          const row = rowFromPayload(payload);
          // Snapshot: a callback may unsubscribe others while we iterate.
          [...hub.callbacks].forEach((fn) => {
            try {
              fn(row);
            } catch (err) {
              // One bad subscriber must not starve the rest.
              if (__DEV__) {
                console.error('[realtimeHub]', hub.topic, 'subscriber threw', err);
              }
            }
          });
        }
      )
      .subscribe((status, err) => {
        if (__DEV__) {
          console.log('[realtimeHub]', hub.topic, status, err?.message);
        }
      });
  }

  let released = false;
  return () => {
    if (released) return;
    released = true;
    hub.callbacks.delete(cb);
    if (hub.callbacks.size === 0 && hub.channel) {
      const channel = hub.channel;
      hub.channel = null;
      if (__DEV__) {
        console.log('[realtimeHub]', hub.topic, 'last subscriber left, closing');
      }
      supabase.removeChannel(channel);
    }
  };
}

/**
 * Every INSERT on public.comm_messages, unfiltered. Returns an unsubscribe fn.
 * Callers must scope by channel_id themselves.
 */
export function subscribeToMessageInserts(cb: (row: any) => void): () => void {
  return subscribeToHub(messageInsertHub, cb);
}

/**
 * Every change (INSERT/UPDATE/DELETE) on public.comm_message_reactions,
 * unfiltered. Returns an unsubscribe fn. On DELETE the row is the old one.
 */
export function subscribeToReactionChanges(cb: (row: any) => void): () => void {
  return subscribeToHub(reactionChangeHub, cb);
}
