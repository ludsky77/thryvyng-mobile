# SURVEY-SHARE-FIX-MOBILE — the `sv_chat_shares` contract, and the smoke harness gets a home

**Agent session 2026-11-03.** Scope: Lu's Q-05 column read (2026-11-03 12:41 MDT) + the
web audit `thrive-and-score/docs/recon/club-announcements-v1-server.md` § 7 (cross-repo,
READ-ONLY), plus the smoke harness Lu approved. **ROUTINE, no DB touched, no connection
made.** Nothing here has been tapped by a human: no simulator run, no device run, no
`expo export`.

---

## 1. The live table, and what mobile was sending

**Source of the column list: Lu's own read of the live table, Q-05, 2026-11-03 12:41 MDT.**
Not inferred, not from a migration — **no migration in either repo creates this table.**

| `sv_chat_shares` column | Constraint |
|---|---|
| `id` | default |
| `survey_id` | **NOT NULL** |
| `team_id` | **NOT NULL** |
| `shared_by` | **NOT NULL** |
| `message_id` | NULL |
| `shared_at` | default `now()` |

**There is no `channel_id` and no `posted_by`.**

| | Before (HEAD `a73ec11`) | After |
|---|---|---|
| Share insert | `survey_id, channel_id, posted_by, message_id` — two phantom columns, `team_id` (NOT NULL) omitted | `survey_id, team_id, shared_by, message_id` |
| Message content | the bare survey title | `[SURVEY:<survey id>] <title>` |
| Message insert error | never destructured | checked |
| Share insert error | never destructured | checked |
| Orphan message on a failed share | left in the chat forever | soft-deleted through `soft_delete_message` |
| Card read | `posted_by`, `created_at`, `poster:profiles!posted_by(full_name)` | `shared_by`, `shared_at`, name via `get_chat_profiles` |
| Share gate | `isStaffInChannel` (the label RPC) | `isStaffHere === true` (the server's `is_channel_staff`) |

**Why it was silent.** supabase-js reports a refusal as a RETURNED `error`, not a throw, so
the old `try/catch` around two bare `await`s caught nothing. The only user-visible outcome
was an `Alert` on an exception that could not happen. Every share failed, every time, and
said nothing.

---

## 2. What was applied, file by file

| File | What |
|---|---|
| **`src/lib/surveyShare.ts`** (NEW) | The one place the contract lives: the content format + its parser, `shareSurveyToChat` (two writes, both errors checked, rollback), `fetchSurveyShare` (the card's read). Testable without a device, which the screen is not. |
| `src/screens/TeamChatRoomScreen.tsx` | `handleShareSurvey` is now the screen's half only — close the picker, `refetch` on ok, `logError` + `Alert` on anything else. The `/survey` gate and the picker's `isStaff` prop both read `isStaffHere === true`. |
| `src/components/chat/SurveyChatCard.tsx` | Reads through `fetchSurveyShare`; `sharedByName` resolved by `fetchChatProfileNames`; `postedByName`/`postedAt` renamed to `sharedByName`/`sharedAt` with a null guard on the date. The two `as any` casts are gone. |
| `src/screens/AnnouncementsFeedScreen.tsx` | A `'survey'` row renders `SurveyChatCard`, same shape as the poll branch. |
| `src/screens/AnnouncementDetailScreen.tsx` | Same, in the body ternary. |
| **`scripts/smoke/`** (NEW) | `run.js`, `stubClient.js`, `announcements.smoke.js`, `surveyShare.smoke.js`. |
| `package.json` | `"smoke": "node scripts/smoke/run.js"` — a script, no dependency. |

### The content format is a cross-app contract

`[SURVEY:<survey id>] <title>` is what **web's card regex reads** —
`thrive-and-score/src/components/comm/ChatPanel.tsx:511`, matched byte for byte by the
smoke. Mobile sent the bare title, so **every mobile share rendered on web as plain text
with no card**, and nothing on the mobile side ever looked wrong (mobile finds its own card
by message id in `sv_chat_shares`, not from the content). The smoke asserts web's own regex
against what we now send.

### The `team_id` precondition

`team_id` is NOT NULL with no default, so a chat with no team **cannot** carry a share row.
`shareSurveyToChat` refuses **before writing anything** and shows *"Surveys can only be
shared in a team chat."* — otherwise the message would land and be a permanent orphan whose
card can never resolve. The smoke asserts `calls.length === 0` for `null`, `undefined` and
`''`.

### The rollback

Two writes, no transaction. If the share row is refused after the message lands, the
message is soft-deleted via **`soft_delete_message`** — the same RPC the chat's own "delete
my message" uses (`TeamChatRoomScreen.handleDeleteMessage`), so the row leaves every
reader's list exactly as a deleted message does, on web as well. Web does this with a
direct `update({ is_deleted: true })` (`TeamMessagesTab.tsx:526-529`, already fixed there);
mobile goes through the RPC, which is the mobile app's own door. A **failed rollback is
reported, not hidden**: `rolledBack: false` rides on the result and the user still sees the
failure sentence.

### The gate today, as asked (FIX item 2)

**There is no "share button."** The entry is the `/survey` slash command in the composer,
which opens `SurveyPickerModal`.

* **Before:** `isStaffInChannel` = `labelKind.get(user.id) === 'staff'` from
  `get_channel_member_labels` — "team staff anywhere in this chat's club."
* **After:** `isStaffHere === true`, the server's `is_channel_staff` RPC
  (`src/lib/channelStaff.ts`), which is the answer `sv_chat_shares`' own RLS reaches.
* **The two disagree about real people, in both directions** (the reason ruling FND-4d3
  exists): a **club_admin** the labels RPC has never heard of was told *"Not Authorized"*,
  and a **coach of another team in the same club** was offered a share the database would
  refuse. `undefined` (in flight) reads as not-staff, so the refusal is never shown to
  someone who does have it.
* The picker's own "staff only" screen reads the same value, so the gate that opens it and
  the gate inside it cannot disagree.

---

## 3. The smoke harness — `npm run smoke`

**Lu approved giving it a home** (`docs/recon/club-announcements-v1-mobile.md` § 7
RECOMMEND). It had been rebuilt in a scratchpad twice and lost twice; the second pass had
to reconstruct the first's 38 assertions from that document's prose.

**How it works.** Plain node, **no new dependency** — the `typescript` and `node` already
installed. `run.js` transpiles the **real source files, unchanged**, with the project's own
`tsc` under `--strict` into a temp dir (the flags recorded in
`docs/recon/chat-info-club-chats.md` § "Re-run the smoke", plus `--rootDir src`), writes a
six-line getter shim over the transpiled `lib/supabase.js`, and asserts against what the
modules then do. **The sources are never copied or edited, so the smoke cannot drift from
the code it tests.** A tsc diagnostic naming one of the files under test aborts the run.

**Isolation is asserted, not assumed:** the run ends by checking that
`@supabase/supabase-js` was never even required, so no client was constructed and nothing
could open a socket.

**Result: 255 assertions, ALL PASS, 0 failures.**

| Suite | Groups |
|---|---|
| `announcements.smoke.js` | limits · action allow-list · card key · jsonb builder · title split · preview · compose round trip · contract-missing codes · refusal copy (all 14 sentinels, each distinct) · refusal detection · `post_club_announcement` args · `p_title` never null · the result ladder · the queries built · setup-pending copy |
| `surveyShare.smoke.js` | content format (incl. web's own regex) · insert shape (exact key set, both phantom columns asserted ABSENT) · write order · no-team (nothing written) · message refused · message returned no id · share refused + rollback · rollback failed · the card read (column names, inner join, `maybeSingle`) · the card read degrades |

**What it cannot prove, stated plainly.** It is not a device test — nothing is rendered or
tapped. It is **not a schema test**: the stub records what the code *sent*; it cannot tell
you a column exists. Every column list asserted is sourced to a human read, cited at the
assertion. Live acceptance is the server dry run's V1/V2/V3, and a simulator share is owed.

**Adding a suite:** write `<name>.smoke.js` next to `run.js`, export `{ title, run(t, env) }`,
add it to `SUITES`.

---

## 4. Owed — nothing here has been run on a device

1. **The share itself**, as channel staff in a team chat with an open survey: the picker
   opens, a pick posts a card, and **web shows a card for the same message** (that is the
   content-format fix). **It will fail until the server migration's PART 6 applies** — the
   live CHECK on `comm_messages.message_type` does not list `'survey'`, so the first insert
   is refused with `23514`. The smoke pins that exact case: it now reports instead of
   swallowing.
2. **A refused share rolls back**: the orphan `[SURVEY:…]` message must not remain.
3. **A web share renders on mobile** — mobile looks the card up by message id, which web
   writes, so this should now work in both directions.
4. **The gate**: a club_admin who is not team staff can share; a coach of another team in
   the club cannot. Hard to stage; needs two accounts.
5. **A survey card in the announcements feed and detail screens.**

---

## 5. FOUND outside scope — reported, NOT fixed

* **🔎 A card key with stray whitespace disables Send with no visible reason.** Found by a
  smoke assertion. `isSendableAction` tests the `playbook_card` target **untrimmed**
  (`clubAnnouncementCards.ts:185`), while `buildAnnouncementActionsPayload` trims it
  (`:205`) and `ComposeAnnouncementScreen.tsx:380` trims it for the inline "bad key"
  warning. So a key typed as `P7 ` shows **no warning next to the field**, yet counts as an
  incomplete action, and `canSend` (`:179`, `incompleteActions === 0`) goes **down with
  nothing on screen saying why**. **RECOMMEND (a suggestion):** trim in `isSendableAction`,
  which makes all three agree in one edit. Not done here — it is announcement-compose
  behaviour, not survey share. The two smoke assertions marked `FOUND` pin today's
  behaviour so a fix flips them deliberately.
* **`DMChatScreen` branches on `message_type` for nothing** — not polls, not surveys. A
  `'survey'` or `'poll'` row in a DM or group_dm would render as raw text. **Unreachable
  today in both apps** (mobile's share needs the chat's `team_id`, which a DM has none of;
  web's share only runs inside `TeamMessagesTab`, whose channels are all team channels), and
  it is the same latent gap polls already have. Fixing it means deciding how a DM renders
  cards — a product call, not a bug fix.
* **🛡 `comm_poll_votes_insert` is still the pre-4a reactions hole** — carried forward
  unchanged from `club-announcements-v1-mobile.md` § 7. **SACRED — Lu's call.**
* **`src/lib/permissions.ts` is still entirely unimported.** Same § 7 recommendation,
  unchanged: delete it in whatever slice next touches client-side role checks.

---

## 6. Proof

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | **5 errors = baseline**, and the error list is **byte-identical** to the before-run (`diff` empty). All 5 pre-existing in `src/components/games/*`; **0 in any touched or new file**. |
| `eslint` on the 4 changed + 1 new source file | **0 errors.** Warnings **39 → 36**, net **−3**, **0 new**: `TeamChatRoomScreen` 36 → 35, `SurveyChatCard` 3 → 1 (the two `as any` casts are gone; the 1 left is the pre-existing `navigation: any` prop), both announcement screens 0 → 0, `src/lib/surveyShare.ts` **0/0**. |
| `eslint scripts/smoke/` | **0 problems.** `run.js` carries a file-level `no-console` disable with its reason — it is a CLI reporter and nothing in `scripts/` is bundled (Metro's entry is `index.ts`). |
| `npm run smoke` | **ALL PASS — 255 assertions, 0 failures.** |
| grep, phantom columns | `grep -rn "posted_by" src/` → **5 hits, every one PROSE in a comment** recording the defect. `channel_id` on `sv_chat_shares` → **2 hits, both prose.** **Zero executable occurrences of either.** |
| grep, renderers | `message_type === 'survey'` → **3 hits**: `TeamChatRoomScreen:834`, `AnnouncementsFeedScreen:456`, `AnnouncementDetailScreen:256`. `SurveyChatCard` rendered at exactly those three. |
| simulator / device / `expo export` | **NONE. Nothing was tapped.** |
| cross-repo | **READ-ONLY, nothing written:** `thrive-and-score/docs/recon/club-announcements-v1-server.md`, `src/components/comm/ChatPanel.tsx`, `src/components/comm/TeamMessagesTab.tsx`. `git status --porcelain` in that repo was not altered by this session. |

### `git diff --stat`

```
 docs/recon/arcade.md                     | 39 +++++++++++++-
 package.json                             |  3 +-
 src/components/chat/SurveyChatCard.tsx   | 75 ++++++++++++++++++-----------
 src/screens/AnnouncementDetailScreen.tsx |  9 ++++
 src/screens/AnnouncementsFeedScreen.tsx  | 20 ++++++++
 src/screens/TeamChatRoomScreen.tsx       | 81 ++++++++++++++++++++++----------
```

`docs/recon/arcade.md` was **already modified before this session opened** (it is in the
starting `git status`) and was not touched here. New, untracked: `src/lib/surveyShare.ts`,
`scripts/` (4 files), and this file.

**FORBIDDEN paths confirmed untouched:** no SQL, migration, edge function or DB connection;
no dependency added (`package.json` changed by **one line**, a script); no `app.json`, no
`eas.json`, no commit; no edit in `thrive-and-score`; `src/components/games/*` untouched.
