# UX Smoothness Sweep — communication + attendance surfaces
**Date:** 2026-10-05 · **Mode:** read-only recon, no source changed · **For:** 4f cosmetic batch
**Scope read:** 13 comm/attendance screens + `src/components/chat/*` (13) + 7 comm hooks
**Severity:** crash · blocker · friction · polish · **Fix size:** S / M / L
**Convention:** items already catalogued as 32–39 in [identity-resolution-oct02.md](identity-resolution-oct02.md) are marked `DUP-㉜..㊴`, not re-listed.

**Headline:** no crashes found. **1 blocker** — AttendanceScreen reports "Saved" when every
write failed. The rest is friction and polish: **22 findings** (1 blocker / 16 friction / 5 polish)
across 5 areas, plus a checked-and-clear note per area recording what was verified sound.

---

## 1 — LOADING (5)

| file:line | Problem | Sev | Fix |
|---|---|---|---|
| [GroupInfoScreen.tsx:356](../../src/screens/GroupInfoScreen.tsx#L356) | No loading state anywhere in 767 lines: renders a blank group name and **"0 members"** during fetch, then pops to real data | friction | M |
| [ChannelPollsScreen.tsx:767](../../src/screens/ChannelPollsScreen.tsx#L767) | Poll list has no `RefreshControl`; vote counts change constantly, no refresh without leaving the screen | friction | S |
| [PollDetailScreen.tsx:275](../../src/screens/PollDetailScreen.tsx#L275) | No `RefreshControl` on a live vote-count screen | friction | S |
| [ChatInfoScreen.tsx:107](../../src/screens/ChatInfoScreen.tsx#L107) | No `RefreshControl`; poll/file/link/member counts fetched once and go stale | friction | S |
| [ChannelPollsScreen.tsx:698](../../src/screens/ChannelPollsScreen.tsx#L698) · [PollDetailScreen.tsx:285](../../src/screens/PollDetailScreen.tsx#L285) · [ChatInfoScreen.tsx](../../src/screens/ChatInfoScreen.tsx) | Full-screen spinners carry no label, unlike [DirectMessagesScreen.tsx:256](../../src/screens/DirectMessagesScreen.tsx#L256) ("Loading conversations…") | polish | S |

**Clear:** [DirectMessagesScreen](../../src/screens/DirectMessagesScreen.tsx) (gate + labelled spinner + empty state + refresh) ·
[ChatScreen](../../src/screens/ChatScreen.tsx) (5 spinners / 4 refresh / 5 empty) · ChannelPolls + PollDetail both gate on `loading` before list render.

## 2 — KEYBOARD (2)

| file:line | Problem | Sev | Fix |
|---|---|---|---|
| [ChannelPollsScreen.tsx:535](../../src/screens/ChannelPollsScreen.tsx#L535) | Vote-note `TextInput` lives inside the FlatList item ([:767](../../src/screens/ChannelPollsScreen.tsx#L767)) and the screen has **no `KeyboardAvoidingView`** — typing on a poll low in the list puts the field behind the keyboard | friction | M |
| [DMChatScreen.tsx:142](../../src/screens/DMChatScreen.tsx#L142) | Has KAV but **no `keyboardShouldPersistTaps`, no `keyboardDismissMode`** — sibling [TeamChatRoomScreen](../../src/screens/TeamChatRoomScreen.tsx) sets both. First tap on a message only dismisses the keyboard; scrolling never dismisses it | friction | S |

**Clear:** ChatScreen, DMChat, TeamChatRoom, GroupInfo and CreatePollModal all mount `KeyboardAvoidingView`
with a `Platform`-switched `behavior`. StaffMessageScreen, PollDetailScreen, ChatInfoScreen,
AttendanceScreen and SurveyPickerModal contain **zero `TextInput`** — no keyboard surface to fix.

## 3 — TAP TARGETS & DISMISS (5)

| file:line | Problem | Sev | Fix |
|---|---|---|---|
| [ChatInfoScreen.tsx:459](../../src/screens/ChatInfoScreen.tsx#L459),[:465](../../src/screens/ChatInfoScreen.tsx#L465) | Files/Links tiles show **real counts** from [:125-126](../../src/screens/ChatInfoScreen.tsx#L125) but navigate to 42-line placeholder stubs — [ChannelFilesScreen.tsx:23](../../src/screens/ChannelFilesScreen.tsx#L23) renders "Files list coming soon" | friction | M |
| [ReactionDetailsModal.tsx:48](../../src/components/chat/ReactionDetailsModal.tsx#L48) | `<Modal>` has **no `onRequestClose`** — Android hardware back cannot dismiss it (every sibling modal sets it) | friction | S |
| [DMChatScreen.tsx:439](../../src/screens/DMChatScreen.tsx#L439),[:468](../../src/screens/DMChatScreen.tsx#L468) · [TeamChatRoomScreen.tsx:638](../../src/screens/TeamChatRoomScreen.tsx#L638) · [GroupInfoScreen.tsx:326](../../src/screens/GroupInfoScreen.tsx#L326) | `backButton` is 40×40 with no `hitSlop` — 4pt under the 44pt guideline on the most-tapped control | polish | S |
| [GroupInfoScreen.tsx:452](../../src/screens/GroupInfoScreen.tsx#L452) | `modalCloseButton` 36×36 ([:677](../../src/screens/GroupInfoScreen.tsx#L677)), no `hitSlop` | polish | S |
| [CreatePollModal.tsx](../../src/components/chat/CreatePollModal.tsx) | Only modal in `chat/` with no backdrop-tap dismiss (X button only). Plausibly deliberate for a form — confirm intent before "fixing" | polish | S |

**Clear:** [ChannelPollsScreen.tsx:592](../../src/screens/ChannelPollsScreen.tsx#L592) `radioOuter` is 18×18 but sits inside a
row-wide `TouchableOpacity` ([:565-605](../../src/screens/ChannelPollsScreen.tsx#L565)) — not a small target. 34 `hitSlop` uses across `src/`, so the idiom exists.

## 4 — NAMES: remaining `memberNames`-first bypasses (3)

Follows today's #7/#8 fix. Full grep of `\.profile\?\.full_name` across `src/` → 8 hits: 3 are the
now-fixed sites, 2 are correct bubble renderers ([TeamChatRoomScreen.tsx:590](../../src/screens/TeamChatRoomScreen.tsx#L590), [DMChatScreen.tsx:391](../../src/screens/DMChatScreen.tsx#L391)), 3 remain:

| file:line | Problem | Sev | Fix |
|---|---|---|---|
| [MessageActionsModal.tsx:65](../../src/components/chat/MessageActionsModal.tsx#L65) | `message?.profile?.full_name \|\| 'User'` — bypasses `memberNames`. Rendered only from [TeamChatRoomScreen.tsx:781](../../src/screens/TeamChatRoomScreen.tsx#L781), which **holds `memberNames`**, so it shows `'User'` on the same screen whose bubble shows the real name. Client-only | friction | S |
| [ReactionDetailsModal.tsx:74-75](../../src/components/chat/ReactionDetailsModal.tsx#L74) | Table A **#10**: reads the RLS-blocked `profiles` map from [useMessages.ts:66](../../src/hooks/useMessages.ts#L66) → `'Unknown'`. `ReactionDetailItem` carries `user_id` ([:15](../../src/components/chat/ReactionDetailsModal.tsx#L15)) and the only render site holds `memberNames` — client-only | friction | S |
| [useChannelMembers.ts:34](../../src/hooks/useChannelMembers.ts#L34) | Table A **#22**: embed `profile:profiles(full_name)`, RLS-blocked for non-staff; feeds read receipts via [TeamChatRoomScreen.tsx:163](../../src/screens/TeamChatRoomScreen.tsx#L163). **Not client-only** — needs an RPC or a `memberNames` merge | friction | M |

## 5 — ATTENDANCE CLARITY (7)

| file:line | Problem | Sev | Fix |
|---|---|---|---|
| [AttendanceScreen.tsx:163-183](../../src/screens/AttendanceScreen.tsx#L163) | **Writes are never checked.** Supabase returns `{ error }` rather than throwing, so the `catch` never fires and `Alert.alert('Saved', …)` at [:183](../../src/screens/AttendanceScreen.tsx#L183) reports success even if every row failed (RLS denial included). Same class as `23e05ec` | **blocker** | S |
| [AttendanceScreen.tsx:136-141](../../src/screens/AttendanceScreen.tsx#L136) | No unsaved-changes guard: `cycleStatus` mutates local state only; navigating back silently discards the whole sheet (no `beforeRemove` listener in the file) | friction | M |
| [AttendanceScreen.tsx:159](../../src/screens/AttendanceScreen.tsx#L159) | `for … of players` with a sequential `await` per player — one round trip each, a 20-player roster is 20 serial writes behind a single static "Saving…" | friction | M |
| [AttendanceScreen.tsx:136-141](../../src/screens/AttendanceScreen.tsx#L136) | Tap **cycles** yes→no→maybe with no affordance saying so; correcting a mistap costs two more taps | friction | M |
| [AttendanceScreen.tsx:63](../../src/screens/AttendanceScreen.tsx#L63) | `'maybe'` is labelled **"Unknown"** — and `'maybe'` is also the default for players with no RSVP ([:236](../../src/screens/AttendanceScreen.tsx#L236)), so a deliberate "maybe" and "never responded" render identically. Collides with the identity-`'Unknown'` token (sweep hygiene §Non-identity) | friction | S |
| [AttendanceScreen.tsx:226](../../src/screens/AttendanceScreen.tsx#L226) | Summary is only `presentCount/total Present` — absent and unknown counts never surfaced, so a coach cannot see who is missing at a glance | friction | S |
| [AttendanceScreen.tsx:198](../../src/screens/AttendanceScreen.tsx#L198) | No pull-to-refresh (plain `players.map`, no FlatList/ScrollView refresh) | polish | S |

**Clear:** status chip is **icon + label + colour**, not colour-only ([:264-268](../../src/screens/AttendanceScreen.tsx#L264)) — `STATUS_OPTIONS` ([:60-63](../../src/screens/AttendanceScreen.tsx#L60))
carries all three. `getStatusHint` ([:143](../../src/screens/AttendanceScreen.tsx#L143)) already distinguishes "No response" from a prior RSVP in the subtitle.
**`DUP-㉞`** — player-name rendering at [AttendanceScreen.tsx:95](../../src/screens/AttendanceScreen.tsx#L95) (`players.first_name` direct). Not re-listed.

---

## TOP 10 — by severity, then blast radius

| # | file:line | Finding | Sev | Fix |
|---|---|---|---|---|
| 1 | [AttendanceScreen.tsx:163-183](../../src/screens/AttendanceScreen.tsx#L163) | "Saved" alert fires even when every write failed — silent attendance loss | **blocker** | S |
| 2 | [AttendanceScreen.tsx:136](../../src/screens/AttendanceScreen.tsx#L136) | No unsaved-changes guard — back button discards the sheet silently | friction | M |
| 3 | [ChatInfoScreen.tsx:459](../../src/screens/ChatInfoScreen.tsx#L459),[:465](../../src/screens/ChatInfoScreen.tsx#L465) | Files/Links tiles advertise real counts, lead to "coming soon" stubs | friction | M |
| 4 | [ChannelPollsScreen.tsx:535](../../src/screens/ChannelPollsScreen.tsx#L535) | Vote-note input hides behind the keyboard (no KAV on the screen) | friction | M |
| 5 | [GroupInfoScreen.tsx:356](../../src/screens/GroupInfoScreen.tsx#L356) | "0 members" + blank name flash on every open; no loading state at all | friction | M |
| 6 | [MessageActionsModal.tsx:65](../../src/components/chat/MessageActionsModal.tsx#L65) | Shows `'User'` where the bubble behind it shows the real name | friction | S |
| 7 | [ReactionDetailsModal.tsx:74-75](../../src/components/chat/ReactionDetailsModal.tsx#L74) | Reaction list shows `'Unknown'`; `user_id` + `memberNames` both available | friction | S |
| 8 | [AttendanceScreen.tsx:63](../../src/screens/AttendanceScreen.tsx#L63) | "Unknown" conflates deliberate maybe with never-responded | friction | S |
| 9 | [AttendanceScreen.tsx:159](../../src/screens/AttendanceScreen.tsx#L159) | Serial write per player — slow save, no progress | friction | M |
| 10 | [ReactionDetailsModal.tsx:48](../../src/components/chat/ReactionDetailsModal.tsx#L48) | Android hardware back cannot dismiss the modal | friction | S |

**Cheapest real wins for 4f:** #1, #6, #7, #8, #10 — all S, all client-only, none touching schema or RPCs.
**Not cosmetic, do not absorb into 4f:** #1 is a correctness bug (write-error checking), and
[useChannelMembers.ts:34](../../src/hooks/useChannelMembers.ts#L34) needs server work. **INFERRED:** all RLS claims inherit the Oct-02
caveat — no policy SQL exists in this repo, so "RLS-blocked" is from call-site comments, not verified.
