/**
 * Club announcement CARDS — the one place the client/server contract lives.
 *
 * Ruling 2026-11-03 01:57 (Lu): a feed of cards → tap → the full message →
 * emoji reactions only, no replies; staff compose with a title, a message and
 * up to three buttons, with a live preview. Recon:
 * `docs/recon/club-announcements.md` (§B6–B12, §LB-1..5, §P-1..5) and
 * `docs/recon/club-announcements-v1-mobile.md` (this build).
 *
 * THE SERVER SIDE IS NOT APPLIED YET. It is being prepared in the web repo in
 * parallel, so every read and write here is written against the agreed shape
 * and is required to DEGRADE rather than crash while it is absent:
 *
 *   comm_messages.title       text NULL, ≤ 80 chars. The content of a titled
 *                             message is `title + "\n\n" + body`, so a client
 *                             that has never heard of the column still renders
 *                             a readable message — which matters because
 *                             `comm_messages` rows are drawn by BOTH apps
 *                             (recon §LB-3a).
 *   comm_message_actions      (message_id, kind, target, label, sort_order).
 *                             `kind` is one of 'playbook' | 'playbook_card' |
 *                             'courses'; `target` carries the CARD KEY for
 *                             'playbook_card' and is unused by the other two.
 *                             Members may SELECT. NOBODY inserts directly.
 *   post_club_announcement(p_channel_id uuid, p_title text, p_body text,
 *                          p_actions jsonb) → the new message's id.
 *                             The server refuses a non-staff caller. This is
 *                             the ONLY door: the client never inserts a
 *                             `comm_message_actions` row and never writes
 *                             `title` itself.
 *
 * WHO MAY POST is the server's answer and nothing else's — `is_channel_staff`,
 * the same predicate the `msg_insert` policy asks (ruling FND-4d3, and
 * `./channelStaff`). Every gate in this feature calls that RPC; none of them
 * consults a client-side role list. `src/lib/permissions.ts`'s role list is
 * the mistake that rule exists to prevent.
 *
 * NOTHING HERE ENFORCES ANYTHING. The validation below decides what the
 * compose screen will let someone TRY; the refusal always comes from the
 * server, and its own sentence is preferred over any constant in this file.
 */
import { supabase } from './supabase';
import { isAnnounceCardKey } from '../constants/announceCardKey';

/** The agreed ceiling on `comm_messages.title`. The server owns the real one. */
export const ANNOUNCEMENT_TITLE_MAX = 80;

/** How many buttons one announcement may carry (ruling 2026-11-03 01:57). */
export const ANNOUNCEMENT_MAX_ACTIONS = 3;

/**
 * How long a card's fallback title may be when the message has no `title` —
 * every message posted before the column existed, and any plain chat message
 * a staff member sent into this channel.
 *
 * The same ~80 as the column, on purpose: recon §B7 chose the number so a card
 * title and a derived one occupy the same space.
 */
export const ANNOUNCEMENT_PREVIEW_CHARS = 80;

/* ────────────────────────────── actions ──────────────────────────────── */

/**
 * The destination allow-list. Three kinds, and all three are in-app
 * navigation that already exists (recon §LB-2):
 *
 *   playbook       Main → HomeTab → Playbook              (the cover)
 *   playbook_card  the same route with `params.card`       (one card)
 *   courses        Main → HomeTab → Courses
 *
 * A calendar event was the fourth candidate in §LB-2 and is NOT in v1: it
 * needs an event id picked at compose time, which is its own screen.
 */
export const ANNOUNCEMENT_ACTION_KINDS = [
  'playbook',
  'playbook_card',
  'courses',
] as const;

export type AnnouncementActionKind = (typeof ANNOUNCEMENT_ACTION_KINDS)[number];

/** One row of `comm_message_actions`, as this app reads it. */
export interface AnnouncementAction {
  kind: AnnouncementActionKind;
  /** The card key, for `playbook_card` only. Null for the other two kinds. */
  target: string | null;
  /** What the button says. The server stores it; the client never invents it. */
  label: string;
  sort_order: number;
}

/** The default button text for each kind, offered in compose and editable. */
export const ANNOUNCEMENT_ACTION_LABELS: Record<AnnouncementActionKind, string> = {
  playbook: 'Open the Playbook',
  playbook_card: 'Open this card',
  courses: 'Open Courses',
};

export function isAnnouncementActionKind(
  value: unknown
): value is AnnouncementActionKind {
  return (
    typeof value === 'string' &&
    (ANNOUNCEMENT_ACTION_KINDS as readonly string[]).includes(value)
  );
}

/**
 * Is this button sendable?
 *
 * `playbook_card` MUST carry a key-shaped target — the one test, shared with
 * the push branch (`src/constants/announceCardKey.ts`). Whether a card by that
 * key exists, and whether this viewer's book holds it, is the READER's
 * question and is deliberately not asked here (see that file).
 */
export function isSendableAction(action: {
  kind: unknown;
  target?: string | null;
  label?: string | null;
}): boolean {
  if (!isAnnouncementActionKind(action.kind)) return false;
  if (!action.label?.trim()) return false;
  if (action.kind === 'playbook_card') return isAnnounceCardKey(action.target);
  return true;
}

/**
 * The `p_actions` jsonb the RPC is handed. Built here so the compose screen
 * cannot send a shape the server has not agreed to: unsendable rows are
 * DROPPED rather than sent and refused, and `sort_order` is assigned from the
 * surviving order so it is always 0..n-1 with no gaps.
 *
 * `target` is null for every kind but `playbook_card` — a stray key on a
 * `courses` button would be a second, silent destination.
 */
export function buildAnnouncementActionsPayload(
  actions: ReadonlyArray<{ kind: AnnouncementActionKind; target?: string | null; label: string }>
): Array<{ kind: AnnouncementActionKind; target: string | null; label: string; sort_order: number }> {
  return actions
    .filter((action) => isSendableAction(action))
    .slice(0, ANNOUNCEMENT_MAX_ACTIONS)
    .map((action, index) => ({
      kind: action.kind,
      target: action.kind === 'playbook_card' ? (action.target as string).trim() : null,
      label: action.label.trim(),
      sort_order: index,
    }));
}

/* ─────────────────────── title / body derivation ─────────────────────── */

export interface AnnouncementTextFields {
  title?: string | null;
  content?: string | null;
}

export interface AnnouncementText {
  /**
   * The card's headline. The row's own `title` when it has one; otherwise the
   * first ~80 characters of the content, which is what every message posted
   * before the column existed has to fall back to (recon §B7-c).
   */
  cardTitle: string;
  /** True when `cardTitle` came from the COLUMN, not from the content. */
  hasTitle: boolean;
  /**
   * The body to render under the title. For a titled row this is the content
   * with the leading `title + "\n\n"` removed, so the detail screen does not
   * print the headline twice. For an untitled row it is the whole content.
   */
  body: string;
}

/**
 * Split one row into what the card shows and what the detail screen shows.
 *
 * THE TITLE IS NOT ASSUMED TO BE A PREFIX. The contract says a titled
 * message's content IS `title + "\n\n" + body`, and the strip below is an
 * `if`, not a slice: a row whose content does not start with its title (an
 * edit on either app, a web client that writes the two independently) keeps
 * its content whole rather than losing its first line.
 */
export function splitAnnouncement(row: AnnouncementTextFields): AnnouncementText {
  const content = (row.content ?? '').trim();
  const title = row.title?.trim() ?? '';

  if (title) {
    const prefix = `${title}\n\n`;
    const body = content.startsWith(prefix)
      ? content.slice(prefix.length).trim()
      : content === title
        ? ''
        : content;
    return { cardTitle: title, hasTitle: true, body };
  }

  return {
    cardTitle: announcementPreview(content),
    hasTitle: false,
    body: content,
  };
}

/** The first ~80 characters of a message, on one line, with an ellipsis. */
export function announcementPreview(content: string | null | undefined): string {
  const flat = (content ?? '').replace(/\s+/g, ' ').trim();
  if (!flat) return '(no message)';
  if (flat.length <= ANNOUNCEMENT_PREVIEW_CHARS) return flat;
  return `${flat.slice(0, ANNOUNCEMENT_PREVIEW_CHARS - 1).trimEnd()}…`;
}

/**
 * The content one `post_club_announcement` call will store.
 *
 * Built CLIENT-SIDE and sent as `p_body` alongside `p_title`: the server
 * composes the row. This function exists for the live PREVIEW, so the card
 * drawn in compose is built from the same two strings the feed will split
 * apart — the one way the preview and the posted card cannot disagree.
 */
export function composeAnnouncementContent(title: string, body: string): string {
  const t = title.trim();
  const b = body.trim();
  if (!t) return b;
  if (!b) return t;
  return `${t}\n\n${b}`;
}

/* ───────────────────────── the server contract ───────────────────────── */

/** The one state shown while the server side is not applied yet. */
export const ANNOUNCEMENTS_SETUP_PENDING_MESSAGE =
  'Announcements are being set up';
export const ANNOUNCEMENTS_SETUP_PENDING_DETAIL =
  'This club’s announcement cards go live with the next update. Messages in this chat are not affected.';

/**
 * The error codes that mean "the agreed object is not there yet", and nothing
 * else.
 *
 * `42703` undefined_column — `comm_messages.title`
 * `42P01` undefined_table  — `comm_message_actions`
 * `42883` undefined_function — `post_club_announcement`
 * `PGRST202` PostgREST could not find the function in its schema cache
 * `PGRST204` / `PGRST205` PostgREST could not find the column / the table
 *
 * THE LIST IS DELIBERATELY SHORT. The screens show the "being set up" state
 * ONLY for these; an RLS refusal (`42501`), a 500 and offline each keep their
 * own sentence, because telling someone the feature is "being set up" when the
 * truth is "we could not reach the server" is the exact mistake
 * `getClubAnnouncementsChannel` was written to stop making (recon §FC-3).
 */
const CONTRACT_MISSING_CODES = [
  '42703',
  '42P01',
  '42883',
  'PGRST202',
  'PGRST204',
  'PGRST205',
];

type MaybePostgrestError =
  | { code?: string | null; hint?: string | null; message?: string | null }
  | null
  | undefined;

/** Does this error mean the server side has not been applied yet? */
export function isAnnouncementContractMissing(error: MaybePostgrestError): boolean {
  const code = error?.code;
  if (!code) return false;
  return CONTRACT_MISSING_CODES.includes(code);
}

export type AnnouncementContractState =
  /** `title` and `comm_message_actions` both answered. */
  | { status: 'ready' }
  /** One of them is not there yet — show the "being set up" state. */
  | { status: 'pending' }
  /** We could not ask. Not the same thing, and not the same sentence. */
  | { status: 'error'; error: unknown };

/**
 * Is the server side applied?
 *
 * Two of the cheapest possible reads — one row's `id, title`, and one
 * `message_id` from the actions table — asked once when a screen opens.
 * `title` cannot be probed through `select('*')` (the shape this app's message
 * fetch uses): a missing column simply does not come back, which is
 * indistinguishable from a message that has no title.
 *
 * Scoped to the channel so the read is covered by the membership the viewer
 * already has; a non-member gets an RLS refusal, which is `status: 'error'` and
 * NOT "being set up".
 */
export async function checkAnnouncementContract(
  channelId: string
): Promise<AnnouncementContractState> {
  const { error: titleError } = await supabase
    .from('comm_messages')
    .select('id, title')
    .eq('channel_id', channelId)
    .limit(1);
  if (titleError) {
    return isAnnouncementContractMissing(titleError)
      ? { status: 'pending' }
      : { status: 'error', error: titleError };
  }

  const { error: actionsError } = await supabase
    .from('comm_message_actions')
    .select('message_id')
    .limit(1);
  if (actionsError) {
    return isAnnouncementContractMissing(actionsError)
      ? { status: 'pending' }
      : { status: 'error', error: actionsError };
  }

  return { status: 'ready' };
}

/**
 * The buttons on one announcement, in `sort_order`.
 *
 * `{ data, error }` rather than a bare array, for the same reason
 * `getClubAnnouncementsChannel` returns both: "this announcement has no
 * buttons" and "we could not ask for them" must not render the same way.
 * A row whose `kind` is not on the allow-list is DROPPED — an unknown kind is
 * a destination this build cannot navigate to, and a dead button is worse than
 * no button.
 */
export async function fetchAnnouncementActions(
  messageIds: readonly string[]
): Promise<{ data: Map<string, AnnouncementAction[]>; error: unknown | null }> {
  const empty = new Map<string, AnnouncementAction[]>();
  if (messageIds.length === 0) return { data: empty, error: null };

  const { data, error } = await supabase
    .from('comm_message_actions')
    .select('message_id, kind, target, label, sort_order')
    .in('message_id', [...messageIds])
    .order('sort_order', { ascending: true });

  if (error) return { data: empty, error };

  /** What the select above returns, before any of it is trusted. */
  type ActionRow = {
    message_id?: string | null;
    kind?: string | null;
    target?: string | null;
    label?: string | null;
    sort_order?: number | null;
  };

  const byMessage = new Map<string, AnnouncementAction[]>();
  ((data ?? []) as ActionRow[]).forEach((row) => {
    if (!row?.message_id || !isAnnouncementActionKind(row.kind)) return;
    const label = typeof row.label === 'string' ? row.label.trim() : '';
    if (!label) return;
    const action: AnnouncementAction = {
      kind: row.kind,
      target: typeof row.target === 'string' ? row.target : null,
      label,
      sort_order: typeof row.sort_order === 'number' ? row.sort_order : 0,
    };
    // Same rule as compose: a card button with no usable key is not rendered.
    if (action.kind === 'playbook_card' && !isAnnounceCardKey(action.target)) {
      return;
    }
    const list = byMessage.get(row.message_id) ?? [];
    list.push(action);
    byMessage.set(row.message_id, list);
  });

  return { data: byMessage, error: null };
}

/* ──────────────────────────── the one write ──────────────────────────── */

/**
 * The hint sentinels `post_club_announcement` is expected to raise with, in the
 * shape `close_poll` and `set_channel_announcement_mode` already use
 * (`./channelStaff`, `./announcementChannel`).
 *
 * PROVISIONAL — the function is not applied yet, so these names are the
 * convention and not a read fact. Nothing depends on being right about them:
 * `describePostAnnouncementFailure` prefers the SERVER'S OWN MESSAGE and only
 * falls back to the map below when a layer in between dropped it. If the
 * applied function uses other names, the sentences below are simply never
 * reached and the server's words are shown instead.
 */
const NOT_CHANNEL_STAFF_HINT = 'not_channel_staff';
const CHANNEL_NOT_FOUND_HINT = 'channel_not_found';
const TITLE_TOO_LONG_HINT = 'title_too_long';
const BODY_REQUIRED_HINT = 'body_required';
const ACTIONS_INVALID_HINT = 'actions_invalid';

export const POST_ANNOUNCEMENT_REFUSED_MESSAGE =
  'Only a coach, manager or club admin of this chat can post an announcement';
export const POST_ANNOUNCEMENT_CHANNEL_NOT_FOUND_MESSAGE = 'Chat not found';
export const POST_ANNOUNCEMENT_TITLE_TOO_LONG_MESSAGE = `Keep the title to ${ANNOUNCEMENT_TITLE_MAX} characters or fewer`;
export const POST_ANNOUNCEMENT_BODY_REQUIRED_MESSAGE =
  'Write a message before sending';
export const POST_ANNOUNCEMENT_ACTIONS_INVALID_MESSAGE =
  'One of the buttons could not be saved. Check the card key and try again.';
/** Shown when the call never got an answer — offline, 500, dropped request. */
export const POST_ANNOUNCEMENT_FAILED_MESSAGE =
  'Could not send this announcement. Please try again.';

/**
 * The sentence to show when the RPC refused.
 *
 * The server's own message first, so the copy lives in ONE place — the
 * function — and an ERRCODE this client has never heard of still reads as a
 * sentence rather than as "something went wrong".
 */
export function describePostAnnouncementFailure(error: MaybePostgrestError): string {
  const message = error?.message?.trim();
  if (message) return message;
  switch (error?.hint) {
    case CHANNEL_NOT_FOUND_HINT:
      return POST_ANNOUNCEMENT_CHANNEL_NOT_FOUND_MESSAGE;
    case NOT_CHANNEL_STAFF_HINT:
      return POST_ANNOUNCEMENT_REFUSED_MESSAGE;
    case TITLE_TOO_LONG_HINT:
      return POST_ANNOUNCEMENT_TITLE_TOO_LONG_MESSAGE;
    case BODY_REQUIRED_HINT:
      return POST_ANNOUNCEMENT_BODY_REQUIRED_MESSAGE;
    case ACTIONS_INVALID_HINT:
      return POST_ANNOUNCEMENT_ACTIONS_INVALID_MESSAGE;
    default:
      return POST_ANNOUNCEMENT_FAILED_MESSAGE;
  }
}

export type PostAnnouncementResult =
  | { status: 'ok'; messageId: string | null }
  /** The server said no, and said why. Show `message`. */
  | { status: 'refused'; message: string }
  /** The RPC does not exist yet — the "being set up" state, not a failure. */
  | { status: 'setup_pending' }
  /** We never got an answer. */
  | { status: 'error'; error: unknown };

/**
 * Post one announcement. THE ONE DOOR, and ONE call.
 *
 * Title, body and buttons go together in a single RPC on purpose: three
 * separate writes are what leaves a poll with options and no card when the
 * third one is refused (recon §P-4, `usePolls.createPoll`). Here, either the
 * message and its buttons both exist or neither does.
 *
 * An RLS refusal (`42501`) is reported as `refused`, not `error`: the server
 * declining a non-staff caller is a RULE, and the person needs the rule's
 * sentence rather than "try again".
 */
export async function postClubAnnouncement(args: {
  channelId: string;
  title: string;
  body: string;
  actions: ReadonlyArray<{ kind: AnnouncementActionKind; target?: string | null; label: string }>;
}): Promise<PostAnnouncementResult> {
  const { data, error } = await supabase.rpc('post_club_announcement', {
    p_channel_id: args.channelId,
    p_title: args.title.trim() || null,
    p_body: args.body.trim(),
    p_actions: buildAnnouncementActionsPayload(args.actions),
  });

  if (!error) {
    return { status: 'ok', messageId: typeof data === 'string' ? data : null };
  }

  if (isAnnouncementContractMissing(error)) return { status: 'setup_pending' };

  // P0001 is what a plpgsql RAISE reports as; 42501 is the RLS refusal. Both
  // are the server saying no, which is not the same as not answering.
  if (error.code === 'P0001' || error.code === '42501' || error.hint) {
    return { status: 'refused', message: describePostAnnouncementFailure(error) };
  }

  return { status: 'error', error };
}
