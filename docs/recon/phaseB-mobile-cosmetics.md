# Phase B — mobile cosmetics batch: recon

Date: 2026-10-13. Repo: thryvyng-mobile @ de017b2 (clean).
Server facts below were read, READ-ONLY, from the web repo
(`~/Documents/thrive-and-score/supabase/migrations/`), which is where chat
migrations live. Nothing in that repo was modified.

---

## Item 1 — FND-1: member lists render "Unknown · Parent"

### Files on the data path

| File | Role |
| --- | --- |
| `src/screens/ChatInfoScreen.tsx` | the screen with the bug. `fetchMembers()` at lines 183-273 builds the list; `renderMember` at 364-376 renders `full_name` + `role_label` |
| `src/lib/memberNames.ts` | `fetchTeamMemberNames` / `fetchChannelTeamMemberNames` / `UNRESOLVED_NAME = 'Unknown'` |
| `src/hooks/useChannelMembers.ts` | second consumer of the same team-scoped resolver (read-receipt names) |
| `src/hooks/usePolls.ts` (lines 45-47) | third consumer (poll voter names) |
| `src/screens/GroupInfoScreen.tsx` | the OTHER member list. Uses `get_channel_members` + `get_channel_member_labels`, so its roles are already correct; its names come from raw `profiles.full_name` (no ladder) |

### Root cause — TWO independent client-side faults, both proven in code

**Fault A — the name.** `ChatInfoScreen.tsx:200-205` resolves names through the
TEAM-scoped RPC:

```
const profileMap = teamId
  ? await fetchTeamMemberNames(teamId)
  : await fetchChannelTeamMemberNames(channelId);
```

`fetchChannelTeamMemberNames` → `fetchChannelTeamId` reads
`comm_channels.team_id` (`src/lib/memberNames.ts:88-106`). A club channel
(`channel_type='club'`) has `team_id = NULL`, so `fetchTeamMemberNames(null)`
returns an EMPTY map without ever calling the RPC
(`src/lib/memberNames.ts:36-38`). Every row then falls to
`resolved?.name || UNRESOLVED_NAME` → **"Unknown"** (`ChatInfoScreen.tsx:265`).

The team RPC cannot serve this list even when a team id IS present:
`get_team_member_names` RAISES `P0001 / 'not_a_team_member'` for a caller
outside that team (web repo `20261006000000_get_team_member_names.sql:32-39`),
its member set is only that one team, and its name ladder ends at
`"<Child>'s parent"` with **no final rung** — a profile with no name and no
matching player returns NULL, which `memberNames.ts:56-57` then drops from the
map. Dropped = "Unknown".

HYPOTHESIS IN THE BRIEF: CONFIRMED in substance, with one correction. The
client is NOT reading `profiles` directly any more (that was fixed earlier —
see the comment at `ChatInfoScreen.tsx:198-201`). It is reading the WRONG
SECURITY DEFINER RPC: team-gated instead of channel-gated.

`get_chat_profiles(p_user_ids uuid[]) RETURNS TABLE(user_id uuid,
display_name text, avatar_url text)` is the S1-fixed function
(web repo `20261013013626_stone_b2_s1_chat_permissions_leave.sql:410-434`).
It is gated on *sharing any channel with the viewer*, not on team:

```
AND (pr.id = auth.uid() OR EXISTS (
  SELECT 1 FROM comm_channel_members a
  JOIN comm_channel_members b ON a.channel_id = b.channel_id
  WHERE a.user_id = auth.uid() AND b.user_id = pr.id))
```

and its name comes from `public.chat_display_name(auth.uid(), pr.id)`
(same file, lines 109-134) — the S1 ladder:
`full_name` → `first_name last_name` → `"<Child>'s parent"` →
`'Thryvyng member'`. **No email rung.** It does not raise for a non-team
caller, and it works for club channels and DMs.

Also checked and rejected: `get_channel_members(uuid)` (web repo
`20260902090000_capture_drift_chat_registration_objects.sql:306-325`) returns
raw `pr.full_name`, which S1 deliberately did NOT re-point at the ladder, so a
nameless profile comes back NULL. That is why GroupInfoScreen can still show a
blank name.

**Fault B — the "· Parent" label.** `ChatInfoScreen.tsx:206-238` derives the
role from two direct table reads, both of which RLS denies to a non-staff
viewer, and both of which are skipped entirely when `teamId` is falsy:

* `team_staff` — SELECT is `user_id = auth.uid()` OR `is_team_staff(auth.uid(), team_id)`
  (web repo `20251207133631_...sql:163-167`). A parent viewer is not team
  staff, so the read returns **zero rows** and `staffMap` is empty.
* `players` — team-scoped RLS, likewise empty for a parent viewing others.

With both maps empty, the `if/else` at `ChatInfoScreen.tsx:243-262` falls
through every branch to its final `else`, which hard-codes
`role = 'parent'; role_label = 'Parent'`. **Everyone becomes a Parent.**
That `else` is the literal default the brief asked about.

Server-side answer that already exists and is already used elsewhere in this
app: `get_channel_member_labels(p_channel_id) RETURNS TABLE(user_id uuid,
label_kind text, child_names text)` — SECURITY DEFINER, gated on channel
membership, returns `'staff' | 'player' | 'parent' | NULL` plus the child
names (web repo `20260902090000_...sql:90-127`). `useChatSenderLabels.ts:96-98`
already calls it for chat bubbles, which is why bubbles are named correctly
while this list is not.

### One-line root cause
`src/screens/ChatInfoScreen.tsx:200` resolves names via the team-gated
`get_team_member_names` (empty/raising for club channels) instead of the
channel-gated `get_chat_profiles`, and `ChatInfoScreen.tsx:243-262` falls to a
hard-coded `'Parent'` default because its `team_staff` / `players` reads are
denied by RLS.

### Fix shape
Channel-scoped resolver in `src/lib/memberNames.ts`:
`fetchChatProfileNames(userIds)` → `get_chat_profiles`, plus
`fetchChannelMemberLabels(channelId)` → `get_channel_member_labels`.
`ChatInfoScreen` uses both. Granular staff titles (Head Coach / Asst. Coach /
Team Manager) are kept when the `team_staff` read DOES succeed (staff viewer)
and degrade to `label_kind` otherwise — never to a blanket "Parent".

---

## Item 2 — poll staff arm: SERVER ALLOWS CREATOR ONLY → item SKIPPED

Mobile close path is a direct table write, not an RPC:
`src/hooks/usePolls.ts:149-161` → `supabase.from('comm_polls').update({ is_active: false }).eq('id', poll.id)`,
client-gated by `poll.created_by !== user.id`. There is **no** `close_poll` RPC
anywhere in either repo.

So the server rule is the RLS UPDATE policy on `comm_polls`:

```
CREATE POLICY "comm_polls_update" ON comm_polls FOR UPDATE
USING (created_by = auth.uid());
```

* Policy name: **`comm_polls_update`**
* File: web repo `supabase/migrations/20260108184412_5d500626-5299-40c5-8a5d-45ce30d98b72.sql:444-445`
* No later migration alters it. The only other migration touching `comm_polls`
  (`20260110073037_...`) just adds the `team_id` column. The chat drift-capture
  migration (`20260902090000_...`) does not re-capture any `comm_polls` policy.
* Web does exactly the same creator-only check (`thrive-and-score/src/hooks/usePolls.ts:123-124`).

A staff member's UPDATE is filtered out by RLS: PostgREST returns no error and
no rows, so wiring the UI would produce a button that silently does nothing.
Enabling a staff arm needs a new policy arm or a SECURITY DEFINER
`close_poll`, both FORBIDDEN here. **Item 2 skipped, no files touched.**

---

## Item 3 — role filter chips in the add-people picker

Two picker surfaces, both fed by the same RPC, so the role tagging goes in one
shared helper:

| File | Picker |
| --- | --- |
| `src/screens/GroupInfoScreen.tsx:141-172` (`searchUsersToAdd`), modal at 440-560 | "Add Members" — add people to an existing group |
| `src/screens/ChatScreen.tsx:614-641` (`searchUsersForGroup`), UI at 1316-1365 | "Add People" — new-group creation step |
| `src/lib/chatHelpers.ts` | `formatRoleLabel`, `getRolePriority` already live here |

### What role fields the picker receives today: NONE.

`search_chat_contacts(p_query text)` returns only
`(user_id uuid, display_name text, avatar_url text)` — web repo
`20261013013626_...sql:439-444`. No role column. Both group pickers map it
straight to `{ id, full_name, avatar_url }` and keep nothing else.

The DM picker in the same file (`ChatScreen.tsx:548-576`) already enriches the
same RPC output with a structural role, by reading `user_roles.role` and
`team_staff.staff_role` for the returned ids and keeping the highest
`getRolePriority`. That is the pattern to reuse, so the chips are tagged at
fetch time from role COLUMNS — never by substring-matching a display name.

Readability of those two tables, checked:

* `user_roles` — `CREATE POLICY "Users can view all roles" ... USING (true)`
  (web repo `20251106185952_...sql:135-137`). Readable for every id, by any
  authenticated viewer. `app_role` carries `head_coach`, `assistant_coach`
  (`20251118020555_...sql:2-3`), `team_manager`, `parent`, `player`.
  **This is the reliable tag source.**
* `team_staff` — staff-only SELECT (see Fault B above). Adds granularity for a
  staff viewer, contributes nothing for a parent viewer. Kept as an optional
  enrichment, not depended on.

CONSEQUENCE, stated honestly: for a viewer whose `user_roles` rows name no
coach/manager, the Coaches / Managers chips simply will not appear — which is
exactly the "chips only for role groups present in the loaded list" rule, but
it means chip visibility varies by who is looking. No Players chip (deferred
by ruling).

---

## Item 4 — hide member list on club-announcements only

| File | Role |
| --- | --- |
| `src/screens/ChatInfoScreen.tsx` | owns the roster (`SectionList sections`, members header at 573-586) |
| `src/lib/channelLeave.ts` | mobile's existing row-based channel-rule module (`canLeaveChannel`), mirror of web `src/lib/channelPermissions.ts` |

Mobile has no `channelPermissions.ts`; `channelLeave.ts` is the existing home
for row-derived channel rules and already reads `channel_type` / `is_default`
off the `comm_channels` ROW (never a route param). The new
`isDefaultClubChannel` mirror goes there.

Rule being mirrored, verbatim from web `src/lib/channelPermissions.ts:86-91`:

```
return channel.channel_type === 'club' && channel.is_default === true;
```

Name is deliberately NOT tested. `coaches-lounge` is seeded private and
without `is_default`, so it keeps its roster, as does every team channel.

`ChatInfoScreen` already loads `channel_type` and `is_default` from the row
(`ChatInfoScreen.tsx:153-163`), so no new query is needed. Member COUNT is safe
to show: `comm_channel_members` SELECT allows a member to see co-member rows
(`"Channel members can view co-member rows"`, web repo
`20260902090000_...sql:25-28`), so `members.length` is the true count even
though the names were not resolvable.

---

## Lint status
`npm run lint` does not exist (`package.json` has no lint script). The repo
carries a legacy `.eslintrc.json` while `eslint@9.39.4` requires
`eslint.config.js`; `npx eslint src --ext .ts,.tsx` fails with
"ESLint couldn't find an eslint.config.(js|mjs|cjs) file". **Lint is unwired —
skipped, not fixed** (config migration is its own task).

## tsc baseline
`npx tsc --noEmit` → **70** errors at de017b2.

---

# BUILD OUTCOME (same session, 2026-10-13)

| Item | Status |
| --- | --- |
| 1 — FND-1 names + role label | DONE |
| 2 — poll staff arm | **SKIPPED** — server allows creator only (`comm_polls_update`). No file touched. |
| 3 — role filter chips | DONE (both add-people picker surfaces) |
| 4 — hide roster on club-announcements | DONE |

## Files changed
* `src/lib/memberNames.ts` — NEW `fetchChatProfileNames(userIds)` → `get_chat_profiles`;
  NEW `fetchChannelMemberLabels(channelId)` → `get_channel_member_labels`;
  NEW exported `MemberLabelKind` / `MemberLabel`. The team-scoped resolvers are
  untouched — several non-chat screens legitimately use them.
* `src/lib/channelLeave.ts` — NEW `isDefaultClubChannel(channel)`, the verbatim
  mirror of web `channelPermissions.ts:86-91`.
* `src/lib/contactRoles.ts` — NEW FILE. Structural role tagging for the pickers:
  `fetchContactRoles`, `contactRoleGroup`, `presentRoleGroups`,
  `CONTACT_ROLE_GROUPS`, `CONTACT_ROLE_GROUP_LABELS`.
* `src/screens/ChatInfoScreen.tsx` — items 1 + 4. `fetchMembers` now resolves
  names through `get_chat_profiles` and roles through
  `get_channel_member_labels`; the blanket `'Parent'` default is GONE (an
  unknown member is now "Member", labelled only when the server said
  something). Granular staff titles kept when the `team_staff` read succeeds.
  New `memberCount` state so the count survives a hidden roster. Club-default
  channel: no roster, no sort control, "N members" instead — and the screen
  stops before the name/label RPCs, which it has no use for.
* `src/hooks/useChannelMembers.ts` — item 1, second member list (read
  receipts): same swap to `fetchChatProfileNames`.
* `src/screens/GroupInfoScreen.tsx` — item 3 in the "Add Members" picker.
* `src/screens/ChatScreen.tsx` — item 3 in the new-group "Add People" picker.
  The results list gives back the ~38px the chip row takes, so the modal's
  tuned height budget (and the Create Group button) does not move. Also a
  latest-wins guard (`groupSearchSeqRef`) on the group search, mirroring the
  one GroupInfoScreen already had: this picker had none, and the role-tag
  fetch adds a second await to the window in which a slower earlier keystroke
  could overwrite a newer result.

## Proof
* `npx tsc --noEmit` — **70 before, 70 after**. Error sets compared
  line-number-insensitively: **zero new, zero fixed**. The 3 errors reported
  inside `ChatInfoScreen.tsx` are the pre-existing
  `navigation.navigate(... as never)` ones, shifted by line offset only.
* Lint — unwired, skipped. See "Lint status" above.
* Pure-logic smoke — the three decision functions compiled byte-identical from
  source (with only `./supabase` stubbed) and executed under node: **22/22
  assertions pass**. Covers `isDefaultClubChannel` (club+default hides;
  coaches-lounge, null `is_default`, default TEAM chat and group chats all
  keep their roster), `contactRoleGroup` (role columns map correctly, and
  `"Coach Carter"` / `"Zack's parent"` map to NO group — the substring trap),
  and `presentRoleGroups` (chip order, absent groups get no chip).
* Grep, member list data path:
  * `get_chat_profiles` is reached from `src/lib/memberNames.ts:138`, called by
    `ChatInfoScreen.tsx:241` and `useChannelMembers.ts:38`.
  * `get_channel_member_labels` is reached from `src/lib/memberNames.ts:188`,
    called by `ChatInfoScreen.tsx:242`.
  * `grep -n "fetchTeamMemberNames\|fetchChannelTeamMemberNames" src/screens/ChatInfoScreen.tsx`
    → no matches. The team-scoped path is gone from this screen.
* NOT verified: on-device rendering. No device/simulator run and no test runner
  exists in this repo (`package.json` has no test script; the lone
  `src/lib/eventChangeSummary.test.ts` is orphaned). Everything above is
  typecheck, pure-logic execution and static proof.

## FOUND — outside the items, not changed
1. **The same club-channel name defect has four more chat callers.** All still
   resolve names through the team-scoped RPC and so return an empty map inside
   a club channel: `src/hooks/usePolls.ts:47-48`, `src/hooks/useMessages.ts:95`,
   `src/hooks/useBoardVoteView.ts:74`, `src/screens/PollDetailScreen.tsx:160`,
   `src/screens/ChannelPollsScreen.tsx:149`. Item 1 said "Chat Info / member
   lists", so only the two member lists were changed. Each of the rest is a
   one-line swap to `fetchChatProfileNames`.
   (`useMessages` is the least affected — `useChatSenderLabels` already names
   senders through `get_channel_member_names`, so that one is a fallback.)
2. **Non-chat callers of `get_team_member_names` are correct as they are** and
   were deliberately left alone: `TeamStaffScreen`, `TeamDetailScreen`,
   `EventDetailScreen`, `StaffMessageScreen`. They are team screens with a real
   team id.
3. **`get_channel_members` (used by GroupInfoScreen) was NOT re-pointed at the
   S1 name ladder.** It returns raw `profiles.full_name`, so a profile with no
   `full_name` shows a blank name in a group chat's member list even after this
   work. Fixing it is a server change (FORBIDDEN here) — or GroupInfoScreen
   could overlay `fetchChatProfileNames` on top of it client-side.
4. **Chip visibility varies by viewer.** `team_staff` is staff-readable only, so
   a parent viewer's chips come from `user_roles` alone. A coach whose
   coach-ness lives only in `team_staff` and not in `user_roles` will not raise
   a Coaches chip for a parent viewer. Truthful (chips only claim what is
   tagged) but not uniform.
5. **ESLint is unwired repo-wide** — legacy `.eslintrc.json` against
   `eslint@9.39.4`, and no `lint` script. Lint has not run on any of this.

---

# B-EXTEND — FND-1 name sweep (2026-10-13, same working tree, de017b2)

Same fix as Phase B item 1, applied to the five callers logged in FOUND #1.
All five were resolving names through the TEAM-gated RPC, which has no team id
to gate with inside a club channel or a DM (`comm_channels.team_id` is NULL
there) and so returned an empty map. All five now call
`fetchChatProfileNames(userIds)` → `get_chat_profiles`, gated on sharing a
channel with the viewer and carrying the S1 ladder
(real name → `"<Child>'s parent"` → `'Thryvyng member'`, never an email).

Each site already had the ids it needs in hand, so none needed a new query and
`memberNames.ts` needed no extension.

| # | Site (line as swept) | What it names | Ids now passed | Status |
| --- | --- | --- | --- | --- |
| 1 | `src/hooks/usePolls.ts:47` | poll voters | `votes.map(v => v.user_id)` | FIXED |
| 2 | `src/hooks/useMessages.ts:95` | message **reactors** | `[...reactionUserIds]` | FIXED |
| 3 | `src/hooks/useBoardVoteView.ts:74` | board-vote participants | `membersData.map(m => m.user_id)` | FIXED |
| 4 | `src/screens/PollDetailScreen.tsx:160` | poll voters | `data.comm_poll_votes.map(v => v.user_id)` | FIXED |
| 5 | `src/screens/ChannelPollsScreen.tsx:149` | poll creators | `creatorIds` (already a de-duped Set spread) | FIXED |

Note on site 2: this call resolves REACTOR names, not sender names. Sender
names come from `get_channel_member_names` via `useChatSenderLabels`
(`TeamChatRoomScreen.tsx:644` prefers it), which was already correct.

`usePolls.ts` also loses its `team_id` branch: the poll's `team_id` was used to
pick the team-gated resolver, and the channel-gated one needs no team at all.

## Proof
* `npx tsc --noEmit` — **70**, unchanged from the de017b2 baseline. Error sets
  compared line-number-insensitively against the baseline: **0 new, 0 fixed**.
* Smoke — **42/42 assertions pass, 0 fail**, across two suites compiled from
  the working-tree sources (only `./supabase` stubbed):
  * Phase B suite, 22/22: `isDefaultClubChannel`, `contactRoleGroup`,
    `presentRoleGroups`.
  * B-EXTEND suite, 20/20: the real `fetchChatProfileNames` driven through
    **each swept site's actual id-extraction expression**. Asserts the RPC
    called is `get_chat_profiles` with a `p_user_ids` param; all three S1
    ladder rungs resolve; no resolved name contains `@`; per-site id shapes
    (vote rows de-duped, reactor Set spread, member rows, poll-row votes,
    creator Set spread); a poll with no votes fires NO call; a denied RPC
    degrades to an empty map without throwing; a row with a null name is
    dropped rather than stored.
* NOT verified: on-device rendering. No simulator run; the repo still has no
  test runner.

## Grep audit — name lookups in `src/` that bypass `memberNames.ts` / `get_chat_profiles` for CHAT display

Two real bypasses remain. Both are outside B-EXTEND's five sites, so both were
left alone:

1. **`src/screens/DirectMessagesScreen.tsx:132`** — reads `profiles` directly
   for the other DM participant (`select('id, full_name, avatar_url').in('id', otherUserIds)`)
   and renders `other?.full_name || 'Unknown'` (line 70), with an explicit
   `full_name: 'Unknown'` placeholder at line 194. This is the FND-1 pattern
   exactly: RLS hides those rows from a regular viewer. Fixable client-side —
   a DM participant shares a channel with the viewer, so `get_chat_profiles`
   resolves them.
2. **`src/screens/DMChatScreen.tsx:188`** — same direct `profiles` read for the
   DM counterpart; the name lands at line 216 and renders at line 432. Same
   cause, same client-side fix available.

Justified, left as they are:

* **`src/hooks/useMessages.ts:58` and `:159`** — the `profile:profiles(...)`
  embed on message rows. It is the LAST fallback for a sender name, not the
  primary: `TeamChatRoomScreen.tsx:644` reads
  `memberNames.get(...)?.name || ... || item.profile?.full_name`, and
  `memberNames` is `get_channel_member_names`. Blocked by RLS it yields null,
  so it can omit a name but never show a wrong one.
* **`src/components/chat/SurveyChatCard.tsx:60`** — `poster:profiles!posted_by(full_name)`
  for the "Shared by X" line. Degrades to plain `'Shared'` (line 170), so it
  silently drops the name rather than showing "Unknown" or an email. Benign,
  but it is a bypass.
* **`src/screens/GroupInfoScreen.tsx`** — `get_channel_members`, which returns
  raw `profiles.full_name`. Server-side fix, deferred to Phase D (FOUND #3).
* **`ChatScreen.tsx:363`** — `row.other_user_name` from `get_my_conversations`.
  S1 re-pointed that column at the shared ladder, so it is already correct.
* **The four team-scoped callers** — `TeamStaffScreen.tsx:93`,
  `TeamDetailScreen.tsx:131`, `EventDetailScreen.tsx:411`,
  `StaffMessageScreen.tsx:81`. Team rosters with a real team id, not chat
  display. `get_team_member_names` is the right function there and stays
  exported for them.
* Every other `from('profiles')` hit in `src/` is non-chat (own profile in
  `AuthContext` / `EditProfileScreen`, registration flows, evaluations,
  training studio, club dashboards, lineup notifications).

## Not touched, noted for Phase C
The realtime `comm_message_reactions` CHANNEL_ERROR in the Metro logs was not
investigated or changed, per instruction. Phase C recon.

---

# B-EXTEND-2 — DM name bypasses (2026-10-13, same working tree, de017b2)

The two bypasses logged in the B-EXTEND grep audit, both fixed.

| Site | Was | Now | Status |
| --- | --- | --- | --- |
| `src/screens/DirectMessagesScreen.tsx:132` | `from('profiles').select('id, full_name, avatar_url').in('id', otherUserIds)` | `fetchChatProfileNames(otherUserIds)` — one call for the whole DM list | FIXED |
| `src/screens/DMChatScreen.tsx:188` | `from('profiles')...eq('id', otherUserId).single()` | `fetchChatProfileNames([otherUserId])` | FIXED |

## Why `get_chat_profiles` reaches a DM counterpart
Its gate is `pr.id = auth.uid() OR EXISTS (… comm_channel_members a JOIN
comm_channel_members b ON a.channel_id = b.channel_id WHERE a.user_id =
auth.uid() AND b.user_id = pr.id)`. A DM satisfies it because
`get_or_create_dm_channel` inserts BOTH participants as members:

```
-- Both participants are members; creator may already exist via trigger.
INSERT INTO comm_channel_members (channel_id, user_id, role)
VALUES (v_channel_id, user1_id, 'member'), (v_channel_id, user2_id, 'member')
ON CONFLICT (channel_id, user_id) DO NOTHING;
```
(web repo `20261013013626_stone_b2_s1_chat_permissions_leave.sql:539-542`)

Verified before swapping — had DM member rows not existed, the swap would have
traded "Unknown" for "Thryvyng member" on every DM, which is worse.

## The ladder is rendered, not re-implemented
`get_chat_profiles` returns `chat_display_name(auth.uid(), pr.id)` already
assembled: `full_name` → `first_name last_name` → `"<Child>'s parent"` →
`'Thryvyng member'`, no email rung. The child rung is scoped to
`p.team_id IN (SELECT get_user_team_ids(p_viewer))` and matches that child's
parent address to the target's — so it fires only where viewer and target share
a team through that child, which is Lu's Oct 12 ruling expressed in SQL. Both
screens now render `display_name` verbatim. No rung is rebuilt client-side.

## NEW `CHAT_FALLBACK_NAME` in `memberNames.ts`
`export const CHAT_FALLBACK_NAME = 'Thryvyng member'` — the ladder's own
terminal rung, spelled as the server spells it. It is NOT a second ladder: it
covers only the case where the RPC returned no row for that id at all (call
failed, or no shared channel). `UNRESOLVED_NAME` ('Unknown') is left untouched
for its existing non-DM consumers.

## One precedence flip, in DMChatScreen only
`DMChatScreen` already preferred `memberNames` (from
`get_channel_member_names`) over the directly-read profile. That function's
ladder is NOT the S1 one — its child rungs are scoped to the CHANNEL's team
(`cc.team_id`), and a DM channel has no team, so in a DM it bottoms out on the
bare string `'Member'`:

```
(SELECT … FROM players p WHERE p.team_id = cc.team_id AND …),   -- can't fire in a DM
'Member'
```
(web repo `20261010204000_chat_reply_columns_and_name_resolver.sql:30-37`)

So the header now reads the `get_chat_profiles` result FIRST and keeps
`memberNames` as the second rung for the case where the ladder call itself
returned nothing. Without the flip, a parent with no `full_name` would have
rendered `'Member'` instead of `"Zack's parent"`. Sender names, typing names
and every other `memberNames` consumer in the file are untouched.

## 'Unknown' removed from these two files
Four person-name fallbacks replaced with `CHAT_FALLBACK_NAME`:
* `DirectMessagesScreen.tsx:70` — the row's rendered name.
* `DirectMessagesScreen.tsx:194` — the placeholder object for an unresolved id.
* `DMChatScreen.tsx:352` — reaction-picker `senderName`, which is **persisted
  into `reply_to_sender`**, so 'Unknown' was being written into the database.
* `DMChatScreen.tsx:382` — the read side of that same persisted column.

`grep "'Unknown'"` over both files now returns **comments only, zero code
literals**.

## Proof
* `npx tsc --noEmit` — **70**, unchanged from the de017b2 baseline; sets
  compared line-number-insensitively: **0 new, 0 fixed**.
* Smoke — **59/59 pass, 0 fail**, three suites from working-tree sources:
  Phase B 22/22, B-EXTEND 20/20, B-EXTEND-2 17/17. The new suite drives the
  real `fetchChatProfileNames` through each screen's own derivation verbatim:
  the DM list's two-column `otherUserIds` expression (one RPC call, all ids in
  one `p_user_ids`), real name / child rung / last rung all rendering, an id
  the RPC never returned rendering `'Thryvyng member'` and NOT `'Unknown'`, no
  rendered name containing `@`, role and avatar still enriched — and for
  DMChatScreen, that the ladder beats `'Member'` on both the child and the
  terminal rung, with a failed ladder call still degrading to the channel RPC.
* NOT verified: on-device rendering. No simulator run; no test runner in repo.

## Grep audit — 'Unknown' still used as a person-name fallback elsewhere in chat
None in the two files this phase owns. Outside them, and NOT touched (out of
scope), every one of these now sits behind a ladder RPC, so it fires only when
that RPC returned nothing at all — far rarer than before Phase B, but still
'Unknown' when it does:

| Site | What it names |
| --- | --- |
| `TeamChatRoomScreen.tsx:499`, `:519`, `:622` | reaction-picker / message-actions `senderName`, and the persisted `reply_to_sender` — the exact three patterns just fixed in DMChatScreen |
| `ChatScreen.tsx:363` | `row.other_user_name \|\| 'Unknown User'` on the conversations list (that column IS the S1 ladder, so this fires only on a null) |
| `ChannelPollsScreen.tsx:216` | `creator_name` — behind the ladder RPC swapped in B-EXTEND |
| `ReactionDetailsModal.tsx:89` | reactor name |
| `PollCard.tsx:94` | poll voter name |
| `ChatInfoScreen.tsx:292`, `PollDetailScreen.tsx:383`, `useBoardVoteView.ts:123`, `StaffMessageScreen.tsx:86` | via the `UNRESOLVED_NAME` constant rather than a literal |

RECOMMENDATION (suggestion, not done): Lu's Oct 12 ruling was stated for the DM
name ladder. Extending `CHAT_FALLBACK_NAME` to the team-chat surfaces above is
a one-constant swap per site, but it is a UX ruling on wording outside DMs and
was not assumed here. `TeamChatRoomScreen.tsx:499/:519` deserve priority: like
the DM ones they are persisted into `reply_to_sender`, so 'Unknown' is written
to the database and survives every later fix.

Non-chat 'Unknown' fallbacks (`TeamStaffScreen`, `EvaluationsScreen`,
`WorldCupPredictorScreen`, `TeamDetailScreen`, `MyCoursesScreen`,
`LineupEditorScreen`) are outside the chat surface and were not audited.

---

# B-EXTEND-3 — the name fallback, app-wide (2026-10-13, same working tree, de017b2)

Lu's ruling of 2026-10-13: `CHAT_FALLBACK_NAME` ('Thryvyng member') replaces
'Unknown' as the PERSON-NAME fallback on every chat, poll, reaction and
staff-message surface, not only DMs.

## `UNRESOLVED_NAME`: retargeted globally, in one place

All consumers, listed repo-wide before deciding. There were exactly four, and
every one is a person-name fallback on a surface the ruling covers:

| Consumer | Surface | Person name? |
| --- | --- | --- |
| `ChatInfoScreen.tsx:292` | chat member list | yes |
| `PollDetailScreen.tsx:383` | poll voter row | yes |
| `useBoardVoteView.ts:123` | board-vote participant | yes |
| `StaffMessageScreen.tsx:86` | staff-message recipient list | yes |

No consumer is non-chat and none is a non-person string, so the condition for a
single-point change was met. `memberNames.ts` now reads:

```ts
export const CHAT_FALLBACK_NAME = 'Thryvyng member';
/** @deprecated Use CHAT_FALLBACK_NAME. */
export const UNRESOLVED_NAME = CHAT_FALLBACK_NAME;
```

`UNRESOLVED_NAME` is kept as an alias rather than removed, deliberately: a
stale import anywhere then CANNOT silently reintroduce 'Unknown'. It is marked
`@deprecated` and all four consumers were repointed at `CHAT_FALLBACK_NAME`, so
**no live code references the alias** — it is a guard, not a path.

The docstring also records why the string is not 'Anonymous': that word is the
privacy guarantee on an anonymous poll. The two meanings must not share one
word, which was the original reason `UNRESOLVED_NAME` existed.

## Sites fixed

| Site | What it names | Note |
| --- | --- | --- |
| `TeamChatRoomScreen.tsx:499` | reply `senderName` from message actions | **PERSISTED into `reply_to_sender`** |
| `TeamChatRoomScreen.tsx:519` | reply `senderName` from the reaction picker | **PERSISTED into `reply_to_sender`** |
| `TeamChatRoomScreen.tsx:622` | read side of `reply_to_sender` | |
| `ChatScreen.tsx:363` | DM card name on the conversations list | was `'Unknown User'`; the column IS the S1 ladder, so it fires only on a null |
| `ChannelPollsScreen.tsx:216` | poll `creator_name` (local display field) | |
| `ReactionDetailsModal.tsx:89` | reactor name | |
| `PollCard.tsx:94` | poll voter name | |
| + the 4 `UNRESOLVED_NAME` consumers above | | via the one-place retarget |

## DB writes of a person name
The audit the brief asked for. Only ONE is on the ruled surface:

| Path | Column | On no-name, now |
| --- | --- | --- |
| `src/hooks/useMessages.ts:354` | `comm_messages.reply_to_sender` (insert) | `CHAT_FALLBACK_NAME` — both feeder screens now resolve to it |
| `src/hooks/useMessages.ts:412` | same value in the local echo object (not a write) | `CHAT_FALLBACK_NAME`, or `null` when there is no reply at all |

`useMessages.ts` itself was NOT edited — it is outside this phase's SCOPE. It
writes whatever `replyTo.senderName` the screen hands it, and both producers
(`TeamChatRoomScreen`, `DMChatScreen`) now end their chain on
`CHAT_FALLBACK_NAME`, so 'Unknown' can no longer reach the column from either.
See RECOMMEND below for hardening the boundary itself.

Off the ruled surface, left alone, listed for completeness:

| Path | Column | On no-name |
| --- | --- | --- |
| `CreateEvaluationScreen.tsx:232` | `player_evaluations.evaluator_name` (insert) | `user.email.split('@')[0]`, then `'Coach'` |
| `CreateEvaluationScreen.tsx:250` | `player_evaluations.signature_1_name` (insert) | `'Coach'` |
| `CartScreen.tsx:130` | `customer_name` sent to the `create-checkout-session` function | `''` |

Existing rows that already hold 'Unknown' were NOT updated — no SQL writes, per
FORBIDDEN. They read back exactly as stored; the smoke asserts that explicitly.

## 'Unknown' still in `src/`, and why each is left

Zero code literals remain anywhere on the chat / poll / reaction /
staff-message surface — `grep` over those files returns comments only.
Outside it:

| Site | Reason left |
| --- | --- |
| `MyCoursesScreen.tsx:73` | **not a person.** `title: 'Unknown'` is a COURSE title placeholder. Must not change. |
| `TeamStaffScreen.tsx:203` | person name, but a team-staff ROSTER screen, not the staff-MESSAGE surface. Closest borderline call — see NEEDS LU. |
| `TeamDetailScreen.tsx:260` | person name on the team detail roster. Non-chat. |
| `EvaluationsScreen.tsx:74` | `evaluator_name` display on the evaluations list. Non-chat. |
| `WorldCupPredictorScreen.tsx:177`, `:179` | person name on a game leaderboard. Non-chat. |
| `lineup/LineupEditorScreen.tsx:58` | player name in the lineup editor. Non-chat. |

## Proof
* `npx tsc --noEmit` — **70**, unchanged from the de017b2 baseline; sets
  compared line-number-insensitively: **0 new, 0 fixed**.
* Smoke — **77/77 pass, 0 fail**, four suites from working-tree sources.
  The new write-path suite (15) replicates both chat screens' resolution chain
  (gated RPC → `profiles` join → `profile` join → fallback) and both
  `useMessages` payload shapes, asserting: the column receives the resolved
  name when there is one; the ruled fallback when there is none at any rung;
  never the literal 'Unknown'; still `null` when there is no reply; and on the
  read side, that a LEGACY row holding 'Unknown' is displayed as stored rather
  than rewritten.
* **Three prior assertions were updated, not broken.** They encoded the
  pre-ruling vocabulary: one expected `UNRESOLVED_NAME` to equal 'Unknown'
  (`sites.ts`, board-vote fallback) and two asserted the two constants differ
  (`dm.ts`). Each was rewritten to assert the ruling, and where the intent was
  "must never say Unknown" the check now tests the **literal** rather than the
  constant — so it keeps proving the thing it was written to prove.
  Prior-suite totals after the update: 22 / 21 / 19, all passing.
* NOT verified: on-device rendering. No simulator run; no test runner in repo.

## RECOMMEND (suggestions, not done)
1. **Harden the write boundary in `useMessages.ts`** (outside this phase's
   scope): coerce a blank/absent `replyTo.senderName` to `CHAT_FALLBACK_NAME`
   inside the hook, so no future caller can persist 'Unknown' into
   `reply_to_sender` by forgetting the chain. Today the guarantee lives in two
   screens rather than at the boundary.
2. **`CreateEvaluationScreen.tsx:232` writes an email local-part as a person
   name** into `player_evaluations.evaluator_name`
   (`user?.email?.split('@')[0]`). The ruled ladder says never an email. It is
   off the ruled surface and was not touched, but it is the one place found that
   puts an address-derived name into the database.
3. **Decide on `TeamStaffScreen.tsx:203`** — a staff roster, worded like the
   staff-message surface the ruling names. One-line swap either way.

---

# B-EXTEND-4 (FINAL) — closing the three NEEDS LU items (2026-10-13, de017b2)

Decided by Lu's standing rulings: a name never comes from an email;
`CHAT_FALLBACK_NAME` ('Thryvyng member') is the one person-name fallback
app-wide.

## Item 1 — the `reply_to_sender` write boundary. FIXED

NEW in `memberNames.ts`:

```ts
export function chatPersonName(name: string | null | undefined): string
```

One place that enforces both rulings on anything about to be shown or STORED
as a person's name. It returns `CHAT_FALLBACK_NAME` for a blank, for the legacy
`'Unknown'` / `'Unknown User'` (case-insensitive, trimmed), and for anything
containing `@` — an address is not a name. A real name is returned trimmed and
otherwise untouched; `O'Neill` and `Jean-Luc Picard` are not collateral damage.

`useMessages.ts` now resolves the quoted name ONCE, at the write:

```ts
const replySenderName = options?.replyTo
  ? chatPersonName(options.replyTo.senderName)
  : null;
```

and both the insert payload (`:363`) and the optimistic local echo (`:423`) use
that same value, so the persisted row and the echo cannot show two different
names. `null` is preserved when there is no reply at all — an absent quote is
not a nameless one. **Callers were not changed**: the guarantee now lives at
the boundary, so a future screen that forgets the chain still cannot put
'Unknown' in the column.

## Item 2 — `evaluator_name`: the email rung is gone. FIXED

`CreateEvaluationScreen` now pulls `profile` off `useAuth()` (the `profiles`
row; `AuthContext` already selects `*`) and resolves ONE name for the whole
screen:

```ts
const evaluatorName =
  (profile?.full_name ?? '').trim() ||
  (user?.user_metadata?.full_name ?? '').trim() ||
  'Coach';
```

The `user?.email?.split('@')[0]` rung is **removed** — it was the one path
found persisting an address-derived name into the database
(`player_evaluations.evaluator_name`). `user_metadata.full_name` is kept as the
middle rung: it is a real name, not an address, so dropping it would have
regressed accounts whose `profiles` row has not loaded.

`'Coach'` stays as the terminal rung on this surface by deliberate choice — it
is a role word chosen for an evaluation document, not the chat fallback.

Three call sites now share that one ladder, where they previously had two:
* `:248` `evaluator_name` (insert)
* `:268` `signature_1_name` (insert) — previously skipped the metadata/profile
  order entirely and went straight to `'Coach'`
* `:586` the rendered "Signed by …" line

## Item 3 — the five remaining person-name sites. ALL FIXED

| Site | What it names |
| --- | --- |
| `TeamStaffScreen.tsx:203` | staff member name on the team staff roster |
| `TeamDetailScreen.tsx:260` | staff member name on team detail |
| `EvaluationsScreen.tsx:74` | `evaluator_name` on the evaluations list |
| `WorldCupPredictorScreen.tsx:176-181` | `displayName(profile)` — BOTH rungs |
| `lineup/LineupEditorScreen.tsx:57-63` | `getPlayerDisplayName(p)` |

Each was verified to be a person's name before swapping, per the brief.

## Proof
* `npx tsc --noEmit` — **70**, unchanged from the de017b2 baseline; sets
  compared line-number-insensitively: **0 new, 0 fixed**.
* Smoke — **102/102 pass, 0 fail**, five suites from working-tree sources
  (22 / 21 / 19 / 15 / 25). All 77 prior assertions still pass, unmodified.
  The new 25 cover the real `chatPersonName` (pass-through, trim, blank, null,
  both legacy placeholders, case-insensitivity, a bare address, an address
  inside a name-shaped string, and two legitimate punctuated names), the write
  boundary (null with no reply, a forgetful caller's 'Unknown' and '' both
  neutralised, insert payload and echo proven identical), and the evaluator
  ladder (profile wins, metadata second, **no email rung → 'Coach' not "ana"**,
  blank profile name does not beat metadata, and the two columns sharing one
  ladder).
* NOT verified: on-device rendering. No simulator run; no test runner in repo.

## Grep — what is left, and why

**Person-name 'Unknown' literals in `src/`: ZERO.** One `'Unknown'` literal
remains in all of `src/` and it is not a person:

| Site | Reason |
| --- | --- |
| `MyCoursesScreen.tsx:73` | `title: 'Unknown'` — a COURSE title placeholder. Excluded by the brief, correctly: changing it would label a course as a person. |

**Email-derived names in `src/`: one left, out of scope.**

| Site | Status |
| --- | --- |
| `registration/JoinTeamScreen.tsx:2077` | **LEFT.** `email.split('@')[0]` is the last rung of `fullName` in `runStaffJoinRpc`, passed as `p_full_name` into the `process_staff_join` RPC. It fires only when first+last AND full name are all blank. NOT fixed: (a) the file is outside this phase's SCOPE; (b) the replacement is a product decision, not a mechanical swap — 'Thryvyng member' is arguably wrong on a staff record someone is registering, and the better fix is to require a name in the form; (c) the destination is **unverified** — `process_staff_join` appears in NO migration in the web repo, so it is prod drift and its body could not be read to confirm which column receives `p_full_name`. |

Also noted, justified, not touched: `TeamDetailScreen.tsx:263` renders
`s.profiles?.email` in the staff row's meta line. That is an email shown AS an
email (staff contact detail), not an email used as a name, so the ruling does
not reach it.

## NEEDS LU (one item, carried forward)
`JoinTeamScreen.tsx:2077` — the last email-derived name in the app. Needs a
ruling on what a staff self-join stores when the registrant supplies no name at
all (require a name in the form vs. store a placeholder), and a recon pass on
`process_staff_join`, which is prod drift under no migration.
