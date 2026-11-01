# Playbook UI polish — the five forks, and where each one lives

**What this is.** The file-level record of the Nov 1 2026 Playbook polish pass
(forks PLAYBOOK-CARD-INVITING · QUIZ-CARD-NOTICEABLE · QUIZ-RESULT-BUTTONS-ALIGN ·
QUESTION-PILLS-WRAP · QUIZ-REVIEW-NAV, opened in `docs/ledger.md` after Lu's Nov 1
device test). Written so the next step does not have to re-find any of it.

**Status:** four of the five built, AGENT-ONLY (typecheck · eslint · `expo export`,
no device, no simulator). The fifth was NOT built — it is outside the task's SCOPE;
see the last section.

## The five areas, by file

| # | Fork | Where it lives | Built? |
|---|---|---|---|
| 1 | PLAYBOOK-CARD-INVITING | `src/screens/CoursesScreen.tsx:309-340` (markup) + `:663-690` (styles) — **outside the Playbook feature folder** | **no — out of SCOPE, see below** |
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

## 1 — PLAYBOOK-CARD-INVITING: stopped, not skipped
The Playbook entry card is **not** in the Playbook feature folder. The one Lu's
fork names (ledger: "Courses featured card doesn't read as tappable") is written by
hand in `src/screens/CoursesScreen.tsx:309-340`, with its styles at `:663-690`;
`playbookBand` / `playbookRow` / `playbookTileFree` are that screen's, not the
book's. Two other entry points exist and have the same look-and-feel question:
`src/components/dashboards/PlayerDashboard.tsx:407-430` (+ styles `:743-770`) and
`src/screens/ClubHubScreen.tsx:42-51` (a hub tile).

The task's SCOPE was the Playbook feature folder plus, if unavoidable, a shared
token file; `CoursesScreen.tsx` is neither, and FORBIDDEN named "anything outside
SCOPE". So nothing was touched there. It needs one line of SCOPE from Lu
(`src/screens/CoursesScreen.tsx` — and whether `PlayerDashboard.tsx` joins it, so
the two ways in do not drift).

## Gates at the time of writing
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
