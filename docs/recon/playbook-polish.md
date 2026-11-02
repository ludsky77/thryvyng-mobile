# Playbook UI polish — the five forks, and where each one lives

**What this is.** The file-level record of the Nov 1 2026 Playbook polish pass
(forks PLAYBOOK-CARD-INVITING · QUIZ-CARD-NOTICEABLE · QUIZ-RESULT-BUTTONS-ALIGN ·
QUESTION-PILLS-WRAP · QUIZ-REVIEW-NAV, opened in `docs/ledger.md` after Lu's Nov 1
device test). Written so the next step does not have to re-find any of it.

**Status:** all five built, AGENT-ONLY (typecheck · eslint · `expo export`, no
device, no simulator). Four landed Nov 1 in the first pass; the fifth,
PLAYBOOK-CARD-INVITING, was stopped that day for SCOPE and landed Nov 1 in a
second pass once Lu named the three entry-point files — see "1 —
PLAYBOOK-CARD-INVITING" below.

## The five areas, by file

| # | Fork | Where it lives | Built? |
|---|---|---|---|
| 1 | PLAYBOOK-CARD-INVITING | THREE entry points, all **outside the Playbook feature folder**: `src/screens/CoursesScreen.tsx` · `src/components/dashboards/PlayerDashboard.tsx` · `src/screens/ClubHubScreen.tsx` | yes — second pass |
| 2 | QUIZ-CARD-NOTICEABLE | `src/features/pac-playbook/screens/ContentsScreen.tsx` (the quiz `Row` at the foot of the index) + `styles.ts` `quizcard` / `quizcardHead` / `quizcardCta` | yes |
| 3 | QUIZ-RESULT-BUTTONS-ALIGN | `src/features/pac-playbook/screens/QuizScreen.tsx` (`Results`'s footer) + `ui.tsx` (`Cta` now takes `style`) + `styles.ts` `ctaStretch` | yes |
| 4 | QUESTION-PILLS-WRAP | `src/features/pac-playbook/screens/ChapterEndScreen.tsx` (the "About" chip row) + `styles.ts` `pillwrap` | yes |
| 5 | QUIZ-REVIEW-NAV (ruling A) | `src/features/pac-playbook/screens/QuizScreen.tsx` (`Results`) + `useQuizRun.ts` (`attempts`) + `styles.ts` `rev*` | yes |

### 3 — why the result buttons were off-centre
`pbk.res` is `alignItems:'center'`. On the web a block-level `.cta` stays full
width inside a centred column; in React Native a centred parent shrink-wraps the
child, so the footer block collapsed to its content and the two buttons came out
narrow and off the column. Fixed by stretching the footer (`ctaStretch`), not by
touching `.cta` itself — every other screen's footer is unchanged.

### 5 — ARE THE CORRECT ANSWERS CLIENT-SIDE? **YES, and before submit.**
`playbook_start_quiz` deals each question with its own answer key:
`DealtQuestion.content` carries `options[]`, `answer` (the right option's id) and
`why` (`src/features/pac-playbook/types.ts:214-228`). That is the half of ruling
R4 the run screen already uses to turn the right option green after each attempt
(`QuizScreen.tsx`, `opt`/`optYes`). So the review panel needs **no RPC, no new
call and no widened signature** — it reads the deal still in hand on the result
screen plus the run's own record.

What was missing was only the *player's* answer per question: the hook kept it in
`answersRef` (keyed by question, for the submit payload) and exposed just the
current `lastChoice`. `useQuizRun` now also keeps `attempts: (QuizAnswer |
undefined)[]` in dealt order — the same objects handed to `playbook_submit_quiz`,
never derived from them. An `undefined` slot is a question the timer closed.

Two honest gaps in the panel's copy, both from the data and not from choice:
- **tap questions have no option text.** The right answer is a point on the
  board, so the panel says "The marked spot on the board" / "El punto marcado en
  el pizarrón" and the player's as "Where you tapped the board". No coordinate is
  printed, because a coordinate means nothing to a reader.
- **a timed-out question** shows "No answer — time ran out", which is exactly
  what was sent (`{key}` with no choice and no point).

The result screen's plain pip row was REPLACED by the chip row — same verdicts, in
the same dealt order, now labelled `Q1 ✓` and pressable. Nothing opens a new
screen, and there is no retake path from the review: "Play again" is still the
footer's, where it was.

## 1 — PLAYBOOK-CARD-INVITING: the three ways in, now one feature

**First pass (stopped).** The Playbook entry card is **not** in the Playbook
feature folder, so the first pass could not touch it: SCOPE was the feature folder
and FORBIDDEN named "anything outside SCOPE". Lu then named the three files, and
the second pass built all three.

### The three entry points, and what each one now is

| Who enters here | File | The card before | The card now |
|---|---|---|---|
| players & parents, course list | `src/screens/CoursesScreen.tsx` (markup ~`:309-355`, styles ~`:663-720`) | `#1e293b` box, chalkboard band, short tagline, **violet** chevron, `Free` | green rule + raised face, book badge, shared tagline, **green** chevron, `Free` + `Open the book ›` |
| players, dashboard | `src/components/dashboards/PlayerDashboard.tsx` (markup ~`:407-437`, styles ~`:743-800`) | `#2a2a4e` card, **violet 3pt left edge**, `#a78bfa` chevron | green rule all round + raised face, book badge, cue line, **green** chevron |
| coaches & directors, Club Hub | `src/screens/ClubHubScreen.tsx` (the `cards` array + `card`/`cardFeatured` styles) | hub tile, `accentColor` **violet**, no cue | same tile SHAPE, `accentColor` **green**, green rule + raised face, cue line, green chevron |

### What makes them one feature
Four things, identical in all three:

- **the icon** — Ionicons `book-outline` on a `rgba(16,185,129,0.16)` disc.
  Club Hub already drew that badge; Courses and the dashboard had no icon at all.
- **the accent** — the playbook's green `#10b981`, as a `1.5`pt rule around a
  `#1c2637` face. This is the **green-rule / raised-face device from
  QUIZ-CARD-NOTICEABLE** (`pbk.quizcard` = `lineWidth.mid` of `color.green`
  around `color.card2`), which is the whole point: the entry card and the quiz
  card inside the book now use one visual idea for "this is worth opening".
  It REPLACES the violet that two of the three used.
- **the tagline** — "How we see the game, how we play it and how we think", the
  cover's own opening words (`screens/CoverScreen.tsx:139`). The dashboard and
  Club Hub already said it; Courses said a shortened "How we see the game and how
  we play it." and now says the full line. It wraps to two lines at the 375pt
  floor and nothing clips — the card is full width and there is no
  `numberOfLines` (R-G).
- **the cue** — `Open the book ›` in the same green.

Untouched in all three, by design: every `onPress`, every
`navigation.navigate('Playbook')`, every `activeOpacity`, the tile's row shape in
Club Hub, and the `playbookVisible` launch switch that gates all three.

### WHY `styles.ts` EXPORTS NO SHARED TOKEN — the lazy boundary
The task allowed adding a shared token to `src/features/pac-playbook/styles.ts`
"only if exporting a shared token helps". **It does not help; it would break
something.** All three entry points are lazy routes, and each one says so in a
comment — the clearest is `PlaybookChalkMark` in `CoursesScreen.tsx:32-40`:
colours there are written out BY VALUE precisely because importing from
`src/features/pac-playbook/` would make the course list evaluate the book's
module graph and the lazy boundary would be gone.

So the three files follow that existing idiom: the four values are written out
with a citation next to them — card2 `#1c2637`, green `#10b981`, greenDim
`rgba(16,185,129,0.16)` (`theme.ts:63,79,81`) and `lineWidth.mid` `1.5`
(`theme.ts:255`). `styles.ts` and `theme.ts` were NOT modified. **If these values
ever drift, the grep that finds every copy is `grep -rn "#1c2637\|#10b981" src/`.**

### The one new field, and it is presentational
`ClubHubScreen`'s local `HubCard` interface gained `featured?: boolean` and
`cue?: string`. They only pick styles and render one optional `Text`; the array,
the press targets and the routes are unchanged. Nothing else in the three files
gained state, a prop or a call.

## Gates — second pass (PLAYBOOK-CARD-INVITING), Nov 1
Three files changed: `src/screens/CoursesScreen.tsx`,
`src/components/dashboards/PlayerDashboard.tsx`, `src/screens/ClubHubScreen.tsx`.

- `npx tsc --noEmit` → **5 errors, the same pre-existing `src/components/games/*`
  five** (AnticipationArena ×2, DribbleRush ×2, PatternPlay ×1). **0 new.**
- `ESLINT_USE_FLAT_CONFIG=false npx eslint <the 3 files>` → **0 errors**, 44
  warnings. Proven to be **0 new**: each file's pristine `HEAD` content was piped
  through `eslint --stdin --stdin-filename <same path>` and the warning sets came
  back **identical** before and after (Courses 6, PlayerDashboard 36, ClubHub 2).
  That stdin trick is the way to baseline a warning count in this repo without
  stashing.
- `npx expo export --platform ios` → **exit 0**, one iOS bundle (9.31 MB).

## Gates at the time of writing (first pass)
- `npx tsc --noEmit` → 5 errors, all pre-existing in `src/components/games/*`
  (AnticipationArena ×2, DribbleRush ×2, PatternPlay ×1). **No new errors.**
- `ESLINT_USE_FLAT_CONFIG=false npx eslint <6 changed files>` → **0 errors**,
  4 warnings, every one of them on a line this pass did not write
  (`no-console` in ChapterEndScreen, three pre-existing inline styles in
  QuizScreen's entry and run screens).
- `npx expo export --platform ios` → exit 0, iOS bundle emitted.

## Not done here, on purpose
- `playbook_questions.kind` (Question / Comment / Suggestion pills) is still the
  SACRED fork QUESTION-KIND: the column does not exist, so the pills do not
  exist either and nothing was wired. The chips fork 4 fixes are the "About"
  chips — the chapter and its cards — which are what clipped.

## M6 — which Archivo the web actually uses (read-only recon, Nov 1)
Read in `~/Documents/thrive-and-score`, nothing written there.

**Four weights, no italics.** The single source is the Google Fonts URL the web
loads, `src/features/pac-playbook/loadPlaybookFont.ts:33`:

    https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;700;800&display=swap

Same four in the frozen prototype's own `<head>`
(`docs/playbook/pac-playbook-v2-FINAL-prototype.html:2`), and that file's own
comment names their jobs: *"400 body, 500 the muted sub-lines, 700 labels and
chips, 800 every title, number and board glyph."* The stack it feeds is
`--sans:'Archivo','Helvetica Neue',Helvetica,Arial,system-ui,sans-serif`
(`playbook.css:24`, repeated at `:389`).

**No italics anywhere.** `grep -n "font-style\|italic" playbook.css` → no hits.
So the 9 italic faces `@expo-google-fonts/archivo` ships are not design, and
none is loaded on mobile.

**THE ONE TRAP: the web asks for a weight it never loads.** `playbook.css` sets
`font-weight:600` in 11 places (chips, segment labels) but 600 is NOT in that
URL. The browser resolves it by CSS font matching — for a desired 600, faces
heavier than 600 are tried first, ascending — so those 11 rules paint in
**Archivo 700 Bold** on the web. Mobile mirrors the *result*: `theme.ts` maps
`fontFamily.semibold → 'Archivo_700Bold'`. `@expo-google-fonts/archivo` does
ship a real `Archivo_600SemiBold`, and using it would have given mobile a
weight the frozen design does not have. Flagged for Lu — it is the one place
where mirroring the web costs a visible distinction.

### Bundle trap found while measuring (not a web finding)
Importing the four names from the package ROOT bundles **all 18 faces**: the
package's `index.js` is a barrel that `require()`s every weight at module
scope. Measured with `npx expo export --platform ios`, which listed 18 `.ttf`s
(2.2 MB of TTF in the package). Importing each face from its own subpath
(`@expo-google-fonts/archivo/400Regular`, etc.) bundles exactly **4**.
Re-measured after the change: 4 faces listed, export exit 0.

### Gates — M6
Files: `src/features/pac-playbook/{theme.ts,font.ts,styles.ts,PlaybookHeader.tsx,PlaybookScreen.tsx,panels/MovementPanel.tsx}`,
`package.json`, `package-lock.json`, `app.json`.

- `npx tsc --noEmit` → **5 errors, the same pre-existing `src/components/games/*`
  five** (AnticipationArena ×2, DribbleRush ×2, PatternPlay ×1). **0 new.**
- `ESLINT_USE_FLAT_CONFIG=false npx eslint <6 changed files>` → **0 errors**, 5
  warnings, all `react-native/no-inline-styles` on lines this pass did not
  write. Proven **0 new** with this doc's own stdin trick — each file's pristine
  `HEAD` content piped through `eslint --stdin --stdin-filename <same path>`,
  counts identical before and after (theme 0/0, styles 0/0, PlaybookHeader 0/0,
  PlaybookScreen 2/2, MovementPanel 5/5). `font.ts` is new: 0 problems.
- `npx expo export --platform ios` → **exit 0**, one iOS bundle (9.32 MB).
