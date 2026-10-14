/**
 * Leaving a chat: one rule, one writer, one set of copy.
 *
 * The DATABASE enforces who may leave what (migration 20261013013626). This
 * module exists so the UI mirrors that rule in exactly one place instead of
 * two screens each guessing at it: `GroupInfoScreen` (group chats) and
 * `ChatInfoScreen` (team / club channels) both reach their Leave action
 * through here.
 *
 * Leaving = deleting your own `comm_channel_members` row. Admin succession and
 * auto-archive are server-side triggers -- there is deliberately no client
 * logic for either.
 */

import { supabase } from './supabase';

/**
 * The three channel facts the rule needs. Read them from the `comm_channels`
 * ROW, never from a navigation param: a push-opened room carries no
 * `channelType` at all, and `DMChatScreen` passes the illegal value
 * `'direct'`, so a param-based gate would offer Leave inside a DM.
 */
export interface LeavableChannel {
  channel_type?: string | null;
  is_default?: boolean | null;
  is_direct_message?: boolean | null;
}

/** Shown when the database refuses the delete (RLS). */
export const LEAVE_REFUSED_MESSAGE = "You can't leave this chat";

/**
 * Shown when the delete failed for any other reason (offline, 500). Kept
 * separate from the refusal copy: telling someone they are not allowed to
 * leave, when the truth is the request never arrived, is a lie.
 */
export const LEAVE_FAILED_MESSAGE = 'Could not leave this chat. Please try again.';

/** The menu/button label. */
export const LEAVE_ACTION_LABEL = 'Leave group';

/** Second line of the confirm dialog. */
export const LEAVE_CONFIRM_BODY = 'You will stop receiving its messages.';

/** First line of the confirm dialog, named after the chat when we know it. */
export function leaveConfirmTitle(chatName?: string | null): string {
  const name = (chatName ?? '').trim();
  return name ? `Leave ${name}?` : 'Leave this chat?';
}

/**
 * May this user be OFFERED the leave action for this channel?
 *
 * Offered on: group chats, non-default team channels, non-default club
 * channels. ABSENT -- not disabled -- on default team chats, default club
 * chats and 1-on-1 DMs, which keep archive as their only exit.
 *
 * Unknown or missing facts answer false: hiding an action the DB would have
 * allowed is recoverable, offering one it will refuse is not.
 */
export function canLeaveChannel(
  channel: LeavableChannel | null | undefined
): boolean {
  if (!channel) return false;
  if (channel.is_direct_message === true) return false;
  if (channel.channel_type === 'group_dm') return true;
  if (channel.channel_type === 'team' || channel.channel_type === 'club') {
    return channel.is_default !== true;
  }
  return false;
}

export type LeaveChannelResult =
  | { status: 'ok' }
  | { status: 'refused' }
  | { status: 'error'; error: unknown };

/**
 * Delete this user's own membership row.
 *
 * Two shapes of refusal, both handled: PostgREST reports an RLS-blocked write
 * either as error code 42501, or -- when the policy simply filters the row out
 * of the DELETE -- as `error: null` with an EMPTY result. The `.select()` is
 * what makes the second case visible; without it a refused delete is
 * indistinguishable from a successful one, and navigating away on a refusal
 * makes a failure look like a success.
 */
export async function leaveChannel(
  channelId: string,
  userId: string
): Promise<LeaveChannelResult> {
  const { data, error } = await supabase
    .from('comm_channel_members')
    .delete()
    .eq('channel_id', channelId)
    .eq('user_id', userId)
    .select('user_id');

  if (error) {
    return (error as { code?: string }).code === '42501'
      ? { status: 'refused' }
      : { status: 'error', error };
  }

  if (!data || data.length === 0) return { status: 'refused' };

  return { status: 'ok' };
}

/**
 * Is this the club-announcements channel -- the club-level DEFAULT channel?
 *
 * Identified by the ROW, not by the name: `channel_type = 'club'` AND
 * `is_default = true`. Mirrors web `src/lib/channelPermissions.ts`
 * `isDefaultClubChannel` verbatim, and is the same pair the S4 migration uses
 * for its club membership sync and `canLeaveChannel` above already gates on.
 *
 * The name is deliberately NOT tested: default channels have been renamed
 * before (the default team chat went from "announcements" to "Team Chat").
 * The club's other seeded channel, `coaches-lounge`, is created private and
 * WITHOUT `is_default`, so it is not matched and keeps its roster.
 */
export function isDefaultClubChannel(
  channel: LeavableChannel | null | undefined
): boolean {
  if (!channel) return false;
  return channel.channel_type === 'club' && channel.is_default === true;
}
