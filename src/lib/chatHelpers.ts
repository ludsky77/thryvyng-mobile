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

/**
 * The chat kinds that show a club crest (Lu, 2026-10-20 follow-up): a club's
 * OWN chats. A DM is a person -- their photo or their initials -- and a group
 * chat is its people, so neither carries a crest, on the list card or in the
 * open-chat header.
 *
 * `'default'` is included because the default TEAM chat must keep its crest
 * whichever of the two values the server gives it; a 'default' chat is never a
 * DM or a group, so including it cannot put a crest where one is now barred.
 *
 * Same shape as `canHideChannelType` in lib/hiddenChats.ts, and here for the
 * same reason: ONE list, read by both screens, so the card and the header
 * cannot drift apart. An unknown or absent kind answers NO.
 */
const CRESTED_CHANNEL_TYPES = ['team', 'club', 'default'] as const;

export function showsClubCrest(
  channelType: string | null | undefined
): boolean {
  if (!channelType) return false;
  return (CRESTED_CHANNEL_TYPES as readonly string[]).includes(channelType);
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

// ---------------------------------------------------------------------------
// ONE role-label resolver (Phase C item 4).
//
// Four screens used to each build their own `Map<userId, role>` and each pick a
// winner their own way, so one database produced different labels in one app:
//   * ChatInfoScreen built `new Map(rows.map(r => [r.user_id, r.staff_role]))`.
//     A Map keeps the LAST duplicate key, and the read has no ORDER BY, so a
//     coach holding both head_coach and team_manager on one team got whichever
//     row PostgREST happened to return second. That is the "Team Manager" vs
//     "Head Coach" split in docs/recon/phaseC-audit.md item 6.
//   * ChatScreen and DirectMessagesScreen each inlined a copy of the
//     priority merge below.
//   * contactRoles.fetchContactRoles had the only correct version.
//
// Everything now funnels through `pickHighestRole`. `formatRoleLabel` and
// `getRolePriority` above are unchanged -- their Feb 2026 wording is preserved
// and still the only source of displayed role strings.
// ---------------------------------------------------------------------------

/** One role row as any of the three tables spell it. */
export interface RoleRow {
  user_id?: string | null;
  /** `user_roles.role` */
  role?: string | null;
  /** `team_staff.staff_role` */
  staff_role?: string | null;
}

/**
 * The winning role out of several held by ONE person, highest priority first.
 *
 * Order-independent by construction: ties break on the role string so the same
 * set always yields the same answer however the rows arrived. An unknown role
 * scores 0 (`getRolePriority`) and so loses to any known one, but still beats
 * nothing at all -- a label we cannot rank is better than no label.
 */
export function pickHighestRole(
  roles: (string | null | undefined)[]
): string | null {
  let best: string | null = null;
  for (const role of roles) {
    if (!role) continue;
    if (best === null) {
      best = role;
      continue;
    }
    const delta = getRolePriority(role) - getRolePriority(best);
    // Equal priority -> lowest string wins, so the result never depends on
    // the order the rows were read in.
    if (delta > 0 || (delta === 0 && role < best)) {
      best = role;
    }
  }
  return best;
}

/**
 * `user_id -> winning role` for a batch of rows from `user_roles` and/or
 * `team_staff`, in any order, with duplicates.
 *
 * Replaces the four hand-rolled Maps. Pass every row set you have; rows with
 * no user id or no role are skipped rather than guessed at.
 */
export function buildRoleMap(...rowSets: (RoleRow[] | null | undefined)[]): Map<string, string> {
  const collected = new Map<string, string[]>();

  for (const rows of rowSets) {
    for (const row of rows || []) {
      const userId = row?.user_id;
      const role = row?.role ?? row?.staff_role ?? null;
      if (!userId || !role) continue;
      const list = collected.get(userId);
      if (list) list.push(role);
      else collected.set(userId, [role]);
    }
  }

  const out = new Map<string, string>();
  collected.forEach((roles, userId) => {
    const winner = pickHighestRole(roles);
    if (winner) out.set(userId, winner);
  });
  return out;
}

/**
 * The displayed role string for one person holding any number of roles.
 * Returns '' when nothing is known, which every caller already renders as
 * "no role line" rather than as a guess.
 */
export function resolveRoleLabel(
  roles: (string | null | undefined)[]
): string {
  return formatRoleLabel(pickHighestRole(roles) ?? undefined);
}

// ---------------------------------------------------------------------------
// Chip groups for the add-people pickers (Phase C item 1).
//
// Lives here, beside the priority table, because a chip group is a mapping off
// the same role strings and having it anywhere else is how the app ended up
// with several disagreeing role vocabularies. `contactRoles.ts` re-exports it
// so existing call sites are unchanged.
// ---------------------------------------------------------------------------

/** The chip groups offered by the add-people pickers. */
export type RoleChipGroup = 'coaches' | 'managers' | 'parents' | 'players';

/** Chip order, left to right. "All" is rendered by the screen, not a group. */
export const ROLE_CHIP_GROUPS: RoleChipGroup[] = [
  'coaches',
  'managers',
  'parents',
  'players',
];

export const ROLE_CHIP_GROUP_LABELS: Record<RoleChipGroup, string> = {
  coaches: 'Coaches',
  managers: 'Managers',
  parents: 'Parents',
  players: 'Players',
};

/**
 * A structural role string -> its chip group. Unknown roles map to null and
 * are shown only under "All" -- an untagged person is never filed under a guess.
 *
 * 'player' used to fall through the `default` arm and be discarded, which is
 * why there was no Players chip even though the tag was already being fetched
 * (docs/recon/phaseC-audit.md item 2).
 */
export function roleChipGroup(
  role: string | null | undefined
): RoleChipGroup | null {
  switch (role) {
    case 'head_coach':
    case 'assistant_coach':
      return 'coaches';
    case 'team_manager':
      return 'managers';
    case 'parent':
      return 'parents';
    case 'player':
      return 'players';
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Staff Message recipients (Phase C items 5 + 6).
//
// FND-A: `trigger_add_creator_to_members` already inserts the creator of a
// group_dm as 'admin' (web repo 20260112025123_*.sql:56-74), and
// comm_channel_members carries UNIQUE (channel_id, user_id)
// (20260108184412_*.sql:77). A multi-row INSERT is ONE statement, so including
// the creator makes the unique violation fail the WHOLE batch and nobody gets
// added. ChatScreen.createGroup documents this and filters the creator out;
// StaffMessageScreen did not. This is that filter, in one testable place.
// ---------------------------------------------------------------------------

export interface MemberInsert {
  channel_id: string;
  user_id: string;
  role: 'member';
}

/**
 * The `comm_channel_members` rows to insert for a newly created group.
 *
 * Drops the creator (the trigger has them, as admin), drops blanks, and
 * de-duplicates -- two identical ids in one batch would violate the same
 * unique constraint the creator did.
 */
export function buildMemberInserts(
  channelId: string,
  recipientIds: (string | null | undefined)[],
  creatorId: string | null | undefined
): MemberInsert[] {
  const seen = new Set<string>();
  const out: MemberInsert[] = [];
  for (const id of recipientIds) {
    if (!id || id === creatorId || seen.has(id)) continue;
    seen.add(id);
    out.push({ channel_id: channelId, user_id: id, role: 'member' });
  }
  return out;
}

/**
 * The ids a Staff Message will actually reach: everyone in the filtered group
 * who is still checked. Order follows `candidates`, not the checked set, so the
 * preview list and the send list agree.
 */
export function checkedRecipientIds(
  candidates: { user_id: string }[],
  excluded: ReadonlySet<string>
): string[] {
  return candidates.map((c) => c.user_id).filter((id) => !excluded.has(id));
}

// ---------------------------------------------------------------------------
// Staff Message: chat name, recipient search, select-all (Oct 14 upgrades).
//
// All three are decisions, not rendering, so they live here where they can be
// executed by the smoke suite. The screen holds the state and calls these; it
// re-implements none of the rules.
//
// The one invariant that ties them together: SEARCH IS A VIEW, never a
// selection. `filterByNameQuery` feeds the FlatList only. The recipient count,
// the send list and the select-all toggle are all computed from the whole
// group, so a sender who types a name cannot silently drop everyone else from
// a message they are about to send.
// ---------------------------------------------------------------------------

/** The chat-name field: what is in it, and whether the sender owns it yet. */
export interface ChatNameState {
  /** Exactly what is in the field, untrimmed. */
  value: string;
  /** True once the sender has typed something of their own. */
  edited: boolean;
}

/**
 * The hard ceiling on a chat name, from the column itself: `comm_channels.name`
 * is `VARCHAR(100) NOT NULL` (20260108184412:51, never altered). Uncapped, an
 * over-length name is a Postgres 22001 error on insert or update -- a failed
 * write, not a truncation -- so every chat-name input caps at this and the
 * rename validation measures against it.
 */
export const CHANNEL_NAME_MAX = 100;

export function initialChatName(defaultName: string): ChatNameState {
  return { value: defaultName, edited: false };
}

/**
 * Picking a different group renames the chat -- until the sender has typed
 * their own name, after which the group never overwrites it again.
 */
export function chatNameOnGroupChange(
  state: ChatNameState,
  nextDefault: string
): ChatNameState {
  return state.edited ? state : { value: nextDefault, edited: false };
}

/**
 * `edited` latches only while the field holds something of the sender's own.
 * Clearing it hands the name back to the group; without that, emptying the box
 * would freeze the chat on the name of a group the sender has since left, and
 * the field would disagree with the name actually created.
 */
export function chatNameOnEdit(
  state: ChatNameState,
  text: string
): ChatNameState {
  return { value: text, edited: text.trim().length > 0 };
}

/** The name the channel is created with. Trimmed; empty falls back. */
export function resolveChatName(
  state: ChatNameState,
  defaultName: string
): string {
  return state.value.trim() || defaultName;
}

/**
 * One name-search rule: case-insensitive, matches ANY part of the name, and an
 * empty or whitespace query matches everyone (so clearing the box restores the
 * list rather than emptying it).
 */
export function matchesNameQuery(
  name: string | null | undefined,
  query: string
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (name ?? '').toLowerCase().includes(q);
}

/** The rows to SHOW. Never pass this to anything that decides who is sent to. */
export function filterByNameQuery<T extends { full_name: string }>(
  items: T[],
  query: string
): T[] {
  if (!query.trim()) return items;
  return items.filter((item) => matchesNameQuery(item.full_name, query));
}

/**
 * Is every person in the group checked? `group` is the WHOLE group, not the
 * search-visible slice. An empty group is not "all checked" -- there is nothing
 * to deselect, so the toggle offers Select all and the send button stays
 * disabled at zero.
 */
export function isWholeGroupChecked(
  group: { user_id: string }[],
  excluded: ReadonlySet<string>
): boolean {
  if (group.length === 0) return false;
  return group.every((member) => !excluded.has(member.user_id));
}

export function selectAllLabel(
  group: { user_id: string }[],
  excluded: ReadonlySet<string>
): 'Select all' | 'Deselect all' {
  return isWholeGroupChecked(group, excluded) ? 'Deselect all' : 'Select all';
}

/**
 * The next excluded set for a select-all / deselect-all tap. Acts on the whole
 * group whatever the search box says, and leaves exclusions for people outside
 * this group untouched.
 */
export function toggleWholeGroup(
  group: { user_id: string }[],
  excluded: ReadonlySet<string>
): Set<string> {
  const next = new Set(excluded);
  if (isWholeGroupChecked(group, excluded)) {
    group.forEach((member) => next.add(member.user_id));
  } else {
    group.forEach((member) => next.delete(member.user_id));
  }
  return next;
}
