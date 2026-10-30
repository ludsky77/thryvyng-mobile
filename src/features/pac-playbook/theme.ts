/**
 * The Playbook design tokens, as one typed object.
 *
 * On the web this design lives in `src/features/pac-playbook/playbook.css`
 * (thrive-and-score @ 83a3686): 28 custom properties on `.pbk` plus the
 * literals its 556 rules repeat, 439 `var(--…)` reads in all. React Native has
 * no CSS and no custom properties, so the values come across as data and the
 * screens (M3) build `StyleSheet`s from them. This file is the ONLY place a
 * Playbook colour or measure is written down on mobile.
 *
 * It is pure data: no imports, no functions, no `StyleSheet`. Nothing here
 * reads a device dimension or a platform flag, so it can be imported by a
 * test, a story or a screen with equal safety.
 *
 * THREE CSS IDIOMS THAT DO NOT SURVIVE THE CROSSING, and what replaces them:
 *
 *  1. `font-size:calc(13*var(--pbk-fs))` — every size in the stylesheet is a
 *     multiple of one unit, so a single value rescales the whole book. The
 *     multiples are kept verbatim in `fontSize`; the unit is `typeUnit`
 *     (1 on a phone, 1.25 at the web's 768px measure). A screen multiplies.
 *  2. `line-height:1.45` and `letter-spacing:.08em` — CSS takes them relative
 *     to the font size; RN takes absolute points. They are kept as the ratios
 *     the design states, in `lineHeightRatio` and `letterSpacingEm`, to be
 *     multiplied by the size in use. Rounding is the screen's call.
 *  3. `border-radius:50%` — RN has no percentage radius. Use half the box's
 *     side (a 28px circle is `borderRadius: 14`), or `radius.round` where the
 *     box is larger than that value.
 *
 * NOT CARRIED, deliberately:
 *  - **No `fontFamily`.** Ruling E-R3 = A: the first mobile build uses the
 *    system font, so Archivo is not loaded and `expo-font` is not a
 *    dependency. The web's `--sans` stack is therefore absent rather than
 *    translated — an absent key cannot be half-applied. If E-R3 is revisited,
 *    a `fontFamily` block is added here and nowhere else.
 *  - **No chalkboard texture.** The page background is four stacked
 *    gradients (two radial pools over a two-axis ruled weave). RN cannot
 *    express it in a style object; it is a rebuild question for M3, not a
 *    token. `color.slate` is the flat colour underneath it.
 *  - **No doodle opacity scale.** `--pbk-dop:.40` is the default of the three
 *    presets in `doodleArt.ts` (`STRENGTH`), which this repo mirrors. Keeping
 *    a copy here would make a second source of truth for one number; read it
 *    from `STRENGTH` instead.
 *
 * `rgba()` values are rewritten in RN's spelling — spaces after the commas and
 * a leading zero on the alpha (`rgba(226,231,238,.14)` →
 * `rgba(226, 231, 238, 0.14)`). Same colour, parseable by RN's colour reader.
 */

/* ------------------------------------------------------------------ colour */

/**
 * The 28 custom properties of `.pbk`, in the stylesheet's own order and
 * grouping. The names are the CSS names, camel-cased (`--card-2` → `card2`).
 *
 * The book is dark by design, not by theme: `.pbk` sets `color-scheme:dark`
 * and there is no light variant to mirror. These values are absolute.
 */
export const color = {
  /* surfaces, darkest to lightest */
  page: '#0f1623', //        the reading page
  slate: '#121a26', //       the shell behind it (under the texture)
  card: '#172031', //        a card, a chip, a button face
  card2: '#1c2637', //       a card raised off a card
  frame: '#1a2334', //       a frame around a figure
  board: '#0b1220', //       a diagram board, and input fields

  /* rules and hairlines */
  line: 'rgba(226, 231, 238, 0.14)', //   the default 1px border
  line2: 'rgba(226, 231, 238, 0.28)', //  a border that has to be seen
  rule: 'rgba(226, 231, 238, 0.2)', //    a horizontal divider

  /* ink */
  chalk: '#e8ecf2', //   body text and headings
  chalk2: '#d7dde6', //  text one step down
  mute: '#9aa5b5', //    secondary text, labels, counts
  dim: '#8690a0', //     tertiary: stamps, chevrons, eyebrows

  /* green — right answers, progress, the "us" team */
  green: '#10b981',
  greenInk: '#03251a', //  text ON green
  greenDim: 'rgba(16, 185, 129, 0.16)', //  a green tint behind text

  /* violet — the header and the trail */
  violet: '#7c6cf0',
  violet2: '#5b4bd6', //   the darker end of the header gradient
  violetInk: '#f1eeff', // text ON violet

  /* pink — reminders and unread badges */
  pink: '#D4537E',
  pinkText: '#F08AAE',
  pinkBg: 'rgba(212, 83, 126, 0.13)',

  /* the rest of the vocabulary */
  them: '#8b95a5', //    the opposition on a diagram
  bad: '#ff5a76', //     a wrong answer
  gold: '#ffc83d', //    first medal
  silver: '#c9d3df', //  second medal

  /* the tape strip that labels a screen */
  tape: '#d9d3c0',
  tapeInk: '#1b2230',
} as const;

/* -------------------------------------------------------------------- type */

/**
 * The type unit. Every size in `fontSize` is a multiple of this.
 *
 * `narrow` is the phone, and 1 means the sizes below are already points.
 * `wide` is the web's >=768px measure, where the column goes 460 → 920 and
 * the unit goes 1 → 1.25, scaling all type at once. Kept because a tablet
 * reaches that width; a phone-only build never multiplies by anything but 1.
 */
export const typeUnit = { narrow: 1, wide: 1.25 } as const;

/**
 * Every distinct size in the stylesheet, named for the role it plays there.
 * The number after each one is its multiple of the unit, which is what the
 * CSS actually says — so a value here is checkable against the web in one
 * grep (`font-size:calc(13*var(--pbk-fs))`).
 */
export const fontSize = {
  countdown: 110, //      the 3-2-1 before a quiz
  resultBig: 64, //       the score on the results screen
  coverTitle: 52, //      the book's own title
  resultHead: 38, //      "Nice work" over the score
  cardTitle: 36, //       a card's title — the biggest thing in the book proper
  score: 30, //           a score inside a panel
  h2: 28, //              a screen heading
  question: 24, //        a quiz question; also the big chevrons
  rowName: 22, //         a chapter or card name in a list row
  panelName: 20, //       a name in a progress row; the role-panel numeral
  tapeXl: 19, //          the cover's oversized tape strip
  headerTitle: 18, //     the app-bar title; cue chips; a short row name
  button: 17, //          a primary button, a search hit's title, the coach line
  body: 16, //            the shell's base size: prose, options, inputs
  panelBody: 15.5, //     the role panel's paragraph
  lead: 15, //            a lead paragraph, a row's description, a text block
  linkchip: 14.5, //      a link chip, a question's reply
  secondary: 14, //       cue lines, tabs, reminders, sub-descriptions
  chipAlt: 13.5, //       movement chips, quiz status, a numbered list's small
  meta: 13, //            THE most common size: counts, chips, legends, metas
  dense: 12.5, //         beat cells, the author line, keycaps
  micro: 12, //           uppercase eyebrows, stamps, tags, badges
  hitEyebrow: 11.5, //    the chapter name over a search hit
  tiny: 11, //            score labels, diagram band captions, slider labels
  medal: 10, //           the glyph inside an 18px medal
} as const;

/**
 * RN takes `fontWeight` as a string. The system font supplies what it has:
 * 800 and 700 may render as the same face on some devices, which is a
 * cost of ruling E-R3 = A and is why the design's own 700/800 split is kept
 * here rather than collapsed — it comes back for free if Archivo lands.
 */
export const fontWeight = {
  regular: '400', //    2 uses: the coach's aside, a list's small print
  medium: '500', //     12 uses: counts, percentages, secondary prose
  semibold: '600', //   11 uses: chips, segment labels
  bold: '700', //       34 uses: labels, buttons, eyebrows
  extrabold: '800', //  33 uses: every heading and numeral
} as const;

/**
 * CSS `line-height` ratios. Multiply by the size in use:
 * `lineHeight: fontSize.lead * lineHeightRatio.prose`.
 */
export const lineHeightRatio = {
  flush: 0.92, //    the cover title, set tight on purpose
  solid: 1, //       big numerals, where the box IS the line
  tightest: 1.05, // a card title
  tight: 1.1, //     a screen heading, the app-bar title
  snug: 1.15, //     a row name, a quiz question
  heading: 1.2, //   the coach line, small print
  caption: 1.25, //  a diagram band caption
  compact: 1.3, //   a stamp, a numbered list's name
  option: 1.35, //   a quiz option
  text: 1.4, //      the default for prose that wraps
  prose: 1.45, //    a text block, a reminder, a lead
  loose: 1.5, //     the shell's base, long-form prose
} as const;

/**
 * CSS `letter-spacing`, in em. Multiply by the size in use:
 * `letterSpacing: fontSize.micro * letterSpacingEm.caps`.
 *
 * The positives are the book's uppercase eyebrows; the negatives are its
 * large headings, which need pulling in as they grow.
 */
export const letterSpacingEm = {
  headingXl: -0.025, //  the cover title
  headingLg: -0.015, //  a card title
  heading: -0.01, //     a screen heading, a row name
  none: 0, //            an explicit reset where a parent set one
  button: 0.01, //       a primary button, a beat cell
  caps: 0.06, //         the lightest uppercase tracking
  capsWide: 0.08, //     the common one: stamps, labels, eyebrows
  capsWider: 0.1, //     row numerals, bug titles, cue-chip smalls
  capsWidest: 0.12, //   section titles, block labels
  tape: 0.14, //         the tape strip, and score labels
} as const;

/* ------------------------------------------------------------ box & rhythm */

/**
 * Corner radii. `pill` is the stylesheet's `999px`; `round` stands in for its
 * `50%` only where the box is smaller than 9999 on both sides — for a circle,
 * prefer half the known side.
 */
export const radius = {
  hair: 1,
  xs: 2,
  sm: 3,
  base: 4,
  input: 5,
  icon: 6,
  control: 8, //   segments, tool buttons, small cards
  field: 10, //    inputs, tabs, reminders, link boxes
  card: 12, //     a card, a primary button, a quiz option
  cardLg: 14, //   the largest card
  toast: 20,
  pill: 999,
  round: 9999,
} as const;

/**
 * The spacing scale — every `gap` and `padding` step the stylesheet uses.
 * Numbered, not named, because the design's own rhythm is numeric and a
 * semantic name would be invented here rather than mirrored.
 */
export const space = {
  px1: 1,
  px2: 2,
  px3: 3,
  px4: 4,
  px5: 5,
  px6: 6, //    the most common gap (21 uses)
  px7: 7,
  px8: 8, //    the second most common (20 uses)
  px9: 9,
  px10: 10,
  px11: 11,
  px12: 12,
  px14: 14,
  px16: 16,
  px18: 18, //  the wide measure's scroll gap
  px20: 20,
  px24: 24,
  px48: 48, //  the empty-state's vertical breathing room
} as const;

/** Border and rule widths, in points. */
export const lineWidth = {
  hairline: 1, //   46 uses: the default border
  mid: 1.5, //      11 uses: a border that carries weight (options, pips)
  thick: 2, //      6 uses: the crest ring, the underline sweep
  heavy: 2.5,
  accent: 3, //     the reminder's left bar
  /** The icon stroke in the header's inline SVGs (`stroke-width:2.2`). */
  iconStroke: 2.2,
} as const;

/**
 * Tap targets and control heights, as `min-height` in the stylesheet. Each is
 * already at or above a comfortable target except `chip` and `mvchip`, which
 * are labels the design does not expect to be pressed alone.
 */
export const control = {
  chip: 32,
  segSmall: 34,
  mvchip: 36,
  seg2: 42,
  buttonCompact: 42,
  heatButton: 44,
  rolePanelNum: 44,
  buttonGhost: 46,
  rowCompact: 48,
  button: 52, //   the primary button
  option: 54, //   a quiz option, and the answer box
  row: 58,
  rowTall: 65,
  rowTaller: 68,
  rowTallest: 70,
  crest: 34, //    the header's crest circle
  medal: 18,
  medalBig: 96,
} as const;

/**
 * The reading column and its gutters.
 *
 * `colNarrow` / `colWide` and the two breakpoints are the web's layout law
 * (ruling W-A: one wider page, never a second panel). A phone is always the
 * narrow case; they are kept so a tablet build reads the same rule rather
 * than inventing one.
 */
export const layout = {
  colNarrow: 460,
  colWide: 920,
  /** The width at which the column and the type unit both grow. */
  wideBreakpoint: 768,
  /** The width at which the side-margin doodles have room to be drawn. */
  marginsBreakpoint: 1360,
  /** Scroll padding: `.scr{padding:14px 16px 0}` narrow, `20px 24px 0` wide. */
  scrollPadTop: 14,
  scrollPadTopWide: 20,
  scrollPadX: 16,
  scrollPadXWide: 24,
  /** The gap between everything in the scroller. */
  scrollGap: 14,
  scrollGapWide: 18,
} as const;

/**
 * Doodle geometry — the chalk marks in the book's empty space.
 *
 * `size` is the web's `--pbk-dsz`: one number that scales every mark, 1 on a
 * phone and 1.3 at the wide measure. The widths are the `calc()` bases
 * (`190px * --pbk-dsz`, `150px * --pbk-dsz`); `blockClearance` is how far a
 * margin block sits clear of the text, which is what makes 1360px the
 * threshold (920 + 2 × (150 × 1.3 + 16) = 1342).
 *
 * How strongly a mark reads is NOT here — see `STRENGTH` in `doodleArt.ts`.
 */
export const doodle = {
  size: { narrow: 1, wide: 1.3 },
  stripWidth: 190,
  blockWidth: 150,
  blockClearance: 16,
} as const;

/* ------------------------------------------------------------------ bundle */

/**
 * One object, for a screen that would rather destructure once than import
 * eight names. The individual exports above are the same values — neither is
 * a copy of the other.
 */
export const playbookTheme = {
  color,
  typeUnit,
  fontSize,
  fontWeight,
  lineHeightRatio,
  letterSpacingEm,
  radius,
  space,
  lineWidth,
  control,
  layout,
  doodle,
} as const;

export type PlaybookTheme = typeof playbookTheme;
export type PlaybookColor = keyof typeof color;
export type PlaybookFontSize = keyof typeof fontSize;
export type PlaybookSpace = keyof typeof space;
