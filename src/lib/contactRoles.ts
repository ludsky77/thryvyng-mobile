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
 */

import { supabase } from './supabase';
import { getRolePriority } from './chatHelpers';

/** The chip groups. Players are deliberately absent (deferred by ruling). */
export type ContactRoleGroup = 'coaches' | 'managers' | 'parents';

/** Chip order, left to right. "All" is rendered by the screen, not a group. */
export const CONTACT_ROLE_GROUPS: ContactRoleGroup[] = [
  'coaches',
  'managers',
  'parents',
];

export const CONTACT_ROLE_GROUP_LABELS: Record<ContactRoleGroup, string> = {
  coaches: 'Coaches',
  managers: 'Managers',
  parents: 'Parents',
};

/** A structural role string -> its chip group. Unknown roles map to null. */
export function contactRoleGroup(
  role: string | null | undefined
): ContactRoleGroup | null {
  switch (role) {
    case 'head_coach':
    case 'assistant_coach':
      return 'coaches';
    case 'team_manager':
      return 'managers';
    case 'parent':
      return 'parents';
    default:
      return null;
  }
}

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
  const roleMap = new Map<string, string>();
  const unique = [...new Set(userIds.filter(Boolean) as string[])];
  if (unique.length === 0) return roleMap;

  const keepHighest = (userId: string | null, role: string | null) => {
    if (!userId || !role) return;
    const current = roleMap.get(userId);
    if (!current || getRolePriority(role) > getRolePriority(current)) {
      roleMap.set(userId, role);
    }
  };

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

  (rolesRes.data || []).forEach((r: any) => keepHighest(r.user_id, r.role));
  (staffRes.data || []).forEach((r: any) =>
    keepHighest(r.user_id, r.staff_role)
  );

  return roleMap;
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
