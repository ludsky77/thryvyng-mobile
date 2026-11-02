/**
 * The Playbook's typographic SCALE — six roles, one place.
 *
 * `theme.ts` holds the design's raw type values: 23 sizes, 5 weights, 12
 * line-height ratios, 10 tracking steps. That is the vocabulary, and it is
 * deliberately large because it mirrors `playbook.css` size for size. What it
 * does not say is which combination means "this is a section" and which means
 * "this is a label inside a card" — so before this file, 20-odd uppercase
 * label styles in `styles.ts` each picked their own size, tracking and ink,
 * and two of them (`secttlText`, the section divider, and `blockLabel`, a
 * block label inside a card) had picked byte-identical values. A reader could
 * not tell a section from a label because they were set the same.
 *
 * This file is the SEMANTIC layer over that vocabulary — ruling
 * PLAYBOOK-TYPE-PASS-E, Lu, 2026-11-01:
 *
 *   "Section kickers must read as a different element than card titles.
 *    One accent per surface, not noisy yet stylish slick."
 *
 * Six roles, and every text style in the book is one of them plus whatever it
 * genuinely needs on top:
 *
 *   kicker    a SECTION divider — the loudest label in the book
 *   label     a block label INSIDE a card — one step down from a kicker
 *   title     the name of the thing being read
 *   subtitle  the second line under a title
 *   body      prose that wraps
 *   caption   counts, metas, small print
 *
 * THE ONE RULE THAT MAKES THE HIERARCHY WORK: a kicker and a label must never
 * be confusable. They differ on all three axes at once — weight (800 vs 700),
 * size (13 vs 12) and ink (`chalk2` vs `mute`) — because any one of those
 * alone is invisible at a glance on a phone. The kicker is the brighter, the
 * heavier and the larger; the label is quiet furniture.
 *
 * NO NUMBER IS WRITTEN HERE. Every value is a `theme.ts` name, so this file
 * cannot become a second source of truth for a size or a colour — it is a set
 * of OPINIONS about theme values, not a copy of them. `theme.ts` stays the one
 * place a Playbook measure is written down (M1's rule, unchanged).
 *
 * EVERY ROLE NAMES A FACE. Archivo is loaded as four separate faces and the
 * face carries the weight (`theme.ts`'s `fontFamily` note), so a role sets
 * `fontFamily` and never `fontWeight`. This is also the fix for what M6 left
 * behind: M6 swapped 83 sites from `fontWeight: fw.X` to `fontFamily: ff.X`,
 * but a style that had never set a `fontWeight` got no `fontFamily` either —
 * so every heading in the book was Archivo while all of its PROSE was still
 * the OS font. Routing prose through `role.body` closes that, which is why
 * this pass changes how the book reads even where it changes no size.
 *
 * NOT FOR THE THREE DOORS. The entry cards in `src/screens/CoursesScreen.tsx`,
 * `src/screens/ClubHubScreen.tsx` and
 * `src/components/dashboards/PlaybookEntryCard.tsx` cannot import this file:
 * they are boot-path screens and the book is a lazy route, so an import here
 * would pull the feature into their bundles (the lazy rule, § E3). They carry
 * the sign's values written out with a citation back to this file, exactly as
 * they already carry `#10b981` and `#1c2637` by value. Ruling ACCENT-A governs
 * what those values are.
 */

import type { TextStyle } from 'react-native';
import {
  color,
  fontFamily as ff,
  fontSize as fs,
  letterSpacingEm as ls,
  lineHeightRatio as lh,
  sectionTones,
  type SectionTone,
} from './theme';

/* ----------------------------------------------------------------- helpers */

/**
 * `line-height` and `letter-spacing` are RATIOS in the design and absolute
 * points in React Native — `theme.ts`'s second and third crossing problems.
 * These two resolve them, and they live here rather than privately in
 * `styles.ts` because `PlaybookHeader.tsx` was rounding its own with a bare
 * `Math.round(fs.x * lh.y)`: two spellings of one rule is how a header starts
 * leading differently from the page under it.
 *
 * Both round to 2dp, which is what RN's layout reads anyway.
 */
export const line = (size: number, ratio: number) => Math.round(size * ratio * 100) / 100;
export const track = (size: number, em: number) => Math.round(size * em * 100) / 100;

/* ---------------------------------------------------------- section tones */

/**
 * THE POSITION RULE — ruling PLAYBOOK-SECTION-RAIL, Lu, 2026-11-02.
 *
 * A section's tone comes from WHERE IT SITS IN ITS CHAPTER, not from its name
 * and not from anything in the content: 1st → green, 2nd → sky, 3rd → teal,
 * 4th → periwinkle, 5th → ice (PLAYBOOK-SECTION-TONE-5), then cycle. So the
 * tones are a reading aid the chapter hands out, and `possession` is green in
 * Principles because it is first there, not because possession is green.
 *
 * THE INDEX IS THE POSITION IN `chapter.content.subs`, the chapter's own
 * declared order — NOT the position among the sections that happen to have
 * cards. A section with no published cards is skipped on screen, and taking
 * the rendered position instead would shift every tone after it the day a
 * card is unpublished.
 *
 * This is the one place the rule is written. Both screens that show a section
 * call it; nothing else assigns a tone.
 */
export const toneFor = (position: number): SectionTone => {
  const n = sectionTones.length;
  return sectionTones[((Math.trunc(position) % n) + n) % n];
};

/* ------------------------------------------------------------------- roles */

/**
 * THE SCALE. Each role is a complete `TextStyle` — face, size, leading,
 * tracking and ink — so a style that spreads one is legible without going on
 * to read `theme.ts`.
 *
 * The size STEPS within a role (`title` vs `titleRow` vs `titleRowSm`) are the
 * book's own: a card title, a list row's name and a short row's name are three
 * sizes `playbook.css` really has, not three inventions. A role with one step
 * has one entry.
 */
export const role = {
  /* ---------------------------------------------------------- the kicker */

  /**
   * A SECTION DIVIDER — "POSSESSION", "DEFENDING", "YOUR MESSAGES".
   *
   * The loudest label in the book, and the only one set in 800: it is the
   * element that says a new part of the list has started, so it has to win
   * against the row names around it, which are themselves 800 at 22pt. It
   * wins on ink and tracking rather than size — `chalk2` is a step brighter
   * than every other label's `mute`, and `capsWidest` is the widest tracking
   * the design has.
   */
  kicker: {
    fontFamily: ff.extrabold,
    fontSize: fs.meta,
    letterSpacing: track(fs.meta, ls.capsWidest),
    lineHeight: line(fs.meta, lh.compact),
    textTransform: 'uppercase',
    color: color.chalk2,
  },

  /** The count that sits at the far end of a kicker's row ("3/6"). */
  kickerCount: {
    fontFamily: ff.medium,
    fontSize: fs.meta,
    letterSpacing: ls.none,
    color: color.dim,
  },

  /* ----------------------------------------------------------- the label */

  /**
   * A BLOCK LABEL INSIDE A CARD — "What you see", "Read", "If not", "Roles".
   *
   * Quiet furniture: it names the paragraph under it and then gets out of the
   * way, so it is 700 at the design's `micro`, one size and one weight below
   * the kicker, in `mute`. Call sites tint it where the design does
   * (`blkLabelRead` green, `blkLabelIfnot` pink) — the ink is the only thing a
   * block label is allowed to vary.
   */
  label: {
    fontFamily: ff.bold,
    fontSize: fs.micro,
    letterSpacing: track(fs.micro, ls.capsWide),
    lineHeight: line(fs.micro, lh.compact),
    textTransform: 'uppercase',
    color: color.mute,
  },

  /**
   * The same label, GREEN — the book's own accent eyebrow. One per surface
   * (the ruling's "one accent per surface"): the search hit's chapter name,
   * the link chip's chapter name, a reply's "COACH".
   */
  labelAccent: {
    fontFamily: ff.bold,
    fontSize: fs.micro,
    letterSpacing: track(fs.micro, ls.capsWide),
    lineHeight: line(fs.micro, lh.compact),
    textTransform: 'uppercase',
    color: color.green,
  },

  /* ----------------------------------------------------------- the titles */

  /** A CARD TITLE — the biggest thing in the book proper. */
  title: {
    fontFamily: ff.extrabold,
    fontSize: fs.cardTitle,
    lineHeight: line(fs.cardTitle, lh.tightest),
    letterSpacing: track(fs.cardTitle, ls.headingLg),
    color: color.chalk,
  },

  /** A CHAPTER or CARD NAME in a list row. */
  titleRow: {
    fontFamily: ff.extrabold,
    fontSize: fs.rowName,
    lineHeight: line(fs.rowName, lh.snug),
    letterSpacing: track(fs.rowName, ls.heading),
    color: color.chalk,
  },

  /** A SHORT row name — a card inside a chapter, the quiz row, a hit. */
  titleRowSm: {
    fontFamily: ff.extrabold,
    fontSize: fs.headerTitle,
    lineHeight: line(fs.headerTitle, lh.snug),
    letterSpacing: track(fs.headerTitle, ls.heading),
    color: color.chalk,
  },

  /* --------------------------------------------------------- the subtitle */

  /**
   * THE SECOND LINE UNDER A TITLE — the other language's name under a card
   * title, the cover's strapline. Never uppercase, never 800: it is the same
   * thought as the title, said quieter.
   */
  subtitle: {
    fontFamily: ff.medium,
    fontSize: fs.button,
    lineHeight: line(fs.button, lh.heading),
    color: color.mute,
  },

  /* ------------------------------------------------------------- the body */

  /**
   * PROSE THAT WRAPS — a card's paragraphs, a quiz option, an answer.
   *
   * 400 and `loose`: this is the one role set in Regular, because it is the
   * only role with more than a line of text in it. Before this pass it had no
   * face at all and rendered in the OS font (see the header's M6 note).
   */
  body: {
    fontFamily: ff.regular,
    fontSize: fs.body,
    lineHeight: line(fs.body, lh.loose),
    color: color.chalk,
  },

  /** A LEAD or a row's description — prose one step down, in `mute`. */
  bodyLead: {
    fontFamily: ff.regular,
    fontSize: fs.lead,
    lineHeight: line(fs.lead, lh.prose),
    color: color.mute,
  },

  /* ---------------------------------------------------------- the caption */

  /**
   * COUNTS, METAS, SMALL PRINT — "4 of 12 cards read", a legend, a stamp's
   * lines. 500 so a number reads at 13pt without shouting.
   */
  caption: {
    fontFamily: ff.medium,
    fontSize: fs.meta,
    lineHeight: line(fs.meta, lh.text),
    color: color.mute,
  },

  /** A caption at the design's smallest useful size — a tag, a keycap. */
  captionSm: {
    fontFamily: ff.medium,
    fontSize: fs.dense,
    lineHeight: line(fs.dense, lh.tight),
    color: color.mute,
  },
} as const satisfies Record<string, TextStyle>;

export type PlaybookRole = keyof typeof role;
