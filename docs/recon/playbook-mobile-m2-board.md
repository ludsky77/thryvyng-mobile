# Playbook mobile M2 — DiagramBoard on `SvgXml`, static, geometric hit test

Written 2026-10-30 in `thryvyng-mobile`. This is the "M2 done" note the M2
prompt asked to append under **§ E2** of `docs/recon/playbook-mobile-recon.md`.
**That file lives in the WEB repo** (`thrive-and-score/docs/recon/`) and the M2
prompt's FORBIDDEN line says *"Web repo untouched"*, so the note lands here
instead and the § E2 append is **owed** — the M2 report carries it PASTE
VERBATIM. Nothing in this file contradicts § E2; it answers its three fixes.

## What shipped

| File | What it is |
| --- | --- |
| `src/features/pac-playbook/DiagramBoard.tsx` | **new** — the mobile board. Props: `block`, `lang`, `heat?`, `dim?`, `target?`, `onTap?`. One `<SvgXml>` over `render(...)`'s own string. |
| `src/features/pac-playbook/dev/PlaybookDevHarness.tsx` | **new, `__DEV__` only** — 3 boards, EN/ES, HIT/MISS readout, 2 synthetic taps, 1 doodle probe, 1 animate probe. |
| `src/features/pac-playbook/dev/fixtures.ts` | **new** — 3 real diagrams + real heat blobs, copied out of the web's frozen data file. |
| `src/navigation/AppNavigator.tsx` | `__DEV__`-gated lazy screen + `__DEV__`-gated `RootStack.Screen`. |
| `src/navigation/linking.ts` | `...(__DEV__ ? { PlaybookDev: 'playbook-dev' } : {})` + a types-only param entry. |

**The mirrored files were not touched.** `diff -q` is still silent on all
eight and `doodleArt.ts` still returns exactly one hunk. `DiagramBoard.tsx`
is **not** a mirror — the recon's own plan lists it as *adapt*, and
`MIRROR.md` says so under "Not mirrored".

## The `preserveAspectRatio` choice — `xMidYMid meet`, passed explicitly

The conversion from a touch to viewBox units is only exact if the laid-out box
and the viewBox agree about aspect ratio, so this is stated rather than
assumed.

* `render()` emits `<svg viewBox="0 0 w h">` with **no `preserveAspectRatio`
  attribute** (`diagram/renderDiagram.ts:233`). The web therefore gets the SVG
  **default, `xMidYMid meet`**.
* The web's CSS gives the box the viewBox's own aspect ratio —
  `.pbk .board svg{display:block;width:100%;height:auto}`
  (`playbook.css:125`). With the box aspect equal to the viewBox aspect,
  `meet` is a **pure uniform scale with zero letterboxing**, which is why the
  web's `((clientX - r.left) / r.width) * vb.width`
  (`screens/QuizScreen.tsx:130-134`) is exact.
* Mobile reproduces both halves. The wrapper `View` carries
  **`aspectRatio: w / h`** from the renderer's own `dims()`, and
  `preserveAspectRatio="xMidYMid meet"` is passed **as a prop** on `<SvgXml>`
  rather than left to a default — `SvgXml` spreads its props over the parsed
  root (`react-native-svg/src/xml.tsx:50-75`), so the prop wins and the value
  cannot drift if a future `react-native-svg` changes its own default.

Conversion, therefore: `vx = (locationX / layout.width) * w`,
`vy = (locationY / layout.height) * h` — the web's formula with `locationX`
standing in for `clientX - rect.left`. Both are "offset inside the box"; React
Native hands that over directly.

## Static, not animated — ruling E-R2 = A, and what "static" means exactly

The board draws `render(d, null, …)`. `null` is the renderer's own documented
value for "show the finished picture" (`renderDiagram.ts:13`) and is what the
web's own quiz tap board already passes (`QuizScreen.tsx:184`).

It is **equivalent to the web's reduced-motion `draw(total)` hold branch**, and
that was checked term by term rather than assumed. At `tt = total`:

* every element's `prog()` is clamped to 1, because `diagTotal()` is
  `max(at + dur) + hold`;
* every `option`'s `until` has already passed, so its opacity is the same
  `0.2`;
* `el.cue`'s pulsing ring is drawn only while `0 < p < 1`, so it is absent in
  both;
* a `ring`'s `progLin` is clamped to 1 in both.

`null` is used instead of `diagTotal(d)` because it cannot drift with the clock
and needs no second source for the total.

**A two-frame card shows its LAST frame**, which is the frame `tapTarget()`
also reads (`diagram/tapTarget.ts:25`). The picture and the hit test must never
disagree about which frame is on screen.

**One parse per content change.** The string is memoized on
`[shown, lang, heat, dim, target]`, and `SvgXml` memoizes its own `parse()` on
the string identity, so a re-render that does not change the content does not
re-parse.

### The animate measurement — taken, and it settles E-R2 on numbers

The harness's ANIMATE probe runs the web's **shape** of loop: a fresh
`render(...)` string into `<SvgXml>` every frame, so a full XML parse per frame,
for 5 s on the `P1` board. Figures are in the M2 report's EVIDENCE block. The
board's own default is unaffected — the probe draws its own SVG.

## The three § E2 fixes, answered

* **Fix 1 (the rAF loop cannot stay)** — answered by not having one. The
  cheapest of § E2's three ways out, which is the one ruling E-R2 = A picked.
* **Fix 2 (tap targets must stop using the DOM)** — answered. `tapTarget()`
  returns `{x, y, r}` in viewBox units and the rule is
  `!!tg && hypot(dx, dy) <= (r || 8)`: the same rule as the web
  (`useQuizRun.ts:163`) and **the same rule the server regrades with**
  (`20261028190000_playbook_v1_schema.sql:1640-1677`). Exported as `isHit()`
  beside `screenToViewBox()`, and a null target makes every tap wrong, exactly
  as the server's `IF v_tx IS NOT NULL` guard does. **No `data-el`, no
  `querySelector`, no DOM.**
* **Fix 3 (filters and CSS-supplied colour)** — split in two:
  * **The heat field's filter SURVIVES.** `heat.ts:59` puts
    `<defs><filter id="heatblur"><feGaussianBlur stdDeviation="1.6"/></filter></defs>`
    and the `<g filter="url(#heatblur)">` **inside the same `<svg>`**, so the
    reference resolves inside the one `SvgXml` root. § E2 predicted this and
    the harness confirms it on screen.
  * **The doodles' chalk edge does NOT survive, and `withDoodleColors` is not
    where it would.** `grep -c filter src/features/pac-playbook/doodleArt.ts`
    is **0**: the art strings carry no filter at all. On the web the
    `feTurbulence` + `feDisplacementMap` filter is defined once in a
    **separate** `<svg class="pbkd-defs">` (`Doodles.tsx:64-81`) and applied to
    every mark **by CSS** (`playbook.css:503`, `filter:url(#pbkd-chalk)`).
    Neither the separate root nor the CSS travels with the string, and each
    `SvgXml` is an isolated root, so a mobile mark draws as the **plain
    stroke** — correct colour, correct geometry, no chalk break-up.
    **REPORTED, NOT FIXED: inlining that filter into each mark's own `<defs>`
    is M3**, exactly as § E2 Fix 3 says. `withDoodleColors` itself works as
    designed — it only ever promised the stroke and fill.

## Fixtures — real content, and one pairing that is this harness's

All three come from `thrive-and-score` @ `83a3686`,
`docs/playbook/pac-playbook-v2-FINAL-data.json`, which is the same content the
prod seed `20261028190001_playbook_v1_seed.sql` inserts into
`playbook_blocks.data`. No coordinate and no string was invented.

| Fixture | Source | Why it is in the harness |
| --- | --- | --- |
| **PLAIN** `F0` | `diagrams.F0` | `backdrop: 'none'`, boxes + a label, and **five elements carrying `text_es`** — so the EN/ES toggle visibly redraws the board, which is what proves ruling E-R4 = A on screen. |
| **HEAT** `F3` + CDM blobs | `diagrams.F3` and `positions[n=6].attack.blobs` | the `feGaussianBlur` path. `n = 6` is the web panel's own default (`PositionsPanel.tsx:28-30`). |
| **TAP** `P1` | `diagrams.P1`, the board behind quiz `q011` | no explicit `target`, so `tapTarget()` derives one from the last `pass` (`p3` → `[92, 24]`, `r = 9`) — the derivation the server mirrors. |

**The HEAT pairing is the harness's own, and here is why it had to be.** No
seeded diagram carries the `pos-*` elements the positions panel needs — see
FOUND below. The render path is nonetheless identical: `RenderOptions.heat`
straight into `heatSVG()`, exactly as `PositionsPanel` calls it.

## FOUND — outside M2's scope, in the WEB repo, not fixed here

**The "Positions & zones" card looks like it cannot draw a board.** Two
independent checks, 2026-10-30:

```
$ grep -o "('diagram', '[A-Z0-9]*'" supabase/migrations/20261028190001_playbook_v1_seed.sql
   # 38 diagram keys; F3B is NOT among them
$ python3 -c "...for k,v in data['diagrams'].items(): any(id.startswith('pos-'))..."
   # no diagram in the frozen data file has a single pos-* element
```

* `CardScreen.tsx:119` passes `blocks.diagrams[card.key]` to `PositionsPanel`,
  and the positions block's own card id is **`F3B`** (seed line 238). There is
  no `F3B` diagram row.
* `PositionsPanel.tsx:37` is `if (!diagram) return null`.
* And even with a diagram, `RenderOptions.dim` and the panel's
  tap-a-number `onClickEl` both key on elements whose id starts with `pos-`
  (`renderDiagram.ts`, `PositionsPanel.tsx:80`), and **no seeded diagram has
  one**.

So the heat map, the `dim` spotlight and tap-a-number all appear to have no
data to act on. **INFERRED from the seed and the frozen data file — not
observed in a running web app**, and the DB may hold rows the seed does not.
The one check that would settle it: open the Positions & zones card on the web
and see whether a board draws. **It is a WEB finding and M2 changed nothing
about it**; mobile should not port a panel that has no content until it is
settled.

## What M3 inherits from here

* Inline the `pbkd-chalk` filter into each doodle mark's own `<defs>` (Fix 3's
  remaining half), or decide the plain stroke is the mobile look.
* The reader shell: § E2's "What does NOT port" table is unchanged by M2.
* `PLAYBOOK-DEV-HARNESS` — remove or keep `dev/` at M4.
