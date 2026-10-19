# Phase D 4i — poll powers follow the CHAT's staff (mobile half)

**Date:** 2026-10-18 · **Repo:** `thryvyng-mobile` · **Base:** `main` @ `1f74a50`
**Server + web shipped first** (web `5ca2fec`). This is the mobile half; no server change.

**Rulings (Lu, 2026-10-18).** Poll powers follow `is_channel_staff` — team staff of that
team, club staff and club admins club-wide — **not** the global role list.

| | Ruling | Mobile result |
|---|---|---|
| **I2 A** | voter names on an **anonymous** poll = poll creator **OR** channel staff | 2 sites changed |
| **I4 A** | poll **reminder** button = channel staff **only** | 2 sites changed + 2 handler guards |
| **I5 A** | poll **creation** in team/club chats = channel staff; group chats = any member, unchanged | 1 site changed |
| **I7** | non-poll gates untouched | 4 `isStaffInChannel` consumers deliberately left alone |

**Status:** AGENT-ONLY. tsc, eslint and an iOS bundle export only — nothing run on a device
or simulator. Click-through owed (§6).

---

## 1. What the reminder button actually does — Lu asked

It is **live and it really sends**: prod shows 47 reminders sent, last 2026-09-23. It was
gated this slice, not redesigned. One press:

1. **Works out who has not voted**, client-side — reads every `comm_channel_members` row for
   the chat, every `comm_poll_votes` row for the poll, and subtracts.
2. **Invokes the `send-push-notification` edge function directly** with
   `user_ids: <non-voters>`, `title: 'Your Vote Needed'`,
   `body: '"<poll question>" - <time remaining> - Vote now!'`, `type: 'poll_reminder'`,
   and `data: { reference_type: 'poll', reference_id, channel_id }`.
   (The chat card includes the time remaining; the Polls screen's copy omits it —
   pre-existing wording difference, not touched.)
3. **Confirms** with `Reminder Sent` / `Notified N member(s) to vote`. On the chat card the
   button then shows a tick and **locks for one hour** (`setTimeout`, `60 * 60 * 1000`) —
   per card mount, so it is not a server-side rate limit. The Polls screen has no such lock.
4. Disabled when nobody is outstanding; the Polls screen instead says
   `All Voted / Everyone has already voted on this poll!`.

**So this is a real push notification to many people's phones** — which is why I4 A narrowing
it to channel staff matters, and why the gate is now **in the handler as well as on the
button** (§3). Before this slice, any member who created a poll in a group chat could push to
every member who had not voted.

## 2. Sites — verified before editing

The 4 sites named in SCOPE, plus **1 same-stone site** found by the gate-4 grep:
**5 gate sites across 4 files** (under the 10-site fold-in limit).

`PollCard` has exactly **one** consumer (`TeamChatRoomScreen.tsx:631`, pre-edit), confirmed
by `grep -rn "<PollCard" src/` — so removing its prop could not strand another screen.

### The same-stone site, and why it mattered most

**`PollDetailScreen.tsx:197-203` (pre-edit) read the GLOBAL role list.** It counted
`team_staff` rows on the chat's team and then, if that found nothing, fell back to:

```
supabase.from('user_roles').select('role').eq('user_id', user.id).in('role', STAFF_ROLES)
```

`STAFF_ROLES` was a local array of `head_coach, assistant_coach, team_manager, club_admin,
club_director, platform_admin` — **with no team or club scope at all**. Any coach anywhere on
the platform therefore saw **who had voted on an anonymous poll in a chat belonging to a
different club**. It failed the other way too: a `club_admin` of *this* chat's club was caught
only by that unscoped fallback, never by the team check. This is precisely what DONE gate 4
tests for, so it was folded in rather than reported and left.

Replaced by one `isChannelStaff(channelId)` call. Two round trips (`comm_channels` →
`team_staff`, plus sometimes `user_roles`) became one RPC. `STAFF_ROLES` is now dead in this
file and was removed with it.

## 3. What changed, file:line (post-edit line numbers)

### `src/screens/TeamChatRoomScreen.tsx`

| Line | Change |
|---|---|
| `255-277` | **`isStaffHere` is now asked for EVERY chat.** The effect used to return early unless `!allowMemberText`, so in an ordinary chat no call was made and the value stayed `undefined`. Poll gates need it everywhere. One RPC per chat opened. |
| `597-602` | **I5 A** — `canUserCreatePoll`: team/club arm `isStaffInChannel` → `isStaffHere === true`. Group/DM arm returns `true`, unchanged. |
| `660-665` | PollCard's `isStaffInChannel` prop **dropped** (comment in its place). |

**This cannot regress the send gate.** `canSendText` is
`allowMemberText || isStaff === true`, so in a chat that allows member text the composer
renders whatever the staff answer is. Only announcement chats consult it, exactly as before.

`=== true` on the creation gate is deliberate: `undefined` is "not answered yet" and must not
open the gate.

**Name note:** the value is `isStaffHere`, not `isChannelStaff` as the prompt's SITES line
asked, because `isChannelStaff` is already the **imported function** this state is filled from
(`line 43`) — a variable of that name would shadow it. `isStaffHere` is the name this file
already used for this exact value since 4b.

### `src/components/chat/PollCard.tsx`

| Line | Change |
|---|---|
| `199-202` | `isStaffInChannel` prop removed from `PollCardProps`. |
| `224-231` | `isChannelStaff` destructured from the **same `usePoll(pollId)` call** that already answers `canClose`. **Zero extra RPCs** — `usePoll` has fetched this unconditionally since 4d. |
| `249` | **I4 A** — `canSendReminder`: `isStaffInChannel \|\| isCreator` → `isChannelStaff`. |
| `257` | **I2 A** — new `canSeeVoters` = `!poll?.is_anonymous \|\| isChannelStaff \|\| isCreator`. |
| `328` | **I4 A guard** in `handleSendPollReminder`, so the gate is not render-only. |
| `666` | voter row now reads `canSeeVoters` (was `isStaffInChannel \|\| !poll.is_anonymous`). |
| `311-319` | 4d's comment updated — it explicitly said the prop "keeps its other two jobs, poll reminders and anonymous-voter visibility, which are not this slice's rulings". 4i is those rulings. |

`isChannelStaff` from `usePoll` is a plain `boolean` starting `false`, so the reminder button
is closed while the answer is in flight and never flashes for a non-staff viewer.

**Not touched:** `canClose` (`PollCard.tsx:284` pre-edit) — already on `is_channel_staff`
since 4d, per SCOPE. `src/hooks/usePolls.ts` and `src/lib/channelStaff.ts` have **zero diff**.

### `src/screens/ChannelPollsScreen.tsx`

| Line | Change |
|---|---|
| `60`, `102` | state renamed `isStaffInChannel` → `isChannelStaffHere`. **The value did not change** — it has been fed by `isChannelStaff(channelId)` since Q3 B. The old name was the name the *label_kind* answer carries in `TeamChatRoomScreen`: two different definitions under one identifier, which is what the rename fixes. |
| `492` | `canManagePoll = isChannelStaffHere \|\| isCreator` — **still allows the creator**, see below. |
| `499` | **I4 A** — new `canRemindToVote = isChannelStaffHere`. |
| `666` | Remind button now gated on `canRemindToVote` as well as `non_voter_count > 0`. |
| `302-308` | **I4 A guard** in `handleRemindToVote`. |

**Why `canManagePoll` keeps `|| isCreator`:** it wraps the staff-controls row whose main
control is **Close**, and Close is creator-**or**-staff by ruling Q4 B — `canClosePoll` in
`src/lib/channelStaff.ts:117-124` returns `isCreator || isStaff`. Narrowing `canManagePoll`
to staff would have silently taken Close away from poll creators, which no 4i ruling asked
for. Splitting the reminder into its own flag is what keeps I4 A from leaking into Close.
Delete stays creator-only (`:680`, `:697`) — untouched.

### `src/screens/PollDetailScreen.tsx` (same-stone, §2)

| Line | Change |
|---|---|
| `21` | `import { isChannelStaff } from '../lib/channelStaff'` added. |
| `22-29` (pre-edit) | local `STAFF_ROLES` array **removed** — dead once the fallback went. |
| `159-176` | the whole bespoke staff resolution replaced by `setIsStaff(channelId ? await isChannelStaff(channelId) : false)`. |

`canSeeVoters = isCreator || isStaff` at `:189` already had I2 A's **shape**; only the
definition of `isStaff` was wrong, so that line is unchanged.

## 4. I7 — non-poll gates deliberately left alone

`isStaffInChannel` (the `get_channel_member_labels` answer) still has 4 consumers in
`TeamChatRoomScreen`, none of them a poll decision:

- `:228` `isCoach` → goal-celebration animation on "goal"/⚽
- `:364` the `/survey` command gate
- `:903` `SurveyPickerModal`'s `isStaff`
- `:939` `MessageActionsModal`'s `isStaff` (Delete, Read History)

Left exactly as they were. Whether survey powers should follow `is_channel_staff` too is a
ruling nobody has made — flagged, not acted on.

## 5. How verified

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | **64 before → 64 after.** Only diff is one pre-existing error's line number shifting (`PollCard 842` → `871`) because comments were added above it. **Zero new.** |
| eslint, per file | TeamChatRoom `0e/38w → 0e/38w` · PollCard `0e/5w → 0e/5w` · ChannelPolls `1e/25w → 1e/25w` · PollDetail `0e/10w → 0e/9w` (one **fewer**). No new anything. |
| `npx expo export --platform ios` | **exit 0**, bundle 9.01 MB |
| gate-4 grep | no poll file reads `user_roles` / `STAFF_ROLES` / `isStaffInTeam` in code (only the comments describing what was removed); no poll decision reads `isStaffInChannel`. |

PollDetailScreen's lint baseline was taken from `git show HEAD:…` linted out-of-tree, since
the file was folded in after baselines were captured.

## 6. Click-through still owed (device or simulator)

The honest short version — **one account that is a poll creator but NOT staff of the chat**
is what this slice turns on:

1. **Non-staff member, group chat:** can still **start** a poll (I5 A group arm). Make it
   **anonymous**, vote from another account, then open it — the creator **must** see voter
   names (I2 A, this is the new behaviour), and **must NOT** see the bell/Remind button
   (I4 A, this is what was taken away).
2. **Non-staff member, team or club chat:** the poll **+** button in the composer must be
   **gone** (I5 A).
3. **Coach/manager of that team, or a club admin:** poll button present; on any active poll
   the Remind button present; anonymous voter names visible; Close still offered.
4. **Coach of a DIFFERENT team in the same club** (the case `label_kind` got wrong and
   `is_channel_staff` gets right): must NOT get the poll button, the Remind button, or
   anonymous voter names in the other team's chat.
5. Same checks on the **Polls list screen** (Remind only for chat staff; Close still shown to
   a creator; Delete still creator-only) and on **Poll Detail** (the "who voted" rows).

## 7. Carried forward / FOUND

- **`PollCard.tsx:871` — pre-existing tsc error, not mine, not fixed** (out of scope):
  `votedIndicator` is declared **twice** in the StyleSheet. The second wins, so the first's
  green `color: '#22c55e'` and `fontSize: 11` are silently dead. One of the 64 baseline
  errors.
- **`ChannelPollsScreen` carries 1 pre-existing eslint ERROR** (not a warning) in the
  baseline. Untouched, unexamined — worth its own look.
- **Reminder copy differs between the two screens**: the chat card includes "- Ends in N
  hours", the Polls screen does not. Pre-existing; no ruling, so unchanged.
- **The one-hour reminder lock is client-side only** (`setTimeout` on a mounted card), and
  the Polls screen has no lock at all. Nothing server-side rate-limits `poll_reminder`
  pushes, so chat staff can re-send from the Polls screen immediately. Pre-existing.
  **INFERRED** from reading the two handlers — no prod check was made (FORBIDDEN).
- **Survey powers still use the label answer** (§4) — no ruling exists.
