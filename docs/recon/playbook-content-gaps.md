# Playbook content gaps — what new content needs before it can be added

**Recon only. Nothing was built, nothing was changed, no database was touched.**
Read-only pass over `thryvyng-mobile` @ `b129311`, 2026-11-02.

**The question.** Three content asks are on the table for 1.0.20:

1. **F6 "Line of the pass"** — a seventh Foundations card.
2. **FM5v5** — the existing 5v5 rotation card, given **five diagram tabs**.
3. **A brand-new chapter, "Keeper / Portero"** — 5 sections, ~10 cards, one of
   them an **interactive keeper angle board** (drag the ball → shooting
   triangle ball-to-posts, keeper auto-placed on an arc in front of goal on the
   triangle's bisector; second mode: drag the keeper, goal-line coverage shown).

For each: can it be added by **inserting rows**, or does it need **code**?

**Scope note.** This repo carries **no playbook schema** —
`supabase/migrations/` holds exactly one file
(`20250224000000_notify_lineup_published.sql`), and the eleven `playbook_*`
tables, the six RPCs and the seed live in the **web repo**
(`thrive-and-score`), which was **out of scope for this pass and was not
read**. Every statement below about the tables is sourced from this repo's own
code and its cited line references, not from the DDL. Anything that would need
the DDL to answer is marked **UNKNOWN (web repo)**.

---

## Q1. Where does Playbook content come from at runtime? — **DB-ONLY**

**Verdict: the database, and nothing else, on every shipping path. A new card
is rows only.**

All content is fetched from five tables through one file:

| What | Table | Proof |
| --- | --- | --- |
| the book | `playbook_books` (by slug `pac-playbook`) | `src/features/pac-playbook/rpc.ts:45,77-83` |
| chapters | `playbook_chapters` | `rpc.ts:102-108` |
| cards | `playbook_cards` (`published = true`, ordered by `sort`) | `rpc.ts:110-117` |
| figures | `playbook_blocks` | `rpc.ts:123-126` |
| club crest | `public_clubs` view | `rpc.ts:94-100` |

Two-stage load: chapters + cards first, blocks only once a card screen asks
(`usePlaybookBook.ts:155-196` then `:206-225`; `PlaybookScreen.tsx:280`).

**The bundled JSON is `__DEV__` only and ships in no build.**
`src/features/pac-playbook/dev/pac-playbook-v2-FINAL-data.json` (352 KB) is the
frozen content file the prod seed was generated from, mapped to row shapes by
`dev/offlineBook.ts` and reachable only through the harness deep link behind
three `__DEV__` gates. The mirror manifest states this explicitly —
`src/features/pac-playbook/MIRROR.md`, last table row: *"data, not code, and it
ships in no build."* `usePlaybookBook.ts:145-151` takes the whole book as the
optional `offline` argument; the real route passes nothing.

So a new card = one `playbook_cards` row (+ a `playbook_blocks` row if it has a
figure). No code, **provided** the figure uses element types the renderer
already draws (Q5) and the card is not one of the five special `kind` values
that route to a panel (Q4).

**Caveat — the frozen JSON will drift.** It is mirrored byte-identical from the
web repo (`MIRROR.md`, last row). New content added by DB insert alone will
**not** appear in it, so the `__DEV__` harness will show an older book than the
device does. That is cosmetic for the harness but it breaks `MIRROR.md`'s
one-command drift check, so the web repo's copy should be updated in the same
pass that seeds the rows.

---

## Q2. Can a new CHAPTER with sections be added by DB only? — **DB-ONLY**

**Verdict: yes. Chapters and sections are not enumerated anywhere in code — no
routes, no icon map, no order list, no contents-screen table.**

* **One route for the whole book.** `PlaybookScreen.tsx:79-85` —
  `Nav = {screen:'chapter'; ch: string} | {screen:'card'; id: string} | …`.
  Which screen is open is component state (ruling R-2, `PlaybookScreen.tsx:2-6`),
  and the only registered route is `Playbook` (`src/navigation/AppNavigator.tsx:350`,
  gated on `src/constants/playbookLaunch.ts:55-58`). A new chapter adds **no**
  navigator entry.
* **The contents screen maps the rows.** `ContentsScreen.tsx:191-221` —
  `chapters.map(...)`, number from `c.n`, name/learn from `c.content`, progress
  computed from the cards that claim the chapter key.
* **The cover maps the rows.** `CoverScreen.tsx:157-165`.
* **Sections (`content.subs`) map the rows.** `ChapterScreen.tsx:53,111-133`;
  a chapter with no `subs` falls through to one flat list (`:131-133`).
* **Only two chapter keys appear in code, and neither blocks a new chapter:**
  * `CardScreen.tsx:209` — `card.chapter_key !== 'mind' && card.key !== 'FM5v5'`
    decides whether a card with no figure shows the "Diagram pending" panel.
    A new chapter is **not** in that list, so **every keeper card without a
    figure will show "Diagram pending"**. Either every keeper card gets a
    figure, or that line needs the keeper key added (~1 line).
  * `CardScreen.tsx:288` — `chapter_key === 'gears' ? 'call' : 'cue'`, the cue
    chip's label. Keeper cards get "cue", which is correct.
* **`playbook_cards.style` is fetched (`rpc.ts:112`) and never read** by the
  mobile reader — `grep` for `card.style` in the feature returns nothing. The
  renderer branch is driven by `content.kind` (`CardScreen.tsx:183`). Setting
  `style` on a new row is harmless and has no effect.

### Two cosmetic ceilings a 5-section chapter will hit

Both are **by design and both cycle**, so nothing breaks — section 5 just looks
like section 1.

* **Tones: 4.** `theme.ts:132-137` has green / sky / teal / periwinkle;
  `type.ts:106-109` cycles by `position % 4`. A 5-section chapter gives sections
  1 and 5 the same green rail. (Chapter 2 already has 6 sections and cycles —
  the frozen JSON's `principles` carries `possession, defending, switches,
  structure, fingerprints, pressing` — so this is existing, accepted behaviour,
  not new.)
* **Section icons: 4.** `ui.tsx:151` — `slot = position % 4` (ball, shield,
  arrows, …). Section 5 repeats the ball.

Fixing either is small (see the code list, item **C2**) but both files are
mobile-only rebuilds and the web has its own rail — so a 5th tone/icon is a
**declared fork or a web-first change**, not a quiet edit.

---

## Q3. Diagram frames/tabs — how many, and what's needed for 5? — **NEEDS CODE**

**Verdict: there is no tab UI at all, and the board draws exactly one frame —
the last one. Five tabs is new UI.**

* **The type already allows N frames.** `diagram/types.ts:69-73` —
  `frames?: { cap?: Bilingual; d: Diagram }[]`, an unbounded array (the comment
  says "two-frame cards", the type does not).
* **The board draws the LAST frame and only that.**
  `DiagramBoard.tsx:144-146` — `block.frames[block.frames.length - 1].d`.
  Same choice in `tapTarget.ts:24` (mirrored), `PositionsPanel.tsx:99`,
  `FormationPanels.tsx:51,97`.
* **There is no crossfade on mobile.** `crossfade` appears in exactly one place
  in the whole feature — the type declaration, `diagram/types.ts:72`. Nothing
  reads it. Mobile boards are **static by ruling E-R2 = A**
  (`DiagramBoard.tsx:5-13`): one `SvgXml` parse, the finished picture, no rAF
  loop. So the web's two-frame crossfade is not something mobile has and would
  need extending — mobile never had it.
* **The caption is the last frame's.** `CardBoard.tsx:96-99`.
* **Today's data: 6 of 38 diagrams carry frames, and all 6 carry exactly 2** —
  `F1, F4, PL1, P17, P11, GF7` (counted from the frozen JSON; histogram
  `{0 frames: 32, 2 frames: 6}`). So "5 frames" has no precedent in the data
  either.

### What 5 tabs needs

1. `DiagramBoard.tsx` — a `frame?: number` prop, defaulting to last, replacing
   the hardcoded `length - 1` at `:144-146`. **~10 lines.** The default must
   stay "last" because `tapTarget()` (mirrored, `tapTarget.ts:24`) and the
   server's regrade read the last frame — the picture and the hit test must not
   disagree (`DiagramBoard.tsx:24-26`).
2. `CardBoard.tsx` — a tab row, `useState` for the selected frame, the selected
   frame's `cap` instead of the last frame's (`:96-99`). **~50 lines.** Style
   precedent exists and can be reused rather than invented: the chip row
   `pbk.mvchips` / `pbk.mvchip` / `pbk.mvchipOn` (`MovementPanel.tsx:183-196`)
   or `pbk.segrow` (`styles.ts:895-896`). New styles for a 5-up row: **~20
   lines** in `styles.ts`.
3. A decision, not code: `CardBoard.tsx:97` blanks the beats row for a frames
   card (`beats = frames ? [] : …`). Five tabs and a beats row are two
   different ways to say "there are steps"; keeping beats blank is consistent.
4. **FM5v5's own route to the board.** It is currently `kind: 'formation'`,
   `sub: 'v5'` with **no formation block and no diagram** — which is why it is
   hardcoded out of the "Diagram pending" panel at `CardScreen.tsx:209`.
   Two ways in, and they are not equal:
   * **Recommended** — make it a plain diagram card (`content.kind = ''`) with a
     `playbook_blocks` row of kind `diagram` keyed `FM5v5`. It then renders
     through `CardBoard` (`CardScreen.tsx:197`) and gets the tabs from item 2.
     The `card.key !== 'FM5v5'` clause at `:209` becomes dead and should be
     removed (**1 line**).
   * Keep `kind: 'formation'` — then `FormationPanel` renders it
     (`CardScreen.tsx:190-193`) and that panel also takes only the last frame
     (`FormationPanels.tsx:51,97`), so the same frame prop has to be threaded
     through two more call sites (**~10 lines**) and the tabs have to be built
     into the formation panel too. More code for the same picture.

All of 1–3 are in **mobile-only rebuild files** (`DiagramBoard.tsx`,
`CardBoard.tsx`, `styles.ts` — `MIRROR.md`, "Not mirrored"), so they do not
need a web-first pass.

---

## Q4. How is MV2 "Move as one" built, and can a keeper board reuse it? — **NEEDS CODE (new component)**

**Verdict: MV2 is a bespoke panel. The keeper board cannot reuse it — the data
shape and the maths are wrong for the job — but it should copy its rendering
technique exactly, because that technique is what makes a drag affordable on
mobile.**

### How MV2 works

* **Component:** `src/features/pac-playbook/panels/MovementPanel.tsx` (388
  lines), reached by `CardScreen.tsx:196` —
  `kind === 'movement' && blocks.movement`.
* **Gesture library: none.** Raw React Native responder events —
  `onStartShouldSetResponder` / `onMoveShouldSetResponder` /
  `onResponderGrant` / `onResponderMove` (`MovementPanel.tsx:227-235`), each
  one `setBall(pointAt(locationX, locationY))`, clamped 4..96 / 4..136
  (`:137-144`). **`react-native-gesture-handler` is not a dependency of this
  repo** (`grep -c gesture-handler package.json` → 0; absent from
  `node_modules`). Adding it would be a **new dependency = SACRED**. Nothing
  here needs it.
* **The rendering split — this is the part worth copying.**
  `MovementPanel.tsx:22-38`: the pitch backdrop is the mirrored renderer's
  string, parsed **once** through `SvgXml` (`:77,238-243`); the players, tags
  and ball are **`react-native-svg` components** in a second `<Svg>` over it
  sharing the viewBox (`:245-330`). A drag moves props on existing native
  views — no string, no XML parse per frame. That is what lets this one panel
  keep its drag while every card board stays static.
* **Data shape:** `MovementBlock` (`types.ts:194-203`) — `roles`, and `modes[]`
  of `{id, phase, name, desc, keys[]}` where each `MovementKey`
  (`types.ts:186-192`) is a ball position plus a full `pos` map of every
  player. The shape under the finger is `mvBlend` (`:80-107`): nearest keyframe
  inside 0.6 units, else inverse-square-distance blend. **It is a keyframe
  interpolator, mirrored line-for-line from the web** (`:9-11`) — the teaching
  itself, not to be changed.

### Why the keeper board is a new component

The keeper board is **computed geometry**, not interpolated keyframes: the
shooting triangle is `ball → left post → right post`, and the keeper's spot is
the intersection of that triangle's bisector with an arc. That is a formula with
no keyframes in it, so `MovementBlock` has nothing to carry and `mvBlend` has
nothing to blend. A `kind: 'movement'` card cannot express it, and the singleton
block slot makes it worse: `PlaybookBlocks.movement` is **one** block for the
whole book (`types.ts:253-259`, `usePlaybookBook.ts:111`) — there is no room for
a second movement block even if the shape fitted.

**So: a new panel component, modelled on `MovementPanel`'s structure (chips for
the two modes, split SvgXml backdrop + live `react-native-svg` overlay,
responder drag, caption panel below) with its own geometry in place of
`mvBlend`.**

### Files touched — estimate

| File | Change | Rough size |
| --- | --- | --- |
| `panels/KeeperAnglePanel.tsx` | **new** — two modes, drag, triangle, arc, coverage bar | **250–350 lines** |
| `screens/CardScreen.tsx:188-197` | one branch in the existing five-way `kind` dispatch | ~3 lines |
| `usePlaybookBook.ts:106-112` | index the new block kind | ~1 line |
| `types.ts:60,253-259` | `BlockRow['kind']` + `PlaybookBlocks` slot + the block's own interface | ~15 lines — **MIRRORED, web-first** |
| `search.ts:53-64` | a branch so the card's words are searchable | ~3 lines — **MIRRORED, web-first** |
| `styles.ts` | the panel's styles | ~40 lines |

**Six files, ~320–420 lines, two of them mirrored.** `types.ts` and `search.ts`
are byte-identical mirrors of the web's (`MIRROR.md`), and the editing rule is
explicit: *"a change to any file below is made in the web repo first, then
re-mirrored here."*

**A way to avoid the keeper block entirely, and it is worth considering.** If
the keeper board needs **no stored data** — the posts come from the backdrop,
the arc radius and the two mode labels can be constants in the component, and
the teaching text is already card content (`see` / `do` / `cue`) — then it needs
no `playbook_blocks` row, no new block kind, and **neither mirrored file
changes**. That drops the estimate to **three files (new panel + one dispatch
branch + styles), ~300–390 lines, zero web-first work.** The cost is that the
arc radius is not tunable from the database. **Recommend this unless Lu wants
the numbers editable.**

---

## Q5. Diagram elements the keeper cards would want — what exists, what's missing

**Verdict: the goal backdrop exists; a true polygon fill and a true arc do
not.**

The renderer's full vocabulary, from `diagram/renderDiagram.ts`:

| Need | Status | Proof |
| --- | --- | --- |
| **goal backdrop** | **EXISTS, two of them.** `zoom-goal` (goal at the bottom) and `zoom-goal-top` (goal at the top) draw a 6-yard box, a goal line and a D arc | `renderDiagram.ts:110-115` and `:116-121`; type `diagram/types.ts:15-20`. Both are in use today — the frozen JSON has 6 `zoom-goal` and 16 `zoom-goal-top` diagrams |
| **zone / area fill** | **PARTIAL — axis-aligned rectangle only.** `zone` draws `<rect>` from `x, y, w, h` with `rx=1.5`, default opacity .14, drawn under everything | `renderDiagram.ts:193-199`. 10 `zone` elements in the data (F3's thirds, the four gear bands, P16) |
| **arbitrary polygon** | **MISSING.** The only polygon the renderer emits is `cone` — a **symmetric isoceles fan**: apex at the element, direction `to`, half-angle `spread` (default 30°), length `len` (default 8). It cannot express a ball-to-two-posts triangle unless the ball happens to sit on the goal's centre line | `renderDiagram.ts:200-208` |
| **arc / ring** | **PARTIAL — full circle only.** `ring` is a complete dashed circle (`stroke-dasharray="2.6 2.2"`), radius `size`. There is **no arc-segment element** — no start/end angle, no partial sweep. The only arcs in the renderer are hardcoded inside the two goal backdrops (`A 10 10 0 0 1 …`) | `renderDiagram.ts:281-284` vs `:113,119` |
| **dashed lines** | **EXISTS, two dash patterns.** `reference` = `1.4 2` dashed, themed as the opponent, full-length (no progress); `run` = `2.6 2` dashed | `renderDiagram.ts:226-235` |
| solid line + arrowhead | EXISTS — `pass` (and `option`, dimmed after `until`) | `renderDiagram.ts:212-257` |
| players / opponents / ball | EXISTS, with shirt tags | `renderDiagram.ts:264-280` |
| label / badge / box / xmark | EXISTS, bilingual via `text` / `text_es` | `renderDiagram.ts:285-298` |
| heat blobs | EXISTS, blurred, under the elements | `diagram/heat.ts`; `RenderOptions.heat`, `diagram/types.ts:80` |
| explicit tap target | EXISTS — `target: {x, y, r}` on the block, else derived from the last pass/run | `diagram/types.ts:66`, `tapTarget.ts:21-31`. **Zero diagrams use it today** — all 38 derive |

### What this means for the keeper cards

* **A static keeper card** (not the interactive board) can be built from rows
  today: `zoom-goal` or `zoom-goal-top`, `player` for the keeper, `opponent` +
  `ball` for the shooter, `reference` dashed lines to the posts, `ring` for a
  starting position, `label` for the chalk text. **DB-only.**
* **The shooting triangle as a filled shape cannot be stored as a diagram
  element** — `zone` is a rectangle and `cone` is symmetric.
* **The keeper's arc cannot be stored either** — `ring` is a full circle.
* **Neither matters for the interactive board**, and this is the important
  finding: a board that recomputes the triangle on every finger move cannot be
  static JSON *at all*. It draws `<Polygon>` and `<Path>` as
  **`react-native-svg` components**, the way `MovementPanel` draws its players
  (`MovementPanel.tsx:245-330`). **So the interactive board needs no renderer
  change, and the mirrored, "non-negotiable" `renderDiagram.ts` stays
  untouched** (`MIRROR.md`, "Not mirrored": *"the first is the design
  itself … a fork there is a scoring bug"*).
* **Adding a polygon or arc element to the renderer is therefore not required
  for 1.0.20**, and should not be done casually: `renderDiagram.ts` is
  byte-identical-mirrored and web-first by rule.
* **One coordinate the new panel must copy, not invent.** The goal posts the
  `zoom-goal` chalk draws are at `w/2 ± 9` on `y = h - 3.5`
  (`renderDiagram.ts:112`), in a viewBox of `100 × (d.h || 64)`
  (`geometry.ts:79-81`). The triangle's two fixed vertices have to be those
  exact points or the fan will miss the drawn posts. `MovementPanel.tsx:73-77`
  sets the precedent: re-declare the constant locally with a comment citing the
  renderer's line, rather than editing the mirrored file to export it.

---

## Q6. Quiz — do new questions need code? — **DB-ONLY**

**Verdict: rows only, for every question type the book already uses. There is
no card-id list and no chapter filter in client code.**

* **The server deals and grades.** `playbook_start_quiz` returns the run
  already shuffled; `playbook_submit_quiz` returns the score (ruling R4 —
  `QuizScreen.tsx:4-9`, `rpc.ts:167-182`). The client never picks questions.
* **The selection rules live in the data, not the client.** The frozen JSON's
  `quiz.rules` carries them as prose for the seed: *"shuffle question pool then
  options; never repeat a question within a run; avoid two questions from the
  same card in one run; at most 3 from one chapter"*, with `perRun: 8`,
  `seconds: 60`, `silver: 6`, `gold: 8`. A new chapter's questions enter the
  same pool and the same per-chapter cap with no client change.
* **Questions are keyed by card and chapter key, as strings** — the dealt shape
  is `{key, card_key, chapter_key, type, content}` (`types.ts:207-220`), and
  the client only uses `card_key` to look the card up for its name and its
  "read the card" link (`QuizScreen.tsx:160,309,345,429`). No list to extend.
* **Only `tap` is special-cased client-side.** `QuizScreen.tsx:163-164`
  (`isTap`, and the card's diagram for the board) and `useQuizRun.ts:239,332`.
  The other four types (`do`, `cue`, `read`, `where` — 66 of the 78 questions
  today) are plain option picks. **A new question of any of the five existing
  types is DB-only.** A *sixth* type would need code.
* **A `tap` question on a keeper card needs its target to exist in the
  data.** `tapTarget()` derives the answer from the last `pass`, else the first
  dotted `run` (`tapTarget.ts:26-31`), else returns null — and a null target
  means **every tap is wrong**, on the client and on the server
  (`DiagramBoard.tsx:105-107`). A keeper figure made of `reference` lines and
  `ring`s has **no** pass and no dotted run, so a tap question on it must carry
  an explicit `target: {x, y, r}` on the diagram block (`diagram/types.ts:66`,
  `tapTarget.ts:23`) — **data, not code**, but easy to forget, and nothing in
  the book uses `target` today (0 of 38), so this path is **unexercised in
  production**.
* **The quiz board draws the card's own diagram** (`QuizScreen.tsx:164` —
  `blocks.diagrams[q.card_key]`) through the **static** `DiagramBoard`. A tap
  question against the **interactive keeper panel** is therefore not possible
  as built: the quiz has no route to a custom panel. A keeper tap question
  needs a plain stored diagram on that card. **UNKNOWN whether the keeper board
  card should carry one at all — that is a content decision.**
* **UNKNOWN (web repo):** the `playbook_quiz_questions` row shape and its
  `active` flag. The only mention here is `QuizScreen.tsx:12-14` — the table is
  readable by the book's editors only, because the rows carry the answer key,
  which is why the entry screen shows no "N questions in the bank" count. The
  insert statement itself has to be written against the web repo's DDL.

---

## Q7. Are mobile content tables shared with web? — **YES, same rows, same project**

* **One Supabase project, hardcoded in this repo:**
  `src/lib/supabase.ts:4` — `https://xkabjcxlohseuxlrwdkw.supabase.co`.
* **Same tables, same RPCs, by design and stated in the file that does it:**
  `rpc.ts:5-9` — *"The thirteen functions, their arguments, their selected
  columns and their table names are the web's exactly: both apps hit the same
  eleven `playbook_*` tables and the same six RPCs on the same project, so a
  difference here would be a difference in what the two readers can see."*
* **Same book row:** both fetch by slug `pac-playbook`
  (`rpc.ts:45,77-83`).

**Consequence for this work: a content insert lands in BOTH apps at once.**
There is no mobile-only content path. Anything seeded for 1.0.20 appears in the
web reader the same moment, and a card whose figure needs mobile-only code
(FM5v5's tabs, the keeper board) will render **differently** in the two readers
until the web side is built — the web gets its own last-frame-only board and
its own missing panel. **That split is Lu's call, not a defect**, but it should
be decided before the rows go in.

Related open gap, already on the books: **`PLAYBOOK-TENANT-SCOPE`**
(`docs/ledger.md:641-656`, SACRED, Lu ruled it a real fork) — the book is
fetched by slug and `owner_club_id` is never compared to the viewer's club, so
the Playbook is visible to every tenant's users. New content inherits that
exposure. Not blocking for 1.0.20 while PAC is the only live club.

---

## Code needed for 1.0.20 — the list, with rough size

Sizes are lines of real change, not file sizes. **"web-first"** means the file
is a byte-identical mirror and `MIRROR.md`'s editing rule applies: change the
web repo, re-mirror, update the manifest table. **SACRED** means it stops and
waits for Lu.

### A. F6 "Line of the pass" — **0 lines. DB only.**

A seventh Foundations card is one `playbook_cards` row (`sort` after F5) plus
one `playbook_blocks` diagram row keyed `F6`, using the existing element
vocabulary (Q5). Foundations today is `F0 … F5` (frozen JSON).

*One thing to know:* the two side bands and the I/S/C row are keyed on **card
key** in code — `CardBoard.tsx:45-69` (`F3`, `F4`) and `:143` (`F4`). F6 gets
neither, which is correct for a plain diagram card. If F6 wants a band, that is
**~15 lines** in `CardBoard.tsx` — and `sideBand()` is the web's verbatim
(`CardBoard.tsx:44`), so a mobile-only band is a declared fork.

### B. FM5v5 with 5 diagram tabs — **~80 lines + ~20 lines of styles, mobile-only**

| # | Change | Size |
| --- | --- | --- |
| B1 | `DiagramBoard.tsx:144-146` — `frame?: number` prop, default = last | ~10 |
| B2 | `CardBoard.tsx:96-99` — tab row + selected-frame state + per-frame caption | ~50 |
| B3 | `styles.ts` — a 5-up tab row (reuse `pbk.mvchip` / `pbk.segrow` shapes) | ~20 |
| B4 | `CardScreen.tsx:209` — drop the now-dead `card.key !== 'FM5v5'` clause | 1 |

No mirrored file, no new dependency, no schema change. Data: one
`playbook_blocks` row kind `diagram` keyed `FM5v5` with `frames[5]`, and
`content.kind` cleared to `''` on the FM5v5 card row so it routes to
`CardBoard` (`CardScreen.tsx:197`) instead of `FormationPanel`.

### C. Keeper / Portero chapter — **~320–420 lines, or ~300–390 with no new block kind**

| # | Change | Size |
| --- | --- | --- |
| C0 | the chapter, its 5 sections and ~10 cards, and their static figures | **0 lines — DB only** (Q2) |
| C1 | `CardScreen.tsx:209` — add the keeper chapter key, or give every keeper card a figure, so no card shows "Diagram pending" | ~1 |
| C2 | *optional cosmetic* — a 5th section tone (`theme.ts:132-137`, ~6) and a 5th icon slot (`ui.tsx:151-184`, ~12). Both files are mobile-only but the web has its own rail → **declared fork or web-first** | ~18 |
| C3 | `panels/KeeperAnglePanel.tsx` — **new**: two modes, responder drag, computed triangle, keeper arc, goal-line coverage, caption panel | **250–350** |
| C4 | `screens/CardScreen.tsx:188-197` — one branch in the `kind` dispatch | ~3 |
| C5 | `styles.ts` — the panel's styles | ~40 |
| C6 | *only if the board stores data:* `usePlaybookBook.ts:106-112` index (~1) + `types.ts:60,253-259` block kind, slot and interface (~15, **web-first**) + `search.ts:53-64` searchable words (~3, **web-first**) | ~19, 2 files web-first |
| C7 | quiz questions for keeper cards, existing types | **0 lines — DB only** (Q6) |

**Recommended shape: skip C6.** Put the posts, the arc radius and the mode
labels in the component as constants and let the card's own `see` / `do` / `cue`
carry the teaching. Then nothing mirrored moves, no web-first round trip is
needed, and the whole chapter is **C1 + C3 + C4 + C5 ≈ 300–390 lines in three
files**, plus rows.

### Not needed for 1.0.20, and worth saying out loud

* **No renderer change.** `renderDiagram.ts` has the goal backdrop already, and
  the interactive board draws its own SVG components. Leave the mirror alone.
* **No new dependency.** The drag is RN responder events, as MV2's is; nothing
  wants `react-native-gesture-handler`. (A new dep would be SACRED.)
* **No navigator change.** One route, chapter in state (Q2).
* **No schema change** *if* C6 is skipped. If C6 is taken, a new
  `playbook_blocks.kind` value is **UNKNOWN (web repo)** — whether that column
  is a free-text `text` or a CHECK-constrained enum cannot be answered from
  this repo, and if it is constrained, C6 becomes a **migration = SACRED**.

---

## UNKNOWNs — what this repo cannot answer

1. **`playbook_blocks.kind` — free text or constrained?** Decides whether a new
   block kind is an insert or a **migration (SACRED)**. The DDL is in the web
   repo. *The check: the `kind` column's definition in
   `20261028190000_playbook_v1_schema.sql`.*
2. **`playbook_quiz_questions` row shape** — needed to write the insert.
   `QuizScreen.tsx:12-14` only says the table is editor-readable.
3. **Who writes the rows.** No seed script, no builder and no migration for the
   playbook exists in this repo — `supabase/migrations/` has one unrelated file
   and there is no `scripts/playbook/`. The seed and `build-seed.mjs` are cited
   by `types.ts:9` and `MIRROR.md` as **web-repo** paths. So the insert path for
   all of this content lives there. *The check: `ls scripts/playbook` and the
   migrations directory in `thrive-and-score`.*
4. **Whether the web reader gets the same two features.** Shared rows (Q7) mean
   a tab-less web board and a missing web keeper panel the day the rows land.
