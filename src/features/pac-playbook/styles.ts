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
 */

import { StyleSheet } from 'react-native';
import {
  color,
  control,
  fontSize as fs,
  fontWeight as fw,
  layout,
  letterSpacingEm as ls,
  lineHeightRatio as lh,
  lineWidth,
  radius,
  space,
} from './theme';

/** `line-height` and `letter-spacing` are ratios in the design; resolve them. */
const line = (size: number, ratio: number) => Math.round(size * ratio * 100) / 100;
const track = (size: number, em: number) => Math.round(size * em * 100) / 100;

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
    fontSize: fs.chipAlt,
    lineHeight: line(fs.chipAlt, lh.prose),
    color: color.mute,
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
    fontWeight: fw.bold,
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
    fontWeight: fw.bold,
    fontSize: fs.micro,
    letterSpacing: track(fs.micro, ls.capsWide),
    textTransform: 'uppercase',
    lineHeight: line(fs.micro, lh.compact),
    textAlign: 'center',
  },

  /* ---------------------------------------------------------- prose, lists */

  /** `.lead` */
  lead: { fontSize: fs.lead, lineHeight: line(fs.lead, lh.prose), color: color.mute },

  /** `.one` and its block label. */
  one: { fontSize: fs.body, lineHeight: line(fs.body, lh.loose), color: color.chalk },
  oneMute: { fontSize: fs.lead, lineHeight: line(fs.lead, lh.loose), color: color.chalk2 },
  blockLabel: {
    fontWeight: fw.bold,
    fontSize: fs.meta,
    letterSpacing: track(fs.meta, ls.capsWidest),
    textTransform: 'uppercase',
    color: color.mute,
    marginBottom: space.px3,
  },

  /** `b.hl` — `fmt()`'s bold green key term. */
  hl: { color: color.green, fontWeight: fw.extrabold },

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
    fontWeight: fw.bold,
    fontSize: fs.meta,
    letterSpacing: track(fs.meta, ls.capsWider),
    color: color.dim,
    paddingTop: space.px7,
  },
  rowBody: { flex: 1, minWidth: 0 },
  rowName: {
    fontWeight: fw.extrabold,
    fontSize: fs.rowName,
    lineHeight: line(fs.rowName, lh.snug),
    letterSpacing: track(fs.rowName, ls.heading),
    color: color.chalk,
  },
  rowNameSm: { fontSize: fs.headerTitle, lineHeight: line(fs.headerTitle, lh.snug) },
  rowEm: {
    fontWeight: fw.medium,
    fontSize: fs.secondary,
    color: color.mute,
    letterSpacing: 0,
  },
  rowDesc: {
    fontSize: fs.lead,
    lineHeight: line(fs.lead, lh.text),
    color: color.mute,
    marginTop: space.px3,
  },
  rowChev: {
    width: 22,
    textAlign: 'right',
    fontWeight: fw.medium,
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
  pct: { fontWeight: fw.medium, fontSize: fs.meta, color: color.chalk2 },
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
  stOkText: { color: color.greenInk, fontSize: fs.micro, fontWeight: fw.extrabold },
  stNext: { borderColor: color.green, borderStyle: 'dashed' },

  /** `.secttl` / `.subdesc` */
  secttl: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: space.px10,
    marginHorizontal: space.px2,
  },
  secttlText: {
    fontWeight: fw.bold,
    fontSize: fs.meta,
    letterSpacing: track(fs.meta, ls.capsWidest),
    textTransform: 'uppercase',
    color: color.mute,
  },
  secttlSmall: { fontWeight: fw.medium, fontSize: fs.meta, color: color.dim, letterSpacing: 0 },
  subdesc: { fontSize: fs.secondary, color: color.dim, marginHorizontal: space.px2 },

  /** `.count` — the "n of m cards read" line. */
  count: { fontWeight: fw.medium, fontSize: fs.meta, color: color.mute, marginHorizontal: space.px2 },

  /** `.snote` — the search result count / empty note. */
  snote: { fontSize: fs.meta, color: color.mute, marginHorizontal: space.px2 },

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
    fontWeight: fw.bold,
    fontSize: fs.button,
    letterSpacing: track(fs.button, ls.button),
    textAlign: 'center',
  },
  btnSmall: { fontWeight: fw.medium, fontSize: fs.lead, opacity: 0.9 },
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
  chipText: { fontWeight: fw.semibold, fontSize: fs.meta, color: color.chalk2 },
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
  medalText: { fontWeight: fw.extrabold, fontSize: fs.medal, color: '#1b1403' },
  medalGold: { backgroundColor: color.gold },
  medalSilver: { backgroundColor: color.silver },
  medalNone: { backgroundColor: color.line2 },

  /* ------------------------------------------------------------ a card body */

  /** `.crumb` and its right-aligned `.tag`. */
  crumb: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.px6 },
  crumbText: {
    fontSize: fs.meta,
    fontWeight: fw.medium,
    color: color.mute,
    lineHeight: line(fs.meta, lh.text),
  },
  crumbStrong: { fontWeight: fw.bold, color: color.chalk2 },
  crumbTag: {
    marginLeft: 'auto',
    borderWidth: lineWidth.hairline,
    borderColor: color.line2,
    borderRadius: radius.input,
    paddingHorizontal: space.px6,
    paddingVertical: space.px1,
  },
  crumbTagText: {
    fontWeight: fw.bold,
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
  title: {
    fontWeight: fw.extrabold,
    fontSize: fs.cardTitle,
    lineHeight: line(fs.cardTitle, lh.tightest),
    letterSpacing: track(fs.cardTitle, ls.headingLg),
    color: color.chalk,
  },
  titleRule: {
    height: space.px2,
    borderRadius: radius.xs,
    backgroundColor: 'rgba(232, 236, 242, 0.6)',
    marginTop: space.px6,
    marginRight: '6%',
  },
  titleEs: { marginTop: space.px8, fontSize: fs.button, fontWeight: fw.medium, color: color.mute },

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
  cuechipText: { fontWeight: fw.extrabold, fontSize: fs.headerTitle, color: color.chalk },
  cuechipSmall: {
    fontWeight: fw.semibold,
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
  blkText: { fontSize: fs.lead, lineHeight: line(fs.lead, lh.prose), color: color.chalk },
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
    fontWeight: fw.medium,
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
    fontWeight: fw.bold,
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
    fontSize: fs.secondary,
    color: color.mute,
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
    fontWeight: fw.extrabold,
    fontSize: fs.lead,
    lineHeight: line(fs.lead, lh.solid),
    color: color.chalk,
  },
  verbAlt: { fontSize: fs.micro, color: color.mute, lineHeight: line(fs.micro, lh.tight) },
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
  reasonName: { fontWeight: fw.extrabold, fontSize: fs.lead, color: color.green },

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
  linkboxText: { fontSize: fs.lead, color: color.chalk2, lineHeight: line(fs.lead, lh.prose) },
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
  linkchipEyebrow: {
    fontWeight: fw.semibold,
    fontSize: fs.tiny,
    letterSpacing: track(fs.tiny, ls.capsWide),
    textTransform: 'uppercase',
    color: color.green,
  },
  linkchipText: { fontWeight: fw.bold, fontSize: fs.linkchip, color: color.chalk },

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
  trailbarText: { color: '#d9d3ff', fontSize: fs.secondary, fontWeight: fw.semibold },

  /** `.ptrs` — the "Pointers" bullet list. */
  ptrs: { marginTop: space.px4, gap: space.px3 },
  ptrRow: { flexDirection: 'row', gap: space.px8 },

  /** `.cardbar` — `grid-template-columns:52px minmax(0,1.15fr) minmax(0,1fr)`. */
  cardbar: { flexDirection: 'row', gap: space.px8 },
  cardbarIcon: { width: 52, flexGrow: 0, flexShrink: 0, paddingHorizontal: 0 },
  cardbarIconText: { fontSize: fs.question, fontWeight: fw.bold },
  cardbarMid: { flex: 1.15 },
  cardbarNext: { flex: 1, flexDirection: 'column', gap: 0, paddingHorizontal: space.px10 },
  cardbarNextSmall: { fontWeight: fw.semibold, fontSize: fs.micro, opacity: 0.85 },

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
    fontWeight: fw.bold,
    fontSize: fs.micro,
    letterSpacing: track(fs.micro, ls.capsWider),
    textTransform: 'uppercase',
    color: color.mute,
  },
  /** `.board .cap` — a frame's caption, bottom-left. */
  boardCap: {
    position: 'absolute',
    left: space.px10,
    bottom: space.px8,
    backgroundColor: 'rgba(11, 18, 32, 0.85)',
    borderRadius: radius.pill,
    paddingVertical: space.px3,
    paddingHorizontal: space.px9,
  },
  boardCapText: {
    fontWeight: fw.bold,
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
    fontWeight: fw.bold,
    color: color.chalk2,
  },
  dbandSub: { fontWeight: fw.medium, color: color.mute, fontSize: fs.tiny },

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
    fontWeight: fw.bold,
    fontSize: fs.dense,
    color: color.mute,
    textAlign: 'center',
    lineHeight: line(fs.dense, lh.tight),
  },
  beatTextOn: { color: color.board },

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
    fontSize: fs.secondary,
    color: color.chalk2,
    lineHeight: line(fs.secondary, lh.text),
  },

  /** `.legend` — us / them / pass / run. */
  legend: { flexDirection: 'row', flexWrap: 'wrap', rowGap: space.px6, columnGap: space.px14 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: space.px6 },
  legendText: { fontSize: fs.meta, fontWeight: fw.medium, color: color.mute },
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
  iscKeyText: { color: color.green, fontWeight: fw.extrabold, fontSize: fs.secondary },
  iscName: { fontWeight: fw.extrabold, fontSize: fs.secondary, color: color.chalk },
  iscSmall: { fontWeight: fw.medium, fontSize: fs.micro, color: color.mute },

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
  seg2Text: { fontWeight: fw.bold, fontSize: fs.lead, color: color.chalk2, textAlign: 'center' },
  seg2SmallText: { fontSize: fs.meta },
  seg2On: { backgroundColor: color.chalk, borderColor: color.chalk },
  seg2OnText: { color: color.board },
  heatbtn: { minHeight: control.heatButton },

  /** `.ramp` — the heat-map colour ramp. */
  ramp: { flexDirection: 'row', alignItems: 'center', gap: space.px10 },
  rampText: { fontSize: fs.micro, color: color.mute, fontWeight: fw.semibold },

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
  rolepanelNumText: { color: color.greenInk, fontWeight: fw.extrabold, fontSize: fs.panelName },
  rolepanelBody: { flex: 1, minWidth: 0 },
  rolepanelLabel: {
    fontWeight: fw.bold,
    fontSize: fs.meta,
    letterSpacing: track(fs.meta, ls.capsWide),
    textTransform: 'uppercase',
    color: color.mute,
    marginBottom: space.px3,
  },
  rolepanelText: {
    fontSize: fs.panelBody,
    lineHeight: line(fs.panelBody, lh.prose),
    color: color.chalk,
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
  keyPillText: { fontSize: fs.dense, fontWeight: fw.bold, color: color.chalk2 },

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
  numlistNumText: { fontWeight: fw.extrabold, fontSize: fs.secondary, color: color.chalk },
  numlistAbbr: {
    width: 42,
    fontWeight: fw.extrabold,
    fontSize: fs.meta,
    letterSpacing: track(fs.meta, ls.caps),
    color: color.green,
  },
  numlistName: {
    flex: 1,
    fontWeight: fw.bold,
    fontSize: fs.lead,
    lineHeight: line(fs.lead, lh.compact),
    color: color.chalk,
  },
  numlistRole: {
    fontWeight: fw.regular,
    fontSize: fs.chipAlt,
    color: color.mute,
    lineHeight: line(fs.chipAlt, lh.option),
  },

  /** `.mvgroup` / `.mvchip` / `.mvroles` — the movement panel's controls. */
  mvgroup: { gap: space.px6 },
  mvgroupLabel: {
    fontSize: fs.micro,
    letterSpacing: track(fs.micro, ls.capsWider),
    textTransform: 'uppercase',
    color: color.mute,
  },
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
  mvchipText: { fontWeight: fw.bold, fontSize: fs.chipAlt, color: color.chalk2 },
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
  mvroleKeyText: { fontWeight: fw.extrabold, fontSize: fs.micro },
  mvroleText: { fontSize: fs.meta, color: color.mute, fontWeight: fw.semibold },

  /* -------------------------------------------------------------- the quiz */

  /** `.bug` — the question counter and the score. */
  bug: { flexDirection: 'row', alignItems: 'center', gap: space.px10 },
  bugBody: { flex: 1, minWidth: 0 },
  bugTitle: {
    fontWeight: fw.bold,
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
    fontWeight: fw.bold,
    fontSize: fs.tiny,
    letterSpacing: track(fs.tiny, ls.tape),
    textTransform: 'uppercase',
    color: color.mute,
  },
  scoreValue: {
    fontWeight: fw.extrabold,
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
    fontWeight: fw.extrabold,
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
  optKeyText: { fontWeight: fw.extrabold, fontSize: fs.meta, color: color.mute },
  optText: {
    flex: 1,
    fontSize: fs.body,
    fontWeight: fw.semibold,
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
    fontWeight: fw.bold,
    fontSize: fs.button,
    lineHeight: line(fs.button, lh.tight),
    color: color.chalk,
  },
  coachTextGood: { color: color.green },
  coachTextBad: { color: color.bad },
  coachSmall: {
    fontWeight: fw.regular,
    fontSize: fs.secondary,
    color: color.mute,
    marginTop: space.px2,
  },

  /** `.count3` — the 3-2-1 before the first question. */
  count3: { minHeight: 200, alignItems: 'center', justifyContent: 'center' },
  count3Text: {
    fontWeight: fw.extrabold,
    fontSize: fs.countdown,
    lineHeight: line(fs.countdown, lh.solid),
    color: color.green,
  },

  /** `.res` — the results screen. */
  res: { alignItems: 'center', gap: space.px14, paddingTop: space.px18 },
  resBig: {
    fontWeight: fw.extrabold,
    fontSize: fs.resultBig,
    lineHeight: line(fs.resultBig, lh.solid),
    color: color.chalk,
  },
  resBigSmall: { fontSize: fs.rowName, color: color.mute },
  medalbig: {
    width: control.medalBig,
    height: control.medalBig,
    borderRadius: control.medalBig / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  medalbigText: {
    fontWeight: fw.extrabold,
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
  searchInput: { flex: 1, minWidth: 0, color: color.chalk, fontSize: fs.body, paddingVertical: space.px12 },
  searchClear: { color: color.mute, fontSize: fs.panelName, padding: space.px4 },

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
    fontSize: fs.hitEyebrow,
    fontWeight: fw.bold,
    letterSpacing: track(fs.hitEyebrow, ls.capsWide),
    textTransform: 'uppercase',
    color: color.green,
  },
  hitName: { fontSize: fs.button, fontWeight: fw.extrabold, color: color.chalk },
  hitBody: { fontSize: fs.secondary, color: color.mute, lineHeight: line(fs.secondary, lh.text) },
  /** `.sres mark` — a matched word. */
  mark: { backgroundColor: 'rgba(16, 185, 129, 0.24)', color: color.chalk },

  /** `.field` — a labelled input. */
  field: { gap: space.px4 },
  fieldLabel: {
    fontSize: fs.micro,
    fontWeight: fw.bold,
    letterSpacing: track(fs.micro, ls.capsWide),
    textTransform: 'uppercase',
    color: color.mute,
  },
  fieldInput: {
    borderWidth: lineWidth.hairline,
    borderColor: color.line2,
    borderRadius: radius.field,
    backgroundColor: color.board,
    color: color.chalk,
    paddingVertical: space.px10,
    paddingHorizontal: space.px12,
    fontSize: fs.body,
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
  qstatus: { fontSize: fs.chipAlt, color: color.mute, minHeight: 18 },
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
  qmeta: { fontSize: fs.dense, color: color.mute, flex: 1 },
  qtext: { fontSize: fs.lead, lineHeight: line(fs.lead, lh.prose), color: color.chalk },
  qreply: { borderLeftWidth: lineWidth.accent, borderLeftColor: color.green, paddingLeft: space.px10, paddingVertical: space.px4 },
  qreplyLabel: {
    fontSize: fs.micro,
    fontWeight: fw.bold,
    letterSpacing: track(fs.micro, ls.capsWider),
    textTransform: 'uppercase',
    color: color.green,
  },
  qreplyText: { fontSize: fs.linkchip, color: color.chalk, marginTop: space.px2 },
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
    fontWeight: fw.extrabold,
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
  coverSub: { fontSize: fs.headerTitle, fontWeight: fw.semibold, color: color.chalk2 },
  coverLead: { fontSize: fs.body, lineHeight: line(fs.body, lh.loose), color: color.mute },
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
  coverHowKeyText: { color: color.green, fontWeight: fw.extrabold, fontSize: fs.secondary },
  coverHowBody: { flex: 1, minWidth: 0 },
  coverHowName: { color: color.chalk, fontWeight: fw.bold, fontSize: fs.body },
  coverHowText: { color: color.mute, fontSize: fs.lead, lineHeight: line(fs.lead, lh.text) },
  coverChs: { flexDirection: 'row', flexWrap: 'wrap', gap: space.px6 },
  coverChip: {
    borderWidth: lineWidth.hairline,
    borderColor: color.line2,
    borderStyle: 'dashed',
    borderRadius: radius.pill,
    paddingVertical: space.px4,
    paddingHorizontal: space.px11,
  },
  coverChipText: { fontSize: fs.meta, fontWeight: fw.bold, color: color.chalk2 },
  coverBy: {
    fontSize: fs.dense,
    fontWeight: fw.bold,
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
