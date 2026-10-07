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

---

## ㊶a — emoji-reaction tap feels slow (spec restored Oct 6 2026)

**Status of the id.** [class2-fixes-oct03.md §Queued (b)](class2-fixes-oct03.md)
recorded ㊶a as *"not found in any recon doc … source unknown"*. The spec was
lost, not the item. It is written down here so it cannot go missing again.

**Spec.** Tapping an emoji reaction waits for the DB round trip before painting.
Fix: optimistic update — paint on tap, reconcile on response, roll back on
error. Match the optimistic pattern already used in chat.

**Where it was.** [useMessages.ts](../../src/hooks/useMessages.ts) —
`toggleReaction` → `addReaction` / `removeReaction`, a bare insert/delete with
no local state change. Nothing moved on screen until the write returned **and**
`subscribeToReactionChanges` fired a refetch.

**Second half of the cause, found while fixing.** The reconcile refetch called
`fetchMessages()`, which sets `loading = true`, and both chat screens render a
full-thread spinner while loading ([TeamChatRoomScreen.tsx:625](../../src/screens/TeamChatRoomScreen.tsx#L625)).
So every reaction tap blanked the entire conversation to a spinner and
repainted. That, more than the round trip, is what "slow" was. An optimistic
paint alone would have been wiped by the spinner a moment later.

**The optimistic path as built.**

| Step | What |
|---|---|
| 1 PAINT | `paintReaction(messageId, emoji, !userReacted)` flips the reaction in local state on the tap frame. The temp row carries `id: 'optimistic-reaction:<messageId>:<emoji>'`, the real `user_id` and `emoji`, so `getReactionsSummary` and `ReactionDetailsModal` both read it unchanged. **No email fallback** in the self-profile — `user_metadata.full_name`, else `'You'`. |
| 2 PERSIST | `removeReaction` / `addReaction`; Supabase returns `{ error }`, so the result is checked, never caught. |
| 3 ROLLBACK | on refusal, `paintReaction(..., userReacted)` — the same call with the flag inverted — then `fetchMessages({ silent: true })` to resync in case something else changed in flight. |
| 4 RECONCILE | on success, the hub's `fetchMessages({ silent: true })` replaces the temp row with the server's. No spinner, no flicker. |

**Supporting changes.** `fetchMessages` takes `{ silent?: boolean }` and skips
`setLoading(true)` when set; the reaction subscription uses it. The redundant
`await refetch()` in `handleReactionSelect`
([TeamChatRoomScreen.tsx:343](../../src/screens/TeamChatRoomScreen.tsx#L343))
was removed — it was a non-silent refetch that undid the paint on the picker
path only; the bubble-tap path never had it. `DMChatScreen.handleReactionSelect`
already had no refetch and needed no change.

**Pattern matched:** the optimistic send in the same hook, and the optimistic
flip at [RosterScreen.tsx:300](../../src/screens/RosterScreen.tsx#L300)
("*Optimistic flip, then persist. The server is still the authority — a rejected
call reverts the switch*").

---

## C batch wave 2 — specs restored Oct 6 2026

Four ids whose specs lived only in planning-room records. Written down here so
they survive. Each row: the spec as restored, then what the code actually did.

### ㉜ — group-chat creation: keyboard blocks the flow

**Spec.** In the group-chat creation flow the keyboard overlaps/blocks the view.
Dismiss or avoid the keyboard so the flow's controls stay visible.

**Audit.** The New Chat modal already mounts a `KeyboardAvoidingView`
([ChatScreen.tsx:1794](../../src/screens/ChatScreen.tsx#L1794)) and the group
step's result list already sets `keyboardShouldPersistTaps="handled"`, so the
usual two suspects were clean. Two things were not:

1. The member-search list carried **`minHeight: 120`**. With the keyboard up the
   modal has roughly 55% of the screen for header + name field + chips + list +
   the Create button; a floor under the list kept it at full size and pushed
   **"Create Group" off the bottom** of the fixed-height container.
2. **No `keyboardDismissMode` anywhere in the file.** The only way to dismiss
   the keyboard was tapping the overlay — which is wired to `closeModal`
   ([:1791](../../src/screens/ChatScreen.tsx#L1791)) and **discards the
   half-filled group**.

**Fixed:** dropped the `minHeight` and added `keyboardDismissMode="on-drag"` on
that list ([ChatScreen.tsx:1329](../../src/screens/ChatScreen.tsx#L1329)).

**Root cause NOT fixed, deliberately.** `styles.keyboardAvoidingView` pins
`height: '95%'` **and** `maxHeight: '95%'`
([:2085-2089](../../src/screens/ChatScreen.tsx#L2085)). A KAV with
`behavior="padding"` pads *inside* a fixed height, so the container never moves
— it only squeezes its children. Relaxing that height would change the layout of
**every** step of this modal (choose / dm / team / group / club), which is wider
than this item. Flagged for a dedicated pass.

### ㉞ — chat → calendar spinner flash

**Spec.** Navigating chat → calendar shows a spinner flash. Remove the flash
(cache/skip the transient loading state) without changing data freshness.

**Audit.** The *teams* gate had already been fixed this way —
[CalendarScreen.tsx:484](../../src/screens/CalendarScreen.tsx#L484) reads
`teamsLoading && !hasAnyTeam`, with a comment naming the flash. The *events*
body had not: it gated on bare `loading`, and `fetchEvents` sets
`loading = true` on **every** focus refetch, so an already-drawn calendar was
replaced by a full-screen spinner each time you arrived.

**Fixed:** `loading && events.length === 0`
([CalendarScreen.tsx:620](../../src/screens/CalendarScreen.tsx#L620)) — first
load only, same shape as the teams gate directly above it. The refetch still
runs on every focus; freshness is untouched, it just no longer blanks.

### ㉟ — chat day separators misplaced

**Spec.** Day separators sit between the wrong days. Audit the grouping logic,
state the real bug, fix so separators land on correct day boundaries,
timezone-safe.

**Audit finding — the grouping logic was NOT the bug.** `isNewDay`
([TeamChatRoomScreen.tsx:489](../../src/screens/TeamChatRoomScreen.tsx#L489))
compares the current row against `invertedMessages[index + 1]`, the next *older*
row, and the separator renders as the first child of the cell. Traced against
`[M1 Mon, M2 Mon, M3 Tue]`: inverted to `[M3, M2, M1]`, i=0 emits "Tue" above
M3, i=1 emits nothing, i=2 emits "Mon" above M1 — reading top to bottom,
`[Mon] M1 M2 [Tue] M3`. **Correct.** Both comparison sides already used local
time, so there was no timezone skew either.

**The real bug is the data the grouping is handed.**
[useMessages.ts:57-58](../../src/hooks/useMessages.ts#L57-L58) ran
`.order('created_at', { ascending: true }).limit(100)`. Postgres applies ORDER
**before** LIMIT, so that returns **the oldest 100 messages in the channel**, not
the most recent. Any thread past 100 messages opened on ancient history; the
separators were correct labels on the wrong hundred rows, which is exactly what
"separators are on the wrong days" looks like from the user's seat.

**Fixed:** `ascending: false` + `limit(100)`, then `[...data].reverse()` back to
ascending for rendering — the newest 100, same filters, same freshness.
`isNewDay` additionally now routes both sides through an explicit local
`YYYY-MM-DD` key that returns `''` for an unparseable timestamp, so a bad row
groups with its neighbours instead of rendering an `Invalid Date` separator.

**Found, not fixed:** [DMChatScreen](../../src/screens/DMChatScreen.tsx) renders
**no day separators at all** (zero occurrences). That is missing, not misplaced,
and adding them is a feature, not this item.

### ㊱ — links in chat messages are not tappable

**Spec.** Linkify URLs in message text, open in the browser. Preview cards
explicitly out of scope.

**Audit.** [ChatBubble.tsx](../../src/components/chat/ChatBubble.tsx) rendered
`{message.content}` as one flat `<Text>` — no link handling anywhere in the
component.

**Fixed:** `renderMessageText()` splits the body on a capturing URL pattern and
returns the plain string untouched when there is no link, so the common case
costs nothing. Matches `http(s)://` and bare `www.`; a bare `www.` link gets an
`https://` scheme because `Linking` needs one. Trailing punctuation is peeled
back out of the href (`"see https://x.io/a."` links `https://x.io/a` and leaves
the full stop as text). A failed open shows an alert rather than silently doing
nothing. **No dependency added** — hand-rolled, `Linking` is from react-native.
Links are underlined; white on own messages (the purple bubble fails contrast
against blue) and `#93C5FD` on others. **No preview cards.**

---

## C batch wave 3 — attendance / details redesign (specs restored Oct 6 2026)

All three land in [EventDetailScreen.tsx](../../src/screens/EventDetailScreen.tsx).
㊴ subsumes ㉝: the colliding counters were a symptom of the same duplication.

### ㊳ — Attendance tab visuals

**Spec.**
1. The event date/time line becomes a small coloured banner in the app's purple
   accent family with a calendar icon — `"Tue, Oct 7 · Practice · 6:30–8:00 PM"`.
2. Per-row status TEXT (`"said going"`) is replaced by a visual badge: green
   check for going, red X for can't go, muted "No reply" pill otherwise.
3. **The product has NO "Maybe" status.** Never render a Maybe state or column.
   Legacy rows carrying other status values render in the muted/no-reply style —
   no label is invented for a value we do not recognise.
4. `by «Parent»` attribution and decline-reason quotes stay as they are.

**Before.** A grey one-line `attContext` string, and a hint line per row from
`rsvpHint()` — `"said going"` / `"said can't — <reason>"` / `"marked late"` /
`"no reply"` — with a coach mark overwriting it as `"<label> · by Coach <name>"`.

**After.** `attBanner` (purple-tinted fill + border, `Ionicons name="calendar"`).
`rsvpHint()` is gone, replaced by `statusBadge()`, which returns one of three
kinds. `late` / `excused` keep their recorded labels but render muted rather
than getting a colour of their own; anything unrecognised falls back to
"No reply". The row now reads: avatar · name + reason quote + attribution ·
family badge · coach ✗/✓ buttons. The badge answers "what did the family say",
the buttons answer "who actually showed up" — two questions, two controls.

### ㊴ — Details tab de-dupe (resolves ㉝'s colliding counters)

**Spec.** Details keeps ONLY event info, the "Will you be there?" RSVP action,
and a compact headcount strip (Going / Can't go / No reply). The full per-player
RSVP list is removed; the per-player list and all coach marking live only on the
Attendance tab. Headcount counts ALL RSVPs, not only player-matched ones, so the
strip can never disagree with the list, and unmatched responders still count.

**Before.** Details carried a 4-tile strip — Going / Can't / No reply /
**Headcount** — followed by a full read-only roster list *and* a second list of
unmatched responders. The Attendance tab rendered the same roster again, with
controls. 72 lines of duplicated list.

**After.** The strip is 3 tiles and the lists are gone from Details. The
**Headcount tile is deleted outright** — it was the collision: `Going` counted
raw RSVP rows while `Headcount` counted roster entries that had resolved to a
player, so a viewer who cannot resolve their peers saw the reported
**"Going 6 / Headcount 1"** ([identity-resolution-oct02.md § Symptom 3](identity-resolution-oct02.md)).
Two numbers over two different populations, side by side.

**Headcount source — stated.** Every number now comes from the RSVP rows:

| Tile | Source |
|---|---|
| Going | `eventRsvps.filter(status === 'yes').length` — all rows, matched or not |
| Can't go | `eventRsvps.filter(status === 'no').length` |
| No reply | rows that are neither yes nor no (legacy `pending`/`maybe`/null) **+** roster players no RSVP resolved to (`players.length − resolvedRsvps.byPlayer.size`) |

Every RSVP row lands in exactly one bucket. A responder nobody could match to a
player still answered, so they count.

**Consequence worth knowing:** when matching fails, the buckets can sum above
the roster size — 6 responders + 9 unmatched players on a 10-player team. That
is a visible signal that resolution is failing, which is strictly better than
the old silent undercount, but it is not a tidy total. Noted, not hidden.

**Fetches — verified, none droppable.** The spec allowed dropping a fetch if the
removed list made it unnecessary. It does not:

| Data | Still read by |
|---|---|
| `players` | the No-reply tile, and the Attendance roster |
| `attendanceRows` / `playerRoleMap` | `roster`, Attendance tab |
| `responderEmails` | tier-3 matching → `resolvedRsvps.byPlayer` → the No-reply tile |
| `nonResponders` | the "Remind N to RSVP" button, still on Details |

Both tabs are branches of the same component over the same state, so nothing
became orphaned. **Tier-1/2/3 player matching is untouched**, as is the retained
email bridge.

**Left behind deliberately:** the style keys the removed lists used
(`rosterRow`, `rosterInfo`, `rosterName`, `rosterReason`, `rosterSource`,
`statusChip`, `statusChipText`, `headcountItem`, `headcountCount`) are now
unreferenced. Dead style objects are inert; removing nine of them is churn with
a non-zero chance of catching a live key by mistake. Flagged for a sweep.

---

## C2 — calendar card polish (design "Option A") + dead-action removal · Oct 6 2026

### 1 — Calendar event cards

Both cards live **inline in [CalendarScreen.tsx](../../src/screens/CalendarScreen.tsx)**,
rendered twice (the grouped list at `:674` and the agenda list at `:841`), so
every change below was applied in both places.

> **Found:** [src/components/calendar/EventCard.tsx](../../src/components/calendar/EventCard.tsx)
> is **dead code** — nothing imports it. It was not edited; a card changed there
> would have shipped nothing. Flagged for deletion in a separate pass.

**(a) Date block + left edge, coloured by event type.**

*Before:* the date block was filled with the **team** colour
(`event.team?.color || '#5B7BB5'`), and a separate `EVENT_TYPE_EDGE` map drove
the left edge with colours that were the inverse of Option A — game `#0d9488`
(teal), scrimmage `#d97706`, everything else `#64748b` (slate), and **practice
`transparent` with `borderLeftWidth: 0`**, so practice had no edge at all.

*After:* one `eventAccent(type)` helper drives **both** the block fill and the
left edge, so they always match. Values are the app's existing `EVENT_TYPES`
tokens from [src/types/index.ts](../../src/types/index.ts) — no new colours
invented:

| Type | Accent | Token source |
|---|---|---|
| game | `#f97316` warm orange | the palette's `scrimmage` orange |
| practice | `#22c55e` green | the palette's `practice` green |
| everything else | `#a855f7` neutral purple | the palette's `other_event` purple |

Past events still grey out (`#4B5563`) on both block and edge. The
`practice → 0` width special case is gone; every type now carries a 4pt edge.
The GAME/PRACTICE label stays inside the block, unchanged.

**Deviation worth knowing:** this puts `scrimmage` on purple, even though the
palette gives it an orange of its own. "Other types = neutral purple" was the
approved rule and it is followed literally. Say the word to group scrimmage with
game instead — it is one line.

**Team identity:** the block no longer encodes the team. The team badge and
colour dot in the details column already carry it, so nothing was lost, but it
is a real change in the All-Teams view.

**(b) RSVP counts row.** `✓ n · ✗ n · ? n` went `fontSize: 12 → 14`, with the
divider bumped to match so the row sits on one baseline. Weight was **already**
`'600'`, so only the size moved — the "medium weight" half of the spec was
already satisfied.

> **Not changed, flagged:** the three counts are coloured `#C4B5FD` / `#A78BFA` /
> `#64748b` — two purples and a grey for ✓/✗/?. Legible, but the colours carry
> no going/can't-go semantics. Outside a size-and-weight ticket.

**(c) Location line as a maps link.** *Before:* already wrapped in a
`TouchableOpacity` calling `openInMaps()` — so the behaviour existed, and
[src/lib/maps.ts](../../src/lib/maps.ts) already does it with `Linking` only:
`comgooglemaps://` then `http://maps.apple.com/?q=` on iOS, `geo:0,0?q=` then a
web fallback on Android. **No SDK, no API key, no preview image.** What was
missing was the affordance: `#8b5cf6` text with no underline did not read as
tappable.

*After:* `textDecorationLine: 'underline'` + `fontWeight: '600'` on
`eventLocation`, and an 8pt `hitSlop` on both cards' touchables.

### 2 — Message actions modal: "View Profile" removed

**Provenance — pre-existing, not from today's waves.** `git blame` puts the
action, and the `handleViewProfile` that feeds it, at commit **`443958b`**
("feat: Add Board Room voting visualization for polls", Lud Sanz, **2026-03-04**)
— seven months before today's C batch. Today's waves touched
`MessageActionsModal.tsx` once, to add the `senderName` prop for sweep item #6;
no wave went near this action.

**Why it was dead.** It called
`navigation.navigate('UserProfile', { userId })`
([TeamChatRoomScreen.tsx:414](../../src/screens/TeamChatRoomScreen.tsx#L414)).
`AppNavigator` registers 162 screen names; `UserProfile` is not one of them —
the only profile routes are `Profile`, `ProfileTab`, `EditProfile` and
`PlayerProfile`. Tapping it errored.

**Removed:** the action item only. Mute, Block, Copy, Reply, Edit, Delete and
Read-history are untouched. The `onViewProfile` prop and the
`handleViewProfile` handler are **deliberately left in place** so no caller
breaks, with a comment at the removal site saying to register a real route
before rendering an action for it again. They are now unreachable.

---

## C3 — device-review corrections + card tap zones · Oct 6 2026

### 1 — Calendar card colours reverted to the prior palette

C2 set game warm-orange and practice green. Device review rejected both.

| Type | C2 | C3 (now) | Token source |
|---|---|---|---|
| game | `#f97316` orange | **`#0d9488`** green/teal | the hue this screen used pre-C2 |
| scrimmage | `#a855f7` purple | **`#0d9488`** green/teal | grouped with games — competitive play |
| practice | `#22c55e` green | **`#5B7BB5`** Soft Blue | named in the team-colour pickers ([RosterScreen.tsx:23](../../src/screens/RosterScreen.tsx#L23), [TeamDetailScreen.tsx:18](../../src/screens/TeamDetailScreen.tsx#L18)) |
| other / unknown | `#a855f7` purple | `#a855f7` purple | unchanged |

**Flag, as asked:** the palette *does* argue against putting scrimmage with
games. `EVENT_TYPES` in [src/types/index.ts](../../src/types/index.ts) gives
scrimmage its own orange `#f97316`. Grouping it with games on green was the
explicit instruction and it wins here, but that token now goes unused on this
card.

C2's **structure is kept intact**: one `eventAccent()` drives both the date
block fill and the matching 4pt left edge, the GAME/PRACTICE label stays inside
the block, past events still grey to `#4B5563`, and the enlarged RSVP counts
(14pt) are untouched.

### 2 — Calendar card tap zones

**(a) Whole card → event detail.** Already true and unchanged: in both render
sites the entire card is one `TouchableOpacity` wrapping date block, details and
the RSVP/past column.

> **Pre-existing second exception, flagged not changed:** on the agenda card the
> `willStrip` (the inline ✓/✗ answer buttons) sits *outside* the card's
> touchable by design — its own comment says *"outside the card's touchable so
> tapping a button answers instead of opening the event."* The empty space
> between those buttons is therefore inert rather than navigating. Pulling the
> strip inside would put event-navigation under the RSVP buttons, so it was left
> alone.

**(b) Venue line → Maps, and it stops there.** The venue row is its own nested
`TouchableOpacity` calling `openInMaps()`. React Native already gives the
innermost view the touch responder, so the card's `onPress` does not fire
underneath; `e.stopPropagation?.()` was added on top of that as belt and braces,
not because the nesting alone was leaking.

**(c) Underline removed.** Device review: too cluttered. The affordance is now
accent colour + an `Ionicons name="location"` pin on the left + a small
`chevron-forward` on the right, in a new `eventLocationRow` flex row. The venue
text itself is clean — no decoration — and truncates to one line. The old `📍`
emoji is gone in favour of the real icon.

### 3 — Event detail address block

**(a) Tap → Maps.** Unchanged, still `handleOpenMaps`.

**(b) Long-press → copy.** New. `handleCopyAddress` copies
`location_address`, falling back to `location_name` when the event has no street
address, since the address is what is useful pasted elsewhere. `delayLongPress`
is 350ms so the two gestures do not compete. The hint line now reads
*"Tap to open in Maps · hold to copy"*, and on success swaps to a green
*"✓ Address copied"* that clears itself after 1.8s via a cleaned-up timer, so it
behaves as a toast rather than a permanent label. A clipboard failure falls back
to an alert carrying the text.

**Clipboard source — named.** **`expo-clipboard`** (`~8.0.8`), already in
`package.json` and present in `node_modules`. **No new dependency.** It is also
the house pattern: `import * as Clipboard from 'expo-clipboard'` is used in
WelcomeScreen, JoinTeamScreen, InviteCoParentModal and PlayerDashboard. The repo
*also* carries `@react-native-clipboard/clipboard` (`^1.16.3`), used once in
CalendarSyncModal — two clipboard libraries for one job, worth consolidating in
a later pass.

### 4 — Conversation card titles always bold

`styles.conversationName` went `fontWeight: '500'` → **`'700'`**, so every card
title is bold whether read or unread. `conversationNameUnread` keeps only its
brighter `#fff`; its now-redundant `fontWeight: '700'` was dropped. The unread
badge remains the unread signal, as specified.

---

## C3b — colour consistency everywhere + the Maps tap · Oct 6 2026

### 1 — Colour sweep: one source of truth

New module **[src/lib/eventColors.ts](../../src/lib/eventColors.ts)** exports
`eventAccent(type)` and `eventAccentFor(type, past)`. Every event surface now
calls it. (Scope note: a shared module is a new file, but "one source of truth,
no view exempt" cannot be met with the helper living inside CalendarScreen.)

**Why views disagreed:** the list card used an event-type map while
Day/Week/Month **each painted the TEAM colour**, and the detail screen did too —
so one game was green on the list and blue everywhere else. Type badges took a
*third* set of hues from `EVENT_TYPES` (game = cyan `#06B6D4`).

| # | Site | Was | Now |
|---|---|---|---|
| 1 | [CalendarScreen.tsx](../../src/screens/CalendarScreen.tsx) local `EVENT_TYPE_ACCENT` + `eventAccent` | local copy | **moved** to `src/lib/eventColors.ts` |
| 2 | CalendarScreen `:53` `EVENT_TYPE_LABEL_COLORS` | **dead map, 0 call sites**, hues contradicting everything | **removed** |
| 3 | CalendarScreen date block + 4pt edge (both render sites) | `eventAccent` | unchanged ✓ |
| 4 | CalendarScreen `cardTypeBadge` | `getEventTypeConfig().color` — cyan on a green card | `eventAccent()` |
| 5 | [WeekView.tsx:224](../../src/components/calendar/WeekView.tsx#L224) event block | `team?.color \|\| '#5B7BB5'` | `eventAccentFor()` |
| 6 | [MonthView.tsx:110](../../src/components/calendar/MonthView.tsx#L110) event chip | `team?.color \|\| '#5B7BB5'` | `eventAccentFor()` |
| 7 | [DayView.tsx:207](../../src/components/calendar/DayView.tsx#L207) event block | `team?.color \|\| '#5B7BB5'` | `eventAccentFor()` |
| 8 | [EventDetailScreen.tsx](../../src/screens/EventDetailScreen.tsx) date block | `team?.color \|\| '#5B7BB5'` — **the reported game-is-blue** | `eventAccent()` |
| 9 | EventDetailScreen `typeBadge` | `typeConfig.color` — cyan | `eventAccent()` |

**Listed and deliberately NOT routed — these encode TEAM, not event type:**
team dots (CalendarScreen `:746`, `:935`, EventDetailScreen `:1291`), the team
legend and team selector (`:1211`, `:1266`), `PlayerAvatar teamColor`
(EventDetailScreen `:1161`), and the team swatch in CalendarSyncModal `:185`.
They answer "whose team", a different axis. `EVENT_TYPES` keeps supplying labels
and icons; only its *colours* stopped driving event surfaces.

**Listed, not edited, flagged:** [EventCard.tsx](../../src/components/calendar/EventCard.tsx)
has its own `getEventTypeConfig` colour but **nothing imports the component** —
dead code, already flagged in C2. `CreateEventModal` / `EditEventModal` carry an
`EVENT_TYPE_ICONS` colour set for the type *picker*; those are form swatches,
not calendar chips, so they were left. They will now disagree with the card the
event produces — worth a follow-up ticket.

### 2 — Maps tap opened nothing on iOS

**Root cause, two faults compounding.**

1. The iOS branch gated on `canOpenURL('comgooglemaps://?q=…')`. iOS only
   answers that probe for schemes listed in `LSApplicationQueriesSchemes`, and
   **`app.json` declares none** — `expo.ios.infoPlist` holds only
   `ITSAppUsesNonExemptEncryption`, `NSCameraUsageDescription` and
   `NSPhotoLibraryUsageDescription`. The probe could never succeed, and for an
   undeclared scheme RN/iOS can *reject* rather than resolve `false`.
2. **Nothing caught it.** `grep -c 'try\|catch' src/lib/maps.ts` → **0**, and
   every call site invokes it bare (`onPress={() => openInMaps(...)}`), so a
   rejection became an unhandled promise rejection: the tap did nothing, with no
   error. The Apple Maps fallback sat on the `else` branch and was never
   reached.

**Proof the handler itself fires:** on the detail screen `onPress={handleOpenMaps}`
and `onLongPress={handleCopyAddress}` are on the *same* `TouchableOpacity`, and
the long-press copy works on device. A touchable that receives long-press
receives press. So the fault was inside `openInMaps`, not in the tap wiring —
which also explains why *both* the list card and the detail screen failed
identically.

**Fix.** The probe is gone from the happy path. Apple Maps is always present on
iOS so it is the default; Android gets the `geo:` intent; both fall through to a
plain `https://` Google Maps URL. Each candidate runs in its own try/catch, so
one failure advances to the next instead of aborting, and exhausting the list
raises `Alert.alert('Could not open Maps', …)`. The function can no longer
reject, so bare call sites are safe.

**No `LSApplicationQueriesSchemes` added:** nothing probes a custom scheme any
more, so the entry would be dead config. It becomes a prerequisite again only if
a Google-Maps-first preference is wanted back on iOS.

**Confirmable only on device:** which of the two faults fired — a rejected probe
versus a resolved-`false` probe followed by a failing `openURL` — cannot be
settled from source. Both are closed by the rewrite. That Apple Maps actually
launches on the simulator also needs a device/simulator run; only URL syntax and
branch order were verified here.

### 3 — Conversation card bold: verdict

**Correct already, no change made.** All three render paths — Recent
([ChatScreen.tsx:1711](../../src/screens/ChatScreen.tsx#L1711)), Past (`:1736`)
and By Team (`:1774`) — render the single `ConversationItem` (`:88`), whose
title reads `styles.conversationName`, now `fontWeight: '700'`. Neither
override touches weight: `conversationNamePast` sets only `fontSize: 14`,
`conversationNameUnread` only `color: '#fff'`. So the title is bold on every
path, read and unread, and the badge remains the unread signal.
