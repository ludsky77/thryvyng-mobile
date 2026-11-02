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
 * FLIPPED TO `true` 2026-11-01 — the book is released. The switch stays in
 * place as the single kill switch: back to `false` hides the route and all
 * three entry points again, with no other edit.
 *
 * MIRROR NOTE — this file is now SEMANTICALLY byte-for-byte the web's switch:
 * a plain constant and the derived gate, with no environment test on either
 * side. The `__DEV__` dev-only override that used to OR into the gate (the
 * mobile counterpart of the web's `import.meta.env.DEV`, which does not exist
 * in a Metro bundle) was REMOVED at the flip on 2026-11-01: with the book
 * live it bought nothing, and it was the file's only declared diff from the
 * web. There is no environment branch here any more.
 *
 * WHAT MOBILE DOES NOT GET, and it matters: Metro does NOT fold an imported
 * constant across module boundaries, so `playbookVisible` is a runtime read
 * here, not a compile-time constant the way Vite's `import.meta.env.DEV`
 * substitution makes the web's gates fold. While the switch was `false` that
 * meant the gated code was SKIPPED AT RUNTIME, not removed — nothing of the
 * Playbook was REACHABLE in a store build, because the route's `import()` is
 * lazy and nothing called it, but the gated markup was still bundle weight.
 * The difference was bundle weight, not visibility — see
 * `docs/recon/playbook-m4.md`. With the switch `true` the gates now pass and
 * the lazy `import()` runs on the first navigation to `Playbook`.
 *
 * This module imports nothing on purpose. Every entry point imports it from a
 * boot path (the dashboard, the course list, Club Hub), so it has to stay a
 * leaf: two constants, no feature code behind it.
 *
 * IMPORTED BY: `src/navigation/AppNavigator.tsx` (the route),
 * `src/components/dashboards/PlayerDashboard.tsx`, `src/screens/CoursesScreen.tsx`
 * and `src/screens/ClubHubScreen.tsx` (the three entry points).
 */
export const PLAYBOOK_LIVE = true;

/** Every Playbook entry point and the `Playbook` route are gated on this. */
export const playbookVisible = PLAYBOOK_LIVE;
