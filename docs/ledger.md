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
| **Chat List v2, Stage 3 (mobile)** — **7 of 8 rulings applied**, no open questions. Club crest on each avatar + crest/club-name in the open-chat header (null `club_logo_url` → no crest, no placeholder) · club filter chips only at 2+ clubs, filtering by `channel_club_id`, where "the user's clubs" = team clubs ∪ staffed clubs (new union read; the existing `checkClubAdmin` returns at the first source so it only ever yields one) · rich 3-line card · swipe-left Mute+Hide on DM/group, **Mute only** on team/club/default, Recent + By Team but **not Past**, via PanResponder (RNGH not installed, not added) · Hide through `set_channel_hidden` only — **H7** `hidden_at IS NOT NULL AND last_message_at <= hidden_at`, **H4** a new message returns the row with unread intact, nothing marked read, **H5** push untouched · "Hidden (n)" row at the bottom of Recent, expand, swipe to Unhide. The 3 new columns are read **by name** (RPC went 20→23). **Ruling 7 (4g A) needs NO client change** — `get_channel_member_labels` takes only the channel and derives scope server-side; documented at `memberNames.ts:222-243` rather than guessing a `p_club_id`. **UNVERIFIED: the `set_channel_hidden` arg names** (`p_hidden` inferred from `set_channel_announcement_mode(p_channel_id, p_enabled)`); the first Hide proves them and fails loudly if wrong | *uncommitted* | **AGENT-ONLY — no device or simulator run.** tsc **64 = baseline**, full-output `diff` **empty** (byte-identical); eslint per file all **back to baseline** (ChatScreen 0e/91w, TeamChatRoom 0e/38w, ChatUnreadContext 0e/4w, memberNames 0e/11w, unreadRule 0e/0w, hiddenChats 0e/0w) after removing 7 self-inflicted `no-explicit-any` warnings; `npx expo export --platform ios` **exit 0**; `unreadRule.test.ts` **32/32** (22 existing + 10 new for H7/H4, incl. hidden leaving list AND total in one pass, and archived beating hidden); grep — exactly **one** `set_channel_hidden` call, **zero** direct `hidden_at` writes, Hide gated by `canHideChannelType` (`['dm','group_dm']`), no global-role gate added. Click-through owed — `docs/recon/chatlist-v2-mobile-notes.md` §7. **Click-through RUN on the simulator Oct 20 (Lu) — 5 card defects found and fixed** (§9): the crest now **fills** the avatar circle instead of ringing its corner, with no ball/initials behind it (a DM with the person's real photo keeps the photo + corner ring) · the swipe strip is **mounted only while a row is open or dragging** and inset to the card's box, which killed BOTH the grey/purple slivers in the gutters at rest AND tap-and-hold showing "Mute" through the card's `activeOpacity` 0.7 — one root, not two · **4 close triggers** on the one `openSwipeKey` (another row touched · list scroll · chat opened · screen focus) plus a 3.5s self-close after the finger lifts, because closing on lift itself would make Mute/Hide untappable (judgement call, §9.2) · line 1 = **title + time only** (the bare member number is gone), line 2 = preview or **"No messages yet"** (never the channel name / "2 members"), line 3 = badge · mute icon · **"2 members"** · club name. **Latent bug fixed on the way:** the PanResponder read `isOpen`/`width` from the first render's closure, so an already-open row dragged from base 0 and jumped shut. Evidence Oct 20: tsc **64 = baseline**, full-output `diff` **empty**, 0 errors in ChatScreen; eslint ChatScreen **0e/91w**, warning set **byte-identical** to baseline (`conversationSubtitle` deleted with its last call site); `npx expo export --platform ios` **exit 0**, 9.03 MB. Fixes are **AGENT-ONLY** — not yet re-run on the simulator | Oct 19, 2026 · fixes Oct 20, 2026 | AGENT-ONLY |
| **Poll powers follow the CHAT's staff, mobile half of 4i** (`is_channel_staff`, not the global role list). Rulings Oct 18, Lu: **I2 A** anonymous-poll voter names = creator OR channel staff · **I4 A** reminder button = channel staff ONLY (was `staff \|\| creator`; also guarded in both handlers, not render-only) · **I5 A** poll creation in team/club chats = channel staff, group chats any member unchanged · **I7** 4 non-poll `isStaffInChannel` consumers (goal celebration, `/survey`, SurveyPicker, MessageActions) left alone. 5 gate sites / 4 files. `TeamChatRoomScreen.isStaffHere` is now asked for every chat, not only announcement ones — cannot regress the send gate, since `canSendText` is `allowMemberText \|\| isStaff`. PollCard reads `isChannelStaff` from the `usePoll` call that already answered 4d's `canClose`, so **zero new RPCs**; `usePolls.ts` and `channelStaff.ts` have zero diff. **SAME-STONE FOLD-IN: `PollDetailScreen` was asking the unscoped global `user_roles` list**, so any coach on the platform could see who voted on an anonymous poll in another club's chat — now one `isChannelStaff` call | *uncommitted* | **AGENT-ONLY — no device or simulator run.** tsc **64 = baseline**, only diff a pre-existing error's line shift (`PollCard 842→871`), zero new; eslint per file 0e/38w, 0e/5w, 1e/25w all unchanged, PollDetail **0e/10w → 0e/9w** (one fewer); `npx expo export --platform ios` **exit 0**, 9.01 MB; gate grep — no poll file reads `user_roles`/`STAFF_ROLES` in code, no poll decision reads the label answer. Click-through owed, incl. the coach-of-another-team-in-same-club case — `docs/recon/phaseD-4i-polls-mobile-notes.md` §6 | Oct 18, 2026 | AGENT-ONLY |
| **Fake "Mute user" / "Block user" removed from the message-actions sheet** — both only fired an `Alert` ("has been muted" / "has been blocked") over a `// TODO: Implement … in database`, so the sheet reported a completed moderation action while writing nothing. Ruling **Oct 15, Lu**: Thryvyng has no block feature; Hide and Mute arrive later as Chat List v2 swipe actions. Web never shipped these buttons (re-verified Oct 18), so this **restores parity**. 14 grep hits across 2 files (`MessageActionsModal.tsx`, `TeamChatRoomScreen.tsx`), no third site under `src/`; dead code removed with them: `senderName` prop + fallback, `message.profile` type field, `TONE.neutral`, `styles.actionContent`, `styles.actionDescription` | *uncommitted* | **AGENT-ONLY — no device or simulator run.** tsc **64 = baseline**, `diff` of the two full outputs empty (byte-identical), zero errors in touched files; eslint per file **0e/38w → 0e/38w** and **0e/1w → 0e/1w** (the 1 is pre-existing `onViewProfile` unused); `npx expo export --platform ios` **exit 0**, bundle 9.01 MB; grep sweep re-run **zero hits**. Click-through owed — `docs/recon/phaseD-block-mute-removal-notes.md` §5 | Oct 18, 2026 | AGENT-ONLY |
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
| **Lineup writes** — every write error checked, snapshot+rollback on failed insert, truthful save alert, `jersey_number` coerced to `int|null`, bench rows routed by `player_id` | `23e05ec` | `docs/recon/lineup-master-oct02.md`. No device or sim run recorded | Oct 2, 2026 | AGENT-ONLY |
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

### Record gaps

- **Stone B2 S2a leave/archive/handover: the 11/11 click-through has no evidence split.**
  The handoff Oct 13 reports 11/11, but nothing in this repo records which of the 11 checks
  ran on a physical device, which on the simulator, and which were SQL probes. The only
  in-repo record says the opposite (`docs/recon/stone-b2-s2a-build-oct12.md:178`, "Not
  verified on a device/simulator"), so the row stays `UNVERIFIED` until the split is
  written down. One pass recording device vs simulator vs SQL per check closes it.

### Client-side open items (not Phase D — listed here so they are not lost)

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

- App-icon badge number on a physical phone, 1.0.18 dev build (simulator cannot show it).
- Bell badge at >99 — only inspected in the style box; the test account showed 34.
- Stone B teams-fetch-failure hold path — in code and reasoned, never exercised.
- Phase C click-through on a **physical device**, 6 items — the Oct 14 pass was on the
  simulator; the checklist in `docs/recon/phaseC-mobile-build.md` is written for a device.
