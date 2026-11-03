/**
 * Club announcement CARDS — the one place the client/server contract lives.
 *
 * Ruling 2026-11-03 01:57 (Lu): a feed of cards → tap → the full message →
 * emoji reactions only, no replies; staff compose with a title, a message and
 * up to three buttons, with a live preview. Recon:
 * `docs/recon/club-announcements.md` (§B6–B12, §LB-1..5, §P-1..5) and
 * `docs/recon/club-announcements-v1-mobile.md` (this build).
 *
 * THE SERVER SIDE IS WRITTEN AND NOT APPLIED. Every limit, column name, kind
 * and refusal sentinel below was read on 2026-11-03 out of the migration
 * itself — thrive-and-score
 * `supabase/migrations/20261103031500_club_announcements_v1.sql` (BUILT,
 * UNAPPLIED) — not inferred from a convention. It is still required to
 * DEGRADE rather than crash while the objects are absent:
 *
 *   comm_messages.title       text NULL, CHECK `title IS NULL OR
 *                             char_length(btrim(title)) BETWEEN 1 AND 80`
 *                             (migration PART 1). The content of a titled
 *                             message is `title || E'\n\n' || body`, written
 *                             by the RPC, so a client that has never heard of
 *                             the column still renders a readable message —
 *                             which matters because `comm_messages` rows are
 *                             drawn by BOTH apps (recon §LB-3a).
 *   comm_message_actions      (id, message_id, kind, target, label,
 *                             sort_order, created_by, created_at) — migration
 *                             PART 2. `kind` is CHECKed against 'playbook' |
 *                             'playbook_card' | 'courses'; `target` is the CARD
 *                             KEY for 'playbook_card', matched against
 *                             `^[A-Za-z0-9_-]{1,16}$`, and must be NULL for the
 *                             other two kinds; `label` is CHECKed 1–40 chars
 *                             after trim. `authenticated` holds SELECT only —
 *                             INSERT/UPDATE/DELETE are REVOKEd, so nobody
 *                             inserts directly even with a policy.
 *   post_club_announcement(p_channel_id uuid, p_title text, p_body text,
 *                          p_actions jsonb DEFAULT '[]') → uuid, the new
 *                             message's id. SECURITY DEFINER, EXECUTE granted
 *                             to `authenticated` only. Refuses with ERRCODE
 *                             P0070–P0074 + a HINT sentinel. This is the ONLY
 *                             door: the client never inserts a
 *                             `comm_message_actions` row and never writes
 *                             `title` itself.
 *
 * THE RPC'S GATE ORDER, which is why a refusal can be about a thing the
 * composer never showed: signed in → channel exists → `is_channel_staff` →
 * the chat is the club's default (`channel_type = 'club' AND is_default`) →
 * not archived → title → body → the buttons, all of them validated before
 * anything is written.
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

/**
 * The limits the RPC enforces, copied from the migration so the composer
 * refuses what the server would refuse instead of spending a round trip on it.
 * The server still owns every one of them — these only decide what compose
 * will let someone TRY.
 *
 *   title   `char_length(btrim(p_title)) BETWEEN 1 AND 80`   → P0073 title_invalid
 *   body    `char_length(btrim(p_body)) BETWEEN 1 AND 4000`  → P0073 body_invalid
 *   label   `char_length(btrim(label)) BETWEEN 1 AND 40`     → P0074 action_label_invalid
 *   buttons `jsonb_array_length(p_actions) <= 3`             → P0074 too_many_actions
 */
export const ANNOUNCEMENT_TITLE_MAX = 80;

/**
 * A TITLE IS REQUIRED — Lu's ruling, 2026-11-03, and the RPC agrees: there is
 * no branch in `post_club_announcement` that accepts a NULL or blank
 * `p_title`, so an untitled announcement is not a quieter card, it is a
 * refusal. Compose keeps Send disabled until this many characters survive the
 * trim, and the write path never sends null.
 *
 * Existing untitled rows are a different question and still render: they
 * predate the column, and `splitAnnouncement` derives a headline for them.
 */
export const ANNOUNCEMENT_TITLE_MIN = 1;

/** `comm_messages.content` is unbounded; the RPC's `p_body` is not. */
export const ANNOUNCEMENT_BODY_MAX = 4000;

/** `comm_message_actions_label_check`, 1–40 after trim. */
export const ANNOUNCEMENT_ACTION_LABEL_MAX = 40;

/**
 * How many buttons one announcement may carry (ruling 2026-11-03 01:57), and
 * the RPC's own cap — `jsonb_array_length(v_actions) > 3` refuses.
 */
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
 *
 * The LABEL CEILING is checked here too, not only by the input's `maxLength`:
 * `comm_message_actions_label_check` is 1–40 after trim, and a label can reach
 * this function from somewhere other than that input — a paste that outran it,
 * or a future caller. A row the table would reject is dropped rather than sent
 * and refused, which is what the whole announcement would be (P0074
 * `action_label_invalid` aborts the call before the message is written).
 *
 * A TARGET ON THE WRONG KIND is NOT tested here on purpose: the builder nulls
 * it (`comm_message_actions_target_check` demands NULL for the other two
 * kinds), so a stray key costs the key and never the button.
 */
export function isSendableAction(action: {
  kind: unknown;
  target?: string | null;
  label?: string | null;
}): boolean {
  if (!isAnnouncementActionKind(action.kind)) return false;
  const label = action.label?.trim() ?? '';
  if (!label || label.length > ANNOUNCEMENT_ACTION_LABEL_MAX) return false;
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
 * EVERY refusal `post_club_announcement` can raise, as the migration raises it.
 *
 * READ, NOT GUESSED (2026-11-03). The previous version of this map was five
 * invented sentinels in the `close_poll` convention — `title_too_long`,
 * `body_required`, `actions_invalid` and two that happened to be right. Three
 * of them do not exist in the applied-shape function, so three of its ten
 * refusals would have fallen through to "Could not send this announcement.
 * Please try again." the moment a layer in between dropped the message. The
 * names below are the HINT strings in
 * `20261103031500_club_announcements_v1.sql` lines 311–394, in the order the
 * function checks them.
 *
 * THE HINT IS THE SENTINEL, THE ERRCODE IS THE CLASS. The function uses the
 * 4b P0024 shape: a printable MESSAGE, an ERRCODE that says which KIND of
 * refusal it is, and a HINT that names the exact one. Codes are coarse on
 * purpose — P0071 covers "no such chat", "wrong chat" and "archived chat" —
 * so the hint, not the code, picks the sentence.
 *
 * NOTHING DEPENDS ON THIS MAP BEING COMPLETE.
 * `describePostAnnouncementFailure` prefers the SERVER'S OWN MESSAGE and only
 * reaches these when it is missing; an eleventh refusal added later still
 * reads as a sentence.
 */
const REFUSAL_HINTS = {
  /** P0070 — auth.uid() is NULL. */
  not_signed_in: 'Sign in to post an announcement',
  /** P0071 — no such chat, or a NULL channel id. */
  channel_not_found: 'Chat not found',
  /** P0072 — is_channel_staff said no. The one that gates the door. */
  not_channel_staff: 'Only a club admin or club staff can post announcements',
  /** P0071 — not the club's default chat. Mobile should never reach this: the
   *  channel comes from `getClubAnnouncementsChannel`, which asks for exactly
   *  `channel_type = 'club' AND is_default`. Mapped anyway, because "should
   *  never" is not "cannot" — a stale channel id in a navigation param would. */
  not_club_announcements:
    "Announcements can only be posted to the club's announcements chat",
  /** P0071 — the chat was archived, plausibly after this screen opened. */
  channel_archived: 'This chat is archived',
  /** P0073 — NULL, blank, or over 80 after trim. */
  title_invalid: `A title is required, up to ${ANNOUNCEMENT_TITLE_MAX} characters`,
  /** P0073 — NULL, blank, or over 4000 after trim. */
  body_invalid: `A message is required, up to ${ANNOUNCEMENT_BODY_MAX} characters`,
  /** P0074 — `p_actions` was not a JSON array. The builder always sends one,
   *  so this can only be a caller that bypassed it. */
  actions_not_array: 'Buttons must be a list',
  /** P0074 — more than three. The builder slices to three first. */
  too_many_actions: `An announcement can have at most ${ANNOUNCEMENT_MAX_ACTIONS} buttons`,
  /** P0074 — an element was not a JSON object. */
  action_invalid: 'One of the buttons could not be saved',
  /** P0074 — `kind` off the allow-list. */
  action_kind_invalid: 'One of the buttons has a type this app cannot send',
  /** P0074 — a `playbook_card` whose target is not key-shaped. */
  action_card_key_invalid: 'That Playbook card key is not valid',
  /** P0074 — a target on a kind that takes none. The builder nulls it. */
  action_target_invalid: 'One of the buttons has a destination it cannot take',
  /** P0074 — label blank or over 40 after trim. */
  action_label_invalid: `Each button label must be 1 to ${ANNOUNCEMENT_ACTION_LABEL_MAX} characters`,
} as const;

/**
 * The ERRCODEs the function refuses with. Every one carries a HINT, so the
 * refusal is recognised by the hint alone in practice; the codes are matched
 * as well so a refusal whose hint was stripped in transit is still reported as
 * a RULE ("the server said no") rather than as "we could not reach it".
 *
 * `42501` is the RLS/privilege refusal and belongs with them for the same
 * reason. `P0001` stays: it is what a bare plpgsql RAISE reports as, and a
 * hand-applied or older build of the function may not set an ERRCODE at all.
 */
const REFUSAL_CODES = [
  'P0070',
  'P0071',
  'P0072',
  'P0073',
  'P0074',
  'P0001',
  '42501',
];

/** Kept as a named export: `ComposeAnnouncementScreen` imports it. */
export const POST_ANNOUNCEMENT_REFUSED_MESSAGE = REFUSAL_HINTS.not_channel_staff;
export const POST_ANNOUNCEMENT_CHANNEL_NOT_FOUND_MESSAGE =
  REFUSAL_HINTS.channel_not_found;
export const POST_ANNOUNCEMENT_TITLE_INVALID_MESSAGE = REFUSAL_HINTS.title_invalid;
export const POST_ANNOUNCEMENT_BODY_INVALID_MESSAGE = REFUSAL_HINTS.body_invalid;
/** Shown when the call never got an answer — offline, 500, dropped request. */
export const POST_ANNOUNCEMENT_FAILED_MESSAGE =
  'Could not send this announcement. Please try again.';

/**
 * The sentence to show when the RPC refused.
 *
 * The server's own message first, so the copy lives in ONE place — the
 * function — and an ERRCODE this client has never heard of still reads as a
 * sentence rather than as "something went wrong". Then the hint map above,
 * then the one generic line.
 */
export function describePostAnnouncementFailure(error: MaybePostgrestError): string {
  const message = error?.message?.trim();
  if (message) return message;
  const hint = error?.hint?.trim();
  if (hint && hint in REFUSAL_HINTS) {
    return REFUSAL_HINTS[hint as keyof typeof REFUSAL_HINTS];
  }
  return POST_ANNOUNCEMENT_FAILED_MESSAGE;
}

/**
 * Did the server say NO, as opposed to not answering?
 *
 * A refusal code, or ANY hint at all — not only a hint this map knows.
 * `RAISE ... USING HINT` is something a function sets deliberately; a dropped
 * request and a 500 carry no hint, so its presence is the server having
 * reached a decision. An eleventh sentinel added to the function later is
 * therefore still reported as a rule, with the server's own sentence, rather
 * than as "try again".
 */
export function isPostAnnouncementRefusal(error: MaybePostgrestError): boolean {
  if (!error) return false;
  const code = error.code?.trim();
  if (code && REFUSAL_CODES.includes(code)) return true;
  return !!error.hint?.trim();
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
  // NEVER `|| null`. The old line sent null for a blank title, which reads as
  // "no title" and is not a state the RPC has: `p_title` NULL raises P0073
  // `title_invalid`, so the blank would have cost a round trip to be told what
  // the Send button already knows. Compose keeps Send disabled until there is
  // a title (ANNOUNCEMENT_TITLE_MIN); this sends whatever survives the trim
  // and lets the server have the last word on it.
  const { data, error } = await supabase.rpc('post_club_announcement', {
    p_channel_id: args.channelId,
    p_title: args.title.trim(),
    p_body: args.body.trim(),
    p_actions: buildAnnouncementActionsPayload(args.actions),
  });

  if (!error) {
    return { status: 'ok', messageId: typeof data === 'string' ? data : null };
  }

  if (isAnnouncementContractMissing(error)) return { status: 'setup_pending' };

  if (isPostAnnouncementRefusal(error)) {
    return { status: 'refused', message: describePostAnnouncementFailure(error) };
  }

  return { status: 'error', error };
}
