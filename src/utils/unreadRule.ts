/**
 * THE unread rule. One definition, imported by every surface that shows a
 * chat count.
 *
 * Pure on purpose: no react, no react-native, no supabase. It used to live in
 * useTotalChatUnread.ts, which imports all three, so it could not be loaded by
 * node --test and shipped untested. Everything here is a plain function over
 * plain data.
 *
 * ---------------------------------------------------------------------------
 * PARITY SPEC v2 -- the contract notify-chat-message must also satisfy
 * ---------------------------------------------------------------------------
 *
 * A channel is QUIET (its unread does not count, and it does not belong in the
 * main chat list) when EITHER:
 *
 *   1. the channel is archived            -- comm_channels.is_archived = true
 *      An archived channel is listed nowhere at all and counted nowhere.
 *
 *   2. its team is RETIRED                -- teams.team_status is 'archived'
 *      or 'inactive', REGARDLESS of teams.is_test.
 *      These channels still appear, in the Past section, so they stay readable.
 *
 * Everything else COUNTS:
 *   - an active team                            (team_status = 'active')
 *   - a test team that has not been retired     (is_test = true, status active)
 *   - a team whose team_status is null
 *   - a team whose team_status is an unrecognised value
 *   - a team_id the client holds no team record for (unknown team)
 *   - a channel with no team at all             (DMs, group chats)
 *   - a MUTED channel -- mute suppresses push delivery, never an in-app count
 *
 * is_test is deliberately NOT consulted. v1 of this spec bucketed a test team
 * as "hidden" and counted it even when retired; v2 retires it like any other.
 * is_test is still carried on TeamLifecycleFacts because the lookup that feeds
 * this rule exposes it, but reading it here would be a bug.
 *
 * The message-level half of the rule (which messages inside a counting channel
 * are unread) is stated at the bottom of this file and is enforced in SQL by
 * get_my_conversations.
 */

/** What the rule needs to know about a channel. */
export interface ChannelLifecycleFacts {
  is_archived?: boolean | null;
  team_id?: string | null;
}

/** What the rule needs to know about a channel's team. */
export interface TeamLifecycleFacts {
  team_status?: string | null;
  /** Carried by the lookup, deliberately ignored by the rule. See the spec above. */
  is_test?: boolean | null;
}

/**
 * teamId -> lifecycle. Structural, so a plain `Map` satisfies it with no
 * wrapping. A miss (unknown team) must mean "counts", never "quiet" -- a
 * channel we cannot classify is one the user can still open and read.
 */
export interface TeamLifecycleLookup {
  get(teamId: string): TeamLifecycleFacts | undefined;
}

/** The two statuses that retire a team. */
export const RETIRED_TEAM_STATUSES: readonly string[] = ['archived', 'inactive'];

/** True only for a team we hold a record for whose status is explicitly retired. */
export function isRetiredTeam(
  team: TeamLifecycleFacts | undefined | null
): boolean {
  if (!team) return false;
  const status = team.team_status;
  return !!status && RETIRED_TEAM_STATUSES.includes(status);
}

/** True when this channel's unread must not be counted anywhere. */
export function isQuietChannel(
  channel: ChannelLifecycleFacts,
  teams: TeamLifecycleLookup
): boolean {
  if (channel.is_archived === true) return true;
  if (!channel.team_id) return false;
  return isRetiredTeam(teams.get(channel.team_id));
}

/**
 * THE predicate. True when this channel's unread belongs in the chat total --
 * and therefore when the channel must be openable from the main chat list.
 */
export function countsTowardUnread(
  channel: ChannelLifecycleFacts,
  teams: TeamLifecycleLookup
): boolean {
  return !isQuietChannel(channel, teams);
}

/**
 * True when this channel belongs in the Past section: quiet because its team
 * is retired, but still present. Archived channels are excluded -- they are
 * not "past", they are gone, and they appear in no list.
 *
 * Among non-archived channels this is the exact complement of
 * countsTowardUnread, which is what makes "every number has a row behind it"
 * true by construction rather than by inspection.
 */
export function isPastTeamChannel(
  channel: ChannelLifecycleFacts,
  teams: TeamLifecycleLookup
): boolean {
  if (channel.is_archived === true) return false;
  return isQuietChannel(channel, teams);
}

/** A get_my_conversations row, reduced to what the rule and the total need. */
export interface ConversationRow extends ChannelLifecycleFacts {
  channel_id?: string | null;
  unread_count?: number | null;
}

export interface ClassifiedConversations<T> {
  /** Channels whose unread counts. Exactly what the main chat list shows. */
  mainRows: T[];
  /** Quiet because their team is retired, still listed in the Past section. */
  pastRows: T[];
  /** Sum of unread_count over mainRows -- nothing else. */
  total: number;
}

/**
 * Split one get_my_conversations result into the two lists and the tab total,
 * in a single pass.
 *
 * This exists so the number and the rows are produced by the SAME function
 * call: `total` is by construction the sum over `mainRows`, so the tab badge
 * cannot show a count the list does not account for. Two separate derivations
 * are what let them disagree before.
 *
 * Archived channels land in neither list and add nothing -- the RPC returns
 * them unfiltered and this is where they are dropped.
 */
export function classifyConversationRows<T extends ConversationRow>(
  rows: readonly T[] | null | undefined,
  teams: TeamLifecycleLookup
): ClassifiedConversations<T> {
  const mainRows: T[] = [];
  const pastRows: T[] = [];
  let total = 0;

  for (const row of rows ?? []) {
    if (!row || !row.channel_id) continue;
    if (countsTowardUnread(row, teams)) {
      mainRows.push(row);
      // Negative or absent counts must not subtract from the total.
      total += Math.max(0, row.unread_count ?? 0);
    } else if (isPastTeamChannel(row, teams)) {
      pastRows.push(row);
    }
  }

  return { mainRows, pastRows, total };
}

/* ---------------------------------------------------------------------------
 * The message-level half of the rule.
 *
 * A message inside a counting channel is unread when it is not the reader's
 * own, not deleted, and strictly newer than that channel's floor, where the
 * floor is last_read_at falling back to now - 30 days only when last_read_at
 * is null.
 *
 * get_my_conversations enforces exactly this in SQL (verified against the
 * production definition, Oct 11), which is why the client sums its
 * unread_count rather than re-deriving per-channel counts. These helpers are
 * kept as the canonical client-side statement of that half of the spec, and
 * for any surface that has to recount locally.
 * ------------------------------------------------------------------------- */

export const LOOKBACK_DAYS = 30;

/** The 30-day floor, used only for channels the user has never read. */
export function unreadFallbackCutoff(now: Date = new Date()): string {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - LOOKBACK_DAYS);
  return cutoff.toISOString();
}

/** A channel's unread floor: last_read_at, else the 30-day fallback. */
export function unreadFloor(
  lastReadAt: string | null | undefined,
  fallbackCutoff: string
): string {
  return lastReadAt ?? fallbackCutoff;
}

/** A message is unread when it is strictly newer than its channel's floor. */
export function isUnreadMessage(
  createdAt: string,
  lastReadAt: string | null | undefined,
  fallbackCutoff: string
): boolean {
  return (
    new Date(createdAt).getTime() >
    new Date(unreadFloor(lastReadAt, fallbackCutoff)).getTime()
  );
}
