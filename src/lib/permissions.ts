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
   * Check if a role can create calendar events
   * Same staff roles as poll creation
   */
  export const canCreateEvent = (role: string | undefined | null): boolean => {
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
  
  /*
   * DELETED 2026-11-03 (CLUB-ANNOUNCE-V1-MOBILE): `canCreatePollInChannel`.
   *
   * It answered "may this role create a poll here?" from a GLOBAL role list,
   * and it listed the channel type `broadcast` among its arms — a value the live
   * CHECK constraint `comm_channels_channel_type_check` does not allow, so no
   * row could ever hold it (docs/recon/club-announcements.md §A1/§FC-2,
   * PROVEN). The same ghost string was the club-wide message bug.
   *
   * Phase D slice 4i replaced it with the server's own answer:
   * `is_channel_staff` (`src/lib/channelStaff.ts`), which is the predicate the
   * `msg_insert` policy and `close_poll` ask, so creating and closing a poll
   * cannot disagree about who staff is (rulings I4 A / I5 A, ledger row I7).
   * It has been unimported since; `grep -rn canCreatePollInChannel src/`
   * returned ONE hit, the definition itself, before this deletion.
   *
   * The role helpers above are left in place: they are outside this slice and
   * are also unimported — see RECOMMEND in the Nov 3 handoff.
   */
