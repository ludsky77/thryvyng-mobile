# Feature ledger — thryvyng-mobile

**What this is.** The record of what this app has and *how we know it works*. Read it
before planning any phase. Never plan as new what this file shows as already built.

**Base:** HEAD `22a8b3d` · seeded 2026-10-14, updated 2026-10-15 after Lu's simulator
click-through and prod SQL probes · docs-only, nothing in `src/` read-modified.

**How to read `Status`.** Status is the strength of the *test record*, never a claim that
a feature is good. It is deliberately decoupled from release: a row can be `UNVERIFIED`
and still be in users' hands — the `Verified how` cell then says `in stores <version>`.

| Status | Means |
|---|---|
| `VERIFIED-DEVICE` | a human ran it on a physical device and the result is recorded |
| `VERIFIED-SIMULATOR` | a human ran it on the iOS simulator and the result is recorded |
| `VERIFIED-SQL` | a query against **prod** confirmed the stored result, and the query is recorded |
| `AGENT-ONLY` | typecheck / unit or logic smoke / static proof only — never run on device or simulator |
| `UNVERIFIED` | no test record of any kind in this repo |

`VERIFIED-SQL` was added 2026-10-15. It is not ranked against the two human-run values: it
proves what the **database** holds, which a click-through cannot, and says nothing about
what the UI showed. A row can deserve both; where it does, the stronger evidence is named
in `Verified how`.

`Date` is when the feature **landed** (commit date); the date it was *verified* is in `Verified how`.

**Sources.** Every row cites one: a file in `docs/recon/`, a commit message (`git log`), or
`handoff Oct 13` = facts relayed from the planning chat on 2026-10-13, or `sim run Oct 14` =
Lu's click-through on the **iPhone 17 Pro simulator** against live Metro at HEAD `66f7dea`,
2026-10-14, or `Lu sim Oct 14–15` = the same simulator carried across both days against the
uncommitted Chat-Info tree, or a **prod SQL probe** quoted with its channel id. Anything
unsourced was omitted rather than guessed. `INFERRED` marks reasoning, not proof.

**Coverage.** Rows start at the 2026-09-01 chat core batch. Earlier history
(registration/auth rewrites P1a–P2c, join flows, captcha, versions 1.0.12–1.0.15) is
**not backfilled** — it is in `git log`, not here.

---

## Shipped features

| Feature | Commit | Verified how | Date | Status |
|---|---|---|---|---|
| **Chat message actions v2 — WhatsApp-style, every message screen (R1-R12, two rounds)** — six rulings (Lu, 2026-10-23), recon first in `docs/recon/chat-actions-v2.md`. **Call sites: exactly TWO** — `TeamChatRoomScreen.tsx` (team, **club** and group chats all come through it) and `DMChatScreen.tsx`; `StaffMessageScreen.tsx` is a recipient picker, not a thread. **R1** the ☺+ icon opens the emoji picker DIRECTLY: `ChatBubble` gained its own `onEmojiPress` prop and the icon's `onPress={onLongPress}` is gone (`ChatBubble.tsx:505`) — that one shared handler is why tapping ☺+ opened the *Actions sheet* on a team/club/group chat and a reaction cost two taps through a menu. **R2** `MessageActionsModal.tsx` rewritten in place as **`MessageActionsSheet`** — quick row of **6 emoji** (`QUICK_REACTIONS = REACTIONS.slice(0,6)`, exported from `ReactionPicker.tsx` so the sheet and the picker cannot drift) + a **More** button, then Reply · Copy · Edit (own, 5-min window, unchanged) · View Read History · Delete. The **"Add Reaction" row is gone** (the quick row is its job) and so is the `Actions` header and its green. **Three tones, R2's ceiling:** purple `#8B5CF6` / grey `#9CA3AF` (Read History only) / red `#EF4444` (Delete only). **R3** swipe-right on the bubble = Reply, via a local `SwipeToReply` in `ChatBubble.tsx` — **PanResponder, not RNGH: `react-native-gesture-handler` is still NOT installed** (absent from `package.json`), so this reuses the Stage 3 pattern verbatim — capture-phase claim `g.dx > 4 && \|dx\| > \|dy\| * 1.5`, bubble-phase fallback `> 8`, and **`onPanResponderTerminationRequest: () => false`** (RN defaults it TRUE when absent, `PanResponder.js:550-553`, which is what let the FlatList steal a swipe mid-gesture in Stage 3). Rightward only, clamped to 72px, fires at 44px travel or `vx > 0.3`, then always springs back — a message latches nothing. **NO HAPTIC:** R3 said "only if the app already uses one" and `grep -rn "Haptics\|haptic" src` returns **0** with `expo-haptics` absent from `package.json`, so the condition is not met and adding it would be a dependency change. **R4** nothing added to plain tap — the responder is only claimed AFTER horizontal travel, so taps, long-press and the link/attachment handlers inside the bubble are untouched. **R5** new shared **`src/components/chat/LockedChannelNotice.tsx`** owns the copy: `channel_type 'club'` → **"Only club admins can post here"**, `'team'`/`'default'` → **"Only team staff can post here"**, declared once each and nowhere else; `ChatInputBar` renders it in place of the composer and its own duplicated banner + 2 styles are deleted. The **GATE is unchanged** — `canSendText({ allowMemberText, isStaff })` from `lib/announcementChannel.ts`, over `allowsMemberText(row)` and **`isStaffHere` = the server's `is_channel_staff` RPC** (`lib/channelStaff.ts`), *not* `isStaffInChannel` (the label RPC's "team staff anywhere in this club"), because replying is a send and the send gate must be the one `msg_insert` asks. The same `canReplyHere` hides Reply from the sheet, hides it from the picker, and passes `onSwipeReply={undefined}` so the gesture is never claimed; **reactions stay available in all three**. **R6** one bubble, one sheet, one notice, one picker; the two screens' duplicated reply-quote bodies collapsed into one `beginReply(message)` each, so R3's third trigger could not add a third quote-resolution order. **JUDGEMENT CALLS NEEDING LU:** (1) **"View Read History" was KEPT** in the sheet — R2 lists "Reply · Copy (+ Edit); keep any existing Delete" and does not name it, but it is shipped with a real `MessageReadHistory` route and dropping it would be a product deletion nobody asked for; it is the grey tone. (2) **A locked GROUP chat keeps today's sentence** (`ANNOUNCEMENT_BANNER_MESSAGE`, declared byte-identical with web for COMMS PARITY) — R5 named the club and team cases only, and overwriting that string would have broken web parity for a kind no ruling covers. (3) **DMs get the sheet with emoji + Reply + Copy only** — Edit, Delete and Read History genuinely do not exist on a DM today (that screen's `useMessages` takes no `editMessage`, calls no `soft_delete_message`, has no read-history route), and R2 says to keep what exists, not to add what does not. **Nothing SACRED touched** — no schema, migration, RPC, policy, dependency, env, auth or file delete; `MessageActionsModal.tsx` **keeps its path** because renames/deletes were out of scope (the export is the honest name; rename it next time that file is opened). Recon, with PROVEN/INFERRED per claim: `docs/recon/chat-actions-v2.md` **ROUND 2 — Lu's device test, Oct 25 2026, rulings R7-R12.** **R9 ROOT CAUSE FOUND and it was the RENDER, not the data** — the quote was ONE `<Text numberOfLines={1}>` reading `Replying to <Name> · <content>` in a chip with `alignSelf: 'stretch'` sitting in the content column, and that style's own comment ("the column is the row's 80%, so the preview gets real room") **was wrong**: `contentColumn` is `maxWidth: '80%'`, a *maximum*, so the column **shrink-wraps to its widest child** = the bubble, whose `minWidth` is **80**. On a short reply the literal words `Replying to ` plus the sender's name consumed that single line and the preview — deliberately placed LAST so it would be what got clipped — was clipped to nothing. **What Lu saw as "no content" WAS the content: an ellipsis.** The data was never missing, proven at three points: the insert writes all three fields (`useMessages.ts:435-439`), the thread reads `select('*')` (`:121-127`), and the gate falls back to `'(message)'` so `content` was never even empty. **FIX = the root:** the quote moved **inside the bubble**, WhatsApp-exact — coloured left bar, sender's name on its own line, original at `numberOfLines={2}` (R9's "first 2 lines"), `styles.quote.minWidth: 160` so the **bubble grows to the quote** instead of starving it, and the words "Replying to" are gone entirely. Widening the chip would have been the symptom fix. **Also under R9's "never an email":** both screens' `renderItem` now run the name ladder's RESULT through `chatPersonName` — the WRITE path already did (`:425`), the READ path did not, so a pre-guard `reply_to_sender` or a `full_name` that is an address printed the address. **Tap-to-jump:** ~1 s amber ring via a new `highlighted` prop + a screen-owned 1000 ms timer cleared on unmount; the bubble is handed **no `onReplyPress` at all** unless the original is in a memoised `loadedMessageIds` Set, so a quote with nothing to jump to is not pressable; and **`onScrollToIndexFailed` added to both FlatLists** — `scrollToIndex` on an unmeasured row **throws** without it, so R9's "no crash" needed that line, not just the index guard. **R7** the sheet's emoji row + "More" are gone with the `onReact`/`onMoreReactions` props and `openReactionPickerFromActions`; the sheet now has **no path into the picker at all** (the ☺+ icon is the whole reaction path) and **exactly one quick emoji row is left in the app**. **R8** the popover's **Reply** button is gone (and `startReply` in both screens with it — the sheet's row and R3's swipe both call `beginReply` directly); the popover opens on the quick six + a `+` that **expands in place** to the full grid — one Modal, two modes, because a second modal over the first is the menu-in-between R1 and R8 exist to delete; `FULL_REACTIONS` is now **30 emoji** (before round 2 "full" was 7 and quick was 6 of them, so a `+` would have revealed one extra). Data only, **no dependency**. **R10** `Alert.alert('Copied', 'Message copied to clipboard')` is gone and **nothing existed to reuse** — `grep -rln "Toast\|toast\|Snackbar" src` finds 4 files and every one is a private in-screen copy (`ProductDetailScreen.tsx:193-197` 2000 ms, `WorldCupPredictorScreen.tsx:445-447` 2500 ms, `PendingAttachmentsBanner.tsx:147-151`, a comment at `EventDetailScreen.tsx:1101`); no shared component, no provider, nothing exported. So **`src/components/chat/ChatToast.tsx`** (new) is the fifth, scoped to chat because promoting it means touching 3 screens outside SCOPE. Hook and view are **split on purpose**: Copy fires inside an RN `Modal`, so a toast rendered there dies on the same tap that copies — the SCREEN owns the state and renders it over the thread, the sheet only reports via `onCopied`. **R11 BUILT, and the column question is answered HONESTLY: it is INFERRED, not proven.** No DB access was permitted and **`comm_messages` has no migration in this repo** (the only `.sql` here is `20250224000000_notify_lineup_published.sql`; comms migrations live in the web repo), so the column cannot be proven from this machine. What IS proven is that **the app has been writing those two columns since before round 1** — `useMessages.editMessage` does `.update({ content, is_edited: true, edited_at })` (`:569`), the realtime handler reads them back (`:315-316`), `types/index.ts:65,67` declare them, `ChatBubble.tsx:507` already renders `(edited)`, and the sheet has been offering Edit on the team screen all along. So R11 adds **no new column dependency**: if they were missing, Edit would be failing on team chat today. `chat-stack-oct10.md:251` left this same gap open. **Round 2's actual R11 work:** the DM screen had no edit path (round 1 recorded that as why Edit was omitted there) and R11 carves out no DM exception, so `DMChatScreen` now takes `editMessage`, holds `editing`, and passes `editing`/`onCancelEdit`/`onSaveEdit` to `ChatInputBar`, which already owned the prefill, the "Editing message" strip and its ✕ (`ChatInputBar.tsx:360-375`) and was simply never handed a message. **R12 VERIFY ONLY — already correct, nothing changed:** `beginReply` calls `setReplyingTo` and nothing else (no scroll call appears in either reply path), and both send paths already do `isAtBottomRef.current = true; scrollToNewest(true)` inside `if (result.ok)` (`TeamChatRoomScreen.tsx:457-458`, `DMChatScreen.tsx:320-321`). An **edit** save deliberately does not scroll — R12 says *sending*. **SACRED FOLLOW-UP, NOT ATTEMPTED, NEEDS LU: the 5-minute edit window is CLIENT-SIDE ONLY.** It lives in one place, `EDIT_WINDOW_MS` in `MessageActionsModal.tsx`, deciding whether the Edit row *renders*; the write is guarded only by `.eq('user_id', user.id)` (`useMessages.ts:572`) and an RLS UPDATE policy that is author-only with **no time bound**, so an author editing a six-month-old message is refused by nothing but a hidden button. Raising it to the server is a **policy change = SACRED**: either a `WITH CHECK (now() - created_at < interval '5 minutes')` arm or a SECURITY DEFINER `edit_message(id, content)` door matching the `close_poll` / `set_channel_announcement_mode` shape already used twice here — plus web's copy of the gate. Round 2 detail: `docs/recon/chat-actions-v2.md` § ROUND 2.| *pending — not committed* | **VERIFIED-DEVICE (Lu, iPhone dev build on live Metro, 2026-10-25 23:00-23:15 MDT, ZZ Test Team 0826 Team Chat) — 9 checks passed:** (1) ☺+ opens the emoji popover and its `+` expands to the full grid, **no Reply button in the popover** (R1/R8); (2) long-press opens the actions sheet **with no emoji row** (R7); (3) swipe-right on a bubble fills the composer with the quote (R3); (4) the **WhatsApp quote block** renders the original sender's name + snippet in the sent bubble (R9 — this is the fix for the "Replying to… with no content" Lu reported on Oct 25, cause recorded in cell 1); (5) tapping the quote **jumps to the original and flashes it** (R9); (6) Copy raises the **in-app "Copied" toast**, no Alert to dismiss (R10); (7) **Edit within 5 minutes works and the "(edited)" label appears** (R11); (8) **no Edit offered on an old message** — the window gate holds (R11); (9) **sending scrolls to the bottom** (R12). **COLUMNS NOW PROVEN, not inferred:** `comm_messages.is_edited`, `edited_at` and the `reply_to_*` columns were confirmed by SQL against `information_schema` on 2026-10-25 — **5 rows returned**. That closes round 2's one open premise (it was INFERRED from the fact that `useMessages.editMessage` already wrote those columns) and the same gap `chat-stack-oct10.md:251` had left open since Oct 10. **STILL AGENT-ONLY — R5, the locked-chat composer notice** ("Only club admins can post here" / "Only team staff can post here", Reply hidden from the sheet, swipe-reply disabled, reactions still available): **untestable until a NON-ADMIN phone runs this build** — Lu's account is staff everywhere, so it sees the normal composer by design and the notice path cannot be reached from it. **PALETTE FIX, Lu Oct 25:** the jump-flash ring was amber `#FBBF24`, a fourth tone the palette does not have; it is now the purple accent `#A78BFA` (`ChatBubble.tsx` `bubbleHighlighted`). The accent's base `#8B5CF6` could not be used — it IS the own-bubble background, so the ring would have vanished on half the messages; `#A78BFA` is the same accent's light variant and is already this file's quote bar and swipe hint. **The flash colour itself is the one thing on this row not re-checked on device** (changed after the pass). Round 2 detail and the full owed list that this pass closed: `docs/recon/chat-actions-v2.md` § ROUND 2. —— PRIOR STATUS, kept for the record: **AGENT-ONLY — static + typecheck + bundle proof only, NO device or simulator run.** Round 1's gesture/UI checks were superseded by Lu's Oct 25 device test, which produced R7-R12; **round 2 is itself unverified and owes 8 checks, listed in full at `docs/recon/chat-actions-v2.md` § ROUND 2 / "Owed device checks":** (1) **edit a team message and look for `(edited)`** — this IS the R11 column question; if the marker never appears, `is_edited`/`edited_at` do not exist and R11 must be reverted; (2) edit on a **DM** (new in round 2) end to end; (3) the quote block on a reply to a SHORT and to a LONG message, in own and other bubbles — name + 2 lines visible in all four; (4) tap a quote → jumps and rings ~1 s, then a quote whose original is NOT loaded → nothing, no crash; (5) ☺+ → quick six + `+`, `+` expands in place, **no Reply button anywhere in the popover**; (6) long-press → Reply/Copy/Edit/Read History/Delete with **no emoji row**; (7) Copy → "Copied" toast ~1.5 s, no Alert; (8) R12 — starting a reply does not move the list, sending does. Round 1's own owed list stands where those paths were not re-cut. ROUND 2 gates: `npx tsc --noEmit` **5 = baseline** (all 5 pre-existing, all in the games; **0 in any touched file**); `ESLINT_USE_FLAT_CONFIG=false npx eslint` on the 6 changed files **0 errors / 59 warnings**, and **0 of the 59 are in code written in round 2** — 1 in `ChatBubble.tsx` is the pre-existing `videoPlaceholder` unused style and the 4 unused-vars in the screens (`permissionsLoaded`, `channelMembers`, `messageIds`, `err`) all pre-date this task; `ChatToast.tsx` and `ReactionPicker.tsx` lint **0/0**; a HEAD before-count was NOT taken because this task forbade git commands of any kind; `npx expo export --platform ios` **exit 0**, "Exported: dist"; grep proofs — (a) `Message copied to clipboard` **0 hits** and no `Alert.alert('Copied'` anywhere, (b) sheet file: `QUICK_REACTIONS`/`FULL_REACTIONS`/`./ReactionPicker` import **0**, `quickRow`/`quickEmoji` **0**, `onReact`/`onMoreReactions` **1 = the header comment recording the removal**, (c) picker file: `onReply`/`replyBtn`/`corner-up-left` **1 = a comment**, and **0** callers still pass `onReply` to it, (d) R9 insert `useMessages.ts:436-438` carries `reply_to_id` + `reply_to_content` + `reply_to_sender`. ROUND 1 gates (unchanged): DONE gates: `npx tsc --noEmit` **5 = baseline** (all 5 pre-existing, all in the games — `AnticipationArenaGame` ×2, `DribbleRushGame` ×2, `PatternPlayGame` ×1; **0 in any touched file**); `ESLINT_USE_FLAT_CONFIG=false npx eslint` on all 7 touched files **0 errors / 61 warnings**, and **0 of the 61 are in code written here** — the 3 in the two touched components are pre-existing (`videoPlaceholder` unused style; two `any` in the attachment pickers) and the 3 new files/sections lint **0/0**; a HEAD before-count was NOT taken because this task forbade git commands of any kind; `npx expo export --platform ios` **exit 0**, 9.05 MB; grep proof 1 — `onPress={onLongPress}` in `ChatBubble.tsx` = **0 code hits** (1 hit, in the comment recording the removal) and `<MessageActionsModal` / `onAddReaction` = **0 hits repo-wide**, leaving the single long-press use at `ChatBubble.tsx:548`; grep proof 2 — each notice string **exactly 1 hit**, both in `LockedChannelNotice.tsx`| Oct 23 + 25, 2026 | VERIFIED-DEVICE (9 checks, Lu Oct 25; R5 locked-chat notice still AGENT-ONLY — needs a non-admin phone) |
| **Calendar P1: type sheet, team field first, All Teams default, ➕ on All Teams, honest insert error** — five rulings from `docs/recon/calendar-team-picker.md` §8, applied per-ruling in §9 of that file. **R1** `+` now opens **EventTypeSheet** (new file, `src/components/calendar/EventTypeSheet.tsx`) — all five `EVENT_TYPES` in one vertical list, no horizontal scroll — and the form opens for the chosen type and titles itself `New <type>` (`CreateEventModal.tsx:678`); the horizontal type-chip strip and its four styles are deleted and `eventType` is a required prop, not state. **R2** the calendar opens on **All Teams at 2+ teams**, else on the single team (`CalendarScreen.tsx:147-151`) — `getDefaultTeam()` is no longer destructured or called in this screen, so neither the role switcher nor the unordered `team_staff` row order decides the view any more. **R3** **Team is the form's first field**, searchable (`Find your team…`), options = `getTeamsByAccess().staffTeams` and nothing wider (`CalendarScreen.tsx:131-134` → `teams` prop); one staff team renders as a static row with no choice; pre-fill is sole-team → viewed-staff-team → blank, and Create stays disabled until a team is picked. **`src/lib/permissions.ts` is still imported by nothing in the calendar path** — its dead `canCreateEvent` would have widened access past RLS. **R4** `const canCreate = staffTeams.length > 0;` (`CalendarScreen.tsx:424`) — the `selectedTeamId !== ALL_TEAMS_ID`, `!isPastTeamSelected` and `canManageTeam(...)` clauses are gone, so the `+` is finally visible in All Teams (the trap documented in `calendar-add-permission-oct12.md` §1 clause (b)); parents/players hold no staff team and still get no `+`. **R5** `team_id` travels **in the submit payload** (`CreateEventModal.tsx:466` → `useCalendarEvents.ts:78`/`:137`, `payload.team_id ?? teamId`), used for both the insert and the `teams.club_id` lookup so **club_id still follows the chosen team**; `createForTeamId`, `createTeamId` and both wrapper handlers are deleted and the hook takes no team argument — one source of truth, no child→parent→re-render round trip before a submit. **R6** an insert refusal no longer reads as a network problem: the hook routes the real error through `logError` and throws (`useCalendarEvents.ts:34-57`), Postgres **42501** or a `row-level security` message becomes **"You can't create events for this team."**, anything else "Could not create the event. Please try again.", and both `check your connection` alerts are gone. **Side effect, deliberate and recorded:** `START_OFFSETS_BY_TYPE` is now applied **when the form opens**, not only when Start is edited — the chip strip never re-derived it, so a Practice opened with Game's -45/+90 until the user touched Start. **JUDGEMENT CALL NEEDING LU:** **"Club Event" was KEPT** in the type sheet. R1 says *every type the form supports today* and `club_event` has been in `EVENT_TYPES` all along (`src/types/index.ts:183`), while the task's FORBIDDEN line reads *"Club Event" or any event without a team*. Read together the ban is on a **teamless** event, and nothing here can make one (Team is required for all five types, `team_id` always written); removing a shipped type would have been a product deletion. **RESOLVED — R7, Lu 2026-10-23: R7 Club Event hidden from sheet.** Club Events will be club_admin-only and club-wide, so until that phase ships nobody creates one: `UNRELEASED_EVENT_TYPES = ['club_event']` filters it out of the sheet (`EventTypeSheet.tsx:42-60`, mapped `:100`) — four types listed, not five. Hidden at the one place a type is chosen and nowhere else: `club_event` still stands in `src/types/index.ts:168` (union) and `:183` (`EVENT_TYPES`), and no display code was opened, so existing club_event rows keep their CLUB badge and colour. **Nothing SACRED touched** — no RLS, schema, migration, dependency, env or delete; `cal_events_insert` already keys off `team_staff` and is unchanged. Per-ruling file:line and the full applied list: `docs/recon/calendar-team-picker.md` §8 (rulings) + §9 (applied) | *pending — not committed* | **AGENT-ONLY AT BUILD TIME — static + typecheck proof only, no device or simulator run then; device checks have since landed, see the Status column and STEP 5 below:** every ruling here is UI behaviour. Owed click-through: (a) `+` visible in All Teams; (b) the type sheet shows all five types with no sideways scroll and the form title matches the pick; (c) Team is the first field, search filters it, a single-staff-team account sees a static row; (d) opened from one team → pre-filled, from All Teams → blank with Create greyed out; (e) an event created from All Teams lands on the chosen team with the right `club_id` — **CLOSED by step 5, Oct 25, 2026**; (f) the refusal message — hardest to stage, needs a team the account is not staff on. DONE gates: `npx tsc --noEmit` **5 = baseline** (all 5 pre-existing, all in the games — `AnticipationArenaGame` ×2, `DribbleRushGame` ×2, `PatternPlayGame` ×1; **0 in any touched file**); `ESLINT_USE_FLAT_CONFIG=false npx eslint` on the four touched files **0 errors / 38 warnings**, against a **40-warning** before-count on the three pre-existing ones measured prior to editing — net **-2**, and the one warning in the new file is the `name={config.icon as any}` carried over verbatim from the chip row that was deleted; `npx expo export --platform ios` **exit 0**, 9.04 MB; `grep -n ALL_TEAMS_ID src/screens/CalendarScreen.tsx` → **`canCreate` area clean**; `grep -rn permissions src/components/calendar src/screens/CalendarScreen.tsx src/hooks/useCalendarEvents.ts` → **no matches**. **STEP 5 (create + delete) CLOSED, Oct 25, 2026 — device + SQL:** a practice was created from the **type sheet on All Teams** with the **team field first** (ZZ Test Team 0826), appeared in the calendar, and was deleted, on Lu's phone. SQL proof after the delete: **0 sandbox events in `cal_events`** and **0 event notification rows in `notification_log`** for the window. **Note for any future delete work: `cal_events` has NO `deleted_at` column — a delete here is a HARD delete**, so "0 rows" is the only observable proof and a deleted event is not recoverable from the table. | Oct 22 + 25, 2026 | VERIFIED-DEVICE (partial) — Lu iPhone, live Metro, 2026-10-23: checks 1-4+6 ("all working", not per-check). **Step 5 (create + delete): VERIFIED-DEVICE + VERIFIED-SQL, Oct 25, 2026** (practice created from the type sheet on All Teams, team field first, ZZ Test Team 0826, visible, then deleted; 0 `cal_events` sandbox rows and 0 `notification_log` event rows after — hard delete, no `deleted_at`). UNVERIFIED, unchanged — Lu has not device-checked these: 1-team view, honest insert error |
| **Event detail redesign "F1 · one ticket" — one framed card per event, both tabs** — mockup approved by Lu, Oct 26, 2026; builds on the design-E leaf badge in the row below. **`EventDetailScreen.tsx` now has ONE card renderer**, `renderEventCard(footer?)` (`:1195`), so the Details and Attendance tabs cannot drift: Details calls `renderEventCard(detailsCardFooter)` (`:1666`), Attendance calls `renderEventCard()` (`:1529`). Card contents top to bottom: leaf `DateBadge variant="tag"` **resized 92x118 → 86x110** beside title + Edit + team line + type chip · hairline `cardDivider` · detail rows full width (location + address + "Tap to open in Maps · hold to copy", arrive/time, venue, shirt, notes) · hairline `cardDivider` · `cardFooter` (`:1407`). **Three standalone cards were folded into that footer and their markup deleted:** (a) the "Will you be there?" card (`styles.willCard` + 9 `will*` styles) → **`src/components/calendar/RsvpPill.tsx`** (new), a segmented pill on a dark track, 3pt inset, 9pt radius, selected half tinted green `#22c55e` / red `#ef4444` at 18% with matching text, unselected muted; (b) the "📊 Responses" card with its three 28pt numbers (`styles.responsesCard` + 6 styles) → **`src/components/calendar/ResponsesBar.tsx`** (new), the line "<N> on the roster · <answered> answered" (13pt muted), a 6pt stacked bar (green going / red can't go / dark remainder) and a swatch legend, plus the "n marked by coach" provenance note carried over verbatim; (c) the two stacked reminder buttons → one `remindRow` with a filled "🔔 Remind <n> to RSVP" and an outline "Remind team", **same handlers** `handleSendReminder` / `handleRemindTeam` and the same disabled/sending/sent states. **The Attendance tab's old one-line `attBanner` strip is gone** — it re-printed the date/type/time in its own format and could disagree with the Details tab; the tab now renders the shared card, header + rows only, and the attendance list under it is untouched. **WRITE LOGIC UNCHANGED, as required:** `RsvpPill` owns no writer. `onGoing` is the old button's expression byte-for-byte (`myRsvp?.status === 'yes' ? handleRsvp('pending') : handleRsvp('yes')`, `:1419-1420`) and `onCantGo` is still `setCantGoModalVisible(true)` (`:1422`) into the existing `CantGoReasonModal`; `handleRsvp` still routes through the app's single `upsertRsvp` (`src/utils/rsvp.ts`, imported `:43`, called `:727`). `ResponsesBar` only draws — the counts are still the resolver's own `summarizeEffective` verdicts, so the bar and the Attendance rows cannot disagree. **Staff gate for the reminder row is the pre-existing pair, not a new rule:** `isStaff && !isEventPast(event)` (`:1445`), where `isStaff` = team staff OR `club_admin` OR `platform_admin` (`:244`) — exactly what guarded the two stacked buttons. Non-staff: row not rendered. **Frames, all three event cards:** 2pt border in the event-type colour at **50%** (`accentAlpha(accent, 0.5)`) plus a **5pt solid left strip** in the same colour — both real borders, so they follow the radius with no extra element: Details/Attendance card (`EventDetailScreen.tsx:1197` style, `:1201-1204` colours) and the calendar list card, both copies (`CalendarScreen.tsx:649`, `:818`, style `:1470`). Radii unchanged. Comments/attachments, game entry, lineup card and everything else below stay outside the card, unrestyled. **Nothing SACRED** — no dep, schema, migration, RPC, policy, env, delete, auth or DB access, and no RSVP/attendance write path touched. **ROUND 2, Oct 26, 2026 — palette + list card "H1 · footer pill" + the flagged cleanup.** **(1) RSVP palette, three-tone rule (purple / grey / red, red destructive ONLY).** `RSVP_GREEN` and `RSVP_RED` are **deleted**, replaced by `RSVP_TOKENS` in `RsvpPill.tsx` (`accent #8b5cf6`, `lavender #a78bfa`, `slate #2b3350`, `slateBorder #4a5479`, `outline #3a4360`, `text #e2e8f0`, `textOn #ffffff`, `muted #94a3b8`, `track #0b1120` — all hues the calendar components already used). Pill states: **unanswered** both options are real buttons, 1.5pt slate outline, light text, lavender ✓ / ✕; **going** brand-purple fill, white text + icon; **can't go** slate fill with the lighter slate border, white text, lavender ✕ — and in both answered states the other option drops to `opacity 0.55` but **stays tappable**, because the writer is last-tap-wins. Press feedback is `activeOpacity` + the selected segment's `scale: 1.02`, the app's existing pattern (`VoterSeat.tsx:60`); **NO haptic — `expo-haptics` is not installed and nothing in `src/` calls Haptics**, as `ChatBubble.tsx:95` already records. `ResponsesBar`: going = purple, can't go = slate `#4a5479`, no reply = the near-black track, legend squares the same. **(2) Calendar list card = H1.** Both copies now come from **ONE renderer**, `renderEventListCard` (`CalendarScreen.tsx:494`), called at `:793` (Previous group) and `:802` (main group) — the old pair had DRIFTED: only the main copy showed the arrive time, the type chip and the "?" count, and only the Previous copy still carried a round ✓/✗ pair that its own `eventPast` branch made unreachable. Card is a COLUMN: header row (leaf `DateBadge variant="list"` **resized 76x96 → 70x88**, day 30 → 28pt · team line dot + name · title one line with `ellipsizeMode="tail"` · meta line `4:00 – 5:15 PM · arrive 3:50` · the existing 📍 location link) → hairline `cardFooterDivider` → footer row INSIDE the frame: counts `✓ n  ✕ n  ? n` (muted labels, bold numbers) left, the **same `RsvpPill` with `compact`** right, preceded by a muted "You?" until the user answers. The header row is the card's tap target and the footer sits OUTSIDE it, so tapping the pill answers instead of opening the event — exactly what the removed strip did. **Type chip dropped on the list card only** (title + leaf + frame colour carry the type); the detail screen keeps its chip (`EventDetailScreen.tsx:1226`). The leftover inline `borderTopLeftRadius / borderBottomLeftRadius: 8` is **gone**, so all four corners use the card radius. F1's 2pt @50% frame + 5pt left strip are kept, and past events take `EVENT_ACCENT_PAST` from the colour map instead of an inline grey. **(3) Cleanup, every target grepped first.** Deleted from `EventDetailScreen.tsx` after confirming **1 reference each — their own definition**: `formatDateParts`, `titleCase`, `timeRangeLabel`, the `dateParts` const, and the `attBanner` / `attBannerText` / `reminderButton` / `reminderButtonText` / `remindTeamButton` / `remindTeamButtonText` styles. **`reminderButtonDisabled` was KEPT — 3 references**, the new `remindPrimary`/`remindOutline` still use it. `willCard*` and `responsesCard*` were already gone in F1; only a comment names them. Deleted from `CalendarScreen.tsx`: the 9 `willStrip*` styles belonging to the strip H1 removed — **the only `#22c55e` / `#ef4444` left in that file**. **ROUND 3, Oct 26, 2026 — polish after Lu's 1:35 AM device look, seven items.** **(1) List footer no longer clips.** The "You?" prefix is **deleted** (0 hits), the compact pill box is `paddingVertical 7 / paddingHorizontal 10 / 13pt / gap 6` (one 13pt label scale now, `labelCompact` gone), the counts carry `flexShrink: 1` with `gap: 10` and the pill `flexShrink: 0` via a new `style` passthrough — the counts compress, the pill never does. **(2) Detail RSVP row is two rows:** caption "Will you be there?" (14pt, muted `#94a3b8`, `numberOfLines={1}`) over `RsvpPill stretch`, whose halves are `flex: 1` with `gap: 8`, so the labels cannot wrap; `rsvpRow` deleted. **(3) Reminder labels fit:** primary `🔔 Remind {n}`, outline `Remind team`, same 13pt/700, both `numberOfLines={1}`. **(4) THE COUNTS BUG — three populations, one rule now.** Added to **`src/utils/attendanceResolver.ts`**: `noReplyFromRoster(rosterSize, going, cantGo)` (`:214`) = `max(0, roster - (going + cantGo))`, and `eventHeadcount(rosterResults, extraResults)` (`:232`) which returns the canonical `going / cantGo / noReply / markedByCoach / rosterSize`. `EventDetailScreen.headcounts` (`:651`) is now the ONE source for both the Responses bar (`:1427`) and the reminder number (`:1451-1453`). **Root cause, per source:** the bar's 11 was RIGHT (roster verdicts through the resolver); the reminder's 19 counted **USER ACCOUNTS** from `nonResponders` — `team_staff` user_ids + BOTH parent emails per player + player-role users, minus anyone holding any RSVP row — a different population from the roster, so it is structurally larger than the team; the list card's `? 0` tallied **ROWS** with `status === 'pending'` (`CalendarScreen.tsx:256-262`), and a player who never answered has **no row at all**, so nobody unanswered was ever counted. **(5) Detail team dot** sits on the first line of a wrapping name (`alignItems: 'flex-start'` + `marginTop: 5` = (14pt line box − 8pt dot) / 2). **(6) List meta line** is no longer all-purple: the time is white `#fff` at 600, `· arrive 3:50` is muted `#94a3b8` at 400 (new `eventArrive` span), and purple is the location link's alone. **(7) +4pt above both footer hairlines** (`cardHeaderRow.paddingBottom: 4` on the list card, `cardBody.paddingBottom 4 → 8` on the detail card).| *pending — not committed* | **AGENT-ONLY — static proof only, NO device or simulator run, and several ARE owed.** DONE gates: `npx tsc --noEmit` **5 = baseline** (all 5 pre-existing, all in the games, **0 in any touched file**); `ESLINT_USE_FLAT_CONFIG=false npx eslint` on the five files **0 errors / 141 warnings** (pre-existing classes — inline styles, unused styles, unused vars); `npx expo export --platform ios` **exit 0**, iOS bundle 9.06 MB. Greps: old cards no longer rendered — `styles.willCard` / `styles.responsesCard` / `📊 Responses` / `styles.willBtn*` / `styles.reminderButton,` / `styles.remindTeamButton` → **no hits in the render tree**; the pill calls the same writer — `onGoing` `:1419-1420` → `handleRsvp` → `upsertRsvp` `:727`, import `:43`. **Dead after this change, deliberately left in place and NOT deleted:** `titleCase` (`:96`), `timeRangeLabel` (`:101`) and the `dateParts` const (`:517`) lost their only caller with `attBanner`; the `attBanner` / `attBannerText` / `reminderButton*` / `remindTeamButton*` style keys are now unused. All are eslint WARNINGS in a file that already carried that class. **ROUND 2 gates, Oct 26, 2026:** `npx tsc --noEmit` **5 = baseline**, **0 in any touched file**; `ESLINT_USE_FLAT_CONFIG=false npx eslint` on the five files **0 errors / 150 warnings**; `npx expo export --platform ios` **exit 0**. Greps: `RSVP_GREEN` / `RSVP_RED` → **0 hits repo-wide**; `#22c55e` / `#ef4444` → **0 hits in `RsvpPill.tsx`, `ResponsesBar.tsx`, `DateBadge.tsx` and `CalendarScreen.tsx`** — **NOT 0 repo-wide, and that gate cannot be met in this SCOPE: ~170 pre-existing hits remain in the games, polls, dashboards, lineup and other screens**, which this task was not allowed to touch; the list strip gone — `willStrip` survives only in three comments, no render; the list pill on the old handler — `handleRsvp(event.id, 'pending')` / `handleRsvp(event.id, 'yes')` (`:628-629`) and `setCantGoEventId(event.id)` (`:631`), `handleRsvp` → `upsertRsvp` (`:316`, import `:27`); list type chip — `cardTypeBadge` appears only as an orphaned style definition (`:1381`), never rendered. **BLOCKED, one item not built: the meta line's `· Field 3` segment.** `cal_events` / `CalendarEvent` (`src/types/index.ts:189-221`) has **no field-number column** — `is_home_field` at `:242` belongs to a different interface — and adding one is a migration, which is FORBIDDEN here. The meta line ships as `time · arrive`; nothing was faked. **Still dead in `CalendarScreen.tsx`, deliberately NOT swept (13 style keys = over the 10-site rule, reported instead):** `eventCardWrap`, `cardTypeBadge`, `cardTypeBadgeText`, `attendancePreview`, `attendanceGoing`, `attendanceDivider`, `attendanceNotGoing`, `attendanceNoReply`, `rsvpSection`, `rsvpBadge`, `rsvpYes`, `rsvpNo`, `rsvpBadgeText`, `rsvpButtons`, `rsvpBtn`, `rsvpBtnYes`, `rsvpBtnNo`, `rsvpBtnText`, plus `getEventTypeLabel`, `getEventTypeConfig`, `eventAccentFor` and `FlatList` imports — all eslint WARNINGS. **ROUND 3 gates, Oct 26, 2026:** `npx tsc --noEmit` **5 = baseline**, **0 in any touched file**; `ESLINT_USE_FLAT_CONFIG=false npx eslint` on the six files **0 errors / 150 warnings**; `npx expo export --platform ios` **exit 0**. Greps: `You?` → **0 hits**; the count call sites → `eventHeadcount` imported `EventDetailScreen.tsx:35`, called `:651`, read by the bar at `:1427` and the reminder label at `:1451-1453` — **two of the three, not three**, see BLOCKED below. **Item 1 fits at 375pt, by arithmetic (no on-device measure available from here, glyph widths ESTIMATED):** 375 − 32 (`eventsList` paddingHorizontal 16×2) = 343 card width; − 5 left strip − 2 right border = 336; − 24 footer paddingHorizontal = **312pt of content**. Pill ≈ 79pt ("✓ Going": 11 + 5 + 40 glyphs + 20 padding + 3 border) + 95pt ("✕ Can't go": 11 + 5 + 56 + 20 + 3) + 6 gap = **180pt**; counts "✓ 1 ✕ 1 ? 11" ≈ **96pt**; + 10 row gap = **286pt — 26pt of slack**, and the counts shrink first if a 3-digit number appears. **BLOCKED — item 4's THIRD source, the calendar list card's "?", was NOT repointed, as the prompt instructed.** The one rule needs a roster SIZE per event; `CalendarScreen.fetchEvents` reads `players` only for the user's own children (`.or(parent_email.eq…,secondary_parent_email.eq…)`, `:227-231`) and `UserTeam` (`src/hooks/useUserTeams.ts:6-21`) carries **no player count**, so there is no roster size in hand — it would take a new/widened read, which this task forbids. The list card still shows the row tally and is therefore **still wrong on device**; it is a ~3-line change to that existing `players` read once Lu approves the wider fetch. **ROUND 4, Oct 26, 2026 — the widened roster read was APPROVED by Lu but NOT BUILT, stopped by Lu's own condition.** Named sources: there is **no roster hook** — the roster the detail screen and the Attendance tab share is the inline `fetchRoster` `useCallback` at `EventDetailScreen.tsx:280-294` (`players.select(...).eq('team_id', …).order('last_name')`), per event; the list's sanctioned fallback was one batched `players.select('id, team_id').in('team_id', teamIds)` per fetch, feeding `noReplyFromRoster` (`attendanceResolver.ts:214`). **Stop trigger:** "if widening `players` would give a parent a different number than staff (RLS), stop and report" — unanswerable here. `supabase/migrations/` holds ONE migration and **no `players` policy SQL**, and DB access is forbidden. INFERRED only: `fetchRoster` already runs unfiltered for every role on the Details tab (its `roster` feeds the Responses bar parents also see), so either parents can read a full team roster already or that bar has been under-counting for parents — not proven either way. Settling check and full detail: **Open gaps → Client-side open items, "BLOCKED Oct 26 — the calendar list card's '?' count"**. Also recorded this round: the **standing layout rule R-G** (text never overflows its container, 375pt floor) and the **open ruling on "Remind {n}"** (label = roster no-reply vs recipients = account list, option A recommended) — both in **Decisions, Oct 26**. **No code changed in round 4**, so the round-3 gates stand: tsc **5 = baseline**, eslint **0 errors**, `npx expo export --platform ios` **exit 0**.| Oct 26, 2026 | AGENT-ONLY — owed device checks on Lu's phone, ROUND 3 list: (1) list footer shows counts + both pill halves fully inside the card at iPhone SE / 13 mini width, nothing clipped, no "You?"; (2) detail RSVP is a muted caption over two equal halves, neither label wrapping; (3) reminder row reads "🔔 Remind n" and "Remind team" with no truncation; (4) the detail bar's No-reply number and the reminder button's number are now the SAME for one event — and note what the list card's "?" says for that event, since it is still the old row tally; (5) a wrapping team name on the detail card has its dot on the first line; (6) list time reads white with a muted arrive, and purple is only the location link; (7) the extra 4pt above both hairlines looks right; plus the round-2 checks not yet run: pill states with no green/red, footer pill answering without opening the event, Previous group with counts + Past badge and no pill, Attendance card with no RSVP/responses/reminders, staff gate, Maps tap and hold-to-copy; **plus the round-4 blocker: compare the Responses bar's roster total as a PARENT and as STAFF on the same event — that one comparison unblocks the list card's "?" count** |
| **Event date badge + event-card frames, design "E · calendar leaf"** — supersedes the Option A row below (same `src/components/calendar/DateBadge.tsx`, restyled). Approved by Lu, Oct 26, 2026. **Badge:** a darker **weekday band** (12 pt, letter-spacing 1.6, centred, padding 7 / 6) over a **body** in the event colour carrying the **day number** (38 pt extra-bold, one line, `adjustsFontSizeToFit`) and the **month** (12 pt, letter-spacing 1.6, opacity .9); radius **20**, padding ≥ 8 pt all round, and a **glow in the event's own colour** (`shadowColor` = that colour, offset 0/3, opacity .25, radius 10, Android `elevation: 4`). The band and body carry the corner radii themselves — the container has **no `overflow: 'hidden'`**, because clipping a rounded container is what eats the glow and Android's elevation. Sizes: **`variant="tag"` 92 × 118** on the detail header, **`variant="list"` 76 × 96** in the calendar list card — **renamed from `"column"`: it is a TAG there now too**, `alignSelf: 'center'` with a 10 pt inset, no longer a full-height column, so the card's frame and the glow both stay visible. **Colour: one helper pair, no new per-type constants.** `src/lib/eventColors.ts` is still the only per-type map; `darkenAccent(accent, 0.12)` (the band) and `accentAlpha(accent, 0.45)` (the frames) are exported from `DateBadge.tsx` and derive from whatever `eventAccent`/`eventAccentFor` hands them — **`DateBadge.tsx` contains zero hex literals**. They sit in that file only because `eventColors.ts` was outside this task's SCOPE; they belong beside the map. **Frames — 2 pt in the event's own colour at 45 %, radius unchanged, on exactly three cards:** (1) the calendar **list** preview card, **both copies** (Previous group `CalendarScreen.tsx:649`, main group `:818`; `styles.eventCard:1467` carries `borderWidth: 2`, the thicker 4 pt solid left accent edge is **kept**), (2) the **detail header** card (`EventDetailScreen.tsx:1366`, `styles.eventCard:1841`), (3) the **Attendance-tab event card** — that is `styles.attBanner`, **inline in `EventDetailScreen.tsx`, there is no separate Attendance component** (`:1226`, style `:2159`, was `borderWidth: 1` in a fixed purple rgba, now 2 pt from the event type; its dark backdrop is unchanged). Nothing else gained an outline and no dark background changed. **No behaviour touched** — Maps tap, hold-to-copy, the "Tap to open in Maps - hold to copy" hint, RSVP strip, Responses, reminders and the list-card taps are byte-identical. **Nothing SACRED** — no dep, schema, migration, RPC, policy, env, delete or DB access. | *pending — not committed* | **AGENT-ONLY — static proof only, NO device or simulator run, and one IS owed:** a pure visual change, so only a phone settles it. DONE gates: `npx tsc --noEmit` **5 = baseline** (all 5 pre-existing, all in the games, **0 in any touched file**); `ESLINT_USE_FLAT_CONFIG=false npx eslint` on the three files **0 errors / 132 warnings** (all pre-existing classes — inline styles, unused styles); grep `borderWidth: 2,` → exactly the **three** card styles above and nothing else; grep `#[0-9a-fA-F]{3,8}` in `DateBadge.tsx` → **no matches**, every colour arrives through the `color` prop and the two helpers. **Known unknown:** on Android, `elevation` under a rounded child can render differently than iOS's `shadow*`; the glow is iOS-exact and Android-approximate until a device says otherwise. | Oct 26, 2026 | AGENT-ONLY — owed device check: **design E badge (band + glow) and the 2 pt frames look right on Lu's phone, on all three cards: calendar list, detail header, Attendance tab** |
| **SUPERSEDED Oct 26, 2026 by design E (row above) — Event date badge, Option A — detail header tag + calendar list column, shared `DateBadge`** — mockup approved by Lu, Oct 25, 2026 ("A, make the date card a bit bigger"). New `src/components/calendar/DateBadge.tsx` renders WEEKDAY / DAY / MONTH, one line each, in two shapes from one component: **`variant="tag"`** a fixed **88 x 112 pt, radius 18** tile (15 pt bold weekday, 40 pt extra-bold day with `adjustsFontSizeToFit`, 14 pt bold month) and **`variant="column"`** the calendar list card's full-height column (85 pt wide, 13 / 32 / 12 pt). **Event-type text is gone from both date columns** — the chip beside the title already carries it; `styles.eventTypeLabel` and the three `eventDateBlock*` text styles are deleted from `CalendarScreen.tsx` (both list copies, the Previous group and the main group, now render `<DateBadge variant="column">`). **`EventDetailScreen.tsx` main card is now a COLUMN, not a row:** `styles.cardHeader` holds the tag beside title + Edit + team line + type chip ONLY, then `styles.cardDivider` (hairline), then `styles.cardBody` with every detail row at **full width, no left gutter** — the tag can no longer stretch to the card's height because `styles.tag` carries a fixed `height: 112` and no `flex` or `alignSelf` anywhere in the component. Deleted from the detail screen: `dateSection`, `dayName`, `dateNumber`, `monthName`, `eventDetails`; `badgesRow` lost its 16 pt bottom margin (it ends the header) and `cancelledReasonBox` swapped `marginBottom: 12` for `marginTop: 12` to keep its gap. **No behaviour touched** — Maps tap, hold-to-copy, the "Tap to open in Maps - hold to copy" hint, RSVP strip, Responses and reminders are byte-identical; `formatDateParts` still feeds the nav header line. **Nothing SACRED** — no dep, schema, migration, RPC, policy, env, delete or DB access. | *pending — not committed* | **AGENT-ONLY — static proof only, NO device or simulator run, and one IS owed:** this is a pure layout change, so only a phone settles it. DONE gates: `npx tsc --noEmit` **5 = baseline** (all 5 pre-existing, all in the games, **0 in any touched file**); `ESLINT_USE_FLAT_CONFIG=false npx eslint` on the three files **0 errors / 132 warnings** (all pre-existing classes - inline styles, unused styles); grep: **no `eventTypeLabel` / `getEventTypeLabel(event.event_type)` / `typeConfig.label` in either date column**; grep: `styles.tag` = `width: 88, height: 112, borderRadius: 18` with **no `alignSelf` and no `flex` in `DateBadge.tsx`**. | Oct 25, 2026 | AGENT-ONLY — owed device check: **detail + list badge look right on Lu's phone** |
| **Chat + Notifications swipe: hold-open + axis lock (recon #1-#5)** — left-swipe rows sprang back instead of latching, and the list scrolled vertically mid-swipe. One root cause: the rows are hand-rolled on RN `PanResponder` (**`react-native-gesture-handler` is NOT installed** — absent from `package.json` and `node_modules`, so no `activeOffsetX`/`failOffsetY`/`rightThreshold` exists in this repo) and declared no `onPanResponderTerminationRequest`, which RN defaults to **`true`** when absent (`node_modules/react-native/Libraries/Interaction/PanResponder.js:550-553`) — so the list's scroll view could take the drag away mid-swipe. That one default produced BOTH symptoms: the vertical scrolling, and the snap-back, because a stolen gesture never reaches `onPanResponderRelease` and Release was the only path that could latch a row open. On iOS nothing blocked it at all — `onShouldBlockNativeResponder` also defaults true (`PanResponder.js:479-481`) but RN's own comment says it *"is currently only supported on android"* (`:107`). **Why ZZ Test Team held open and DMs did not:** the latch test was `base + dx < -width / 2` and the strip width came from the action count — team chats get Mute alone (80 wide → **40px** to latch), DMs/groups get Mute + Hide (160 wide → **80px**), because `canHideChannelType` allows Hide only on `dm`/`group_dm` (`src/lib/hiddenChats.ts:33`). Same bug throughout; team rows just latched before the scroll view could steal it. Applied: **#1** termination guard (`ChatScreen.tsx:332`); **#2** capture-phase axis claim `|dx| > 4 && |dx| > |dy| * 1.5` (`:313-314`, bubble test kept as late fallback); **#3** the open effect now `settle(true)`s instead of returning (`:285-296`) so a remounted row re-opens itself rather than sitting visibly shut while `openSwipeKey` still names it and swallows the next tap; **#4** travel-based latch `SWIPE_LATCH_TRAVEL = 40` / `SWIPE_LATCH_VELOCITY = 0.3`, applied asymmetrically so an open row released after a jiggle does not read as "close me" (`:174-175`, `:353-355`) — **this is what equalises DM and team rows**; **#5** a shared `swipeDragActiveRef` set on grant and cleared on both terminal paths, so each list's `onScrollBeginDrag` ignores the scroll that happens *inside* a swipe (`:725`, `:2777`, `:2861`). **#1 and #2 also applied to `NotificationsScreen.tsx:28-29, :36`** — same missing guard, same bubble-phase gate; there a stolen gesture meant the swipe-to-delete could never commit. **DEVIATION, recorded:** #5 was specified as a ref and was first written as a module-level `{ current: false }`; `react-hooks/immutability` rejects writing to a module-scope value from inside a component (3 errors), so it became a real `useRef(false)` owned by the screen and threaded to every row as `dragActiveRef` — same single shared flag, lint-clean. **NOT APPLIED:** #6 (`React.memo`) forbidden for this pass, and **#7 (install `react-native-gesture-handler` + `ReanimatedSwipeable`) is SACRED and still needs Lu** — dependency plus native rebuild (`package.json`, `App.tsx` `GestureHandlerRootView`, `ios/`, `android/`). It is only worth raising if #1-#5 fail on device. **FOUND, out of scope and untouched:** one Mute causes TWO refetches — `handleToggleMute` calls `refresh()` and the write to `comm_channel_members` also trips the realtime subscription watching that exact table for this user (`src/contexts/ChatUnreadContext.tsx:282-296`). Also nothing on the chat list is memoized (0 `React.memo` in `ChatScreen.tsx`), so every row re-renders on every refresh — wasteful, not a cause of either symptom. Full diagnosis with PROVEN/INFERRED labels per cause: `docs/recon/swipe-snapback.md` (§1-§5 diagnosis, §6 ranked fixes, §7 what was applied) | *pending — not committed* | **AGENT-ONLY — static proof only, NO device or simulator run, and one IS owed: the two reported symptoms are gesture behaviour and cannot be proven by typecheck.** Owed: swipe a DM *and* a group row past 40px and confirm each holds open; swipe diagonally and confirm the list does not scroll under the finger; and re-check notifications swipe-to-delete still commits. DONE gates: `npx tsc --noEmit` **5 = baseline** (all 5 pre-existing, all in the games — `AnticipationArenaGame` x2, `DribbleRushGame` x2, `PatternPlayGame` x1; none in either file touched); `ESLINT_USE_FLAT_CONFIG=false npx eslint src/screens/ChatScreen.tsx src/screens/NotificationsScreen.tsx` **94 problems / 0 errors / 94 warnings, identical to the before-count measured on the same two files prior to editing**; `npx expo export --platform ios` **exit 0**, 9.04 MB; `grep -n onPanResponderTerminationRequest` **1 hit in each file** | Oct 22, 2026 | VERIFIED-DEVICE — Lu iPhone, live Metro, 2026-10-22 ("all working", not per-check) |
| **Stage 4 follow-up — notifications handler flags (types-only, matches device-proven banner behaviour Oct 21)** — clears the last non-games error from the Stage 4 pass, `TS2322` at `src/services/notifications.ts:30`. `NotificationBehavior` in expo-notifications 0.32 (SDK 54) **requires** `shouldShowBanner` and `shouldShowList`; the handler declared neither, only the deprecated `shouldShowAlert`. Both flags are now declared in **both** branches, each mirroring that branch's own `shouldShowAlert`, and `shouldShowAlert` is kept as it was — sound and badge values untouched. **IN-CHANNEL BRANCH GETS `false`, NOT `true`, and this is a deliberate deviation from the task prompt**, which said to add `true`/`true`: there are two return branches and the type requires the flags on each, so a blanket `true` would banner a push for the room already on screen — against this file's own ruling at `notifications.ts:13-14` ("A push for the room already on screen should not banner or chime -- the message is right there") and against the shipped "push banner suppressed for the open channel" in the Chat core batch row below. `shouldShowAlert` was one flag covering banner + notification centre, so mirroring it per branch is the only no-behaviour-change reading. **EVIDENCE THIS MATCHES THE DEVICE, not an inference: Lu, Oct 21 2026, 1.0.17 bundle, app open on Home — a chat push DID show a foreground banner.** That is the `true` branch (Home is not a chat room, so `activeChannelId` is null), so the branch now declaring `shouldShowBanner: true` is declaring what the device already does. The suppress branch was **not** exercised by that test — a push arriving while the user is reading that same chat is still owed a device check, and the claim for it is that `false`/`false` reproduces today's `shouldShowAlert: false`. **This also corrects the Stage 4 row's FOUND #4**, which INFERRED from `NotificationsHandler.js:65-68` that banners were suppressed app-wide; the device test disproves it. `docs/recon/stage4-types.md` §notifications still carries that old inference — out of SCOPE here, correct it next time that file is touched | *pending — not committed* | **AGENT-ONLY — types-only, no behaviour change intended; the banner-showing branch is backed by Lu's Oct 21 device test, the suppress branch is not yet re-run.** DONE gates: `npx tsc --noEmit` **5**, **0 in notifications.ts** (was 6; all 5 remaining are the old games); `ESLINT_USE_FLAT_CONFIG=false npx eslint src/services/notifications.ts` **0 errors / 18 warnings = HEAD's 0 / 18**, per-rule counts identical, HEAD (`31ad6b7`) measured via `git archive HEAD` into a scratch dir with node_modules symlinked; `npx expo export --platform ios` **exit 0**; `git status --porcelain` = **`src/services/notifications.ts` + `docs/ledger.md` only** | Oct 21, 2026 | AGENT-ONLY |
| **Stage 4 — mobile type-error cleanup 64 → 6** — `npx tsc --noEmit` went from **64 errors to 6**, types only, no runtime behaviour change. The 64 were grouped by root cause before any edit (`docs/recon/stage4-types.md`); two structural causes held 20 of them: `src/lib/supabase.ts` calls `createClient` with **no `Database` generic**, so every nested embed is inferred as an array and 14 hand-written `as X` casts were "no sufficient overlap" (fixed as `as unknown as X` — the local interfaces are right about runtime, the inference is not); and nothing augments `ReactNavigation.RootParamList` while `AppNavigator.tsx:126`'s inner `Stack` is untyped, so a bare `useNavigation()` resolves `navigate(name, params)` to `never` (5 sites typed with `NativeStackNavigationProp<RootStackParamList>`, 7 `as never` casts dropped, `RootStackParamList` gained `PlayerProfile`/`EvaluationDetail` and `returnTo`/`returnParams` on `Login`). Also: `.catch(fn)` → `.then(undefined, fn)` at 6 PostgREST builder sites (the builder's `then` is typed `PromiseLike`, which has no `.catch`; `.then(undefined, fn)` is what `.catch` desugars to, so same runtime) · 2 duplicate style keys deleted, **the earlier block each time**, since last-wins means the survivor was already the active one · 3 `const LANG = 'en'` annotated `'en' \| 'es'` · nullable guards `(x?.length ?? 0) > 0` · `Team.invitation_code`, `UserRole.placement_status`, `StaffMember.profile` added at their type's source · `DIMENSIONS as const` · `useRef<T \| undefined>(undefined)` · dead `user_id:` dropped from a `notification_preferences` upsert where `...updated` was already overwriting it. **0 `@ts-ignore`, 0 `@ts-expect-error`** (budget was 3), **no new `any`** — the one `Record<string, any>` first written into `RootStackParamList` was changed to `Record<string, unknown>` so the eslint warning count would not move. **FOUND — 4 live bugs, left in place as BEHAVIOUR-REQUIRED (the 6 residual errors), each needing Lu:** (1) `DribbleRushGame.tsx:712-713` calls **`getGutterBoundaryX`, which does not exist anywhere in the repo**, from `renderGutterZones()` which the render tree calls at `:764` — a ReferenceError, so that game's field cannot be drawing today; (2) `AnticipationArenaGame.tsx:283` names `getEffectiveLanding` in a dependency array evaluated at render, while the `useCallback` is declared at `:318` — a temporal-dead-zone ReferenceError on mount (fix is a pure declaration reorder, but it turns a crash into a working screen); (3) `PatternPlayGame.tsx:427` passes `onPress={startRound}` where `startRound(effectiveRound?: number)` feeds `effectiveRound ?? round` at `:203`, so React Native's `GestureResponderEvent` arrives **as the round number**; (4) `services/notifications.ts:30` returns only the deprecated `shouldShowAlert`, and expo-notifications 0.32 **only warns** on it before passing the object to native (`node_modules/expo-notifications/build/NotificationsHandler.js:65-68`) with no JS fallback to `shouldShowBanner`/`shouldShowList` — foreground banners are very likely suppressed app-wide right now (iOS native default: **UNKNOWN**, INFERRED from the JS handler only); adding the fields would start showing banners, a user-visible change. **— THAT INFERENCE IS DISPROVEN, Oct 21 2026, Lu device test** (1.0.17 bundle, app open on Home): a chat push **DID** show a foreground banner, so the native layer honours the behaviour object as it stands and nothing was suppressed. Flags declared to match in the follow-up row above; `docs/recon/stage4-types.md` §notifications was out of that task's SCOPE and still carries the old inference — correct it on the next pass through that file. **FOUND — 5 referenced-but-undefined style keys** (`CoursesScreen` backButton/backButtonIcon/headerRight in the empty-state header, `DrillDetailScreen` content, `LineupEditorScreen` statusPillText): each is `undefined` at runtime and RN silently ignores it, so those elements render unstyled **today**. Declared `{}` to keep that exact rendering; real values are a styling pass. **NOTE FOR LATER ROWS: the tsc baseline this file cites as "64 = baseline" is now 5** — 6 after this Stage 4 pass, then 5 once the notifications handler was typed (row above). The remaining 5 are all in the old games (`AnticipationArenaGame` ×2, `DribbleRushGame` ×2, `PatternPlayGame` ×1), which are being rebuilt in a separate effort. Status is `AGENT-ONLY`, not the `BUILT` the task prompt asked for — this file's Status column has no `BUILT`, and `AGENT-ONLY` is exactly what it defines for typecheck/lint/static proof with no device or simulator run | *pending — not committed* | **AGENT-ONLY — no device or simulator run, and none is owed: this pass changed no runtime behaviour.** DONE gates, all pasted in the Stage 4 report: `npx tsc --noEmit` **6**, each line matched 1:1 to a BEHAVIOUR-REQUIRED entry (64 → 49 → 43 → 37 → 6, diffed against the base list after every group — **no new error at any step**); `ESLINT_USE_FLAT_CONFIG=false npx eslint src --ext .ts,.tsx` **3 errors / 1964 warnings vs HEAD's 3 / 1964** — identical, per-rule counts identical, HEAD measured by `git archive HEAD` into a scratch dir with node_modules symlinked (all 3 errors are `prefer-const` in `useMessages.ts` and `captcha.ts`, both untouched); `npx expo export --platform ios` **exit 0**, 9.03 MB; test gate **UNWIRED** — 6 `*.test.ts` files exist under `src/` but `package.json` has no `test` script and no runner is installed (adding one is a dependency change, forbidden here); `git status --porcelain` = **36 `src/**` files + the 2 docs, nothing else**. Groups, counts and per-group diffs: `docs/recon/stage4-types.md` | Oct 21, 2026 | AGENT-ONLY |
| **Stage 3d — list smoothness (P1/P3 no layout-shift spinner · P4 popped-back card normal style · A clear hidden_at on open · P5 group header name-first)** — three items from Lu's Oct 21 simulator pass as ludriv. **P1** the chat list's refetch indicator was a FLOW sibling (`styles.refreshBar`, `paddingVertical: 6`) between the tab bar and the list, so every Mute/Unmute — both call `refresh()` — pushed every card down for ~1s and back; it is now `refreshOverlay` (absolute, `pointerEvents="none"`, `zIndex` 10) inside a `listArea` wrapper, taking no layout space. **P3** `ChannelPollsScreen.fetchPolls()` set `loading` true on every refetch and the `if (loading)` early return threw the whole list away for a centred spinner; `loading` now blocks the FIRST load only (`hasLoadedOnce`) and a refetch keeps the rows in place behind the same floating overlay. Same class fixed in `hooks/usePolls.ts`: `fetchPoll` flipped `loading` on every refetch and PollCard renders `loading \|\| !poll` as a small "Loading poll..." box, collapsing a full poll card on each vote/close — it now flips only when no poll is in hand (`pollRef`), so the card stays put. **PollCard and PollDetailScreen were not edited** — PollDetail never re-flips `loading` and has no refetching action. Pull-to-refresh keeps its native `RefreshControl` indicator. **P4** dim is now keyed on the RENDER SITE: a new explicit `dimmed` prop passed only by the "Hidden (n)" section, `pastTeam` for the Past tab, `conversationCardPast` → `conversationCardDimmed`; Recent and By Team pass neither, so no value of `hidden_at` can reach the dim. **FOUND: at `2d564a6` no `hidden_at`-keyed dim existed** — `opacity: 0.6` appears once in ChatScreen and only `pastTeam` applied it, only the Past tab passed it, and `isHiddenConversation` is sound (epoch-ms compare, a newer message does reach `mainRows`), so what was seen was most likely a **Past-tab** card (retired team → `pastRows`, dim by design, clock icon + "· Past team"). **A** opening a chat whose member row still has `hidden_at` set clears it through the EXISTING `set_channel_hidden(p_channel_id, p_hidden)` — the app's only hide write, wrapped by `setChannelHidden` (`lib/hiddenChats.ts:110-118`, unchanged) — called at `ChatScreen.tsx:1824` from `handleConversationPress:1859`, **after** the navigate, never awaited, both failure modes logged and nothing else, then `refresh()`. `hidden_at` is carried onto the card as `hiddenAt` for this path only. No new RPC, no new argument, no schema and **no badge/counting code touched**. Arg names could not be checked against `supabase/` — this repo holds ONE migration and zero hits for `set_channel_hidden` — but P4's own report (hidden_at still set) is evidence the call writes correctly on device | *pending — this commit* | **VERIFIED-SIMULATOR — Oct 21 2026 simulator as ludriv: no card shove on Mute/Unmute · polls vote/close in place · clear-on-open proven (`[hide] … rpc ok` + `hidden_at` NULL) — `docs/recon/chatlist-v2-mobile-notes.md` §12.** Agent gates: `npx tsc --noEmit` **64 = baseline**, **0 errors in the 3 touched files**; `ESLINT_USE_FLAT_CONFIG=false npx eslint` per file — warning SET **byte-identical to HEAD** (`ChatScreen` 0e/91w, `ChannelPollsScreen` 1e/25w with the 1 error pre-existing, `usePolls` 0e/6w); `npx expo export --platform ios` **exit 0**, 9.03 MB; `git status --porcelain` = the 3 source files + the 2 docs, nothing else. **ROOT CAUSE of A not firing on device: the mapper's `row.hidden_at ?? null` collapsed "column absent" into "not hidden", so the clear skipped silently** — now three-state (`undefined` = unknown → still clears, idempotent) plus a `__DEV__` `[hide] clear-on-open …` line at the call site (§12.1). **P5** group header was inverted ("2 members" as title) because the `teamName` route param carries the card's line 2; the header now computes title/subtitle per chat type, DM header already correct and untouched (§12.2) | Oct 21, 2026 | VERIFIED-SIMULATOR |
| **Polls end-to-end from the chat's Polls list, + Messenger-style swipe (mobile)** — 5 items, all ROUTINE, no server change and no new deps. **A1** every poll row on `ChannelPollsScreen` carries "View Full Results →" into `PollDetail`, active or closed (`:601-607`); the header tap still expands, because expanding is how you VOTE on that screen and stealing it would have traded a feature for a regression. Typed with a one-route local `NavigationProp` — `RootStackParamList` is the deep-link list and omits the chat stack, and `useNavigation<any>()` (the convention in PollCard/ChatInfo) would have added a lint warning. **A2** "New Poll" button + the existing `CreatePollModal` on the Polls list (`:866-882`, `:903-910`), gated by a restatement of the composer's own rule (ruling I5 A): group chat = any member, team/club = `is_channel_staff`, and `channelType === null` CLOSES the gate; `channel_type` is one extra column on the channel read the screen already made, no new query. **A3** no Polls tile on a DM — the whole quick-access row is skipped (Files/Links were already hidden), gated on the ROW's `is_direct_message`, because the route param is `'direct'` on a DM and undefined on a push-opened room. A DM cannot create a poll at all (`DMChatScreen` passes no `onPollPress`), so the tile only ever opened an unfillable empty list. **A4** a team's NON-default channels now title as "Team · channel", closing the Oct 20 FOUND where two channels of one team rendered identically. Default is identified by the **ROW** (`is_default`), never by name — this repo's existing ruling (`channelLeave.ts:110-122`: the default team chat was renamed "announcements" → "Team Chat"). `row.is_default === false` is honoured first; since `get_my_conversations` is **not known** to return that column and prod cannot be queried, one extra read fills the gap (`ChatScreen.tsx:834-866`). The set holds only `is_default === false`, so a failed or unanswered read leaves every title **unchanged**. **B5** swipe = iPhone Messages: the 3.5s auto-close is GONE (`SWIPE_AUTO_CLOSE_MS`/`armCloseTimer`/`clearCloseTimer`, grep 0 hits) and an open row stays open until the next tap outside its action buttons, which is **CONSUMED** via `onStartShouldSetResponderCapture` — capture phase, so the card's TouchableOpacity never fires, on a wrapper INSIDE the dragged view so the claim does not reach the PanResponder and flash the strip. Covered: every card + header, tab bar, club chips and the Hidden header; plus scroll, chat-opened and focus. **NUANCE:** while a row is open, a swipe on another row acts as the closing tap (the capture decision is made at touch-DOWN, where tap and drag are indistinguishable) | *pending — this commit* | **AGENT-ONLY — no device or simulator run.** tsc **64 = baseline** (0 in the 3 touched files); eslint per file **identical warning SET to baseline** — ChannelPolls 1e/25w (the error is pre-existing), ChatInfo 0e/14w, ChatScreen 0e/91w; `npx expo export --platform ios` **exit 0**, 9.03 MB; DONE greps — `navigate('PollDetail'` present in ChannelPollsScreen, New Poll behind `canUserCreatePoll`, DM Polls tile gated, **0** hits for any auto-close timer. Click-through owed, 5 rows incl. ZZ Test Team 0826 — `docs/recon/polls-e2e-mobile-notes.md` §6 | Oct 20, 2026 | AGENT-ONLY |
| **Chat List v2, Stage 3 (mobile)** — **7 of 8 rulings applied**, no open questions. Club crest on team/club avatars + crest/club-name in the open-chat header (null `club_logo_url` → no crest, no placeholder) · club filter chips only at 2+ clubs, filtering by `channel_club_id`, where "the user's clubs" = team clubs ∪ staffed clubs (new union read; the existing `checkClubAdmin` returns at the first source so it only ever yields one) · rich 3-line card · swipe-left Mute+Hide on DM/group, **Mute only** on team/club/default, Recent + By Team but **not Past**, via PanResponder (RNGH not installed, not added) · Hide through `set_channel_hidden` only — **H7** `hidden_at IS NOT NULL AND last_message_at <= hidden_at`, **H4** a new message returns the row with unread intact, nothing marked read, **H5** push untouched · "Hidden (n)" row at the bottom of Recent, expand, swipe to Unhide. The 3 new columns are read **by name** (RPC went 20→23). **Ruling 7 (4g A) needs NO client change** — `get_channel_member_labels` takes only the channel and derives scope server-side; documented at `memberNames.ts:222-243` rather than guessing a `p_club_id`. **UNVERIFIED: the `set_channel_hidden` arg names** (`p_hidden` inferred from `set_channel_announcement_mode(p_channel_id, p_enabled)`); the first Hide proves them and fails loudly if wrong | `fde40bf` · polish `597ce05` · crest gate *pending — this commit* | **AGENT-ONLY — no device or simulator run.** tsc **64 = baseline**, full-output `diff` **empty** (byte-identical); eslint per file all **back to baseline** (ChatScreen 0e/91w, TeamChatRoom 0e/38w, ChatUnreadContext 0e/4w, memberNames 0e/11w, unreadRule 0e/0w, hiddenChats 0e/0w) after removing 7 self-inflicted `no-explicit-any` warnings; `npx expo export --platform ios` **exit 0**; `unreadRule.test.ts` **32/32** (22 existing + 10 new for H7/H4, incl. hidden leaving list AND total in one pass, and archived beating hidden); grep — exactly **one** `set_channel_hidden` call, **zero** direct `hidden_at` writes, Hide gated by `canHideChannelType` (`['dm','group_dm']`), no global-role gate added. Click-through owed — `docs/recon/chatlist-v2-mobile-notes.md` §7. **Click-through RUN on the simulator Oct 20 (Lu) — 5 card defects found and fixed** (§9): the crest now **fills** the avatar circle instead of ringing its corner, with no ball/initials behind it — and, **Lu's Oct 20 follow-up**, it appears ONLY on team/club chats (incl. the default team chat): a DM keeps the person's photo or initials and a group chat its own icon, on the card AND in the open-chat header, through one shared `showsClubCrest` in `lib/chatHelpers.ts` (the corner-ring `ClubCrest` and its 2 styles are deleted — the gate left it with no case). Header reads `channel_type` from the ROW, since the route param is undefined on a push-opened room · the swipe strip is **mounted only while a row is open or dragging** and inset to the card's box, which killed BOTH the grey/purple slivers in the gutters at rest AND tap-and-hold showing "Mute" through the card's `activeOpacity` 0.7 — one root, not two · **4 close triggers** on the one `openSwipeKey` (another row touched · list scroll · chat opened · screen focus) plus a 3.5s self-close after the finger lifts, because closing on lift itself would make Mute/Hide untappable (judgement call, §9.2) · line 1 = **title + time only** (the bare member number is gone), line 2 = preview or **"No messages yet"** (never the channel name / "2 members"), line 3 = badge · mute icon · **"2 members"** · club name. **Latent bug fixed on the way:** the PanResponder read `isOpen`/`width` from the first render's closure, so an already-open row dragged from base 0 and jumped shut. Evidence Oct 20: tsc **64 = baseline**, full-output `diff` **empty**, 0 errors in ChatScreen; eslint ChatScreen **0e/91w**, warning set **byte-identical** to baseline (`conversationSubtitle` deleted with its last call site); `npx expo export --platform ios` **exit 0**, 9.03 MB. Fixes are **AGENT-ONLY** — not yet re-run on the simulator | Oct 19, 2026 · fixes Oct 20, 2026 | AGENT-ONLY |
| **Poll powers follow the CHAT's staff, mobile half of 4i** (`is_channel_staff`, not the global role list). Rulings Oct 18, Lu: **I2 A** anonymous-poll voter names = creator OR channel staff · **I4 A** reminder button = channel staff ONLY (was `staff \|\| creator`; also guarded in both handlers, not render-only) · **I5 A** poll creation in team/club chats = channel staff, group chats any member unchanged · **I7** 4 non-poll `isStaffInChannel` consumers (goal celebration, `/survey`, SurveyPicker, MessageActions) left alone. 5 gate sites / 4 files. `TeamChatRoomScreen.isStaffHere` is now asked for every chat, not only announcement ones — cannot regress the send gate, since `canSendText` is `allowMemberText \|\| isStaff`. PollCard reads `isChannelStaff` from the `usePoll` call that already answered 4d's `canClose`, so **zero new RPCs**; `usePolls.ts` and `channelStaff.ts` have zero diff. **SAME-STONE FOLD-IN: `PollDetailScreen` was asking the unscoped global `user_roles` list**, so any coach on the platform could see who voted on an anonymous poll in another club's chat — now one `isChannelStaff` call | `906568b` | **AGENT-ONLY — no device or simulator run.** tsc **64 = baseline**, only diff a pre-existing error's line shift (`PollCard 842→871`), zero new; eslint per file 0e/38w, 0e/5w, 1e/25w all unchanged, PollDetail **0e/10w → 0e/9w** (one fewer); `npx expo export --platform ios` **exit 0**, 9.01 MB; gate grep — no poll file reads `user_roles`/`STAFF_ROLES` in code, no poll decision reads the label answer. Click-through owed, incl. the coach-of-another-team-in-same-club case — `docs/recon/phaseD-4i-polls-mobile-notes.md` §6 | Oct 18, 2026 | AGENT-ONLY |
| **Fake "Mute user" / "Block user" removed from the message-actions sheet** — both only fired an `Alert` ("has been muted" / "has been blocked") over a `// TODO: Implement … in database`, so the sheet reported a completed moderation action while writing nothing. Ruling **Oct 15, Lu**: Thryvyng has no block feature; Hide and Mute arrive later as Chat List v2 swipe actions. Web never shipped these buttons (re-verified Oct 18), so this **restores parity**. 14 grep hits across 2 files (`MessageActionsModal.tsx`, `TeamChatRoomScreen.tsx`), no third site under `src/`; dead code removed with them: `senderName` prop + fallback, `message.profile` type field, `TONE.neutral`, `styles.actionContent`, `styles.actionDescription` | `1f74a50` | **AGENT-ONLY — no device or simulator run.** tsc **64 = baseline**, `diff` of the two full outputs empty (byte-identical), zero errors in touched files; eslint per file **0e/38w → 0e/38w** and **0e/1w → 0e/1w** (the 1 is pre-existing `onViewProfile` unused); `npx expo export --platform ios` **exit 0**, bundle 9.01 MB; grep sweep re-run **zero hits**. Click-through owed — `docs/recon/phaseD-block-mute-removal-notes.md` §5 | Oct 18, 2026 | AGENT-ONLY |
| **Chat Info — Add / Remove members on `group_dm` chats** (gate widened from `channel_type 'team'\|'club'` to include `'group_dm'`, admin only; this is what unblocked Staff-Message chats like "U40 mens"). Admin cannot remove their own row | *uncommitted* | **Lu sim Oct 14–15** (iPhone 17 Pro simulator, live Metro, uncommitted tree) — Add and Remove both land on a Staff-Message chat; **adding the person back after a Remove works**; no Remove offered on the admin's own row. Build proof: tsc **64 = baseline**, error list byte-identical, zero in touched files; `chatHelpers.test.ts` **48/48** + `chatDays.test.ts` **22/22** in 3 TZs — `docs/recon/chat-info-club-chats.md` | Oct 14, 2026 | VERIFIED-SIMULATOR |
| **Chat Info — Rename** (group chats, admin only; trim, `.select('id')` refusal check, inline message on an empty name) | *uncommitted* | **Lu sim Oct 14–15** (iPhone 17 Pro simulator, live Metro, uncommitted tree) — rename saves and shows at once; clearing the field and saving shows `Enter a chat name.` inline and writes nothing. Build proof: tsc **64 = baseline**, error list byte-identical, zero in touched files; `chatHelpers.test.ts` **48/48** + `chatDays.test.ts` **22/22** in 3 TZs — `docs/recon/chat-info-club-chats.md` | Oct 14, 2026 | VERIFIED-SIMULATOR |
| **Chat Info — Remove confirm says it is chat-only** ("Remove from this chat?" / "…They stay on their team — nothing else changes, and you can add them back."). Carries Lu's Oct 14 ruling | *uncommitted* | **Lu sim Oct 14–15** (iPhone 17 Pro simulator, live Metro, uncommitted tree) — wording seen on a `group_dm` chat. The same string on **team** channels is a separate, unverified row below. Build proof: tsc **64 = baseline**, error list byte-identical, zero in touched files; `chatHelpers.test.ts` **48/48** + `chatDays.test.ts` **22/22** in 3 TZs — `docs/recon/chat-info-club-chats.md` | Oct 14, 2026 | VERIFIED-SIMULATOR |
| **Default team channel still shows no Add / Remove** — `is_default === true` returns false from *both* gates (`ChatInfoScreen.tsx:397` and `:420`), so widening the gate did not leak into server-managed membership | *uncommitted* | **Lu sim Oct 14–15** (iPhone 17 Pro simulator, live Metro, uncommitted tree) — **ZZ Test Team 0826** default team chat, Oct 15: no Add, no Remove. Matters because the prod RPC re-adds exactly there (see Phase D carry). Build proof: tsc **64 = baseline**, error list byte-identical, zero in touched files; `chatHelpers.test.ts` **48/48** + `chatDays.test.ts` **22/22** in 3 TZs — `docs/recon/chat-info-club-chats.md` | Oct 14, 2026 | VERIFIED-SIMULATOR |
| **Staff Message — chat name capped at 100** (`CHANNEL_NAME_MAX`, `StaffMessageScreen.tsx:378`) | *uncommitted* | **Lu sim Oct 14–15** (iPhone 17 Pro simulator, live Metro, uncommitted tree) — the field stops accepting at 100, so the `22001` write error cannot be reached from this screen. Build proof: tsc **64 = baseline**, error list byte-identical, zero in touched files; `chatHelpers.test.ts` **48/48** + `chatDays.test.ts` **22/22** in 3 TZs — `docs/recon/chat-info-club-chats.md` | Oct 14, 2026 | VERIFIED-SIMULATOR |
| **Staff Message — keyboard dismisses** on preset tap, recipient tap and list drag (`Keyboard.dismiss()` in the three handlers + `keyboardDismissMode="on-drag"`; `keyboardShouldPersistTaps="handled"` kept so taps still land on the first tap) | *uncommitted* | **Lu sim Oct 14–15** (iPhone 17 Pro simulator, live Metro, uncommitted tree) — FND-SIM-1, raised and re-checked by Lu. Build proof: tsc **64 = baseline**, error list byte-identical, zero in touched files; `chatHelpers.test.ts` **48/48** + `chatDays.test.ts` **22/22** in 3 TZs — `docs/recon/chat-info-club-chats.md` | Oct 14, 2026 | VERIFIED-SIMULATOR |
| **Staff Message — 2-column preset grid**, radio dropped, gaps tightened, row 52→46pt: ~**6** recipient rows visible, was 2 | *uncommitted* | **Lu sim Oct 14–15** (iPhone 17 Pro simulator, live Metro, uncommitted tree) — **Lu kept the grid** after seeing it (it was flagged as a redesign beyond "less padding", since a 44pt tap target means a stacked row cannot shrink). Build proof: tsc **64 = baseline**, error list byte-identical, zero in touched files; `chatHelpers.test.ts` **48/48** + `chatDays.test.ts` **22/22** in 3 TZs — `docs/recon/chat-info-club-chats.md` | Oct 14, 2026 | VERIFIED-SIMULATOR |
| **Chat Info — a 100-char unbroken name wraps inside the screen**, max 3 lines then ellipsis, rename pencil always visible (`numberOfLines={3}` + `ellipsizeMode="tail"` + `flexShrink: 1`, row `maxWidth: '100%'`, block `paddingHorizontal: 24`) | *uncommitted* | **Lu sim Oct 14–15** (iPhone 17 Pro simulator, live Metro, uncommitted tree) — FND-SIM-2, raised and re-checked by Lu on Chat Info. The other 4 swept sites are a separate, unverified row below. Build proof: tsc **64 = baseline**, error list byte-identical, zero in touched files; `chatHelpers.test.ts` **48/48** + `chatDays.test.ts` **22/22** in 3 TZs — `docs/recon/chat-info-club-chats.md` | Oct 14, 2026 | VERIFIED-SIMULATOR |
| **Remove persists server-side** — the delete is not filtered back by RLS and does not reappear | *uncommitted* | **SQL probe against prod, Oct 15**: after a Remove on channel `9c58bd58-e8ff-4629-beef-d983738c6346`, `cole_memberships` = **0**. This is the row that proves Remove is a real write, not a silently-refused one. Build proof: tsc **64 = baseline**, error list byte-identical, zero in touched files; `chatHelpers.test.ts` **48/48** + `chatDays.test.ts` **22/22** in 3 TZs — `docs/recon/chat-info-club-chats.md` | Oct 14, 2026 | VERIFIED-SQL |
| **Staff Message — empty chat name blocks CREATE** (`StaffMessageScreen.tsx:243-247`; inline `Enter a chat name.`, clears on keystroke; preset auto-fill unchanged). Replaces the `resolveChatName` fallback that silently named the chat after the picked group | *uncommitted* | tsc **64 = baseline**, error list byte-identical, zero in touched files; `chatHelpers.test.ts` **48/48** + `chatDays.test.ts` **22/22** in 3 TZs. **Not seen by Lu in the Oct 14–15 sim pass** — `docs/recon/chat-info-club-chats.md` | Oct 14, 2026 | AGENT-ONLY |
| **Chat-name overflow — the other 4 swept sites.** `GroupInfoScreen` title wrap (both branches) and `ChatScreen` by-team channel row one-line ellipsis (`:1704`). 9 sites audited, 5 fixed; 4 were already safe | *uncommitted* | tsc **64 = baseline**, error list byte-identical, zero in touched files; `chatHelpers.test.ts` **48/48** + `chatDays.test.ts` **22/22** in 3 TZs. **Not seen by Lu in the Oct 14–15 sim pass** — `docs/recon/chat-info-club-chats.md` | Oct 14, 2026 | AGENT-ONLY |
| **Group Info rename — empty name says why** (used to `return` silently, which read as a dead Save button; now the same inline `Enter a chat name.`) | *uncommitted* | tsc **64 = baseline**, error list byte-identical, zero in touched files; `chatHelpers.test.ts` **48/48** + `chatDays.test.ts` **22/22** in 3 TZs. **Not seen by Lu in the Oct 14–15 sim pass** — `docs/recon/chat-info-club-chats.md` | Oct 14, 2026 | AGENT-ONLY |
| **Add picker excludes current members** — `existingUserIds={members.map(m => m.user_id)}` was already wired on the Chat Info `<AddMembersModal>`, so a person already in the chat is not offered again | *uncommitted* | tsc **64 = baseline**, error list byte-identical, zero in touched files; `chatHelpers.test.ts` **48/48** + `chatDays.test.ts` **22/22** in 3 TZs. **Not seen by Lu in the Oct 14–15 sim pass** — `docs/recon/chat-info-club-chats.md` | Oct 14, 2026 | AGENT-ONLY |
| **Non-admins see no Add / Remove / Rename** — all three gates require `myMembershipRole === 'admin'` | *uncommitted* | tsc **64 = baseline**, error list byte-identical, zero in touched files; `chatHelpers.test.ts` **48/48** + `chatDays.test.ts` **22/22** in 3 TZs. **Not seen by Lu in the Oct 14–15 sim pass** — `docs/recon/chat-info-club-chats.md` | Oct 14, 2026 | AGENT-ONLY |
| **Team-channel Remove confirm wording** — the new chat-only string also shows on custom **team** channels (accepted by Lu, copy only). Verified on a `group_dm` above; **not** opened on a team channel in the sim pass | *uncommitted* | tsc **64 = baseline**, error list byte-identical, zero in touched files; `chatHelpers.test.ts` **48/48** + `chatDays.test.ts` **22/22** in 3 TZs. **Not seen by Lu in the Oct 14–15 sim pass** — `docs/recon/chat-info-club-chats.md` | Oct 14, 2026 | AGENT-ONLY |
| **`CHANNEL_NAME_MAX = 100` constant** (`chatHelpers.ts:283`) and the other **3** cap sites: `ChatScreen.tsx:1294` (New Group), `GroupInfoScreen.tsx:264` (Group Info rename), `ChatInfoScreen.tsx:768` (Chat Info rename). `grep "maxLength={100}"` → 0 hits | *uncommitted* | tsc **64 = baseline**, error list byte-identical, zero in touched files; `chatHelpers.test.ts` **48/48** + `chatDays.test.ts` **22/22** in 3 TZs. **Not seen by Lu in the Oct 14–15 sim pass** — `docs/recon/chat-info-club-chats.md` | Oct 14, 2026 | AGENT-ONLY |
| **`AddMembersModal` keyboard `on-drag`** — it already dismissed on pick via `onClose`→`dismiss()`; the drag arm is new. Group Message create was **already correct** (`ChatScreen.tsx:1409` + `:1413`) and was not touched | *uncommitted* | tsc **64 = baseline**, error list byte-identical, zero in touched files; `chatHelpers.test.ts` **48/48** + `chatDays.test.ts` **22/22** in 3 TZs. **Not seen by Lu in the Oct 14–15 sim pass** — `docs/recon/chat-info-club-chats.md` | Oct 14, 2026 | AGENT-ONLY |
| **Staff Message — chat name field** (defaults to the picked group's label, follows the group until the sender types their own, trimmed, empty falls back; names the created channel) | *uncommitted* | tsc **64** (ceiling, zero in touched files); `chatHelpers.test.ts` **48/48** in `America/Denver`, `Asia/Tokyo`, `UTC` (33 existing + 15 new); `chatDays.test.ts` **22/22** unchanged. **sim run Oct 14** — "follows group until edited; 'U40 mens' kept". Covered by 5 cases: follows-group, stays-as-typed, trimmed, empty→default, clearing hands it back. | Oct 14, 2026 | VERIFIED-SIMULATOR |
| **Staff Message — recipient search** (case-insensitive, any part of the name; hides rows only — never changes who is checked, and "N recipients" still counts every checked person) | *uncommitted* | tsc **64** (ceiling, zero in touched files); `chatHelpers.test.ts` **48/48** in `America/Denver`, `Asia/Tokyo`, `UTC` (33 existing + 15 new); `chatDays.test.ts` **22/22** unchanged. **sim run Oct 14** — "search cole → 1 recipient". Covered by 4 cases, including "a person hidden by the search stays unchecked" and the count staying at 3 while 2 rows show. | Oct 14, 2026 | VERIFIED-SIMULATOR |
| **Staff Message — select all / deselect all** (label flips on whole-group state; acts on the whole group, not the search-visible rows; send stays disabled at 0) | *uncommitted* | tsc **64** (ceiling, zero in touched files); `chatHelpers.test.ts` **48/48** in `America/Denver`, `Asia/Tokyo`, `UTC` (33 existing + 15 new); `chatDays.test.ts` **22/22** unchanged. **sim run Oct 14** — "Deselect all → 0, Send disabled". Covered by 6 cases: label flip, empty group never offers Deselect all, whole-group action under an active search, outside-group exclusions preserved, and 0→empty insert batch. | Oct 14, 2026 | VERIFIED-SIMULATOR |
| **Phase C — Players chip** (team-channel member filter) | `3fd26a0` | **sim run Oct 14** — "chip shown, filters players". Build proof: tsc 70 → **64** (zero in touched files), `chatHelpers.test.ts` **33/33** in 3 TZs — `docs/recon/phaseC-mobile-build.md` | Oct 14, 2026 | VERIFIED-SIMULATOR |
| **Phase C — DM date separators** | `3fd26a0` | **sim run Oct 14** — "Yesterday/Today in DM". Build proof: tsc 70 → **64** (zero in touched files), `chatHelpers.test.ts` **33/33** in 3 TZs — `docs/recon/phaseC-mobile-build.md` | Oct 14, 2026 | VERIFIED-SIMULATOR |
| **Phase C — manage members on custom team channels** (`AddMembersModal`, add + remove, default channels excluded) | `3fd26a0` | **sim run Oct 14** — "add + remove Cole on zz-test-m". Build proof: tsc 70 → **64** (zero in touched files), `chatHelpers.test.ts` **33/33** in 3 TZs — `docs/recon/phaseC-mobile-build.md` | Oct 14, 2026 | VERIFIED-SIMULATOR |
| **Phase C — one role-label function** (`formatRoleLabel`, 5 call sites) | `3fd26a0` | **sim run Oct 14** — "Cole = Head Coach in Chat Info (was Team Manager)". Build proof: tsc 70 → **64** (zero in touched files), `chatHelpers.test.ts` **33/33** in 3 TZs — `docs/recon/phaseC-mobile-build.md` | Oct 14, 2026 | VERIFIED-SIMULATOR |
| **Phase C — FND-A Staff Message**: send fix + recipient uncheck | `3fd26a0` | **sim run Oct 14** — "chat created, Members (2), unchecked staff excluded". Build proof: tsc 70 → **64** (zero in touched files), `chatHelpers.test.ts` **33/33** in 3 TZs — `docs/recon/phaseC-mobile-build.md` | Oct 14, 2026 | VERIFIED-SIMULATOR |
| **Phase C — DM celebrate crash fix** | `3fd26a0` | **sim run Oct 14** — "'happy birthday' → confetti, no crash". Build proof: tsc 70 → **64** (zero in touched files), `chatHelpers.test.ts` **33/33** in 3 TZs — `docs/recon/phaseC-mobile-build.md` | Oct 14, 2026 | VERIFIED-SIMULATOR |
| **Phase B — FND-1 names**: chat member lists resolve via `get_chat_profiles` app-wide; `'Thryvyng member'` fallback; email guard at the write boundary (`reply_to_sender`, `evaluator_name`) | `da2e565` | Human-observed on the **iOS simulator Oct 13** (handoff Oct 13). Build-time proof: tsc **70 before / 70 after**, zero new zero fixed; pure-logic smoke **22/22**; grep proof of the data path — `docs/recon/phaseB-mobile-cosmetics.md` §Proof (that doc self-labels "NOT verified: on-device rendering" as of write time). | Oct 13, 2026 | VERIFIED-SIMULATOR |
| **Phase B — club-announcements member list hidden**, count only ("N members", no roster, no sort control) | `da2e565` | Same simulator run, Oct 13 (handoff Oct 13); `isDefaultClubChannel` covered by the 22/22 logic smoke — `docs/recon/phaseB-mobile-cosmetics.md` | Oct 13, 2026 | VERIFIED-SIMULATOR |
| **Phase B — role filter chips** in both add-people pickers (`GroupInfoScreen` Add Members, `ChatScreen` new-group Add People) + latest-wins guard on the group search | `da2e565` | **sim run Oct 14** — "Coaches chip → only Cole" (was UNVERIFIED at seed). Build proof: `contactRoleGroup` / `presentRoleGroups` in the 22/22 logic smoke, tsc delta 0 — `docs/recon/phaseB-mobile-cosmetics.md` | Oct 13, 2026 | VERIFIED-SIMULATOR |
| **Stone B2 S2a — leave group / archive / handover UI** (`src/lib/channelLeave.ts`: `canLeaveChannel`, `leaveChannel`, copy; surfaced in `ChatInfoScreen` + `GroupInfoScreen`), DB-gated by migration `20261013013626` | `920c7d5` | **11/11 click-through reported in handoff Oct 13; device/SQL split not on record.** The only record in this repo is `docs/recon/stone-b2-s2a-build-oct12.md:178` — "Not verified on a device/simulator" — plus zero tsc delta vs the 70 baseline. See Open gaps. | Oct 13, 2026 | UNVERIFIED |
| **Stone B chat counters, observed arm** — past-team rows quiet (clock icon, gray dot, no number); retired team's unread excluded from the tab total; `bell-off` icon on muted rows; muted chats still count toward the tab total; exact (uncapped) bell count | `bfe297b` | Human-observed on the **iOS simulator Oct 11, 5 PASS / 0 FAIL on those five** — `docs/recon/badge-stone-b-freshness-oct10.md` §"Simulator test Oct 11" | Oct 11, 2026 | VERIFIED-SIMULATOR |
| **Stone B chat counters, structural arm** — one shared `get_my_conversations` fetch (`ChatUnreadProvider`, mounted in `AppNavigator`); `classifyConversationRows` makes the tab total the sum over the rows the list shows; icon-badge write keyed on `syncTick` | `bfe297b` | `src/utils/unreadRule.test.ts` **23 pass**, including the invariant `total === sum(mainRows)`. This arm is the **fix for the one Oct 11 simulator FAIL** (row showed `2`, tab badge showed nothing until background→foreground) and **no post-fix simulator or device run is recorded**. App-icon badge number is **not observable on the simulator** — needs a physical phone on a 1.0.18 dev build. `docs/recon/badge-stone-b-freshness-oct10.md` §"What this prompt changed", §Unverified | Oct 11, 2026 | AGENT-ONLY |
| **Chat truthfulness batch** — real send errors (`SendResult`, no silent drops); replies with quote chip; `MessageReadHistoryScreen`; no email fallback in names; 5-minute message edit; local-day dividers fixed; `logError` across chat | `95821b2` | "sim pass Oct 10" (commit message). Findings B1/B2/B3/F2 traced line-by-line in `docs/recon/chat-stack-oct10.md`; `docs/recon/stone-b2-leave-group-mobile-oct12.md` records those findings as resolved (its line cites now stale) | Oct 10, 2026 | VERIFIED-SIMULATOR |
| **Attendance — silent read failure hardened** (stale-not-wrong, warns in prod) | `9772305` | "device pass 7/7 **on sim** Oct 10" (commit message) + `docs/recon/rsvp-t1-findings-oct10.md` (the zztest1 parent-with-4-children case: 1 Going / 0 Can't go / 4 No reply) | Oct 10, 2026 | VERIFIED-SIMULATOR |
| **Attendance one truth** — latest-wins resolver (`src/utils/attendanceResolver.ts`), upsert RSVP writer, zombie `AttendanceScreen` removed | `13dfb4c` | "agent-verified 25/25; device test **PENDING**" (commit message). The two-model map behind it: `docs/recon/rsvp-attendance-oct09.md` (`cal_event_rsvps` vs `event_attendance`; RLS/constraints/triggers there marked INFERRED) | Oct 9, 2026 | AGENT-ONLY |
| **Picker — Done closes every picker sheet** (Start→End advance and the `fieldKey`/`doneLabel` API removed; per-type defaults carry the flow) | `3834065` | tsc **70 = baseline** (commit message); `docs/recon/date-picker-current-state.md` updated in the same commit. Landed **after** the 1.0.17 bump (`5a0939e`, same day) — whether it is inside the store build is **UNKNOWN** | Oct 8, 2026 | AGENT-ONLY |
| **Overlay date/time sheet** — `DateTimeSheet.tsx` (draft+commit) replaces inline spin pickers at **all 11 sites**; iOS sheet / Android native dialog + dismissed-reset fix; per-type start cascade (game −45/+90, practice −10/+75) fires once on Done; Cancel restores; payloads unchanged | `09c3a1d` | **in stores 1.0.17, Oct 8** (handoff Oct 13). No device or simulator check is recorded in this repo; commit-time proof was tsc 70 = baseline with "device pass pending 1.0.17". Baseline map: `docs/recon/date-picker-current-state.md` | Oct 8, 2026 | UNVERIFIED |
| **Series-delete notify dialog + calendar fallback on push tap** (count from the delete's own id array; notify before the row drop; nested `CalendarTab` route) | `00e83e7` | "0 new tsc errors, single-delete flow unchanged; device pass pending 1.0.17" (commit message) | Oct 7, 2026 | AGENT-ONLY |
| **Notify-team dialog on event edit / cancel / delete** — diff-gated over 10 fields (fixes the always-true time diff); reuses `notify-team-event`; delete notifies before the row drop | `caa2787` | "20 tests, 0 new tsc errors; device pass pending 1.0.17 regression" (commit message) | Oct 7, 2026 | AGENT-ONLY |
| **C batch — UX polish sweep, 15 items** across comm + attendance surfaces (3 waves) | `bbf2d3c` | "3 waves + **device review**" (commit message). The 22 findings it draws from are catalogued in `docs/recon/ux-smoothness-sweep-oct05.md` (1 blocker / 16 friction / 5 polish; no crashes found) | Oct 6, 2026 | VERIFIED-DEVICE |
| **Member names via `get_team_member_names` RPC** (B3) | `d60592b` | No test record. **Superseded for chat surfaces** by Phase B's `get_chat_profiles` (`da2e565`) — the team-scoped resolver returns an empty map inside a club channel (`docs/recon/phaseB-mobile-cosmetics.md` §FOUND) and still has 5 chat callers left (see Open gaps) | Oct 6, 2026 | UNVERIFIED |
| **Attendance save reports real write results** + unsaved-changes guard (`beforeRemove`) | `3704b7c` | `docs/recon/ux-smoothness-sweep-oct05.md` findings #1/#2 recorded **RESOLVED** in `docs/recon/class2-fixes-oct03.md` §"Addendum Oct 6": "Saved" only when `failed[]` is empty, partial failure names the players. No device or sim run recorded | Oct 6, 2026 | AGENT-ONLY |
| **Reply sender names resolve via `memberNames` first** (4e) — and `Unknown` no longer persists into `reply_to_sender` | `446518a` | `docs/recon/class2-fixes-oct03.md` §"Addendum Oct 5" (3 sites: `TeamChatRoomScreen:436,456`, `DMChatScreen:340`). No device run recorded | Oct 5, 2026 | AGENT-ONLY |
| **Class-2 sweep** — 7 single-row queries converted to count/head or `limit(1)`, each with its error branch handled (`ChatInfoScreen`, `PollDetailScreen`, `RosterScreen`, `TeamDetailScreen`, `useCalendarEvents`, `ChannelPollsScreen`, `ChatScreen`) | `cb7cfcf` | All 7 sites listed before→after with real line numbers in `docs/recon/class2-fixes-oct03.md`; tsc delta 0 against the 70 baseline. Sweep that found them: `docs/recon/bug-class-sweep-oct02.md` (127 call sites, 20 not guaranteed ≤1 row — 7 provable, 13 INFERRED) | Oct 3, 2026 | AGENT-ONLY |
| **Lineup editor UI** — bench names/numbers + slim strip, keyboard-safe picker, measured full-fill pitch with unstretched glyphs, show-numbers toggle, spread 20–80, unified tap/drag transform | `3d33955` | Driven by five device symptoms catalogued in `docs/recon/lineup-master-oct02.md` (saved lineup reopens empty, blank bench jerseys, keyboard covers picker, "?" for number, cramped forward line). That doc marks clipping behaviour **INFERRED** ("no device/screenshot in scope") and lists Android bench-tile clipping as needing a device. No post-fix device run recorded | Oct 2, 2026 | UNVERIFIED |
| **Lineup writes** — every write error checked, snapshot+rollback on failed insert, truthful save alert, `jersey_number` coerced to `int\|null`, bench rows routed by `player_id` | `23e05ec` | `docs/recon/lineup-master-oct02.md`. No device or sim run recorded | Oct 2, 2026 | AGENT-ONLY |
| **Staff-only roster removal** — 3-state bottom sheet wired to `remove_player_from_team` | `57e9dbb` | No test record in this repo. The server function was audited later in `docs/recon/phaseC-audit.md` (its W4 scopes `cc.team_id = v_team_id` — see Open gaps #2) | Sep 17, 2026 | UNVERIFIED |
| **Stone I-lite** — RSVP from calendar cards, merged roster with reasons+sources, coach attendance tab, param-seed fetch fix, attendance context banner, `event_attendance` persistence with `marked_by` | `7cd8db9` | No test record. In **store build 1.0.16** (version bump `42ffbb9`, same day) — INFERRED from commit ordering | Sep 2, 2026 | UNVERIFIED |
| **Stone G** — recurring notify, event validation, arrival on edit, remind-team button, calendar spinner cache, multi-role staff check fix (`EventDetail` + `ChannelPolls`) | `a205bbb` | No test record. In **store build 1.0.16** (INFERRED, same as above) | Sep 2, 2026 | UNVERIFIED |
| **Stone F** — group info via `get_channel_members` RPC, admin gating, remove member, keyboard-safe add modal, debounced search, `createGroup` creator-exclusion + rollback, leave `popToTop` | `03b44ab` | No test record. In **store build 1.0.16** (INFERRED). Its keyboard pattern is the reference cited by later work (`docs/recon/lineup-master-oct02.md`) | Sep 2, 2026 | UNVERIFIED |
| **Chat core batch** — realtime hub (one shared `comm_messages` listener fanned out), chat list via `get_my_conversations` in one round trip, attachments upload-first with 25MB/MIME validation + viewer, polls hardening, inverted-FlatList rooms with jump-to-bottom, sender labels via RPCs, shared `isUnreadMessage` rule, mute affects notifications only, push banner suppressed for the open channel + typing indicator | `89c6697` `e769e7f` `3c41601` `0586b89` `0da0058` `e93bddf` `413ef36` `d9b5eee` `f7a37c3` | No test records in repo or recon. In **store build 1.0.16** (INFERRED from the `42ffbb9` bump). Later recon maps this stack: `docs/recon/chat-stack-oct10.md`, `docs/recon/badge-counters-mobile-oct09.md`, `docs/recon/identity-resolution-oct02.md` | Sep 1, 2026 | UNVERIFIED |

### Recon-only, nothing built (do not plan these as already built)

| Doc | Subject | Date |
|---|---|---|
| `docs/recon/games-audit.md` | 7 cognitive games, 10,434 lines, static audit at `3834065` | Oct 9, 2026 |
| `docs/recon/games-redesign-notes.md` | Games redesign decisions + Anticipation Arena prototype v3 / Stage-4 mockups — "nothing here is built in the app yet" | Oct 9, 2026 |
| `docs/recon/calendar-add-permission-oct12.md` | Why a `team_manager` cannot add calendar events — see Open gaps (client-side) | Oct 12, 2026 |
| `docs/recon/deeplinks-audit.md` | Deep-link stack (`linking.ts` prefixes, routes) | Aug 15, 2026 |
| `docs/recon/identity-resolution-oct02.md` | Every id→name site and its fallback string; RPC vs RLS-blocked direct `profiles` read | Oct 2, 2026 |

---

## Planned

- **Unified chat builder** — merge Staff Message into Group Message; filters by role, age
  group, gender, season. Needs data recon first (team age/gender/season fields).
  Ruled Oct 14, Lu: after 1.0.18.

---

## Decisions

- **Oct 26 — STANDING LAYOUT RULE (R-G): text never overflows its container.** Any label,
  count or button caption must fit its box at the narrowest supported width (375pt, iPhone
  SE / 13 mini) or be shortened, wrapped deliberately, or given `numberOfLines` with a
  layout that cannot clip. Ruled by Lu after the Oct 26 device look, where "Can't go" ran
  past the list card's edge, "Will you be there?" wrapped to three lines and
  "🔔 Remind 19 to RSVP" truncated. Applies to every new surface, not only the calendar.
- **Oct 26 — OPEN RULING, NOT YET DECIDED: "Remind {n}" — label vs recipients.** The
  reminder button's NUMBER now reads the roster no-reply resolver (`noReplyFromRoster`),
  but `handleSendReminder` still notifies the ACCOUNT list (`nonResponders`: `team_staff`
  user_ids + both parent emails per player + player-role users), and its success alert still
  counts those accounts — so the button can read "Remind 11" and report "Notified 19".
  **Option A (RECOMMENDED): unify the recipients** to the parents/players of roster players
  with no answer, so label, alert and recipients are one population. **Option B: make the
  label the account count** and accept that it differs from the Responses bar. A is a change
  to RSVP-adjacent WRITE/send logic and has been gated out of every round so far.
  **NEEDS LU.**

- **Oct 14** — add-people picker stays search-first (2+ letters); chips filter results.
  Ruled by Lu (web + mobile).
- **Oct 14** — **removing someone from a chat is chat-only.** It deletes one
  `comm_channel_members` row and never touches team roster, club membership,
  player/parent records, invitations, registration or payments. Re-adding = admin taps
  Add. Ruled by Lu; implemented in the Chat Info confirm copy and proved against repo
  code in `docs/recon/chat-info-club-chats.md` §Step 0 c).
- **Oct 14** — **Chat Info's Add / Remove / Rename applies to ALL `group_dm` chats**, Staff
  Message and regular Group Message alike, not only Staff Message. Raised as wider than the
  original goal; **accepted by Lu**.
- **Oct 14** — **the new chat-only Remove confirm wording also shows on team channels.**
  Raised as the one team-chat-visible change; **accepted by Lu**. Copy only.
- **Oct 14** — **an empty / whitespace chat name is blocked on CREATE as well as rename.**
  One rule for every chat-name field. Ruled by Lu. Staff Message changed; Group Message
  (`ChatScreen.createGroup:783-786`) already blocked and was left alone.

---

## Known side effects

- **Push to `main` in *this* repo triggers nothing automatically.** EAS builds are manual,
  so a commit here does not reach users. *(INFERRED — handoff Oct 13; nothing in this repo
  defines a mobile CI/deploy.)*
- **Push to `main` in the web repo (`thrive-and-score`) = Vercel production deploy.**
  *(handoff Oct 13.)* That is also where every chat migration lives — this repo holds
  exactly one migration, `20250224000000_notify_lineup_published.sql`.
- **The migration ledger is not proof of prod state.** Chat migrations are applied by
  pasting into the Supabase SQL Editor and then `supabase migration repair --status
  applied` (HOW TO APPLY block at `20261013013626_stone_b2_s1_chat_permissions_leave.sql:39-45`).
  Any RLS/RPC claim read from a migration file carries a prod-drift warning —
  `docs/recon/phaseC-audit.md` header.
- **`tsc` has never been green here.** Baseline **70** error lines; the adopted gate is
  *error count unchanged vs HEAD*, not "tsc passes" (`docs/recon/class2-fixes-oct03.md`).
  Phase C lowered the baseline to **64**.
- **No lint, no test runner wired.** `package.json` has no `lint` or `test` script; the repo
  carries a legacy `.eslintrc.json` while `eslint@9.39.4` demands `eslint.config.js`, so
  `npx eslint` fails outright (`docs/recon/phaseB-mobile-cosmetics.md` §"Lint status").
  Smokes are run by hand-compiling with `npx tsc` and `node --test` — the re-run recipe is
  at the end of `docs/recon/phaseC-mobile-build.md`.
- **The iOS simulator never displays app-icon badges.** `xcrun simctl push` with
  `aps.badge=7` showed nothing, twice. Any app-icon badge claim needs a physical phone
  (`docs/recon/badge-stone-b-freshness-oct10.md`).
- **Stone B moved chat-row fetching to app start** (`ChatUnreadProvider` mounted in
  `AppNavigator`), not to Chat-tab open: slightly more startup work, and the reason the tab
  badge is now correct on any tab without opening Chat.
- **Payments never move the roster backwards.** Cancel, refund and failed payment
  touch `orders`, `commissions` and `registration_payments` only — never roster,
  registration status, team membership or chat membership. Only a *successful* payment
  moves the roster, forward (rosters + activates). There is no subscription-cancel
  handler at all. Source: `docs/recon/removal-payments-dprep.md` §3, recon Oct 14
  (`stripe-webhook/index.ts:3083-3199`; forward path `:1252-1306`).

---

## Open gaps (server-side, Phase D)

1. **Reactions are not live.** `comm_message_reactions` is absent from publication
   `supabase_realtime` — **SQL-proven Oct 13** (handoff Oct 13); predicted as cause 1 in
   `docs/recon/phaseC-audit.md` §"Why Metro logs `comm_message_reactions CHANNEL_ERROR`".
   Likes therefore never arrive live. Fix is the one-line
   `ALTER PUBLICATION supabase_realtime ADD TABLE comm_message_reactions;`
2. **A removed player's family stays in club-announcements.** `remove_player_from_team`'s W4
   scopes `cc.team_id = v_team_id` (`20260917120000_remove_player_from_team.sql:229-232`)
   and club channels have `team_id` NULL. The default club channel also cannot be left
   (`is_channel_leavable` requires `is_default IS NOT TRUE`), and the DELETE policy's
   other-person arm needs a **channel admin**, which no client UI can confer.
   **No client-only fix exists** — Phase C item 3 excluded club-announcements for exactly
   this reason (`docs/recon/phaseC-mobile-build.md` §"Not done, and why").
3. **FND-C — `get_channel_member_labels` team-NULL widening.** When
   `comm_channels.team_id IS NULL` every branch widens
   (`20260902090000_*.sql:108-111`): in a group or club chat a person reads `'staff'` if they
   are `team_staff` on **any** team, and the player branch has no team scope at all. This is
   why `GroupInfoScreen.memberSubtitle` stays coarse. Server fix only.
4. **Poll staff arm — server allows the creator only.** `comm_polls_update` grants update to
   the poll creator, so the Phase B item "staff can manage any poll" was **SKIPPED with no
   file touched** and carried forward (`docs/recon/phaseB-mobile-cosmetics.md` §Item 2).
5. **"Staff-only messaging" is client-only; the server lets any member post.**
   `comm_channels.allow_member_text` is read and toggled by both apps
   (`ChatInfoScreen.tsx:179-184`, `:321-327`; web `MessageInput.tsx:70`), but **no RLS
   policy and no trigger reads the column** — it appears in exactly one migration, the
   `ADD COLUMN` that created it. The live INSERT rule is membership-only
   (`20260108184412:392-397`), so any channel member can bypass the toggle with a direct
   insert. Phase D, server fix. Source: `docs/recon/removal-payments-dprep.md` §4b, recon Oct 14.
6. **Read receipts are NOT a new build — the computation already exists.** "Seen by N of M"
   is already computed from `comm_channel_members.last_read_at` vs the message's
   `created_at` in `MessageReadHistoryScreen.tsx:73-137`, which already renders
   "Read by N" / "Not yet (N)" (`:136-137`). **No new table is needed.** Caveat, already
   written in that file (`:8-13`): `last_read_at` is a per-channel watermark, not a
   per-message receipt. The one thing to check first is whether the co-member SELECT
   policy is as wide in prod as the captured drift says
   (`20260902090000:24-28`) — if narrower, the count silently undercounts today.
   Source: `docs/recon/removal-payments-dprep.md` §4a, recon Oct 14.
7. **SACRED — the 5-minute edit window is CLIENT-SIDE ONLY; the server has no time bound.**
   `comm_messages`' UPDATE policy is author-only (`user_id = auth.uid()`), so the ONLY thing
   stopping an author editing a six-month-old message is a hidden button: the window lives at
   `EDIT_WINDOW_MS = 5 * 60 * 1000` in `src/components/chat/MessageActionsModal.tsx`, which
   decides whether the Edit row *renders*, and the write adds `.eq('user_id', user.id)`
   (`useMessages.ts:572`) — a third author check, not a time check. Edit itself is
   **VERIFIED-DEVICE** (Lu, Oct 25: edit inside 5 min works, "(edited)" shows, no Edit offered
   on an old message), so this is not a broken feature — it is an unenforced rule.
   **Fix is a POLICY CHANGE = SACRED, pending Lu's yes:** either a
   `WITH CHECK (now() - created_at < interval '5 minutes')` arm on the UPDATE policy, or a
   SECURITY DEFINER `edit_message(p_message_id, p_content)` door matching the `close_poll` /
   `set_channel_announcement_mode` shape this codebase already uses twice. **Either way web's
   copy of the gate moves with it.** Not attempted in round 2 by design.
   Source: `docs/recon/chat-actions-v2.md` § ROUND 2 ("SACRED FOLLOW-UP").

### Record gaps

- **Stone B2 S2a leave/archive/handover: the 11/11 click-through has no evidence split.**
  The handoff Oct 13 reports 11/11, but nothing in this repo records which of the 11 checks
  ran on a physical device, which on the simulator, and which were SQL probes. The only
  in-repo record says the opposite (`docs/recon/stone-b2-s2a-build-oct12.md:178`, "Not
  verified on a device/simulator"), so the row stays `UNVERIFIED` until the split is
  written down. One pass recording device vs simulator vs SQL per check closes it.

### Client-side open items (not Phase D — listed here so they are not lost)

- **PLAYBOOK-PANELS-UNVERIFIED — OPEN (recorded Oct 30, 2026).** The reader's three panels —
  **Positions, Formation and Movement** (`src/features/pac-playbook/panels/`, built in M3) — have
  **never been looked at by Lu on a device or a phone**, and no agent round has reached them: every
  screenshot so far has been the cover, a card or Courses. The movement panel's **drag** and its
  **frame rate on a device** are both still UNKNOWN (M3's own note, unchanged through M4, M5-FIX and
  this round). Nothing is known to be wrong with them — there is simply no test record of any kind.
  Source: `docs/recon/playbook-m5-fix.md` § 6.7.

- **PLAYBOOK-COVER-ART-SHAPE — OPEN, option A in place (Lu's call, Oct 30, 2026).** The cover
  sketch ships **whole and centred**: `height` 150 → 75 with the viewBox tightened to the ink's
  bounds, so every stroke survives and the art draws ~189 x 75pt in the middle of the column rather
  than full width. The alternative — `preserveAspectRatio="xMidYMax slice"` at `height={70}`, one
  attribute, full column width, which keeps the goal, the run and both crosses at full scale and
  **loses every player circle** — was NOT taken. The arithmetic for why it cannot be both whole and
  full-width is in `docs/recon/playbook-m5-fix.md` § 1. Lu sees it on his phone before this is
  settled either way.

- **COURSES-REDESIGN — OPEN, PARKED, MOCKUP FIRST (Lu, Oct 30, 2026).** The Courses screen got
  two surgical fixes in M5-FIX — the hero banner halved and the Playbook row rebuilt as a featured
  card — and **nothing else on that screen may be redesigned until Lu approves a mockup.** The
  filter chips, the course cards and the 2-column grid are explicitly out of bounds. Found while in
  the file and deliberately left alone, each one a redesign item rather than a bug to sweep:
  (a) **the header row sits under the status bar** — `styles.container` has no top safe-area padding
  and `styles.header` only `paddingVertical: 12`, so the back arrow and "Course Library" are drawn
  at y 0–64 behind the notch; the old hero's `paddingTop: 56` was hiding how close that is. A
  `useSafeAreaInsets()` top on the container is the one-line fix and it moves every row on the
  screen; (b) **"Course Library" is printed twice**, in the header row and as the hero title;
  (c) **"0 Students" in the hero is a literal**, not a count; (d) `backButton`, `backButtonIcon`
  and `headerRight` are **declared empty on purpose** (`docs/recon/stage4-types.md`, Group D) and
  the empty state still renders them unstyled; (e) the Playbook featured card is **the only
  full-width card on the screen** — if the redesign widens the course cards, its band height (120)
  and `marginHorizontal` (16) should come from one place. Source: `docs/recon/playbook-m5-fix.md`
  § 5.

- **PLAYBOOK-MOBILE-UNROUTED — CLOSED Oct 30, 2026 by M4.** The reader is a real route
  (`Playbook`, root stack, `AppNavigator.tsx:856`, lazy), reachable from three app surfaces, and the
  FIRST REAL FETCH against the live database has happened and rendered — `docs/recon/playbook-m4.md`
  § 5, `docs/recon/m4-looks/05-real-route-cover.png`. The lazy rule the gap was written to protect
  HOLDS and is now proved on a running simulator, not by a grep: no `PLAYBOOK-MODULE-EVAL` at boot,
  1194 modules bundled and evaluated only on navigating to the reader. What REPLACES this gap is not
  a defect but a switch: `PLAYBOOK_LIVE = false` keeps the route and all three entry points invisible
  until Lu flips it (see `PLAYBOOK-LAUNCH-SWITCH-MOBILE` below). The M1/M3 text follows for the
  record.

- **(M3's text) PLAYBOOK-MOBILE-UNROUTED (opened Oct 30, 2026; STILL OPEN after M3, narrowed) — the Playbook
  is BUILT and the app still cannot reach it.** The text below is M1's and describes M1's state.
  What has changed: M2 added `DiagramBoard.tsx` and M3 the whole reader (shell, 6 screens, 3
  panels, data layer), so the mirrored pure layer IS now imported — by `src/features/pac-playbook/`
  and by nothing else. **No app surface references it:** the only entry point remains the
  `__DEV__` deep link `thryvyng://playbook-dev` behind three gates Metro folds away, and the
  production entry-bundle content hash did NOT move across M3
  (`90794d1bbeaea43b1a1b75a71d506e6e`, the same as M2's), so the module graph provably did not
  change. **M4 closes this** by registering the route and the two entry points; what it needs —
  route name, props, player id, harness status — is `docs/recon/playbook-m3.md` § 3. M1's original
  text follows.

- **(M1's text) PLAYBOOK-MOBILE-UNROUTED — the M1 files exist and NOTHING imports them.**
  `src/features/pac-playbook/` (8 mirrored files + `theme.ts` + `MIRROR.md`) and
  `src/lib/playbookErrors.ts` are in the repo and compile, but no screen, navigator, context or
  dashboard references them: `grep -rl "pac-playbook\|playbookErrors" src` minus those paths is
  **EMPTY**, and the iOS bundle's content hash did not move, which is the proof. This is M1's
  intended end state, not a defect — the pure layer lands first so the mirror can be proven
  byte-identical against the web before anything depends on it.
  **Deliberately NOT done in M1, and each one is a later slice:** `rpc.ts` and `strings.ts`
  (**adapt** — mobile's Supabase client and language hook) and the three hooks
  `usePlaybookBook.ts` / `usePlaybookProgress.ts` / `useQuizRun.ts` are **M2**;
  `DiagramBoard.tsx`, the 6 screens, the 3 panels and the reader shell are **M3** (rebuild — the
  web's are DOM: refs, `querySelector`, rAF-per-frame, `dangerouslySetInnerHTML`); the four
  wiring edits — `AppNavigator.tsx` (+2), `linking.ts` (+1, `Playbook: { card?: string }`),
  `PlayerDashboard.tsx` (+7) and `ClubHubScreen.tsx` (+8) — are **M4**, which closes this gap.
  **Open rulings that gate those slices** (recon `docs/recon/playbook-mobile-recon.md` § E11, in
  the WEB repo): E-R1 entry point, E-R2 whether diagrams animate on a phone — *the single
  largest scope lever in the mobile build* — E-R3 `expo-font` for Archivo (**SACRED, a
  dependency; M1 assumed A = system font and added no `fontFamily`**), E-R4 the language toggle.
  M1 was built on all four answered **A**.
  **When M4 lands, do not gate it on the bundle byte size** — it is not reproducible here (±1
  byte with no edits, and a different md5 from identical source). Compare the entry bundle's
  content hash, which must change, and the split-bundle count against **0**; whether a `lazy()`
  on the Playbook screen yields a second file or Hermes inlines it is **UNKNOWN** and must be
  measured. Numbers and the method: `docs/recon/playbook-mobile-baseline.md`.
  **M2 (Oct 30, 2026) moved part of this gap.** `DiagramBoard.tsx` is **built** — it was
  listed above as M3, and it came forward because the hit test is what the board is for. The
  three hooks, `rpc.ts` and `strings.ts` are **still not written**, and the 6 screens, the 3
  panels and the reader shell are still M3. Nothing the *app* reaches imports any of it: the
  only entry point is a `__DEV__`-gated deep link to a harness (`PLAYBOOK-DEV-HARNESS` below),
  so a production bundle still contains none of the Playbook. This gap stays OPEN until M4.

- **PLAYBOOK-LAUNCH-SWITCH-MOBILE (opened Oct 30, 2026) — the Playbook is routed and HIDDEN; the flip is
  Lu's, and it is one line.** `src/features/pac-playbook/launch.ts` carries `PLAYBOOK_LIVE = false` and
  `playbookVisible = PLAYBOOK_LIVE || __DEV__`, mirroring the web's file of the same name with one declared
  diff (`__DEV__` for `import.meta.env.DEV`). Five live gates: the route (`AppNavigator.tsx:856`), the
  dashboard card (`PlayerDashboard.tsx:412`), `showPlaybook` (`CoursesScreen.tsx:205`) and the Club Hub card
  (`ClubHubScreen.tsx:42`), plus the definition. **RELEASE = flip the constant to `true` and build. Nothing
  else.** Two things belong in that same commit: delete `src/features/pac-playbook/dev/`
  (`PLAYBOOK-DEV-HARNESS`) and remove or re-gate the `__DEV__` deep-link path `thryvyng://playbook`.
  **KNOWN AND UNLIKE THE WEB:** Vite folds `import.meta.env.DEV` and DROPS the gated markup from a web
  production build; Metro folds `__DEV__` but does NOT fold an imported constant across module boundaries,
  so `playbookVisible` is a RUNTIME `false` here and the gated code is SKIPPED, not removed. Nothing of the
  Playbook is REACHABLE in a store build — the difference is bundle weight, not visibility, and it is not a
  defect to chase. Before the flip, the gates Lu named for the web apply here too (the 5-minute look and the
  Mind chapter review). Full record: `docs/recon/playbook-m4.md` § 2.

- **PLAYBOOK-HEADER-TWO-ROW-MOBILE-ONLY (opened Oct 30, 2026) — mobile's reader header is two rows, the
  web's is one, and the web still truncates.** M4 applied rule R-G and closed
  `PLAYBOOK-HEADER-TITLE-TRUNCATES` on mobile by stacking the header whenever a back label is present
  (`docs/recon/playbook-m4.md` § 4). The web has the same 393pt squeeze and still shows `PAC Pl…`, so the two
  apps are now one design decision apart. **Two options, neither taken — NEEDS LU:** (1) carry the two-row
  header to the web, one ruling and one web change, and the mirror stays honest; (2) accept the divergence
  and write it into `MIRROR.md` as a declared, mobile-only layout answer to a mobile standing rule.
  **Option 1 is a WEB-FIRST change.** `PlaybookHeader.tsx` is a REBUILD, not a mirrored file, so neither
  option breaks the mirror; this is about whether the book looks the same in both hands.

- **PLAYBOOK-LAZY-NO-SPLIT-BUNDLE (opened Oct 30, 2026, INFORMATIONAL — closes an M1 UNKNOWN) — `lazy()` on
  a React Native route yields NO second file.** The M1 note said "whether a `lazy()` on the Playbook screen
  yields a second file or Hermes inlines it is UNKNOWN and must be measured". **Measured:**
  `npx expo export --platform ios` produces **1 bundle and 0 split bundles** with the route registered, and
  the reader's strings ARE in it (`PlaybookScreen 1`, `pac-playbook 1`, `MovementPanel 1`). The lazy boundary
  is real and does its job — nothing of the feature is EVALUATED until the route is navigated to, proved on
  the simulator (`docs/recon/playbook-m4.md` § 5: 1194 modules bundled only on open, 0 `PLAYBOOK-MODULE-EVAL`
  at boot, and no measurable change to app-open time) — but on React Native it buys **evaluation time and
  memory, not bundle weight**. **Do not plan a future slice around shipping the Playbook out of the main
  bundle; it is not something `lazy()` can do here.** The `__DEV__` gates are a different mechanism and DO
  remove code: the harness and its 352 KB JSON are absent from the production bundle.

- **PLAYBOOK-CHALK-EDGE-UNSUPPORTED (opened Oct 30, 2026) — the doodles' chalk edge cannot render
  on mobile, and it is the LIBRARY, not our code.** `src/features/pac-playbook/doodleChalk.ts`
  correctly inlines the web's filter into every mark's own `SvgXml` root (§ E2 Fix 3's ask, done
  and proved), but **`react-native-svg@15.12.1` ships `FeTurbulence` and `FeDisplacementMap` as
  four-line stubs** that `warnUnimplementedFilter()` and return `null`
  (`lib/module/elements/filters/`, list at `lib/util.js:16-18`). The mark draws as the plain
  stroke; confirmed on the simulator (`docs/recon/m3-looks/14-doodle-card-F1.png`,
  `15-doodle-card-P1.png`). **Four options, none taken — NEEDS LU:** (1) accept the plain stroke
  on mobile, zero cost, one visible difference from the web; (2) **drop the chalk edge on the web
  too**, one ruling and one web change, and both apps stay identical — Lu's 2026-10-29 verdict was
  about VISIBILITY, which the 0.40 opacity already fixed; (3) bake the edge into the 13 art strings
  once, offline, in the web repo, so both apps get a crumbly stroke with no filter (mirror-safe,
  but freezes the noise seed into the design); (4) wait for `react-native-svg`. Options 2 and 3 are
  WEB-FIRST changes. Full reasoning: `docs/recon/playbook-m3.md` § 0b.

- **PLAYBOOK-MOBILE-CTA-NOT-STICKY (opened Oct 30, 2026) — the reader's footer scrolls.**
  `playbook.css`'s `.cta` is `position:sticky;bottom:0`, which React Native has no equivalent for,
  and each screen owns its own footer. M3 renders it INLINE at the end of the scroll: the order on
  screen is unchanged (footer last, foot doodle band just before it), but on a long card
  "‹ · Got it · Next ›" is reached by scrolling rather than always present. Closing it means
  lifting the footer out of the `ScrollView` into the shell, which changes every screen's shape.
  **Lu's M5 look is the right place to decide whether it matters.**

- **PLAYBOOK-STATIC-BEATS-ALL-ON (opened Oct 30, 2026) — every beat cell is lit on a static board.**
  The web lights a beat when `tt >= beat.at`; ruling E-R2 = A draws the FINISHED picture, which is
  past every beat, so all cells read `on` — exactly as the web's own reduced-motion hold branch
  does. Honest, and carrying no information. Whether a static board should show the row plain
  instead is a **WEB-FIRST** question, because the web has the same hold branch. Visible in
  `docs/recon/m3-looks/16-card-es.png`.

- **PLAYBOOK-HEADER-TITLE-TRUNCATES — CLOSED Oct 30, 2026 by M4, rule R-G applied.** The header is now
  TWO rows whenever a back label is present: chrome on row one in the web's own order (back left,
  search / home / EN-ES right), title and subtitle on row two at the full column width. Nothing is cut,
  nothing shrank, nothing moved sides; with no back label — the cover, and nothing else — the header is
  still the web's single row. The arithmetic that forced it, and why no shortening was available, is
  `docs/recon/playbook-m4.md` § 4; the look is `docs/recon/m4-looks/04-rg-header-card.png`.
  **OPEN, and it is a WEB question, not a defect: the web still truncates at 393pt.** Mobile moved first
  because R-G is a mobile standing rule, so the two headers are now one design apart. One ruling —
  carry the two-row header to the web, or accept the divergence — closes it. Tracked as
  `PLAYBOOK-HEADER-TWO-ROW-MOBILE-ONLY`. The original text follows.

- **(original) PLAYBOOK-HEADER-TITLE-TRUNCATES (opened Oct 30, 2026, INFERRED severity) — the reader's header
  reads "PAC Pl…" at phone width whenever a back label is present.** The web truncates in the same
  place (`text-overflow:ellipsis` on `.hdr .t b`, `max-width:132px` on `.hbtn`), so this is the
  frozen design behaving as written on a 393pt screen rather than a mobile bug — but standing
  layout rule **R-G** (Oct 26: text never overflows its container) was ruled for exactly this, and
  a title cut to two characters is worth a look. **WEB-FIRST if it changes.** Seen in
  `docs/recon/m3-looks/05-card.png`, `10`, `13`, `16`.

- **PLAYBOOK-DEV-HARNESS — M4's call taken Oct 30, 2026: KEPT, for one milestone only.** The harness,
  `dev/fixtures.ts`, `dev/offlineBook.ts` and the 352 KB frozen JSON are untouched and still
  `__DEV__`-only, all three gates intact, and the production bundle still contains none of them
  (`playbook-dev 0`, `offline-pac-playbook 0`). **The reason M3 gave for deleting them is now live** —
  the reader fetches real boards from `playbook_blocks` (`docs/recon/playbook-m4.md` § 5), so the
  fixtures ARE a second source of truth from today. They survive this commit because M5 is Lu's first
  hands-on look and an offline fallback is worth having while the real reads are new.
  **DELETE `src/features/pac-playbook/dev/` IN THE `PLAYBOOK_LIVE` FLIP COMMIT**, together with the
  `__DEV__` deep-link path `thryvyng://playbook` (`linking.ts:158`). The original text follows.

- **(original) PLAYBOOK-DEV-HARNESS (opened Oct 30, 2026) — remove or keep the `__DEV__` harness at M4.**
  `src/features/pac-playbook/dev/PlaybookDevHarness.tsx` + `dev/fixtures.ts` exist only to
  exercise the M2 board before anything depends on it, and they are reachable only by
  `thryvyng://playbook-dev` in a dev bundle. Three gates hold that: the `lazy()` import is
  `__DEV__ ? lazy(...) : null`, the `RootStack.Screen` is inside `{__DEV__ && … ? … : null}`
  (`src/navigation/AppNavigator.tsx`), and the linking path is
  `...(__DEV__ ? { PlaybookDev: 'playbook-dev' } : {})` (`src/navigation/linking.ts`).
  **The decision at M4 is a real one, not a formality:** `fixtures.ts` is ~14 KB of diagram
  JSON copied out of the web's frozen data file, which becomes a SECOND source of truth for
  that content the moment the real `rpc.ts` fetches it from `playbook_blocks`. Either delete
  `dev/` when the reader can show a real board, or keep it and write into `MIRROR.md` that the
  fixtures are a frozen snapshot, never the live content.

- **BLOCKED Oct 26 — the calendar list card's "?" count is still the wrong source, and the
  approved fix is held on one unanswered RLS question.** The card tallies RSVP **rows** with
  `status === 'pending'` (`CalendarScreen.tsx:256-262`), but a player who never answered has
  **no row at all**, so it shows `? 0` for an event where the detail bar correctly shows 11.
  The one rule exists — `noReplyFromRoster(rosterSize, going, cantGo)`
  (`src/utils/attendanceResolver.ts:214`) — and the list has `going`/`cantGo`; it lacks a
  **roster size**. **There is no roster hook**: the roster source the detail screen and the
  Attendance tab share is the inline `fetchRoster` `useCallback` in
  `EventDetailScreen.tsx:280-294`, a direct
  `players.select(...).eq('team_id', …).order('last_name')`, which is **per event**, so the
  list would use Lu's sanctioned fallback — one batched
  `players.select('id, team_id').in('team_id', teamIds)` per fetch.
  **Why it was NOT built: Lu's condition was "if widening `players` would give a parent a
  different number than staff (RLS), stop and report", and that cannot be answered from this
  repo.** `supabase/migrations/` holds exactly ONE migration
  (`20250224000000_notify_lineup_published.sql`) and **no `players` policy SQL**, and DB
  access is forbidden in these tasks. **Suggestive but NOT proof:** `fetchRoster` already
  runs unfiltered for **every** role on the Details tab, because `roster` feeds the Responses
  bar that parents see too — so either parents can already read a whole team roster, or the
  Responses bar has been under-counting for parents all along. **INFERRED, unverified.**
  **The one check that settles it:** sign in as a parent and as a staff member on the same
  team and compare the Responses bar's roster total on the same event; or read the `players`
  SELECT policy. Until then the list card's "?" is knowingly wrong.
- **Calendar `+` is invisible in the All-Teams view for everyone, staff included**, and
  All Teams is often the default landing state (`CalendarScreen.tsx:411`, `:136-140`); there
  is no empty-state hint. Second candidate cause: the gate reads `team_staff` only, so a
  `user_roles` `team_manager` with no `team_staff` row never sees the button — **INFERRED**
  (`useUserTeams.ts:114-153`, `:383-389`). The `cal_events` INSERT policy itself is
  **BLOCKED** (no policy SQL in this repo). `docs/recon/calendar-add-permission-oct12.md`
- **A permission denial on event create is reported as a connection error** —
  "Failed to create event. Please check your connection and try again."
  (`CreateEventModal.tsx:455-460`, same shape at `:436-441`), with no `logError` and no
  error code surfaced.
- **5 chat callers still resolve names through the team-scoped RPC** and so return an empty
  map inside a club channel: `usePolls.ts:47-48`, `useMessages.ts:95`,
  `useBoardVoteView.ts:74`, `PollDetailScreen.tsx:160`, `ChannelPollsScreen.tsx:149`. Each is
  a one-line swap to `fetchChatProfileNames` (`docs/recon/phaseB-mobile-cosmetics.md` §FOUND).
- **Group Message reports an empty name in a combined Alert**, not inline:
  `ChatScreen.tsx:783-786` alerts "Enter a group name and add at least one person" for
  either failure, so it names two problems when one applies. Chat Info, Group Info and
  Staff Message all use an inline message under the field. Left alone — splitting it is a
  behaviour change the Oct 14 ruling did not name. `docs/recon/chat-info-club-chats.md`
- **ROUTINE — tapping a reply quote does nothing when the original is not loaded.** The
  thread holds the newest 100 rows (`useMessages` `.limit(100)`), so a reply to anything older
  has no target in the list. Round 2 made that case *safe* — the bubble is handed no
  `onReplyPress` at all unless the id is in the memoised `loadedMessageIds` Set, and both
  FlatLists now carry `onScrollToIndexFailed` — so the quote is simply not pressable: no
  crash, no empty jump (R9's wording, and **VERIFIED-DEVICE** Oct 25). **Follow-up is the
  WhatsApp behaviour: load-and-jump** — fetch the page containing the parent, splice it onto
  the thread, then scroll and flash. Touches `useMessages` (a windowed/older-page fetch it
  does not have today) plus both screens' jump handlers. ROUTINE, not SACRED — no policy, no
  schema. Source: `docs/recon/chat-actions-v2.md` § ROUND 2 (R9, tap-to-jump).
- **ROUTINE — promote `ChatToast` app-wide.** `src/components/chat/ChatToast.tsx` (round 2,
  R10) is the app's **fifth** hand-rolled toast and the only one that is a reusable component
  with a hook. The other four are private copies inside screens:
  `ProductDetailScreen.tsx:193-197` (2000 ms), `WorldCupPredictorScreen.tsx:445-447`
  (2500 ms), `PendingAttachmentsBanner.tsx:147-151`, and a comment at
  `EventDetailScreen.tsx:1101`. Moving it to `src/components/` and pointing those three
  screens at it removes the duplication and settles one duration. It was scoped to
  `components/chat/` in round 2 only because those screens were outside that task's SCOPE.
- **`resolveChatName` is dead code.** Its fallback arm is what the Oct 14 create ruling
  removed; no app code calls it now. The export and its 5 tests remain because
  `src/lib/chatHelpers.ts` was in SCOPE for `CHANNEL_NAME_MAX` only. Delete in a later pass.
- **NEEDS LU (decision, not code):** `RoleSwitcher.ROLE_LABELS` and `formatRoleLabel`
  disagree on `player`, `platform_admin`, `content_creator`, `sales_director`. Unifying
  renames switcher entries app-wide, so Phase C did not do it unilaterally
  (`docs/recon/phaseC-mobile-build.md`).
- ~~**Mobile Chat Info shows no Add / Remove / Rename on a Staff Message chat.**~~
  **BUILT Oct 14, sim pending** — the cause was `isCustomTeamChannel` testing
  `channel_type === 'team' || 'club'` while Staff Message inserts `'group_dm'`. Gate
  widened client-only, no server change, as predicted. See the four rows above and
  `docs/recon/chat-info-club-chats.md`.
- ~~**No name input caps channel names at the DB limit.**~~ **BUILT Oct 14, sim pending** —
  `maxLength={100}` on all 4 chat-name inputs (row above). `comm_channels.name` is
  `VARCHAR(100) NOT NULL` (`20260108184412:51`, never altered); uncapped, an over-length
  name was a hard Postgres `22001`, not a truncation.
  Source: `docs/recon/removal-payments-dprep.md` §4c, fix `docs/recon/chat-info-club-chats.md`
- **SACRED — team delete wipes all team chat history, client-side, with no guards and no
  audit.** Six raw client statements delete every `comm_messages` row, all
  `comm_channel_members`, all `comm_channels` for the team, then null every player's
  `team_id` (web `ClubManagementTeamsTab.tsx:427-452`). No money check, no
  `roster_removal_log` row, errors mostly unchecked. **Needs its own slice** — do not fold
  into other work. Source: recon Oct 14, `docs/recon/removal-payments-dprep.md` §2.1

### Verifications still owed

- **Event detail "F1 · one ticket" + design E badge** — seven checks listed in the F1 ledger
  row (one-card Details tab, pill writes, bar matches Attendance, staff gate, Attendance card,
  frames, Maps tap). Supersedes the design-E-only list. On Lu's phone: the badge's darker
  weekday band, day/month body and colour glow; the 92x118 tag beside the detail header and the
  76x96 centred tag in the list card; and the 2pt 45% frame on all three cards (calendar list,
  detail header, Attendance tab). Includes what Option A still owed: full-width detail rows and
  no event-type text in either date column. Built Oct 25-26, 2026, static proof only.
- App-icon badge number on a physical phone, 1.0.18 dev build (simulator cannot show it).
- Bell badge at >99 — only inspected in the style box; the test account showed 34.
- Stone B teams-fetch-failure hold path — in code and reasoned, never exercised.
- Phase C click-through on a **physical device**, 6 items — the Oct 14 pass was on the
  simulator; the checklist in `docs/recon/phaseC-mobile-build.md` is written for a device.

---

## Shipped features (continued — appended after Lu's Oct 26 device pass)

Same five columns and the same `Status` vocabulary as the table above; kept here
rather than spliced into it so the append is reviewable on its own.

| Feature | Commit | Verified how | Date | Status |
|---|---|---|---|---|
| **Calendar & Teams v2 p1 + fix round A** — one DB-assigned team colour (24-hex palette set by a trigger, `teams.color`; both 32-swatch pickers and BOTH client writers removed, read-only swatch + "Color assigned by Thryvyng" in their place), `resolveTeamColor` at ~18 read sites (`src/constants/teamColors.ts`), the positional 8-hex fallback in `useUserTeams` gone; List/Day/Week/Month rebuilt (R-A team colour on leaf/5pt strip/2pt frame, R-C week = one row per day with team-tinted pills, R-D month dots + day panel and Day = 7-day strip over the real list cards, R-E tab order List·Day·Week·Month, R-G 375pt floor); one event-type util (`src/constants/eventTypes.ts`) replacing 3 label sources and 3 `getEventIcon` copies; round A added the shared grey `EventTypeChip`, R-H card hierarchy (team name headline, title hidden when it only repeats the type) and R-J (detail header in the team colour, no event-type hue left on that screen) | `f327f63` | **VERIFIED-DEVICE (partial) — Lu's phone, 2026-10-26:** list card hierarchy and the assigned-colour swatch **seen in screenshots** (posted in chat); one-team filter, the detail screen's team colour and the month pills **on Lu's word** ("working"), not per-check. Static gates at build time: `npx tsc --noEmit` **5 = baseline** (all 5 pre-existing, in `src/components/games/`, 0 in any touched file); `ESLINT_USE_FLAT_CONFIG=false npx eslint` on the 15 then 4 changed files **0 errors**; `npx expo export --platform ios` **exit 0**. **NOT reached from that SCOPE and still true:** `#3B82F6` survives 38× in `src` (37 unrelated chrome + the practice accent in `eventColors.ts`), and 12 team-colour-ish hex literals remain, each reasoned in the build doc §4 — jersey-config `team_color` is a different column, and chat / create-event form / attendance tab were FORBIDDEN carve-outs | Oct 26, 2026 | `VERIFIED-DEVICE` (partial) |
| **Calendar & Teams v2 — fix round B** — R-H′ detail header now reads in the list card's order (team name headline, then the title only when it earns it); R-K opponent as a muted letter-spaced "vs" + name on cards, pills and detail — source is the REAL `cal_events.opponent` column (`src/types/index.ts:205`), written for `game`/`scrimmage` only and also copied into the title by the create/edit forms, with a "vs"-prefixed title as the only route for a tournament; R-L arrival on its own line ("Arrive 4:45 PM"), the inline `· arrive` form gone; R-M chat carries the team colour subtly — list cards get the 4pt left bar in `resolveTeamColor` + the team dot before the name (team channels only, keyed on `team_id`), and the room header gets the dot plus a 2pt accent line under it (`teams.color` added to the embed the crest already reads; no new query). Nothing else in chat touched: no bubble colours, no composer, no send path, no push | `dd9060f` | **VERIFIED-DEVICE — Lu's phone, 2026-10-26, 5/5 on Lu's word** (not per-check screenshots): vs-opponent line, arrival line, detail team headline, team colour in the chat list and the room header. Static gates at build time: `npx tsc --noEmit` **5 = baseline**, 0 in any touched file; `ESLINT_USE_FLAT_CONFIG=false npx eslint` on the 6 changed files **0 errors / 245 warnings** (pre-existing classes); `npx expo export --platform ios` **exit 0** | Oct 26, 2026 | `VERIFIED-DEVICE` |
| **Calendar & Teams v2 — polish rounds 1 + 1b + 1c (event form + palette v2)** — PART A: `TEAM_COLOR_PALETTE` resynced to the DB's **32** colours, grouped by gender (boys 1–16, girls 17–28, coed 29–32); source of truth is web-repo migration `20261026141431`, which superseded the 24-hex `20261026120913`. Mobile reads it for the safety-net fallback only — the app still never writes a colour. PART B, the event form (`CreateEventModal` + `EditEventModal`, which are **two separate components**, not one shared form): R-N date rows read "Thu, Oct 29, 2026" and the date sheet's header gains the weekday under the spinner, live ("Date · Thursday") via a new opt-in `showWeekdayInTitle` prop on the shared `DateTimeSheet` — opt-in so `CreatePollModal`, which was FORBIDDEN here, is untouched; R-O the edit form's one `formatTime` split into `formatTimeForPayload` (24-hour, the `time` columns) and `formatTimeDisplay` (12-hour + AM/PM), so no row shows 24-hour text any more; R-P selected event-type and venue chips are brand purple + white label, unselected neutral, and the green/red/grey venue trio plus the per-type hues from `EVENT_TYPES` and `EventTypeSheet`'s icon column are gone; R-Q the edit form's event-type row is a fixed four-across grid (horizontal `ScrollView` removed, `flex: 1` chips, "Other Event" shown as "Other", `club_event` off the row unless the event already is one); R-R a muted "45 min before start" / "same as start" hint under the Arrival Time value in both forms, hidden when arrival is after start. Cascade defaults, Done-commits-and-closes, Cancel-restores and the Android native dialog path all unchanged **ROUND 1b:** R-S the shared `DateTimeSheet`'s three exits audited and unified — the backdrop already called Cancel, but **swipe-down did not exist** (plain absolutely-positioned `View`, no `PanResponder`), so a drag landed on nothing; added a pan responder on a new grab area (handle + header, claims on move so taps still reach Cancel/Done), dismiss at 80pt or 0.6 velocity, and one `handleCancel` that all four exits (button, backdrop, swipe, Android dismiss) route through; R-R gained its third state ("after start — check this", in each form's existing error red via a semantic `tone` token); the three duplicated helpers lifted into **new `src/utils/eventFormFormat.ts`** (payload serializers deliberately left local, so a 24-hour string cannot wander into a display row). **ROUND 1c:** R-T the Date row and the Start Time row merged into one **"Starts"** row reading "Wed, Oct 28 · 6:00 PM", backed by iOS's native combined wheel (`mode: 'datetime'`, `minuteInterval: 5`) so the weekday rides in the wheel's own column; Android gets the two native dialogs in sequence (the installed picker's `AndroidMode` has no 'datetime'), committing only after both and treating a dismiss at either step as a full cancel; the create form's cascade fires **once** from `commitStarts`, and the chosen day carries arrival/end with it; the all-day case keeps a date-only row, since an all-day event has a day and no start time; payload unchanged — `event_date` and `start_time` are still written separately | uncommitted at time of writing | **VERIFIED-DEVICE — verified on Lu's phone 2026-10-26, rows 1–7 on Lu's word** (combined wheel, purple chips, 12-hour, arrival hint, tap-outside/swipe = cancel, all-day date row, edit form, palette v2 dots). Static gates at build time: `npx tsc --noEmit` **5 = baseline** (all 5 pre-existing, in `src/components/games/`), 0 in any touched file; `ESLINT_USE_FLAT_CONFIG=false npx eslint` on the 5 changed source files **0 errors / 6 warnings** (pre-existing `no-explicit-any` on `Ionicons` names); `npx expo export --platform ios` **exit 0**; palette array length **32, all distinct**; the R-P hex grep over form + both sheets returns **3 matches, all of them prose in comments**. Re-run green after 1b and 1c: tsc **5 = baseline**, eslint **0 errors**, export **exit 0**. Survivors NOT removed, each reasoned: `#ef4444` on validation (`inputError` border, `errorText`) and `#22c55e` on the header Save/Create action and the Uncancel button — see `docs/recon/calendar-teams-v2-build.md` § "Polish round 1". Owed device checks are in that same section and in § "Polish round 1b" and § "Polish round 1c" | Oct 26, 2026 | `VERIFIED-DEVICE` |
| **PLAYBOOK-M1 · the mobile Playbook reader's pure layer, mirrored from the web** — new directory `src/features/pac-playbook/`, nine files copied from `thrive-and-score` @ `83a3686` under the `joinErrors.ts` mirror pattern (the same file, by name, in both repos, so one renderer never becomes two designs): **7 byte-identical** — `diagram/renderDiagram.ts`, `diagram/geometry.ts`, `diagram/heat.ts`, `diagram/tapTarget.ts`, `diagram/types.ts`, `search.ts`, `types.ts` — plus **`src/lib/playbookErrors.ts` byte-identical** (`P0040`–`P0049`, EN + ES) and **`doodleArt.ts` with exactly ONE declared diff**, line 209 `import.meta.env.DEV` → `__DEV__`, the dev-only `?dz=` strength preview, a compile-time constant each bundler folds away. `renderDiagram.ts` and `tapTarget.ts` are the two the recon marks non-negotiable — the first IS the design, and **the server regrades taps by the same rule as the second**, so a fork there is a scoring bug. Provenance lives in **new `src/features/pac-playbook/MIRROR.md`** (one row per file: mobile path · web path · commit · date · status) instead of a header in each file, because a header is itself a diff and `diff -q` is the only cheap drift check — the manifest carries the re-mirror command and the editing rule (**web repo first, always**). **New `theme.ts`** — the stylesheet's 28 `.pbk` custom properties plus the literals its 556 rules repeat (439 `var(--…)` reads) as one typed, exported object: `color`, `typeUnit`, `fontSize`, `fontWeight`, `lineHeightRatio`, `letterSpacingEm`, `radius`, `space`, `lineWidth`, `control`, `layout`, `doodle`, bundled as `playbookTheme`. Pure data — **no imports, no functions, no `StyleSheet`**. Three CSS idioms are carried as ratios for M3 to multiply, not as points: the `calc(13*var(--pbk-fs))` type unit, unitless `line-height`, and `em` `letter-spacing`. **No `fontFamily` key at all** (ruling E-R3 = A: system font, `expo-font` NOT added) — absent rather than translated, so it cannot be half-applied. Deliberately not carried: the chalkboard texture (four stacked gradients, no RN style-object form — an M3 rebuild question) and the doodle opacity scale (`--pbk-dop:.40` is already `STRENGTH[2]` in the mirrored `doodleArt.ts`; a copy would make a second source of truth for one number). **NOTHING IS WIRED** — no screen, no navigator edit, no import from any existing file; the app behaves exactly as before, and `PLAYBOOK-MOBILE-UNROUTED` below tracks it. | *uncommitted at time of writing* | **AGENT-ONLY — static proof only, no device or simulator run, and none is owed yet: M1 ships no UI.** Baselines captured BEFORE any edit and written to **`docs/recon/playbook-mobile-baseline.md`**. Before → after: `npx tsc --noEmit -p tsconfig.json` **5 → 5 = baseline** (all 5 pre-existing, 2 in `AnticipationArenaGame.tsx`, 2 in `DribbleRushGame.tsx`, 1 in `PatternPlayGame.tsx`; **0 in any new file**); `ESLINT_USE_FLAT_CONFIG=false npx eslint src --ext .ts,.tsx` **3 errors / 1933 warnings → 3 errors / 1933 warnings**, byte-identical summary, **0 findings of either kind in the 10 new files**; `npx expo export --platform ios` **exit 0** both times. Mirror proof: `diff -q` silent on all 8 byte-identical files, and `diff` on `doodleArt.ts` returns **exactly one hunk, `209c209`**. `grep -rc "import.meta"` over `src/features/pac-playbook` + `src/lib/playbookErrors.ts` → **0 in every `.ts` file except `doodleArt.ts`, where the 2 survivors are PROSE** (its own header line 3 and the comment at line 203, both explaining this very substitution) — **0 code occurrences**; see FOUND in the M1 report for why rewriting them was rejected. Unrouted proof: `grep -rl "pac-playbook\|playbookErrors" src` minus the new paths → **EMPTY**. **FOUND, and it changes M4's gate: the iOS entry-bundle BYTE SIZE is not reproducible on this toolchain.** Four exports gave 9,055,066 → 9,055,065 → 9,055,065 → 9,055,066 bytes, the **last two from a completely unchanged tree**, and two exports of byte-identical source produced different bytecode (md5 `711d05ee…` vs `adcb9ab8…`, same size, diverging at byte 6,138,269). The stable identity is **Metro's content hash in the file name**, computed over the JS module graph upstream of Hermes: it held at **`896983edfe9c873efab6b8795d8dbf5f` across all four exports**, which is a *stronger* M1 proof than the byte count would have been — the module graph is provably identical, so nothing imports the new files. Split bundles **0 → 0**. The baseline doc records the measurement and tells M4 to compare the hash and the split count, not the size. | Oct 30, 2026 | `AGENT-ONLY` (static) |
| **PLAYBOOK-M2 · `DiagramBoard` on `SvgXml`, static, geometric hit test** — new `src/features/pac-playbook/DiagramBoard.tsx`: one `<SvgXml>` over the mirrored renderer's own string, **drawn once per content change** (the string is memoized, and `SvgXml` memoizes its `parse()` on the string identity). **STATIC by ruling E-R2 = A** — no `requestAnimationFrame` loop at all, where the web runs one per mounted board and replaces the whole SVG ~60×/s. The picture is `render(d, null, …)`, the renderer's own documented "finished picture" and what the web's quiz tap board already passes; it was checked term by term to be **identical to the web's reduced-motion `draw(total)` hold branch**, and the check is also executable — `render(d, null) === render(d, diagTotal(d))` holds for all three fixtures. A two-frame card shows its **last** frame, the same frame `tapTarget()` reads, so picture and hit test cannot disagree. **The hit test is geometry, not the DOM:** `screenToViewBox()` is the web's own formula (`QuizScreen.tsx:130-134`) with `locationX` for `clientX - rect.left`, and `isHit()` is `!!tg && hypot(dx,dy) <= (r || 8)` — the same rule as the web (`useQuizRun.ts:163`) **and as the server's regrade** (`20261028190000_playbook_v1_schema.sql:1640-1677`); a null target makes every tap wrong, as the server's `IF v_tx IS NOT NULL` guard does. No `data-el`, no `querySelector`. **`preserveAspectRatio` is `xMidYMid meet`, passed EXPLICITLY** as a prop rather than left to a default (`SvgXml` spreads its props over the parsed root), and the wrapper `View` carries `aspectRatio: w/h` from the renderer's own `dims()` — so the box matches the viewBox aspect, `meet` adds zero letterboxing, and the conversion is exact. The web gets the same pair by having no attribute (SVG default) plus `width:100%;height:auto` (`playbook.css:125`). Also new, **`__DEV__` ONLY**: `dev/PlaybookDevHarness.tsx` + `dev/fixtures.ts` (3 real diagrams + real heat blobs out of the web's frozen data file), reachable **only** by `thryvyng://playbook-dev` through three gates — `__DEV__ ? lazy(...) : null`, `{__DEV__ && … ? <RootStack.Screen> : null}` (`AppNavigator.tsx`) and `...(__DEV__ ? { PlaybookDev: 'playbook-dev' } : {})` (`linking.ts`). **The mirrored files were not touched.** Full write-up: `docs/recon/playbook-mobile-m2-board.md`. | *uncommitted at time of writing* | **AGENT-VERIFIED ON THE iOS SIMULATOR (iPhone 17 Pro, iOS 26.2) — screenshots in the repo. Lu's own tap on a device is still owed.** Static gates: `npx tsc --noEmit -p tsconfig.json` **5 = baseline** (all 5 pre-existing in `src/components/games/`, **0 in any new file**); `ESLINT_USE_FLAT_CONFIG=false npx eslint src --ext .ts,.tsx` **3 errors / 1933 warnings — byte-identical to the M1 baseline**, and **0 errors + 0 warnings in the 3 new files**; `npx expo export --platform ios` **exit 0**. **The `__DEV__` gates are proven to strip, not merely assumed:** in the production export, `strings` finds **0** occurrences of `playbook-dev`, `PlaybookDev`, `PlaybookDevHarness`, `pac-playbook`, `DiagramBoard`, `withDoodleColors`, `zoom-goal`, `heatblur`, `tapTarget` and the fixture text `the four actions` — against a positive control of **1** for `join-team`, so the grep method is sound. Entry-bundle content hash **`896983edfe9c873efab6b8795d8dbf5f` → `90794d1bbeaea43b1a1b75a71d506e6e`** — it moves because `AppNavigator.tsx` and `linking.ts` are themselves modules in the graph and their source changed; **nothing Playbook is in the bundle**, per the greps above. Split bundles **0 → 0** (no code splitting in the iOS export; the harness's own lazy chunk exists only under Metro in dev, where it bundled separately: *"iOS Bundled 1001ms src/features/pac-playbook/dev/PlaybookDevHarness.tsx (717 modules)"*). On the simulator, through the deep link: 3 boards drawn; **the heat field's `feGaussianBlur` SURVIVES** and the green→yellow→orange→red ramp is visibly blurred; **EN/ES redraws the board** (DEFEND/REGAIN/CREATE/FINISH → DEFENDER/RECUPERAR/GESTAR/DEFINIR, "space · time · deception" → "espacio · tiempo · engaño"); the two synthetic buttons, driven through the board's own `tapAtViewBox` / `tapAtScreen` — the SAME conversion and hit test a finger uses — read **`HIT  synthetic centre · (92.00, 24.00)`** with the answer ring drawn, and **`MISS  synthetic corner · (0.00, 0.00)`**, against `viewBox 100×64 · target (92, 24) r=9`. A standalone node script over the shipped functions agrees exactly (centre HIT dist 0.000, corner MISS dist 95.079, bottom-left MISS dist 100.319). **E-R2 now has a number: the 5 s re-parse loop ran 300 frames in 5000 ms · 60.0 fps · mean 16.7 ms · worst 18 ms** — but that is the **simulator on Mac silicon, one board, a dev bundle**, so it is an UPPER bound and NOT evidence about a phone; the static default stands. **The doodle's chalk edge does NOT survive, as § E2 Fix 3 predicted, and it is REPORTED not fixed (M3):** `grep -c filter doodleArt.ts` is **0** — the art strings carry no filter; the web defines `feTurbulence` + `feDisplacementMap` in a separate `<svg class="pbkd-defs">` and applies it by CSS (`playbook.css:503`), and neither travels with the string. The mark draws with correct colour and geometry, plain stroke. Mirror proof re-run after all M2 edits: `diff -q` **silent on all 8**, `doodleArt.ts` **exactly one hunk, `209c209`**, web repo `git status --porcelain` **empty**. Screenshots: `docs/recon/m2-harness.png`, `docs/recon/m2-harness-tap-hit.png`, `docs/recon/m2-harness-es.png` | Oct 30, 2026 | `AGENT-VERIFIED-SIM` (Lu's device tap owed) |
| **PLAYBOOK-M3 · the mobile reader — shell + 6 screens + 3 panels, and a re-mirror to web `c772111`** — **Act 0a, the re-mirror.** Mobile was at web `83a3686`; `c772111` changed `renderDiagram.ts` (DIAGRAM-LABEL-FIT: `boxWidth()` / `clearBoxes()`, the fix for `RECUPERAR` overrunning its 24-unit box that M2 found on the simulator) and reworded two `doodleArt.ts` comments **on the web, on purpose**, so the mobile copy can now be byte-identical except for the one DEV-flag line. Both re-copied; `MIRROR.md`'s provenance moved to `c772111` and its M1 note about surviving `import.meta` prose is **closed** (`grep -rn 'import\.meta'` over the feature + `playbookErrors.ts` now matches nothing outside the manifest). **Act 0b, the chalk edge — DONE AND STILL BLOCKED, by the library.** New `doodleChalk.ts` (`withChalkEdge`) inlines a `<defs>` + the `feTurbulence`/`feDisplacementMap` filter into EVERY mark's own `SvgXml` root and puts `filter="url(#pbkd-chalk-N)"` on its root `<g>` — the cross-root problem § E2 Fix 3 named is solved, and the string transform is proved. It does not render anyway: **`react-native-svg@15.12.1` ships both primitives as four-line STUBS** whose `render()` calls `warnUnimplementedFilter()` and returns `null` (`lib/module/elements/filters/FeTurbulence.js`, `.../FeDisplacementMap.js`, the full list at `lib/util.js:16-18`); `feGaussianBlur` IS implemented, which is why the heat blur has worked since M2. Confirmed on the simulator — clean strokes, regular dashes. The code STAYS (one regex, one `warnOnce`, correct the day the primitives land) and **no hand-rolled chalk texture was invented**, because that is a web-first design call. `PLAYBOOK-CHALK-EDGE-UNSUPPORTED` below carries four options. **The build: 20 new files, ~5,100 lines, NO new dependency, NO `package.json`, NO migration, NO RPC change, NO navigation-file edit.** Shell `PlaybookScreen.tsx` (the web's `PlaybookReader.tsx` — one component owns the screen state, the trail, the search return and the quiz return, per ruling R-2; `card` is the only route param). Six screens — Cover · Contents (index AND search, one screen two bodies) · Chapter · Card · ChapterEnd · Quiz (entry, countdown, run, result). Three panel FILES / four components — `PositionsPanel`, `FormationPanel` + `NumbersPanel`, `MovementPanel`. **That count matches `playbook-mobile-recon.md` § E exactly — no web drift to report.** Chrome: `PlaybookHeader.tsx` (violet gradient via `expo-linear-gradient`, crest with its `onError` fallback, EN/ES), `Doodles.tsx`, `Fmt.tsx`, `CardBoard.tsx` (the frame/tray/side-band/beats/cue/legend the web's `DiagramBoard` carries — **M2's `DiagramBoard` was NOT touched**), `StillBoard.tsx` (the panels' board). `playbook.css`'s 556 shared rules became **`styles.ts`** (1,267 lines, every value read from `theme.ts`, nothing invented) + **`ui.tsx`** (`Tape`, `Stamp`, `Row`, `Btn`, `Chip`, `Medal`, `Cta`, `SectTitle`, `Icon`, `Legend`). Data layer adapted: `rpc.ts` (same 13 functions, same tables, same columns, this app's client), `strings.tsx` (dictionary VERBATIM; **E-R4 = A** — a feature-local context, state in the shell, because this app has no app-wide language and R-3's intent was 'no second source of truth'), and the three hooks. **M3 IS READ/RENDER ONLY: the four writes exist in `rpc.ts` and are called by NOTHING** — `set_got_it`, `start_quiz`, `submit_quiz`, `send_question` are 4 `TODO(M-later)` call sites (11 markers in all), each showing the web reader's own state plus a labelled EN/ES sentence in the slot ruling R-5 uses for a server refusal. Three platform decisions, each recorded: `.cta` is **inline, not sticky** (no RN `position:sticky`; order unchanged) — `PLAYBOOK-MOBILE-CTA-NOT-STICKY`; **static beats read ALL ON** (the finished picture is past every beat, which is the web's own reduced-motion hold branch) — `PLAYBOOK-STATIC-BEATS-ALL-ON`; and the **movement panel keeps its drag without a per-frame XML parse** — the pitch backdrop is the mirrored `backdrop()` parsed ONCE through `SvgXml`, the 11 players, their role tags and the ball are `react-native-svg` COMPONENTS over it sharing the viewBox, so a drag moves props on native views; `mvBlend()` is the web's line for line. `StillBoard`'s tap-a-number is geometric (`SvgXml` drops `data-el`) with `TAP_SLACK = 2.2` viewBox units, nearest-wins — a separate component from M2's quiz hit test on purpose. Full write-up, including the web→mobile file map and every write point: **`docs/recon/playbook-m3.md`**. | *uncommitted at time of writing* | **AGENT-VERIFIED ON THE iOS SIMULATOR (iPhone 17 Pro, iOS 26.2) — 18 screenshots in the repo. Lu's own look and every tap are M5, and NOTHING ran against prod.** Mirror proof vs web `c772111`: `diff -q` **silent on all 8**, `doodleArt.ts` **exactly one hunk, `209c209`** (3 lines of output), and the dev data file **byte-identical** to the web's frozen `pac-playbook-v2-FINAL-data.json`. `npx tsc --noEmit -p tsconfig.json` **5 = baseline** (all 5 pre-existing in `src/components/games/`, **0 in any new file**). `ESLINT_USE_FLAT_CONFIG=false npx eslint <27 touched files>` **0 errors** / 28 warnings (24 inline-style, 4 `no-console` — the `console.warn`s are the web's own); repo-wide **3 errors / 1961 warnings** against the M1/M2 baseline 3 / 1933, **errors unchanged**. `npx expo export --platform ios` **exit 0**, 1 bundle, **0 split bundles**. **The lazy rule is proved harder than a grep: the production entry-bundle CONTENT HASH is `90794d1bbeaea43b1a1b75a71d506e6e`, BYTE-IDENTICAL TO M2's** — the module graph did not move for the 20 new files or for the 352 KB dev JSON. `strings` over that bundle: `playbook-dev` 0 · `PlaybookScreen` 0 · `pac-playbook` 0 · `CoverScreen` 0 · `MovementPanel` 0 · `pbkd-chalk` 0 · `playbook_books` 0 · `offline-pac-playbook` 0 · 'The simple game' 0 · 'Open the playbook' 0 · 'Move as one' 0, against a positive control of `join-team` **1**. On the simulator, through the `__DEV__` deep link and the new **Open reader** entry, over an OFFLINE book built from the frozen content file the prod seed itself was generated from (7 chapters · 69 cards · 51 diagrams · 8 dealt Q): **all 6 screens and all 4 panel components drawn**, one PNG each in `docs/recon/m3-looks/` — cover, contents, contents-searching, chapter, card `F3` with its side band, questions & notes with a coach reply, quiz entry, a running question, **results GOLD 8/8**, the positions heat map (blur surviving), 4-3-3 formation, the numbers table, and the movement board with 11 players, role tags and the ball. **Spanish verified end to end** (`16-card-es.png`: header, crumb 'Tarjeta 1 de 6', title 'El juego simple', the verbs grid AND the diagram redrawn DEFENDER/RECUPERAR/GESTAR/DEFINIR). **Doodle check: PASS on two of three** — two cards carry visibly DIFFERENT marks (`F1` = thirdman, `P1` = press with its green accent), no mark falls outside the column (each is a row of the scroller, so overlap is impossible by construction), and `?dz=3` visibly moves the strength; **the chalk edge is NOT visible**, per act 0b. **NOT-COMPARED against the web reader** — `localhost:8080` answers 200 but there is no browser tool on this machine and `WebFetch` refuses dotless hostnames; the `react-native-svg` source proof stands in its place. Every screen was reached by DEEP LINK, not by a finger: `xcrun simctl` has no tap verb and neither `idb` nor `cliclick` is installed here, so the harness parses its own query string with `expo-linking` (`?open=reader&screen=…&ch=&id=&q=&start=&autoplay=&y=&lang=&dz=`) — **`linking.ts` and `AppNavigator.tsx` were NOT edited**. | Oct 30, 2026 | `AGENT-VERIFIED-SIM` (Lu's look + every tap owed; no prod read executed) |
| **PLAYBOOK-M4 · the reader becomes a real route — registration, the launch switch, three entry points, rule R-G** — **`PLAYBOOK-MOBILE-UNROUTED` is CLOSED.** The route is **`Playbook`** on the **root** stack (`src/navigation/AppNavigator.tsx:856`), not a tab stack, because its three doors sit in different places and a `navigate()` bubbles up — one registration, one lazy boundary. The component is `lazy(() => import('../features/pac-playbook/PlaybookScreen'))` through the existing `LazyScreen` + `Suspense` helper; the only param is `card`, the web's `?card=` (`linking.ts:97`), and `offline` is NOT reachable from the route. **The launch switch is new and mobile-only** — `src/features/pac-playbook/launch.ts`, 35 lines, `PLAYBOOK_LIVE = false` and `playbookVisible = PLAYBOOK_LIVE || __DEV__`, mirroring the web's file of the same name with ONE declared diff (`__DEV__` for `import.meta.env.DEV`). It imports nothing on purpose: three boot-path modules import it. **Release is one line** — flip `PLAYBOOK_LIVE` to `true`. **Five live gates**, `grep -rn "playbookVisible" src` = 12 hits: the definition, the route (`AppNavigator.tsx:856`), the dashboard card (`PlayerDashboard.tsx:412`), `showPlaybook` (`CoursesScreen.tsx:205`) and the Club Hub card (`ClubHubScreen.tsx:42`). **IMPORTANT, and unlike the web:** Vite folds `import.meta.env.DEV` and DROPS the gated markup; Metro folds `__DEV__` but does NOT fold an imported constant across modules, so `playbookVisible` is a RUNTIME false here and the gated code is skipped, not removed. Nothing is REACHABLE in a store build; the difference is bundle weight, not visibility. **Three entry points, each in its host screen's own card style, no new design and no new component file** (Oct 28-29 placement rulings): player/parent → a `📖 PAC PLAYBOOK` section on `PlayerDashboard.tsx` between `YOUR PROGRESS` and `📚 MY COURSES` (the web's own order), **+51**; player/parent → a hand-built tile in `CoursesScreen.tsx`'s list header under the filter pills, **+65/−2**, mirroring the web's synthetic catalog tile — it shows under `All Courses` and a category selection hides it, it carries a green **Free**, the banner count INCLUDES it and the "No courses found" screen is suppressed while it is on screen (the web's `:341` and `:326` rules); coach/director → one more card in `ClubHubScreen.tsx`'s typed `cards` array, **+18**. Four edited files total **+177/−3** against the recon's +18 estimate — the gap is styles, the switch's gates and comments. **RULE R-G APPLIED, `PLAYBOOK-HEADER-TITLE-TRUNCATES` CLOSED.** At 375pt the web's one-row header leaves the title cell ~47pt once a 132pt back button, two icon buttons and the EN/ES control have taken theirs; `PAC Playbook` needs ~118pt at 18pt extrabold, which is why M3's looks read **"PAC Pl…"**. No shortening was available (title = the book's name, back label = usually a chapter name, control = two letters), so R-G's "wrapped deliberately" was taken: **when a back label is present the header is TWO rows** — chrome on row one in the web's own order (back left, search/home/EN-ES right, a flex spacer where the title was), title + subtitle on row two at the full column width. With no back label (the cover, and nothing else) the header is the web's single row, untouched. Nothing is cut, nothing shrank, nothing moved sides; the cost is header height on five of six screens. **This is a MOBILE-ONLY divergence and the web still truncates at 393pt — a web ruling would keep the two headers one design (RECOMMEND, not taken).** **The harness is KEPT** (`PLAYBOOK-DEV-HARNESS`), untouched, `__DEV__`-only, all three gates intact — **delete `src/features/pac-playbook/dev/` in the `PLAYBOOK_LIVE` flip commit**, together with the `__DEV__` deep-link path below. A `__DEV__`-ONLY path `thryvyng://playbook[?card=]` was added (`linking.ts:158`) because this machine cannot tap a simulator; a production bundle has no URL into the reader, so the switch stays the only thing deciding reachability. Full record: `docs/recon/playbook-m4.md`, looks in `docs/recon/m4-looks/`. | *uncommitted at time of writing* | **`npx tsc --noEmit`: 5 = baseline**, all pre-existing in `src/components/games/`, **0 in any touched file**. **`ESLINT_USE_FLAT_CONFIG=false npx eslint <7 touched files>`: 0 errors**, 71 pre-existing warnings. **`npx expo export --platform ios`: exit 0**, 1 bundle, **0 split bundles**; entry hash `index-c68d0a13227626bfaec58c5b498380e1.hbc` — **MOVED from M3's `90794d1bbeaea43b1a1b75a71d506e6e`, as required** now that the navigator and `linking.ts` carry the route. Bundle greps: `PlaybookScreen 1 · pac-playbook 1 · CoverScreen 1 · MovementPanel 1 · playbook_books 1`, but **`playbook-dev 0 · offline-pac-playbook 0`** and neither dev-fixture-only string — the harness and its 352 KB JSON are still out. **The M1 UNKNOWN is MEASURED: Metro emits NO second file for a `lazy()` route.** Lazy on React Native buys evaluation time and memory, not bundle weight. **LAZY BOUNDARY PROVED ON THE SIMULATOR** (iPhone 17 Pro / iOS 26.2, Metro :8081, a temporary module-scope `PLAYBOOK-MODULE-EVAL` log): at boot through to the dashboard the line is **ABSENT** (`grep -c` = **0** over the whole session); opening the Playbook prints `iOS Bundled 501ms src/features/pac-playbook/PlaybookScreen.tsx (1194 modules)` and then the line — 1194 modules requested, bundled and evaluated only at that moment. The temporary log was removed and `git diff --stat` no longer lists `PlaybookScreen.tsx` at all. **APP-OPEN TIMING, no regression:** four cold launches, `date +%s%N` around `xcrun simctl launch`, stopping at the app's own last boot log line — BEFORE (M3 tree) **2773 ms** / **2346 ms**, AFTER (M4 tree) **2357 ms** / **2350 ms**; AFTER is 4-11 ms off BEFORE-2, far inside the ±1 s tolerance. **FIRST REAL FETCH AGAINST PROD, and it works** — `m4-looks/05-real-route-cover.png` is the real route opened by a signed-in PARENT, rendering the club crest and the real book (`EDITION 1 · 2026-27`); `04-rg-header-card.png` is card `F3`, *The field map*, "Foundations · Card 4 of 6", with a real diagram board from `playbook_blocks`. So the nine reads in `rpc.ts` work, which `playbook-m3.md` § 2 left as M4's to find out. **No shell-level database access was made** — every read was the app's own authenticated client. **LOOKS:** `docs/recon/m4-looks/` `01-entry-dashboard-card.png` · `02-entry-courses-tile.png` (banner reads **3 Courses** = 2 real + the tile) · `03-entry-clubhub-card.png` · `04-rg-header-card.png` · `05-real-route-cover.png`. **NOT VERIFIED — no tap, swipe, drag or keystroke happened in this session.** `osascript` is REFUSED assistive access (`-1719`), `xcrun simctl` has no tap verb, `idb`/`cliclick` absent; every look was a deep link. Three temporary scaffolds carried the screenshots (a module-eval log, two `*Shot` root routes + paths, one dashboard `contentOffset`) and **all three were removed** — `grep -rn "TEMP-M4-SHOT\|PLAYBOOK-MODULE-EVAL\|CoursesShot\|ClubHubShot" src` returns nothing. **NOT-SEEN-ROLE: the Club Hub placement was not seen from a coach or director account** — the simulator is a parent, so the card was reached directly and `Survey Results` is absent from the shot for want of a `clubId`; the Playbook card depends on neither. Roles needed: `head_coach` / `assistant_coach` / `team_manager`, or `club_admin`. The four `TODO(M-later)` write points are untouched. | Oct 30, 2026 | `AGENT-VERIFIED-SIM` (Lu's look + every tap owed; Club Hub NOT-SEEN-ROLE) |
| **PLAYBOOK-M5-FIX · cover art half height · the route moves into the Home tab · the Courses "window"** — three look fixes from Lu's phone test of M4 (`e791e79`), all ruled before the build. **(1) THE COVER CARRIED THREE SKETCHES, NOW ONE.** Two were the top doodle band — `ZONES.cover = { top: 2 }` and the seed `cover:cover` draws `STRIPS.press` (the goal mouth, Lu's "box") then `STRIPS.corner` (the corner arc and its flag), verified by running `doodleArt.ts`'s own `hash`/`pickFrom` over that seed. `doodleArt.ts` is **MIRRORED and was NOT edited**: the drop is one line where the plan is consumed, `const sketches = doodle === 'cover' ? { ...plan, top: [] } : plan` (`PlaybookScreen.tsx`), so the cover is handed its two marks and simply does not draw them — **every other screen keeps its band** (`m5-looks/02-card-F3-tabbar.png`). The third sketch, `CoverArt()` in `CoverScreen.tsx` (a **rebuild, not a mirror** — MIRROR.md "Not mirrored"), went to **HALF HEIGHT: `height` 150 → 75, viewBox `0 0 340 150` → `6 12 328 130`** (the ink's real bounding box + a 4-unit margin), `preserveAspectRatio` left at its default so the whole sketch scales down. **NOT ONE COORDINATE MOVED AND NOTHING IS CUT**; the cost is that it draws ~189 x 75pt centred instead of full width. **The arithmetic for why it cannot be both:** at ~343pt of column the art's box is already ~1.05pt per unit, so a full-width 75pt strip shows only ~72 of its 130 units, and every 72-unit window that keeps the goal (y 112…140) cuts the players (y 16…124) — a crop at y≥56 slices two curves mid-stroke, one at y≥80 loses every circle. Lu's ruling named the drawing, so the drawing was kept whole. **RECOMMEND, not taken:** `preserveAspectRatio="xMidYMax slice"` at `height={70}` is the full-width alternative in one attribute. **(2) THE ROUTE MOVED OFF THE ROOT STACK** (Lu, Oct 27, "back/home at every point"). A root screen is drawn OVER the tab navigator, so M4's reader had no Home/Chat/Calendar/Profile bar and the cover — the one screen with no in-book back — had no way out at all. `Playbook` is now a **`HomeStack` screen immediately after `Courses`** (`AppNavigator.tsx:348`). **One registration still serves all three doors**, because the player dashboard, the Courses card and Club Hub are all already in `HomeStack`. **THE LAZY BOUNDARY IS UNMOVED** — same module-level `lazy(() => import('../features/pac-playbook/PlaybookScreen'))` through `LazyScreen` + `Suspense`. `RootStackParamList` KEEPS its `Playbook` entry: `HomeStack` is untyped and every caller types `navigate` against the root list. The `__DEV__` deep link moved with the route to **`Main → HomeTab → Playbook`**. **Back on the cover** is a new `onExit` prop on `PlaybookHeader`, drawn ONLY where there is no in-book `back` (the cover and nothing else) and **a chevron with NO LABEL**, so that header stays the web's single row — **R-G at 375pt: 351pt content box − 30 chevron − 32 crest − 74 EN/ES − 24 gaps = ~191pt title cell against the ~118pt `PAC Playbook` needs, 73pt over**; a "Courses" label (~60pt) would have forced the two-row header back. **The ROUTE owns where back goes, not the reader:** `AppNavigator` passes `onExit={() => canGoBack() ? goBack() : navigate('Dashboard')}`, so the reader never imports react-navigation and the `__DEV__` harness draws no chevron. **(3) THE COURSES WINDOW, Lu's option A.** The hero banner went **~236pt → ~118pt**: the 📚 glyph deleted (style `bannerIcon` gone with its only reference), title 26 → 22pt, the two-line description replaced by one short line ("Expert-led courses. Earn XP as you learn.", **no `numberOfLines`** — short enough for one row at 375pt and free to wrap rather than clip, which is what R-G actually forbids), paddings 56/24 → 20/16; **the three counts are unchanged**. The Playbook list row became a **FEATURED CARD** in the course-card family — `styles.playbookTile`/`playbookTileIcon`/`playbookTileText` deleted, 0 references left — same `#1e293b` box, radius 12, `overflow:'hidden'` and `cardContent` as a course card, at full width above the grid, with a **120pt chalkboard band `#0b1220`** where a course has its category gradient, then title "PAC Playbook", a one-line description, the green "Free" and the chevron. **The chalk sketch is WRITTEN OUT in `CoursesScreen.tsx` (`PlaybookChalkMark`, nine `react-native-svg` primitives), not imported** — this screen may touch `launch.ts` (a leaf) and nothing else under `src/features/pac-playbook/`, or opening the course list would evaluate the reader's module graph; colours are the playbook theme's by value (`theme.ts:65` board, `:73` chalk). **NOT TOUCHED, as instructed:** the filter chips, the course cards, the 2-column grid, the header row, `showPlaybook`'s rule, the banner's `+ (showPlaybook ? 1 : 0)` count and the `!showPlaybook` empty-state guard — the web's `CourseCatalog.tsx:341` and `:326` mirrors still hold. **NOTHING SACRED** — no schema, migration, SQL, DB access, dependency, env, auth or delete. Full record: `docs/recon/playbook-m5-fix.md`, looks in `docs/recon/m5-looks/`. | *uncommitted at time of writing* | **`npx tsc --noEmit`: 5 = baseline**, all pre-existing in `src/components/games/`, **0 in any touched file**. **`ESLINT_USE_FLAT_CONFIG=false npx eslint <6 touched files>`: 0 errors**, 35 pre-existing warnings. **`npx expo export --platform ios`: exit 0**, 1 bundle, **0 split bundles**, `index-62f365056dfedce4efe7b2034f8d610c.hbc`. **MIRROR CLEAN:** `git diff --stat` lists 6 files and **none of MIRROR.md's ten**. **LAZY GREP, pasted in full in the recon § 2:** `grep -rn "pac-playbook" src/navigation src/app app` = **6 hits — two dynamic imports (`:79` harness, `:87` reader), three comments, and ONE REAL TOP-LEVEL IMPORT at `:17`, `launch.ts`**, M4's 35-line leaf switch that imports nothing. That hit is named rather than glossed: the reader's graph is still behind `lazy()`, and removing it would mean moving the switch out of the feature directory — a ruling, not a fix. Bundle strings: `PlaybookScreen 1 · pac-playbook 1 · CoverScreen 1 · playbook_books 1 · join-team 1` (control) against **`playbook-dev 0 · offline-pac-playbook 0`** — the harness is still out. **LOOKS, iPhone 17 Pro / iOS 26.2 against the Metro session already running in Lu's own terminal (never killed, restarted or started by this room):** `docs/recon/m5-looks/01-cover-half-art-back-chevron-tabbar.png` (one sketch at half height, chevron at the head of a SINGLE-row header with `PAC Playbook` whole, tab bar on screen) · `02-card-F3-tabbar.png` (R-G two-row header untouched, the card's own doodle band still there, tab bar on screen) · `03-courses-hero-featured-card.png` (halved hero, chips unchanged, featured card with its chalkboard band). **NOT VERIFIED — no tap, swipe or keystroke happened in this session**; the M3/M4 tap blocker is unchanged (`xcrun simctl` has no tap verb, `idb`/`cliclick` absent, `osascript` refused assistive access `-1719`), so every screen was reached by the `__DEV__` deep link. One temporary scaffold carried the Courses shot — a `Courses: 'courses-shot'` path inside the same `__DEV__` linking block — and it is **REMOVED**: `grep -rn "TEMP-M5-SHOT\|courses-shot" src` returns nothing. **OWED TO LU'S FINGER: the cover chevron's press, the featured card's press, and that the dashboard and Club Hub cards still land on the reader now that the route changed stacks.** | Oct 30, 2026 | `AGENT-VERIFIED-SIM` (Lu's look + every tap owed) |
| **M5-FIX ROUND 2 · RECUR-MAX 12 months · the launch switch leaves the feature folder · the chevron reaches loading/error · Courses safe area** — five ROUTINE items on top of `00d48f2`. **(1) RECUR-MAX = 12 MONTHS** (Lu, Oct 30, replacing the 2-month cap). The limit was encoded in **exactly two** places, both in `src/components/calendar/CreateEventModal.tsx`, and nowhere else — `EditEventModal.tsx` has no recurrence code and the sweep (`addMonths` + `"2 months"` + `endRepeat` across `src/`) found no third site, **far under the 10-site stop rule**. The **picker cap** (`:715`) is now `addMonths(eventDate, RECUR_MAX_MONTHS)` = **12**; the **End Repeat pre-fill** (`:405`) is `RECUR_DEFAULT_MONTHS` and is **deliberately still 2**. Both are named constants carrying their reasoning (`:104`, `:118`). **Why the default did not follow the cap:** before today the two were the same number because the pre-fill simply took the maximum (the local was named `max`); raising both would mean a coach who never opens End Repeat silently creates **a year** of events instead of two months — ~104 rows instead of ~17 for a twice-weekly practice, from a form they did not touch. The ruling was about the cap. **NEEDS LU: should the pre-fill stay 2 or follow the cap?** **FOUND, out of scope, and it bites this ruling: `src/screens/CalendarScreen.tsx:108` fetches `−1 … +6 months`**, so a 12-month series creates events the calendar does not display past month 6. One character (`6` → `13`), but it widens every calendar fetch for every user — **not changed, it is a decision**. **(2) THE LAUNCH SWITCH LEFT THE FEATURE FOLDER.** `src/features/pac-playbook/launch.ts` → **`src/constants/playbookLaunch.ts`** (`git mv`, beside `eventTypes.ts` / `teamColors.ts`), exports and semantics untouched, release still one line. Four importers repointed — `AppNavigator.tsx:17`, `PlayerDashboard.tsx:24`, `CoursesScreen.tsx:20`, `ClubHubScreen.tsx:12` — plus the four prose mentions of the old path. **This CLOSES the one honest gap M5-FIX reported:** `grep -rn "pac-playbook" src/navigation src/app app` is now **4 hits — two dynamic imports (`:80` harness, `:88` reader) and two comments (`:83`, `:341`) — ZERO top-level imports.** The rule "nothing outside `src/features/pac-playbook/` imports anything inside it except through `lazy()`" is now readable off a grep instead of argued in prose. `MIRROR.md` never named the file, so it needed no edit. **(3) THE CHEVRON REACHES LOADING AND ERROR.** Both states rendered *before* the header, so a book that would not open left the reader with the tab bar and nothing else. They now go through one `stateFrame()` helper in `PlaybookScreen.tsx` wrapping them in the cover's own single-row header — crest, `PAC Playbook`, chevron; **no search and no home** (there is no book to search or go home to), and `topInset` moved from the page to the header so the gradient runs under the status bar as everywhere else. Supporting change in `PlaybookHeader.tsx`: the subtitle `<Text>` is **skipped when `sub` is empty**, which these two states are — an empty `Text` still holds a line of height. **(4) COURSES SAFE AREA.** `styles.container` had no top inset, so the header row was drawn at y 0 behind the status bar; the old hero's `paddingTop: 56` hid how close that was and halving the hero exposed it. Fixed with **the pattern the sibling HomeStack screens already use** — `SafeAreaView edges={['top']}` from `react-native-safe-area-context` (`ClubHubScreen.tsx:69`, and GamesHub / TrainingStudio) — applied to the main return AND the empty-state return; the bottom edge is deliberately not claimed, it is the tab bar's. **The duplicate "Course Library" is gone from the header row in both returns** (the hero below already prints it); the back button and row height are unchanged and `styles.headerTitle`, now unreferenced, was deleted with it. **No other Courses change — the filter chips, course cards, 2-column grid, "0 Students" and the rest stay parked under COURSES-REDESIGN.** **(5) CHAT LINKS — READ-ONLY CHECK, NO CODE CHANGE. FOUND.** Chat message text is **already linkified**, in ONE place: `src/components/chat/ChatBubble.tsx:43-73` (`URL_SPLIT` `:29`, `openUrl` `:33`, call site `:619`), used by both `TeamChatRoomScreen` and `DMChatScreen`, which are the only two screens that render message bodies. Schemes covered: **`https://`, `http://` and bare `www.`** (upgraded to https at `:59`); trailing punctuation is peeled off (`:54`) and a failed open alerts rather than failing silently. **`thryvyng://` is NOT matched, so an in-app deep link pasted into chat is dead text** — and a `https://thryvyng.com/…` link IS matched but goes to the OS via `Linking.openURL` rather than through the navigator. `ChatBubble` is the **only** linkifier in `src/` (verified by grep). Proposed default and the trust question it raises: `docs/recon/chat-links-check.md`. **NOTHING SACRED** — no schema, migration, SQL, DB access, dependency, env, app.json, auth or delete beyond the `git mv` of `launch.ts`. Full record: `docs/recon/playbook-m5-fix.md` § 6, `docs/recon/chat-links-check.md`. | *uncommitted at time of writing* | **`npx tsc --noEmit`: 5 = baseline**, all pre-existing in `src/components/games/`, **0 in any touched file**. **`ESLINT_USE_FLAT_CONFIG=false npx eslint <8 touched files>`: 0 errors**, warnings all pre-existing classes. **`npx expo export --platform ios`: exit 0**, 1 bundle, 0 split bundles. **LAZY GREP CLEAN — 4 hits, 2 dynamic imports + 2 comments, 0 top-level imports** (pasted in full in the recon § 6.2). **RECUR-MAX grep:** `grep -rn "addMonths" src/components/calendar src/screens | grep -iE "repeat|recur|end"` → the helper `:93`, `RECUR_MAX_MONTHS = 12` `:104`, `RECUR_DEFAULT_MONTHS = 2` `:118`, the pre-fill `:406`, the cap `:715`, and `CalendarScreen.tsx:108` (the +6-month FETCH window, not a recurrence cap — flagged, not changed). **MIRROR CLEAN:** `git diff --stat` lists no file in MIRROR.md's ten. **LOOK:** `docs/recon/m5-looks/04-courses-safe-area.png` — the back arrow clear of the status bar, "Course Library" printed once, hero + featured card + tab bar below. **NOT VERIFIED — no tap, swipe or keystroke happened in this round**; the tap blocker is unchanged, so the Courses shot used a temporary `Courses: 'courses-shot'` path inside the `__DEV__` linking block, **REMOVED** — `grep -rn "TEMP-M5B-SHOT\|courses-shot" src` returns nothing and `git diff` on `linking.ts` is **empty**. **OWED TO LU'S FINGER: the chevron on the error state, the 12-month End Repeat picker, the Courses back button, and the three Playbook panels (see the open gap below).** | Oct 30, 2026 | `AGENT-VERIFIED-SIM` (Lu's look + every tap owed) |

---

## Verified — Oct 30 2026 (sandbox cal_events delete, prod)

- **One guarded DELETE of 48 `cal_events` rows, run on prod against sandbox data.**
  Team **ZZ Test Team 0826**, `recurrence_group = 5d9fcb61…` — a single recurrence group,
  deleted with both the team and the group in the WHERE clause so no other team's series
  could be reached. **VERIFIED-SQL 2026-10-30 22:59 (Lu)** — row count confirmed in the
  SQL editor by Lu, not by this room.
  **No migration was written for it.** It was a data delete in a sandbox team, not a schema
  change, so nothing about the shape of `cal_events` moved; but the write itself is recorded
  only here, which is why it is on the ledger rather than in `supabase/migrations/`.
  Source: session handoff Oct 30 23:15.

## Open gaps (added Nov 1 2026 — mobile write points)

The mobile Playbook reader's four writes are wired to the same RPCs the web reader calls,
with the same argument names (`src/features/pac-playbook/rpc.ts`, mirrored from
`thrive-and-score` `src/features/pac-playbook/rpc.ts` — **no name or arg-shape mismatch**).
All four refuse through `playbookErrorMessage` (ruling R-5) and none runs on the `__DEV__`
harness path, which has no player row to write as.

**Every item below is UNVERIFIED-DEVICE** — typecheck, lint and `expo export` pass, but
nothing here has been clicked through. Lu's simulator pass is what turns these into
Shipped rows, and `PLAYBOOK_LIVE` is still `false`, so none of it is reachable in the app.

1. **`playbook_set_got_it`** → `src/features/pac-playbook/usePlaybookProgress.ts:111`
   (`markGotIt`); the button lives on `screens/CardScreen.tsx`. Optimistic tick, rolled back
   on refusal. UNVERIFIED-DEVICE.
2. **`playbook_start_quiz`** → `src/features/pac-playbook/useQuizRun.ts:182` (`start`);
   entry screen in `screens/QuizScreen.tsx`. The server deals the run (R4); a refusal stays
   on `'entry'`. UNVERIFIED-DEVICE.
3. **`playbook_submit_quiz`** → `src/features/pac-playbook/useQuizRun.ts:259` (`finish`);
   results screen in `screens/QuizScreen.tsx`. The server grades it (R4); the phase flips
   only once the grade is in hand, so no uncomputed score is ever printed.
   UNVERIFIED-DEVICE.
4. **`playbook_send_question`** → `src/features/pac-playbook/screens/ChapterEndScreen.tsx:127`
   (`send`). On refusal the draft stays put (R-5). UNVERIFIED-DEVICE.
5. **Calendar fetch window widened +6 → +13 months.**
   `src/screens/CalendarScreen.tsx:111`. RECUR-MAX caps a series at 12 months, so a series
   created today runs a year out and +6 cut the back half of it out of the fetch; the 13th
   month is the margin. Mirrors the web's `TeamCalendarTab` window. UNVERIFIED-DEVICE —
   the arithmetic is read-only on the client, but no device has loaded the wider range.

## Verified — Nov 1 2026 (mobile Playbook write points, VERIFIED-DEVICE)

- **Playbook writes · VERIFIED-DEVICE 2026-11-01 15:35–15:48 (Lu) · iOS simulator, live Metro bundle, prod DB, sandbox team.** Commit `83a201d`. Account ludwig.snchz+zztest7@gmail.com linked as secondary parent of player Zack Testeron (`8f483eab-d352-4353-8914-d46ea8a664ec`, ZZ Test Team 0826) via the invitation link + DOB. Screen ↔ DB: Got it = 5/6 shown, `playbook_card_progress` 5 rows, survives cold relaunch · quiz = result 5/8 server-graded, `playbook_quiz_runs` 3 (incl. Oct 29 web runs), `playbook_quiz_results` 1 · question = "Sent", `playbook_questions` 1 row today (2 total). Parent note ("Do it together — your Got it counts for your child") shows. Carried UNVERIFIED: staff-refusal look (P0041/P0046 as ludriv) · calendar +13 look.
- **Sandbox roster facts (supersede the Oct 26 "zero players" note):** ZZ Test Team 0826 holds 5 active Testeron players — Zeke 2019-03-15, Zoe 2019-06-10, Zack 2012-05-05 (player slot claimed by +zztest10 on 2026-08-28; primary parent +zztest1; secondary now +zztest7), Zia 2019-09-20, Zola 2011-05-05 (claimed by +zztest17). Unclaimed player slots: Zeke, Zoe, Zia (all under 11 → parent path only).
- **How the invitation link works (read from `public.link_parent_to_player`, prod, Nov 1):** the link never creates a player; it links an account to an EXISTING roster row (tryout/placement) by name + DOB (`P0003 dob_mismatch`), by co-parent invitation code, or by email already on the row; "I'm a Player" refuses a row whose player slot is claimed; 3 wrong DOBs lock the attempt. Staff cannot add players by hand on the admin site — by design.

## Open forks (added Nov 1 2026 — after the device test)

- CLOSED Nov 1 2026 ~17:25 — PLAYBOOK-CARD-INVITING · QUIZ-CARD-NOTICEABLE · QUIZ-RESULT-BUTTONS-ALIGN · QUESTION-PILLS-WRAP · QUIZ-REVIEW-NAV (ruling A): all five verified on device, see the two VERIFIED-DEVICE rows below.
- **CLOSED Nov 2 2026 — PLAYBOOK-STAFF-RULE-FORK** (ROUTINE; opened as P-10 FOUND 2 with the staff drill-down). The gender normaliser and the season bucket each had two bodies — `staffTeams.ts` carried a copy of `ChatScreen.tsx`'s `normalizeGender`/`getGenderLabel` and of `useUserTeams.ts`'s `getTeamBucket`, because neither original was exported. Both originals are exported now and both copies are deleted: the gender rule lives in the new **`src/utils/teamGender.ts`** and the bucket in **`getTeamBucket`, `src/hooks/useUserTeams.ts`**. See the landed entry at the end of this file.
- **PARKED — QUESTION-KIND** (SACRED, schema: `kind` on `playbook_questions` — Question /
  Comment / Suggestion pills; deferred since Oct 29). **RE-RULED 2026-11-01 ~17:42 by Lu,
  reversing the earlier "planned before M6 build":** it is no longer gated on M6 and is not
  scheduled on its own. It ships WITH the future coach question-inbox step — the pills only
  mean something once a coach has a place to read and sort what players send, so the column
  and the pills land together with that inbox or not at all. Nothing to do until that step is
  planned. Source: Lu's ruling in the planning room, 2026-11-01 ~17:42.
- **PARKED — PLAYBOOK-TENANT-SCOPE** (SACRED, visibility gate; opened 2026-11-01, **Lu ruled
  YES this is a real fork**). **PARKED 2026-11-03 14:20 by Lu — "no action on Gremio for now."
  NOT a 1.0.20 blocker and not a launch blocker.**
  - **WHY IT PARKS, and it is evidence, not a hunch.** Q-04 (web repo
    `docs/recon/q04-tenant-users.md`, commit `a888ca3`) counted the only other tenant with
    users: **Gremio holds 5 staff and 26 parent logins, and 0 messages in 90 days.** So the
    second tenant is real on paper and dormant in practice — the exposure is not zero, but
    nobody is walking into it.
  - **INFERRED, and stated as inference: Gremio members may see the PAC Playbook.** It follows
    from the gate below (no club is compared anywhere), not from an observation — **no Gremio
    account has been signed into, and no query was run from this repo.** The one check that
    would settle it is a sign-in as one of those 31 logins.
  - **REOPEN BEFORE THE NEXT REAL CLUB ONBOARDS.** The trigger is onboarding, not a date: the
    day a second club has users who actually open the app, this is a leak. Parking it records
    that the fix is understood and deliberately not scheduled — it does not retract the fork.
  - **THE DIAGNOSIS IS UNCHANGED AND STILL ACCURATE. The PAC Playbook is visible and openable
    to EVERY tenant's users.** `playbookVisible` is a plain module constant with no club in it
    (`src/constants/playbookLaunch.ts:57-60`), the `Playbook` route is gated on that constant
    and nothing else (`src/navigation/AppNavigator.tsx:349`), and the book is fetched **by
    slug** — `fetchBook()` does `.eq('slug', 'pac-playbook')` (`rpc.ts:45,77-83`) — with
    `owner_club_id` read off the row only to fetch the owner's crest
    (`usePlaybookBook.ts:182`) and **never compared to the viewer's club**. Evidence recorded
    in `docs/recon/playbook-polish.md` (sections "TENANT SCOPE — the answer, and it is no" and
    the restyle pass's tenant note).
  - **FIX:** gate book visibility on the viewer's club vs `owner_club_id`. SACRED — it is a
    visibility-gate change, so it does not move without Lu.
  - **CORRECTED 2026-11-03 by Q-04 — the old wording here said "today only PAC is live, so
    nothing is exposed in practice". That is no longer true and should not be relied on:**
    Gremio has **31 logins** (5 staff + 26 parents). What is true is that they are **dormant**
    — 0 messages in 90 days — which is why Lu parked it rather than closing it. The condition
    is now "before the next real club onboards", above.
  - **Long term:** each club gets its own book(s), which makes the gate a join rather than a
    comparison — so the fix should not hard-code "one book, one owner".
- JOIN-DOB-LOCKOUT-RESET (🔧 if no unlock exists) — what 0 attempts does and how staff unlocks a family; code read, never burn attempts.
- DOB-PICKER-MONTH-DRIFT (ROUTINE; 🔧 if value drifts) — wheel showed June while field showed 05/15.
- WELCOME-BADGES-NO-TEAM (ROUTINE) — 34 bell / 27 chat badges on a no-team account.
- GAMES-TSC-CRASH — `getGutterBoundaryX` missing in DribbleRushGame.tsx:712; UNKNOWN if reachable in prod.
- DATA-WRITE-RULING (rule, own message) — sandbox data writes = ledger row with WHERE, not a migration.
- CAL-PAYLOAD-14MO (watch) — 14-month calendar window, no pagination.

## Landed — Nov 1 2026 (Playbook UI polish, AGENT-ONLY)

- **Playbook UI polish · 4 of the 5 Nov 1 forks · landed 2026-11-01 · VERIFIED-DEVICE
  2026-11-01 ~17:25 (Lu) — iOS simulator, live Metro bundle, signed in as `+zztest7`;
  all four seen on screen, the review-chip ✗ panel confirmed.** (Build proof at landing:
  typecheck 5 pre-existing errors / eslint 0 errors / `expo export --platform ios` exit 0.)
  UI only: no RPC, no
  schema, no new dependency, nothing outside `src/features/pac-playbook/`.
  Source: `docs/recon/playbook-polish.md`.
  - QUIZ-CARD-NOTICEABLE — the index's quiz row given a green rule, a raised face
    and a "Take the quiz ›" pill. `screens/ContentsScreen.tsx`, `styles.ts`
    (`quizcard*`).
  - QUIZ-RESULT-BUTTONS-ALIGN — `.res` centres its children, which shrink-wrapped
    the footer in RN; the footer now stretches and both buttons are full width.
    `screens/QuizScreen.tsx`, `ui.tsx` (`Cta` takes `style`), `styles.ts`
    (`ctaStretch`).
  - QUESTION-PILLS-WRAP — the "About" chips wrap instead of scrolling
    horizontally, so no card is reachable only by dragging.
    `screens/ChapterEndScreen.tsx`, `styles.ts` (`pillwrap`).
  - QUIZ-REVIEW-NAV (ruling A) — per-question chips `Q1 ✓` on the RESULT screen;
    tapping one opens an inline panel on that same screen with the question, the
    player's answer and the correct answer. **No RPC was added or widened**: the
    correct answers were already client-side in the deal
    (`DealtQuestion.content.answer` / `options`, `types.ts:214-228`), which is the
    same data the run screen reveals an answer from. `useQuizRun.ts` now also
    exposes `attempts` (what was sent, in dealt order) so the player's own answer
    can be read back. The plain pip row on the result screen was replaced by the
    chip row. No new screen, no retake from review.
  - PLAYBOOK-CARD-INVITING — **built in a second pass the same day**, once Lu
    named the three entry-point files; see the row below. All five fork lines are
    CLOSED — Lu verified them on device Nov 1 2026 ~17:25.

- **PLAYBOOK-CARD-INVITING · all three Playbook entry points made inviting and
  visually identical · landed 2026-11-01 · VERIFIED-DEVICE 2026-11-01 ~17:25 (Lu) —
  iOS simulator, live Metro bundle, signed in as `+zztest7`; all three entry doors
  seen on screen.** (Build proof at landing: typecheck 5 pre-existing errors / eslint
  0 errors + 0 new warnings / `expo export --platform ios` exit 0.) STYLING ONLY: no `onPress`,
  no `navigate`, no logic, no data, no RPC, no schema, no new dependency.
  Source: `docs/recon/playbook-polish.md`.
  - The three ways in, all OUTSIDE the feature folder:
    `src/screens/CoursesScreen.tsx` (players/parents, course list) ·
    `src/components/dashboards/PlayerDashboard.tsx` (players, dashboard) ·
    `src/screens/ClubHubScreen.tsx` (coaches/directors, hub tile).
  - What they now share: Ionicons `book-outline` on a green disc · the playbook
    green `#10b981` as a 1.5pt rule around a `#1c2637` raised face — the SAME
    device as QUIZ-CARD-NOTICEABLE (`pbk.quizcard`) · the cover's own tagline
    "How we see the game, how we play it and how we think"
    (`CoverScreen.tsx:139`) · the cue "Open the book ›". The violet accent two of
    the three used is gone.
  - Club Hub keeps its TILE SHAPE — only its accent, rule, face, cue and chevron
    changed. Its local `HubCard` gained `featured?` / `cue?`, presentational only.
  - **`src/features/pac-playbook/styles.ts` and `theme.ts` were NOT touched, on
    purpose.** All three entry points are LAZY ROUTES; importing the book's theme
    into them would pull its module graph into those bundles and the lazy boundary
    would be gone (the reason `PlaybookChalkMark`, `CoursesScreen.tsx:32-40`,
    already writes its colours out by value). The four values are duplicated with
    a `theme.ts` line citation beside each. **Known side effect: these are copies
    — if a playbook colour changes, `grep -rn "#1c2637\|#10b981" src/` finds every
    one.**

## Landed — Nov 1 2026 (Playbook launch flip, VERIFIED-DEVICE)

- **PLAYBOOK-LIVE-FLIP · mobile launch switch flipped ON · landed 2026-11-01 ·
  VERIFIED-DEVICE 2026-11-01 ~17:56 (Lu) — iOS simulator, cold relaunch, fresh Metro
  bundle, signed in as `+zztest7`; the Courses Playbook card shows and OPENS, with
  `PLAYBOOK_LIVE` as the only gate (the `__DEV__` override is gone, so this is the
  released path, not a dev path).** `src/constants/playbookLaunch.ts:55` —
  `PLAYBOOK_LIVE = false` → `true`. (Build proof at landing: typecheck 5 pre-existing
  `src/components/games/*` errors / 0 new · eslint 0 errors + 0 new warnings ·
  `expo export --platform ios` exit 0.)
  - **The `__DEV__` override on the gate is GONE.** `playbookVisible` was
    `PLAYBOOK_LIVE || __DEV__`; it is now `playbookVisible = PLAYBOOK_LIVE`. The flag is a
    plain constant with no environment branch, the same shape as the web's
    `src/features/pac-playbook/launch.ts` — the `__DEV__` OR was this file's only declared
    diff from the web and it bought nothing once the book is live. One file touched; the four
    importers were NOT edited (they already read `playbookVisible`, which still exists).
  - **Known side effect — this is a user-visible release.** All three Playbook doors and the
    `Playbook` route now appear for every signed-in user in any build, not just dev:
    `src/screens/CoursesScreen.tsx:244` (course list, `All Courses` filter only) ·
    `src/components/dashboards/PlayerDashboard.tsx:412` (player dashboard) ·
    `src/screens/ClubHubScreen.tsx:51` (coach/director hub tile) ·
    `src/navigation/AppNavigator.tsx:349` (the route). **Kill switch: set
    `PLAYBOOK_LIVE = false` — one line, nothing else, hides all four again.**
  - **Not touched, on purpose: the M2 board harness** (`PlaybookDev` route,
    `src/features/pac-playbook/dev/`, `thryvyng://playbook-dev`). It is gated on bare
    `__DEV__` in `src/navigation/AppNavigator.tsx:79,877` — it never read `PLAYBOOK_LIVE` or
    `playbookVisible`, so it is a SEPARATE harness (its own PLAYBOOK-DEV-HARNESS row), not the
    override this flip removed. Metro still folds it out of a production bundle.
  - Carried from the Nov 1 device test and still open: staff-refusal look (P0041/P0046) ·
    calendar +13 look. Both are UNVERIFIED-DEVICE and unaffected by the flip.
  - Source: this flip's session, 2026-11-01; flag file's own header comment; Lu's simulator
    run 2026-11-01 ~17:56.

- **PLAYBOOK-M6-ARCHIVO · Archivo wired into the mobile Playbook, that feature only ·
  landed 2026-11-01 (`68a59b7`) · DEVICE-VERIFIED by Lu (iOS simulator) Nov 1, 2026
  evening — Archivo 400/500/700/800 loading via `useFonts`, 600→700 substitution
  kept; type hierarchy revisited wholesale in pass E (next entry).**
  The web's typeface now renders in the book on mobile. Ruling **E-R3 is revisited**:
  it was A ("first mobile build uses the system font, Archivo is not loaded, `expo-font`
  is not a dependency") and that is no longer true. `theme.ts`'s own note said a
  `fontFamily` block would be "added here and nowhere else" if E-R3 were revisited —
  that is what happened.
  - **Weights: exactly the web's four, no italics.** 400 / 500 / 700 / 800, from the
    Google Fonts URL the web loads (`thrive-and-score`
    `src/features/pac-playbook/loadPlaybookFont.ts:33`). `playbook.css` has not one
    `font-style:italic`. Full recon in `docs/recon/playbook-polish.md` § M6.
  - **Packages added (2):** `expo-font@14.0.12` (promoted from a transitive dep of
    `expo@54` to an explicit one by `npx expo install`, SDK-54 compatible) and
    `@expo-google-fonts/archivo@0.4.2` (JS + `.ttf` assets only, **no native code**).
  - **Loading route: the `useFonts` hook at the Playbook root, NOT the config plugin.**
    `src/features/pac-playbook/font.ts` is imported only by `PlaybookScreen`, so the
    faces are registered the first time the book is opened and never for anyone who
    does not open it — the standing "Playbook must not slow app open" ruling, and the
    same reason the web keeps its `<link>` out of `index.html`. The plugin route was
    rejected because its `fonts` option copies files into the native project, so
    nothing would render until a new EAS build and every weight change would cost one.
  - **DEFAULT TAKEN — `app.json` gained a bare `"expo-font"` plugin entry.** Added
    automatically by `npx expo install`, not by hand. With **no `fonts` array it
    configures nothing and is inert**; it was kept rather than reverted because it is
    the installer's canonical output and is the hook if native-embedded fonts are ever
    wanted. Safe to delete if Lu prefers `app.json` untouched.
  - **DEFAULT TAKEN — styles now name a FACE and carry NO `fontWeight`.** 83 sites
    swapped `fontWeight: fw.X` → `fontFamily: ff.X` (styles.ts 79, PlaybookHeader 4),
    plus 2 `react-native-svg` glyph labels in `panels/MovementPanel.tsx`. **Setting
    both would be a bug, from source:** `expo-font` registers each alias at one style
    only — `ReactFontManager.getInstance().setTypeface(name, Typeface.NORMAL, face)`
    (`expo-font@14.0.12`, `android/src/main/java/expo/modules/font/FontLoaderModule.kt:57`)
    — so `fontWeight:'700'` on top of the `Archivo_700Bold` alias makes Android
    synthesise a bold over a face that is already bold. iOS resolves the alias to a
    single PostScript name instead (`ios/FontLoaderModule.swift`), so the platforms
    would not even disagree the same way. **Cost of this route:** if the faces ever
    fail to register, the book reads *flat* (system regular, no weight hierarchy)
    rather than wrong. The faces are bundled, so that is a belt-and-braces path.
  - **DEFAULT TAKEN — 600 maps to 700, mirroring the web.** `playbook.css` asks for
    `font-weight:600` in 11 places (chips, segment labels) but the web never loads a
    600 face, so a browser paints those 11 rules in Archivo 700 Bold. `fontFamily`
    mirrors that result. **A real `Archivo_600SemiBold` IS available** in the package;
    using it would give mobile a weight the frozen design does not have. **This is the
    one spot where mirroring costs a visible distinction — Lu's call to override.**
  - **No flash, and app open is untouched.** The gate sits at the Playbook ROOT, above
    the header, and its placeholder is the page colour with **no text** — the one thing
    that cannot re-paint. It costs at most one frame, and only on the first open of an
    app session: `useFonts` seeds its state from a synchronous `isLoaded` check
    (`expo-font/src/FontHooks.ts:18`), so every later open is already ready on the
    first render.
  - **BUNDLE TRAP, found and fixed while measuring.** Importing the four names from the
    package ROOT bundles **all 18 faces** — `index.js` is a barrel that `require()`s
    every weight. `expo export` listed 18 `.ttf`s. `font.ts` imports each face from its
    own subpath (`@expo-google-fonts/archivo/400Regular`, …); re-measured, **4**.
  - **DEV CLIENT: no new EAS build needed — Archivo renders over Metro now.**
    `expo-font`'s native module is ALREADY compiled into the dev client on the
    simulator. Evidence, not inference: `nm -a` on the installed
    `thryvyngmobile.app/thryvyngmobile.debug.dylib` (device `DEEE9FA3`, bundle
    `B57C94DF`, built Oct 30 17:30) reports
    `libExpoFont.a(FontLoaderModule.o)` and `libExpoFont.a(FontUtilsModule.o)` linked
    in, with the module-name strings `ExpoFontLoader` / `ExpoFontUtils` present. Root
    cause: `expo-font` has always been a dependency of the `expo` package itself
    (`expo@54.0.32` → `expo-font ~14.0.11`), so autolinking compiled it in long before
    this task named it — `ios/Podfile.lock` carries `ExpoFont (14.0.11)` and
    `ExpoModulesProvider.swift` registers `FontLoaderModule.self`. The new package
    `@expo-google-fonts/archivo` is **assets + JS only**, which Metro serves. So a
    reload shows Archivo; a build is needed only if the config plugin's `fonts` array
    is ever used instead.
  - **Scope held:** no fonts outside the Playbook, no app-wide font, no schema/RPC/env/
    auth, nothing written in `thrive-and-score` (read-only there), no commit or push.
    `dev/PlaybookDevHarness.tsx` was deliberately NOT touched — its own 8 `fontWeight`
    sites are `__DEV__` tool chrome, not the design; the reader it mounts is the real
    `PlaybookScreen`, so the BOOK inside the harness does render in Archivo.
  - **Gates:** typecheck 5 pre-existing `src/components/games/*` errors / **0 new** ·
    eslint **0 errors**, 5 pre-existing inline-style warnings, **0 new** (proven per
    file by the `--stdin` baseline trick) · `expo export --platform ios` **exit 0**.
  - Source: this session, 2026-11-01; the cited web files; `expo-font@14.0.12` source;
    `nm`/`Podfile.lock` output above.

## Landed — Nov 1 2026 (Playbook moved to the top of every dashboard, AGENT-ONLY)

- **PLAYBOOK-DASHBOARD-PLACEMENT · the Playbook entry card now sits directly below
  the quick-nav tile grid on ALL THREE role dashboards · landed 2026-11-01 (`654303e`) ·
  DEVICE-VERIFIED by Lu (iOS simulator) Nov 1, 2026 22:39 — card on all 3 role
  dashboards, viewer-club crest rendering correctly after root-cause fix (club id
  passed from hosts). Agent gates green too: typecheck · eslint · `expo export`.**
  PLACEMENT + ONE EXTRACTED COMPONENT: no `onPress`, no `navigate`, no route,
  no visibility gate, no data, no RPC, no schema, no new dependency.
  Source: `docs/recon/playbook-polish.md` (appended this session).
  - **New shared component** `src/components/dashboards/PlaybookEntryCard.tsx` — the
    PLAYBOOK-CARD-INVITING card (markup and styles) lifted out of
    `PlayerDashboard.tsx` unchanged, so the three dashboards show one card instead
    of three copies. It also owns the `playbookVisible` gate (renders `null` when
    false), so the gate is read once instead of per dashboard. The gate itself and
    `src/constants/playbookLaunch.ts` are untouched.
  - **Where it sits now, per dashboard** (all three are rendered by
    `src/screens/DashboardScreen.tsx` inside `HomeStack`, the stack that owns the
    `Playbook` route):
    - `PlayerDashboard.tsx` (player, parent) — **MOVED** from below YOUR PROGRESS to
      directly below `QuickActionsCard`, above the lineup widget. Its local
      `playbookCard`/`playbookIcon`/`playbookCardText`/`playbookTitle`/`playbookDesc`/
      `playbookOpen` styles and its now-unused `Ionicons` import were removed with
      the markup.
    - `CoachDashboard.tsx` (head_coach, assistant_coach, team_manager) — **NEW door**,
      inserted as section 5 between the Quick Actions grid and TEAM PERFORMANCE; the
      numbered section comments below it shifted 5-8 → 6-9.
    - `ClubAdminDashboard.tsx` (club_admin) — **NEW door**, between the Quick Actions
      grid and TEAMS.
  - **Why coaches and admins get it:** the card's only gate has always been
    `playbookVisible` — no role test anywhere, and the `Playbook` route itself is
    gated on the same constant (`AppNavigator.tsx:349`), so every role that can
    reach a dashboard could already open the book. Coaches and directors already had
    the Club Hub tile; this is a second door for them, not a new permission.
  - The other two entry points are UNCHANGED and keep their own markup:
    `src/screens/CoursesScreen.tsx` and `src/screens/ClubHubScreen.tsx` — different
    SHAPES of the same feature, both outside `src/components/dashboards/`.
  - **The lazy boundary holds:** `PlaybookEntryCard.tsx` imports nothing from
    `src/features/pac-playbook/`; the four theme values are written out by value with
    `theme.ts` citations, as the three entry points already do. iOS bundle 9.32 MB,
    unchanged from M6 — the book is still only behind the route's `lazy()`.
  - **Gates:** typecheck 5 pre-existing `src/components/games/*` errors / **0 new** ·
    eslint **0 errors** on the 4 files; per-file warning counts identical to `HEAD`
    via the `--stdin` baseline trick (PlayerDashboard 36/36, CoachDashboard 30/30,
    ClubAdminDashboard 10/10), the new file 1 warning (`navigation: any`, the same
    prop type every dashboard in this repo uses) · `expo export --platform ios`
    **exit 0**.
  - **Known side effect (stale comment, outside this task's SCOPE):**
    `src/constants/playbookLaunch.ts`'s `IMPORTED BY:` list still names
    `PlayerDashboard.tsx` as a direct importer of `playbookVisible`. It no longer is
    — `PlaybookEntryCard.tsx` is. `grep -rn "playbookVisible" src/` is the truth.

- **RESTYLE of the same row, same day (2026-11-01, `654303e`) — DEVICE-VERIFIED in the
  same run: Lu, iOS simulator, Nov 1, 2026 22:39.**
  `PlaybookEntryCard.tsx` only — no other file, no gate, no route, no schema.
  Source: `docs/recon/playbook-polish.md`, section "second pass — the card restyled".
  - **Crest replaces the book disc on the left.** Source found, nothing new hardcoded:
    `clubs.logo_url`, read through the `public_clubs` view the way the book's own
    header does (`src/features/pac-playbook/rpc.ts:85-99`, `fetchClubCrest`), keyed on
    the VIEWER's club from `currentRole.club.id` (`AuthContext.tsx:92`). There is no
    bundled PAC crest asset and no club context carrying a logo — `currentRole.club`
    and `useUserTeams` both stop at `{ id, name }`. Fallback: logo → club initials
    (`CoachDashboard.tsx:336`) → `PAC` (`PlaybookHeader.tsx:62`).
  - **`book-outline` moved** to the right of the title, `size={14}`, still green.
  - **The rule is now the dashboard's violet** `rgba(139, 92, 246, 0.4)` — the exact
    border the quick-nav tiles use (`src/components/QuickActionsCard.tsx:108`,
    `styles.buttonBorder`; `rgb(139,92,246)` = the app violet `#8b5cf6`). Colour only:
    the card keeps `borderWidth: 1.5` and the `#1c2637` raised face. Cue and chevron
    stay green.
  - **Known side effect — the three entry points no longer match.** The green rule was
    PLAYBOOK-CARD-INVITING's whole point; `CoursesScreen.tsx` and `ClubHubScreen.tsx`
    are still green and are outside this task's SCOPE. The dashboard door's only
    remaining thread to the book is the green cue and chevron.
  - **Known side effect — this folder now copies a QUERY from the feature**, not just
    colours (four lines of `public_clubs` select), to hold the lazy boundary.
  - **Found, not fixed (citation drift):** M6 moved `theme.ts`. `card2` is `:65` not
    `:63`, `green` `:81` not `:79`, `lineWidth.mid` `:310` not `:255`. Values unchanged.
    `PlaybookEntryCard.tsx` carries the corrected numbers; `CoursesScreen.tsx` and
    `ClubHubScreen.tsx` still carry the stale ones (outside SCOPE). Also
    `PlaybookHeader.tsx` cites `src/components/comm/ChannelList.tsx`, which does not
    exist — the chat-list crest is `src/screens/ChatScreen.tsx:849`.
  - **TENANT SCOPE — NO, and this is a real exposure.** `playbookVisible` is a plain
    constant with no club in it (`playbookLaunch.ts:57-60`), the route is gated on that
    and nothing else (`AppNavigator.tsx:349`), and the book is fetched by slug
    `'pac-playbook'` with `owner_club_id` never compared to the viewer's club
    (`rpc.ts:45,77-83`; `usePlaybookBook.ts:182` uses it only for the crest). **A
    non-PAC tenant's user sees the PAC-branded card on their dashboard and can open
    PAC's book** — now beside their OWN club's crest, which this pass added. Fixing it
    is a visibility-gate change and was forbidden here. **NEEDS LU.**
  - **Gates:** typecheck 5 pre-existing `src/components/games/*` errors / **0 new** ·
    eslint **0 errors, 1 warning** (`navigation: any`, the warning the file already
    had) / **0 new** · `expo export --platform ios` **exit 0**, iOS bundle 9.32 MB
    (unchanged).
  - **RECOMMEND (suggestion):** if the crest matters more than the file boundary, pass
    it down from the three dashboards instead — they already hold the club — and drop
    the copied query. That needs the dashboard files, so it is a separate task.

- **CREST BUG FIXED, same row, same day (2026-11-01, `654303e`) — DEVICE-VERIFIED in
  the same run: Lu, iOS simulator, Nov 1, 2026 22:39, viewer-club crest rendering
  correctly with the club id passed down from the hosts.**
  Lu's device test: `+zztest7` (secondary parent, PAC) saw the `PAC` lettering, not the
  logo, while `public_clubs.logo_url` for PAC holds a URL that `curl -I` answers 200
  `image/png` 61 KB. Four files: `PlaybookEntryCard.tsx`, `PlayerDashboard.tsx`,
  `CoachDashboard.tsx`, `ClubAdminDashboard.tsx`.
  Source: `docs/recon/playbook-polish.md`, section "ROOT CAUSE — why the crest drew PAC".
  - **ROOT CAUSE: the lookup key was empty, so the query never ran.** The card keyed the
    crest on `useAuth().currentRole?.club?.id`, which is `null` for that role, and the
    effect's guard `if (!playbookVisible || !clubId) return;` took the early exit — no
    `public_clubs` query, no `<Image>` mounted, so `onError` never fired either. Not RLS,
    not the URL, not the column. **Proof is the rendered string:** the initials branch was
    `substring(0, 2)`, two characters, which cannot spell the three-letter `PAC`, so `PAC`
    could only be the `: 'PAC'` fallback, which needs a falsy club name — and
    `AuthContext.tsx:92` sets `club` to `{ id, name }` or to `null` as ONE unit, so a
    falsy name and a falsy id are the same fact.
  - **Why it went unnoticed:** nothing else depends on `currentRole.club`. Its only other
    readers take it last in an `||` chain (`RoleSwitcher.tsx:157`,
    `WorldCupPredictorScreen.tsx:1101`), and the Playbook's own header resolves the crest
    from `book.owner_club_id` instead (`usePlaybookBook.ts:182`).
  - **INFERRED / UNKNOWN:** whether `get_enriched_roles_v2` returns `club_id` for a parent
    row. Server-side, not in this repo. The check is
    `select club_id, club_name from get_enriched_roles_v2('<user id>')` — not run, SQL was
    forbidden here. The fix does not depend on the answer.
  - **THE FIX — the host dashboard hands the club id down** (the earlier RECOMMEND, now in
    scope). `clubId` is a required prop, `clubName` optional, `useAuth` gone from the card.
    Admin passes its own `clubId` prop · Coach passes `team.club_id` (typed at `:35`, from
    `select('*', …)` at `:96`) · Player passes `player.teams?.club_id`, which cost ONE word
    in its select (`:89`) and one optional field on its inline `teams` type (`:40`).
  - **Why the id and not the logo_url:** coach and admin already hold `logo_url` and could
    skip the query, but a player's and a parent's `clubs` join may not answer at all — the
    `public_clubs` view exists precisely because direct `clubs` reads do not answer for
    them (`rpc.ts:85-99`). The id passed is the team row's plain `club_id` column, which
    demonstrably reads, and the logo comes through the view. One path, one RLS story, all
    three roles.
  - Also: the fetched name now wins over the passed one once it lands, and the effect
    clears `crest`/`broken` on a club change so a role switch cannot leave a stale crest.
  - **Gates:** typecheck 5 pre-existing `src/components/games/*` errors / **0 new** ·
    eslint **0 errors**, per-file counts identical to `HEAD` (PlayerDashboard 36/36,
    CoachDashboard 30/30, ClubAdminDashboard 10/10) + 1 warning on the new card
    (`navigation: any`) / **0 new** · `expo export --platform ios` **exit 0**, iOS bundle
    9.32 MB.
  - **DEVICE-SEEN — the image renders.** Lu, iOS simulator, Nov 1, 2026 22:39: the
    viewer-club crest draws on all three role dashboards, so the query does run and
    `public_clubs` does answer with the club id passed down from the hosts. The
    `rpc.ts:85-99` assertion is observed, not inferred. INFERRED: that the original
    `+zztest7` secondary-parent row was among the accounts looked at — the
    verification note says "all 3 role dashboards", it does not name the account.

## Landed — Nov 1 2026 (the Playbook's type scale, and one sign on all three doors)

- **PLAYBOOK-TYPE-PASS-E · six typographic roles in one tokens file, applied
  across the book, plus ruling ACCENT-A on the three entry doors · landed
  2026-11-01 · AGENT-VERIFIED; DEVICE LOOK PENDING.** Typography and hierarchy
  only: no content, no diagram, no quiz logic, no schema, no RPC, no auth, no
  launch flag, no new dependency, no new font. Archivo was already loaded (M6,
  `68a59b7`) and this pass adds no face to it.
  - **THE TOKENS FILE: `src/features/pac-playbook/type.ts`** (new). Six roles —
    **kicker · label · title · subtitle · body · caption** — each a complete
    `TextStyle` built from `theme.ts` names. **It writes no number of its own**,
    so `theme.ts` stays the one place a Playbook measure lives (M1's rule); this
    file is a set of OPINIONS about those values. `line()` / `track()` moved
    here from `styles.ts` so the header and the page resolve a ratio the same
    way — `PlaybookHeader.tsx` had been rounding its own to whole points while
    the page rounded to two.
  - **THE DEFECT THIS PASS WAS REALLY ABOUT — a kicker and a label were the
    same style.** `secttlText` (the section divider: POSSESSION, DEFENDING) and
    `blockLabel` (a label inside a card: WHAT YOU SEE, READ) were byte-identical
    — both `ff.bold` / `fs.meta` / `capsWidest` / `color.mute`. The reader could
    not tell a section from a label because they were set the same. They now
    differ on all three axes at once: the kicker is 800 in `chalk2` at `meta`,
    the label 700 in `mute` at `micro`.
  - **FOUND, AND FIXED HERE: since M6 the book's PROSE was not Archivo.** M6
    swapped 83 sites from `fontWeight: fw.X` to `fontFamily: ff.X`, but a style
    that had never carried a `fontWeight` got no `fontFamily` either — so every
    HEADING was Archivo while all the body text rendered in the OS font. **29 of
    the 103 sized text styles** had no face: `lead`, `one`, `oneMute`,
    `blkText`, `rowDesc`, `coverLead`, `linkboxText`, `rolepanelText`, `qtext`,
    `revtext`, `hitBody`, `pendText`, `cuelineText`, `coverHowText`, `snote`,
    `subdesc`, `note`, `qmeta`, `qstatus`, `qreplyText`, `verbAlt`,
    `resBigSmall`, `mvgroupLabel`, `searchInput`, `fieldInput`, `searchClear`
    among them. Routing them through `role.body` / `role.bodyLead` /
    `role.caption` closes it. **This is why the book reads differently even
    where no size changed** — it is the largest visible change in the pass, and
    it was a bug, not a restyle.
  - **"What you will learn" is its own device now** (`pbk.learnbox`,
    `LearnBox` in `ui.tsx`). It was `blockLabel` + `lead` — the chapter's whole
    promise set in the same label a paragraph inside a card gets. It is a
    KICKER over a FRAMED body with the book's green down the left edge, the
    left-bar device `remind` already uses in pink. No new colour, no new
    measure.
    - **THE "LIST" HAS ONE ITEM, and that is a CONTENT limit, not a choice.**
      The ruling asked for a framed LIST. Every chapter's `learn` in the frozen
      data is a single sentence (`dev/pac-playbook-v2-FINAL-data.json`, 7 of 7),
      and splitting prose on its commas makes fragments ("with and without the
      ball"). `LearnBox` takes `items: string[]` and renders ticks at 2+, so it
      becomes a real list the day the content carries one. **A multi-item list
      needs a content change — NEEDS LU.**
  - **One tap cue, everywhere** (ruling: tappable gets one cue, non-tappable
    none). A chapter's card rows ended in a `StatusPip` and nothing else, so
    the only rows that showed where you could go were the ones with no progress
    to show — `RowEnd` now puts the pip (status) and a chevron (affordance)
    together, and a staff viewer with no pip still gets the chevron. A search
    hit was a `Pressable` with NO cue and NO press state; it has both. The quiz
    pill lost its `›` because the row around it already has a chevron, and the
    green link chips gained the press state they never had.
  - **RULING ACCENT-A — the sign is shared, the frame is the host's.** The
    Playbook SIGN — green kicker `PAC PLAYBOOK`, the book glyph, the tagline,
    the green cue — is now identical on all three doors to the point, the
    weight and the ink. The FRAME stays the host's: the dashboard card keeps
    its violet rule because it sits under the violet tile grid, Courses and Club
    Hub keep their green.
    - **DEFAULT TAKEN — the white `PAC Playbook` title is gone from all three.**
      The kicker carries the name, so the words were printed twice on every
      door. The tagline is the headline now, at `color.chalk2` `#d7dde6` — the
      three doors had three different greys for it before (`#888`, `#9CA3AF`,
      `#64748b`). Reversible: put the title back and the kicker becomes an
      eyebrow above it.
    - **DEFAULT TAKEN — the book glyph appears ONCE per door, in the host's own
      slot.** The dashboard's left disc is the club CREST (verified Nov 1), so
      its glyph sits in the kicker row at 14; Courses dropped its green-tinted
      disc for the same kicker-row glyph, because its chalkboard band already
      carries the book's picture; Club Hub keeps the icon circle every hub tile
      has, at 26. The glyph, its green and the rest of the sign are identical —
      only the SLOT follows the host, which is what ACCENT-A says about host
      furniture. **If Lu wants the slot identical too, that is one more pass.**
    - **DEFAULT TAKEN — the cue dropped its `›`** on all three doors: each door
      already ends in a green chevron, so the arrow said it twice. Same ruling
      as the quiz pill inside the book.
    - `ClubHubScreen`'s `HubCard` gained an optional `kicker` and its `title`
      became optional. **No other hub tile sets either, and none of them
      changes.**
  - **THE LAZY BOUNDARY HOLDS, and the doors CANNOT import `type.ts`.** They are
    boot-path screens and the book is a lazy route, so the sign's values are
    written out in each door with a citation back to `type.ts`, exactly as those
    files already carry `#10b981` and `#1c2637` by value. **Three copies of the
    sign is the cost** — `RECOMMEND (suggestion)`: extract a shared
    `PlaybookSign` component outside the feature folder, which is a new file and
    so was outside this task's SCOPE. The doors also keep `fontWeight` and NOT
    `fontFamily`: Archivo is registered by `font.ts` when the book opens and by
    nothing else, so a door asking for the face would silently get the system
    font.
  - **Files touched (10).** New: `src/features/pac-playbook/type.ts`. Changed:
    `styles.ts` · `ui.tsx` · `PlaybookHeader.tsx` · `screens/ChapterScreen.tsx` ·
    `screens/ContentsScreen.tsx` · `screens/CardScreen.tsx` ·
    `src/components/dashboards/PlaybookEntryCard.tsx` ·
    `src/screens/CoursesScreen.tsx` · `src/screens/ClubHubScreen.tsx`.
    **Not touched on purpose:** every file in `MIRROR.md` (`diagram/*`,
    `search.ts`, `types.ts`, `doodleArt.ts` are byte-identical mirrors of
    `thrive-and-score` and are edited web-first), and `dev/PlaybookDevHarness.tsx`.
  - **Gates:** `npx tsc --noEmit` **5 errors, all pre-existing in
    `src/components/games/*`, 0 new** · `eslint` on the 10 files **0 errors**,
    14 warnings against a 15-warning baseline — **one fewer**, the
    `{ letterSpacing: 1.2 }` inline style that `pbk.blockLabel` now carries ·
    `npx expo export --platform ios` **exit 0**, iOS bundle **9.32 MB
    (unchanged** — the lazy boundary did not move**)**, Archivo still **4 faces,
    not 18** (M6's bundle trap stays shut).
  - **SEEN ON THE SIMULATOR (iPhone 17 Pro, `DEEE9FA3`, dev client over Metro),
    5 of the 8 views asked for:** cover · contents · chapter (the learn device
    and the new row cues) · a card (`F0`) · quiz entry · and the DASHBOARD door
    on a live player login (Zack Testeron, Provo Athletic Club — crest, kicker,
    tagline, cue and violet rule all as designed). Screenshots are in the
    session scratchpad, not the repo.
  - **NOT SEEN: the Courses door and the Club Hub tile.** Neither screen has a
    deep link (`src/navigation/linking.ts` registers no path for them) and the
    simulator cannot be tapped from here — `osascript` has no assistive access
    on this machine, so there is no UI automation. Adding a dev link would mean
    editing `src/navigation/linking.ts`, which is outside this task's SCOPE.
    **Those two doors are UNVERIFIED-VISUAL; they typecheck, lint and bundle,
    and nobody has looked at them.**
  - Source: this session, 2026-11-01; the rulings in Lu's prompt (ACCENT-A and
    the four hierarchy rules); `theme.ts`, `font.ts` and `MIRROR.md` for the
    constraints the pass had to hold.

- **PLAYBOOK-SECTION-RAIL, under PLAYBOOK-TYPE-PASS-E · every section of a
  chapter gets its own tone · landed 2026-11-02 · AGENT-VERIFIED ON THE
  SIMULATOR; LU'S DEVICE LOOK PENDING.** Colour and one inline mark per
  section; no content, no data, no schema, no gate, no dependency, no new
  font. The doors (ACCENT-A), the quiz, the cover and search are untouched.
  - **WHY.** PLAYBOOK-TYPE-PASS-E made the section kicker a distinct ELEMENT
    from a block label, but every section was still the same `chalk2`, so in a
    seventeen-card chapter like Principles nothing but the words told a reader
    which part they were in. A tone gives each section an identity that
    survives scrolling.
  - **THE TONES** live in `theme.ts` (`sectionTones`) because that file is the
    one place a Playbook colour is written down (M1). In the ruling's order:
    **green `#3DD68C` · sky `#6FB1FF` · teal `#2ED3C6` · periwinkle
    `#8FA8FF`**, each with its `tint` — the same ink at **13% alpha**, written
    out as `rgba()` because `theme.ts` is pure data and may not compute. **Edit
    one and the other has to be edited with it.**
    - **COOL ONLY, by ruling — never amber, coral or any warm hue.** The book
      already spends warm colour on meaning that must not be diluted: `gold`
      and `silver` are medals, `bad` `#ff5a76` is a wrong answer, `pink` is a
      reminder.
    - **`tone[0]` is NOT `color.green`.** The book's `#10b981` stays what it
      has always been — right answers, progress, the "us" team. `#3DD68C` is
      lighter and cooler, so it reads as a LABEL and not as a verdict.
  - **THE POSITION RULE lives in `type.ts` (`toneFor`)**, and is the only place
    a tone is assigned: **1st → green, 2nd → sky, 3rd → teal, 4th →
    periwinkle, then cycle.** So `possession` is green because it is FIRST in
    Principles, not because possession is green.
    - **The index is the position in `chapter.content.subs`**, the chapter's
      own declared order — **not** the position among the sections that happen
      to render. A section whose last card is unpublished is skipped on screen,
      and keying on the rendered position would re-colour every section after
      it the day that happened.
  - **WHAT WEARS THE TONE.** On the chapter contents screen: a **3pt rail**
    down the left of the kicker row (`pbk.secttlRail`, `alignSelf:'stretch'` so
    it tracks the row rather than a height kept in step by hand), the **kicker's
    ink**, the **mark**, the **count pill** (was plain `dim` text, now a pill
    at the tone's 13% tint behind the tone's ink), and the **status pip on every
    card in that section**. On the card screen: the **section kicker** in the
    crumb — its mark and its name — and nothing else.
  - **THE MARKS ARE NEW, because the content has none.** `ChapterSub` is `id`,
    `name`, `desc` and nothing more, so the mark comes from the same position
    rule: **1st ball · 2nd shield · 3rd arrows · 4th target.** Drawn as inline
    SVG in `ui.tsx` (`SectionIcon`) with the same pen as the header's icons —
    24-unit box, `stroke-width:2.2`, round caps.
    - **FOUND ON SCREEN AND FIXED: the 1st and 4th marks were the same mark.**
      The target drawn as concentric rings plus a centre dot is, at 14pt, a
      small circle with something in the middle — which is exactly the ball.
      Principles showed it: POSSESSION (1st) and FINGERPRINTS (5th, cycling
      back to slot 1) looked identical to STRUCTURE (4th). The target is a
      **crosshair** now — a ring broken by four ticks — and the two read apart
      at the size they are actually drawn.
  - **SAME-ROOT SWEEP (1 site, reported not asked):** the card screen's CURRENT
    position pip was `color.green` and, beside a sky or teal section kicker,
    read as the FIRST section's tone — a mismatch these tones created. It now
    takes the card's own section tone. The read/unread pips stay neutral: they
    are progress, not identity. **Outside the ruling's literal "card screen's
    section kicker" — say the word and it goes back to green.**
  - **A card with NO section keeps the book's green.** The loose list at the
    head of a chapter belongs to no section, so `toneFor` is never called for
    it; and the four chapters with no `subs` at all are unchanged. The
    chapter-end screen's "Your messages" header passes no position and keeps
    the neutral kicker it has always had.
  - **Files touched (6), all inside the feature folder:** `theme.ts`
    (`sectionTones`) · `type.ts` (`toneFor`) · `styles.ts` (rail, pill, toned
    tick, `crumbSect`) · `ui.tsx` (`SectionIcon`, toned `SectTitle` and
    `StatusPip`) · `screens/ChapterScreen.tsx` · `screens/CardScreen.tsx`.
    Nothing in `MIRROR.md` was touched.
  - **Gates:** `npx tsc --noEmit` **5 errors, all pre-existing in
    `src/components/games/*`, 0 new** · `eslint` on the 6 files **0 errors**, 5
    warnings, all of them CardScreen's pre-existing inline styles, **0 new** ·
    `npx expo export --platform ios` **exit 0**, iOS bundle **9.33 MB** (9.32 →
    9.33, the four marks and the tone table).
  - **SEEN ON THE SIMULATOR** (iPhone 17 Pro `DEEE9FA3`, dev client over Metro,
    offline harness): all six Principles sections across three scroll positions
    — POSSESSION green/ball · DEFENDING sky/shield · THE TWO TRANSITIONS
    teal/arrows · STRUCTURE periwinkle/crosshair · FINGERPRINTS green/ball
    (the cycle) · PRESSING LINES sky/shield — each with its rail, its tinted
    count pill and its toned pips; and card `P4` showing the sky "Defending"
    kicker over a sky position pip. Screenshots are in the session scratchpad,
    not the repo.
  - Source: this session, 2026-11-02; Lu's ruling of the same day (cool tones
    only, the four tones in order, the position rule).

## Landed — Nov 2 2026 (Playbook diagram tabs, keeper angle board, 5th section tone)

All three below are **agent-verified; DEVICE LOOK PENDING.** Gates for the whole
batch, run at landing: `npx tsc --noEmit` **5 errors, all pre-existing in
`src/components/games/*`, 0 new** · `eslint` on the 11 touched files **0
errors**, 9 warnings, all of them pre-existing inline styles and **1 new** (the
keeper board's `{position:'absolute',inset:0}`, the same one `MovementPanel`
already carries) · `npx expo export --platform ios` **exit 0**, iOS bundle
**9.36 MB** (9.33 → 9.36) · **MIRROR.md drift check clean** — silence from the
eight mirrored files and the frozen JSON, exactly the one declared `doodleArt`
hunk. No RPC, no schema, no migration, no new dependency, no launch-flag change,
and **nothing outside `src/features/pac-playbook/`**. Source: this session,
2026-11-02, built from `docs/recon/playbook-content-gaps.md` (RECOMMEND 1–4) on
Lu's rulings of the same day.

- **PLAYBOOK-DIAGRAM-TABS · a tab row for multi-frame figures · landed
  2026-11-02 · agent-verified; DEVICE LOOK PENDING.**
  - **What it fixes, and it is a BUG, not a feature.** A `playbook_blocks`
    diagram may carry `frames` instead of `elements`, and both boards drew the
    LAST frame and nothing else (`DiagramBoard.tsx:144-146` as it was). **Six of
    the book's 38 diagrams carry two frames, so frame 1 of each of those six
    cards was in the database, was fetched, and could not be looked at:**
    `F1` Time & space · `F4` Around the ball · `PL1` Right-side overlap ·
    `P17` Break or keep · `P11` Choose your battles · `GF7` When to juke.
    Three of them (`P17`, `P11`, `GF7`) are A/B pairs whose whole teaching is
    the comparison — the reader only ever saw B. **Those six cards look
    different now; that is the point of the change.**
  - 2 to 5 frames, tab 1 selected on open, tabs are real buttons at
    `control.tab` = **44pt**, the active tab wears the card's SECTION tone
    (PLAYBOOK-SECTION-RAIL) and the rest are neutral. A single-frame block draws
    as a plain board with no row.
  - **Motion, and how it stays inside ruling E-R2 = A.** Selecting a tab plays
    THAT frame's beats: the board re-renders at each beat's own `at`, on the
    diagram's own clock, then once more at the finished picture — **`beats + 1`
    renders per tab (three or four), not sixty a second.** E-R2 = A exists
    because `SvgXml` re-parses its string on every change; four parses over a
    two-second sequence is not the web's rAF loop. **A card with no tabs is
    untouched** — one parse, finished picture, every cell lit
    (PLAYBOOK-STATIC-BEATS-ALL-ON still stands). Reduced motion skips the
    playback and shows the finished picture, which is exactly what the card did
    before.
  - `DiagramBoard` took two optional props, `frame` and `tt`, both defaulting to
    the old behaviour. **The hit test still reads the LAST frame on purpose**:
    `tapTarget()` is the rule the SERVER regrades a tap with, so the quiz board
    (which never passes `frame`) is unchanged.
  - **Also landed here:** the `card.key !== 'FM5v5'` exemption on
    `CardScreen.tsx` was deleted, as the recon asked. **SUPERSEDED 2026-11-03 —
    this line used to read "`FM5v5` now shows the dashed 'Diagram pending'
    panel, because it still has no diagram and no formation block". That was
    true for one day.** Web content **batch 2, applied to prod 2026-11-03
    00:48**, gave `FM5v5` a **5-frame diagram on the `futsal` backdrop**,
    captioned EN + ES (`thrive-and-score/supabase/content/20261102224500_playbook_content_b_apply.sql:121`,
    gate P08 `:351-362`). So the card has a diagram and should render through
    `CardBoard` with a five-tab row. **Device look 2026-11-04: INFERRED OK** —
    Lu's simulator run reports "looks ok", which rules out the dashed panel but
    **did not capture whether it is the tabbed board or a formation panel**;
    batch 2 deliberately left the `FM5v5` CARD row alone (`:27`, `:352`), so
    that distinction still matters. **Owed: count the tabs on a phone in
    Round 3** — five tabs = done. See
    `docs/recon/test-results-1.0.20-round1-nov04.md` §3a and
    `docs/recon/test-plan-1.0.20-nov03.md` Group 5b.
  - **One pre-existing clip fixed, because the tabs made it unavoidable**
    (`styles.ts` `boardCap`): the caption was absolute at `bottom: 8` inside
    `frame`, whose last child is the 13pt `tray` — so the ledge painted over the
    caption's descenders — and it had no `right`, so a long caption ran off the
    frame. Now `bottom: 20` and `right: 10`, so it clears the tray and wraps.
    True of all six cards before today; never seen, because until the tab row
    there was no way to see any caption but the last frame's.
  - **Files (4):** `DiagramBoard.tsx` · `CardBoard.tsx` (rewritten round the tab
    row) · `styles.ts` (`dtabs`/`dtab`, `boardCap`) · `theme.ts`
    (`control.tab`). `FormationPanel` was NOT touched, as instructed.
  - **SEEN ON THE SIMULATOR** (iPhone 17 Pro `DEEE9FA3`, dev client over Metro,
    offline harness): `P17` with a 2-tab row, tab 1 selected in teal, showing
    frame 1 "A · SPACE TO GOAL → BREAK" — the frame that was unreachable — with
    frame 1's own beats; and the 5-frame `__DEV__` fixture on tab 1 and on tab
    4, each with its own picture, caption and beat row. **Motion was caught in
    the act**: two screenshots of the same tab 4 s apart show the pass undrawn
    and then drawn, from one mount.

- **PLAYBOOK-KEEPER-ANGLE · an interactive keeper angle board · landed
  2026-11-02 · agent-verified; DEVICE LOOK PENDING.**
  - `panels/KeeperAnglePanel.tsx`, dispatched from one new branch in
    `CardScreen`'s `kind` chain when `content.kind === 'keeperangle'`. Drag the
    ball: the shooting triangle runs ball → both posts, the keeper is placed on
    an arc ("the rope") on the triangle's bisector, the goal line underneath is
    drawn green where the keeper reaches and dashed white where it is open, and
    three readouts give ANGLE · GOAL COVERED · OPEN GOAL. Second mode, "You be
    the keeper", lets the reader drag the keeper and reads BEST SPOT ✓ when
    their coverage is within 3% of the automatic spot. Four presets (Byline ·
    Box corner · Wide angle · PK spot), EN and ES throughout.
  - **It stores NOTHING, and that is the design** (recon RECOMMEND 1): the posts
    come from the backdrop, the three depths are constants in the file, the
    words are the file's. So there is **no new `playbook_blocks.kind`, no change
    to `types.ts` or `search.ts`** — both byte-identical mirrors — and **no
    migration**. A keeper card is one `playbook_cards` row with
    `content.kind = 'keeperangle'`.
  - **`renderDiagram.ts` was not touched** (RECOMMEND 2). The backdrop is
    `backdrop('zoom-goal', …)` from the mirrored renderer, parsed once through
    `SvgXml`; everything that moves is `react-native-svg` components over it,
    sharing the viewBox — MovementPanel's split, for MovementPanel's reason. The
    drag is raw RN responder events; **no gesture library was added**.
  - **The posts are re-declared locally with a comment citing
    `renderDiagram.ts:112`** (RECOMMEND 3), the precedent `MovementPanel.tsx:73-77`
    sets. **If the backdrop's goal ever moves, `GY` and `POST` move with it.**
  - **THE METRE SCALE — corrected the same day, 2026-11-02, before any device
    look.** Every physical distance on this board is now derived from ONE
    number: the DRAWN goal is 18 board units and a real goal is 7.32 m, so
    **1 unit = 0.4067 m**, and `M(metres)` is the only conversion in the file.
    Rope apex **2.5 m**, keeper reach **1.6 m**, smother **0.25 m**, and the
    four presets written as (across, out) in metres: Byline (14, 1.2) · Box
    corner (17, 15) · Wide angle (8, 11) · **PK spot (0, 11)**.
    **CORRECTED 2026-11-03:** this line read **Wide angle (8, 9)**, which never
    matched the code — `KeeperAnglePanel.tsx:308` is `preset(8, 11)`. The code
    is what ships; the ledger was wrong, not the board.
  - **What that fixed, and it was one thing.** The first cut used fractions of
    the half-goal and placed the presets by eye. The rope and the reach came
    out right by luck — within 1% of 2.5 m and 1.6 m — but the **PK spot sat 12
    units from the line, which is 4.9 m, not 11 m**, and from 4.9 m a keeper on
    the rope covers the whole goal. The board read "PK spot · GOAL COVERED
    100%", the opposite of the one thing every player knows about penalties.
    **The coverage formula was never wrong; the distance was.**
  - **THE PANEL NOW DRAWS ITS OWN CHALK, AT TRUE SCALE** — Lu's ruling,
    2026-11-02: the geometry is the teaching, so the lines must be true to it.
    The first metre-scale pass left the shared `zoom-goal` backdrop underneath,
    and the two disagreed: read back at the goal's own scale that backdrop's
    box is **26.0 m × 8.1 m** (a 6-yard box is 18.32 × 5.5, a penalty area
    40.32 × 16.5), its D is **4.1 m** where a real one is 9.15 m, and it draws
    **no penalty spot at all** — so the penalty spot sat above the drawn box
    and looked like a mistake. This panel no longer uses that backdrop. A local
    memoized `Chalk` component draws the goal line, the goal mouth, the penalty
    area, the six-yard box, the penalty spot and the D (r 9.15 m about the
    spot, only the part outside the area), all from `M()`, in the renderer's
    own pen — `CLR.chalk` at 0.5 / 0.4 opacity, the mouth at 1.4 in `CLR.ink`.
  - **`renderDiagram.ts` AND EVERY MIRRORED FILE ARE STILL UNTOUCHED**, and
    every other board in the book still gets the shared backdrop exactly as
    before. The panel simply stopped importing `backdrop`. It now has **no
    `SvgXml` and no SVG string at all** — both layers are `react-native-svg`
    components over one viewBox — which keeps it further inside ruling
    E-R2 = A than it was.
  - **THE FIT, since true scale is wider than the old window.** The widest
    thing on the board is the penalty area, 40.32 m. At the previous scale
    (1 unit = 0.4067 m) that is **99.15 of 100 units** — it fits, but its
    touchlines land 0.17 m from the board's edge. **The smallest change that
    fits it properly** was to widen this panel's own window to the penalty area
    plus 1.2 m a side: 42.72 m × 22.25 m (deep enough for the top of the D),
    which makes the viewBox **100 × 52.08** instead of 100 × 64 and moves the
    unit scale 4.8%. `VB` has always been local to this panel, so **no shared
    file and no shared viewBox changed**, and because the metres did not move,
    every angle and coverage number is unchanged with them.
  - **Nothing is copied from the renderer's coordinates any more.** The first
    cut re-declared `POST` and `GY` from `renderDiagram.ts:112` with a warning
    that they would rot if that backdrop moved; they are now derived from the
    laws of the game (a goal is 7.32 m), so there is nothing left to keep in
    step.
  - **Geometry, checked numerically before it was looked at.** The rope is the
    circle through both posts whose apex is 2.5 m in front of goal centre —
    centre `k = (d² − hw²)/2d` behind the line, radius `d − k`. A standalone
    check of the formulas confirmed: the rope passes through both posts and the
    apex to 1e-9; the auto keeper lies ON the rope AND on the bisector at all
    four presets; a keeper behind the line covers 0%; a keeper on the ball
    covers 100%; inside the rope the keeper leaves the arc and attacks the ball
    at 0.25 m goal-side.
  - **The four readouts, predicted then photographed — they match exactly:**

    | preset | across · out | angle | covered | open | zone |
    | --- | --- | --- | --- | --- | --- |
    | Byline | 14 m · 1.2 m | 3° | 100% | 0% | TIGHT |
    | Box corner | 17 m · 15 m | 12° | 75% | 25% | TIGHT |
    | Wide angle | 8 m · 11 m | 25° | 66% | 34% | IN BETWEEN |
    | PK spot | 0 m · 11 m | 37° | **57%** | 43% | WIDE |

    **PK 57% is the prototype's own figure.** Byline at 100% is right, not a
    saturation artefact — from the byline the keeper really does own everything.
  - **Wide angle moved from (8, 9) to (8, 11) on Lu's call** and now reads
    **25° · 66% covered**, under the 70% the brief asked for. At (8, 9) the
    same formula gave 74%; the position moved, the rule did not.
  - **Files (3 + 1 shared):** `panels/KeeperAnglePanel.tsx` (new) ·
    `screens/CardScreen.tsx` (one dispatch branch) · `styles.ts` (`kp*`) ·
    `theme.ts` (shared `control.tab`).
  - **Web:** has no such panel and shows the card's static fallback until a web
    slice builds one — Lu's ruling, mobile first. Recorded in `MIRROR.md` so a
    future re-mirror does not look for a web original.
  - **SEEN ON THE SIMULATOR** — three times, as the board was corrected.
    **The version that landed, with its own true-scale chalk:** PK spot reading
    **ANGLE 37° · GOAL COVERED 57% · OPEN GOAL 43%**, WIDE · STEP UP, STAY
    CENTRAL, **with the ball sitting exactly on the drawn penalty spot** and the
    goal line green in the middle, dashed white at both corners; and Wide angle
    reading **25° · 66% · 34%**, IN BETWEEN · NEAR POST FIRST, the spot now
    visible beside the ball. Both boards show the penalty area, the six-yard
    box and the D at their real sizes. Earlier passes, kept for the record:
    with the shared backdrop and true metres, PK 37°/57% but the spot outside
    the drawn box; before the metre scale at all, PK 74°/100% — the bug. The
    second mode, the presets row and the Spanish strings (MODO · Mira al
    portero · ÁNGULO · PORTERÍA TAPADA · ÁNGULO CERRADO · PRIMER PALO) were
    verified before the chalk change and are untouched by it.

- **PLAYBOOK-SECTION-TONE-5 · a fifth section tone and a fifth mark · landed
  2026-11-02 · agent-verified; DEVICE LOOK PENDING.**
  - `sectionTones` gained **`ice` `#C7D7FF`** (tint at 13%, written out, as the
    other four are) and `SectionIcon` gained a fifth slot, a **glove** — a
    mitten with one thumb loop, chosen because at 14pt it is the only mark with
    a bump on one side and a straight bottom edge, where the ball is a closed
    circle, the shield tapers down, the arrows are two open strokes and the
    target is a circle with ticks.
  - **The cycle is unchanged and is now driven by the array, not a literal.**
    `toneFor()` already read `sectionTones.length`; `SectionIcon` had a hardcoded
    `% 4` and now reads the same length, so marks and tones cycle as ONE. A 6th
    section still wraps to green/ball.
  - **This closes the collision the Nov 1 entry recorded**: Principles' 5th
    section, FINGERPRINTS, was green/ball — identical to its 1st section,
    POSSESSION — and is now ice/glove. PRESSING LINES, the 6th, moves from
    sky/shield to green/ball, which is the cycle doing its job.
  - **Files (2):** `theme.ts` · `ui.tsx`. (`type.ts`'s ruling comment updated to
    name the fifth tone.)
  - **SEEN ON THE SIMULATOR**: the Principles chapter list with THE TWO
    TRANSITIONS teal/arrows, STRUCTURE periwinkle/crosshair and **FINGERPRINTS
    ice/glove**, each with its rail and tinted count pill.

- **`dev/testCards.ts` — a `__DEV__`-only fixture, new 2026-11-02.** Neither of
  the two boards above could be looked at on real content: all six frames cards
  carry exactly two frames and no row carries `keeperangle`. The fixture is a
  FUNCTION over the offline book (a 5-frame card `ZZ5` and a keeper card `ZZK`,
  both in `principles`), **not an edit to the frozen
  `pac-playbook-v2-FINAL-data.json`**, which stays byte-identical and keeps
  `MIRROR.md`'s one-command drift check honest. Reached only by
  `thryvyng://playbook-dev?open=reader&…&fix=1`.
  - **Proved absent from a production bundle.** `expo export --platform ios`,
    then a search of the Hermes bundle in BOTH encodings it stores strings in:
    `PLAYBOOK-DEV-TESTCARDS` 0 · `[DEV] Five steps` 0 · `[DEV] Keeper angles` 0 ·
    `Cinco pasos` 0 · `withTestCards` 0 · `playbook-dev` 0 ·
    `offline-pac-playbook` 0 — while the real new code IS there:
    `KeeperAnglePanel` 1 · `You be the keeper` 1 · `Own your near post` 1 ·
    `Ángulo cerrado` 1 · `Punto penal` 1.
  - **`PlaybookLook` (`PlaybookScreen.tsx`) — a harness-only prop, same family
    as `initialNav` and `initialScrollY`, and it exists for the same stated
    reason: this simulator cannot be tapped from a shell.** `xcrun simctl` has
    no tap verb, `idb` and `cliclick` are not installed, and AppleScript window
    control is refused (`osascript is not allowed assistive access`). A 4th tab,
    a second keeper mode and a preset are all behind a PRESS, so without it they
    could be built and never photographed. It seeds initial state only; every
    control still works normally, and the app never sets it.
  - Screenshots are in the session scratchpad, not the repo — as with the Nov 1
    pass.

## Landed — Nov 2 2026 (Playbook coach track, mobile)

- **PLAYBOOK-COACH-TRACK-MOBILE · team progress, the question inbox, kind
  chips and two push taps · landed 2026-11-02 · agent-verified; DEVICE LOOK
  PENDING.**
  - **Built on server objects already APPLIED to prod** — migration
    `20261102033000_playbook_coach_track.sql` in `thrive-and-score`, Nov 2
    2026. **This session made no DB connection of any kind** and wrote no SQL:
    the signatures were read from that file and from
    `thrive-and-score/docs/recon/coach-track-recon.md` (declared read-only
    cross-repo read).
  - **The five server objects the app now calls:** `playbook_staff_roster(p_team_id)`
    → 17 columns per player, progress already counted · `playbook_staff_inbox(p_status)`
    → 21 columns per question, `'open' | 'answered' | 'closed' | 'all'` ·
    `playbook_can_answer_for_player(user, player)` · `playbook_reply_question(question, body)`
    · the FIVE-argument `playbook_send_question(player, chapter, card, body, kind)`.
    Plus two table reads under RLS: `playbook_question_replies` for a thread and
    `playbook_questions` for a push tap's chapter.
  - **THE TWO GATES, and the UI is built on the difference** (rulings R1 / R2):
    - **Progress** = `playbook_can_see_player` — family, the player's team staff
      **including managers**, and the club-wide director set
      (full_access / operations / view_only).
    - **Inbox** = `playbook_can_answer_for_player` — the player's head/assistant
      **coaches** or the club-wide set. **A team manager is NOT in it**, so the
      Questions row is HIDDEN for them, not empty. The client cannot tell the two
      apart from the roster alone (`via` is 'team' for a manager too), so
      `canAnswerAnything()` probes the predicate once per distinct (via, team) and
      stops at the first yes — which also gets the mixed case right (manager of
      team A, coach of team B).
    - **Non-staff see nothing new.** "Am I staff?" is a non-empty roster, i.e. the
      server's answer, never a role string read on the client — the Playbook's
      staff set is `team_staff` + `club_staff` titles and genuinely differs from
      the one `players` uses (recon Q4 item 8).
  - **What shipped, screen by screen:**
    - Contents: a **Team progress** row for staff, and a **Questions** row with an
      open-count badge for answerers only. The book's own `Row` — same hairline,
      same chevron, same target.
    - **Team progress**: team picker built from the roster itself (one team = no
      picker; a director gets "All teams" + a chip per team and a grouped list),
      players **sorted least-read first** — Lu's nudge — each row with name,
      got-it x/total, a bar in that team's section tone, quiz best/last/medal and
      last activity.
    - **Player detail**: per-chapter got-it counts and the quiz panel. Adds no new
      read — `fetchProgress()` is the mirrored call the family side already makes
      — and has **no "Got it" button**, because the write RPC's gate is family-only
      and a button that always fails is worse than none.
    - **Inbox**: Open / Answered tabs (two calls to the same RPC; the server owns
      the status), item = kind pill, player, team, chapter · card, time, reply
      count, "from the family" when the sender is a parent.
    - **Thread**: question + replies + composer. **Sending does not mark it
      answered — the server does**, in the same statement that fires the push, so
      a reply that lands is a reply that notified. A refusal keeps the draft (R-5).
    - **Family side**: three kind chips — **Question / Comment / Suggestion ·
      Pregunta / Comentario / Sugerencia**, default Question, the CHECK
      constraint's own values — and the send moved to the five-arg form. "Your
      messages" now prints the kind and says **Answered ✓** in words.
  - **Push taps** (`src/navigation/AppNavigator.tsx`, `routeNotification`):
    `playbook_question` → the inbox thread for that question; `playbook_answer` →
    the asker's own messages, which live on the end-of-chapter screen, so the
    chapter is looked up from the question row (the payload carries none). Both
    fall back to the contents screen rather than a dead end. Nested navigate
    (Main → HomeTab → Playbook), the shape the chat branch already uses.
  - **NOTHING MIRRORED MOVED.** All four new RPC wrappers live in a NEW
    `coachRpc.ts`; `rpc.ts`, `types.ts` and `search.ts` are untouched and the
    drift check is clean. The web has none of this yet — mobile first, Lu's call.
  - **Files (14).** New: `coachRpc.ts` · `useStaffTrack.ts` · `staffFormat.ts` ·
    `screens/TeamProgressScreen.tsx` · `screens/PlayerProgressScreen.tsx` ·
    `screens/InboxScreen.tsx` · `screens/ThreadScreen.tsx` ·
    `dev/coachFixtures.ts`. Changed: `PlaybookScreen.tsx` (four Nav screens on the
    one route, R-2 intact) · `screens/ContentsScreen.tsx` · `screens/ChapterEndScreen.tsx`
    · `styles.ts` (`ct*`) · `dev/PlaybookDevHarness.tsx` ·
    `src/navigation/AppNavigator.tsx`.
  - **Gates:** `npx tsc --noEmit` **5 errors, all pre-existing in
    `src/components/games/*`, 0 new** · `eslint` on the 14 files **0 errors** (4
    new warnings, all `no-console` on failure paths, the idiom
    `usePlaybookBook.ts` already uses) · `npx expo export --platform ios`
    **exit 0**, iOS bundle **9.40 MB** (9.36 → 9.40) · **MIRROR.md drift check
    clean**.
  - **The dev fixture ships in nothing.** `dev/coachFixtures.ts` is a fake roster
    (6 players, 2 teams) and inbox (3 open, 1 answered) reached only by
    `thryvyng://playbook-dev?open=reader&coach=1` (`coach=mgr` for the manager
    case). Searched in the Hermes bundle in both encodings it stores strings in:
    `PLAYBOOK-DEV-COACHFIX` 0 · `ZZ Test Team B` 0 · `DEV_ROSTER` 0 ·
    `coachFixtures` 0 · `playbook-dev` 0 — while the real code IS there:
    `playbook_staff_roster` 1 · `playbook_staff_inbox` 1 ·
    `playbook_can_answer_for_player` 1 · `Sugerencia` 1 · `playbook_answer` 1.
  - **SEEN ON THE SIMULATOR** (iPhone 17 Pro `DEEE9FA3`, dev client over Metro,
    fixture): contents with both staff rows and a pink **3** badge · team progress
    grouped over two teams with the least-read player on top (4% → 35% → 88%) ·
    player detail · inbox Open with all three kind pills and "from the family" ·
    a thread with its reply box · the family form with Question / Comment /
    Suggestion · "Your messages" with **Answered ✓** and the coach's reply · the
    whole progress screen in Spanish · and the **manager** case showing Team
    progress with NO Questions row.

  - **NOT VERIFIED HERE, and this is the gap the live test closes.** Every screen
    above was driven by the `__DEV__` fixture. **No RPC in this track has ever
    been called against prod from this app** — not once, by design (no DB access
    was permitted, and none was made). What the fixture cannot prove: that the
    roster returns the right players for a real login, that the manager really is
    excluded by the server rather than only by the client, that a reply flips the
    status and fires the two pushes, and that a tapped push lands on the right
    screen.

  - **LIVE TEST PLAN — who logs in, and what they must see:**

    | login | role | Team progress row | Questions row | what to check |
    | --- | --- | --- | --- | --- |
    | **Cole Coachman** | head coach, ZZ Test Team 0826 | **YES** | **YES** | one team, so NO team picker. His players only, least-read first. Open a thread, reply → it moves to Answered and the family gets a push. |
    | **+zztest7** | parent | **NO** | **NO** | neither row anywhere on contents. Chapter end: the three kind chips, Question preselected. Send one as **Suggestion** → Cole's phone gets "New Playbook suggestion". The reply comes back under it with **Answered ✓**. |
    | **ludriv** | director | **YES** | **YES** | "All teams" plus a chip per club team, and the list GROUPED by team. Every club player, not just one team's. |
    | **a team manager** (if one is loginable) | team_manager | **YES** | **NO** | **the one that matters most (R2).** Team progress opens and lists the team; the Questions row must be ABSENT, not empty. If no manager account is loginable, say so and this stays unverified. |

    **Push taps, both directions:** +zztest7 sends → Cole taps the notification →
    lands on that thread. Cole replies → +zztest7 taps → lands on that chapter's
    "Questions & notes" with the reply visible.

    **Two server questions this test also settles** (recon Q4 items 4 and 7, both
    still open): whether a `view_only_director` may in fact reply, and whether an
    INVITED-but-not-joined team's staff should see a player. Neither is a mobile
    change; both are visible from these logins.
  - Screenshots are in the session scratchpad, not the repo — as with the Nov 1
    and Nov 2 passes.
  - Source: this session, 2026-11-02; `thrive-and-score/docs/recon/coach-track-recon.md`
    and migration `20261102033000_playbook_coach_track.sql`; Lu's rulings R1–R4 and
    the Oct 28 "parent Got-it counts for the child / anyone can send" ruling.

## Landed — Nov 2 2026 (Playbook cover polish, after Lu's device test)

- **PLAYBOOK-COVER-POLISH · the staff doors and the family's messages move to
  the cover; an answered age means the reply; the quiz score gains its total**
  — mobile (`thryvyng-mobile`), `src/features/pac-playbook/**`. Status:
  **agent-verified; DEVICE LOOK PENDING.** Four ROUTINE fixes from Lu's Nov 2
  device test of the coach track, plus one lint nit. No schema, no migration,
  no DB connection of any kind.

  - **1 · STAFF-ROWS-ON-COVER.** "Team progress" and "Questions (n)" were at the
    BOTTOM of the contents screen — below the whole index — so a coach scrolled
    the entire book to reach the two rows they opened it for. They now sit near
    the top of the **cover**, under a `YOUR TEAM` / `TU EQUIPO` label, and are
    gone from contents. **The visibility rules did not move with them**: a
    non-empty `playbook_staff_roster()` draws the progress row (R1), and the
    separate `playbook_can_answer_for_player` probe draws the Questions row
    (R2), so a **team manager still sees progress and no inbox**. Same `Row`,
    same dashed `qrow` face, same one chevron.
  - **2 · FAMILY-MESSAGES-ON-COVER.** A new `Your messages` block on the cover:
    the **newest three**, each with the coach's latest reply snippet, and a
    small **pink dot** on any whose reply is newer than this reader's last look.
    `See all messages` opens a new screen listing every message across every
    chapter, **grouped Answered / Waiting**, each one tapping through to that
    chapter's Questions & notes screen — where the thread and the box to write
    another already live. **The block is not rendered at all** for a reader who
    has never sent one (no empty state), which is the ruling's own rule.
  - **THE DOT IS LOCAL AND PER DEVICE, deliberately.** "A reply you have not
    seen" needs a last-seen timestamp and there is no column for one — so it is
    an `AsyncStorage` key per USER (`pbk.messages.seen.<uid>`), the dependency
    this app already ships (`@react-native-async-storage/async-storage` 2.2.0,
    `src/lib/supabase.ts`). **NO SCHEMA CHANGE, which was not in scope.** The
    cost, stated rather than hidden: read your replies on a phone and a tablet
    still shows the dot. Opening the list clears the COVER's count but leaves
    the per-item dots alone, so the screen you opened to find them does not
    blank itself.
  - **The wider read is a NEW non-mirrored file.** `rpc.ts`'s `fetchMyQuestions`
    is per CHAPTER and is a declared mirror, so the all-chapters read lives in a
    new `familyRpc.ts` beside `coachRpc.ts`. **It is not a new permission** —
    the same two tables under the same policies (`playbook_questions`'s SELECT:
    sender, family, answerer; replies inherit the three arms through
    `playbook_question_visible`, migration `20261102033000` :200-225). Dropping
    the chapter filter asks for more ROWS, never for wider access.
  - **3 · THREAD-STAMP-TIME.** An **answered** thread's stamp now reads the age
    of the **latest reply**, not of the question: a thread answered four minutes
    ago used to be stamped "ANSWERED · 72 H". Open threads are unchanged and
    still carry the question's age, because that is how long somebody has been
    waiting. The same rule, marked with a `✓` so the two ages cannot be
    confused, applies in the **inbox list** (`last_reply_at`) and on the
    **family's own messages** (the last reply's `created_at`) — the three places
    an answered age shows.
  - **4 · QUIZ-SCORE-DENOM — the total EXISTS and is the book's.** The
    authoritative run length is `playbook_books.settings.quiz.rules.perRun`
    (**8** in the seeded book), and it is authoritative because the SERVER
    enforces it: `playbook_start_quiz` deals exactly that many and RAISES if the
    bank cannot fill a run (`20261028190000_playbook_v1_schema.sql` :1306,
    :1336-1338). So every score ever written was out of this number. **Nothing
    is stored next to a result** — `playbook_quiz_results` has `best_score`,
    `last_score`, `runs` and no total — so the roster row and the player card
    now print `best 6 / 8 · last 6 / 8`, and a book that states no `perRun`
    prints the bare number exactly as before rather than a guessed denominator.
    **Caveat worth knowing:** change `perRun` later and historical bests are
    re-labelled against the new total, because the old one was never recorded.
  - **5 · Lint nit.** `KeeperAnglePanel`'s live `<Svg>` used `{ position:
    'absolute', inset: 0 }`; it now uses `StyleSheet.absoluteFill`, which the
    static `Chalk` layer beside it already did (P-05c RECOMMEND 1).
  - **NOTHING MIRRORED MOVED.** `rpc.ts`, `types.ts` and `search.ts` show no git
    diff at all; the drift check is the one declared `doodleArt.ts` hunk and
    silence everywhere else.
  - **Files (16).** New: `familyRpc.ts` · `useMyMessages.ts` ·
    `screens/MessagesScreen.tsx`. Changed: `screens/CoverScreen.tsx` ·
    `screens/ContentsScreen.tsx` · `screens/ThreadScreen.tsx` ·
    `screens/InboxScreen.tsx` · `screens/ChapterEndScreen.tsx` ·
    `screens/TeamProgressScreen.tsx` · `screens/PlayerProgressScreen.tsx` ·
    `PlaybookScreen.tsx` · `useStaffTrack.ts` · `styles.ts` ·
    `panels/KeeperAnglePanel.tsx` · `dev/coachFixtures.ts` ·
    `dev/PlaybookDevHarness.tsx`. Plus `MIRROR.md` and this ledger.
  - **Gates:** `npx tsc --noEmit` **5 errors, all pre-existing in
    `src/components/games/*`, 0 new** · `eslint` on the 15 touched source files
    **0 errors** (1 new warning, `no-console` on the messages read's failure
    path — the `usePlaybookBook.ts` idiom) · `npx expo export --platform ios`
    **exit 0** · **MIRROR.md drift check clean**.
  - **SEEN ON THE SIMULATOR** (iPhone 17 Pro `DEEE9FA3`, dev client over Metro,
    `__DEV__` fixture): the cover with both staff rows and the pink **3** badge ·
    the cover with Your messages, **one dot on the 7-minute reply and none on
    the 30-hour one** · See-all grouped Answered (2) / Waiting (2) · the cover
    with **no messages block at all** · a thread stamped **ANSWERED · 7 MIN**
    where the question is three days old · the roster reading `best 6 / 8 · last
    6 / 8` · the player card reading `Best 8 / 8 · last 7 / 8 · 3 runs` · the
    contents screen with the staff rows **gone** · and both blocks together in
    Spanish for a coach who is also a parent.
  - **NOT VERIFIED HERE.** Still the fixture, still no DB call: the live test
    plan under PLAYBOOK-COACH-TRACK-MOBILE is unchanged and now also covers the
    family block (does a real family's cover show their own messages, and does
    the dot behave across two devices?) and the quiz denominator against a real
    `playbook_quiz_results` row.
  - Source: this session, 2026-11-02; Lu's Nov 2 device-test rulings 1–5;
    `20261028190000_playbook_v1_schema.sql` (the quiz run length) and
    `20261102033000_playbook_coach_track.sql` (the question policies).

## Landed — Nov 2 2026 (Playbook staff drill-down + two fixes, AGENT-ONLY)

**PLAYBOOK-STAFF-DRILLDOWN** · `AGENT-ONLY` · **DEVICE LOOK PENDING** · agent
session 2026-11-02, Lu's canvas of the same day ("Playbook Team progress —
director view options", row 2 / Flow1–Flow4) and the two fixes F1 / F2 beside
it. Nothing here has been seen by a human on a real phone.

- **THE SCREEN IS NOW FOUR LEVELS, NOT ONE LIST.** `TeamProgressScreen` was a
  flat roster with a team chip row. It is now: **home** (a "Find a team"
  search, the season line, one tile per gender PRESENT, and "Needs a nudge ·
  whole club") → **gender** (the age-group grid) → **age** (team cards: coach,
  players, avg, nudge count) → **team** (the compact roster). The player
  detail it opens is unchanged.
- **EVERY STEP WITH ONE CHOICE IS SKIPPED**, which is the ruling's own point.
  One team → that roster. Two to four teams → their team cards. One gender →
  straight to the ages. One team in an age → straight to its roster. The
  Coed branch in the fixture skips twice in a row and was photographed doing
  it. The club-level furniture is gated with it: the search box appears only
  above FIVE teams (the only reader who cannot see them all at once) and the
  whole-club nudge row only above one.
- **THE TRAIL** (`Team progress › Boys › U12 › Team`) is on every level, each
  crumb but the last pressable, and it is BUILT FROM THE VIEW rather than
  accumulated, so it cannot drift. A level a reader SKIPPED is not offered as
  a crumb — there was never a screen there for them.
- **THE SEASON RULE IS THE CHAT LIST'S, COPIED WITH ITS PROVENANCE.**
  `getTeamBucket`, **`src/hooks/useUserTeams.ts:26-33`** — test team hidden,
  `archived`/`inactive` past, `active` active, anything else hidden — reached
  by the chat list through `useSharedUserTeams` (`ChatScreen.tsx:722-724`). It
  is COPIED into `staffTeams.ts` (`teamBucket`) because it is not exported and
  `src/hooks/**` was outside this prompt's SCOPE. `normalizeGender` is the
  same story from `ChatScreen.tsx:1636`. **Two forks now exist; see RECOMMEND.**
  One deliberate difference, documented at the function: a team the `teams`
  read did not return is `'unknown'`, not hidden, and shows under the CURRENT
  season — the hook can afford to drop a team it could not classify, this
  screen cannot, because the roster has already said the player exists.
- **"NEEDS A NUDGE" = no Got-it and no quiz activity in 7 days, or never**,
  read off the roster RPC's `last_activity_at` and never recomputed from
  parts. The whole-club list is least-read first, each row labelled with its
  team, and taps through to the player detail.
- **WHAT IS NOT REACHABLE, AND IS THEREFORE NOT DRAWN: the season's NAME.**
  The ruling asks for "Season \<current\>". No read in this app can name a
  season — there is no `seasons` table in `supabase/migrations/`, nothing in
  `src/` selects one, and `teams.season_id` is a bare uuid (the `season_name`
  column on `evaluations` is free text typed into a dropdown, not a season
  record). The line therefore reads **"This season" / "Past seasons"** rather
  than inventing a label, and the toggle appears only when the other season
  actually holds a team. **Naming it needs a new read and a new ruling.**
- **NO NEW RPC, NO NEW COLUMN, NO SCHEMA CHANGE.** The gender / age group /
  season facts come from `teams` (`id, name, age_group, gender, team_status,
  is_test, season_id`) — the same columns `ChatScreen.tsx:1614` and
  `useUserTeams.ts:109-130` already read — and the head coach from
  `team_staff` → `profiles`, which is `ClubTeamsListScreen.tsx:57-71`'s own two
  reads, batched with `.in()` instead of one pair per team.
- **A SHORT READ IS A MISSING FACT, NOT AN ERROR.** If RLS does not return a
  team's row its players DO NOT disappear: the team lands in the "Not set"
  bucket under the current season and the home screen says `N teams with no
  readable gender or age group`. The fixture ships one such team on purpose so
  that line is photographed. A refused `profiles` read simply prints no coach.
- **ONE DEPARTURE FROM THE SPEC, flagged for Lu.** The roster row is `name ·
  thin bar · x / 69 · ›` as ruled — EXCEPT under the **Quiz** sort, where the
  trailing number becomes that player's best quiz score (`6 / 8`, or `—` for
  nobody who has run it). A list ordered by a number it does not show reads as
  shuffled; the first screenshot of it was the proof. One line reverts it.
- **F1 THREAD ✓ CHIP — fixed.** The ✓ was a sibling of the pill row inside a
  WRAPPING `qhead`, so a long `chapter · card · team` line filled line one and
  pushed the ✓ onto its own as an orphan circle. The two pills are now one
  unit inside `ctItemHead` and the meta line is what wraps. Seen: `Question`
  and `✓` side by side with `Principles · The +1 · [DEV] ZZ Test Team 0826`
  wrapping to two lines beside them.
- **F2 MESSAGES BACK — fixed** (Lu, Oct 28: return to where you were). The
  end-of-chapter screen has two doors and Back went to the chapter from both.
  `PlaybookScreen` now remembers which (`endFrom`), set by the one handler the
  messages list uses and cleared by every other way in. The label is
  **"Messages" / "Mensajes"**, deliberately short — "Your messages" came back
  from the simulator as `Your messa…`.
- **A FIFTH "WHERE WAS I".** Tapping a player leaves the progress screen and
  coming back REMOUNTS it, so the drill-down level is held in `PlaybookScreen`
  (`progressState`) and handed back — a director four levels down no longer
  lands on the club tiles after looking at one player.
- **Files (12).** New: `staffTeams.ts` · `staffTree.ts` (pure, no I/O) ·
  `useStaffClub.ts`. Changed: `screens/TeamProgressScreen.tsx` (rebuilt) ·
  `screens/ThreadScreen.tsx` (F1) · `PlaybookScreen.tsx` (F2, the hook, the
  remembered level) · `styles.ts` · `dev/coachFixtures.ts` ·
  `dev/PlaybookDevHarness.tsx` · `MIRROR.md` · this ledger. Looks in
  `docs/recon/m6-drilldown/`.
- **Gates.** `npx tsc --noEmit` **5 errors, all pre-existing in
  `src/components/games/*`, 0 new** · `eslint` on the 9 touched source files
  **0 errors** (1 new warning, `no-console` on `useStaffClub`'s failure path —
  the same idiom as every other read in this folder) · `npx expo export
  --platform ios` **exit 0, 9.45 MB** · fixture strings
  (`PLAYBOOK-DEV-COACHFIX`, `ZZ Lions`, `ZZ Unreadable`, `dev-b12a`,
  `playbook-dev`) **0 hits in the bundle**, while `Needs a nudge` / `Find a
  team` / `This season` are present — the dev tree is folded out and the
  screen is in · **MIRROR.md drift check clean** (silence from the eight
  mirrored files and the data file, one declared `doodleArt.ts` hunk, no git
  diff on `rpc.ts` / `types.ts` / `search.ts`).
- **SEEN ON THE SIMULATOR** (iPhone 17 Pro `DEEE9FA3`, dev client over Metro,
  `__DEV__` fixture — a club of 11 visible teams, 3 genders, 4 age groups, 51
  players, one archived team, one test team and one unreadable team):
  the club home with its four tiles and the pink **19** badge · the Boys age
  grid reading **U8 · U10 · U12** in that order · the two U12 team cards with
  their coaches · the compact roster (`49% · 4/6 · 6.8/8`, three sort chips,
  six one-line rows) · the whole-club nudge list, least read first, including
  a player from the unreadable team · a ONE-TEAM coach landing straight on
  their roster with no search and no tiles · past seasons showing only the
  archived team · the F1 thread · the F2 header reading `‹ Messages` · and the
  roster and the club home in Spanish.
- **NOT VERIFIED HERE.** No DB call was made: every number on every screenshot
  is the fixture. **The live questions this leaves open** — does a real
  director's `teams` read return every team the roster names (the "Not set"
  bucket is the tell)? Does `team_staff` → `profiles` return other teams'
  coaches for a director, and for a coach reading only their own team? Does a
  real club's `team_status` actually divide the seasons the way the chat list
  assumes? Those three are the device/prod test this entry is waiting on.
- Source: this session, 2026-11-02; Lu's Nov 2 canvas (row 2, Flow1–Flow4) and
  the F1 / F2 rulings; `useUserTeams.ts:26-33`; `ChatScreen.tsx:1614,1636`;
  `ClubTeamsListScreen.tsx:57-71`; `20261102033000_playbook_coach_track.sql`
  (the roster RPC's columns).

## Landed — Nov 2 2026 (one gender rule, one season rule — P-10 FOUND 2 closed, AGENT-ONLY)

- **THE FORK IS GONE: two rules, one body each.** `staffTeams.ts` had been
  carrying copies of two non-Playbook functions because neither original was
  exported (recorded at the time in its own comments, in
  `src/features/pac-playbook/MIRROR.md` and in the staff drill-down entry's
  RECOMMEND). Both originals are now exported and both copies are deleted.
- **GENDER → `src/utils/teamGender.ts` (new, 38 lines).** Holds `GenderKey`,
  `normalizeGender`, `getGenderLabel` and `GENDER_ORDER` — the spelling lists
  (`male/boys/boy/m`, `female/girls/girl/f`, `coed/co-ed/mixed`) and the labels
  now exist once. `teams.gender` is free text written by `RegisterTeamScreen`'s
  picker, which is why a normaliser exists at all, so a new spelling is now a
  one-line change in one file instead of two.
- **SEASON → `getTeamBucket`, `src/hooks/useUserTeams.ts`**, exported, with its
  parameter widened from `UserTeam` to a new `TeamBucketFacts`
  (`{ team_status?, is_test? }`) so a caller holding only a bare `teams` row
  can ask the same question. **The body did not change.** `UserTeam` and the
  playbook's `TeamMeta` both satisfy it structurally; `bucketTeams` still calls
  it with a `UserTeam`.
- **`staffTeams.ts` keeps its public surface, so NO file outside SCOPE moved.**
  It re-exports `normalizeGender` / `GENDER_ORDER` / `GenderKey`, re-exports
  `getGenderLabel` **under its old name `genderLabel`**, and `teamBucket` is now
  a three-line wrapper: `if (!meta) return 'unknown'; return getTeamBucket(meta)`.
  `staffTree.ts` (5 call sites) and `screens/TeamProgressScreen.tsx` (5 call
  sites) were **not opened** and are unchanged on disk.
- **The one deliberate difference is PRESERVED and still documented at the
  function:** a team the `teams` read did not return is `'unknown'`, not
  hidden, and shows under the CURRENT season — the hook can afford to drop a
  team it could not classify, the staff tree cannot, because the roster has
  already said the player exists.
- **ChatScreen's two local copies are deleted and its call-site contract is
  unchanged.** The screen's rule differed from the shared one only at the
  edges: an unrecognised gender was `null` there and `'unset'` in the shared
  module. That difference now lives at the three call sites, not in a second
  rule body — the filter-chip list drops `'unset'` (it used to drop `null`),
  the `matchingTeams` filter compares the key directly (`selectedGenders` can
  only ever hold `male`/`female`/`coed`, because the chip row is the hardcoded
  `['male','female','coed']` at `ChatScreen.tsx:2518`), and the team-row meta
  line prints `''` for `'unset'` so it still reads `"U12 • "` rather than
  `"U12 • Not set"`. `getGenderLabel` is called with `es: false` there because
  that line was, and remains, English-only.
- **PROVEN EQUIVALENT, not asserted:** the old and new expressions for all four
  ChatScreen sites were run side by side over 20 inputs (null, undefined, `''`,
  `'  BOYS '`, `'CO-ED'`, `'U12'`, `'men'`, `'rubbish'`, …) — **0 mismatches**.
- **Files changed (6).** New: `src/utils/teamGender.ts`. Edited:
  `src/hooks/useUserTeams.ts` (export + widened param + provenance comment),
  `src/screens/ChatScreen.tsx` (import, two copies deleted, three call sites),
  `src/features/pac-playbook/staffTeams.ts` (both copies → re-exports +
  delegation), `src/features/pac-playbook/MIRROR.md` (the fork note replaced
  with the closure), `docs/ledger.md`.
- **Nothing SACRED.** No schema, migration, RLS, policy, RPC, env, dependency,
  deploy or delete; no DB call made; no read widened — the three `teams` reads
  are byte-for-byte the ones that were already there.
- **GATES.** `npx tsc --noEmit` **5 = baseline** (all 5 pre-existing, all in
  `src/components/games/`, **0 in any touched file and 0 in the two untouched
  consumers**) · `ESLINT_USE_FLAT_CONFIG=false npx eslint` on the four touched
  files **0 errors / 99 warnings**, against a **99-warning** before-count on
  the three pre-existing ones — net **0**, and `teamGender.ts` lints **clean**
  (0 problems) · `npx expo export --platform ios` **exit 0**, iOS bundle
  **9.45 MB** (`index-141d9e4712c6394433f8b6ab84edc274.hbc`) · one definition
  of each function, by grep: `normalizeGender` and `getGenderLabel` only in
  `src/utils/teamGender.ts`, `getTeamBucket` only in `src/hooks/useUserTeams.ts`,
  and the duplicated bodies gone — `'boys', 'boy'` **1 hit** repo-wide and
  `archived' || status === 'inactive'` only in `useUserTeams.ts`.
- **Bundle unchanged in character:** the `__DEV__` fixture strings
  (`PLAYBOOK-DEV-COACHFIX`, `playbook-dev`, `ZZ Lions`) are still **0 hits**
  and the real screen strings still present, exactly as the drill-down entry
  recorded — the new playbook → `hooks/` import edge folds nothing new into the
  dev tree, and it cannot pull the playbook anywhere, since the edge runs that
  one way (`useUserTeams.ts` imports nothing from `src/features/`).
- **NOT VERIFIED HERE: no device or simulator run.** This is a pure refactor
  with an equivalence proof and a green bundle, but the two screens it touches
  — the chat list's club-wide team picker and the playbook staff drill-down —
  have not been re-opened on a device since. Owed look:
  **(1) OBSOLETE — 2026-11-03. THERE IS NO SCREEN LEFT TO LOOK AT.** This asked
  for the club-wide picker's GENDER chips to still filter, and for a team with
  an odd/empty `gender` to still read `"U12 • "`. **That picker was removed in
  `c3924b4` under the whole-club-audience ruling** — the Club-Wide Message tile
  now opens compose directly, with no age/gender/team step. The code says so
  itself at `src/screens/ChatScreen.tsx:877` (*"The age/gender/team audience
  picker that used to live here is GONE"*), and `grep -n "gender"
  src/screens/ChatScreen.tsx` returns **that comment and nothing else**. The
  shared rule in `src/utils/teamGender.ts` is now imported by exactly one place,
  `src/features/pac-playbook/staffTeams.ts:73-74`, so **item (2) below is the
  only surviving test of it** — this item is closed, not deferred.
  **(2) STILL OWED:** the staff drill-down's gender tiles and the This season /
  Past seasons split read the same as the Nov 2 screenshots. Steps:
  `docs/recon/test-plan-1.0.20-nov03.md` Group 7.
- Source: this session, 2026-11-02; P-10 FOUND 2; `src/utils/teamGender.ts`;
  `useUserTeams.ts:24-54` (`TeamBucketFacts` :31, `getTeamBucket` :46);
  `staffTeams.ts:63-99` (re-exports :73-74, `teamBucket` :96);
  `ChatScreen.tsx:35` (import), `:1637-1649` (copies deleted, chip list),
  `:1657` (filter), `:2586-2591` (meta line).

## Landed — Nov 3 2026 (Playbook futsal court backdrop, mirrored from web)

- **PLAYBOOK-FUTSAL-BACKDROP (mobile side) · `BUILT-UNCOMMITTED` · SIMULATOR
  LOOK OWED (look batch, Nov 3) · agent session 2026-11-03.** The web's futsal
  court backdrop is now in the mobile renderer, so **FM5v5 — live in prod since
  Nov 2 on the `futsal` backdrop** — draws correctly on a phone. Nothing here
  has been seen by a human on a simulator or a device.
  - **A MIRROR, NOT A BUILD.** Web first, as the editing rule requires: web
    commit **`b31b922`** ("Playbook diagrams: futsal court backdrop (40x20 m);
    existing figures byte-identical"). All three changed files —
    `diagram/renderDiagram.ts`, `diagram/geometry.ts`, `diagram/types.ts` — are
    in `MIRROR.md`'s byte-identical set, so mobile took **the whole files** from
    that commit rather than hand-applying a hunk. `MIRROR.md`'s provenance and
    table are updated to `b31b922`; the full record of what arrived is in that
    file under "THREE MIRRORED FILES MOVED ON 2026-11-03".
  - **The court.** 40 x 20 m, portrait, attack up, drawn to scale on the
    full-pitch 100 x 140 viewBox at **1 m = 3.3 u** — court 66 x 132 u, inset
    x 17 / y 4, centre (50, 70) · centre circle r 3 m · each 6 m goal area two
    quarter circles r 6 m centred 1.58 m either side of the goal, joined by a
    3.16 m line · penalty marks at **6 m and 10 m** · 3 m goals, net 1 m deep.
    `dims()` now returns `[100, 140]` for `futsal` as well as `full-pitch`.
  - **NO MOBILE-ONLY FILE NEEDED TO CHANGE, checked rather than assumed.** The
    boards read their size from the renderer's own `dims()`
    (`DiagramBoard.tsx:180`, `StillBoard.tsx:89`) and their picture from
    `render()`, and **no mobile-only code branches on a backdrop value** — by
    grep, every non-`diagram/` mention is a hardcoded `'full-pitch'` /
    `'zoom-goal-top'` use (`MovementPanel.tsx`, `usePlaybookBook.ts`, the
    `__DEV__` fixtures) that a new union member cannot affect.
  - **EXISTING FIGURES BYTE-IDENTICAL — proved, not asserted.**
    `renderDiagram.ts` is **36 insertions / 0 deletions** and the only `b === `
    line the diff touches is the added `'futsal'` one. The pure layer was
    transpiled and run before and after over the 44 diagrams in the frozen data
    file (both languages, 50 ms steps through each full cycle plus each still)
    plus `backdrop()` called directly for all five old backdrop values and
    `undefined` and an unknown string at four board sizes: **7,604 renders,
    combined sha256 `fec8c9c11eacd82e339b36612fd7c9e4739228dfe3fdd28bdddf72485a2ef732`
    on both sides.**
  - **GATES.** `npx tsc --noEmit` **5 errors = baseline** — all five
    pre-existing in `src/components/games/*` (`AnticipationArenaGame`,
    `DribbleRushGame`, `PatternPlayGame`), **0 in any touched file**, and proved
    baseline by re-running the typecheck with the three files reverted to HEAD:
    same 5, same 3 files · **`MIRROR.md` drift check PASS** — silence from the
    eight mirrored files and the data file, and exactly the one declared
    `doodleArt.ts:209` `__DEV__` hunk.
  - **Nothing SACRED.** No schema, migration, RLS, RPC, env, auth, delete,
    dependency, `app.json` edit, EAS command or DB connection of any kind; no
    edit in `thrive-and-score`.
  - **NOT VERIFIED HERE: no simulator or device run, and no expo export.** What
    is owed is a LOOK — open a `futsal` figure (FM5v5) in the reader and check
    the court draws inside the board, the players sit on it at the zoom-board
    default size (3.4), and the goals/penalty marks read right. Added to the
    Nov 3 look batch.
  - **SIDE EFFECT, stated: none beyond the figure itself.** No existing figure
    can change (the sha above), and no backdrop other than `futsal` gained or
    lost a line.
  - Source: this session, 2026-11-03;
    `thrive-and-score/docs/recon/playbook-futsal-backdrop-mirror.md` and web
    commit `b31b922` (both declared read-only cross-repo reads);
    `docs/recon/release-1.0.20-readiness.md`.

## Landed — Nov 3 2026 (announcement push taps, receiving side)

- **PLAYBOOK-ANNOUNCE-PUSH · two announcement push types, so a tap opens the
  book or the course library · `BUILT-UNCOMMITTED` · SIMULATOR TAP TEST OWED ·
  ruling B (Lu, 2026-11-03 01:19) · agent session 2026-11-03.** Nothing here
  has been tapped by a human. **RECEIVING SIDE ONLY — there is no sender.**
  - **What the app now understands**, in one new branch beside the two question
    types it copies (`src/navigation/AppNavigator.tsx:1068-1111`):
    - **`playbook_open`**, optional **`data.card`** (a card key such as `F7`)
      → the Playbook reader, opened on that card; **the cover** when there is
      no key, the key is not key-shaped, or the key names a card this viewer's
      book does not hold; **the Dashboard** (Home) when the viewer cannot see
      the book at all.
    - **`courses_open`** → the **Courses** screen.
  - **THREE GATES, EACH IN THE ONE PLACE THAT KNOWS THE ANSWER.** This is the
    part worth reading before changing it:
    1. **Shape** — `ANNOUNCE_CARD_KEY = /^[A-Za-z0-9_-]{1,16}$/`
       (`AppNavigator.tsx:167`, its reasoning `:143-166`), applied with a
       `typeof === 'string'`
       guard, so a non-string or a key with a path separator, whitespace, a
       dot, a quote or a non-ASCII character becomes `undefined` → cover.
       **Proved:** all **69** card keys in the frozen book pass (they are
       `[A-Z0-9]{2,6}` — F0..F5, P1..P19, MV0..MV2, GF1..GF7, PL1..PL4,
       M1..M4, SET, HUNT, HOLD, STORM), and 14 of 15 malformed inputs are
       rejected — `../../etc/passwd`, `F7 OR 1=1`, `F7/../F8`, `<script>`,
       `$(whoami)`, `F7.json`, `café`, a 17-char key, empty and whitespace
       among them. The 15th, the literal string `"null"`, IS key-shaped and is
       passed on **by design** — gate 2 then finds no such card and opens the
       cover.
    2. **Existence and visibility of the CARD** — left to the reader, which
       already does it: `PlaybookScreen.tsx:358-362` opens the card only
       `if (cardParam && cardsByKey.has(cardParam))`, against the book the
       viewer was actually served under RLS. **The navigator holds no book, so
       it cannot answer this without becoming a second source of truth that
       could disagree with the first.** That is why there is a pattern here
       and not a lookup.
    3. **Visibility of the BOOK** — `playbookVisible` is checked **in the
       branch**, not only at the route. With the switch off the `Playbook`
       screen is not registered (`:349`), so a navigate would land on nothing;
       the viewer goes to the Dashboard instead. **The two older question
       types do NOT do this** — they predate the ruling and still rely on the
       route simply being absent.
  - **`data.card` is the ruling's name; `data.card_key` is accepted too**,
    because that is the spelling the server already sends on
    `playbook_question` / `playbook_answer`, and one sender should not have to
    learn two names for one thing.
  - **ALL THREE TAP STATES COME FREE, because this is the same path.** Both
    types are handled inside `routeNotification`, the single entry point for
    the foreground/background listener (`:1142-1152`) and for the pending-tap
    flush (`:1155-1161`) — no new wiring, exactly the coverage
    `playbook_answer` has. **AND THAT COVERAGE HAS A PRE-EXISTING HOLE, which
    this ruling did not create and did not fix:** the listener is a plain
    `addNotificationResponseReceivedListener` in a `useEffect`, which **does
    not replay a response that fired before it was registered**
    (`expo-notifications/build/NotificationsEmitter.js:79-84`), and the app
    **never calls `getLastNotificationResponse()`** (grep → 0 hits in `src/`).
    So **true cold start is unproven for all TEN types**, not just these two.
    The `pendingNotificationRef` stash covers a different race (listener fired,
    navigator not mounted). Recorded here as FOUND; the fix is one hook and is
    outside this ruling's scope.
  - **The signed-out case is also unhandled, for all ten types.** A tap by a
    signed-out user navigates and is then `reset()` to `Welcome` by the auth
    guard (`:938-961`, allow-list `:943-955`), losing the destination. See
    `docs/recon/playbook-share-links.md` § 1.
  - **SENDER = LATER, and it is server-side with NO BUILD.** Nothing sends
    either type. Once the app ships, a sender can start emitting
    `playbook_open` / `courses_open` and existing installs will route them —
    **who may push a whole club is a ruling, not a task.**
  - **OPTION C (an `https://` link that opens the app) IS DEFERRED to the
    links-consistency slice.** **⚠ WARNING, and it is a release-order trap:**
    adding `/playbook` to the AASA is a *web deploy*, so it takes effect for
    **every installed iPhone at once, including 1.0.19** — and 1.0.19 has no
    deep-link path into the reader (it is `__DEV__`-only), so those phones
    would open the app and land on **NotFound**. **Do not add `/playbook` to
    the AASA until 1.0.20 is widely installed.** Source:
    `docs/recon/playbook-share-links.md`, EVIDENCE line 2 and § 7 row U-1.
  - **GATES.** `npx tsc --noEmit` **5 errors = baseline**, all pre-existing in
    `src/components/games/*`, **0 in `AppNavigator.tsx`**. No simulator run, no
    device run, no `expo export`.
  - **Nothing SACRED, and nothing forbidden touched.** No sender, edge
    function, SQL, migration or DB connection of any kind; no `linking.ts`,
    `app.json`, AASA, dependency or EAS change; no edit in
    `thrive-and-score`; `src/components/games/*` untouched.
  - **Test recipe: `docs/recon/announce-push-test.md`**, with payloads in
    `docs/recon/test-payloads/`. **It carries one finding worth knowing before
    anyone writes a sender:** for a remote push, `content.data` is
    **`userInfo["body"]`**, not the top-level keys
    (`EXNotificationSerializer.m:79-83`) — so the data must sit in a top-level
    `body` object, which is the envelope Expo's push service already uses. A
    payload with `type` at the top level routes to the Notifications screen
    and looks like broken code.
  - Source: this session, 2026-11-03; Lu's ruling B of 01:19;
    `docs/recon/playbook-share-links.md`.

## Landed — Nov 3 2026 (club-wide message fix + push cold start)

- **CLUB-WIDE-FIX · "Club-Wide Message" opens the club's announcements chat ·
  `BUILT-UNCOMMITTED` · SIMULATOR TEST OWED · ruling 2026-11-03 01:57 (cards
  ship in 1.0.20) · agent session 2026-11-03.** Nothing here has been tapped by
  a human.
  - **CAUSE — it was never a missing row. It was a row that cannot exist.** The
    button asked for `comm_channels.channel_type = 'broadcast'` and printed
    "Club broadcast channel not found. Contact admin." when that came back
    empty, which it always did: the live CHECK constraint
    `comm_channels_channel_type_check` allows exactly `team, club, dm,
    group_dm`, and the club's real chat is `club-announcements`,
    `channel_type = 'club'`, `is_default = true`
    (Lu's read against prod, 2026-11-03 01:32 —
    `docs/recon/club-announcements.md` §FC-1). Two different strings.
  - **IT NEVER WORKED ON MOBILE — this is a build defect, not a regression.**
    `git log -S"Club broadcast channel not found"` and `-S"sendClubWideMessage"`
    each return **one** commit, `db5dedb` "Major Chat System Overhaul". No
    migration has ever added or dropped a constraint on `comm_channels`, and
    the Oct 22 PAC chat cleanup deleted no club channel (guard G3 refuses
    `club-announcements` outright). Recon §A3/§0.2–0.3, PROVEN.
  - **FIX — one shared helper, `src/lib/clubAnnouncements.ts` (new).**
    `getClubAnnouncementsChannel(clubId)` asks for
    `channel_type = 'club' AND is_default = true AND is_archived = false AND
    club_id = <this club>` and selects `id, name, club_id, allow_member_text`.
    It is the lookup the card compose will reuse.
    - **`club_id` is REQUIRED, not tidiness.** Two clubs each hold their own
      `club-announcements` row, so the old `.limit(1)` with no club filter and
      no `ORDER BY` would hand a PAC admin whichever row Postgres returned
      first — plausibly Belmont's. RLS masks it for a single-club admin and
      does **not** for anyone holding `club_staff` rows at two clubs, which is
      the case the `limit(1)` in `fetchClubWideTarget` exists for. Recon §FC-3②.
    - **`{ data, error }` returned separately.** The old code read `data` and
      threw `error` away, so offline, a 500 and an RLS refusal all printed the
      same "contact admin" sentence as a genuinely missing channel. Three
      outcomes now get three sentences: **not found** → "This club has no
      announcements chat yet." (a real state — web's `ClubMessagesTab` creates
      the channel lazily, so a club whose admin never opened web's
      Club → Messages tab has none, recon §A2); **error** → "Couldn't reach the
      server. Try again."; **no club id** → the file's existing "Club
      information could not be loaded." sentence.
    - Identified by the ROW, never by the name — the same pair
      `isDefaultClubChannel` (`src/lib/channelLeave.ts:111-127`) and the S4
      membership sync use. Default channels have been renamed before.
  - **THE AUDIENCE PICKER IS GONE, and that is the second defect on the same
    path.** All-teams / filter-by-age-and-gender / pick-teams fed a navigation
    param that **nothing in the tree ever read** (recon §A1, PROVEN by grep:
    one hit, the write itself), so every message went to the whole club
    regardless — it promised a split that did not exist. The club step is now
    one line ("Goes to everyone in &lt;club&gt; announcements") and one button.
    **This step is temporary: the card compose replaces it later in 1.0.20**,
    which is why it stays plain.
  - **Members already cannot post there, on the server, and it needed no
    work.** `club-announcements` is `allow_member_text = false` live (§FC-1), so
    the `msg_insert` arm refuses an ordinary member's text and mobile shows
    `LockedChannelNotice`. The card feed inherits it for free. **WHO set that
    column, and when, is UNKNOWN** — no migration writes it and there is no
    audit row.
  - Files: `src/lib/clubAnnouncements.ts` (new),
    `src/screens/ChatScreen.tsx`. Net −258 lines in ChatScreen (the picker, its
    five state hooks, its derived lists and 22 orphaned styles).

- **PUSH-COLD-START · a tap that LAUNCHES the app from killed now routes ·
  `BUILT-UNCOMMITTED` · SIMULATOR TEST OWED · agent session 2026-11-03.**
  Closes the FOUND recorded in the Nov 3 announce-push section above.
  - **What was wrong:** nothing in `src/` ever called
    `getLastNotificationResponse()` (that section's own grep → 0 hits), so a
    tap on a killed app opened it on whatever screen it last had and the
    payload was dropped. The `pendingNotificationRef` stash covered a different
    race (listener fired, navigator not mounted).
  - **Fix:** `src/navigation/AppNavigator.tsx` — the response listener and one
    `Notifications.getLastNotificationResponse()` read now share **one**
    handler inside **one** effect, so every type `routeNotification` knows
    (chat, events, lineups, surveys, evaluations, staff requests and the four
    playbook types) inherits the cold path with **no per-type wiring**. Called
    exactly once, on mount.
  - **ONE TAP CANNOT ROUTE TWICE:** `routedNotificationIdsRef`, a `Set` keyed
    on the notification's own `request.identifier`, is written the moment a tap
    is accepted — **including** when the navigator does not exist yet and the
    payload is stashed, which is what stops the flush effect and the other path
    both replaying it. Belt-and-braces: this repo's earlier reading of
    `expo-notifications/build/NotificationsEmitter.js:79-84` is that the
    listener does not replay a response that fired before it was registered,
    but that ordering is **not ours to control**, so the guard does not depend
    on it.
  - `try/catch`, not a feature test: `getLastNotificationResponse` **throws**
    `UnavailabilityError` when the native method is absent — Expo Go and web
    (`NotificationsEmitter.js:105-108`). The catch is silent on purpose: it
    means "this platform has no stored response", not "a tap was lost".
  - **STILL OPEN, unchanged by this fix:** a tap by a **signed-out** user is
    still `reset()` to `Welcome` by the auth guard, losing the destination
    (`docs/recon/playbook-share-links.md` §1).

- **FOUND (outside scope, read-only) — the Nov 3 audit's `PLAYBOOK_LIVE` claim
  is STALE.** `docs/recon/club-announcements.md` §LB-2 says the gate is
  `PLAYBOOK_LIVE || __DEV__` with `PLAYBOOK_LIVE = false`. Both halves are out
  of date: `src/constants/playbookLaunch.ts:55` reads
  **`export const PLAYBOOK_LIVE = true;`** and `:58` is
  `playbookVisible = PLAYBOOK_LIVE` with **no `__DEV__` branch** — it was
  removed at the Nov 1 flip (file header `:22-34`, and the Nov 1 "Playbook
  launch flip" section above). **The ledger is right and the audit is wrong**,
  so an announcement card's Playbook button does **not** need hiding in release
  on this branch. §LB-2's release-order warning about adding `/playbook` to the
  AASA is unaffected and still stands.

- **GATES.** `npx tsc --noEmit` → **5 errors = baseline**, all pre-existing in
  `src/components/games/*`, **0 in any touched file**. `eslint` on the three
  touched source files → **0 errors, 0 new warnings** vs HEAD
  (ChatScreen 91 → 79, AppNavigator 23 → 23, new helper 0).
  **LOGIC SMOKE on the real helper** (this repo has no test runner, so it was
  transpiled with `tsc` and run against a stub client — nothing left the
  process): the query it builds is
  `from comm_channels · select id, name, club_id, allow_member_text ·
  eq club_id · eq channel_type 'club' · eq is_default true ·
  eq is_archived false · limit 1`, with **no `broadcast` anywhere**; a found
  row returns `{data: row, error: null}`, a missing row `{data: null, error:
  null}`, and a `42501` RLS refusal `{data: null, error: <the error>}` — the
  three outcomes are distinguishable, which is the whole point. **No simulator
  run, no device run** — both rows above owe one, and the push row can only be
  tested by a tap.
- **Nothing SACRED, nothing forbidden touched.** No SQL, migration, edge
  function, DB connection, dependency, `app.json`, EAS or commit; no edit in
  `thrive-and-score`; `src/components/games/*` and `src/lib/permissions.ts`
  untouched; nothing sent at runtime.

## Landed — Nov 3 2026 (club announcement cards, v1 mobile)

- **CLUB-ANNOUNCE-V1-MOBILE · the club's announcements become a feed of cards,
  with a tap-through detail and a staff compose · `BUILT-UNCOMMITTED` ·
  **NEEDS THE SERVER SIDE APPLIED** · SIMULATOR TEST OWED · ruling 2026-11-03
  01:57 (Lu) · agent session 2026-11-03.** Nothing here has been tapped by a
  human: no simulator run, no device run, no `expo export`.
  - **TWO THINGS GATE THE FEATURE AND NEITHER IS IN THIS REPO.** (1) The server
    side is **written and still not applied** — thrive-and-score
    `supabase/migrations/20261103031500_club_announcements_v1.sql`:
    `comm_messages.title text NULL` (CHECK 1–80 after trim),
    `comm_message_actions (id, message_id, kind ∈ {playbook, playbook_card,
    courses}, target, label, sort_order, created_by, created_at)` with SELECT
    only for `authenticated` and INSERT/UPDATE/DELETE **REVOKEd**, and
    `post_club_announcement(p_channel_id, p_title, p_body, p_actions) → uuid`
    which refuses with ERRCODE **P0070–P0074 + a HINT sentinel**. (2) **Lu must
    approve the wording before anything is sent to the real channel** — every
    row inserted into `club-announcements` pushes ~231 PAC families and there
    is no per-message push switch (recon §B11).
  - **SECOND PASS, 2026-11-03 — ALIGNED TO THE MIGRATION, 28-POINT SWEEP.** The
    first pass was written against the AGREED shape; the migration now exists as
    a file, so every point was re-checked against it and against
    `notify-chat-message/core.ts`. **22 already matched, 6 were mobile-side
    mismatches, all 6 fixed** (recon § 1.4 holds the table):
    - **A TITLE IS NOW REQUIRED** (Lu's ruling, and the RPC has no untitled
      branch). The write path sent `p_title: trim() || null`, which made a
      blank field a round trip whose only outcome was P0073. Send is disabled
      until 1–80 chars survive the trim, the hint reads *"Add a title: it's
      what families see on the card."*, and **null is never sent**.
    - **THE REFUSAL MAP WAS THREE-FIFTHS INVENTED.** It carried five sentinels
      in the `close_poll` convention; three (`title_too_long`, `body_required`,
      `actions_invalid`) do not exist, so three of the function's refusals
      would have printed "try again" for a rule the server had already
      explained. All **14** HINTs now map to plain sentences, read from
      migration lines 311–394, and P0070–P0074 are matched as refusal codes.
      **The ladder is unchanged:** the server's own message still wins, so an
      eleventh refusal added later still reads as a sentence.
    - **TWO CEILINGS WERE MISSING:** `p_body` 1–4000 (P0073 `body_invalid`) had
      no limit anywhere, and the button `label` CHECK of 1–40 was only tested
      as "non-blank" in the lib. Both are constants now, enforced in the
      allow-list and on the inputs.
    - Verified unchanged and correct: RPC name and all four parameter
      names/types, the three action keys, every `comm_message_actions` column,
      the card-key regex (character-for-character), `target` nulled on the
      other two kinds, the `title`/content composition and its
      not-a-prefix guard, the push `data.announcement` / `type` / `channel_id`
      keys, and `channel_type='club' AND is_default AND NOT is_archived`.
    - **Known and deliberate:** mobile sends a `sort_order` the RPC ignores
      (it uses `WITH ORDINALITY`, so the ARRAY ORDER decides). The two are
      provably equal and an extra jsonb key cannot refuse; it stays so the
      payload mirrors the table.
  - **PROOF, SECOND PASS:** `npx tsc --noEmit` = **5 errors, the baseline**, all
    pre-existing in `src/components/games/*`, **0 outside it**; eslint on both
    touched files **0 errors 0 warnings**; logic smoke **120 assertions, ALL
    PASS, 0 failures** against a stub client (ten groups; 59 of them new for
    the title rule and the error map). **STILL NOT TAPPED BY A HUMAN** — no
    simulator, no device, no `expo export`. The smoke harness is **not in the
    repo** (scratchpad only) and had to be rebuilt from the recon's prose this
    session — see the RECOMMEND in recon § 7.
  - **IT DOES NOT CRASH WHILE THE SERVER IS BEHIND, and that is a built state,
    not luck.** The feed probes the contract once on open (two of the cheapest
    possible reads) and compose finds out from the RPC itself; both then show
    **"Announcements are being set up"**. The state fires for **exactly six
    codes** — `42703`, `42P01`, `42883`, `PGRST202/204/205` — and for nothing
    else. An RLS refusal (`42501`), a code-less 500 and offline each keep their
    own sentence, because telling someone a feature is being installed when the
    truth is "we could not reach the server" is the mistake
    `getClubAnnouncementsChannel` was written to end (recon §FC-3).
  - **FIVE NEW FILES.** `src/lib/clubAnnouncementCards.ts` (482) holds the whole
    contract — the title split, the action allow-list, the jsonb builder, the
    probe, the one write, the refusal ladder.
    `src/screens/AnnouncementsFeedScreen.tsx` (781),
    `AnnouncementDetailScreen.tsx` (462),
    `ComposeAnnouncementScreen.tsx` (706), and
    `src/constants/announceCardKey.ts` (44) — the card-key pattern **moved**
    out of `AppNavigator.tsx`, where ruling B had put it, so the push branch,
    compose and detail share ONE definition instead of three. Changed:
    `AppNavigator.tsx`, `ChatScreen.tsx`, `src/types/index.ts`,
    `src/lib/permissions.ts` (+269/−199).
  - **THE FEED REUSES `useMessages` WHOLE** rather than growing a second message
    fetch: realtime inserts, the reaction reconcile and the edit/soft-delete
    UPDATE stream all come with it, and `select('*')` returns `title` the moment
    the column exists. The detail screen does the same, because `useMessages` is
    the only reader in this app that keeps a message's reactions correct while it
    is on screen (it refetches the shown rows on every reaction event rather than
    trusting the payload). Reactions are `toggleReaction` + `ReactionPicker`,
    untouched.
  - **THE "NEW" BADGE IS A SNAPSHOT, BY NECESSITY.** Read state is per CHANNEL,
    never per message (recon §B9; a per-message table is SACRED and bigger than
    this whole feature). `last_read_at` is captured ONCE when the screen opens,
    **before** the channel is marked read — after that the stamp is `now()` and
    nothing could be told apart. The badge rule is the server's own
    (`user_id <> me AND created_at > COALESCE(last_read_at, now() - 30 days)`),
    so a badge and the chat list's count cannot disagree. **Badges clear on the
    second visit**, exactly as the row's unread count does today.
  - **FOUR ENTRY POINTS, each proved by grep.** (1) the chat-list row for the
    club's default club chat → the feed, identified by the ROW through the
    shared `isDefaultClubChannel` (`channel_type = 'club' AND is_default`),
    never by name, from one extra read because `get_my_conversations` is not
    known to return `is_default` — **a failed read leaves the set empty and the
    row opens the chat room**, the pre-feature behaviour; (2) the Club-Wide
    Message tile → compose directly (one tap fewer; the temporary `'club'` step
    and its 11 orphaned styles are deleted); (3) a push tap carrying
    `announcement: true` → the feed, which **inherits foreground, background and
    cold start for free** because it sits inside `routeNotification`, and accepts
    `"true"` as well as `true` since a remote push's `data` values arrive as
    strings; (4) the feed's ✎ button, **gated on the server's
    `is_channel_staff`** and absent while the question is in flight.
  - **WHO MAY POST IS THE SERVER'S ANSWER, in all three places that ask.**
    Compose will not draw a form until `is_channel_staff` says yes, the feed's ✎
    is gated on the same answer, and the RPC refuses regardless (ruling FND-4d3).
    The tile's `isClubAdmin` gate is a convenience that keeps it out of a
    parent's modal and is **not** the permission.
  - **ONE CALL, NOT THREE.** Title, body and buttons go to the RPC together:
    three separate writes is exactly what leaves a poll with options and no card
    when the third is refused (recon §P-4). A `playbook_card` button with no
    key-shaped target is blocked at compose and **dropped at read**, so a button
    this build cannot navigate to is never drawn.
  - **"ADD A POLL" IS A SECOND MESSAGE, deliberately** — the existing
    `CreatePollModal` on the same channel, rendering through the existing
    `PollCard` in the feed (recon §P-5). Folding a poll into the announcement
    RPC is a server change nobody has ruled on.
  - **CUT FROM v1, each for a named reason:** the calendar-event destination (it
    needs an event picker at compose time — its own screen); per-card unread and
    a per-message push toggle (both need schema, recon §B12 rows 7 and 10);
    reacting from the feed's cards (the chips are read-only so a scroll cannot
    leave a reaction behind).
  - **DEAD CODE REMOVED.** `canCreatePollInChannel` in `src/lib/permissions.ts`
    — the old global-role list, carrying the same ghost `broadcast` channel type
    as the club-wide bug; `grep -rn canCreatePollInChannel src/` returned ONE
    hit, the definition, before deleting it (slice 4i left it unimported, ledger
    I7). `broadcast` is gone from `Channel.channel_type`, from
    `getChannelColor`'s arm and from the `channel_type IN (…)` filter.
    `grep "'broadcast'" src/` → **1 hit, and it is prose**:
    `src/lib/clubAnnouncements.ts:5`, the header explaining the defect that
    module fixed.
  - **FOUND (outside scope) — `src/lib/permissions.ts` is entirely unimported.**
    The four role helpers left in it have no caller anywhere in `src/`.
    RECOMMEND deleting the file in whatever slice next touches client-side role
    checks; not done here, it is outside the ruling.
  - **FOUND (outside scope, unchanged) — 🛡 `comm_poll_votes_insert` is still the
    pre-4a reactions hole** (recon §P-2), and it matters more now that polls can
    appear in a club-wide feed. SACRED, Lu's call.
  - **DOC CORRECTION.** `docs/recon/club-announcements.md` §LB-2 claimed
    `playbookVisible = PLAYBOOK_LIVE || __DEV__` with `PLAYBOOK_LIVE = false`.
    Both halves were stale: `src/constants/playbookLaunch.ts:55` reads `true` and
    `:58` has no `__DEV__` branch since the Nov 1 flip. A CORRECTION section was
    added to §LB-2 and §LB-5's sequencing note marked superseded. The
    `playbookVisible` checks are **kept anyway** in compose and detail — it is
    the feature's kill switch and costs one boolean read.
  - **GATES.** `npx tsc --noEmit` → **5 errors = baseline**, all pre-existing in
    `src/components/games/*`, **0 in any touched or new file**. `eslint`: **0
    errors everywhere**; **0 warnings in all five new files**; warnings unchanged
    vs HEAD in the four changed ones (ChatScreen 79 → 79, AppNavigator 23 → 23,
    types 1 → 1, permissions 0 → 0). **LOGIC SMOKE, 38 assertions, ALL PASS** —
    the pure helpers transpiled with `tsc` and run against a stub client, nothing
    left the process: the title split in six shapes, the compose round trip
    (preview text == what the feed splits), the action allow-list against `F3`,
    `../../etc/passwd`, a 17-char key, `F7.json` and a non-string, the jsonb
    builder's drop/renumber/null-stray-target/cap-at-3, the six "not applied yet"
    codes vs `42501`/500/offline, the refusal-copy ladder, and the exact queries
    built. **No simulator run, no device run, no `expo export`.**
  - **Nothing SACRED, and nothing forbidden touched.** No SQL, migration, edge
    function, DB connection, dependency, `app.json`, EAS or commit; no edit in
    `thrive-and-score`; `src/components/games/*` untouched; nothing was sent at
    runtime and no announcement was posted.
  - **TEST PLAN FOR LU: `docs/recon/club-announcements-v1-mobile.md` § 5** —
    four stages, one tap at a time. **A sends nothing and is safe today** (it
    ends by proving Send shows "being set up" and posts nothing); **B runs the
    moment the server is applied, still sending nothing**; **C is optional and
    needs a throwaway channel, which is a DB write and therefore Lu's**; **D is
    the real send and starts with "Lu approves the exact wording".**
  - Source: this session, 2026-11-03; Lu's ruling of 01:57;
    `docs/recon/club-announcements.md` (§B6–B12, §LB-1..5, §P-1..5);
    `docs/recon/club-announcements-v1-mobile.md`.

## Landed — Nov 3 2026 (survey share fixed against the live table; the smoke harness gets a home)

- **SURVEY-SHARE-FIX-MOBILE · sharing a survey into a chat writes the columns the
  live table actually has, says so when it fails, and rolls back its own orphan ·
  `BUILT-UNCOMMITTED` · **NEEDS THE SERVER SIDE APPLIED** · SIMULATOR TEST OWED ·
  Lu's Q-05 column read 2026-11-03 12:41 MDT + the web audit
  `thrive-and-score/docs/recon/club-announcements-v1-server.md` § 7 · agent session
  2026-11-03.** Nothing here has been tapped by a human: no simulator run, no device
  run, no `expo export`.
  - **THE DEFECT, and it failed silently every single time.** The old inline handler
    wrote `sv_chat_shares(survey_id, channel_id, posted_by, message_id)`.
    **`channel_id` and `posted_by` are not columns** and `team_id` — **NOT NULL, no
    default** — was omitted. Neither insert's `error` was ever destructured, and
    supabase-js reports a refusal as a RETURNED error rather than a throw, so the
    `try/catch` around two bare `await`s caught nothing: the message landed, the share
    row never did, and the card that row would have drawn could never resolve. The
    only user-visible outcome was an `Alert` on an exception that cannot happen.
    **Live column list, Lu's own read (no migration in either repo creates this
    table):** `id` default · `survey_id` NOT NULL · `team_id` NOT NULL · `shared_by`
    NOT NULL · `message_id` NULL · `shared_at` default `now()`.
  - **NEW, `src/lib/surveyShare.ts` — the one place the contract lives.** The column
    names, the content format, the two-step write with its rollback, and the card's
    read, all in one module, so the write and the read cannot disagree about what a
    column is called — and all of it testable without a device, which the screen is
    not. The screen's `handleShareSurvey` is now its half only: close the picker,
    `refetch` on ok, `logError` + the one sentence *"Couldn't share the survey. Try
    again."* on anything else. **Never silent again.**
  - **THE CONTENT FORMAT IS A CROSS-APP CONTRACT, and mobile was breaking it.** A
    share now posts `[SURVEY:<survey id>] <title>` — the exact shape **web's card
    regex** reads (`thrive-and-score/src/components/comm/ChatPanel.tsx:511`), asserted
    byte for byte by the smoke against web's own regex. Mobile sent the bare title, so
    **every mobile share rendered on web as a plain text bubble with no card**, and
    nothing on the mobile side ever looked wrong — mobile finds its own card by
    message id in `sv_chat_shares`, not from the content. The fix had to be
    deliberate, not reactive.
  - **`team_id` IS CHECKED BEFORE ANYTHING IS WRITTEN.** NOT NULL with no default
    means a chat with no team **cannot** carry a share row, so a message posted into
    one would be a permanent orphan whose card can never resolve.
    `shareSurveyToChat` refuses first with *"Surveys can only be shared in a team
    chat."*; the smoke asserts **zero** writes for `null`, `undefined` and `''`.
  - **THE ROLLBACK.** Two writes, no transaction, and the second is the one RLS is
    most likely to refuse. A refused share row takes the message with it, through
    **`soft_delete_message`** — the SAME door the chat's own "delete my message"
    action uses — so the row leaves every reader's list exactly as a deleted message
    does, on web as well as here. Web does the same thing with a direct
    `update({ is_deleted: true })` (`TeamMessagesTab.tsx:526-529`, already fixed
    there). A **failed rollback is reported, not hidden**: `rolledBack: false` rides
    on the result and the user still sees the failure sentence.
  - **THE GATE IS NOW THE SERVER'S ANSWER (FIX item 2 — and there is no "share
    button": the entry is the `/survey` slash command, which opens
    `SurveyPickerModal`).** Before: `isStaffInChannel` =
    `labelKind.get(user.id) === 'staff'` from `get_channel_member_labels`, i.e. "team
    staff anywhere in this chat's club". After: **`isStaffHere === true`**, the
    server's `is_channel_staff` (`src/lib/channelStaff.ts`) — the answer
    `sv_chat_shares`' own RLS reaches, and the one ruling FND-4d3 exists to insist on.
    **The two disagree about real people in BOTH directions:** a **club_admin** the
    labels RPC has never heard of was told *"Not Authorized"*, and a **coach of
    another team in the same club** was offered a share the database would refuse.
    `undefined` (in flight) reads as not-staff, so the refusal is never shown to
    someone who does have it. The picker's own "staff only" screen reads the same
    value, so the gate that opens it and the gate inside it cannot disagree.
  - **THE CARD READS THE REAL COLUMNS, and gets the name the way the rest of the app
    does.** `SurveyChatCard` asked for `posted_by`, `created_at` and
    `poster:profiles!posted_by(full_name)`: the first two are not columns (they are
    `shared_by` and `shared_at`), and the third assumed a declared FK to `profiles`
    that **nothing in this repo can confirm**, on a table RLS refuses to an ordinary
    parent or player viewer anyway. **One bad column name fails the WHOLE select**, so
    the card resolved to nothing and the `catch` said nothing. Now: `shared_by`,
    `shared_at`, `sv_surveys!inner`, `maybeSingle` — and the name comes from
    **`fetchChatProfileNames` (`get_chat_profiles`, SECURITY DEFINER, gated on sharing
    a channel)**, the app-wide path for every other person's name in a chat (ruling
    FND-1), which carries the server's own ladder ending at `'Thryvyng member'` rather
    than null. `shared_at` has a null guard so a missing date cannot render `NaNd ago`.
  - **A `'survey'` ROW NOW DRAWS A CARD IN ALL THREE MESSAGE SCREENS.** `TeamChatRoom`
    already did (`:834`); **`AnnouncementsFeedScreen` (`:456`) and
    `AnnouncementDetailScreen` (`:256`) are new**, same shape as their existing poll
    branches. Without them a survey in a club chat would have printed its own
    `[SURVEY:<uuid>]` marker as the card headline — the content format fix makes this
    branch **necessary**, not optional. `grep "message_type === 'survey'"` → exactly 3
    hits, `SurveyChatCard` rendered at exactly those 3.
  - **NEW, `scripts/smoke/` + `npm run smoke` — Lu approved it
    (`docs/recon/club-announcements-v1-mobile.md` § 7 RECOMMEND).** The harness had
    been rebuilt in a scratchpad twice and lost twice; the second pass had to
    reconstruct the first's 38 assertions out of that document's prose before it could
    add anything. **Plain node, NO new dependency** — the `typescript` and `node`
    already installed; `package.json` changed by **one line, a script**. `run.js`
    transpiles the **real source files, unchanged**, with the project's own `tsc` under
    `--strict` into a temp dir (the flags recorded in
    `docs/recon/chat-info-club-chats.md` § "Re-run the smoke", plus `--rootDir src`),
    writes a six-line getter shim over the transpiled `lib/supabase.js`, and asserts
    against what the modules then do. **The sources are never copied or edited, so the
    smoke cannot drift from the code it tests**, and a tsc diagnostic naming one of
    them aborts the run. **Isolation is asserted, not assumed:** the run ends by
    checking `@supabase/supabase-js` was never even required, so no client was
    constructed and nothing could open a socket. Two suites: the announcement contract
    (the ten groups the lost harness covered, rebuilt against the committed module —
    including all 14 refusal sentinels mapping to distinct sentences, and `p_title`
    never null) and the survey insert shape (the exact key set, **both phantom columns
    asserted ABSENT**, write order, no-team, each refusal, the rollback, the rollback
    failing, and the card read's column names). **ALL PASS — 255 assertions, 0
    failures.** Adding a suite: `<name>.smoke.js`, export `{ title, run(t, env) }`,
    add it to `SUITES`. **What it cannot prove, stated in the file: it is not a device
    test, and it is NOT a schema test** — the stub records what the code SENT and
    cannot tell you a column exists. Live acceptance is the server dry run's V1/V2/V3.
  - **GATES.** `npx tsc --noEmit` → **5 = baseline**, and the error list is
    **byte-identical** to the before-run (`diff` empty); all 5 pre-existing in
    `src/components/games/*`, **0 in any touched or new file**. `eslint` on the 4
    changed + 1 new source file: **0 errors**, warnings **39 → 36, net −3, 0 new**
    (`TeamChatRoomScreen` 36 → 35; `SurveyChatCard` 3 → 1, the two `as any` casts gone
    and the 1 left is the pre-existing `navigation: any` prop; both announcement
    screens 0 → 0; `src/lib/surveyShare.ts` **0/0**). `eslint scripts/smoke/` → **0
    problems** (`run.js` carries a file-level `no-console` disable with its reason — it
    is a CLI reporter, and nothing in `scripts/` is bundled: Metro's entry is
    `index.ts`). `npm run smoke` → **ALL PASS, 255 assertions**. grep:
    `posted_by` in `src/` → **5 hits, every one PROSE in a comment** recording the
    defect; `channel_id` on `sv_chat_shares` → **2 hits, both prose**; **zero
    executable occurrences of either.** **No simulator run, no device run, no
    `expo export`.**
  - **OWED ON A DEVICE, and item 1 WILL FAIL until the server applies.** (1) The share
    itself as channel staff in a team chat with an open survey, **and web showing a
    card for the same message** — **the live CHECK on `comm_messages.message_type`
    does not list `'survey'` yet** (server migration PART 6), so the first insert is
    refused with `23514`; the smoke pins that exact case, and the point of this build
    is that it now REPORTS it instead of swallowing it. (2) A refused share rolls back
    — no orphan `[SURVEY:…]` message left behind. (3) A **web** share renders on
    mobile (mobile looks the card up by message id, which web writes — so both
    directions should now work). (4) The gate: a club_admin who is not team staff can
    share, a coach of another team in the club cannot — needs two accounts. (5) A
    survey card in the announcements feed and detail screens.
  - **FOUND outside scope, REPORTED not fixed.** **🔎 A card key with stray whitespace
    disables Send with no visible reason** — found by a smoke assertion.
    `isSendableAction` tests the `playbook_card` target **untrimmed**
    (`clubAnnouncementCards.ts:185`), while `buildAnnouncementActionsPayload` trims it
    (`:205`) and `ComposeAnnouncementScreen.tsx:380` trims it for the inline "bad key"
    warning — so `P7 ` shows **no warning next to the field** yet counts as an
    incomplete action, and `canSend` (`:179`) goes **down with nothing on screen saying
    why**. **RECOMMEND (a suggestion): trim in `isSendableAction`**, which makes all
    three agree in one edit; two smoke assertions marked `FOUND` pin today's behaviour
    so a fix flips them deliberately. Also: **`DMChatScreen` branches on
    `message_type` for nothing** (not polls, not surveys), so a card row there would
    render as raw text — **unreachable today in both apps** (mobile's share needs the
    chat's `team_id`, a DM has none; web's share only runs inside `TeamMessagesTab`,
    whose channels are all team channels) and the same latent gap polls already have.
    Carried forward unchanged: **🛡 `comm_poll_votes_insert` is still the pre-4a
    reactions hole (SACRED — Lu's call)**, and `src/lib/permissions.ts` is still
    entirely unimported.
  - **Nothing SACRED, and nothing forbidden touched.** No SQL, migration, edge
    function or DB connection; **no dependency** (`package.json` changed by one line, a
    script); no `app.json`, no `eas.json`, no commit; no edit in `thrive-and-score`
    (**READ-ONLY** there: the § 7 audit, `ChatPanel.tsx`, `TeamMessagesTab.tsx`);
    `src/components/games/*` untouched; nothing was sent at runtime and no survey was
    shared.
  - Source: this session, 2026-11-03; Lu's Q-05 of 12:41 MDT;
    **`docs/recon/survey-share-fix-mobile.md`** (the full write-up: the before/after
    table, the gate change, the harness, the owed list, and the FOUND items);
    `thrive-and-score/docs/recon/club-announcements-v1-server.md` § 7.

## Landed — Nov 4 2026 (Round 1 simulator results, and the pre-launch fix list)

- **RELEASE-1.0.20-FIXES · the small defects found in Round 1, ruled into 1.0.20 ·
  Lu ruling 2026-11-04 00:25: "fix the small fixes we discovered before the launch
  1.0.20" · ~~NOTHING BUILT YET — this entry is the LIST, not a delivery~~ —
  **BUILT 2026-11-04, thirteen items, all `built, unverified by Lu` except the
  one parked. This entry is now the list AND the delivery; see the BUILT block
  below.**
  - **WHERE IT CAME FROM.** Lu's simulator run **2026-11-03 23:40 → 2026-11-04
    00:24**, dev client `com.thryvyng.app` on live Metro, signed in as
    `ludriv@hotmail.com` (club admin, PAC). Screenshots + Metro log, pasted into
    the planning room. Full record, pass by pass:
    **`docs/recon/test-results-1.0.20-round1-nov04.md`**.
    **NOTHING WAS SENT — `Send announcement` was never tapped**, so no push
    reached the ~231 PAC families.
  - **WHAT PASSED, and it is most of the feature.** Club-Wide Message opens
    **New announcement** with no "broadcast" / "Contact admin" anywhere
    (`CLUB-WIDE-FIX` seen by a human for the first time — it had been failing
    100% of the time); the audience line **"Goes to everyone in Provo Athletic
    Club announcements"** shows in full; title stops at **80/80**; an empty
    title gives red **"Add a title: it's what families see on the card."** with
    Send greyed; **`F3/../F4`** gives red **"Letters, numbers, _ and - only, up
    to 16 characters"** plus **"One button still needs its text or its card
    key."** with Send greyed; **`F3`** is accepted and Send activates; the
    **3-button cap** hides the chips; the back arrow leaves with nothing sent;
    the feed is **cards** headed **"club-announcements / Provo Athletic Club"**
    with All/New chips and an **EARLIER** heading, the detail has **no reply
    box**, and long-press opens the who-reacted list. **Foundations shows
    section LINES OF THE PASS with 6 cards** (cards 2–6 = **`F7`–`F11`**, badge
    **"F10 · Card 5 of 6"** on *4v2 The diamond*), **all 6 draw a diagram and
    none says "Diagram pending"** — batch 2's content confirmed on screen.
  - **PUSH: delivery PROVEN, tap routing NOT RUN.** Metro log twice:
    `[Notifications] Received … New in the Playbook`, app in the foreground. But
    **no banner appeared in 3 tries**, so there was nothing to tap and the run
    stopped on the two-strike rule. **Moved to Round 3: real phone, real chat
    push.** Two obstacles found and recorded in the plan: the simulator has
    **TWO dev clients** (`com.thryvyng.app`, Lu's older install and the one in
    use, vs `com.weolkn.thryvyng` from `app.json`) and a push must name the
    bundle id of the app **actually running**; and backgrounding needs the
    simulator menu **Device → Home**, because `Cmd-Shift-H` only works while
    that window has focus.
  - **IN 1.0.20 — ROUTINE, five items.**
    1. **🔧 BROKEN FLOW: the announcement Reactions sheet does not scroll.** 14
       reactors, list cut off, no way to reach the rest. On a feed that reaches
       ~231 families this is the normal case, not an edge case.
    2. **🔧 no banner while the app is open — the WARN is real, the DIAGNOSIS
       was wrong. CORRECTED 2026-11-04.** Metro WARN on each receipt:
       **``shouldShowAlert` is deprecated. Specify `shouldShowBanner` and / or
       `shouldShowList` instead.``** That warning was real and is now gone
       (`shouldShowAlert` removed from both branches, 2026-11-04).
       **THIS ENTRY USED TO SAY THE BANNER IS WHY THE PUSH TAP TEST FAILED.
       That is wrong for the backgrounded attempt**, and the backgrounded
       attempt is the one the test needed: **iOS presents a banner for a
       BACKGROUNDED app itself.** `setNotificationHandler` is consulted only
       while the app is in the **foreground**, so no handler key — deprecated or
       current — can explain a missing banner with the app backgrounded. The two
       keys that replace `shouldShowAlert` were already present and already
       correct, so nothing about presentation changed when the deprecated one
       was dropped.
       **LIKELY CAUSE INSTEAD — INFERRED, nothing was checked during the run:**
       **notification permission was never granted** on that simulator, or the
       banner appeared and closed inside its **~5 second window** before Lu
       looked. **Round 3, in this order:** (1) simulator → Settings →
       Notifications → **the dev client actually running** (`com.thryvyng.app`,
       not `com.weolkn.thryvyng` from `app.json`) → **Allow Notifications ON**;
       (2) **watch the screen while the push is sent**, do not send and then
       look. Only then run the tap test. Detail:
       `docs/recon/release-1.0.20-fixes.md` §12.
    3. **D1 — the card footer runs together and clips.** On screen:
       `LUDWIG SZ. · PROVO ATHLETIC CLUBCARD 11 / 12`. **Lu's ruling: the author
       goes on its own line below, in a different font style, on every card.**
    4. **D2 — diagram lines are too thick.** Lu wants thinner, cleaner,
       professional. **WEB FIRST:** the renderer is a mirror
       (`src/features/pac-playbook/MIRROR.md`), so the change is made on web and
       mirrored across, never edited here, or the mirror breaks. **Lu sees
       before/after.**
    5. **Discard prompt on the compose form.** Leaving a filled announcement
       throws the draft away silently. (The leave itself is correct and was
       confirmed; the missing warning is the gap.)
  - **AFTER 1.0.20 — four items.**
    * **D3 — "The whole team · natural triangles" is too busy.** KEEP the
      light-to-dark green shape movement; ADD width in possession. This is
      **content** (a `playbook_blocks` row), so it needs a content change **and
      a dry run**.
    * **D4 — the `FM5v5` diagram: "good enough for now."** Improve later.
    * **Channel display name** — ~~the feed shows the raw slug
      `club-announcements`, NEEDS A LU RULING~~ — **RULED AND BUILT. Ruling
      R-01, Lu 2026-11-04: "`<club short name> Announcements`" (PAC → "PAC
      Announcements"), plus a custom line-drawn megaphone in the round avatar
      spot.** Moved OUT of "AFTER 1.0.20" and INTO 1.0.20; built the same day,
      see the BUILT block below. **The push TITLE is NOT part of it** — that
      string is built server-side by `chatContextName` in the edge function and
      is in neither repo (`docs/recon/club-announcements-v1-mobile.md:457-460`),
      so a push still arrives titled `club-announcements`.
    * **No-name accounts** render as **"Member"** / **"Grayson's parent"** (seen
      on a Team Manager).
  - **CARRIED FORWARD, still open, from the step-4 defect sweep** (none of these
    is new tonight; they are listed here so the 1.0.20 list is one list):
    **the 5 games `tsc` errors**, including the missing `getGutterBoundaryX`
    (`DribbleRushGame.tsx:712-713` — ~~UNKNOWN if reachable in prod~~
    **ANSWERED 2026-11-04: NOT reachable.** Its only caller, `PerspectiveField`,
    is declared in that file and **rendered nowhere** — grep finds the
    declaration and no use — so the `ReferenceError` could never fire); **the
    games' silent save failure** (INFERRED, `docs/recon/arcade.md` §0.1); ~~**the
    Courses header behind the notch**~~ — **THIS LINE WAS STALE. Its target,
    `CoursesScreen.tsx`, was fixed 2026-10-30 in `892edbe` ("Courses
    safe-area")** and has carried `SafeAreaView edges={['top']}` since;
    `git log -S"edges={['top']}"` on that file names the commit. The same root
    DID still exist one site over, in `MyCoursesScreen.tsx`, and that is what
    was fixed 2026-11-04; ~~**the calendar list card's wrong "?" count**~~ —
    **REMOVED FROM 1.0.20 on 2026-11-04 and PARKED as its own entry,
    `CAL-NOREPLY-COUNT` (below). Lu read the live `players` SELECT policies and
    they settle the question this was stopped on — the answer is that an in-app
    roster count CANNOT be right for a parent.** It is not a thing to build
    before launch; it is a decision between three options. Nothing about the
    card changed; and **the stale docblock at
    `src/constants/announceCardKey.ts:30-33`**, which still says the keys are
    "F0..F5" after batch 2 added `F7`–`F11`.
  - **BUILT 2026-11-04 — all twelve items, one pass, nothing committed. EVERY
    ROW IS `built, unverified by Lu`.** The Round 2 test list — one row per
    item, the exact screen and taps, and the test account each needs — is
    **`docs/recon/release-1.0.20-fixes.md`**. Per item:
    1. **R-01 · announcements chat name + megaphone — built, unverified by Lu.**
       One rule, `announcementsChatName()` in `src/lib/clubAnnouncements.ts`,
       on **four** surfaces: chat list card, feed header, the chat-room
       fallback header (`TeamChatRoomScreen`) and Chat info. Short name is
       DERIVED — **there is no `short_name` column on `clubs`** (mobile reads
       `id, name, logo_url, payment_terms_text` and nothing else): a name of
       **≤14 characters shows whole**, longer becomes **initials** of its
       significant words, so "Provo Athletic Club" → **PAC**. The 14 is a
       JUDGEMENT in one constant, `SHOW_WHOLE_UP_TO`, not a measurement.
       Identified by the ROW (`channel_type = 'club' AND is_default`), never by
       the name. **DISPLAY ONLY — no data write.** Icon:
       `src/components/chat/MegaphoneIcon.tsx` (new), a 24×24 three-path inline
       SVG, stroke-only, tinted by the caller; **`react-native-svg` 15.12.1 was
       already a dependency** and already used by the lineup/training boards,
       so **no new dependency**. **Push title untouched and server-side** — see
       the corrected "Channel display name" line above.
    2. **Reactions sheet scrolls — built, unverified by Lu.** TWO causes, and
       the first is the real one: the dismiss backdrop was a full-screen
       `TouchableOpacity` **wrapping** the sheet, which blocked taps with
       `onStartShouldSetResponder={() => true}` — that claims the touch
       responder on touch-down **before the list's scroll view can**, so a drag
       went nowhere. The backdrop is now an absolutely-positioned `Pressable`
       **sibling**. Second, the `FlatList` got `flexShrink: 1`: in a box bounded
       only by `maxHeight` a list with no flex lays out at full content height
       and the parent clips it, so it never believes it can scroll.
    3. **Foreground banner — built, unverified by Lu, and it fixes the WARN,
       not the banner.** `shouldShowAlert` removed from both branches;
       `shouldShowBanner` + `shouldShowList` were already there and already
       correct. See the corrected item 2 above for why this is unlikely to be
       why no banner appeared.
    4. **D1 · card footer — built, unverified by Lu.** Two lines: club + count
       on line 1 (club wraps and never clips via `flexShrink: 1` on **both**
       the wrapper and the text — RN gives a flex child `flexShrink: 0` where
       the web gives it 1; the count `flexShrink: 0` so it never breaks), the
       author's name on line 2, **italic 500 / 11.5 / sentence case /
       `dim` #8690a0 / 18pt indent**. `splitByline()` is the web's function
       verbatim, splitting `meta.author` at the first `" · "`; no `" · "` → all
       name. **The italic is a FIFTH FONT FACE, not a slant** —
       `Archivo_500Medium_Italic`, from the `@expo-google-fonts/archivo`
       **already installed** (one more subpath import, ~0.1 MB, **no new
       dependency**), because Archivo ships as separate files here and
       `fontStyle: 'italic'` gets a synthetic oblique on Android and nothing on
       iOS. It is the book's only italic.
    5. **D2 · diagram strokes — built, unverified by Lu. MIRROR HELD.** Three
       files copied from `thrive-and-score` @ **`e222074`** and
       **byte-identical** (`diff -q` silent, md5 match): `diagram/strokes.ts`
       (**NEW on mobile** — the one place every stroke width now lives),
       `diagram/renderDiagram.ts`, `diagram/geometry.ts`. **Nothing was
       designed here**; `MIRROR.md` updated — provenance `b31b922` → `e222074`,
       `strokes.ts` added as the **ninth** mirrored file, and the manifest's own
       drift command extended to include it. **That command was run and
       passes.** Drawn line width is now `max(0.24, stored × 0.6)`, so the
       CONTENT is not edited and emphasis keeps its proportion; the 0.24 floor
       keeps F11's ghost lines visible. **`tapTarget()` untouched, so the quiz
       still grades as the server does.** Full old→new table:
       `thrive-and-score/docs/recon/d2-strokes.md`.
    6. **Discard prompt — built, unverified by Lu.** Same `Alert` shape this
       repo already uses on `SurveyResponseScreen.handleBack` ("Keep writing"
       cancel, destructive "Discard"). Dirty = a title, a body **or** a drafted
       button. Covers the **arrow** directly and the **swipe / hardware back**
       through React Navigation's `beforeRemove`. A sent form leaves silently.
    7. **The 5 games `tsc` errors → 0 (baseline 5) — built, unverified by Lu.
       One of the three was a LIVE DEFECT, not type noise:**
       `PatternPlayGame.tsx:427` passed `onPress={startRound}`, so the
       `GestureResponderEvent` became `effectiveRound` → `roundForThisGame`;
       `roundForThisGame === 1` was therefore false on round 1 and
       **`startTimeRef.current` was never stamped**, and `showPattern`'s
       `roundForRetention === 2` dim check could never fire. Now
       `onPress={() => startRound()}`. The other two were inert:
       `getEffectiveLanding` hoisted above its caller (body unchanged), and
       `getGutterBoundaryX` **added** using `getLaneX`'s own arithmetic — and
       its caller is unreachable, see the corrected carried-forward line below.
    8. **Games save is no longer silent — ⚠️ MOOT as of ruling R-04 the same
       day: THE GAMES ARE HIDDEN, so nothing reaches this code in 1.0.20. THE
       FIX IS KEPT, NOT REVERTED** — item 13 hides the games behind a switch
       rather than deleting them, so the day `LEGACY_GAMES_VISIBLE` goes back to
       `true` this save path is the better one, and `logError` means the next
       person to look gets the real Postgres error instead of nothing. **Drop
       the Round 2 row for it** (it was already UNTESTABLE for want of a
       player-role account — see below), and do not read "no alert appeared" as
       a pass: there is no longer a way to reach a game. What was actually
       silent, for whenever the games return: **step 3
       (`daily_game_time`) and step 4 (`award_xp_safe`) threw their `{ error }`
       away**, so a half-written save reported SUCCESS, and every failure went
       to `console.error`, which reaches no report on a release build.
       `recordSession` now returns `{ ok, step }` over five named steps, checks
       every error, reports through `utils/logError` (Sentry), and the screen
       shows a sentence **per step** from `RECORD_SESSION_MESSAGES` that says
       what DID land. **THE SAVE ITSELF IS STILL EXPECTED TO FAIL** for
       `docs/recon/arcade.md` §0.1's reason — the live `game_sessions` is the
       soccer live-stats table and has no `player_id`/`game_id`/`score`. That is
       **SCHEMA, SACRED, and deliberately untouched**; the item asked for "not
       silent", and that failure now reports itself as `step: 'session'` with
       the real Postgres error. **⚠️ UNTESTABLE AS IS: no player-role test
       account is recorded anywhere in `docs/`** (the three known accounts are
       club admin, coach, parent), and the save keys off `currentRole.entity_id`
       — **NEEDS LU: a player login, or confirmation the games are being retired
       and the row can be dropped.**
    9. **Courses notch — the ledger's own target was ALREADY FIXED; the same
       root one site over was not. Built, unverified by Lu.** See the corrected
       carried-forward line below. `CoursesScreen.tsx` has been safe since
       `892edbe` (2026-10-30) and **was not touched**; `MyCoursesScreen.tsx`,
       registered `headerShown: false` with a bare `View` root, was drawing its
       header at y 0 and now uses the same `SafeAreaView edges={['top']}`.
       **FOUND, reported not fixed:** `CourseDetailScreen.tsx` also has a bare
       root, but it is registered `options={{ title: 'Course' }}` so the native
       header sits above it and handles the inset — it is a **double header**,
       a different cosmetic defect, not a notch bug.
    10. **Calendar "?" count — OUT OF 1.0.20, PARKED.** It was BLOCKED here on
        Lu's Oct 26 condition (*"if widening `players` would give a parent a
        different number than staff (RLS), stop and report"*), which could not
        be answered without DB access. **Lu answered it on 2026-11-04 by
        reading the live policies, and the answer closes the approach rather
        than unblocking it.** Moved out of this entry and into its own:
        **`CAL-NOREPLY-COUNT`** (below), with the policy finding and the three
        options. **No code was ever changed for this item**, in either pass.
    11. **`announceCardKey.ts` docblock — corrected.** Now reads **F0..F5 and
        F7..F11 (there is no F6)** and **74, not 69**. Sources named in the
        comment: the batch 2 apply SQL (`…_playbook_content_b_apply.sql:223-232`,
        gate P03 `:295-299`), `docs/recon/test-plan-1.0.20-nov03.md` §0.2, and
        Round 1's own screen ("F10 · Card 5 of 6"). **The 74 is arithmetic over
        that SQL, not a DB count — no database was queried.** The PATTERN never
        needed changing: `^[A-Za-z0-9_-]{1,16}$` always matched `F7`. **FOUND,
        not fixed:** the same stale list is written a second time at
        `docs/ledger.md:1976` — out of this task's scope, sweep it with the next
        ledger edit.
    12. **This entry's banner line — corrected**, see item 2 above.
    13. **🎮 R-04 · THE OLD BRAIN GAMES ARE HIDDEN, and an arcade "coming soon"
        tile stands in their place — built, unverified by Lu.** Ruling R-04, Lu
        2026-11-04: hide the old games in 1.0.20; a new set of arcade games
        replaces them in a later build.
        **ONE CONSTANT, ONE FILE: `src/constants/arcadeLaunch.ts` (new),
        `LEGACY_GAMES_VISIBLE = false`** plus the derived gate
        `legacyGamesVisible` and the three strings the stand-in says. Same
        pattern and the same reasoning as `playbookLaunch.ts`, and a LEAF: it
        imports **only `react-native`** (for `Alert`) and nothing of
        `src/screens`, `src/hooks` or `supabase`, so both role dashboards and
        the navigator can read it without pulling a game screen into their
        bundle. **Flip it back to `true` and every entry point and both routes
        revert, with no other edit.**
        **NOTHING IS DELETED — that is the point of the switch.** All 13 game
        files and 10,428 lines stay on disk; **no row, table or policy was
        touched**, so every `player_game_progress`, `xp_awards` and
        `players.total_xp` value a family already earned is untouched and still
        shown by the XP surfaces. Lu's ruling says the games come BACK, rebuilt;
        deleting them to re-add them later is the worse trade, and a delete is
        SACRED besides.
        **FIVE ENTRY POINTS, FOUND BY GREP, ALL FIVE GUARDED.** `grep -rn
        "'GamesHub'\|'GamePlay'" src` returns exactly five sites and no more:
        (1) `PlayerDashboard.tsx:308` — the "Games" quick-action tile, which
        serves the **player AND parent** roles (`DashboardScreen.tsx:282-291`
        routes both there) → the arcade tile; (2) `CoachDashboard.tsx:500` — the
        "Brain Games" tile, which serves **head_coach, assistant_coach and
        team_manager** → the arcade tile; (3) the **`GamesHub` route** and
        (4) the **`GamePlay` route** in `AppNavigator.tsx` → a guard screen that
        shows the Alert and leaves; (5) `GamesHubScreen.tsx:48` → `GamePlay`,
        which is inside the feature and therefore unreachable once (3) never
        renders — **and its target is (4), so it is guarded twice over.**
        **FOUR MORE PLACES CHECKED AND CLEAN, so the list is a sweep and not a
        guess:** `ClubAdminDashboard` and `NoRoleDashboard` have **no** games
        tile; **Club Hub** has no games entry (one "game" string, an unrelated
        subtitle); there is **no games TAB** (the five are Home, Teams, Chat,
        Calendar, Profile); `linking.ts` declares **no games deep link**; and
        `routeNotification`'s twelve branches include **no games type**.
        **THE XP AND PROGRESS WIDGETS ARE LEFT EXACTLY AS THEY ARE, and they do
        not link to games** — `PlayerDashboard`'s XP badge, level bar and team
        leaderboard and `CoachDashboard`'s Team XP and Top XP Earners all read
        `players.total_xp` and navigate NOWHERE (grep: no `onPress` to either
        route). Hiding the games stops that number GROWING from games; it does
        not change or hide any value already there.
        **THE ROUTES STAY REGISTERED, and that is a deliberate difference from
        how `playbookVisible` gates the `Playbook` route** (that one removes the
        `Stack.Screen` outright). The Playbook route had never shipped, so
        nothing could point at it. `GamesHub` and `GamePlay` **have** shipped: a
        navigation state restored from disk, a saved link or any future push
        payload can still name them, and `navigate()` to an UNREGISTERED name
        does nothing at all — the person would tap and watch the app ignore
        them. Registered-and-guarded, they get the same sentence as the tile.
        `LegacyGameClosedScreen` renders an empty dark view, fires the Alert
        **once** (a `useRef` latch, so a remount cannot stack dialogs), and on
        OK goes back — or to `Dashboard` when there is no stack under it, the
        same fallback pair the Playbook route's `onExit` uses.
        **THE TILE.** Same slot in the same grid, **same size** — it is a flex
        child of the same row, so the row stretches all three tiles to one
        height — and **calmer ink**: neutral slate frame instead of the grid's
        purple, a muted icon box, a small uppercase **"Coming soon"** chip above
        the icon (NOT in the top-right corner, which belongs to the numeric
        unread pill and would read as a count). Title
        **"`<club short name>` Arcade"** → **"PAC Arcade"**, from
        `clubShortName()` in `src/lib/clubAnnouncements.ts` — **the same one
        rule R-01 uses**, so the arcade tile and the announcements chat can
        never abbreviate the club two ways. Subtitle **"New games coming soon"**.
        With no club name in hand it reads **"Thryvyng Arcade"** rather than a
        bare " Arcade". Tap → the Alert: **"New games are on the way"** /
        *"We're building a brand-new set of soccer brain games. We'll let you
        know when they're ready."*, one **OK**. **The Alert's words live once**,
        in `arcadeLaunch.ts`, so the tile and both route guards cannot word it
        three ways.
        **`QuickActionsCard` gained two optional fields**, `subtitle` and
        `comingSoon`/`comingSoonLabel`. Optional on purpose: every existing
        action on every dashboard renders exactly as before.
        **Files (5):** `src/constants/arcadeLaunch.ts` (new) ·
        `src/components/QuickActionsCard.tsx` ·
        `src/components/dashboards/PlayerDashboard.tsx` ·
        `src/components/dashboards/CoachDashboard.tsx` ·
        `src/navigation/AppNavigator.tsx`. **No game file was edited.**
        **R-02 IS SUPERSEDED BY R-04** (Lu, 2026-11-04). ⚠️ **R-02's own text is
        NOT recorded anywhere in this repo** — `grep -rn "R-02" docs/ src/`
        returns nothing but this line, so what it said is **UNKNOWN here** and
        is not restated rather than guessed at. **The check:** R-02 lives in the
        planning room's transcript; paste it here if the supersession needs to
        name what it replaced.
        Lu's screens and taps: **`docs/recon/release-1.0.20-fixes.md` §13.**
  - **GATES, run after the last edit (items 1-12).** `npx tsc --noEmit` → **0
    errors (baseline was 5)**. `ESLINT_USE_FLAT_CONFIG=false npx eslint` on all
    **23 changed files** → **0 errors, 234 warnings** (pre-existing classes:
    `no-console` in the games, inline styles, unused styles).
    `npx expo export --platform ios` → **exit 0**, iOS bundle **9.51 MB**.
    `diff` web↔mobile on `strokes.ts` / `geometry.ts` / `renderDiagram.ts` →
    **no differences**, md5 match; `MIRROR.md`'s own drift command → silence
    from the nine, exactly one declared `doodleArt.ts` hunk, data file
    identical.
  - **GATES, item 13 (R-04), run after its last edit.** `npx tsc --noEmit` →
    **0 errors**. `ESLINT_USE_FLAT_CONFIG=false npx eslint` on the **5 changed
    files** → **0 errors, 92 warnings** (pre-existing classes).
    `npx expo export --platform ios` → **exit 0**, iOS bundle **9.51 MB** — the
    games are hidden, not removed, so the bundle does not shrink; Metro does not
    fold an imported constant across module boundaries, so the game screens are
    still WEIGHT while being UNREACHABLE. `grep -rn "'GamesHub'\|'GamePlay'"
    src` → **5 sites, every one guarded** (the two tiles behind
    `legacyGamesVisible`, the two routes behind it, and the fifth inside a
    feature the switch never renders, whose target is itself one of the guarded
    routes).
  - **NOTHING SACRED TOUCHED.** No schema, no migration, no SQL, no Supabase
    write, no RPC or RLS change, **no new dependency** (`react-native-svg` and
    `@expo-google-fonts/archivo` were both already installed — only one more
    subpath import from the latter), no `package.json`, no `app.json` or version
    bump, no env, no delete, no auth, **no DB access**, no launch switch, no
    Playbook content, no edit in the web repo (read-only), **no commit and no
    push**. `docs/recon/arcade.md` was READ and not written; it was already
    modified in the working tree before this task began.
  - **🛑 BEFORE THE LAUNCH ANNOUNCEMENT GOES OUT — ONE SERVER STEP, AND IT IS
    SACRED.** The announcement **push TITLE** is built **server-side** by
    **`chatContextName` in the Supabase edge function** and still reads the raw
    slug **`club-announcements`** — lower case and hyphenated. R-01 fixed every
    IN-APP surface; it could not touch this one, because the function is in
    neither repo and in no app bundle
    (`docs/recon/club-announcements-v1-mobile.md:457-460`: *"a one-arm change in
    `chatContextName` in the edge function, no store build… Not in this
    repo."*).
    **So the first real announcement to ~231 PAC families would arrive titled
    `club-announcements` on every lock screen**, however well the app reads once
    opened. **Fix it BEFORE the launch announcement, not after.**
    **IT IS SACRED: it is an edge-function change and a DEPLOY.** It needs Lu's
    go-ahead and it is not mobile work — no store build, no app version bump,
    and it changes nothing in this repo. **Side effect to state out loud:**
    deploying that function also affects **every other push type it titles**,
    not only announcements, so the one-arm change wants reading before it ships.
    **Order:** fix + deploy `chatContextName` → send one test announcement to a
    staff-only audience and read the banner → only then the launch
    announcement.
  - **STATUS: `VERIFIED-SIMULATOR` for what §2 of the results file lists as
    PASS; `AGENT-ONLY` for everything built above and for everything else in the
    1.0.20 Playbook batch.** `FM5v5` is **INFERRED OK** and owes a tab count
    (see the superseded "Diagram pending" note above). **The list in this entry
    is now built — twelve items plus R-04's item 13, with item 10 parked out to
    `CAL-NOREPLY-COUNT` and item 8 moot — and not one row has been seen by a
    human.**
  - **Nothing SACRED touched to WRITE THE LIST either** (the 2026-11-04 00:25
    pass that created this entry, before the build above): docs only — no code,
    schema, migration, dependency, env, delete, DB access or commit; no edit in
    `thrive-and-score`; `docs/recon/arcade.md` left as it was.
  - Source: Lu's run and ruling, 2026-11-03/04;
    **`docs/recon/test-results-1.0.20-round1-nov04.md`**;
    `docs/recon/test-plan-1.0.20-nov03.md` (corrected in the same pass);
    the build: **`docs/recon/release-1.0.20-fixes.md`** (2026-11-04, §§1-13).

- **CAL-NOREPLY-COUNT · the calendar list card's "?" count · PARKED 2026-11-04,
  moved OUT of 1.0.20 · the blocking question is ANSWERED and the answer rules
  out the approach, so what is left is a choice, not a build.**
  - **THE DEFECT, unchanged and still on screen.** The calendar list card
    tallies RSVP **rows** with `status === 'pending'`
    (`src/screens/CalendarScreen.tsx:256-262`). A player who has **never
    answered has no row at all**, so the card shows **`? 0`** for an event where
    the event-detail Responses bar correctly shows **11**. The two disagree in
    front of the user.
  - **THE RULE ALREADY EXISTS and is not the problem.**
    `noReplyFromRoster(rosterSize, going, cantGo)`
    (`src/utils/attendanceResolver.ts:214`) is the one rule, and the list card
    already holds `going` and `cantGo`. **It lacks a roster SIZE** — there is no
    roster hook; the source the detail screen and the Attendance tab share is
    the inline `fetchRoster` in `EventDetailScreen.tsx:280-294`, which is **per
    event**. The sanctioned fallback was one batched
    `players.select('id, team_id').in('team_id', teamIds)` per fetch.
  - **WHY IT WAS BLOCKED TWICE** (Oct 26, and again 2026-11-04): Lu's standing
    condition was *"if widening `players` would give a parent a different number
    than staff (RLS), stop and report"*, and it could not be answered from this
    repo — `supabase/migrations/` holds one migration and **no `players` policy
    SQL**, and agent tasks forbid prod DB access.
  - **🔑 THE FINDING THAT ANSWERS IT — Lu read the live `players` SELECT
    policies himself (prod `pg_policies`, 2026-11-04).** They are **not
    symmetric**:
    * **staff and club admins see the WHOLE TEAM** — the policies gate on
      `is_team_staff` / `is_club_admin`;
    * **a parent sees ONLY THEIR OWN CHILD** — the policy *"Parents and players
      can view own records"*.
    **SO AN IN-APP ROSTER COUNT CANNOT BE RIGHT FOR A PARENT.** Widening the
    `players` read would return 1 row for a parent and 14 for a coach, and
    `noReplyFromRoster` would then print a confidently wrong number on a
    parent's calendar — **worse than today's `? 0`, which is at least wrong the
    same way for everybody.** The approved fix is therefore **closed, not
    pending**: it was never a 3-line change, it was a 3-line change plus an
    assumption that has now been disproved.
    **Source: Lu's own read of prod `pg_policies`, 2026-11-04.** PROVEN, by Lu,
    not by this repo — no agent has queried that database.
  - **IT ALSO EXPLAINS A SECOND THING, and this one is INFERRED:** the
    event-detail **Responses bar has been under-counting for parents all
    along**, because `fetchRoster` runs unfiltered for every role and feeds that
    bar. Under these policies a parent's `fetchRoster` returns **their own child
    only**. The Oct 26 note called this out as the alternative to "parents can
    read a whole roster" and could not tell the two apart; the policies pick
    this one. **INFERRED — nobody has looked at that bar as a parent.** **The
    check:** open one event's detail as a parent and read the Responses bar's
    roster total. If it says "1 on the roster", this is confirmed and it is a
    **bigger, separate defect than the calendar card**.
  - **OPTIONS FOR LATER — Lu's call, none of them started.**
    * **A · STAFF-ONLY COUNT.** Show `? n` only where the policies let the count
      be right: staff and club admins get the real number from the widened
      `players` read; a parent's card shows the counts it can stand behind
      (`✓`/`✕`) and **no `?` at all** rather than a wrong one. **ROUTINE** —
      client-only, no schema, no policy, and the gate already exists in this
      codebase (`isStaff` in `EventDetailScreen.tsx:244` = team staff OR
      `club_admin` OR `platform_admin`). **This is the option this entry
      recommends**, because it is the only one that needs nothing SACRED.
    * **B · A COUNT-ONLY DB FUNCTION.** A `SECURITY DEFINER` function returning
      a roster COUNT per team — a number, never names — so a parent can be told
      "11 of 14 have not answered" without being able to read the 14 rows.
      **SACRED: a new DB function, a migration and a grant.** Needs its own
      ruling, and the function's own gate needs writing carefully (who may ask
      for which team's count).
    * **C · LEAVE IT.** The card keeps `? 0`. Cheapest, and the cost is that one
      number contradicts another number two taps away.
  - **NOT A LAUNCH BLOCKER, which is why it left 1.0.20.** It is a wrong number
    on a card, not a broken flow: no write is affected, the RSVP path is
    untouched, and the event-detail bar is the number anyone acting on it reads.
  - **DO NOT RE-FILE IT AS A NEW BUG.** It is known, it is parked here, and the
    `?` on the calendar list card is **knowingly wrong** until one of A/B/C is
    ruled.
  - **Nothing was changed for this entry, in any pass.** No code, no schema, no
    migration, no policy, no DB access by any agent; docs only.
  - Source: the Oct 26 BLOCKED note (Open gaps → Client-side open items, and
    `ledger.md` line ~463), carried into `RELEASE-1.0.20-FIXES` item 10 and
    moved here 2026-11-04; **the policy finding is Lu's own read of prod
    `pg_policies`, 2026-11-04**; `docs/recon/release-1.0.20-fixes.md` §10.

## Landed — Nov 4 2026 (Round 2 results, R-05, and the two post-Round-2 builds)

- **RELEASE-1.0.20-FIXES · ROUND 2 RESULTS — Lu, iOS simulator, 2026-11-04. The
  first human verification any of the thirteen items has had.**
  - **✅ VERIFIED BY LU — item 1 (1a, 1b), item 2, item 4, item 5 (lines,
    triangles, footer, quiz grading), item 6 (6a, 6b, 6c, 6d), item 9 (9a, 9b),
    item 13 (the coach tile, the parent tile, and the note).** These rows move
    from `built, unverified by Lu` to **`VERIFIED-SIMULATOR`** and must not be
    re-planned as new work. **6e was NOT run and must not be** — it sends a real
    push to ~231 PAC families.
  - **❎ STILL UNVERIFIED, and why each one:**
    * **1c and 1d** — the chat-room fallback and its Chat info. Reachable only
      by the timing trick in `docs/recon/release-1.0.20-fixes.md` §1 row 1c;
      not reached in Round 2. **Carried to Round 3.**
    * **survey share** — **moved to Round 3, and CHECK WHAT IT TOUCHES FIRST.**
      Do not test it blind: establish which channels and which rows a share
      writes before tapping it.
    * **FM5v5 tab count** — **moved to Round 3.** Still the `INFERRED OK` it has
      been since Round 1; it owes a counted number of tabs, not an opinion.
    * **item 3, the push-warning check** — **🅿️ PARKED after two inconclusive
      rounds.** The `shouldShowAlert` removal is **AGENT PROOF ONLY** (the WARN
      is gone from source); no human has read a banner. Two rounds failed to
      produce one, so it stops costing test passes. **Round 3 is a REAL PHONE,
      and the banner question is answered there or not at all.**
    * **the parent roster number** (§10's one INFERRED check — the Responses bar
      total as a parent) — **NOT CAPTURED.** Still the open check that would
      confirm or kill the under-count inference under `CAL-NOREPLY-COUNT`.
  - Source: Lu's simulator run and report, 2026-11-04; the item list is
    `docs/recon/release-1.0.20-fixes.md` §§1-13 and its §14 index.

- **R-02 · SUPERSEDED BEFORE IT WAS ANSWERED.** Planning room, 2026-11-04
  ~02:05: should a failed save in the OLD brain games show the player an alert
  (**A**) or log quietly (**B**, recommended)? **No answer was ever given —
  R-04 superseded it** by hiding the old games behind the launch switch, which
  makes the question moot (item 8 of `RELEASE-1.0.20-FIXES` is marked MOOT for
  the same reason: the fix is kept, not reverted, and nothing reaches it).
  Recorded so it is not re-asked as if it were open.

- **🎮 GAME-PLAY FINDING · the old brain games were barely played, and one
  counter is in the wrong unit. PROVEN by Lu's own read of prod (read-only SQL,
  2026-11-04) — no agent has queried that database.**
  - `player_game_progress`: **1-2 players across 6 games**, all of it between
    **Jan 15 and Feb 19 2026**, and **nothing after**.
  - `daily_game_time.minutes_played` = **147,516,255** for one player. That is
    **280 years of minutes** — the column is being fed something that is not
    minutes (milliseconds, most likely). **THE WRONG UNIT IS THE LESSON: the
    new arcade must not repeat it.** Whatever the new arcade writes, the unit
    belongs in the column name and in one writer.
  - **8 `cognitive_game` XP awards / 67 XP total; 0 achievements.**
  - **Why it matters beyond trivia:** R-04 hid six games that ~2 people had
    touched in ten months. The hiding cost nothing real, and the arcade is being
    built against a clean slate rather than against live usage.
  - Source: Lu's prod read, 2026-11-04. **Not re-derivable from this repo.**

- **R-05 = A · ONE announcements mark, consistent across every layer · Lu
  2026-11-04 · BUILT the same day, `built, unverified by Lu`.**
  - **THE RULING.** The crest + megaphone mark is used on the chat list row, the
    feed header, one opened announcement and the compose form — **A**, not a
    per-screen choice.
  - **WHAT WAS WRONG.** R-01 had put a megaphone in three places with three
    sizes and three circles, **none of them carrying the club**, and the opened
    announcement's header said only the word **"Announcement"** — a reader who
    arrived from a push tap could not tell whose it was.
  - **F-1, BUILT.** `src/components/chat/AnnouncementsMark.tsx` (new) is the one
    renderer: the club's `logo_url` in a circle, a **2px #C4976D ring** (the tan
    the chat list already gives this row), and the existing `MegaphoneIcon`
    **navy on a tan circle** badged on the bottom-right, ringed in the screen's
    background. No crest → the club's **initials** (`clubShortName`, R-01's
    rule) on navy; no club name at all → **"A"**, matching
    `announcementsChatName`'s own fallback. **Six screens**, smaller as it goes
    deeper: chat list 40pt · feed 44pt · chat-room fallback 26pt · opened
    announcement 32pt · compose 32pt · Chat info 64pt. The feed and the two
    32pt headers also gained the **full-width 2px tan rule**, which REPLACED
    their hairline border rather than joining it. The opened announcement's
    header is now a **small-caps tan kicker** with the chat name plus the
    announcement's **date**.
    **The megaphone is now drawn in exactly ONE place** (`grep -rn
    MegaphoneIcon src`); the three one-off badge styles are deleted.
    `src/lib/announcementsMarkClub.ts` (new) is the one cached club read
    (`comm_channels.club_id` → `clubs(name, logo_url)`, per channel, per
    process) and it **replaced** the feed's own `clubs.name` effect.
  - **F-2, BUILT.** The §6 discard prompt gains a third answer. **"Leave this
    announcement?"** → **Keep writing** (cancel) · **Save draft** · **Discard**
    (destructive). `src/lib/announcementDraft.ts` (new) stores title, body and
    drafted buttons in **`AsyncStorage` ON THE DEVICE ONLY**, keyed
    `announce.draft.v1.<user id>.<club id>`. **NO DB WRITE — there is no drafts
    table and none was added.** Opening ✎ restores it once, into an untouched
    form only, with a quiet **"Draft restored"** note that retires on the first
    edit; **Discard and a successful send both clear it.** A poll is not part of
    a draft — it is already a posted message. **The cost, stated: the draft is
    PER DEVICE.**
  - **NO NEW DEPENDENCY.** `react-native-svg` 15.12.1 (the megaphone) and
    `@react-native-async-storage/async-storage` 2.2.0 (the draft — the supabase
    session already lives in it) were both already in `package.json`, which was
    **not** edited.
  - **STATUS: `built, unverified by Lu` for both.** Gates: `npx tsc --noEmit` →
    **0 errors**; `eslint` on all 9 changed files → **0 errors, 128 warnings**
    (the same 128 those six screens already carried — the three new files are
    clean); `npx expo export --platform ios` → **succeeded**; `npm run smoke` →
    **257 assertions, 0 failures**. Test rows, screen by screen and tap by tap:
    **`docs/recon/release-1.0.20-fixes.md` §15 (F1a-F1h), §16 (F2a-F2j), §17.**
  - **⚠️ F2j AND §6e STILL SEND.** The only two rows in either file that post a
    real announcement to ~231 PAC families. **Not to be run until Lu wants to
    send.** And the 🛑 server step above this entry still stands: the push
    **title** is `chatContextName` in the edge function and still reads
    `club-announcements`.
  - **NOTHING SACRED TOUCHED.** No schema, migration, SQL, Supabase write, RPC
    or RLS; no dependency or `package.json`; no `app.json` or version bump; no
    env, no delete, no auth; **no DB access of any kind**;
    `docs/recon/arcade.md` not written (it was already modified in the working
    tree before this task); no edit in the web repo; **no commit and no push.**
  - Source: Lu's ruling R-05, 2026-11-04; this session's build, same day;
    `docs/recon/release-1.0.20-fixes.md` §§15-17.

## Landed — Nov 4 2026 (Round 2b verification, R-06, F-3)

- **RELEASE-1.0.20-FIXES · F-1 AND F-2 ARE VERIFIED — Lu, iOS simulator, Round
  2b, 2026-11-04.**
  - **✅ F-1 (R-05 = A, the one announcements mark):** the brand flow reads
    **consistently across layers 1-3** — the chat list row, the feed header and
    one opened announcement. Seen by a human; the row moves from
    `built, unverified by Lu` to **`VERIFIED-SIMULATOR`**.
  - **✅ F-2 (save draft):** **save, restore and discard all pass (a-e).** Same
    promotion. **F2j was NOT run and must not be** — it sends a real push to
    ~231 PAC families.
  - **Still owed from the earlier rounds, unchanged:** 1c / 1d (the chat-room
    fallback and its Chat info), the survey share (check what it touches
    first), the FM5v5 tab count, item 3's push-warning check (PARKED, agent
    proof only — Round 3 is a real phone), and the parent roster number.
  - Source: Lu's Round 2b run, 2026-11-04;
    `docs/recon/release-1.0.20-fixes.md` §§15-16.

- **R-06 = OPTION 2 · the announcements colour is a PASTEL SKY with a soft tint
  · Lu 2026-11-04 · BUILT the same day, `built, unverified by Lu`.**
  - **THE RULING.** `#A9CCEB` with a 22% tint fill **replaces the tan
    `#C4976D`** on announcements surfaces — **and only there.**
  - **WHY THE TAN WAS NEVER A DECISION.** It is what
    `ChatScreen.getChannelColor` has always returned for a `club` channel;
    R-01's mark, R-05's rules, the kicker and the card edges each inherited it
    one at a time. Nobody chose it for the chat every family in the club reads.
  - **ONE TOKEN MODULE.** `src/lib/announcementsTheme.ts` (new) holds the whole
    system: `ANN_SKY` **#A9CCEB** · `ANN_SKY_TINT`
    **rgba(169,204,235,0.22)** · `ANN_TEXT` **#FFFFFF** · `ANN_SUBTEXT`
    **#C7DDF2** · `ANN_NAVY` **#0F1D2F**. Eight files draw this surface and
    five used to write the accent out by hand. It is **pure** — no supabase, no
    react — so `NotificationsScreen` can take a token without pulling the
    announcements data layer behind it.
  - **`ANN_NAVY` IS A LEGIBILITY FIX, NOT DECORATION.** White on `#A9CCEB` is
    about **1.4:1**, so the megaphone drawn ON the sky circle is navy and so
    are the digits on a sky unread badge. A pastel accent forces that; a tan
    one never did.
  - **🔑 THE STRUCTURAL PART — ANNOUNCEMENTS ONLY, BY THE ROW.**
    `getChannelColor` gained **a new arm ABOVE the `club` arm**, gated on
    `isAnnouncements` (`channel_type = 'club' AND is_default`, never a name).
    The old arm matches **every `club` channel AND anything whose name merely
    contains "club"**, so recolouring it in place would have taken the
    **coaches' lounge** and any club channel added later with it. **NO TEAM
    COLOUR WAS TOUCHED** — `resolveTeamColor` is untouched and the DM / group /
    lounge arms still return what they always did.
  - **WHAT CHANGED ON SCREEN.** The chat list's announcements card is now the
    one card in that list with its **own bed** (tint + 1px sky border, white
    name, `ANN_SUBTEXT` preview and club line, navy unread digits) and **no
    other card's styling changed**. The feed, one opened announcement and
    compose each wear a **rounded (12) banner** of tint + 1px sky border, which
    **REPLACED R-05's full-width 2px rule** — there is no rule left on those
    screens. Feed cards and compose's preview keep their **dark bed** with a
    **3px sky left edge**: tinting the cards too would leave the feed with no
    contrast between the chrome and the content. The chat-room fallback and
    Chat info recoloured with the mark, which was their only tan.
  - **THE ONE REMAINING `#C4976D` IN `src` IS DELIBERATE:**
    `ChatScreen.tsx:186`, the club's **other** channels. The announcements chat
    returns from the sky arm 23 lines above it and can no longer reach it.

- **F-3 · THE DRAFT IS VISIBLE IN THE FEED · built 2026-11-04,
  `built, unverified by Lu`.**
  - **WHY.** F-2 made Save draft possible but **invisible** — the only way to
    discover a saved draft was to open ✎ and watch it appear. A draft you
    cannot see is a draft you forget you wrote.
  - **WHAT IT IS.** At the **top of the feed, above the date headings**, drawn
    **only** when `announcementDraft` storage holds one for **this user id +
    this club id**: a **transparent card with a 1.5px DASHED sky border** —
    deliberately the opposite of a real announcement's solid dark bed and solid
    edge, so it cannot be mistaken for something that was sent. Three lines:
    small-caps sky **"DRAFT · SAVED <age>"** with a **trash** icon, the draft's
    **title** (or **"Untitled draft"**), and muted **"Tap to keep writing"**.
  - **Tap** opens compose and restores through **F-2's existing path** — no
    second restore route. **Trash** asks **"Delete draft?" / "This draft will
    be removed from this phone."** (Cancel · destructive Delete) and the card
    goes. **Refreshed on FOCUS, not on mount**, because the round trip it
    exists for is feed → ✎ → Save draft → back to this feed.
  - **ONE WORDING FOR THE AGE.** `announcementDraftAge()` in
    `src/lib/announcementDraft.ts` serves both the card and compose's note
    (**"Draft restored · saved 5 min ago"**). A clock that moved backwards
    prints "just now", never a negative; **no stamp → no age is invented**, the
    kicker is just "DRAFT".
  - **STILL NO DB WRITE.** Device-local `AsyncStorage`, as F-2 established.

- **R-05 · the notifications list wears the mark · built 2026-11-04,
  `built, unverified by Lu`.** The `announcement` row drew a **pink `#ec4899`
  megaphone-outline Ionicon** — the last megaphone in the app that disagreed
  with its own surface, and a FOUND item when F-1 landed. It is now
  `AnnouncementsMark` at 32pt in the row's existing 44pt circle, on an
  `ANN_SKY_TINT` bed; **every other notification type is untouched.**
  **⚠️ IT HAS NO CREST, and the reason is UNKNOWN, not decided:** a
  `notifications` row carries `type`, `title`, `body` and an untyped `data`
  bag, and whether `data` holds a `club_id` cannot be answered from either repo
  — those rows are written by the **Supabase edge function**. So the mark falls
  back to its documented initials. **The check:** log one real announcement
  notification's `data` keys; if a club id is in there, pass it and the crest
  appears with no other change.

- **Gates for all three** (R-06, F-3, the notifications icon): `npx tsc
  --noEmit` → **0 errors**; `eslint` on all **11** changed files → **0 errors,
  131 warnings** (pre-existing classes); `npx expo export --platform ios` →
  **succeeded**; `npm run smoke` → **257 assertions, 0 failures**; `grep -rn
  "C4976D" src` → **one live hit, by design** (above) plus two docblock
  mentions. Test rows, tap by tap: **`docs/recon/release-1.0.20-fixes.md` §18
  (R6a-R6i), §19 (F3a-F3k), §20 (R5a-R5b), §21.**
- **NOTHING SACRED TOUCHED.** No schema, migration, SQL, Supabase write, RPC or
  RLS; no dependency or `package.json`; no `app.json` or version bump; no env,
  no delete, no auth; **no DB access of any kind**; **no team colour**;
  `docs/recon/arcade.md` not written and **no `git stash` was used this time**;
  no edit in the web repo; **no commit and no push.** `Send announcement` was
  never triggered.
- Source: Lu's rulings R-06 (option 2) and the F-3 / notifications scope,
  2026-11-04; this session's build, same day.

## Landed — Nov 4 2026 (Round 3 on a phone, and F-4)

- **RELEASE-1.0.20-FIXES · ROUND 3 — Lu, iPhone dev build 1.0.19 #53 on Metro,
  2026-11-04. The first REAL-DEVICE push test. Two of three states pass.**
  - **✅ PUSH TAP FROM BACKGROUND → the chat room.** VERIFIED on device.
  - **✅ PUSH TAP FROM FOREGROUND → the chat room**, and the **in-app banner
    shows**, which means **item 3 is VERIFIED ON DEVICE** — the parked
    push-warning check is answered and can stop costing test passes.
    **ONE WATCH ITEM, not a fix:** the first tap landed in the room but
    **missed the newest message**; it did not reproduce on retry. That is
    message-list freshness, not routing. **If it returns it needs its own
    entry.**
  - **❌ PUSH TAP FROM FULLY CLOSED → the app opens and routing never
    happens.** Filed as **F-4** and fixed below.
  - **🅿️ ANN-CARD-LOOK — PARKED (Lu).** The R-06 sky list card "reads as
    *selected* more than as its own banner". The tint and the border are doing
    a job the OS already uses for selection. **Revisit after 1.0.20**; the list
    look is **accepted for now**, and R-06's feed/detail/compose banners are
    not in question.
  - **Item 1 (R-06 sky) and F-3 (the draft card): the list look is accepted by
    Lu for now; F-3's rows c-d remain UNVERIFIED.**
  - **The notifications-row mark shows the "A" fallback**, with no crest,
    because no club id was found in the notification's `data`. **UNKNOWN**
    whether the edge function puts one there — the check is in
    `docs/recon/release-1.0.20-fixes.md` §20.
  - Source: Lu's Round 3 phone run, 2026-11-04.

- **F-4 · 🔧 BROKEN FLOW — a push tap on a FULLY CLOSED app opened the app and
  routed nowhere · found by Lu on a phone 2026-11-04 · FIXED the same day,
  `built, unverified by Lu`.**
  - **IT WAS NOT A MISSING FEATURE.** Cold-start routing has existed since
    `c3924b4`, and Lu's JS came from **Metro**, so it was in the build under
    test. **The cold path existed and did not work.** That is why this got a
    diagnosis before a line was changed:
    **`docs/recon/f4-coldstart-push.md`** (the whole finding, with the Swift
    and the line numbers).
  - **🔑 THE CAUSE — PROVEN from source. The hold-and-flush waited on the
    wrong signals:** a `loading` TRANSITION and a NON-NULL ref, instead of *a
    payload existing* AND *the navigator being ready* AND *the session being
    restored*. Four holes, all in `src/navigation/AppNavigator.tsx`:
    1. the flush's only dependency was `loading`, and the payload sat in a
       **ref** — a ref write re-renders nothing, so a payload arriving AFTER
       `loading` settled was **stranded forever**;
    2. both gates tested `navigationRef.current` for **non-null**, which is
       true from **mount** — earlier than **ready**, and an action dispatched
       before readiness is **dropped**. The container's own `onReady` was
       already captured and used only by the spinner;
    3. the id was marked routed at the **top** of the handler, so when 1 or 2
       ate the tap **the retry was refused as a duplicate of a route that
       never happened** — and iOS delivers twice on cold start;
    4. the flush tested `!loading` only, and `loading` false with `user` null
       is a **signed-out** app whose targets all live inside `Main`.
  - **THE NATIVE SIDE WAS THE FIRST SUSPECT AND IS CLEARED — PROVEN.**
    `getLastNotificationResponse()` is the current non-deprecated API (the
    `Async` form is now a deprecated wrapper and Expo's own
    `useLastNotificationResponse` hook calls the same function), and a tap
    that lands before any delegate exists is **queued and replayed** by
    `NotificationCenterManager.addDelegate`. **The payload reaches JS.**
  - **WHICH HOLE BIT FIRST ON #53 IS UNKNOWN** and was not guessed — telling
    them apart needs a Metro log from a killed-app tap. **The fix closes all
    four**, so it does not depend on the answer.
  - **THE FIX.** The pending tap is **state**, so the payload wakes its own
    flush · `onReady` now sets a real **readiness gate** (state for the effect,
    a ref for the listener, plus the container's `isReady()`) · the id is
    recorded **when the route is dispatched** · the flush waits for `!loading`
    **and** a `user`, and a **signed-out user's tap is dropped** (no crash,
    lands on sign-in, nothing fires later) · the routed-id set moved to
    **module scope** and the native stored response is **cleared** once JS
    takes custody, so a Fast Refresh or a remount cannot re-route one tap.
  - **NOT CHANGED, because Lu proved it works:** when the navigator is ready
    the handler still routes **immediately and synchronously** — background and
    foreground are untouched. **No branch of `routeNotification` was touched**,
    so **every type** inherits the repaired path with no per-type wiring: chat,
    the announcement variant (`announcement: true` → the feed), events,
    `lineup_published`, `playbook_question`, `playbook_answer`,
    `playbook_open`, `courses_open`, survey, evaluation, `staff_request`, and
    the `Notifications` fallback.
  - **⚠️ ONE TRAP RECORDED SO IT IS NOT RE-INTRODUCED.** Clearing the held
    payload is a `setState`, so the flush effect re-runs — and React runs the
    previous invocation's **cleanup before the next one**. A `clearTimeout`
    cleanup in that effect **cancels its own pending route every time**; the
    first version written in this session had it and would have produced F-4's
    exact symptom from a new cause. The effect returns **no cleanup** on
    purpose, and `routeNotification`'s own `if (!nav) return` covers unmount.
  - **RETESTING IS A PHONE JOB.** The simulator has no real APNs delivery and
    failed to raise a banner in Rounds 1 and 2. Steps, including the
    signed-out case and the must-not-route-twice case:
    **`docs/recon/f4-coldstart-push.md` §4 (F4a-F4h)** and
    `docs/recon/release-1.0.20-fixes.md` §22. **None of them is
    `Send announcement`.**
  - **GATES.** `npx tsc --noEmit` → **0 errors**; `eslint` on
    `src/navigation/AppNavigator.tsx` → **0 errors, 25 warnings** (the same 25
    it carried before this task); `npx expo export --platform ios` →
    **succeeded**; `npm run smoke` → **257 assertions, 0 failures**.
  - **NOTHING SACRED TOUCHED.** No schema, migration, SQL, Supabase write,
    RPC, RLS or **edge function**; no dependency or `package.json`; no
    `app.json` or version bump; no env, no delete, **no auth logic** (the fix
    READS `user` and `loading` and changes neither); no DB access;
    `docs/recon/arcade.md` not written and **no `git stash`**; no edit in the
    web repo; **no commit and no push.** `Send announcement` was never
    triggered.
  - Source: Lu's Round 3 phone run and this session's fix, 2026-11-04;
    `docs/recon/f4-coldstart-push.md`;
    `docs/recon/release-1.0.20-fixes.md` §§22-23.

## Landed — Nov 9 2026 (attendance one-source, chunk 1 prompt 3b)

- **attendance one-source build · BUILT · sim test pending** (2026-11-09,
  uncommitted at write time). Every attendance surface now reads the prod
  functions `get_event_attendance` / `get_events_attendance_counts` (web
  migration `20261109013010_event_attendance_read_fns.sql`, proven T1–T9 in
  web `docs/recon/attendance-fn-nov09.md`); the client resolver, the raw
  RSVP row tally and the unfiltered `players` roster read are gone.
  - Files: NEW `src/hooks/useEventAttendance.ts` (the one read, 12 s timeout,
    loading/ready/empty/error); `src/utils/attendanceResolver.ts` (now the pure
    half: timeout, normalise, roster cap, per-child rows; old resolver fns
    removed, their rules live in the SQL); `src/utils/attendanceResolver.test.ts`
    (17 node:test cases); `src/screens/CalendarScreen.tsx` (ONE counts call for
    the visible events, no counts on failure, card pill only with exactly 1
    linked player, "Answer per child ›" for 2+); `src/screens/EventDetailScreen.tsx`
    (strip + Attendance tab on the hook, Attendance tab visible to the whole team
    read-only, ✓/✗ only with a `team_staff` row, per-child RSVP pills always
    with `player_id`, source label on every marked row, Retry empty states);
    `src/components/calendar/ResponsesBar.tsx` (denominator = roster);
    `src/components/game-stats/GameEntryButton.tsx` (no initial spinner, 12 s
    timeout, error → Retry).
  - **3b-2 amendments (planning-room rulings, Nov 9):** (1) KEPT: the
    event-screen control shows the combined status; "Going" after a coach mark
    saves yes. (2) A parent/player sees the decline reason on their OWN row(s),
    merged client-side from their own `cal_event_rsvps` rows only
    (`mergeOwnReasons`, attendanceResolver.ts; read in useEventAttendance.ts).
    Teammates' rows still show no reason. (3) `no_reply` rows show no "by …"
    label (`attributionLabel`). (4) GameEntryButton is back for the whole team:
    Watch and View Match Summary are visible to everyone, as at HEAD; only
    Start Match Center and Stats Console are staff-only (`canManage` prop).
  - Gates: `npx tsc --noEmit` 0 → 0 errors; node:test 25/25 (after 3b-2);
    eslint 0 errors.
  - **Sim test owed** (parent 1 kid, parent 2+ kids, player self-login, team
    staff, club admin with no team_staff row, offline → Retry).
  - **live smoke A1–A8 BLOCKED 2026-11-09 13:25 MST:** script wired
    (`scripts/smoke/attendance-live.mjs`, uses app URL + anon, parses
    `src/lib/supabase.ts`, dynamically imports `mergeOwnReasons` /
    `loadEventAttendance` via `node --experimental-strip-types`, writes only
    to ZZ Test Team 0826, cleans up on exit) but every `signInWithPassword`
    returns `captcha protection: request disallowed (no captcha_token
    found)` -- Cloudflare Turnstile is enforced server-side (`src/lib/captcha.ts`,
    `LoginScreen.tsx:98`). A Node script cannot mint a Turnstile token
    without a browser widget, so A1–A8 cannot run from this surface without
    (a) a captcha bypass secret in the auth dashboard or (b) a pre-captured
    session token handed in via env. Sim status: iPhone 17 Pro 26.2 booted,
    `com.weolkn.thryvyng` launched into the expo-dev-client picker (screenshot
    `/tmp/sim-b2.png`), log stream clean (no red-box / JS error for
    useEventAttendance / CalendarScreen / EventDetailScreen / GameEntryButton
    -- but the RN bundle never loaded because advancing past the picker
    requires a tap and TAP DRIVING: UNAVAILABLE on this host, no install
    allowed).

- attendance one-source build · VERIFIED-DEVICE Nov 9 2026 14:45 (iOS sim, ludriv + zztest7 parent): sandbox G2-G4 6/6 · real teams G1 UPSL 12/9/9 r30, Shooters 10/2/3 r15, practices OK · card==detail · latest mark wins both ways · parent sees full team, private fields hidden · live smoke script BLOCKED by captcha (parked: captcha exemption for test accounts) · open: card highlights own answer only (coach-only mark not shown on card)
