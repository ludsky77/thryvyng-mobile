/**
 * THE one source for how an event TYPE is shown: a label and an icon. Nothing
 * here carries a hue -- the type's chip is neutral grey on every surface, and
 * colour belongs to the TEAM (src/constants/teamColors.ts).
 *
 * It replaces three uncoordinated sources the calendar used to read
 * (docs/recon/calendar-teams-v2.md §2):
 *   1. `getEventTypeLabel` in CalendarScreen -- 10 types, SHOUTING CAPS, local.
 *   2. `getEventDisplayTitle` in DayView -- its own `event_type.toUpperCase()`.
 *   3. `EVENT_TYPES` / `getEventTypeConfig` in src/types/index.ts -- only 5 of
 *      the 10 types, so tournament/meeting/party/tryout/camp all resolved to
 *      'Other Event'.
 * ...and the THREE copies of `getEventIcon` in MonthView, WeekView and DayView,
 * which disagreed with each other (game was 🏆 in all three, practice was ⚽ in
 * two of them and 🏃 in none).
 *
 * The icon vocabulary is the four glyphs ruling R-A names -- 🏃 Practice,
 * ⚽ Game, 🏆 Tournament, 📅 Other -- so the ten known types share them by
 * family rather than inventing a glyph per type: competitive play is ⚽,
 * training is 🏃, a multi-day competition is 🏆, everything else is 📅. Each
 * type keeps its OWN label, so the chip still reads "Scrimmage", not "Game".
 *
 * NOTE: `EVENT_TYPES` in src/types/index.ts still drives the create/edit type
 * pickers and gives `game` a 🏆. Those surfaces were outside this task's SCOPE,
 * so the create sheet and this chip can disagree on the game glyph until
 * EVENT_TYPES is pointed at this file. Recorded in
 * docs/recon/calendar-teams-v2-build.md.
 */

export interface EventTypeMeta {
  /** Title case, for a chip or a line of text. Never SHOUTED. */
  label: string;
  icon: string;
}

/** What an unknown or missing type reads as. */
export const OTHER_EVENT_META: EventTypeMeta = { label: 'Other', icon: '📅' };

/** The 10 types the DB is known to hold. Keys are lower case. */
const EVENT_TYPE_META: Record<string, EventTypeMeta> = {
  practice: { label: 'Practice', icon: '🏃' },
  game: { label: 'Game', icon: '⚽' },
  scrimmage: { label: 'Scrimmage', icon: '⚽' },
  tournament: { label: 'Tournament', icon: '🏆' },
  camp: { label: 'Camp', icon: '🏃' },
  tryout: { label: 'Tryout', icon: '🏃' },
  meeting: { label: 'Meeting', icon: '📅' },
  party: { label: 'Party', icon: '📅' },
  other_event: { label: 'Other', icon: '📅' },
  club_event: { label: 'Club Event', icon: '📅' },
};

/** Label + icon for a type. Unknown, null and '' all resolve to Other. */
export function getEventTypeMeta(
  eventType: string | null | undefined
): EventTypeMeta {
  if (!eventType) return OTHER_EVENT_META;
  return EVENT_TYPE_META[eventType.toLowerCase()] || OTHER_EVENT_META;
}

/** The type's icon. The ONLY getEventIcon in the app. */
export function getEventIcon(eventType: string | null | undefined): string {
  return getEventTypeMeta(eventType).icon;
}

/** The type's label, title case. */
export function getEventTypeLabel(eventType: string | null | undefined): string {
  return getEventTypeMeta(eventType).label;
}
