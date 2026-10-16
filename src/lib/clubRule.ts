/**
 * Ruling BF-8 (Lu, 2026-10-16): "People can only talk if they are in the same
 * club. Every chat belongs to ONE club and every member must be in that club."
 *
 * The server enforces it — `get_or_create_dm_channel` and
 * `create_group_channel` raise, and the `comm_channel_members_insert` policy
 * refuses. This module exists so every screen prints the SAME sentence, and so
 * that sentence is written down once.
 *
 * Two refusal shapes, which arrive differently:
 *
 *  1. A function that RAISED. The message and the HINT come through, so
 *     `hint === 'not_same_club'` identifies it exactly.
 *  2. An RLS policy that refused: SQLSTATE 42501 with a generic message. On
 *     this policy 42501 now has TWO causes — "you are not allowed to add people
 *     here" and BF-8 — and the error alone cannot say which. So ask the server:
 *     `can_add_member` is literally the club test the policy uses, so the
 *     sentence can never disagree with the enforcement.
 *
 * The web app carries the same two helpers in `src/lib/chatClubRule.ts`; the
 * strings are byte-identical on purpose (COMMS PARITY, ruling 2).
 */
import { supabase } from '../lib/supabase';

/** The one sentence. Ruling BF-8 fixes the wording. */
export const SAME_CLUB_MESSAGE = 'You can only message people in your club';

/** The hint both BF-8 RAISEs carry. */
const SAME_CLUB_HINT = 'not_same_club';

/** PostgreSQL's insufficient_privilege, which is how an RLS refusal arrives. */
export const RLS_REFUSED = '42501';

type MaybePostgrestError =
  | { code?: string | null; hint?: string | null; message?: string | null }
  | null
  | undefined;

/**
 * Did the server refuse this because of the same-club rule? The hint is exact;
 * the message test is a fallback for a layer that drops the hint, and it is
 * matched against the constant above rather than a retyped string.
 */
export function isSameClubRefusal(error: MaybePostgrestError): boolean {
  if (!error) return false;
  if (error.hint === SAME_CLUB_HINT) return true;
  return Boolean(error.message && error.message.includes(SAME_CLUB_MESSAGE));
}

/**
 * The sentence to show when adding somebody to a chat was refused. For the
 * ambiguous 42501 the chat's club rule is checked directly with
 * `can_add_member`, the policy's own predicate.
 */
export async function describeAddMemberFailure(
  error: MaybePostgrestError,
  channelId: string,
  userId: string
): Promise<string> {
  if (isSameClubRefusal(error)) return SAME_CLUB_MESSAGE;

  if (error?.code === RLS_REFUSED) {
    const { data, error: checkError } = await supabase.rpc('can_add_member', {
      p_channel_id: channelId,
      p_user_id: userId,
    });
    // Only a definite `false` means the club rule. If the check itself fails we
    // say nothing about clubs rather than guess.
    if (!checkError && data === false) return SAME_CLUB_MESSAGE;
    return 'You cannot add people to this chat';
  }

  return 'Could not add member';
}
