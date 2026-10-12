# Stone B2 recon — leave-group / membership / get_my_conversations on mobile

**Date:** 2026-10-12 · **Commit read:** `bfe297b` · **Read-only.** No code changed.

Every claim below carries `file:line` from a line read at `bfe297b`. Anything
not proven by a line read is labeled **INFERRED**.

> Supersedes the chat-stack line cites in `docs/recon/chat-stack-oct10.md`: that
> doc was written at `3834065`, and commits `95821b2` + `bfe297b` have since
> rewritten the send path (`sendMessage` now returns a `SendResult`, not a
> boolean) and added `MessageReadHistoryScreen`. Its *findings* on B1/B2/B3 are
> resolved; its line numbers are stale.

---

## A. Existing leave / remove / add / rename UI

**It already exists, in one screen, reachable for exactly one channel type.**

`src/screens/GroupInfoScreen.tsx` (767 lines) is the Group Info screen. It is
registered at `src/navigation/AppNavigator.tsx:545-547` and has exactly **one**
entry point in the whole app:

```
TeamChatRoomScreen.tsx:702-707
  onPress={() => { if (isGroupDm) navigation.navigate('GroupInfo', { channelId }); }}
  disabled={!isGroupDm}
```

where `isGroupDm = channelType === 'group_dm'` (`TeamChatRoomScreen.tsx:109`).

### The four controls

| control | site | DB call | channel types | after |
|---|---|---|---|---|
| **Leave Group** | `GroupInfoScreen.tsx:274-321`, button `:415-417` | `DELETE comm_channel_members WHERE channel_id=? AND user_id=<self>` `.select('user_id')` (`:252-257` is remove; leave is `:289-294`) | **group_dm only** (via the sole entry point) | confirm dialog → on success `navigation.popToTop()`, else `navigate('Main' → ChatTab → Conversations)` (`:309-316`) |
| **Remove** (per member) | `:242-272`, button `:399-407` | `DELETE comm_channel_members WHERE channel_id=? AND user_id=<target>` `.select('user_id')` (`:252-257`) | group_dm only | confirm dialog → `fetchGroupInfo()` (`:267`) |
| **+ Add** | `addMember` `:198-217`, button `:363-367` | `INSERT comm_channel_members {channel_id, user_id, role:'member'}` (`:199-203`) | group_dm only | close modal, clear search, `fetchGroupInfo()` (`:213-216`) |
| **Rename** (✏️) | `updateGroupName` `:219-240`, control `:335-355` | `UPDATE comm_channels SET name=? WHERE id=?` `.select('id')` (`:222-226`) | group_dm only | `setEditingName(false)` + `fetchGroupInfo()` (`:238-239`) |

### Error handling — already hardened against silent RLS refusals

All three writes use the **empty-result-is-a-refusal** pattern, because
PostgREST returns `error: null, data: []` when RLS filters a write out:

* rename: `if (error || !data || data.length === 0)` → alert (`:230-236`), with the
  rule stated in a comment at `:228-229`.
* remove: same shape (`:259-265`).
* leave: same shape (`:298-304`), and the comment at `:296-297` names the exact
  hazard — *"Navigating away on a denied delete makes a failure look like a
  success."* **So a DB that starts refusing a leave will already alert and stay
  put. No navigation happens on refusal.**

Add-member is the one write that does **not** use the pattern — it checks only
`error` (`:205-211`), so an RLS-filtered insert would alert nothing and the
refreshed list would silently not contain the person.

### Refresh / cache

There is no cache layer. `fetchGroupInfo` (`:79-117`) re-reads
`comm_channels` + `get_channel_members` on every mutation. **The chat list is
NOT refreshed after a leave** — `GroupInfoScreen` never calls
`requestChatUnreadRefresh()` (zero occurrences in the file); the list is
re-read because `popToTop()` lands on `Conversations`, whose
`useFocusEffect` calls `refresh()` (`ChatScreen.tsx:449-453`).

### No leave path for team / club channels

A `team`, `club`, or custom channel opens `TeamChatRoomScreen` with
`channelType` ≠ `'group_dm'`, so the header centre is `disabled`
(`TeamChatRoomScreen.tsx:707`) and **GroupInfo is unreachable**. The only
header action for those is the ⋮ menu → `ChatInfo`
(`TeamChatRoomScreen.tsx:723-730`), which has **no leave control at all**
(`ChatInfoScreen.tsx` has zero occurrences of "leave"). Archive is its only
destructive action — see §E.

---

## B. Chat creation — what each "+ New" option writes

`NewChatStep = 'choose' | 'dm' | 'group' | 'team' | 'club'`
(`ChatScreen.tsx:265`); the four tiles are at `:1080`, `:1097`, `:1114`, `:1133`.

### 1. DM — no client-side insert

`handleSelectDMUser` (`ChatScreen.tsx:589-614`) calls one RPC and writes nothing:

```ts
supabase.rpc('get_or_create_dm_channel', {
  user1_id: user.id, user2_id: selectedUser.id,
  p_team_id: null, p_club_id: null,
})                                        // :593-601
```

→ `navigate('DMChat', { channelId })` (`:611`). `channel_type`, `is_default`
and the member rows are all the DB's business. On failure: alert "Could not
open conversation" (`:603-608`).

### 2. Group — `createGroup` (`ChatScreen.tsx:765-825`)

```ts
INSERT comm_channels {
  name: groupName.trim(),
  channel_type: 'group_dm',
  is_direct_message: false,
  created_by: user.id,
}                                         // :770-777
```

**No `team_id`, no `club_id`, no `is_default`** — all three are left to DB
defaults. Then:

```ts
// ":778-779" comment: creator is NOT inserted -- a DB trigger adds them as
// admin, and UNIQUE (channel_id, user_id) would fail the whole batch.
memberInserts = selectedGroupUsers.filter(u => u.id !== user.id)
  .map(u => ({ channel_id, user_id: u.id, role: 'member' }))   // :780-786
INSERT comm_channel_members memberInserts                      // :787-789
```

So: **creator → `admin` by trigger (not written by the client); everyone else →
`role: 'member'`.** On member-insert failure the channel is rolled back with a
client-side `DELETE comm_channels WHERE id=?` (`:792-800`) and an alert.

### 3. Team Channel — picker only, creates nothing

`newChatStep === 'team'` (`:1585-1620`) lists channels the user is **already**
a member of and navigates into one (`:1610-1620`). The list comes from
`fetchTeamChannels` (`:826-860`): read own `comm_channel_members`, then
`comm_channels .in('channel_type', ['team','broadcast','club'])` (`:836`).
No insert anywhere on this path.

### 4. Club-Wide — **dead, every time**

`sendClubWideMessage` (`:988-1009`) looks the channel up by an illegal value:

```ts
.from('comm_channels').select('id').eq('channel_type', 'broadcast')  // :992-996
```

`broadcast` is not one of the four legal values, so this **always** returns
null and the user **always** gets `Alert.alert('Info', 'Club broadcast channel
not found. Contact admin.')` (`:1006`). The success branch (`:997-1005`), which
navigates with `channelType: 'broadcast'` and a `broadcastToTeams` param, is
unreachable. *(Reachability of the tile itself: gated on `isClubAdmin`,
`:1133`.)*

### 5. Staff Message — a fifth creator, outside the "+ New" four

`StaffMessageScreen` is reachable from `ChatScreen.tsx:1155`
(`navigate('StaffMessage', { clubId })`, club-admin path) and creates:

```ts
INSERT comm_channels { name, channel_type:'group_dm', club_id, created_by }  // :145-153
INSERT comm_channel_members memberIds.map(uid => ({channel_id, user_id}))    // :157-162
```

Three differences from `createGroup`, all worth flagging:
1. **It inserts itself**: `if (user?.id && !memberIds.includes(user.id)) memberIds.push(user.id)` (`:131-133`) — the exact row `createGroup:778-779` says the trigger already creates. If that trigger exists, this batch hits `UNIQUE (channel_id, user_id)` and **every** member row fails.
2. **No `role` column** is written at all (`:158-161`) — server default.
3. **The error is discarded**: `await supabase.from(...).insert(memberInserts);` (`:162`) — no `{ error }` destructure, no check. A total failure navigates into the new room as if it worked (`:164-168`).

### Illegal channel_type values in the client

| value | site | effect |
|---|---|---|
| `'broadcast'`, `'group'`, `'direct'` | `src/types/index.ts:9` — the union declares all three | type-only; widens the type, hides nothing |
| `'broadcast'` | `ChatScreen.tsx:76` (colour), `:836` (`.in(...)`), **`:992`** (`.eq(...)`), `:1003` (nav param) | `:992` makes Club-Wide permanently dead; the others are inert dead branches |
| `'direct'` | `DMChatScreen.tsx:520` — nav param `channelType: 'direct'` into `ChatInfo` | `ChatInfoScreen` branches on `'team'` / `'group_dm'` only (`:449-453`), so a DM's header reads **"Channel"**; `canArchive` does not read `channelType` (`:285-299`), so archive still works |
| `'group'` | `ChatScreen.tsx:33`, `:265`, `:370`, `:1015` | **not** a channel_type — it is the client-only `displayType` / `NewChatStep` vocabulary. Not a bug, but it collides by name with the illegal DB value and should not be confused with it |

---

## C. `get_my_conversations` consumer

### One source, one call site

`src/contexts/ChatUnreadContext.tsx:164` — `supabase.rpc('get_my_conversations')`.
This is the **only** call in the repo (grep over `src`). The provider is
mounted above the navigator and hands out `mainRows`, `pastRows`, `total`,
`loading`, `hasLoadedOnce`, `syncTick`, `refresh`, `refreshNow` (`:247-262`).
`ChatScreen` consumes it at `:289-298`. The file header (`:1-28`) documents why
the two older independent fetchers were collapsed into this one.

### Every field read off a row — 14 of 18 columns

In `ChatScreen.toConversation` (`:342-411`):

| field | line(s) |
|---|---|
| `channel_id` | `:350`, `:369`, `:388` |
| `last_message_at` | `:343` |
| `unread_count` | `:344` |
| `is_muted` | `:345` |
| `is_direct_message` | `:347` |
| `other_user_name` | `:348` |
| `other_user_avatar` | `:357` |
| `last_message_content` | `:359`, `:378`, `:402` |
| `channel_type` | `:367`, `:363`/`:382`/`:406` |
| `name` | `:364`, `:371`, `:381`, `:390` |
| `member_count` | `:372`, `:375` |
| `team_name` | `:391`, `:395`, `:397`, `:409` |
| `team_id` | `:388`(via `allTeams.find`), `:407-409` |

In `classifyConversationRows` (`unreadRule.ts:142-162`): `channel_id` (`:151`),
`unread_count` (`:155`), and via `countsTowardUnread` → `isQuietChannel`
(`:82-84`): **`is_archived`** and **`team_id`**.

No other column of the 18 is referenced anywhere. **INFERRED:** the remaining
four are read by nothing on mobile.

### How `other_user_name` renders, and client-side email handling

```ts
const otherName = row.other_user_name || 'Unknown User';   // ChatScreen.tsx:348
```

Used as `displayName`, `cardTitle`, and the avatar initial
(`otherName.charAt(0)`, `:358`). **There is no client-side email handling on
this path, and no email fallback anywhere in the chat stack any more**: a grep
for `user.email` / `.email` across `useMessages.ts`, `TeamChatRoomScreen.tsx`,
`DMChatScreen.tsx`, `ChatScreen.tsx`, `ChatUnreadContext.tsx` and
`DirectMessagesScreen.tsx` returns **zero hits** — the Oct-10 finding at
`useMessages.ts:358` was fixed in `95821b2`. So if a raw email reaches the DM
card today, **the RPC supplied it**, and replacing the fallback server-side
needs no client change at all.

### Where team status comes from today

A completely separate fetch, three files deep:

1. `useUserTeams` (`src/hooks/useUserTeams.ts`) runs **five** queries, each
   selecting `team_status, is_test` (`:127-128`, `:171-172`, `:231-232`,
   `:301-302`), and builds `teamLifecycle: Map<teamId, {team_status, is_test}>`
   at `:335-341`. Rationale comment at `:84-90`.
2. `TeamsProvider` (`src/contexts/TeamsContext.tsx:23-27`) mounts that hook
   exactly once for the app; header comment `:1-14`.
3. `ChatUnreadContext` reads `teamLifecycle` (`:127`) and passes it as the
   second argument to `classifyConversationRows` (`:174`).

The rule itself: `isRetiredTeam` (`unreadRule.ts:69-75`) → `team_status ∈
{'archived','inactive'}`, `RETIRED_TEAM_STATUSES` at `:66`; `isQuietChannel`
`:78-85`; `isPastTeamChannel` `:107-113`.

### What `team_status` on the RPC could delete or simplify

**Deletable / simplifiable, if the RPC returns `team_status` per row:**

* `ChatUnreadContext.tsx:160` — `if (teamsLoading || teamsError) return;`. This
  **entire hold-the-last-good-rows guard disappears.** Its own comment
  (`:153-159`) says exactly why it exists: without a trustworthy lifecycle map
  the rule would promote every past-team channel into the main list. With the
  status on the row there is nothing to wait for.
* `ChatUnreadContext.tsx:126-130` (the `useSharedUserTeams()` dependency),
  `:127` (`teamLifecycle`), `:184` (two of the four deps). **The provider stops
  depending on the teams fetch entirely** — which also removes the refetch
  storm: `refreshNow` currently re-runs whenever `teamLifecycle` changes
  identity (`:184`, `:191-193`).
* `unreadRule.ts` — the `TeamLifecycleLookup` plumbing (`:61-63`), the second
  parameter of `isQuietChannel` / `countsTowardUnread` / `isPastTeamChannel` /
  `classifyConversationRows`, and `isRetiredTeam`'s map lookup at `:84`.
  `isRetiredTeam` itself **stays** — it is still the definition of retired, now
  applied to `row.team_status` instead of `teams.get(row.team_id)?.team_status`.
  The unknown-team case (`:58-59`, "a miss must mean counts") collapses into the
  nullable-column case, which `isRetiredTeam` already handles (`:72-74`:
  `!status → false`).
* `useUserTeams`' `teamLifecycle` state and its builder (`:91-93`, `:335-341`,
  `:401`) lose their only consumer. **Do not delete the five `team_status`
  selects** — `bucketTeams` (`:26-31`) and `roleFilters.ts:15,26` still use
  `team_status` for the active/past team buckets, which is a different surface.
* `unreadRule.test.ts` (268 lines, 20+ asserts) would need its `TEAMS` map
  fixture replaced by per-row statuses.

**Not deletable:** `ChatScreen`'s own `useSharedUserTeams()` usage
(`:284-286`) — `allTeams` is still needed for `team?.color` (`:409`) and the
team-name fallback (`:391`, `:395`).

### Would a 19th column break typing or parsing? **No.**

Proven, three links in the chain:

1. `ChatUnreadContext.tsx:174` — `classifyConversationRows(data as any[], …)`.
   The RPC result is cast to `any[]`; nothing declares the 18 columns.
2. `unreadRule.ts:116-119` — `ConversationRow` declares only
   `channel_id?`, `unread_count?`, `is_archived?`, `team_id?`, all optional,
   and `classifyConversationRows<T extends ConversationRow>` (`:142`) infers
   `T = any`. An extra property satisfies the constraint.
3. `ChatScreen.tsx:342` — `toConversation = useCallback((row: any) => …)`.

No `select()` column list, no destructuring of a fixed shape, no runtime
validation. An extra column is inert; the client would simply ignore it until
read. **A non-email fallback in `other_user_name` is equally safe**: `:348` is
`row.other_user_name || 'Unknown User'`, so any non-empty string renders.

---

## D. Membership writes, and `ensure_team_channel_membership`

### Every write to `comm_channel_members`

| op | site | columns written |
|---|---|---|
| INSERT | `GroupInfoScreen.tsx:199-203` | `channel_id, user_id, role:'member'` |
| INSERT | `ChatScreen.tsx:780-789` | `channel_id, user_id, role:'member'` (creator excluded) |
| INSERT | `StaffMessageScreen.tsx:157-162` | `channel_id, user_id` — **no `role`**; error discarded |
| DELETE | `GroupInfoScreen.tsx:289-294` | self-leave, `.select('user_id')` |
| DELETE | `GroupInfoScreen.tsx:252-257` | admin removes a member, `.select('user_id')` |
| UPDATE | `TeamChatRoomScreen.tsx:151-155` | `last_read_at` |
| UPDATE | `DMChatScreen.tsx:126-130` | `last_read_at` |
| UPDATE | `useChannelMembers.ts:56-63` | `last_read_at, last_read_message_id` |
| UPDATE | `ChatInfoScreen.tsx:262-267` | `is_muted` |

**No client write ever sets `role` on an existing row.** `role` is written only
at insert time, only as the literal `'member'`, and never for the acting user —
the only self-insert the client performs is `StaffMessageScreen.tsx:131-133`
(see §B5), and it writes no `role`. **Nothing in `src` would break if the DB
refused a `role` change on your own membership row** (BREAKS-IF 3).

Reads (not writes), for completeness: `TeamChatRoomScreen.tsx:151`,
`MessageReadHistoryScreen.tsx:73-76`, `ChatScreen.tsx:706-709` and `:727-730`
(group dup-check), `:793` (`fetchTeamChannels`), `ChatInfoScreen.tsx:147-151`,
`:168-171`, `ChannelPollsScreen.tsx:179-182`, `:306-309`, `PollCard.tsx:236-239`,
`useBoardVoteView.ts:67-70`, `useChannelMembers.ts:21-27`.

### Every UPDATE / DELETE on `comm_channels`

| op | site | columns |
|---|---|---|
| UPDATE | `GroupInfoScreen.tsx:222-226` | `name` (+ `.select('id')` refusal check) |
| UPDATE | `ChatInfoScreen.tsx:271-274` | `allow_member_text` — **no error check at all** |
| UPDATE | `DMChatScreen.tsx:308-310` | `updated_at`, after every successful DM send — no error check |
| DELETE | `ChatScreen.tsx:797-801` | the failed-group rollback (§B2) |

### Does mobile call `ensure_team_channel_membership`? **Yes.**

`ChatScreen.tsx:429-447`:

```ts
useEffect(() => {
  if (!user?.id || teamsLoading) return;
  if (membershipEnsuredRef.current) return;        // :431
  if (activeTeams.length === 0) return;            // :432
  membershipEnsuredRef.current = true;
  void (async () => {
    await Promise.all(activeTeams.map(async (team) => {
      try { await supabase.rpc('ensure_team_channel_membership', { p_team_id: team.id }); }
      catch (err) { logError('ChatScreen.ensureTeamChannelMembership', err, { teamId: team.id }); }
    }));
    refresh();                                      // :444
  })();
}, [user?.id, teamsLoading, activeTeams, refresh]);
```

**Where:** `ChatScreen` only — the Conversations list. Not in `AppNavigator`,
not in a provider, not on login.
**When:** once per mount of `ChatScreen`, guarded by `membershipEnsuredRef` (`:431`)
(`:301` declares it, comment at `:300`: *"a one-time repair, not a per-fetch step"*).
Remounting the Chat tab (app relaunch) runs it again.
**For which teams:** `activeTeams` **only** (`:432`, `:436`) — never
`pastTeams`. One RPC per active team, in parallel, then one `refresh()` (`:444`).

**Two consequences worth flagging:**

1. **A mobile-only user who never opens the Chat tab is never repaired.** The
   fix is gated behind the very screen whose emptiness is the symptom. Until
   they tap Chat, they hold no membership row for their team's default chat, and
   `get_my_conversations` is built only from membership rows — so the chat list
   shows **no team chats at all** (DMs and groups still appear, since those
   always write their own member rows). This is a plausible mobile-side
   contributor to prod's 82 default team chats / 229 memberships. On the
   *first* open of the Chat tab the user sees an empty (or DM-only) list,
   then the rows appear a moment later when `refresh()` lands — no spinner
   covers that gap, because `hasLoadedOnce` is already true (`ChatScreen.tsx:1053`).
2. **Failure is invisible.** `logError` only (`:440`), no UI. And because
   `catch` wraps `await supabase.rpc(...)`, it catches *throws* — a Supabase RPC
   reports failure as a returned `{ error }`, which is never destructured here,
   so **an RPC that returns an error is silently treated as success** and
   `membershipEnsuredRef` stays `true` for the rest of the session.

---

## E. Archive on mobile

**Call site:** `ChatInfoScreen.tsx:364-392` — `performArchive`:

```ts
const { data, error } = await supabase.rpc('archive_channel', { p_channel_id: channelId });
if (error) { Alert.alert('Error', error.message); return; }              // :372-375
const result = data as { success: boolean; error?: string };             // :377
if (!result?.success) { Alert.alert('Error', mapArchiveError(result?.error || 'Unknown error')); return; }
Alert.alert('Chat archived', 'This chat has been archived.', [
  { text: 'OK', onPress: () => navigation.navigate('Conversations') },   // :383-387
]);
```

The `{success, error}` jsonb contract is handled correctly, including the
`error: null`-but-`success: false` case.

**Every error code has copy** — `mapArchiveError` (`:41-55`), and it matches the
five prod codes exactly:

| code | user sees |
|---|---|
| `not_authenticated` | "Please sign in again" |
| `channel_not_found` | "This chat no longer exists" |
| `already_archived` | "This chat is already archived" |
| `default_channel_protected` | "Default team chats cannot be archived" |
| `permission_denied` | "You don't have permission to archive this chat" |
| *anything else* | the raw code string (`:53-54`) |

**Which channel types offer it** — `canArchive` (`:285-299`) does **not** read
`channelType` at all. It reads the channel row:

```ts
if (channel.is_default === true) return false;                      // :287
if (channel.is_direct_message === true)
  return user.id === channel.dm_participant_1 || user.id === channel.dm_participant_2;  // :289-293
return channel.created_by === user.id || myMembershipRole === 'admin' || isPlatformAdmin; // :297-299
```

This is a faithful client mirror of the prod rule, with `is_default` short-
circuited client-side so the protected case is hidden rather than attempted.
`isPlatformAdmin` from `AuthContext` roles (`:278-283`). The button renders only
when `canArchive` (`ListFooterComponent`, `:519-521`). Reached from both rooms:
`TeamChatRoomScreen.tsx:723-730` (⋮) and `DMChatScreen.tsx:512-523` (⋮).

**Confirm copy differs by kind** (`handleArchivePress`, `:396-410`): DM →
"removed from both your chat lists… will reappear with full history"; non-DM →
"All members will lose access… create a new group."

### How archived chats are listed: **nowhere at all.**

`get_my_conversations` returns archived rows unfiltered; the client drops them:
`isQuietChannel` returns true on `is_archived === true`
(`unreadRule.ts:82`), and `isPastTeamChannel` explicitly **excludes** them
(`:111`), so `classifyConversationRows` puts them in neither `mainRows` nor
`pastRows` and adds nothing to the total (`:150-159`, rationale `:139-140`).
There is no Archived tab, screen, or filter anywhere (`ChatScreen`'s tabs are
`'recent' | 'byTeam' | 'past'`, `:302`). The only other `is_archived` use is
`ChatScreen.tsx:512`, excluding archived DMs from the dup-check map.
`ChatScreen.tsx:107-109` records that the Past row label used to say "Archived"
and that this was wrong — *"archived channels never reach this list at all."*

### Sending into an archived DM

**Nothing client-side stops it, and the outcome depends entirely on the DB.**
No screen reads `is_archived` before sending: `DMChatScreen.fetchChannelInfo`
selects only `dm_participant_1, dm_participant_2` (`:172-175`), and
`handleSendMessage` (`:273-320`) checks only `sending`, `channelId` and
non-empty content (`:277-278`).

A send that the DB refuses lands at `useMessages.ts:362-373` →
`sendFailure('insert', …)`, which is logged with context (`:365-369`) and
rendered by `sendFailureCopy('insert')` as **"Message couldn't be sent"** with
the honest generic body (`sendResult.ts:74-79`) — *not* the attachment copy,
which only `attachment_upload` can produce (`sendResult.ts:46-49`, guarded by
`sendResult.test.ts`). So the user gets a truthful, if unspecific, error.

Two follow-on effects of an archived-DM send attempt:
* **If the DB allows the insert**, the message is delivered into a channel the
  recipient cannot see, and `DMChatScreen.tsx:308-310` additionally bumps
  `comm_channels.updated_at` with no error check.
* **There is no "this conversation is archived" state in the UI at all** — the
  composer stays live and looks normal.

---

## F. After-leave surfaces

### (1) An open realtime subscription

Two subscriptions are live in a room:

* **Message INSERTs** — `useMessages.ts:136` via
  `subscribeToMessageInserts` → `realtimeHub.ts:104`. The hub keeps **one
  unfiltered `postgres_changes` channel per table**, ref-counted, and does no
  filtering of its own (`realtimeHub.ts:4-14`, `:101-102`); each subscriber
  scopes by `channel_id` itself (`useMessages.ts:140-141`).
* **Message UPDATEs** — a per-room channel with
  `filter: channel_id=eq.${channelId}` (`useMessages.ts:212-219`).

Neither is torn down on leaving, because leaving happens on a *different*
screen (`GroupInfoScreen`), and `popToTop()` (`:310`) unmounts
`TeamChatRoomScreen` and with it both subscriptions. **So the realtime
subscription is closed by the navigation, not by the leave.**

The residual risk is the enrich step: a delivered INSERT triggers a re-read of
that row (`useMessages.ts:155-165`), and after membership is gone that read is
refused. That case is already handled — the raw realtime row is rendered
instead of being dropped, with the reasoning in the comment at `:166-169`.

**INFERRED:** whether a post-leave INSERT is delivered at all depends on
whether RLS is applied to `postgres_changes` for `comm_messages` in this
project. Not determinable from `src`.

The provider-level subscriptions in `ChatUnreadContext` (`:210-214`, `:217-235`)
are mounted above the navigator and are unaffected by leaving a channel.

### (2) A push tap deep-linking into it

`routeNotification` (`AppNavigator.tsx:904-917`):

```ts
if (type === 'chat_message' || type === 'chat' || type === 'message') {
  const channelId = data.channel_id ?? data.chat_id ?? data.reference_id;
  if (channelId) nav.navigate('Main', {
    screen: 'ChatTab', params: { screen: 'TeamChatRoom', params: { channelId } },
  });
}
```

**Three problems for a left channel, all provable:**

1. **No membership check before navigating.** It opens `TeamChatRoom`
   unconditionally.
2. **It passes `channelId` only.** `TeamChatRoomScreen` destructures
   `{ channelId, channelName, teamName, channelType }` (`:80`), so all three
   of the others are `undefined`: the header falls back to `'Team Chat'`
   (`:715`), `isGroupDm` is `false` (`:109`) → **Group Info is unreachable from
   a push-opened room**, and `ChatInfo` receives `channelType: undefined`
   (`:723-730`) so its subtitle reads "Channel" (`:449-453`).
3. **A DM push also lands in `TeamChatRoom`, never `DMChat`** — there is no
   branch on channel kind.

What the user then sees is case (3).

### (3) The room opened from a stale list — **a silently empty thread**

`fetchMessages` (`useMessages.ts:46-125`) wraps its entire success path in
`if (!error && data) { … }` (`:71`) and then unconditionally
`setLoading(false)` (`:123`). **There is no `else`, no `logError`, and no error
state.** An RLS-refused read therefore leaves `messages` as it was (empty on a
fresh mount) and the screen renders a normal, empty conversation — no error, no
"you are no longer a member", nothing in the logs. This is the same
stale-not-wrong hazard class as the Oct-9 attendance read, and it is the single
most important post-leave gap on mobile.

Everything else on that screen degrades quietly in the same direction:
`useChannelMembers.fetchMembers` sets `[]` on error (`:29-32`),
`useChatSenderLabels` degrades to empty maps, `markChannelAsRead` logs its
failed stamp (`TeamChatRoomScreen.tsx:157`). The composer stays enabled; a
send attempt produces the honest `'insert'` alert (§E).

### UI gated on `role === 'admin'` or `created_by`

| gate | site | what it controls |
|---|---|---|
| `channel_role === 'admin'` (own row, from `get_channel_members`) | `GroupInfoScreen.tsx:124-125` | rename control (`:335-352`), **+ Add** (`:363-367`), per-member **Remove** (`:399-407`) |
| `channel_role === 'admin'` (any row) | `GroupInfoScreen.tsx:396-398` | the amber "Admin" badge |
| `myMembershipRole === 'admin'` **or** `created_by === user.id` **or** platform admin | `ChatInfoScreen.tsx:285-299` | the whole Archive section (`:519-521`) |
| `created_by === user.id` | `ChannelPollsScreen.tsx:386`, `:448`; `PollDetailScreen.tsx:215` | poll delete / creator-only controls |

Note the asymmetry: **Group Info reads its own role from the
`get_channel_members` RPC** (`:98-100` → `channel_role`, `:125`), while
**Chat Info reads it straight off the table** (`comm_channel_members.role`,
`ChatInfoScreen.tsx:147-151`, `:154`). Two different paths to the same fact.
`GroupInfoScreen` has no `created_by` gate at all, and the **Leave Group button
is ungated** (`:415-417`) — shown to admins and members alike, including to a
lone admin.

---

## G. Member-list naming

**`get_channel_member_names` is NOT used everywhere.** There are **three**
different name resolvers plus one unreachable screen:

| resolver | file | used by |
|---|---|---|
| `get_channel_member_names` + `get_channel_member_labels` (channel-scoped) | `useChatSenderLabels.ts:58`, `:101` | message bubbles, actions modal, reaction picker, typing names (`TeamChatRoomScreen.tsx:188-191`, `DMChatScreen` equivalents) |
| `get_channel_members` (channel-scoped, one call, carries `channel_role`) | `GroupInfoScreen.tsx:98-100` | **Group Info only** |
| `get_team_member_names` (**team**-scoped) via `src/lib/memberNames.ts:40` | `ChatInfoScreen.tsx:182-184`, `useChannelMembers.ts:36`, `useBoardVoteView.ts:74`, `useMessages.ts` reactor names, `PollDetailScreen` | Chat Info member list, read receipts, board vote, reactor names |

### The `'Unknown'` fallbacks

`UNRESOLVED_NAME = 'Unknown'` (`memberNames.ts:31`). `memberNames.ts:3-17`
states the contract explicitly: the RPC *"deliberately has NO email fallback —
callers must not add one"*, and every failure degrades to an empty map.
**Verified: no caller adds one** (zero `.email` hits across the chat stack).

Live `'Unknown'` sites:

* `ChatInfoScreen.tsx:251` — `resolved?.name || UNRESOLVED_NAME`. **This is the
  structural one.** Chat Info resolves names *team*-scoped
  (`fetchTeamMemberNames(teamId)` / `fetchChannelTeamMemberNames(channelId)`,
  `:174-176`), so in a **`group_dm` that has no `team_id`** — which is what
  `createGroup` writes (`ChatScreen.tsx:770-777`, no `team_id`) —
  `fetchChannelTeamId` returns null (`memberNames.ts:88-105`) and the map is
  empty, so **every member renders as "Unknown"**, and `getInitials('Unknown')`
  (`:329-337`) makes every avatar read "U". Group Info does not have this
  problem because `get_channel_members` is channel-scoped.
* `TeamChatRoomScreen.tsx:499`, `:519`; `DMChatScreen.tsx:352` — last-resort in
  the actions modal / reaction picker, with the comment at `:493-495` recording
  that an earlier narrower chain showed 'Unknown' on the very screen whose
  bubble had the name.
* `TeamChatRoomScreen.tsx:622`, `DMChatScreen.tsx:382` —
  `item.reply_to_sender ?? 'Unknown'` (denormalised column, not a lookup).
* `ChatScreen.tsx:348` — `'Unknown User'` for a null `other_user_name`.
* `ChannelPollsScreen.tsx:213` — `profileMap.get(p.created_by) || 'Unknown'`.
* **`DirectMessagesScreen.tsx:70`, `:194`** — `'Unknown'` with a direct
  `profiles` read (`:103-106`). This screen is **registered**
  (`AppNavigator.tsx:530-534`) but **unreachable**: no `navigate('DirectMessages')`
  exists anywhere in `src`. Dead code, with the pre-RPC naming pattern.
* `GroupInfoScreen.tsx:391` renders `{item.full_name}` with **no fallback** —
  a null name renders empty, and the avatar shows `'?'` (`:387`).

---

## BREAKS-IF

1. **DB refuses leaving a default team chat.** Nothing breaks, because nothing
   can call it: the only leave in the app is `GroupInfoScreen.tsx:289-294`,
   reachable only for `group_dm` (`TeamChatRoomScreen.tsx:109`, `:702-707`), and
   a default team chat is `channel_type='team'`. A hypothetical refusal is
   already handled correctly — the empty-result check at `:298-304` alerts
   "Could not leave group" and does **not** navigate away.
2. **DB refuses self-insert into a channel.** One real client call breaks:
   `StaffMessageScreen.tsx:131-133` pushes `user.id` into `memberIds` and
   `:157-162` inserts the batch — and since the error is never destructured
   (`:162`), the failure is **invisible** and the screen still navigates into
   the room (`:164-168`). Nothing else self-inserts;
   `ensure_team_channel_membership` (`ChatScreen.tsx:438`) is a DB function and
   is unaffected. **Fix before tightening:** drop the self-push and check the
   error.
3. **DB refuses changing `role` on your own membership row.** Nothing breaks.
   No client code updates `role` on any row — `role` appears only in INSERT
   payloads, only as `'member'`, and only for *other* users
   (`GroupInfoScreen.tsx:202`, `ChatScreen.tsx:785`);
   `StaffMessageScreen.tsx:157-162` writes no `role` at all. The four UPDATEs on
   `comm_channel_members` write `last_read_at`, `last_read_message_id`, and
   `is_muted` only (§D).
4. **RPC returns a 19th column / a non-email fallback name.** Nothing breaks.
   The result is cast to `any[]` (`ChatUnreadContext.tsx:174`), `ConversationRow`
   declares four optional fields (`unreadRule.ts:116-119`), and
   `toConversation` takes `row: any` (`ChatScreen.tsx:342`) — there is no column
   list, no fixed-shape destructuring, and no runtime validation anywhere on the
   path. A non-email name renders as-is through
   `row.other_user_name || 'Unknown User'` (`:348`). **A `team_status` column
   is additive and safe to ship before any client change.**

---

## OPEN DECISIONS

1. **Should leaving be possible for a default team chat at all?** Today mobile
   offers no leave for `team`/`club` channels (§A) while the DB permits it, and
   `ensure_team_channel_membership` would re-add the user on their next
   Chat-tab open anyway (`ChatScreen.tsx:429-447`) — so a leave on a default
   team chat is, on mobile, undoable by accident. Hide-vs-leave is a product
   call the code cannot make.
2. **Who may remove a member, and may a lone admin leave?** Remove is gated on
   `channel_role === 'admin'` (`GroupInfoScreen.tsx:124-125`) but
   **Leave is ungated** (`:415-417`) — the last admin can leave a group and
   strand it with no one able to rename, add, or remove. No succession rule
   exists in the code.
3. **What should a left or archived channel look like if the user still reaches
   it** (stale list, push tap)? Today: a silently empty thread with a live
   composer (`useMessages.ts:71`, §F3). An explicit "you're no longer in this
   conversation" state needs copy and a decision on whether history stays
   readable.
4. **Does Club-Wide ship or get removed?** It has been permanently dead since
   `channel_type='broadcast'` stopped being legal (`ChatScreen.tsx:992`, §B4),
   and prod has 2 `club` channels that the live code path cannot find. Fixing
   the value, repointing at `club`, or deleting the tile are three different
   products.
