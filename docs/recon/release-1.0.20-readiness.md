# Release 1.0.20 readiness — what is owed before the store build

**Date:** 2026-11-03 · **Mode:** read-only sweep of `docs/ledger.md` (1,911 lines), `app.json`,
`eas.json` and `src/constants/playbookLaunch.ts`. No DB query, no app run, no EAS command.
**Repo:** `thryvyng-mobile` @ `3965e15` + the uncommitted futsal mirror of this session.
**Written for:** the planning room, to decide what gates 1.0.20 and what rides along.

**Tags:** PROVEN = read in a file with a line cite · INFERRED = reasoned, not run ·
UNKNOWN = needs the named check.

---

## 0. Read this first — three framing facts

1. **THE LEDGER CARRIES NO RELEASE MARKER AT ALL.** `grep -n "1\.0\.20\|before store\|pre-store"`
   over `docs/ledger.md` returns **zero hits** (PROVEN). There is no existing "gates 1.0.20" list
   to copy out. **Every row below is therefore derived from a STATUS marker** — `DEVICE LOOK
   PENDING`, `SIMULATOR LOOK OWED`, `AGENT-ONLY`, `UNVERIFIED`, `OPEN`, `PARKED` — and every
   "what is still needed" cell is **this file's reading, INFERRED, not a ruling Lu has made.**
   Nothing here has been approved as a release gate, and the table is deliberately NOT ordered
   by priority.
2. **VERSION AND BUILD NUMBERS.** `app.json` → `expo.version` = **`1.0.19`** (PROVEN,
   `app.json:5`). So 1.0.20 is the next version and **the version string has not been bumped yet.**
   `expo.ios.buildNumber` and `expo.android.versionCode` are **absent from `app.json`** (PROVEN) —
   `eas.json` sets `cli.appVersionSource = "remote"` with `build.production.autoIncrement = true`
   (PROVEN, `eas.json:4,10-12`), so **the build numbers live on EAS's servers, not in this repo,
   and cannot be read from here.** Reading them means `eas build:version:get`, which this session
   was forbidden to run. iOS submit target is `ascAppId 6759332399`.
3. **THE PLAYBOOK IS ALREADY LIVE TO EVERY USER.** `PLAYBOOK_LIVE = true`
   (PROVEN, `src/constants/playbookLaunch.ts:57`), flipped 2026-11-01 and VERIFIED-DEVICE.
   So 1.0.20 is the build that puts **all of the Nov 1–3 Playbook work in users' hands at once**,
   and the kill switch is one line back to `false`. This is why the look-pending column below is
   long: a large body of agent-verified UI has never been seen by a human on a phone.

---

## 1. Summary table

Status is the **test record**, never a claim the feature is good (the ledger's own rule).

| id | one line | status | evidence (ledger) | what is still needed |
|---|---|---|---|---|
| **PLAYBOOK-FUTSAL-BACKDROP** | 40x20 m futsal court in the mirrored renderer, so FM5v5 draws | `BUILT-UNCOMMITTED` · simulator look owed | `ledger.md:1855` (this session) | Lu commits; **simulator look** (Nov 3 look batch): open an FM5v5 figure, court inside the board, players on it, goals + 6/10 m marks right |
| **STAFF-ROWS-ON-COVER** | "Team progress" + "Questions (n)" moved from the bottom of contents to the cover under `YOUR TEAM` | `AGENT-ONLY` · **DEVICE LOOK PENDING** · seen on simulator with `__DEV__` fixture only | `ledger.md:1553` (entry), `:1560` (item 1) | **Live-login look, not a fixture:** a real coach sees both rows on the cover and none on contents; **a real team MANAGER sees Team progress and NO Questions row** (ruling R2 — the one that matters most). No RPC in this track has ever run against prod from the app |
| **FAMILY-MESSAGES-ON-COVER** | `Your messages` block — newest three + reply snippet, pink dot on an unseen reply, `See all messages` screen | `AGENT-ONLY` · **DEVICE LOOK PENDING** · fixture only | `ledger.md:1553` (entry), `:1569` (item 2) | Real family's cover shows their own messages; the block is **absent** for a reader who never sent one; **the dot is `AsyncStorage` per device by design** (`pbk.messages.seen.<uid>`, no column) — so the two-device case needs a look and is a stated cost, not a bug |
| **coach question inbox** (PLAYBOOK-COACH-TRACK-MOBILE) | team progress, Open/Answered inbox, thread + reply, two push taps | `AGENT-ONLY` · **DEVICE LOOK PENDING** · **no RPC in this track has ever been called against prod from this app** | `ledger.md:1426`; live test plan `:1528-1535`, push taps `:1537-1540` | The 4-login live test already written in the ledger (Cole Coachman / +zztest7 / ludriv / a manager), **both push directions**, and a reply flipping status + firing both pushes. Also settles two open server questions (view-only director replying; invited-not-joined staff) |
| **QUESTION-KIND** | `kind` on `playbook_questions` — Question / Comment / Suggestion pills | **SHIPPED, and the ledger's own PARKED row is now STALE** | PARKED row `ledger.md:635`; delivery `:1476-1479` | **A ledger correction, not a build.** It was parked "ships WITH the future coach question-inbox step"; that step landed Nov 2 — three kind chips EN/ES, the five-arg `playbook_send_question`, the CHECK constraint's own values, column in prod migration `20261102033000`. Needs: close the PARKED row, and verify the pills on a live send (part of the test above) |
| **PLAYBOOK-STAFF-DRILLDOWN** | Team progress became four levels (home → gender → age → teams → roster) | `AGENT-ONLY` · **DEVICE LOOK PENDING** — "nothing here has been seen by a human on a real phone" | `ledger.md:1652` | Device look at all four levels + the This season / Past seasons split |
| **PLAYBOOK-DIAGRAM-TABS** | tab row for multi-frame figures — fixes 6 of 38 diagrams drawing only frame 2 | `AGENT-ONLY` · DEVICE LOOK PENDING | `ledger.md:1209` | Device look. **This one is a BUG FIX, not polish** — weigh it higher |
| **PLAYBOOK-KEEPER-ANGLE** | interactive keeper-angle board, drag the ball | `AGENT-ONLY` · DEVICE LOOK PENDING | `ledger.md:1262` | Device look + **drag feel and frame rate on a real phone** (the only draggable board besides Movement) |
| **PLAYBOOK-SECTION-TONE-5** | fifth section tone (`ice`) + glove mark | `AGENT-ONLY` · DEVICE LOOK PENDING | `ledger.md:1376` | Device look (colour at 14pt) |
| **PLAYBOOK-SECTION-RAIL** | per-section tone + inline mark | agent-verified on simulator · **LU'S DEVICE LOOK PENDING** | `ledger.md:1111` | Lu's device look |
| **PLAYBOOK-TYPE-PASS-E** | six typographic roles in one tokens file, applied book-wide + ruling ACCENT-A | `AGENT-VERIFIED` · DEVICE LOOK PENDING | `ledger.md:988` | Device look at the type scale |
| **THREAD-STAMP-TIME** | an answered thread is stamped by the latest REPLY's age, not the question's | `AGENT-ONLY` · DEVICE LOOK PENDING | `ledger.md:1553` (item 3) | Look in the 3 places an answered age shows (thread, inbox list, family messages) |
| **QUIZ-SCORE-DENOM** | scores print `best 6 / 8` from `settings.quiz.rules.perRun` | `AGENT-ONLY` · DEVICE LOOK PENDING | `ledger.md:1553` (item 4) | Check against a real `playbook_quiz_results` row. **Stated caveat:** change `perRun` later and historical bests are re-labelled, because the old total was never stored |
| **one gender rule / one season rule** (P-10 FOUND 2) | `teamGender.ts` + exported `getTeamBucket`; two duplicate rule bodies deleted | `AGENT-ONLY` · **owed look**, equivalence PROVEN over 20 inputs, 0 mismatches | `ledger.md:1769`, owed look `:1839-1846` | (1) chat list's club-wide picker gender chips still filter, odd/empty gender still reads `"U12 • "`; (2) drill-down tiles + season split match the Nov 2 screenshots. **Refactor touching a NON-Playbook screen (`ChatScreen`) — the one item here that can break something outside the book** |
| **PLAYBOOK-PANELS-UNVERIFIED** | Positions / Formation / Movement panels | **OPEN · no test record of ANY kind** — never looked at by Lu, never reached by an agent round | `ledger.md:267` | First look of any kind. Movement panel's **drag** and **frame rate on a device** are UNKNOWN |
| **PLAYBOOK-COVER-ART-SHAPE** | cover sketch whole + centred (option A), ~189x75pt | **OPEN**, option A in place, Lu's call pending | `ledger.md:275` | "Lu sees it on his phone before this is settled either way" — his own condition |
| **PLAYBOOK-MOBILE-CTA-NOT-STICKY** | reader footer scrolls instead of sticking | **OPEN** (RN has no `position:sticky`) | `ledger.md:406` | A decision, not a fix: closing it changes every screen's shape. Ledger says the look is the right place to decide |
| **PLAYBOOK-STATIC-BEATS-ALL-ON** | every beat cell lit on a static board | **OPEN**, honest but carries no information | `ledger.md:414` | **WEB-FIRST question** — web has the same hold branch. Not a mobile gate |
| **PLAYBOOK-CHALK-EDGE-UNSUPPORTED** | doodle chalk edge cannot render — `react-native-svg@15.12.1` stubs the two filters | **OPEN**, library limit, 4 options, none taken | `ledger.md:391` | Lu's ruling. Options 2 and 3 are **WEB-FIRST**. Cosmetic; marks draw as plain strokes |
| **PLAYBOOK-HEADER-TWO-ROW-MOBILE-ONLY** | mobile header is 2 rows, web still truncates to `PAC Pl…` | **OPEN**, NEEDS LU, 2 options | `ledger.md:369` | A ruling (carry to web, or declare the divergence in MIRROR.md). Mobile is already correct — **not a mobile gate** |
| **PLAYBOOK-TENANT-SCOPE** | the book is visible and openable to **EVERY tenant's users** | **OPEN · SACRED** (visibility gate), Lu ruled it a real fork | `ledger.md:642` | Gate visibility on viewer club vs `owner_club_id`. **Required before any SECOND tenant goes live, not before 1.0.20** — only PAC is live today, so nothing is exposed in practice. The day a second club has users, it is a leak |
| **PLAYBOOK-DEV-HARNESS** | the `__DEV__` harness + 352 KB frozen JSON under `src/features/pac-playbook/dev/` | **instruction UNMET in wording, superseded in practice** | ruling `ledger.md:440`; supersession `:748-750` | **A wording conflict to settle, not a blocker.** `:440` says "DELETE `dev/` IN THE `PLAYBOOK_LIVE` FLIP COMMIT"; the flip session instead recorded it as "not touched, on purpose", a separate `__DEV__`-gated harness, and Nov 2 **added** `dev/coachFixtures.ts` to it. It ships in no bundle (0 hits for `playbook-dev`, `PLAYBOOK-DEV-COACHFIX`, `DEV_ROSTER`, PROVEN by bundle search) so **not a release risk** — but `dev/fixtures.ts` is a second source of truth for content the app now fetches live |
| **GAMES-TSC-CRASH** | `getGutterBoundaryX` missing, `DribbleRushGame.tsx:712-713` | **OPEN · UNKNOWN if reachable in prod** | `ledger.md:661` | **The repo does not typecheck clean:** `npx tsc --noEmit` = **5 errors, all in `src/components/games/*`** (2x `getGutterBoundaryX` not found · `getEffectiveLanding` used before declaration, `AnticipationArenaGame.tsx:283` · a handler type mismatch, `PatternPlayGame.tsx:427`). Every Playbook entry since Nov 1 reports "5 = baseline". **Needs: a ruling on whether a store build may ship with a known-broken game, and whether `dribble-rush` is reachable** |
| **mobile brain games do not save** | `useGameSession.recordSession` inserts into `game_sessions`, which is now the soccer live-stats table | **INFERRED, strong evidence; never run** | `docs/recon/arcade.md` §0.1 (uncommitted) | One played level on a device → look for the "save failed" alert. If true, **progress, daily time and XP are silently never written on mobile** — a user-visible defect shipping in 1.0.20 unless the games are hidden (`is_active=false`, a live data write = SACRED) |
| **calendar window +6 → +13 months** | `CalendarScreen.tsx:111`, so a 12-month RECUR-MAX series is not half-cut | `UNVERIFIED-DEVICE` · carried through the Nov 1 test | `ledger.md:595` item 5; carried `:627`, `:753` | Load a 13-month range on a device. Watch item **CAL-PAYLOAD-14MO** beside it: 14-month window, **no pagination** |
| **staff-refusal look (P0041/P0046)** | the refusal copy a non-family staff member gets from a Playbook write | `UNVERIFIED` · carried from the Nov 1 device test twice | `ledger.md:627`, `:753` | Sign in as `ludriv`, trigger P0041/P0046, read the message |
| **Event detail redesign (F1 · H1, rounds 1–4)** | one card renderer, `RsvpPill`, `ResponsesBar`, the three-population count fix | `AGENT-ONLY` · *pending — not committed* · **owed device checks (round-3 list of 7 + round-2 leftovers)** | `ledger.md:47` | The 7-item round-3 device list. **Plus the still-open blocker:** the calendar **list card's "?" count is still the old row tally and is still WRONG on device**; the fix needs a widened `players` read Lu approved but which stopped on an RLS question (does a parent see a different roster total than staff?) that cannot be answered without DB access |
| **COURSES-REDESIGN** | Courses screen parked, mockup first | **OPEN · PARKED** | `ledger.md:284` | Parked by Lu. **But one item inside it is a live visible bug:** the Courses header row is drawn at y 0–64 **behind the notch** (no top safe-area padding) — the old hero's `paddingTop: 56` used to hide it. One-line fix, but it moves every row on the screen |
| **Unified chat builder** | merge Staff Message into Group Message | **Planned**, "after 1.0.18" (Lu, Oct 14) | `ledger.md:122-127` | Needs data recon first. **Reads as scheduled-but-not-started — worth confirming it is not expected in 1.0.20** |

---

## 2. What this file does NOT tell you

- **No build-number truth.** See §0.2 — they are remote and unreadable from the repo.
- **No "is it good" judgement.** Every row's status is a test record only.
- **No ruling.** Which of these actually gates 1.0.20 is INFERRED by this sweep; Lu's scope doc
  and his verification own the milestone words.
- **One uncommitted file this session did not touch:** `docs/recon/arcade.md` was already
  modified in the working tree at session start (`git status` snapshot) and is cited, not edited.

## 3. The shortest honest read

- **Owed LOOK, Playbook, agent-verified only:** 12 items (futsal, both cover items, the coach
  track, drill-down, diagram tabs, keeper angle, section tone 5, section rail, type pass E,
  thread stamp, quiz denominator) — **all shipping to users at once in 1.0.20**, because
  `PLAYBOOK_LIVE` is already `true`.
- **Owed LOOK, outside the Playbook:** the event-detail redesign (7 checks, uncommitted), the
  gender/season refactor's chat-screen side, the calendar +13 window, the staff-refusal copy.
- **Never looked at by anyone, ever:** the three reader panels (`ledger.md:267`).
- **Live defects that would ship:** the 5 games typecheck errors (one of them a missing function
  in a game's hot path), the games' silent save failure (INFERRED), the calendar list card's
  wrong "?" count, the Courses header under the notch.
- **SACRED, and NOT a 1.0.20 gate:** PLAYBOOK-TENANT-SCOPE — required before a second tenant,
  harmless while PAC is the only live club.
- **One ledger correction owed:** QUESTION-KIND is shipped; its PARKED row at `:635` is stale.
