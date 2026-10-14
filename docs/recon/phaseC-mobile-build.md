# Phase C — mobile build

**Date:** 2026-10-14
**Base:** `da2e565` + untracked `docs/recon/phaseC-audit.md`
**Not committed.** `git status --short` is at the end of this file.
**tsc:** 70 → **64** errors. Zero in every touched file.
**Smoke:** `src/lib/chatHelpers.test.ts`, 33/33 pass in `America/Denver`, `Asia/Tokyo` and `UTC`.
Pre-existing `src/utils/chatDays.test.ts` re-run: 22/22, unchanged.

All six items shipped. Nothing was skipped. Two server-side gaps the audit found
(club-announcements membership, `get_channel_member_labels` team-NULL widening)
remain untouched and out of scope — see **Not done, and why** at the end.

---

## New files

| File | Why |
| --- | --- |
| `src/components/chat/AddMembersModal.tsx` | The add-people picker for an existing chat, lifted out of `GroupInfoScreen` so Group Info and team-channel Info share one copy (item 3). |
| `src/lib/chatHelpers.test.ts` | The Phase C logic smoke (33 tests). |

---

## Item 1 — Players chip

**One file.** The chip now appears in *both* pickers with no screen edits, because
both were already driven by `presentRoleGroups()` + `CONTACT_ROLE_GROUP_LABELS`
(`GroupInfoScreen` via the shared modal, `ChatScreen` at `ChatScreen.tsx:1286`,
`:1400-1419`).

| Change | Where |
| --- | --- |
| `'player'` no longer falls through `default:` | [chatHelpers.ts:184-201](../../src/lib/chatHelpers.ts#L184-L201) `roleChipGroup()` — `case 'player': return 'players'` |
| `'players'` added to the group union | [chatHelpers.ts:159](../../src/lib/chatHelpers.ts#L159) `RoleChipGroup` |
| Chip order and label | [chatHelpers.ts:162-174](../../src/lib/chatHelpers.ts#L162-L174) — `ROLE_CHIP_GROUPS` ends with `'players'`, `ROLE_CHIP_GROUP_LABELS.players = 'Players'` |
| `contactRoles` re-exports, so every existing call site is untouched | [contactRoles.ts:47-50](../../src/lib/contactRoles.ts#L47-L50) — `ContactRoleGroup`, `CONTACT_ROLE_GROUPS`, `CONTACT_ROLE_GROUP_LABELS`, `contactRoleGroup` |

**Why the group vocabulary moved into `chatHelpers.ts`:** a chip group is a mapping off
the same role strings as the priority table and the label table. Keeping it in a third
file is how the app ended up with disagreeing role vocabularies in the first place.
`contactRoles.ts` now re-exports under the original four names, so nothing else changed.

**"Players with accounts only" needs no client filter.** Candidates come from
`search_chat_contacts`, whose player branch is
`JOIN user_roles ur ON ur.entity_id = p.id AND ur.role = 'player'` then
`JOIN profiles pr ON pr.id = tp.user_id` (web repo
`20261013013626_stone_b2_s1_chat_permissions_leave.sql:479-487`). A roster player with no
login has no `profiles` row and is not a candidate. Documented at
[contactRoles.ts:23-29](../../src/lib/contactRoles.ts#L23-L29).

**Cost: zero extra queries.** `fetchContactRoles` already read `user_roles`, which already
carried `'player'`. The tag was being fetched and thrown away.

---

## Item 2 — Date separators in DMs

`src/utils/chatDays.ts` is **byte-identical** (`git diff --stat` on it is empty). DMs were
the one room that never called it.

| Change | Where |
| --- | --- |
| Import the shared helper | [DMChatScreen.tsx:28](../../src/screens/DMChatScreen.tsx#L28) |
| Divider indices, memoised per message change | [DMChatScreen.tsx:393-396](../../src/screens/DMChatScreen.tsx#L393-L396) `invertedDayDividerIndices(invertedMessages.map(m => m.created_at))` |
| The divider row | [DMChatScreen.tsx:407-426](../../src/screens/DMChatScreen.tsx#L407-L426) `renderDaySeparator` |
| `renderItem` takes `index`, asks the set | [DMChatScreen.tsx:421-423](../../src/screens/DMChatScreen.tsx#L421-L423) |
| Separator rendered AFTER the bubble in JSX | [DMChatScreen.tsx:476](../../src/screens/DMChatScreen.tsx#L476) |
| Three styles, copied from `TeamChatRoomScreen:977-993` | [DMChatScreen.tsx](../../src/screens/DMChatScreen.tsx) `daySeparator`, `daySeparatorText`, `daySeparatorLine` |

**The one trap, carried over verbatim from the team room:** the separator must render
*after* the message in JSX. The list is `inverted`, and an inverted cell draws its children
bottom-up, so a separator placed first appears *below* the message it labels. This is
commented at the call site.

DMChatScreen already had `invertedMessages` (`:159`) and an inverted `FlatList` (`:558`),
so the shapes matched with no list changes.

---

## Item 3 — Manage members on custom team channels

### The shared component
`GroupInfoScreen`'s picker was lifted out **unchanged** into
`src/components/chat/AddMembersModal.tsx` (343 lines): the 300 ms debounce, the
latest-wins `searchSeqRef` guard, the top-anchored keyboard-safe sheet, the backdrop
`Pressable`, the role chips and the `comm_channel_members` insert — all Stone F code
(`03b44ab`), moved not rewritten, with its comments. `GroupInfoScreen` went 906 → 517 lines
and now renders [`<AddMembersModal>`](../../src/screens/GroupInfoScreen.tsx#L356-L365);
its 20 now-dead styles and 6 now-unused imports were removed.

The component holds **no permission logic** — the caller decides whether to render it, the
DB decides whether the insert lands ([AddMembersModal.tsx:11-18](../../src/components/chat/AddMembersModal.tsx#L11-L18)).

### The two gates in team-channel Info
Both read state `ChatInfoScreen` **already loaded**. No new permission logic, no new query.

| Gate | Where | Rule |
| --- | --- | --- |
| `isCustomTeamChannel` | [ChatInfoScreen.tsx:371-389](../../src/screens/ChatInfoScreen.tsx#L371-L389) | not a DM, not `is_default`, `channel_type` in `('team','club')` |
| `canAddMembers` | [ChatInfoScreen.tsx:397-398](../../src/screens/ChatInfoScreen.tsx#L397-L398) | `isCustomTeamChannel && (isStaffInTeam \|\| myMembershipRole === 'admin')` |
| `canRemoveMembers` | [ChatInfoScreen.tsx:406](../../src/screens/ChatInfoScreen.tsx#L406) | `isCustomTeamChannel && myMembershipRole === 'admin'` |

**Why Add and Remove differ** — they mirror two different live policies:
* INSERT admits `is_channel_admin(auth.uid(), channel_id)` **OR** a `team_staff` row for
  the channel's team (`20261013013626_*.sql:151-168`). Hence staff *or* admin.
* DELETE's other-person arm is `user_id <> auth.uid() AND is_channel_admin(...)`
  (same migration `:191-200`). Team staff are **not** admitted. Showing Remove to a coach
  would offer a button the DB silently refuses, so Remove is admin-only.

`isStaffInTeam` is the `count`-only existence check this screen already ran for its Staff
Controls (`:124-142`) — chosen originally because a user can hold several `team_staff` rows
on one team and `maybeSingle()` errors on 2+.

### What was excluded, and why
* **Default team chat and club-announcements** (`is_default`): membership is maintained
  server-side. `ensure_team_channel_membership` re-adds members on the next chat load, and
  the S4 club sync owns the club channel — a client add or remove would be undone or would
  fight the trigger.
* **DMs**: a two-person channel has no roster to manage.
* **Group chats**: they have their own screen, `GroupInfoScreen`.

### Other changes
* `removeMember` ([ChatInfoScreen.tsx:408-442](../../src/screens/ChatInfoScreen.tsx#L408-L442))
  — confirm dialog, then `.delete().select('user_id')`. **The `.select()` is the refusal
  check**: RLS filters a denied delete out silently (no error, no rows), so an empty result
  is a refusal, not a success. Same pattern as `GroupInfoScreen`. Failures go to `logError`.
* Remove never renders on your own row (`item.user_id !== user?.id`) — the DELETE policy is
  explicitly `user_id <> auth.uid()`, and leaving is the Leave button's job.
* `+ Add` shares the members header with the sort toggle via a new `membersActions` row;
  `addButton` / `removeButton` / `removeButtonText` copy `GroupInfoScreen`'s values exactly.

---

## Item 4 — One role-label function

### The function
[chatHelpers.ts:89-148](../../src/lib/chatHelpers.ts#L89-L148):
* `pickHighestRole(roles)` — the winner by `getRolePriority`, **order-independent**: ties
  break on the role string, so the same set always gives the same answer however the rows
  arrived.
* `buildRoleMap(...rowSets)` — `user_id -> winning role` across any number of row sets, in
  any order, with duplicates. Accepts both column spellings (`role` and `staff_role`).
* `resolveRoleLabel(roles)` — `formatHighest` → `formatRoleLabel`.

**`formatRoleLabel` and `getRolePriority` are untouched.** Their Feb 2026 wording is
preserved and still the only source of displayed role strings; the smoke test pins it
(`'player'` → `'Athlete'`, etc.).

### Five call sites replaced — not four
The audit named four. A fifth surfaced only when the grep proof was run: it was an
**accumulator, not a Map**, which is why the first sweep missed it.

| # | Site | Was | Now |
| --- | --- | --- | --- |
| 1 | [ChatInfoScreen.tsx:252-266](../../src/screens/ChatInfoScreen.tsx#L252-L266) | `new Map(rows.map(r => [r.user_id, r.staff_role]))` — **last duplicate key wins**, over a read with no `ORDER BY` | `buildRoleMap(staffData)` |
| 2 | [ChatInfoScreen.tsx:278-287](../../src/screens/ChatInfoScreen.tsx#L278-L287) | three hard-coded label strings (`'Asst. Coach'`) | `formatRoleLabel(staffRole)` |
| 3 | [ChatScreen.tsx:569-575](../../src/screens/ChatScreen.tsx#L569-L575) | inlined two-table priority merge (~28 lines) | `await fetchContactRoles(userIds)` |
| 4 | [DirectMessagesScreen.tsx:147-150](../../src/screens/DirectMessagesScreen.tsx#L147-L150) | inlined two-table priority merge (~21 lines) | `await fetchContactRoles(otherUserIds)` |
| 5 | [DMChatScreen.tsx:219-228](../../src/screens/DMChatScreen.tsx#L219-L228) | `let bestRole = ''` accumulator over two reads | `pickHighestRole([...roles, ...staffRoles])` |
| — | [contactRoles.ts:86](../../src/lib/contactRoles.ts#L86) | the only previously-correct copy, `keepHighest` | `buildRoleMap(rolesRes.data, staffRes.data)` |
| — | [StaffMessageScreen.tsx](../../src/screens/StaffMessageScreen.tsx) | local `getRoleLabel` switch (a 6th vocabulary: `'Manager'`, `'Asst. Coach'`) | deleted; `formatRoleLabel` |

**Proof:** `getRolePriority(` now has **zero** callers outside `chatHelpers.ts`.

### Two sources deliberately NOT changed — judgment call, flag for Lu
Both were listed in the audit's "four sources" table. Neither is a role-label computation,
and folding them in would have changed user-visible text outside chat:

* **`src/components/RoleSwitcher.tsx:15-27` `ROLE_LABELS`** — the *own-role* switcher. Its
  wording **disagrees** with `formatRoleLabel` on four roles: `player` → `'Player'` vs
  `'Athlete'`, `platform_admin` → `'Platform Admin'` vs `'Admin'`, `content_creator` →
  `'Content Creator'` vs `'Creator'`, `sales_director` → `'Sales Director'` vs `'Sales'`,
  and it carries `club_director` which `formatRoleLabel` lacks. Unifying would rename the
  switcher's entries app-wide — outside chat, outside the item, and a visible regression.
  **Needs a wording decision before it can be unified.**
* **`GroupInfoScreen.tsx:70-83` `memberSubtitle()`** — reads the server's
  `get_channel_members.label_kind` (`'staff'` / `'player'` / `'parent'`), not a role string.
  A different source of truth, deliberately coarse. Nothing to tie-break.

---

## Item 5 — FND-A

[StaffMessageScreen.tsx:208-262](../../src/screens/StaffMessageScreen.tsx#L208-L262),
following `ChatScreen.createGroup` (`ChatScreen.tsx:818-841`) point for point.

| Before | After |
| --- | --- |
| `memberIds.push(user.id)` — creator in the batch | `buildMemberInserts(channel.id, recipientIds, user.id)` drops the creator |
| `await supabase...insert(memberInserts)` — result discarded | `const { error: memberError } = await ...` |
| no rollback | `.delete().eq('id', channel.id).select('id')` on failure |
| no user-visible error | `Alert.alert('Error', 'Could not start the conversation')` |
| navigated regardless | `navigation.replace(...)` **only** on success |
| `catch` logged and fell through silently | `catch` logs via `__DEV__` and alerts |

**Why it was broken:** `trigger_add_creator_to_members` inserts the creator as `'admin'` on
the `comm_channels` INSERT for `channel_type IN ('group','group_dm','direct','dm')` (web repo
`20260112025123_*.sql:56-74`), and `comm_channel_members` carries
`UNIQUE (channel_id, user_id)` (`20260108184412_*.sql:77`). A multi-row INSERT is **one
statement**, so including the creator failed the whole batch and the room opened with
nobody in it. `buildMemberInserts` also collapses duplicate ids, which would violate the
same constraint.

The filter lives in [chatHelpers.ts:227-252](../../src/lib/chatHelpers.ts#L227-L252) so it
is unit-testable; 5 of the 33 smoke tests cover it.

---

## Item 6 — Staff Message uncheck

| Change | Where |
| --- | --- |
| `excludedIds: Set<string>` — holds the **exceptions**, not the selection, so switching groups cannot leave a stale set behind | [StaffMessageScreen.tsx:79-82](../../src/screens/StaffMessageScreen.tsx#L79-L82) |
| `recipientIds` / `recipientCount` | [StaffMessageScreen.tsx:165-168](../../src/screens/StaffMessageScreen.tsx#L165-L168) via `checkedRecipientIds` |
| `selectFilter()` — picking a group starts it fully checked | [StaffMessageScreen.tsx:170-174](../../src/screens/StaffMessageScreen.tsx#L170-L174) |
| `toggleRecipient()` | [StaffMessageScreen.tsx:176-184](../../src/screens/StaffMessageScreen.tsx#L176-L184) |
| `"N recipients"` header + a `Select all` reset that appears only when something is unchecked | [StaffMessageScreen.tsx:336-348](../../src/screens/StaffMessageScreen.tsx#L336-L348) |
| Whole row is the checkbox; 22×22 box, `accessibilityRole="checkbox"` with `state.checked`; unchecked names go grey + struck through | [StaffMessageScreen.tsx:349-389](../../src/screens/StaffMessageScreen.tsx#L349-L389) |
| Send disabled and labelled from `recipientCount` | [StaffMessageScreen.tsx:398-417](../../src/screens/StaffMessageScreen.tsx#L398-L417) |

**`slice(0, 10)` + `"+N more"` is gone.** It could not become a checklist: the people it
hid were unreachable. The full group now renders.

### Two bugs fixed in passing on this screen
* **Arbitrary role, and people dropped from filters they belonged in.** The old dedupe was
  `new Map(staffList.map(s => [s.user_id, s]))` — last row wins. A club staffer who is
  `head_coach` on one team and `team_manager` on another got an arbitrary label *and* was
  missing from one of the two filters. Now one entry per person accumulating **every** role
  ([`:129-153`](../../src/screens/StaffMessageScreen.tsx#L129-L153)), label via
  `pickHighestRole`, and filters test the whole set.
* **Count/list disagreement.** `filteredStaff` and `getFilterCount` were two copies of the
  predicate with different semantics, so a chip count could differ from its list. Now one
  `matchesFilter()` at [`:53-68`](../../src/screens/StaffMessageScreen.tsx#L53-L68), used
  by both.

---

## Pre-existing errors fixed in touched files

DONE required zero tsc errors in touched files. Four of the baseline 70 were in them.
Net: **70 → 64**.

| Error | File | Fix | Severity |
| --- | --- | --- | --- |
| `Cannot find name 'setCelebration'` | `DMChatScreen.tsx` | `CelebrationOverlay` and `getCelebrationType` were imported and **called**, but the state and the overlay were never added. Added both, matching `TeamChatRoomScreen:130-133` + `:840-844`. | **Real crash** — sending `/celebrate` or "happy birthday" in a DM called an undefined identifier → `ReferenceError`. |
| `Property 'headerTitle' does not exist` | `DMChatScreen.tsx` | Used in the `!channelId` branch, never defined. Added, matching `TeamChatRoomScreen`. | Cosmetic (unstyled title on an error screen). |
| `Property 'replace' does not exist` | `StaffMessageScreen.tsx` | `useNavigation<any>()`. | Type-only. |
| `Argument of type '[never, never]'` ×3 | `ChatInfoScreen.tsx` | `useNavigation<any>()`, and the now-unnecessary `as never` casts dropped from 5 navigate calls. | Type-only. |

---

## Device click-through checklist

### Item 1 — Players chip
1. Sign in as a coach on a team that has at least one player **with an account**.
2. Chat → `+` → *New Group* → type 2+ letters of that player's name.
   → **Expect:** chips read `All · Coaches · Managers · Parents · Players` (only groups
   present in the results show). Tap `Players` → list narrows to player accounts only.
3. Open a **group chat** you admin → Group Info → `+ Add` → search the same name.
   → **Expect:** the same `Players` chip, same filtering. Tap a player → added to the group.
4. Search a name with no role in `user_roles`.
   → **Expect:** no chip for them; they appear under `All` only, never mis-filed.

### Item 2 — DM date separators
5. Open a DM with messages from **today and an earlier day**.
   → **Expect:** `Today` above the first of today's run; a dated label (`Tue, Oct 13`) above
   the first of the earlier day. Labels sit **above** their group, not below.
6. Send a new message in that DM.
   → **Expect:** it joins under `Today`; **no second `Today`** appears.
7. **Timezone case** — set the device to Denver, open a DM containing a message sent
   after ~17:00 local.
   → **Expect:** that message stays under the local day, not tomorrow's.
8. Scroll into history past a day boundary.
   → **Expect:** one divider per day, each above its oldest message.

### Item 3 — Manage members on custom team channels
9. As **team staff** (coach/manager), open a **custom** team channel (not "Team Chat") →
   kebab → Chat Info.
   → **Expect:** `+ Add` beside the sort toggle. **No** `Remove` on any row.
10. Tap `+ Add`, search, tap a person.
    → **Expect:** sheet closes, roster refreshes with them on it.
11. As the **channel admin** of that same channel, open Chat Info.
    → **Expect:** `+ Add` **and** `Remove` on every row except your own. Tap `Remove` →
    confirm → the row disappears.
12. Open the **default "Team Chat"** → Chat Info.
    → **Expect:** **no** `+ Add`, **no** `Remove` (server-managed membership).
13. Open **club-announcements** → Chat Info.
    → **Expect:** member **count only**, no roster, no `+ Add`, no `Remove`.
14. Open a **DM** → Chat Info.
    → **Expect:** no `+ Add`, no `Remove`.
15. As a **parent** in a custom team channel → Chat Info.
    → **Expect:** no `+ Add`, no `Remove`.
16. Open a **group chat** → Group Info.
    → **Expect:** unchanged from before this build — `+ Add` and `Remove` for the admin,
    same sheet, same chips, same keyboard behaviour.

### Item 4 — Role label
17. **The audit's case.** Find the test account with two `team_staff` rows on one team
    (Cole Coachman: `head_coach` + `team_manager`). Open the team chat → Chat Info.
    → **Expect:** `Head Coach`. Kill and relaunch the app, reopen twice more.
    → **Expect:** `Head Coach` every time — never `Team Manager`.
18. Same person in the DM list, the DM header, and the add-people picker.
    → **Expect:** `Head Coach` in all four places.
19. A member who is both a parent and an assistant coach.
    → **Expect:** `Assistant Coach` (not `Parent`) everywhere.
20. Note the wording change: team-channel Info now says `Assistant Coach`, previously
    `Asst. Coach`.
21. Open the role switcher.
    → **Expect:** **unchanged** (`Player`, `Platform Admin`, …) — deliberately not unified.

### Item 5 — FND-A
22. As a **club admin**: Chat → `+` → *Staff Message* → pick `All Staff` → Start.
    → **Expect:** the room opens **with the staff in it**. Open its info → the member list
    holds every recipient plus you. (Before this build: only you.)
23. Repeat with `Head Coaches Only`.
    → **Expect:** only head coaches, plus you as admin.
24. **Failure path** — turn airplane mode on between picking and tapping Start.
    → **Expect:** `Could not start the conversation`, and you **stay** on the Staff Message
    screen. Then: Chat list shows **no** empty orphan channel.

### Item 6 — Staff Message uncheck
25. Staff Message → `All Staff`.
    → **Expect:** every row checked, header `N recipients`, button `Start Conversation (N)`.
    The whole group is listed — no `+N more`.
26. Uncheck two people.
    → **Expect:** header and button both drop to `N-2`; unchecked names grey + struck
    through; a `Select all` link appears.
27. Tap `Select all`.
    → **Expect:** everyone re-checked, count back to `N`, link disappears.
28. Uncheck **everyone**.
    → **Expect:** `0 recipients`, `Start Conversation (0)` **disabled** and un-tappable.
29. Uncheck one, then switch group to `All Coaches`.
    → **Expect:** the new group starts **fully checked** — no carry-over.
30. Uncheck two, Start.
    → **Expect:** the room contains only the checked people plus you; the two unchecked are
    **absent** from its member list.
31. A staffer who is `head_coach` on one team and `team_manager` on another.
    → **Expect:** appears under `All Coaches` **and** `Team Managers Only`; labelled
    `Head Coach` in both.

### Regression — the two pre-existing bugs fixed in passing
32. In a **DM**, send `/celebrate`, then `happy birthday`.
    → **Expect:** the celebration overlay plays and clears. (Before: a crash.)
33. Open the team room and a group chat; send, react, reply, scroll.
    → **Expect:** no change — items 2 and 4 touched these files.

---

## Not done, and why

Nothing in the six items was skipped. Two things the audit flagged are **server-side** and
`FORBIDDEN` here (schema / migrations / RLS / SQL):

1. **A removed family stays in club-announcements.** `remove_player_from_team`'s W4 scopes
   to `cc.team_id = v_team_id` (`20260917120000_remove_player_from_team.sql:229-232`), and
   club channels have `team_id` NULL. The default club chat also cannot be left
   (`is_channel_leavable` requires `is_default IS NOT TRUE`), and the DELETE policy's
   other-person arm needs a **channel admin** — which no client UI can confer. **No
   client-only fix exists**: widening W4 is a function change. Item 3 deliberately excludes
   club-announcements for exactly this reason.
2. **`get_channel_member_labels` widens every branch when `comm_channels.team_id IS NULL`**
   (`20260902090000_*.sql:108-111`), so in a group or club chat a person reads `'staff'` if
   they are `team_staff` on **any** team, and the player branch has no team scope at all.
   This is why `GroupInfoScreen.memberSubtitle` stays coarse. Server fix only.

One client-side item needs a **decision**, not code (see item 4 above):
3. **`RoleSwitcher.ROLE_LABELS` vs `formatRoleLabel`** disagree on `player`,
   `platform_admin`, `content_creator`, `sales_director`. Unifying renames switcher entries
   app-wide. Not done unilaterally.

---

## git status --short

```
 M src/lib/chatHelpers.ts
 M src/lib/contactRoles.ts
 M src/screens/ChatInfoScreen.tsx
 M src/screens/ChatScreen.tsx
 M src/screens/DMChatScreen.tsx
 M src/screens/DirectMessagesScreen.tsx
 M src/screens/GroupInfoScreen.tsx
 M src/screens/StaffMessageScreen.tsx
?? docs/recon/phaseC-audit.md
?? docs/recon/phaseC-mobile-build.md
?? src/components/chat/AddMembersModal.tsx
?? src/lib/chatHelpers.test.ts
```

Forbidden paths confirmed untouched: `src/lib/realtimeHub.ts`, `src/utils/chatDays.ts`
(`git diff --stat` empty), `supabase/migrations/`, `package.json`, `.env*`.

## How to re-run the smoke

```
npx tsc src/lib/chatHelpers.ts src/lib/chatHelpers.test.ts src/utils/chatDays.ts \
  --outDir /tmp/phasec --module commonjs --target es2020 --skipLibCheck \
  --strict --esModuleInterop
TZ=America/Denver node --test /tmp/phasec/lib/chatHelpers.test.js
```
Point `node --test` at the **file**, not the directory — a directory run also picks up the
compiled non-test modules and reports a spurious failure.
