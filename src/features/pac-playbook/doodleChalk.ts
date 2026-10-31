/**
 * The chalk edge, inlined per mark — the mobile half of § E2 Fix 3.
 *
 * On the web every doodle is filtered through `url(#pbkd-chalk)`: fractal
 * noise displacing each stroke so the lines crumble the way chalk does
 * instead of reading as vector art. That filter is defined ONCE, in a
 * separate `<svg class="pbkd-defs">` inside `DoodleMargins`
 * (`thrive-and-score`, `Doodles.tsx:64-81`), and applied by CSS
 * (`playbook.css:496-504`, `.pbk .pbkd-mark g{…filter:url(#pbkd-chalk)}`).
 *
 * Neither half travels to mobile. The art strings in the mirrored
 * `doodleArt.ts` carry no `filter` attribute at all (`grep -c filter` → 0),
 * there is no stylesheet, and — the decisive one — **`SvgXml` drops a
 * `url(#…)` reference that resolves in a DIFFERENT root**: each `<SvgXml>` is
 * its own native view tree, so a `<defs>` sitting in some other component
 * cannot be seen from here. M2 confirmed both ends of that on the simulator:
 * `heat.ts` puts its `<filter id="heatblur">` INSIDE the same `<svg>` and the
 * blur survives; the doodles' cross-root reference does not exist to begin
 * with, and the marks drew as plain strokes
 * (`docs/recon/playbook-mobile-m2-board.md`).
 *
 * So the filter is inlined into every mark: one `<defs>` per root, the same
 * four attributes and the same two primitives as the web's, and the mark's
 * root `<g>` carries the reference. That is the only way an `SvgXml` root can
 * hold a filter, and it is why this lives HERE and not in the mirror —
 * `doodleArt.ts` stays byte-identical to the web.
 *
 * ONE ID PER MARK. The web can share a single id because the whole page is
 * one document. Here the ids are made unique anyway (`pbkd-chalk-0`, `-1`, …)
 * because a screen draws up to three marks, each in its own root, and a
 * collision would be invisible in code and wrong on screen. Unique ids cost
 * nothing and cannot collide.
 *
 * Pure: a string in, a new string out, the input untouched. No DOM, no
 * imports, no side effects — the same contract as `withDoodleColors`, which
 * this composes with (colours first, then the edge, or either order: they
 * touch different attributes of the same `<g>`).
 *
 * ============================================================================
 * IT DOES NOT RENDER, AND THAT IS NOT THIS FILE'S FAULT. READ THIS BEFORE
 * "FIXING" ANYTHING HERE.  (M3, 2026-10-30 — PLAYBOOK-CHALK-EDGE-UNSUPPORTED)
 * ============================================================================
 *
 * The transform above is correct and proved: the `<defs>` lands inside the
 * mark's own root and the root `<g>` carries `filter="url(#pbkd-chalk-N)"`,
 * which is exactly what the web gets from its separate `<svg class="pbkd-defs">`
 * plus its CSS rule. The cross-root problem § E2 Fix 3 named IS solved.
 *
 * There is a SECOND blocker Fix 3 did not know about, and it is decisive:
 *
 *     react-native-svg@15.12.1 ships BOTH primitives as STUBS.
 *     node_modules/react-native-svg/lib/module/elements/filters/FeTurbulence.js
 *     and .../FeDisplacementMap.js are each four lines whose `render()` calls
 *     `warnUnimplementedFilter()` and returns `null`.
 *     `lib/util.js:16-18` names all fifteen unimplemented primitives.
 *
 * So the filter resolves to an empty one, the mark draws as the plain stroke,
 * and no amount of inlining changes that. It is a LIBRARY gap, not a mirror
 * gap and not an `SvgXml` gap — `feGaussianBlur` IS implemented, which is why
 * the heat field's blur has worked since M2.
 *
 * WHY THE CODE STAYS ANYWAY. It costs one regex and nothing at runtime; it is
 * the right half of the answer and the only half this repo controls; the
 * warning is `warnOnce`, so it is one dev-console line and never a per-frame
 * cost; and the day the two primitives land, or the day a different route is
 * chosen, this is already correct. Removing it would lose the finding.
 *
 * WHAT WAS DELIBERATELY NOT DONE. A hand-rolled chalk texture — jittering the
 * path data, a noise image, a second offset stroke — would give mobile an edge
 * the web does not have, out of a design the web owns. Web-first discipline
 * says that choice is not this room's to make. Options are in the M3 report.
 */

/** The web's own filter, attribute for attribute (`Doodles.tsx:67-81`). */
const FILTER = (id: string): string =>
  `<defs><filter id="${id}" x="-12%" y="-12%" width="124%" height="124%" ` +
  `color-interpolation-filters="sRGB">` +
  `<feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="n"/>` +
  `<feDisplacementMap in="SourceGraphic" in2="n" scale="1.2" ` +
  `xChannelSelector="R" yChannelSelector="G"/>` +
  `</filter></defs>`;

/**
 * Give one mark its own chalk-edge filter.
 *
 * `seq` makes the id unique within the screen. The `<defs>` is inserted right
 * after the `<svg …>` open tag and the `filter` attribute is added to the
 * first `<g …>` after it — the mark's root group, which is exactly the
 * element the web's CSS selector (`.pbkd-mark g`) matches, so every child
 * inherits the filtered rendering the same way.
 *
 * A string that does not look like a mark (no `<svg>`, or no root `<g>`) is
 * returned unchanged rather than half-patched.
 *
 * ORDER: run `withDoodleColors` FIRST. That mirrored function matches a BARE
 * `<g>` (`/(<svg\b[^>]*>)\s*<g>/`), which is what the art ships with; this one
 * matches a root `<g>` with or without attributes, so it works either side of
 * the colouring but the colouring does not work after it.
 */
export function withChalkEdge(svg: string, seq = 0): string {
  const id = `pbkd-chalk-${seq}`;
  let patched = false;
  const out = svg.replace(/(<svg\b[^>]*>)\s*(<g\b)([^>]*>)/, (_m, open: string, g: string, rest: string) => {
    patched = true;
    return `${open}${FILTER(id)}${g} filter="url(#${id})"${rest}`;
  });
  return patched ? out : svg;
}
