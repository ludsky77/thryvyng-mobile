// Poll permission utilities - IDENTICAL to web app
export const STAFF_ROLES = [
    'platform_admin',
    'club_admin',
    'head_coach',
    'assistant_coach',
    'team_manager'
  ] as const;
  
  export type StaffRole = typeof STAFF_ROLES[number];
  
  /**
   * Check if a role can create polls in team channels
   * Only staff members can create polls in team/club channels
   */
  export const canCreatePoll = (role: string | undefined | null): boolean => {
    if (!role) return false;
    return STAFF_ROLES.includes(role as StaffRole);
  };
  
  /**
   * Check if a role is considered staff (can see voter details)
   */
  export const isStaffRole = (role: string | undefined | null): boolean => {
    if (!role) return false;
    return STAFF_ROLES.includes(role as StaffRole);
  };
  
  /**
   * Check if user can create polls in a specific channel type
   * - Team/Club/Broadcast channels: only staff
   * - Group channels: any member
   */
  export const canCreatePollInChannel = (
    channelType: string | undefined | null,
    userRole: string | undefined | null
  ): boolean => {
    if (!channelType) return false;
    
    // In team/club/broadcast channels, only staff can create polls
    if (['team', 'club', 'broadcast'].includes(channelType)) {
      return isStaffRole(userRole);
    }
    
    // In group channels, any member can create polls
    if (['group', 'group_dm'].includes(channelType)) {
      return true;
    }
    
    return false;
  };