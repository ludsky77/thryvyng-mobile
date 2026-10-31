# PAC Playbook on mobile — M3: the reader shell, its six screens, its three panels

**What this is.** The record of the M3 build: what was mirrored, what was
rebuilt, where the web↔mobile file map runs, every write that is NOT wired yet
and what M4 needs from here. Written 2026-10-30, against
`thrive-and-score` @ `c772111` and this repo at the M3 working tree (M2 was
`8f06fb1`).

**Read with:** `src/features/pac-playbook/MIRROR.md` (what is byte-identical and
why), `docs/recon/playbook-mobile-m2-board.md` (the board), the web's
`docs/recon/playbook-mobile-recon.md` § E (the plan this executes).

---

## 0. The two opening acts

### 0a · Re-mirror from web `c772111`

Mobile was at web `83a3686`; `c772111` changed two mirrored files.

| File | Changed on the web | Re-mirrored |
|---|---|---|
| `diagram/renderDiagram.ts` | DIAGRAM-LABEL-FIT: `boxWidth()` / `clearBoxes()` — a label that overran its 24-unit box (`RECUPERAR`, found on the M2 simulator run) now sizes its box to the text, and an arrow is trimmed clear of a box it would otherwise run under | yes, byte-identical |
| `doodleArt.ts` | comment reword at lines 3 and 203 — done ON THE WEB so the mobile copy can be byte-identical except for the one DEV-flag line | yes, one declared diff |

`diff` over all nine mirrored files is **three lines**, and they are the one
declared diff:

```
209c209
<   if (import.meta.env.DEV) {
---
>   if (__DEV__) {
```

The M1 note about "two `import.meta` mentions surviving in prose" is **closed**:
`c772111` reworded both, and `grep -rn "import\.meta" src/features/pac-playbook
src/lib/playbookErrors.ts` now returns **nothing** outside `MIRROR.md`'s own
explanation of the diff.

### 0b · The chalk edge — BLOCKED, and not by anything this repo controls

§ E2 Fix 3 asked for the doodles' chalk-edge filter to be inlined per mark,
because `SvgXml` drops a `url(#…)` that resolves in a different root. **That
half is done and proved** — `src/features/pac-playbook/doodleChalk.ts`,
`withChalkEdge()`, puts a `<defs>` inside each mark's own root and the filter
reference on the mark's root `<g>`, which is exactly what the web gets from its
separate `<svg class="pbkd-defs">` plus `playbook.css:496-504`.

**It still does not render, for a reason Fix 3 did not know:**

```
node_modules/react-native-svg/lib/module/elements/filters/FeTurbulence.js
node_modules/react-native-svg/lib/module/elements/filters/FeDisplacementMap.js
```

are four-line STUBS in `react-native-svg@15.12.1`. Each `render()` calls
`warnUnimplementedFilter()` and returns `null`;
`react-native-svg/lib/module/lib/util.js:16-18` lists all **fifteen**
unimplemented primitives, these two among them. So the filter resolves to an
empty one and the mark draws as the plain stroke. `feGaussianBlur` IS
implemented, which is why the heat field's blur has worked since M2.

**Confirmed on the simulator**, not only in source: `docs/recon/m3-looks/`
`14-doodle-card-F1.png` and `15-doodle-card-P1.png` show clean, unbroken
strokes and perfectly regular dashes.

**NOT-COMPARED against the web.** The web dev server IS up (`localhost:8080`
answers 200), but there is no browser tool on this machine to render it, and
`WebFetch` refuses hostnames without a dot. The library-source proof above is
stronger than a visual diff would have been, so it stands in its place.

**The code stays.** It costs one regex, nothing at runtime, and one `warnOnce`
dev-console line; it is the only half of the answer this repo controls; and it
is already correct for the day the primitives land. **No hand-rolled chalk
texture was invented** — jittered path data, a noise image or a doubled offset
stroke would give mobile an edge the web does not have, out of a design the web
owns. That is a web-first decision, not this room's.

**Options, for the planning room** (tracked as `PLAYBOOK-CHALK-EDGE-UNSUPPORTED`):

1. **Accept the plain stroke on mobile.** Zero cost, one visible difference
   from the web. The marks already read as chalk sketches — see the looks.
2. **Drop the chalk edge on the web too**, so both apps are plain. One ruling,
   one web change, and the mirror stays honest. Lu's 2026-10-29 verdict was
   about VISIBILITY ("I hardly see them"), which the 0.40 opacity fixed; the
   edge is a separate, finer thing.
3. **Bake the edge into the art.** Pre-displace the 13 path strings once,
   offline, in the web repo, so both apps get a crumbly stroke with no filter
   at all. Mirror-safe, but it freezes the noise seed into the design.
4. **Wait for `react-native-svg`.** No work, no promise.

---

## 1. The inventory — web → mobile file map

**The count is 1 shell + 6 screens + 3 panel FILES (4 panel components).** That
is the web reader as it stands at `c772111`, and it matches
`playbook-mobile-recon.md` § E's list exactly — no drift to report.

### Shell and chrome

| Web (`thrive-and-score` @ `c772111`) | Mobile | Kind | Lines |
|---|---|---|---|
| `PlaybookReader.tsx` | `PlaybookScreen.tsx` | rebuild | 571 |
| `PlaybookHeader.tsx` | `PlaybookHeader.tsx` | rebuild | 232 |
| `Doodles.tsx` | `Doodles.tsx` | rebuild | 117 |
| `Fmt.tsx` | `Fmt.tsx` | rebuild | 39 |
| `playbook.css` (556 rules) | `styles.ts` + `ui.tsx` | rebuild | 1267 + 314 |
| — | `doodleChalk.ts` | **new, mobile-only** (act 0b) | 92 |
| `diagram/DiagramBoard.tsx` (board **and** chrome) | `DiagramBoard.tsx` (M2, board only) + `CardBoard.tsx` (chrome) | M2 + rebuild | 237 + 160 |
| `diagram/DiagramBoard.tsx` → `StillBoard` | `StillBoard.tsx` | rebuild | 152 |

### The six screens

| Web | Mobile | Lines | Note |
|---|---|---|---|
| `screens/CoverScreen.tsx` | `screens/CoverScreen.tsx` | 161 | cover art redrawn as `react-native-svg` components, coordinate for coordinate |
| `screens/ContentsScreen.tsx` | `screens/ContentsScreen.tsx` | 259 | index **and** search results, one screen two bodies, as on the web |
| `screens/ChapterScreen.tsx` | `screens/ChapterScreen.tsx` | 127 | |
| `screens/CardScreen.tsx` | `screens/CardScreen.tsx` | 442 | the five-way board branch is the web's |
| `screens/ChapterEndScreen.tsx` | `screens/ChapterEndScreen.tsx` | 236 | `<select>` → a chip row (no new dependency) |
| `screens/QuizScreen.tsx` | `screens/QuizScreen.tsx` | 380 | four phases: entry · countdown · run · result |

### The three panel files (four components)

| Web | Mobile | Lines | Components |
|---|---|---|---|
| `panels/PositionsPanel.tsx` | `panels/PositionsPanel.tsx` | 151 | `PositionsPanel` |
| `panels/FormationPanels.tsx` | `panels/FormationPanels.tsx` | 126 | `FormationPanel`, `NumbersPanel` |
| `panels/MovementPanel.tsx` | `panels/MovementPanel.tsx` | 388 | `MovementPanel` |

### Data layer (adapt — plain TypeScript, ports directly)

| Web | Mobile | Lines | What changed |
|---|---|---|---|
| `rpc.ts` | `rpc.ts` | 222 | client import path; same 13 functions, same tables, same columns |
| `strings.ts` | `strings.tsx` | 194 | dictionary verbatim; language source is feature-local (E-R4 = A) |
| `usePlaybookBook.ts` | `usePlaybookBook.ts` | 237 | `+ offline` parameter |
| `usePlaybookProgress.ts` | `usePlaybookProgress.ts` | 122 | `+ offline`; the write is a TODO |
| `useQuizRun.ts` | `useQuizRun.ts` | 347 | `window.*` → RN globals; `matchMedia` → `AccessibilityInfo`; both writes are TODOs |

### Dev-only

| Mobile | Lines | What |
|---|---|---|
| `dev/PlaybookDevHarness.tsx` | 510 | M2's board harness **+ the "Open reader" entry** and its deep-link params |
| `dev/offlineBook.ts` | 268 | the whole book as rows, mapped from the frozen file by the seed script's own mapping |
| `dev/pac-playbook-v2-FINAL-data.json` | 352 KB | byte-identical copy of the web's frozen content file (see `MIRROR.md`) |
| `dev/fixtures.ts` | 825 | M2's three board fixtures, untouched |

**New this milestone: 20 files, ~5,100 lines.** No new dependency, no
`package.json` change, no migration, no RPC change, no navigation-file edit.

---

## 2. Every TODO(M-later) — the write points

M3 is READ/RENDER ONLY. **Four writes** exist as functions in `rpc.ts` and are
called by nothing; each call site shows the web reader's own state and a
labelled sentence. There are **11 `TODO(M-later)` markers** in the tree — 5 at
the call sites below, 6 in file headers pointing at them.

| # | RPC | Where the call belongs | What M3 shows instead |
|---|---|---|---|
| 1 | `playbook_set_got_it` | `usePlaybookProgress.ts:108` | the tick applies optimistically and stays; R-5's rollback branch is written out beside it, unexecuted |
| 2 | `playbook_start_quiz` | `useQuizRun.ts:184` | the entry screen's status line: *"The quiz is not connected yet — coming in a later step."* / *"El quiz aún no está conectado…"* — the slot the web uses for a server refusal |
| 3 | `playbook_submit_quiz` | `useQuizRun.ts:257` | the results screen with the same sentence in place of a score, which is R-5's own behaviour for a refused submit |
| 4 | `playbook_send_question` | `screens/ChapterEndScreen.tsx:118` | *"Sending is not connected yet — coming in a later step. Your message is kept."* The empty-draft guard still fires first. |

**The six reads ARE wired** and go through the real `rpc.ts`:
`fetchBook`, `fetchClubCrest`, `fetchChapters`, `fetchCards`, `fetchBlocks`,
`fetchProgress`, `fetchQuizResult`, `fetchViewerKind`, `fetchMyQuestions`.
None has been exercised against prod — **the agent's look ran entirely on the
offline fixture**, and no prod DB access was made in this session.

**Each of the three hooks takes one `offline` parameter.** The real route passes
nothing and every `offline` branch is one `if` at the top. That is the ONLY
difference between what the harness mounts and what M4 will register.

---

## 3. What M4 needs

**Route name.** `Playbook`. `linking.ts` already reserves
`Playbook: { card?: string }` in the recon's plan; the shell reads `card` as a
prop and nothing else.

**Entry-point props.** `PlaybookScreen` takes:

```ts
{ card?: string;        // the web's ?card=, the only real route param
  offline?: PlaybookOffline }   // __DEV__ harness only — M4 passes nothing
```

A navigator entry is therefore `{(props) => <PlaybookScreen card={props.route.params?.card} />}`,
and the lazy import is the same shape as the harness's:
`lazy(() => import('../features/pac-playbook/PlaybookScreen'))`.

**The player id** comes from `useAuth().currentRole` inside the shell —
`entity_id` when `role` is `player` or `parent` (ruling R-4), `null` otherwise,
which is R-1's read-only book. M4 passes nothing for it.

**Harness status.** KEPT and untouched as a decision —
`PLAYBOOK-DEV-HARNESS` says keep-or-delete is M4's call. M3 only ADDED to it:
one "Open reader" entry and the deep-link parameters below. All three of M2's
gates still hold (`__DEV__ ? lazy(…) : null`, the `__DEV__`-guarded
`RootStack.Screen`, the `__DEV__`-guarded linking path) and are proved by the
bundle greps in § 5.

**The lazy rule (§ E3) is intact.** Nothing under `src/features/pac-playbook/`
is imported from the root layout, a tab layout or a provider. The proof is
stronger than a grep: the production entry-bundle CONTENT HASH is
`90794d1bbeaea43b1a1b75a71d506e6e`, **byte-identical to M2's**, so the module
graph did not move at all — not for the 20 new files and not for the 352 KB
JSON. M4 must re-check that hash after it adds the route; it SHOULD move then,
because `AppNavigator.tsx` and `linking.ts` are themselves modules in the graph.

**The deep-link parameters** the harness now understands (all `__DEV__`, all
inside the feature folder — `linking.ts` was NOT edited, because a query string
does not affect the path match and the harness parses its own URL with
`expo-linking`):

```
thryvyng://playbook-dev                           the board harness
  ?open=reader                                    the reader, on its cover
  &screen=home|chapter|card|chend|quiz            which screen
  &ch=<chapterKey>  &id=<cardKey>                 which one
  &q=<text>                                       contents, already searching
  &start=1                                        start the quiz
  &autoplay=1                                     play it through to the results
  &y=<points>                                     scroll down (boards below the fold)
  &lang=es                                        open in Spanish
  &dz=1|3                                         doodle strength preview
```

They exist because **there is no way to tap a simulator from a shell on this
machine**: `xcrun simctl` has no tap verb and neither `idb` nor `cliclick` is
installed. Lu's own look in M5 taps; this makes the agent's look reproducible.

---

## 4. Decisions taken inside M3, and what they cost

Each of these was a platform forcing a choice. None changes the design.

**`.cta` is inline, not sticky** (`PLAYBOOK-MOBILE-CTA-NOT-STICKY`).
`position:sticky` has no RN equivalent and each screen owns its own footer. The
ORDER on screen is unchanged — footer last, foot doodle band just before it —
but on a long card the buttons are reached by scrolling rather than always
present. Lu's M5 look is the right place to judge it.

**The header is a sibling of the scroller, not sticky.** Same result by simpler
means: it cannot scroll away.

**Static beats read ALL ON** (`PLAYBOOK-STATIC-BEATS-ALL-ON`). The web lights a
beat cell when `tt >= beat.at`; the finished picture is `tt = total`, past every
beat, so the web's own reduced-motion hold branch lights them all too. It is
honest for a finished picture and it carries no information. Whether a static
board should instead show the row plain is a **web-first** question.

**The movement panel keeps its drag, and does NOT re-parse per frame.** The web
assigns a fresh SVG string to `innerHTML` 60×/s. Handing that to `SvgXml` means
a full XML parse per frame — the cost E-R2 = A exists to avoid. So the board is
split where the cost is: the pitch backdrop is the mirrored `backdrop()` parsed
ONCE through `SvgXml`, and the players, role tags and ball are
`react-native-svg` COMPONENTS over it, sharing the viewBox. A drag moves props
on existing native views. `mvBlend()` — the teaching — is the web's, line for
line. Shapes and attributes are `mvSVG()`'s exactly.

**`StillBoard`'s hit test is geometric, with slack.** The web walks the DOM
(`closest('[data-el]')`); `SvgXml` drops `data-el` and RN has no DOM. So the
tap converts to viewBox units and the nearest `pos-*` element within its own
drawn radius + `TAP_SLACK = 2.2` units wins. The slack is the one number the web
does not have: a `pos-*` dot is `size: 3.1` in a 100-wide viewBox, about 21pt on
a 343pt column, under the 44pt a finger wants. Nearest-wins keeps it
unambiguous. **It is a separate component from M2's `DiagramBoard` on purpose** —
that one answers a quiz by the rule the SERVER regrades with, and M3 did not
touch it.

**The chalkboard texture is not carried.** Four stacked gradients with two
`repeating-linear-gradient` weaves; `color.slate` is the flat colour underneath.
A rebuild question for a later look, not a token.

**Smaller omissions, all of them CSS features with no style-object form, none
carrying meaning:** the tape strip's `clip-path` torn edge (it keeps colour,
rotation and shadow); the `::before`/`::after` tape scraps on `.board` and
`.cover-how`; the gradient fade on the `.ul` underline sweep (it is a flat 2pt
rule); `:hover`. Listed in `styles.ts`'s header so they are not rediscovered.

---

## 5. Proof

### Static

| Gate | Result |
|---|---|
| Mirror `diff` vs web `c772111` | 8 files silent, `doodleArt.ts` **exactly one hunk, `209c209`** — 3 lines of output |
| Dev data file vs web's frozen JSON | `diff -q` silent — **byte-identical** |
| `npx tsc --noEmit -p tsconfig.json` | **5 = baseline.** All 5 pre-existing in `src/components/games/`; **0 in any new file** |
| `ESLINT_USE_FLAT_CONFIG=false npx eslint <27 touched files>` | **0 errors**, 28 warnings (24 `react-native/no-inline-styles`, 4 `no-console` — the `console.warn`s are the web's own) |
| `eslint src --ext .ts,.tsx` | 3 errors / 1961 warnings vs the M1/M2 baseline 3 / 1933 — **errors unchanged** |
| `npx expo export --platform ios` | **exit 0**, 1 bundle, **0 split bundles** |

### The production bundle contains no Playbook

Entry bundle `index-90794d1bbeaea43b1a1b75a71d506e6e.hbc` — **the same content
hash as M2's**, so the module graph did not move.

```
playbook-dev 0 · PlaybookScreen 0 · pac-playbook 0 · CoverScreen 0
MovementPanel 0 · pbkd-chalk 0 · playbook_books 0 · offline-pac-playbook 0
"The simple game" 0 · "Open the playbook" 0 · "Move as one" 0
join-team 1   ← positive control, so the grep method is sound
```

(`feTurbulence` returns 1, from `react-native-svg/lib/module/xmlTags.js` — the
library's own SVG tag table, already in M2's bundle.)

### The simulator look — AGENT evidence, iPhone 17 Pro / iOS 26.2

`docs/recon/m3-looks/`, one PNG per screen and panel, each `sips -Z 600`:

| File | What |
|---|---|
| `harness.png` | the board harness with the new **Open reader** entry (7 chapters · 69 cards · 51 diagrams · 8 dealt Q · 8 got it) |
| `01-cover.png` | cover — tape, stamp, title, how-to-use, chapter chips, byline |
| `02-contents.png` | contents — search box, per-chapter progress bars, quiz row, Continue |
| `03-contents-search.png` | the same screen's **search results** body |
| `04-chapter.png` | a chapter's card list with sub-topic sections |
| `05-card.png` | card `F3` — parent note, crumb, pips, title block, the board **with its F3 side band** |
| `06-chapter-end.png` | questions & notes — the About chip row, the form, the thread with a coach reply |
| `07-quiz-entry.png` | the quiz entry |
| `08-quiz-run.png` | a question, its three options, the timer, the coach line |
| `09-quiz-result.png` | the results — **GOLD, 8 / 8**, pips, Play again |
| `10-panel-positions.png` | **PositionsPanel** — the heat map, blurred, over the full pitch |
| `11-panel-formation.png` | **FormationPanel** — 4-3-3, tap-a-number, the role panel |
| `12-panel-numbers.png` | **NumbersPanel** — the synthesised board and the shirt-numbers table |
| `13-panel-movement.png` | **MovementPanel** — 11 players, role tags, the ball and its halo |
| `14-doodle-card-F1.png` | card `F1`, carrying the **thirdman** mark |
| `15-doodle-card-P1.png` | card `P1`, carrying the **press** mark, green-accented |
| `16-card-es.png` | card `F0` in **Spanish** — header, crumb, title, the verbs grid and the DIAGRAM all redrawn |
| `17-doodle-dz3.png` | the `__DEV__` `?dz=3` strength preview |

### Doodle check

* **At least two cards show different marks** — `14` is *thirdman* (three
  players, a pass and a dashed run along a touchline); `15` is *press* (a goal
  mouth with three closing on one), and it carries the green accent arrow. The
  pick is `doodlePlan(screen, pageKey)`, keyed off the page's own identity.
* **No mark outside a card.** Every mark is a row of the scroller, inside the
  460pt column, above the first block — overlap is impossible by construction,
  which is the reason `doodleArt.ts` gives for using bands at all.
* **Chalk-edge filter: NOT VISIBLE.** See § 0b. Strokes are clean and dashes
  perfectly regular in `14` and `15`. NOT-COMPARED against `localhost:8080`
  (no browser tool here); the library-source proof stands in its place.
* The `--pbk-dop` strength is applied as `opacity` on the mark's wrapper —
  `STRENGTH[2]` = 0.40 by default, and `?dz=3` visibly changes it (`17`).

### Not verified

* **Nothing ran against prod.** No `~/.pgpass`, no pooler URL, no RPC call. The
  nine reads in `rpc.ts` compile and are shaped like the web's; **none has been
  executed**. First real fetch is M4's.
* **Nothing was touched by a finger.** Every screen was reached by deep link.
  Taps, drags and the Spanish toggle's own press are **Lu's M5 look**.
* The **movement panel's drag frame rate** is UNKNOWN on a device. The design
  avoids the per-frame parse, but no number was taken.
* `PLAYBOOK-F3B-NO-DIAGRAM` (INFERRED, M2) is unchanged and untested here.

---

## 6. Found on the way

* **`PLAYBOOK-CHALK-EDGE-UNSUPPORTED`** — § 0b. Needs a ruling.
* **`PLAYBOOK-MOBILE-CTA-NOT-STICKY`** — § 4. Needs Lu's eye in M5.
* **`PLAYBOOK-STATIC-BEATS-ALL-ON`** — § 4. Web-first question.
* **`PLAYBOOK-HEADER-TITLE-TRUNCATES`** — in the looks the header reads
  **"PAC Pl…"** whenever a back label is present (`05`, `10`, `13`, `16`). The
  web truncates there too (`text-overflow:ellipsis` on `.hdr .t b`, `max-width:132px`
  on `.hbtn`), so this is the design behaving as written at phone width rather
  than a mobile bug — but standing layout rule **R-G** (Oct 26: text never
  overflows its container) was ruled for exactly this kind of thing, and a title
  cut to two characters is worth a look. **Web-first if it changes.**
