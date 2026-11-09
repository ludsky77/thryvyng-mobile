# Attendance / RSVP counting recon — 2026-11-09

Read-only. No code changed. One SELECT-only psql run against prod (pooler), 2026-11-09.
Players are named by initials only. Sources: mobile `src/` at `bcaf2de`, `docs/ledger.md`
(Oct 26 BLOCKED note ~L463; `CAL-NOREPLY-COUNT` ~L2909), web migrations in
`thrive-and-score/supabase/migrations/`, and the psql output (section ids S0–S10 below).

## Data — what prod says

**Event lookup.** S1 searched `cal_events.title ILIKE '%UPSL%' OR '%Shooters%'`, event_date >= today-60, on ANY team.
- **Shooters: FOUND.** "Shooters NN Blue", 2026-11-07, `event_type=game`, team "PAC Girls U17 [coach surname redacted]", club "Provo Athletic Club".
- **UPSL: NOT FOUND.** No event in the window, on any team, has "UPSL" in its title. The UPSL numbers below are therefore
  **UNKNOWN**. The one check that settles it: re-run S2–S5 with the event picked by `team_id` + `event_date`
  (or by title ILIKE '%vs%'). INFERRED cause: "UPSL" appears somewhere other than the title (location, notes, opponent), or the event is older than 60 days.
- **Club-wide (S7/S8): NOT ANSWERED.** The club is called "Provo Athletic Club", not "PAC", so `clubs.name ILIKE '%PAC%'`
  matched 0 clubs and S8 returned zeros. They are **not real zeros**. The fix is a re-run with `ILIKE '%Provo Athletic%'`.

**Shooters, 2026-11-07 (S2–S6, S9).**
| Measure | Value |
|---|---|
| Active roster (`players.status='active'`) | **15** (all 15 players on the team are active, S9) |
| `cal_event_rsvps` rows | **16**: yes 14 · no 2 · pending 0 |
| …with NULL `player_id` | **7** (6 yes, 1 no) |
| …with a `player_id` that is not on the active roster | 0 |
| Distinct responding user_ids | 14 → map to 0 players: **0** · exactly 1: **14** · 2+: **0** (via parent_email/secondary_parent_email or `user_roles` player role) |
| Responders who are also team_staff | 1 (that user also maps to exactly 1 player) |
| Users holding 2+ rows | 2 |
| All 7 NULL-player_id rows come from | users that map to exactly ONE player, so they could be backfilled without guessing |
| `event_attendance` rows | **1** (present 1), 0 off-roster |
| `game_sessions` rows for the event | 1 |

**Per player, latest wins (S5).** The DB-side truth, computed per player:
**10 going · 2 can't go · 3 no reply = 15**.
- **Going (10):** AB, AM (2 candidate rows), BH (3), BM (null-pid), CH, GA, IA, KB (null-pid), MC (null-pid), WL (2).
- **Can't go (2):** NW, PF (null-pid).
- **No reply (3):** GM, LS, LS.
- **Only player with both an RSVP and a coach mark:** IA. Coach "present" at 11-07 22:02, RSVP yes at 22:30, so the RSVP is latest. Both say going.
- **What the calendar card shows for this event:** ✓14 ✕2 ?0. That is 16 answers on a roster of 15, which **breaks the "no count may exceed roster" ruling**.

## Q1 — how each surface computes its numbers: THREE paths, not one
1. **Calendar list card** counts raw rows (`src/screens/CalendarScreen.tsx:244-252`) from one `cal_event_rsvps` read (`:199-202`), rendered at `:628-634`.
   - It merges no `event_attendance`, does no per-player dedupe and has no roster.
   - A family with a NULL row plus a player_id row, or two parents, counts twice.
   - `?` = rows with `status='pending'`, which is ~always 0 (ledger CAL-NOREPLY-COUNT).
2. **Event-detail Responses strip** reads `headcounts` (`src/screens/EventDetailScreen.tsx:647-665`), which is `eventHeadcount(rosterVerdicts, unmappedVerdicts)` (`src/utils/attendanceResolver.ts:232-250`).
   It is drawn by `ResponsesBar` with `rosterCount={roster.length}` (`EventDetailScreen.tsx:1461`).
3. **Attendance tab** renders `roster` (`EventDetailScreen.tsx:590-628`), the same verdicts the strip uses (`:1549-1660`).
- **Result:** surfaces 2 and 3 share one resolver and one in-screen fetch. Surface 1 is a separate path.
- **No shared hook exists.** The fetch and identity logic are inline in `EventDetailScreen` (`fetchEvent :225`, `fetchRoster :284`, `resolvedRsvps :512`).

## Q2 — how "roster" is computed, and why it can read 1 or 0
- **Detail and Attendance tab:** `fetchRoster` uses `players.select(...).eq('team_id', …)` (`EventDetailScreen.tsx:288-294`).
  - It has **no `status='active'` filter**, so for staff, inactive players count too. This was harmless on Shooters, where all 15 are active.
  - It runs for **every role**, under RLS.
- **RLS (S10, prod `pg_policies`):** a parent's only path to `players` rows is *"Parents and players can view own records"*: `parent_email = get_user_email(auth.uid())`, etc.
  Staff see the whole team through *"Team staff can view team players"*, club admins through `is_club_admin`.
- **So a parent's roster = their own child or children → "1 on the roster" (bug A).** This is PROVEN by the policy text. It confirms the ledger's INFERRED Oct 26 / Nov 4 note.
- **"0 on the roster" (bug B)** has two code routes:
  - (a) the `players` read errored. The catch at `:347-351` sets `players=[]`, swallowing the error into a fake empty roster.
  - (b) the read never settled. `players` keeps its initial `[]` (`:183`).
  A parent whose email matches a kid would get ≥1, so 0 for a matching parent means (a) or (b). See Q5.
- **Calendar card:** has no roster at all (`CalendarScreen.tsx:244-252`).

## Q3 — the Stone C resolver and latest-mark-wins
- **The rule is implemented** in `resolveEffectiveStatus` (`attendanceResolver.ts:142-192`):
  - The coach mark seeds the contest.
  - Each RSVP row wins only when it is strictly newer (`:167-169`), so on a tie the coach wins.
  - RSVP time is `updated_at ?? responded_at` (`:163`). Coach time is `updated_at ?? created_at` (`:157`).
  - Source is labeled `coach` / `parent` / `player`.
- **Timestamp columns, proven twice** (S0 `information_schema`, plus migrations):
  - `cal_event_rsvps`: `responded_at`, `updated_at` (`20260108184412_…sql:203-213`).
  - `event_attendance`: `created_at`, `updated_at`. The CREATE TABLE is not in the web migrations dir; only the trigger is, in `20261009210500_rsvp_attendance_integrity.sql:24-27`.
  - Both have a BEFORE UPDATE trigger, `tg_touch_updated_at` (`20261009210500…sql:15-27`).
- **Two gaps against the locked rulings:**
  - `eventHeadcount` adds `extraResults` (unmapped RSVPs) into going/cantGo (`:242`), so **counts can exceed the roster**. The bar even divides by verdicts rather than roster for that reason (`ResponsesBar.tsx:31-34`).
  - RSVP rows whose `player_id` is not in the visible `players` list are collected into `byPlayer` (`EventDetailScreen.tsx:537-539`) and then **silently dropped**, because `roster` iterates `players` only (`:591`).

## Q4 — NULL player_id rows, and user → player mapping
- **Where NULL rows are written:** `upsertRsvp` writes `player_id = myPlayerId` (`src/utils/rsvp.ts:66-79`).
  - Detail: `myPlayerId` is null unless the user is a player-role user or matches **exactly one** kid by email (`EventDetailScreen.tsx:668-680`).
  - Calendar: `myPlayerByTeam` keeps only teams with exactly one kid (`CalendarScreen.tsx:217-237`).
  - So a **multi-kid parent, a staff member, or anyone the email bridge misses writes a NULL row.** That is the phantom.
- **How NULL rows enter the counts:**
  - Card: counted as rows (`CalendarScreen.tsx:248-252`).
  - Detail: `resolvedRsvps` maps a NULL row through the player role (`:544-547`), then through an email bridge where exactly one match is needed (`:549-560`). Otherwise the row becomes `unmapped`, still counts in the strip (`:561-576` → `:656`), and can push the strip past the roster.
- **The email bridge reads `profiles.email`** (`:378-381`). Its comment (`:383-385`) says RLS may hide other members' profiles from a parent. INFERRED: for a parent viewer, most other families' NULL rows end up unmapped.
- **Card's own-answer read:** `user_rsvp = rsvps.find(r => r.user_id === user.id)` (`CalendarScreen.tsx:253`). A multi-kid parent sees whichever of their rows comes first.
- **Prod (Shooters):** all 7 NULL rows belong to users who map to exactly one player. There were no multi-kid responders on this event.

## Q5 — the spinner (bug B)
- **No path sets a loading flag without clearing it.** Every loading flag on the detail path is cleared in `finally`:
  - main `loading`: `EventDetailScreen.tsx:231/:278`
  - `rsvpLoading`: `:709/:769`
  - `reminderSending`: `:779/:813`
  - `GameEntryButton.isLoading`: `src/components/game-stats/GameEntryButton.tsx:57/:70`
  **So a request that errors does stop its spinner.**
- **Which spinner it is:** the event is `event_type=game` (S1), so the Details tab renders `GameEntryButton` (`EventDetailScreen.tsx:1681-1688`). Its `isLoading` **starts `true`** (`GameEntryButton.tsx:53`) and shows an ActivityIndicator (`:94-99`). For a parent, this is the only spinner on the Details tab.
- **INFERRED:** an endless spinner together with "0 on the roster" fits **requests that never settle** better than requests that fail:
  - `players` stays at its initial `[]`, and `isLoading` stays at its initial `true`.
  - There is no timeout on any supabase call.
  - A failed read would have cleared the spinner.
  The check that would prove it: reproduce on the Shooters event with network logging, or with a timeout added around `fetchSession` / `fetchRoster`.
- **Swallowed errors that make "failed" look like "empty":**
  - `fetchRoster` catch → `players=[]` (`:347-351`).
  - The RSVP read in `fetchEvent` never checks `error` (`:259-264`), so a failed read becomes "no RSVPs".
  - `GameEntryButton` catch → `existingSession=null` (`:66-68`), which renders "Start Match Center".
  - The card's RSVP read raises an Alert, then carries on with empty counts (`CalendarScreen.tsx:204-207`).

## Q6 — write access today
- **Coach marking:**
  - `isStaff` = a `team_staff` row (count>0, `EventDetailScreen.tsx:204-216`) OR `currentRole` is `club_admin`/`platform_admin` (`:222`).
  - It gates the tab bar (`:1528`), the Attendance tab (`:1549`), `markAttendance` (`:1109-1110`) and `unmarkAttendance` (`:1139-1140`).
- **DB side** (S10): `event_attendance` INSERT, UPDATE and DELETE require a **`team_staff`** row only. SELECT is team-wide (`get_user_team_ids`).
  **Drift:** a club_admin or platform_admin with no team_staff row sees the ✓/✗ controls, and every write is refused ("Could not save attendance", `:1127-1130`).
- **Self-mark:** `RsvpPill` on Details (`:1441`) and on the calendar card (`CalendarScreen.tsx:642`) has no role gate. The write is always the user's own row (`cal_rsvps_insert`/`update`: `user_id = auth.uid()`, S10).
- **Visibility vs the ruling:** the ruling says the whole team sees names and status read-only. Today non-staff see **no** per-player list (Attendance tab is staff-only, `:1549`), and under `players` RLS a parent **cannot read** teammates' names.

## Q7 — minimal fix shape (report only)
**Client files that must change so all three surfaces read one resolver:**
1. `src/utils/attendanceResolver.ts`
   - `eventHeadcount` stops adding unmapped extras to going/cantGo (counts capped at the roster).
   - Add a batched multi-event helper.
2. **NEW** `src/hooks/useEventAttendance.ts` (or `src/utils/eventAttendance.ts`). The ONE fetch + identity + resolve.
   - It replaces `fetchRoster`, `resolvedRsvps`, `roster` and `headcounts` in the detail screen.
   - It returns an explicit `state: 'loading' | 'ready' | 'error'`, with a request timeout.
3. `src/screens/EventDetailScreen.tsx`
   - Consume the hook.
   - Show an empty or error state instead of "0 on the roster".
   - Make the per-player list readable by the whole team, with ✓/✗ for staff only.
   - Per-child RSVP for multi-kid parents.
4. `src/screens/CalendarScreen.tsx`: card counts come from the batched resolver, not a row tally (`:244-252`).
5. `src/components/calendar/ResponsesBar.tsx`: an error/empty prop; the denominator becomes the roster.
6. `src/components/calendar/RsvpPill.tsx`: a per-child variant, or a child picker, for multi-kid parents.
7. `src/components/game-stats/GameEntryButton.tsx`: timeout plus empty state, so the spinner cannot run forever.
8. `src/utils/attendanceResolver.test.ts`: cases for the roster cap, NULL rows and the multi-kid parent.
9. `src/utils/rsvp.ts`: probably unchanged. It already takes `playerId`; callers must stop passing null for multi-kid parents.

**DB change NEEDED (out of this chunk, SACRED):**
- **(a)** A parent cannot compute a roster-sized count, or see teammates' names, from the client. `players` RLS is own-records-only for parents (S10).
  It needs a **`SECURITY DEFINER` read function**, for example `event_attendance_view(event_id)`. For team members only, it would return one row per active roster player: name or initials, effective status, source and time.
  Doing the resolve in SQL would also remove the client's `profiles` email bridge. This is ledger option B, widened to cover names.
  Without (a), the ruling "whole team sees names + status" cannot be met for parents.
- **(b)** Optional data migration: backfill `player_id` on the NULL rows whose user maps to exactly one active player (7 rows on Shooters; club-wide count still UNKNOWN), then dedupe.
- **(c)** Optional: decide whether club_admin without team_staff may mark attendance. Either widen the `event_attendance` write policies, or narrow the client's `isStaff`.

## Found outside scope (2026-11-09)
- **Parents may be shown "Start Match Center".** INFERRED. The `game_sessions` SELECT policy (S10) lists platform_admin, club_admin, club_staff… (text truncated). A parent's read may return null with no error, and `GameEntryButton` then renders "Start Match Center" (`GameEntryButton.tsx:169-183`).
- **Staff roster includes inactive players.** `fetchRoster` has no `status='active'` filter (`EventDetailScreen.tsx:288-294`).
- **Reminders count a different population.** `fetchNonResponders` counts accounts, not players (ledger open ruling "Remind {n}", Oct 26). It is unchanged.

## SQL used (`/tmp/attendance-recon.sql`, SELECT-only, run once, exit 0)
```sql
-- attendance recon, 2026-11-09. SELECT-only. No names/emails are output; players appear as initials.

SELECT '== S0 column inventory (timestamps proof)' AS section;
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('cal_event_rsvps', 'event_attendance')
ORDER BY table_name, ordinal_position;

SELECT '== S1 candidate events (title UPSL/Shooters, last 60d or future, any team)' AS section;
SELECT e.id AS event_id, e.title, e.event_date, e.event_type, t.name AS team_name, c.name AS club_name
FROM cal_events e
JOIN teams t ON t.id = e.team_id
LEFT JOIN clubs c ON c.id = t.club_id
WHERE (e.title ILIKE '%UPSL%' OR e.title ILIKE '%Shooters%')
  AND e.event_date >= current_date - 60
ORDER BY e.event_date;

SELECT '== S2 target events: per-event roster + rsvp tallies' AS section;
WITH tgt AS (
  SELECT e.id, e.event_date, e.event_type, e.team_id, t.name AS team_name,
         CASE WHEN e.title ILIKE '%UPSL%' THEN 'UPSL' ELSE 'Shooters' END AS tag
  FROM cal_events e JOIN teams t ON t.id = e.team_id
  WHERE (e.title ILIKE '%UPSL%' OR e.title ILIKE '%Shooters%')
    AND t.name ILIKE '%17%' AND t.name ILIKE '%girl%'
    AND e.event_date >= current_date - 60
)
SELECT tg.tag, tg.event_date, tg.event_type, tg.team_name,
  (SELECT count(*) FROM players p WHERE p.team_id = tg.team_id AND p.status = 'active') AS roster_active,
  (SELECT count(*) FROM players p WHERE p.team_id = tg.team_id) AS players_any_status,
  count(r.id) AS rsvp_rows,
  count(r.id) FILTER (WHERE r.status = 'yes') AS yes,
  count(r.id) FILTER (WHERE r.status = 'no') AS no,
  count(r.id) FILTER (WHERE r.status = 'pending') AS pending,
  count(r.id) FILTER (WHERE r.player_id IS NULL) AS null_pid,
  count(r.id) FILTER (WHERE r.player_id IS NULL AND r.status = 'yes') AS null_pid_yes,
  count(r.id) FILTER (WHERE r.player_id IS NULL AND r.status = 'no') AS null_pid_no,
  count(r.id) FILTER (WHERE r.player_id IS NOT NULL AND NOT EXISTS (
     SELECT 1 FROM players p WHERE p.id = r.player_id AND p.team_id = tg.team_id AND p.status = 'active')) AS pid_off_active_roster,
  count(DISTINCT r.user_id) AS distinct_users,
  count(DISTINCT r.player_id) AS distinct_pids
FROM tgt tg LEFT JOIN cal_event_rsvps r ON r.event_id = tg.id
GROUP BY tg.tag, tg.event_date, tg.event_type, tg.team_name, tg.team_id
ORDER BY tg.tag, tg.event_date;

SELECT '== S3 target events: rsvp user_id -> active players on team (0/1/2+), staff flag' AS section;
WITH tgt AS (
  SELECT e.id, e.event_date, e.team_id,
         CASE WHEN e.title ILIKE '%UPSL%' THEN 'UPSL' ELSE 'Shooters' END AS tag
  FROM cal_events e JOIN teams t ON t.id = e.team_id
  WHERE (e.title ILIKE '%UPSL%' OR e.title ILIKE '%Shooters%')
    AND t.name ILIKE '%17%' AND t.name ILIKE '%girl%'
    AND e.event_date >= current_date - 60
), umap AS (
  SELECT tg.tag, tg.event_date, u.user_id, u.n_rows, u.n_null,
    (SELECT count(DISTINCT p.id) FROM players p
       LEFT JOIN profiles pr ON pr.id = u.user_id
      WHERE p.team_id = tg.team_id AND p.status = 'active'
        AND ((pr.email IS NOT NULL AND (lower(p.parent_email) = lower(pr.email)
                                      OR lower(p.secondary_parent_email) = lower(pr.email)))
             OR EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = u.user_id
                          AND ur.role = 'player' AND ur.entity_id::text = p.id::text))) AS kids,
    EXISTS (SELECT 1 FROM team_staff s WHERE s.team_id = tg.team_id AND s.user_id = u.user_id) AS is_staff
  FROM tgt tg
  JOIN (SELECT event_id, user_id, count(*) AS n_rows,
               count(*) FILTER (WHERE player_id IS NULL) AS n_null
          FROM cal_event_rsvps GROUP BY event_id, user_id) u ON u.event_id = tg.id
)
SELECT tag, event_date,
  count(*) AS users,
  count(*) FILTER (WHERE kids = 0) AS users_map0,
  count(*) FILTER (WHERE kids = 1) AS users_map1,
  count(*) FILTER (WHERE kids >= 2) AS users_map2plus,
  count(*) FILTER (WHERE is_staff) AS users_staff,
  sum(n_null) FILTER (WHERE kids = 0) AS null_rows_from_map0,
  sum(n_null) FILTER (WHERE kids = 1) AS null_rows_from_map1,
  sum(n_null) FILTER (WHERE kids >= 2) AS null_rows_from_map2plus,
  count(*) FILTER (WHERE n_rows >= 2) AS users_with_2plus_rows
FROM umap GROUP BY tag, event_date ORDER BY tag, event_date;

SELECT '== S4 target events: event_attendance tallies' AS section;
WITH tgt AS (
  SELECT e.id, e.event_date, e.team_id,
         CASE WHEN e.title ILIKE '%UPSL%' THEN 'UPSL' ELSE 'Shooters' END AS tag
  FROM cal_events e JOIN teams t ON t.id = e.team_id
  WHERE (e.title ILIKE '%UPSL%' OR e.title ILIKE '%Shooters%')
    AND t.name ILIKE '%17%' AND t.name ILIKE '%girl%'
    AND e.event_date >= current_date - 60
)
SELECT tg.tag, tg.event_date,
  count(a.id) AS att_rows,
  count(a.id) FILTER (WHERE a.status = 'present') AS present,
  count(a.id) FILTER (WHERE a.status = 'absent') AS absent,
  count(a.id) FILTER (WHERE a.status = 'late') AS late,
  count(a.id) FILTER (WHERE a.status = 'excused') AS excused,
  count(a.id) FILTER (WHERE a.id IS NOT NULL AND NOT EXISTS (
     SELECT 1 FROM players p WHERE p.id = a.player_id AND p.team_id = tg.team_id AND p.status = 'active')) AS off_active_roster
FROM tgt tg LEFT JOIN event_attendance a ON a.event_id = tg.id
GROUP BY tg.tag, tg.event_date ORDER BY tg.tag, tg.event_date;

SELECT '== S5 target events: per active player, latest rsvp vs coach mark (initials only)' AS section;
WITH tgt AS (
  SELECT e.id, e.event_date, e.team_id,
         CASE WHEN e.title ILIKE '%UPSL%' THEN 'UPSL' ELSE 'Shooters' END AS tag
  FROM cal_events e JOIN teams t ON t.id = e.team_id
  WHERE (e.title ILIKE '%UPSL%' OR e.title ILIKE '%Shooters%')
    AND t.name ILIKE '%17%' AND t.name ILIKE '%girl%'
    AND e.event_date >= current_date - 60
)
SELECT tg.tag, tg.event_date,
  upper(left(p.first_name, 1) || left(p.last_name, 1)) AS who,
  rr.n_cand, rr.via, rr.status AS rsvp_status, rr.ts AS rsvp_at,
  a.status AS att_status, coalesce(a.updated_at, a.created_at) AS att_at,
  CASE WHEN rr.ts IS NULL AND rr.status IS NULL AND a.id IS NULL THEN 'none'
       WHEN a.id IS NULL THEN 'rsvp'
       WHEN rr.status IS NULL THEN 'coach'
       WHEN rr.ts > coalesce(a.updated_at, a.created_at) THEN 'rsvp'
       ELSE 'coach' END AS latest
FROM tgt tg
JOIN players p ON p.team_id = tg.team_id AND p.status = 'active'
LEFT JOIN LATERAL (
  SELECT count(*) OVER () AS n_cand, r.status,
         coalesce(r.updated_at, r.responded_at) AS ts,
         CASE WHEN r.player_id IS NULL THEN 'null-pid' ELSE 'pid' END AS via
  FROM cal_event_rsvps r LEFT JOIN profiles pr ON pr.id = r.user_id
  WHERE r.event_id = tg.id
    AND (r.player_id = p.id
         OR (r.player_id IS NULL AND (
               lower(pr.email) IN (lower(p.parent_email), lower(p.secondary_parent_email))
               OR EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = r.user_id
                            AND ur.role = 'player' AND ur.entity_id::text = p.id::text))))
  ORDER BY coalesce(r.updated_at, r.responded_at) DESC NULLS LAST
  LIMIT 1
) rr ON true
LEFT JOIN event_attendance a ON a.event_id = tg.id AND a.player_id = p.id
ORDER BY tg.tag, tg.event_date, who;

SELECT '== S6 target events: game_sessions rows (spinner check)' AS section;
SELECT CASE WHEN e.title ILIKE '%UPSL%' THEN 'UPSL' ELSE 'Shooters' END AS tag, e.event_date, e.event_type,
  (SELECT count(*) FROM game_sessions g WHERE g.event_id = e.id) AS game_sessions
FROM cal_events e JOIN teams t ON t.id = e.team_id
WHERE (e.title ILIKE '%UPSL%' OR e.title ILIKE '%Shooters%')
  AND t.name ILIKE '%17%' AND t.name ILIKE '%girl%'
  AND e.event_date >= current_date - 60
ORDER BY 1, 2;

SELECT '== S7 club-wide PAC (event_date >= today-60): clubs matched' AS section;
SELECT c.name AS club_name, count(DISTINCT t.id) AS teams
FROM clubs c JOIN teams t ON t.club_id = c.id
WHERE c.name ILIKE '%PAC%'
GROUP BY c.name;

SELECT '== S8 club-wide PAC rsvp + attendance integrity' AS section;
WITH ev AS (
  SELECT e.id, e.team_id
  FROM cal_events e JOIN teams t ON t.id = e.team_id JOIN clubs c ON c.id = t.club_id
  WHERE c.name ILIKE '%PAC%' AND e.event_date >= current_date - 60
)
SELECT
  (SELECT count(*) FROM ev) AS events,
  count(r.id) AS rsvp_rows,
  count(r.id) FILTER (WHERE r.player_id IS NULL) AS null_pid_rows,
  count(r.id) FILTER (WHERE r.player_id IS NOT NULL AND NOT EXISTS (
     SELECT 1 FROM players p WHERE p.id = r.player_id AND p.team_id = ev.team_id)) AS pid_not_on_team,
  count(r.id) FILTER (WHERE r.player_id IS NOT NULL AND EXISTS (
     SELECT 1 FROM players p WHERE p.id = r.player_id AND p.team_id = ev.team_id
       AND coalesce(p.status, '') <> 'active')) AS pid_on_team_not_active,
  (SELECT count(*) FROM event_attendance a JOIN ev e2 ON e2.id = a.event_id
     WHERE NOT EXISTS (SELECT 1 FROM players p WHERE p.id = a.player_id
                         AND p.team_id = e2.team_id AND p.status = 'active')) AS att_off_active_roster
FROM ev LEFT JOIN cal_event_rsvps r ON r.event_id = ev.id;

SELECT '== S9 players.status values on target team' AS section;
SELECT p.status, count(*)
FROM players p JOIN teams t ON t.id = p.team_id
WHERE t.name ILIKE '%17%' AND t.name ILIKE '%girl%'
GROUP BY t.name, p.status ORDER BY 1;

SELECT '== S10 RLS policies (players, event_attendance, cal_event_rsvps, game_sessions)' AS section;
SELECT tablename, policyname, cmd, left(coalesce(qual, ''), 220) AS qual, left(coalesce(with_check, ''), 160) AS with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('players', 'event_attendance', 'cal_event_rsvps', 'game_sessions')
ORDER BY tablename, cmd, policyname;
```

## Recon 2 (Nov 9)

One more SELECT-only psql run (`/tmp/attendance-recon-2.sql`). I grepped it for write keywords before running and found none; psql exited 0.
It prints no names, emails or team names; players appear as initials.
The team is identified through the Shooters event id from run 1 (`23bda612…`), not by its name.

### A — UPSL search, all dates
- **A1: NO HIT.** The search matched the whole row as text (`cal_events e WHERE e::text ILIKE '%upsl%'`), plus per-column flags for title, opponent, notes, description, location_name and location_address.
  It returned **0 rows across every team and every date.** Cancelled events are still rows, so they were covered too.
- **A2: the U17 team has exactly ONE `event_type='game'` event on record.**
  It is 2026-11-07 "Shooters NN Blue" (opponent "Shooters NN Blue", id `23bda612…`, not cancelled). There is no second game to fall back to.
- **What that means (INFERRED):**
  - The bug-A card was drawn from `cal_events`; the calendar list reads no other table (`CalendarScreen.tsx:181-188`).
  - So the "UPSL" event was either hard-deleted or renamed since Lu saw it, or "UPSL" was a description rather than its title.
  - It is also possible that bug A *was* the Shooters game seen at an earlier moment.
  - **The check that settles it:** Lu opens the bug-A event in the app and sends its date and team, or a screenshot showing its title and date.

### B — the UPSL event's numbers
- **NONE.** There is no UPSL hit, and so no "nearest U17 game" to pick either. Sections B0–B3 returned 0 rows.
- The only U17 game is Shooters, already counted in run 1: **roster 15 · 16 RSVP rows · 7 NULL rows (all from 1-kid parents, 0 from 2+-kid) · 1 attendance row · true 10 going / 2 can't go / 3 no reply · card ✓14 ✕2 ?0.**

### C — club-wide, by the U17 team's `club_id` (event_date ≥ today−60, plus upcoming)
| Measure | Value |
|---|---|
| Teams with events in the window | 10 |
| Events | 236 (190 have at least one RSVP row) |
| `cal_event_rsvps` rows | 973 |
| **NULL `player_id` rows** | **338** (35% of all rows) |
| …from a user who maps to **1** active kid on that team | **322**: backfillable without guessing |
| …from a user who maps to **2+** active kids | **0** |
| …from a user who maps to **0** active kids | **16**: staff, ex-parents or unmatched emails, the "phantom people" |
| Rows whose `player_id` is not on the event team's active roster | **2** |
| Events where raw RSVP rows > active roster (the card count exceeds the roster) | **2** |

**How to read it:**
- The NULL-row problem is club-wide and large: a third of all rows.
- Today it is almost entirely single-kid parents whose answer was never tied to their child. This is the email-bridge miss described in Q4.
- Multi-kid parents are not yet a source of NULL rows in this window.
- The 16 NULL rows from users with 0 kids have no player to attach to. Under the locked ruling they must not count.
- A backfill of the 322 rows would be a data migration (SACRED, out of scope; report only).

### SQL used (run 2)
```sql
-- attendance recon 2, 2026-11-09. SELECT-only. No names/emails output; players as initials; team names not printed.
-- Team anchor: the U17 team is taken from the Shooters event found in run 1 (23bda612-...).

SELECT '== R2-A1 UPSL hits, ALL dates, any text column (whole-row match + per-column flags)' AS section;
WITH team AS (SELECT team_id AS id FROM cal_events WHERE id = '23bda612-d070-4974-8b4b-3352bc9d4f21')
SELECT e.id AS event_id, e.event_date, e.event_type, e.title, e.opponent,
  (e.team_id = (SELECT id FROM team)) AS is_pac_u17,
  (e.title ILIKE '%upsl%') AS in_title,
  (coalesce(e.opponent, '') ILIKE '%upsl%') AS in_opponent,
  (coalesce(e.notes, '') ILIKE '%upsl%') AS in_notes,
  (coalesce(e.description, '') ILIKE '%upsl%') AS in_description,
  (coalesce(e.location_name, '') ILIKE '%upsl%') AS in_location_name,
  (coalesce(e.location_address, '') ILIKE '%upsl%') AS in_location_address
FROM cal_events e
WHERE e::text ILIKE '%upsl%'
ORDER BY e.event_date
LIMIT 60;

SELECT '== R2-A2 last 12 game events for the PAC Girls U17 team (any date)' AS section;
WITH team AS (SELECT team_id AS id FROM cal_events WHERE id = '23bda612-d070-4974-8b4b-3352bc9d4f21')
SELECT e.event_date, e.title, e.opponent, e.id AS event_id, e.is_cancelled
FROM cal_events e
WHERE e.team_id = (SELECT id FROM team) AND e.event_type = 'game'
ORDER BY e.event_date DESC
LIMIT 12;

SELECT '== R2-B0 target pick (direct UPSL hit on U17 team, else U17 game nearest any UPSL hit)' AS section;
WITH team AS (SELECT team_id AS id FROM cal_events WHERE id = '23bda612-d070-4974-8b4b-3352bc9d4f21'),
hits AS (SELECT e.id, e.team_id, e.event_date FROM cal_events e WHERE e::text ILIKE '%upsl%'),
tgt AS (
  SELECT h.id, h.event_date, 'direct'::text AS how FROM hits h WHERE h.team_id = (SELECT id FROM team)
  UNION ALL
  SELECT x.id, x.event_date, x.how FROM (
    SELECT g.id, g.event_date, 'nearest'::text AS how
    FROM cal_events g CROSS JOIN hits h
    WHERE g.team_id = (SELECT id FROM team) AND g.event_type = 'game'
      AND NOT EXISTS (SELECT 1 FROM hits h2 WHERE h2.team_id = (SELECT id FROM team))
    ORDER BY abs(g.event_date::date - h.event_date::date), g.event_date DESC
    LIMIT 1) x
)
SELECT t.how, t.event_date, e.title, e.opponent, t.id AS event_id FROM tgt t JOIN cal_events e ON e.id = t.id
ORDER BY t.event_date;

SELECT '== R2-B1 target: roster, raw rsvp tally (= CalendarScreen card), NULL rows by parent kid-count, attendance' AS section;
WITH team AS (SELECT team_id AS id FROM cal_events WHERE id = '23bda612-d070-4974-8b4b-3352bc9d4f21'),
hits AS (SELECT e.id, e.team_id, e.event_date FROM cal_events e WHERE e::text ILIKE '%upsl%'),
tgt AS (
  SELECT h.id, h.event_date, h.team_id, 'direct'::text AS how FROM hits h WHERE h.team_id = (SELECT id FROM team)
  UNION ALL
  SELECT x.id, x.event_date, x.team_id, x.how FROM (
    SELECT g.id, g.event_date, g.team_id, 'nearest'::text AS how
    FROM cal_events g CROSS JOIN hits h
    WHERE g.team_id = (SELECT id FROM team) AND g.event_type = 'game'
      AND NOT EXISTS (SELECT 1 FROM hits h2 WHERE h2.team_id = (SELECT id FROM team))
    ORDER BY abs(g.event_date::date - h.event_date::date), g.event_date DESC
    LIMIT 1) x
),
rk AS (
  SELECT r.*, tg.team_id, tg.how, tg.event_date,
    (SELECT count(DISTINCT p.id) FROM players p LEFT JOIN profiles pr ON pr.id = r.user_id
      WHERE p.team_id = tg.team_id AND p.status = 'active'
        AND ((pr.email IS NOT NULL AND (lower(p.parent_email) = lower(pr.email)
                                      OR lower(p.secondary_parent_email) = lower(pr.email)))
             OR EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = r.user_id
                          AND ur.role = 'player' AND ur.entity_id::text = p.id::text))) AS kids
  FROM tgt tg JOIN cal_event_rsvps r ON r.event_id = tg.id
)
SELECT tg.how, tg.event_date,
  (SELECT count(*) FROM players p WHERE p.team_id = tg.team_id AND p.status = 'active') AS roster_active,
  (SELECT count(*) FROM rk WHERE rk.event_id = tg.id) AS rsvp_rows,
  (SELECT count(*) FROM rk WHERE rk.event_id = tg.id AND rk.status = 'yes') AS card_yes,
  (SELECT count(*) FROM rk WHERE rk.event_id = tg.id AND rk.status = 'no') AS card_no,
  (SELECT count(*) FROM rk WHERE rk.event_id = tg.id AND rk.status = 'pending') AS card_pending,
  (SELECT count(*) FROM rk WHERE rk.event_id = tg.id AND rk.player_id IS NULL) AS null_rows,
  (SELECT count(*) FROM rk WHERE rk.event_id = tg.id AND rk.player_id IS NULL AND rk.kids = 0) AS null_parent_0kid,
  (SELECT count(*) FROM rk WHERE rk.event_id = tg.id AND rk.player_id IS NULL AND rk.kids = 1) AS null_parent_1kid,
  (SELECT count(*) FROM rk WHERE rk.event_id = tg.id AND rk.player_id IS NULL AND rk.kids >= 2) AS null_parent_2pluskid,
  (SELECT count(*) FROM rk WHERE rk.event_id = tg.id AND rk.player_id IS NOT NULL AND NOT EXISTS (
     SELECT 1 FROM players p WHERE p.id = rk.player_id AND p.team_id = tg.team_id AND p.status = 'active')) AS pid_off_roster,
  (SELECT count(DISTINCT rk.user_id) FROM rk WHERE rk.event_id = tg.id) AS distinct_users,
  (SELECT count(*) FROM event_attendance a WHERE a.event_id = tg.id) AS att_rows,
  (SELECT count(*) FROM event_attendance a WHERE a.event_id = tg.id AND a.status IN ('present', 'late')) AS att_going,
  (SELECT count(*) FROM event_attendance a WHERE a.event_id = tg.id AND a.status IN ('absent', 'excused')) AS att_cant
FROM tgt tg
ORDER BY tg.event_date;

SELECT '== R2-B2 target: per active player, latest-mark-wins (resolver rules: NULL row maps only if parent has exactly 1 kid; tie -> coach)' AS section;
WITH team AS (SELECT team_id AS id FROM cal_events WHERE id = '23bda612-d070-4974-8b4b-3352bc9d4f21'),
hits AS (SELECT e.id, e.team_id, e.event_date FROM cal_events e WHERE e::text ILIKE '%upsl%'),
tgt AS (
  SELECT h.id, h.event_date, h.team_id, 'direct'::text AS how FROM hits h WHERE h.team_id = (SELECT id FROM team)
  UNION ALL
  SELECT x.id, x.event_date, x.team_id, x.how FROM (
    SELECT g.id, g.event_date, g.team_id, 'nearest'::text AS how
    FROM cal_events g CROSS JOIN hits h
    WHERE g.team_id = (SELECT id FROM team) AND g.event_type = 'game'
      AND NOT EXISTS (SELECT 1 FROM hits h2 WHERE h2.team_id = (SELECT id FROM team))
    ORDER BY abs(g.event_date::date - h.event_date::date), g.event_date DESC
    LIMIT 1) x
),
umap AS (
  SELECT tg.id AS event_id, u.user_id, p.id AS player_id,
    count(*) OVER (PARTITION BY tg.id, u.user_id) AS kids,
    EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = u.user_id AND ur.role = 'player'
              AND ur.entity_id::text = p.id::text) AS is_self
  FROM tgt tg
  JOIN (SELECT DISTINCT event_id, user_id FROM cal_event_rsvps) u ON u.event_id = tg.id
  LEFT JOIN profiles pr ON pr.id = u.user_id
  JOIN players p ON p.team_id = tg.team_id AND p.status = 'active'
   AND ((pr.email IS NOT NULL AND (lower(p.parent_email) = lower(pr.email)
                                 OR lower(p.secondary_parent_email) = lower(pr.email)))
        OR EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = u.user_id AND ur.role = 'player'
                     AND ur.entity_id::text = p.id::text))
),
per AS (
  SELECT tg.how, tg.event_date, p.id AS player_id,
    upper(left(p.first_name, 1) || left(p.last_name, 1)) AS who,
    rr.status AS rsvp_status, rr.ts AS rsvp_at, rr.n_cand, rr.via,
    a.status AS att_status, coalesce(a.updated_at, a.created_at) AS att_at, a.id AS att_id
  FROM tgt tg
  JOIN players p ON p.team_id = tg.team_id AND p.status = 'active'
  LEFT JOIN LATERAL (
    SELECT count(*) OVER () AS n_cand, r.status, coalesce(r.updated_at, r.responded_at) AS ts,
           CASE WHEN r.player_id IS NULL THEN 'null-pid' ELSE 'pid' END AS via
    FROM cal_event_rsvps r
    WHERE r.event_id = tg.id
      AND (r.player_id = p.id
           OR (r.player_id IS NULL AND EXISTS (
                 SELECT 1 FROM umap m WHERE m.event_id = tg.id AND m.user_id = r.user_id
                   AND m.player_id = p.id AND (m.is_self OR m.kids = 1))))
    ORDER BY coalesce(r.updated_at, r.responded_at) DESC NULLS LAST
    LIMIT 1
  ) rr ON true
  LEFT JOIN event_attendance a ON a.event_id = tg.id AND a.player_id = p.id
),
verdict AS (
  SELECT per.*,
    CASE
      WHEN att_id IS NOT NULL AND (rsvp_status IS NULL OR rsvp_at IS NULL OR att_at IS NOT NULL AND rsvp_at <= att_at)
        THEN CASE WHEN att_status IN ('present', 'late') THEN 'going'
                  WHEN att_status IN ('absent', 'excused') THEN 'cant_go' ELSE 'no_reply' END
      WHEN rsvp_status = 'yes' THEN 'going'
      WHEN rsvp_status = 'no' THEN 'cant_go'
      ELSE 'no_reply'
    END AS effective,
    CASE
      WHEN att_id IS NOT NULL AND (rsvp_status IS NULL OR rsvp_at IS NULL OR att_at IS NOT NULL AND rsvp_at <= att_at) THEN 'coach'
      WHEN rsvp_status IS NOT NULL THEN 'family'
      ELSE NULL
    END AS source
  FROM per
)
SELECT how, event_date, who, n_cand, via, rsvp_status, rsvp_at, att_status, att_at, effective, source
FROM verdict ORDER BY event_date, effective, who;

SELECT '== R2-B3 target: true totals (one verdict per active player)' AS section;
WITH team AS (SELECT team_id AS id FROM cal_events WHERE id = '23bda612-d070-4974-8b4b-3352bc9d4f21'),
hits AS (SELECT e.id, e.team_id, e.event_date FROM cal_events e WHERE e::text ILIKE '%upsl%'),
tgt AS (
  SELECT h.id, h.event_date, h.team_id, 'direct'::text AS how FROM hits h WHERE h.team_id = (SELECT id FROM team)
  UNION ALL
  SELECT x.id, x.event_date, x.team_id, x.how FROM (
    SELECT g.id, g.event_date, g.team_id, 'nearest'::text AS how
    FROM cal_events g CROSS JOIN hits h
    WHERE g.team_id = (SELECT id FROM team) AND g.event_type = 'game'
      AND NOT EXISTS (SELECT 1 FROM hits h2 WHERE h2.team_id = (SELECT id FROM team))
    ORDER BY abs(g.event_date::date - h.event_date::date), g.event_date DESC
    LIMIT 1) x
),
umap AS (
  SELECT tg.id AS event_id, u.user_id, p.id AS player_id,
    count(*) OVER (PARTITION BY tg.id, u.user_id) AS kids,
    EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = u.user_id AND ur.role = 'player'
              AND ur.entity_id::text = p.id::text) AS is_self
  FROM tgt tg
  JOIN (SELECT DISTINCT event_id, user_id FROM cal_event_rsvps) u ON u.event_id = tg.id
  LEFT JOIN profiles pr ON pr.id = u.user_id
  JOIN players p ON p.team_id = tg.team_id AND p.status = 'active'
   AND ((pr.email IS NOT NULL AND (lower(p.parent_email) = lower(pr.email)
                                 OR lower(p.secondary_parent_email) = lower(pr.email)))
        OR EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = u.user_id AND ur.role = 'player'
                     AND ur.entity_id::text = p.id::text))
),
per AS (
  SELECT tg.how, tg.event_date, p.id AS player_id,
    rr.status AS rsvp_status, rr.ts AS rsvp_at,
    a.status AS att_status, coalesce(a.updated_at, a.created_at) AS att_at, a.id AS att_id
  FROM tgt tg
  JOIN players p ON p.team_id = tg.team_id AND p.status = 'active'
  LEFT JOIN LATERAL (
    SELECT r.status, coalesce(r.updated_at, r.responded_at) AS ts
    FROM cal_event_rsvps r
    WHERE r.event_id = tg.id
      AND (r.player_id = p.id
           OR (r.player_id IS NULL AND EXISTS (
                 SELECT 1 FROM umap m WHERE m.event_id = tg.id AND m.user_id = r.user_id
                   AND m.player_id = p.id AND (m.is_self OR m.kids = 1))))
    ORDER BY coalesce(r.updated_at, r.responded_at) DESC NULLS LAST
    LIMIT 1
  ) rr ON true
  LEFT JOIN event_attendance a ON a.event_id = tg.id AND a.player_id = p.id
),
verdict AS (
  SELECT per.*,
    CASE
      WHEN att_id IS NOT NULL AND (rsvp_status IS NULL OR rsvp_at IS NULL OR att_at IS NOT NULL AND rsvp_at <= att_at)
        THEN CASE WHEN att_status IN ('present', 'late') THEN 'going'
                  WHEN att_status IN ('absent', 'excused') THEN 'cant_go' ELSE 'no_reply' END
      WHEN rsvp_status = 'yes' THEN 'going'
      WHEN rsvp_status = 'no' THEN 'cant_go'
      ELSE 'no_reply'
    END AS effective,
    (att_id IS NOT NULL AND (rsvp_status IS NULL OR rsvp_at IS NULL OR att_at IS NOT NULL AND rsvp_at <= att_at)) AS coach_won
  FROM per
)
SELECT how, event_date,
  count(*) AS roster_active,
  count(*) FILTER (WHERE effective = 'going') AS going,
  count(*) FILTER (WHERE effective = 'cant_go') AS cant_go,
  count(*) FILTER (WHERE effective = 'no_reply') AS no_reply,
  count(*) FILTER (WHERE coach_won) AS coach_won
FROM verdict GROUP BY how, event_date ORDER BY event_date;

SELECT '== R2-C club-wide by club_id of the U17 team (event_date >= today-60, incl. upcoming)' AS section;
WITH club AS (
  SELECT t.club_id AS id FROM cal_events e JOIN teams t ON t.id = e.team_id
  WHERE e.id = '23bda612-d070-4974-8b4b-3352bc9d4f21'
),
ev AS (
  SELECT e.id, e.team_id FROM cal_events e JOIN teams t ON t.id = e.team_id
  WHERE t.club_id = (SELECT id FROM club) AND e.event_date::date >= current_date - 60
),
rk AS (
  SELECT r.id, r.event_id, r.player_id, ev.team_id,
    (SELECT count(DISTINCT p.id) FROM players p LEFT JOIN profiles pr ON pr.id = r.user_id
      WHERE p.team_id = ev.team_id AND p.status = 'active'
        AND ((pr.email IS NOT NULL AND (lower(p.parent_email) = lower(pr.email)
                                      OR lower(p.secondary_parent_email) = lower(pr.email)))
             OR EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = r.user_id
                          AND ur.role = 'player' AND ur.entity_id::text = p.id::text))) AS kids
  FROM ev JOIN cal_event_rsvps r ON r.event_id = ev.id
),
per_event AS (
  SELECT ev.id,
    (SELECT count(*) FROM rk WHERE rk.event_id = ev.id) AS raw_rows,
    (SELECT count(*) FROM players p WHERE p.team_id = ev.team_id AND p.status = 'active') AS roster
  FROM ev
)
SELECT
  (SELECT count(DISTINCT team_id) FROM ev) AS teams,
  (SELECT count(*) FROM ev) AS events,
  (SELECT count(*) FROM rk) AS rsvp_rows,
  (SELECT count(*) FROM rk WHERE player_id IS NULL) AS null_pid_rows,
  (SELECT count(*) FROM rk WHERE player_id IS NULL AND kids = 0) AS null_parent_0kid,
  (SELECT count(*) FROM rk WHERE player_id IS NULL AND kids = 1) AS null_parent_1kid,
  (SELECT count(*) FROM rk WHERE player_id IS NULL AND kids >= 2) AS null_parent_2pluskid,
  (SELECT count(*) FROM rk WHERE player_id IS NOT NULL AND NOT EXISTS (
     SELECT 1 FROM players p WHERE p.id = rk.player_id AND p.team_id = rk.team_id AND p.status = 'active')) AS pid_off_active_roster,
  (SELECT count(*) FROM per_event WHERE raw_rows > roster) AS events_raw_rows_over_roster,
  (SELECT count(*) FROM per_event WHERE raw_rows > 0) AS events_with_any_rsvp;
```
