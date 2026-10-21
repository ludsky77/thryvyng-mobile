# Chat List v2 — Stage 3, mobile build notes

**Date:** 2026-10-19 · **Repo:** `thryvyng-mobile` · **Base:** `main` @ `906568b`
**Rulings:** Lu 2026-10-15/16 + 2026-10-18 (8 rulings, restated in the task brief).
**Server prerequisites, taken as given:** `get_my_conversations` now returns 23 columns
(`hidden_at` col 20, plus `channel_club_id`, `club_name`, `club_logo_url`);
`set_channel_hidden(channel_id, boolean)` exists and refuses team/club/default chats.

**Status: AGENT-ONLY.** tsc, eslint, an iOS bundle export and a 32/32 logic suite.
Nothing was run on a device or simulator — the click-through in §7 is owed.

---

## 1. Rulings: 7 applied, 1 not applicable client-side

| # | Ruling | Where | State |
|---|---|---|---|
| 1 | Club crest on avatar; crest + club name in open-chat header | `ChatScreen.tsx` `ClubCrest` :236-250, avatar :297; `TeamChatRoomScreen.tsx` :800-822 | **done** |
| 2 | Club chips only at 2+ clubs; filters by `channel_club_id` | `ChatScreen.tsx` `userClubs` :657-686, `renderClubChips` :1458-1505 | **done** |
| 3 | Rich 3-line card | `ChatScreen.tsx` :318-434 | **done** |
| 4 | Swipe: DM/group = Mute+Hide, team = Mute only; Recent + By Team, not Past | `SwipeableChatRow` :148-233; `swipeActionsFor` :1431-1455 | **done** |
| 5 | `set_channel_hidden`; H7; H4; nothing marked read; one pass | `lib/hiddenChats.ts`; `utils/unreadRule.ts` :48-90, :204-227 | **done** |
| 6 | Mute via the existing write; icon shown, count unchanged | `ChatScreen.tsx` `handleToggleMute` :1368-1395 | **done** |
| 7 | Non-team chats: labels/child names scoped to the chat's own club (4g A) | `lib/memberNames.ts` :222-243 | **NOT applicable client-side — see §5** |
| 8 | "Hidden (n)" row at the bottom of Recent, expand, swipe to Unhide | `renderHiddenSection` :1507-1565 | **done** |

**Open questions: none.** Everything user-facing was settled by the brief. Three
*internal* choices are recorded in §6.

## 2. The hide rule, and why it lives in two files

`set_channel_hidden` is the only hide write in the app (grep-proven: one
`supabase.rpc('set_channel_hidden')`, in `lib/hiddenChats.ts:114`; zero direct
`hidden_at` UPDATEs anywhere). `comm_channel_members.hidden_at` is never written from a
screen.

The **pure H7 predicate** is in `utils/unreadRule.ts`, not in `hiddenChats.ts`:

```
hidden  iff  hidden_at IS NOT NULL  AND  last_message_at <= hidden_at
```

`unreadRule.ts` is deliberately free of react, react-native and supabase so it can run
under `node --test` (its own header says so), and `hiddenChats.ts` imports supabase.
Putting the predicate next to the classifier that applies it keeps both the purity and the
single-pass guarantee; `hiddenChats.ts` is the half that talks to the server.

**H4 falls out for free.** A new message moves `last_message_at` past `hidden_at`, the
predicate goes false, and the row returns to the list **with its unread intact** — hiding
writes one timestamp and never touches `last_read_at`. Proven by two tests
(`H4: a NEWER message un-hides the chat`, `H4 end to end: the new message returns the row
AND its unread`).

**H5 (never touches push)** is satisfied by omission: no push or notification file was
opened. Delivery stays `is_muted`'s business, so a hidden chat still notifies unless it is
also muted.

## 3. Hidden leaves BOTH the list and the total, in one pass (ruling 5)

`utils/unreadRule.ts:204-227` — the diff hunk:

```diff
   const mainRows: T[] = [];
   const pastRows: T[] = [];
+  const hiddenRows: T[] = [];
   let total = 0;

   for (const row of rows ?? []) {
     if (!row || !row.channel_id) continue;
+    // Archived is still "listed nowhere, counted nowhere" and wins outright.
+    if (row.is_archived === true) continue;
+    if (isHiddenConversation(row)) {
+      hiddenRows.push(row);
+      continue;
+    }
     if (countsTowardUnread(row, teams)) {
       mainRows.push(row);
       total += Math.max(0, row.unread_count ?? 0);
     } else if (isPastTeamChannel(row, teams)) {
       pastRows.push(row);
     }
   }
-  return { mainRows, pastRows, total };
+  return { mainRows, pastRows, hiddenRows, total };
```

One `continue` removes the row from `mainRows` **and** from `total`, because the loop that
builds the list is the loop that sums the badge. That was the whole point of merging them
in Stone B, and it is why no second derivation was added here. Test
`hidden rows leave BOTH the list and the total, in one pass` asserts `total === 4`, not 13,
for one visible row of 4 and one hidden row of 9.

Precedence is **archived → hidden → past → main**. Archived was previously handled
implicitly by `countsTowardUnread`/`isPastTeamChannel`; it is now an explicit first
`continue`, because "archived AND hidden" must not fall into `hiddenRows` and reappear
under "Hidden (n)". Test: `archived still beats hidden`.

## 4. The three club columns

Read **by name**, never by position (`ChatScreen.tsx:568-570`):

```ts
const clubId      = row.channel_club_id ?? null;
const clubName    = row.club_name ?? null;
const clubLogoUrl = row.club_logo_url ?? null;
```

The RPC went 20 → 23 columns; positional reads are exactly what breaks on the next
addition. Because `channel_club_id` is resolved server-side through the chat's team, it is
present for DMs and group chats too, which is what lets a chip filter them (ruling 2).

**Null logo = no crest, no placeholder** (ruling 1, explicit). `ClubCrest` returns `null`,
so a club that never uploaded a crest does not put an empty ring on every one of its rows.

**The open-chat header** could not use those columns: it is not the chat list and has no
RPC row in hand. It reads the same club through one nested embed added to a
`comm_channels` query the screen already made —
`teams(club_id, clubs(name, logo_url))`, `TeamChatRoomScreen.tsx:244-246` — which walks the
same team→club path the server does. No extra round trip. Typed via `ChannelClubRow`
rather than cast to `any`, so a change in the embed is a compile error.

**Chip rule (ruling 2).** "The user's clubs" = clubs where they have a team (`useUserTeams`)
**∪** clubs where they are staff/admin. The staffed half needed a new read because the
existing `checkClubAdmin` (`ChatScreen.tsx:728-767`) **returns at the first source that
answers** — it only ever yields one club, which is all the new-chat flow needs. A separate
effect (`:769-812`) collects the union from the same three sources (`club_staff`,
`user_roles.role='club_admin'`, `clubs.admin_id`); `checkClubAdmin` was left untouched
because rewriting its early returns would change behaviour the chip rule has no business
touching. A chat with **no** club shows under "All" and under no chip.

## 5. Ruling 7 — why there is no code change, only a comment

`get_channel_member_labels(p_channel_id)` is SECURITY DEFINER and **derives the scope
itself** — `useChatSenderLabels.ts:38-39` already says the `teamId` argument is kept "for
call-site compatibility but no longer used". There is no club parameter, and the client has
no club to pass: `channel_club_id` belongs to `get_my_conversations` (the list), while
labels are built inside an open chat where that row is not in hand. Its only other consumer
is `ChatInfoScreen.tsx:295`, which uses the rows as-is — no client-side filtering exists to
correct.

So 4g A is enforced **inside that function**, server-side. Inventing a `p_club_id` argument
would be the highest-blast-radius change available: every sender name and every
parent/child suffix in every chat comes through there, so an argument the function does not
accept blanks all of them at once. `lib/memberNames.ts:222-243` now records this, so the
next person looks in the right place. **If 4g A still needs client work, it needs the RPC's
real signature first — that is a server fact.**

## 6. Internal choices applied (not escalated)

1. **Swipe reveals buttons; it does not fling to commit.** The precedent at
   `NotificationsScreen.tsx:19-64` swipes to commit a delete, but a chat row carries *two*
   actions and a blind fling cannot choose between them. Same PanResponder mechanics,
   latching open at half-travel, one row open at a time. RNGH is **not** installed and was
   not added.
2. **`last_message_sender_name` is read optionally.** Ruling 3 wants the sender's name on a
   group preview, but none of the 23 columns carries one. It is read by name and the prefix
   renders only when present, so the line is a bare preview today and starts naming senders
   the moment the server adds the column — no client change needed, and nothing invented.
3. **A hidden chat with no messages stays hidden.** SQL answers `NULL <= x` with NULL, i.e.
   "not hidden", which would bounce a freshly-hidden empty chat straight back into the list.
   "No message since I hid it" is the honest reading. Same for an unparseable timestamp.

Two tidy-ups were forced by the lint gate, both no-ops in behaviour: `styles.mutedIcon`
was removed (the mute icon moved to line 3, leaving the style unused, which
`react-native/no-unused-styles` would have flagged as a NEW warning), and
`styles.unreadBadge` lost a `marginBottom` that only made sense while the badge was stacked
in the right rail.

## 7. Click-through owed (device or simulator) — 5 sentences

1. As a **parent in two clubs**, open Chat → Recent: club chips must appear above the list,
   each row's avatar must carry its club crest (and rows whose club has no logo must show
   **no** ring at all), and tapping a chip must leave only that club's chats.
2. As **any member**, swipe a **DM** left: **Mute and Hide**; swipe a **team chat** left: it
   must still slide but reveal **Mute only**; the **Past** tab must not swipe at all.
3. Tap **Hide** on a DM with unread: it must leave the list, the **Chat tab badge must drop
   by exactly that chat's unread**, and a "Hidden (1)" row must appear at the bottom of
   Recent — tap it to expand, then swipe that row to **Unhide** and watch it return.
4. Have someone **send a new message to a hidden chat**: it must come back into Recent by
   itself with its **unread still showing** and nothing marked read.
5. Open a team chat: the **club crest and club name** must show in the header beside the
   team name, and a muted chat must still show its number in the tab badge.

**Watch for one thing in particular:** the first Hide proves the RPC argument names. See §8.

## 8. What web parity needs / FOUND

- **UNVERIFIED — the `set_channel_hidden` argument names.** This calls
  `{ p_channel_id, p_hidden }`. `p_channel_id` is this codebase's universal convention and
  matches the closest sibling, `set_channel_announcement_mode(p_channel_id, p_enabled)`
  (`lib/announcementChannel.ts:210-213`), whose second argument is named for the thing being
  set. The brief gave the signature as `set_channel_hidden(channel_id, boolean)` without
  naming the flag, and prod could not be queried (FORBIDDEN). If the server named it
  otherwise, **the first Hide fails loudly and visibly** — it cannot fail silently or write
  the wrong row — and `lib/hiddenChats.ts:114-117` is the only line to change.
- **Web parity, in web terms (not verified — this repo has no access to that tree):** web
  needs the same H7 predicate wherever it classifies conversations (its counterpart to
  `utils/unreadRule.ts`), a `Show hidden` affordance equivalent to "Hidden (n)", and the
  same `canHideChannelType` restriction so neither client offers Hide on a team/club/default
  chat. The hide write itself is already shared — it is the one RPC.
- **`react-native/no-unused-styles` flags ~45 pre-existing unused styles in `ChatScreen`**
  and ~19 in `TeamChatRoomScreen`, all in the baseline and all untouched here. Worth its own
  cleanup slice; they make the lint output hard to read.
- **No `lint` or `test` script exists**, and eslint 9 needs `ESLINT_USE_FLAT_CONFIG=false`
  against the legacy `.eslintrc.json` (the flag is removed in eslint 10). Already reported
  2026-10-18; unchanged.

---

## 9. Click-through fixes, Lu's simulator pass 2026-10-20 (PART A)

Five defects from the §7 click-through, all inside `ChatScreen.tsx`. `TeamChatRoomScreen`
was **not** touched: `ClubCrest` is local to `ChatScreen` (grep — 2 hits, both in that
file), so the open-chat header shares no crest component with the card.

| # | Defect seen | Cause | Fix |
|---|---|---|---|
| 1 | Soccer ball / initials showing behind the crest | the crest was only ever an 18px corner ring over `renderBadge()` | the crest now **fills the 40px circle** (`resizeMode="cover"`), and `renderBadge()` is not rendered at all when one exists |
| 2 | Grey/purple slivers at the right edge of cards **at rest** | the action strip was mounted always, `position:absolute right:0 bottom:0`, behind a card with `marginHorizontal:12 / marginBottom:10` — it painted those gutters | strip **mounted only while the row is open or dragging**, and inset to `right:12 / bottom:10 / borderRadius:12` so it cannot reach a gutter even while open |
| 3 | Tap-and-hold revealed "Mute" over the card | same root as 2 — `conversationCard`'s `activeOpacity={0.7}` made the card translucent and the always-mounted strip read straight through it. The PanResponder never claimed the hold (`onMoveShouldSetPanResponder` needs 8px of `dx`), so nothing moved; it was **see-through, not open** | fixed by 2: with nothing mounted behind a closed row there is nothing to show through |
| 4 | Rows stayed open | only one close path existed (another row opening), and it mis-fired — see below | 4 external triggers + a self-close timer |
| 5 | Bare member number on line 1; "2 members" / channel name where the preview belongs | line 1 rendered `memberCount` as a raw integer next to the time; line 2 fell back to `cardMeta` | line 1 = **title + time only** (always the time, `getTimeAgo` returns `''` with no messages); line 2 = preview or **"No messages yet"**; line 3 = badge · mute icon · **"2 members"** · club name |

### 9.1 The snap-back logic (fix 4)

`openSwipeKey` is the single source of truth, so **every** external trigger is one
`setOpenSwipeKey(null)` and lands in the same effect:

```tsx
useEffect(() => {
  if (isOpen) {
    setRevealed(true);
    armCloseTimer();          // closes itself SWIPE_AUTO_CLOSE_MS after the finger lifts
    return clearCloseTimer;
  }
  clearCloseTimer();
  settle(false);              // spring home, then UNMOUNT the strip
  return undefined;
}, [isOpen, settle, armCloseTimer, clearCloseTimer]);
```

The four triggers that clear it:

```tsx
// 1. another row touched (SwipeableChatRow's own container)
onTouchStart={() => { if (openKey && openKey !== rowKey) onOpen(null); }}
// 2. the list starts scrolling (Recent FlatList + By-Team SectionList)
onScrollBeginDrag={() => setOpenSwipeKey(null)}
// 3. a chat is opened
const handleConversationPress = (conversation) => { setOpenSwipeKey(null); /* navigate */ }
// 4. the screen regains focus
useFocusEffect(useCallback(() => { setOpenSwipeKey(null); refresh(); }, [refresh]));
```

"Never more than one open row" is structural: one key, and a row springs home whenever the
key is not its own.

### 9.2 Two judgement calls — SAY IF WRONG

1. **"Closes by itself when the finger lifts" is a 3.5s timer, not an instant close.**
   Closing the instant the finger lifts would make Mute/Hide untappable and undo ruling 4,
   so the row latches open at half-travel (unchanged) and then closes itself after
   `SWIPE_AUTO_CLOSE_MS = 3500`. A drag that never reaches half-travel still snaps back
   immediately on release. To get a pure latch instead, delete the two `armCloseTimer()`
   calls — one constant, one line each.
2. **A DM with the person's real photo keeps the photo; its crest stays the corner ring.**
   Fix 1 names "soccer ball / initials", both of them generated placeholders. A face is who
   the DM is with, so the crest does not cover it. Every other row — team, group, and a DM
   with no photo — gets the full-circle crest.

### 9.3 FOUND while fixing

- **Latent bug, now fixed:** the PanResponder was built in a `useRef` and read `isOpen`
  and `width` from the **first** render's closure, so they were permanently `false`/initial.
  Dragging an **already open** row therefore computed `base = 0` and jumped it shut. The
  handlers now read `isOpenRef` / `widthRef` / `rowKeyRef` / `onOpenRef`.
- **Two team channels of the same team now look identical in Recent until they have
  different last messages.** Line 2 was the only place the channel name appeared on a
  non-past card, and fix 5 replaced it with the preview; with no messages both read
  "No messages yet". Line 1 shows the TEAM name (`cardTitle = row.team_name || …`). The Past
  tab is unaffected — its line 2 still carries `cardMeta · Past team`, which an earlier pass
  put there for exactly this reason. **Not changed** — fix 5 is explicit about what line 2
  may hold.
- `styles.conversationSubtitle` lost its only call site with fix 5 and was deleted, or
  `react-native/no-unused-styles` would have logged a NEW warning. The 91-warning set is
  otherwise byte-identical to baseline.

---

## 10. PART B — Polls flow recon, 2026-10-20 (READ-ONLY, no code changed)

**(a) Entry points to `ChannelPollsScreen` — exactly one.**
`ChatInfoScreen.tsx:909` — the "Polls" quick tile, with a live count from
`comm_polls` (`:202-219`). It is **ungated**: every member sees it. Chat Info itself is
reached only from the ⋯ header button in `TeamChatRoomScreen.tsx:850` and
`DMChatScreen.tsx:583`. There is **no** polls entry on the chat header itself and **no** ⋯
message-level menu route. `AppNavigator.tsx:551` registers the route; nothing else
navigates to it.

**(b) Closed polls ARE listed there.** `ChannelPollsScreen.tsx:188-189` derives
`status = p.is_active && !isExpired ? 'active' : 'closed'`, so an expired poll counts as
closed without a server write. Filter tabs **All / Active (n) / Closed (n)** at `:771-800`,
default **All** (`:54`). A closed row keeps the full card and shows a grey "Closed" badge
(`:515-525`), its option buttons are rendered disabled and non-tappable (`:622-626`), and
the creator — **not** staff — gets a "Delete Poll" button (`:715`).

**(c) create → vote → close → "Poll closed" → PollDetail.**
- **create — not reachable from the polls screen at all.** `ChannelPollsScreen` has no
  create button and never mounts `CreatePollModal` (grep: zero hits). The only way in is
  the composer's poll button, `TeamChatRoomScreen.tsx:915` → `CreatePollModal` `:929`,
  gated by `canUserCreatePoll` (`:626-632`): in a team/club chat **channel staff only**
  (ruling I5 A, via the server's `is_channel_staff`); group chats, any member.
- **vote** — works for any member in both places: the in-chat card
  (`PollCard.tsx:626`, handler `:363`) and the polls screen
  (`ChannelPollsScreen.tsx:624`, handler `:234`).
- **close** — staff-or-creator, `canClose` from `usePoll`'s `is_channel_staff`
  (`PollCard.tsx:309-319`, buttons `:567` board-room arm and `:684` regular arm;
  polls screen `:369-406`).
- **"Poll closed"** — the Oct 16 ruling holds in both: one shared
  `POLL_CLOSED_MESSAGE = 'Poll closed'` (`lib/channelStaff.ts:53`) alerted at
  `PollCard.tsx:402` and `ChannelPollsScreen.tsx:406`, with the row flipped to its closed
  state locally before the refetch.
- **PollDetail** — reachable **only** from the in-chat card: "View Full Results →",
  `PollCard.tsx:726-729`, inside the compact card's expanded body, ungated.
  **MISSING: `ChannelPollsScreen` never navigates to `PollDetail`** (grep: zero
  `navigation.navigate` calls in the whole file). From the Polls list there is no way to
  reach a poll's detail — the list is the terminus.

**(d) What Chat Info shows today:** avatar/name (editable where allowed) · "Team Chat /
Group Chat / Channel • N members" (`:897-904`) · the quick-access row, which holds the
**Polls tile only** — Files and Links are deliberately hidden because their screens are
stubs, though both counts are still fetched (`:913-917`) · Notifications → Mute switch
(`:921-934`) · then members, add/remove/rename and Leave. So **yes, a "Polls" row exists**,
and it is the single entry point.

**BROKEN, worth a ruling:** a **DM** gets the Polls tile too (Chat Info is shared), but
`DMChatScreen` passes no `onPollPress` to `ChatInputBar` (`:666-676`) — so a DM can open an
always-empty Polls list it has no way to fill. `TeamChatRoomScreen`'s
`canUserCreatePoll` has a `channelType === 'dm'` arm that is dead code, since DMs route to
`DMChatScreen`.

---

## 11. Crest rule, Lu's follow-up 2026-10-20 — team and club chats ONLY

**This REVERSES §9.2 judgement call 2.** The crest is a CLUB's mark, so it belongs only on
a club's own chats. A DM is a person — their photo or their initials — and a group chat is
its people. Neither carries a crest anywhere: not filling the avatar circle, not as the
corner ring.

One predicate, two callers, so the card and the header cannot drift:

```ts
// src/lib/chatHelpers.ts — same shape as canHideChannelType in lib/hiddenChats.ts
const CRESTED_CHANNEL_TYPES = ['team', 'club', 'default'] as const;

export function showsClubCrest(channelType: string | null | undefined): boolean {
  if (!channelType) return false;
  return (CRESTED_CHANNEL_TYPES as readonly string[]).includes(channelType);
}
```

- **Card** — `ChatScreen.tsx:349-372`: `crestedType = displayType === 'team' && showsClubCrest(channel_type)`, and `crestUrl` is null unless that holds. `displayType === 'team'` is the belt: `toConversation` sets it only on the branch that is neither a DM nor a group chat.
- **Header** — `TeamChatRoomScreen.tsx:842`: `clubLogoUrl && showsClubCrest(rowChannelType)`. `rowChannelType` is read from the **ROW** (`channel_type` added to the select the screen already made, `:259`), because the route param arrives `undefined` on a push-opened room and `'direct'` from a DM. The club NAME on the subtitle line is untouched — the ruling named the crest.
- **`ClubCrest` is deleted**, with `styles.crestRing` and `styles.crestImage`: the gate left the corner ring with no case. It existed only for the DM-with-a-photo exception this rule removes.

**Why `'default'` is in the list.** The default TEAM chat must keep its crest, and neither
screen can prove whether the server gives it `channel_type` `'team'` or `'default'`
(`lib/hiddenChats.ts:27-33` names "team, club and default" as three kinds). A `'default'`
chat is never a DM or a group, so including it cannot put a crest where one is now barred —
the fail-safe direction for Lu's stated intent.

**Group chats that hang off a team were the live bug.** `channel_club_id` is resolved
server-side through the chat's team and is present for group chats too (§4), so any group
chat with a `team_id` was wearing its club's crest on the card, and in the header through
the `teams(club_id, clubs(...))` embed. Both are now closed.

---

## 12. Stage 3d — list smoothness (Lu's simulator pass as ludriv, 2026-10-21)

**Base:** `main` @ `2d564a6`. Three device-found items: P1/P3 layout-shifting spinners, P4
dim styling, A clear-on-open. **Status: BUILT, AGENT-ONLY** — tsc, eslint and an iOS
bundle export; nothing re-run on a simulator.

### P1/P3 — before and after: which component inserted the spinner

| # | Where | BEFORE — the component that inserted it | AFTER |
|---|---|---|---|
| P1 | Chat list, on **Mute/Unmute** (both call `refresh()`) | `ChatScreen.tsx` rendered `<View style={styles.refreshBar}>` as a **plain flow sibling** between the tab bar and the list, whenever `loading && hasRows && !refreshing`. `refreshBar` was `{ paddingVertical: 6, alignItems: 'center' }`, so the bar's height was inserted into the column and **every card moved down** for the length of the refetch, then back up. | The list area is wrapped in `<View style={styles.listArea}>` (`flex: 1`) and the indicator is `styles.refreshOverlay` — `position: 'absolute', top: 4, left: 0, right: 0, zIndex: 10` with `pointerEvents="none"` — **inside** that wrapper. It floats over the first card. Takes no layout space, so nothing moves. `ChatScreen.tsx:2571-2586`, styles `:2741-2756`. |
| P3 | Polls list, on **vote / close / delete / New Poll** (all end in `fetchPolls()`) | `ChannelPollsScreen.tsx` — `fetchPolls()` set `loading = true` and the `if (loading)` **early return** replaced the entire screen body with a header plus a centred `loadingContainer` spinner, then rebuilt the list. Not just a shift: the list vanished and came back. | `loading` now **blocks only the first load** — `if (loading && !hasLoadedOnce)`, with `hasLoadedOnce` set in `fetchPolls`' `finally`. A refetch keeps the rows exactly where they are and shows the same non-layout `refreshOverlay`, inside a `listArea` wrapper so it floats over the cards and not over the header. `ChannelPollsScreen.tsx:67-76, 149, 261-263, 801-803, 899-907`; styles `:992-1006`. |
| P3 | Poll **card** in a chat, on vote / remove vote / close | `hooks/usePolls.ts` — `fetchPoll()` set `loading = true` on **every** refetch, and `PollCard.tsx:295` renders `if (loading \|\| !poll)` as a small "Loading poll..." box: a full poll card collapsed to roughly a fifth of its height and expanded again a second later, shoving the chat. | `fetchPoll` flips `loading` only when no poll is in hand yet (`if (!pollRef.current)`), so after the first load the card stays on screen with the values it has until the new ones land. `pollRef` is kept in step with `poll` by one effect, because `fetchPoll`'s identity is depended on by an effect and a realtime subscription. `usePolls.ts:17, 24-27, 33-49`. **PollCard was not edited** — it is outside SCOPE and needed no change. |

**Pull-to-refresh is untouched** — `RefreshControl` keeps its own native indicator, and
`refreshing` is excluded from the overlay condition so the two never stack.

**`PollDetailScreen` needed no change and was not touched:** its `loadData` never sets
`loading` back to `true`, and the screen has no action that refetches (only Back and the
byOption/byVoter tab switch), so it has no layout-shifting refetch to fix.

### P4 — dim is keyed on the render site, never on the data

```tsx
// ConversationItem — one dim, two render sites, no data path to it
(pastTeam || dimmed) && styles.conversationCardDimmed     // ChatScreen.tsx:436
```

- `dimmed` is a new explicit prop (`:331`, `:347-359`), passed **only** by the
  "Hidden (n)" section (`:1780`). The Past tab keeps `pastTeam`, which also carries its
  clock icon and its "· Past team" line.
- Recent and By Team pass **neither** flag, so a main-list card cannot dim whatever
  `hidden_at` says. The invariant is now structural, not a convention.
- `styles.conversationCardPast` → `styles.conversationCardDimmed` (same `opacity: 0.6`),
  renamed because it is no longer only the Past tab's.

**FOUND — the dim Lu saw did not come from `hidden_at`.** At `2d564a6` there was no
`hidden_at`-keyed styling anywhere: `opacity: 0.6` appeared exactly once in
`ChatScreen.tsx` and only `pastTeam` applied it, and only the Past tab's FlatList passed
`pastTeam`. The H7 predicate is also sound — `isHiddenConversation`
(`utils/unreadRule.ts`) parses both timestamps to epoch ms and a strictly newer message
returns `false`, so a popped-back row does reach `mainRows`. The most likely thing seen is
a **Past-tab** card: a popped-back chat whose TEAM is retired is classified `pastRows`
(precedence archived → hidden → past → main) and renders dimmed there **by design** — the
telltale is the clock icon and "· Past team" on line 2. Either way the ruling is now
enforced where it belongs, and no badge/counting code was touched.

### A — clear-on-open: the exact RPC, verified not invented

**`set_channel_hidden(p_channel_id uuid, p_hidden boolean)`** — reached through the one
wrapper the app already has:

```ts
// src/lib/hiddenChats.ts:110-118  (unchanged)
export async function setChannelHidden(channelId: string, hidden: boolean) {
  const { error } = await supabase.rpc('set_channel_hidden', {
    p_channel_id: channelId,
    p_hidden: hidden,
  });
```

**Call site: `src/screens/ChatScreen.tsx:1824`**, inside `clearStaleHidden`
(`:1800-1846`), invoked from `handleConversationPress` at **`:1859`** — *after* the
`navigation.navigate` call, never awaited.

```tsx
const clearStaleHidden = useCallback((conversation: EnrichedConversation) => {
  if (!conversation.hiddenAt) return;
  void (async () => {
    const result = await setChannelHidden(conversation.id, false);
    if (result.status === 'error')   { logError(...); return; }
    if (result.status === 'refused') { logError(...); return; }
    refresh();
  })();
}, [refresh]);
```

- **Fire-and-forget**: started after the navigate, never awaited, so opening a chat cannot
  block on it or fail with it. Both non-ok outcomes are logged and nothing else — no Alert,
  unlike the swipe's `handleSetHidden`, because the user did not ask for this write.
- `hidden_at` is carried onto the card as `hiddenAt` (`get_my_conversations` column 20,
  read BY NAME, `ChatScreen.tsx:720-727`, in the shared `rowFields` spread, renamed from
  `clubFields`). It is there for this path ONLY and must never reach styling — that is what
  P4 makes structural.
- `refresh()` is the same refetch Mute triggers, which after P1 costs no layout shift.
- **Where the name was verified.** In code: `grep -rn "set_channel_hidden" src/` → exactly
  **one** call, `lib/hiddenChats.ts:114`, and zero direct `hidden_at` UPDATEs (the §2
  claim re-checked). In `supabase/`: **nothing to verify against** — this repo's
  `supabase/migrations/` contains exactly **one** file,
  `20250224000000_notify_lineup_published.sql`, and `grep -rn "set_channel_hidden\|hidden_at" supabase/`
  returns nothing. The schema lives outside this repo. The arg names are nonetheless no
  longer a guess: P4's own report ("channel member row still has `hidden_at` set") is
  evidence that Hide **wrote** through this exact call on the simulator, which the §8 note
  predicted would fail loudly and visibly if either name were wrong. **No new function and
  no new argument was introduced.**
- Scope note: the rule is applied to **any** row carrying `hidden_at`, which is the ruling
  as written. So tapping a row inside "Hidden (n)" also clears it — you opened the chat, so
  it stops being hidden, and the section's count follows.

### 12.1 Item A did not fire on device — Oct 21, trace and fix

**Device proof (Lu, simulator as ludriv):** chat "9c hide test",
`4328fca0-2df5-42d3-bc2f-25e81a642bed`, popped-back state
(`comm_channel_members.hidden_at = 2026-10-21 22:12:46`, later message); tapped from
Recent, waited, went back; `hidden_at` unchanged; **no Metro error at all**.

**ROOT CAUSE:** the clear was gated on `conversation.hiddenAt`, which the mapper built as
`row.hidden_at ?? null` (`ChatScreen.tsx:739` before the fix, now `:751`) — collapsing "the column did
not come back" into "not hidden" — so the one and only failure mode of item A was an early
`return` that writes nothing and prints nothing, which is exactly what was observed.

#### The full tap path — every link traced, all sound

| step | file:line | what |
|---|---|---|
| 1 | `ChatScreen.tsx:2658` | Recent `FlatList data={conversations}` |
| 2 | `ChatScreen.tsx:2661-2666` | each row wrapped in `SwipeableChatRow` |
| 3 | `ChatScreen.tsx:302-306` | the wrapper's `onStartShouldSetResponderCapture` returns **false** unless a row is open, so a plain tap is NOT consumed by the swipe wrapper |
| 4 | `ChatScreen.tsx:2667-2671` | `<ConversationItem onPress={() => handleConversationPress(item)} />` (`:2669`) — the press handler is `ConversationItem`'s own root `TouchableOpacity` (`:443-450`), not a Pressable and not the swipe wrapper |
| 5 | `ChatScreen.tsx:1915` | `handleConversationPress` navigates, then calls `clearStaleHidden(conversation)` on the next line |
| 6 | `ChatScreen.tsx:1865` | `setChannelHidden(conversation.id, false)` |
| — | `ChatScreen.tsx:1834-1851` | **the gate that swallowed it** |

`logError` is **not** the silent one: `utils/logError.ts:47-53` `console.warn`s on every
call, dev or prod, by design. So an RPC that ran and failed would have printed. Nothing
printed ⇒ the RPC never ran ⇒ the gate returned early ⇒ `hiddenAt` was falsy at tap time.

#### Where `hiddenAt` comes from, and what the server really returns

`hidden_at` → `get_my_conversations()` → `ChatUnreadContext` (one source, one call,
`:209`, rows passed through `classifyConversationRows` **by reference** — nothing is
rebuilt or stripped, `:219-220`, `:313-315`) → `toConversation` (`ChatScreen.tsx:751`) →
`rowFields` → the card.

**The RPC does return it** (web repo, read-only):
`thrive-and-score/supabase/migrations/20261019040000_stage3_club_cols.sql:99` —
`RETURNS TABLE(channel_id, name, channel_type, team_id, team_name, club_id,
is_direct_message, is_archived, is_muted, last_read_at, member_count,
last_message_content, last_message_at, last_message_user_id, unread_count, other_user_id,
other_user_name, other_user_avatar, team_status, **hidden_at**, channel_club_id, club_name,
club_logo_url)` — 23 columns, `hidden_at` 20th, selected as `mine.hidden_at` at `:138`
from `comm_channel_members m WHERE m.user_id = auth.uid()`. That is the newest migration
touching the function (nothing in `migrations/` sorts after `20261019040000`).

`set_channel_hidden(p_channel_id uuid, p_hidden boolean)` —
`20261018170000_phaseD_hide.sql:160-205`: name and both argument names match the client
exactly, and **unhiding is unconditional** (`IF p_hidden AND NOT is_channel_hideable(...)`
— the hideable check is only reached when hiding), ending in
`SET hidden_at = CASE WHEN p_hidden THEN now() ELSE NULL END`. So the call would have
cleared the row had it run. **No server change is needed and none was made.**

**Two things could still have made the value falsy at tap time, and the client could not
tell them apart — which is the defect:**

1. the deployed function is older than the migration file (prod's live body captured by Lu
   on 2026-10-18 was the **19-column** `stone_b2_s1` version, md5
   `4a7dac0891d9ed5ac1475387a04b871f`, 2420 chars, **no `hidden_at`** —
   `20261018170000_phaseD_hide.sql:42-53`), so the column would arrive as `undefined`; or
2. `hidden_at` is set on a **different member's** row than ludriv's — the RPC only ever
   returns the caller's own membership, so for ludriv it would legitimately be `null`.

#### The fix

- **Keep the three states.** `hiddenAt: string | null | undefined` (`:67-78`, the field at `:78`), and
  `ChatScreen.tsx:751` is now `const hiddenAt: string | null | undefined = row.hidden_at;`
  — no `?? null`. `undefined` = the column never arrived; `null` = the server says not
  hidden.
- **Fire on set OR unknown** (`:1845-1851`):
  `!!hiddenAt || (hiddenAt === undefined && canHideChannelType(channel_type))`. On a
  correctly migrated server this is identical to before; where the column is missing the
  clear still runs, and it is safe and idempotent — unhiding is always allowed and
  `SET hidden_at = NULL` on an already-null row writes the same value. Restricted to
  hideable kinds so a team or club chat never triggers a pointless write.
- **One dev-only log at the call site, on BOTH branches** — a tap that does nothing has to
  say so, or the next device pass is as blind as this one was:

```
[hide] clear-on-open <channelId> hiddenAt=<value> → rpc ok | rpc error <msg> | skipped (not hidden)
```

`ChatScreen.tsx:1855-1861` (skip) and `:1867-1881` (after the RPC), both inside
`if (__DEV__)`, both with an explicit `eslint-disable-next-line no-console` so the file's
warning set stays at its baseline (`no-console` is `warn` in `.eslintrc.json:28`).

**What the next tap will prove, with no DB query:** `hiddenAt=undefined` ⇒ cause 1, the
deployed RPC lacks the column (server work, out of scope — and Hidden (n) can never have
populated either, so every "hidden" chat has really just been sitting in the list);
`hiddenAt=null` ⇒ cause 2, the timestamp belongs to another member's row;
`hiddenAt=2026-10-21T22:12:46…` followed by `rpc ok` ⇒ it now works and the old build was
simply missing these lines. A quick discriminator in the meantime: if "Hidden (1)" has ever
appeared on device after a Hide, the column does arrive and cause 1 is out.

### 12.2 P5 — the open-chat header, one shape for every chat type

**Device finding (Lu, Oct 21):** on a GROUP chat the header was inverted — title "2
members", subtitle "9c hide test".

**Cause:** the `teamName` route param is whatever the LIST put on the card's second line.
`ChatScreen.handleConversationPress` passes `teamName: conversation.displaySubtitle`, and a
group chat's `displaySubtitle` is `` `${member_count} members` ``. The header's title read
`teamName || channelName`, so the member count won the title and the group's real name fell
to the subtitle. The param is therefore both the cause **and** the cure for line 2: the
count is already in hand, so no query was added. **No list or card code was touched.**

**BEFORE** — at `2d564a6`, `TeamChatRoomScreen.tsx:849` (title) and `:854-860` (subtitle):

```tsx
<Text style={styles.headerTitle} numberOfLines={1}>
  {teamName || channelName || 'Team Chat'}
</Text>
{teamName || clubName ? (
  <Text style={styles.headerSubtitle} numberOfLines={1}>
    {[clubName, teamName ? channelName || 'Team Chat' : null].filter(Boolean).join(' · ')}
  </Text>
) : null}
```

**AFTER** — two computed values at `TeamChatRoomScreen.tsx:259-271`, rendered at `:883`
and `:888-892`:

```tsx
const isGroupChat = rowChannelType ? rowChannelType === 'group_dm' : isGroupDm;
const headerTitleText = isGroupChat
  ? channelName || 'Group Chat'
  : teamName || channelName || 'Team Chat';
const headerSubtitleText = isGroupChat
  ? [clubName, teamName].filter(Boolean).join(' · ')   // teamName = "N members"
  : [clubName, teamName ? channelName || 'Team Chat' : null].filter(Boolean).join(' · ');
```

| chat type | line 1 (title) | line 2 (subtitle) | changed? |
|---|---|---|---|
| team chat | team name (`teamName`) | "\<Club\> · \<channel\>" | no — **exactly as today** |
| club chat | channel name (`teamName` is `''` → `channelName`) | "\<Club\>" | no — same expression |
| group chat | **GROUP NAME** (`channelName`) | **"\<Club\> · N members"** | **YES — this is P5** |
| DM | other person's display name | role label | no — `DMChatScreen` **not touched** |

- The kind is read from **`rowChannelType`** first — the channel row's own `channel_type`,
  read into state at `:189` and set at `:303-307` — and only then from the route param, which arrives
  `undefined` on a push-opened room. Same precedence the Oct 20 crest gate uses.
- The club name stays on a group's line 2 because the header **already** showed it there
  (a group chat hanging off a team resolves a club through the existing
  `teams(club_id, clubs(...))` embed); the ruling allows the prefix only on that condition,
  and nothing new is fetched for it.
- **DM header verified, not changed:** `DMChatScreen.tsx:511-513` titles with
  `otherDisplayName` = `full_name` → the resolved member name (`:499-502`), never an email,
  and its subtitle is `formatRoleLabel(otherPerson.role)` (`:572-577`) — context, not the
  name. Already the ruled shape.
- Only `headerTitleText`/`headerSubtitleText` were introduced; **no new props and no new
  state**.
