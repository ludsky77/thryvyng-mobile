# PAC Playbook on mobile — M4: the route, the launch switch, the three entry points

**What this is.** The record of the M4 build: how the reader is reached, what
holds it back until release, where the three doors are, how the lazy boundary
was PROVED on a running simulator, and what M5 needs. Written 2026-10-30
against this repo at the M4 working tree (M3 was `b72a658`).

**Read with:** `docs/recon/playbook-m3.md` § 3 (what M4 was handed),
`docs/ledger.md` (rule R-G, `PLAYBOOK-MOBILE-UNROUTED`,
`PLAYBOOK-HEADER-TITLE-TRUNCATES`, `PLAYBOOK-DEV-HARNESS`), and the web's
`src/features/pac-playbook/launch.ts` (the switch this one mirrors).

**`PLAYBOOK-MOBILE-UNROUTED` is CLOSED.** The reader is a real route, reachable
from three app surfaces, and the first real fetch against the live database has
happened — see § 5, `05-real-route-cover.png`.

---

## 1. The route

| Thing | Value |
|---|---|
| Route name | **`Playbook`** |
| Navigator | **`RootStackNavigator`** (`src/navigation/AppNavigator.tsx:856`), NOT a tab stack |
| Param | `card?: string` — the web's `?card=`, the only real route param |
| Component | `lazy(() => import('../features/pac-playbook/PlaybookScreen'))` (`AppNavigator.tsx:82`) through the existing `LazyScreen` + `Suspense` helper |
| Type | `Playbook: { card?: string } \| undefined` in `RootStackParamList` (`linking.ts:97`) |
| Deep-link path | `playbook` — **`__DEV__` ONLY** (`linking.ts:158`), the same fold-away pattern as `PlaybookDev` |

**Why the root stack and not `HomeStack`.** The three entry points sit in
different places and two of them belong to different roles. A `navigate()`
from any screen bubbles to the root navigator, so one registration serves all
three. Registering it per-stack would have meant three copies of the same
lazy boundary.

**The reader gets only `card`.** `offline` — the whole `PlaybookOffline` shape
the `__DEV__` harness injects — is NOT passed and cannot be reached from the
route. The real route hands the screen one string and nothing else; the
player id comes from `useAuth().currentRole` inside the shell (ruling R-4),
exactly as `playbook-m3.md` § 3 specified.

### The `__DEV__` deep-link path, and why it is not the release path

`thryvyng://playbook` and `thryvyng://playbook?card=F3` exist **in a dev bundle
only**. They are there because this machine cannot tap a simulator (§ 6), so
without them no agent could open the real route at all. They are NOT the
release mechanism: a production bundle has no URL into the reader, which keeps
the launch switch the single thing that decides whether the book is reachable.

**Proof that the dev path folds away:** the production export's content hash is
byte-for-byte the same with and without it —
`index-c68d0a13227626bfaec58c5b498380e1.hbc` both times.

**M5, if a real deep link is wanted:** gate it on `playbookVisible`, not on
`__DEV__`.

---

## 2. The launch switch

**`src/features/pac-playbook/launch.ts` — 35 lines, new, mobile-only.**

```ts
export const PLAYBOOK_LIVE = false;
export const playbookVisible = PLAYBOOK_LIVE || __DEV__;
```

It mirrors the web's file of the same name, with **one declared diff**:
`__DEV__` where the web reads `import.meta.env.DEV`. There is no other
difference, and the semantics are the web's line for line.

**It imports nothing, on purpose.** Three boot-path modules import it (the
navigator, the player dashboard, the course list), so it has to stay a leaf:
two constants, with no feature code behind them.

### Every gate site

`grep -rn "playbookVisible" src` — **12 hits, 5 of them live gates**:

| File | Line | What it gates |
|---|---|---|
| `src/features/pac-playbook/launch.ts` | 35 | the definition |
| `src/navigation/AppNavigator.tsx` | 856 | the `Playbook` `RootStack.Screen` |
| `src/components/dashboards/PlayerDashboard.tsx` | 412 | the dashboard card |
| `src/screens/CoursesScreen.tsx` | 205 | `showPlaybook`, which gates the tile, the banner count and the empty state |
| `src/screens/ClubHubScreen.tsx` | 42 | the Club Hub card |

The remaining 7 hits are import lines and prose.

### What mobile does NOT get, and it matters

Vite replaces `import.meta.env.DEV` with `false` in a web production build, so
the web's gates fold to constants and **the gated markup is dropped from the
bundle**. Metro folds `__DEV__` too, but it does **not** fold an imported
constant across module boundaries, so `playbookVisible` is a **runtime
`false`** here and the gated code is **skipped at runtime, not removed**.

Nothing of the Playbook is REACHABLE in a store build. The difference is bundle
weight, not visibility.

---

## 3. The three entry points

The Oct 28–29 placement rulings: **players and parents enter from the dashboard
and from Courses; coaches and directors from Club Hub.** All three follow the
surrounding screen's own card style — no new design, no new component file.

| # | Who | File | Where | Lines added |
|---|---|---|---|---|
| 1 | player / parent | `src/components/dashboards/PlayerDashboard.tsx` | a `📖 PAC PLAYBOOK` section between `YOUR PROGRESS` and `📚 MY COURSES` — the web's own order (`web PlayerDashboard.tsx:436-452`, between the lineup widget and My Courses) | **+51** (19 markup, 28 styles, 1 import, 3 comment) |
| 2 | player / parent | `src/screens/CoursesScreen.tsx` | a tile in the list header, under the filter pills and above the course grid | **+65 / −2** |
| 3 | coach / director | `src/screens/ClubHubScreen.tsx` | one more card in the `cards` array, between `training` and the conditional `surveys` | **+18** |

Total across the four edited files: **+177 / −3**, against the recon's
estimate of +18. The gap is styles (the recon counted markup only), the launch
switch's gates, and the comments this room writes.

### 1 · The dashboard card
Dark card on `#2a2a4e` — the same box as `progressCard` and `courseCard` —
with a 3pt violet left edge so it reads as the book and not as a course.
Title **PAC Playbook**, the web's own description line *"How we see the game,
how we play it and how we think"*, and a chevron.
`onPress: () => navigation.navigate('Playbook')`.
**Look: `m4-looks/01-entry-dashboard-card.png`.**

### 2 · The Courses tile
The web builds this tile **by hand** rather than fetching it, because it is not
a course row, and it makes the tile answer the filters the way a course would
(`web CourseCatalog.tsx:172-186`). Mobile does the same with the filters mobile
has: **it shows under `All Courses` and a category selection hides it**, exactly
as that selection hides a course outside the chosen category. Mobile has no
price filter, so the free/paid half of the web's rule has nothing to mirror;
the tile carries a green **Free**.

Two consequences were mirrored rather than left to drift:
* the banner's course count **includes the tile** (`filteredCourses.length +
  (showPlaybook ? 1 : 0)`), the web's `CourseCatalog.tsx:341` rule;
* the "No courses found" screen is suppressed while the tile is on screen
  (`&& !showPlaybook`), the web's `:326` guard — otherwise an empty catalog
  would say "no courses" over a list that has a row in it.

**Look: `m4-looks/02-entry-courses-tile.png`** — banner reads **3 Courses**
(2 real + the tile), tile above the grid.

### 3 · The Club Hub card
`{ id: 'playbook', icon: 'book-outline', accentColor: '#8b5cf6', title: 'PAC
Playbook', subtitle: 'How we see the game, how we play it and how we think' }`
— the array's own typed shape, nothing new.
**Look: `m4-looks/03-entry-clubhub-card.png`.**

---

## 4. R-G — the header, and `PLAYBOOK-HEADER-TITLE-TRUNCATES` CLOSED

**The defect.** M3's looks caught the header reading **"PAC Pl…"** on every
screen that has a back label (`m3-looks/05-card.png`, `10`, `13`, `16`).

**The arithmetic.** The web's header is ONE row and five things share it: a
back button capped at 132pt, the title cell, search, home and the EN/ES
control. At 375pt — R-G's narrowest supported width — that is 351pt of content
box, 32pt of gaps, ~132pt of back button, ~60pt of icon buttons and ~80pt of
language control, leaving the title cell **~47pt**. `PAC Playbook` needs about
**118pt** at 18pt extrabold. The title had nowhere to go.

**Why no shortening was available.** R-G's remedies are "shortened, wrapped
deliberately, or given `numberOfLines` with a layout that cannot clip". Every
candidate for shortening is already as short as it reads: the title is the
book's name, the back label is usually a chapter name, the language control is
two letters. `adjustsFontSizeToFit` would have to scale 18pt down past 7pt to
fit 47pt — not a layout, a hiding place.

**The fix — the row is wrapped deliberately.** When a back label is present the
header becomes two rows:

* **row one, the chrome, in the web's own order** — back left, then search,
  home and EN/ES right, held apart by a flex spacer where the title used to be;
* **row two, the title block at the full column width** — title and subtitle
  both whole, with room over.

With **no** back label there is no squeeze (crest 32pt + title + control fits
at 375pt), so that header is the web's single row, untouched. That is the cover
and nothing else.

**Nothing is cut, nothing moved sides, nothing shrank.** The cost is the
header's height on five of the six screens.
**Look: `m4-looks/04-rg-header-card.png`** — `‹ Foundations` · search · home ·
EN/ES on row one, **PAC Playbook / Foundations** on row two, both complete.
Compare `m3-looks/05-card.png`.

**This is a MOBILE-ONLY divergence from the web, and the web still truncates.**
The ledger's note said "WEB-FIRST if it changes"; R-G is a mobile standing rule
and the fix is a mobile layout answer, so mobile moved first.
**RECOMMENDATION for the planning room, not taken here:** the web has the same
two-row option and the same 393pt problem. One ruling would keep the two
headers one design.

---

## 5. Proof

### Static

| Gate | Result |
|---|---|
| `npx tsc --noEmit -p tsconfig.json` | **5 errors = baseline**, all five pre-existing in `src/components/games/`; **0 in any touched file** |
| `ESLINT_USE_FLAT_CONFIG=false npx eslint <7 touched files>` | **0 errors**, 71 warnings (pre-existing `no-explicit-any`, `no-console`, `no-inline-styles` in the host files) |
| `npx expo export --platform ios` | **exit 0**, 1 bundle, **0 split bundles** |

### The production bundle

`index-c68d0a13227626bfaec58c5b498380e1.hbc` (9.3 MB) — **M3's was
`90794d1bbeaea43b1a1b75a71d506e6e`**. The hash MOVED, which is expected and
required: `AppNavigator.tsx` and `linking.ts` are themselves modules in the
graph, and the route now pulls the reader into it.

```
playbook-dev 0 · offline-pac-playbook 0 · "The simple game" 0 · "Move as one" 0
PlaybookScreen 1 · pac-playbook 1 · CoverScreen 1 · MovementPanel 1
pbkd-chalk 1 · playbook_books 1 · PAC Playbook 1 · join-team 1 (control)
```

**Read this carefully.** The reader IS in the production bundle now; the
**harness and its 352 KB frozen data file are NOT** (`playbook-dev 0`,
`offline-pac-playbook 0`, and neither of two strings that exist only in the dev
fixture). The `__DEV__` gates still fold exactly as M2 and M3 proved.

**The M1 UNKNOWN is now MEASURED.** The ledger asked whether `lazy()` on the
Playbook screen yields a second file or Hermes inlines it. **Answer: Metro
emits no second file.** `npx expo export` produces one bundle and zero split
bundles; the reader's modules live in it and are *evaluated* lazily, not
*downloaded* lazily. Lazy on React Native buys evaluation time and memory, not
bundle weight.

### The lazy boundary — PROVED on the simulator

iPhone 17 Pro / iOS 26.2, Metro on `:8081`, a temporary module-scope line at
the top of `PlaybookScreen.tsx` printing `PLAYBOOK-MODULE-EVAL`.

**At boot — the line is ABSENT.** Cold launch, bundle served, land on the
dashboard:

```
iOS Bundled 73ms index.ts (1 module)
 WARN  [expo-av]: Expo AV has been deprecated …
 LOG  Sentry disabled in development mode
 WARN  🟡 expo-notifications: obtaining a push token may not work on iOS simulators …
 LOG  [Notifications] Must use physical device for push notifications
 LOG  [realtimeHub] hub:comm_messages SUBSCRIBED undefined
```

`grep -c "PLAYBOOK-MODULE-EVAL"` over the whole Metro session to that point:
**0**.

**On opening the Playbook — the line appears, and so does the feature's whole
module graph:**

```
iOS src/features/pac-playbook/PlaybookScreen.tsx ░░░░░  0.0% (0/1)
iOS Bundled 501ms src/features/pac-playbook/PlaybookScreen.tsx (1194 modules)
 LOG  2026-10-31T02:29:56.370Z PLAYBOOK-MODULE-EVAL
```

**1194 modules** were requested, bundled and evaluated only at that moment.
That is the lazy boundary doing its job, and it is a stronger result than the
grep: in dev, Metro does not even send the reader until it is navigated to.

**The temporary line was removed.** `git diff --stat` afterwards does not list
`src/features/pac-playbook/PlaybookScreen.tsx` at all — the file is back at its
committed state.

**One honest gap: the navigation was a deep link, not a tap on the dashboard
card.** See § 6. The card's target is `navigation.navigate('Playbook')`, the
same route the deep link resolves to, so the boundary is proved; the *card's
own press* is Lu's M5 look.

### App-open timing — no regression

Four cold launches, `date +%s%N` around `xcrun simctl launch`, stopping at the
app's own last boot log line (`[realtimeHub] hub:comm_messages SUBSCRIBED`).
BEFORE = this repo at M3 (`git checkout` of the six tracked files and
`launch.ts` moved aside), AFTER = the M4 tree. Same Metro, same session, same
simulator.

| Run | time-to-dashboard |
|---|---|
| BEFORE-1 | **2773 ms** (includes Metro re-bundling the reverted tree) |
| BEFORE-2 | **2346 ms** |
| AFTER-1 | **2357 ms** |
| AFTER-2 | **2350 ms** |

**AFTER is 4–11 ms off BEFORE-2 — inside the ±1 s tolerance and then some.**
No `+2 s`, nothing to stop for. That is what the lazy boundary is worth: the
whole reader is registered and nothing of it runs at boot.

### The first real fetch

**`m4-looks/05-real-route-cover.png`** — the real route, opened by a signed-in
PARENT, against the LIVE database. The cover renders the club crest, the real
book (`EDITION 1 · 2026–27`), the real title, subtitle, "HOW TO USE IT" and
chapter list. **`m4-looks/04-rg-header-card.png`** is card `F3` — *The field
map*, "Foundations · Card 4 of 6", the parent note, and a real diagram board
from `playbook_blocks`.

So the nine reads in `rpc.ts` — `fetchBook`, `fetchClubCrest`, `fetchChapters`,
`fetchCards`, `fetchBlocks`, `fetchProgress`, `fetchQuizResult`,
`fetchViewerKind`, `fetchMyQuestions` — **work against prod**, which
`playbook-m3.md` § 2 left as M4's to find out. No shell-level database access
was made: every read was the app's own, through its own authenticated client.

---

## 6. The tap blocker — unchanged from M3, and now measured

**There is still no way to tap, swipe or type on this simulator from a shell.**
`xcrun simctl` has no tap verb; `idb` and `cliclick` are not installed; and
`osascript` is **refused assistive access** —

```
osascript -e 'tell application "System Events" to tell process "Simulator" …'
→ execution error: osascript is not allowed assistive access. (-1719)
```

Granting that is a System Settings change and Lu's, not this room's.

**What M4 did instead**, all of it temporary and all of it removed before the
session ended:

| Scaffold | Where | Removed |
|---|---|---|
| `console.log(… PLAYBOOK-MODULE-EVAL)` | top of `PlaybookScreen.tsx` | yes — the file is not in `git diff --stat` |
| `CoursesShot` / `ClubHubShot` root routes + `__DEV__` paths | `AppNavigator.tsx`, `linking.ts` | yes — `grep -rn "TEMP-M4-SHOT\|CoursesShot\|ClubHubShot" src` returns nothing |
| `contentOffset={{x:0,y:700}}` on the dashboard scroller | `PlayerDashboard.tsx` | yes — same grep |

**What that means for each look:**

* **Dashboard card** — a true screenshot of the real dashboard, scrolled down
  by the temporary offset. Nothing about the card was moved or restyled.
* **Courses tile** — the real `CoursesScreen`, reached by a temporary root
  route instead of by the dashboard's Courses button. What is on screen is
  what a tap would have shown.
* **Club Hub card** — the real `ClubHubScreen`, reached the same way.
  **NOT-SEEN-ROLE:** the simulator is signed in as a **parent** (Laila Sanchez,
  PAC Girls U17), so the real path — a coach's or director's dashboard → Club
  Hub — was not walked. Reaching it directly also leaves `teamId`/`clubId`
  undefined, which is why `Survey Results` is absent from the shot; the
  Playbook card does not depend on either. **Roles needed for the real path:**
  `head_coach`, `assistant_coach`, `team_manager` (team Club Hub) or
  `club_admin` (club Club Hub).

---

## 7. The harness — KEPT

`dev/PlaybookDevHarness.tsx`, `dev/fixtures.ts`, `dev/offlineBook.ts`,
`dev/pac-playbook-v2-FINAL-data.json` and `thryvyng://playbook-dev` are
**untouched and still `__DEV__`-only**, behind all three of M2's gates. Nothing
of them is in the production bundle (`playbook-dev 0`).

**They are kept for one milestone only.** The reason M3 gave for deleting them
— `fixtures.ts` and the frozen JSON become a second source of truth the moment
the reader fetches the real thing — **is now live**: § 5 shows the real board
rendering from `playbook_blocks`. They survive this commit because M5 is Lu's
first hands-on look and an offline fallback is worth having while the real
reads are still new.

**Ledger note recorded: delete `src/features/pac-playbook/dev/` in the
`PLAYBOOK_LIVE` flip commit.**

---

## 8. What M5 needs

1. **The flip is one line.** `PLAYBOOK_LIVE = false → true` in
   `src/features/pac-playbook/launch.ts`. Nothing else moves. In the same
   commit: delete `src/features/pac-playbook/dev/` and the `__DEV__` linking
   path for `Playbook`, or convert the path to a `playbookVisible` gate.
2. **Four things are Lu's to look at with a finger**, none of them reachable
   from this room: the dashboard card's press, the Courses tile's press, the
   Club Hub card on a coach or director account, and the reader's own taps
   (the EN/ES toggle, a `pos-*` dot, the movement panel's drag).
3. **`PLAYBOOK-MOBILE-CTA-NOT-STICKY`** is still open and is a Lu-eye question.
4. **`PLAYBOOK-CHALK-EDGE-UNSUPPORTED`** and **`PLAYBOOK-STATIC-BEATS-ALL-ON`**
   are unchanged and still need rulings; both are web-first.
5. **The four `TODO(M-later)` write points are untouched** — `got it`, quiz
   start, quiz submit and send-a-question still show their "not connected yet"
   sentences. They were explicitly out of M4's scope.
6. **The two-row header is a mobile-only divergence** (§ 4). It wants a web
   ruling.

### Not verified here

* **No tap, swipe, drag or keystroke** happened in this session. Everything was
  deep links and screenshots.
* **The Club Hub placement was not seen from a coach or director account.**
* **The write paths were not exercised** — still none of them wired.
* **The movement panel's frame rate on a device** remains UNKNOWN (M3's note).
* **Bundle size was not compared**, per the ledger's own instruction; the
  content hash was, and it moved as required.
