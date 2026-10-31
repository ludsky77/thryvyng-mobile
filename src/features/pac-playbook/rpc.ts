/**
 * Every database call the reader makes, in one file — the mobile ADAPT of the
 * web's `rpc.ts` (`thrive-and-score` @ `c772111`).
 *
 * The thirteen functions, their arguments, their selected columns and their
 * table names are the web's exactly: both apps hit the same eleven
 * `playbook_*` tables and the same six RPCs on the same project, so a
 * difference here would be a difference in what the two readers can see. Two
 * things are mobile's:
 *
 *   1. the client — `../../lib/supabase` instead of the web's
 *      `@/integrations/supabase/client` (this repo has no path alias; every
 *      import in `src/` is relative);
 *   2. the untyped shim — this app's generated types do not carry the
 *      playbook tables either (`grep -c playbook src/types` → 0), so the same
 *      narrow `UntypedClient` cast the web uses is kept here. When the types
 *      are regenerated this file is the only one that changes.
 *
 * Note `supabase.from` / `supabase.rpc` are called ON the instance. Detaching
 * either one loses `this`.
 *
 * READ vs WRITE, and what M3 does with them. The four writes below —
 * `setGotIt`, `startQuiz`, `submitQuiz`, `sendQuestion` — are shipped as
 * functions but are NOT called by any M3 screen: every call site carries a
 * `TODO(M-later)` and the UI shows the web reader's own state instead. They
 * live here now so the write prompt is a wire-up and not a rewrite, and so
 * the one call surface stays one file.
 */

import { supabase } from '../../lib/supabase';
import type {
  BlockRow,
  BookRow,
  ClubCrest,
  CardRow,
  ChapterRow,
  QuestionRow,
  QuizDeal,
  QuizGrade,
  QuizResultRow,
  ReplyRow,
  ViewerKind,
} from './types';

export const BOOK_SLUG = 'pac-playbook';

/** The untyped doors. Everything else in this file is typed on top of them. */
type Result = { data: unknown; error: unknown };

/** Just enough of PostgrestFilterBuilder for the nine queries below. */
interface Query extends PromiseLike<Result> {
  select: (cols: string) => Query;
  eq: (col: string, val: unknown) => Query;
  in: (col: string, vals: unknown[]) => Query;
  order: (col: string, opts?: { ascending?: boolean }) => Query;
  maybeSingle: () => PromiseLike<Result>;
}

interface UntypedClient {
  from: (t: string) => Query;
  rpc: (f: string, a?: Record<string, unknown>) => PromiseLike<Result>;
}

const db = supabase as unknown as UntypedClient;

const table = (name: string) => db.from(name);
const call = (fn: string, args?: Record<string, unknown>) => db.rpc(fn, args);

/** Anything the shim returns comes back as a Postgres error object or data. */
function unwrap<T>(res: Result): T {
  if (res.error) throw res.error;
  return res.data as T;
}

/* ----------------------------------------------------------- the content */

export async function fetchBook(): Promise<BookRow | null> {
  const res = await table('playbook_books')
    .select('id, slug, owner_club_id, author_name, meta, settings, published')
    .eq('slug', BOOK_SLUG)
    .maybeSingle();
  return unwrap<BookRow | null>(res);
}

/**
 * The book owner's club crest, for the header circle.
 *
 * Read through the `public_clubs` view rather than `clubs` directly, for the
 * reason the web states: the view is `security_invoker = false` and granted to
 * `anon, authenticated`, so it answers for a player and a parent exactly as it
 * does for a director. It lists approved clubs only, so an unapproved club
 * returns no row — the same fallback as a null logo, which is the text circle.
 */
export async function fetchClubCrest(clubId: string): Promise<ClubCrest | null> {
  const res = await table('public_clubs')
    .select('name, logo_url')
    .eq('id', clubId)
    .maybeSingle();
  return unwrap<ClubCrest | null>(res);
}

export async function fetchChapters(bookId: string): Promise<ChapterRow[]> {
  const res = await table('playbook_chapters')
    .select('id, key, n, sort, content')
    .eq('book_id', bookId)
    .order('sort', { ascending: true });
  return unwrap<ChapterRow[]>(res) || [];
}

export async function fetchCards(bookId: string): Promise<CardRow[]> {
  const res = await table('playbook_cards')
    .select('id, chapter_id, key, sort, style, diagram_key, content, published')
    .eq('book_id', bookId)
    .eq('published', true)
    .order('sort', { ascending: true });
  return unwrap<CardRow[]>(res) || [];
}

/**
 * All 53 blocks in one query — ~150 KB, and the reason this is NOT part of the
 * first fetch. The contents screen never needs a diagram; the first card does.
 */
export async function fetchBlocks(bookId: string): Promise<BlockRow[]> {
  const res = await table('playbook_blocks').select('kind, key, data').eq('book_id', bookId);
  return unwrap<BlockRow[]>(res) || [];
}

/* ---------------------------------------------------------- the progress */

export async function fetchProgress(playerId: string): Promise<string[]> {
  const res = await table('playbook_card_progress').select('card_id').eq('player_id', playerId);
  return (unwrap<{ card_id: string }[]>(res) || []).map((r) => r.card_id);
}

export async function fetchQuizResult(
  playerId: string,
  bookId: string
): Promise<QuizResultRow | null> {
  const res = await table('playbook_quiz_results')
    .select('best_score, best_medal, last_score, runs')
    .eq('player_id', playerId)
    .eq('book_id', bookId)
    .maybeSingle();
  return unwrap<QuizResultRow | null>(res);
}

/** Ruling R-4's "who is looking?" — the parent note comes from this. */
export async function fetchViewerKind(playerId: string): Promise<ViewerKind> {
  const data = unwrap<string | null>(await call('playbook_viewer_kind', { p_player_id: playerId }));
  return (data as ViewerKind) || 'none';
}

/* ------------------------------------------------------------ the writes */
/* NOT CALLED IN M3 — see the file header. Each caller is marked TODO(M-later). */

/** Family only (P0041 otherwise). `false` deletes the row. */
export async function setGotIt(playerId: string, cardId: string, value: boolean): Promise<void> {
  unwrap(
    await call('playbook_set_got_it', {
      p_player_id: playerId,
      p_card_id: cardId,
      p_value: value,
    })
  );
}

/** The SERVER deals the run (ruling R4). The client never picks questions. */
export async function startQuiz(playerId: string, bookId: string): Promise<QuizDeal> {
  return unwrap<QuizDeal>(
    await call('playbook_start_quiz', { p_player_id: playerId, p_book_id: bookId })
  );
}

/** The SERVER grades it. Single use — a second submit raises P0046. */
export async function submitQuiz(
  runId: string,
  answers: { key: string; choice?: string; x?: number; y?: number }[]
): Promise<QuizGrade> {
  return unwrap<QuizGrade>(
    await call('playbook_submit_quiz', { p_run_id: runId, p_answers: answers })
  );
}

export async function sendQuestion(
  playerId: string,
  chapterId: string,
  cardId: string | null,
  body: string
): Promise<void> {
  unwrap(
    await call('playbook_send_question', {
      p_player_id: playerId,
      p_chapter_id: chapterId,
      p_card_id: cardId,
      p_body: body,
    })
  );
}

/* ------------------------------------------------- the player's own inbox */

export async function fetchMyQuestions(
  playerId: string,
  chapterId: string
): Promise<{ questions: QuestionRow[]; replies: ReplyRow[] }> {
  const qRes = await table('playbook_questions')
    .select('id, chapter_id, card_id, body, status, created_at')
    .eq('player_id', playerId)
    .eq('chapter_id', chapterId)
    .order('created_at', { ascending: false });
  const questions = unwrap<QuestionRow[]>(qRes) || [];
  if (!questions.length) return { questions, replies: [] };

  const rRes = await table('playbook_question_replies')
    .select('id, question_id, body, created_at')
    .in(
      'question_id',
      questions.map((q) => q.id)
    )
    .order('created_at', { ascending: true });
  return { questions, replies: unwrap<ReplyRow[]>(rRes) || [] };
}
