/**
 * Chat UX helpers: role labels and priority for display.
 */

export function formatRoleLabel(role: string | undefined): string {
  if (!role) return '';
  const roleLabels: Record<string, string> = {
    head_coach: 'Head Coach',
    assistant_coach: 'Assistant Coach',
    team_manager: 'Team Manager',
    club_admin: 'Club Admin',
    parent: 'Parent',
    player: 'Athlete',
    platform_admin: 'Admin',
    content_creator: 'Creator',
    evaluator: 'Evaluator',
    sales_director: 'Sales',
    product_vendor: 'Vendor',
  };
  return roleLabels[role] || role.replace(/_/g, ' ');
}

export function getRolePriority(role: string): number {
  const priorities: Record<string, number> = {
    platform_admin: 11,
    head_coach: 10,
    assistant_coach: 9,
    team_manager: 8,
    club_admin: 7,
    evaluator: 6,
    content_creator: 5,
    parent: 4,
    player: 3,
  };
  return priorities[role] ?? 0;
}

export function getTimeAgo(dateString: string | null | undefined): string {
  if (!dateString) return '';
  const now = new Date();
  const date = new Date(dateString);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}
