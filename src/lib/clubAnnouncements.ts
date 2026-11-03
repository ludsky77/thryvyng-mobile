/**
 * The club's announcements chat — ONE lookup, for every caller.
 *
 * WHY THIS MODULE EXISTS. Mobile's "Club-Wide Message" button asked for
 * `comm_channels.channel_type = 'broadcast'` and showed "Club broadcast channel
 * not found. Contact admin." when that came back empty — which it always did.
 * It is not a missing row, it is a row that cannot exist: the live CHECK
 * constraint `comm_channels_channel_type_check` allows exactly
 * `team, club, dm, group_dm`, and the club's real chat is typed `club`
 * (`club-announcements`, `is_default = true`, measured against prod on
 * 2026-11-03 — docs/recon/club-announcements.md §FC-1). Two different strings,
 * so the compose door never opened for anybody and never had, since the path's
 * first commit `db5dedb` (§A3, PROVEN). The feature was a build defect, not a
 * regression.
 *
 * IDENTIFIED BY THE ROW, NOT BY THE NAME — the same pair
 * `isDefaultClubChannel` (./channelLeave) and the S4 membership sync already
 * use: `channel_type = 'club' AND is_default IS TRUE`. Default channels have
 * been renamed before (the default team chat went from "announcements" to
 * "Team Chat"), so a name test would rot. `coaches-lounge`, the club's other
 * seeded channel, is private and NOT `is_default`, so it can never be matched.
 *
 * `club_id` IS REQUIRED, NOT TIDINESS. Two clubs each hold their own
 * `club-announcements` row (§FC-1), so `.limit(1)` without it hands a caller
 * whichever row Postgres returns first — plausibly the other club's. RLS masks
 * this for a single-club admin (it refuses the read) but not for someone
 * holding `club_staff` rows at two clubs, which is exactly the case
 * `fetchClubTeams`'s `limit(1)` comment in ChatScreen exists for.
 *
 * THE ERROR IS RETURNED SEPARATELY FROM THE ROW. The old code read `data` and
 * threw `error` away, so offline, a 500 and an RLS refusal all printed the same
 * "contact admin" sentence as a genuinely missing channel. A caller must be
 * able to tell "this club has no announcements chat" from "we could not ask".
 *
 * Creation is still a WEB side effect, not a migration: web's
 * `ClubMessagesTab` inserts the two defaults the first time a club's channel
 * list comes back empty (§A2). So a club whose admin never opened web's
 * Club → Messages tab has no announcements chat at all, and the
 * `MISSING` sentence below is a real state, not a theoretical one.
 */
import { supabase } from './supabase';

/**
 * The columns a caller needs. `select('id')` was the other half of the old
 * defect: `allow_member_text` decides whether the composer or the announcement
 * banner is shown (./announcementChannel), and `name` is what the room header
 * and the chat list already print for this channel.
 */
export type ClubAnnouncementsChannel = {
  id: string;
  name: string | null;
  club_id: string | null;
  allow_member_text: boolean | null;
};

/** No announcements chat exists for this club (see §A2 — web creates it). */
export const CLUB_ANNOUNCEMENTS_MISSING_MESSAGE =
  'This club has no announcements chat yet.';

/** The lookup never got an answer — offline, 500, dropped request. */
export const CLUB_ANNOUNCEMENTS_UNREACHABLE_MESSAGE =
  "Couldn't reach the server. Try again.";

/**
 * The one line that says where a club-wide message lands. The club's display
 * name when we have it; "your club" only when the name read came back empty,
 * which is a cosmetic fallback and never changes which channel is opened.
 */
export function clubAnnouncementsAudienceLine(
  clubName: string | null | undefined
): string {
  const name = clubName?.trim();
  return `Goes to everyone in ${name || 'your club'} announcements`;
}

/**
 * The club's announcements channel, or null with no error if it has none.
 *
 * `{ data, error }` on purpose, mirroring the supabase call it wraps: a
 * network or RLS failure must never read as "not found".
 *
 * `limit(1).maybeSingle()` rather than `maybeSingle()` alone: `maybeSingle()`
 * errors on 2+ rows, and a club holding two default club channels is a data
 * problem that should not take the compose door down with it.
 */
export async function getClubAnnouncementsChannel(clubId: string): Promise<{
  data: ClubAnnouncementsChannel | null;
  error: unknown | null;
}> {
  const { data, error } = await supabase
    .from('comm_channels')
    .select('id, name, club_id, allow_member_text')
    .eq('club_id', clubId)
    .eq('channel_type', 'club')
    .eq('is_default', true)
    .eq('is_archived', false)
    .limit(1)
    .maybeSingle();

  if (error) return { data: null, error };
  return { data: (data as ClubAnnouncementsChannel | null) ?? null, error: null };
}
