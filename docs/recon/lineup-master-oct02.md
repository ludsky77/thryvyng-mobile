# Lineup Editor Audit — save/load/bench/picker/layout
**Date:** 2026-10-02 · **Mode:** read-only recon, no code changed
**Target:** `LineupEditorScreen` ("Lineup Editor", 4-3-3, 11v11, BENCH strip, "Select player for <POS>" sheet)
**Symptoms:** (a) saved lineup reopens empty · (b) BENCH renders blank jerseys · (c) keyboard covers the picker · (d) assigned players show "?" for number · (e) forward line cramped

## Files in scope
| File | Lines |
|---|---|
| [LineupEditorScreen.tsx](../../src/screens/lineup/LineupEditorScreen.tsx) | 1136 |
| [LineupFieldEditor.tsx](../../src/components/lineup/LineupFieldEditor.tsx) | 376 |
| [formationPositions.ts](../../src/data/formationPositions.ts) | 121 |
| [LineupViewScreen.tsx](../../src/screens/lineup/LineupViewScreen.tsx) | 315 (read-only comparison) |
| [GroupInfoScreen.tsx](../../src/screens/GroupInfoScreen.tsx) | Stone F keyboard reference |

---

## Verdict up front

**Symptom (a) is not a load bug. It is a save that cannot report failure.**
[handleSave](../../src/screens/lineup/LineupEditorScreen.tsx#L473) issues four writes and **checks the error on none of
them**. Supabase returns failures as a returned `error` value, not a throw, so the
`try/catch` never fires and the function reaches
`Alert.alert('Saved', 'Lineup updated successfully')` unconditionally. Local state
still holds the coach's work, so the screen looks correct until reopen.

This is the same lesson already written down elsewhere in this repo —
[useChatSenderLabels.ts:60](../../src/hooks/useChatSenderLabels.ts#L60): *"RPCs report failure as a returned error,
not a throw."* The lineup save predates that fix and never got it.

**The route.params check asked for (the I-lite bug class) comes back negative.**
Nothing paints from `route.params`; the editor always fetches. Details in §2.

---

## 1. SAVE path

[handleSave — LineupEditorScreen.tsx:473-571](../../src/screens/lineup/LineupEditorScreen.tsx#L473-L571). No RPC. Four sequential writes
against two tables:

| Step | Line | Write | Error checked? |
|---|---|---|---|
| 1 | [:478-491](../../src/screens/lineup/LineupEditorScreen.tsx#L478-L491) | `lineup_formations.update({ name, status, formation_template, field_type, jersey_config, notes, event_id, updated_at })` where `id = lineupId` | **NO** — assigned to `updateResult`, never read |
| 2 | [:492](../../src/screens/lineup/LineupEditorScreen.tsx#L492) | `lineup_players.delete().eq('formation_id', lineupId)` — wipes every row first | **NO** — assigned to `deleteResult`, never read |
| 3 | [:498-516](../../src/screens/lineup/LineupEditorScreen.tsx#L498-L516) | builds starter rows from `basePositions` + `assignments` | — |
| 4 | [:549-551](../../src/screens/lineup/LineupEditorScreen.tsx#L549-L551) | `lineup_players.insert(inserts)` | **NO** — return value discarded entirely |

### Payload shape written to `lineup_players`

Starters ([:505-515](../../src/screens/lineup/LineupEditorScreen.tsx#L505-L515)):
```
formation_id, player_id, guest_name, jersey_number,
position_code: pos.code,            // 'GK' | 'LB' | 'CM' | 'LW' | ...
position_x, position_y,             // override ?? formation default
is_starter: true, is_captain, sort_order
```

Bench — **every roster player not in the starting XI** ([:517-531](../../src/screens/lineup/LineupEditorScreen.tsx#L517-L531)):
```
player_id: p.id, guest_name: null, jersey_number: p.jersey_number,
position_code: 'BENCH', position_x: 0, position_y: 0, is_starter: false
```

Guests on the bench ([:534-546](../../src/screens/lineup/LineupEditorScreen.tsx#L534-L546)): same, but `player_id: null`, `guest_name` set.
Note the filter `benchPlayers.filter((b) => b.guestName)` — **non-guest entries in
`benchPlayers` are silently dropped on save.** This matters in §3.

### Does "draft" status change on save?

**No.** `status` is local state ([:116](../../src/screens/lineup/LineupEditorScreen.tsx#L116)) toggled only by the pill the coach taps
([:693-698](../../src/screens/lineup/LineupEditorScreen.tsx#L693-L698)). Save persists whatever the pill currently shows ([:482](../../src/screens/lineup/LineupEditorScreen.tsx#L482)). It never
auto-promotes draft→published. `previousStatus` ([:475](../../src/screens/lineup/LineupEditorScreen.tsx#L475)) exists only to fire
`notifyLineupPublished` once on a genuine draft→published transition ([:552-566](../../src/screens/lineup/LineupEditorScreen.tsx#L552-L566)).

### Optimistic state that can show a lineup that was never persisted — YES

Three compounding facts:

1. **No write is error-checked** (table above). Supabase reports RLS denials,
   constraint violations and 4xx as `{ error }`, not a throw. Only a transport
   throw reaches `catch`.
2. **`setLineup` at [:551](../../src/screens/lineup/LineupEditorScreen.tsx#L551) merges `status`, `name`, `notes`, `jersey_config` into local
   state** — and critically, `assignments`, `positionOverrides` and `benchPlayers`
   are **never touched by save at all**. The coach's arrangement stays on screen
   regardless of what the DB accepted.
3. **`Alert.alert('Saved', 'Lineup updated successfully')` at [:567](../../src/screens/lineup/LineupEditorScreen.tsx#L567)** is
   unconditional.

So a save that wrote nothing shows a success alert over a screen that still
displays the full lineup. The coach has no signal until reopen, when the fetch
returns zero `lineup_players` rows and the pitch paints empty. **CAUSE FOUND for (a).**

> **Data-loss risk worth flagging:** step 2 deletes all rows before step 4 inserts,
> with no transaction and no error check. If the delete succeeds and the insert
> fails, the previously-saved lineup is **destroyed** and the alert still says
> "Saved". A delete-then-insert without a transaction is the one ordering that
> cannot fail safely.

---

## 2. LOAD path — and the route.params question

[fetchData — LineupEditorScreen.tsx:140-221](../../src/screens/lineup/LineupEditorScreen.tsx#L140-L221).

### Params carry ids only — no paint hint

[:105](../../src/screens/lineup/LineupEditorScreen.tsx#L105): `const params = (route.params as { lineupId?: string; teamId?: string }) || {}`.
Every navigation into the screen passes ids only:
- [LineupListScreen.tsx:97](../../src/screens/lineup/LineupListScreen.tsx#L97) — `{ lineupId: lineup.id, teamId: tid }`
- [LineupListScreen.tsx:186](../../src/screens/lineup/LineupListScreen.tsx#L186) — `{ lineupId: newId, teamId: tid }`
- [LineupSettingsScreen.tsx:58](../../src/screens/lineup/LineupSettingsScreen.tsx#L58) — `{ lineupId, teamId, action }`
- [linking.ts:73](../../src/navigation/linking.ts#L73) — `LineupEditor: { lineupId: string; teamId: string }`

**No caller passes a `lineup` object.** The fetch always runs ([:226-234](../../src/screens/lineup/LineupEditorScreen.tsx#L226-L234), guarded by
a `hasLoaded` ref that resets on `lineupId` change). **The I-lite
`route.params.event` bug class is NOT present here — checked explicitly, negative.**

### Load query

```
lineup_formations
  select *, players:lineup_players(*, player_profile:players(id, first_name, last_name, jersey_number, photo_url)),
         event:cal_events(id, title, event_date)
  .eq('id', lineupId).single()
```
Roster fetched separately from `players` by `team_id` ([:166-171](../../src/screens/lineup/LineupEditorScreen.tsx#L166-L171)).

### Hydration

[:186-217](../../src/screens/lineup/LineupEditorScreen.tsx#L186-L217). For each `lineup_players` row:
- `is_starter === false` → pushed to `benchPlayers` with `positionIndex: -1` ([:201-203](../../src/screens/lineup/LineupEditorScreen.tsx#L201-L203))
- else matched to a slot by
  `loadedPositions.findIndex((p, i) => p.code === lp.position_code && !usedIndices.has(i))` ([:209](../../src/screens/lineup/LineupEditorScreen.tsx#L209))
- `jerseyNumber: lp.jersey_number ?? profile?.jersey_number ?? null` ([:197](../../src/screens/lineup/LineupEditorScreen.tsx#L197))

### Shape comparison: Save writes vs Load reads

| Key | Save writes | Load reads | Match |
|---|---|---|---|
| `position_code` | `pos.code` from `getFormationPositions(lineup.formation_template, lineup.field_type)` | matched against `getFormationPositions(lf.formation_template, lf.field_type)` | **yes** — same function, same args |
| `position_x/y` | override or default | compared to default, >0.5 delta → override | **yes** |
| `is_starter` | `true` / `false` | branches on it | **yes** |
| `jersey_number` | `a.jerseyNumber` / `p.jersey_number` | `lp.jersey_number ?? profile?.jersey_number` | **yes** |
| **bench rows with `player_id`** | written as `position_code:'BENCH'`, `is_starter:false`, `guest_name:null` | loaded into `benchPlayers`, then **rendered as guests** | **NO — see §3** |

**Formation/position keys do NOT mismatch.** Both sides call the same pure
function with the same two values, and `FORMATION_POSITIONS` is fully
pre-generated at module load ([formationPositions.ts:109-121](../../src/data/formationPositions.ts#L109-L121)), so the list is
deterministic. The duplicate-code case (4-3-3 has `CB,CB` and `CM,CM,CM`) is
handled by the `usedIndices` guard.

**One genuine load-side failure mode (INFERRED, needs a DB row to confirm):** if
`formation_template` is not a key in `parseFormationCodes`' `defs` map, it falls
back to `['CB','CB','CM','ST']` ([formationPositions.ts:92](../../src/data/formationPositions.ts#L92)) — 5 slots. Starters saved
as `LW`/`ST`/`RW` then find no index and are **dropped silently** at [:209-216](../../src/screens/lineup/LineupEditorScreen.tsx#L209-L216)
with no warning. Same if `field_type` drifted. This would produce symptom (a)
*even with a successful save*, so it must be ruled out by inspecting the stored
`formation_template` / `field_type`.

### Discriminating test for (a) — no DB access needed

[LineupViewScreen.tsx:47-49](../../src/screens/lineup/LineupViewScreen.tsx#L47-L49) runs the **identical** query and matches on the
**identical** `position_code === pos.code` rule ([:107](../../src/screens/lineup/LineupViewScreen.tsx#L107)).
- View screen also empty → the rows were never written → the unchecked save (§1).
- View screen shows the players → rows exist → hydration/formation drift.

---

## 3. BENCH — why names and numbers are missing

### Derivation
[benchTiles — LineupEditorScreen.tsx:285-294](../../src/screens/lineup/LineupEditorScreen.tsx#L285-L294). Two concatenated sources:
```
unassignedRoster = roster.filter(p => !assignedIds.has(p.id))   -> type 'roster'
benchPlayers.map((b, i) => ({ type: 'guest', guestName: b.guestName || '', ... }))
```
Rendered at [:736-756](../../src/screens/lineup/LineupEditorScreen.tsx#L736-L756): a `MiniJerseyIcon`, then `{num ?? '?'}`, then 2-letter
initials. **The bench never renders a name — only initials, by design** ([:744](../../src/screens/lineup/LineupEditorScreen.tsx#L744)).

### Cause 1 — every loaded bench row is mis-typed as a guest (CAUSE FOUND)

Load pushes **all** non-starters into `benchPlayers` ([:201-203](../../src/screens/lineup/LineupEditorScreen.tsx#L201-L203)), including the
roster bench rows that save wrote with `player_id` set and `guest_name: NULL`.
`benchTiles` then maps **every** `benchPlayers` entry to `type: 'guest'` with
`guestName: b.guestName || ''` ([:290](../../src/screens/lineup/LineupEditorScreen.tsx#L290)).

For a roster bench row `guest_name` is `null` →
`guestName: ''` → `disp = ''` → `initials = '?'` ([:744](../../src/screens/lineup/LineupEditorScreen.tsx#L744)). The tile renders a bare
jersey icon with `'?'` and nothing else. **Blank jersey, no name, no identity.**

It also **double-counts**: the same player appears once as a correct `'roster'`
tile and again as a blank `'guest'` tile, so `BENCH (n)` inflates after any
successful save. The tiles are keyed `g-${idx}` ([:748](../../src/screens/lineup/LineupEditorScreen.tsx#L748)), so there is no key
collision to surface it.

`benchPlayers` carries `playerId` and the fetch already joins `player_profile`
([:148](../../src/screens/lineup/LineupEditorScreen.tsx#L148)) — **the name is in memory and simply never read.**
[LineupViewScreen.tsx:150-155](../../src/screens/lineup/LineupViewScreen.tsx#L150-L155) does it correctly off `p.player_profile`, and
dedupes subs by `player_id || guest_name` at [:145-148](../../src/screens/lineup/LineupViewScreen.tsx#L145-L148). The editor does neither.

### Cause 2 — the tile is too short for its contents (CAUSE FOUND, arithmetic)

`benchTile` is `height: 70, paddingTop: 6` ([:1076-1086](../../src/screens/lineup/LineupEditorScreen.tsx#L1076-L1086)). Contents:

| Element | Height |
|---|---|
| `paddingTop` | 6 |
| `MiniJerseyIcon size={28}` + `marginBottom: 2` | 30 |
| `benchTileNum` fontSize 14 (line box ≈ 20) | 20 |
| `benchTileInit` fontSize 11 + `marginTop: 2` (≈ 15 + 2) | 17 |
| **total** | **≈ 73 > 70** |

The initials row is the last child and overflows by ~3px. On Android, children are
clipped to the parent View's bounds, so the initials line is cut off or
partially rendered. **Clipping behaviour is INFERRED** (no device/screenshot in
this audit); the overflow arithmetic is provable from the style block.

### Which cause produced the reported "BENCH (18)"
If (a)'s save never persisted, there are no `lineup_players` rows, so
`benchPlayers` is empty and all 18 tiles are `type: 'roster'` — names present but
clipped (Cause 2), numbers `'?'` only where `jersey_number` is null (§4). If rows
*did* persist, Cause 1 dominates and the count inflates. **The BENCH count is
itself the discriminator:** 18 = roster size → nothing loaded; >18 → rows loaded
and mis-typed.

---

## 4. Jersey "?" on assigned players (Arce, Conrad, Rodriguez)

**Render site:** [LineupFieldEditor.tsx:286](../../src/components/lineup/LineupFieldEditor.tsx#L286) — `{pos.assignedPlayer.jerseyNumber ?? '?'}`.
Also [LineupEditorScreen.tsx:335](../../src/screens/lineup/LineupEditorScreen.tsx#L335) and [:451](../../src/screens/lineup/LineupEditorScreen.tsx#L451) (`#${... ?? '?'}`), and [:750](../../src/screens/lineup/LineupEditorScreen.tsx#L750) on bench tiles.

**Source chain.** `positions` memo passes `jerseyNumber: a.jerseyNumber`
([:257](../../src/screens/lineup/LineupEditorScreen.tsx#L257)) — the value stored on the `Assignment`. Set in exactly three places:

| Path | Line | Value |
|---|---|---|
| Load from DB | [:197](../../src/screens/lineup/LineupEditorScreen.tsx#L197) | `lp.jersey_number ?? profile?.jersey_number ?? null` |
| Assign from picker | [:398](../../src/screens/lineup/LineupEditorScreen.tsx#L398) | `player.jersey_number` |
| Assign from bench | [:305](../../src/screens/lineup/LineupEditorScreen.tsx#L305) | `assigningFromBench.player.jersey_number` |

Every path terminates at **`players.jersey_number`** — fetched by the roster query
at [:168-169](../../src/screens/lineup/LineupEditorScreen.tsx#L168-L169). There is no roster join that can partially fail here and
no name/number RPC involved.

**Condition that yields "?": `players.jersey_number IS NULL` for that player.**
This is missing source data, not a resolution failure — consistent with the
symptom that *some* players show numbers and three specific ones do not. The
picker sheet renders the same gap as `'—'` ([:785](../../src/screens/lineup/LineupEditorScreen.tsx#L785)), so those three players
should show `—` in the picker too; that is the cheap confirmation.
**CAUSE FOUND. INFERRED only in that the three rows' null-ness needs DB confirmation**,
which was out of scope.

**Secondary defect at the same site:** the `positions` memo already looks up the
roster row as `p` ([:247](../../src/screens/lineup/LineupEditorScreen.tsx#L247)) to build the name, but passes `a.jerseyNumber`
rather than `a.jerseyNumber ?? p?.jersey_number`. An assignment created while the
number was null keeps showing `'?'` even after the roster row gains a number,
until the lineup is reloaded.

---

## 5. Keyboard covers the picker sheet

### What the lineup picker does
[LineupEditorScreen.tsx:759-792](../../src/screens/lineup/LineupEditorScreen.tsx#L759-L792). Verified absent in this file:

| Mechanism | Present? |
|---|---|
| `KeyboardAvoidingView` | **no** (0 occurrences in the file) |
| `Keyboard` import / `Keyboard.dismiss()` | **no** (0 occurrences) |
| `keyboardShouldPersistTaps` on the `FlatList` | **no** (0 occurrences) |
| safe-area insets on the sheet | **no** — `SafeAreaView edges={['top']}` only ([:676](../../src/screens/lineup/LineupEditorScreen.tsx#L676)) |
| `onRequestClose` on the `Modal` | **no** (0 occurrences) |

Anchoring ([:1090-1097](../../src/screens/lineup/LineupEditorScreen.tsx#L1090-L1097)):
```
modalOverlay: { flex: 1, ..., justifyContent: 'flex-end' }   // BOTTOM-anchored
bottomSheet:  { ..., maxHeight: '60%' }
```
The sheet is pinned to the bottom and capped at 60% of the screen. The keyboard
rises from the bottom over that same region. Header + `searchInput` + roughly one
row survive above the keyboard, and the `FlatList` has no reserved height, so the
remaining rows are behind the keyboard with no way to scroll them up.
Missing `keyboardShouldPersistTaps` compounds it: the first tap on a visible row
is consumed dismissing the keyboard rather than selecting the player.
**CAUSE FOUND for (c).**

### Reference pattern — the Stone F add-member modal
[GroupInfoScreen.tsx:428-499](../../src/screens/GroupInfoScreen.tsx#L428-L499), styles at [:645-665](../../src/screens/GroupInfoScreen.tsx#L645-L665).

| Element | Line | What it does |
|---|---|---|
| `justifyContent: 'flex-start'` | [:645-649](../../src/screens/GroupInfoScreen.tsx#L645-L649) | **Top**-anchored, not bottom |
| `modalKeyboardView: { flex: 1, paddingTop: 56 }` | [:652-655](../../src/screens/GroupInfoScreen.tsx#L652-L655) | dim strip the keyboard can never cover; clears the notch |
| `KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}` | [:443-447](../../src/screens/GroupInfoScreen.tsx#L443-L447) | keyboard shrinks the sheet from below |
| `pointerEvents="box-none"` | [:446](../../src/screens/GroupInfoScreen.tsx#L446) | taps in the padding reach the backdrop |
| `Pressable` backdrop + `Keyboard.dismiss()` | [:431-439](../../src/screens/GroupInfoScreen.tsx#L431-L439) | escape route — comment notes the overlay previously swallowed every tap |
| `keyboardShouldPersistTaps="handled"` | [:480](../../src/screens/GroupInfoScreen.tsx#L480) | first tap selects instead of dismissing |
| `modalContent: { flex: 1, overflow: 'hidden' }` | [:656-665](../../src/screens/GroupInfoScreen.tsx#L656-L665) | sheet fills the shrunk space, list scrolls inside |

The in-code comment at [GroupInfoScreen.tsx:440-442](../../src/screens/GroupInfoScreen.tsx#L440-L442) states the intent exactly:
*"Top-anchored: the sheet grows down from the top strip and the keyboard shrinks
it from below, so input and results stay visible."* The lineup picker is the
bottom-anchored shape that comment was written against.

---

## 6. Layout — pitch container vs toolbar, and the LW/ST/RW coordinates

### Where the forward y comes from
`getDefaultPositions` ([formationPositions.ts:30-56](../../src/data/formationPositions.ts#L30-L56)) places players in three
hardcoded bands:
```
layerY = { 1: 78, 2: 58, 3: 27 }      // line 40
gk     = { code:'GK', x:50, y:92 }    // line 31
```
For `11v11:4-3-3` → `['LB','CB','CB','RB','CM','CM','CM','LW','ST','RW']`
([:58](../../src/data/formationPositions.ts#L58)); `getLayerForCode` ([:94-99](../../src/data/formationPositions.ts#L94-L99)) puts LW/ST/RW in layer 3 → **y = 27**.
`FORMATION_POSITIONS` has no hand-authored entries at all — it is generated from
this function for every formation at module load ([:109-121](../../src/data/formationPositions.ts#L109-L121)).

Vertical band spacing is lopsided: GK 92 → def 78 (14) → mid 58 (20) → fwd 27
(**31**), with the entire top 27% of the pitch empty. The forward line is the one
band pushed far from its neighbour and hard against the attacking box.

### The x formula compresses every line toward the centre
[formationPositions.ts:45](../../src/data/formationPositions.ts#L45):
```
const x = n === 1 ? 50 : 15 + (70 * (i + 1)) / (n + 1);
```
Dividing by `n + 1` keeps the outermost players away from the touchlines. For the
3-man forward line: **LW 32.5, ST 50, RW 67.5** — a 35-unit spread inside a
100-unit pitch. The 4-man defence gets 29/43/57/71 (42 units). An edge-to-edge
spread would use `15 + 70 * i / (n - 1)` → 15 / 50 / 85.

This is the literal "cramped" measurement: **LW→RW occupies 35% of the pitch
width.** CAUSE FOUND for (e), and it affects every line in every formation, not
just the forwards.

### Pitch container height ignores all surrounding chrome
[LineupFieldEditor.tsx:91-93](../../src/components/lineup/LineupFieldEditor.tsx#L91-L93):
```
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const FIELD_HEIGHT = Math.round(SCREEN_HEIGHT * 0.6);
```
A module-level constant: 60% of the **full window**, computed once at import.
It accounts for none of the chrome stacked around it, and `fieldWrapper` sets
`width` only, with no `flex` and no `height` ([LineupEditorScreen.tsx:1064](../../src/screens/lineup/LineupEditorScreen.tsx#L1064)).

Vertical budget on a 390×844 device:

| Band | Source | px |
|---|---|---|
| safe-area top inset | `SafeAreaView edges={['top']}` [:676](../../src/screens/lineup/LineupEditorScreen.tsx#L676) | ~47 |
| header row 1 (back, title, name input, menu) | [:1030-1039](../../src/screens/lineup/LineupEditorScreen.tsx#L1030-L1039) | ~48 |
| header row 2 (Save, status, formation, field type) | [:1040-1046](../../src/screens/lineup/LineupEditorScreen.tsx#L1040-L1046) | ~44 |
| field | `FIELD_HEIGHT` | 506 |
| bench strip | `minHeight: 100` [:1066](../../src/screens/lineup/LineupEditorScreen.tsx#L1066) | 100 |
| `paddingBottom: BOTTOM_TAB_PADDING` | [:1020](../../src/screens/lineup/LineupEditorScreen.tsx#L1020), [:1024](../../src/screens/lineup/LineupEditorScreen.tsx#L1024) | 88 |
| **total** | | **~833 of 844** |

11px of slack. The `assignBanner` ([:707-712](../../src/screens/lineup/LineupEditorScreen.tsx#L707-L712), ~40px) overflows it whenever a
bench-assign is in progress, and a 375×667 device overflows by ~34px before the
banner. RN defaults `flexShrink` to 0, so nothing compresses — the bench strip is
pushed off the bottom while the field keeps its full 506px. **The toolbar does not
shrink the pitch; the pitch pushes the bench out of view.** Treat the "cramped"
report as the x/y coordinate math above, not vertical compression.

### Separate real bug found here: jerseys and tap targets use different coordinate spaces

Two incompatible mappings inside the same component:

| Used for | Line | Mapping |
|---|---|---|
| **Painted jerseys** (SVG) | [:165](../../src/components/lineup/LineupFieldEditor.tsx#L165) | `scaleY(y) = (y/100) * VIEWBOX_H` → viewBox `0 -8 100 156`, `preserveAspectRatio="xMidYMid meet"` ([:174](../../src/components/lineup/LineupFieldEditor.tsx#L174)) |
| **Touch targets** (RN Views) | [:167-168](../../src/components/lineup/LineupFieldEditor.tsx#L167-L168) | `yToPx(y) = (y/100) * FIELD_HEIGHT`, `xToPx(x) = (x/100) * FIELD_WIDTH` — raw fraction of pixels |

The SVG path adds `VIEWBOX_PAD_TOP/BOTTOM = 8` ([:96-98](../../src/components/lineup/LineupFieldEditor.tsx#L96-L98)) and is uniformly scaled
and letterboxed by `meet`; the pixel path knows about neither. On 390×844
(scale = min(390/100, 506/156) = 3.244, so 100 viewBox units render as 324px with
~33px bars each side):

| Position | Painted at | Hit area at | Offset |
|---|---|---|---|
| forwards, y=27 | 148.6px | 136.6px | 12px |
| GK, y=92 | 443.8px | 465.5px | 22px |
| x=15 | 81.5px | 58.5px | 23px |
| x=50 | 195px | 195px | 0 |

Taps land correct only at the horizontal centre and drift outward — and the drag
writeback is worse: `pxToY` ([:170](../../src/components/lineup/LineupFieldEditor.tsx#L170)) converts the gesture back through the
*pixel* mapping, so a jersey dropped on a spot is stored as a different y and
re-renders somewhere else. Those stored values are what save persists as
`position_x/position_y` ([LineupEditorScreen.tsx:512-513](../../src/screens/lineup/LineupEditorScreen.tsx#L512-L513)). Not one of the five
reported symptoms, but in the same component and likely behind any "jerseys
drift when I drag them" report.

---

## Summary

| # | Symptom | Status | Primary cause |
|---|---|---|---|
| a | saved lineup reopens empty | **CAUSE FOUND** | all 4 writes in `handleSave` unchecked ([:478](../../src/screens/lineup/LineupEditorScreen.tsx#L478), [:492](../../src/screens/lineup/LineupEditorScreen.tsx#L492), [:549](../../src/screens/lineup/LineupEditorScreen.tsx#L549)); unconditional success alert ([:567](../../src/screens/lineup/LineupEditorScreen.tsx#L567)); local state masks the failure |
| b | BENCH blank jerseys | **CAUSE FOUND** | loaded bench rows mis-typed as guests ([:290](../../src/screens/lineup/LineupEditorScreen.tsx#L290) vs [:201](../../src/screens/lineup/LineupEditorScreen.tsx#L201)) → empty name; plus tile 73px of content in a 70px box ([:1076](../../src/screens/lineup/LineupEditorScreen.tsx#L1076)) |
| c | keyboard covers picker | **CAUSE FOUND** | bottom-anchored `maxHeight:'60%'` sheet ([:1090](../../src/screens/lineup/LineupEditorScreen.tsx#L1090)) with no `KeyboardAvoidingView` / `keyboardShouldPersistTaps` |
| d | "?" jersey number | **CAUSE FOUND** | `players.jersey_number IS NULL`; rendered at [LineupFieldEditor.tsx:286](../../src/components/lineup/LineupFieldEditor.tsx#L286) (null-ness itself INFERRED) |
| e | forward line cramped | **CAUSE FOUND** | `x = 15 + 70(i+1)/(n+1)` compresses LW→RW to 35% width ([formationPositions.ts:45](../../src/data/formationPositions.ts#L45)); `layerY[3] = 27` ([:40](../../src/data/formationPositions.ts#L40)) |

### Marked INFERRED
- `players.jersey_number` is null for Arce / Conrad / Rodriguez (needs a DB read).
- Android clipping of the overflowing bench-tile initials (needs a device).
- `formation_template` / `field_type` drift as an *additional* path to symptom (a).
- Whether the coach's specific save failed on the update, the delete or the insert —
  unknowable from the client, because none of the three is checked.

### Not in scope but found
- Delete-then-insert with no transaction and no error check ([:492](../../src/screens/lineup/LineupEditorScreen.tsx#L492) → [:549](../../src/screens/lineup/LineupEditorScreen.tsx#L549)) can
  destroy a saved lineup while reporting success.
- SVG vs pixel coordinate mismatch ([LineupFieldEditor.tsx:165](../../src/components/lineup/LineupFieldEditor.tsx#L165) vs [:167](../../src/components/lineup/LineupFieldEditor.tsx#L167)) —
  offset taps and wrong drag writeback.
- `BOTTOM_TAB_PADDING = 88` + `FIELD_HEIGHT = 60%` of window overflows short screens.
- `Modal` has no `onRequestClose` — Android back button cannot dismiss the picker.
- `console.log` left in the load path at [:164](../../src/screens/lineup/LineupEditorScreen.tsx#L164) and [:182](../../src/screens/lineup/LineupEditorScreen.tsx#L182).
