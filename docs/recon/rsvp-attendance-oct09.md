# Recon: the two attendance data models — 2026-10-09

Repo: thryvyng-mobile @ `7273de3` (branch `main`)
Scope read: `src/**` (read-only). No file in `src/` was modified.
Not inspected (outside scope): `supabase/**` — so RLS policies, FK/cascade behavior,
unique constraints and any DB trigger that might sync the two tables are
**unverified here**. Claims about them are marked INFERRED.

---

## 0. The two models at a glance

| | Table A | Table B |
|---|---|---|
| Table | `cal_event_rsvps` | `event_attendance` |
| Vocabulary | `yes` · `no` · `maybe` · `pending` (`src/types/index.ts:152`) | `present` · `absent` · `late` · `excused` (`src/screens/EventDetailScreen.tsx:70`) |
| Keyed by | `event_id` + `user_id` (writer lookups), `player_id` nullable | `event_id` + `player_id` (`onConflict`, `EventDetailScreen.tsx:1071`) |
| Owner identity | the **responder** (`user_id`) | the **player** (`player_id`), plus `marked_by` |
| Extra columns used | `decline_reason`, `responded_at`, `updated_at` | `marked_by` |
| Row shape in TS | `EventRSVP` — `src/types/index.ts:200-210` | `AttendanceRow` — `EventDetailScreen.tsx:155-160` |

Display bridge: `COACH_TO_DISPLAY` (`EventDetailScreen.tsx:76-81`) maps
present→going, absent→cant, late→late, excused→excused. **It is a render-time
mapping only — nothing writes through it.**

---

## 1. "Will you be there?" (event detail)

**Writes `cal_event_rsvps`.** Handler `handleRsvp` — `src/screens/EventDetailScreen.tsx:638-731`.

- Status values it can write: **`'yes' | 'no' | 'pending'`** only (`:639`).
  It never writes `'maybe'`; `'maybe'` survives in the type and in legacy rows.
- Payload (`:645-653`): `status`, `responded_at`, `decline_reason`
  (set only on `no`, explicitly nulled on yes/pending), plus `player_id`
  **only when this user speaks for exactly one player** (`myPlayerId`, `:624-636`).
- Lookup/upsert is hand-rolled, not a DB upsert: `select('id')` by
  `event_id + user_id` with `.limit(1)` (`:657-663`) → `update` by row id
  (`:673-686`) or `insert` (`:685-699`). `limit(1)` is deliberate so a duplicate
  row cannot error the answer out; the duplicate itself is left in place.
- Both branches check `!data || data.length === 0` because **RLS filters a denied
  write out silently** (`:678`, `:694`).
- UI: `EventDetailScreen.tsx:1481-1534`.

### Can a player/parent change their answer after the fact?
**YES, freely, until the event ends.**

- The control is a toggle, not a one-shot: the ✓ button reads
  `myRsvp?.status === 'yes' ? handleRsvp('pending') : handleRsvp('yes')`
  (`:1515-1517`) — tapping an active "going" **undoes it back to `pending`**.
  The ✗ button always reopens the reason modal (`:1496`).
- `myRsvp` is just the user's own row (`:618-621`); nothing locks it, and no
  write path ever checks a previous value.
- The **only** gate is time: the whole card is wrapped in
  `{!isEventPast(event) && ( … )}` (`:1481`), and a second branch at `:1613`
  replaces the RSVP block with "This event has passed".
  `isEventPast` = event end (or 23:59:59 when `end_time` is unparseable)
  < now — `src/utils/calendar.ts:5-15`.
- Same answer on the calendar list: `CalendarScreen.handleRsvp` is the identical
  toggle (`src/screens/CalendarScreen.tsx:279-337`).

---

## 2. Coach attendance marking

**There are TWO coach-facing attendance writers, and they write DIFFERENT tables.**
This is the headline finding.

### 2a. EventDetail "Attendance" tab → `event_attendance`
- `markAttendance` — `src/screens/EventDetailScreen.tsx:1057-1084`.
  `upsert({event_id, player_id, status, marked_by: user.id}, {onConflict: 'event_id,player_id'})`.
- `unmarkAttendance` — `:1087-1105`. Hard `delete` by `event_id + player_id`.
- Status values: `CoachStatus = 'present' | 'absent' | 'late' | 'excused'`
  (`:70`). The UI only exposes **absent** and **present** buttons
  (`:1241`, `:1263`); `late` / `excused` are typed and renderable
  (`STATUS_CHIP`, `:83-89`) but have no control — INFERRED: legacy or
  web-only values.
- Gated `isStaff` (`:1058`), and the write is re-checked for a silent RLS
  refusal (`:1075`).
- **Does it read or write RSVPs?** It **writes** none — the doc comment at
  `:1053-1055` says so and the code matches. It **reads** them: the same screen
  loads `cal_event_rsvps` at `:272-275` and resolves them per player, and the
  roster blends both (see §5).

### 2b. `AttendanceScreen` → `cal_event_rsvps` ⚠️
`src/screens/AttendanceScreen.tsx` — titled **"Take Attendance"**
(`src/navigation/AppNavigator.tsx:593`) — is a coach sheet that writes the
**family's** table, not `event_attendance`:

- `handleSave` — `AttendanceScreen.tsx:170-247`. Per roster player:
  find existing RSVP **by `player_id`** (`:184`) → `update` that row's `status`
  + `responded_at` (`:188-195`), else `insert` `{event_id, player_id, user_id: user.id, status, responded_at}`
  (`:198-204`).
- Status values written: **`'yes' | 'no' | 'maybe'`** — the family vocabulary,
  relabelled for coaches as Present / Absent / Maybe
  (`STATUS_OPTIONS`, `:60-68`).
- It **reads** `cal_event_rsvps` (`:115-118`) and seeds every unmarked player to
  `'maybe'` (`:129-135`). It never touches `event_attendance` at all.
- `getStatusHint` (`:155-166`) surfaces the family's prior answer as
  "Previously: Going / Can't go" — so the screen knowingly shows a parent's
  answer in the row it is about to overwrite.
- Its save loop runs **serially** in a `for` loop over the whole roster, one
  round trip per player.

**Reachability:** registered as a stack screen at `AppNavigator.tsx:593-595`,
but `grep -rn "navigate(.Attendance" src/` returns **no call sites** — nothing in
`src/` navigates to it, and it is not in the deep-link config.
INFERRED: dead route, kept alive by the navigator. It is still a live writer the
moment anything routes to it.

So the comment at `EventDetailScreen.tsx:1053-1055` ("Coach headcount tool.
Writes ONLY to event_attendance -- never to cal_event_rsvps, whose vocabulary
is the family's") is true **of that screen** and false **of the app**.

---

## 3. The Responses summary (Going / Can't go / No reply)

Rendered at `src/screens/EventDetailScreen.tsx:1543-1556` from the
`headcounts` memo — `:603-616`.

**It reads ONE table: `cal_event_rsvps`. It does not merge `event_attendance`.**

Exact source: `eventRsvps`, loaded by `fetchEvent` at `:272-275`
(`from('cal_event_rsvps').select('*').eq('event_id', data.id)` — no other filter),
then:

```
going   = eventRsvps.filter(r => r.status === 'yes').length          // :604
cant    = eventRsvps.filter(r => r.status === 'no').length           // :605
unansweredRows   = max(0, eventRsvps.length - going - cant)          // :608  (maybe/pending/null)
playersWithNoRsvp = max(0, players.length - resolvedRsvps.byPlayer.size) // :611-614
noReply = unansweredRows + playersWithNoRsvp                         // :615
```

- `players` is the team roster (`fetchRoster`, `:303-311`).
- `resolvedRsvps.byPlayer` is the RSVP→player resolution map (`:502-544`).
- The comment at `:588-602` states the design intent: count **one** way (raw RSVP
  rows) because the old strip mixed RSVP rows with player-matched roster entries
  and produced "Going 6 / Headcount 1".

Consequence: **a coach mark never moves this strip.** A coach can mark all 15
players present in the Attendance tab and Responses still reads
`Going 0 / Can't go 0 / No reply 15`.

Note an unrelated duplicate: `fetchEvent` also builds its own
`rsvp_counts {yes,no,maybe}` at `:277-282` and stuffs it on the event object.
Nothing on this screen reads it — the strip uses `headcounts`. Two other
surfaces build the same shape independently:
`CalendarScreen.tsx:235-241` and `useCalendarEvents.ts:73-78` (the latter adds
`pending`), consumed by the calendar cards (`CalendarScreen.tsx:773-780`,
`:974-978`; `EventCard.tsx:47,137-140`). All three count `cal_event_rsvps` only.

---

## 4. Any code that syncs or reconciles the two tables?

**NO. There is none.**

```
grep -rn "cal_event_rsvps" src/   → 18 hits across 4 files
grep -rn "event_attendance"  src/ →  5 hits across 2 files
files naming BOTH: src/screens/EventDetailScreen.tsx, src/screens/CalendarScreen.tsx
```

- `CalendarScreen.tsx:277-278` mentions `event_attendance` **in a comment only**
  ("The ONE cal_event_rsvps write path on this screen. Never touches
  event_attendance"). No query.
- `EventDetailScreen.tsx` is the only file that touches both, and it keeps them
  strictly apart: `event_attendance` at `:318` (read), `:1063` (upsert),
  `:1093` (delete); `cal_event_rsvps` at `:273`, `:450`, `:658/674/686`,
  `:897`, `:967`. The only place they meet is the **render-time** `roster` memo
  (`:547-586`), which picks a winner rather than writing one back.
- The sole word "reconcile" in the area (`:703`) refers to a UI refetch, not to
  the two tables.
- INFERRED (not verified, `supabase/**` out of scope): no DB trigger was checked,
  so a server-side sync cannot be ruled out from `src/` alone.

Related asymmetry in cleanup: both delete paths remove `cal_event_rsvps` rows
before deleting the event (`:897-900` single, `:967-970` series) and **never
touch `event_attendance`**, so coach marks are orphaned unless the FK cascades
(unverified).

---

## 5. Current conflict behavior

Precedence is declared once, at `EventDetailScreen.tsx:546` —
**"Coach mark wins, then family RSVP, then no reply."** Implemented in the
`roster` memo, `:547-586`.

### Coach marks (via Attendance tab), then the player/parent RSVPs

| Surface | What it shows | Why |
|---|---|---|
| EventDetail **Attendance tab / roster list** | the **coach's** status, labelled with the coach's first name (`source: 'coach'` → "coach-marked") | `roster` finds the `event_attendance` row first and returns early (`:547-562`) — the family RSVP is never consulted for that player |
| EventDetail **Responses strip** | the **family's** answer (coach mark invisible) | `headcounts` reads `cal_event_rsvps` only (§3) |
| **"Will you be there?"** card | the family's own answer, editable | `myRsvp` is the user's own RSVP row (`:618-621`); nothing reads `event_attendance` |
| **Calendar list / EventCard** counts | the family's answer | `cal_event_rsvps` only (`CalendarScreen.tsx:235-241`) |

So the same screen shows two different truths at once: roster row "Absent —
coach-marked" above a strip reading "Going 1". Nothing warns about the
disagreement — `hasCoachMark` / `coachStatus` are carried on the roster entry
(`:559-560`) and used to style the coach buttons (`:1241`, `:1263`), not to flag
an override of a family answer.

### Player/parent RSVPs first, then the coach marks
Identical outcome — precedence is positional, not chronological. `roster` checks
`attendanceRows` before `resolvedRsvps` with **no timestamp comparison**
(`event_attendance` has no `responded_at` read here, and `marked_by` carries no
time). A coach mark from last week beats an RSVP from five minutes ago, and
vice-versa is impossible.

### The dangerous case: coach saves `AttendanceScreen` (if routed to)
Because 2b writes the **same table and the same row** the family owns, there is
no precedence to apply — it is a **destructive overwrite**:

1. `handleSave` finds the existing row by `player_id` (`AttendanceScreen.tsx:184`)
   — that is the **parent's own RSVP row** whenever the parent's RSVP carried
   `player_id` — and updates its `status` in place (`:188-195`). The parent's
   answer is gone, with no audit column distinguishing who changed it.
2. For players with no RSVP, it **inserts** a row with
   `user_id = the coach's id` and `player_id = the player` (`:198-204`).
   On EventDetail that row resolves via `r.player_id` and is labelled
   `source: 'parent'` → the roster says **"by parent"** for a coach-made mark
   (`:509-513` — `selfPlayerId === r.player_id ? 'player' : 'parent'`, and a
   coach is neither).
3. Those coach-owned rows then count in the Responses strip as real answers
   (`'yes'` → Going +1), which is the one way a coach mark *can* move the strip —
   via the wrong table.

### Duplicate-row hazard (independent of the coach)
Every family writer looks up by `event_id + user_id`
(`EventDetailScreen.tsx:658-663`, `CalendarScreen.tsx:301-307`,
`useCalendarEvents.ts:245-250`), while `AttendanceScreen` looks up by
`player_id`. Two rows can therefore exist for one player (parent's row +
coach-inserted row). Then:
- `headcounts` counts **both** → one player can read as `Going 2`.
- `resolvedRsvps.byPlayer` is a `Map` filled in result-set order with no
  `ORDER BY` on the select (`:273`), so `byPlayer.set(player_id, …)` is
  **last-write-wins over an unordered result** — which answer the roster shows
  is not deterministic across refetches.
All three family writers use `.limit(1)` precisely so a duplicate "must not
error the answer out" (`EventDetailScreen.tsx:655-656`) — they tolerate duplicates rather than
prevent them. INFERRED: whether the DB has a unique constraint on
`(event_id, user_id)` was not checked.

---

## Gaps worth a follow-up task (no action taken)

1. **`AttendanceScreen` writes the family's table with the coach's identity**
   (§2b) — the single highest-risk item. It is currently un-routed, so the
   cheapest fix is deleting the route + screen rather than porting it.
2. **Responses strip can never reflect coach marks** (§3) while the roster row
   always prefers them (§5) — one screen, two truths, no warning.
3. **Precedence has no recency rule** (§5) — a stale coach mark outranks a fresh
   family RSVP permanently.
4. **`late` / `excused` are writable in type only** — no UI, and
   `COACH_TO_DISPLAY` maps them to chips a family vocabulary cannot express.
5. **Event delete removes RSVPs but not `event_attendance`**
   (`EventDetailScreen.tsx:897`, `:967`) — orphan risk if no FK cascade.
6. **Dead fourth RSVP writer**: `useCalendarEvents.updateRsvp`
   (`src/hooks/useCalendarEvents.ts:239-277`) is exported and never consumed —
   `CalendarScreen.tsx:120-123` destructures only the two create functions. The
   hook also still runs a full events+RSVP fetch (`:28`, `:60`) whose result
   nobody reads on that screen.
7. **`rsvp_counts` is rebuilt in three places** with slightly different shapes
   (`EventDetailScreen.tsx:277`, `CalendarScreen.tsx:235`,
   `useCalendarEvents.ts:73` — only the last has `pending`).
