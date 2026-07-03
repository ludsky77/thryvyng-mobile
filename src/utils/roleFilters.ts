import type { UserRole } from '../types';

export type RoleBucket = 'active' | 'past' | 'hidden';

export function getRoleBucket(role: UserRole): RoleBucket {
  // Test teams → hidden (top-level or nested signal)
  if (role.team_is_test === true) return 'hidden';
  if (role.team?.is_test === true) return 'hidden';

  // Admins always active
  if (role.role === 'club_admin' || role.role === 'platform_admin') return 'active';

  // Coach roles keyed on team_status
  if (['head_coach', 'assistant_coach', 'team_manager'].includes(role.role)) {
    if (role.team_status === 'archived' || role.team_status === 'inactive') return 'past';
    return 'active';
  }

  // Parent / player keyed on team_status + player_status
  if (role.role === 'parent' || role.role === 'player') {
    // Invited-placement roles are visible even if player_status is not 'active'
    // and even if team came from placement rather than rostered players.team_id.
    const isInvited = role.placement_status === 'invited';
    if (!isInvited && role.player_status && role.player_status !== 'active') return 'hidden';
    if (!isInvited && !role.team) return 'hidden';
    if (role.team_status === 'archived' || role.team_status === 'inactive') return 'past';
    return 'active';
  }

  return 'active'; // unknown role type → safe default (show)
}

export function bucketRoles(roles: UserRole[]): { active: UserRole[]; past: UserRole[] } {
  const active: UserRole[] = [];
  const past: UserRole[] = [];
  for (const r of roles) {
    const b = getRoleBucket(r);
    if (b === 'active') active.push(r);
    else if (b === 'past') past.push(r);
  }
  return { active, past };
}
