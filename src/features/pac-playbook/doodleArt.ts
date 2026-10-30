/**
 * mirror to thryvyng-mobile (M1) — ONE declared diff: the strengthPreset
 * DEV-flag line (import.meta.env.DEV → __DEV__). Everything else byte-identical.
 * (2026-10-30)
 *
 * THE POOL — 13 marks, and the football anchor each one carries
 * (DOODLE-SOCCER-READ, M0 2026-10-30; the anchor is drawn first, behind):
 *
 *   STRIPS 220x62
 *   halfway     halfway line + centre circle
 *   dribble     penalty-box edge (with its D) under the cone gates
 *   wall        free-kick wall on its ground line
 *   switchplay  touchline + halfway line
 *   press       goal mouth (posts, crossbar) behind the player being pressed
 *   corner      corner arc + corner flag
 *   thirdman    touchline under the three
 *
 *   BLOCKS 150x170
 *   goal        netted goal, crossbar
 *   box         the eighteen, the six, the spot, the D
 *   centre      halfway line + centre circle
 *   shape       penalty-box lines (goal line, eighteen, six) behind the back line
 *   triangle    halfway line through, with the centre circle
 *   cones       penalty-box edge (with its D) under the ladder
 *
 * `withDoodleColors` (bottom of this file) is what lets the same 13 strings
 * draw on a phone, where there is no stylesheet to colour them.
 */

/**
 * The chalk sketches that live in the reader's empty zones — the art, the
 * per-page pick, and the strength preset. No React here; `Doodles.tsx` draws
 * what this file decides.
 *
 * Lu's verdict on the first cut (2026-10-29 16:07) was "I hardly see them":
 * the marks were half-clipped into the column edge at ~.13 opacity, so they
 * read as a rendering artefact rather than as part of the board. The brief
 * changed to: a coach's own sketches, left on the chalkboard — WHOLE marks,
 * clearly visible, in space that is empty by construction.
 *
 * TWO FAMILIES, because a zone's shape decides the art's shape:
 *
 *   STRIPS (220x62) go in the in-flow bands above the first block and below
 *   the last one. They are wide and shallow on purpose: a band is a row in a
 *   flex column, so every pixel of its height pushes the reading down. A
 *   strip costs ~54px and reads across the measure.
 *
 *   BLOCKS (150x170) were drawn in the dark margins either side of the column
 *   on wide screens. DOODLES-NO-MARGINS (Lu, 2026-10-30): marks live only
 *   INSIDE the content column, web and mobile, so the margins zone is 0 on
 *   every screen and the web no longer draws a block. The six stay in the
 *   pool for the mobile reader's in-column heading-side slot (recon § E7).
 *
 * WHY NOT AN ABSOLUTE OVERLAY OVER THE CONTENT: "never over text, diagrams,
 * buttons, chips, or a quiz tap board" cannot be promised by an overlay that
 * does not measure the content under it — a title wraps to two lines and the
 * mark is suddenly on top of it. In the flow, overlap is impossible by
 * construction; in the margin, there is nothing to overlap. Those are the
 * only two places a mark can be guaranteed safe, so those are the two the
 * layer uses.
 */

/** Wide and shallow, for the in-flow bands. viewBox 220 x 62. */
const STRIPS: Record<string, string> = {
  /* Halfway line, centre circle, two runs off it. */
  halfway: `<svg viewBox="0 0 220 62"><g><path d="M4 31 H216" stroke-width="1.4" opacity=".6"/><circle cx="110" cy="31" r="17" stroke-width="1.7"/><circle cx="110" cy="31" r="2.6" stroke-width="2"/><circle cx="40" cy="46" r="5.5" stroke-width="1.8"/><g class="ac"><path d="M46 42 C 64 33, 78 22, 94 16" stroke-width="1.8" stroke-dasharray="5 4"/><path d="M86 15 L96 15 L93 25" stroke-width="1.8"/></g><circle cx="182" cy="17" r="5.5" stroke-width="1.8"/><path d="M176 21 C 160 31, 148 39, 134 45" stroke-width="1.7"/><path d="M142 45 L132 47 L136 37" stroke-width="1.7"/></g></svg>`,

  /* The cone weave — dribble through the gates, along the edge of the box. */
  dribble: `<svg viewBox="0 0 220 62"><g><path d="M22 62 V57 H198 V62 M92 57 A 30 30 0 0 1 128 57" stroke-width="1.4" opacity=".5"/><path d="M30 47 L37 27 L44 47 Z" stroke-width="1.6"/><path d="M78 47 L85 27 L92 47 Z" stroke-width="1.6"/><path d="M126 47 L133 27 L140 47 Z" stroke-width="1.6"/><path d="M174 47 L181 27 L188 47 Z" stroke-width="1.6"/><circle cx="12" cy="40" r="5" stroke-width="1.8"/><g class="ac"><path d="M18 37 C 34 15, 50 51, 66 30 S 98 11, 114 38 S 150 54, 166 27 S 196 17, 206 33" stroke-width="1.8" stroke-dasharray="6 4"/><path d="M198 29 L208 33 L200 40" stroke-width="1.8"/></g></g></svg>`,

  /* A wall, and the ball over it. */
  wall: `<svg viewBox="0 0 220 62"><g><path d="M6 53 H214" stroke-width="1.2" opacity=".55"/><circle cx="118" cy="27" r="5" stroke-width="1.6"/><path d="M118 32 L118 51" stroke-width="1.8"/><circle cx="134" cy="25" r="5" stroke-width="1.6"/><path d="M134 30 L134 51" stroke-width="1.8"/><circle cx="150" cy="27" r="5" stroke-width="1.6"/><path d="M150 32 L150 51" stroke-width="1.8"/><circle cx="166" cy="25" r="5" stroke-width="1.6"/><path d="M166 30 L166 51" stroke-width="1.8"/><circle cx="26" cy="46" r="5.5" stroke-width="1.8"/><g class="ac"><path d="M32 41 C 72 5, 150 3, 194 29" stroke-width="1.8" stroke-dasharray="6 4"/><path d="M186 25 L196 30 L188 37" stroke-width="1.8"/></g></g></svg>`,

  /* One long ball across the width. */
  switchplay: `<svg viewBox="0 0 220 62"><g><path d="M110 4 V58" stroke-width="1.2" opacity=".45" stroke-dasharray="4 5"/><path d="M6 56 H214" stroke-width="1.2" opacity=".45" stroke-dasharray="3 5"/><circle cx="24" cy="42" r="6.5" stroke-width="1.9"/><circle cx="196" cy="22" r="6.5" stroke-width="1.9"/><g class="ac"><path d="M32 37 C 76 3, 142 1, 187 17" stroke-width="1.8" stroke-dasharray="7 5"/><path d="M179 12 L189 17 L181 25" stroke-width="1.8"/></g></g></svg>`,

  /* Three closing on one — pinned in the goal mouth. */
  press: `<svg viewBox="0 0 220 62"><g><path d="M76 54 V8 H144 V54 M76 8 L86 2 H134 L144 8" stroke-width="1.4" opacity=".55"/><circle cx="110" cy="32" r="7.5" stroke-width="2"/><circle cx="20" cy="12" r="5" stroke-width="1.7"/><path d="M26 16 C 48 24, 68 28, 90 30" stroke-width="1.7"/><path d="M82 26 L92 30 L83 35" stroke-width="1.7"/><circle cx="204" cy="13" r="5" stroke-width="1.7"/><g class="ac"><path d="M198 18 C 174 26, 152 30, 130 32" stroke-width="1.8"/><path d="M138 27 L128 32 L138 37" stroke-width="1.8"/></g><circle cx="109" cy="57" r="4.5" stroke-width="1.7"/><path d="M109 52 L110 45" stroke-width="1.7"/><path d="M104 49 L110 42 L116 49" stroke-width="1.7"/></g></svg>`,

  /* The corner arc and the ball bending off it. */
  corner: `<svg viewBox="0 0 220 62"><g><path d="M12 4 V54 H142" stroke-width="1.4" opacity=".65"/><path d="M12 36 A 18 18 0 0 1 30 54" stroke-width="1.8"/><path d="M17 54 V22" stroke-width="1.7"/><path d="M17 22 L34 28 L17 34 Z" stroke-width="1.5"/><circle cx="28" cy="46" r="4.8" stroke-width="1.8"/><g class="ac"><path d="M34 43 C 76 35, 130 17, 180 19" stroke-width="1.8" stroke-dasharray="6 4"/><path d="M172 14 L182 19 L174 26" stroke-width="1.8"/></g><circle cx="196" cy="22" r="6" stroke-width="1.8"/></g></svg>`,

  /* Pass, move, receive again — the third man, down the touchline. */
  thirdman: `<svg viewBox="0 0 220 62"><g><path d="M4 60 H216" stroke-width="1.4" opacity=".5"/><path d="M30 52 C 80 60, 150 58, 192 51" stroke-width="1.4" stroke-dasharray="3 5" opacity=".7"/><circle cx="24" cy="44" r="6.5" stroke-width="1.9"/><circle cx="112" cy="17" r="6.5" stroke-width="1.9"/><circle cx="200" cy="42" r="6.5" stroke-width="1.9"/><path d="M32 40 L102 21" stroke-width="1.7"/><path d="M95 16 L104 20 L97 27" stroke-width="1.7"/><g class="ac"><path d="M120 23 L190 38" stroke-width="1.8" stroke-dasharray="6 4"/><path d="M183 33 L192 38 L183 44" stroke-width="1.8"/></g></g></svg>`,
};

/** Tall, for the side margins. viewBox 150 x 170. */
const BLOCKS: Record<string, string> = {
  /* The goal, netted. */
  goal: `<svg viewBox="0 0 150 170"><g><path d="M14 136 V46 H136 V136" stroke-width="1.9"/><path d="M14 46 L30 24 H120 L136 46" stroke-width="1.3"/><path d="M34 46 L46 24 M58 46 L66 24 M82 46 L82 24 M106 46 L98 24 M128 46 L116 24" stroke-width=".9" opacity=".65"/><path d="M14 76 H136 M14 106 H136 M44 46 V136 M75 46 V136 M106 46 V136" stroke-width=".8" opacity=".45" stroke-dasharray="3 4"/><circle cx="104" cy="118" r="7" stroke-width="1.8"/><g class="ac"><path d="M28 162 C 52 150, 76 134, 97 124" stroke-width="1.8" stroke-dasharray="6 4"/><path d="M89 122 L99 123 L96 133" stroke-width="1.8"/></g></g></svg>`,

  /* The penalty area: goal frame on the goal line, the eighteen (wide), the
     six (shallow), the spot, the D — and the shape in it. Redrawn 2026-10-30
     after Lu's look: the first cut read as a basketball key. */
  box: `<svg viewBox="0 0 150 170"><g><path d="M6 30 H144" stroke-width="1.4" opacity=".75"/><path d="M55 30 V12 H95 V30" stroke-width="1.4" opacity=".75"/><path d="M14 30 V84 H136 V30" stroke-width="1.4" opacity=".65"/><path d="M42 30 V48 H108 V30" stroke-width="1.4" opacity=".55"/><circle cx="75" cy="66" r="2.4" stroke-width="1.4"/><path d="M51 84 A 30 30 0 0 0 99 84" stroke-width="1.4" opacity=".65"/><circle cx="34" cy="62" r="8" stroke-width="1.9"/><circle cx="116" cy="64" r="8" stroke-width="1.9"/><path d="M28 128 l12 12 m0 -12 l-12 12" stroke-width="1.9"/><path d="M110 124 l12 12 m0 -12 l-12 12" stroke-width="1.9"/><g class="ac"><path d="M72 150 L74 108" stroke-width="1.8" stroke-dasharray="6 4"/><path d="M68 116 L74 104 L81 115" stroke-width="1.8"/></g></g></svg>`,

  /* Kick-off: the circle, and two runs away from it. */
  centre: `<svg viewBox="0 0 150 170"><g><path d="M6 85 H144" stroke-width="1.3" opacity=".7"/><circle cx="75" cy="85" r="36" stroke-width="1.8"/><circle cx="75" cy="85" r="2.8" stroke-width="2"/><circle cx="34" cy="140" r="5.5" stroke-width="1.8"/><g class="ac"><path d="M38 133 C 50 113, 62 104, 67 72" stroke-width="1.8" stroke-dasharray="5 4"/><path d="M61 80 L67 68 L75 79" stroke-width="1.8"/></g><circle cx="116" cy="30" r="5.5" stroke-width="1.8"/><path d="M112 37 C 106 60, 96 72, 91 99" stroke-width="1.7"/><path d="M84 91 L91 103 L99 93" stroke-width="1.7"/></g></svg>`,

  /* The shape, as a coach draws it on the board — set in front of its own box. */
  shape: `<svg viewBox="0 0 150 170"><g><path d="M6 166 H144 M14 166 V110 H136 V166 M46 166 V144 H104 V166" stroke-width="1.4" opacity=".5"/><path d="M75 96 L44 72 M75 96 L106 72 M44 72 H106 M44 72 L22 30 M106 72 L128 30 M44 72 L75 16 M106 72 L75 16" stroke-width="1" opacity=".5" stroke-dasharray="3 4"/><circle cx="75" cy="155" r="5" stroke-width="1.8"/><circle cx="24" cy="122" r="5" stroke-width="1.8"/><circle cx="58" cy="130" r="5" stroke-width="1.8"/><circle cx="92" cy="130" r="5" stroke-width="1.8"/><circle cx="126" cy="122" r="5" stroke-width="1.8"/><circle cx="75" cy="96" r="5" stroke-width="1.8"/><circle cx="44" cy="72" r="5" stroke-width="1.8"/><circle cx="106" cy="72" r="5" stroke-width="1.8"/><circle cx="22" cy="30" r="5" stroke-width="1.8"/><circle cx="75" cy="16" r="5" stroke-width="1.8"/><circle cx="128" cy="30" r="5" stroke-width="1.8"/><g class="ac"><path d="M58 122 L46 84" stroke-width="1.8" stroke-dasharray="5 4"/><path d="M40 92 L45 80 L54 88" stroke-width="1.8"/></g></g></svg>`,

  /* Three corners, and the ball going round them — across the halfway line. */
  triangle: `<svg viewBox="0 0 150 170"><g><path d="M6 85 H144" stroke-width="1.4" opacity=".5"/><circle cx="75" cy="85" r="14" stroke-width="1.4" opacity=".5"/><circle cx="28" cy="138" r="8" stroke-width="1.9"/><circle cx="78" cy="34" r="8" stroke-width="1.9"/><circle cx="126" cy="124" r="8" stroke-width="1.9"/><path d="M33 130 L70 47" stroke-width="1.7"/><path d="M64 55 L71 43 L79 52" stroke-width="1.7"/><g class="ac"><path d="M85 43 L120 112" stroke-width="1.8" stroke-dasharray="6 4"/><path d="M111 108 L122 117 L111 121" stroke-width="1.8"/></g><path d="M117 131 L38 141" stroke-width="1.7"/><path d="M46 135 L35 141 L46 147" stroke-width="1.7"/></g></svg>`,

  /* The ladder, and the weave through it — on the edge of the box. */
  cones: `<svg viewBox="0 0 150 170"><g><path d="M14 170 V165 H136 V170 M57 165 A 30 30 0 0 1 93 165" stroke-width="1.4" opacity=".5"/><path d="M40 44 L48 24 L56 44 Z" stroke-width="1.7"/><path d="M40 90 L48 70 L56 90 Z" stroke-width="1.7"/><path d="M40 136 L48 116 L56 136 Z" stroke-width="1.7"/><circle cx="112" cy="156" r="5.5" stroke-width="1.8"/><g class="ac"><path d="M107 150 C 86 134, 120 112, 96 92 S 84 54, 106 32" stroke-width="1.8" stroke-dasharray="6 4"/><path d="M99 39 L106 26 L115 36" stroke-width="1.8"/></g></g></svg>`,
};

const STRIP_KEYS = Object.keys(STRIPS);
const BLOCK_KEYS = Object.keys(BLOCKS);

export type Sketch = { art: string; accent: boolean };

/** FNV-1a, 32-bit. Stable, and spreads short keys like `card:P2-3`. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Pick `n` different marks from a pool, by a hash of the page's own key.
 * The step is derived from a different slice of the hash than the start, so
 * the pair is not simply "the next one along".
 */
function pickFrom(pool: Record<string, string>, keys: string[], seed: string, n: number): Sketch[] {
  const h = hash(seed);
  const first = h % keys.length;
  const step = 1 + ((h >>> 9) % (keys.length - 1));
  const out: Sketch[] = [];
  for (let i = 0; i < n; i++) {
    const key = keys[(first + i * step) % keys.length];
    // "About one mark in three carries the green arrow" — a second hash, so
    // whether a mark is accented is independent of which mark it is.
    out.push({ art: pool[key], accent: hash(`${seed}/${i}`) % 3 === 0 });
  }
  return out;
}

export type DoodleScreen = 'cover' | 'home' | 'chapter' | 'card' | 'chend' | 'other';

export interface DoodlePlan {
  /** The band above the first block. Up to 2 (the cover uses both). */
  top: Sketch[];
  /** The band between the last block and the sticky footer. Up to 2. */
  foot: Sketch[];
  /** Always empty since DOODLES-NO-MARGINS (Lu, 2026-10-30). The field stays
   *  so the plan's shape is stable for `PlaybookReader` and the mobile mirror. */
  margins: Sketch[];
}

/**
 * Which zones this screen may use.
 *
 * `foot` needs the screen's `.cta` to be a DIRECT child of `.scr`, because
 * that band is placed before it with flex `order`. The cover (`div.cover`)
 * and the quiz result (`div.res`) wrap their own footer, so they cannot have
 * one — the cover puts both marks in the top band instead, and the quiz is a
 * single mark by ruling, well away from the board it would otherwise sit
 * behind.
 */
const ZONES: Record<DoodleScreen, { top: number; foot: number; margins: number }> = {
  // margins: 0 on every screen — DOODLES-NO-MARGINS, Lu 2026-10-30.
  cover: { top: 2, foot: 0, margins: 0 },
  home: { top: 1, foot: 2, margins: 0 },
  chapter: { top: 1, foot: 2, margins: 0 },
  card: { top: 1, foot: 2, margins: 0 },
  chend: { top: 1, foot: 2, margins: 0 },
  other: { top: 1, foot: 0, margins: 0 },
};

export function doodlePlan(screen: DoodleScreen, pageKey: string): DoodlePlan {
  const z = ZONES[screen];
  const seed = `${screen}:${pageKey}`;
  // Strips for both bands come out of one draw, so the top mark and the foot
  // marks on a page are always different art.
  const strips = pickFrom(STRIPS, STRIP_KEYS, seed, z.top + z.foot);
  return {
    top: strips.slice(0, z.top),
    foot: strips.slice(z.top),
    margins: z.margins ? pickFrom(BLOCKS, BLOCK_KEYS, `${seed}#m`, z.margins) : [],
  };
}

/* ------------------------------------------------------------- strength */

/**
 * `--pbk-dop` by preset. 2 = 0.40 is the locked default (Lu, 2026-10-29).
 * The ladder was widened 2026-10-30 (was 0.28 / 0.40 / 0.55): Lu saw no
 * difference between `?dz=1` and `?dz=2` on the cover, so 1 is now at most
 * 60% of 2 and 3 is 150% of it. The default did not move.
 */
export const STRENGTH: Record<1 | 2 | 3, string> = { 1: '0.22', 2: '0.40', 3: '0.60' };

/**
 * DEV ONLY: `?dz=1|2|3` previews a preset, so the three can be compared on
 * the real page (`/playbook?dz=3`, and alongside `?card=`).
 *
 * The whole lookup sits inside `if (import.meta.env.DEV)`. Vite replaces that
 * with `false` in a production build and the branch — the literal `'dz'`
 * included — is dropped by dead-code elimination, so the parameter does not
 * exist in the shipped chunk. Proven by grep in the build, not assumed.
 */
export function strengthPreset(search: string): 1 | 2 | 3 {
  if (__DEV__) {
    const v = new URLSearchParams(search).get('dz');
    if (v === '1') return 1;
    if (v === '3') return 3;
  }
  return 2;
}

/* ------------------------------------------------------ colour injection */

/**
 * Give a mark its colours as attributes, so it renders with NO CSS.
 *
 * On the web the 13 strings above carry no `stroke` and no `fill`: the colour
 * comes from `playbook.css` (`.pbk .pbkd-mark g { fill:none; stroke:var(--chalk);
 * stroke-linecap:round; stroke-linejoin:round }` and
 * `.pbkd-accent .ac { stroke:var(--green) }`). With no stylesheet, SVG defaults
 * apply — `fill:black`, `stroke:none` — and every mark is a black blob or
 * nothing at all. Mobile draws each string through `SvgXml`, where no
 * stylesheet exists, so the mirror runs the string through this first.
 *
 * Pure: a string in, a new string out, the input untouched. No DOM, no
 * imports, no side effects. The web does NOT call it — `Doodles.tsx` keeps
 * colouring through CSS, and the two paths must stay visually identical.
 *
 *   - the mark's root `<g>` gets `fill="none" stroke=… stroke-linecap="round"
 *     stroke-linejoin="round"`, which every child inherits (each path keeps
 *     its own `stroke-width`, `opacity`, `stroke-dasharray`);
 *   - `<g class="ac">` gets the accent stroke. For a mark whose
 *     `Sketch.accent` is false, pass `accent` equal to `stroke`: the web
 *     greens the arrow on about one mark in three, and that choice lives in
 *     the picker, not here.
 *
 * Opacity (`--pbk-dop`, STRENGTH) is not injected. It belongs to whatever
 * wraps the mark, exactly as on the web.
 */
export function withDoodleColors(svg: string, opts: { stroke: string; accent: string }): string {
  const root =
    `<g fill="none" stroke="${opts.stroke}" stroke-linecap="round" stroke-linejoin="round">`;
  return (
    svg
      // The first bare <g> after the <svg …> open tag is the mark's root.
      .replace(/(<svg\b[^>]*>)\s*<g>/, (_m, open: string) => open + root)
      .replace(/<g class="ac">/g, () => `<g class="ac" stroke="${opts.accent}">`)
  );
}
