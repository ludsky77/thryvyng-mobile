# Polls end-to-end from the Polls list + Messenger-style swipe — mobile build notes

**Date:** 2026-10-20 · **Repo:** `thryvyng-mobile` · **Base:** `main` @ `597ce05`
**Brief:** two ROUTINE items, A1–A4 (polls + card title) and B5 (swipe), smallest change,
no new deps, no server change.
**Status: AGENT-ONLY.** tsc, eslint and an iOS bundle export. Nothing was run on a device
or simulator — the click-through in §6 is owed.

Source for PART A's shape: `docs/recon/chatlist-v2-mobile-notes.md` §10, the Oct 20 polls
recon. Every gap it named is closed here except the two it listed as server/ruling work.

---

## 1. A1 — every poll row opens PollDetail, active or closed

`ChannelPollsScreen.tsx:594-607`. A "View Full Results →" link on each row, **outside** the
header `TouchableOpacity`:

```tsx
<TouchableOpacity
  style={styles.detailsLink}
  onPress={() => navigation.navigate('PollDetail', { pollId: item.id })}
  activeOpacity={0.7}
>
  <Text style={styles.detailsLinkText}>View Full Results →</Text>
</TouchableOpacity>
```

**Why a link and not the row's own tap.** The row's header tap already means
expand/collapse, and expanding is how you **vote** from this screen
(`:624 handleVote`). Stealing that tap for navigation would have removed voting from the
Polls list — a regression traded for a feature. The link is on every row, collapsed or
expanded, active or closed, so the list is one tap from PollDetail either way. The wording
is copied from the in-chat card (`PollCard.tsx:726-729`) so both routes into PollDetail
read the same.

**Navigation typing, no `any`:** `RootStackParamList` (`navigation/linking.ts:16`) is the
**deep-link** list and does not carry the chat stack, so there was nothing app-wide to
borrow. The file's siblings use `useNavigation<any>()` (`PollCard.tsx:222`,
`ChatInfoScreen.tsx:106`), which would have added a `no-explicit-any` warning this file
does not have. A one-route local type instead (`:50-58`):
`type PollsNavigation = NavigationProp<{ PollDetail: { pollId: string } }>`.

## 2. A2 — "New Poll" on the Polls list, behind the composer's own gate

Before this, the only way to start a poll was the chat composer, so the Polls screen could
be opened, read and left with no way to add to it.

- Button: `ChannelPollsScreen.tsx:866-882`, under the filter tabs, rendered only when the
  gate opens.
- Modal: the **existing** `CreatePollModal`, same props the composer passes, `:903-910`;
  `onSuccess` re-runs `fetchPolls()`.
- Gate, `:498-512` — the composer's rule restated, not a new one:

```ts
const canUserCreatePoll =
  channelType === 'group_dm' || channelType === 'dm'
    ? true
    : channelType !== null && isChannelStaffHere;
```

`isChannelStaffHere` is the server's `is_channel_staff` (fetched at `:122`), which is the
same answer `TeamChatRoomScreen.canUserCreatePoll` uses (ruling **I5 A**, Lu 2026-10-18).
So the Polls list cannot offer a button the chat withholds, or withhold one the chat
offers. `channelType` comes from the channel read the screen **already made** — one extra
column (`team_id, channel_type`, `:103`), no new query. It is `null` until that read
lands, and null **closes** the gate: "not answered yet" must never open it.

## 3. A3 — no Polls tile on a DM

`ChatInfoScreen.tsx:908-934`. The whole `quickAccessRow` is skipped on a DM, not just the
tile: Files and Links are already hidden, so a DM would have been left with an empty bar.

Gated on `channel?.is_direct_message === true` — identified by the **ROW**, the same test
lines 421 / 465 / 488 of that file already use. The route param could not carry this: it
arrives as `'direct'` from a DM and **undefined** on a push-opened room (the file says so
at `:223-226`).

Why it had to go: a DM cannot create a poll at all — `DMChatScreen` passes no
`onPollPress` to `ChatInputBar` (`:666-676`) — so the tile could only ever open an
always-empty list with no way to fill it.

## 4. A4 — "Team name · channel name" for a team's extra channels

`ChatScreen.tsx:775-790`:

```ts
const isCustomChannel =
  row.is_default === false || customChannelIds.has(row.channel_id);
const cardTitle =
  teamLabel && isCustomChannel && channelLabel && channelLabel !== teamLabel
    ? `${teamLabel} · ${channelLabel}`
    : teamLabel || channelLabel || 'Team Chat';
```

This closes the FOUND from the Oct 20 card pass: with line 2 given over to the message
preview, two channels of one team rendered identically.

**A default channel is identified by the ROW, never by its name.** That is this repo's
existing ruling, stated at `lib/channelLeave.ts:110-122`: *"default channels have been
renamed before (the default team chat went from 'announcements' to 'Team Chat')"*. So no
`name === 'Team Chat'` test was written, even though the client's own fallbacks make it
tempting.

**Where `is_default` comes from.** `get_my_conversations` is **not known** to return it —
the 23-column list in §4 of the chat-list notes does not include it, and prod cannot be
queried from here (FORBIDDEN). So:

1. `row.is_default === false` is honoured first, free, if the RPC does supply it;
2. otherwise one extra client read fills the set — `ChatScreen.tsx:834-866`,
   `select('id, is_default').in('id', ids)` over the team channels already on screen,
   keyed on a sorted id string so a refetch handing back new row objects does **not**
   re-run it.

The set holds **only** `is_default === false`. An unanswered or failed read therefore
leaves every title exactly as it was — the fail-safe direction. `comm_channels.is_default`
is already read this way for a single channel by `ChatInfoScreen.tsx:229`, which is the
proof that the select is permitted.

**UNVERIFIED:** whether the RPC carries `is_default`. If it does, arm 1 answers and the
extra read is redundant (harmless). If it does not, arm 2 is what makes A4 work, at the
cost of one query per change of the channel-id set.

## 5. B5 — the swipe, as iPhone Messages does it

The 3.5s auto-close is **gone**: `SWIPE_AUTO_CLOSE_MS`, `armCloseTimer`, `clearCloseTimer`
and the `closeTimer` ref are all removed (grep: 0 hits). An open row now stays open.

### 5.1 The outside tap, captured and consumed

```tsx
// SwipeableChatRow -- the card half
const consumeOutsideTap = () => {
  if (!openKey) return false;   // nothing open: ordinary tap and ordinary swipe
  onOpen(null);                 // close the open row
  return true;                  // CONSUME: the card's TouchableOpacity never sees it
};

<Animated.View style={{ transform: [{ translateX }] }} {...panResponder.panHandlers}>
  <View onStartShouldSetResponderCapture={consumeOutsideTap}>{children}</View>
</Animated.View>
```

```tsx
// ChatScreen -- the chrome half (header, tab bar, club chips, "Hidden (n)" header)
const consumeChromeTap = () => {
  if (!openSwipeKey) return false;
  setOpenSwipeKey(null);
  return true;
};
```

**Two things make this work, and both are deliberate.**

1. **Capture phase.** `onStartShouldSetResponderCapture` is asked *before* the descendants,
   so returning `true` means the card's `TouchableOpacity` never fires — that is what
   "consumed" means here. A bubbling `onTouchStart` (what the Oct 20 pass used) closes the
   row but lets the tap through, so it also opened the chat.
2. **The wrapper is INSIDE the dragged `Animated.View`, not on it.** Claiming the touch on
   the Animated.View itself would hand it to that view's PanResponder, firing
   `onPanResponderGrant` → `setRevealed(true)` and flashing *this* row's action strip for a
   frame. The strip is a **sibling** of the dragged view, so it is never under the capture
   handler and its buttons stay live — which is the "outside its action buttons" half of
   the rule.

### 5.2 All four close paths, one key

`openSwipeKey` stays the single source of truth, so every path is one
`setOpenSwipeKey(null)` landing in one effect (`ChatScreen.tsx:233-239`):

| path | where |
|---|---|
| next tap outside the action buttons, **consumed** | `consumeOutsideTap` :289-293 (cards) · `consumeChromeTap` :625-629 (header, tabs, chips, Hidden header) |
| list scroll | `onScrollBeginDrag` on the Recent FlatList and the By-Team SectionList |
| chat opened | `handleConversationPress` |
| returning to the list | `useFocusEffect` |

```tsx
useEffect(() => {
  if (isOpen) { setRevealed(true); return; }
  settle(false);          // spring home, then UNMOUNT the strip on finish
}, [isOpen, settle]);
```

"Only one row open" is structural: one key, and a row springs home whenever the key is not
its own. No flicker, because the strip is mounted only while a row is open or dragging; no
stuck rows, because every exit from the screen clears the key.

### 5.3 The one behavioural nuance — SAY IF WRONG

**While a row is open, a swipe on another row acts as the closing tap**: the capture
decision is made at touch-DOWN, where a tap and a drag are not yet distinguishable. So the
first gesture closes the open row and the second swipes the new one. iPhone Messages lets
that first gesture do both. Letting the drag through would mean not consuming the touch,
which is the thing item 5 asks for, so the brief's rule won. One line to revert
(`consumeOutsideTap` → return `false` and close in `onTouchStart` instead), at the cost of
taps falling through to the chat again.

## 6. Click-through owed (simulator or device) — 5 sentences

1. **Swipe:** swipe a DM left in Recent — the row stays open with Mute and Hide showing,
   indefinitely, with no grey or purple visible on any other row.
2. **Outside tap:** with that row open, tap another card — the open row must spring shut and
   **no chat may open**; repeat with a tap on the "Conversations" header and on the Recent /
   By Team / Past tabs (the tab must **not** switch), then scroll the list and watch it
   close.
3. **Polls as staff in ZZ Test Team 0826:** open the team chat → ⋯ → Polls, tap **New
   Poll**, create one, and confirm the new poll appears in the list without a manual
   refresh.
4. **Vote → close → details:** tap that poll's row header to expand, vote, then **Close
   Poll** — a short "Poll closed" alert must appear and the row must flip to its grey
   **Closed** badge — then tap **View Full Results →** on both an active and a closed row
   and confirm PollDetail opens for each.
5. **Negatives and titles:** open a **DM** → ⋯ and confirm there is **no Polls tile**; as a
   non-staff member of a team chat confirm **no New Poll button**; and in Recent confirm a
   team's extra channel reads "ZZ Test Team 0826 · <channel>" while the team's default chat
   still reads the team name alone.

## 7. FOUND / still open

- **Still missing, server-or-ruling work, not built:** nothing in this slice gives a DM a
  poll. The Polls tile is hidden there instead. Giving DMs polls means wiring
  `onPollPress` into `DMChatScreen` — a product decision, not a fix.
- `TeamChatRoomScreen.canUserCreatePoll` has a `channelType === 'dm'` arm that is **dead
  code**: DMs route to `DMChatScreen`, which never mounts that composer. Left alone; it is
  outside this slice's SCOPE.
- The new `is_default` read is a **round trip the list did not make before**. If
  `get_my_conversations` turns out to return `is_default`, delete the effect at
  `ChatScreen.tsx:834-866` and arm 1 keeps A4 working on its own.
- `react-native/no-unused-styles` still reports ~45 pre-existing unused styles in
  `ChatScreen` and 25 warnings + **1 pre-existing error** in `ChannelPollsScreen`
  (unchanged by this slice; the error is in the baseline). Still worth its own cleanup.
