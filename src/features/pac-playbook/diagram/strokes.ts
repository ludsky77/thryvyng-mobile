/**
 * DIAGRAM STROKES (D2, RELEASE-1.0.20-FIXES, 2026-11-04). Every stroke width
 * the diagram renderer draws, in viewBox units (a board is 100 units wide, so
 * on a 360px phone 1 unit is about 3.3px; on the 920px wide column about 9px).
 *
 * The one place line weight lives. renderDiagram.ts and geometry.ts head()
 * read from here and carry no width literals of their own, so the mobile
 * mirror copies this file byte for byte and the two apps draw the same lines.
 * Old values and where each is used: docs/recon/d2-strokes.md.
 *
 * Lines in the content carry their own `weight` (pass 0.8, run 0.7, emphasis
 * passes 1.2 / 1.4, F11 triangles 0.3–0.6), so the content is NOT thinned by
 * editing it: the renderer multiplies every line weight, stored or default,
 * by LINE_SCALE, then floors it at LINE_MIN so a ghost line stays visible.
 * Emphasis keeps its proportion to an ordinary pass.
 */

/** Pass / run / option / reference: drawn width = max(LINE_MIN, weight × LINE_SCALE). */
export const LINE_SCALE = 0.6;
export const LINE_MIN = 0.24;

/** The weight a line uses when its content gives none (before LINE_SCALE). */
export const LINE_DEFAULT = { pass: 0.8, run: 0.7, option: 0.7, reference: 0.5 } as const;

/** Dash patterns, unchanged from the prototype. */
export const DASH = { run: '2.6 2', reference: '1.4 2', ring: '2.6 2.2' } as const;

/**
 * Arrowhead length for a line of drawn width `w`: HEAD_BASE + w × HEAD_PER_W.
 * The half-width is HEAD_HALF of that. The shaft stops HEAD_TUCK of the way
 * into the head, so its round cap sits inside the triangle instead of
 * poking a blunt nub past the tip.
 */
export const HEAD_BASE = 1.5;
export const HEAD_PER_W = 1.25;
export const HEAD_HALF = 0.5;
export const HEAD_TUCK = 0.5;
export const headSize = (w: number): number => HEAD_BASE + w * HEAD_PER_W;

/** The drawn width of a pass / run / option / reference with stored weight `weight`. */
export const lineWidth = (weight: number): number => Math.max(LINE_MIN, weight * LINE_SCALE);

/** Field markings (all backdrops, futsal included). */
export const FIELD = {
  /** Pitch outline, halfway line, boxes, circles, futsal court. */
  line: 0.3,
  /** zoom-touchline: the touchline itself. */
  touchline: 0.36,
  /** The goal mouth, drawn in ink over the chalk. */
  goal: 0.9,
} as const;

/** Outlines on the marks that sit on top of the lines. */
export const MARK = {
  player: 0.5,
  ball: 0.35,
  waypoint: 0.35,
  ring: 0.45,
  badge: 0.5,
  box: 0.4,
  xmark: 0.6,
  cue: 0.4,
  pick: 0.5,
  target: 0.4,
  /** Builder selection: dashed ring round a mark, halo under a line (× the line width). */
  select: 0.5,
  selectHalo: 4,
} as const;

/**
 * Straight, axis-aligned field lines get this attribute: the browser snaps
 * them to whole device pixels instead of smearing a 1px line across two
 * half-lit rows. Never on arcs, circles or player lines, which need
 * anti-aliasing. (react-native-svg ignores the attribute; harmless there.)
 */
export const CRISP = 'shape-rendering="crispEdges"';

/** Every stroke ends round and joins round. */
export const ROUND = 'stroke-linecap="round" stroke-linejoin="round"';
