# Recon — removal paths, payment effects, Phase D prep

**Read-only recon. Nothing was edited, no SQL was run against any database.**

**Bases.** Web `thrive-and-score` HEAD `62b145c` · mobile `thryvyng-mobile` HEAD `66f7dea`.
Written 2026-10-14.

**Path convention.** `web:` = `~/Documents/thrive-and-score`, `mobile:` =
`~/Documents/thryvyng-mobile`. Every migration lives in the **web** repo
(`web:supabase/migrations/`, 254 files); mobile holds exactly one.

**PROD-DRIFT WARNING, and it is load-bearing for this whole file.** Chat migrations are
applied by pasting into the Supabase SQL Editor, then `supabase migration repair --status
applied` (`web:supabase/migrations/20261013013626_stone_b2_s1_chat_permissions_leave.sql:39-45`).
So a migration file is a record of *intent*, not proof of live state. Worse, the Stone B2
migrations name policies they deliberately did **not** capture — S1:34-37 and S4:72-77 both
say "NOT in this migration: ... the comm_channels INSERT/UPDATE policies" and "the
comm_messages msg_update policy". Prod therefore holds at least one `comm_messages` INSERT
policy named `msg_insert` (referenced at S4:107-108, :633) for which **no CREATE POLICY
exists in this repo at all**. Anything below sourced only to a migration file is marked
with that risk where it changes the answer.

---

## 1. REMOVE PLAYER

**Status: EXISTS**, one server function, four client entry points, one audit table.

### 1.1 The server function — the only real enforcer

`web:supabase/migrations/20260917120000_remove_player_from_team.sql`,
`public.remove_player_from_team(p_player_id uuid, p_reason text DEFAULT NULL)`,
`RETURNS json`, `SECURITY DEFINER`, `search_path = public` (`:80-88`).

**Guards, in order:**

| Gate | Line | Rule | Error |
|---|---|---|---|
| G1 | `:103-109` | caller signed in (`auth.uid()` not null) | `P0005` / `auth_mismatch` |
| G2 | `:114-124` | player exists **and** `players.team_id IS NOT NULL`; row locked `FOR UPDATE` | `P0001` / `player_not_on_team` |
| G3 | `:130-139` | `is_team_staff(actor, team)` **OR** `is_club_admin(actor, club)` **OR** `has_role(actor,'platform_admin')` | `P0012` / `not_authorized` |
| G4 | `:150-170` | money check, **READ ONLY**. Non-admins blocked when money is outstanding; admins may proceed | `P0014` / `active_payments_admin_only` |

**G4's definition of outstanding money** (`:150-164`): any `program_registrations` row for
the player with `status <> 'cancelled'` AND either
`COALESCE(total_amount,0) - COALESCE(amount_paid,0) > 0`
OR an associated `registration_payments` row with `status IN ('pending','processing','failed')`.

**Which roles the server allows (G3 resolved):**

- `public.is_team_staff(_user_id,_team_id)` — latest definition
  `web:supabase/migrations/20260112235411_a5806c30-969f-427a-b05f-74a28a135eb6.sql:42-57`
  (three defs exist; `20260112235411` is the newest by timestamp). It reads **`user_roles`**,
  `entity_id = _team_id`, `role IN ('head_coach','assistant_coach','team_manager')`.
- `public.is_club_admin(_user_id,_club_id)` — same file `:60-74`. Reads `user_roles`,
  `entity_id = _club_id`, `role = 'club_admin'`.
- `public.get_team_club_id(_team_id)` — same file `:78-91`. `SELECT club_id FROM teams`.

So the server's answer is: **head_coach, assistant_coach, team_manager** (on that team, via
`user_roles`), **club_admin** (of that team's club), **platform_admin**. Only the last two
clear G4 when money is owed.

> **FOUND — client/server gate mismatch.** `is_team_staff` reads the **`user_roles`** table.
> Both apps' client gates read the **`team_staff`** table instead (`mobile:src/screens/RosterScreen.tsx:107-109`;
> and the `comm_channel_members` INSERT policy's staff arm joins `team_staff` too,
> `web:…20261013013626…:158-161`). A user with a `team_staff` row but no matching
> `user_roles` row sees the button and is refused `P0012`; the reverse combination is
> refused the button but would be allowed by the server. This is the same shape as the
> `calendar-add-permission-oct12.md` finding, now confirmed on the removal path.
> **INFERRED** that the two tables can disagree — no SQL was run to find a real divergent row.
> Check that would settle it:
> `SELECT ts.user_id, ts.team_id FROM team_staff ts LEFT JOIN user_roles ur ON ur.user_id = ts.user_id AND ur.entity_id = ts.team_id AND ur.role IN ('head_coach','assistant_coach','team_manager') WHERE ur.id IS NULL;`

### 1.2 Exactly which tables/rows change

Writes, in function order. Nothing else in the database is written by this path — the
header at `:3-12` lists the tables it deliberately leaves alone (commissions, orders,
`program_registrations`, `registration_payments`, `registration_answers`,
`scholarship_applications`, `user_roles`, `coparent_invitations`, `pending_parent_links`,
`parent_revocations`, `player_invitations`, `xp_awards`, `course_enrollments`, every
game/progress table).

| Step | Line | Write |
|---|---|---|
| W1 | `:176-179` | `UPDATE players SET team_id = NULL, updated_at = now()`. **`players.status` is never written** (`:174`) — the player keeps identity and club membership |
| W2 | `:188-193` | `UPDATE player_placements SET status='removed'` where `assigned_team_id = team` AND `status IN ('assigned','invited','accepted','rostered')`. Terminal states untouched |
| W3 | `:200-202` | `DELETE FROM team_roster WHERE player_id = … AND team_id = …` |
| W4 | `:229-267` | `DELETE FROM comm_channel_members` — see 1.3 |
| W5 | `:274-279` | `INSERT INTO roster_removal_log` |

`'removed'` is a new `player_placements.status` value added by this same migration
(`:32-45`), which drops and recreates `player_placements_status_check` preserving all seven
original values.

**Return value** (`:281-289`): `success`, `player_id`, `team_id`, `placements_updated`,
`roster_rows_deleted`, `chat_members_removed`, `had_active_payments`.

### 1.3 Which chats the family leaves

W4 (`:229-267`) deletes `comm_channel_members` rows where **all three** hold:

1. `channel_id IN (SELECT cc.id FROM comm_channels cc WHERE cc.team_id = v_team_id)` (`:230-234`)
2. the member's `profiles.email` equals the player's `parent_email`, `secondary_parent_email`
   or `email` — plain equality, chosen deliberately to match exactly the rows
   `get_user_team_ids` would have granted (`:235-242`, rationale `:211-217`)
3. **no sibling check**: `NOT EXISTS` another player of the same family still on this team,
   by either grant path — `players.team_id = v_team_id` OR a
   `player_placements` row with `assigned_team_id = v_team_id AND status = 'invited'`
   (`:243-267`). A parent with two kids on the team keeps chat when one is removed.

**So the family leaves: every channel whose `comm_channels.team_id` = that team.** By the
`channel_scope` CHECK (`web:…20260108184412…:61-67`) that is the team's default team chat
plus every custom (non-default) team channel — Phase C's "manage members on custom team
channels" channels included. It does **not** touch:

- **club-announcements** and any other club channel — `team_id IS NULL` there, so condition 1
  never matches. **This is ledger Open gap #2, and it is now confirmed by a second
  independent source:** the Stone B2 S4 club sync says so in its own words —
  "`remove_player_from_team` (web recon M12:229-269) clears team channels only, so a family
  that leaves a club keeps its club-announcements row until somebody removes it. Recorded in
  the pre-flight as a known gap, not a bug introduced here."
  (`web:…20261013053147_stone_b2_s4_club_sync_visibility_deletes.sql:223-229`).
- **DMs and group chats** — `team_id IS NULL` (`channel_scope`, same CHECK, `:61-67`).

**No client-only fix exists for club-announcements**, and the reason is now three-deep:
`is_channel_leavable` requires `is_default IS NOT TRUE` so the default club chat cannot be
left (`web:…20261013013626…:62-79`); the DELETE policy's other-person arm needs
`is_channel_admin` (`:191-199`), which no client UI confers; and the club sync is
**insert-only by ruling** and never removes anyone (`web:…20261013053147…:207-229`, note 4).

> **FOUND — W1 fires the club-chat sync trigger.** `trg_players_sync_club_chat` is
> `AFTER INSERT OR UPDATE OF team_id, parent_email, secondary_parent_email, email ON
> public.players` (`web:…20261013053147…:398-403`). W1 updates `players.team_id`, so this
> trigger runs inside every removal. It calls `sync_club_default_channel_members`, which is
> **insert-only** (`:238-279`) — so the removal cannot add the family back, but it also
> cannot take them out. Harmless today; worth knowing before Phase D changes the sync.

### 1.4 Audit log

`public.roster_removal_log` — `web:…20260917120000…:54-62`. Columns: `id`, `player_id`,
`team_id`, `removed_by`, `reason` (`NULLIF(TRIM(p_reason),'')`), `had_active_payments`,
`removed_at`.

RLS enabled (`:64`). **SELECT only**, and only for
`has_role(auth.uid(),'platform_admin')` OR `is_club_admin(auth.uid(), get_team_club_id(team_id))`
(`:67-74`). No INSERT/UPDATE/DELETE policy exists at all — writes come solely from inside
the `SECURITY DEFINER` function, which bypasses RLS (`:50-52`).

**Reason values are stable English slugs**, identical in both apps so the audit trail reads
the same regardless of UI language: `duplicate`, `stopped_attending`, `non_payment`,
`guest_tournament_ended`, `other` (`web:src/components/team/RemovePlayerDialog.tsx:51-57`;
`mobile:src/components/RemovePlayerFromTeamModal.tsx:54-60`).

> **FOUND — team staff cannot read the log they write to.** The SELECT policy admits only
> platform_admin and club_admin. A head coach who removes a player gets a row they can never
> see. Deliberate or not, there is no UI anywhere in either app that reads
> `roster_removal_log` — grep returns zero hits outside the migration.

### 1.5 UI entry points — four, and the client gates differ at each

| # | App | Entry point | Client gate on the button |
|---|---|---|---|
| 1 | web | Team dashboard → Roster tab → row kebab → "Remove from Team" (`web:src/components/team/TeamRosterTab.tsx:346-354`) | **none on the item itself.** Reaching the page needs `currentRole.role ∈ ['team_manager','head_coach','assistant_coach']` (`web:src/pages/TeamDashboard.tsx:58`, `:78`, `:113`) |
| 2 | web | Club dashboard → team detail → Roster tab → row kebab (`web:src/components/club/team-detail/TeamRosterTab.tsx:362-370`) | **none, and no role gate on the route either** — see below |
| 3 | mobile | Roster screen → row kebab ⋮ (`mobile:src/screens/RosterScreen.tsx:534-548`) | `canManage`, i.e. `isStaffInTeam` (`:121`) |
| 4 | — | no other path. `remove_player_from_team` has exactly 3 call sites: `web:src/components/team/RemovePlayerDialog.tsx:182`, reused by entries 1 and 2, and `mobile:src/components/RemovePlayerFromTeamModal.tsx:174` | |

> **FOUND — entry point 2 has no role gate anywhere on the client.** The route is
> `/dashboard/club/teams/:teamId` wrapped in `<ProtectedRoute>` with **no `requiredRole`
> prop** (`web:src/App.tsx:215`); `requiredRole` is optional
> (`web:src/components/ProtectedRoute.tsx:10`) and the role check only runs when it is
> passed (`:77-78`). `TeamDetailPage` itself has no redirect. So **any signed-in user** who
> navigates to that URL sees the roster table and a red "Remove from Team" item. The RPC's
> G3 refuses them with `P0012`, so nothing is actually removed — but the roster rows,
> including payment columns (`:339-348`), render first. Whether the underlying SELECTs are
> blocked by RLS for a stranger is **UNKNOWN** — no policy on `players` /
> `team_roster_safe` was read for this recon.
> Check: `SELECT polname, polcmd, pg_get_expr(polqual, polrelid) FROM pg_policy WHERE polrelid = 'public.players'::regclass;`
> plus the definition of the `team_roster_safe` view.

**The `isAdmin` prop is UX only** and all three resolutions agree on intent (platform_admin,
or club_admin of this team's club) while reading different sources:

- `web:src/components/team/TeamRosterTab.tsx:72-79` — `allRoles` from `useAuth`, matched against `player.club_id`
- `web:src/components/club/team-detail/TeamRosterTab.tsx:93-99` — `allRoles`, matched against the page's `clubId`
- `mobile:src/screens/RosterScreen.tsx:129-136` — `[currentRole, ...roles]` (widened so a user with another role selected is not wrongly denied), matched against `team.club_id`

Each file says in a comment that the RPC is the enforcer
(`RemovePlayerDialog.tsx:34-41`, `RemovePlayerFromTeamModal.tsx:98-101`).

### 1.6 The three-state flow, both apps

Both clients run a **fail-permissive** client replica of G4 and pick one of three states:
`clean` (confirm), `warn` (admin, money outstanding), `blocked` (non-admin, money
outstanding). Web: `RemovePlayerDialog.tsx:166-174`, pre-check `:105-162`. Mobile:
`RemovePlayerFromTeamModal.tsx:124-…`, states `:68`. On a failed or RLS-blocked read both
fall back to permissive and let the RPC decide (`RemovePlayerDialog.tsx:149-153`;
`RemovePlayerFromTeamModal.tsx:96-102`). On `P0014` from the RPC both switch to the blocked
state (`RemovePlayerDialog.tsx:196-198`; `RemovePlayerFromTeamModal.tsx:181-187`).

---

## 2. OTHER WAYS A PLAYER / FAMILY LEAVES

Seven paths found. Ranked by how much damage they do silently.

### 2.1 Team delete — **the worst one. EXISTS, client-side, no audit, destroys chat history**

`web:src/components/club/ClubManagementTeamsTab.tsx:427-452`. Six client statements, no RPC,
no transaction:

```
comm_messages        DELETE  .in('channel_id', channelIds)        :210
comm_channel_members DELETE  .in('channel_id', channelIds)        :211
comm_channels        DELETE  .eq('team_id', team.id)              :212
team_staff_invitations DELETE .eq('team_id', team.id)             :215
team_staff           DELETE  .eq('team_id', team.id)              :216
players              UPDATE  { team_id: null } .eq('team_id',…)   :418-420
teams                DELETE  .eq('id', team.id)                   :423-426
```

Effects: **every message in every team channel is permanently deleted**; all chat
membership gone; all players detached (`team_id = NULL`); all staff rows gone. Nothing is
written to `roster_removal_log` — that table is only written by `remove_player_from_team`.
`player_placements` is **not** closed out, so placements keep pointing at a deleted team.
No money check of any kind: a team with families mid-payment-plan can be deleted.
Each statement's error is unchecked except the final `teams` delete (`:423-428`), so a
partial failure leaves chat deleted and the team alive.
club-announcements membership is untouched (insert-only sync), so the families stay in the
club chat.

### 2.2 Delete account — **EXISTS, and it is broken for anyone who ever used chat**

`web:supabase/functions/delete-account/index.ts`. Steps: deletes `parent_payment_methods`,
`user_push_tokens`, `notif_push_tokens`, `notification_preferences`, `notifications`,
`user_roles`, `team_staff` (`:55-61`, each error logged and stepped over `:63-66`); sets
`players.parent_email = 'deleted@thryvyng.com'` + `parent_first_name='Deleted'` +
`parent_last_name='User'` matched on the old email (`:69-79`); anonymises `profiles`
(`full_name='Deleted User'`, `email='deleted_<uuid>@thryvyng.com'`, phone/avatar null,
`:82-92`); then `auth.admin.deleteUser` (`:95`), rethrowing on failure (`:96-99`).

**Effect on roster:** the player row survives and **keeps its `team_id`** — only the parent
contact fields are overwritten. The child stays on the roster with a `deleted@thryvyng.com`
parent.

**Effect on chats:** the parent's `comm_channel_members` rows are **never deleted**. They
survive with the anonymised profile, so a "Deleted User" stays a member of every team chat,
group chat and club chat they were in.

**The function throws for most real users.** Stone B2 S4's own analysis
(`web:…20261013053147…:699-721`) reads: eight columns in the chat/calendar family reference
`profiles(id)`/`auth.users(id)` with **no ON DELETE action**, so `auth.admin.deleteUser()`
at `delete-account/index.ts:95` is refused for anyone who ever created a channel, sent a
chat message, holds a DM, made a poll, added a poll option, created a calendar event or
commented on one — and the function has already anonymised the profile by then, so it
"never sees the refusal coming" (`:717-719`).

S4 PART 4 rewrites those eight FKs to `ON DELETE SET NULL` so rows survive with a blank
author (`:726-…`). **But S4 explicitly reports it is not an end-to-end fix**: roughly forty
more single-column FKs into `profiles(id)`/`auth.users(id)` outside the `comm_`/`cal_`/
`notif_` family still have no ON DELETE action — `orders.user_id`, `teams.head_coach_id`,
`team_roster.added_by`, `player_placements.assigned_by`, `registration_payments.created_by`,
and more (`:773-794`). **Whether account deletion actually succeeds today is UNKNOWN** and
depends on whether S4 was applied to prod.
Check: `SELECT conrelid::regclass, conname, confdeltype FROM pg_constraint WHERE confrelid IN ('public.profiles'::regclass,'auth.users'::regclass) AND contype='f' AND confdeltype='a';`
(`confdeltype='a'` = NO ACTION; an empty result means every FK has a rule.)

Three more deletion functions exist and were **not** read for this recon:
`force-delete-auth-user`, `delete-orphan-user`, `delete-test-user`. **UNKNOWN** what they do.

### 2.3 Move teams / change a player's team — **MISSING as a product feature**

There is **no transfer or move-team path**. A repo-wide grep for client writes to
`players.team_id` in the web app returns exactly one
(`ClubManagementTeamsTab.tsx:445`, the team-delete null-out above) plus one read
(`web:src/pages/admin/ClubsManagement.tsx:467`). Mobile has none.

> **FOUND — if a team move is ever done by hand, chat does not follow.** Setting
> `players.team_id = <new team>` directly in SQL would: fire `trg_players_sync_club_chat`,
> which is insert-only; leave the family's **old** team-channel membership rows in place
> (nothing deletes them — `remove_player_from_team` is the only thing that does, and it
> would not be running); and not add them to the new team's channels until somebody calls
> `ensure_team_channel_membership(new_team)`. That function also only works for the
> **calling** user (`INSERT … auth.uid()`, `web:…20260113022122…:15-28`) and only for
> `is_default = true` channels — a coach cannot run it on a family's behalf. Net result of a
> hand-made team move: the family reads the old team's chat and cannot see the new one.
> **INFERRED** from the trigger and function definitions; no move has been performed or observed.

### 2.4 Placement unassign — EXISTS, narrow

`web:src/components/club/programs/team-assignments/useTeamAssignmentDetail.ts:226-232`
("remove team from assignment"): `UPDATE player_placements SET assigned_team_id = NULL,
status = 'unassigned'` for that assignment and team. Touches **only** `player_placements` —
not `players.team_id`, not `team_roster`, not chat. Fires
`trg_player_placements_sync_club_chat` (`web:…20261013053147…:405-408`), insert-only.
A family rostered by payment (3.2 below) keeps `players.team_id` and all chat membership.

### 2.5 Deactivate — **MISSING**

`players.status` is constrained to `('active','inactive')`
(`web:…20251106191043_f8dd8eb2…:43`), and `remove_player_from_team` pointedly never writes it
(`:11-12`, `:174`). But **no UI or function in either app ever sets `status='inactive'`** —
grep for `deactivate` and for `'inactive'` on players returns nothing. The only writes to
`players.status` found are `'active'`, both on the payment-success path (3.2).

> Note the code writes and filters on `status = 'draft'`
> (`web:supabase/functions/stripe-webhook/index.ts:1023`,
> `record-manual-payment/index.ts:158`, `register_player`'s `p_status DEFAULT 'draft'`
> at `web:…20260407123000…:28`), which is **not** in the CHECK constraint quoted above.
> Either a later migration widened it or prod drifted. **UNKNOWN.**
> Check: `SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='public.players'::regclass AND contype='c';`

### 2.6 Season rollover — **MISSING entirely**

Grep across `web:supabase/migrations/`, `web:src/` and `mobile:src/` for `rollover`,
`roll_over`, `new_season` returns **zero hits**. There is no season-rollover path. Seasons
exist as data (`teams.season_id`, `seasons.start_date/end_date`, read at
`web:src/components/club/team-detail/TeamRosterTab.tsx:76`) but nothing acts on them.
Rosters do not clear at season end.

### 2.7 Member "leave club" — **MISSING**

Grep for `leave club` / `leaveClub` / `Leave Club` across both apps' `src/`: **zero hits**.
There is no way for a family to leave a club. Consistent with the default club channel being
un-leavable by design (`is_channel_leavable` requires `is_default IS NOT TRUE`,
`web:…20261013013626…:62-79`).

The one leave that does exist is **leave a chat**, not leave a team or club:
`mobile:src/lib/channelLeave.ts` (`canLeaveChannel`, `leaveChannel`), DB-gated by the
`comm_channel_members_delete` policy — your own row, only from a leavable channel
(`web:…20261013013626…:190-199`). Leavable = `group_dm`, or a **non-default** team/club
channel; never a DM, never a default channel.

### 2.8 Summary table

| Path | Roster | Team chats | club-announcements | Audit | Money check |
|---|---|---|---|---|---|
| `remove_player_from_team` | detached, placements closed, `team_roster` row dropped | **family removed** (sibling-aware) | **stays** (gap #2) | `roster_removal_log` | yes (G4) |
| Team delete (2.1) | all players detached | **channels + all messages deleted** | stays | **none** | **none** |
| Delete account (2.2) | player stays rostered, parent fields blanked | **membership rows stay** ("Deleted User") | stays | none | none |
| Placement unassign (2.4) | placement only | untouched | stays | none | none |
| Leave a chat | untouched | that one channel, if leavable | cannot be left | none | n/a |
| Deactivate / rollover / leave club | **do not exist** | — | — | — | — |

---

## 3. PAYMENTS — **money is SACRED; this section is read-only and nothing here was run**

### 3.1 Verdict first

**No payment-failure, cancel or refund path changes roster, team membership or chat
membership.** The only direction money moves the roster is **forwards**: a *successful*
payment rosters and activates players. There is no reverse.

### 3.2 The one path where money changes the roster — success only

`web:supabase/functions/stripe-webhook/index.ts`, `checkout.session.completed`
(`:692`), `family_checkout`/`invitation_checkout` branch, STEP 2 "Roster players"
(`:1252-1306`). Per `placementId` in the session metadata:

- `player_placements` → `status='rostered'`, `rostered_at`, `responded_at` (`:1265-1269`)
- `team_roster` → INSERT `{team_id, player_id, status:'active'}` if absent (`:1271-1285`)
- `players` → generate `referral_code` if missing (`:1286-1301`)
- each placement wrapped in its own try/catch; a failure is logged and the loop continues
  (`:1303-1305`)

Also on success: `players` → `status='active'` for rows currently `'draft'`
(`:1019-1027`, non-blocking, `:1028-1031`), and the same activation in
`record-manual-payment/index.ts:148-160` (`status='active'`, `claimed_at=now()`, guarded
`.eq('status','draft')`).

**Note it writes `team_roster` and `player_placements` but never `players.team_id`, and
never any `comm_*` table.** Chat membership after a paid registration therefore depends on
the triggers and on `ensure_team_channel_membership`, not on the webhook.

### 3.3 Payment failure — `orders` only

`payment_intent.payment_failed` (`:3095-3105`): `UPDATE orders SET payment_status='failed'`
WHERE `stripe_payment_intent_id = …`. **One statement. Nothing else.**
`payment_intent.succeeded` (`:3083-3092`) is the mirror image: `payment_status='paid'`.

`process-auto-payments/index.ts` touches only `registration_payments`,
`program_registrations`, `clubs` and `payment_notifications_log`
(`:52`, `:60`, `:68`, `:81`, `:95`, `:109`, `:116`, `:138`, `:175`, `:186`, `:196`, `:231`,
`:246`, `:255`, `:277`). A grep of it for `team_roster`, `comm_channel_members`,
`comm_channels`, `player_placements`, `players` returns **nothing**.

`held-families-digest/index.ts` is **read-only plus email** — it scans
`registration_payments` rows with `auto_charge_status='held_past_due' AND status='pending'`
and emails a club digest (`:2-20`, `:142-211`). It does not write roster, membership or chat.
**Families held for non-payment keep their roster place and their chats.**

### 3.4 Refund — commissions and orders, never roster

`charge.refunded` (`:3107-3199`): finds the `orders` row by
`stripe_payment_intent_id`; returns early if `refund_status='completed'` (`:3134-3142`);
reads `platform_settings` key `refund_settings` (window days / max completion percent /
certificate-blocks-refund, `:3144-3156`); `checkRefundEligibility` (`:3158`); on denial
writes `orders.refund_status='denied'` + reason (`:3161-3179`); otherwise `processRefund`
(`:3184`) then `orders` → `refund_status='completed'`, `refund_amount`,
`refund_processed_at`, `payment_status='refunded'` (`:3187-3196`).

`processRefund` reverses commissions and course enrollments — the module-level helpers touch
`commissions` (`:165`, `:180`, `:247`), `vendor_profiles` (`:217`), `course_enrollments`
(`:122`, `:260`), `lesson_progress` (`:267`), `course_certificates` (`:138`).
**No roster, team, placement or chat table appears in any refund path.**

### 3.5 Subscription / plan cancel — **MISSING**

A grep across all of `web:supabase/functions/` and `web:src/` for
`customer.subscription`, `subscription.deleted` and `invoice.payment_failed` returns
**zero hits**. The webhook handles exactly three event types:
`checkout.session.completed`, `payment_intent.succeeded`, `payment_intent.payment_failed`,
plus `charge.refunded`. **There is no subscription lifecycle handling at all**, so "plan
cancelled in Stripe" reaches the app only as a failed charge (3.3) — `orders` row, nothing
more.

### 3.6 Registration cancel — **no path found that changes roster**

`program_registrations.status = 'cancelled'` is **read** by G4 of
`remove_player_from_team` (`:154`) and by the client pre-checks, but a grep for a write of
`status: 'cancelled'` finds only unrelated subjects: `player_invitations`
(`web:src/lib/playerInvitations.ts:113`), `evaluator-payout/index.ts:144`, and
`delete-batch-session/index.ts:97,113`. **No UI or function sets a program registration to
cancelled.** How a registration ever becomes `cancelled` in prod is **UNKNOWN**.
Check: `SELECT status, count(*) FROM program_registrations GROUP BY status;` — if `cancelled`
rows exist, they were made by hand or by a path not in this repo.

`withdrawal_requests` is **not** a player-withdrawal table: it is team/club money payouts
(`team_id`, `club_id`, `amount`, `method IN ('venmo','check','cash','zelle','other')`,
`web:…20251221095355…:6-18`). Not a roster path.

### 3.7 What this means for Phase D

The removal path reads money (G4) but no money path writes the roster backwards. So a
family that stops paying keeps its roster place, its team chats and its club-announcements
row until a human presses Remove. `held-families-digest` is the only thing that notices,
and it only sends an email.

---

## 4. PHASE D PREP

### 4a. Read receipts — **"Seen by N of M" needs NO new table. It is already computed.**

**Status: EXISTS.** `mobile:src/screens/MessageReadHistoryScreen.tsx` already does exactly
this calculation and ships today.

The per-member read state is **`comm_channel_members.last_read_at`**
(`web:…20260108184412…:75`, in the original table DDL). The rule, already in code: a member
has read a message when their `last_read_at >= message.created_at`.

- fetch: `SELECT user_id, last_read_at FROM comm_channel_members WHERE channel_id = …`
  (`MessageReadHistoryScreen.tsx:73-76`)
- split into `readers` / `notYet` (`:94-131`), author excluded from both (`:104`)
- names from the same resolver the room uses, `useChatSenderLabels` →
  `get_channel_member_names`, deliberately not a second resolver (`:15-17`, `:65`)
- an unparseable or missing watermark counts as **not** read (`:112-116`) — the one error
  the file says is worth avoiding
- errors are reported, not swallowed (`:78-85`)

Writers of the watermark: `mobile:src/screens/TeamChatRoomScreen.tsx:153`,
`mobile:src/screens/DMChatScreen.tsx:139`, `mobile:src/hooks/useChannelMembers.ts:63`.
Same column the unread badges use (`mobile:src/utils/unreadRule.ts:169`, `:188`).

**So "Seen by N of M" is `readers.length` / `readers.length + notYet.length` from code that
already exists.** The honest caveat is already written down at
`MessageReadHistoryScreen.tsx:8-13`: `last_read_at` is a **per-channel watermark, not a
per-message receipt** — it cannot distinguish "read this one" from "read past this one",
which is why the existing copy says "Read by" and not "Seen". The screen already renders
`Read by ${readers.length}` and `Not yet (${notYet.length})` as its two section titles
(`:136-137`) — so the N and the M are already on screen today. A true per-message receipt
*would* need a new table; "Seen by N of M" does not.

**One thing to check before building it.** The count is only correct if a member can read
*other* members' rows. The SELECT policy that allows this is
`"Channel members can view co-member rows"` — `USING (channel_id IN (SELECT
get_user_channel_ids(auth.uid())))` (`web:…20260902090000_capture_drift_chat_registration_objects.sql:24-28`),
and that migration's own name says it is **captured prod drift**. It is also the newest
SELECT policy on the table in the repo (earlier ones at
`web:…20260108184412…:369` and `web:…20260108203115…:83`). If prod has something narrower,
`MessageReadHistoryScreen` is silently undercounting today.
Check: `SELECT polname, polcmd, pg_get_expr(polqual, polrelid) FROM pg_policy WHERE polrelid='public.comm_channel_members'::regclass;`

### 4b. Directors-only posting — **PARTIAL: the toggle exists and is CLIENT-ONLY. The server lets any member post.**

**The INSERT rule in this repo:**

```sql
CREATE POLICY "comm_messages_insert" ON comm_messages FOR INSERT
WITH CHECK (
  user_id = auth.uid()
  AND channel_id IN (SELECT channel_id FROM comm_channel_members WHERE user_id = auth.uid())
);
```
`web:…20260108184412…:392-397`.

**So today: any member of the channel can post. There is no staff, director or role arm at
all.** For club-announcements, where the S4 sync inserts **every club member** as a plain
`'member'` (`web:…20261013053147…:265-271`), that means **every family in the club can post
to club-announcements** as far as RLS is concerned.

**The toggle that pretends otherwise.** `comm_channels.allow_member_text BOOLEAN DEFAULT
true` was added by `web:…20260109195004_0d747548…:1-6`, commented "If false, only staff can
send text messages. Others can only react with emoji." It is enforced **only in the clients**:

- web: `channel.allow_member_text !== false` → `allowMemberText` prop
  (`web:src/components/comm/ChatPanel.tsx:568`) → `canSendText = allowMemberText || isStaff`
  (`web:src/components/comm/MessageInput.tsx:70`)
- mobile: read at `mobile:src/screens/ChatInfoScreen.tsx:179-184` as `staffOnlyMessaging`;
  toggled by `UPDATE comm_channels SET allow_member_text = !value` (`:321-327`); the switch
  is rendered only when `isStaffInTeam` (`:688-697`)

**No RLS policy and no trigger reads `allow_member_text`** — a grep across all 254
migrations finds the column only in the `ADD COLUMN` that created it. So the restriction is
cosmetic: a direct PostgREST insert bypasses it.

**Two UNKNOWNs here, both material, both caused by the capture gap:**

1. **The live INSERT policy is named `msg_insert`, and this repo does not contain it.**
   S4 refers to it twice as existing (`:107-108` "msg_insert still refuses a NULL author
   because its WITH CHECK is `user_id = auth.uid()`"; `:633`), and both S1 (`:34-37`) and S4
   (`:75-77`) list the `comm_messages` and `comm_channels` INSERT/UPDATE policies as
   explicitly **not** in those migrations. The `user_id = auth.uid()` half is confirmed by
   S4's prose; the membership half and any role arm are **UNKNOWN**.
2. **There is no UPDATE policy on `comm_channels` anywhere in this repo**, yet both apps
   update that table (the `allow_member_text` toggle above, rename, archive). With RLS
   enabled (`web:…20260108184412…:324`) those writes would fail outright, so prod must hold
   an uncaptured UPDATE policy. **Who can actually flip `allow_member_text` today is
   UNKNOWN** — the mobile gate is `isStaffInTeam`, but nothing stops a non-staff member
   issuing the same PATCH if the live policy is loose.

The one check that answers both, and should run before any Phase D posting work:
```sql
SELECT polname, polcmd, pg_get_expr(polqual, polrelid) AS using_expr,
       pg_get_expr(polwithcheck, polrelid) AS check_expr
FROM pg_policy
WHERE polrelid IN ('public.comm_messages'::regclass, 'public.comm_channels'::regclass)
ORDER BY polrelid, polcmd;
```

### 4c. `comm_channels.name` length constraint — **YES: `VARCHAR(100) NOT NULL`**

`web:…20260108184412_5d500626…:51` — `name VARCHAR(100) NOT NULL`, in the original
`CREATE TABLE comm_channels`.

**Never altered.** Only two `ALTER TABLE comm_channels` statements exist in all 254
migrations and neither touches `name`: `…20260109194000…:5-8` adds `is_direct_message`,
`dm_participant_1`, `dm_participant_2`; `…20260109195004…:2-3` adds `allow_member_text`.
(A third is `ENABLE ROW LEVEL SECURITY`.)

So **100 characters, hard limit, NOT NULL** — an over-length name is a `22001`
(`value too long for type character varying(100)`), not a truncation. Worth a client-side
`maxLength={100}` wherever a channel is named or renamed, including the Staff Message chat
name field landed uncommitted today.

Related constraints on the same table, for Phase D's benefit:
`channel_type IN ('team','club','dm','group_dm')` (`:53-54`, the CHECK itself at `:54`) — note the code also uses
`'broadcast'`, `'group'` and `'direct'` (`web:…20260112025123…:16`, `:28`), which the CHECK
would reject, so either prod widened it or those branches are dead; and `channel_scope`
(`:61-67`) requiring exactly one of `team_id` / `club_id` unless the type is `dm`/`group_dm`.

---

## 5. TEST ACCOUNT — fresh test player on "ZZ Test Team 0826"

**Status: EXISTS — the join-code path, in either app. One caveat below.**

### 5.1 The normal path

The product's own path for a new player on an existing team is the **team invitation link**:

1. **Staff copies the link.** Web: club management → team card →
   `${baseUrl}/join-team/${teamSlug}/${invitation_code}`, or
   `${baseUrl}/join-team/${invitation_code}` with no slug
   (`web:src/components/club/ClubManagementTeamsTab.tsx:501-503`; also shown on team create,
   `:1041`). Mobile: Roster screen → **➕ Invite Members** → native share sheet with
   `https://thryvyng.com/join-team/${code}` and the code in the message body
   (`mobile:src/screens/RosterScreen.tsx:459-468`; the code comes from
   `teams.invitation_code` fetched at `:149`, falling back to the raw `team_id`).
2. **Open the link.** Routes: `/join-team/:slug/:code` and `/join-team/:code`
   (`web:src/App.tsx:341-342`). Mobile deep link: `join-team/:slug/:code?`
   (`mobile:src/navigation/linking.ts:87`), screen
   `mobile:src/screens/registration/JoinTeamScreen.tsx`.
3. **Team lookup.** `teams` by `ilike('invitation_code', code)` **and
   `status = 'approved'`** (`web:src/pages/JoinTeam.tsx:190-207`; suffix retry when the code
   has no dash, `:209-225`). Mobile mirrors it (`JoinTeamScreen.tsx:604`;
   `mobile:src/screens/WelcomeScreen.tsx:86-87`).
   **If "ZZ Test Team 0826" is not `status='approved'`, the link resolves to nothing.** That
   is the first thing to check.
4. **Sign up and create the player.** Entry steps `welcome → email → signin|done`
   (`web:src/pages/JoinTeam.tsx:173`). For a **player creating their own account** (the right
   shape for a `+alias` Gmail test account): duplicate pre-check
   `check_self_register_duplicate` (`web:src/pages/JoinTeam.tsx:919-924`;
   `mobile:…JoinTeamScreen.tsx:1548`), then auth signup, then
   `self_register_player_for_team({p_team_id, p_user_id, p_email, p_first_name,
   p_last_name, p_date_of_birth, p_jersey_number, p_gender, p_phone})`
   (`web:src/pages/JoinTeam.tsx:940-950`; `mobile:…JoinTeamScreen.tsx:1566`), then
   `refreshRoles()` because the auth context cached roles before the `player` role existed
   (`web:…:955-961`).

### 5.2 The caveat — the RPC that does the work is not in this repo

**`self_register_player_for_team` and `check_self_register_duplicate` exist in neither
repo's migrations.** `grep -rln "FUNCTION public.self_register_player_for_team"` over all 254
migrations returns nothing. Same for `teams.player_join_mode` and `teams.staff_join_mode`,
which `JoinTeam.tsx:201` and `:222` both select. All are prod-only / applied-by-paste.

**So what `self_register_player_for_team` actually writes — `players`, `user_roles`,
`team_roster`, `player_placements`, chat membership — is UNKNOWN from the repo.** Note
`JoinTeam.tsx:588` claims "user_roles is inserted automatically by `register_player`'s
self-healing block", but **none of the three `register_player` definitions in the repo
contains any `user_roles` insert** (`…20260407120000…`, `…20260407123000…`,
`…20260519100000_register_player_upsert.sql` — grep count 0 in all three). That comment is
either stale or describes prod drift.

Check that would settle the whole item:
```sql
SELECT p.proname, pg_get_functiondef(p.oid)
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('self_register_player_for_team','check_self_register_duplicate','register_player');
```

### 5.3 The other two paths, for completeness

- **Parent registers a child** — `register_player` RPC directly
  (`web:src/pages/JoinTeam.tsx:555`, `:786`;
  `web:src/components/team/RegisterMyChildModal.tsx:162`;
  `web:src/components/registration/RegistrationLayout.tsx:427`). Latest definition
  `web:…20260519100000_register_player_upsert.sql`; the 20-arg signature and
  `p_status DEFAULT 'draft'` are at `…20260407123000…:9-29`. `SECURITY DEFINER`, bypasses
  `players` RLS (`:111-112`), `GRANT EXECUTE … TO authenticated` (`:107-110`). Writes
  `players` only — **no `team_roster`, no `user_roles`, no chat**. A player created this way
  sits at `status='draft'` until a payment activates it (3.2).
  "Register my child" is gated client-side to
  `['head_coach','assistant_coach','team_manager']`
  (`web:src/components/team/TeamRosterTab.tsx:70`).
- **Claim an existing player row** — `player_invitations` +
  `generate_player_invitation_code` + `claimPlayerAccount`
  (`web:src/lib/playerInvitations.ts:74-148`, `:192-245`); mobile equivalents
  `verify_player_dob`, `check_player_claim_status`, `claim_player_for_team`
  (`mobile:…JoinTeamScreen.tsx:1778`, `:1814`, `:1984`). This claims a player **already on
  the roster** — not a fresh test player. The web roster kebab's "Invite to Create Account"
  item (`web:src/components/team/TeamRosterTab.tsx:337-343`) starts this flow.

### 5.4 Recommended sequence for the test account

Not run — recon only. Stated as the path the code supports:

1. Confirm the team is joinable: `status='approved'` and it has an `invitation_code`.
2. Get the link from mobile Roster → ➕ Invite Members, or the web club team card.
3. Open `/join-team/<code>` signed out.
4. Take the **player-creates-own-account** branch with the `+alias` Gmail.
5. Verify afterwards: a `players` row with the right `team_id`; a `user_roles` row with role
   `player`; a `comm_channel_members` row in the team's default channel; and whether
   club-announcements membership appeared (the S4 sync should add it via
   `trg_players_sync_club_chat`).

Step 5's last two are the interesting ones — they are the forward direction of the same
membership plumbing items 1 and 2 cover backwards, and neither has a test record in
`docs/ledger.md`.

---

## Cross-item findings worth a ruling

1. **`roster_removal_log` is written but never read.** No UI in either app queries it, and
   team staff cannot SELECT it. Either surface it to club admins or accept it as
   forensics-only.
2. **Team delete (2.1) is the biggest unguarded destructive path in the product** — it
   permanently deletes every chat message for a team, from the client, with no audit, no
   money check and mostly unchecked errors. `remove_player_from_team` got a careful
   `SECURITY DEFINER` function with five guards; team delete got six raw client statements.
3. **`allow_member_text` is a client-side-only restriction** presented to staff as a
   setting. Any member can bypass it with a direct insert. This is the gap Phase D's
   directors-only posting has to close, and it is a *server* fix.
4. **The capture gap is now blocking.** Three objects this recon needed are prod-only:
   the `comm_messages` INSERT policy (`msg_insert`), the `comm_channels` UPDATE policy, and
   `self_register_player_for_team`. One `pg_policy` + `pg_proc` dump, saved into
   `docs/recon/`, would close all of them at once and is a prerequisite for 4b.
5. **`team_staff` vs `user_roles`** decide the same question in different places
   (1.1). This recon found it on the removal path; `calendar-add-permission-oct12.md`
   found it on calendar create. It is one root cause, not two.
