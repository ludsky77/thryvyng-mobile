/**
 * Structural role tagging for the add-people pickers.
 *
 * `search_chat_contacts(p_query)` returns only
 * `(user_id, display_name, avatar_url)` -- no role column at all. So a picker
 * that wants to group its candidates has to tag them at FETCH time from role
 * COLUMNS. It must never infer a group from the rendered display string: a
 * name can contain the word "coach", and a resolved name can be the ladder's
 * "<Child>'s parent", which is a name, not a role.
 *
 * Source tables, and why these two:
 *   - `user_roles` -- SELECT policy is `USING (true)`, so every authenticated
 *     viewer can read every id's roles. `app_role` carries 'head_coach',
 *     'assistant_coach', 'team_manager', 'parent' and 'player'. This is the
 *     reliable tag source.
 *   - `team_staff` -- SELECT is restricted to that team's own staff, so it
 *     adds precision for a staff viewer and contributes nothing for a parent
 *     viewer. Treated as optional enrichment, never depended on.
 *
 * When neither table names a role, the candidate carries no group and is shown
 * only under "All" -- an untagged person is never filed under a guess.
 *
 * Phase C: 'player' is now a chip group of its own. It was always being
 * FETCHED (user_roles carries it) and then dropped by the mapping's `default`
 * arm, so the Players chip costs no extra query. Only players who have an
 * account can ever appear -- `search_chat_contacts` joins `profiles`, so a
 * roster player with no login is not a candidate in the first place.
 */

import { supabase } from './supabase';
import {
  buildRoleMap,
  ROLE_CHIP_GROUPS,
  ROLE_CHIP_GROUP_LABELS,
  roleChipGroup,
  type RoleChipGroup,
} from './chatHelpers';

/**
 * The chip groups, including Players as of Phase C.
 *
 * The group vocabulary and the role -> group mapping both live in
 * `chatHelpers.ts`, next to `getRolePriority` and `formatRoleLabel`, so the app
 * has ONE role vocabulary. These three are re-exports kept at their original
 * names so every existing call site in the two pickers is untouched.
 */
export type ContactRoleGroup = RoleChipGroup;
export const CONTACT_ROLE_GROUPS = ROLE_CHIP_GROUPS;
export const CONTACT_ROLE_GROUP_LABELS = ROLE_CHIP_GROUP_LABELS;
export const contactRoleGroup = roleChipGroup;

/**
 * Highest-priority structural role per user id, for the ids given.
 *
 * "Highest" by `getRolePriority`, the same ranking the DM picker already uses,
 * so someone who is both a coach and a parent files under Coaches once rather
 * than appearing under whichever row the query returned last.
 *
 * Any failure degrades to fewer tags, never to a wrong one: a denied or empty
 * read simply leaves those ids untagged.
 */
export async function fetchContactRoles(
  userIds: (string | null | undefined)[]
): Promise<Map<string, string>> {
  const unique = [...new Set(userIds.filter(Boolean) as string[])];
  if (unique.length === 0) return new Map<string, string>();

  const [rolesRes, staffRes] = await Promise.all([
    supabase.from('user_roles').select('user_id, role').in('user_id', unique),
    supabase
      .from('team_staff')
      .select('user_id, staff_role')
      .in('user_id', unique),
  ]);

  if (rolesRes.error && __DEV__) {
    console.warn('[contactRoles] user_roles read failed:', rolesRes.error);
  }
  if (staffRes.error && __DEV__) {
    console.warn('[contactRoles] team_staff read failed:', staffRes.error);
  }

  // The tie-break lives in chatHelpers.buildRoleMap, shared with the three
  // other label sites. It is order-independent, so a slower `team_staff`
  // response can no longer change the answer.
  return buildRoleMap(rolesRes.data as any[], staffRes.data as any[]);
}

/**
 * Which chip groups are actually present in a loaded candidate list, in chip
 * order. A group with nobody in it gets no chip -- the chips describe the list
 * in front of the user, not the set of roles the app knows about.
 */
export function presentRoleGroups(
  candidates: { roleGroup?: ContactRoleGroup | null }[]
): ContactRoleGroup[] {
  const present = new Set(
    candidates
      .map((c) => c.roleGroup)
      .filter(Boolean) as ContactRoleGroup[]
  );
  return CONTACT_ROLE_GROUPS.filter((g) => present.has(g));
}
