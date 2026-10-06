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
 * Rendered when a name could not be resolved. Deliberately distinct from
 * 'Anonymous', which is the privacy guarantee on an anonymous poll -- the two
 * meanings used to share one word.
 */
export const UNRESOLVED_NAME = 'Unknown';

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
