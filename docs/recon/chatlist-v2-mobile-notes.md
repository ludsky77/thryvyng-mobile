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
