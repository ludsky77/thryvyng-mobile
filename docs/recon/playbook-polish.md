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

## PLAYBOOK-DASHBOARD-PLACEMENT — the book moved to the top of every dashboard (Nov 1)

**Why this is a second file-level note and not an edit above.** The section
"1 — PLAYBOOK-CARD-INVITING" describes the card's LOOK and still holds exactly.
This describes WHERE it sits and WHO ELSE sees it, which changed after Lu's
Nov 1 device pass.

### Every role dashboard, and what each one got

`src/components/dashboards/` holds four files. Three are dashboards; the fourth,
`PendingAttachmentsBanner.tsx`, is a banner a dashboard renders. All three
dashboards are chosen by role in `src/screens/DashboardScreen.tsx:281-297` and
all three render inside `HomeStack`, the stack that owns the `Playbook` route.

| Dashboard | Roles (`DashboardScreen.tsx`) | Before | Now |
|---|---|---|---|
| `PlayerDashboard.tsx` | `player`, `parent` | card below YOUR PROGRESS | **MOVED** — directly below `QuickActionsCard`, above the lineup widget |
| `CoachDashboard.tsx` | `head_coach`, `assistant_coach`, `team_manager` | no card | **NEW** — section 5, between the Quick Actions grid and TEAM PERFORMANCE |
| `ClubAdminDashboard.tsx` | `club_admin` | no card | **NEW** — between the Quick Actions grid and TEAMS |

`NoRoleDashboard` (the `default` branch, and NOT in this folder) gets nothing: a
user with no role has no club context.

### THE GATE DID NOT CHANGE, and that is why all three get the card
The card's only condition has ever been `playbookVisible`
(`src/constants/playbookLaunch.ts`) — there is no role test in it, and the
`Playbook` route is gated on the same constant and nothing else
(`src/navigation/AppNavigator.tsx:349`). So "any role whose user can open it" is
every role that reaches a dashboard. Coaches and directors already had a door
(the Club Hub tile); this is a second door for them, not a new permission.

### The one new file
`src/components/dashboards/PlaybookEntryCard.tsx` — the card lifted out of
`PlayerDashboard.tsx` with its markup and its six styles unchanged, so there is
one card and not three copies. Two deliberate choices in it:

- **it owns the gate.** `if (!playbookVisible) return null;` is read once, in the
  component, instead of three `{playbookVisible && …}` wrappers a fourth
  dashboard could forget. `playbookLaunch.ts` itself is untouched.
- **it does NOT own the section wrapper or the title.** `styles.section` and
  `styles.sectionTitle` differ per dashboard (padding 12 vs 16; a grey title on
  the player and admin dashboards, violet `#a78bfa` on the coach's), so each host
  supplies its own `<View style={styles.section}><Text style={styles.sectionTitle}>
  📖 PAC PLAYBOOK</Text>` around it and the door matches the sections near it.

`navigation` is a prop, not `useNavigation()`: the player and admin dashboards
already receive one and the coach's already makes one with `useNavigation`, so
the press target stays the exact `navigation.navigate('Playbook')` that works
today on each path.

### What was deleted from `PlayerDashboard.tsx`
The old markup block, the six `playbook*` style entries, and the file's
`Ionicons` import — the card was the only glyph in that file, so the import went
dead the moment the markup moved. `grep -ni "playbook\|ionicons"
src/components/dashboards/PlayerDashboard.tsx` now returns only the new import
and the new section.

### The lazy boundary, again
`PlaybookEntryCard.tsx` imports nothing from `src/features/pac-playbook/`. The
four values are written out by value with `theme.ts` citations, exactly as this
doc's "WHY `styles.ts` EXPORTS NO SHARED TOKEN" section requires, and that grep
is still `grep -rn "#1c2637\|#10b981" src/`. Measured proof the book stayed out
of the dashboards' bundle: `npx expo export --platform ios` → one iOS bundle at
**9.32 MB**, byte-for-byte the same size as M6's.

### Gates — PLAYBOOK-DASHBOARD-PLACEMENT, Nov 1
Four files: `PlaybookEntryCard.tsx` (new), `PlayerDashboard.tsx`,
`CoachDashboard.tsx`, `ClubAdminDashboard.tsx`.

- `npx tsc --noEmit` → **5 errors, the same pre-existing `src/components/games/*`
  five** (AnticipationArena ×2, DribbleRush ×2, PatternPlay ×1). **0 new.**
- `ESLINT_USE_FLAT_CONFIG=false npx eslint <the 4 files>` → **0 errors**, 77
  warnings. Proven **0 new** on the three edited files with this doc's own stdin
  trick — pristine `HEAD` content piped through `eslint --stdin
  --stdin-filename <same path>`, counts identical: PlayerDashboard 36/36,
  CoachDashboard 30/30, ClubAdminDashboard 10/10. The new file has **1**
  warning, `@typescript-eslint/no-explicit-any` on `navigation: any` — the same
  prop type `PlayerDashboardProps` and `ClubAdminDashboardProps` already declare,
  which is why those two files carry the warning too.
- `npx expo export --platform ios` → **exit 0**, one iOS bundle (9.32 MB).

**Not verified:** no device, no simulator. The ledger row is VERIFICATION PENDING.

## PLAYBOOK-DASHBOARD-PLACEMENT, second pass — the card restyled (Nov 1)

Three design changes, `src/components/dashboards/PlaybookEntryCard.tsx` ONLY.
The placement from the first pass is unchanged, and so are the other two entry
points (`CoursesScreen.tsx`, `ClubHubScreen.tsx`): they still carry the green
rule and the book disc, so **the three ways in are no longer visually
identical.** That is a deliberate consequence of this task's SCOPE, not drift —
see "what this costs" below.

### 1 — the crest: WHERE THE IMAGE COMES FROM
There is **no bundled PAC crest asset** in this repo (`src/assets/` holds only
`jersey-badge.png`; `assets/` holds app icons and splash art) and **no club
context carrying a logo** — the two candidates both stop at the name:

- `AuthContext`'s `currentRole.club` is `{ id, name }`, mapped from
  `get_enriched_roles_v2` (`src/contexts/AuthContext.tsx:92`). No logo column.
- `useUserTeams` / `TeamsContext` select `clubs ( id, name )`
  (`src/hooks/useUserTeams.ts:124-127, 165-168`). No logo column.

What DOES exist is the column itself, `clubs.logo_url`, which is what every club
badge in this app draws:

| Where | How |
|---|---|
| coach dashboard emblem | `CoachDashboard.tsx:328-339` — `<Image source={{uri: team.clubs.logo_url}}>`, with a 40pt initials circle behind it (`clubEmblem*`, `:629-646`) |
| the Playbook's own header | `PlaybookHeader.tsx:49-65` — same image, `resizeMode="contain"`, `onError` → lettering |
| the chat list | the same logo under its RPC's own name, `club_logo_url` (`src/screens/ChatScreen.tsx:849`) |
| registration, evals, join flows | `RegistrationDetailScreen`, `EvaluationDetailScreen`, `JoinTeamScreen`, `JoinStaffScreen`, `RegisterTeamScreen` — all the same column |

So the crest source was FOUND and the task did not stop. The card reads it the
way the book's own header does, through the **`public_clubs` view** and not
`clubs` directly, for the reason `src/features/pac-playbook/rpc.ts:85-99`
(`fetchClubCrest`) already states: the view is `security_invoker = false` and
granted to `anon, authenticated`, so it answers for a player and a parent
exactly as it does for a director. Approved clubs only, so an unapproved club
returns no row — which lands on the same fallback as a null logo.

**`fetchClubCrest` is COPIED, not imported** (four lines of
`supabase.from('public_clubs').select('name, logo_url')`), for the same reason
the colours are copied: a dashboard is a boot path and importing
`src/features/pac-playbook/` would pull the book's module graph into it. This is
the first thing this folder has copied from the feature that is not a colour —
flagged, with the honest alternative in the ledger's RECOMMEND.

**WHICH club, and it matters:** the card shows the **viewer's** club
(`currentRole.club.id`). The Playbook header shows the **book owner's**
(`usePlaybookBook.ts:182`, `book.owner_club_id`). For a PAC user those are one
club; for anyone else they are two — which is the tenant finding below.

**Fallback chain, all three rungs already idioms in this repo:** club logo →
club name's first two letters upper-cased (`CoachDashboard.tsx:336`) → `PAC`
(`PlaybookHeader.tsx:62`) when there is no club name at all. A `logo_url` that
fails to load falls to the lettering through `onError`, as the header's does.

### 2 — the book glyph moved
`book-outline` is now `size={14}` at the right of the title, in a new
`playbookTitleRow` (`flexDirection: 'row'`, `gap: 6`). It stays the playbook
green, so the book is still named by a picture now that the left disc is the
club's. The chevron keeps `size={20}` and the green.

### 3 — the rule is now the dashboard's violet
`borderColor: 'rgba(139, 92, 246, 0.4)'` — **the exact value the quick-nav tiles
above the card use**, `styles.buttonBorder` in
`src/components/QuickActionsCard.tsx:108` (`borderWidth: 1`,
`backgroundColor: 'rgba(139, 92, 246, 0.08)'`). `rgb(139,92,246)` is the app's
violet `#8b5cf6`. Only the COLOUR was matched: the card keeps its own
`borderWidth: 1.5` (the book's `lineWidth.mid`), because the raised face was to
be kept and the 1.5 rule is half of that device. The face is still `#1c2637`.
The crest disc carries the same violet as a 1pt ring on a white face.

### WHAT THIS COSTS, stated plainly
The green rule was the whole point of PLAYBOOK-CARD-INVITING: it made the
dashboard card, the Courses card and the Club Hub tile read as one feature, and
tied all three to the quiz card inside the book (`pbk.quizcard`). After this
pass the dashboard door is violet and the other two are green. The card keeps
two green notes — the cue and the chevron — and that is now the only thread.
Reconciling them would mean touching `CoursesScreen.tsx` and
`ClubHubScreen.tsx`, which this task forbids.

### CITATION DRIFT FOUND (values fine, line numbers stale)
M6's font work moved `theme.ts`. The lines the earlier entry points and this
doc cite are **off**, though every VALUE is unchanged:

| Value | Cited as | Actually |
|---|---|---|
| `card2` `#1c2637` | `theme.ts:63` | `theme.ts:65` |
| `green` `#10b981` | `theme.ts:79` | `theme.ts:81` |
| `lineWidth.mid` `1.5` | `theme.ts:255` | `theme.ts:310` |

`PlaybookEntryCard.tsx` carries the corrected numbers. `CoursesScreen.tsx`,
`ClubHubScreen.tsx` and this doc's earlier sections still carry the old ones —
both are outside this task's SCOPE. `PlaybookHeader.tsx`'s own comment also
cites `src/components/comm/ChannelList.tsx` for the chat-list crest, and **that
file does not exist** (`find src -name "ChannelList*"` → nothing); the chat list
is `src/screens/ChatScreen.tsx:849`.

### TENANT SCOPE — the answer, and it is no
**Neither the card nor `playbookVisible` is tenant-scoped: a non-PAC tenant's
user on any of the three dashboards sees this PAC-branded card and can open
PAC's book.** Three pieces of evidence, all read this session:

1. `playbookVisible = PLAYBOOK_LIVE = true` — a plain module constant, no club,
   no tenant, no argument (`src/constants/playbookLaunch.ts:57-60`).
2. The `Playbook` route is gated on that same constant and nothing else
   (`src/navigation/AppNavigator.tsx:349`).
3. The book is fetched **by slug**: `fetchBook()` does
   `.eq('slug', 'pac-playbook')` (`rpc.ts:45,77-83`), and `owner_club_id` is
   read off the row only to fetch the owner's crest
   (`usePlaybookBook.ts:182`) — it is **never compared to the viewer's club**.
   `grep -rn "owner_club_id" src/` returns exactly those three sites.

The one thing that DOES follow the viewer is the crest this pass added, which is
their own club's. So a non-PAC user would see their own badge beside the words
"PAC Playbook". Not fixed: any fix is a visibility-gate change, which this task
forbids.

### Gates — restyle pass, Nov 1
One file: `src/components/dashboards/PlaybookEntryCard.tsx`.

- `npx tsc --noEmit` → **5 errors, the same pre-existing `src/components/games/*`
  five** (AnticipationArena ×2, DribbleRush ×2, PatternPlay ×1). **0 new.**
- `ESLINT_USE_FLAT_CONFIG=false npx eslint <the file>` → **0 errors, 1 warning**,
  `@typescript-eslint/no-explicit-any` on `navigation: any` — the same single
  warning this file had before the restyle, and the same prop type
  `PlayerDashboardProps` and `ClubAdminDashboardProps` declare. **0 new.** (The
  crest row is typed, not `any`, which is why the query added none.)
- `npx expo export --platform ios` → **exit 0**, one iOS bundle (**9.32 MB**,
  unchanged — the `public_clubs` read pulled in nothing new, `supabase` and
  `useAuth` are already on every dashboard's boot path).

**Not verified:** no device, no simulator. In particular NOBODY HAS SEEN the
crest render — the fallback lettering and the image path are both unexercised.

## ROOT CAUSE — why the crest drew `PAC` instead of the logo (Nov 1, third pass)

**The symptom.** `+zztest7`, a secondary-parent login in PAC, on
`PlayerDashboard`: the card drew the `PAC` lettering. Lu proved from outside the
app that the data is fine — `public_clubs.logo_url` for PAC
(`6ccb8992-fe30-4e87-9ced-860c3765a91a`) holds a URL and `curl -I` on it returns
`HTTP 200`, `image/png`, 61 KB. So the fault was in this card.

### THE ROOT CAUSE: the lookup key was never populated, so the query never ran

`PlaybookEntryCard.tsx` keyed the crest on `useAuth().currentRole?.club?.id`,
and that was `null` for this role. The effect's first line was
`if (!playbookVisible || !clubId) return;`, so:

1. the `public_clubs` query **never ran** — it was not an RLS refusal, not an
   empty row and not a wrong column;
2. the `<Image>` was **never mounted**, so `onError` never fired either;
3. the card fell through to the lettering on its first and only render.

**The proof that `currentRole.club` was null is the rendered string itself.** The
initials branch was `clubName.substring(0, 2).toUpperCase()` — **two
characters**, which can never spell the three-letter `PAC`. `PAC` could only
come from the `: 'PAC'` arm of that ternary, and that arm requires a falsy club
name. The name's only two sources were `currentRole?.club?.name` (the initial
state) and the query's `setClubName`. The query had not run, so the name came
from `currentRole`, so `currentRole.club.name` was falsy — and
**`AuthContext.tsx:92` sets `club` to `{ id, name }` OR to `null` as one unit**:

```ts
club: r.club_id ? { id: r.club_id, name: r.club_name } : null,
```

so a falsy name and a falsy id are the same fact. No device log and no DB access
was needed to pin this; the two-character substring rules out every other path.

### Why nobody had noticed `currentRole.club` is unreliable
Nothing in the app depended on it. Its only two other readers take it **last** in
an `||` chain — `RoleSwitcher.tsx:157`
(`entityName || team?.name || club?.name || ''`) and
`WorldCupPredictorScreen.tsx:1101` — and the Playbook itself never reads it: its
header resolves the crest from `book.owner_club_id`
(`usePlaybookBook.ts:182`). The card was the first code to need it as a key.

**UNKNOWN, and it no longer matters here:** whether `get_enriched_roles_v2`
returns `club_id` for a parent row. The function is server-side and is not in
this repo (`grep -rn get_enriched_roles_v2` → only `AuthContext.tsx:61` and
docs; `supabase/migrations/` holds one unrelated file). The check that would
settle it is `select club_id, club_name from get_enriched_roles_v2('<user id>')`.
Not run — SQL is forbidden in this task.

### THE FIX: the host dashboard hands the club id down
`clubId` is now a required prop and `clubName` an optional one; `useAuth` is gone
from the card. Every dashboard already held a club id, so nothing new is fetched
to get it:

| Dashboard | What it passes | Already had it? |
|---|---|---|
| `ClubAdminDashboard.tsx` | `clubId={clubId}`, `clubName={club?.name ?? null}` | yes — `clubId` is its own prop, `club` from `select('*')` |
| `CoachDashboard.tsx` | `clubId={team.club_id ?? null}`, `clubName={clubName ?? null}` | yes — `Team.club_id` is typed (`:35`) and comes from `select('*', …)` (`:96`) |
| `PlayerDashboard.tsx` | `clubId={player.teams?.club_id ?? null}`, `clubName={clubName}` | **one word added**: `teams(id, name, color, club_id, clubs(id, name))` in the select (`:89`) and `club_id?: string \| null` on the inline `teams` type (`:40`) |

### WHY the id, and not the logo_url, is what gets passed
The coach dashboard already selects `clubs(id, name, logo_url)`
(`CoachDashboard.tsx:96`) and could hand over the URL with no query at all. It
is **not** done that way, on purpose: a player's and a parent's `clubs` join may
not answer. The `public_clubs` view exists precisely because direct `clubs`
reads do not answer for them — `rpc.ts:85-99` says the view is
`security_invoker = false` and granted to `anon, authenticated` "so it answers
for a player and a parent exactly as it does for a director". `PlayerDashboard`
does embed `clubs(id, name)` today, but whether that embed returns a row for a
parent is unproven, which is why the id passed is the **team row's own plain
`club_id` column** — a column on a row that demonstrably reads (the team name is
on screen) — and the logo is then read through the view. One lookup, one RLS
story, all three roles.

### Also changed, same pass
- The fetched name now wins over the passed one once it lands
  (`crest?.name ?? clubName ?? null`), so the lettering is right even where the
  host's name is empty. State is one object, not a prop mirrored into state, so
  a club id arriving late still refetches.
- `setCrest(null); setBroken(false);` now run at the top of the effect, so
  switching role cannot leave the previous club's crest on screen.

### Gates — root-cause fix, Nov 1
Four files: `PlaybookEntryCard.tsx`, `PlayerDashboard.tsx`, `CoachDashboard.tsx`,
`ClubAdminDashboard.tsx`.

- `npx tsc --noEmit` → **5 errors, the same pre-existing `src/components/games/*`
  five**. **0 new.**
- `ESLINT_USE_FLAT_CONFIG=false npx eslint <the 4 files>` → **0 errors**; per-file
  counts against `HEAD` by the stdin trick: PlayerDashboard **36/36**,
  CoachDashboard **30/30**, ClubAdminDashboard **10/10**, and the new card 1
  warning (`navigation: any`). **0 new.** Typing `club_id` on both interfaces is
  what kept the two `(x as any)?.club_id` casts — and their two warnings — out.
- `npx expo export --platform ios` → **exit 0**, one iOS bundle (**9.32 MB**).

**STILL NOT VERIFIED ON DEVICE.** The query now runs with a real club id, but
nobody has seen the image render. The one thing the fix cannot prove by itself is
whether `public_clubs` answers for a secondary parent — `rpc.ts:85-99` says it
should, and the book's own header relies on that, but this login has not drawn
that header either. If the crest is still lettering after this, the next check is
whether `player.teams.club_id` arrived (it is now the only input) before
suspecting the view.
