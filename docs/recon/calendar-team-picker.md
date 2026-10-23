# Calendar team picker — recon for C1 (team choice inside the create form) + C2 (open on All Teams)

READ-ONLY recon, Oct 22 2026. No code changed. Every claim is **PROVEN** with
`file:line`, or marked **INFERRED** / **UNKNOWN**.

- Mobile repo: `thryvyng-mobile` (this repo), branch `main` @ `0ad312a`.
- Web repo: `~/Documents/thrive-and-score` — **read-only**, nothing written there.

Prior art: [calendar-add-permission-oct12.md](calendar-add-permission-oct12.md)
answered *why the `+` is hidden*. This file answers *where the team comes from*
and what C1/C2 have to touch. Item 5 below **closes the BLOCKED item** from that
recon (the `cal_events` INSERT policy) — it is in the web repo's migrations.

---

## 1. The calendar screen, its team filter, and the default selection

**Screen:** [src/screens/CalendarScreen.tsx](../../src/screens/CalendarScreen.tsx) (1823 lines).
It is the only calendar screen on mobile.

**Filter:** one piece of local state, no persistence.
[CalendarScreen.tsx:95](../../src/screens/CalendarScreen.tsx#L95)

```ts
const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
```

`ALL_TEAMS_ID` is a local sentinel string, not a DB value —
[CalendarScreen.tsx:53](../../src/screens/CalendarScreen.tsx#L53): `const ALL_TEAMS_ID = 'ALL_TEAMS';`

### Does "All Teams" already exist? — **YES. PROVEN.**

It is the **first** row of the team picker modal, above a divider, with its own
👥 icon and the subtitle "See events from all your teams" —
[CalendarScreen.tsx:1120-1145](../../src/screens/CalendarScreen.tsx#L1120-L1145).
In that mode `fetchEvents` queries every active team —
[CalendarScreen.tsx:164-167](../../src/screens/CalendarScreen.tsx#L164-L167):

```ts
if (selectedTeamId === ALL_TEAMS_ID) {
  teamIds = teams.map((t) => t.id);
}
```

All-Teams mode also already drives: a per-event team badge
([:684](../../src/screens/CalendarScreen.tsx#L684), [:875](../../src/screens/CalendarScreen.tsx#L875)),
the 👥 toolbar indicator ([:491-499](../../src/screens/CalendarScreen.tsx#L491-L499)),
and `TeamLegend` ([:1083-1093](../../src/screens/CalendarScreen.tsx#L1083-L1093), gated on
`teams.length >= 2` at [:563](../../src/screens/CalendarScreen.tsx#L563)).

**So C2 is not a new feature — it is a change of initial value.**

### Why it opens on "Lobitos Mini Academy" — **PROVEN**

The default comes from `getDefaultTeam()`, and All Teams is only the *fallback*:
[CalendarScreen.tsx:133-141](../../src/screens/CalendarScreen.tsx#L133-L141)

```ts
if (!selectedTeamId) {
  const defaultTeam = getDefaultTeam();
  setSelectedTeamId(
    defaultTeam?.id ??
      (teams.length > 0 ? ALL_TEAMS_ID : pastTeams[0]?.id ?? ALL_TEAMS_ID)
  );
  return;
}
```

`getDefaultTeam()` returns null only when the user has **zero** active teams, so
for any real user the `?? ALL_TEAMS_ID` branch is dead —
[useUserTeams.ts:362-381](../../src/hooks/useUserTeams.ts#L362-L381):

```ts
const getDefaultTeam = useCallback((): UserTeam | null => {
  if (teams.length === 0) return null;
  if (currentRole?.team?.id)        { /* match → return it */ }
  if (currentRole?.entity_id)       { /* match → return it */ }
  if (currentRole?.player?.team?.id){ /* match → return it */ }
  return teams[0];
}, [teams, currentRole]);
```

Two possible reasons, in order of precedence:

1. **The active role's team** (`currentRole.team.id` / `entity_id` /
   `player.team.id`, from `AuthContext`'s `get_enriched_roles_v2`). If the role
   switcher sits on a Lobitos role, Lobitos is the default **by design**.
2. **Otherwise `teams[0]`** — and `teams[0]` is **neither alphabetical nor
   stored**. It is insertion order into `teamMap`
   ([useUserTeams.ts:111](../../src/hooks/useUserTeams.ts#L111),
   [:333](../../src/hooks/useUserTeams.ts#L333) `Array.from(teamMap.values())`),
   i.e. **whatever row order Postgres returns** for the `team_staff` query —
   which has **no `ORDER BY`**
   ([useUserTeams.ts:114-137](../../src/hooks/useUserTeams.ts#L114-L137);
   `grep -n "sort\|order(" src/hooks/useUserTeams.ts` → no matches). Staff teams
   are added first, then parent teams, then self-player teams.

**Not a stored last choice — PROVEN.** `grep -n "AsyncStorage\|setItem\|getItem"
src/screens/CalendarScreen.tsx src/hooks/useUserTeams.ts` → **no matches**.
Picking a team never outlives the screen; the default is recomputed on every mount.

> **INFERRED:** which of the two reasons is live for Lu's account. If the role
> switcher shows a Lobitos role, it is #1; if it shows a club/other role, it is
> #2 (unordered `team_staff` row order — i.e. effectively arbitrary, and it can
> change between fetches). Either way **C2 overrides both**, so this does not
> need resolving before building.

---

## 2. The ➕ create-event entry points, and how the team is passed today

**There is exactly ONE entry point. PROVEN.**
`grep -rn "CreateEventModal" src/` → only
[CalendarScreen.tsx:32](../../src/screens/CalendarScreen.tsx#L32) (import) and
[:1238](../../src/screens/CalendarScreen.tsx#L1238) (render). The other two hits
are prose in code comments
([InviteCoParentModal.tsx:308](../../src/components/InviteCoParentModal.tsx#L308),
[DateTimeSheet.tsx:23](../../src/components/common/DateTimeSheet.tsx#L23)).
`useCalendarEvents` likewise has one consumer —
[CalendarScreen.tsx:126](../../src/screens/CalendarScreen.tsx#L126).

The `+` button, gated by `canCreate`
([:510-517](../../src/screens/CalendarScreen.tsx#L510-L517),
[:409-413](../../src/screens/CalendarScreen.tsx#L409-L413)):

```ts
const canCreate =
  !isPastTeamSelected &&
  selectedTeamId !== ALL_TEAMS_ID &&   // ← clause (b): blocks C2 directly
  selectedTeamId &&
  canManageTeam(selectedTeamId);
```

### The team-passing path — PROVEN

The team reaches the insert through a **hook closure, not a prop**:

```
selectedTeamId  (toolbar picker)
   └→ handleCreatePress()            CalendarScreen.tsx:415-420
        setCreateForTeamId(selectedTeamId)
   └→ createTeamId = createForTeamId || (selectedTeamId !== ALL_TEAMS ? selectedTeamId : null)
                                      CalendarScreen.tsx:118-120
   └→ useCalendarEvents(createTeamId) CalendarScreen.tsx:126
        └→ insert({ team_id: teamId, … })  useCalendarEvents.ts:48
```

`CreateEventModal` receives **no team prop at all** —
[CalendarScreen.tsx:1238-1247](../../src/screens/CalendarScreen.tsx#L1238-L1247):

```tsx
<CreateEventModal
  visible={createModalVisible}
  onClose={() => { setCreateModalVisible(false); setCreateForTeamId(null); }}
  onSubmit={handleCreateEvent}
  onCreateRecurring={handleCreateRecurring}
  onSuccess={handleCreateSuccess}
/>
```

and its props interface has no team field —
[CreateEventModal.tsx:157-192](../../src/components/calendar/CreateEventModal.tsx#L157-L192).
`grep -n "team_id\|teamId" src/components/calendar/CreateEventModal.tsx` → **no
matches**. The form does not know, and cannot say, which team it is creating for.
This is the heart of C1.

Guard that will bite: both handlers bail on a null `createForTeamId` —
[CalendarScreen.tsx:422-425](../../src/screens/CalendarScreen.tsx#L422-L425) and
[:427-431](../../src/screens/CalendarScreen.tsx#L427-L431) (`if (!createForTeamId) return null;`),
and the hook bails too ([useCalendarEvents.ts:37](../../src/hooks/useCalendarEvents.ts#L37),
[:92](../../src/hooks/useCalendarEvents.ts#L92): `if (!user || !teamId) return null`).
A `null` return is rendered to the user as a **connection error**, not a
permission or "pick a team" error —
[CreateEventModal.tsx:443-460](../../src/components/calendar/CreateEventModal.tsx#L443-L460)
and [:436-441](../../src/components/calendar/CreateEventModal.tsx#L436-L441). So if C1 is
wired up but the team never reaches the parent, the symptom is a misleading
"check your connection".

---

## 3. The create-event form component, and where `team_id` is set on save

**Form:** [src/components/calendar/CreateEventModal.tsx](../../src/components/calendar/CreateEventModal.tsx) (1174 lines).

**`team_id` is NOT set in the form.** It is set in the hook, from the closure arg:

- single event — [useCalendarEvents.ts:48](../../src/hooks/useCalendarEvents.ts#L48): `team_id: teamId,`
- recurring series — [useCalendarEvents.ts:106](../../src/hooks/useCalendarEvents.ts#L106): `team_id: teamId,`

`club_id` is derived from the team, so it follows the team automatically —
[useCalendarEvents.ts:39-43](../../src/hooks/useCalendarEvents.ts#L39-L43) and
[:94-98](../../src/hooks/useCalendarEvents.ts#L94-L98) (`teams.club_id` lookup,
`.single()`), used at [:49](../../src/hooks/useCalendarEvents.ts#L49) / [:107](../../src/hooks/useCalendarEvents.ts#L107).
**A team picker in the form therefore needs no separate club handling.**

The form's submit builds `basePayload` with no team field —
[CreateEventModal.tsx:381-396](../../src/components/calendar/CreateEventModal.tsx#L381-L396) —
and calls `onSubmit(basePayload)` ([:443](../../src/components/calendar/CreateEventModal.tsx#L443))
or `onCreateRecurring({...basePayload, dates, recurrence_pattern})`
([:418-421](../../src/components/calendar/CreateEventModal.tsx#L418-L421)).

Two more facts that matter for C1:

- **Push notifications need no team.** `notifyTeamOfEvent({ eventId, action })`
  takes only the created row's id and resolves the team server-side —
  [CreateEventModal.tsx:428-431](../../src/components/calendar/CreateEventModal.tsx#L428-L431),
  [:448-451](../../src/components/calendar/CreateEventModal.tsx#L448-L451).
- **Where a picker would go in the UI:** the form's first control is the
  horizontal Event Type strip —
  [CreateEventModal.tsx:617-656](../../src/components/calendar/CreateEventModal.tsx#L617-L656),
  inside the main `ScrollView` at [:611](../../src/components/calendar/CreateEventModal.tsx#L611).
  A "Team" row belongs immediately **above** it.
- **The reset-on-close effect** clears every field —
  [CreateEventModal.tsx:312-332](../../src/components/calendar/CreateEventModal.tsx#L312-L332)
  (`if (!visible) { … }`). Any new team state must be reset there too, or the
  previous team leaks into the next open.
- **The form holds no permission check of its own** (confirmed again:
  `grep -n "role\|staff\|permission\|canCreate"` → nothing). The toolbar
  `canCreate` is the only client gate — so a picker **must** be fed a
  pre-filtered list (§4), not all teams.

---

## 4. Source of "teams this user can create events for"

**An existing hook already provides exactly this list. No new query needed.**

[src/hooks/useUserTeams.ts](../../src/hooks/useUserTeams.ts) → `canManageTeam`
[useUserTeams.ts:383-389](../../src/hooks/useUserTeams.ts#L383-L389):

```ts
const canManageTeam = useCallback(
  (teamId: string): boolean => {
    const team = teams.find((t) => t.id === teamId);
    return team?.access_type === 'staff';
  },
  [teams]
);
```

and a ready-made filtered list, `getTeamsByAccess()`
[useUserTeams.ts:392-396](../../src/hooks/useUserTeams.ts#L392-L396):

```ts
const staffTeams = teams.filter((t) => t.access_type === 'staff');
```

`staffTeams` **is** the C1 picker list. (`grep -rn "getTeamsByAccess" src/` to
confirm current consumers before relying on it — it is exported at
[:407](../../src/hooks/useUserTeams.ts#L407).) Equivalent inline:
`teams.filter(t => canManageTeam(t.id))`.

`teams` is the **active** bucket only — [useUserTeams.ts:359](../../src/hooks/useUserTeams.ts#L359)
(`const teams = activeTeams;`), bucketed by
[useUserTeams.ts:24-32](../../src/hooks/useUserTeams.ts#L24-L32) (`is_test` or
unknown/NULL `team_status` → hidden; `archived`/`inactive` → past). **Archived
teams can therefore never appear in the picker** — which is what we want, and it
replaces the `!isPastTeamSelected` clause for free.

### Role rules — **the honest answer: there are none. PROVEN.**

`access_type: 'staff'` is set unconditionally for **every** `team_staff` row for
this user — [useUserTeams.ts:114-137](../../src/hooks/useUserTeams.ts#L114-L137)
(query: `.from('team_staff').select('team_id, staff_role, teams (…)').eq('user_id', user.id)`)
and [:141-153](../../src/hooks/useUserTeams.ts#L141-L153)
(`mapTeamFromRow(item.teams, 'staff', { staff_role: item.staff_role }, …)`).

`staff_role` is carried on the object ([useUserTeams.ts:14](../../src/hooks/useUserTeams.ts#L14))
but **never compared to anything** in the calendar path. So `head_coach`,
`assistant_coach`, `team_manager` — and `null` — all create events equally.

| Role | Creatable team on mobile? | Source |
|---|---|---|
| any `team_staff` row (head_coach / assistant_coach / team_manager / null) | **yes**, no distinction | [useUserTeams.ts:114-153](../../src/hooks/useUserTeams.ts#L114-L153), [:383-389](../../src/hooks/useUserTeams.ts#L383-L389) |
| `club_admin` **without** a `team_staff` row | **no** | `useUserTeams` has **no `club_staff` pass** — `grep -n "club_staff\|club_admin" src/hooks/useUserTeams.ts` → no matches. Its three sources are `team_staff` ([:115](../../src/hooks/useUserTeams.ts#L115)), `players`/`player_placements` as parent ([:157](../../src/hooks/useUserTeams.ts#L157), [:210](../../src/hooks/useUserTeams.ts#L210)), `user_roles` role=player ([:275](../../src/hooks/useUserTeams.ts#L275)) |
| parent / player | **no** (`access_type` is `parent`/`player`) | [:383-389](../../src/hooks/useUserTeams.ts#L383-L389) |

This **matches the server policy exactly** (§5) — both key off `team_staff`
membership and ignore `staff_role`. Client and server agree in both directions.

Dead code, do not wire C1 to it: [src/lib/permissions.ts:25-28](../../src/lib/permissions.ts#L25-L28)
`canCreateEvent(role)` accepts `platform_admin, club_admin, head_coach,
assistant_coach, team_manager` — `grep -rn "canCreateEvent" src/` finds only its
own definition. **Nothing imports it.** Using it would *widen* access past RLS
and produce "connection error" failures.

---

## 5. The server guard on event inserts — **PROVEN (closes the Oct 12 BLOCKED item)**

**Table:** `cal_events` — [useCalendarEvents.ts:6](../../src/hooks/useCalendarEvents.ts#L6)
(`const EVENTS_TABLE = 'cal_events';`). The client inserts **directly**, no RPC
([:45-66](../../src/hooks/useCalendarEvents.ts#L45-L66), [:126-129](../../src/hooks/useCalendarEvents.ts#L126-L129)),
so RLS is the whole server gate.

The policy is **not** in this repo (mobile has one migration,
`supabase/migrations/20250224000000_notify_lineup_published.sql`). It **is** in the
web repo — `~/Documents/thrive-and-score/supabase/migrations/20260108184412_5d500626-5299-40c5-8a5d-45ce30d98b72.sql:505-509`:

```sql
CREATE POLICY "cal_events_insert" ON cal_events FOR INSERT
WITH CHECK (
  created_by = auth.uid()
  AND team_id IN (SELECT team_id FROM team_staff WHERE user_id = auth.uid())
);
```

RLS is enabled on the table — same file `:333`
(`ALTER TABLE cal_events ENABLE ROW LEVEL SECURITY;`).

**Never dropped or replaced — PROVEN.** Across all 265 web migrations,
`grep -rn "cal_events_insert\|DROP POLICY.*cal_events\|ALTER TABLE cal_events\|DISABLE ROW LEVEL" supabase/migrations/`
returns only: the `CREATE POLICY` above (`:505`), the `ENABLE ROW LEVEL SECURITY`
(`:333`), and one unrelated column add
(`20260112011531_…sql:2`, reminder-tracking columns). This is the only INSERT
policy on `cal_events`.

### Does the server already reject an insert for a team the user isn't staff on?

**YES — PROVEN**, at
`thrive-and-score/supabase/migrations/20260108184412_5d500626-5299-40c5-8a5d-45ce30d98b72.sql:505-509`.
A row whose `team_id` has no matching `team_staff` row for `auth.uid()` is
refused, and so is one whose `created_by` is not the caller.

**This is the key finding for C1.** Putting a team picker in the form cannot
create a privilege-escalation hole: even if the picker were populated wrongly,
the database refuses the insert. C1 is a **UX change, not a security change** —
no RLS/schema work, nothing SACRED.

> Caveat, UNKNOWN: these migration files are the repo's record, not a live
> `pg_policies` read of production. Proving the deployed policy matches would
> need a prod DB query, which is out of scope here (and forbidden for this task).
> Confidence is high — the file is the only source and is internally consistent.

**One real gap to fix alongside C1:** an RLS denial surfaces as *"Failed to
create event. Please check your connection and try again."* The error is
swallowed into `null` at [useCalendarEvents.ts:68-71](../../src/hooks/useCalendarEvents.ts#L68-L71)
(`console.error` only, no `logError`, no code), then rendered as a connection
problem at [CreateEventModal.tsx:455-460](../../src/components/calendar/CreateEventModal.tsx#L455-L460).

---

## 6. Does the web app share this behavior? — **NO. C1/C2 do not apply to web. PROVEN.**

The web calendar is a **tab inside one team's dashboard**, not a multi-team
screen. It takes the team as a **required prop** and has **no team filter and no
"All Teams" mode at all**.

- Component: `thrive-and-score/src/components/cal/TeamCalendarTab.tsx:15-25` —
  `interface TeamCalendarTabProps { teamId: string; teamName: string; clubId: string | null; canManage?: boolean }`
- Both call sites pass a single team from the route/page context:
  - `src/pages/TeamDashboard.tsx:431` — `<TeamCalendarTab teamId={team.id} teamName={team.name} clubId={team.club_id} canManage />`
  - `src/pages/PlayerDashboard.tsx:970` — `<TeamCalendarTab teamId={team!.id} teamName={team!.name} clubId={team!.club_id || null} />` (no `canManage` → read-only)
- `grep -n "ALL_TEAMS" src/components/cal/TeamCalendarTab.tsx` → no matches.

**C1 is already satisfied on web by construction:** the create modal takes the
team as a required prop, so the team is never ambiguous —
`src/components/cal/CreateEventModal.tsx:21-28`
(`interface CreateEventModalProps { open; onClose; teamId: string; clubId: string | null; onEventCreated?; defaultDate? }`),
passed at `src/components/cal/TeamCalendarTab.tsx:307-317`, and written at
`src/hooks/useCalendarEvents.ts:213` and `:269` (`team_id: teamId`).

**C2 is meaningless on web:** there is no all-teams calendar to default to. A web
"All Teams" calendar would be a **new feature on a different screen**, not a
default change — out of scope for C1/C2.

**Verdict: both C1 and C2 are mobile-only. No web files need to change.**

---

## Proposed change list

### Mobile — `thryvyng-mobile` (all of it; the only app affected)

**C1 — move the team choice inside the create form**

| # | File | Change |
|---|---|---|
| 1 | [src/components/calendar/CreateEventModal.tsx](../../src/components/calendar/CreateEventModal.tsx) | Add props `teams: UserTeam[]` and `initialTeamId?: string \| null`. Add `selectedTeamId` state. Render a "Team" row above the Event Type strip ([:617](../../src/components/calendar/CreateEventModal.tsx#L617)); **auto-fill and render as a static label — not a picker — when `teams.length === 1`** (the single-team case the goal calls out). Reset the new state in the `!visible` effect ([:312-332](../../src/components/calendar/CreateEventModal.tsx#L312-L332)). Add `team_id` to the `onSubmit`/`onCreateRecurring` payload types ([:160-190](../../src/components/calendar/CreateEventModal.tsx#L160-L190)) and include it in `basePayload` ([:382-396](../../src/components/calendar/CreateEventModal.tsx#L382-L396)). Add "Team is required" to `validate()` ([:336+](../../src/components/calendar/CreateEventModal.tsx#L336)) for the 2+-team case. |
| 2 | [src/screens/CalendarScreen.tsx](../../src/screens/CalendarScreen.tsx) | Pass `teams={staffTeams}` and `initialTeamId={selectedTeamId !== ALL_TEAMS_ID ? selectedTeamId : null}` at [:1238-1247](../../src/screens/CalendarScreen.tsx#L1238-L1247). Take `team_id` from the payload in `handleCreateEvent`/`handleCreateRecurring` ([:422-431](../../src/screens/CalendarScreen.tsx#L422-L431)) instead of requiring `createForTeamId`. Derive `staffTeams` from `getTeamsByAccess()` ([useUserTeams.ts:392-396](../../src/hooks/useUserTeams.ts#L392-L396)) — add it to the hook destructure at [:84-92](../../src/screens/CalendarScreen.tsx#L84-L92). |
| 3 | [src/hooks/useCalendarEvents.ts](../../src/hooks/useCalendarEvents.ts) | Accept `team_id` **per call** rather than only from the closure: `createEvent(payload)` / `createRecurringEvents(payload)` use `payload.team_id ?? teamId` for the `team_id` ([:48](../../src/hooks/useCalendarEvents.ts#L48), [:106](../../src/hooks/useCalendarEvents.ts#L106)) **and** for the `teams.club_id` lookup ([:39-43](../../src/hooks/useCalendarEvents.ts#L39-L43), [:94-98](../../src/hooks/useCalendarEvents.ts#L94-L98)), so `club_id` follows the chosen team. Keeping the old arg as fallback makes this backward-compatible. |

> **Why per-call and not via `setCreateForTeamId`:** today the team is baked into
> the hook closure at render ([CalendarScreen.tsx:118-126](../../src/screens/CalendarScreen.tsx#L118-L126)).
> Driving it from inside the modal would mean a child→parent→re-render round trip
> before every submit — a race for no benefit. Passing `team_id` in the payload
> keeps one source of truth: the form.

**C2 — open on All Teams**

| # | File | Change |
|---|---|---|
| 4 | [src/screens/CalendarScreen.tsx:133-141](../../src/screens/CalendarScreen.tsx#L133-L141) | Default to `ALL_TEAMS_ID` when the user has any active team, instead of calling `getDefaultTeam()`. Keep the existing `pastTeams[0]` fallback for users with only archived teams. |
| 5 | [src/screens/CalendarScreen.tsx:409-413](../../src/screens/CalendarScreen.tsx#L409-L413) | **Required for C2 to be usable:** drop the `selectedTeamId !== ALL_TEAMS_ID` clause from `canCreate`, so the `+` shows in All-Teams view. Replace the gate with "user has ≥1 staff team" (`staffTeams.length > 0`). Without this, C2 **hides the `+` for everyone** — the exact trap documented in [calendar-add-permission-oct12.md](calendar-add-permission-oct12.md) §1 clause (b). **C1 and C2 must ship together.** |
| 6 | [src/screens/CalendarScreen.tsx:415-420](../../src/screens/CalendarScreen.tsx#L415-L420) | `handleCreatePress` currently returns early in All-Teams mode (`if (selectedTeamId && selectedTeamId !== ALL_TEAMS_ID)`). Must open the modal regardless; the form now asks for the team. |

Also worth doing in the same pass (small, same root, no behaviour risk):

| # | File | Change |
|---|---|---|
| 7 | [useCalendarEvents.ts:68-71](../../src/hooks/useCalendarEvents.ts#L68-L71), [:131-134](../../src/hooks/useCalendarEvents.ts#L131-L134) + [CreateEventModal.tsx:455-460](../../src/components/calendar/CreateEventModal.tsx#L455-L460) | Stop reporting an RLS denial as a connection error. Surface the Postgres code (`42501` → "You don't have permission to add events for this team"). Relevant now that the team is user-chosen: a wrong choice should say so. **Suggestion, not required by C1/C2.** |

### Web — `thrive-and-score`

**No changes.** §6 proves the web calendar is single-team by construction: the
team is a required prop, there is no filter and no All-Teams mode.

### SACRED items — **none for C1/C2**

Checked explicitly:

- **RLS / auth — not touched.** The `cal_events_insert` policy already enforces
  `team_staff` membership (§5) and the mobile picker list is the *same* condition
  (§4). No policy change is needed, and none is proposed.
- **Schema / migrations — not touched.** No new column; `team_id` and `club_id`
  already exist on `cal_events` and are already written
  ([useCalendarEvents.ts:48-49](../../src/hooks/useCalendarEvents.ts#L48-L49)).
- **Dependencies — none added.** The picker reuses the existing modal pattern
  (the toolbar picker at [CalendarScreen.tsx:1098-1150](../../src/screens/CalendarScreen.tsx#L1098-L1150)
  is a copyable precedent).
- **No deletes, no env, no deploy.**

One thing that **is** Lu's call, not sacred but a product decision:

> **C2 with a single-team user.** If the user has exactly one team, defaulting to
> "All Teams" shows that team's events behind a generic 👥 "All Teams" header, and
> `TeamLegend` stays hidden (gated `teams.length >= 2` —
> [CalendarScreen.tsx:563](../../src/screens/CalendarScreen.tsx#L563)). The team's
> name then appears nowhere in the toolbar. **Recommend:** default to All Teams
> only when `teams.length >= 2`, else that one team. Needs a yes/no before build.

---

## §8 RULINGS (Lu, 2026-10-22)

R1 ➕ opens a TYPE SHEET first listing every event type the form supports today (all visible at once, no horizontal scroll), then the create form opens for that type; the form title names the type (e.g. "New Practice"). Remove the horizontal type-chip row from the form.
R2 Calendar default view: "All Teams" when the user has 2+ teams; otherwise their single team. Overrides getDefaultTeam()/teams[0] for the calendar's initial selection.
R3 TEAM field is the FIRST field in the form, searchable ("Find your team…"), options = staffTeams (useUserTeams getTeamsByAccess().staffTeams) — NEVER src/lib/permissions.ts. 1 staff team → pre-filled and shown, no choice. Opened while viewing one team → that team pre-filled, changeable. Opened from All Teams → blank; Create disabled until a team is picked.
R4 ➕ is visible whenever the user has ≥1 staff team, INCLUDING the All Teams view (remove the selectedTeamId !== ALL_TEAMS_ID clause from canCreate, CalendarScreen.tsx:409-413). Parents/players unchanged (no ➕).
R5 Pass team_id in the submit payload from the form to useCalendarEvents (no round-trip through createForTeamId). club_id keeps deriving from the chosen team.
R6 Replace the misleading "check your connection" on an insert refusal with an honest message ("You can't create events for this team.") and log the real error (useCalendarEvents.ts:68-71, CreateEventModal.tsx:455-460).
Style: match Thryvyng's existing dark theme/components; reuse an existing picker/sheet component if one exists (recon item 5).
R7 Club Event hidden from the type sheet until CE (club_admin-only, club-wide) — Lu 2026-10-23

---

## §9 APPLIED (2026-10-22)

One line per ruling, with the file:line that carries it. Proof is in the task
report; gates were `tsc` **5 = baseline**, eslint **0 errors**, `expo export`
**exit 0**. No device or simulator run — **AGENT-ONLY**.

- **R1 — type sheet first, chip strip gone.** New file
  [src/components/calendar/EventTypeSheet.tsx](../../src/components/calendar/EventTypeSheet.tsx)
  (176 lines, vertical list over `EVENT_TYPES`, [:79](../../src/components/calendar/EventTypeSheet.tsx#L79)
  — no horizontal scroll, all five visible). `+` opens it
  ([CalendarScreen.tsx:438](../../src/screens/CalendarScreen.tsx#L438)), the chosen
  type opens the form ([:440](../../src/screens/CalendarScreen.tsx#L440),
  [:1250](../../src/screens/CalendarScreen.tsx#L1250),
  [:1258](../../src/screens/CalendarScreen.tsx#L1258)). Form titles itself
  `New <type>` ([CreateEventModal.tsx:678](../../src/components/calendar/CreateEventModal.tsx#L678));
  the horizontal type-chip `ScrollView` and its four styles are **deleted**, and
  `eventType` is now a required prop
  ([:170](../../src/components/calendar/CreateEventModal.tsx#L170)), not state.
- **R2 — default view.** `teams.length >= 2 ? ALL_TEAMS_ID : teams[0]?.id ?? pastTeams[0]?.id`
  ([CalendarScreen.tsx:144-152](../../src/screens/CalendarScreen.tsx#L144-L152)).
  `getDefaultTeam` is no longer destructured or called in this screen
  (`grep -n getDefaultTeam src/screens/CalendarScreen.tsx` → no matches).
- **R3 — TEAM first, searchable, staffTeams only.** Team section is the first
  child of the form's ScrollView
  ([CreateEventModal.tsx:705-809](../../src/components/calendar/CreateEventModal.tsx#L705-L809)),
  search placeholder `Find your team…`
  ([:760](../../src/components/calendar/CreateEventModal.tsx#L760)). Options come
  from `getTeamsByAccess().staffTeams`
  ([CalendarScreen.tsx:131-134](../../src/screens/CalendarScreen.tsx#L131-L134) →
  `teams` prop at [:1259](../../src/screens/CalendarScreen.tsx#L1259)). One staff
  team → static row, no picker ([:708+](../../src/components/calendar/CreateEventModal.tsx#L708)).
  Pre-fill on open: sole team, else the viewed team if it is a staff team, else
  blank ([:391](../../src/components/calendar/CreateEventModal.tsx#L391),
  [CalendarScreen.tsx:432-436](../../src/screens/CalendarScreen.tsx#L432-L436));
  Create disabled until one is picked (`isValid` gains `!!selectedTeamId`), and
  `validate()` adds `team: 'Pick a team'`. **`src/lib/permissions.ts` is neither
  imported nor referenced** — `grep -rn permissions src/components/calendar
  src/screens/CalendarScreen.tsx src/hooks/useCalendarEvents.ts` → no matches.
- **R4 — `+` on All Teams.** `const canCreate = staffTeams.length > 0;`
  ([CalendarScreen.tsx:424](../../src/screens/CalendarScreen.tsx#L424)) — the
  `selectedTeamId !== ALL_TEAMS_ID`, `!isPastTeamSelected` and
  `canManageTeam(selectedTeamId)` clauses are gone. Parents/players have no
  staff team, so they still get no `+`.
- **R5 — team_id in the payload.** `team_id` added to both payload types
  ([CreateEventModal.tsx:177](../../src/components/calendar/CreateEventModal.tsx#L177),
  [:193](../../src/components/calendar/CreateEventModal.tsx#L193)) and to
  `basePayload` ([:466](../../src/components/calendar/CreateEventModal.tsx#L466));
  the hook reads `payload.team_id ?? teamId` for both the insert and the
  `teams.club_id` lookup
  ([useCalendarEvents.ts:78](../../src/hooks/useCalendarEvents.ts#L78),
  [:137](../../src/hooks/useCalendarEvents.ts#L137)), so **club_id still follows
  the chosen team**. `createForTeamId` / `createTeamId` and both wrapper
  handlers are **deleted**; the hook is called with no argument
  ([CalendarScreen.tsx:128](../../src/screens/CalendarScreen.tsx#L128)) and the
  hook's `teamId` param is now optional, kept only as a fallback.
- **R6 — honest refusal.** The hook logs the real error through `logError` and
  throws a message instead of swallowing it into `null`
  ([useCalendarEvents.ts:34-57](../../src/hooks/useCalendarEvents.ts#L34-L57),
  [:111](../../src/hooks/useCalendarEvents.ts#L111),
  [:178](../../src/hooks/useCalendarEvents.ts#L178)); Postgres `42501` or a
  `row-level security` message → **"You can't create events for this team."**,
  anything else → "Could not create the event. Please try again." The form shows
  `err.userMessage` ([CreateEventModal.tsx:546](../../src/components/calendar/CreateEventModal.tsx#L546))
  and both "check your connection" alerts are **gone** — the no-row paths now
  use `INSERT_REFUSED_MESSAGE`
  ([:163](../../src/components/calendar/CreateEventModal.tsx#L163),
  [:522](../../src/components/calendar/CreateEventModal.tsx#L522),
  [:538](../../src/components/calendar/CreateEventModal.tsx#L538)).
- **R7 — Club Event not offered.** `UNRELEASED_EVENT_TYPES = ['club_event']` and
  `CREATABLE_EVENT_TYPES = EVENT_TYPES.filter(...)`
  ([EventTypeSheet.tsx:42-60](../../src/components/calendar/EventTypeSheet.tsx#L42-L60)),
  mapped at [:100](../../src/components/calendar/EventTypeSheet.tsx#L100) — so the
  sheet lists four types, not five. **This closes the judgement call recorded
  below:** the type is hidden at the one place a type is CHOSEN, and nowhere
  else. `club_event` is untouched in
  [src/types/index.ts:168](../../src/types/index.ts#L168) (the `EventType`
  union) and [:183](../../src/types/index.ts#L183) (`EVENT_TYPES`), and no
  display code was opened, so existing rows keep their CLUB badge and colour.
  Shipping CE means deleting one array line here — plus whatever that phase
  needs for club_admin-only, club-wide creation, which this team-scoped form
  cannot express today.

### Carried out of §7 of the proposal, and one judgement call

- The per-type arrival/end offsets (`START_OFFSETS_BY_TYPE`) are now applied
  **when the form opens**, not only when Start is edited
  ([CreateEventModal.tsx:396-409](../../src/components/calendar/CreateEventModal.tsx#L396-L409)).
  The chip strip never re-derived them, so a Practice opened with the Game
  offsets (-45/+90) until the user touched Start; with the type fixed before the
  form mounts, open is the only moment left to apply its row.
- **"Club Event" was KEPT in the type sheet.** R1 says *every event type the
  form supports today*, and `EVENT_TYPES` has had `club_event` all along
  ([src/types/index.ts:183](../../src/types/index.ts#L183)); the task's FORBIDDEN
  line also says *"Club Event" or any event without a team*. Read together, what
  is forbidden is a **teamless** event, and nothing here can produce one — Team
  is required for all five types and `team_id` is always written. Removing a
  shipped type would have been a product deletion, so it stays. **If Lu meant
  the option itself must go, it is a one-line change** to the list this sheet
  renders.
