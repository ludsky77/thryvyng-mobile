/**
 * Sharing a survey into a chat — the one place the `sv_chat_shares` contract
 * lives on mobile.
 *
 * WHY THIS FILE EXISTS. Both apps' "share a survey into chat" was broken, and
 * mobile was broken in four separate ways at once. The audit is
 * `thrive-and-score/docs/recon/club-announcements-v1-server.md` §7 (read-only,
 * 2026-11-03); the live column list is Lu's own read of the table, Q-05,
 * 2026-11-03 12:41 MDT:
 *
 *   sv_chat_shares(id default, survey_id NOT NULL, team_id NOT NULL,
 *                  shared_by NOT NULL, message_id NULL, shared_at default now())
 *
 * THERE IS NO `channel_id` AND NO `posted_by`. The old inline handler in
 * `TeamChatRoomScreen` wrote both of those and omitted `team_id`, so PostgREST
 * refused the row on an unknown column — and because neither insert's `error`
 * was ever destructured, the refusal was SILENT: the message landed, the share
 * row did not, and the card it would have drawn could never resolve.
 *
 * WHAT IS CENTRALISED HERE, and why it is not left in the screen:
 *   1. the column names, so a future rename is one edit rather than a hunt;
 *   2. the CONTENT FORMAT, which is a cross-app contract (see below);
 *   3. the two-step write with its rollback, which is the only part that can
 *      leave the database half-written;
 *   4. the read the card makes, so the write and the read can never disagree
 *      about what a column is called.
 * It also makes all four testable without a device: the screen cannot be
 * transpiled on its own, this module can — see `scripts/smoke/run.js`.
 *
 * NOTHING HERE ENFORCES ANYTHING. `sv_chat_shares`' own RLS decides whether
 * the row is allowed (audit §7c, tests V2/V3); the gate in the UI only decides
 * what is offered, and it asks the server the same question the policy asks
 * (`is_channel_staff`, via `./channelStaff`).
 */
import { supabase } from './supabase';

/**
 * The cross-app content format: `[SURVEY:<survey id>] <title>`.
 *
 * THIS IS A CONTRACT, not a cosmetic choice. The web card is found by reading
 * the survey id back out of `content` — `thrive-and-score`
 * `src/components/comm/ChatPanel.tsx:511` matches this exact shape and falls
 * through to a plain text bubble when it does not match. Mobile used to send
 * the bare title, so every mobile share rendered on web as the literal words
 * of the title with no card at all (audit §7d difference 5).
 *
 * Mobile does NOT need the prefix to draw its own card — it looks the share up
 * by message id in `sv_chat_shares` — which is precisely why this had to be
 * fixed deliberately: nothing on this side ever looked wrong.
 */
export const SURVEY_CONTENT_PATTERN = /\[SURVEY:([a-f0-9-]{36})\]/i;

/** The message body a share posts. Web's format, byte for byte. */
export function composeSurveyShareContent(
  surveyId: string,
  surveyTitle: string
): string {
  return `[SURVEY:${surveyId}] ${surveyTitle}`;
}

/**
 * The survey id carried by a message's content, or null.
 *
 * Mobile's own card does not need this. It is here so a renderer can tell a
 * real share apart from a `message_type 'survey'` row that carries no id, and
 * so the format is asserted in one place by the smoke.
 */
export function parseSharedSurveyId(
  content: string | null | undefined
): string | null {
  if (!content) return null;
  const match = SURVEY_CONTENT_PATTERN.exec(content);
  return match?.[1] ?? null;
}

/**
 * The one sentence a failed share shows. Ruled by Lu, 2026-11-03: the old
 * handler's only user-visible outcome was an alert on a thrown exception,
 * which supabase-js never throws — so a refusal said nothing at all.
 */
export const SURVEY_SHARE_FAILED_MESSAGE =
  "Couldn't share the survey. Try again.";

/**
 * Shown when the chat has no team. `sv_chat_shares.team_id` is NOT NULL with
 * no default, so a club chat or a DM cannot carry a share row — and a message
 * posted into one would be a permanent orphan whose card never resolves. This
 * is checked BEFORE anything is written, which is the only way to keep that
 * from happening at all.
 */
export const SURVEY_SHARE_NO_TEAM_MESSAGE =
  'Surveys can only be shared in a team chat.';

export type ShareSurveyFailure =
  /** The chat has no team, so no share row is possible. Nothing was written. */
  | { status: 'no-team'; message: string }
  /** The `comm_messages` insert was refused. Nothing was written. */
  | { status: 'message-failed'; message: string; error: unknown }
  /**
   * The message landed and the share row was refused. `rolledBack` says
   * whether the orphan message was soft-deleted; false means a bare
   * `[SURVEY:…]` row is still in the chat and the user has been told the
   * share failed.
   */
  | {
      status: 'share-failed';
      message: string;
      error: unknown;
      messageId: string;
      rolledBack: boolean;
    };

export type ShareSurveyResult =
  | { status: 'ok'; messageId: string }
  | ShareSurveyFailure;

/**
 * Post a survey into a chat: one `comm_messages` row, then one
 * `sv_chat_shares` row pointing at it.
 *
 * BOTH inserts' `error` is checked. supabase-js reports a refusal as a
 * RETURNED error, not a throw, so the old `try/catch` around bare `await`s
 * caught nothing and reported nothing (audit §7d difference 6).
 *
 * THE ROLLBACK. These are two writes with no transaction between them, and the
 * second one is the one RLS is most likely to refuse. If it fails after the
 * message has landed, the message is soft-deleted through
 * `soft_delete_message` — the SAME door the chat's own "delete my message"
 * action uses (`TeamChatRoomScreen.handleDeleteMessage`), so the row leaves
 * every reader's list exactly as a deleted message does, on web as well as
 * here. A failed rollback is reported rather than hidden: the caller still
 * shows the failure sentence, and `rolledBack: false` is on the result for
 * anything that wants to log it.
 *
 * `message_type` is `'survey'`, which the live CHECK on
 * `comm_messages.message_type` must list. Until the server migration's PART 6
 * applies it, EVERY share is refused at the first insert with `23514` — that
 * is the state the audit describes, and this path reports it instead of
 * swallowing it.
 */
export async function shareSurveyToChat(args: {
  channelId: string;
  /** The chat's team — `channelTeamId`, read off the channel row. */
  teamId: string | null | undefined;
  surveyId: string;
  surveyTitle: string;
  /** The signed-in user. `shared_by` is NOT NULL and must be them. */
  userId: string;
}): Promise<ShareSurveyResult> {
  if (!args.teamId) {
    return { status: 'no-team', message: SURVEY_SHARE_NO_TEAM_MESSAGE };
  }

  const { data: msgData, error: msgError } = await supabase
    .from('comm_messages')
    .insert({
      channel_id: args.channelId,
      user_id: args.userId,
      content: composeSurveyShareContent(args.surveyId, args.surveyTitle),
      message_type: 'survey',
    })
    .select('id')
    .single();

  const messageId = (msgData as { id?: string } | null)?.id ?? null;

  // No id means no row to point a share at, even when no error came back.
  if (msgError || !messageId) {
    return {
      status: 'message-failed',
      message: SURVEY_SHARE_FAILED_MESSAGE,
      error: msgError ?? new Error('comm_messages insert returned no id'),
    };
  }

  const { error: shareError } = await supabase.from('sv_chat_shares').insert({
    survey_id: args.surveyId,
    team_id: args.teamId,
    shared_by: args.userId,
    message_id: messageId,
  });

  if (shareError) {
    const { data: deleted, error: deleteError } = await supabase.rpc(
      'soft_delete_message',
      { p_message_id: messageId }
    );
    return {
      status: 'share-failed',
      message: SURVEY_SHARE_FAILED_MESSAGE,
      error: shareError,
      messageId,
      rolledBack: !deleteError && deleted !== false,
    };
  }

  return { status: 'ok', messageId };
}

/** One share row, as the card needs it. */
export interface SurveyShareCard {
  surveyId: string;
  /** `shared_by` — an id. The NAME is resolved separately, see below. */
  sharedBy: string | null;
  /** `shared_at`, the column's own name. The card used to read `created_at`. */
  sharedAt: string | null;
  title: string | null;
  closesAt: string | null;
  status: string | null;
  publicSlug: string | null;
}

/**
 * The share behind one message.
 *
 * NO PROFILE EMBED. The card used to ask for `poster:profiles!posted_by(...)`,
 * which named a column that does not exist AND assumed a declared foreign key
 * to `profiles` that nothing in this repo can confirm — and a direct read of
 * `profiles` is refused by RLS for an ordinary parent or player viewer anyway,
 * so even a correct embed would have returned nothing for most readers. The
 * name comes from `fetchChatProfileNames` (`get_chat_profiles`, SECURITY
 * DEFINER, gated on sharing a channel), which is the app-wide path for every
 * other person's name in a chat — ruling FND-1, `./memberNames`.
 *
 * `sv_surveys!inner` is kept: that FK is in the generated types the audit read
 * (§7d), and an inner join is what makes a share whose survey the viewer
 * cannot read resolve to nothing rather than to a card with no title.
 */
export async function fetchSurveyShare(
  messageId: string
): Promise<SurveyShareCard | null> {
  const { data, error } = await supabase
    .from('sv_chat_shares')
    .select(
      `
      survey_id,
      shared_by,
      shared_at,
      sv_surveys!inner(id, title, closes_at, status, public_slug)
    `
    )
    .eq('message_id', messageId)
    .maybeSingle();

  if (error || !data) return null;

  const row = data as {
    survey_id: string;
    shared_by: string | null;
    shared_at: string | null;
    sv_surveys?: {
      title?: string | null;
      closes_at?: string | null;
      status?: string | null;
      public_slug?: string | null;
    } | null;
  };
  const survey = row.sv_surveys ?? null;

  return {
    surveyId: row.survey_id,
    sharedBy: row.shared_by ?? null,
    sharedAt: row.shared_at ?? null,
    title: survey?.title ?? null,
    closesAt: survey?.closes_at ?? null,
    status: survey?.status ?? null,
    publicSlug: survey?.public_slug ?? null,
  };
}
