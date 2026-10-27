# Build — Calendar & Teams v2, part 1

Date: 2026-10-26 · Follows `docs/recon/calendar-teams-v2.md` (§1, §2, §5).
Status: **BUILT, static proof only. Nothing verified on a device or simulator.**
No schema, migration, dependency, env, auth/RLS or DB access was touched.

---

## 1. What changed

### New files (3)
| File | What it is |
|---|---|
| `src/constants/teamColors.ts` | `TEAM_COLOR_PALETTE` (the 24 hexes the DB trigger assigns, in trigger order), `isHexColor`, `resolveTeamColor`, `tint`, `darken`. The one place team colour is read or computed. |
| `src/constants/eventTypes.ts` | `getEventTypeMeta` / `getEventIcon` / `getEventTypeLabel` — label + icon for all 10 known types, unknown → Other. Replaces 3 label sources and 3 `getEventIcon` copies. No hue. |
| `src/components/calendar/EventPill.tsx` | The R-C compact pill (team tint 18% + 4pt left bar; icon · time · title · team) and `TeamDots` (R-D day dots, max 3 then +n). Shared by Week, Month and the Day strip. |

### Rewritten
| File | Ruling |
|---|---|
| `src/components/calendar/WeekView.tsx` | R-C. Seven rows, one per day, each holding pills. The 7-column time grid, the overlap/column maths it needed, the local `getEventIcon` and the local time formatter are gone. |
| `src/components/calendar/MonthView.tsx` | R-D. Cells carry team-colour dots (max 3, then +n); tapping a day lists that day's pills **under the grid** instead of leaving for the Day view. The two title-bearing chips per cell are gone. |
| `src/components/calendar/DayView.tsx` | R-D. 7-day strip with dots, then the H1 list cards. The 6am–10pm grid, absolute positioning, `getEventDisplayTitle` and the third `getEventIcon` are gone. The schedule-conflict banner is KEPT (it is a warning, not a grid). |

### Edited
| File | Change |
|---|---|
| `src/screens/CalendarScreen.tsx` | R-A card (leaf, 5pt strip, 2pt frame at 50% = **team** colour; type = grey chip + icon, re-added), R-E tab order, `resolveTeamColor` at 4 read sites, local `getEventTypeLabel` deleted, Day view fed `renderEventCard`, Week/Month fed `showTeamNames`, 20 orphaned style keys deleted. |
| `src/hooks/useUserTeams.ts` | The 8-hex **positional** palette and the `colorIndex` threaded through 4 call sites are gone; `resolveTeamColor(teamsRow)` replaces them. |
| `src/screens/TeamDetailScreen.tsx` | 32-swatch picker + `teams.update({ color })` **removed**; read-only swatch + "Color assigned by Thryvyng". |
| `src/screens/RosterScreen.tsx` | Same, in the ⚙️ Team Settings sheet. Both `PlayerAvatar` colour reads resolved. |
| `src/components/calendar/TeamLegend.tsx` | `color` is now optional and resolved inside the component (a null row used to render a transparent dot). |
| `src/components/calendar/CalendarSyncModal.tsx`, `src/screens/TeamsScreen.tsx`, `src/components/dashboards/PlayerDashboard.tsx`, `src/screens/EventDetailScreen.tsx` (header team dot only) | One-line resolver swap at the recon's read sites. |

### Deleted
No files. **There were no picker component files to delete** — both pickers were
inline in `TeamDetailScreen.tsx` and `RosterScreen.tsx`, so nothing imported
them and no stub was needed. The two byte-identical 32-entry
`TEAM_COLOR_PALETTE` arrays were deleted in place.
`src/components/calendar/EventCard.tsx` (dead) was left alone, as instructed.

---

## 2. Rulings, and the judgment calls inside them

- **R-A** — The card's colour axis moved from event type to team. `eventColors.ts`
  is no longer imported by any calendar VIEW; `CalendarScreen` keeps one import
  from it, `EVENT_ACCENT_PAST`, so a past event still greys out rather than
  carrying its team's colour at half opacity. Greying past is the one state kept
  above identity; it is pre-existing F1/H1 behaviour, not a new ruling.
- **R-A, icons** — The ruling names four glyphs for a chip that has to cover ten
  types. They are shared by family: ⚽ competitive play (game, scrimmage),
  🏃 training (practice, camp, tryout), 🏆 tournament, 📅 everything else. Each
  type keeps its OWN label, so the chip still reads "Scrimmage", not "Game".
- **Weekday band tone = team colour at −12% lightness** — already satisfied with
  no change to `DateBadge`: its `darkenAccent(color)` defaults to 0.12, and the
  colour it is handed is now the team's. `darken()` in `teamColors.ts` is the
  same maths; `DateBadge` was outside SCOPE so its copy was left in place rather
  than rewired mid-verification (see DEFERRED).
- **R-D, Month** — Tapping a trailing/leading cell (e.g. Nov 1 from October)
  moves the grid to that month and **keeps that day selected**; only the arrows
  reset the selection (to today, else the 1st).
- **R-D, Day** — The Day view renders THE list card, passed down as
  `renderEventCard`, not a copy of it. One card, one RSVP write path.
- **R-C/R-D, team name** — Pills show the team name only in All Teams
  (`showTeamNames`); the colour carries identity when one team is in view.

---

## 3. Deferred / not done, with reasons

1. **`EventDetailScreen` is now inconsistent with the list card — NEEDS LU.**
   The list leaf is the TEAM's colour; the detail screen's leaf is still the
   EVENT TYPE's (`eventAccent`), so tapping a card changes the badge's colour.
   `EventDetailScreen` is not in this task's SCOPE and is mid-verification (the
   F1 "one ticket" checks are still owed in the ledger). Part 2 decides.
2. **Three read sites left unresolved, all FORBIDDEN areas** (SCOPE said every
   recon read site; FORBIDDEN named these by name — FORBIDDEN won):
   - chat: `ChatScreen.tsx:112-113`, `:522`, `:934` (and its `#5B7BB5` /
     `#8B6BAD` / `#9B7BB5` chain, which mixes DM and group-DM colours that are
     not team colours at all — a genuine design call, not a swap).
   - create-event form: `CreateEventModal.tsx:717`, `:738`, `:782`
     (`|| colors.accentDim`).
   - attendance tab: `EventDetailScreen.tsx:1548`.
   Note: the modal's and the detail screen's events/teams both come from
   `useUserTeams`, which now resolves colour, so those three fallback arms are
   already unreachable in practice.
3. **`EVENT_TYPES` in `src/types/index.ts` still gives `game` a 🏆** and drives
   the create/edit type pickers and `EventTypeSheet`. Those are the create-event
   form, so the calendar chip (⚽ Game) and the create sheet (🏆 Game) disagree
   until `EVENT_TYPES` is pointed at `src/constants/eventTypes.ts`. One-line
   change, needs the create form open.
4. **A 4th `getEventIcon`** lives at `src/screens/game-stats/LiveSpectatorScreen.tsx:90`.
   It is a different domain — goal / yellow_card / substitution, not calendar
   event types — and must NOT be merged into the shared util. It is why the
   "exactly 1 definition" check reads 2.
5. **i18n parked**, per the brief: "Color assigned by Thryvyng" is EN only.
6. **6 pre-existing orphan style keys in `RosterScreen.tsx`** (`jerseyBadge`,
   `jerseyNumber`, `playerMeta`, `positionBadge`, `positionText`, `ageText`) were
   left alone: they belong to the player row, not to the colour picker this task
   removed. The recon's 25 CalendarScreen orphans ARE gone.
7. **`#3B82F6` is still in `src` 38 times** — the DONE check asked for 0, which
   cannot be reached from this SCOPE. 37 of the 38 are unrelated chrome in
   games, registration, chat, evaluations, courses and forms; the 38th is
   `eventColors.ts:35`, the practice accent, still used by `EventDetailScreen`.
   In the files this task owns: **1**, `EventTypeSheet.tsx:37` (create-event
   form, FORBIDDEN).

---

## 4. Checks run (static only)

```
npx tsc --noEmit | grep -c "error TS"            → 5  (= baseline, all in src/components/games/)
eslint <15 changed/new files>                     → 0 errors (213 warnings, all pre-existing patterns)
npx expo export --platform ios                    → Exported: dist
grep -rn "#3B82F6" src | wc -l                    → 38  (see §3.7; 1 in owned files)
team-colour/fallback hex survivors                → 12  (see below)
grep -rn "TEAM_COLOR_PALETTE\|resolveTeamColor"   → 30  (target ≥ 15)
getEventIcon definitions                          → 2   (see §3.4)
VIEW_OPTIONS order                                → List · Day · Week · Month
```

The 12 survivors of
`grep -rnE "#[0-9A-Fa-f]{6}" src --include="*.ts" --include="*.tsx" | grep -iv teamColors.ts | grep -iE "team.?color|fallback"`,
none of them a `teams.color` fallback this SCOPE could remove:

| Site | Why it survives |
|---|---|
| `EventDetailScreen.tsx:1548` | attendance tab — FORBIDDEN |
| `EventTypeSheet.tsx:40` | create-event form — FORBIDDEN; a purple control, not a team colour |
| `TeamDetailScreen.tsx:229` | brand purple on the section-title icon (R-A allows purple on controls); the line matches the grep only because it reads "Team Color" |
| `lineup/LineupEditorScreen.tsx:1023`, `lineup/LineupFieldView.tsx:88`, `lineup/LineupFieldEditor.tsx:213` | `jersey_config.team_color` — a **different column**, per recon §5d |
| `training/FieldDiagram.tsx:374`, `lineup/PlayViewer.tsx:116` | diagram A/B team colours, unrelated to `teams.color` |
| `PlayerAvatar.tsx:19`, `EvaluationRosterScreen.tsx:119`, `invitation/PlayerInvitationCard.tsx:77` | recon §5d component defaults; screens not in SCOPE |
| `lib/eventColors.ts:17` | a comment |

---

## 5. What a device pass has to look at

Nothing below has been seen running.

1. List card: leaf, 5pt strip and 2pt frame all the team's colour; grey type
   chip reads the right type; team name ellipsizes instead of clipping at 375pt.
2. Day: the 7-day strip's dots match the days that have events; tapping a strip
   day swaps the cards; the cards are the same cards as List (RSVP pill answers
   from Day too).
3. Week: seven day rows; a pill's time, title and team all fit on one line; "—"
   on empty days; today's row tinted.
4. Month: dots per day capped at 3 + "+n"; tapping a day fills the panel under
   the grid; tapping a trailing day follows the month and stays selected.
5. Tab order reads List · Day · Week · Month and each tab is a quarter wide.
6. Team Settings (Roster ⚙️) and Team Detail: one read-only swatch, the caption,
   and **no way to change the colour**.
7. Two teams with no `teams.color` row value (if any remain) get different,
   stable colours — same colour on the calendar, the legend and the roster.

---

# Fix round A — after Lu's device pass (2026-10-26)

Status: **BUILT, static proof only. Device pending.**
Rulings R-H (card hierarchy), R-I (pill priority), R-J (detail = list colour
language). No schema, migration, dependency, env, auth/RLS or DB access.

## What changed

| File | Change |
|---|---|
| `src/components/calendar/EventTypeChip.tsx` **(new)** | The grey type chip, extracted. Two variants: `card` (list + detail) and `pill`. Also exports `isTitleRedundant(title, type)` — the R-H "is the title just the chip's label?" test, case- and space-insensitive, so the rule lives in one place for all three surfaces. |
| `src/screens/CalendarScreen.tsx` | R-H list card: **team name is the headline** — 17pt/800 against the title's 14pt, `numberOfLines={2}`, and **no longer hidden outside All Teams**. Under it: the chip, then the title only when it is not the type label. Local `typeChip`/`typeChipText` styles replaced by the shared component; `eventTitleCancelled` promoted from an inline style to a key. |
| `src/components/calendar/EventPill.tsx` | R-I: team name `flexShrink: 0` (never shortened), title `flexShrink: 1` + ellipsis, time fixed; the bare type glyph became `<EventTypeChip variant="pill" />`; redundant titles dropped. The pill now sets `overflow: 'hidden'` so an extreme team name is clipped by the pill rather than spilling across the day's row. |
| `src/screens/EventDetailScreen.tsx` | R-J: leaf, 5pt strip and 2pt frame all `resolveTeamColor` — one `teamColor` const, seeded from `event.team` and falling back to `{ id: event.team_id }` for the first frame when a caller navigates without the embed. The tinted type badge became `<EventTypeChip />`. `eventAccent`, `getEventTypeConfig`, `typeConfig` and the `typeBadge`/`typeBadgeText` styles are gone. Team name got `numberOfLines={2}`. |
| `src/components/calendar/DayView.tsx` | **Untouched** — it already renders the list card itself, handed down as `renderEventCard`, so R-H/R-I reached it for free. |

## Judgment calls

1. **The team name now shows on every list card**, not just in All Teams. R-H
   makes it the headline; a headline that disappears when the calendar is
   filtered to one team is not a hierarchy. It is also what the Day view needs,
   since it renders the same card.
2. **A cancelled event always keeps its title**, even when the title equals the
   type label. The strike-through on the title is the only cancellation cue a
   list card or a pill carries — hiding the title would have hidden the
   cancellation. Same rule in both surfaces.
3. **R-I's "never truncates" is honoured literally** on pills: the team name
   does not shrink, the title gives way first. The cost is that a very long
   team name on a narrow week row leaves the title a few points before it
   ellipsizes. `overflow: 'hidden'` is what bounds the pathological case.
4. **The detail card's title/team SIZES were left alone.** R-J asked for the
   colour language and the chip; R-H's hierarchy was written for the list card
   and the pills. The detail header still leads with the 20pt title and puts
   the 14pt team name under it (now 2 lines). **NEEDS LU:** say the word and the
   detail header inverts to match the list card.
5. **The Attendance tab renders the same `renderEventCard`**, by F1's design, so
   its copy of the card is team-coloured too. Nothing else on that tab was
   touched — its rows, avatars, ResponsesBar, Remind and maps are untouched,
   and `EventDetailScreen.tsx:1548` (the attendance avatar's `|| '#5B7BB5'`)
   is still the carve-out part 1 recorded.
6. `src/lib/eventColors.ts` now has exactly ONE consumer left: `EVENT_ACCENT_PAST`
   in CalendarScreen, for greying a past event. `eventAccent`/`eventAccentFor`
   and the `#3B82F6` practice stand-in are no longer read anywhere.

## Checks (static only)

```
npx tsc --noEmit | grep -c "error TS"               → 5  (= baseline, 0 new, all in components/games/)
eslint <4 changed/new files>                         → 0 errors (119 warnings, pre-existing patterns)
npx expo export --platform ios                       → "Exported: dist", exit 0
grep -rn "EventTypeChip" src | wc -l                 → 11 (definition + 3 uses + imports/comments)
team-name numberOfLines                              → CalendarScreen:546 = 2 · EventDetailScreen:1240 = 2 · EventPill:82 = 1
grep -rn "#3B82F6\|#2563EB\|#60A5FA" EventDetailScreen → 0
```

## Device pass for this round

1. A practice titled "Practice": card shows the team name, then `🏃 Practice`
   and **no** title; time and place unchanged.
2. A game titled "vs Rapids": chip `⚽ Game` **and** the title, on one line.
3. A long team name: wraps to two lines on the card, whole; nothing clipped.
4. Week/Month/Day pills: the team name is never cut; a long event title
   ellipsizes before it; the time never moves.
5. Tap a card → the detail leaf, strip and frame are the SAME colour as the
   card tapped, and the type chip is the same grey chip.
6. A cancelled event: the title is still there, struck through, on card and pill.

---

# Fix round B — after Lu's device pass (2026-10-26)

Status: **BUILT, static proof only. Device pending.**
Rulings R-H′ (detail header hierarchy), R-K (opponent "vs"), R-L (arrival line),
R-M (team colour in chat). No schema, migration, dependency, env, auth/RLS or
DB access. Part 1 + round A are commit `f327f63`; ledger rows for both are
appended at the end of `docs/ledger.md`.

## R-K first: where the opponent actually lives

**It is a real column.** `CalendarEvent.opponent: string | null`
(`src/types/index.ts:205`) on `cal_events`. Nothing was invented, and no other
field is read.

Two facts about it decide the whole rule:

1. **It is written for `game` and `scrimmage` ONLY.** Both forms gate on
   `isGameOrScrimmage` (`CreateEventModal.tsx:412`, `:476`;
   `EditEventModal.tsx:147`, `:191`) and write `opponent: null` for every other
   type. **A TOURNAMENT therefore has no opponent in the column**, even though
   R-K lists it — its only route is a title that starts with "vs".
2. **The same forms also store the opponent AS THE TITLE** for those two types:
   `const finalTitle = isGameOrScrimmage ? opponent : title`
   (`CreateEventModal.tsx:425`, `EditEventModal.tsx:151`/`:179`). So a game's
   title IS its opponent string, usually with no "vs" on it.

Hence the implementation in `EventTypeChip.tsx`: `eventOpponent()` takes the
column when present, else a "vs"/"vs."-prefixed title, and **strips a leading
"vs" from either** so `VsOpponent` cannot render "vs vs Rapids".
`eventTitleBits()` then drops a title that IS the opponent — which is the normal
case for a game — so one game renders `⚽ Game  vs Rapids`, not
`⚽ Game  vs Rapids  Rapids`.

## What changed

| File | Change |
|---|---|
| `src/components/calendar/EventTypeChip.tsx` | Gained `eventOpponent()`, `eventTitleBits()` (the one shared "what goes on the line under the headline" decision) and `VsOpponent` — the muted "vs": lowercase, letter-spaced 1.2, in the chip's own grey at **70% alpha** rather than `opacity` on a nested `<Text>`, which RN does not inherit reliably across a Text tree. Two variants, `card` and `pill`. |
| `src/screens/CalendarScreen.tsx` | R-K on the list card (chip · "vs X" · title, each only when it adds something) and **R-L**: the time window is one line and `Arrive 4:45 PM` is its own line beneath it. The inline `· arrive 4:45` run is gone, and the time is now spelled with its meridiem (`h:mm a`). |
| `src/components/calendar/EventPill.tsx` | R-K in the pill (`vs` variant), between the time and the team name. R-I's order is unchanged: time and team never shrink, the title ellipsizes first, and it is now also dropped when it only repeats the opponent. |
| `src/screens/EventDetailScreen.tsx` | **R-H′**: the header reads in the list card's order — team name as the 20pt/800 headline (`numberOfLines={2}`, dot on the first line), then "vs X", then the title at 15pt only when it earns it. Team name and title have traded sizes (it was a 20pt title over a 14pt grey team line, which for a game put the bare opponent string on top). |
| `src/screens/ChatScreen.tsx` *(chat list)* | **R-M(a)**: `getChannelColor`'s two team arms replaced by `resolveTeamColor(team ?? { id: team_id })` — this is the recon's chat read site §1/§5b, and it retires the hardcoded `#5B7BB5`. The card's 4pt left bar already existed; what changed is the colour a team channel feeds it. A **team dot** now sits before the name on team cards (`isTeamChannel = !!(team_id \|\| team)`). DM, group-DM, club/announcement and name-based arms are **untouched**. |
| `src/screens/TeamChatRoomScreen.tsx` *(chat room header)* | **R-M(b)**: the team dot before the header title and a **2pt accent line** in the team colour directly under the header. `teams.color` was added to the embed this screen **already** makes for the club crest (one extra column, no new query, no new round trip) and `teamAccent` is null until that read lands, so the header never flashes a guessed colour. A DM, a club chat and a group chat have no `team_id`, so none of them grows either element. |

## Judgment calls

1. **R-L on the detail screen: no change was needed, and none was made.** The
   detail already prints `Arrive 4:45 PM` as its own `<Text>` with the start/end
   window beneath it, untruncated (`EventDetailScreen.tsx:1337`). What differs
   from R-L's wording is the ORDER: the detail leads with Arrive, by the earlier
   F1 ruling ("arrival is the number that gets people there on time, so it
   leads"). Inverting it would undo a device-verified choice to satisfy a
   sentence aimed at the list card's truncation. **NEEDS LU:** say so and the
   detail flips to window-then-Arrive.
2. **Tournaments get a "vs" line only from a "vs"-prefixed title**, because the
   forms never write `opponent` for them (see above). Not a gap in this code —
   a gap in what the create form stores. Fixing it properly means letting the
   create/edit form write `opponent` for `tournament`, which is the FORBIDDEN
   create-event form.
3. **The detail screen's NAV BAR still shows the raw `event.title`**
   (`headerTitle`, `:1017`), so for a game it reads "Rapids". That is the
   screen's title bar, not the header card R-H′ names, and it was left alone.
4. **R-M keyed team channels on `team_id`, not on `channel_type === 'team'`.**
   A team's coach-lounge or staff thread hangs off a team and is one of its
   channels; `team_id` is also the only test the list has for a row whose embed
   did not come back. Consequence: such a channel now wears the team's colour
   where it used to get `#7B6BAD` from the name-based arm. DMs, club and
   announcement channels have no `team_id` and are untouched, as R-M requires.
5. **Cancelled events still always show their title**, from round A, and now the
   "vs" line gives way instead of repeating it.

## Checks (static only)

```
npx tsc --noEmit | grep -c "error TS"            → 5  (= baseline, 0 new, all in components/games/)
eslint <6 changed files>                          → 0 errors (245 warnings, pre-existing classes)
npx expo export --platform ios                    → "Exported: dist", exit 0
grep -rn "arrive" CalendarScreen + EventDetail    → no inline "· arrive" form left (3 hits: 2 comments, 1 const)
grep -rln "resolveTeamColor" chat screens          → 2 files (ChatScreen.tsx, TeamChatRoomScreen.tsx)
tail -3 docs/ledger.md                             → the two appended rows
```

## Device pass for this round

1. A game: card reads team name, then `⚽ Game  vs Rapids` — **no** second
   "Rapids" after it. Same on the pill and on the detail header.
2. A tournament: chip `🏆 Tournament`; a "vs" line ONLY if its title starts
   with "vs" (expected: no line — see judgment call 2).
3. An event with an arrival time: the window on one line, `Arrive 4:45 PM`
   on the next, nothing clipped at 375pt.
4. Detail header: team name big on top, dot on the first line of a name that
   wraps, "vs X" under it, no stray bare title.
5. Chat list: a TEAM card's left bar and its new dot are the SAME colour as
   that team's calendar cards. A DM, a club chat and an announcement channel
   look exactly as before — no dot, no colour change.
6. Chat room: open a team chat → dot before the title and a 2pt line under the
   header in the team's colour. Open a DM → neither. Bubbles, composer and
   sending unchanged.

---

# Polish round 1 — event form + palette v2 (2026-10-26)

Status: **BUILT, static proof only. Nothing seen on a device or simulator.**
Rulings R-N … R-R, plus the palette resync. No schema, migration, dependency,
env, auth/RLS or DB access was touched.

## Files changed (5 source + 2 docs)

| File | Change |
|---|---|
| `src/constants/teamColors.ts` | `TEAM_COLOR_PALETTE` → the DB's **32** colours, in trigger order, commented in three groups (boys 1–16, girls 17–28, coed 29–32). The header's "24-hex palette (migration `20261026120913`)" now names `20261026141431` as the source of truth and says the old one was superseded. Nothing else in the file moved: `resolveTeamColor` still hashes the team id and still modulos by the array length, which is now 32. |
| `src/components/common/DateTimeSheet.tsx` | **R-N.** New optional prop `showWeekdayInTitle`. When set on a `mode="date"` sheet the iOS header reads `` `${label} · ${weekday}` `` — "Date · Thursday" — computed from `draft`, the same state the wheel writes, so it tracks the spinner with no second piece of state. |
| `src/components/calendar/CreateEventModal.tsx` | **R-N** flag on the Date row's sheet. **R-P** venue row: `VENUE_ICONS` lost its colour column (away was `#EF4444`), selected = `colors.accentDim` fill + white icon and label, unselected = card surface + muted. **R-R** `arrivalHint()` + the `subHint` line. R-N's date row and R-O's time rows were **already compliant** — this form has had `formatDateDisplay` / `formatTimeDisplay` since the sheet rewrite. |
| `src/components/calendar/EditEventModal.tsx` | All five rulings. **R-O** the single `formatTime` split in two (`formatTimeForPayload` for the three payload fields, `formatTimeDisplay` for the four rows and the section summary) — this form was the one showing "18:00". **R-N** `formatDateDisplay` replaces two `toLocaleDateString()` calls, plus the sheet flag. **R-Q** the horizontal `ScrollView` is a `View`, chips are `flex: 1` with `gap: 8`, padding 16→4 and label 12→11pt, icon kept at 22pt. **R-P** selected chip and selected venue are brand purple + white label; `type.color` and the `#22c55e`/`#ef4444`/`#6b7280` venue fills are no longer read. **R-R** the same hint. |
| `src/components/calendar/EventTypeSheet.tsx` | **R-P.** The icon map lost its colour column (`#F97316` scrimmage, `#06B6D4` game, `#10B981` practice, `#3B82F6` club). Every glyph is brand purple on a 13% purple tile; the glyph is what distinguishes a row. |
| `docs/ledger.md` | Fix round B → `VERIFIED-DEVICE`, commit `dd9060f`, Lu's phone 2026-10-26, 5/5 on Lu's word. One new row for this prompt, `BUILT`. |

## Judgment calls

1. **"Create + edit share the form" is not true in this repo.** They are two
   independent components — `CreateEventModal.tsx` (1397 lines) and
   `EditEventModal.tsx` (~930) — that duplicate every helper they have in
   common. Each ruling was therefore applied twice. Most of the work landed in
   the **edit** form, which is where the 24-hour rows, the scrolling chip strip
   and the green/red venue fills all were; the create form had already been
   modernised by the sheet rewrite and needed only R-P and R-R. `arrivalHint()`
   is consequently a **deliberate copy** in both files: a shared util would be
   a new file, and SCOPE named the files this task may touch.
2. **`showWeekdayInTitle` is opt-in, not automatic for every date sheet.**
   `DateTimeSheet` has a third host, `CreatePollModal`, which FORBIDDEN put out
   of bounds. Making the weekday automatic would have changed that form's
   header without touching its file. Side effect of this change on the poll
   form: **nothing**.
3. **`club_event` is off the edit form's chip row** so R-Q's "four chips" is
   literally four. It is the one type nobody may create — `EventTypeSheet`
   holds it back for the Club Events phase — so the edit form offering it was
   already inconsistent with the create flow. A row that already **is** a
   `club_event` still gets its chip (five chips, tighter than the ruling), the
   alternative being a chip row with nothing selected.
4. **"Other Event" is displayed as "Other"** on that row, per R-Q's own
   wording ("no clipped 'Other'"). The value and the label in `EVENT_TYPES`
   are untouched — this is a display-only short label, local to the form.
5. **Red survives on validation only, and green on the Save/Create action.**
   R-P's literal clause is "no amber/orange/red fills or borders anywhere in
   this form", which would also take the `#ef4444` error border and error text.
   Those are the form's only validation cue, so they were kept and are flagged
   for Lu rather than removed silently. `#22c55e` likewise stays on the header
   Save/Create text and the Uncancel button: green is not in R-P's prohibition
   list and neither control is a chip. **NEEDS LU** if the ruling was meant
   literally.

## R-Q arithmetic (computed, not measured)

At 375pt: `scrollContent` padding 16×2 → 343 available; `gap: 8` ×3 → 24; each
chip `(343 − 24) / 4` = **79.75pt**, inner width 67.75pt after 4pt padding and
2pt borders. Longest label is "Scrimmage" (9 chars at 11pt/600 ≈ 55pt) —
**INFERRED**, from character-width estimation, not from a rendered measurement.
The emoji stays 22pt, per the ruling's order of sacrifice.

## What a device pass has to look at

1. Date row reads "Thu, Oct 29, 2026" in **both** forms.
2. Open the date sheet and spin the wheel: the header reads "Date · Thursday"
   and the weekday changes with the spinner, before Done is pressed.
3. All four time rows in **both** forms read like "6:00 PM". Save an edit and
   confirm the event's time is unchanged (the payload is still 24-hour).
4. Arrival hint: "45 min before start" on a game, "10 min before start" on a
   practice, "same as start" when arrival is dragged onto start, and gone (with
   the red line in its place) when arrival is dragged past start.
5. Edit form at 375pt: four chips — 🏆 Game, ⚽ Scrimmage, 🏃 Practice,
   📅 Other — all fully visible, no sideways scroll, no clipping.
6. Selected chip and selected venue are purple with a white label; unselected
   are the neutral card surface. No orange, amber or red anywhere but the
   validation line.
7. The New Event sheet's five rows all read in purple.
8. Android: the native date/time dialog still opens and dismissing it still
   clears the row's chevron.

---

# Polish round 1b (2026-10-26)

Status: **BUILT, static proof only. Nothing seen on a device or simulator.**
Three items: R-S sheet dismissal, R-R's third state, and the helper lift.
No schema, migration, dependency, env, auth/RLS or DB access was touched.

## 1. R-S — what the dismissal paths did, and what they do now

**Audited first, as asked.** `src/components/common/DateTimeSheet.tsx`, before
this change:

| Path | Handler | Verdict |
|---|---|---|
| Done | `onPress={() => onDone(draft)}` | correct — commit + close |
| Cancel button | `onPress={onCancel}` at **:147** | correct |
| Backdrop tap | `onPress={onCancel}` at **:139** | **already exactly Cancel.** No silent commit, and none was possible: the wheel writes a local `draft` and only `onDone` hands it to the host |
| Swipe down | **none** | **the path did not exist.** The iOS branch is a plain absolutely-positioned `View` — no `<Modal>`, no `PanResponder`, no bottom-sheet library — so a downward drag landed on nothing. Not a silent commit; not a dismissal either |
| Android dismiss | `event.type === 'dismissed'` → `onCancel()` | correct |

Fixed:

- **Swipe down → Cancel.** A `PanResponder` on a new grab area (drag handle +
  header row), driving an `Animated.Value` on the sheet's `translateY`.
  Release past **80pt** or a flick over **0.6** velocity calls the cancel
  handler; anything shorter springs back; a terminated gesture springs back.
  Handler at **`src/components/common/DateTimeSheet.tsx:153`**
  (`onPanResponderRelease` → `handleCancel()` at **:156**).
- **One cancel, not four.** New `handleCancel` at **:136** — `setDraft(value)`,
  reset the drag, then `onCancel()`. The Cancel button (**:235**), the backdrop
  (**:218**), the swipe (**:156**) and the Android dismiss (**:196**) all route
  through it. The explicit `setDraft(value)` is belt-and-braces today, since
  every host unmounts this component rather than toggling `visible`, but it
  makes "Cancel restores the previous value" true *inside this file* rather
  than true only because of how the callers happen to mount it.

Judgment call: the responder is mounted on the **grab area only**, never the
sheet as a whole, because the spinner underneath needs its own vertical drags.
It claims the touch on **move** (`dy > 6`, and more vertical than horizontal),
not on start, so taps on Cancel and Done still reach the buttons.

## 2. R-R — the third state

`arrivalHint` used to return `null` when arrival sat after start, which meant
the one state that needs explaining was the one state with no explanation until
the form was submitted. It now returns a value for every input:

| start − arrival | text | tone |
|---|---|---|
| > 0 | `"45 min before start"` | muted |
| 0 | `"same as start"` | muted |
| < 0 | `"after start — check this"` | error |

`tone` is a semantic token, not a hex — the util is shared and knows neither
form's palette. Each form maps `'error'` onto `#ef4444`, the colour its own
`errorText` already uses, via a new `subHintError` style.

Note: after a **failed submit** with arrival after start, both this live cue and
the validation line ("Arrival must be before start time") show at once. That is
intended — the hint is live and explains the row, the error is the verdict on
the submit — but it is two red lines, so it is flagged here for Lu.

## 3. The helper lift

New **`src/utils/eventFormFormat.ts`**: `formatTimeDisplay`,
`formatDateDisplay`, `arrivalHint`, plus the `ArrivalHint` / `ArrivalHintTone`
types. Both forms import all three and define none. No behaviour change beyond
item 2.

The payload serializers were deliberately **left local** to each form
(`formatDateForPayload` / `formatDate`, `formatTimeForPayload`): they produce
`YYYY-MM-DD` and 24-hour strings for the `event_date` / `start_time` /
`arrival_time` / `end_time` columns, and putting them beside the display
formatters in a shared file is how a 24-hour string ends up in a row and a
12-hour string ends up in the database.

## What a device pass has to look at

1. Open the date sheet, spin the wheel, **tap the backdrop** — the row keeps its
   old value.
2. Same, but **swipe the sheet down** — same outcome, and the sheet follows the
   finger on the way down.
3. Swipe down only a little and let go — the sheet springs back and the draft
   is still where the wheel left it.
4. Drag on the **spinner itself** — the wheel turns and the sheet does not move.
5. Tap Cancel, then Done, on the same sheet — both still work (the responder
   must not be swallowing taps).
6. Arrival hint reads all three states; drag arrival past start and the line
   turns red before any submit.
7. Android: the native dialog still opens, and dismissing it still clears the
   row's chevron.

---

# Polish round 1c — R-T, the merged "Starts" row (2026-10-26)

Status: **BUILT, static proof only. Nothing seen on a device or simulator.**
No schema, migration, dependency, env, auth/RLS or DB access was touched.
The poll form was not opened: `'datetime'` is opt-in, exactly as
`showWeekdayInTitle` is.

## Blocked check, run first — NOT blocked

`@react-native-community/datetimepicker` **8.6.0**, and
`node_modules/@react-native-community/datetimepicker/src/index.d.ts:4-5`:

```
type IOSMode     = 'date' | 'time' | 'datetime' | 'countdown';
type AndroidMode = 'date' | 'time';
```

iOS has the combined wheel. **Android does not** — so R-T's sequential
date-then-time dialogs are not a nicety, they are the only Android path, and
the component owns that split rather than its hosts.

## What changed

| File | Change |
|---|---|
| `src/utils/eventFormFormat.ts` | `formatStartsDisplay(date, time)` → `"Wed, Oct 28 · 6:00 PM"` — **no year**, deliberately: the row is a glance, and the section summary above it still carries `formatDateDisplay` with the year. Also `withDateOf(date, time)`, the date-parts-of-one, clock-of-the-other helper both forms needed. |
| `src/components/common/DateTimeSheet.tsx` | `DateTimeSheetMode` gains `'datetime'`. iOS passes it straight to the spinner. **Android** gets a new branch above the single-step one: two dialogs in sequence, `key={step}` to force a fresh instance (flipping `mode` on a live instance is not a reliable way to open the second dialog), the first dialog's answer parked in `draft` and **nothing** handed to the host until the second settles. A dismiss at either step calls `handleCancel`. `androidStep` resets on open and on cancel. |
| `src/components/calendar/CreateEventModal.tsx` | Row merged; `SheetField` `'start'` → `'starts'`; new `commitStarts`; `startOfToday()` replaces `new Date()` as the date floor. |
| `src/components/calendar/EditEventModal.tsx` | Same merge. Starts' Done sets the day and the start time and re-dates arrival/end — **not** a cascade; see below. |

## Where the cascade fires for Starts

**`src/components/calendar/CreateEventModal.tsx:370`** — `commitStarts`, which
calls `setEventDate(selected)` and then `commitStartTime(selected)` **once**.
Because `selected` comes off the combined wheel it carries the day *and* the
time, so the per-type offset helpers (`getDefaultArrivalTime` /
`getDefaultEndTime`, both `new Date(selected)` ± minutes) land arrival and end
on the chosen day for free. That is R-T's "the date part must also move
arrival/end to the same date", satisfied without a second code path.

The **edit** form has no cascade and still has none (its own header comment has
said so since the sheet rewrite: re-deriving times on an event the team has
already been notified about is not a silent change to make). It honours the
same date clause with `withDateOf`, which moves arrival's and end's **calendar
day** and leaves the clock reading the user chose alone.

## Judgment calls

1. **All-day keeps a date-only row.** R-T is silent on all-day, and an all-day
   event has a day and no start time (`start_time: null` in the payload). A
   single merged row would have left it with no way to say which day it is on.
   So: All Day off → the `Starts` row and the combined wheel; All Day on → a
   `Date` row and the date-only sheet, with R-N's live weekday header. `'date'`
   therefore survives in `SheetField` in both forms.
2. **`minimumDate` is now midnight today, not `new Date()`.** On a date-only
   wheel those are the same thing. On a **combined** wheel, `new Date()` is also
   a *time* floor — it would refuse 4:00 PM today at 6:00 PM, which this form
   has always allowed and which its own validation still allows (the submit
   check compares both dates at midnight: "Date cannot be in the past"). The
   edit form still passes no floor at all, as before — past events are
   legitimately edited.
3. **No `showWeekdayInTitle` on the Starts sheet.** The weekday is in the
   wheel's own left-hand column, which is the whole point of R-T; spelling it
   out in the header too would say it twice. The sheet title is plain `"Starts"`.
4. **The payload was not touched.** `event_date` (`YYYY-MM-DD`) and
   `start_time` (24-hour) are still written separately from two pieces of
   state. The merge is a UI shape; `withDateOf` only assembles the one Date the
   wheel needs.

## FOUND — a contradiction inside R-T, resolved toward today's behaviour

R-T says the cascade fires "**exactly as they fire today** on the Start time
sheet", and then glosses that as "*no re-stamp when the user already set
arrival/end*". Those two are not the same rule. Today's create-form cascade is
**unconditional** — `commitStartTime` re-derives arrival and end on every Done,
and the function's own comment says so deliberately ("the user can override
arrival or end afterwards, and re-committing start intentionally re-derives
them").

Taken the main clause over the parenthetical: **behaviour is unchanged**, and
the only thing 1c changed about the cascade is that it now fires once for a
day-and-time commit instead of needing two sheets. Adding dirty-tracking would
be a new behaviour with its own edge cases (does picking the same arrival time
count as "set"?), and it is not what "exactly as today" asks for. **NEEDS LU**
if the parenthetical was the intent.

## What a device pass has to look at

1. iOS, create form: the row reads `Starts` / "Wed, Oct 28 · 6:00 PM"; tapping
   it opens ONE wheel with the day in the left column and 5-minute steps.
2. Done on that wheel: the row updates, and arrival and end move with it by the
   type's offsets (game −45/+90, practice −10/+75) **once** — not twice, and
   not to yesterday.
3. Cancel, backdrop and swipe-down on the Starts sheet: **both** the day and
   the time are left as they were (R-S).
4. Arrival and End rows still open time-only wheels, still read 12-hour, and
   the R-R hint still shows all three states.
5. Turn All Day on: the row becomes `Date`, opens the date-only wheel, and the
   header still reads "Date · Wednesday" live.
6. Save, then reopen in the edit form: the same day and time come back, and the
   event in the calendar did not move.
7. **Android:** tapping Starts shows the date dialog, then the time dialog;
   cancelling at either step leaves the row untouched; completing both commits
   once.
