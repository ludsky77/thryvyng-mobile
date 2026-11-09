/**
 * Attendance: the pure half of the ONE source.
 *
 * Since 2026-11-09 the answer to "is this player coming?" is computed in the
 * database, not here. Two SECURITY DEFINER functions own it (web repo,
 * supabase/migrations/20261109013010_event_attendance_read_fns.sql):
 *
 *   * get_event_attendance(p_event_id)       -- one row per ACTIVE roster
 *     player: name, effective status, source, marked_at, and -- only for team
 *     staff / club admin -- marked_by_name and decline_reason.
 *   * get_events_attendance_counts(p_event_ids) -- {event_id, roster, going,
 *     cant_go, no_reply} per visible event.
 *
 * Latest-mark-wins, the coach-wins tie, the NULL player_id mapping and the
 * roster are all decided there, so every surface reads the same verdicts. What
 * used to live in this file (resolveEffectiveStatus and friends) is mirrored
 * in that SQL and was removed from the client when the last caller moved to
 * the functions.
 *
 * What stays here is pure -- no supabase, no React -- so node:test can cover
 * it: the request timeout, wire-row normalisation, the roster cap, and which
 * rows the viewer may answer for. src/hooks/useEventAttendance.ts wires it to
 * supabase.
 */

/** What the family can say. There is no Maybe: the DB CHECK rejects it. */
export type RsvpStatus = 'yes' | 'no' | 'pending';

/** What a coach can mark. late/excused have no UI but exist on older rows. */
export type CoachStatus = 'present' | 'absent' | 'late' | 'excused';

/** The single resolved answer every surface renders. */
export type EffectiveStatus = 'going' | 'cant_go' | 'no_reply';

/** Who said it. null only when nobody said anything. */
export type StatusSource = 'coach' | 'parent' | 'player' | null;

/** One row of get_event_attendance, normalised. */
export interface EventAttendanceRow {
  player_id: string;
  first_name: string;
  last_name: string;
  status: EffectiveStatus;
  source: StatusSource;
  marked_at: string | null;
  /** NULL unless the caller is team staff / club admin (enforced in SQL). */
  marked_by_name: string | null;
  /** NULL unless the caller is team staff / club admin (enforced in SQL). */
  decline_reason: string | null;
}

/** One row of get_events_attendance_counts, normalised and capped. */
export interface EventAttendanceCounts {
  event_id: string;
  roster: number;
  going: number;
  cant_go: number;
  no_reply: number;
}

/** Load states the UI can draw. There is no state that spins forever. */
export type AttendanceLoadState = 'loading' | 'ready' | 'empty' | 'error';

/** Every attendance read gives up after this long (ruling: no endless spinner). */
export const ATTENDANCE_TIMEOUT_MS = 12_000;

export class AttendanceTimeoutError extends Error {
  constructor(ms: number) {
    super(`attendance read timed out after ${ms} ms`);
    this.name = 'AttendanceTimeoutError';
  }
}

/**
 * Run `start(signal)` and reject after `ms`.
 *
 * The signal is aborted on timeout so a supabase builder given
 * `.abortSignal(signal)` actually cancels its fetch, rather than finishing in
 * the background after the UI has already moved on.
 */
export function withTimeout<T>(
  start: (signal: AbortSignal) => PromiseLike<T>,
  ms: number = ATTENDANCE_TIMEOUT_MS
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new AttendanceTimeoutError(ms));
    }, ms);
  });
  return Promise.race([Promise.resolve(start(controller.signal)), timeout]).finally(
    () => {
      if (timer) clearTimeout(timer);
    }
  );
}

const EFFECTIVE = new Set<EffectiveStatus>(['going', 'cant_go', 'no_reply']);
const SOURCES = new Set<string>(['coach', 'parent', 'player']);

function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

/**
 * Wire rows -> typed rows. Anything that is not one of the three statuses is
 * silence, never guessed (there is no Maybe). Rows without a player_id are
 * dropped: every row the function returns is a roster player, so one without
 * an id is not something we can draw or count.
 */
export function normalizeAttendanceRows(data: unknown): EventAttendanceRow[] {
  if (!Array.isArray(data)) return [];
  const out: EventAttendanceRow[] = [];
  const seen = new Set<string>();
  for (const raw of data) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const id = str(r.player_id);
    // One status per player: a duplicate id would be a second vote.
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const status = EFFECTIVE.has(r.status as EffectiveStatus)
      ? (r.status as EffectiveStatus)
      : 'no_reply';
    const source = SOURCES.has(r.source as string)
      ? (r.source as Exclude<StatusSource, null>)
      : null;
    out.push({
      player_id: id,
      first_name: str(r.first_name) ?? '',
      last_name: str(r.last_name) ?? '',
      status,
      source,
      marked_at: str(r.marked_at),
      marked_by_name: str(r.marked_by_name),
      decline_reason: str(r.decline_reason),
    });
  }
  return out;
}

/**
 * The headcount for one event, off the function's rows.
 *
 * roster = rows returned. Each row carries exactly one status, so going +
 * cantGo + noReply === roster by construction -- no count can exceed it.
 */
export function headcountFromRows(rows: EventAttendanceRow[]): {
  roster: number;
  going: number;
  cantGo: number;
  noReply: number;
  markedByCoach: number;
} {
  let going = 0;
  let cantGo = 0;
  let markedByCoach = 0;
  for (const r of rows) {
    if (r.status === 'going') going += 1;
    else if (r.status === 'cant_go') cantGo += 1;
    if (r.source === 'coach' && r.status !== 'no_reply') markedByCoach += 1;
  }
  return {
    roster: rows.length,
    going,
    cantGo,
    noReply: rows.length - going - cantGo,
    markedByCoach,
  };
}

function nonNegInt(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/**
 * Counts rows from get_events_attendance_counts, keyed by event_id.
 *
 * The SQL already guarantees going + cant_go + no_reply = roster (T5: 0 over
 * roster). This caps anyway, so a drifted function can never put a number on
 * screen that is larger than the roster: going first, then can't go from what
 * is left, and no reply is the remainder.
 */
export function normalizeCounts(data: unknown): Map<string, EventAttendanceCounts> {
  const map = new Map<string, EventAttendanceCounts>();
  if (!Array.isArray(data)) return map;
  for (const raw of data) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const id = str(r.event_id);
    if (!id) continue;
    const roster = nonNegInt(r.roster);
    const going = Math.min(nonNegInt(r.going), roster);
    const cant = Math.min(nonNegInt(r.cant_go), roster - going);
    map.set(id, {
      event_id: id,
      roster,
      going,
      cant_go: cant,
      no_reply: roster - going - cant,
    });
  }
  return map;
}

/** What a supabase call resolves to. Kept structural so tests can fake it. */
export interface RpcResult {
  data: unknown;
  error: unknown;
}

export interface AttendanceLoadResult {
  state: Exclude<AttendanceLoadState, 'loading'>;
  rows: EventAttendanceRow[];
  error?: unknown;
}

/**
 * One get_event_attendance read, settled into a drawable state.
 *
 * Never throws and never resolves to 'loading': an error, an RPC error or a
 * timeout all come back as 'error' with no rows (the UI shows an empty state
 * with Retry). Zero rows -- not on the team, or no active roster -- is
 * 'empty', which is a real answer, not a failure.
 */
export async function loadEventAttendance(
  call: (signal: AbortSignal) => PromiseLike<RpcResult>,
  timeoutMs: number = ATTENDANCE_TIMEOUT_MS
): Promise<AttendanceLoadResult> {
  try {
    const { data, error } = await withTimeout(call, timeoutMs);
    if (error) return { state: 'error', rows: [], error };
    const rows = normalizeAttendanceRows(data);
    return { state: rows.length > 0 ? 'ready' : 'empty', rows };
  } catch (error) {
    return { state: 'error', rows: [], error };
  }
}

/**
 * One get_events_attendance_counts read for many events.
 *
 * ok:false on any failure, and then the caller shows NO counts -- not zeros,
 * which would be a lie, and not a spinner.
 */
export async function loadAttendanceCounts(
  call: (signal: AbortSignal) => PromiseLike<RpcResult>,
  timeoutMs: number = ATTENDANCE_TIMEOUT_MS
): Promise<{ ok: boolean; counts: Map<string, EventAttendanceCounts>; error?: unknown }> {
  try {
    const { data, error } = await withTimeout(call, timeoutMs);
    if (error) return { ok: false, counts: new Map(), error };
    return { ok: true, counts: normalizeCounts(data) };
  } catch (error) {
    return { ok: false, counts: new Map(), error };
  }
}

/**
 * The rows this viewer answers for: their own player row, or one row per
 * child for a parent. Each gets its own RSVP control, and each write carries
 * that row's player_id -- a multi-kid parent never writes a NULL row again.
 *
 * Only players the function returned qualify, so a link to a player who is
 * not on this event's active roster gives no control.
 */
export function myAnswerRows(
  rows: EventAttendanceRow[],
  myPlayerIds: Iterable<string>
): EventAttendanceRow[] {
  const mine = new Set(myPlayerIds);
  if (mine.size === 0) return [];
  return rows.filter((r) => mine.has(r.player_id));
}

/**
 * The cal_event_rsvps status an RSVP control should show for a row: what the
 * player's ONE effective status is, in the family's vocabulary. A coach mark
 * shows too -- it is the answer of record until somebody says otherwise.
 */
export function pillStatusFor(status: EffectiveStatus): RsvpStatus | null {
  if (status === 'going') return 'yes';
  if (status === 'cant_go') return 'no';
  return null;
}

// --- labels ----------------------------------------------------------------

/** "Paula Quintero" -> "Paula Q."  Single-word names pass through. */
export function shortName(full: string | null | undefined): string | null {
  if (!full) return null;
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1].charAt(0).toUpperCase()}.`;
}

export function firstName(full: string | null | undefined): string | null {
  if (!full) return null;
  const first = full.trim().split(/\s+/)[0];
  return first || null;
}

const SOURCE_LABEL: Record<Exclude<StatusSource, null>, string> = {
  coach: 'by coach',
  parent: 'by parent',
  player: 'by player',
};

/**
 * The "by …" line under a row: "by parent", or "by parent · Paula Q." /
 * "by coach · Lu" when the function returned marked_by_name (staff / club
 * admin callers only).
 *
 * Null when nobody marked the player AND whenever the status is no_reply,
 * whatever the source (ruling 3b-2, Nov 9): "No reply · by parent" reads as
 * a contradiction, even though a retracted answer has an author.
 */
export function attributionLabel(row: EventAttendanceRow): string | null {
  if (!row.source || row.status === 'no_reply') return null;
  const label = SOURCE_LABEL[row.source];
  const name =
    row.source === 'coach' ? firstName(row.marked_by_name) : shortName(row.marked_by_name);
  return name ? `${label} · ${name}` : label;
}

// --- own decline reason ----------------------------------------------------

/** One of the viewer's OWN cal_event_rsvps rows (user_id = me, RLS-readable). */
export interface OwnRsvpRow {
  player_id: string | null;
  status: string | null;
  decline_reason: string | null;
  updated_at?: string | null;
  responded_at?: string | null;
}

/** greatest(updated_at, responded_at) -- the SQL's RSVP time. */
function rsvpMs(r: OwnRsvpRow): number | null {
  const ts = [r.updated_at, r.responded_at]
    .map((v) => (v ? new Date(v).getTime() : NaN))
    .filter((n) => !Number.isNaN(n));
  return ts.length ? Math.max(...ts) : null;
}

/**
 * Give a parent / player back the reason on THEIR OWN row(s) (ruling 3b-2).
 *
 * The function returns decline_reason only to staff, so for everyone else it
 * is NULL. Here the viewer's own cal_event_rsvps rows -- the only extra
 * source -- fill it in, for own rows only:
 *   * only rows whose player_id is one the viewer answers for; teammates'
 *     rows are returned untouched (their reason stays NULL);
 *   * only when the row is cant_go by a family answer (not a coach mark);
 *   * only from my newest row for that player that says 'no' -- the
 *     player_id row, or a legacy NULL row when I answer for exactly one
 *     player (the same attribution the SQL makes);
 *   * and, when both times are known, only if that row IS the winning answer
 *     (its time equals marked_at). Otherwise another parent's "no" won and
 *     my reason would be the wrong one.
 * A reason the function already returned is never overwritten.
 */
export function mergeOwnReasons(
  rows: EventAttendanceRow[],
  ownRsvps: OwnRsvpRow[],
  myPlayerIds: Iterable<string>
): EventAttendanceRow[] {
  const mine = new Set(myPlayerIds);
  if (mine.size === 0 || ownRsvps.length === 0) return rows;
  const nullRowsCount = mine.size === 1;

  return rows.map((row) => {
    if (!mine.has(row.player_id)) return row;
    if (row.decline_reason) return row;
    if (row.status !== 'cant_go' || row.source === 'coach' || row.source === null) return row;

    const candidates = ownRsvps.filter(
      (r) =>
        r.player_id === row.player_id || (r.player_id == null && nullRowsCount)
    );
    if (candidates.length === 0) return row;
    // My newest row for this player decides what I last said.
    const newest = candidates.reduce((a, b) =>
      (rsvpMs(b) ?? -Infinity) > (rsvpMs(a) ?? -Infinity) ? b : a
    );
    if (newest.status !== 'no' || !newest.decline_reason) return row;

    const wonAt = row.marked_at ? new Date(row.marked_at).getTime() : NaN;
    const mineAt = rsvpMs(newest);
    if (!Number.isNaN(wonAt) && mineAt !== null && mineAt !== wonAt) return row;

    return { ...row, decline_reason: newest.decline_reason };
  });
}
