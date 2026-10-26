# Recon — Calendar & Teams v2

Date: 2026-10-26 · Read-only recon. No code changed.
Repos read: `thryvyng-mobile` (this repo) · `~/Documents/thrive-and-score` (web, READ-ONLY).
No database access was used. Every column fact below comes from migration files,
generated Supabase types, or source code.

---

## 1. `teams` color column

**Column name: `color`. Type `string | null` — NULLABLE. Stored format: hex string with
leading `#` (e.g. `#5B7BB5`), written verbatim from a fixed palette; no validation, no
enum, no CHECK found.**

Evidence (generated types, web repo):
- `teams.Row.color: string | null` — `thrive-and-score/src/integrations/supabase/types.ts:10256`
- `teams.Insert.color?: string | null` — `thrive-and-score/src/integrations/supabase/types.ts:10303`
- The `teams` Row block starts at `thrive-and-score/src/integrations/supabase/types.ts:10246`

### DRIFT — no migration creates this column
`teams.color` exists in the generated types (so it exists in prod) but is defined in **no
migration file in either repo**. Greps run (all returned zero hits for a teams color DDL):
- `grep -rniE "add column (if not exists )?color" supabase/migrations/` → 0 hits (web, 265 migrations)
- `grep -rniE "^\s*\"?color\"?\s+(text|varchar|character)" supabase/migrations/` → 0 hits (web)
- `grep -rniE "color" supabase/migrations/` → 0 hits (mobile; mobile has exactly 1 migration,
  `supabase/migrations/20250224000000_notify_lineup_published.sql`)

The only `color`-bearing columns found in web migrations belong to other tables:
`cognitive_games.primary_color`, `award_types.award_color`, `outcome_color`, and an
`app_settings` seed of `primary_color`/`secondary_color` — e.g.
`thrive-and-score/supabase/migrations/20251118074723_1dfeee73-5b74-4d80-bcd9-5d607e5c6a01.sql:37`.
INFERRED: `teams.color` was added live and never captured in a numbered migration.

### WRITERS — both are in MOBILE. The web app has NO team color picker.
1. `src/screens/TeamDetailScreen.tsx:169`
   `await supabase.from('teams').update({ color: colorHex }).eq('id', team.id)`
   inside `handleColorSelect` (`src/screens/TeamDetailScreen.tsx:164`).
   UI: section titled "Team Color", gated `isStaffInTeam` — `src/screens/TeamDetailScreen.tsx:276`.
   Swatch grid at `src/screens/TeamDetailScreen.tsx:299`, palette `TEAM_COLOR_PALETTE` at
   `src/screens/TeamDetailScreen.tsx:20-53`. **Swatch count: 32.**
2. `src/screens/RosterScreen.tsx:212-216`
   `.from('teams').update({ color: colorHex }).eq('id', team.id)`
   inside `handleColorSelect` (`src/screens/RosterScreen.tsx:208`).
   UI: settings sheet row labelled "Team Color" — `src/screens/RosterScreen.tsx:585`,
   reached from the ⚙️ header button gated `canManage` (`src/screens/RosterScreen.tsx:428`,
   `canManage = isStaffInTeam` at `src/screens/RosterScreen.tsx:121`).
   Swatch grid at `src/screens/RosterScreen.tsx:606`, palette `TEAM_COLOR_PALETTE` at
   `src/screens/RosterScreen.tsx:22-55`. **Swatch count: 32.**

**The two palettes are byte-identical** (verified by `diff` of the two awk-extracted blocks
→ no output). They are duplicated constants, not a shared import. Two write sites, two
copies of the palette.

WEB WRITERS: **NONE.** Greps run against `thrive-and-score/src/`:
- `grep -rniE "\bcolor\b"` over `src/components/club/team-detail/TeamSettingsTab.tsx`,
  `src/components/team/TeamEditDialog.tsx`, `src/components/club/CreateTeamModal.tsx`,
  `src/pages/RegisterTeam.tsx` → **0 hits in all four**
- `grep -rnE "team[A-Za-z]*\??\.color\b|teams\.color\b" src/` → 0 hits
- `grep -rniE "TEAM_COLORS|COLOR_OPTIONS|PRESET_COLORS|swatch" src/` → only unrelated hits
  (`training-studio/animation-types.ts:165` diagram colors;
  `team/evaluation-settings/CreateAwardModal.tsx:26` award colors)
- `grep -rniE "color.*picker|ColorPicker" src/` → one hit, a training-studio cone picker
  (`src/components/training-studio/DiagramEditor.tsx:844`)

CORRECTION TO THE TASK BRIEF: the brief expected the picker in "web Team Settings". It is
not there. Both pickers are in this repo.

### READERS — mobile (all read `team.color` with a hardcoded fallback)
| File:line | Fallback |
|---|---|
| `src/screens/CalendarScreen.tsx:539` (list card team dot) | `#8b5cf6` |
| `src/screens/CalendarScreen.tsx:939` (team picker row dot) | `#8b5cf6` |
| `src/screens/CalendarScreen.tsx:994` (team picker row dot) | `#8b5cf6` |
| `src/screens/ChatScreen.tsx:112-113` (`getChannelColor`) | falls through, see §5 |
| `src/screens/ChatScreen.tsx:522` (badge circle) | `borderColor` |
| `src/screens/ChatScreen.tsx:934` (team object build) | `undefined` |
| `src/screens/EventDetailScreen.tsx:1221` (team dot) | `#5B7BB5` |
| `src/screens/EventDetailScreen.tsx:1546` (`teamColor` prop) | `#5B7BB5` |
| `src/screens/TeamDetailScreen.tsx:120` (select), `:174`, `:190` | `#5B7BB5` / `#8b5cf6` |
| `src/screens/RosterScreen.tsx:149` (select), `:156`, `:222`, `:397`, `:515`, `:667` | `#5B7BB5` / `#8b5cf6` / `#8B6BAD` |
| `src/screens/TeamsScreen.tsx:136` (`teams.color`) | `#5B7BB5` |
| `src/components/calendar/TeamLegend.tsx:35`, `:60` | none (raw `team.color`) |
| `src/components/calendar/CalendarSyncModal.tsx:185` | `#5B7BB5` |
| `src/components/calendar/CreateEventModal.tsx:782` | `colors.accentDim` |
| `src/components/dashboards/PlayerDashboard.tsx:241` | `#8b5cf6` |
| `src/hooks/useUserTeams.ts:72` | index-derived palette, see §5 |

**Five different fallback hexes are in play across readers: `#8b5cf6`, `#5B7BB5`,
`#8B6BAD`, `colors.accentDim`, and none.** `TeamLegend` is the only reader that will render
a transparent/undefined dot when `color` is null.

READERS — web: **NONE** (`grep -rnE "team[A-Za-z]*\??\.color\b|teams\.color\b" src/` → 0 hits).

---

## 2. CalendarScreen views

**Path: `src/screens/CalendarScreen.tsx` — 1574 lines.**

`type ViewMode = 'list' | 'month' | 'week' | 'day'` — `src/screens/CalendarScreen.tsx:47`

### Current tab order
`VIEW_OPTIONS` at `src/screens/CalendarScreen.tsx:49-54`:
1. List — `src/screens/CalendarScreen.tsx:50`
2. Month — `src/screens/CalendarScreen.tsx:51`
3. Week — `src/screens/CalendarScreen.tsx:52`
4. Day — `src/screens/CalendarScreen.tsx:53`

Default on mount: `'list'` — `src/screens/CalendarScreen.tsx:96`.
Tab pills render inline (active color `#8B5CF6`) at `src/screens/CalendarScreen.tsx:718-727`.

### Renderer per view
| View | Rendered by | File |
|---|---|---|
| List | **inline** `ScrollView` + `renderEventListCard` (no component) | `src/screens/CalendarScreen.tsx:764` (branch), card fn at `:495` |
| Month | `<MonthView>` | `src/components/calendar/MonthView.tsx`, branch at `src/screens/CalendarScreen.tsx:812` |
| Week | `<WeekView>` | `src/components/calendar/WeekView.tsx`, branch at `src/screens/CalendarScreen.tsx:833` |
| Day | `<DayView>` | `src/components/calendar/DayView.tsx`, branch at `src/screens/CalendarScreen.tsx:847` |

Imports: `src/screens/CalendarScreen.tsx:28-30`. The chain ends `: null` at
`src/screens/CalendarScreen.tsx:857`.
Month and Week both jump to Day on day-press (`setViewMode('day')` at
`src/screens/CalendarScreen.tsx:818` and `:844`).

### Event type label — THREE separate sources, not one
1. `getEventTypeLabel(eventType: string)` — **`src/screens/CalendarScreen.tsx:70-84`**.
   Local to the file, not exported. 10 explicit cases + `default: 'EVENT'`:
   game→GAME, practice→PRACTICE, tournament→TOURNAMENT, meeting→MEETING, party→PARTY,
   scrimmage→SCRIMMAGE, tryout→TRYOUT, camp→CAMP, other_event→OTHER, club_event→CLUB.
2. `getEventDisplayTitle` — `src/components/calendar/DayView.tsx:40-46`. Does its own
   `(event.event_type || 'event').toUpperCase()` (`src/components/calendar/DayView.tsx:41`)
   and prefixes `"<TYPE> vs <opponent>"` for game/scrimmage. Does NOT call `getEventTypeLabel`.
3. `EVENT_TYPES` / `getEventTypeConfig` — `src/types/index.ts:178-187`. Only **5** values
   (game, scrimmage, practice, other_event, club_event) with `label` + `icon`; imported by
   CalendarScreen at `src/screens/CalendarScreen.tsx:36`.

Month and Week do not label at all — they show an emoji from a **locally redefined**
`getEventIcon`: `src/components/calendar/MonthView.tsx:36`,
`src/components/calendar/WeekView.tsx:22`, `src/components/calendar/DayView.tsx:29`.
Three copies of the same function.

MISMATCH worth flagging: `getEventTypeLabel` knows 10 types; `EVENT_TYPES` knows 5. Types
like `tournament`, `meeting`, `party`, `tryout`, `camp` get a label from the switch but fall
to `EVENT_TYPES[3]` (`other_event`) in `getEventTypeConfig` (`src/types/index.ts:187`).

### Unused style keys in CalendarScreen's StyleSheet
`StyleSheet.create` begins at `src/screens/CalendarScreen.tsx:1051`.
**Total keys: 98. Orphans (zero `styles.<key>` references anywhere in the file): 25.**

Method: extracted all top-level keys from line 1051 to EOF, then counted
`styles.<key>` occurrences in lines 1–1050. Spot-verified 5 keys against the whole file
(`viewToggle`, `rsvpSection`, `cardTypeBadge`, `eventCardWrap`, `placeholderView` — all 0).

The 25 orphans:
```
attendanceDivider      attendanceGoing        attendanceNoReply
attendanceNotGoing     attendancePreview      cardTypeBadge
cardTypeBadgeText      eventCardWrap          placeholderText
placeholderView        rsvpBadge              rsvpBadgeText
rsvpBtn                rsvpBtnNo              rsvpBtnText
rsvpBtnYes             rsvpButtons            rsvpNo
rsvpSection            rsvpYes                viewButton
viewButtonActive       viewButtonText         viewButtonTextActive
viewToggle
```
They cluster into three dead groups: the old inline RSVP buttons (10 keys), the old
attendance preview (5 keys), and the old view-toggle chrome (5 keys, superseded by the
inline pills at `src/screens/CalendarScreen.tsx:718`).

### Also dead
`src/components/calendar/EventCard.tsx` is **imported by nothing**
(`grep -rn "calendar/EventCard\|from './EventCard'" src/` → 0 hits). The only `EventCard`
identifier in use is a local `renderEventCard` inside
`src/screens/EventDetailScreen.tsx:1181`, which is unrelated.

---

## 3. Roster → messaging

**Roster screen: `src/screens/RosterScreen.tsx` — 1188 lines.**

### What tapping a player row offers TODAY
Row tap → `openPlayerDrawer(player)` (`src/screens/RosterScreen.tsx:506`, handler at
`:242`), which calls `supabase.rpc('get_player_contact', { p_player_id })`
(`src/screens/RosterScreen.tsx:251`) and opens a modal drawer.

Drawer contents:
- Avatar + name + `#jersey` + position — `src/screens/RosterScreen.tsx:657-689`
- Two contact blocks via `renderContactSection` — `src/screens/RosterScreen.tsx:705` and `:713`
- Each block renders up to **three buttons only** (`renderContactSection`,
  `src/screens/RosterScreen.tsx:356-394`):
  - `📞 Call` → `tel:` — `src/screens/RosterScreen.tsx:371` (label `:373`)
  - `💬 Text` → `sms:` — `src/screens/RosterScreen.tsx:379` (label `:381`)
  - `✉️ Email` → `mailto:` — `src/screens/RosterScreen.tsx:387` (label `:389`)
  Each button appears only when its datum is non-null.
- A `Switch` "Share our contact info with the team" when `is_own_player` — `src/screens/RosterScreen.tsx:726-738`
- Row "View full profile" → navigates to `PlayerProfile` — `src/screens/RosterScreen.tsx:746-761`
- Privacy fallbacks: "No contact info on file for this player."
  (`src/screens/RosterScreen.tsx:701`) and "This family keeps their contact info private."
  (`src/screens/RosterScreen.tsx:722`)

Separately, a `canManage`-gated kebab on each row opens remove-from-team only —
`src/screens/RosterScreen.tsx:541`, modal at `:772`.

**THERE IS NO IN-APP MESSAGING ENTRY POINT ON THE ROSTER.** All three actions hand off to
the OS dialer / SMS / mail client via `Linking.openURL` (`src/screens/RosterScreen.tsx:233`).
`grep -rn "get_or_create_dm_channel" src/` returns **no hit in RosterScreen.tsx**.

### Where `get_or_create_dm_channel` IS called in this repo
**Exactly one call site:**
- `src/screens/ChatScreen.tsx:1248`, inside `handleSelectDMUser`
  (`src/screens/ChatScreen.tsx:1233`), reached from the new-chat modal's DM picker.
  Args: `user1_id`, `user2_id`, `p_team_id: null`, `p_club_id: null`.
  The `p_club_id: null` is deliberate per ruling BF-1 — comment at
  `src/screens/ChatScreen.tsx:1237-1246`; the server resolves the shared club itself.

Other references are not calls:
- `src/screens/ChatScreen.tsx:1263` — error log string
- `src/screens/DirectMessagesScreen.tsx:141` — comment only
- `src/lib/clubRule.ts:5` — doc comment

Related sibling path: `create_group_channel` at `src/screens/StaffMessageScreen.tsx:280`
(inside `handleStartConversation`, `src/screens/StaffMessageScreen.tsx:241`).

### BF-8 same-club lock — client-side enforcement
**It is REACTIVE, not preventive. There is no client-side club pre-check before the RPC.**

- The rule module is `src/lib/clubRule.ts`. Its own header states the server enforces it:
  `get_or_create_dm_channel` and `create_group_channel` RAISE, and the
  `comm_channel_members_insert` policy refuses — `src/lib/clubRule.ts:1-21`.
- The one sentence: `SAME_CLUB_MESSAGE = 'You can only message people in your club'` —
  `src/lib/clubRule.ts:26`. Byte-identical to web `src/lib/chatClubRule.ts` by design
  (COMMS PARITY ruling 2) — `src/lib/clubRule.ts:20-21`.
- Detection: `isSameClubRefusal(error)` matches `error.hint === 'not_same_club'`, with a
  message-substring fallback — `src/lib/clubRule.ts:43-47`.
- Ambiguous RLS refusals (SQLSTATE `42501`, `RLS_REFUSED` at `src/lib/clubRule.ts:31`) are
  disambiguated by calling `can_add_member`, the policy's own predicate —
  `describeAddMemberFailure`, `src/lib/clubRule.ts:55-73`.
- Consumers: `src/screens/ChatScreen.tsx:27`, `src/screens/StaffMessageScreen.tsx:17`,
  `src/components/chat/AddMembersModal.tsx:38`. Related shape for staff:
  `src/lib/channelStaff.ts:19`.
- Handling at the DM site: `src/screens/ChatScreen.tsx:1259-1266` — on refusal,
  `Alert.alert('Different clubs', SAME_CLUB_MESSAGE)`. Same at
  `src/screens/StaffMessageScreen.tsx:292-295`.

Upstream mitigation (not a client check): the DM picker is fed by
`supabase.rpc('search_chat_contacts')` — `src/screens/ChatScreen.tsx:1200` — described as
a membership-gated RPC that "only returns people who share a team with the caller"
(`src/screens/ChatScreen.tsx:1197-1199`). So out-of-club people rarely surface in the
picker, but **that gate is server-side too**; nothing in the client tests clubs before
firing the RPC.

### UNKNOWN
`get_player_contact` (`src/screens/RosterScreen.tsx:251`) and `set_contact_sharing`
(`src/screens/RosterScreen.tsx:311`) are **defined in neither repo's migrations**:
`grep -rn "get_player_contact" supabase/ src/` in `thrive-and-score` → 0 hits.
Its return shape is known only from client use (see §4). Check that would settle it:
list functions in the live DB, or find the repo/migration that declares it.

---

## 4. Adult-player label

### "Parent contact" — exact string and location
**`src/screens/RosterScreen.tsx:706`** — the literal `'Parent contact'`, passed as the
`title` argument to `renderContactSection`. Rendered as
`<Text style={styles.contactSectionTitle}>{title}</Text>` —
`src/screens/RosterScreen.tsx:365`.

It is the **only** occurrence in the repo
(`grep -rn "Parent contact\|Parent Contact\|parent contact" src/` → 1 hit).

The sibling block directly below is `'Second parent'` — `src/screens/RosterScreen.tsx:713`.

Both blocks are rendered unconditionally whenever `contactData?.contact_shared` is true and
`hasNoContactData(contactData)` is false — `src/screens/RosterScreen.tsx:698-704`.
`hasNoContactData` checks only parent fields: `parent_first_name`, `parent_last_name`,
`parent_email`, `parent_phone`, `secondary_parent_name`, `secondary_parent_email`,
`secondary_parent_phone` — `src/screens/RosterScreen.tsx:346-353`. There is no player-own
contact field in that shape at all.

### Adult-player (18+) detection: **NONE**
There is no adult-player concept anywhere in the roster or contact path. The string
"Parent contact" is shown to every player regardless of age, and `RosterScreen.tsx` never
reads a date of birth.

Greps run: `grep -rniE "is_adult|isAdult|adult_player|age >= 18|>= 18|date_of_birth|birth_date|dob\b" src/`
— zero `is_adult` / `isAdult` / `adult_player` hits anywhere. `RosterScreen.tsx` does not
appear in the results at all.

What age logic DOES exist (all unrelated to the roster label):
- `src/screens/PlayerProfileScreen.tsx:109-122` — `calculateAge(dob)`; result used only to
  display an age (`src/screens/PlayerProfileScreen.tsx:148`). No 18 threshold.
- `src/screens/EvaluationDetailScreen.tsx:114-120` — a second copy of `calculateAge`, used
  at `:575` for display.
- `src/screens/RegistrationDetailScreen.tsx:24-40` — `ageFromDob`, display only (`:274`).
- `src/utils/ageGroupCalculator.ts:3-5` — sport-year bucketing from DOB, not an adult test.
- `src/screens/registration/JoinTeamScreen.tsx:180` —
  `SELF_REGISTER_MIN_AGE = 16`. **The only age GATE in the app, and it is 16, not 18.**
  Used by the under-age test at `src/screens/registration/JoinTeamScreen.tsx:204`
  (`age !== null && age < SELF_REGISTER_MIN_AGE`), message at `:199`.
  Bounds `MIN_PLAYER_DOB` (`:72`) and `MIN_SELF_REGISTER_DOB` (`:73`).

INFERRED: a 16- or 17-year-old can already self-register (own account, own DOB) and will
still see their own record labelled "Parent contact" on the roster. Any v2 adult-player
label needs a new derivation; nothing exists to reuse.

---

## 5. Team color derived client-side on device

Three distinct client-side derivations, none of them agreeing.

### 5a. Index-based palette cycling — `src/hooks/useUserTeams.ts`
**Method: array index modulo, assigned at map time.**
- `const TEAM_COLORS = [...]` — `src/hooks/useUserTeams.ts:47-56`, **8 hexes**:
  `#8b5cf6` Purple, `#10b981` Green, `#f59e0b` Orange, `#3b82f6` Blue, `#ef4444` Red,
  `#ec4899` Pink, `#14b8a6` Teal, `#f97316` Orange.
  Comment above it: "Team colors for 'All Teams' view" — `src/hooks/useUserTeams.ts:46`.
- `color: teamsRow.color || TEAM_COLORS[colorIndex % TEAM_COLORS.length]` —
  **`src/hooks/useUserTeams.ts:72`**, inside `mapTeamFromRow(teamsRow, access_type, extras, colorIndex)`
  (`src/hooks/useUserTeams.ts:58-76`).
- `UserTeam.color?: string` is commented "For visual distinction" — `src/hooks/useUserTeams.ts:17`.

**This is NOT a hash — it is positional.** `colorIndex` is the team's position in the
caller's list, so a team's fallback color changes if the list order or membership changes.
It is also not stable across users: the same team can be index 0 for one parent and index 3
for another. Any team with a real `teams.color` bypasses it entirely.

CalendarScreen consumes this hook (`src/screens/CalendarScreen.tsx:25`, destructured at
`:97-103`), so the calendar's "All Teams" colors are already a mix of DB values and
positional fallbacks.

### 5b. Hardcoded type-based fallback chain — `src/screens/ChatScreen.tsx`
**Method: hardcoded constants per channel kind.**
`getChannelColor(conversation)` — **`src/screens/ChatScreen.tsx:111-125+`**:
1. `conversation.team.color` if set — `src/screens/ChatScreen.tsx:112-113`
2. else `#5B7BB5` if there is a `team_id` — `src/screens/ChatScreen.tsx:114-116`
3. else `#8B6BAD` for a DM — `src/screens/ChatScreen.tsx:117-119`
4. else `#9B7BB5` for a group DM — `src/screens/ChatScreen.tsx:120-122`
5. else falls through to a name-based branch — `src/screens/ChatScreen.tsx:123+`

### 5c. Event color is a DIFFERENT axis and deliberately ignores team color
`src/lib/eventColors.ts` is declared THE source of truth for an event's color on every
surface — `src/lib/eventColors.ts:1-5`. It keys on **event type, not team**:
`EVENT_TYPE_ACCENT` at `src/lib/eventColors.ts:32-36` (game/scrimmage `#0d9488`,
practice `#3B82F6`), `EVENT_ACCENT_DEFAULT = '#a855f7'` (`:38`),
`EVENT_ACCENT_PAST = '#4B5563'` (`:39`).

The header records that Day/Week/Month each used to use the TEAM color and that this was
deliberately removed — `src/lib/eventColors.ts:6-10` — and states explicitly: "TEAM colour
is a different axis and is left alone: team dots, the team legend, team swatches and player
avatars still carry it, because they answer 'whose team' rather than 'what kind of event'"
(`src/lib/eventColors.ts:27-30`).

It also records that the practice hex `#3B82F6` is a **stand-in for a live `teams.color`
value that was not readable from the repo** — `src/lib/eventColors.ts:14-19`.

### 5d. Component-level hardcoded defaults (not derivations, but they decide the pixel)
- `src/components/PlayerAvatar.tsx:19` — `teamColor = '#8B6BAD'` default param,
  applied at `:44` and `:66`.
- `src/screens/EvaluationRosterScreen.tsx:119` — `teamColor="#5B7BB5"` hardcoded, never
  reads the team.
- `src/screens/lineup/LineupEditorScreen.tsx:1023` — `jerseyConfig.team_color || '#8b5cf6'`.
  NOTE: `team_color` here is a **jersey config field, a different column/shape** from
  `teams.color`; its own swatch row is at `src/screens/lineup/LineupEditorScreen.tsx:1157`.

### Summary for a build prompt
There is no single team-color resolver. A v2 team color system has to reconcile:
one nullable DB column with no migration, two duplicated 32-swatch pickers in mobile,
one 8-hex positional fallback in a hook, one 4-step hardcoded chain in chat, five
different inline fallback hexes across ~18 read sites, and an explicit prior ruling
that event surfaces must NOT use team color.
