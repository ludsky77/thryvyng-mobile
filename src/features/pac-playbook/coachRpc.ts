/**
 * The coach track's database calls — the five objects migration
 * `20261102033000_playbook_coach_track.sql` added, applied to prod
 * 2026-11-02.
 *
 * WHY THIS IS A SEPARATE FILE FROM `rpc.ts`. `rpc.ts` is a declared MIRROR of
 * the web's (`MIRROR.md`): the same thirteen functions, byte for byte, so one
 * reader never sees something the other cannot. The coach track is mobile
 * FIRST — the web has no roster, no inbox and no kind chips yet (Lu, 2026-11-02)
 * — so putting these here keeps that mirror honest. When the web slice lands,
 * the two files can be compared and merged on purpose rather than by accident.
 *
 * Nothing in here is a new permission. Every function below is `SECURITY
 * DEFINER` on the server and decides for itself who may call it; the client
 * only asks. The two gates worth naming, because the UI is built on them:
 *
 *   PROGRESS (ruling R1) — `playbook_can_see_player`: family, the player's
 *   team staff INCLUDING managers, and the club-wide director set.
 *   INBOX (ruling R2) — `playbook_can_answer_for_player`: the player's
 *   head/assistant COACHES, or the club-wide set. **Managers are not in it**,
 *   which is why the Questions row is hidden rather than empty for them.
 *
 * Refusals come back as Postgres errors and go through `playbookErrorMessage`
 * exactly as the rest of the book's writes do (ruling R-5).
 */

import { supabase } from '../../lib/supabase';
import type { Bilingual } from './types';

/** The untyped door, the same shim shape `rpc.ts` uses and for the reason. */
type Result = { data: unknown; error: unknown };

interface Query extends PromiseLike<Result> {
  select: (cols: string) => Query;
  eq: (col: string, val: unknown) => Query;
  order: (col: string, opts?: { ascending?: boolean }) => Query;
}

interface UntypedClient {
  from: (t: string) => Query;
  rpc: (f: string, a?: Record<string, unknown>) => PromiseLike<Result>;
}

const db = supabase as unknown as UntypedClient;

function unwrap<T>(res: Result): T {
  if (res.error) throw res.error;
  return res.data as T;
}

/* --------------------------------------------------------------- the kinds */

/**
 * The three chips, and they are the CHECK constraint's own values —
 * `kind IN ('question','comment','suggestion')` (migration :121). Lu's
 * wording: Question / Comment / Suggestion · Pregunta / Comentario /
 * Sugerencia.
 */
export type QuestionKind = 'question' | 'comment' | 'suggestion';

export const QUESTION_KINDS: QuestionKind[] = ['question', 'comment', 'suggestion'];

export function kindLabel(kind: string, es: boolean): string {
  if (kind === 'comment') return es ? 'Comentario' : 'Comment';
  if (kind === 'suggestion') return es ? 'Sugerencia' : 'Suggestion';
  return es ? 'Pregunta' : 'Question';
}

/* ---------------------------------------------------------------- the rows */

/** `playbook_staff_roster()` — one row per player the caller may SEE (R1). */
export interface RosterRow {
  player_id: string;
  first_name: string | null;
  last_name: string | null;
  player_status: string | null;
  team_id: string | null;
  team_name: string | null;
  club_id: string | null;
  /** 'team' = an active `team_staff` row; 'club' = the director set. */
  via: 'team' | 'club';
  got_it_count: number;
  total_cards: number;
  quiz_best_score: number | null;
  quiz_best_medal: 'none' | 'silver' | 'gold' | null;
  quiz_last_score: number | null;
  quiz_runs: number;
  quiz_last_run_at: string | null;
  last_activity_at: string | null;
}

/** `playbook_staff_inbox()` — one row per question the caller may ANSWER (R2). */
export interface InboxRow {
  question_id: string;
  kind: string;
  status: 'open' | 'answered' | 'closed';
  body: string;
  created_at: string;
  player_id: string;
  first_name: string | null;
  last_name: string | null;
  team_id: string | null;
  team_name: string | null;
  chapter_id: string;
  chapter_key: string;
  /** `playbook_chapters.content->'name'`, so it arrives bilingual. */
  chapter_name: Bilingual | null;
  card_id: string | null;
  card_key: string | null;
  card_name: Bilingual | null;
  sender_user_id: string;
  sender_kind: 'player' | 'parent' | 'other';
  reply_count: number;
  last_reply_at: string | null;
}

export interface ThreadReply {
  id: string;
  question_id: string;
  body: string;
  created_at: string;
  author_user_id: string | null;
}

/* ------------------------------------------------------------- the reads */

/**
 * Every player the caller may see, with their progress already counted.
 *
 * ONE ROUND TRIP, and that is the point: the server totals `got_it_count`
 * against the published card count and joins the quiz row, so the list screen
 * makes one call instead of three per player. `p_team_id` narrows it to one
 * team; `null` is every team the caller reaches.
 */
export async function fetchStaffRoster(teamId?: string | null): Promise<RosterRow[]> {
  const res = await db.rpc('playbook_staff_roster', { p_team_id: teamId ?? null });
  return unwrap<RosterRow[]>(res) || [];
}

/** 'open' | 'answered' | 'closed' | 'all' — the server rejects anything else. */
export async function fetchStaffInbox(status: string = 'open'): Promise<InboxRow[]> {
  const res = await db.rpc('playbook_staff_inbox', { p_status: status });
  return unwrap<InboxRow[]>(res) || [];
}

/**
 * One thread's replies, read straight from the table.
 *
 * No RPC for this and none needed: `playbook_question_replies`'s SELECT policy
 * is `playbook_question_visible`, whose three arms are the sender, the family
 * and the answerers (migration :200-216) — the same set that could open the
 * thread in the first place. A manager cannot read it, which is R2 again.
 */
export async function fetchThreadReplies(questionId: string): Promise<ThreadReply[]> {
  const res = await db
    .from('playbook_question_replies')
    .select('id, question_id, body, created_at, author_user_id')
    .eq('question_id', questionId)
    .order('created_at', { ascending: true });
  return unwrap<ThreadReply[]>(res) || [];
}

/* ------------------------------------------------------------- the writes */

/**
 * Staff answer. The SERVER sets `status = 'answered'` and fires the push to
 * the asker and the family (R3) — the client does neither, so a reply that
 * lands is a reply that notified.
 */
export async function replyQuestion(questionId: string, body: string): Promise<void> {
  unwrap(await db.rpc('playbook_reply_question', { p_question_id: questionId, p_body: body }));
}

/**
 * The family's send, now with a kind — the FIVE-argument overload.
 *
 * The four-argument form still exists on the server as a wrapper so an old
 * build keeps working (migration :379-396); this app calls the five, and
 * `rpc.ts`'s mirrored four-arg `sendQuestion` is left exactly as it is.
 */
export async function sendQuestionWithKind(
  playerId: string,
  chapterId: string,
  cardId: string | null,
  body: string,
  kind: QuestionKind
): Promise<void> {
  unwrap(
    await db.rpc('playbook_send_question', {
      p_player_id: playerId,
      p_chapter_id: chapterId,
      p_card_id: cardId,
      p_body: body,
      p_kind: kind,
    })
  );
}

/* --------------------------------------------------------------- the gate */

/** The signed-in user's own id, for the one predicate that takes one. */
export async function currentUserId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getUser();
    return data?.user?.id ?? null;
  } catch {
    return null;
  }
}

/** `playbook_can_answer_for_player` — coach or club-wide, never a manager. */
export async function canAnswerForPlayer(userId: string, playerId: string): Promise<boolean> {
  const res = await db.rpc('playbook_can_answer_for_player', {
    p_user_id: userId,
    p_player_id: playerId,
  });
  return unwrap<boolean>(res) === true;
}

/**
 * MAY THIS VIEWER ANSWER ANYTHING? — what hides the Questions row for a team
 * manager (R2: managers NEVER see the inbox entry).
 *
 * There is no one-call "am I an answerer" flag on the server, and the roster
 * cannot tell us: it reports `via` ('team' | 'club'), and a `team` row is any
 * active `team_staff` row — head coach, assistant coach OR team manager
 * (migration :152-169 admits only the first two). So the question is asked of
 * the predicate itself.
 *
 * ONE PROBE PER DISTINCT (via, team), NOT per player, and it stops at the
 * first yes. A coach of one team asks once; a director asks once; a manager of
 * k teams asks k times and gets k noes, which is the only case that pays full
 * price and is also the case with no inbox to load afterwards. The mixed case
 * this exists for — manager of team A, coach of team B — would answer wrongly
 * if we probed only the first player.
 */
export async function canAnswerAnything(roster: RosterRow[]): Promise<boolean> {
  if (!roster.length) return false;
  const uid = await currentUserId();
  if (!uid) return false;
  const seen = new Set<string>();
  const probes: string[] = [];
  for (const r of roster) {
    const key = `${r.via}:${r.team_id ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    probes.push(r.player_id);
  }
  for (const playerId of probes) {
    try {
      if (await canAnswerForPlayer(uid, playerId)) return true;
    } catch {
      // A refusal is a "no", not a crash: the row simply stays hidden.
    }
  }
  return false;
}

/**
 * A question's chapter and card, for a push tap.
 *
 * The `playbook_answer` push carries `question_id`, `player_id`, `card_key`
 * and `kind` but no chapter — and the family's messages live on the
 * END-OF-CHAPTER screen, so the chapter is exactly what the tap needs. The
 * sender can read their own row (`sender_user_id = auth.uid()` is the first
 * arm of the SELECT policy), so this is a table read and not another RPC.
 */
export async function fetchQuestionWhere(
  questionId: string
): Promise<{ chapter_id: string; card_id: string | null } | null> {
  const res = await db
    .from('playbook_questions')
    .select('chapter_id, card_id')
    .eq('id', questionId);
  const rows = unwrap<{ chapter_id: string; card_id: string | null }[]>(res) || [];
  return rows[0] ?? null;
}
