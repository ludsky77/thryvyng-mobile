/**
 * `playbook.css`, as one StyleSheet.
 *
 * The web's design is 556 CSS rules scoped to `.pbk`
 * (`thrive-and-score` @ `c772111`, `src/features/pac-playbook/playbook.css`).
 * React Native has no cascade, no custom properties and no `calc()`, so the
 * rules that are SHARED between screens live here once — the same job the
 * stylesheet does — and each key below is named after the class it mirrors, so
 * a rule can be checked against the web in one grep.
 *
 * Every number comes from `theme.ts`, never from this file: `theme.ts` is the
 * one place a Playbook colour or measure is written down (M1), and this file
 * only arranges them. The three CSS idioms `theme.ts` warned about are
 * resolved here and nowhere else:
 *
 *   `calc(13*var(--pbk-fs))`  →  `fontSize.meta` × `typeUnit.narrow` (= 1 on a
 *                                phone, so the multiplication is the identity
 *                                and the sizes read as the design states them)
 *   `line-height:1.45`        →  `fontSize.lead * lineHeightRatio.prose`
 *   `letter-spacing:.08em`    →  `fontSize.micro * letterSpacingEm.capsWide`
 *
 * WHAT IS DELIBERATELY NOT HERE, each one a CSS feature with no style-object
 * form. None of them carries meaning; all of them are recorded in
 * `docs/recon/playbook-m3.md` so the list is not rediscovered later:
 *
 *   `clip-path` on the tape strip (a torn-paper edge) — the strip keeps its
 *     colour, its rotation and its shadow, and loses its ragged edge.
 *   `::before` / `::after` tape scraps on `.titleblk`, `.board`, `.cover-how`
 *     — drawn as real `View`s where they are cheap, dropped where they are
 *     not.
 *   `.ul::after`, the hand-drawn underline sweep under a card title — drawn
 *     as a 2pt `View`, without the gradient fade.
 *   The chalkboard texture (four stacked gradients) — `color.slate` is the
 *     flat colour under it; the texture is an open question for M5's look.
 *   `position:sticky` on `.cta` — the footer renders inline at the end of the
 *     scroll instead, in the same order. See PLAYBOOK-MOBILE-CTA-NOT-STICKY.
 *
 * SINCE PLAYBOOK-TYPE-PASS-E, TYPE COMES THROUGH `type.ts`. The six roles
 * there (kicker · label · title · subtitle · body · caption) say what an
 * element IS; this file spreads the role and overrides only what the element
 * genuinely needs on top, so a departure from the scale is visible as an
 * override instead of being free-handed. The `line()` / `track()` helpers moved
 * there too, so the header and the page resolve a ratio the same way.
 */

import { StyleSheet } from 'react-native';
import {
  color,
  control,
  fontFamily as ff,
  fontSize as fs,
  layout,
  letterSpacingEm as ls,
  lineHeightRatio as lh,
  lineWidth,
  radius,
  space,
} from './theme';
import { line, role, track } from './type';

export const pbk = StyleSheet.create({
  /* ------------------------------------------------------------- the shell */

  /** `.pbk` — the page. The texture is not expressible; this is under it. */
  page: { flex: 1, backgroundColor: color.slate },

  /** `.pbk-col` — `width:min(460px,100%);margin:0 auto`. */
  col: { flex: 1, width: '100%', maxWidth: layout.colNarrow, alignSelf: 'center' },

  /** `.scr` — `display:flex;flex-direction:column;gap:14px;padding:14px 16px 0`. */
  scr: {
    paddingTop: layout.scrollPadTop,
    paddingHorizontal: layout.scrollPadX,
    gap: layout.scrollGap,
  },

  /** `.pbk-state` / `.pbk-note` — the loading and error bodies. */
  state: {
    gap: space.px12,
    alignItems: 'center',
    paddingVertical: space.px48,
    paddingHorizontal: space.px8,
  },
  note: {
    ...role.bodyLead,
    fontSize: fs.chipAlt,
    lineHeight: line(fs.chipAlt, lh.prose),
    textAlign: 'center',
  },

  /* ------------------------------------------------------- tape and stamp */

  /** `.tophead` — `justify-content:space-between;align-items:flex-start`. */
  tophead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: space.px10,
    marginTop: space.px2,
    marginBottom: -space.px6,
  },

  /** `.tape` — `transform:rotate(-1.4deg)` and the drop shadow. */
  tape: {
    alignSelf: 'flex-start',
    backgroundColor: color.tape,
    paddingVertical: space.px5,
    paddingHorizontal: space.px14,
    transform: [{ rotate: '-1.4deg' }],
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  tapeText: {
    color: color.tapeInk,
    fontFamily: ff.bold,
    fontSize: fs.meta,
    letterSpacing: track(fs.meta, ls.tape),
    textTransform: 'uppercase',
  },
  /** `.tape.tape-xl` — `max-width:74%`, a steeper tilt, looser tracking. */
  tapeXl: {
    paddingTop: space.px9,
    paddingBottom: space.px8,
    paddingHorizontal: space.px20,
    maxWidth: '74%',
    transform: [{ rotate: '-1.6deg' }],
  },
  tapeXlText: {
    fontSize: fs.tapeXl,
    letterSpacing: track(fs.tapeXl, ls.capsWider),
    lineHeight: line(fs.tapeXl, lh.snug),
  },

  /** `.stamp` — the rotated outline box. */
  stamp: {
    borderWidth: lineWidth.mid,
    borderColor: color.dim,
    borderRadius: radius.base,
    paddingVertical: space.px3,
    paddingHorizontal: space.px8,
    transform: [{ rotate: '-3deg' }],
    opacity: 0.9,
  },
  stampText: {
    color: color.dim,
    fontFamily: ff.bold,
    fontSize: fs.micro,
    letterSpacing: track(fs.micro, ls.capsWide),
    textTransform: 'uppercase',
    lineHeight: line(fs.micro, lh.compact),
    textAlign: 'center',
  },

  /* ---------------------------------------------------------- prose, lists */

  /** `.lead` */
  lead: role.bodyLead,

  /**
   * `.one` and its block label.
   *
   * `blockLabel` is `role.label`: the quiet furniture that names the paragraph
   * under it. See `secttlText` above for why it must not look like a kicker.
   */
  one: role.body,
  oneMute: { ...role.body, fontSize: fs.lead, lineHeight: line(fs.lead, lh.loose), color: color.chalk2 },
  blockLabel: { ...role.label, marginBottom: space.px3 },

  /** `b.hl` — `fmt()`'s bold green key term. */
  hl: { color: color.green, fontFamily: ff.extrabold },

  /** `.index` — dashed rules between rows, none after the last. */
  index: {},
  indexItem: { borderBottomWidth: lineWidth.hairline, borderBottomColor: color.rule },
  indexItemLast: { borderBottomWidth: 0 },

  /** `.row` — `grid-template-columns:34px minmax(0,1fr) 22px`. */
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.px10,
    paddingVertical: space.px12,
    paddingHorizontal: space.px4,
    borderRadius: radius.field,
    minHeight: control.row,
  },
  rowNum: {
    width: 34,
    fontFamily: ff.bold,
    fontSize: fs.meta,
    letterSpacing: track(fs.meta, ls.capsWider),
    color: color.dim,
    paddingTop: space.px7,
  },
  rowBody: { flex: 1, minWidth: 0 },
  rowName: role.titleRow,
  rowNameSm: { fontSize: fs.headerTitle, lineHeight: line(fs.headerTitle, lh.snug) },
  rowEm: {
    fontFamily: ff.medium,
    fontSize: fs.secondary,
    color: color.mute,
    letterSpacing: 0,
  },
  rowDesc: {
    ...role.bodyLead,
    lineHeight: line(fs.lead, lh.text),
    marginTop: space.px3,
  },
  /**
   * The right-hand cell of a TAPPABLE row — status first, then the one cue.
   *
   * RULING PLAYBOOK-TYPE-PASS-E: "tappable = one consistent cue, non-tappable
   * gets none". A card row used to end in a `StatusPip` and nothing else, so
   * the only rows in the book that showed the reader where they could go were
   * the ones with no progress to show. The pip is STATUS; the chevron is the
   * AFFORDANCE; a row that has both shows both, in that order.
   */
  rowEnd: { flexDirection: 'row', alignItems: 'flex-start', gap: space.px6 },

  rowChev: {
    width: 22,
    textAlign: 'right',
    fontFamily: ff.medium,
    fontSize: fs.question,
    lineHeight: line(fs.question, lh.solid),
    color: color.dim,
    paddingTop: space.px3,
  },

  /** `.row .prog` — the 2px progress rule and its count. */
  prog: { flexDirection: 'row', alignItems: 'center', gap: space.px10, marginTop: space.px9 },
  bar: {
    flex: 1,
    height: space.px2,
    borderRadius: radius.xs,
    backgroundColor: color.line2,
    overflow: 'hidden',
  },
  barFill: { height: '100%', backgroundColor: color.green, borderRadius: radius.xs },
  pct: { fontFamily: ff.medium, fontSize: fs.meta, color: color.chalk2 },
  pctZero: { color: color.dim },

  /** `.row .st` — the ✓ / dashed "next" pip. */
  st: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.6,
    borderColor: color.line2,
    marginTop: space.px4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stOk: { backgroundColor: color.green, borderColor: color.green },
  stOkText: { color: color.greenInk, fontSize: fs.micro, fontFamily: ff.extrabold },
  stNext: { borderColor: color.green, borderStyle: 'dashed' },
  /**
   * The tick INSIDE a toned pip — ruling PLAYBOOK-SECTION-RAIL. `greenInk` is
   * a near-black GREEN, which is right on `color.green` and faintly wrong on
   * sky or periwinkle; `board` is the book's own dark navy and reads on all
   * four tones. The untoned pip keeps `greenInk` exactly as it was.
   */
  stOkToneText: { color: color.board },

  /**
   * `.secttl` / `.subdesc` — A SECTION DIVIDER.
   *
   * RULING PLAYBOOK-TYPE-PASS-E: this is `role.kicker`, and a kicker is NOT a
   * block label. The two were byte-identical before this pass (both
   * `ff.bold` / `fs.meta` / `capsWidest` / `mute`), so "POSSESSION" dividing a
   * chapter's list and "WHAT YOU SEE" labelling a paragraph inside a card were
   * set exactly the same. The kicker now wins on weight AND ink — 800 in
   * `chalk2` against the label's 700 in `mute`.
   */
  secttl: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.px8,
    marginTop: space.px14,
    marginHorizontal: space.px2,
  },
  /**
   * The section's RAIL — ruling PLAYBOOK-SECTION-RAIL. 3pt of the section's
   * tone down the left of the kicker row, which is what makes a section
   * findable while scrolling a seventeen-card chapter. `stretch` so it is as
   * tall as the row's tallest child (the pill), not a fixed height that would
   * have to be kept in step with the type.
   */
  secttlRail: {
    width: space.px3,
    alignSelf: 'stretch',
    minHeight: space.px16,
    borderRadius: radius.xs,
    backgroundColor: color.chalk2,
  },
  /** The kicker takes the row so the count pill is pushed to the far end. */
  secttlText: { ...role.kicker, flex: 1 },
  /**
   * The COUNT PILL. It was plain `dim` text at the end of the row; it is now
   * a pill tinted with the section's own tone at 13% behind the tone's ink,
   * so the count belongs to its section instead of floating between two.
   */
  secttlPill: {
    paddingHorizontal: space.px8,
    paddingVertical: space.px2,
    borderRadius: radius.pill,
    backgroundColor: color.card,
  },
  secttlPillText: { ...role.kickerCount, color: color.mute },
  secttlSmall: role.kickerCount,
  subdesc: {
    ...role.caption,
    fontSize: fs.secondary,
    lineHeight: line(fs.secondary, lh.text),
    color: color.dim,
    marginHorizontal: space.px2,
  },

  /**
   * "What you will learn" — MOBILE ONLY, ruling PLAYBOOK-TYPE-PASS-E.
   *
   * It was `blockLabel` + `lead`: the chapter's whole promise set in the same
   * label a paragraph inside a card gets, with nothing round it. It is now its
   * OWN DEVICE — a kicker over a framed body with the book's green down the
   * left edge, the same left-bar device `remind` uses in pink. No new colour
   * and no new measure: `card`, `line`, `green` and `lineWidth.accent` are the
   * book's own.
   *
   * THE FRAME IS A LIST, and today the content gives it one item: every
   * chapter's `learn` is a single sentence in the frozen data, so a real
   * multi-item list needs a content change, which this pass forbids. The
   * device takes items, so it will render them the day the content has them.
   */
  learnbox: {
    borderWidth: lineWidth.hairline,
    borderColor: color.line,
    borderLeftWidth: lineWidth.accent,
    borderLeftColor: color.green,
    borderRadius: radius.field,
    backgroundColor: color.card,
    paddingVertical: space.px10,
    paddingHorizontal: space.px12,
    gap: space.px6,
    marginTop: space.px4,
  },
  /**
   * The kicker over the frame. It needs MORE air above it than below: the
   * device is the kicker AND the box, so the two have to group against the
   * tape strip above them. Without this they sat an equal gap from both and
   * read as two unrelated things.
   */
  learnLabel: { ...role.kicker, marginTop: space.px6, marginBottom: space.px4 },
  learnRow: { flexDirection: 'row', gap: space.px8, alignItems: 'flex-start' },
  learnTick: {
    ...role.labelAccent,
    fontSize: fs.secondary,
    lineHeight: line(fs.lead, lh.prose),
    letterSpacing: ls.none,
  },
  learnText: { ...role.bodyLead, flex: 1, color: color.chalk2 },

  /** `.count` — the "n of m cards read" line. */
  count: { ...role.caption, marginHorizontal: space.px2 },

  /** `.snote` — the search result count / empty note. */
  snote: { ...role.caption, marginHorizontal: space.px2 },

  /**
   * The quiz's row at the foot of the index — MOBILE ONLY, fork
   * QUIZ-CARD-NOTICEABLE. The web's own `.row` was used as-is and the quiz
   * read as one more chapter, so it was scrolled past. Same row, lifted off
   * the page: the raised face, a green rule and the pill below the
   * description. No new colour or measure — `card2`, `green` and the spacing
   * scale are the book's own.
   */
  quizcard: {
    borderWidth: lineWidth.mid,
    borderColor: color.green,
    borderRadius: radius.card,
    backgroundColor: color.card2,
    paddingHorizontal: space.px14,
    marginTop: space.px4,
  },
  quizcardHead: { flexDirection: 'row', alignItems: 'center', gap: space.px6 },
  quizcardCta: { marginTop: space.px8 },

  /**
   * `.field` with a wrapping chip row — MOBILE ONLY, fork
   * QUESTION-PILLS-WRAP. The "About" chips were a horizontal scroller, so
   * every chip past the viewport was off screen with nothing to say so. They
   * wrap now; no chip is reachable only by dragging.
   */
  pillwrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.px6 },

  /* ------------------------------------------------------ buttons and chips */

  /** `.cta` — inline, not sticky (see the header). */
  cta: {
    gap: space.px8,
    marginHorizontal: -layout.scrollPadX,
    paddingHorizontal: layout.scrollPadX,
    paddingTop: space.px12,
    paddingBottom: space.px12,
  },

  /** `.btn` and its four variants. */
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.px8,
    minHeight: control.button,
    paddingHorizontal: space.px16,
    borderRadius: radius.card,
    width: '100%',
  },
  btnText: {
    fontFamily: ff.bold,
    fontSize: fs.button,
    letterSpacing: track(fs.button, ls.button),
    textAlign: 'center',
  },
  btnSmall: { fontFamily: ff.medium, fontSize: fs.lead, opacity: 0.9 },
  btnPrimary: {
    backgroundColor: color.green,
    shadowColor: color.green,
    shadowOpacity: 0.45,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  btnPrimaryText: { color: color.greenInk },
  btnGhost: {
    borderWidth: lineWidth.hairline,
    borderColor: color.line2,
    backgroundColor: color.card,
    minHeight: control.buttonGhost,
  },
  btnGhostText: { color: color.chalk, fontSize: fs.lead },
  btnViolet: { backgroundColor: color.violet },
  btnVioletText: { color: '#fff' },
  btnDone: {
    backgroundColor: color.card,
    borderWidth: lineWidth.hairline,
    borderColor: color.green,
  },
  btnDoneText: { color: color.green },
  btnDisabled: { opacity: 0.4 },

  /** `.two` — the two-up footer grid. */
  two: { flexDirection: 'row', gap: space.px8 },

  /**
   * `.cta` on a screen that centres its children — MOBILE ONLY, fork
   * QUIZ-RESULT-BUTTONS-ALIGN. `.res` is `alignItems:'center'`, which on the
   * web leaves a block-level footer full width and in RN shrink-wraps it: the
   * two buttons came out narrow and off the column. Stretching the footer
   * back to the column puts them on the same full-width line every other
   * screen's buttons sit on.
   */
  ctaStretch: { alignSelf: 'stretch' },

  /** `.chip` and its two tints. */
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.px6,
    minHeight: control.chip,
    paddingHorizontal: space.px12,
    borderRadius: radius.pill,
    borderWidth: lineWidth.hairline,
    borderColor: color.line2,
    backgroundColor: color.card,
    alignSelf: 'flex-start',
  },
  chipText: { fontFamily: ff.semibold, fontSize: fs.meta, color: color.chalk2 },
  chipGreen: { backgroundColor: color.greenDim, borderColor: color.green },
  chipGreenText: { color: color.green },

  /** `.medal` — an 18pt disc with one letter in it. */
  medal: {
    width: control.medal,
    height: control.medal,
    borderRadius: control.medal / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  medalText: { fontFamily: ff.extrabold, fontSize: fs.medal, color: '#1b1403' },
  medalGold: { backgroundColor: color.gold },
  medalSilver: { backgroundColor: color.silver },
  medalNone: { backgroundColor: color.line2 },

  /* ------------------------------------------------------------ a card body */

  /** `.crumb` and its right-aligned `.tag`. */
  crumb: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.px6 },
  crumbText: {
    fontSize: fs.meta,
    fontFamily: ff.medium,
    color: color.mute,
    lineHeight: line(fs.meta, lh.text),
  },
  crumbStrong: { fontFamily: ff.bold, color: color.chalk2 },
  /** The card's section kicker — its mark and its name, in the section tone. */
  crumbSect: { flexDirection: 'row', alignItems: 'center', gap: space.px4 },
  crumbTag: {
    marginLeft: 'auto',
    borderWidth: lineWidth.hairline,
    borderColor: color.line2,
    borderRadius: radius.input,
    paddingHorizontal: space.px6,
    paddingVertical: space.px1,
  },
  crumbTagText: {
    fontFamily: ff.bold,
    fontSize: fs.micro,
    letterSpacing: track(fs.micro, ls.capsWide),
    color: color.dim,
  },

  /** `.pips` — one bar per card in the section. */
  pips: { flexDirection: 'row', gap: space.px4, marginTop: -space.px6 },
  pip: { flex: 1, height: space.px3, borderRadius: radius.xs, backgroundColor: color.line2 },
  pipDone: { backgroundColor: color.chalk2 },
  pipCur: { backgroundColor: color.green },

  /** `.titleblk` / `.title` / `.ul` / `.es` */
  titleblk: { paddingTop: space.px8 },
  titleTape: {
    position: 'absolute',
    left: -space.px8,
    top: 0,
    width: 50,
    height: space.px14,
    backgroundColor: color.tape,
    opacity: 0.5,
    borderRadius: radius.hair,
    transform: [{ rotate: '-4deg' }],
  },
  title: role.title,
  titleRule: {
    height: space.px2,
    borderRadius: radius.xs,
    backgroundColor: 'rgba(232, 236, 242, 0.6)',
    marginTop: space.px6,
    marginRight: '6%',
  },
  titleEs: { ...role.subtitle, marginTop: space.px8 },

  /** `.cuechip` — the pill around a cue word. */
  cuechip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.px8,
    alignSelf: 'flex-start',
    borderWidth: lineWidth.mid,
    borderColor: color.chalk2,
    borderRadius: radius.pill,
    paddingVertical: space.px6,
    paddingHorizontal: space.px16,
  },
  cuechipText: { fontFamily: ff.extrabold, fontSize: fs.headerTitle, color: color.chalk },
  cuechipSmall: {
    fontFamily: ff.semibold,
    fontSize: fs.micro,
    letterSpacing: track(fs.micro, ls.capsWider),
    textTransform: 'uppercase',
    color: color.mute,
  },

  /** `.blk` and the three coloured labels. */
  blk: {
    borderRadius: radius.card,
    paddingVertical: space.px10,
    paddingHorizontal: space.px12,
    backgroundColor: color.card,
    borderWidth: lineWidth.hairline,
    borderColor: color.line,
  },
  blkText: { ...role.bodyLead, color: color.chalk },
  blkLabelRead: { color: color.green },
  blkLabelIfnot: { color: color.pinkText },
  blkLabelRit: { color: '#b7acff' },

  /** `.remind` — the pink reminder with its left bar. */
  remind: {
    backgroundColor: color.pinkBg,
    borderRadius: radius.field,
    borderWidth: lineWidth.hairline,
    borderColor: 'rgba(212, 83, 126, 0.35)',
    borderLeftWidth: lineWidth.accent,
    borderLeftColor: color.pink,
    paddingVertical: space.px10,
    paddingRight: space.px12,
    paddingLeft: space.px14,
  },
  remindText: {
    color: color.pinkText,
    fontSize: fs.secondary,
    lineHeight: line(fs.secondary, lh.prose),
    fontFamily: ff.medium,
  },

  /** `.auth` — the byline strip at the foot of a card. */
  auth: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: space.px8,
    paddingHorizontal: space.px12,
    borderWidth: lineWidth.hairline,
    borderColor: color.line,
    borderRadius: radius.control,
    backgroundColor: color.card,
  },
  authText: {
    fontFamily: ff.bold,
    fontSize: fs.dense,
    letterSpacing: track(fs.dense, ls.capsWide),
    textTransform: 'uppercase',
    color: color.mute,
  },
  authMag: {
    width: space.px10,
    height: space.px10,
    borderRadius: space.px5,
    backgroundColor: color.them,
    marginRight: space.px8,
  },

  /** `.pend` — the dashed "Diagram pending" panel. */
  pend: {
    borderWidth: lineWidth.mid,
    borderColor: color.line2,
    borderStyle: 'dashed',
    borderRadius: radius.field,
    padding: space.px12,
  },
  pendText: {
    ...role.bodyLead,
    fontSize: fs.secondary,
    lineHeight: line(fs.secondary, lh.prose),
  },

  /** `.verbs` / `.reasons` — the F0 four-and-three grids. */
  gridRow: { flexDirection: 'row', gap: space.px6 },
  verbCell: {
    flex: 1,
    alignItems: 'center',
    gap: space.px2,
    paddingTop: space.px9,
    paddingBottom: space.px8,
    paddingHorizontal: space.px2,
    borderRadius: radius.card,
    backgroundColor: color.card2,
    borderWidth: lineWidth.hairline,
    borderColor: color.line,
  },
  verbName: {
    fontFamily: ff.extrabold,
    fontSize: fs.lead,
    lineHeight: line(fs.lead, lh.solid),
    color: color.chalk,
  },
  verbAlt: { ...role.caption, fontSize: fs.micro, lineHeight: line(fs.micro, lh.tight) },
  reasonCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: space.px9,
    paddingHorizontal: space.px6,
    borderRadius: radius.card,
    backgroundColor: color.card,
    borderWidth: lineWidth.hairline,
    borderColor: color.line,
  },
  reasonName: { fontFamily: ff.extrabold, fontSize: fs.lead, color: color.green },

  /** `.linkbox` / `.linkchip` — "See also" and its green chips. */
  linkbox: {
    borderRadius: radius.card,
    paddingVertical: space.px10,
    paddingHorizontal: space.px12,
    backgroundColor: color.card,
    borderWidth: lineWidth.hairline,
    borderColor: color.line,
    gap: space.px8,
  },
  linkboxText: { ...role.bodyLead, color: color.chalk2 },
  linkchips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.px8 },
  linkchip: {
    borderWidth: lineWidth.hairline,
    borderColor: color.green,
    backgroundColor: color.greenDim,
    borderRadius: radius.field,
    paddingVertical: space.px7,
    paddingHorizontal: space.px12,
    gap: space.px1,
  },
  linkchipEyebrow: { ...role.labelAccent, fontSize: fs.tiny, letterSpacing: track(fs.tiny, ls.capsWide) },
  linkchipText: { fontFamily: ff.bold, fontSize: fs.linkchip, color: color.chalk },

  /** `.trailbar` — "‹ Back to <card>" after following a green chip. */
  trailbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.px6,
    borderWidth: lineWidth.hairline,
    borderColor: color.violet,
    backgroundColor: 'rgba(124, 108, 240, 0.14)',
    borderRadius: radius.field,
    paddingVertical: space.px9,
    paddingHorizontal: space.px12,
  },
  trailbarText: { color: '#d9d3ff', fontSize: fs.secondary, fontFamily: ff.semibold },

  /** `.ptrs` — the "Pointers" bullet list. */
  ptrs: { marginTop: space.px4, gap: space.px3 },
  ptrRow: { flexDirection: 'row', gap: space.px8 },

  /** `.cardbar` — `grid-template-columns:52px minmax(0,1.15fr) minmax(0,1fr)`. */
  cardbar: { flexDirection: 'row', gap: space.px8 },
  cardbarIcon: { width: 52, flexGrow: 0, flexShrink: 0, paddingHorizontal: 0 },
  cardbarIconText: { fontSize: fs.question, fontFamily: ff.bold },
  cardbarMid: { flex: 1.15 },
  cardbarNext: { flex: 1, flexDirection: 'column', gap: 0, paddingHorizontal: space.px10 },
  cardbarNextSmall: { fontFamily: ff.semibold, fontSize: fs.micro, opacity: 0.85 },

  /* --------------------------------------------------------- the board chrome */

  /** `.frame` — the 7pt padded surround with its inner highlight. */
  frame: {
    padding: space.px7,
    borderRadius: radius.cardLg,
    backgroundColor: color.frame,
    borderWidth: lineWidth.hairline,
    borderColor: color.line2,
  },
  /** `.tray` — the chalk ledge under a board. */
  tray: {
    height: space.px8,
    marginTop: space.px5,
    marginHorizontal: space.px10,
    borderBottomLeftRadius: radius.icon,
    borderBottomRightRadius: radius.icon,
    backgroundColor: '#1f2a3d',
    borderWidth: lineWidth.hairline,
    borderTopWidth: 0,
    borderColor: color.line,
  },
  trayChalk: {
    position: 'absolute',
    left: space.px16,
    top: -space.px3,
    width: 22,
    height: space.px4,
    borderRadius: radius.xs,
    backgroundColor: color.chalk,
    opacity: 0.8,
  },
  /** `.board .st` — the pill in the board's top-left corner. */
  boardSt: {
    position: 'absolute',
    left: space.px10,
    top: space.px10,
    backgroundColor: 'rgba(11, 18, 32, 0.85)',
    borderWidth: lineWidth.hairline,
    borderColor: color.line,
    borderRadius: radius.pill,
    paddingVertical: space.px3,
    paddingHorizontal: space.px9,
  },
  boardStText: {
    fontFamily: ff.bold,
    fontSize: fs.micro,
    letterSpacing: track(fs.micro, ls.capsWider),
    textTransform: 'uppercase',
    color: color.mute,
  },
  /**
   * `.board .cap` — a frame's caption, bottom-left.
   *
   * TWO NUMBERS CHANGED BY PLAYBOOK-DIAGRAM-TABS, and both fix the same
   * pre-existing clip. The caption is absolute inside `frame`, whose last
   * child is the `tray` (8 high, 5 above it) — so at `bottom: 8` the pill sat
   * ON the ledge, and the ledge, being the later sibling, painted over its
   * descenders. `20` clears the tray and lands the pill just inside the
   * board's own bottom edge, where it was meant to be.
   *
   * `right` existed nowhere, so a long caption — "Ring 1 on the ball · ring 2
   * around it · ring 3 shapes the rest" — ran one line off the frame. It now
   * wraps. This was always true of the six two-frame cards; it was simply
   * never looked at, because until the tab row there was no way to see any
   * caption but the last frame's.
   */
  boardCap: {
    position: 'absolute',
    left: space.px10,
    right: space.px10,
    bottom: space.px20,
    backgroundColor: 'rgba(11, 18, 32, 0.85)',
    borderRadius: radius.pill,
    paddingVertical: space.px3,
    paddingHorizontal: space.px9,
  },
  boardCapText: {
    fontFamily: ff.bold,
    fontSize: fs.micro,
    letterSpacing: track(fs.micro, ls.caps),
    textTransform: 'uppercase',
    color: color.chalk,
  },
  /** `.dside` / `.dband` — the F3 thirds and F4 far-side labels. */
  dside: { flexDirection: 'row' },
  dband: {
    width: 84,
    justifyContent: 'space-around',
    paddingVertical: space.px10,
    paddingLeft: space.px8,
    paddingRight: space.px4,
    gap: space.px6,
  },
  dbandLabel: {
    fontSize: fs.tiny,
    lineHeight: line(fs.tiny, lh.caption),
    fontFamily: ff.bold,
    color: color.chalk2,
  },
  dbandSub: { fontFamily: ff.medium, color: color.mute, fontSize: fs.tiny },

  /** `.beats` — one cell per beat, all lit on a static board. */
  beats: { flexDirection: 'row', gap: space.px6 },
  beatCell: {
    flex: 1,
    minHeight: 30,
    borderRadius: radius.control,
    backgroundColor: color.card,
    borderWidth: lineWidth.hairline,
    borderColor: color.line,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: space.px2,
    paddingHorizontal: space.px4,
  },
  beatCellOn: { backgroundColor: color.chalk, borderColor: color.chalk },
  beatText: {
    fontFamily: ff.bold,
    fontSize: fs.dense,
    color: color.mute,
    textAlign: 'center',
    lineHeight: line(fs.dense, lh.tight),
  },
  beatTextOn: { color: color.board },

  /* ---------------------------------------------------- the frame tab row */

  /**
   * `dtabs` / `dtab` — PLAYBOOK-DIAGRAM-TABS.
   *
   * A multi-frame card's frames were drawn one at a time with no way to reach
   * the others (the board showed the LAST, `DiagramBoard`'s own default), so
   * frame 1 of every two-frame card in the book was unreachable. These are the
   * doors to them.
   *
   * THE HEIGHT IS A TAP TARGET, NOT A DESIGN STEP. `control.tab` is 44 —
   * the floor a finger wants — where the book's other small controls sit at
   * 32-42 (`control.chip`, `control.mvchip`, `control.seg2`). A tab is the one
   * control here that a reader presses repeatedly while reading, so it is the
   * one that gets the floor rather than the rhythm.
   *
   * THE ACTIVE TAB'S COLOUR IS NOT HERE. It is the card's SECTION tone, passed
   * in and applied inline, by ruling PLAYBOOK-SECTION-RAIL — the same tone the
   * card's kicker and its row's pip already wear. A card outside any section
   * has no tone and the active tab falls back to `chalk`, which is what every
   * other "on" state in the book uses (`beatCellOn`, `seg2On`, `mvchipOn`).
   */
  dtabs: { flexDirection: 'row', gap: space.px6 },
  dtab: {
    flex: 1,
    minHeight: control.tab,
    borderRadius: radius.control,
    backgroundColor: color.card,
    borderWidth: lineWidth.hairline,
    borderColor: color.line,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.px4,
    gap: space.px1,
  },
  dtabOn: { backgroundColor: color.chalk, borderColor: color.chalk },
  dtabText: { fontFamily: ff.extrabold, fontSize: fs.headerTitle, color: color.chalk2 },
  dtabOnText: { color: color.board },

  /* ------------------------------------------------- the keeper angle board */

  /**
   * `kp*` — PLAYBOOK-KEEPER-ANGLE, the keeper's own panel.
   *
   * Built from the movement panel's parts wherever one fits — the board frame
   * is `frame` + `tray`, the mode chips are `mvchip`, the zone sentence is
   * `rolepanel`'s shape — so the two interactive boards in the book read as
   * one thing. What is new is the READOUT ROW: three numbers the reader
   * watches change as they drag, which no other panel has.
   */
  kpboard: {
    width: '100%',
    backgroundColor: color.board,
    borderRadius: radius.control,
    borderWidth: lineWidth.hairline,
    borderColor: color.line2,
    overflow: 'hidden',
  },
  kpreadouts: { flexDirection: 'row', gap: space.px6 },
  kpcell: {
    flex: 1,
    backgroundColor: color.card,
    borderRadius: radius.control,
    borderWidth: lineWidth.hairline,
    borderColor: color.line,
    paddingVertical: space.px8,
    paddingHorizontal: space.px6,
    alignItems: 'center',
    gap: space.px2,
  },
  kpcellLabel: {
    fontFamily: ff.bold,
    fontSize: fs.micro,
    letterSpacing: track(fs.micro, ls.capsWider),
    textTransform: 'uppercase',
    color: color.mute,
    textAlign: 'center',
  },
  kpcellValue: { fontFamily: ff.extrabold, fontSize: fs.panelName, color: color.chalk },
  kppresets: { flexDirection: 'row', flexWrap: 'wrap', gap: space.px6 },
  kppreset: {
    flexGrow: 1,
    flexBasis: '46%',
    minHeight: control.tab,
    borderRadius: radius.control,
    backgroundColor: color.card,
    borderWidth: lineWidth.hairline,
    borderColor: color.line,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.px8,
  },
  kppresetText: { fontFamily: ff.bold, fontSize: fs.meta, color: color.chalk2, textAlign: 'center' },

  /* ------------------------------------------------- the coach track (ct*) */

  /**
   * PLAYBOOK-COACH-TRACK-MOBILE. The staff screens borrow the book's own
   * parts wherever one fits — rows are `Row`, the progress bar is the
   * contents screen's `bar`/`barFill`, the thread is the family's `qitem` /
   * `qreply`, the composer is `field` / `fieldTextarea`. What is new is a
   * count badge, the roster line and the inbox item's head.
   */
  ctBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: radius.pill,
    paddingHorizontal: space.px6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.pink,
  },
  ctBadgeText: { fontFamily: ff.extrabold, fontSize: fs.micro, color: '#fff' },
  /** The roster line: name on the left, the two numbers on the right. */
  ctLine: { flexDirection: 'row', alignItems: 'baseline', gap: space.px8 },
  ctName: { ...role.titleRowSm, flex: 1, minWidth: 0 },
  ctNums: { fontFamily: ff.bold, fontSize: fs.meta, color: color.chalk2 },
  ctMeta: { fontFamily: ff.medium, fontSize: fs.tiny, color: color.dim },
  ctEmpty: { ...role.caption, textAlign: 'center', paddingVertical: space.px24 },
  /** An inbox item: the kind pill and the who/where line above the body. */
  ctItem: {
    backgroundColor: color.card,
    borderRadius: radius.card,
    borderWidth: lineWidth.hairline,
    borderColor: color.line,
    padding: space.px12,
    gap: space.px6,
  },
  ctItemOpen: { borderColor: color.line2 },
  ctItemHead: { flexDirection: 'row', alignItems: 'center', gap: space.px6 },
  ctItemWho: { ...role.label, color: color.chalk2, flex: 1, minWidth: 0 },
  ctItemBody: {
    fontFamily: ff.medium,
    fontSize: fs.lead,
    lineHeight: line(fs.lead, lh.text),
    color: color.chalk,
  },
  ctList: { gap: space.px8 },

  /** `.cueline` — "Your cue", with the ringed dot. */
  cueline: { flexDirection: 'row', gap: space.px10, alignItems: 'flex-start' },
  cuelineDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: lineWidth.thick,
    borderColor: color.green,
    marginTop: space.px2,
  },
  cuelineText: {
    ...role.bodyLead,
    fontSize: fs.secondary,
    lineHeight: line(fs.secondary, lh.text),
    color: color.chalk2,
  },

  /** `.legend` — us / them / pass / run. */
  legend: { flexDirection: 'row', flexWrap: 'wrap', rowGap: space.px6, columnGap: space.px14 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: space.px6 },
  legendText: { fontSize: fs.meta, fontFamily: ff.medium, color: color.mute },
  lgDot: { width: space.px10, height: space.px10, borderRadius: space.px5 },
  lgLine: { width: 18, borderTopWidth: lineWidth.thick, borderTopColor: color.chalk2 },
  lgLineDash: { borderStyle: 'dashed' },

  /** `.iscrow` — the F4 intervention / support / collaboration row. */
  iscrow: { flexDirection: 'row', gap: space.px6 },
  iscCell: {
    flex: 1,
    alignItems: 'center',
    gap: space.px2,
    paddingTop: space.px9,
    paddingBottom: space.px8,
    paddingHorizontal: space.px4,
    borderRadius: radius.card,
    backgroundColor: color.card,
    borderWidth: lineWidth.hairline,
    borderColor: color.line,
  },
  iscKey: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: lineWidth.mid,
    borderColor: color.green,
    backgroundColor: color.board,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iscKeyText: { color: color.green, fontFamily: ff.extrabold, fontSize: fs.secondary },
  iscName: { fontFamily: ff.extrabold, fontSize: fs.secondary, color: color.chalk },
  iscSmall: { fontFamily: ff.medium, fontSize: fs.micro, color: color.mute },

  /* ------------------------------------------------------------ the panels */

  /** `.segrow` / `.seg2` — the panels' tab pairs. */
  segrow: { flexDirection: 'row', gap: space.px6 },
  seg2: {
    flex: 1,
    minHeight: control.seg2,
    borderWidth: lineWidth.hairline,
    borderColor: color.line2,
    backgroundColor: color.card,
    borderRadius: radius.field,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.px6,
  },
  seg2Small: { minHeight: control.segSmall },
  seg2Text: { fontFamily: ff.bold, fontSize: fs.lead, color: color.chalk2, textAlign: 'center' },
  seg2SmallText: { fontSize: fs.meta },
  seg2On: { backgroundColor: color.chalk, borderColor: color.chalk },
  seg2OnText: { color: color.board },
  heatbtn: { minHeight: control.heatButton },

  /** `.ramp` — the heat-map colour ramp. */
  ramp: { flexDirection: 'row', alignItems: 'center', gap: space.px10 },
  rampText: { fontSize: fs.micro, color: color.mute, fontFamily: ff.semibold },

  /** `.rolepanel` — the shirt-number disc and its paragraph. */
  rolepanel: {
    flexDirection: 'row',
    gap: space.px12,
    alignItems: 'flex-start',
    backgroundColor: color.card,
    borderWidth: lineWidth.hairline,
    borderColor: color.line,
    borderRadius: radius.card,
    paddingVertical: space.px12,
    paddingHorizontal: space.px14,
  },
  rolepanelNum: {
    width: control.rolePanelNum,
    height: control.rolePanelNum,
    borderRadius: control.rolePanelNum / 2,
    backgroundColor: color.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rolepanelNumText: { color: color.greenInk, fontFamily: ff.extrabold, fontSize: fs.panelName },
  rolepanelBody: { flex: 1, minWidth: 0 },
  rolepanelLabel: { ...role.label, marginBottom: space.px3 },
  rolepanelText: {
    ...role.body,
    fontSize: fs.panelBody,
    lineHeight: line(fs.panelBody, lh.prose),
  },

  /** `.keys` — the little key-word pills under a role. */
  keys: { flexDirection: 'row', flexWrap: 'wrap', gap: space.px6, marginTop: space.px8 },
  keyPill: {
    borderWidth: lineWidth.hairline,
    borderColor: color.line2,
    borderRadius: radius.pill,
    backgroundColor: color.card2,
    paddingVertical: space.px3,
    paddingHorizontal: space.px10,
  },
  keyPillText: { fontSize: fs.dense, fontFamily: ff.bold, color: color.chalk2 },

  /** `.numlist` — the shirt-numbers table. */
  numlist: { gap: space.px6 },
  numlistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.px10,
    paddingVertical: space.px8,
    paddingHorizontal: space.px10,
    borderRadius: radius.field,
    backgroundColor: color.card,
    borderWidth: lineWidth.hairline,
    borderColor: color.line,
  },
  numlistNum: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: color.card2,
    borderWidth: lineWidth.mid,
    borderColor: color.line2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numlistNumText: { fontFamily: ff.extrabold, fontSize: fs.secondary, color: color.chalk },
  numlistAbbr: {
    width: 42,
    fontFamily: ff.extrabold,
    fontSize: fs.meta,
    letterSpacing: track(fs.meta, ls.caps),
    color: color.green,
  },
  numlistName: {
    flex: 1,
    fontFamily: ff.bold,
    fontSize: fs.lead,
    lineHeight: line(fs.lead, lh.compact),
    color: color.chalk,
  },
  numlistRole: {
    fontFamily: ff.regular,
    fontSize: fs.chipAlt,
    color: color.mute,
    lineHeight: line(fs.chipAlt, lh.option),
  },

  /** `.mvgroup` / `.mvchip` / `.mvroles` — the movement panel's controls. */
  mvgroup: { gap: space.px6 },
  mvgroupLabel: { ...role.label, letterSpacing: track(fs.micro, ls.capsWider) },
  mvchips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.px6 },
  mvchip: {
    minHeight: control.mvchip,
    paddingHorizontal: space.px12,
    borderRadius: radius.pill,
    borderWidth: lineWidth.hairline,
    borderColor: color.line2,
    backgroundColor: color.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mvchipText: { fontFamily: ff.bold, fontSize: fs.chipAlt, color: color.chalk2 },
  mvchipOn: { backgroundColor: color.chalk, borderColor: color.chalk },
  mvchipOnText: { color: color.board },
  mvroles: { flexDirection: 'row', flexWrap: 'wrap', rowGap: space.px6, columnGap: space.px14 },
  mvroleItem: { flexDirection: 'row', alignItems: 'center', gap: space.px6 },
  mvroleKey: {
    width: 22,
    height: 20,
    borderRadius: radius.icon,
    borderWidth: lineWidth.mid,
    backgroundColor: color.board,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mvroleKeyText: { fontFamily: ff.extrabold, fontSize: fs.micro },
  mvroleText: { fontSize: fs.meta, color: color.mute, fontFamily: ff.semibold },

  /* -------------------------------------------------------------- the quiz */

  /** `.bug` — the question counter and the score. */
  bug: { flexDirection: 'row', alignItems: 'center', gap: space.px10 },
  bugBody: { flex: 1, minWidth: 0 },
  bugTitle: {
    fontFamily: ff.bold,
    fontSize: fs.meta,
    letterSpacing: track(fs.meta, ls.capsWider),
    textTransform: 'uppercase',
    color: color.mute,
  },
  qpips: { flexDirection: 'row', gap: space.px5, marginTop: space.px6 },
  qpip: {
    width: 11,
    height: 11,
    borderRadius: 5.5,
    borderWidth: lineWidth.thick,
    borderColor: color.line2,
  },
  qpipCur: { borderColor: color.chalk },
  qpipOk: { backgroundColor: color.green, borderColor: color.green },
  qpipNo: { backgroundColor: color.bad, borderColor: color.bad },
  scoreBox: { alignItems: 'flex-end' },
  scoreLabel: {
    fontFamily: ff.bold,
    fontSize: fs.tiny,
    letterSpacing: track(fs.tiny, ls.tape),
    textTransform: 'uppercase',
    color: color.mute,
  },
  scoreValue: {
    fontFamily: ff.extrabold,
    fontSize: fs.score,
    lineHeight: line(fs.score, lh.flush),
    color: color.chalk,
  },

  /** `.timer` — the per-question bar. */
  timer: { height: space.px6, borderRadius: radius.sm, backgroundColor: color.card, overflow: 'hidden' },
  timerFill: { height: '100%', backgroundColor: color.green },
  timerLow: { backgroundColor: color.bad },

  /** `.q` — the question itself. */
  q: {
    fontFamily: ff.extrabold,
    fontSize: fs.question,
    lineHeight: line(fs.question, lh.snug),
    color: color.chalk,
  },

  /** `.opt` — one answer. */
  opts: { gap: space.px8 },
  opt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.px12,
    borderRadius: radius.card,
    borderWidth: lineWidth.mid,
    borderColor: color.line2,
    backgroundColor: color.card,
    paddingVertical: space.px12,
    paddingHorizontal: space.px14,
    minHeight: control.option,
  },
  optKey: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: lineWidth.mid,
    borderColor: color.line2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optKeyText: { fontFamily: ff.extrabold, fontSize: fs.meta, color: color.mute },
  optText: {
    flex: 1,
    fontSize: fs.body,
    fontFamily: ff.semibold,
    lineHeight: line(fs.body, lh.option),
    color: color.chalk,
  },
  optYes: { borderColor: color.green },
  optYesKey: { backgroundColor: color.green, borderColor: color.green },
  optYesKeyText: { color: color.greenInk },
  optNo: { borderColor: color.bad },
  optNoKey: { backgroundColor: color.bad, borderColor: color.bad },
  optNoKeyText: { color: '#2a0510' },

  /** `.coach` — the verdict line under the board. */
  coach: {
    flexDirection: 'row',
    gap: space.px10,
    alignItems: 'center',
    minHeight: control.option,
    paddingVertical: space.px10,
    paddingHorizontal: space.px14,
    borderRadius: radius.cardLg,
    backgroundColor: color.card,
    borderWidth: lineWidth.hairline,
    borderColor: color.line,
  },
  coachDot: {
    width: space.px10,
    height: space.px10,
    borderRadius: space.px5,
    backgroundColor: color.mute,
  },
  coachDotGood: { backgroundColor: color.green },
  coachDotBad: { backgroundColor: color.bad },
  coachBody: { flex: 1, minWidth: 0 },
  coachText: {
    fontFamily: ff.bold,
    fontSize: fs.button,
    lineHeight: line(fs.button, lh.tight),
    color: color.chalk,
  },
  coachTextGood: { color: color.green },
  coachTextBad: { color: color.bad },
  coachSmall: {
    fontFamily: ff.regular,
    fontSize: fs.secondary,
    color: color.mute,
    marginTop: space.px2,
  },

  /** `.count3` — the 3-2-1 before the first question. */
  count3: { minHeight: 200, alignItems: 'center', justifyContent: 'center' },
  count3Text: {
    fontFamily: ff.extrabold,
    fontSize: fs.countdown,
    lineHeight: line(fs.countdown, lh.solid),
    color: color.green,
  },

  /** `.res` — the results screen. */
  res: { alignItems: 'center', gap: space.px14, paddingTop: space.px18 },
  resBig: {
    fontFamily: ff.extrabold,
    fontSize: fs.resultBig,
    lineHeight: line(fs.resultBig, lh.solid),
    color: color.chalk,
  },
  resBigSmall: { ...role.caption, fontSize: fs.rowName, lineHeight: line(fs.rowName, lh.solid) },
  medalbig: {
    width: control.medalBig,
    height: control.medalBig,
    borderRadius: control.medalBig / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  medalbigText: {
    fontFamily: ff.extrabold,
    fontSize: fs.body,
    letterSpacing: track(fs.body, ls.capsWide),
    textTransform: 'uppercase',
    color: '#1b1403',
  },
  medalbigNone: {
    backgroundColor: color.card,
    borderWidth: lineWidth.hairline,
    borderColor: color.line2,
  },
  medalbigNoneText: { color: color.mute },

  /* ---------------------------------------------------- the review chips */

  /**
   * MOBILE ONLY, fork QUIZ-REVIEW-NAV (ruling A). The web has no review at
   * all: a reader who wanted to see what they missed reopened the card. One
   * chip per dealt question on the results screen, and the answer read back
   * in a panel on that same screen — no new screen, no retake, and no second
   * source for the verdict, which is still the one the run recorded.
   */
  revchips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.px6, justifyContent: 'center' },
  revchip: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: control.chip,
    paddingHorizontal: space.px10,
    borderRadius: radius.pill,
    borderWidth: lineWidth.hairline,
    borderColor: color.line2,
    backgroundColor: color.card,
  },
  revchipOk: { borderColor: color.green },
  revchipNo: { borderColor: color.bad },
  revchipOn: { borderWidth: lineWidth.mid, backgroundColor: color.card2 },
  revchipText: { fontFamily: ff.bold, fontSize: fs.meta, color: color.chalk2 },
  revchipTextOk: { color: color.green },
  revchipTextNo: { color: color.bad },
  revpanel: {
    alignSelf: 'stretch',
    gap: space.px8,
    borderWidth: lineWidth.hairline,
    borderColor: color.line,
    borderRadius: radius.cardLg,
    backgroundColor: color.card,
    paddingVertical: space.px12,
    paddingHorizontal: space.px14,
  },
  revmeta: {
    fontFamily: ff.bold,
    fontSize: fs.micro,
    letterSpacing: track(fs.micro, ls.capsWider),
    textTransform: 'uppercase',
    color: color.dim,
  },
  revq: {
    fontFamily: ff.extrabold,
    fontSize: fs.button,
    lineHeight: line(fs.button, lh.snug),
    color: color.chalk,
  },
  revrow: { gap: space.px2 },
  revlabel: role.label,
  revtext: { ...role.bodyLead, color: color.chalk2 },
  revtextOk: { color: color.green },
  revtextNo: { color: color.bad },

  /* ---------------------------------------------- search, forms, the cover */

  /** `.searchbox` */
  searchbox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.px10,
    borderWidth: lineWidth.mid,
    borderColor: color.line2,
    borderRadius: radius.card,
    backgroundColor: 'rgba(11, 18, 32, 0.7)',
    paddingHorizontal: space.px12,
    minHeight: control.rowCompact,
  },
  searchboxOn: { borderColor: color.green },
  searchInput: {
    ...role.body,
    flex: 1,
    minWidth: 0,
    lineHeight: undefined,
    paddingVertical: space.px12,
  },
  searchClear: { ...role.caption, fontSize: fs.panelName, lineHeight: undefined, padding: space.px4 },

  /** `.sres .hit` — one search result. */
  sres: { gap: space.px8 },
  hit: {
    gap: space.px3,
    borderWidth: lineWidth.hairline,
    borderColor: color.line,
    borderRadius: radius.card,
    backgroundColor: color.card,
    paddingVertical: space.px10,
    paddingHorizontal: space.px12,
  },
  hitEyebrow: {
    ...role.labelAccent,
    fontSize: fs.hitEyebrow,
    letterSpacing: track(fs.hitEyebrow, ls.capsWide),
  },
  hitName: {
    ...role.titleRowSm,
    fontSize: fs.button,
    lineHeight: line(fs.button, lh.snug),
    letterSpacing: track(fs.button, ls.heading),
  },
  hitBody: { ...role.bodyLead, fontSize: fs.secondary, lineHeight: line(fs.secondary, lh.text) },
  /** `.sres mark` — a matched word. */
  mark: { backgroundColor: 'rgba(16, 185, 129, 0.24)', color: color.chalk },
  /**
   * The pressed face for the two CROSS-LINK surfaces — a search hit and a
   * green link chip. Both were `Pressable`s with no feedback at all, which
   * ruling PLAYBOOK-TYPE-PASS-E's "one consistent cue" does not allow. The
   * cue is the chevron they now carry; this is the press that confirms it.
   */
  pressed: { opacity: 0.65 },

  /** `.field` — a labelled input. */
  field: { gap: space.px4 },
  fieldLabel: role.label,
  fieldInput: {
    ...role.body,
    borderWidth: lineWidth.hairline,
    borderColor: color.line2,
    borderRadius: radius.field,
    backgroundColor: color.board,
    paddingVertical: space.px10,
    paddingHorizontal: space.px12,
    lineHeight: line(fs.body, lh.text),
  },
  fieldTextarea: { minHeight: 58, textAlignVertical: 'top' },

  /** `.qform` / `.qstatus` / `.qlist` / `.qitem` — questions & notes. */
  qform: {
    gap: space.px10,
    borderWidth: lineWidth.hairline,
    borderColor: color.line2,
    borderRadius: radius.cardLg,
    backgroundColor: color.card,
    padding: space.px12,
  },
  qstatus: { ...role.caption, fontSize: fs.chipAlt, minHeight: 18 },
  qlist: { gap: space.px8 },
  qitem: {
    borderWidth: lineWidth.hairline,
    borderColor: color.line,
    borderRadius: radius.card,
    backgroundColor: color.card,
    paddingVertical: space.px10,
    paddingHorizontal: space.px12,
    gap: space.px6,
  },
  qitemDone: { borderColor: 'rgba(16, 185, 129, 0.4)' },
  qhead: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.px8 },
  qmeta: { ...role.captionSm, flex: 1 },
  qtext: { ...role.bodyLead, color: color.chalk },
  qreply: { borderLeftWidth: lineWidth.accent, borderLeftColor: color.green, paddingLeft: space.px10, paddingVertical: space.px4 },
  qreplyLabel: { ...role.labelAccent, letterSpacing: track(fs.micro, ls.capsWider) },
  qreplyText: {
    ...role.body,
    fontSize: fs.linkchip,
    lineHeight: line(fs.linkchip, lh.prose),
    marginTop: space.px2,
  },
  /** `.qrow` — the dashed "Questions & notes" row. */
  qrow: {
    borderWidth: lineWidth.hairline,
    borderColor: color.line2,
    borderStyle: 'dashed',
    borderRadius: radius.card,
    paddingVertical: space.px12,
    paddingHorizontal: space.px14,
    marginTop: space.px4,
  },

  /** `.cover*` — the cover screen. */
  cover: { gap: space.px14 },
  coverTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  coverTitle: {
    fontFamily: ff.extrabold,
    fontSize: fs.coverTitle,
    lineHeight: line(fs.coverTitle, lh.flush),
    letterSpacing: track(fs.coverTitle, ls.headingXl),
    color: color.chalk,
    marginTop: space.px4,
  },
  coverTitleRule: {
    height: space.px3,
    borderRadius: radius.xs,
    backgroundColor: color.green,
    marginTop: space.px2,
    marginRight: '60%',
  },
  coverSub: { fontSize: fs.headerTitle, fontFamily: ff.semibold, color: color.chalk2 },
  coverLead: { ...role.body, color: color.mute },
  coverHow: {
    borderWidth: lineWidth.hairline,
    borderColor: color.line2,
    borderRadius: radius.cardLg,
    backgroundColor: color.card,
    paddingVertical: space.px12,
    paddingHorizontal: space.px14,
    gap: space.px10,
  },
  coverHowStep: { flexDirection: 'row', gap: space.px10, alignItems: 'flex-start' },
  coverHowKey: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: lineWidth.mid,
    borderColor: color.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverHowKeyText: { color: color.green, fontFamily: ff.extrabold, fontSize: fs.secondary },
  coverHowBody: { flex: 1, minWidth: 0 },
  coverHowName: { color: color.chalk, fontFamily: ff.bold, fontSize: fs.body },
  coverHowText: { ...role.bodyLead, lineHeight: line(fs.lead, lh.text) },
  coverChs: { flexDirection: 'row', flexWrap: 'wrap', gap: space.px6 },
  coverChip: {
    borderWidth: lineWidth.hairline,
    borderColor: color.line2,
    borderStyle: 'dashed',
    borderRadius: radius.pill,
    paddingVertical: space.px4,
    paddingHorizontal: space.px11,
  },
  coverChipText: { fontSize: fs.meta, fontFamily: ff.bold, color: color.chalk2 },
  coverBy: {
    fontSize: fs.dense,
    fontFamily: ff.bold,
    letterSpacing: track(fs.dense, ls.capsWider),
    textTransform: 'uppercase',
    color: color.dim,
  },
});

/** `.pbkd-band` — the doodle bands. Not in `pbk` because `Doodles.tsx` owns them. */
export const bandStyles = StyleSheet.create({
  band: { flexDirection: 'row', alignItems: 'flex-end', gap: space.px18 },
  bandTop: { justifyContent: 'flex-end', marginBottom: -space.px6 },
  bandFoot: { justifyContent: 'space-between', marginTop: -space.px2 },
});
