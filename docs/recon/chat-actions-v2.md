# Chat message actions v2 — recon (read-only pass)

Date: 2026-10-23 · Part 0 of the "Chat message actions v2" task (Lu's rulings R1-R6,
Oct 23 2026). Every claim is **PROVEN** (file:line, quoted or grep-verified) or
**INFERRED** (reasoning stated, no device/DB access in this session).

**Line numbers in §1-§4 are the BEFORE state** — this was a read-only pass taken before any
edit, and §5's build moved several of them. Where a line matters after the fact, the ledger
row cites the post-build number.

---

## 1. What renders what, today

| Thing | File | Notes |
|---|---|---|
| the message bubble | `src/components/chat/ChatBubble.tsx` (732 lines) | ONE shared bubble already. Owns the ☺+ trigger, the reply chip, attachments, link runs, the reaction badges |
| the ☺+ icon | `ChatBubble.tsx:359-365` | `styles.reactionTrigger`, Feather `smile` + a `+` Text. **`onPress={onLongPress}`** — PROVEN at `:362` |
| today's Actions sheet | `src/components/chat/MessageActionsModal.tsx` (267 lines) | RN `Modal`, `animationType="slide"`, rows: Copy · Edit · Delete · View Read History · Add Reaction · Reply. Header literal `Actions` (`:134`), coloured `#10B981` (`:252`) |
| the reaction picker | `src/components/chat/ReactionPicker.tsx` (111 lines) | RN `Modal`, `animationType="fade"`, centred. `REACTIONS = ['👍','❤️','😂','😮','😢','🎉','⚽']` — **7**, PROVEN `:10`. Also carries an optional **Reply** button (`:49-61`) |
| reaction details | `src/components/chat/ReactionDetailsModal.tsx` | who reacted; untouched by this task |
| the composer | `src/components/chat/ChatInputBar.tsx` (679 lines) | owns the send gate and the announcement banner |

### Every screen that mounts them — PROVEN, repo-wide grep

```
grep -rn "ChatBubble|MessageActionsModal|ReactionPicker|ChatInputBar" src --include='*.tsx'
```

**Exactly two screens render messages:**

1. **`src/screens/TeamChatRoomScreen.tsx`** (1259 lines) — team chats, **club chats and group
   chats all come through here**; `channel_type` is read off the row at `:285-289`
   (`rowChannelType`). Mounts `ChatBubble` `:773`, `ChatInputBar` `:956`, `ReactionPicker`
   `:997`, `ReactionDetailsModal` `:1013`, `MessageActionsModal` `:1020`.
   - `onLongPress={() => openActionsModal(item)}` (`:807`) → the Actions sheet.
   - Because the ☺+ is wired to the same `onLongPress` prop, **the ☺+ opens the Actions
     sheet on this screen today** — this is exactly what R1 removes. PROVEN by
     `ChatBubble.tsx:362` + `TeamChatRoomScreen.tsx:807`.
2. **`src/screens/DMChatScreen.tsx`** (919 lines) — 1-on-1 DMs. Mounts `ChatBubble` `:452`,
   `ReactionPicker` `:646`, `ChatInputBar` `:666`. **No `MessageActionsModal` at all.**
   - `onLongPress={() => openReactionPicker(item)}` (`:477`) → the picker, so on a DM the ☺+
     and a long-press already do the same thing.
   - Its `useMessages` destructure (`:153-159`) takes `messages, loading, sendMessage,
     toggleReaction, refetch` — **no `editMessage`**, no `soft_delete_message` call anywhere
     in the file, no `MessageReadHistory` navigate. So **Edit, Delete and Read History do not
     exist on a DM today** (R2's "if Edit exists today" → it does not, here).

**`src/screens/StaffMessageScreen.tsx` is NOT a message thread** — its FlatList renders
`visibleStaff` recipient checkboxes (`:445-450`). No bubble, no thread. Not a call site.

**So: 2 call sites, well under the ~8 that would have been a stop condition.**

---

## 2. Permissions — the client-side path EXISTS, named

Nothing new is needed and nothing was invented.

- **`allow_member_text`** — read off the channel row on the screen's own existing query:
  `TeamChatRoomScreen.tsx:280-284` select includes `allow_member_text`, then
  `setAllowMemberText(allowsMemberText(channelData))` (`:283`).
  `allowsMemberText` is **`src/lib/announcementChannel.ts:119-124`** — `!== false`, because
  the column is nullable DEFAULT true and the server reads it `IS NOT FALSE`.
- **"am I channel staff"** — **`isChannelStaff(channelId)`** in
  **`src/lib/channelStaff.ts:88-108`**, which is a `supabase.rpc('is_channel_staff', …)` —
  the server function is the definition (web migration
  `20261016180000_4d_close_poll.sql`). The screen holds the answer in `isStaffHere`
  (`TeamChatRoomScreen.tsx:192`, filled in the effect at `:322+`), `undefined` = not known
  yet = NOT staff.
- **The composed gate** — **`canSendText({ allowMemberText, isStaff })`**,
  `announcementChannel.ts:153-158`. Already consumed by the composer at
  `ChatInputBar.tsx:339`.
- The server side R5 refers to is the `msg_insert` policy on `comm_messages`
  (`20261017032300_phaseD_4b_staff_only_posting.sql` PART 2), which requires
  `channel_allows_member_text(channel) OR is_channel_staff(channel, auth.uid())`.
  Quoted from `announcementChannel.ts:10-20` — **INFERRED** at this distance, the migration
  lives in the web repo and was not read in this session.

**NOT used for this task, on purpose:** `isStaffInChannel` =
`labelKind.get(user.id) === 'staff'` (`TeamChatRoomScreen.tsx:231`) comes from
`get_channel_member_labels` and means "team staff anywhere in this chat's club". The file's
own comment (`:165-180`) says the two disagree about real people and that the send gate must
be the one the policy asks. R5 is a send-gate question, so it reads `isStaffHere`.

Today's notice copy is **`ANNOUNCEMENT_BANNER_MESSAGE`** = `"This is an announcement channel.
React with emoji to respond."` (`announcementChannel.ts:75-76`), rendered at
`ChatInputBar.tsx:339-348`. That string is declared **byte-identical with web on purpose**
(COMMS PARITY, the file's §2 note), which is why R5's two new sentences are added beside it
rather than overwriting it — see §5.

`channel_type` values in play: `'team' | 'club' | 'dm' | 'group_dm' | 'direct' | 'group' |
'broadcast'` (`src/types/index.ts:9`), plus `'default'` which `chatHelpers.ts:36` says the
server also gives a default TEAM chat.

---

## 3. Gesture library — there is none, and R3 must be hand-rolled

**PROVEN from `package.json`:**

- **`react-native-gesture-handler` is NOT a dependency.** Absent from `package.json`
  entirely. So `Swipeable` / `ReanimatedSwipeable` / `activeOffsetX` / `failOffsetY` /
  `rightThreshold` do not exist in this repo.
- `react-native-reanimated` `~4.1.1` IS installed (`package.json:43`) but no chat code uses
  it.
- `react-native` is `0.81.5` (`package.json:41`) → `Animated` + `PanResponder` from core.

Installing RNGH is a **dependency + native rebuild**, i.e. SACRED and forbidden here. R3 is
therefore built on the **Stage 3 pattern already proven in this app**, which is the pattern
the task says to reuse.

### The Stage 3 pattern, as built — `SwipeableChatRow`, `src/screens/ChatScreen.tsx:197-430`

The five load-bearing lines, PROVEN:

| Concern | Line | Code |
|---|---|---|
| claim early, on the CAPTURE phase | `:313-314` | `onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dx) > 4 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5` |
| bubble-phase fallback | `:317-318` | `Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy)` |
| **never give the gesture back** | `:332` | `onPanResponderTerminationRequest: () => false` — RN defaults this to `true` when absent (`PanResponder.js:550-553`), which is what let the FlatList steal the drag and caused both the snap-back and the vertical scroll |
| travel/velocity latch | `:174-175` | `SWIPE_LATCH_TRAVEL = 40`, `SWIPE_LATCH_VELOCITY = 0.3` |
| recover from an unasked terminate | `:366-369` | `settle(isOpenRef.current)` |

That is the axis lock R3 asks for: a vertical drag is never claimed, so the list keeps
scrolling; a horizontal drag is ours from the 4th pixel and cannot be taken back.
Precedent #2 in the app: `src/screens/NotificationsScreen.tsx:19-64` (swipe-to-delete).

**Difference for R3:** the chat-list row swipes LEFT to *reveal latched buttons*; a message
swipes RIGHT to *fire one action and spring back*. So no `openKey`, no shared
`dragActiveRef`, no mounted action strip — translate right, cross the threshold, call
`onReply`, spring to 0.

---

## 4. Haptics — NO

```
grep -rn "Haptics|haptic|expo-haptics" src   →  0 matches
```

`expo-haptics` is not in `package.json` either. R3 says "haptic only if the app already uses
one" → **no haptics**, and adding the package would be a forbidden dependency.

---

## 5. What the build does (decided from the above)

- **R1** — ChatBubble gets its own `onEmojiPress` prop; the ☺+ stops sharing `onLongPress`.
  Both screens point it straight at the reaction picker.
- **R2** — `MessageActionsModal.tsx` is rewritten in place as the ONE sheet, exported as
  `MessageActionsSheet`: quick row of **6** emoji + a "More" button on top, then
  Reply · Copy · Edit · Read History · Delete. The old "Add Reaction" row is gone (the emoji
  row replaced it). Tones: purple accent / grey (Read History) / red (Delete) = 3.
  The file keeps its old PATH because file renames/deletes were out of this task's scope.
- **R3** — a local `SwipeToReply` wrapper inside `ChatBubble.tsx`, built on the §3 pattern.
  `onSwipeReply` undefined ⇒ the responder is never claimed ⇒ swipe disabled (R5).
- **R4** — nothing is added to plain tap. The link `onPress` runs, the attachment
  `TouchableOpacity`s are untouched, and the swipe is only ever claimed after horizontal
  travel, so a tap cannot trigger it.
- **R5** — new shared `src/components/chat/LockedChannelNotice.tsx` owns all the
  locked-composer copy, including R5's two new sentences, and `ChatInputBar` renders it in
  place of the composer. `'club'` → "Only club admins can post here"; `'team'`/`'default'` →
  "Only team staff can post here"; **any other kind keeps today's
  `ANNOUNCEMENT_BANNER_MESSAGE`**, so web parity on that one string is not broken and a
  locked group chat does not start printing a sentence no ruling covers.
- **R6** — one bubble, one sheet, one notice, one picker; no per-screen copies.

## 6. Judgement calls Lu may want to overturn

1. **"View Read History" was KEPT in the sheet.** R2 enumerates "Reply · Copy (+ Edit …);
   keep any existing Delete, red" and does not name Read History — but it also does not say
   to drop it, and it is a shipped feature on team/club/group chats
   (`MessageActionsModal.tsx:163-177` → `MessageReadHistory` route). Removing it would be a
   product deletion nobody asked for, so it stays, in the grey tone.
2. **A locked group chat keeps the old announcement sentence** (see R5 above) — no ruling
   covers that kind.
3. **DMs get the sheet with Reply + Copy only** — Edit/Delete/Read History genuinely do not
   exist there today (§1).

---

# ROUND 2 — after Lu's device test (Oct 25, 2026)

Rulings R7–R12. Same labelling discipline: **PROVEN** (file:line) or **INFERRED**.
Round 1's §1–§6 are unchanged above; this section records what round 2 found and did.

## R9 — the reply quote: ROOT CAUSE FOUND, and it was the render

Lu: *"Today it renders 'Replying to…' with no content — find why (missing fields on insert?
on select? render?)"*. All three were checked. **It was the render.**

**The data was never missing — PROVEN at three points:**

- **insert** — `useMessages.ts:435-439` writes all three fields on every reply:
  `insertPayload.reply_to_id`, `.reply_to_content`, `.reply_to_sender`. The sender string is
  run through `chatPersonName` first (`:425`), so what is PERSISTED can never be an email.
- **select** — `useMessages.ts:121-127` is `select('*', …)`, so `reply_to_id`,
  `reply_to_content` and `reply_to_sender` arrive on every row. (`chat-stack-oct10.md:251`
  made the same point about `is_edited`.)
- **the gate** — both screens render the quote on
  `reply_to_id && (reply_to_content != null || reply_to_sender != null)` and fall back to
  `'(message)'`, so `content` handed to the bubble was never empty either.

**THE CAUSE — `ChatBubble.tsx`, the old `replyChip`.** The quote was ONE
`<Text numberOfLines={1}>` reading `Replying to <Name> · <content>`, inside a chip with
`alignSelf: 'stretch'` sitting in the CONTENT COLUMN. The style's own comment claimed the
column is "the row's 80%" and that the preview therefore "gets real room no matter how short
the message under it is". **That comment is wrong, and it is the bug.** `contentColumn` is
`maxWidth: '80%'` — a *maximum*, not a width — so the column **shrink-wraps to its widest
child**, which is the bubble. `styles.bubble.minWidth` is `80`. So on a short reply the chip
stretched to ~80pt, the literal words `Replying to ` plus the sender's name consumed that
single line on their own, and the preview — deliberately placed LAST so that it would be the
thing clipped — was clipped to nothing. What Lu saw as "no content" **was** the content: an
ellipsis.

**THE FIX, and why it is the root and not the symptom.** The quote moved INSIDE the bubble,
WhatsApp-exact: coloured left bar, the sender's name on its own line, the original on its own
line at `numberOfLines={2}` (R9's "first 2 lines"). Inside the bubble the quote is a **sizing
input** — the bubble grows to it (`styles.quote.minWidth: 160`) — instead of a passenger
starved by it, and name and content are on separate lines so neither can eat the other. The
words "Replying to" are gone entirely; the bar and the bold name say it, as they do in
WhatsApp. Widening the old chip would have been the symptom fix: it would still have been one
line, still label-first, and still at the mercy of whatever the bubble's width turned out to
be.

**Also fixed under R9's "never an email":** the ladder's RESULT now goes through
`chatPersonName` in both screens' `renderItem`. The WRITE path already did this (`:425`); the
READ path did not — so a row whose `reply_to_sender` was persisted before that guard existed,
or a `memberNames` hit whose `full_name` is an address, printed the address in the quote.

**Tap-to-jump.** `scrollToMessageId` already existed in both screens and already no-opped on
a miss. Round 2 adds the ~1 s flash (`highlighted` prop on the bubble, a `#FBBF24` ring, a
1000 ms timer the screen owns and clears on unmount) and closes two holes:
1. the bubble is handed **no `onReplyPress` at all** unless the original is in the loaded
   window — a memoised `loadedMessageIds` Set, so the quote block is not even pressable when
   there is nothing to jump to (R9's "do nothing");
2. **`onScrollToIndexFailed` added to both FlatLists.** `scrollToIndex` on a row the list has
   not measured **throws** without it or `getItemLayout`, and the quote-tap is the only
   caller — so R9's "no crash" needed this line, not just the index guard.

## R11 — the edited columns: the app ALREADY depends on them

**The honest answer, and it is not a clean YES.** No DB access is permitted in this task (no
psql, no supabase CLI) and **`comm_messages` has no migration in this repo** — the only `.sql`
file here is `supabase/migrations/20250224000000_notify_lineup_published.sql`, and the comms
migrations live in the web repo (round 1 §2 says the same). So the column cannot be PROVEN
from this machine.

**What IS proven: this app has been writing those two columns since before round 1.**

- `useMessages.editMessage` (`:542-586`) does
  `.update({ content, is_edited: true, edited_at })` on `comm_messages` — PROVEN `:569`.
- the realtime handler READS them back off the row — PROVEN `:315-316`.
- `src/types/index.ts:65,67` declare `is_edited: boolean` / `edited_at: string | null`.
- `ChatBubble.tsx:507` already renders the `(edited)` marker off `message.is_edited`.
- the actions sheet has been OFFERING Edit on the team screen through round 1.

So R11 is **BUILT**, on the reasoning that it introduces **no new column dependency** — the
live app already stands or falls on `is_edited`/`edited_at`, and if they were missing, Edit
would be failing on the team chat today. **That is the first owed device check** and it takes
ten seconds: edit a team message, look for `(edited)`.
**INFERRED, not proven: that the columns exist.** `chat-stack-oct10.md:251` left the same gap
open ("if the columns exist server-side — unverified here").

**What round 2 actually added for R11:** the DM screen had no edit path at all (round 1 §6
judgement call 3 recorded that as why the Edit row was omitted there). R11 rules edit for own
messages inside 5 minutes with **no DM carve-out**, so `DMChatScreen` now takes `editMessage`
from the hook, holds `editing` state, and passes `editing` / `onCancelEdit` / `onSaveEdit` to
`ChatInputBar` — which already owned the prefill, the "Editing message" strip and its ✕
(`ChatInputBar.tsx:360-375`); this screen simply never handed it a message. The sheet decides
whether to OFFER Edit, unchanged: own message, `Date.now() - created_at < 5 min`.

### SACRED FOLLOW-UP — the 5-minute window is client-side only

**The server does not enforce it, and nothing in this task changed that.** The window lives in
exactly one place: `EDIT_WINDOW_MS = 5 * 60 * 1000` in `MessageActionsModal.tsx`, which decides
whether the Edit row is *rendered*. The write is guarded by `.eq('user_id', user.id)`
(`useMessages.ts:572`) and by the RLS UPDATE policy, which per that file's own comment is
**author-only and carries no time bound** — so an author editing a six-month-old message is
refused by nothing but a hidden button. Raising it to the server is a **policy change =
SACRED** and needs Lu: either a `WITH CHECK (now() - created_at < interval '5 minutes')` arm
on the UPDATE policy or a SECURITY DEFINER `edit_message(id, content)` door, matching the
`close_poll` / `set_channel_announcement_mode` shape this codebase already uses twice. Both
also need the web app's copy of the gate. **Not attempted here.**

## R7 / R8 / R10 — what moved

- **R7** the sheet's quick row and its "More" button are gone, with the `onReact` and
  `onMoreReactions` props. The sheet is Reply · Copy · Edit · View Read History · Delete.
  `openReactionPickerFromActions` went with them — the sheet now has **no path into the
  picker at all**; the ☺+ icon is the whole reaction path. There is exactly ONE quick emoji
  row left in the app.
- **R8** the popover's **Reply** button is gone (and `startReply` in both screens with it —
  the two remaining quote triggers, the sheet's row and R3's swipe, both call `beginReply`
  directly). The popover opens on the quick six plus a `+`, and the `+` **expands it in
  place** to the full grid — one Modal, two modes, because a second modal stacked on the first
  is the menu-in-between R1 and R8 both exist to delete. `FULL_REACTIONS` is now **30 emoji**:
  before round 2 the "full" list was 7 and the quick row was 6 of them, so a "+" would have
  revealed exactly one more. Data only — no picker library, no dependency.
- **R10** `Alert.alert('Copied', 'Message copied to clipboard')` is gone (**0 hits** for that
  string). **Nothing existed to reuse:** `grep -rln "Toast|toast|Snackbar" src` finds four
  files and every one is a private copy inside a screen —
  `ProductDetailScreen.tsx:193-197` (2000 ms), `WorldCupPredictorScreen.tsx:445-447`
  (2500 ms), `PendingAttachmentsBanner.tsx:147-151`, plus a comment at
  `EventDetailScreen.tsx:1101`. No shared component, no provider, nothing exported. So
  `src/components/chat/ChatToast.tsx` is the fifth hand-rolled one, deliberately scoped to
  chat because promoting it app-wide means touching three screens outside this task's SCOPE.
  **The hook and the view are split on purpose:** Copy happens inside an RN `Modal`, so a
  toast rendered there would die on the same tap that copies — the SCREEN owns the state and
  renders it over the thread, and the sheet only reports via `onCopied`.

## R12 — VERIFY ONLY. Already correct; nothing changed.

- **"Starting a reply keeps the list where it is"** — `beginReply` in both screens calls
  `setReplyingTo` and nothing else. No `scrollToNewest`, no `scrollToIndex`, no
  `isAtBottomRef` write. PROVEN by the function bodies and by
  `grep -n "scrollToNewest|scrollToOffset|scrollToIndex"`: neither screen's reply path
  appears in the results.
- **"Sending (any message) scrolls to the bottom"** — both send paths already do it, inside
  `if (result.ok)`: `TeamChatRoomScreen.tsx:457-458` and `DMChatScreen.tsx:320-321`, each
  setting `isAtBottomRef.current = true` and then `scrollToNewest(true)`.
- An **edit** save deliberately does NOT scroll: R12 says *sending*, and an edit is a change
  to a row already on screen.

## Owed device checks (round 2) — nothing below is proven

1. **Edit a team message and look for `(edited)`.** This is the R11 column question above; if
   the marker never appears, `is_edited`/`edited_at` do not exist and R11 must be reverted.
2. **Edit on a DM** — new in round 2: own message, inside 5 min, sheet → composer prefills,
   "Editing message" strip with ✕, save, marker appears.
3. **The quote block** — a reply to a SHORT message and a reply to a LONG one: the name and
   the first 2 lines are both visible in each, in own (purple) and other (grey) bubbles.
4. **Tap the quote** — jumps to the original and it rings amber for ~1 s. Then reply to a
   message far up the thread, scroll back, tap: nothing happens, no crash.
5. **☺+** — quick six + `+`; `+` expands to the grid in place; **no Reply button anywhere in
   the popover**; picking from either mode reacts.
6. **Long-press** — Reply · Copy · Edit · Read History · Delete, **no emoji row**.
7. **Copy** — a "Copied" toast over the thread, ~1.5 s, no Alert to dismiss.
8. **R12** — start a reply from a message mid-thread and confirm the list does not jump; send
   and confirm it does.
