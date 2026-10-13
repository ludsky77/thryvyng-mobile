# Calendar "add event" permission — mobile recon (Oct 12, 2026)

READ-ONLY recon. No edits. Every claim cites `file:line` in this repo at commit
`b9a4c17`. Anything not provable from this repo is marked **INFERRED** or
**BLOCKED**.

Question asked: *why can a `team_manager` not add calendar events?*

---

## 1. The exact condition that shows/hides the add-event button

The gate is one boolean in CalendarScreen, and one render guard.

[src/screens/CalendarScreen.tsx:409-413](../../src/screens/CalendarScreen.tsx#L409-L413)

```ts
  const canCreate =
    !isPastTeamSelected &&
    selectedTeamId !== ALL_TEAMS_ID &&
    selectedTeamId &&
    canManageTeam(selectedTeamId);
```

Render guard — the `+` button in the toolbar:
[src/screens/CalendarScreen.tsx:510-517](../../src/screens/CalendarScreen.tsx#L510-L517)

```tsx
          {canCreate && (
            <TouchableOpacity
              style={styles.createButton}
              onPress={handleCreatePress}
            >
              <Text style={styles.createButtonText}>+</Text>
            </TouchableOpacity>
          )}
```

So the button is hidden unless **all four** hold:

| # | Clause | Hides the button when… | Source |
|---|--------|------------------------|--------|
| a | `!isPastTeamSelected` | selected team is in `pastTeams` (team_status `archived`/`inactive`) | [CalendarScreen.tsx:399-402](../../src/screens/CalendarScreen.tsx#L399-L402), [useUserTeams.ts:25-33](../../src/hooks/useUserTeams.ts#L25-L33) |
| b | `selectedTeamId !== ALL_TEAMS_ID` | the "All Teams" view is selected — **this is the default landing state** | [CalendarScreen.tsx:53](../../src/screens/CalendarScreen.tsx#L53), [CalendarScreen.tsx:136-140](../../src/screens/CalendarScreen.tsx#L136-L140) |
| c | `selectedTeamId` truthy | nothing selected yet / still loading teams | [CalendarScreen.tsx:130-134](../../src/screens/CalendarScreen.tsx#L130-L134) |
| d | `canManageTeam(selectedTeamId)` | the selected team is not an `access_type === 'staff'` team | [useUserTeams.ts:383-389](../../src/hooks/useUserTeams.ts#L383-L389) |

Clause (b) is worth flagging on its own: when the user has at least one active
team and `getDefaultTeam()` returns nothing, the default selection is
`ALL_TEAMS_ID` — [CalendarScreen.tsx:136-140](../../src/screens/CalendarScreen.tsx#L136-L140) —
and in All-Teams view there is **no** `+` button for anyone, staff included. A
manager who lands on Calendar and does not open the team picker sees no way to
add an event. There is no empty-state hint about this
([CalendarScreen.tsx:491-499](../../src/screens/CalendarScreen.tsx#L491-L499) renders
only a 👥 indicator icon in the toolbar, no hint to pick a team).

`CreateEventModal` itself holds **no** role or permission check — `grep -n
"role\|staff\|permission\|canCreate" src/components/calendar/CreateEventModal.tsx`
returns nothing. The toolbar gate is the only client gate.

---

## 2. What role values it accepts, and where those values come from

**It accepts no role values at all.** `canManageTeam` never looks at a role:

[src/hooks/useUserTeams.ts:383-389](../../src/hooks/useUserTeams.ts#L383-L389)

```ts
  const canManageTeam = useCallback(
    (teamId: string): boolean => {
      const team = teams.find((t) => t.id === teamId);
      return team?.access_type === 'staff';
    },
    [teams]
  );
```

Two things decide the answer:

**(i) `access_type === 'staff'`** is set — unconditionally — for every team that
came back from a `team_staff` row for this user:

- query: `.from('team_staff').select('team_id, staff_role, teams (...)').eq('user_id', user.id)`
  — [useUserTeams.ts:114-137](../../src/hooks/useUserTeams.ts#L114-L137)
- mapping: `mapTeamFromRow(item.teams, 'staff', { staff_role: item.staff_role }, …)`
  — [useUserTeams.ts:141-153](../../src/hooks/useUserTeams.ts#L141-L153)

`staff_role` is read from the DB and carried on the object
([useUserTeams.ts:14](../../src/hooks/useUserTeams.ts#L14)) but **never compared
to anything** in the calendar path. So `head_coach`, `assistant_coach`,
`team_manager` — and any other value, including `null` — are all equally
"can create". The column is **`team_staff.staff_role`**, matched on
**`team_staff.user_id`**.

**(ii) `teams` is the ACTIVE bucket only** — `const teams = activeTeams;`
([useUserTeams.ts:359](../../src/hooks/useUserTeams.ts#L359)). Bucketing:
[useUserTeams.ts:25-33](../../src/hooks/useUserTeams.ts#L25-L33)

```ts
function getTeamBucket(team: UserTeam): TeamBucket {
  if (team.is_test === true) return 'hidden';
  const status = team.team_status;
  const known =
    status === 'active' || status === 'archived' || status === 'inactive';
  if (!status || !known) return 'hidden';
  if (status === 'archived' || status === 'inactive') return 'past';
  return 'active';
}
```

A staff team whose `teams.team_status` is NULL or any unrecognised value is
bucketed `hidden` — it never reaches `teams` **or** `pastTeams`, so it is absent
from the picker *and* from `canManageTeam`. `is_test = true` does the same.

### The role source the calendar gate does NOT consult

There are two independent staff sources in this app and the calendar reads only
one of them:

| Source | Columns | Who reads it |
|--------|---------|--------------|
| `team_staff` (`user_id`, `staff_role`) | the calendar gate | [useUserTeams.ts:114-137](../../src/hooks/useUserTeams.ts#L114-L137) |
| `user_roles` (`role`, `entity_id` = team id) | role switcher, tab bar, staff roster | [AuthContext.tsx:58-64](../../src/contexts/AuthContext.tsx#L58-L64) (RPC `get_enriched_roles_v2`), [TeamStaffScreen.tsx:75-89](../../src/screens/TeamStaffScreen.tsx#L75-L89) |

`currentRole` (the `user_roles`-backed value, where the literal string
`'team_manager'` actually appears — e.g.
[AppNavigator.tsx:186-192](../../src/navigation/AppNavigator.tsx#L186-L192)) is
**not** used by `canCreate`. `CalendarScreen` destructures only `canManageTeam`
from the hook ([CalendarScreen.tsx:84-92](../../src/screens/CalendarScreen.tsx#L84-L92)).

**INFERRED (most likely root cause, needs one DB query to confirm):** a user who
is a `team_manager` in `user_roles` but has **no `team_staff` row** for that team
(or whose `team_staff.user_id` is NULL because they were invited by email and
never linked) gets `access_type: 'parent'` or `'player'` from the later passes
([useUserTeams.ts:186-204](../../src/hooks/useUserTeams.ts#L186-L204),
[:314-329](../../src/hooks/useUserTeams.ts#L314-L329)) — or no team at all — and
therefore no `+` button, while the role switcher still shows them as Team
Manager. Confirm with: rows in `team_staff` for that `user_id` + `team_id`, and
the team's `team_status` / `is_test`.

Dead code worth knowing about: [src/lib/permissions.ts:25-28](../../src/lib/permissions.ts#L25-L28)
defines `canCreateEvent(role)` accepting `platform_admin, club_admin,
head_coach, assistant_coach, team_manager`
([permissions.ts:2-8](../../src/lib/permissions.ts#L2-L8)). `grep -rn
"canCreateEvent" src/` finds only its own definition — **nothing imports it.**
It is not the calendar gate despite its name and doc comment ("Check if a role
can create calendar events").

---

## 3. `.maybeSingle()` vs `.single()` on a staff lookup

**The calendar add-button path contains no staff-row single-fetch at all** — so
the known duplicate-row silent-null bug is *not* present in this gate. The staff
read is a plain multi-row `.eq()` returning an array
([useUserTeams.ts:114-137](../../src/hooks/useUserTeams.ts#L114-L137)); duplicate
`team_staff` rows for one team are deduped by `teamMap` and are harmless
([useUserTeams.ts:142](../../src/hooks/useUserTeams.ts#L142)).

`.single()` calls that do exist in the create path are on **`teams`** and on the
**insert itself**, not on a staff lookup:

- [useCalendarEvents.ts:39-43](../../src/hooks/useCalendarEvents.ts#L39-L43) — `teams.club_id` lookup, `.single()`
- [useCalendarEvents.ts:45-66](../../src/hooks/useCalendarEvents.ts#L45-L66) — the `cal_events` insert, `.select().single()`
- [useCalendarEvents.ts:94-98](../../src/hooks/useCalendarEvents.ts#L94-L98) — same `teams` lookup in the recurring path

The `.maybeSingle()`/`.single()` pair in
[CalendarSyncModal.tsx:46](../../src/components/calendar/CalendarSyncModal.tsx#L46),
[:55](../../src/components/calendar/CalendarSyncModal.tsx#L55),
[:106](../../src/components/calendar/CalendarSyncModal.tsx#L106) is device-calendar
sync, unrelated to the create gate.

For contrast, the *event detail* screen's staff check was already hardened
against exactly this bug and uses a `head: true` count instead:
[EventDetailScreen.tsx:235-251](../../src/screens/EventDetailScreen.tsx#L235-L251)
("a user can hold several `team_staff` rows on one team (e.g. Head Coach + Team
Manager), and `maybeSingle()` errors on 2+ rows"). The calendar toolbar gate and
the event-detail gate are therefore two different mechanisms:
`access_type === 'staff'` vs a `team_staff` existence count.

---

## 4. Separate server-side check (RLS/RPC) on `cal_events` INSERT

**BLOCKED — not verifiable in this repo.** Stating it precisely:

- The client writes `cal_events` **directly**, not through an RPC:
  `.from(EVENTS_TABLE).insert({...})` where `EVENTS_TABLE = 'cal_events'` —
  [useCalendarEvents.ts:6](../../src/hooks/useCalendarEvents.ts#L6),
  [:45-66](../../src/hooks/useCalendarEvents.ts#L45-L66),
  [:126-129](../../src/hooks/useCalendarEvents.ts#L126-L129).
  `grep -rn "\.rpc(" src/screens/CalendarScreen.tsx src/components/calendar/ src/hooks/useCalendarEvents.ts`
  → no matches. So the only server-side gate on INSERT is whatever RLS policy
  exists on `cal_events` in the Supabase project.
- That policy SQL **does not exist in this repo**. The only migration present is
  [supabase/migrations/20250224000000_notify_lineup_published.sql](../../supabase/migrations/20250224000000_notify_lineup_published.sql);
  `find . -name "*.sql"` returns that one file. Same conclusion as the earlier
  identity recon: *"no RPC or RLS policy definitions exist in this repo"*
  ([docs/recon/identity-resolution-oct02.md:258](identity-resolution-oct02.md)).
- **Therefore: whether the client gate mirrors the server gate cannot be
  answered from mobile.** It must be read from the Supabase project (or the web
  repo's migrations). The specific thing to check: does the `cal_events` INSERT
  policy key off `team_staff` membership (what the client mirrors) or off
  `user_roles.role` (what the role switcher shows)? If the policy keys off
  `user_roles` and the client off `team_staff`, the two gates disagree in both
  directions.
- Columns the insert sends, which any policy will see:
  `team_id, club_id, created_by (= auth user id), title, event_type, event_date,
  start_time, arrival_time, end_time, is_all_day, location_name,
  location_address, opponent, home_away, uniform, notes`
  ([useCalendarEvents.ts:47-64](../../src/hooks/useCalendarEvents.ts#L47-L64)),
  plus `recurrence_group_id, recurrence_pattern` for the series path
  ([:122-123](../../src/hooks/useCalendarEvents.ts#L122-L123)).

**How an RLS denial presents to the user today** (relevant if the `+` *is*
visible but nothing saves): the insert error is logged to console and swallowed
into `null` —
[useCalendarEvents.ts:68-71](../../src/hooks/useCalendarEvents.ts#L68-L71) — and
the modal turns that `null` into a **connection** error:

[src/components/calendar/CreateEventModal.tsx:455-460](../../src/components/calendar/CreateEventModal.tsx#L455-L460)

```tsx
          Alert.alert(
            'Error',
            'Failed to create event. Please check your connection and try again.',
            [{ text: 'OK' }]
          );
```

A permission denial is reported as a network problem, with no `logError` and no
error code surfaced. Same shape in the recurring branch
([CreateEventModal.tsx:436-441](../../src/components/calendar/CreateEventModal.tsx#L436-L441)).

---

## Summary — the candidate causes, ordered

1. **"All Teams" is selected** (often the default). No `+` for anyone.
   [CalendarScreen.tsx:411](../../src/screens/CalendarScreen.tsx#L411), [:136-140](../../src/screens/CalendarScreen.tsx#L136-L140)
2. **No `team_staff` row for this user+team**, even though `user_roles` says
   `team_manager`. Gate reads `team_staff` only. **INFERRED**
   [useUserTeams.ts:114-153](../../src/hooks/useUserTeams.ts#L114-L153), [:383-389](../../src/hooks/useUserTeams.ts#L383-L389)
3. **Team not in the active bucket** — `team_status` NULL/unknown or
   `is_test = true` → `hidden`; `archived`/`inactive` → `past` → clause (a)
   blocks. [useUserTeams.ts:25-33](../../src/hooks/useUserTeams.ts#L25-L33)
4. **Server-side RLS refuses the INSERT** while the client gate allows it —
   presents as a connection error. **BLOCKED** (needs Supabase policy read)
5. *Not* a `.single()`/`.maybeSingle()` duplicate-row bug — that pattern is
   absent from this gate (§3).

## Not verifiable here

- The `cal_events` INSERT policy (§4) — no policy SQL in this repo.
- Whether the affected manager actually has a `team_staff` row, and that team's
  `team_status` / `is_test` (§2) — needs a DB query.
