/**
 * Who is "staff" of a chat, and who may close one of its polls.
 *
 * Ruling Q3 B (Lu, 2026-10-16 14:55 MDT): "is_channel_staff: team staff of the
 * chat's team; club staff for club chats; ONE shared helper, server + both
 * clients." Ruling Q4 B: "close_poll SECURITY DEFINER, flips is_active only."
 *
 * Ruling Q3 B+ (Lu, 2026-10-16 18:24 MDT) widened it: "club admins (club_admin
 * role for the chat's club) also count as channel staff in every chat of that
 * club -- team chats, club chats and clubbed group_dms. Team-level: unchanged
 * (that team's staff only)."
 *
 * THE SERVER IS THE DEFINITION, which is why Q3 B+ changed no line of this file
 * beyond this comment. `public.is_channel_staff(channel, user)` and
 * `public.close_poll(poll)` are created by the web repo's migration
 * `supabase/migrations/20261016180000_4d_close_poll.sql`. This module does not
 * re-implement either rule in TypeScript -- it ASKS the server, which is the
 * one way the two apps can never drift apart from each other or from the
 * enforcement. Same shape as `src/lib/clubRule.ts` for BF-8's `can_add_member`.
 *
 * WHAT THE SERVER ANSWERS, so a reader here does not have to open the SQL:
 *   - a club_admin of the chat's club       -- staff of EVERY chat of that club,
 *                                              team chats included (Q3 B+)
 *   - a team chat   -> team_staff of THAT team
 *   - a club chat   -> club staff of THAT club
 *   - a group_dm    -> club staff of its BF-3 club
 *   - a 1-on-1 dm   -> nobody
 * A coach of another team in the same club is still NOT staff here: Q3 B+ moved
 * the club_admin ROLE across teams and nothing else.
 *
 * WHAT THIS REPLACES, and why it matters here more than on web: this app had
 * THREE different ideas of staff and TWO ways to close a poll.
 *   * `TeamChatRoomScreen.tsx:186` read `label_kind = 'staff'` from
 *     `get_channel_member_labels` -- team staff anywhere in the chat's club.
 *   * `ChannelPollsScreen.tsx` counted `team_staff` rows on the chat's team
 *     itself.
 *   * `ChatInfoScreen.tsx:118` used `isStaffInTeam`.
 * And the Close button was offered to all of them while `usePolls.closePoll`
 * refused every non-creator and returned `false` that nobody read -- so a coach
 * closing another person's poll got no write and NO ERROR
 * (docs/recon/phaseD-slices.md section 4d, "THE FINDING").
 *
 * The web app carries the same module at `src/lib/channelStaff.ts`; the strings
 * below are byte-identical on purpose (COMMS PARITY, ruling section 2).
 */
import { supabase } from './supabase';

/**
 * The confirmation shown after a poll is closed. Ruling 4d-EXTRA (Lu, same
 * time): "after Close, the poll card shows a 'Closed' state immediately and a
 * short 'Poll closed' confirmation appears, both apps."
 */
export const POLL_CLOSED_MESSAGE = 'Poll closed';

/** The hints `close_poll` raises with. The server owns these strings. */
const NOT_POLL_CLOSER_HINT = 'not_poll_closer';
const POLL_NOT_FOUND_HINT = 'poll_not_found';

/**
 * The fallback sentences, used only when the server's own message did not
 * arrive. The server raises these exact words, so a user never sees two
 * different sentences for the same refusal.
 */
export const CLOSE_POLL_REFUSED_MESSAGE =
  'Only the person who created this poll, or a coach or manager of this chat, can close it';
export const POLL_NOT_FOUND_MESSAGE = 'Poll not found';

/** Shown when the call never got an answer -- offline, 500, dropped request. */
export const CLOSE_POLL_FAILED_MESSAGE =
  'Could not close this poll. Please try again.';

type MaybePostgrestError =
  | { code?: string | null; hint?: string | null; message?: string | null }
  | null
  | undefined;

/**
 * Is this person staff of this chat?
 *
 * Asks `public.is_channel_staff`. `userId` is optional because the server's
 * second argument defaults to `auth.uid()` -- omit it to ask about the signed-in
 * caller, which is what every UI gate wants.
 *
 * FALSE on any error. Hiding a control the server would have allowed is
 * recoverable; showing one it will refuse is the bug this slice exists to fix.
 */
export async function isChannelStaff(
  channelId: string | null | undefined,
  userId?: string | null
): Promise<boolean> {
  if (!channelId) return false;

  const { data, error } = await supabase.rpc(
    'is_channel_staff',
    userId
      ? { p_channel_id: channelId, p_user_id: userId }
      : { p_channel_id: channelId }
  );

  if (error) {
    if (__DEV__) {
      console.warn('[channelStaff] is_channel_staff failed:', error);
    }
    return false;
  }
  return data === true;
}

/**
 * May the Close control be OFFERED? The creator, or staff of the chat -- and
 * only while the poll is actually open.
 *
 * `isActive`/`isExpired` are part of the predicate on purpose: this app used to
 * offer Close on a poll that had already ended, which the server now answers
 * with a silent no-op rather than an error, so the button would have looked
 * broken. The server decides for real; this only decides what renders.
 */
export function canClosePoll(args: {
  isCreator: boolean;
  isStaff: boolean;
  isActive: boolean;
  isExpired: boolean;
}): boolean {
  if (!args.isActive || args.isExpired) return false;
  return args.isCreator || args.isStaff;
}

export type ClosePollResult =
  | { status: 'ok' }
  | { status: 'refused'; message: string }
  | { status: 'error'; error: unknown };

/**
 * The sentence to show when `close_poll` refused.
 *
 * The server's own message is preferred, so the copy lives in one place -- the
 * function. The hint identifies WHICH refusal it was, exactly as BF-8's
 * `isSameClubRefusal` does; the constants above are only reached if a layer in
 * between dropped the message.
 */
export function describeClosePollFailure(error: MaybePostgrestError): string {
  const message = error?.message?.trim();
  if (message) return message;
  if (error?.hint === POLL_NOT_FOUND_HINT) return POLL_NOT_FOUND_MESSAGE;
  if (error?.hint === NOT_POLL_CLOSER_HINT) return CLOSE_POLL_REFUSED_MESSAGE;
  return CLOSE_POLL_FAILED_MESSAGE;
}

/** Did the server REFUSE this, as opposed to failing to answer? */
export function isClosePollRefusal(error: MaybePostgrestError): boolean {
  if (!error) return false;
  if (error.hint === NOT_POLL_CLOSER_HINT || error.hint === POLL_NOT_FOUND_HINT) {
    return true;
  }
  // `close_poll` raises with ERRCODE P0001, which PostgREST reports as code
  // 'P0001'. Kept as a second test for the case where the hint is lost.
  return error.code === 'P0001';
}

/**
 * Close a poll. THE ONE DOOR -- ruling Q4 B.
 *
 * BOTH close paths in this app go through here: `usePolls.closePoll` (the chat
 * card) and `ChannelPollsScreen`, which used to write
 * `.update({ is_active: false })` straight at `comm_polls` and bypass the hook
 * entirely. `comm_polls` is never updated from the client for a close -- its
 * UPDATE policy is still creator-only, on purpose, so a coach closing another
 * person's poll can only ever work through this RPC.
 */
export async function closePoll(pollId: string): Promise<ClosePollResult> {
  const { error } = await supabase.rpc('close_poll', { p_poll_id: pollId });

  if (!error) return { status: 'ok' };

  if (isClosePollRefusal(error)) {
    return { status: 'refused', message: describeClosePollFailure(error) };
  }

  return { status: 'error', error };
}
