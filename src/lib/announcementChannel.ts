/**
 * Announcement channels — "only staff can post, everyone else reacts".
 *
 * Phase D slice 4b. The flag is `comm_channels.allow_member_text`
 * (20260109195004_…sql:3): FALSE means announcement-only. Until this slice
 * nothing enforced it — a coach toggled it on his phone, web members got the
 * emoji-only banner, and mobile members typed freely and the database accepted
 * it (docs/recon/phaseD-open-rulings.md § 3).
 *
 * THE SERVER IS BOTH THE ENFORCEMENT AND THE PERMISSION, as of
 * supabase/migrations/20261017032300_phaseD_4b_staff_only_posting.sql:
 *
 *   PART 2  the `msg_insert` policy on comm_messages also requires
 *           `channel_allows_member_text(channel) OR is_channel_staff(channel, auth.uid())`
 *   PART 3  `set_channel_announcement_mode(channel, enabled)` is the only way to
 *           write the flag — ruling Q5 B-setter = Option B (Lu, 2026-10-17
 *           03:56 MDT)
 *
 * Everything in this module is about what the UI SHOWS and which door it knocks
 * on; none of it is the rule.
 *
 * WHO COUNTS AS STAFF — ruling Q3 B as amended by Q3 B+ (Lu, 2026-10-16). The
 * answer comes from `isChannelStaff` in `./channelStaff`, which asks the server,
 * and this module deliberately does not have a second opinion. Before 4d there
 * were three definitions live and they disagreed about the same person; web's
 * send gate was the global-role list in `./pollPermissions`, which said a head
 * coach of Boys 2015 could type in Boys 2017's announcement channel. That gate
 * is gone on web; mobile had no send gate at all until this slice — see
 * `src/components/chat/ChatInputBar.tsx`.
 *
 * WHO MAY TURN IT ON — ruling Q5 B: "channel staff (Q3's definition); the web
 * toggle lands in Edit Channel." On this app the toggle is Chat Info's
 * "Staff Controls" switch (`src/screens/ChatInfoScreen.tsx`), and it is now
 * rendered iff `isChannelStaff` — it used to be gated on `isStaffInTeam`,
 * which is false for every chat with no team, so club-announcements could
 * never be switched from either app.
 *
 * AND WHO MAY ACTUALLY WRITE IT — ruling **Q5 B-setter = Option B**, which
 * settled the gap the first cut of this slice had to stop at.
 * `comm_channels_update` is still `created_by = auth.uid() OR
 * is_channel_admin(auth.uid(), id)`, so a client `.update()` on comm_channels
 * silently changed NOTHING for a coach who did not create the chat — an UPDATE
 * that matches no row is not an error. Rather than widen that policy (RLS is
 * row-level, so it would also have let any coach rename the chat), Lu chose one
 * SECURITY DEFINER door that writes one column, gated on the same
 * `is_channel_staff` the sender arm asks. So the person who may switch a chat to
 * announcement-only is exactly the person who may still post in it.
 *
 * `setAnnouncementOnly` is the only place either app calls it. A refusal now
 * arrives as a real error — ERRCODE `P0024` with a HINT sentinel, the shape
 * `./channelStaff`'s `closePoll` and BF-8's `./chatClubRule` already use — so
 * the caller can put its switch back and show the server's own sentence.
 *
 * Web carries the same module at `src/lib/announcementChannel.ts`; the strings
 * below are byte-identical on purpose (COMMS PARITY, ruling §2). The only
 * difference is that web passes its client in and this one imports it, exactly
 * as the two copies of `channelStaff.ts` already differ.
 */
import { supabase } from './supabase';

/**
 * The banner that replaces the composer. Already web's wording since Phase C
 * (web `src/components/comm/MessageInput.tsx`); it moves here so this app prints
 * the same sentence rather than a second one of its own.
 */
export const ANNOUNCEMENT_BANNER_MESSAGE =
  'This is an announcement channel. React with emoji to respond.';

/** The Edit Channel / Chat Info control. */
export const ANNOUNCEMENT_TOGGLE_LABEL = 'Announcement channel';
export const ANNOUNCEMENT_TOGGLE_HINT =
  'Only coaches, managers and club admins can post. Everyone else can still react with emoji.';

/** The hints `set_channel_announcement_mode` raises with. The server owns these. */
const NOT_CHANNEL_STAFF_HINT = 'not_channel_staff';
const CHANNEL_NOT_FOUND_HINT = 'channel_not_found';
const ANNOUNCEMENT_MODE_REQUIRED_HINT = 'announcement_mode_required';

/** The one ERRCODE PART 3 raises, for the case where a layer loses the hint. */
const ANNOUNCEMENT_SET_ERRCODE = 'P0024';

/**
 * The fallback sentences, used only when the server's own message did not
 * arrive. The server raises these exact words, so a user never sees two
 * different sentences for the same refusal.
 */
export const ANNOUNCEMENT_SET_REFUSED_MESSAGE =
  'Only a coach, manager or club admin of this chat can change who may post in it';
export const ANNOUNCEMENT_CHANNEL_NOT_FOUND_MESSAGE = 'Chat not found';

/** Shown when the call never got an answer — offline, 500, dropped request. */
export const ANNOUNCEMENT_SET_FAILED_MESSAGE =
  'Could not change this setting. Please try again.';

type MaybePostgrestError = {
  code?: string | null;
  hint?: string | null;
  message?: string | null;
} | null | undefined;

/**
 * The fields that decide whether the composer is shown. A narrow Pick, the same
 * shape `./channelPermissions` uses, so no caller can gate on a route param or
 * a derived label: the answer must come from the channel ROW.
 */
export type AnnouncementChannelFields = { allow_member_text?: boolean | null };

/**
 * May ordinary members post text here?
 *
 * `!== false` rather than a falsy check, because the column is nullable with
 * DEFAULT true and the server reads it as `IS NOT FALSE`
 * (`public.channel_allows_member_text`). A null means "members may post" in all
 * three places, and that is the only reason this one-line function exists.
 */
export function allowsMemberText(
  channel: AnnouncementChannelFields | null | undefined
): boolean {
  if (!channel) return true;
  return channel.allow_member_text !== false;
}

/**
 * Is this chat announcement-only? The inverse of the above, named for the way
 * a toggle reads so no screen has to invert the flag itself.
 *
 * This is one of exactly two places the inversion lives. The other is
 * `set_channel_announcement_mode` on the server, whose ARGUMENT is the toggle
 * and whose RETURN VALUE is the column — which is why the result of that call
 * comes back through here rather than being used directly.
 */
export function isAnnouncementOnly(
  channel: AnnouncementChannelFields | null | undefined
): boolean {
  return !allowsMemberText(channel);
}

/**
 * May the composer be shown at all?
 *
 * The client mirror of the server's new arm: the chat allows member text, OR
 * this person is staff of it. `isStaff` is whatever `isChannelStaff` answered;
 * `null`/`undefined` means "not known yet", and an unknown staff answer counts
 * as NOT staff — so the banner shows while the question is in flight rather
 * than a composer whose first send would be refused.
 */
export function canSendText(args: {
  allowMemberText: boolean;
  isStaff: boolean | null | undefined;
}): boolean {
  return args.allowMemberText || args.isStaff === true;
}

export type SetAnnouncementResult =
  | { status: 'ok'; announcementOnly: boolean }
  | { status: 'refused'; message: string }
  | { status: 'error'; error: unknown };

/** Did the server REFUSE this, as opposed to failing to answer? */
export function isAnnouncementSetRefusal(error: MaybePostgrestError): boolean {
  if (!error) return false;
  if (
    error.hint === NOT_CHANNEL_STAFF_HINT ||
    error.hint === CHANNEL_NOT_FOUND_HINT ||
    error.hint === ANNOUNCEMENT_MODE_REQUIRED_HINT
  ) {
    return true;
  }
  // PART 3 raises with ERRCODE P0024, which PostgREST reports as code 'P0024'.
  // Kept as a second test for the case where the hint is lost in between.
  return error.code === ANNOUNCEMENT_SET_ERRCODE;
}

/**
 * The sentence to show when the setter refused.
 *
 * The server's own message is preferred, so the copy lives in one place — the
 * function. The hint identifies WHICH refusal it was, exactly as BF-8's
 * `isSameClubRefusal` and 4d's `describeClosePollFailure` do; the constants
 * above are only reached if a layer in between dropped the message.
 */
export function describeAnnouncementSetFailure(
  error: MaybePostgrestError
): string {
  const message = error?.message?.trim();
  if (message) return message;
  if (error?.hint === CHANNEL_NOT_FOUND_HINT) {
    return ANNOUNCEMENT_CHANNEL_NOT_FOUND_MESSAGE;
  }
  if (error?.hint === NOT_CHANNEL_STAFF_HINT) {
    return ANNOUNCEMENT_SET_REFUSED_MESSAGE;
  }
  return ANNOUNCEMENT_SET_FAILED_MESSAGE;
}

/**
 * Turn announcement-only on or off. THE ONE DOOR for this flag — ruling
 * Q5 B-setter = Option B.
 *
 * `comm_channels` is never updated from the client for this any more. The RPC's
 * argument is the TOGGLE and its return value is the COLUMN (they are
 * inverses), so the answer is read back through `isAnnouncementOnly` rather
 * than used as-is — the same reason the server's own comment says to read that
 * contract twice.
 */
export async function setAnnouncementOnly(
  channelId: string,
  announcementOnly: boolean
): Promise<SetAnnouncementResult> {
  const { data, error } = await supabase.rpc('set_channel_announcement_mode', {
    p_channel_id: channelId,
    p_enabled: announcementOnly,
  });

  if (!error) {
    return {
      status: 'ok',
      announcementOnly: isAnnouncementOnly({
        allow_member_text: data as boolean | null,
      }),
    };
  }

  if (isAnnouncementSetRefusal(error)) {
    return { status: 'refused', message: describeAnnouncementSetFailure(error) };
  }

  return { status: 'error', error };
}
