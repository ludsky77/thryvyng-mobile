/**
 * THE FAMILY'S OWN MESSAGES, across the whole book — PLAYBOOK-COVER-POLISH.
 *
 * WHY THIS IS NOT IN `rpc.ts`. The mirrored `fetchMyQuestions(playerId,
 * chapterId)` is per CHAPTER, because the only screen that wanted it was the
 * end-of-chapter one. The cover's "Your messages" block and the See-all screen
 * want every chapter at once, and `rpc.ts` is a declared byte-identical mirror
 * of the web's (`MIRROR.md`) — so the wider read lives here instead, next to
 * `coachRpc.ts`, which exists for the same reason.
 *
 * IT IS NOT A NEW PERMISSION. Both reads below are the same two tables the
 * family already reads, under the same policies: `playbook_questions`'s SELECT
 * is `sender_user_id = auth.uid() OR playbook_is_player_family(...) OR
 * playbook_can_answer_for_player(...)`, and the replies inherit those three
 * arms through `playbook_question_visible` (migration `20261102033000`
 * :200-225). Dropping the `chapter_id` filter asks for MORE ROWS, never for
 * wider access: a row this reader may not see is a row the policy withholds.
 *
 * ONE EXTRA COLUMN over the mirrored read — `kind`, the column the same
 * migration added, because the list prints the Question / Comment / Suggestion
 * word the family chose.
 */

import { supabase } from '../../lib/supabase';

/** The untyped door, the same shim shape `rpc.ts` and `coachRpc.ts` use. */
type Result = { data: unknown; error: unknown };

interface Query extends PromiseLike<Result> {
  select: (cols: string) => Query;
  eq: (col: string, val: unknown) => Query;
  in: (col: string, vals: unknown[]) => Query;
  order: (col: string, opts?: { ascending?: boolean }) => Query;
}

interface UntypedClient {
  from: (t: string) => Query;
}

const db = supabase as unknown as UntypedClient;

function unwrap<T>(res: Result): T {
  if (res.error) throw res.error;
  return res.data as T;
}

export interface MyReply {
  id: string;
  body: string;
  created_at: string;
}

/** One message the family sent, with its replies already attached. */
export interface MyMessage {
  id: string;
  kind: string;
  status: 'open' | 'answered' | 'closed';
  body: string;
  created_at: string;
  chapter_id: string;
  card_id: string | null;
  /** Oldest first, so the LAST one is the newest — see `latestReplyAt`. */
  replies: MyReply[];
}

/**
 * When the coach last wrote on this message, or null if nobody has.
 *
 * THREAD-STAMP-TIME (Lu, Nov 2 device test): an answered message's age is the
 * age of the LATEST REPLY, not of the question — "answered 5 min ago" is the
 * fact a family or a coach is reading for. One function so the cover block,
 * the See-all screen, the staff thread and the inbox cannot disagree.
 */
export function latestReplyAt(m: MyMessage): string | null {
  if (!m.replies.length) return null;
  return m.replies[m.replies.length - 1].created_at;
}

/** The age that belongs on this message: the reply's if there is one. */
export function messageAgeAt(m: MyMessage): string {
  return latestReplyAt(m) ?? m.created_at;
}

/**
 * Every message this player's family has sent, newest first, with replies.
 *
 * TWO QUERIES AND NOT N+1: the replies arrive in one `in (...)` the way the
 * mirrored per-chapter read does it, and a reader with no messages pays for
 * one query and stops — which is also the empty state the cover block hides
 * itself on.
 */
export async function fetchMyMessages(playerId: string): Promise<MyMessage[]> {
  const qRes = await db
    .from('playbook_questions')
    .select('id, kind, chapter_id, card_id, body, status, created_at')
    .eq('player_id', playerId)
    .order('created_at', { ascending: false });
  const rows =
    unwrap<
      {
        id: string;
        kind: string | null;
        chapter_id: string;
        card_id: string | null;
        body: string;
        status: 'open' | 'answered' | 'closed';
        created_at: string;
      }[]
    >(qRes) || [];
  if (!rows.length) return [];

  const rRes = await db
    .from('playbook_question_replies')
    .select('id, question_id, body, created_at')
    .in(
      'question_id',
      rows.map((r) => r.id)
    )
    .order('created_at', { ascending: true });
  const replies = unwrap<(MyReply & { question_id: string })[]>(rRes) || [];

  const byQuestion = new Map<string, MyReply[]>();
  for (const r of replies) {
    const list = byQuestion.get(r.question_id) || [];
    list.push({ id: r.id, body: r.body, created_at: r.created_at });
    byQuestion.set(r.question_id, list);
  }

  return rows.map((r) => ({
    id: r.id,
    // A row written by the four-argument send has the column's own default.
    kind: r.kind || 'question',
    status: r.status,
    body: r.body,
    created_at: r.created_at,
    chapter_id: r.chapter_id,
    card_id: r.card_id,
    replies: byQuestion.get(r.id) || [],
  }));
}
