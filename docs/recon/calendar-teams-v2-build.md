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
