# PAC Playbook on mobile — M5 look fixes: cover art, tabs + back, the Courses window

**What this is.** The record of three look fixes from Lu's phone test of the
reader at `e791e79` (M4). Written 2026-10-30 against the M5-fix working tree.
All three were ruled before the build; none of them is a new design decision
this room made.

**Read with:** `docs/recon/playbook-m4.md` (the route and the three entry
points this changes), `docs/ledger.md` (rule R-G, the M4 row),
`src/features/pac-playbook/MIRROR.md` (what must not be edited).

**Nothing mirrored moved.** `git diff --stat` lists six files and none of them
is in the MIRROR manifest's ten. In particular `doodleArt.ts` — which owns the
doodle plan the cover fix is about — was **not** touched; see § 1.

---

## 1. The cover's sketch block — half the height, one sketch instead of three

**What Lu saw.** The chalk block above `PAC Playbook` pushed the title and the
whole "How to use it" list off the first screen. Compare
`m4-looks/05-real-route-cover.png`.

**What was actually up there — three sketches, from two different sources.**

| # | What | Where it comes from |
|---|---|---|
| 1 | a goal mouth with three closing on one | `STRIPS.press` — Lu's "box" |
| 2 | a corner arc with its flag | `STRIPS.corner` — Lu's "flag/corner" |
| 3 | the attack sketch with the goal at the bottom | `CoverArt()` in `CoverScreen.tsx` |

1 and 2 are the **top doodle band**: `ZONES.cover = { top: 2 }` and the seed
`cover:cover` draws exactly that pair out of the pool. Verified by running
`doodleArt.ts`'s own `hash` / `pickFrom` over the seed — `press`, then
`corner` accented. 3 is the cover screen's own art.

### The band — dropped at the cover, not in the art

`doodleArt.ts` is **MIRRORED, byte-identical to web `c772111`**, so `ZONES`
was not edited. The change is one line in `PlaybookScreen.tsx`, where the plan
is consumed:

```ts
const plan = doodlePlan(doodle, pageKey);
const sketches = doodle === 'cover' ? { ...plan, top: [] } : plan;
```

The cover is handed its two marks exactly as before and simply does not draw
them. **Every other screen is untouched** — `m5-looks/02-card-F3-tabbar.png`
still carries its top band.

### The art — half height, and NOT cropped

`CoverScreen.tsx` is a **rebuild, not a mirror** (MIRROR.md, "Not mirrored"),
so the art could be edited here. It was not cut: `height` went `150 → 75` and
the viewBox from `0 0 340 150` to **`6 12 328 130`**, the ink's real bounding
box plus a 4-unit margin. `preserveAspectRatio` is left at its default, so the
whole sketch — players, crosses, both arrows, the long run and the goal —
scales down inside the shorter box. **Not one coordinate moved.**

**Why it is centred and not full-bleed, with the arithmetic.** The prompt
offered a viewBox / clip on the lower region. That is the only way to keep the
art at full column width, and it costs content:

* the column is ~343pt wide and the art's box is 328 x 130 units, so at full
  width one unit is ~1.05pt — the art already fills its box;
* a full-width strip 75pt tall can therefore show only ~72 of the 130 units;
* the attack lives in y 16…124 and the goal in y 112…140. Any 72-unit window
  that keeps the goal cuts the players: a crop at y≥56 drops the centre
  circle and both top arrowheads and slices two curves mid-stroke; a crop at
  y≥80 drops every circle and leaves the goal alone.

Scaling keeps the drawing whole; cropping keeps it wide. Lu's ruling named the
drawing ("the attack sketch with the goal at the bottom"), so the drawing was
kept. Drawn size is now ~189 x 75pt, centred.

**RECOMMEND, not taken:** if Lu would rather have a full-width band than the
whole sketch, `preserveAspectRatio="xMidYMax slice"` at `height={70}` gives
exactly that in one attribute — the goal, the run and both crosses at full
scale, no players. One word from the planning room either way.

---

## 2. Tabs and back — the route moved into the Home tab's stack

**Ruling:** Lu, Oct 27, "back/home at every point."

**The defect.** `Playbook` was a **root-stack** screen
(`AppNavigator.tsx:856` at M4). A root screen is drawn over the tab navigator,
so the reader had no Home / Chat / Calendar / Profile bar, and the cover — the
one screen with no in-book back — had no way out at all.

### Where it moved

| | M4 | now |
|---|---|---|
| Navigator | `RootStackNavigator` | **`HomeStack`**, immediately after `Courses` (`AppNavigator.tsx:348`) |
| Component | `lazy(() => import('../features/pac-playbook/PlaybookScreen'))` | **unchanged**, same module-level `lazy()` through `LazyScreen` + `Suspense` |
| Param | `card` | `card`, plus `onExit` handed down by the route |
| Dev deep link | `Playbook: 'playbook'` at `config.screens` root | **`Main → HomeTab → Playbook`**, still `__DEV__`-only |

**One registration still serves all three doors.** All three already live in
`HomeStack` — the player dashboard (`Dashboard`), the Courses featured card
(`Courses`) and Club Hub (`ClubHub`) — so a `navigate('Playbook')` from any of
them resolves in this stack and pushes over a visible tab bar.

**`RootStackParamList` keeps its `Playbook` entry.** `HomeStack` is untyped
(`createNativeStackNavigator()` with no generic), and every caller types its
`navigate` against the root list. Removing the entry would have broken three
call sites for no runtime gain; the comment there now says where the route
actually lives.

### The lazy boundary survives — by code

```
$ grep -rn "pac-playbook" src/navigation src/app app
src/navigation/AppNavigator.tsx:16:// src/features/pac-playbook/launch.ts for why it is a leaf module.
src/navigation/AppNavigator.tsx:17:import { playbookVisible } from '../features/pac-playbook/launch';
src/navigation/AppNavigator.tsx:79:  ? lazy(() => import('../features/pac-playbook/dev/PlaybookDevHarness'))
src/navigation/AppNavigator.tsx:82:// feature hangs off: nothing under `src/features/pac-playbook/` (outside
src/navigation/AppNavigator.tsx:87:const PlaybookScreen = lazy(() => import('../features/pac-playbook/PlaybookScreen'));
src/navigation/AppNavigator.tsx:340:          Suspense, so nothing under `src/features/pac-playbook/` is evaluated
```

Six hits: **two dynamic imports** (`:79`, `:87`), **three comments**
(`:16`, `:82`, `:340`) and **one static import at `:17`** —
`launch.ts`, M4's launch switch. **That one is a real top-level import and is
named here rather than glossed.** It is the 35-line leaf M4 built for exactly
this: two constants, importing nothing, so the navigator can ask whether the
book is live without pulling a line of reader code. The reader's own module
graph is still behind `lazy()` and nothing else under the feature is reachable
from a navigator or boot file. If the planning room wants that hit gone too,
the switch would have to move out of `src/features/pac-playbook/` — a rename,
and a ruling, not a fix.

The export agrees: **1 bundle, 0 split bundles**, and the harness is still out
(`playbook-dev 0`, `offline-pac-playbook 0`, against `PlaybookScreen 1`,
`CoverScreen 1`, `playbook_books 1`, `join-team 1` as control).

### The back control on the cover

A new `onExit` prop on `PlaybookHeader`, drawn **only where there is no
in-book `back`** — which is the cover and nothing else. It is a **chevron with
no label**, so the cover header stays the web's single row.

**R-G arithmetic at the 375pt floor.** 375 − 24 (`paddingHorizontal` 12 x2) =
351pt of content box. Chevron 30 (18pt icon + 6pt padding each side) + crest
32 + EN/ES ~74 + three 8pt gaps 24 = 160, leaving the title cell **~191pt**
against the **~118pt** `PAC Playbook` needs at 18pt extrabold. **73pt over.**
A label would not fit: "Courses" alone is ~60pt and the two-row header would
be back.

**The route owns where it goes, not the reader.** `AppNavigator` passes
`onExit={() => canGoBack() ? goBack() : navigate('Dashboard')}`, so back from
the cover returns to whichever door opened it, and the reader never imports
react-navigation. The `__DEV__` harness passes nothing and draws no chevron.

**One honest gap:** the loading and error states render before the header, so
a book that fails to load still has no chevron. The tab bar is now the way out
of that state — which is the point of this fix, but it was not exercised.

---

## 3. The Courses "window" — half the hero, and a featured card

**Ruling:** Lu, Oct 30, option A. The rest of the Courses screen is parked as
**COURSES-REDESIGN** and was not touched: the filter chips, the course cards,
the header row and the two-column grid are byte-for-byte what they were.

### (a) The hero banner — ~236pt → ~118pt

| Removed / changed | Was | Now |
|---|---|---|
| the 📚 glyph | 32pt + 8 margin | **gone** |
| title | 26pt, 8 below | 22pt, 6 below |
| description | two long lines, 16 below | **one short line**, 10 below |
| `paddingTop` / `paddingBottom` | 56 / 24 | 20 / 16 |
| the three counts | kept | kept, unchanged |

The description is now "Expert-led courses. Earn XP as you learn." and carries
**no `numberOfLines`** — it is short enough for one row at the 375pt floor and
free to wrap rather than clip if it ever is not (rule R-G: the rule forbids
overflow, not wrapping). `styles.bannerIcon` was deleted with its only
reference; `grep -rn "bannerIcon" src` returns nothing.

### (b) The Playbook row became a featured card

`styles.playbookTile` / `playbookTileIcon` / `playbookTileText` are **gone**
(0 references left). In their place, `playbookCard`, in the same family as the
course cards below it:

| | course card | Playbook featured card |
|---|---|---|
| box | `#1e293b`, radius 12, `overflow:'hidden'` | **same** |
| width | half, in the 2-col grid | **full**, in the list header |
| top band | 160pt category gradient or thumbnail | **120pt chalkboard `#0b1220`** with a chalk sketch |
| body | `cardContent` → `cardTitle`, `cardDescription`, … | `cardContent` → `cardTitle` "PAC Playbook", one-line `cardDescription`, green "Free", chevron |

**The chalk sketch is written out in `CoursesScreen.tsx`, not imported.** A
`PlaybookChalkMark()` of nine `react-native-svg` primitives — goal, six-yard
box, two of ours, one of theirs, the pass and the run that finishes it. The
reason it is a copy and not an import is the lazy boundary: this screen is
allowed `launch.ts` (a leaf) and **nothing else** under
`src/features/pac-playbook/`, or opening the course list would evaluate the
reader's module graph. Colours are the playbook theme's by value, cited in the
comment: board `#0b1220`, chalk `#e8ecf2` (`theme.ts:65`, `:73`).

**What did NOT change:** `showPlaybook` and its `playbookVisible &&
selectedFilter === 'All Courses'` rule, the banner count
(`filteredCourses.length + (showPlaybook ? 1 : 0)`), the `!showPlaybook` guard
on the "No courses found" screen, and `navigation.navigate('Playbook')`. The
web's `CourseCatalog.tsx:341` and `:326` mirrors still hold.

---

## 4. Proof

### Static

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | **5 errors = baseline**, all pre-existing in `src/components/games/`; **0 in any touched file** |
| `ESLINT_USE_FLAT_CONFIG=false npx eslint <6 touched files>` | **0 errors**, 35 warnings (pre-existing `no-explicit-any` / `no-console` / `no-inline-styles` in the host files) |
| `npx expo export --platform ios` | **exit 0**, 1 bundle, **0 split bundles**, `index-62f365056dfedce4efe7b2034f8d610c.hbc` (9.3 MB) |
| mirror | `git diff --stat` lists 6 files, **none in MIRROR.md's ten** |

### The looks — `docs/recon/m5-looks/`

iPhone 17 Pro / iOS 26.2, against the Metro session already running in Lu's
own terminal. Metro was never killed, restarted or started by this room.

* **`01-cover-half-art-back-chevron-tabbar.png`** — the cover: one sketch at
  half height, the chevron at the head of a **single-row** header with
  `PAC Playbook` whole, and the Home / Chat / Calendar / Profile bar on screen.
* **`02-card-F3-tabbar.png`** — card `F3`, *The field map*: the R-G two-row
  header untouched, the card screen's own top doodle band still there, tab bar
  on screen.
* **`03-courses-hero-featured-card.png`** — the halved hero, the filter chips
  unchanged, the featured card with its chalkboard band, and the first course
  card below it.

**How the screens were reached, and what that does not prove.** The tap
blocker of M3 and M4 is unchanged — `xcrun simctl` has no tap verb, `idb` and
`cliclick` are absent, `osascript` is refused assistive access (`-1719`). Every
screen was opened by the `__DEV__` deep link. **No tap, swipe or keystroke
happened in this session.** One temporary scaffold carried the Courses shot —
a `Courses: 'courses-shot'` path inside the same `__DEV__` linking block — and
it is **removed**: `grep -rn "TEMP-M5-SHOT\|courses-shot" src` returns nothing.

### Owed to Lu's finger

1. **The cover chevron's press** — that it pops back to the door that opened
   the book (Courses, the dashboard card, Club Hub). The handler is
   `goBack()`; it was never pressed.
2. **The featured card's press**, and that the dashboard and Club Hub cards
   still land on the reader now that the route moved stacks.
3. **Whether half height is the right half** — § 1 offers the full-width clip
   as the alternative.
4. Everything M4 left owed: the EN/ES toggle, a `pos-*` dot, the movement
   panel's drag, and the Club Hub card from a coach or director account.

---

## 5. For COURSES-REDESIGN (parked — mockup first)

Found while in this file, all left alone:

* **The header row sits under the status bar.** `styles.container` has no top
  safe-area padding and `styles.header` only `paddingVertical: 12`, so the
  back arrow and "Course Library" are drawn at y 0–64 behind the notch. The
  old hero's `paddingTop: 56` was hiding how close that is; at `20` the row is
  legible but still unpadded. A `useSafeAreaInsets()` top on the container is
  the one-line fix — **out of this scope, it moves every row on the screen.**
* **The screen prints "Course Library" twice** — once in the header row and
  once as the hero title.
* **Three styles are declared empty on purpose** — `backButton`,
  `backButtonIcon`, `headerRight` (`stage4-types.md`, Group D). The empty
  state still renders them unstyled.
* **The hero's "0 Students" is a literal**, not a count.
* **The featured card is the only full-width card on the screen.** If the
  redesign makes the course cards full width too, the band height (120) and
  the card's `marginHorizontal` (16) should come from one place.

---

## 6. Follow-up round, 2026-10-30 (HEAD `00d48f2`) — five items

Appended after the M5-fix commit. Items 1, 3 and 4 close things this document
itself raised; item 2 closes the one honest gap in § 2.

### 6.1 RECUR-MAX = 12 months — 1 cap raised, 1 default deliberately NOT

**Ruling:** Lu, Oct 30 — 12 months, replacing the 2-month cap.

The 2-month limit was encoded in **two** places in
`src/components/calendar/CreateEventModal.tsx`, and nowhere else.
`EditEventModal.tsx` has no recurrence code at all, and the sweep
(`grep -rn addMonths` + `"2 months"` + `endRepeat` across `src/`) found no
third site — **well under the 10-site stop rule.**

| Site | Was | Now |
|---|---|---|
| the End Repeat picker's cap (`:715`) | `addMonths(eventDate, 2)` | **`addMonths(eventDate, RECUR_MAX_MONTHS)` = 12** |
| the End Repeat pre-fill (`:405`) | `max.setMonth(+2)`, a local named `max` | `addMonths(eventDate, RECUR_DEFAULT_MONTHS)` — **still 2** |

Both numbers are now named constants with the reasoning on them
(`RECUR_MAX_MONTHS` `:104`, `RECUR_DEFAULT_MONTHS` `:118`).

**Why the default was left at 2, and why that is Lu's call and not this
room's.** Before today the two were the same number because the pre-fill
simply took the maximum — the local was literally named `max`. Raising both
would mean a coach who never opens End Repeat silently creates **a year** of
events instead of two months: for a twice-weekly practice that is ~104 rows
instead of ~17, from a form they did not touch. The ruling was about the cap,
so the cap moved and the default did not. **NEEDS LU: should the pre-fill stay
2 months, or follow the cap?**

**FOUND, out of scope, and it bites this ruling:
`src/screens/CalendarScreen.tsx:108` fetches `−1 month … +6 months`.** A
series that now runs 12 months out will create events the calendar screen does
not display past month 6. It is a one-character change (`6` → `13`), but it
widens every calendar fetch for every user, so it is a decision, not a sweep.
**Not changed here.**

### 6.2 The launch switch left the feature folder

`src/features/pac-playbook/launch.ts` → **`src/constants/playbookLaunch.ts`**,
beside the app's other constants (`eventTypes.ts`, `teamColors.ts`). Moved
with `git mv`; the file's two exports and their semantics are untouched, so
the release procedure is still one line.

Four importers repointed: `AppNavigator.tsx:17`, `PlayerDashboard.tsx:24`,
`CoursesScreen.tsx:20`, `ClubHubScreen.tsx:12`, plus the four prose mentions
of the old path in those files. `grep -rn "pac-playbook/launch" src` now
matches only the moved file's own history note.

**§ 2's honest gap is closed. The lazy grep is clean:**

```
$ grep -rn "pac-playbook" src/navigation src/app app
src/navigation/AppNavigator.tsx:80:  ? lazy(() => import('../features/pac-playbook/dev/PlaybookDevHarness'))
src/navigation/AppNavigator.tsx:83:// feature hangs off: nothing under `src/features/pac-playbook/` (outside
src/navigation/AppNavigator.tsx:88:const PlaybookScreen = lazy(() => import('../features/pac-playbook/PlaybookScreen'));
src/navigation/AppNavigator.tsx:341:          Suspense, so nothing under `src/features/pac-playbook/` is evaluated
```

**Four hits: two dynamic imports, two comments. Zero top-level imports** —
the rule is now readable off a grep instead of argued in prose.
`MIRROR.md` never named the file, so it needed no edit.

### 6.3 The chevron reaches the loading and error states

Both states rendered before the header, so a book that would not open left the
reader with the tab bar and nothing else — exactly the trap § 2 flagged. They
now go through one `stateFrame()` helper in `PlaybookScreen.tsx` that wraps
them in the same single-row header the cover wears: crest, `PAC Playbook`, the
chevron. No search and no home (there is no book to search or go home to), and
`topInset` moved from the page to the header, so the gradient runs under the
status bar as it does everywhere else.

One supporting change in `PlaybookHeader.tsx`: the subtitle `<Text>` is now
skipped when `sub` is empty, which these two states are — an empty `Text`
still holds a line of height.

### 6.4 Courses safe area, and the duplicate title

`styles.container` had no top inset, so the header row was drawn at y 0 behind
the status bar; the old hero's `paddingTop: 56` hid how close that was, and
halving the hero exposed it. **Fixed with the pattern the sibling HomeStack
screens already use** — `SafeAreaView edges={['top']}` from
`react-native-safe-area-context` (`ClubHubScreen.tsx:69`, and GamesHub /
TrainingStudio), applied to both the main return and the empty-state return.
The bottom edge is deliberately not claimed; that is the tab bar's.

The duplicate **"Course Library"** is gone from the header row in both returns
— the hero below already prints it. The back button and the row's height are
unchanged; `styles.headerTitle` lost its last reference and was deleted with
it (`react-native/no-unused-styles` would otherwise have flagged it).

**Look: `m5-looks/04-courses-safe-area.png`** — the back arrow clear of the
status bar, "Course Library" printed once.

### 6.5 Chat links — read-only, FOUND

Full record in **`docs/recon/chat-links-check.md`**. Short version: chat
message text is already linkified in one place, `ChatBubble.tsx:43–73`, used
by both chat screens, covering `https://`, `http://` and bare `www.` (upgraded
to https). **`thryvyng://` is NOT matched**, so an in-app deep link pasted into
chat is dead text. No code was changed.

### 6.6 Gates for this round

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | **5 = baseline**, 0 in any touched file |
| `ESLINT_USE_FLAT_CONFIG=false npx eslint <8 touched files>` | **0 errors** |
| `npx expo export --platform ios` | **exit 0** |
| mirror | `git diff --stat` lists no file in MIRROR.md's ten |

**Reached the same way as § 4, with the same limits.** The Courses shot used a
temporary `Courses: 'courses-shot'` path inside the `__DEV__` linking block;
it is **removed** (`grep -rn "TEMP-M5B-SHOT\|courses-shot" src` returns
nothing, and `git diff` on `linking.ts` is empty). **No tap, swipe or
keystroke happened in this round either** — so the chevron on the error state,
the 12-month picker and the Courses back button are all still Lu's to press.

### 6.7 Still open after this round

* **The three Playbook panels — Positions, Formation, Movement — are
  UNVERIFIED by Lu.** Built in M3, never looked at on a device or a phone; the
  movement panel's drag and its frame rate remain UNKNOWN.
* **The cover art stays whole-and-centred (option A).** The full-width
  `xMidYMax slice` alternative in § 1 was not taken and the question is still
  Lu's.
* **The End Repeat pre-fill** (§ 6.1) and **the calendar's +6-month fetch
  window** (§ 6.1) both need a ruling.
* Everything in § 4 "Owed to Lu's finger" and § 5 COURSES-REDESIGN is
  unchanged, minus the safe-area and duplicate-title items 6.4 just closed.
