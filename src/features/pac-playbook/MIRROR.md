# Mirror manifest — PAC Playbook pure layer

**Provenance: `thrive-and-score` @ `c772111`** (M1 mirrored `83a3686`; M3
re-mirrored to `c772111`, which changed `renderDiagram.ts` — DIAGRAM-LABEL-FIT
— and reworded two comments in `doodleArt.ts`).

These files are **mirrored from the web repo** (`thrive-and-score`), not written
here. The pattern is the one `src/lib/joinErrors.ts` already set in this
codebase: the same file, by name, in both repos, so one failure never reads two
different ways and one renderer never becomes two designs.

**Why this file instead of a header in each file.** The mirror discipline in the
recon (§ E8) asked each file to carry a header naming its web path. A header is
itself a diff, and `diff -q` is the only cheap proof that a mirror has not
drifted. So the provenance lives here, once, and the files stay byte-identical —
which means drift is a one-command check, not a reading job:

```
W=/Users/ludsanz/Documents/thrive-and-score
for f in diagram/renderDiagram.ts diagram/geometry.ts diagram/heat.ts \
         diagram/tapTarget.ts diagram/types.ts search.ts types.ts; do
  diff -q "$W/src/features/pac-playbook/$f" "src/features/pac-playbook/$f"
done
diff -q "$W/src/lib/playbookErrors.ts" src/lib/playbookErrors.ts
diff "$W/src/features/pac-playbook/doodleArt.ts" src/features/pac-playbook/doodleArt.ts
diff -q "$W/docs/playbook/pac-playbook-v2-FINAL-data.json" \
        src/features/pac-playbook/dev/pac-playbook-v2-FINAL-data.json
```

Silence from the eight and from the data file, and exactly one hunk from
`doodleArt.ts`, is the pass.

**Editing rule:** a change to any file below is made in the **web repo first**,
then re-mirrored here, and this table's commit column is updated. Never edit the
mobile copy alone — that is the fork this manifest exists to prevent.

| Mobile path | Web path | Web commit | Mirrored | Status |
| --- | --- | --- | --- | --- |
| `src/features/pac-playbook/diagram/renderDiagram.ts` | `src/features/pac-playbook/diagram/renderDiagram.ts` | `c772111` | 2026-10-30 | byte-identical |
| `src/features/pac-playbook/diagram/geometry.ts` | `src/features/pac-playbook/diagram/geometry.ts` | `c772111` | 2026-10-30 | byte-identical |
| `src/features/pac-playbook/diagram/heat.ts` | `src/features/pac-playbook/diagram/heat.ts` | `c772111` | 2026-10-30 | byte-identical |
| `src/features/pac-playbook/diagram/tapTarget.ts` | `src/features/pac-playbook/diagram/tapTarget.ts` | `c772111` | 2026-10-30 | byte-identical |
| `src/features/pac-playbook/diagram/types.ts` | `src/features/pac-playbook/diagram/types.ts` | `c772111` | 2026-10-30 | byte-identical |
| `src/features/pac-playbook/search.ts` | `src/features/pac-playbook/search.ts` | `c772111` | 2026-10-30 | byte-identical |
| `src/features/pac-playbook/types.ts` | `src/features/pac-playbook/types.ts` | `c772111` | 2026-10-30 | byte-identical |
| `src/features/pac-playbook/doodleArt.ts` | `src/features/pac-playbook/doodleArt.ts` | `c772111` | 2026-10-30 | **1 declared diff: DEV flag** |
| `src/lib/playbookErrors.ts` | `src/lib/playbookErrors.ts` | `c772111` | 2026-10-30 | byte-identical |
| `src/features/pac-playbook/dev/pac-playbook-v2-FINAL-data.json` | `docs/playbook/pac-playbook-v2-FINAL-data.json` | `c772111` | 2026-10-30 | byte-identical · **`__DEV__` only** |

The last row is **data, not code, and it ships in no build.** It is the frozen
content file the PROD SEED was generated from
(`supabase/migrations/20261028190001_playbook_v1_seed.sql`, built by
`scripts/playbook/build-seed.mjs`), copied so the `__DEV__` harness can mount
the reader with no session and no network — `dev/offlineBook.ts` maps it to row
shapes using that script's own documented mapping. It is mirrored for the same
reason the code is: so the harness renders the book the server serves, and a
drift is one `diff` away from being caught.

**The one declared diff**, `doodleArt.ts:209`, the only line that is not shared:

```
209c209
<   if (import.meta.env.DEV) {        # web: Vite replaces it with false
---
>   if (__DEV__) {                    # mobile: Metro does the same
```

Both are compile-time constants their bundler folds away, so the `?dz=` strength
preview exists in a dev build and the branch is dead-code-eliminated out of a
release one. Nothing else in the file moves.

M1 noted that two `import.meta` mentions survived in PROSE — the file's own
header and the comment above `strengthPreset`. **That is closed:** `c772111`
reworded both ON THE WEB, which is the editing rule working as intended, and
`grep -rn "import\.meta" src/features/pac-playbook src/lib/playbookErrors.ts`
now matches nothing outside this manifest.

## Not mirrored

`renderDiagram.ts` and `tapTarget.ts` are called out in the recon as
**byte-identical, non-negotiable**: the first is the design itself, and the
server regrades taps by the same rule as the second, so a fork there is a
scoring bug rather than a style drift.

Not in this manifest and not mirrored: `theme.ts`, `styles.ts`, `ui.tsx` and
`doodleChalk.ts` are **new on mobile** (the stylesheet has no mobile equivalent
to copy, and the chalk filter has no CSS to carry it); `rpc.ts`, `strings.tsx`,
the three hooks, the six screens, the three panels, `PlaybookScreen.tsx`,
`PlaybookHeader.tsx`, `Doodles.tsx`, `Fmt.tsx`, `DiagramBoard.tsx`,
`CardBoard.tsx` and `StillBoard.tsx` are **adapt** or **rebuild** in the recon's
plan — never a copy. The web↔mobile map for all of them is
`docs/recon/playbook-m3.md` § 1.

## What imports these now

M1 landed the files and wired none of them. M2 added `DiagramBoard.tsx` and M3
the reader — the shell, six screens, three panels and the data layer — so the
mirrored pure layer IS now imported, by `src/features/pac-playbook/` and by
nothing else.

The app still reaches none of it. The only entry point is the `__DEV__` deep
link `thryvyng://playbook-dev`, behind three gates Metro folds away; the
production entry bundle's content hash did not move across M3
(`90794d1bbeaea43b1a1b75a71d506e6e`, the same as M2's), so the module graph
provably did not change. `PLAYBOOK-MOBILE-UNROUTED` in `docs/ledger.md` stays
OPEN until M4 registers the route.
