# Playbook mobile — gate baselines (captured BEFORE any M1 edit)

Captured 2026-10-30 in `/Users/ludsanz/Documents/thryvyng-mobile` at
`9382466` (`chore(release): bump version to 1.0.19`), working tree clean.
These are the numbers every later Playbook slice (M1–M4) must compare against.

## Typecheck

```
$ npx tsc --noEmit -p tsconfig.json 2>&1 | grep -c "error TS"
5
```

5 pre-existing errors, all in `src/components/games/` — the same baseline the
calendar/teams v2 rows in `docs/ledger.md` record. Expected, not introduced here.

## Lint

```
$ ESLINT_USE_FLAT_CONFIG=false npx eslint src --ext .ts,.tsx 2>&1 | tail -1
✖ 1936 problems (3 errors, 1933 warnings)
```

**3 errors** is the number that must not move. The warning count may drift as
files are added (the warning classes are pre-existing: `no-explicit-any`,
unused vars, inline styles).

## iOS export — the lazy-load proof baseline for M4

```
$ npx expo export --platform ios     # exit 0
$ ls -la dist/_expo/static/js/ios/
-rw-r--r--  1 ludsanz  staff  9055066  index-896983edfe9c873efab6b8795d8dbf5f.hbc
```

| Measure | Baseline | Use it as a gate? |
| --- | --- | --- |
| Entry bundle **content hash** (in the file name) | `896983edfe9c873efab6b8795d8dbf5f` | **YES — this is the gate** |
| Entry bundle bytes | ~9,055,065–9,055,066 | **No — ±1 byte of noise, see below** |
| Split (non-entry) bundles | **0** — the entry bundle is the only file in `dist/_expo/static/js/ios/` | yes |

### The byte size is NOT reproducible — measured, not assumed

M1 was supposed to prove "nothing imports the new files" by the entry bundle
byte size not moving. It moves on its own. Four exports, the last two from a
**completely unchanged** working tree:

| Export | Bytes | Content hash in file name |
| --- | --- | --- |
| before M1 | 9,055,066 | `896983edfe9c873efab6b8795d8dbf5f` |
| after M1 | 9,055,065 | `896983edfe9c873efab6b8795d8dbf5f` |
| after M1, re-run, no edits | 9,055,065 | `896983edfe9c873efab6b8795d8dbf5f` |
| after M1, re-run again, no edits | 9,055,066 | `896983edfe9c873efab6b8795d8dbf5f` |

And two exports of byte-identical source give **different bytecode**:

```
$ md5 -r hbc-a.hbc hbc-b.hbc
711d05ee7484ed767f3741e7ae5bbcb3  hbc-a.hbc
adcb9ab8190be85def60e11f9aab3159  hbc-b.hbc
$ stat -f "%z" hbc-a.hbc hbc-b.hbc
9055065
9055065
$ cmp hbc-a.hbc hbc-b.hbc
hbc-a.hbc hbc-b.hbc differ: char 6138269, line 57456
```

Same size, different digest, diverging ~6.1 MB in. The **Hermes bytecode
output is not byte-reproducible** on this toolchain; the ±1 byte and the
differing digest are the compiler, not the code.

**So compare the content hash, not the size.** Metro computes that hash over
the JS module graph it bundled, which is upstream of Hermes — it held at
`896983edfe9c873efab6b8795d8dbf5f` across all four exports, which is a
*stronger* M1 proof than the byte count would have been: the module graph is
provably identical, so nothing imports the new files.

### Why M4 needs this row

There is no code splitting in the iOS export today: one bundle, no lazy chunks.

- **M1 (files exist, nothing imports them)** — content hash **unchanged**.
  Satisfied; see the table above.
- **M4 (the Playbook is routed)** — the hash MUST change (new modules are in
  the graph), and the open question is whether a `lazy()` on the Playbook
  screen produces a **second file** in `dist/_expo/static/js/ios/` or whether
  the Hermes export inlines it into the one bundle. Compare the **split bundle
  count against 0**, and read growth from the bundle size only as a rough
  figure with ±1 byte of noise on it. Do not assume a split appears; measure.
