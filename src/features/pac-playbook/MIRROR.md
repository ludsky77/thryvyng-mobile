# Mirror manifest — PAC Playbook pure layer (M1)

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
```

Silence from the eight, and exactly one hunk from `doodleArt.ts`, is the pass.

**Editing rule:** a change to any file below is made in the **web repo first**,
then re-mirrored here, and this table's commit column is updated. Never edit the
mobile copy alone — that is the fork this manifest exists to prevent.

| Mobile path | Web path | Web commit | Mirrored | Status |
| --- | --- | --- | --- | --- |
| `src/features/pac-playbook/diagram/renderDiagram.ts` | `src/features/pac-playbook/diagram/renderDiagram.ts` | `83a3686` | 2026-10-30 | byte-identical |
| `src/features/pac-playbook/diagram/geometry.ts` | `src/features/pac-playbook/diagram/geometry.ts` | `83a3686` | 2026-10-30 | byte-identical |
| `src/features/pac-playbook/diagram/heat.ts` | `src/features/pac-playbook/diagram/heat.ts` | `83a3686` | 2026-10-30 | byte-identical |
| `src/features/pac-playbook/diagram/tapTarget.ts` | `src/features/pac-playbook/diagram/tapTarget.ts` | `83a3686` | 2026-10-30 | byte-identical |
| `src/features/pac-playbook/diagram/types.ts` | `src/features/pac-playbook/diagram/types.ts` | `83a3686` | 2026-10-30 | byte-identical |
| `src/features/pac-playbook/search.ts` | `src/features/pac-playbook/search.ts` | `83a3686` | 2026-10-30 | byte-identical |
| `src/features/pac-playbook/types.ts` | `src/features/pac-playbook/types.ts` | `83a3686` | 2026-10-30 | byte-identical |
| `src/features/pac-playbook/doodleArt.ts` | `src/features/pac-playbook/doodleArt.ts` | `83a3686` | 2026-10-30 | **1 declared diff: DEV flag** |
| `src/lib/playbookErrors.ts` | `src/lib/playbookErrors.ts` | `83a3686` | 2026-10-30 | byte-identical |

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

Two mentions of `import.meta` remain in that file **in prose** — its own header
(line 3) and the comment above `strengthPreset` (line 203), both explaining this
very substitution. They are comments, stripped before Metro sees them, and
rewriting them would cost two more hunks and the byte-identical guarantee. See
the M1 report's FOUND note.

## Not mirrored

`renderDiagram.ts` and `tapTarget.ts` are called out in the recon as
**byte-identical, non-negotiable**: the first is the design itself, and the
server regrades taps by the same rule as the second, so a fork there is a
scoring bug rather than a style drift.

Not in this manifest and not mirrored: `theme.ts` is **new on mobile** (the
stylesheet has no mobile equivalent to copy), and `rpc.ts`, `strings.ts`, the
three hooks, the screens, the panels and `DiagramBoard.tsx` are **adapt** or
**rebuild** in the recon's plan — M2 and M3 — never a copy.

## Nothing imports these yet

M1 lands the files and wires none of them. The open gap
`PLAYBOOK-MOBILE-UNROUTED` in `docs/ledger.md` tracks that; M4 closes it.
