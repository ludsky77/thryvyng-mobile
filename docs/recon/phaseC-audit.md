# Phase C audit — what already exists (READ-ONLY recon)

**Date:** 2026-10-13
**Mobile repo:** `/Users/ludsanz/Documents/thryvyng-mobile` @ `da2e565` (clean at start)
**Web repo:** `/Users/ludsanz/Documents/thrive-and-score` (read-only; migrations live here —
mobile holds exactly one migration, `20250224000000_notify_lineup_published.sql`)
**Method:** file reads, grep, `git log`. **No SQL was run against any database.**

> **Prod-drift warning that applies to every RLS/RPC claim in this document.**
> Every policy and function body quoted here is read from the *migration files* in the
> web repo. The chat migrations are applied by pasting into the Supabase SQL Editor and
> then `supabase migration repair --status applied` (see the HOW TO APPLY block at
> `20261013013626_stone_b2_s1_chat_permissions_leave.sql:39-45`), so the ledger is not
> proof of prod state. Two of the three files quoted carry commit messages that assert
> they were applied and verified (`6d9320c` "applied to prod, dry-run 43/43, ledger
> repaired"; `54aa39b` "applied to live 2026-09-17, verified 4/4"). The Jan 2026
> foundation file `20260108184412_*` carries only "Changes" and has a
> *known* drift history — `20260902090000_capture_drift_chat_registration_objects.sql`
> exists specifically because live objects diverged from migrations. **Treat anything
> sourced only from `20260108184412_*` as INFERRED until confirmed by a live read.**

---

## Item 1 — Manage members on existing chats (add + remove)

| | Add | Remove | Who can | Verdict |
| --- | --- | --- | --- | --- |
| Mobile, group chat (`group_dm`) | yes | yes | channel admin only | **EXISTS** |
| Mobile, team chat / club chat / DM | no | no | — | **MISSING** |
| Web, any chat | no | no | — | **MISSING** |

### Mobile — EXISTS, but only on group chats
`src/screens/GroupInfoScreen.tsx`:
* `:151-152` — `isAdmin` = this viewer's own row from `get_channel_members` has
  `channel_role === 'admin'`. Per-channel role, **not** the app role.
* `:421-426` — the `+ Add` header button renders only `if (isAdmin)`.
* `:238-256` — `addMember()` → `supabase.from('comm_channel_members').insert({ channel_id, user_id, role: 'member' })`.
* `:295-324` — `removeMember()` → `.delete().eq(channel_id).eq(user_id).select('user_id')`;
  treats a 0-row result as a refusal (correct — RLS filters a denied delete silently).
* `:457-466` — the per-row `Remove` button renders only `if (isAdmin && item.user_id !== user?.id)`.
* Candidate search is the `search_chat_contacts` RPC, debounced 300 ms (`:200-220`), with
  role chips (see Item 2).

**Reachability gate:** `GroupInfo` is only navigable from
`src/screens/TeamChatRoomScreen.tsx:706-713`, and only `if (isGroupDm)`. The header-center
tap is `disabled={!isGroupDm}`. For team and club rooms the kebab goes to `ChatInfo`
instead (`TeamChatRoomScreen.tsx:728-736`), and DMs also go to `ChatInfo`
(`DMChatScreen.tsx:530`).

`src/screens/ChatInfoScreen.tsx` (881 lines) has **no add and no remove member code at
all** — grep for `isAdmin|add|remove|\.insert|\.delete` returns only unrelated padding
styles and one copy string. It offers mute, staff-only toggle, archive, leave, and a
read-only member list (`:408`).

### Web — MISSING
"Edit Channel" exists twice and manages **name + description only**:
* `src/components/comm/ChannelList.tsx:178-184` opens the modal; `:913-947` is the modal
  body (two `Input`s: Channel Name, Description); `:244-258` `handleSaveEdit()` updates
  only `comm_channels.name` and `.description`.
* `src/components/comm/ChannelList.tsx:265-271` `canEditChannel()` = `isStaffRole(currentRole?.role)`
  **and** `channel.created_by === user?.id`. Creator-only, not admin-or-staff.
* `src/components/comm/TeamMessagesTab.tsx:303-309` — a second "Edit Channel" dropdown
  item whose entire body is `console.log('Edit channel:', selectedChannel.id)`. Dead UI
  (see Item 5).

The only web writes to `comm_channel_members` are channel *creation*
(`CreateChannelModal.tsx:314-336`, `TeamMessagesTab.tsx:114-118`) and bulk *channel
deletion* (`ChannelList.tsx:198`, `TeamMessagesTab.tsx:331`,
`ClubManagementTeamsTab.tsx:436`). Nothing edits membership on an existing chat.

### RLS on `comm_channel_members` — INSERT
`20261013013626_stone_b2_s1_chat_permissions_leave.sql:151-168`, policy `comm_channel_members_insert`,
`FOR INSERT TO public WITH CHECK`, three OR'd arms:
1. `public.is_channel_admin(auth.uid(), channel_id)` — a channel admin may insert **anyone**.
2. `channel_id IN (SELECT c.id FROM comm_channels c JOIN team_staff ts ON ts.team_id = c.team_id WHERE ts.user_id = auth.uid())`
   — team staff may insert **anyone** into any channel tied to their team.
3. Creator bootstrap: `user_id = auth.uid()` AND the caller created the channel AND
   `NOT public.channel_has_any_member(channel_id)` — yourself only, and only while the
   channel is still empty.

`is_channel_admin` = "has a `comm_channel_members` row with `role = 'admin'` on this
channel" (`20260108203115_*.sql:27-38`, re-declared identically at `20260112235411_*.sql:260-273`).
Nothing promotes team staff or club admins to channel admin automatically.

**Consequence worth carrying into the build prompt:** arm 2 keys on `comm_channels.team_id`.
A `group_dm` and a club channel both have `team_id` NULL, so for those **only arm 1
applies** — a club admin or head coach who is not a channel admin cannot add anyone to a
club-announcements channel or to a group chat. For a *team* channel, arm 2 means any team
staff member can add people **even though no mobile or web UI exposes it**.

### RLS on `comm_channel_members` — DELETE
Same file, `:191-200`, policy `comm_channel_members_delete`, two arms split on identity:
* `user_id = auth.uid() AND public.is_channel_leavable(channel_id)` — leaving yourself.
  `is_channel_leavable` (`:62-79`, SECURITY DEFINER) = not a DM, and either
  `channel_type = 'group_dm'` or (`channel_type IN ('team','club')` and `is_default IS NOT TRUE`).
* `user_id <> auth.uid() AND public.is_channel_admin(auth.uid(), channel_id)` — removing
  someone else requires channel admin, and **not** team staff. So a head coach who is not
  the chat's admin cannot remove a member even from their own team chat.

Deliberately split so nobody can leave a non-leavable chat through the admin arm.

### Triggers that fire on every removal (same file)
* `:233-244` + `trg_comm_channel_members_no_self_role_change` — nobody may change the
  `role` on their own membership row (escape hatch: a transaction-local GUC
  `thryvyng.chat_role_handover` that PostgREST cannot set).
* `:254-331` `chat_membership_after_delete()` + `trg_comm_channel_members_after_delete`
  (AFTER DELETE, FOR EACH ROW) — last member gone → archive the channel unless it is
  default or already archived; no admin left → promote team staff in the chat first
  (oldest `joined_at`), else the longest-standing member.

Also captured in the same migration, flagged there as prod drift with no migration of its
own: `:174-179` `"Users can update their own channel membership"` (UPDATE, `user_id = auth.uid()`
both sides), and `"Channel members can view co-member rows"` (SELECT) at
`20260902090000_capture_drift_chat_registration_objects.sql:26-29`.

---

## Item 2 — Players chip in the add-people pickers

**Verdict: MISSING on both apps, deliberately, and the two apps are missing it for
different reasons. Mobile is ~5 lines from having it; web is not.**

### Mobile — the data is already there, only the chip is absent
`src/lib/contactRoles.ts`:
* `:28` — `export type ContactRoleGroup = 'coaches' | 'managers' | 'parents'` with the
  comment "*Players are deliberately absent (deferred by ruling)*".
* `:44-58` — `contactRoleGroup()` maps `head_coach|assistant_coach → 'coaches'`,
  `team_manager → 'managers'`, `parent → 'parents'`, **`default → null`**. A candidate
  whose role is `'player'` therefore gets no group and shows only under "All".
* `:70-105` — `fetchContactRoles()` reads `user_roles` (`user_id, role`) **and**
  `team_staff` (`user_id, staff_role`), keeping the highest by `getRolePriority`.
  `user_roles.role` already carries `'player'` (`getRolePriority('player') = 3`,
  `src/lib/chatHelpers.ts:32`).

So on mobile the player tag is already fetched and already thrown away by a `default:`
branch. Consumers: `GroupInfoScreen.tsx:34-39, :326-336` and `ChatScreen.tsx:668-677`.

Player **accounts** are also already in the candidate list.
`search_chat_contacts` (`20261013013626_*.sql:440-494`) builds `team_people` from three
UNION'd branches, and the third is
`SELECT ur.user_id FROM players p JOIN user_roles ur ON ur.entity_id = p.id AND ur.role = 'player'::app_role WHERE p.team_id IN (SELECT team_id FROM my_teams)`
(`:479-481`). Players on your teams are returned today.

### Web — players are never fetched at all
`src/components/comm/CreateChannelModal.tsx:25-29` (comment, verbatim):
"*There is deliberately no 'player' group: players are never offered by this picker. The
players table is read only to resolve parent_email -> profiles, so the roster that reaches
this component holds staff and parents only.*"
`:29` `type RoleGroup = 'coach' | 'manager' | 'parent' | 'other'`; `:33-37` `ROLE_CHIPS`
= Coaches / Managers / Parents.

The fetch (`:107-243`) is three client-side table reads, not an RPC:
`team_staff` → `profiles` by id (`:119-139`), then `players (id, first_name, last_name, parent_email)`
→ `profiles` by **`.in('email', parentEmails)`** (`:153-179`), then `club_staff` → `profiles`.
Player accounts are never resolved.

### How a player links to an account
`players` has **no `user_id` column**. The generated types
(`thrive-and-score/src/integrations/supabase/types.ts`, `players.Row`) show
`email`, `parent_email` (NOT NULL), `secondary_parent_email`, `claimed_at` — the link is
by **email string match against `profiles.email`**, plus a second path through
`user_roles.entity_id = players.id AND role = 'player'`.
Both server functions use both paths: `chat_display_name` (`20261013013626_*.sql:115-135`)
matches `lower(pr.email) IN (lower(p.parent_email), lower(p.secondary_parent_email))`;
`search_chat_contacts` uses the `user_roles.entity_id` path for players.

### Can a client read that link under RLS?
From migrations:
* `players` SELECT — the newest policy is `"Parents and players can view own records"`
  (`20260112214626_*.sql:22-33`): your own child (unless revoked) or your own player row.
  Staff get rows through the older `"Team staff can view team players"`
  (`20251207133631_*.sql:94-98`). **A parent cannot read other families' `players` rows.**
* `profiles` SELECT — `"Team staff can view parent and player profiles"`
  (`20260112205506_*.sql:252-275`): staff only, by email-in-subquery.
* `user_roles` SELECT — `"Users can view all roles" USING (true)`
  (`20251106185952_*.sql:136-138`). Readable by every authenticated user. This is the one
  reliable client-side tag source, and is exactly why `contactRoles.ts:13-16` depends on it.

**Therefore:** web's client-side player/parent resolution works **only for team staff** and
returns an empty roster for a parent viewer; mobile's RPC route works for everyone. Any
Players chip should be built on mobile's pattern (`user_roles`), not web's.

---

## Item 3 — Likes / reactions

| Surface | Mobile | Web |
| --- | --- | --- |
| Team chat | **EXISTS** | **EXISTS** |
| Group chat (`group_dm`) | **EXISTS** | **EXISTS** |
| Club chat / club-announcements | **EXISTS** | **EXISTS** |
| DM | **EXISTS** | **EXISTS** |

Both apps reach every surface through a single room component, so coverage is uniform.

**Mobile.** Two room screens only.
`TeamChatRoomScreen.tsx` serves team, club, broadcast **and** `group_dm`
(routed from `ChatScreen.tsx:849, :1036, :1076, :1347, :1711`), and wires the full set:
`ChatBubble` (`:635`), tap-a-chip toggle (`:675`), `ReactionPicker` (`:830`),
`ReactionDetailsModal` (`:846`), long-press entry (`:377-380`), actions-modal entry (`:475-479`).
`DMChatScreen.tsx` has display + picker + toggle (`:401, :426, :432, :593`) but **no**
`ReactionDetailsModal`.
Write path: `useMessages.ts:560-597` (`addReaction` insert / `removeReaction` delete),
`:599-628` `toggleReaction` with optimistic paint and rollback.
Build date confirmed: `ReactionPicker.tsx` has exactly one commit, `1cc6c16 Cognitive
games foundation + chat enhancements - Feb 3 2026`.

**Web.** `MessageItem.tsx` is the only message renderer and is used only by `ChatPanel.tsx:468-477`;
`ChatPanel` is used by `TeamMessagesTab.tsx` and `ClubMessagesTab.tsx`, which cover team,
club and DM. `MessageItem.tsx:200-214` renders grouped reaction chips (`onReact`),
`:228-250` is the hover 🙂 picker. Toggle handlers:
`TeamMessagesTab.tsx:163-177`, `ClubMessagesTab.tsx:130-137`.
Web has **no** reaction-details ("who reacted") modal.

### Why Metro logs `comm_message_reactions CHANNEL_ERROR`

**Where the string comes from:** `src/lib/realtimeHub.ts:77-81` —
`.subscribe((status, err) => { if (__DEV__) console.log('[realtimeHub]', hub.topic, status, err?.message) })`,
with `hub.topic = 'hub:comm_message_reactions'` (`:36`). It is a plain status log, so the
line appears for any non-`SUBSCRIBED` status. **`err?.message` is printed and is the only
discriminator — it was not captured in the logs quoted to me, and it is the single most
valuable piece of missing evidence.**

**Is the table in the publication?** In the migration, yes:
`20260108184412_5d500626-5299-40c5-8a5d-45ce30d98b72.sql:563`
`ALTER PUBLICATION supabase_realtime ADD TABLE comm_message_reactions;` — sitting between
`comm_messages` (`:562`) and `comm_channel_members` (`:564`) in one "STEP 8: ENABLE REALTIME"
block. No later migration removes it, and `REPLICA IDENTITY` is never set anywhere in the
254 migration files. **This is the one file in the chat stack with no applied-and-verified
commit message (`cd1b03e "Changes"`) and a documented drift history, so publication
membership in prod is INFERRED, not proven.**

**Is the subscription filter valid?** There is **no filter**. `realtimeHub.ts:59-76`
subscribes with `{ event: '*', schema: 'public', table: 'comm_message_reactions' }` and
fans out to ref-counted callbacks; the comment at `:13-14` says callers filter rows
themselves, and `useMessages.ts:197-205` does. So "invalid filter" is **ruled out** — there
is nothing to be invalid.

**Ranked causes (all INFERRED — none can be settled without a live read):**
1. **`comm_message_reactions` is not actually in the prod publication.** Fits the symptom
   exactly, and the source migration is the untrustworthy one. *Counter-evidence:* web
   subscribes to `comm_messages` and `comm_message_reactions` **on the same channel**
   (`thrive-and-score/src/hooks/useMessages.ts:86-148`, one `.channel()` with two `.on()`
   calls), so if the table were absent, web's channel would error too and web would stop
   receiving live *messages* — a loud, obvious failure. Mobile isolates reactions on their
   own channel (`realtimeHub.ts:35-41`), which is why only mobile logs it.
2. **Realtime's RLS check on the table refuses the subscriber.** `comm_reactions_select`
   (`20260108184412_*.sql:418-424`) gates on
   `message_id IN (SELECT id FROM comm_messages WHERE channel_id IN (SELECT channel_id FROM comm_channel_members WHERE user_id = auth.uid()))`
   — a two-level subquery with no index hint. Nothing in code proves this errors, but it is
   the only other per-table gate in the path.
3. **Transient socket/auth-refresh churn, not a config fault.** `AuthContext.tsx:215-231`
   removes realtime channels on app background; a `CHANNEL_ERROR` on resume would be noise.
   Mobile runs `@supabase/supabase-js` **2.93.3** (lockfile-confirmed in
   `node_modules/@supabase/realtime-js/package.json`), web runs **2.80.0** — a version skew
   that also fits "mobile only".

**What would settle it, read-only, in one query** (for Lu or a later task — I did not run it):
`SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename LIKE 'comm_%';`
If `comm_message_reactions` is absent → cause 1, and the fix is a one-line migration.
If present → capture `err?.message` from Metro before touching anything.

---

## Item 4 — Date separators

| Surface | Verdict |
| --- | --- |
| Mobile team / group / club / broadcast (`TeamChatRoomScreen`) | **EXISTS** |
| Mobile `MessageReadHistoryScreen` | **EXISTS** (label only) |
| Mobile DM (`DMChatScreen`) | **MISSING** |
| Web — every chat surface | **MISSING** |

**The helper is shared, not copy-pasted.** `src/utils/chatDays.ts` (112 lines, one commit:
`95821b2`) exports `localDayKey`, `isNewLocalDay`, `formatDayDivider`,
`invertedDayDividerIndices`. It is pure and clock-injectable, works in the **reader's local
timezone** (`:30-31`: "getFullYear/getMonth/getDate are LOCAL accessors. This is the whole
point."), returns `''` for unparseable input rather than "Invalid Date", and ships with a
unit-test file, `src/utils/chatDays.test.ts`.

Note the commit subject for `95821b2` reads "local-day dividers **fixed**", and
`TeamChatRoomScreen.tsx:20` imports from the helper — so Feb 2026 built dividers inline in
`TeamChatRoomScreen` and Oct 2026 extracted them. The shared helper is the current state;
there is no second copy to reconcile.

Consumers:
* `TeamChatRoomScreen.tsx:20` (import), `:563` `invertedDayDividerIndices(invertedMessages.map(m => m.created_at))`,
  `:567` `formatDateSeparator`, `:580` render. Inverted-list aware: the divider belongs to
  the **oldest** message of each local day, i.e. the highest index in a newest-first array
  (`chatDays.ts:86-111`).
* `MessageReadHistoryScreen.tsx:34` imports `formatDayDivider` only.
* **`DMChatScreen.tsx` does not import it.** Grep for `formatD|timestamp|toLocale|Today|Yesterday`
  across the whole file returns one hit, `:406 created_at: item.created_at` — a prop pass,
  not a label.

**Web has no day grouping anywhere in chat.** `MessageItem.tsx:125` prints
`formatDistanceToNow(new Date(message.created_at), { addSuffix: true })` — a per-message
relative stamp ("3 hours ago"). The only `Separator` imports in `src/components/comm/` are
`ChatPanel.tsx:15, :588, :595, :615` (dropdown dividers) and `TeamMessagesTab.tsx:246, :265`
(a polls-section rule). No `isToday`/`isYesterday`/`startOfDay` in any chat file.

**Reuse note for the build prompt:** `chatDays.ts` is pure TypeScript with no React Native
imports, so it can be copied into the web repo verbatim; the only web-side work is the
non-inverted index rule (web renders oldest-first, so the divider belongs to the *lowest*
index of each day — `invertedDayDividerIndices` must not be used as-is).

---

## Item 5 — Web: remaining `window.confirm` on channel delete, and the emoji `console.log`

### `"Delete this channel? All messages will be permanently lost."` — 2 sites, both live
* `src/components/comm/ChannelList.tsx:189` — inside `handleDeleteChannel`, which then
  deletes `comm_messages` (`:197`), `comm_channel_members` (`:198`), `comm_channels`
  (`:200-204`), and re-reads the row to detect a silent RLS refusal (`:215-231`). The
  function is also littered with emoji logs: `:187 '🗑️ Delete clicked for channel:'`, `:191 '❌ Delete cancelled by user'`,
  `:207 '❌ Delete error:'`, `:224 '❌ Channel still exists - RLS may be blocking'`,
  `:233 '✅ Channel deleted successfully'`, `:240 '❌ Exception:'`.
* `src/components/comm/TeamMessagesTab.tsx:327` — same string, inline in the dropdown
  `onClick`, same three deletes (`:330-332`), **no** refusal re-check.

Both are gated by `!selectedChannel.is_default && selectedChannel.created_by === user?.id`
(`TeamMessagesTab.tsx:324`) / `canDeleteChannel()` (`ChannelList.tsx:273-287`).

**Context — the leave flow was already converted and is the pattern to copy.**
`src/components/comm/LeaveChannelDialog.tsx:24` says, verbatim: "*Replaces the window.confirm
added in S3*", and `src/hooks/useLeaveChannel.ts:20` says "*The confirm is an in-app
AlertDialog, not window.confirm*". Delete is the remaining unconverted destructive action
in chat. (Repo-wide there are 27 other `window.confirm` calls outside chat — program
builder, training studio, staff requests, products, events — listed only so the build
prompt does not mistake them for chat scope.)

### `CreateChannelModal` emoji `console.log` — 8 logs + 3 `console.error`
`src/components/comm/CreateChannelModal.tsx`:
`:115 '🔍 Fetching members - teamId:', teamId, 'clubId:', clubId`
`:124 '📋 Team staff raw:', staffData, staffError`
`:137 '👥 Staff profiles:', staffProfiles`
`:161 '⚽ Players raw:', playersData, playersError`
`:171 '📧 Parent emails found:', parentEmails`
`:179 '👨‍👩‍👧 Parent profiles:', parentProfiles`
`:239 '✅ Final members list:', allMembers`
`:242 '❌ Error fetching members:', error`
plus `:334 'Error adding members:'` and `:346 'Error creating channel:'` (no emoji).

**Privacy note, not just noise:** `:124`, `:137`, `:161`, `:171`, `:179` and `:239` print
raw rows to the browser console — staff and parent **email addresses**, and player first
and last names. That is the same class of leak the mobile side spent Phase B closing
("no email fallback", "email guard at write boundary", `da2e565`). `:171` is the worst: a
bare array of parent emails.

---

## Item 6 — Role label: why mobile says "Team Manager" and web says "Head Coach"

**Verdict: PARTIAL / divergent by construction. Neither app has one role-label source;
mobile alone has four, and the chat one picks an arbitrary row when a person holds two
`team_staff` rows on the same team.**

### The precondition both apps ignore
A user can hold **more than one `team_staff` row on the same team**. This is documented in
six mobile files, in near-identical words — e.g. `ChatInfoScreen.tsx:126-129`:
"*Existence check, not a row fetch: a user can hold several team_staff rows on one team
(e.g. Head Coach + Team Manager), and maybeSingle() errors on 2+ rows -- which silently
stripped staff UI from exactly the most senior staff.*"
Same note at `PollDetailScreen.tsx:180`, `EventDetailScreen.tsx:236`,
`ChannelPollsScreen.tsx:88`, `RosterScreen.tsx:103`, `TeamDetailScreen.tsx:96`.
A test account named "Cole Coachman" holding both `head_coach` and `team_manager` on one
team is exactly the shape these comments describe.

### The mechanism — same data, opposite tie-break
* **Mobile chat member list — LAST row wins.** `src/screens/ChatInfoScreen.tsx:252-257`:
  ```
  .from('team_staff').select('user_id, staff_role').eq('team_id', teamId)
  staffMap = new Map(staffData?.map((s) => [s.user_id, s.staff_role]) || []);
  ```
  No `ORDER BY`. Building a `Map` from an array with a duplicate key keeps the **last**
  entry, so whichever of Cole's two rows PostgREST happens to return second decides the
  label. The `if/else` ladder at `:268-287` then prints `'Head Coach'` (`:270`),
  `'Asst. Coach'` (`:273`) or `'Team Manager'` (`:276`). **This is the mobile
  "Team Manager".**
* **Web add-people picker — FIRST row wins.** `CreateChannelModal.tsx:141, :147`:
  `staffData.find(s => s.user_id === profile.id)` → `staffEntry?.staff_role?.replace('_',' ')`.
  `.find()` returns the first match. Same unordered read, opposite pick. (Output is
  lowercase, "head coach" — so if Lu saw title-cased "Head Coach", it was not this site.)
* **Mobile pickers/DM — HIGHEST PRIORITY wins (the only correct one).**
  `src/lib/contactRoles.ts:78-84` and the inline copies at `ChatScreen.tsx:573-595` and
  `DirectMessagesScreen.tsx:147-165` keep the max of `getRolePriority`
  (`chatHelpers.ts:23-36`: `head_coach: 10` > `team_manager: 8`), rendered through
  `formatRoleLabel` (`chatHelpers.ts:5-21`). This reliably yields **"Head Coach"**.

So on mobile *today*, Cole reads "Head Coach" in the DM list and the add-people picker and
"Team Manager" in team-chat Info — from one database, in one app, in one session.

### Every role-label site, for the build prompt
**Mobile (4 sources):**
| Site | Source | Tie-break |
| --- | --- | --- |
| `ChatInfoScreen.tsx:252-287` | `team_staff.staff_role`, direct read | last row (bug) |
| `contactRoles.ts:78-105` → `chatHelpers.ts:5-21` (`ChatScreen.tsx:1258`, `DMChatScreen.tsx:522`, `DirectMessagesScreen.tsx:77`) | `user_roles` + `team_staff` | highest priority |
| `GroupInfoScreen.tsx:70-83` `memberSubtitle()` | `get_channel_members.label_kind` | n/a — coarse: only `Staff` / `Player` / `Parent of X`, **never** a staff title |
| `RoleSwitcher.tsx:20, :154` `ROLE_LABELS` | `user_roles` via `useAuth` | own role only |

**Web (3 sources):**
| Site | Source | Output |
| --- | --- | --- |
| `CreateChannelModal.tsx:147` | `team_staff.staff_role` | `"head coach"` (lowercase, `_`→space), first row |
| `MessageItem.tsx:70-79` | `get_channel_member_labels.label_kind` | `(Child's)` / `(Player)` / nothing — **no staff title at all** |
| `MainNavigation.tsx:49-61` `getRoleName()` | `currentRole.role` from `user_roles` | `"Head Coach"` — **title-cased, exact match for what Lu saw** |

**Most likely answer, marked INFERRED:** the web "Head Coach" is
`MainNavigation.tsx:53` (`if (currentRole?.role === 'head_coach') return 'Head Coach'`) or
a roster view, reading the **global `user_roles` row**; the mobile "Team Manager" is
`ChatInfoScreen.tsx:276` reading an **arbitrary one of two per-team `team_staff` rows**.
They are not the same question asked twice — they are two different tables with two
different tie-breaks. Web chat cannot render "Head Coach" at all: no `src/components/comm/`
file contains that string.

**Two gaps that stop this being CONFIRMED** (both out of scope here — SQL is FORBIDDEN):
1. Which screen Lu was on when mobile said "Team Manager". If it was team-chat Info →
   `ChatInfoScreen.tsx:257`. If it was the DM list or add-people picker, the priority merge
   is in play and the diagnosis changes.
2. Cole's actual rows. The settling read-only query:
   `SELECT 'user_roles' src, role::text, entity_id FROM user_roles WHERE user_id = '<cole>' UNION ALL SELECT 'team_staff', staff_role, team_id FROM team_staff WHERE user_id = '<cole>';`

**Second-order bug found while tracing this.** `get_channel_member_labels`
(`20260902090000_*.sql:90-128`) resolves `label_kind` in a fixed order — staff → player →
parent — and **widens every branch when `comm_channels.team_id IS NULL`**
(`(v_team_id IS NULL OR ts.team_id = v_team_id)`, `:108-109`). In a group chat or a club
channel (both `team_id` NULL) a person is labelled `'staff'` if they are `team_staff` on
**any team anywhere**, and the player branch (`:110-111`) checks `user_roles` with no team
scope at all. A parent who also holds a `player` role reads "Player" in every group chat.
Mobile shows this at `GroupInfoScreen.tsx:70-83`, web at `MessageItem.tsx:70-79`.

---

## Item 7 — Remove a player from a team / club

**Verdict: EXISTS on both apps, server-enforced, audited. Does NOT touch club-announcements.**

### The server function
`supabase/migrations/20260917120000_remove_player_from_team.sql` (commit `54aa39b`,
"applied to live 2026-09-17, verified 4/4"). Three objects: the `player_placements` status
CHECK widened to accept `'removed'` (`:32-45`), table `roster_removal_log` (`:53-71`,
SELECT-only RLS for club admins of that team's club + platform admins), and
`remove_player_from_team(p_player_id uuid, p_reason text)` (`:80`), SECURITY DEFINER,
returning JSON.

**Who can (G3, `:127-140`):** `public.is_team_staff(v_actor, v_team_id)`
OR `public.is_club_admin(v_actor, get_team_club_id(v_team_id))` OR
`has_role(v_actor, 'platform_admin')`. So **team staff, club admins of that club, and
platform admins** — raises `P0012 / not_authorized` otherwise.

**Money gate (G4, `:142-172`, READ ONLY):** if any non-cancelled `program_registrations`
row still owes a balance, or has a `registration_payments` row in `pending|processing|failed`,
then a **coach is refused** (`P0014 / active_payments_admin_only`) and only a club admin or
platform admin may proceed.

**What it changes:**
| Step | Table / column |
| --- | --- |
| W1 `:176-180` | `players.team_id → NULL`, `updated_at`. **`players.status` is deliberately never written** — the player keeps identity and club membership. |
| W2 `:182-195` | `player_placements.status → 'removed'` where `assigned_team_id = team` and status in `assigned, invited, accepted, rostered`. Terminal states untouched. |
| W3 `:197-205` | `DELETE FROM team_roster` for that player+team. |
| W4 `:207-253` | `DELETE FROM comm_channel_members` where the channel is in `SELECT id FROM comm_channels WHERE team_id = v_team_id` and the user is family (profiles.email = player's `email`/`parent_email`/`secondary_parent_email`) **and** no sibling still attached to that team (rostered via `players.team_id`, or an `'invited'` `player_placements` row). A parent with two kids on the team keeps chat. |
| W5 `:255-262` | `INSERT INTO roster_removal_log` (player, team, removed_by, reason, had_active_payments). |

The header comment (`:1-16`) lists what it deliberately does **not** write: commissions,
orders, program_registrations, registration_payments, registration_answers, scholarship
applications, `user_roles`, coparent_invitations, pending_parent_links, parent_revocations,
player_invitations, xp_awards, course_enrollments, any game/progress table.

### Does it remove the family from club-announcements? **NO.**
W4 scopes to `cc.team_id = v_team_id`. A club channel has `team_id` **NULL** — that is the
same NULL that makes `is_channel_leavable` treat club channels separately
(`20261013013626_*.sql:62-79`) and that widens `get_channel_member_labels`. So a removed
family **stays in club-announcements**, and the default club channel also **cannot be left**
(`is_default IS NOT TRUE` is required to leave). Removing them needs a channel admin
(Item 1, DELETE arm 2) and no UI exists for that in either app.
**This is the single biggest functional gap the audit found.**

### The UI, both apps
* **Mobile** — `src/components/RemovePlayerFromTeamModal.tsx` (one commit, `57e9dbb`
  "staff-only roster removal — 3-state bottom sheet wired to remove_player_from_team"),
  RPC call at `:174`. Entry: `src/screens/RosterScreen.tsx:772-785`, and the comment at
  `:774-775` states the gate — "*Staff-only: the only entry point is the canManage-gated
  kebab on each roster row*"; `canManage = isStaffInTeam` (`:121`), `isAdminForClub`
  computed `:130-136` and passed as `isAdmin`.
* **Web** — `src/components/team/RemovePlayerDialog.tsx` (one commit, `97e47a1`
  "roster removal UI — 3-state dialog wired to remove_player_from_team (team-side +
  club-side)"), RPC call at `:182`, i18n strings in `src/lib/translations/en.ts:138-160`
  and `es.ts:138`. Two entry points: `src/components/team/TeamRosterTab.tsx:353` and
  `src/components/club/team-detail/TeamRosterTab.tsx:369`, both "Remove from Team" in a
  row kebab, both passing `isAdmin={isClubAdminFor(player.club_id)}`.
* Both clients replicate the server's admin test and money test **for UX only** and say so
  — `TeamRosterTab.tsx:72-73`: "*Mirrors v_is_admin in remove_player_from_team… UX only --
  the RPC re-checks permission and money server-side.*"; `RemovePlayerDialog.tsx:105`
  "*Client-side replica of G4*".

**Remove from a CLUB (as opposed to a team): MISSING on both apps.** No function, no UI.
`players` has no club column; club membership is implied through `team_id → teams.club_id`,
and W1 clears only `team_id`.

---

## Item 8 — Staff Message recipients: can the sender uncheck individual people?

**Verdict: MISSING on mobile. No equivalent feature on web.**

**Mobile** — `src/screens/StaffMessageScreen.tsx`, reached only from
`ChatScreen.tsx:1185-1199` inside the `isClubAdmin` block (`:1162`), passing `{ clubId }`.
* `:117-122` four **radio** options: All Staff, Head Coaches Only, All Coaches,
  Team Managers Only. `:233-258` renders them with a radio-outer/inner, single-select.
* `:104-115` `filteredStaff` is derived purely from that one radio choice.
* `:262-288` the recipient list is a **read-only preview**, `data={filteredStaff.slice(0, 10)}`
  with a `+N more` footer. No checkbox, no press handler, no selection state.
* `:124-131` on send, recipients are `filteredStaff.map(s => s.user_id)` — the whole
  filtered set, unconditionally.

Contrast: the **new-group** picker on the same app *does* support deselection —
`ChatScreen.tsx:795-798` `removeUserFromGroup()`. So the pattern already exists in the
codebase; Staff Message simply never adopted it.

**Web** — there is no staff-message chat feature. Grep for
`staff message|staffmessage|'All Staff'|Head Coaches Only` across `thrive-and-score/src/`
returns **zero** hits. The nearest things are both email, not chat, and neither offers
per-person unchecking: `ClubCommunicationsTab.tsx:574-577` (email blast, checkboxes are
per **team**, `blastForm.selectedTeams`) and
`club/programs/team-assignments/MessageRecipientsModal.tsx:116-134, :266` (recipients
arrive as `selectedPlacements` from upstream; the modal only shows
`{totalSelected} selected → {uniqueEmails.size} unique parent` and sends).

### FOUND while reading this screen — a likely hard bug, not a cosmetic gap
`StaffMessageScreen.tsx:143-162` creates the channel with `channel_type: 'group_dm'` and
`created_by: user?.id`, then:
```
:128-132  const memberIds = filteredStaff.map(s => s.user_id);
          if (user?.id && !memberIds.includes(user.id)) memberIds.push(user.id);
...
:157-162  const memberInserts = memberIds.map(userId => ({ channel_id: channel.id, user_id: userId }));
          await supabase.from('comm_channel_members').insert(memberInserts);
```
The trigger `trigger_add_creator_to_members` → `add_creator_to_channel_members()`
(`thrive-and-score/supabase/migrations/20260112025123_*.sql:56-74`) fires AFTER INSERT on
`comm_channels` for `channel_type IN ('group','group_dm','direct','dm')` and inserts the
creator with `role = 'admin'`. So by the time line `:162` runs, the creator's row **already
exists**, and `comm_channel_members` has `UNIQUE (channel_id, user_id)`
(`20260108184412_*.sql:69-78`, the constraint on `:77`; independently corroborated by
`20261013013626_*.sql:540-543`, which relies on `ON CONFLICT (channel_id, user_id)`). A multi-row `INSERT` is one statement: the unique
violation fails **the whole batch**, so *no* staff member is added. The result is never
checked — `await` with no `{ error }` destructure — and `:165-169` navigates to the room
regardless. Expected symptom: a Staff Message group that contains only its creator.

This is not speculation about the trigger; the sibling code path documents the exact hazard
and avoids it. `ChatScreen.tsx:818-820`, verbatim: "*The creator is NOT inserted here: the
DB trigger already adds them as admin, and UNIQUE (channel_id, user_id) would fail the
whole batch.*" — and `:819` filters with `.filter(u => u.id !== user.id)`, checks
`memberError`, and rolls the channel back on failure (`:827-841`).
`StaffMessageScreen.tsx` does the opposite on all three counts.
**Status: code-level CONFIRMED by reading; runtime UNVERIFIED (device smoke not in scope).**

Secondary: `:157-160` omits `role`, so even if the insert succeeded every staff member
would be a plain `member`. Combined with Item 1, that means only the creator (admin, via
trigger) can ever add or remove anyone from a Staff Message group.

---

## Item 9 — Overwrite guard: `git log --oneline` since Jan 2026, every file above

Anything listed here is **working code with recent, deliberate commits — preserve it.**

### Mobile (`thryvyng-mobile`, branch `main` @ `da2e565`)
Four commits dominate the chat stack and must not be regressed:
`da2e565` Phase B names/role chips · `bfe297b` Stone B honest counters ·
`95821b2` truthful send errors + local-day dividers + read-history ·
`920c7d5` Stone B2 S2a leave-group UI.

| File | Commits since 2026-01-01 (newest first) |
| --- | --- |
| `src/screens/GroupInfoScreen.tsx` | `da2e565`, `920c7d5`, `03b44ab` (Stone F — group info RPC, admin gating, remove member, createGroup creator-exclusion + rollback), `db5dedb` |
| `src/screens/ChatInfoScreen.tsx` | `da2e565`, `920c7d5`, `bbf2d3c`, `d60592b`, `cb7cfcf`, `3fa9524`, `33be9bb`, `9cc8211` |
| `src/screens/TeamChatRoomScreen.tsx` | **24 commits** — `da2e565`, `bfe297b`, `95821b2`, `bbf2d3c`, `446518a`, `f7a37c3`, `0da0058`, `0586b89`, `e769e7f`, `3c41601`, `e93bddf`, `413ef36`, `76fbe45`, `3fa9524`, `0791e72`, `68635e4`, `443958b`, `7a79646`, `9cc8211`, `734816a`, `1cc6c16`, `db5dedb`, `3c4c193` |
| `src/screens/DMChatScreen.tsx` | 15: `da2e565`, `bfe297b`, `95821b2`, `446518a`, `f7a37c3`, `0da0058`, `e769e7f`, `3c41601`, `e93bddf`, `413ef36`, `33be9bb`, `68635e4`, `734816a`, `1cc6c16`, `db5dedb` |
| `src/screens/ChatScreen.tsx` | 23: `da2e565`, `bfe297b`, `bbf2d3c`, `cb7cfcf`, `03b44ab`, `0da0058`, `e769e7f`, `89c6697`, `e93bddf`, `413ef36`, `33be9bb`, `6f5e38a`, `630c9f6`, `95a5c9f`, `0cd34dd`, `68635e4`, `443958b`, `9cc8211`, `1eb409d`, `ce915eb`, `887de07`, `db5dedb`, `3c4c193` |
| `src/screens/DirectMessagesScreen.tsx` | `da2e565`, `db5dedb` |
| `src/screens/StaffMessageScreen.tsx` | `da2e565`, `d60592b`, `9cc8211` — **never touched since Feb except name resolution; the Item 8 bug has never been revisited** |
| `src/screens/RosterScreen.tsx` | 13: `cb7cfcf`, `57e9dbb` (roster removal), `dbed00e`, `efcc294`, `e8ae9a5`, `70a9265`, `27c4eae`, `c596dca`, `9cc8211`, `1eb409d`, `db5dedb`, `7779ae8`, `e473d5d` |
| `src/screens/MessageReadHistoryScreen.tsx` | `95821b2` (only) |
| `src/components/chat/ChatBubble.tsx` | `95821b2`, `bbf2d3c`, `3c41601`, `e93bddf`, `7a79646`, `1cc6c16` |
| `src/components/chat/ReactionPicker.tsx` | `1cc6c16` (only — **Feb 3 2026, untouched since**) |
| `src/components/chat/ReactionDetailsModal.tsx` | `da2e565`, `bbf2d3c`, `1cc6c16` |
| `src/components/RemovePlayerFromTeamModal.tsx` | `57e9dbb` (only) |
| `src/components/RoleSwitcher.tsx` | `989408a`, `f733646`, `e473d5d`, `3c4c193` |
| `src/hooks/useMessages.ts` | 13: `da2e565`, `95821b2`, `bbf2d3c`, `d60592b`, `3c41601`, `89c6697`, `0e73c0d`, `0791e72`, `68635e4`, `ac43555`, `1cc6c16`, `3c4c193`, `5084132` |
| `src/hooks/useChannelMembers.ts` | `da2e565`, `bfe297b`, `d60592b`, `1cc6c16` |
| `src/lib/realtimeHub.ts` | `89c6697` (only — "*fixes rooms never receiving live messages*"; **do not restructure while chasing Item 3**) |
| `src/lib/chatHelpers.ts` | `db5dedb` (only — Feb 2 2026; holds `formatRoleLabel` + `getRolePriority`) |
| `src/lib/contactRoles.ts` | `da2e565` (only — new in Phase B; the Players-chip edit point) |
| `src/lib/memberNames.ts` | `da2e565`, `d60592b` |
| `src/lib/channelLeave.ts` | `da2e565`, `920c7d5` |
| `src/utils/chatDays.ts` | `95821b2` (only; `chatDays.test.ts` alongside) |

### Web (`thrive-and-score`)
Two named chat commits to preserve: `dce360e` Phase A (Leave AlertDialog, add-people role
chips, hide club-announcements member list) and `c33d526` Stone B2 S3 web leave-group UI.
Older history is mostly Lovable-style `"Changes"` commits with no recoverable intent —
treat those files as **unowned and safe to refactor**, and `dce360e` / `c33d526` as owned.

| File | Commits since 2026-01-01 |
| --- | --- |
| `src/components/comm/ChannelList.tsx` | `dce360e`, `c33d526`, `1ab6b0a`, then **19 × "Changes"** |
| `src/components/comm/ChatPanel.tsx` | `dce360e`, `c33d526`, `391d0f5`, `e29d72d`, `cc4995b`, `98d39a5`, `8c1a26f`, `db32301`, `d71c44b`, `75b91cc`, `0436a94`, + 13 × "Changes" |
| `src/components/comm/CreateChannelModal.tsx` | `dce360e`, `3ef0db8`, `5d0b041`, `0d54cc5`, `44df163` |
| `src/components/comm/MessageItem.tsx` | `98d39a5` (web chat parity: names/labels via RPCs), `02c174e`, `5d0b041`, `abbbb5f` |
| `src/components/comm/TeamMessagesTab.tsx` | **35 commits** — `dce360e`, `c33d526`, `8c1a26f`, `f8628cb`, `8f66ffa`, `d0db074`, `2dae8da`, `9e80eca`, `b51566d`, + 26 "Changes"/"Preceding changes" |
| `src/components/comm/NewDirectMessageModal.tsx` | `c6e5066` ("Changes") only |
| `src/components/comm/LeaveChannelDialog.tsx` | `dce360e` (only — the AlertDialog pattern to copy for Item 5) |
| `src/components/club/ClubMessagesTab.tsx` | `c33d526`, `ea97997`, `5ef1eb0`, `22ad5e1`, `795752d`, `5605c94`, `312cef4`, `44df163` |
| `src/components/team/RemovePlayerDialog.tsx` | `97e47a1` (only) |
| `src/components/team/TeamRosterTab.tsx` | `97e47a1`, `fe22175` |
| `src/components/club/team-detail/TeamRosterTab.tsx` | `97e47a1`, `b32ab1e`, `0aa742c`, `4dbd4db`, `d349767` |
| `src/components/layout/MainNavigation.tsx` | `06a59ac`, `4f2bf46`, `d8e8273` |
| `src/components/RoleSwitcher.tsx` | `d756295` ("Changes") only |
| `src/hooks/useMessages.ts` | `98d39a5`, `6efd0e5`, `9c07e39`, `4a70302`, `8808086` ("*scope reactions subscription*"), `d429ded`, `b51566d`, `02c174e`, `5d0b041`, `abbbb5f` |
| `src/lib/channelPermissions.ts` | `dce360e`, `c33d526` |
| `src/components/club/ClubManagementTeamsTab.tsx` | 35 commits (`addb264`, `7b2ccf1`, `a6a3344`, `a3fae64`, `0ed0657`, `4aa60d5`, …) |
| `supabase/migrations/20261013013626_stone_b2_s1_chat_permissions_leave.sql` | `6d9320c` — "applied to prod, dry-run 43/43, ledger repaired" |
| `supabase/migrations/20260917120000_remove_player_from_team.sql` | `54aa39b` — "applied to live 2026-09-17, verified 4/4" |
| `supabase/migrations/20260108184412_*.sql` | `cd1b03e` "Changes" — **the realtime-publication source, with no applied/verified claim** |

---

## Summary table

| # | Item | Mobile | Web | Key proof |
| --- | --- | --- | --- | --- |
| 1 | Manage members (add/remove) | **EXISTS** — group chats only, channel admin only | **MISSING** — Edit Channel = name+desc | `GroupInfoScreen.tsx:151,421,457`; `ChannelList.tsx:913`; `20261013013626:151,191` |
| 2 | Players chip in pickers | **MISSING** (tag already fetched; `default:` drops it) | **MISSING** (players never fetched) | `contactRoles.ts:28,53`; `CreateChannelModal.tsx:25-29` |
| 3 | Likes / reactions | **EXISTS** all 4 surfaces | **EXISTS** all 4 surfaces | `TeamChatRoomScreen.tsx:830`; `MessageItem.tsx:200-250` |
| 3b | `CHANNEL_ERROR` cause | filter ruled out; publication present in migration, prod state INFERRED | n/a | `realtimeHub.ts:59-81`; `20260108184412:563` |
| 4 | Date separators | **PARTIAL** — shared helper, DM lacks it | **MISSING** everywhere | `chatDays.ts`; `TeamChatRoomScreen.tsx:563`; `MessageItem.tsx:125` |
| 5 | `window.confirm` + emoji logs | n/a | **2 confirms, 8 emoji logs (incl. emails)** | `ChannelList.tsx:189`; `TeamMessagesTab.tsx:327`; `CreateChannelModal.tsx:115-239` |
| 6 | Role label divergence | 4 sources; chat one picks last of 2 rows | 3 sources; chat has no staff title | `ChatInfoScreen.tsx:257,276`; `MainNavigation.tsx:53` |
| 7 | Remove player from team | **EXISTS** | **EXISTS** | `RemovePlayerFromTeamModal.tsx:174`; `RemovePlayerDialog.tsx:182`; `20260917120000:127,229` |
| 7b | …also removes from club-announcements? | **NO** (W4 scopes `team_id`; club channels are NULL) | **NO** | `20260917120000:229-232` |
| 8 | Staff Message per-person uncheck | **MISSING** (4 radios + read-only preview) | **no such feature** | `StaffMessageScreen.tsx:117,262,128` |
| 8b | Staff Message member insert | **likely broken** — creator included → unique violation → 0 members | n/a | `StaffMessageScreen.tsx:128-162` vs `ChatScreen.tsx:818-820` |
| 9 | Overwrite guard | 22 files logged | 19 files logged | this document, Item 9 |
