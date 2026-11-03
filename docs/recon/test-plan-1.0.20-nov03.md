# Human test plan — 1.0.20, Nov 3 2026

**What this is.** One list of what a human has to look at before the 1.0.20 store build, built
from the recon files and **checked against the code as it stands today**. Every on-screen label
below was read out of `src/`, not out of the older recon prose — where the two disagree, the
code won and the difference is called out.

**Written for:** whoever runs the taps (Lu, or an agent driving a simulator), not for the
planning room.

**Sources.** `docs/recon/club-announcements-v1-mobile.md` §5 · `docs/recon/survey-share-fix-mobile.md`
§4 · `docs/recon/announce-push-test.md` + `docs/recon/test-payloads/` ·
`docs/recon/release-1.0.20-readiness.md` §3 · `docs/recon/playbook-content-gaps.md` ·
`docs/ledger.md` (the entries cited per group).

**Cross-repo reads, declared, READ-ONLY, nothing written there:**
`thrive-and-score/supabase/content/20261102224500_playbook_content_b_apply.sql` (Playbook content
batch 2, **applied to prod 2026-11-03 00:48**) and `thrive-and-score/docs/ledger.md`.

**No database was touched to write this file** — every claim about what is *in* prod comes from
reading the apply SQL and its own verification gates, not from a query. Where that is not enough
to settle a question, the question is handed to a tap instead of guessed (see Group 5b).

**Tags.** `UNCONFIRMED` = the exact label, screen or card key could not be confirmed from code.
`PROVEN` = read in a file with a line cite.

---

## 0. READ THIS FIRST — three things that change the plan

### 0.1 Group 8 (chat gender chips) has no screen left. It cannot be tested.

The ledger's owed look (`ledger.md:1839-1846`, item 1) asks for *"the club-wide picker's GENDER
chips still filter"*. **That picker was deleted** in commit `c3924b4` ("drop dead audience
picker"). The code says so itself:

```
src/screens/ChatScreen.tsx:877
 * The age/gender/team audience picker that used to live here is GONE. It was
```

`grep -n "gender" src/screens/ChatScreen.tsx` → **1 hit, and it is that comment.**
`grep -rn "utils/teamGender" src/` → **0 hits in `src/screens/`**; the only importer is
`src/features/pac-playbook/staffTeams.ts:73-74`. **PROVEN.**

So the gender rule now has exactly **one** live surface — the Playbook staff drill-down's gender
tiles — which is **Group 7**. Group 8 below records this and sends you to Group 7 instead. The
ledger line that asks for it is stale; closing it is a ledger edit, not a test.

### 0.2 `F7`–`F11` are real, live, and mobile can see them. Batch 2 is in the DATABASE.

**An earlier draft of this file denied that `F7`–`F11` were real cards. That was wrong, and the
mistake is worth naming so nobody repeats it: it read a `__DEV__` test fixture as if it were
the app's content source.** It is not. Corrected below, with proof.

**Mobile loads Playbook content from Supabase, and from nothing else, on every shipping path.**

| what | table | proof |
|---|---|---|
| the book | `playbook_books` by slug `pac-playbook` | `src/features/pac-playbook/rpc.ts:76-82` |
| chapters | `playbook_chapters` | `rpc.ts:101-108` |
| cards | `playbook_cards`, `published = true`, by `sort` | `rpc.ts:110-118` |
| figures | `playbook_blocks` — **no published filter at all** | `rpc.ts:123-126` |

**There is no bundled-JSON path in production, so there is nothing for the DB to "win" against.**
`src/features/pac-playbook/dev/pac-playbook-v2-FINAL-data.json` reaches the reader only through
`usePlaybookBook`'s optional `offline` argument (`usePlaybookBook.ts:145-150`, short-circuited by
`if (offline) return` at `:156`, `:207`, `:228`). The **only** caller that passes it is
`dev/PlaybookDevHarness.tsx:359`; the real navigator route passes nothing
(`AppNavigator.tsx:382`, `component={PlaybookScreen}`), and the harness itself is
`__DEV__ ? lazy(…) : null` (`AppNavigator.tsx:96`). **PROVEN.**

**Batch 2, applied to prod 2026-11-03 00:48**, read from
`thrive-and-score/supabase/content/20261102224500_playbook_content_b_apply.sql` (declared
read-only cross-repo read):

| what | detail | proof (that SQL) |
|---|---|---|
| **5 new cards** | **`F7` `F8` `F9` `F10` `F11`**, chapter `foundations`, sorts 8–12, inserted **`published = true`** | `:223-224` (`SELECT …, true`), gate P03 `:295-299` |
| **5 new diagram blocks** | one per new card — `F7` `F8` `F9` `F10` `F11` | `:231-232` |
| **`FM5v5` diagram REPLACED** | **5 frames, every one on backdrop `futsal`, captioned EN + ES** | `:121`, gate P08 `:351-362` |
| **the `FM5v5` card row** | **deliberately NOT touched** — byte-identical to the snapshot | `:27`, `:352`, gate `:360` |
| **`keeperangle`** | **zero occurrences anywhere in the file** | `grep -n keeperangle` → no hits |
| block kinds written | **`diagram` only** — no `formation`, `positions`, `numbers` or `movement` block is touched | `grep "('formation'"` → no hits |

**So `F7`–`F11` resolve.** The reader opens a card by key off the DB rows —
`cardsByKey` is built from the fetched `cards` (`PlaybookScreen.tsx:334`) and
`:360` is `if (cardParam && cardsByKey.has(cardParam))`. With `F7` published in prod, that `has`
is **true** and the card opens.

**And the card-key validator never had a list to fail against.**
`src/constants/announceCardKey.ts:30-33` is **prose inside a docblock** — every line starts `*`
— recording what the keys *happened* to be when it was written. The only executable test is the
regex at `:39`, `^[A-Za-z0-9_-]{1,16}$`, applied by `isAnnounceCardKey` at `:42-44`. `F7` matches.
**An announcement button with card key `F7` is ACCEPTED** — it was never going to be rejected, and
it no longer falls back to the cover either. That docblock is now out of date; correcting it is a
code edit and outside this task's SCOPE.

### 0.3 The push test's payload was right all along.

`announce-push-test.md` §3 expects payload 1 (`card: "F7"`) to land **on card F7**, calling it
*"a real card"*. Per §0.2 **it is one** — published in prod since Nov 3 00:48. **Use the payload
as it stands; change nothing.** Its own stated reason ("F7 is one of the 69 in the frozen book")
is the part that is wrong — F7 is not in the frozen fixture, it is in the database, which is the
only place that matters at runtime.

**One thing in that file IS stale:** its §3 cold-start warning (*"the canonical fix is
`getLastNotificationResponse()`, which this app never calls"*) was **fixed** by `PUSH-COLD-START`
(`ledger.md:2069-2082`, uncommitted). Group 4 tests the fixed path, and cold start is now the
most interesting of its three states rather than a known miss.

---

## 1. Accounts

**No passwords are recorded here or anywhere in this repo.** Lu holds them.

| name used below | login | role | team / club |
|---|---|---|---|
| **Lu** | `ludwig.snchz@gmail.com` | club staff / admin (staff on every team) | PAC |
| **parent** | `ludwig.snchz+zztest7@gmail.com` | parent, secondary parent of player Zack Testeron | ZZ Test Team 0826 |
| **director** | `ludriv` — **email UNCONFIRMED**, the docs name only the handle (`ledger.md:1534`) | director | PAC, all club teams |
| **coach** | `Cole Coachman` — **email UNCONFIRMED** (`ledger.md:1532`) | head coach | ZZ Test Team 0826 |
| **manager** | **UNCONFIRMED whether any manager account is loginable** (`ledger.md:1535` says so itself) | team_manager | — |

**Sandbox team for anything that writes:** **ZZ Test Team 0826**, 5 active Testeron players
(`ledger.md:628`).

**Build requirement for every group that involves a push: a dev client or standalone build, NOT
Expo Go.** `src/services/notifications.ts:8` sets `isExpoGo` and
`addNotificationListeners` returns a no-op when true (`:177-180`) — a tap in Expo Go proves
nothing. **PROVEN.**

---

## 2. Order to run them in

Cheapest-and-safest first, the one irreversible step last.

| # | group | why here |
|---|---|---|
| 1 | **5, 6, 9** — the looks | write nothing and are the bulk of what is owed. **5 needs the working tree, not a store build** (the futsal mirror is uncommitted) |
| 2 | **7** | one login change, reads only |
| 3 | **1A** | writes only a mark-read; proves the feed before anything is sent |
| 4 | **4** | needs the simulator and a backgrounded app |
| 5 | **2** | two real writes to the sandbox team |
| 6 | **3** | opens compose; stops short of sending |
| 7 | **1B** | reactions — real writes, but only to the club channel's reaction table |
| 8 | **1D** | **~231 families get a push. Lu approves the wording first. LAST.** |

---

## GROUP 1 — Club announcements, A then B (then D)

**Proves:** the announcements chat renders as a feed of cards with a tap-through detail and
reactions-only (no replies), compose refuses what the server would refuse, and — in D — a real
announcement posts and routes.
**Source:** `club-announcements-v1-mobile.md` §5.
**Device:** simulator for A and B. **D needs a second real phone** on a member account to see
the push land.
**Account:** Lu (staff — A5 only shows the form for someone `is_channel_staff` says yes to).
**Setup:** start Metro, sign in as Lu. Nothing to reset.

### 1A — before the server is applied. Sends nothing. ~8 min. **Writes DB: yes, one mark-read only.**

| # | tap | expect |
|---|---|---|
| A1 | **Chat** tab | the list as today — the announcements row present, same tan dot and unread count |
| A2 | the **club announcements** row | not chat bubbles: a header with the channel name and the club name under it, and — server not applied — **"Announcements are being set up"** with **"This club's announcement cards go live with the next update. Messages in this chat are not affected."** |
| A3 | **back** | the chat list. The row's unread count is **0** — opening the feed marks read exactly as opening the chat did. **← this is the one write in 1A** |
| A4 | **+ / New chat → Club-Wide Message** | the tile reads *Opening…* briefly, then the **New announcement** screen. If instead *This club has no announcements chat yet* or *Couldn't reach the server* — **stop, report which** |
| A5 | on **New announcement** | a spinner, then the form. If it says *Only a coach, manager or club admin of this chat can post an announcement*, stop — on Lu's account it must be the form |
| A6 | type a **Title**, keep typing past 80 | the counter reads `80/80` and the box **stops accepting** at 80 (`maxLength={ANNOUNCEMENT_TITLE_MAX}`) |
| A7 | clear the Title, type a **Message** | the counter is replaced by **"Add a title: it's what families see on the card."** in red, and **Send announcement** is greyed. **NEW since §5 was written** — a73ec11 made the title required |
| A8 | put the Title back; watch **Preview** | the preview headline follows the Title; with no Title it reads *Your title goes here* |
| A9 | tap **＋ Playbook card**, leave the key empty | a red box and **"Letters, numbers, _ and - only, up to 16 characters"**; **Send announcement** greyed; the form says **"One button still needs its text or its card key."** |
| A10 | type `F3` into the key | red clears, the hint becomes **"Opens the book on this card"**, Send available |
| A11 | type `F3/../F4` instead | red again, Send greyed again. **The step that matters most on this screen** |
| A12 | add a 3rd and a 4th button | after the **third**, the **＋ Playbook / ＋ Playbook card / ＋ Courses** chips disappear — three is the ceiling |
| A13 | tap **Send announcement** | **"Announcements are being set up"** and **nothing is sent**. ← the whole point of A |

**Label corrections against §5, all PROVEN from code:** the add chips are a `+` **icon**
(`Feather name="plus"`) plus the bare words **Playbook** / **Playbook card** / **Courses**
(`ComposeAnnouncementScreen.tsx:437,454,463`) — §5 wrote them as *"+ Playbook card"*. A9's
sentence is **"One button still needs its text or its card key."** (`:503`), not §5's *"one
button still needs its card key"*. A7 did not exist in §5 at all.

### 1B — after the server is applied, still sending nothing. ~7 min. **Writes DB: yes — reactions.**

| # | tap | expect |
|---|---|---|
| B1 | open the feed (A2) | **the cards**, not "being set up". Existing messages appear as cards whose headline is their first ~80 characters — they have no `title`, and that is correct |
| B2 | look at the group headings | **"This week"** above anything from this calendar week, **"Earlier"** below. **§5.B2 wrote these as `THIS WEEK` / `EARLIER`; the code renders sentence case** (`AnnouncementsFeedScreen.tsx:357`, PROVEN) |
| B3 | tap **All** / **New** | `New` shows only unread; likely empty, because A3 marked the channel read. The chip reads **New (n)** when n > 0 (`:576`). Empty state: **"Nothing new"** + **"You have read everything in this feed."** |
| B4 | tap any card | the full message. **No text box, no Reply, no swipe-to-reply anywhere on this screen** |
| B5 | tap the ☺+ and pick 👍 | the emoji appears at once, count 1, purple outline. **← write** |
| B6 | tap your own 👍 chip | it disappears. **← write** |
| B7 | **long-press** a chip with a count | the existing who-reacted list |
| B8 | back, reopen the same card | the reaction is still there — it was really written |

### 1C — a real send to a non-club channel. **SKIP.**

§5.C needs a throwaway club channel, which is **a database write and therefore Lu's**, not a
tester's. Skip unless Lu has made one.

### 1D — the real send. ~10 min. **Writes DB: YES, and it pushes ~231 families.**

> **🛑 Every row inserted into `club-announcements` fires the `comm_messages` trigger and pushes
> ~231 PAC families. Push is unconditional on insert — there is no per-message switch and no
> column to write one into** (`club-announcements-v1-mobile.md` §B11). **Lu writes and approves
> the exact title and message before a single tap in this section.**

| # | tap | expect |
|---|---|---|
| D1 | **Lu approves the wording.** Nothing before this | — |
| D2 | say out loud who gets it: every member of `club-announcements`, ~231 people, each a push | — |
| D3 | compose it, check Preview, **Send announcement** | **"Announcement sent"**, then **"Back to announcements"** |
| D4 | the feed | the new card at the top under **This week**, its title as the headline |
| D5 | tap it | the title **once** at the top, body under it — **the title must not appear twice** |
| D6 | tap a button on it | the Playbook (on that card, if a card key was used) or Courses, tab bar still visible, a way back |
| D7 | **on the second phone**, a member account | the push arrives; tapping it opens **the feed**, not the chat bubbles. **Needs the sender to include `announcement: true` — no sender does yet**, so until then the tap opens the chat room, which is correct for a payload with no flag. **UNCONFIRMED end to end; expect the chat room** |

**Still owed after 1A–1D** (§5.E, unchanged): a real poll from compose (**＋ Add a poll**); a
**non-staff** account opening the feed (no ✎ button, no route to compose); the club-less and
two-club staff cases of the Club-Wide Message tile.

---

## GROUP 2 — Survey share

**Proves:** a staff share writes the columns the live `sv_chat_shares` actually has, the card
renders on both apps, and a refusal is reported instead of swallowed.
**Source:** `survey-share-fix-mobile.md` §4. **Device:** simulator. **~10 min.**
**Account:** Lu (must be `is_channel_staff` of the chat — the gate is now the server's answer).
**Setup:** ZZ Test Team 0826 needs **one open survey of its club**. Creating one is a DB/admin
write — **if there is none, stop: this group cannot run.** The picker's own empty state is
**"No open surveys."** + **"Create one in Club Admin."**

> **🛑 EXPECT STEP 3 TO FAIL TODAY, and that is the pass condition.** The live CHECK on
> `comm_messages.message_type` does not list `'survey'` yet (server migration PART 6), so the
> first insert is refused `23514`. **The point of this build is that it now SAYS SO.** A silent
> nothing is the failure; the alert is the success.

| # | tap | expect | writes DB |
|---|---|---|---|
| 1 | open **ZZ Test Team 0826** team chat; type `/survey` and send | the **Share a Survey** sheet. If *"Only team staff can share surveys in chat."* — stop, the gate refused you | no |
| 2 | look at the list | one row per open survey, each with **Share** and a **No deadline** or **Closes \<date\>** line | no |
| 3 | tap **Share** on a survey | **Before PART 6 applies:** an **Error** alert reading **"Couldn't share the survey. Try again."** and **no message in the chat**. **After PART 6:** the button reads **Shared!** and a card appears | yes — 2 rows after PART 6, 0 before |
| 4 | the card in the chat | a purple-barred card: **CLUB SURVEY** label, the survey title, a **Closes …** line, a **Respond Now** button, and a footer **Shared by \<name\> · \<n\>m ago**. The name must be a real person, never `undefined`, and never an email | no |
| 5 | tap **Respond Now** | the survey response screen | no |
| 6 | **on web**, open the same team chat | **a survey card for the same message** — this is the content-format fix. Before it, a mobile share rendered as plain text there | no |
| 7 | share **from web**, then look on mobile | the mobile card renders — mobile finds it by message id, which web writes | yes (from web) |
| 8 | force a refusal (a chat you are not staff of, if one is reachable) | the orphan `[SURVEY:…]` message **must not be left behind** — the rollback soft-deletes it | n/a |

**UNCONFIRMED:** step 8 needs a channel Lu is not staff of. Lu is staff nearly everywhere
(`ledger.md` records this for the locked-composer test too), so this may not be stageable.
**The card label renders uppercase** (`textTransform: 'uppercase'` on the label style) — the
string in code is `Club Survey`.

---

## GROUP 3 — Club-wide message fix

**Proves:** the **Club-Wide Message** tile reaches the club's real announcements chat instead of
printing *"Club broadcast channel not found. Contact admin."* — it asked for
`channel_type = 'broadcast'`, which the live CHECK does not allow, so it **always** failed.
**Source:** `ledger.md:2009-2067`. **Device:** simulator. **~4 min.**
**Account:** Lu. **Setup:** none. **Writes DB: no** — this group stops before Send.

| # | tap | expect |
|---|---|---|
| 1 | **Chat** tab → **+ / New chat** | the new-chat sheet |
| 2 | **Club-Wide Message** | the row reads *Opening…*, then **New announcement**. **The words "broadcast" and "Contact admin" must not appear anywhere** |
| 3 | do **not** send. Go back | the chat list |
| 4 | confirm the audience picker is gone | **no age / gender / team chips on the way to compose** — one tap from the tile to the form (see §0.1) |

**Note:** this is the same door as 1A4-A5. Running Group 3 separately is worth ~4 minutes only
because it is the step that used to be broken; if 1A passed, 3 passed.

---

## GROUP 4 — Cold-start push routing

**Proves:** a push tap routes to the right screen from **all three app states** — including from
**force-quit**, which was silently dropped until `PUSH-COLD-START`.
**Source:** `announce-push-test.md` + `docs/recon/test-payloads/`. **Device: iOS simulator only**
(`simctl` is iOS-only). **~12 min.** **Writes DB: no** — routing only.
**Account:** any user who can see the Playbook (Lu).
**Setup:** boot a simulator, install and launch **a dev client or standalone build — NOT Expo
Go**, sign in, then **background the app**. `simctl push` only delivers; the routing runs on the
**tap**.

```sh
xcrun simctl list devices booted
xcrun simctl push booted com.weolkn.thryvyng docs/recon/test-payloads/playbook-open-F7.apns
xcrun simctl push booted com.weolkn.thryvyng docs/recon/test-payloads/courses-open.apns
xcrun simctl push booted com.weolkn.thryvyng docs/recon/test-payloads/playbook-open-malformed.apns
```

| # | payload | must land on | note |
|---|---|---|---|
| 1 | `playbook-open-F7.apns` — **use as-is** | the Playbook reader **open on card `F7`**, tab bar visible | `F7` is a **real published card** since batch 2 (§0.2). This is now a genuine positive case: it is distinguishable from 3 and 4, which both land on the cover |
| 2 | `courses-open.apns` | the **Courses** screen | takes no params |
| 3 | `playbook-open-malformed.apns` | the Playbook reader **on the cover** — no error, no blank screen | `ANNOUNCE_CARD_KEY` rejects `../../etc/passwd`, so `card` is `undefined` |
| 4 | edit 1's `card` to `"ZZZZ"` | the **cover** — shaped right, not in this viewer's book | the reader's own fallback, `PlaybookScreen.tsx:360` |

**Why 1 matters now and did not before:** until batch 2 applied, `F7` was not a card, so test 1
landed on the cover — the same place as 3 and 4 — and could not tell routing success from
routing failure. With `F7` live, **1 lands somewhere 3 and 4 cannot**, which is what makes the
set a real test. Run 1 and 3 back to back and compare.

**Run each from all three states, and the third is the new one:**

1. **foreground** — app open and visible;
2. **background** — app backgrounded, then tap (the main case);
3. **cold start** — **app force-quit**, then tap. **This is what `PUSH-COLD-START` fixed**
   (`ledger.md:2069-2082`, uncommitted). It should now land on the destination, not on whatever
   screen the app last had. One tap must route **once** — not twice.

**Not covered, and not a gap in this plan:** Android (needs an FCM data message, not written);
a real APNs round trip (`simctl` injects locally — it proves nothing about the push token, the
Expo service, or entitlements); the **signed-out** tap, which is still `reset()` to `Welcome`
and loses the destination (`playbook-share-links.md` §1, still open).

---

## GROUP 5 — Batch 2 content: F7–F11 and the futsal court

**Proves:** the five cards batch 2 added are reachable in the mobile reader, each draws its own
new figure, and the 40×20 m futsal court renders under `FM5v5`'s five frames instead of leaving
them on blank space.
**Source:** §0.2 · `ledger.md:1855`, owed look `:1901-1904` · the batch 2 apply SQL.
**Device:** **simulator** — these are static pictures, no drag.
**Account:** Lu (any Playbook viewer).
**Setup:** the futsal renderer mirror is **uncommitted** — run against the working tree, **not a
store build**, or the court will not draw. **~8 min. Writes DB: no** (opening a card is a read;
do not tap *Got it*, which writes progress).

### 5a — the five new cards. ~4 min.

| # | tap | expect |
|---|---|---|
| 1 | Playbook → **Foundations** chapter contents | **five new rows after `F5`** — the batch inserted `F7`–`F11` at sorts 8–12, `published = true`. **`F6` is NOT among them** — it was proposed and never built (`playbook-content-gaps.md:9`) |
| 2 | open **`F7`** | the card with **its own figure** — batch 2 wrote a `diagram` block per new card, so none of the five should show the dashed **"Diagram pending"** panel |
| 3 | open **`F8` `F9` `F10` `F11`** in turn | same: real figure on each, no "Diagram pending" |
| 4 | the chapter's progress denominator | the card total **grew by 5** — the apply SQL flags this itself (`:415`, info I5), so every player's "n / total" moves. Confirm it does not read a stale total |

### 5b — the futsal court, on `FM5v5`. ~4 min.

| # | tap | expect |
|---|---|---|
| 1 | open **`FM5v5`** (the 5v5 rotation card) | a board with **five tabs** — batch 2 replaced its diagram with 5 frames, all on backdrop `futsal` |
| 2 | the court | it draws **inside** the board, not clipped by it |
| 3 | the players | they sit **on** the court at the zoom-board default size (**3.4**), not beside or under it |
| 4 | the ends and the marks | goals at both ends; the **6 m** and **10 m** marks read right |
| 5 | each of the five tabs | every frame has a caption, and it is present in **both EN and ES** (the apply SQL gate P08 requires both) |

> **⚠ The one thing in this group that could go either way, and one tap settles it.**
> Batch 2 wrote the `FM5v5` **diagram block** but **deliberately did not touch the `FM5v5` card
> row** (`:27`, `:352`). The card is `content.kind = 'formation'`
> (`playbook-content-gaps.md:159`), and mobile's dispatch at `CardScreen.tsx:214` is
> `kind === 'formation' && blocks.formations[card.key]` — **both halves**. The recon records
> that `FM5v5` has **no formation block** (`playbook-content-gaps.md:159-161`), and batch 2 wrote
> **no `formation` blocks at all**, so that guard should FAIL and fall through to
> `else if (diagram)` at `:231`, which resolves `blocks.diagrams['FM5v5']` — the new 5-frame
> futsal figure — and renders it through `CardBoard` **with the tab row**. That is the expected
> path and what the steps above assume.
> **If instead you see a formation panel, or the dashed "Diagram pending":** a `formation` block
> for `FM5v5` exists in prod that this repo's recon does not know about, and `content.kind` still
> needs clearing to `''` (`playbook-content-gaps.md:164-166`). **Report which of the three you
> saw** — it is the difference between "done" and "one row still needs changing", and it cannot
> be settled from the repo, only by this tap.

**Note — `ledger.md:1241-1243` is now STALE.** It says *"`FM5v5` now shows the dashed 'Diagram
pending' panel, because it still has no diagram and no formation block"*. True when written;
batch 2 gave it a diagram. **Correcting that line is outside this task's SCOPE** (which allows
only the gender-chips item, the keeper preset and the tenant entry), so it is flagged here.

### 5c — the keeper chapter. **NOT TESTABLE. 0 min.**

Batch 2 contains **zero occurrences of `keeperangle`**, and no keeper cards. The *board* is built
(Group 6b); the cards that would carry it are not. **Nothing to tap.**

---

## GROUP 6 — Keeper board and diagram tabs

**~12 min total. Writes DB: no — the keeper board stores nothing, by design.**

### 6a — diagram tabs. **Device: simulator fine. ~6 min.**

**Proves a BUG FIX, not polish.** Six of the book's 38 diagrams carry two frames, and **both
boards used to draw only the last one — frame 1 of each of those six cards was in the database,
was fetched, and could not be looked at.** Three of them are A/B pairs whose whole teaching is
the comparison; the reader only ever saw B.
**Source:** `ledger.md:1211-1222`. **Account:** any Playbook viewer (Lu).

| # | tap | expect |
|---|---|---|
| 1 | open **`F1` Time & space** | a **tab row** above the board, **tab 1 selected**, tabs at least 44pt tall |
| 2 | the active tab's colour | it wears the card's **section tone**; the others are neutral |
| 3 | tap tab 2 | the board plays **that frame's beats** and settles — a handful of redraws, not continuous animation |
| 4 | the other five two-frame cards: **`F4`** Around the ball · **`PL1`** Right-side overlap · **`P17`** Break or keep · **`P11`** Choose your battles · **`GF7`** When to juke | each shows two tabs; **the three A/B pairs (`P17`, `P11`, `GF7`) now show both sides** |
| 5 | open **`FM5v5`** | **five tabs — the widest tab row in the book**, and the only 5-frame figure (batch 2). Check the row does not overflow or clip at phone width. If it draws anything other than a tabbed board, see the warning in Group 5b |
| 6 | open any single-frame card | a plain board, **no tab row at all** |
| 7 | a long figure caption | it clears the tray at the bottom and **wraps** instead of running off the frame |
| 8 | turn **Reduce Motion** on, reopen a tabbed card | the finished picture, no playback — what the card did before |

### 6b — the keeper angle board. **Device: REAL PHONE. ~6 min.**

**Why a real phone, and it is not negotiable:** it is a **drag**, and drag feel and frame rate on
a device are the only things this look can settle. It is one of two draggable boards in the book.
A simulator runs on Mac silicon and will tell you it is smooth whatever the truth is.
**Source:** `ledger.md:1263-1300`. **Account:** any Playbook viewer (Lu).

**Setup — and this is now settled, not UNCONFIRMED: no published card reaches this panel.**
It needs a `playbook_cards` row with `content.kind = 'keeperangle'` (`CardScreen.tsx:223`), and
**batch 2 contains zero occurrences of `keeperangle`** — no keeper cards were inserted (§0.2).
So **6b is reachable only through the `__DEV__` harness**, whose keeper fixture is
`dev/testCards.ts`:

1. build a **dev client** (not a release build — the harness is `__DEV__ ? lazy(…) : null`,
   `AppNavigator.tsx:96`) and install it **on the phone**;
2. open `thryvyng://playbook-dev` and pick the keeper card.

**This tests the panel, not the content.** The panel ships in 1.0.20 either way — it is in the
bundle — but **no user can reach it until keeper cards exist**, so a defect found here is not a
1.0.20 blocker. Worth 6 minutes anyway: the metre-scale bug in step 5 was found by reading, not
by tapping, and nobody has yet dragged this board on real hardware.

| # | tap | expect |
|---|---|---|
| 1 | open the keeper card | the goal backdrop, a shooting triangle **ball → both posts**, the keeper placed on an arc (the "rope") on the triangle's bisector |
| 2 | the goal line under the keeper | **green** where the keeper reaches, **dashed white** where it is open |
| 3 | the three readouts | **ANGLE** · **GOAL COVERED** · **OPEN GOAL** with live numbers (the code strings are sentence case — `Angle`, `Goal covered`, `Open goal` — displayed uppercase by the style) |
| 4 | **drag the ball** slowly across the box | all of it keeps up — triangle, keeper, green/white line, numbers. **Judge the frame rate here; this is why it is a phone** |
| 5 | tap the **PK spot** preset | **the goal must NOT read 100% covered.** The first cut had the PK spot at 4.9 m instead of 11 m and read *"PK spot · GOAL COVERED 100%"* — the opposite of the one thing everyone knows about penalties. **The step that matters most on this board** |
| 6 | the other three presets: **Byline** · **Box corner** · **Wide angle** | each moves the ball and the numbers change sensibly |
| 7 | switch to **You be the keeper** | the keeper becomes draggable; **BEST SPOT** reads **✓** within 3% of the automatic spot, and a percentage otherwise |
| 8 | switch the app to Spanish | **Línea de fondo · Esquina del área · Ángulo abierto · Punto penal**, and **Sé tú el portero** |

**Minor drift to note, not a test step:** `ledger.md:1295` records the **Wide angle** preset as
`(8, 9)` metres; the code is `preset(8, 11)` (`KeeperAnglePanel.tsx:308`). The code is what
ships. Worth a one-line ledger correction some time.

---

## GROUP 7 — Staff drill-down, as the director

**Proves:** Team progress is four levels instead of one flat list, every level with a single
choice is **skipped**, the trail never drifts, and — since §0.1 — **this is now the only live
test of the shared gender rule.**
**Source:** `ledger.md:1652-1700`, the 4-login table `:1531-1535`, gender owed look `:1839-1846`.
**Device:** **real phone** — the readiness doc is explicit that *"nothing here has been seen by a
human on a real phone"* and that a **live login, not a fixture**, is the point.
**~12 min. Writes DB: no** — the roster RPC is a read.
**Account:** **director (`ludriv`)** for the full tree; then **coach (Cole Coachman)** for the
skip case.

| # | tap | expect |
|---|---|---|
| 1 | sign in as **director**, open the Playbook cover | a **YOUR TEAM** block with a **Team progress** row **and** a **Questions (n)** row |
| 2 | tap **Team progress** | the **home** level: the season line, **one tile per gender PRESENT** (**Boys** / **Girls** / **Coed**, in that order), and **Needs a nudge · whole club** |
| 3 | the search box | present only above **five** teams, placeholder **"Find a team, coach or age…"** |
| 4 | **the gender tiles** | **← this is the gender-rule check that replaces Group 8.** Tiles read **Boys** / **Girls** / **Coed**; a team with an odd or empty `gender` falls into the unnamed fourth bucket rather than vanishing |
| 5 | tap **Boys** | the **age-group grid** |
| 6 | tap an age group | **team cards** — coach, players, average, nudge count |
| 7 | tap a team | the **compact roster** |
| 8 | the trail, at every level | `Team progress › Boys › U12 › Team`, every crumb but the last pressable. **A level you SKIPPED must not appear as a crumb** |
| 9 | the season control | **"This season"** / **"Past seasons"** — and it appears **only** when the other season actually holds a team. It must **not** read "Season 2026": no read in this app can name a season |
| 10 | **Needs a nudge · whole club** | least-read first, each row labelled with its team, tapping through to the player detail |
| 11 | sign in as **coach (Cole Coachman)**, tap **Team progress** | **one team, so the roster opens directly** — no gender level, no age level, no team picker |
| 12 | as **manager**, if one is loginable | **Team progress** opens; the **Questions row must be ABSENT, not empty** (ruling R2 — *the one that matters most*). **UNCONFIRMED: `ledger.md:1535` says it is not known whether any manager account can log in. If none can, say so and this stays unverified** |
| 13 | as **parent (`+zztest7`)** | **neither row anywhere** — not on the cover, not on contents |

---

## GROUP 8 — Chat gender chips

**NOT TESTABLE. 0 min. Writes DB: no.**

**The screen is gone.** See §0.1: the club-wide audience picker that held the gender chips was
deleted in commit `c3924b4` ("drop dead audience picker"), and `ChatScreen.tsx:877` says so in
its own comment. `grep -n "gender" src/screens/ChatScreen.tsx` → **1 hit, that comment.**

**What to do instead:**
1. Run **Group 7 step 4** — the drill-down's gender tiles are the only surviving surface of the
   shared `src/utils/teamGender.ts` rule.
2. The ledger line asking for this (`:1839-1846`, item 1) is **stale** and wants closing. **That
   is a ledger edit and a ruling, not a test** — it is outside this task's SCOPE (which allows
   only the `PLAYBOOK-TENANT-SCOPE` entry), so it is reported here and left alone.

**One thing from that owed look did survive and has no home:** *"a team with an odd/empty
`gender` still shows `"U12 • "` with nothing after the bullet"* — that meta line was in the
deleted picker. **UNCONFIRMED whether any screen still renders it.** `ChatScreen.tsx:2586-2591`
is the line the ledger cites; the picker around it is gone.

---

## GROUP 9 — The 12 owed Playbook looks

**Source:** `release-1.0.20-readiness.md` §3, first bullet — *"Owed LOOK, Playbook,
agent-verified only: 12 items … all shipping to users at once in 1.0.20, because `PLAYBOOK_LIVE`
is already `true`."*
**Device:** **real phone** for every row — these are device looks by definition, and three of
them have only ever been seen against a `__DEV__` fixture.
**Writes DB: no, with two exceptions marked below.**
**~35 min for all 12.** Two are already covered above and are not re-counted.

| # | item | account | what to look at | min |
|---|---|---|---|---|
| 1 | **futsal backdrop** | Lu | **= Group 5b** — and read its `FM5v5` fork warning first | — |
| 2 | **staff rows on cover** | **coach**, then **manager** | both rows on the **cover** under `YOUR TEAM`, none on contents. **A real manager sees Team progress and NO Questions row** — ruling R2, the one that matters. **A live login, not the fixture** | 4 |
| 3 | **family messages on cover** | **parent** | a `Your messages` block — newest three plus a reply snippet — and a pink dot on an unseen reply. **Absent** for a reader who never sent one. The dot is `AsyncStorage` per device **by design** (`pbk.messages.seen.<uid>`, no column), so two devices disagreeing is a **stated cost, not a bug** | 4 |
| 4 | **coach question inbox** | **all four logins** | the 4-login table at `ledger.md:1531-1535` and **both push directions**. **No RPC in this track has ever run against prod from this app.** A reply must flip the thread to **Answered ✓** and fire both pushes. **← WRITES DB** | 8 |
| 5 | **question kind pills** | **parent** | three kind chips EN/ES at the chapter end, **Question** preselected; send one as **Suggestion** → the coach's phone reads *"New Playbook suggestion"*. **← WRITES DB.** Part of #4; its PARKED row at `ledger.md:635` is **stale and wants closing** | — |
| 6 | **staff drill-down** | **director** | **= Group 7** | — |
| 7 | **diagram tabs** | Lu | **= Group 6a.** Weigh it higher than the rest: **it is a bug fix** | — |
| 8 | **keeper angle** | Lu | **= Group 6b** | — |
| 9 | **section tone 5 (`ice`) + glove mark** | Lu | the fifth tone's colour **at 14pt** — is it legible, is the glove right | 2 |
| 10 | **section rail** | Lu | per-section tone and the inline mark. Agent-verified on simulator; **Lu's own device look is what is owed** | 2 |
| 11 | **type pass E** | Lu | the six typographic roles across the book, and ruling ACCENT-A | 3 |
| 12 | **thread stamp time** | **parent** + **coach** | an answered thread is stamped by the **latest reply's** age, not the question's — in **all three** places an answered age shows: the thread, the inbox list, family messages | 3 |
| 13 | **quiz score denominator** | Lu | scores print **`best 6 / 8`** from `settings.quiz.rules.perRun`. Check against a **real** `playbook_quiz_results` row. **Stated caveat: change `perRun` later and historical bests are re-labelled, because the old total was never stored.** **← WRITES DB if you take a quiz to make a row** | 3 |

**Also never looked at by anyone, ever — worth adding if there is time** (`ledger.md:267`): the
three reader panels, **Positions / Formation / Movement**. The Movement panel's **drag** and its
**frame rate on a device** are `UNKNOWN`, and it is the other draggable board. **Real phone,
~4 min.**

---

## 3. Totals and what is left unprovable

| group | device | writes DB | min | UNCONFIRMED |
|---|---|---|---|---|
| 1 Announcements A/B | simulator | yes (mark-read, reactions) | 15 | 1 (D7 `announcement: true`) |
| 1D the real send | simulator + 2nd phone | **yes, + ~231 pushes** | 10 | — |
| 2 Survey share | simulator | yes (2 rows) | 10 | 2 (a non-staff channel; a club survey must exist) |
| 3 Club-wide fix | simulator | no | 4 | 0 |
| 4 Cold-start push | simulator only | no | 12 | **0** — payload 1 is correct as-is (§0.3) |
| 5 Batch 2 content | simulator | no | 8 | **0** — but see the `FM5v5` fork in 5b; 5c untestable |
| 6 Keeper + tabs | 6a sim · **6b phone, dev client** | no | 12 | **0** — 6b is harness-only, settled |
| 7 Drill-down | **phone** | no | 12 | 2 (`ludriv` email; is a manager loginable) |
| 8 Gender chips | — | — | **0** | **the whole group — the screen is deleted** |
| 9 The 12 looks | **phone** | yes (#4, #5, #13) | 35 | 1 (same manager question) |
| **total** | | | **~118 min** | **6 + all of Group 8** |

**Cannot be proved by any tap in this plan, and should not be claimed:**

* **`announcement: true` end to end** — no sender writes the flag yet.
* **A real APNs round trip** — `simctl` injects locally.
* **The signed-out push tap** — still `reset()` to `Welcome`, destination lost.
* **The locked-composer notice** (*"Only club admins can post here"*) — **Lu's account is staff
  everywhere**, so it sees the normal composer by design and the notice cannot be reached from
  it. Needs a non-admin phone.
* **Android, anywhere in this plan.**
* **Whether a `formation` block for `FM5v5` exists in prod** — batch 2 wrote none and the recon
  says there is none, so the futsal frames should render; but the repo cannot see the table.
  **Group 5b step 1 settles it with one tap.**
* **The keeper board as a user would reach it** — no published card carries `keeperangle`, so 6b
  tests the panel through the `__DEV__` harness and nothing else.
