/**
 * Hiding a chat -- the per-person "Hide", ruling 8 (Lu, 2026-10-15/16).
 *
 * "Hide" is NOT "Archive". Archive is the admin action on
 * `comm_channels.is_archived`: it removes a chat for EVERYONE and is listed
 * nowhere. Hide is one person's own view of one chat, it is reversible from the
 * "Hidden (n)" row, and it keeps its name "Hide" in the UI precisely so the two
 * are never confused.
 *
 * WHAT IT DOES AND DOES NOT TOUCH
 *   - writes ONE timestamp, through `public.set_channel_hidden(channel, bool)`
 *   - never writes `last_read_at` -- hiding marks nothing read (H4), so a chat
 *     that comes back brings its unread with it
 *   - never touches push (H5). Delivery is `is_muted`'s business, not this
 *     one's: a hidden chat still notifies unless it is also muted.
 *
 * The rule for whether a row IS hidden (H7) lives in `utils/unreadRule.ts`
 * next to the classifier that applies it, because that module is deliberately
 * pure -- no react, no supabase -- so it can be run under `node --test`.
 * This module is the half that talks to the server.
 */
import { supabase } from './supabase';

/**
 * Channel kinds a person may hide for themselves.
 *
 * Team, club and default channels are excluded: they are the chats a club runs
 * ON the member, so opting out of them is a club decision, not a personal one.
 * `set_channel_hidden` refuses them server-side; this list is what stops the
 * app OFFERING an action the server would only reject, which is the same
 * belt-and-braces shape the poll gates use.
 */
const HIDEABLE_CHANNEL_TYPES = ['dm', 'group_dm'] as const;

/**
 * May this chat be hidden by this person? Mute is offered on every chat; Hide
 * only on DMs and group chats (ruling 4).
 *
 * An unknown/absent channel_type answers NO. A new kind of chat must be opted
 * IN to hiding deliberately, rather than inheriting it by accident.
 */
export function canHideChannelType(
  channelType: string | null | undefined
): boolean {
  if (!channelType) return false;
  return (HIDEABLE_CHANNEL_TYPES as readonly string[]).includes(channelType);
}

/** The hint `set_channel_hidden` raises when the chat is not hideable. */
const NOT_HIDEABLE_HINT = 'channel_not_hideable';

/**
 * Shown when the server refuses the hide. Only reached if the server's own
 * message did not arrive -- the function raises its own wording, so a person
 * never sees two different sentences for one refusal.
 */
export const HIDE_REFUSED_MESSAGE =
  'Team and club chats cannot be hidden';

/** Shown when the call never got an answer -- offline, 500, dropped request. */
export const HIDE_FAILED_MESSAGE =
  'Could not update this chat. Please try again.';

type MaybePostgrestError =
  | { code?: string | null; hint?: string | null; message?: string | null }
  | null
  | undefined;

export type SetHiddenResult =
  | { status: 'ok'; hidden: boolean }
  | { status: 'refused'; message: string }
  | { status: 'error'; error: unknown };

/** Did the server REFUSE this, as opposed to failing to answer? */
export function isHideRefusal(error: MaybePostgrestError): boolean {
  if (!error) return false;
  if (error.hint === NOT_HIDEABLE_HINT) return true;
  // The function raises with ERRCODE P0001, which PostgREST reports as 'P0001'.
  // Kept as a second test for the case where the hint is lost in between.
  return error.code === 'P0001';
}

/** The sentence to show when the hide was refused. */
export function describeHideFailure(error: MaybePostgrestError): string {
  const message = error?.message?.trim();
  if (message) return message;
  if (error?.hint === NOT_HIDEABLE_HINT) return HIDE_REFUSED_MESSAGE;
  return HIDE_FAILED_MESSAGE;
}

/**
 * Hide or un-hide one chat for the calling user. THE ONE DOOR -- every hide
 * write in this app goes through here, so `comm_channel_members.hidden_at` is
 * never written directly from a screen.
 *
 * `hidden: false` is Unhide, the same call with the flag flipped; the server
 * clears the timestamp rather than storing a second one.
 *
 * ARGUMENT NAMES -- the one thing here not verified against the server.
 * `p_channel_id` is this codebase's universal convention and matches the
 * closest sibling, `set_channel_announcement_mode(p_channel_id, p_enabled)`
 * (announcementChannel.ts:210-213), whose second argument is named after the
 * thing being set. `p_hidden` follows that same shape, but the brief gave the
 * signature as `set_channel_hidden(channel_id, boolean)` without naming the
 * flag, and prod could not be queried to confirm it. If the server calls it
 * something else the RPC fails immediately and visibly on the first Hide --
 * it cannot fail silently or write the wrong thing -- and this is the only
 * line that needs changing.
 */
export async function setChannelHidden(
  channelId: string,
  hidden: boolean
): Promise<SetHiddenResult> {
  const { error } = await supabase.rpc('set_channel_hidden', {
    p_channel_id: channelId,
    p_hidden: hidden,
  });

  if (!error) return { status: 'ok', hidden };

  if (isHideRefusal(error)) {
    return { status: 'refused', message: describeHideFailure(error) };
  }
  return { status: 'error', error };
}
