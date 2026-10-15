# Chat Info — Add / Remove / Rename on Staff-Message chats

**Date:** 2026-10-14
**Base:** HEAD `22a8b3d`, working tree clean at start.
**Not committed.** `git diff --stat` is at the end.
**tsc:** 64 before → **64** after, error list **byte-identical** to the baseline.
Zero errors in any touched file, before or after.

**Ruling this build implements (Lu, Oct 14):** removing someone from a chat removes them
from **that chat's member list only**. It never touches team roster, club membership,
player/parent records, invitations, registration or payments. Re-adding = one tap of Add.

Nothing server-side was needed. No schema, no migration, no SQL, no RPC, no RLS change,
no new dependency, no new delete path.

---

## Step 0 — read-only findings

### a) How "chat admin" is decided, and why Staff-Message chats got no controls

`myMembershipRole` is this user's `comm_channel_members.role` for this channel, read in
`fetchChatInfo` ([ChatInfoScreen.tsx:201-209](../../src/screens/ChatInfoScreen.tsx#L201-L209)).
`'admin'` is the admin. For a Staff-Message chat the creator **is** that admin already:
`trigger_add_creator_to_members` inserts the creator as `'admin'` on the `comm_channels`
INSERT for `channel_type IN ('group','group_dm','direct','dm')` (web repo
`20260112025123_*.sql:56-74`, quoted in `docs/recon/phaseC-mobile-build.md` §Item 5).

**The exact condition that hid the controls** — `isCustomTeamChannel`, before this build at
`ChatInfoScreen.tsx:371-389` (pre-build numbering), last line:

```ts
return channel.channel_type === 'team' || channel.channel_type === 'club';
```

A Staff-Message chat is inserted with `channel_type: 'group_dm'`
([StaffMessageScreen.tsx:239-248](../../src/screens/StaffMessageScreen.tsx#L239-L248) —
`name`, `channel_type: 'group_dm'`, `club_id`, `created_by`; **no `team_id`**). So
`isCustomTeamChannel` was `false` on channel_type alone, and both
`canAddMembers` (`:397-398`) and `canRemoveMembers` (`:406`) were `false` with it.
**Rename did not exist on this screen at all** — repo-wide, the only rename was
`GroupInfoScreen.updateGroupName`.

Worth recording because it explains the confusion: the same chat has **two** info screens.
The kebab goes to `ChatInfo` for every chat (`TeamChatRoomScreen.tsx:731`), while tapping
the header title goes to `GroupInfo` when `isGroupDm` (`TeamChatRoomScreen.tsx:710`) —
which has had Add / Remove / Rename for admins since Stone F. Lu's "U40 mens" screenshot
is the kebab route.

### b) The existing add / remove / rename paths — exact table and call

| Control | Table | Call | Where it already lived |
| --- | --- | --- | --- |
| **Add** | `comm_channel_members` | `.insert({ channel_id, user_id, role: 'member' })` | [AddMembersModal.tsx:174-178](../../src/components/chat/AddMembersModal.tsx#L174-L178) |
| **Remove** | `comm_channel_members` | `.delete().eq('channel_id', …).eq('user_id', …).select('user_id')` | [ChatInfoScreen.tsx:514-553](../../src/screens/ChatInfoScreen.tsx#L514-L553) (this screen already had it, for team channels) |
| **Rename** | `comm_channels` | `.update({ name: trimmed }).eq('id', …).select('id')` | [GroupInfoScreen.tsx:126-152](../../src/screens/GroupInfoScreen.tsx#L126-L152) |

All three are **client calls through PostgREST under existing RLS**. None is an RPC. This
build adds no fourth call — Rename is a second call site of GroupInfo's statement.

**Policy names: PROD-ONLY, UNVERIFIED.** This repo holds exactly one migration
(`20250224000000_notify_lineup_published.sql`); every chat policy lives in the web repo and
is applied by hand through the Supabase SQL Editor. The policy *text* relied on here is
quoted from the web-repo migration via `docs/recon/phaseC-mobile-build.md` §Item 3, which
already carries the prod-drift warning:

* INSERT admits `is_channel_admin(auth.uid(), channel_id)` **OR** a `team_staff` row for the
  channel's team (`20261013013626_stone_b2_s1_chat_permissions_leave.sql:151-168`).
* DELETE's other-person arm is `user_id <> auth.uid() AND is_channel_admin(auth.uid(), channel_id)`
  (same migration, `:191-200`). Team staff are **not** admitted — which is why Remove stays
  admin-only and Add does not.
* The `comm_channels` **UPDATE** policy is **PROD-ONLY, UNVERIFIED** — no copy in this repo
  and none quoted in any recon file. Rename is gated client-side the way GroupInfo has
  always gated it (`channel_role === 'admin'`), and the `.select('id')` refusal check below
  is what makes a server disagreement visible instead of silent.

**Every write checks for a silent refusal.** RLS filters a denied write out with no error
and no rows, so an empty `.select()` result is treated as a refusal, never a success —
Remove and Rename both do this, and both call `logError`.

### c) Remove writes ONLY the chat-membership entry

Grepped repo-wide for every write to a membership-adjacent table on the remove path:

* `comm_channel_members` is written in exactly **three** places in `src/`:
  `AddMembersModal.tsx:174` (insert), `ChatInfoScreen` + `GroupInfoScreen` `removeMember`
  (delete), and `chatHelpers.buildMemberInserts` (create-time insert rows).
* `removeMember` is a **single** `.delete()` on `comm_channel_members` keyed on
  `(channel_id, user_id)`. There is no second statement in the handler, no RPC, and no
  follow-up write — the only thing after it is `fetchChatInfo()`, a re-read.
* **No write to** `team_players`, `players`, `team_staff`, `club_members`, `user_roles`,
  `invitations`, `registration*`, `orders`, `commissions` or `registration_payments` exists
  anywhere on this path. Nothing in repo code cascades off a `comm_channel_members` delete.
* Supporting, from the other direction: payments never move the roster, and only a
  *successful* payment moves it forward — `docs/recon/removal-payments-dprep.md` §3. The
  chat-membership delete is not in that graph at all.

**DB-side cascades: PROD-ONLY, UNVERIFIED** — no `comm_channel_members` DDL in this repo.
Nothing in repo code implies one, and the inverse direction is already known and documented
(`remove_player_from_team` reaches *into* chat membership — gap 2 in the ledger — not the
other way round).

### d) Anything that re-adds a removed chat member

**Found — but it cannot reach these chats.** `ensure_team_channel_membership` is the one
re-adder, called from [ChatScreen.tsx:448-466](../../src/screens/ChatScreen.tsx#L448-L466),
once per app session, once per *active team*, with `{ p_team_id: team.id }`. It is the
reason Phase C excluded default team channels from member management.

A Staff-Message / group chat is `channel_type 'group_dm'` with **`team_id` NULL** and is
never in `activeTeams`, so no call carries an id that could select it. The RPC **body is
PROD-ONLY, UNVERIFIED** (not in this repo) — the reasoning above is from its signature and
its only call site, so the "cannot reach" conclusion is **INFERRED**, not proven. The S4
club sync named in `ChatInfoScreen.tsx:376` owns the *default club* channel
(`channel_type 'club' AND is_default`), which this build does not touch.

**No client-side effect re-adds members.** Nothing in `src/` inserts into
`comm_channel_members` outside the add picker and channel creation (see c).

### e) Chat-level invite / join link

**No.** The only invite/join links in the app are **team**-scoped
(`JoinTeamScreen`, `CoachDashboard.tsx:410` "Share Join Link") or **co-parent**-scoped
(`InviteCoParentModal.tsx:144-162`). `src/lib/linking.ts` has no chat or channel route.
There is no way for a removed person to re-enter a chat on their own — an admin taps Add.

### f) STOP conditions — none hit

No new RPC, no policy, no schema change, no new delete path, and nothing read-write on
roster, club membership, payments or invitations. Built as scoped.

---

## What was built

### Gate changes — `ChatInfoScreen.tsx`

One new predicate, `isManageableGroupChat`
([:417-422](../../src/screens/ChatInfoScreen.tsx#L417-L422)): not a DM, not `is_default`,
`channel_type === 'group_dm'`.

| Gate | Line | Rule now |
| --- | --- | --- |
| `canAddMembers` | [:437-439](../../src/screens/ChatInfoScreen.tsx#L437-L439) | `(isCustomTeamChannel && (isStaffInTeam \|\| admin)) \|\| (isManageableGroupChat && admin)` |
| `canRemoveMembers` | [:452-454](../../src/screens/ChatInfoScreen.tsx#L452-L454) | `(isCustomTeamChannel \|\| isManageableGroupChat) && admin` |
| `canRenameChannel` | [:463](../../src/screens/ChatInfoScreen.tsx#L463) | `isManageableGroupChat && admin` — **new** |

**Why both kinds of group chat, not only the club-level one.** `channel_type` is
`'group_dm'` for both Chat > `+` > *New Group* (`ChatScreen.tsx:783-791`) and
Chat > `+` > *Staff Message* (`StaffMessageScreen.tsx:239-248`); the only difference is
that Staff Message also sets `club_id`. They are the same row shape under the same
policies and the same creator-admin trigger, so splitting them on `club_id` would have
been a UI rule with no DB rule behind it. The admin gate is what limits the controls, and
a group-chat admin already has all three on the GroupInfo route — so this adds no
capability anyone lacked, it stops the kebab route from hiding it.

**Why Rename is group-chat-only.** A team or club channel's name is part of the team's
structure. Offering a rename there would be new behaviour on a team chat, which this build
deliberately does not do.

### Rename

`startRename` / `cancelRename` / `saveChannelName`
([:468-512](../../src/screens/ChatInfoScreen.tsx#L468-L512)), rendered in the channel
header block ([:759-819](../../src/screens/ChatInfoScreen.tsx#L759-L819)):

* tap the name (pencil affordance) → inline field, `autoFocus`, Cancel / Save;
* **trimmed** before the write;
* **empty is blocked with an inline message** under the field — `Enter a chat name.` — not
  an alert, and the message clears on the next keystroke;
* a refusal or error shows `Could not rename this chat.` inline and calls
  `logError('ChatInfo.renameChannel', …)`;
* `maxLength={100}`;
* on success the channel row in state is updated, so the new name is on screen at once.

The header name now reads `channel?.name || channelName || 'Chat'` (`displayChannelName`,
[:466](../../src/screens/ChatInfoScreen.tsx#L466)) — previously the **route param** only,
which would have shown the old name after a rename.

### Remove — confirm copy

[:514-523](../../src/screens/ChatInfoScreen.tsx#L514-L523). Title and body replaced:

| Before | After |
| --- | --- |
| `Remove Member` / `Remove <name> from this channel?` | `Remove from this chat?` / `<name> will lose access to this chat. They stay on their team — nothing else changes, and you can add them back.` |

EN only; i18n parked. **This is the one user-visible change that also lands on team
channels** — see Regression notes.

### Add

No code change. `canAddMembers` now admits group chats, and the existing
`<AddMembersModal>` is already rendered with
`existingUserIds={members.map((m) => m.user_id)}`
([:956-962](../../src/screens/ChatInfoScreen.tsx#L956-L962)), so **current members are
excluded from the picker results** — the required behaviour was already there.

**Admin cannot remove themselves:** unchanged and still enforced —
`canRemoveMembers && item.user_id !== user?.id`
([:607](../../src/screens/ChatInfoScreen.tsx#L607)). Leaving is the Leave button's job, and
the DELETE policy's arm is explicitly `user_id <> auth.uid()`.

### Name cap — every chat-name input, all four

`comm_channels.name` is `VARCHAR(100) NOT NULL` (`20260108184412:51`, never altered).
Uncapped, an over-length name is a hard Postgres `22001`, not a truncation
(`docs/recon/removal-payments-dprep.md` §4c).

| Input | Site | Was |
| --- | --- | --- |
| New Group name | [ChatScreen.tsx:1294](../../src/screens/ChatScreen.tsx#L1294) | uncapped |
| Group Info rename | [GroupInfoScreen.tsx:264](../../src/screens/GroupInfoScreen.tsx#L264) | uncapped |
| Staff Message chat name | [StaffMessageScreen.tsx:378](../../src/screens/StaffMessageScreen.tsx#L378) | uncapped (its comment explicitly said "No maxLength" — replaced) |
| Chat Info rename | [ChatInfoScreen.tsx:768](../../src/screens/ChatInfoScreen.tsx#L768) | new in this build |

**One constant, five references.** `CHANNEL_NAME_MAX = 100` is defined once in
[chatHelpers.ts:276-283](../../src/lib/chatHelpers.ts#L276-L283) — beside the chat-name
helpers (`chatNameOnEdit`, `resolveChatName`) that already live there, and which three of
the four screens already import. The DDL citation lives on the constant; no site repeats
the number. `grep "maxLength={100}"` returns **zero** hits.

`GroupInfoScreen.updateGroupName` also stopped returning silently on an empty name
([GroupInfoScreen.tsx:126-131](../../src/screens/GroupInfoScreen.tsx#L126-L131)): it now
shows the **same inline message Chat Info uses** — `Enter a chat name.` — under the field,
clearing on the next keystroke and on re-entering edit mode. The silent `return` read as a
dead Save button.

---

## Empty chat name on create — what each screen did

Asked before changing anything, because the two create screens could have differed.

| Screen | Before | Verdict |
| --- | --- | --- |
| **Staff Message** | **Fell back.** `resolveChatName(chatName, defaultChatName)` returned the picked group's label when the field was empty, so clearing the box silently created a chat named after a group the sender had deliberately renamed away from. | **Changed** — now blocked inline. |
| **Group Message** (`ChatScreen.createGroup`) | **Already hard-blocked.** [ChatScreen.tsx:783-786](../../src/screens/ChatScreen.tsx#L783-L786): `if (!groupName.trim() \|\| selectedGroupUsers.length < 1 \|\| !user?.id)` → `Alert.alert('Error', 'Enter a group name and add at least one person')`. **No fallback, nothing derived from member names, not optional by design.** | **Not changed.** It is not the preset-fallback pattern, so per the brief it was left alone. |

**The one remaining inconsistency, for Lu to call:** Group Message reports the empty name
in an **Alert**, and it is **combined** with the "add at least one person" check, so the
message names two problems when only one applies. Chat Info, Group Info and now Staff
Message all use an inline message under the field. Splitting that alert into an inline
name error plus a separate recipient check was **not** done — it is a behaviour change on
a screen the ruling did not name. One line of work when you want it.

**`resolveChatName` is now uncalled by app code.** Its fallback arm is exactly what the
ruling removed, so Staff Message uses the trimmed value directly. The helper and its 5
tests are left in place: `src/lib/chatHelpers.ts` is in SCOPE for `CHANNEL_NAME_MAX` only,
so removing the export was out of bounds. Flagging it as dead code to delete in a later
pass.

---

## Staff Message — fitting more recipients on screen

**The missing 114pt.** This screen is pushed inside `ChatStack`, which is a tab route, so
the bottom tab bar is on screen: `height: 80 + insets.bottom`
([AppNavigator.tsx:201](../../src/navigation/AppNavigator.tsx#L201)) = **114pt** on an
iPhone 17 Pro. Usable height is therefore 874 − 59 (top safe area) − 114 = **701pt**, not
815. That is why only two recipients fit.

**Method (ESTIMATED).** Heights summed from the stylesheet; RN iOS text height taken as
`round(fontSize × 1.21)`. No device or simulator was used.

| | Before | After |
| --- | ---: | ---: |
| Header | 49 | 49 |
| Filter section | 272 | **138** |
| Chat-name section | 89 | **77** |
| Search + "N recipients" chrome | 113 | **77** |
| Footer | 80 | **68** |
| **Chrome total** | **603** | **409** |
| **FlatList height** | **98** | **292** |
| Recipient row | 52 | **46** |
| **Rows fully visible** | **1.88 → 2** | **6.35 → 6** |

The *before* figure of 2 matches Lu's observation, which is the check that the model is
sound.

**What changed, and what did not.**

* **The four presets became a 2-column grid** ([StaffMessageScreen.tsx:354](../../src/screens/StaffMessageScreen.tsx#L354),
  `filterGrid` at [:558](../../src/screens/StaffMessageScreen.tsx#L558)) — 4 stacked rows
  cost ~200pt, two columns cost 94. This is the one change that goes beyond "less padding":
  a 44pt tap target over a 20pt radio means a stacked row **cannot** go below 44pt, so
  padding alone tops out around 4 rows. Stated here because it is a visible redesign of the
  control, not a spacing tweak.
* **The radio circle is gone.** The filled pill plus its border already says which group is
  picked, and the row keeps `accessibilityRole="radio"` with `accessibilityState.selected`.
  `radioOuter` / `radioInner` deleted as dead styles.
* **A latent jitter fixed in passing:** `filterOptionSelected` used to *add* `borderWidth: 1`,
  making the picked row 2pt taller and shuffling its neighbours. The border is now always
  present and only changes colour.
* **Gaps tightened** — filter section 16→10, label margins 12→6, search and header margins
  12→6, preview section bottom padding 16→0, footer 16→10.
* **Recipient row 52→46pt**: avatar 36→32, padding 8→7. Still above the 44pt target.
* **No font size was reduced.** Label 15pt, name 14pt, role 12pt, counts 14pt — all as they
  were. Every tap target is ≥44pt.
* **The Start Conversation button is unchanged and still pinned** outside the scroll area,
  in `styles.footer`.

**The tightest fit is the longest label.** A cell is 49% of 370 = 181pt; less 10pt padding
each side and the count leaves ~145pt for "Team Managers Only", which needs ~127pt at 15pt.
It fits with a two-digit count, but with little room — `numberOfLines={1}` keeps it on one
line, and this is the first thing to look at on the simulator.

---

## Sim findings (Oct 14–15)

Two bugs Lu hit on the simulator against this build, plus one confirmation. Both bugs are
fixed and **both were re-checked by Lu on the simulator** — see the ledger rows.

### 1. The keyboard would not go away on Staff Message

**Symptom.** With the search field focused, the keyboard stayed up when tapping a preset,
tapping a recipient row, or scrolling the list — covering the list the tap was meant to
change.

**Cause.** The list already carried `keyboardShouldPersistTaps="handled"` — which is what
makes a row register on the *first* tap rather than spending that tap on dismissing the
keyboard — but nothing ever dismissed it. There was no `keyboardDismissMode`, and no
handler called `Keyboard.dismiss()`.

| Fix | Where |
| --- | --- |
| `Keyboard.dismiss()` on preset tap | [StaffMessageScreen.tsx:215-220](../../src/screens/StaffMessageScreen.tsx#L215-L220) `selectFilter` |
| `Keyboard.dismiss()` on recipient tap | [StaffMessageScreen.tsx:229](../../src/screens/StaffMessageScreen.tsx#L229) `toggleRecipient` |
| `Keyboard.dismiss()` on Select all / Deselect all | [StaffMessageScreen.tsx:436-439](../../src/screens/StaffMessageScreen.tsx#L436-L439) |
| `keyboardDismissMode="on-drag"` on the recipient list | [StaffMessageScreen.tsx:451](../../src/screens/StaffMessageScreen.tsx#L451) |

`keyboardShouldPersistTaps="handled"` was **kept** everywhere — removing it is what would
cost the first tap.

**The same check on the other two pickers:**

| Screen | State found | Action |
| --- | --- | --- |
| **AddMembersModal** | `keyboardShouldPersistTaps="handled"` present; **no** `keyboardDismissMode`. Picking a person already dismisses, because `addMember` closes the modal and `dismiss()` calls `Keyboard.dismiss()`. | Added `keyboardDismissMode="on-drag"` ([AddMembersModal.tsx:318](../../src/components/chat/AddMembersModal.tsx#L318)). Nothing else needed. |
| **Group Message create** (`ChatScreen` new-group) | **Already correct** — `keyboardShouldPersistTaps="handled"` (`ChatScreen.tsx:1409`) *and* `keyboardDismissMode="on-drag"` (`:1413`). | No change. |

**One deliberate difference.** Staff Message dismisses the keyboard when a recipient row is
tapped, as the brief asked. The two *add-people* pickers do **not** dismiss on pick,
because there the normal flow is type → pick → type again, and dropping the keyboard on
each pick would fight the user. Staff Message's rows are checkboxes over a list that is
already on screen, so there is nothing to type back into.

### 2. A 100-character unbroken name ran off both screen edges

**Symptom.** On Chat Info the title overflowed left and right and pushed the pencil off
screen, so the chat could no longer be renamed.

**Cause.** The title sat in a `flexDirection: 'row'` with no width bound and no
`numberOfLines`. A Text in a row has unbounded intrinsic width, and a 100-char string with
no spaces offers no break opportunity, so it grew the row past the screen instead of
wrapping. (Where a name *is* width-bounded, iOS character-wraps it instead — see the
ChatScreen row below, which went very tall rather than off screen.)

**Fix, in both title rows:** `numberOfLines={3}` + `ellipsizeMode="tail"` on the Text,
`flexShrink: 1` so it yields to the pencil instead of claiming its full intrinsic width,
`maxWidth: '100%'` on the row, and `paddingHorizontal: 24` on the containing block. The
name wraps (including unbroken strings, which char-wrap once bounded), stops at 3 lines
with an ellipsis, and **the pencil is always visible**. Tapping the name still opens
rename.

### Same-root sweep — every place a chat name renders

**9 sites audited, 5 fixed.** Under the 10-site threshold, so the sweep continued rather
than stopping.

| # | Site | Before | Action |
| --- | --- | --- | --- |
| 1 | `ChatInfoScreen` title, admin branch (pencil) | no bound, no `numberOfLines` | **Fixed** — 3 lines, pencil kept |
| 2 | `ChatInfoScreen` title, non-admin branch | no bound, no `numberOfLines` | **Fixed** — 3 lines |
| 3 | `GroupInfoScreen` title, admin branch (pencil) | no bound, no `numberOfLines` | **Fixed** — 3 lines, pencil kept |
| 4 | `GroupInfoScreen` title, non-admin branch | no bound, no `numberOfLines` | **Fixed** — 3 lines |
| 5 | `ChatScreen` by-team channel row (`ChatScreen.tsx:1704`) | container `flex: 1` so it stayed on screen, but char-wrapped into a very tall row | **Fixed** — `numberOfLines={1}`, matching every other list row |
| 6 | `TeamChatRoomScreen` header title (`:720`) | `numberOfLines={1}`, container `headerCenter` is `flex: 1` | Already safe |
| 7 | `TeamChatRoomScreen` header subtitle — the channel name (`:725`) | `numberOfLines={1}`, same container | Already safe |
| 8 | `ChatScreen` conversation row title (`:196-203`) | `numberOfLines={1}` + `flex: 1` + `marginRight: 8` | Already safe |
| 9 | `ChatScreen` conversation subtitle / `cardMeta` (`:229-235`) | `numberOfLines={1}` | Already safe |

**Not a layout site:** `leaveConfirmTitle(channel?.name)` feeds a native
`Alert.alert` title (`ChatInfoScreen.tsx:699`, `GroupInfoScreen.tsx:193`). iOS wraps and
truncates alert titles itself; there is no style to set.

**No in-app notification preview renders a chat name.** The push banner is suppressed for
the open channel and is an OS notification, not an in-app component — the only `Banner`
components in `src/components/` are for attachments, surveys and invitations.

### 3. Confirmation — a default team channel still shows no Add / Remove

Checked because widening the gate is exactly the kind of change that leaks. It does not:
`is_default === true` returns `false` from **both** predicates —
[ChatInfoScreen.tsx:397](../../src/screens/ChatInfoScreen.tsx#L397) (`isCustomTeamChannel`)
and [:420](../../src/screens/ChatInfoScreen.tsx#L420) (`isManageableGroupChat`) — so
`canAddMembers`, `canRemoveMembers` and `canRenameChannel` are all `false` there.

**Observed:** ZZ Test Team 0826 default team chat, Lu, Oct 15 — no Add, no Remove.

This matters more than it looks. The prod RPC re-adds members on exactly that shape of
channel (see **Phase D carry**), so hiding the controls is what keeps mobile from writing
a change the server would silently revert.

---

## Lu rulings (Oct 14, 2026)

1. **Chat-level Remove only touches that chat's member list.** It never touches team
   roster, club membership, player/parent records, invitations, registration or payments.
   Re-adding = the admin taps Add. Proved against repo code in Step 0 c); carried in the
   confirm copy.
2. **Add / Remove / Rename in Chat Info applies to ALL `group_dm` chats** — Staff Message
   *and* regular Group Message — not only Staff Message. Raised as wider than the original
   goal and **accepted by Lu**. The two are the same row shape under the same policies and
   the same creator-admin trigger; splitting them on `club_id` would be a UI rule with no
   DB rule behind it.
3. **The new chat-only Remove confirm wording also shows on team channels.** Raised as the
   one team-chat-visible change and **accepted by Lu**. Copy only — the delete is one
   `comm_channel_members` row either way, and keeping the old vague wording for team chats
   would have implied the two removes differ.
4. **An empty / whitespace chat name is blocked on CREATE too, not only on rename.** One
   rule for every chat-name field. Implemented in Staff Message
   ([StaffMessageScreen.tsx:243-247](../../src/screens/StaffMessageScreen.tsx#L243-L247));
   Group Message already enforced it (see below). The preset auto-fill is unchanged — the
   block only catches a field the sender emptied by hand.

---

## Phase D carry

* **`ensure_team_channel_membership` — no longer inferred. PROVEN Oct 15** via prod
  `pg_get_functiondef`: it re-adds **only** where `channel_type = 'team'` **AND**
  `is_default = true` **AND** `team_id` matches the user's team. A `group_dm` can **never**
  be re-added, which closes Step 0 d) — the chats this build unblocked are not exposed.
  What the proof *does* establish: a Remove on a **default team channel** would be undone
  on the next app open. Mobile hides Add and Remove there, so mobile cannot create that
  state (see **Sim findings** item 3 and `ChatInfoScreen.tsx:397`, `:420`).
  **Phase D: check the WEB Edit Channel member management on default team channels** —
  if the web app offers a remove there, it is writing a change the RPC silently reverts.
* **Open fork: two info screens (ChatInfo vs GroupInfo) for group chats.** The kebab goes
  to `ChatInfo` (`TeamChatRoomScreen.tsx:731`), the header title to `GroupInfo` when
  `isGroupDm` (`TeamChatRoomScreen.tsx:710`). Both now offer Add / Remove / Rename to an
  admin, with separate implementations of the same three writes. Pick one, or make them
  one component.

---

## Parked

Known, deliberately not done, and not lost.

* **Test chat channel cleanup.** The test channels this work created are still there.
  Cleaning them up means **deletes** — SACRED, its own gated slice, never folded into
  build work. Lu wants it later.
* **Group Message's combined empty-name / no-member Alert.** `ChatScreen.tsx:783-786`
  alerts "Enter a group name and add at least one person" for either failure, so it names
  two problems when one applies, and it is an Alert where every other chat-name field now
  shows an inline message. Left alone — splitting it is a behaviour change the Oct 14
  ruling did not name.
* **`resolveChatName` is dead code (E).** Its fallback arm is exactly what the Oct 14
  create ruling removed, so no app code calls it. The export and its 5 tests remain
  because `src/lib/chatHelpers.ts` was in SCOPE for `CHANNEL_NAME_MAX` only.
* **Two info screens for group chats (ChatInfo vs GroupInfo) — the fork.** The kebab goes
  to `ChatInfo` (`TeamChatRoomScreen.tsx:731`), the header title to `GroupInfo` when
  `isGroupDm` (`:710`). Both now offer Add / Remove / Rename to an admin, through separate
  implementations of the same three writes. Pick one, or make them one component.

---

## Regression notes

**Team chats are unchanged in behaviour.** For any `channel_type` of `'team'` or `'club'`,
`isManageableGroupChat` is `false`, so all three expressions reduce to exactly what they
evaluated to before:

* `canAddMembers` → `isCustomTeamChannel && (isStaffInTeam || admin)` — the old expression,
  written out unfolded in the source for this reason;
* `canRemoveMembers` → `isCustomTeamChannel && admin` — the old expression;
* `canRenameChannel` → `false` — no new control appears.

Default team chat, club-announcements and DMs: all still excluded, by the same
`is_default` / `is_direct_message` tests, untouched.

**One intentional exception, copy only:** the Remove confirm dialog's new wording also
shows on team channels. The sentence is true there too — the delete is one
`comm_channel_members` row either way — and leaving the old vague wording in place for team
chats would have implied the two removes differ. No behaviour changed with it.

`ChatScreen` received **only** the name cap; no logic, no gate, no write path was touched.

`GroupInfoScreen` received the name cap **and** the inline empty-name message. Its gate
(`isAdmin`), its write statement and its refusal handling are unchanged — the only
behaviour difference is that a Save on an empty field now says why instead of doing
nothing. Its refused-write path still alerts `Could not rename group`, deliberately left
as it was.

---

## Proof

| DONE | Result |
| --- | --- |
| 1. `npx tsc --noEmit` | **64 errors = the 64-error baseline**, and the error list is **byte-identical** (`diff` of before/after output is empty). Zero errors in any touched file. The repo's adopted gate is *count unchanged vs HEAD*, never "tsc passes" — tsc has never been green here. |
| 2. repo lint | **No lint command exists.** `package.json` has no `lint` script; `npx eslint src/screens/ChatInfoScreen.tsx` fails outright — `ESLint couldn't find an eslint.config.(js\|mjs\|cjs) file` (eslint 9.39.4 vs the repo's legacy `.eslintrc.json`). Pre-existing and already on record in the ledger's Known side effects. **0 new errors is not demonstrable**; nothing regressed because nothing runs. |
| 3. existing tests | `src/lib/chatHelpers.test.ts` **48/48** and `src/utils/chatDays.test.ts` **22/22**, each in `America/Denver`, `Asia/Tokyo` and `UTC` — 6 runs, 0 failures. Unchanged from HEAD; this build touched no file either test covers. |
| 4. name-cap grep | `grep -rn "maxLength={100}" src/` → **0 hits**. `grep -rn CHANNEL_NAME_MAX src/` → **9**: the definition (`chatHelpers.ts:283`), 4 imports, and all **4** chat-name inputs. **None missing.** Table above. |
| 5. `git diff --stat` | 4 files, all in SCOPE. Below. |

### Re-run the smoke

```
npx tsc src/lib/chatHelpers.ts src/lib/chatHelpers.test.ts \
  src/utils/chatDays.ts src/utils/chatDays.test.ts \
  --outDir /tmp/chatinfo-smoke --module commonjs --target es2020 \
  --skipLibCheck --strict --esModuleInterop
TZ=America/Denver node --test /tmp/chatinfo-smoke/lib/chatHelpers.test.js
TZ=America/Denver node --test /tmp/chatinfo-smoke/utils/chatDays.test.js
```
Point `node --test` at the **file**, not the directory.

### git diff --stat

```
 docs/ledger.md                     |  29 +++--
 src/lib/chatHelpers.ts             |   9 ++
 src/screens/ChatInfoScreen.tsx     | 228 ++++++++++++++++++++++++++++++++++++-
 src/screens/ChatScreen.tsx         |   7 +-
 src/screens/GroupInfoScreen.tsx    |  62 +++++++---
 src/screens/StaffMessageScreen.tsx |   5 +-
 6 files changed, 307 insertions(+), 33 deletions(-)
```

Plus new, untracked: `docs/recon/chat-info-club-chats.md`.
`src/lib/chatHelpers.ts` is in SCOPE for `CHANNEL_NAME_MAX` only — it is the single
addition to that file.
FORBIDDEN paths confirmed untouched: `supabase/migrations/`, `package.json`, `.env*`, and
every roster / club / registration / payment / JoinTeam file.

---

## Simulator click-through

**Partly run.** Lu went through the simulator on Oct 14–15 and the results are recorded as
per-feature rows in `docs/ledger.md` — 8 rows `VERIFIED-SIMULATOR`, 1 `VERIFIED-SQL`,
8 still `AGENT-ONLY`. The list below is the full script; the `AGENT-ONLY` rows name the
parts of it that have **not** been exercised, chiefly steps 11, 13-16 and 26.

1. Open the Staff-Message chat **"U40 mens"** as its creator → kebab → Chat Info.
   → **Expect:** pencil beside the name, `+ Add` in the Members header, `Remove` on every
   row except your own.
2. Tap the name → edit → `Save`.
   → **Expect:** the header updates immediately; back out and reopen — the new name holds.
3. Clear the field → `Save`.
   → **Expect:** `Enter a chat name.` **inline under the field**, no alert, nothing written.
   Type one character → the message disappears.
4. Paste a 150-character name.
   → **Expect:** the field stops accepting at **100**. Save succeeds (no `22001` error).
5. Type `  Padded  ` → Save.
   → **Expect:** stored and shown trimmed.
6. `Cancel` after typing.
   → **Expect:** the old name, unchanged.
7. Tap `Remove` on a member.
   → **Expect:** `Remove from this chat?` / "…They stay on their team…". Confirm → the row
   goes.
8. **The ruling** — open that person's team roster, their player record, and the club
   member list.
   → **Expect:** all unchanged. They are still on the team.
9. `+ Add` → search that same person → tap.
   → **Expect:** they are back. Reopen the picker → they are **no longer offered** (already
   a member).
10. Your own row.
    → **Expect:** **no** `Remove` on it, ever.
11. Sign in as a **non-admin** member of the same chat → Chat Info.
    → **Expect:** no pencil, no `+ Add`, no `Remove`.
12. Kill and relaunch; reopen the chat.
    → **Expect:** the removed person has **not** reappeared (the re-adder cannot reach a
    team-NULL chat — this is the step that converts d) from INFERRED to observed).
13. **Regression — custom team channel**, as staff then as channel admin.
    → **Expect:** exactly as Phase C left it — `+ Add` for staff, `+ Add` and `Remove` for
    the admin, and **no rename pencil**.
14. **Regression — default "Team Chat", club-announcements, a DM.**
    → **Expect:** no Add, no Remove, no pencil anywhere.
15. **Regression — Group Info** (tap the chat *title*, not the kebab) and
    Chat > `+` > *New Group*.
    → **Expect:** unchanged, except both name fields now stop at 100 characters.
16. **Group Info rename, empty field** → `Save`.
    → **Expect:** `Enter a chat name.` inline under the field — the same message Chat Info
    shows. (Before: Save did nothing at all, silently.) Type one character → it clears.
17. **Staff Message, clear the chat name** → `Start Conversation`.
    → **Expect:** `Enter a chat name.` inline under the field, **no chat created**, you stay
    on the screen. (Before: it created a chat named after the picked group.) Type one
    character → the message clears.
18. **Staff Message, preset auto-fill still works.** Pick `All Coaches`, then
    `Team Managers Only`.
    → **Expect:** the name field follows each group, exactly as before. Type your own name,
    switch group → it stays as typed.
19. **Staff Message layout, iPhone 17 Pro, default text size, keyboard closed.**
    → **Expect:** the 4 presets in a 2×2 grid with their counts, no label truncated or
    wrapped; **at least 6 recipient rows visible** (was 2); Start Conversation pinned at the
    bottom.
20. **Staff Message presets, tap each of the 4.**
    → **Expect:** the picked one fills purple with a purple border; **nothing shifts
    position** when selection moves (the old build nudged the grid by 2pt).
21. **Staff Message with the keyboard open** (tap the search field).
    → **Expect:** the list shortens but the Start button stays reachable; no layout break.
22. **Staff Message keyboard.** Tap the search field, then tap a preset.
    → **Expect:** the keyboard goes **and** the preset changes on that single tap.
23. Same, then tap a recipient row; then re-open the keyboard and drag the list.
    → **Expect:** the row toggles on the first tap and the keyboard goes; the drag also
    dismisses it.
24. **Add-people picker** (Group Info or Chat Info `+ Add`): type, then drag the results.
    → **Expect:** the keyboard dismisses on drag; tapping a result still adds on the first
    tap and closes the sheet.
25. **100-char unbroken name.** Rename a chat to 100 characters with no spaces
    (e.g. `aaaa…a`), then open Chat Info.
    → **Expect:** the name wraps inside the screen, stops at 3 lines with an ellipsis, and
    the **pencil is visible**. Tap the name → rename opens.
26. Same name in **Group Info**, in the **chat list**, in the **by-team tab**, and in the
    **room header**.
    → **Expect:** nothing runs off either edge; list rows stay one line and normal height.
