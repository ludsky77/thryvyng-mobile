import { supabase } from './supabase';

/**
 * Team-scoped id -> name resolution.
 *
 * A direct read of `profiles` is blocked by RLS for a regular parent/player
 * viewer: the read returns null / an empty map and the UI renders a fallback
 * string. `get_team_member_names(p_team_id)` is SECURITY DEFINER and team-gated
 * via `get_user_team_ids`, so it resolves for every viewer who belongs to the
 * team. It carries its own name chain, ending in "<Child>'s parent", and
 * deliberately has NO email fallback -- callers must not add one.
 *
 * Modelled on the channel-scoped resolver in useChatSenderLabels:
 *  - a Supabase RPC reports failure as a returned `error`, not a throw
 *  - a row with a falsy name is dropped rather than stored
 *  - any failure degrades to an empty map; callers fall back, nothing crashes
 */

export interface MemberName {
  name: string | null;
  avatar: string | null;
}

export type MemberNameMap = Map<string, MemberName>;

/**
 * The ONE person-name fallback, spelled exactly as the server spells it.
 *
 * `public.chat_display_name` (S1, migration 20261013013626) ends its COALESCE
 * on the literal 'Thryvyng member', so `get_chat_profiles` never returns a
 * null or an email -- it returns this. A caller therefore renders what the RPC
 * gave it and nothing more; the ladder is NOT re-implemented client-side.
 *
 * It is also what a caller shows when no resolver could answer at all: the RPC
 * returned no row for that id, the call failed, or the viewer shares no channel
 * with them. Rendering the ladder's own terminal string there keeps ONE
 * vocabulary in front of the user.
 *
 * Ruled by Lu on 2026-10-13 to apply app-wide -- every chat, poll, reaction and
 * staff-message surface -- not only DMs. Before that ruling these surfaces said
 * 'Unknown', which reads like a broken record rather than a person.
 *
 * Deliberately distinct from 'Anonymous', which is the privacy guarantee on an
 * anonymous poll. Those two meanings used to share one word; they must not.
 */
export const CHAT_FALLBACK_NAME = 'Thryvyng member';

/**
 * @deprecated Use {@link CHAT_FALLBACK_NAME}. Retained as an alias ONLY so a
 * stale import cannot silently reintroduce 'Unknown'; it no longer carries a
 * distinct value and new code must not reference it.
 */
export const UNRESOLVED_NAME = CHAT_FALLBACK_NAME;

/**
 * Legacy placeholders that are NOT names. A string equal to one of these is
 * treated as "no name", because that is what it has always meant.
 */
const NON_NAMES = ['unknown', 'unknown user'];

/**
 * Normalise anything about to be shown or STORED as a person's name.
 *
 * Enforces both standing rulings in one place:
 *   - 'Thryvyng member' is the single fallback (Lu, 2026-10-13, app-wide);
 *   - a name never comes from an email address (Lu, Stone B2 S1) -- an
 *     address, or an address local-part, is not a name and is refused here.
 *
 * Call it at a BOUNDARY -- a write, or a render that cannot vouch for its
 * input -- so one forgetful caller cannot put 'Unknown' in front of a user or
 * into a column. A name that is already real is returned untouched (trimmed).
 */
export function chatPersonName(
  name: string | null | undefined
): string {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return CHAT_FALLBACK_NAME;
  if (NON_NAMES.includes(trimmed.toLowerCase())) return CHAT_FALLBACK_NAME;
  // An address is not a name. Guards the whole shape, not just a bare '@':
  // a display name legitimately never contains one.
  if (trimmed.includes('@')) return CHAT_FALLBACK_NAME;
  return trimmed;
}

/** Names for every member of one team, keyed by auth uid. */
export async function fetchTeamMemberNames(
  teamId: string | null | undefined
): Promise<MemberNameMap> {
  const map: MemberNameMap = new Map();
  if (!teamId) return map;

  const { data, error } = await supabase.rpc('get_team_member_names', {
    p_team_id: teamId,
  });

  if (error) {
    if (__DEV__) {
      console.warn('[memberNames] get_team_member_names failed:', error);
    }
    return map;
  }

  (data as any[] | null)?.forEach((row: any) => {
    const userId = row?.user_id;
    // Prod-verified signature:
    // TABLE(user_id uuid, display_name text, avatar_url text).
    const name = row?.display_name ?? null;
    if (!userId || !name) return;
    map.set(userId, { name, avatar: row?.avatar_url ?? null });
  });

  return map;
}

/**
 * Names across several teams, merged into one map. One RPC call per team: the
 * function is gated per team id, so a club-wide list has to ask team by team.
 */
export async function fetchTeamMemberNamesForTeams(
  teamIds: (string | null | undefined)[]
): Promise<MemberNameMap> {
  const unique = [...new Set(teamIds.filter(Boolean) as string[])];
  const merged: MemberNameMap = new Map();
  if (unique.length === 0) return merged;

  const maps = await Promise.all(unique.map((id) => fetchTeamMemberNames(id)));
  maps.forEach((map) => {
    map.forEach((value, key) => {
      if (!merged.has(key)) merged.set(key, value);
    });
  });
  return merged;
}

/**
 * `comm_channels.team_id` for a channel. Null for DMs and club-level channels,
 * which have no team to gate a team-scoped RPC with -- those callers get an
 * empty name map and fall back.
 */
export async function fetchChannelTeamId(
  channelId: string | null | undefined
): Promise<string | null> {
  if (!channelId) return null;
  const { data, error } = await supabase
    .from('comm_channels')
    .select('team_id')
    .eq('id', channelId)
    .maybeSingle();

  if (error) {
    if (__DEV__) {
      console.warn('[memberNames] channel team lookup failed:', error);
    }
    return null;
  }
  return (data as any)?.team_id ?? null;
}

/** Names for everyone on the team that owns a channel. */
export async function fetchChannelTeamMemberNames(
  channelId: string | null | undefined
): Promise<MemberNameMap> {
  return fetchTeamMemberNames(await fetchChannelTeamId(channelId));
}

/**
 * CHANNEL-scoped id -> name resolution. Prefer this over the team-scoped
 * resolver above for anything inside a chat.
 *
 * `get_chat_profiles(p_user_ids uuid[])` is SECURITY DEFINER and gated on
 * SHARING A CHANNEL with the viewer, not on team membership, so unlike
 * `get_team_member_names` it:
 *   - resolves inside a club channel (`comm_channels.team_id` is NULL there,
 *     which left the team-scoped path with no team id and an empty map),
 *   - never raises `not_a_team_member` at a viewer from another team,
 *   - carries the full S1 name ladder, which ends at 'Thryvyng member'
 *     instead of NULL, so a nameless profile is still a named row.
 *
 * Ladder (Stone B2 S1, migration 20261013013626):
 *   full_name -> first_name last_name -> "<Child>'s parent" -> 'Thryvyng member'
 * There is deliberately NO email rung -- callers must not add one.
 */
export async function fetchChatProfileNames(
  userIds: (string | null | undefined)[]
): Promise<MemberNameMap> {
  const map: MemberNameMap = new Map();
  const unique = [...new Set(userIds.filter(Boolean) as string[])];
  if (unique.length === 0) return map;

  const { data, error } = await supabase.rpc('get_chat_profiles', {
    p_user_ids: unique,
  });

  if (error) {
    if (__DEV__) {
      console.warn('[memberNames] get_chat_profiles failed:', error);
    }
    return map;
  }

  (data as any[] | null)?.forEach((row: any) => {
    const userId = row?.user_id;
    // Signature: TABLE(user_id uuid, display_name text, avatar_url text).
    const name = row?.display_name ?? null;
    if (!userId || !name) return;
    map.set(userId, { name, avatar: row?.avatar_url ?? null });
  });

  return map;
}

/** What a channel member is, structurally. NULL = the server could not say. */
export type MemberLabelKind = 'staff' | 'player' | 'parent' | null;

export interface MemberLabel {
  kind: MemberLabelKind;
  /** Child first name(s) for a parent, e.g. "Zack" or "Ana & Zack". */
  childNames: string | null;
}

/**
 * Structural member roles for one channel.
 *
 * The client cannot derive these itself: `team_staff` is readable only by that
 * team's own staff and `players` is team-scoped, so a parent viewer reading
 * them gets zero rows -- which is how every member of a chat ended up labelled
 * "Parent" by a fall-through default. `get_channel_member_labels` is
 * SECURITY DEFINER and gated on channel membership, so it answers for any
 * member of the room.
 *
 * Same contract as the other resolvers here: an RPC reports failure as a
 * returned `error`, and any failure degrades to an empty map.
 */
export async function fetchChannelMemberLabels(
  channelId: string | null | undefined
): Promise<Map<string, MemberLabel>> {
  const map = new Map<string, MemberLabel>();
  if (!channelId) return map;

  const { data, error } = await supabase.rpc('get_channel_member_labels', {
    p_channel_id: channelId,
  });

  if (error) {
    if (__DEV__) {
      console.warn('[memberNames] get_channel_member_labels failed:', error);
    }
    return map;
  }

  (data as any[] | null)?.forEach((row: any) => {
    if (!row?.user_id) return;
    map.set(row.user_id, {
      kind: (row.label_kind ?? null) as MemberLabelKind,
      childNames: row.child_names ?? null,
    });
  });

  return map;
}
