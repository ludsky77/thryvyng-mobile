# Recon: two device findings on 13dfb4c — 2026-10-10

Compared: `src/screens/EventDetailScreen.tsx` at **HEAD = 13dfb4c** (the
one-truth attendance build) vs at **d500ff8** (the commit immediately before
it). Tree clean, no code changed by this recon.
Also read: `src/utils/attendanceResolver.ts`, `docs/recon/rsvp-attendance-oct09.md`.

Device case: user **zztest1**, a parent with **4 children on the roster**,
tapped Going. Strip showed **1 Going / 0 Can't go / 4 No reply**.

---

## VERDICTS

| Finding | Verdict |
|---|---|
| **F-A** — parent's Going counted as a 5th entity on a 4-player roster | **PRE-EXISTING** |
| **F-B** — parent sees no attendee/roster list | **PRE-EXISTING** |

Neither is caused by the 13dfb4c build. F-A produces **byte-for-byte the same
three numbers** at d500ff8; F-B's gate is **textually identical** and no line in
the whole d500ff8→HEAD diff touches it.

---

## F-A — "1 Going / 0 / 4 No reply"

### (1) What player_id does the family writer send for a multi-child parent?
**null.** Not the first child, not per-child.

`myPlayerId` is the single source of the value, and it is **byte-identical in
both versions**:

* HEAD `EventDetailScreen.tsx:675-688`
* d500ff8 `EventDetailScreen.tsx:623-636`

```ts
const matches = players.filter(p => parent_email === email || secondary_parent_email === email);
return matches.length === 1 ? matches[0].id : null;   // HEAD :687 / old :635
```

zztest1 matches **4** players, so `matches.length === 1` is false → `null`. The
memo's own doc comment says "or null when staff / **ambiguous**" — a parent of
more than one child on the same team is the ambiguous case, and the code
deliberately refuses to guess which child the answer is for.

There is exactly one RSVP row for the tap, carrying `player_id = null`.

**One real difference between the versions, which does NOT change this
symptom:** the old writer attached the key conditionally —
`if (myPlayerId) payload.player_id = myPlayerId;` (old `:653`) — so on null the
key was **omitted**. HEAD always sends it explicitly: `playerId: myPlayerId`
(HEAD `:728`) → `player_id: playerId` (`src/utils/rsvp.ts:72`, default `null` at
`:62`). For zztest1 the value is null either way and one null-player_id row
results in both. It matters only for a user who already holds a row WITH a
player_id: the old UPDATE left that column untouched, whereas a null-playerId
upsert now targets a different row under `NULLS NOT DISTINCT`. Not this case.

### (2) How does the roster memo map a null-player RSVP row to children?
**None of them.** Not one child, not all four.

The `resolvedRsvps` memo tries three things in order: explicit `player_id` →
responder IS the player (`user_roles`) → **exactly one** parent-email match.
With 4 matches the third fails too, and the row is pushed to `unmapped` with
`ambiguous: matches.length > 1`:

* HEAD `:580-596` (`if (matches.length === 1) add(...) else unmapped.push(...)`)
* d500ff8 `:531-543` (`if (matches.length === 1) byPlayer.set(...) else unmapped.push(...)`)

The guard is the same expression in both. So `byPlayer` stays **empty** and all
4 roster players resolve with zero candidates.

`unmapped` is computed in both versions and **rendered in neither** — there is
no `unmapped.map` anywhere in either file. zztest1's own answer is therefore
invisible as a row; it exists only inside the strip's count.

### (3) Why did headcounts count the row separately from the 4 roster rows?
Because the row belongs to no player (point 2), so it is counted as **its own
entity in addition to** the 4 unresolved roster rows — 5 counts for 4 humans.

**HEAD** `:661-673`: verdicts = 4 roster verdicts + every `unmapped.resolved`.
Each roster player has no candidates → `resolveEffectiveStatus([], null)` →
`no_reply` (`src/utils/attendanceResolver.ts:184`). The unmapped row → `going`.
`summarizeEffective` (`attendanceResolver.ts:202-218`) → **going 1, cantGo 0,
noReply 4**.

**d500ff8** `:603-616`, different arithmetic, same answer:
```
going            = rows with 'yes'              = 1
cant             = rows with 'no'               = 0
unansweredRows   = max(0, 1 - 1 - 0)            = 0
playersWithNoRsvp= max(0, 4 - byPlayer.size 0)  = 4
noReply          = 0 + 4                        = 4
```
→ **1 / 0 / 4.**

Both paths double-count the parent: once as a responder, four times as silent
children. The old code reached it by adding raw RSVP rows to unmatched roster
players; the new code reaches it by adding unmapped verdicts to roster
verdicts. Different mechanism, identical output.

### (4) Was this behavior identical at d500ff8?
**Yes, on all three points.**

| Point | d500ff8 | HEAD | Same? |
|---|---|---|---|
| player_id sent for a 4-child parent | `null` (`:635`) | `null` (`:687`) | identical code |
| null-player row → children | none, → `unmapped` (`:531`) | none, → `unmapped` (`:580`) | identical guard |
| strip for the scenario | 1 / 0 / 4 (`:603-616`) | 1 / 0 / 4 (`:661-673`) | identical numbers |

**F-A = PRE-EXISTING.** The build changed how the strip is computed, not what it
shows for this case. What the build *did* fix is a different bug in the same
area (a coach mark could never move the strip, and a duplicate row counted one
player twice) — neither of which is what zztest1 hit.

---

## F-B — parent view shows no attendee/roster list

### (1) At d500ff8, was a roster list rendered for non-staff?
**No.** The only per-player list in the file sits behind a double staff gate:

* `d500ff8:1138` — `{isStaff && (` wraps the whole Details/Attendance **tab
  bar**, so a parent never sees the Attendance tab to tap.
* `d500ff8:1159` — `{isStaff && activeTab === 'attendance' ? (` gates the
  branch that contains the list.
* `d500ff8:1177` — `roster.map((entry) => {` — the one and only render, inside
  that branch.

`isStaff = isManager || club_admin || platform_admin` (`d500ff8:238`). A parent
is none of these, so the list is unreachable. There is no `canSeeRoster` or any
other parent-facing variant anywhere in either file.

The Details tab a parent *does* see carries the counts only. The per-player list
that used to be duplicated there was removed earlier — the comment marking its
removal is present at `d500ff8:1559` **and** `HEAD:1632`, and it landed in
**bbf2d3c, 2026-10-06** ("feat: C batch - UX polish sweep"), two commits before
d500ff8 and four days before the device test.

### (2) At HEAD, same gate — unchanged, changed, or removed?
**Unchanged, textually identical.**

* `HEAD:1198` — `{isStaff && (` (tab bar)
* `HEAD:1219` — `{isStaff && activeTab === 'attendance' ? (` — `diff` of this
  line against `d500ff8:1159` is empty
* `HEAD:1237` — `roster.map((entry) => {`, still the only render
* `HEAD:257` — `isStaff` definition, identical to `d500ff8:238`

Decisive check:
```
git diff d500ff8 HEAD -- src/screens/EventDetailScreen.tsx \
  | grep -E "^[-+].*(isStaff|activeTab|canSeeRoster)"
→ no output
```
No added or removed line in the entire diff mentions `isStaff`, `activeTab`, or
`canSeeRoster`.

### (3) If changed, which hunk?
Not changed, so no hunk. For completeness, the one hunk that touches the roster
region is `@@ -1177,15 +1237,18 @@` — it rewrites the per-row **attribution
string** ("by Coach X" → "marked by Coach X", suppressed on `no_reply`) *inside*
the already-staff-gated branch. It alters label text for coaches; it neither
adds nor removes a visibility condition.

**F-B = PRE-EXISTING.** A parent has never had an attendee list on this screen
in either commit. Whether they *should* is a product decision, not a regression.

---

## Note for the Oct 9 recon

`docs/recon/rsvp-attendance-oct09.md` §5 still describes the positional
"coach mark wins" precedence as current. 13dfb4c replaced it with latest-wins.
That doc now describes superseded behavior and wants a "superseded by 13dfb4c"
header; this file does not fix it (out of this task's scope).

## Open, not answered here (needs a decision, not more recon)

1. A parent of 2+ children on one team cannot RSVP **per child** at all — one
   tap writes one ambiguous row for the whole family. That is the real defect
   behind F-A, and it is a product/schema question (per-child answer UI), not a
   counting bug.
2. The strip's population is "roster players + unattributable responders", so
   any unattributable row inflates the total above the roster size. Either
   unmapped rows stop counting, or the strip stops claiming to be a roster
   headcount.
