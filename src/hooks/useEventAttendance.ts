/**
 * useEventAttendance -- THE one read for an event's attendance.
 *
 * Every attendance surface on the event screen (the Details strip, the
 * Attendance tab list, the per-child RSVP controls) reads this hook, and this
 * hook reads exactly one thing: the prod function get_event_attendance. One
 * row per active roster player, one status each, so the strip can never
 * count past the roster and the list can never disagree with it.
 *
 * States: loading -> ready | empty | error. A request that fails, errors or
 * runs past 12 s settles to 'error' -- the screen shows an empty state with
 * Retry, never a spinner that never stops.
 *
 * Call `refetch()` after any write (an RSVP or a coach mark). It is silent by
 * default once data is on screen, so the list never blanks while it reconciles.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  ATTENDANCE_TIMEOUT_MS,
  headcountFromRows,
  loadAttendanceCounts,
  loadEventAttendance,
  mergeOwnReasons,
  withTimeout,
  type AttendanceLoadState,
  type EventAttendanceCounts,
  type EventAttendanceRow,
  type OwnRsvpRow,
  type RpcResult,
} from '../utils/attendanceResolver';

export {
  ATTENDANCE_TIMEOUT_MS,
  withTimeout,
  type AttendanceLoadState,
  type EventAttendanceCounts,
  type EventAttendanceRow,
} from '../utils/attendanceResolver';

/** One get_event_attendance call, cancellable. */
export function fetchEventAttendance(eventId: string) {
  return loadEventAttendance(
    (signal) =>
      supabase
        .rpc('get_event_attendance', { p_event_id: eventId })
        .abortSignal(signal) as unknown as PromiseLike<RpcResult>,
    ATTENDANCE_TIMEOUT_MS
  );
}

/**
 * ONE get_events_attendance_counts call for every event passed -- the calendar
 * list's counts. Never call it per card.
 */
export function fetchEventsAttendanceCounts(eventIds: string[]): Promise<{
  ok: boolean;
  counts: Map<string, EventAttendanceCounts>;
  error?: unknown;
}> {
  if (eventIds.length === 0) {
    return Promise.resolve({ ok: true, counts: new Map() });
  }
  return loadAttendanceCounts(
    (signal) =>
      supabase
        .rpc('get_events_attendance_counts', { p_event_ids: eventIds })
        .abortSignal(signal) as unknown as PromiseLike<RpcResult>,
    ATTENDANCE_TIMEOUT_MS
  );
}

/**
 * The viewer's OWN cal_event_rsvps rows for one event (user_id = me, which RLS
 * already lets them read). Used for one thing only: putting their own decline
 * reason back on their own row(s). Never counted. A failed read just means no
 * reason is merged -- the list still shows.
 */
async function fetchOwnRsvps(eventId: string, userId: string): Promise<OwnRsvpRow[]> {
  try {
    const { data, error } = await withTimeout((signal) =>
      supabase
        .from('cal_event_rsvps')
        .select('player_id, status, decline_reason, updated_at, responded_at')
        .eq('event_id', eventId)
        .eq('user_id', userId)
        .abortSignal(signal)
    );
    if (error) throw error;
    return (data || []) as OwnRsvpRow[];
  } catch (err) {
    if (__DEV__) console.warn('[useEventAttendance] own rsvp rows read failed:', err);
    return [];
  }
}

export function useEventAttendance(
  eventId: string | null | undefined,
  opts: {
    /** The viewer. Their own rows supply their own decline reason. */
    userId?: string | null;
    /** Players the viewer answers for -- the only rows a reason is merged onto. */
    myPlayerIds?: string[];
  } = {}
) {
  const { userId, myPlayerIds } = opts;
  const [state, setState] = useState<AttendanceLoadState>(
    eventId ? 'loading' : 'empty'
  );
  const [rows, setRows] = useState<EventAttendanceRow[]>([]);
  const [ownRsvps, setOwnRsvps] = useState<OwnRsvpRow[]>([]);
  // Only the newest request may publish: a slow first read must not overwrite
  // the refetch that followed a write.
  const requestRef = useRef(0);
  const hasDataRef = useRef(false);

  const refetch = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      const id = ++requestRef.current;
      if (!eventId) {
        setRows([]);
        setState('empty');
        return;
      }
      // Silent only when there is something on screen to keep.
      const silent = opts.silent ?? hasDataRef.current;
      if (!silent) setState('loading');

      const [result, own] = await Promise.all([
        fetchEventAttendance(eventId),
        userId ? fetchOwnRsvps(eventId, userId) : Promise.resolve([] as OwnRsvpRow[]),
      ]);
      if (id !== requestRef.current) return;
      setOwnRsvps(own);

      if (result.state === 'error') {
        // Not __DEV__-gated: a release build must still say why it is empty.
        console.warn('[useEventAttendance] read failed:', result.error);
      }
      hasDataRef.current = result.rows.length > 0;
      setRows(result.rows);
      setState(result.state);
    },
    [eventId, userId]
  );

  useEffect(() => {
    hasDataRef.current = false;
    refetch({ silent: false });
  }, [refetch]);

  const headcount = useMemo(() => headcountFromRows(rows), [rows]);

  // Own rows get their own reason back; teammates' rows are untouched.
  const mergedRows = useMemo(
    () => mergeOwnReasons(rows, ownRsvps, myPlayerIds ?? []),
    [rows, ownRsvps, myPlayerIds]
  );

  return {
    state,
    /** True only while a read is in flight; never stuck (12 s timeout). */
    loading: state === 'loading',
    rows: mergedRows,
    headcount,
    refetch,
  };
}
