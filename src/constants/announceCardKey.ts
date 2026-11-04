/**
 * The shape a Playbook CARD KEY is allowed to have when it arrives from
 * outside the reader — a push payload, or an announcement card's button.
 *
 * WHY IT MOVED HERE (2026-11-03, CLUB-ANNOUNCE-V1-MOBILE). It was a file-local
 * const in `src/navigation/AppNavigator.tsx`, written for ruling B
 * (PLAYBOOK-ANNOUNCE-PUSH, Lu 2026-11-03 01:19) when a push tap was the only
 * way a key could reach the reader from outside. The announcement cards add a
 * second way in — a `playbook_card` button, whose key is typed by a staff
 * member at compose time and read back by the detail screen — so the pattern
 * now has three callers in two layers. It is a constant, not navigation code,
 * so it sits with the app's other constants exactly as
 * `playbookLaunch.ts` does, and this module imports NOTHING so a boot path can
 * carry it without pulling anything behind it.
 *
 * WHY A PATTERN AND NOT A LOOKUP. The navigator and the compose screen hold no
 * book: the content is fetched inside the reader, under RLS, so only the reader
 * knows which cards exist and which THIS viewer may read. It already answers
 * that question — `PlaybookScreen.tsx:358-362` opens the card only
 * `if (cardParam && cardsByKey.has(cardParam))` and otherwise leaves the reader
 * on the cover. So "the card exists and the viewer can read it" is enforced
 * there, against the book the viewer was actually served, and duplicating it
 * here would be a second source of truth that could disagree with the first.
 *
 * What is left for this layer is the part the reader should never have to
 * defend against: a key that is not key-SHAPED. Anything with a path
 * separator, whitespace, a dot, a quote or a non-ASCII character is rejected
 * and the tap opens the cover.
 *
 * THE REAL KEYS ARE SHORTER THAN THIS. Every published key is
 * `[A-Z0-9]{2,6}` — F0..F5 and F7..F11 (there is no F6), P1..P19, MV0..MV2,
 * GF1..GF7, PL1..PL4, M1..M4, SET, HUNT, HOLD, STORM. The bound is 16 with
 * `_` and `-` allowed purely as headroom, so a future chapter cannot be
 * locked out by this line.
 *
 * CORRECTED 2026-11-04 (RELEASE-1.0.20-FIXES item 11). This line read "All 69
 * in the frozen book" and listed Foundations as `F0..F5`, which stopped being
 * true the day web content **batch 2** was applied to prod, 2026-11-03: it
 * inserted FIVE more Foundations cards, `F7`–`F11` (sorts 8–12, published),
 * which makes 74 and not 69. Source for the five and their keys is the apply
 * SQL, `thrive-and-score/supabase/content/20261102224500_playbook_content_b_apply.sql:223-232`
 * (gate P03 `:295-299`), recorded in `docs/recon/test-plan-1.0.20-nov03.md`
 * §0.2 and SEEN on screen in Round 1 — the card badge read "F10 · Card 5 of
 * 6" (`docs/recon/test-results-1.0.20-round1-nov04.md` §2d). The 74 is
 * arithmetic over that SQL, not a DB count: no database was queried. The
 * PATTERN never needed changing — `F7` always matched, and this is a comment
 * that had gone stale, not a gate that was wrong.
 *
 * IMPORTED BY: `src/navigation/AppNavigator.tsx` (the push branch),
 * `src/lib/clubAnnouncementCards.ts` (the action allow-list, which the compose
 * screen and the detail screen both go through).
 */
export const ANNOUNCE_CARD_KEY = /^[A-Za-z0-9_-]{1,16}$/;

/** Is this value a usable card key? The one test, for every caller. */
export function isAnnounceCardKey(value: unknown): value is string {
  return typeof value === 'string' && ANNOUNCE_CARD_KEY.test(value);
}
