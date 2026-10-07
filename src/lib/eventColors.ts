/**
 * THE source of truth for the colour of an event on any surface: list card date
 * block and left edge, Day/Week/Month blocks and chips, type badges, and the
 * detail screen's date block.
 *
 * Before this existed, every view picked its own colour. The list card used an
 * event-type map, Day/Week/Month each used the TEAM colour, and the detail
 * screen used the team colour too -- so one game rendered green on the list and
 * blue everywhere else. Type badges took a third set of hues from EVENT_TYPES.
 *
 * Hues set by device review (C3):
 *   game + scrimmage  #0d9488  green/teal -- competitive play
 *   practice          #3B82F6  brighter blue, matching what the pre-C2 preview
 *                              date blocks showed. The exact hex those blocks
 *                              rendered for PAC teams was `teams.color`, a live
 *                              row value not readable from this repo, so this is
 *                              the agreed #3B82F6 fallback -- which is itself an
 *                              existing token (EVENT_TYPES `club_event`).
 *   anything else     #a855f7  neutral purple
 *   past (any type)   #4B5563  grey
 *
 * Note: EVENT_TYPES in src/types/index.ts still gives `scrimmage` its own
 * orange (#f97316) and `game` a cyan (#06B6D4). Those tokens are deliberately
 * NOT used for event surfaces any more -- grouping scrimmage with games was an
 * explicit instruction. EVENT_TYPES remains the source for labels and icons.
 *
 * TEAM colour is a different axis and is left alone: team dots, the team
 * legend, team swatches and player avatars still carry it, because they answer
 * "whose team" rather than "what kind of event".
 */

const EVENT_TYPE_ACCENT: Record<string, string> = {
  game: '#0d9488',
  scrimmage: '#0d9488',
  practice: '#3B82F6',
};

export const EVENT_ACCENT_DEFAULT = '#a855f7';
export const EVENT_ACCENT_PAST = '#4B5563';

/** Accent for an event type, ignoring past-ness. */
export function eventAccent(type: string | null | undefined): string {
  return EVENT_TYPE_ACCENT[type || ''] || EVENT_ACCENT_DEFAULT;
}

/**
 * Accent for an event, greyed when it has already happened. Every surface that
 * greys out past events should use this rather than branching on its own.
 */
export function eventAccentFor(
  type: string | null | undefined,
  past: boolean
): string {
  return past ? EVENT_ACCENT_PAST : eventAccent(type);
}
