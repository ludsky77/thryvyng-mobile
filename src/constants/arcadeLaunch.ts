/**
 * The ARCADE's launch switch — ruling R-04, Lu 2026-11-04.
 *
 * THE RULING: the old brain games are HIDDEN in 1.0.20 and a "coming soon"
 * tile stands in their place. A new set of arcade games replaces them in a
 * later build. Nothing is deleted — every game file stays on disk and every
 * row stays in the database — because this is a VISIBILITY change, not a
 * removal, and the switch is what makes those two different things.
 *
 * RELEASE PROCEDURE, both directions, one line:
 *   * `LEGACY_GAMES_VISIBLE = true`  -> the old games are reachable again,
 *     exactly as they were before R-04, with no other edit;
 *   * `LEGACY_GAMES_VISIBLE = false` -> every entry point shows the arcade
 *     tile and every route to an old game screen shows the Alert.
 *
 * WHY A SWITCH AND NOT A DELETE. Lu's ruling is explicit that the games come
 * BACK, rebuilt. Deleting 10,428 lines across 13 files to put them back later
 * is a worse trade than one constant, and a delete is SACRED besides. The
 * switch also means the hide is testable in both positions from one build.
 *
 * SAME PATTERN AS `playbookLaunch.ts`, deliberately, and for the same reasons
 * that file argues at length: a plain constant plus a derived gate, in
 * `src/constants/` rather than beside the feature, so a dashboard or a
 * navigator can read it without importing anything of the feature it gates.
 *
 * THIS MODULE IMPORTS ONLY `react-native`, AND THAT IS THE CEILING. Every
 * reader is a boot path — both role dashboards and the navigator — so it has
 * to stay a leaf. `Alert` is the platform, not app code; nothing here reaches
 * `src/screens/`, `src/hooks/` or `supabase`, so importing it can never pull a
 * game screen into a dashboard's bundle.
 *
 * WHAT MOBILE DOES NOT GET, same caveat as the Playbook's switch: Metro does
 * NOT fold an imported constant across module boundaries, so `legacyGamesVisible`
 * is a RUNTIME read and the game screens are still bundle WEIGHT. They are not
 * REACHABLE — both routes' `import()` is lazy and, with the switch false,
 * nothing calls either one — but the bytes ship. The difference is weight, not
 * visibility.
 *
 * IMPORTED BY: `src/navigation/AppNavigator.tsx` (the `GamesHub` and
 * `GamePlay` routes), `src/components/dashboards/PlayerDashboard.tsx` and
 * `src/components/dashboards/CoachDashboard.tsx` (the two tiles).
 */
import { Alert } from 'react-native';

/** R-04: the old brain games are hidden in 1.0.20. */
export const LEGACY_GAMES_VISIBLE = false;

/**
 * Every old-games entry point and both old-games ROUTES are gated on this.
 * False means no user of any role can reach any old game screen.
 */
export const legacyGamesVisible = LEGACY_GAMES_VISIBLE;

/* ------------------------------------------------------------ the stand-in */

/**
 * The tile's subtitle. The TITLE is not here because it needs the club's name
 * — it is `` `${clubShortName(clubName)} Arcade` `` at each call site, using
 * the one short-name rule in `src/lib/clubAnnouncements.ts` (R-01), so "PAC
 * Arcade" and "PAC Announcements" can never abbreviate the club two ways.
 */
export const ARCADE_TILE_SUBTITLE = 'New games coming soon';

/** The badge on the tile. One word short enough not to wrap at 1/3 width. */
export const ARCADE_TILE_BADGE = 'Coming soon';

export const ARCADE_COMING_SOON_TITLE = 'New games are on the way';
export const ARCADE_COMING_SOON_BODY =
  "We're building a brand-new set of soccer brain games. We'll let you know when they're ready.";

/**
 * The one Alert, for the tile tap AND for any route or deep link that still
 * aims at an old game screen. It lives here rather than in each caller so the
 * three entry points cannot word it three ways — the same reason
 * `RECORD_SESSION_MESSAGES` sits beside the steps it describes.
 *
 * `onDismiss` lets a ROUTE guard leave the screen when OK is tapped, while the
 * tile — which navigated nowhere — passes nothing and just closes the Alert.
 * `onDismiss` on the Alert itself is Android's back-button/outside-tap path;
 * it is harmless on iOS, where only the button can close this dialog.
 */
export function showArcadeComingSoon(onDismiss?: () => void): void {
  Alert.alert(
    ARCADE_COMING_SOON_TITLE,
    ARCADE_COMING_SOON_BODY,
    [{ text: 'OK', onPress: onDismiss }],
    onDismiss ? { onDismiss } : undefined
  );
}
