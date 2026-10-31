/**
 * The PAC Playbook's launch switch — the mobile half of the web's own
 * `src/features/pac-playbook/launch.ts` (`thrive-and-score`).
 *
 * WHY IT LIVES IN `src/constants/` AND NOT WITH THE FEATURE (moved
 * 2026-10-30). It used to be `src/features/pac-playbook/launch.ts`, and that
 * made it the one top-level `pac-playbook` import a navigator or boot file
 * carried — `grep -rn "pac-playbook" src/navigation` could not come back
 * clean, so the lazy boundary had to be argued rather than read off a grep.
 * The switch is a constant, not feature code, so it sits with the app's other
 * constants (`eventTypes.ts`, `teamColors.ts`) and the rule is now literal:
 * **nothing outside `src/features/pac-playbook/` imports anything inside it
 * except through `lazy()`/`import()`.** The web keeps its copy beside the
 * feature; the file's SEMANTICS are unchanged, so the mirror note below still
 * holds and the release procedure is still one line.
 *
 * Why it exists: the reader is BUILT and, from M4 on, routed. The route and
 * the three entry points must not appear in a store build before Lu has
 * released the book, so "the code ships" and "the Playbook is visible" are
 * two separate things, exactly as on the web.
 *
 * RELEASE PROCEDURE: flip `PLAYBOOK_LIVE` to `true`. Nothing else. On the web
 * that is one line plus a push; here it is one line plus a build.
 *
 * MIRROR NOTE — this file is NOT byte-identical to the web's, and cannot be:
 * the web reads `import.meta.env.DEV`, which does not exist in a Metro bundle.
 * `__DEV__` is its exact counterpart and the only declared diff. The switch's
 * SEMANTICS are the web's, line for line.
 *
 * WHAT MOBILE DOES NOT GET, and it matters: Vite replaces
 * `import.meta.env.DEV` with `false` in a production build, so the web's gates
 * fold to constants and the gated markup is DROPPED from the bundle. Metro
 * folds `__DEV__` too, but it does NOT fold an imported constant across module
 * boundaries, so `playbookVisible` is a runtime `false` here and the gated
 * code is SKIPPED AT RUNTIME, not removed. Nothing of the Playbook is
 * REACHABLE in a store build; the reader's own modules still never load,
 * because the route's `import()` is lazy and nothing calls it. The difference
 * is bundle weight, not visibility — see `docs/recon/playbook-m4.md`.
 *
 * This module imports nothing on purpose. Every entry point imports it from a
 * boot path (the dashboard, the course list, Club Hub), so it has to stay a
 * leaf: two constants, no feature code behind it.
 *
 * IMPORTED BY: `src/navigation/AppNavigator.tsx` (the route),
 * `src/components/dashboards/PlayerDashboard.tsx`, `src/screens/CoursesScreen.tsx`
 * and `src/screens/ClubHubScreen.tsx` (the three entry points).
 */
export const PLAYBOOK_LIVE = false;

/** Every Playbook entry point and the `Playbook` route are gated on this. */
export const playbookVisible = PLAYBOOK_LIVE || __DEV__;
