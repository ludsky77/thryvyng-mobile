/**
 * The pieces every screen uses — the components side of `playbook.css`.
 *
 * On the web these are class names a screen puts on a `<div>`: `.tape`,
 * `.stamp`, `.row`, `.btn`, `.chip`, `.medal`, `.cta`, `.secttl`. A class name
 * is free to reuse; a React Native style object is not, because the markup
 * comes with it — `.row` alone is three cells, a chevron and a pressed state.
 * So each one is a component here, named after its class, and the six screens
 * and three panels read as the web's do.
 *
 * Styles live in `styles.ts`, values in `theme.ts`. Nothing in this file holds
 * a colour or a measure of its own.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { pbk } from './styles';
import { color, lineWidth, sectionTones, type SectionTone } from './theme';
import { toneFor } from './type';

/* ---------------------------------------------------------------- the tape */

/** `.tape` / `.tape.tape-xl` — the strip that labels a screen. */
export function Tape({ children, xl }: { children: React.ReactNode; xl?: boolean }) {
  return (
    <View style={[pbk.tape, xl && pbk.tapeXl]}>
      <Text style={[pbk.tapeText, xl && pbk.tapeXlText]} numberOfLines={2}>
        {children}
      </Text>
    </View>
  );
}

/** `.stamp` — the rotated outline box, one line per `·`-separated part. */
export function Stamp({ lines }: { lines: (string | number)[] }) {
  return (
    <View style={pbk.stamp}>
      {lines.map((l, i) => (
        <Text key={i} style={pbk.stampText}>
          {l}
        </Text>
      ))}
    </View>
  );
}

/** `.tophead` — tape left, stamp right. */
export function TopHead({ tape, stamp }: { tape: React.ReactNode; stamp?: React.ReactNode }) {
  return (
    <View style={pbk.tophead}>
      {tape}
      {stamp ?? null}
    </View>
  );
}

/* --------------------------------------------------------------- the rows */

/**
 * `.row` — the list row. `num` is the `.n` cell (chapters have it, cards do
 * not, which is the web's `.row.nonum`); `right` is the chevron or status pip.
 */
export function Row({
  num,
  right,
  onPress,
  children,
  style,
}: {
  num?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      android_ripple={{ color: 'rgba(255,255,255,0.06)' }}
      style={({ pressed }) => [
        pbk.row,
        style,
        pressed && onPress ? styles.rowPressed : null,
      ]}
    >
      {num != null ? <Text style={pbk.rowNum}>{num}</Text> : null}
      <View style={pbk.rowBody}>{children}</View>
      {right ?? null}
    </Pressable>
  );
}

/** `.row .chev` — the right-hand `›`. */
export function Chev() {
  return <Text style={pbk.rowChev}>›</Text>;
}

/** `.row .st` — read ✓, next (dashed ring), or unread. */
export function StatusPip({ state, tone }: { state: 'ok' | 'next' | 'none'; tone?: SectionTone }) {
  // Ruling PLAYBOOK-SECTION-RAIL: a card inside a section wears that
  // section's tone, so a run of ticks reads as belonging to one part of the
  // chapter. A card with no section (the loose list at the head of a chapter)
  // passes no tone and keeps the book's own green.
  const ink = tone?.ink;
  return (
    <View
      style={[
        pbk.st,
        state === 'ok' && pbk.stOk,
        state === 'next' && pbk.stNext,
        ink && state === 'ok' ? { backgroundColor: ink, borderColor: ink } : null,
        ink && state === 'next' ? { borderColor: ink } : null,
      ]}
    >
      {state === 'ok' ? <Text style={[pbk.stOkText, tone && pbk.stOkToneText]}>✓</Text> : null}
    </View>
  );
}

/**
 * ONE MARK PER TONE SLOT — ruling PLAYBOOK-SECTION-RAIL.
 *
 * The content carries no icon for a section (`ChapterSub` is `id`, `name`,
 * `desc` and nothing else), so the mark comes from the same POSITION rule the
 * tone does: 1st ball · 2nd shield · 3rd arrows · 4th target · 5th glove, then
 * cycle (PLAYBOOK-SECTION-TONE-5 — the 5th slot arrived with the 5th tone, and
 * the two have to cycle together, or a section's mark and its colour would come
 * from two different rules). They
 * are drawn here rather than fetched for the reason every icon in this file is
 * — `playbook.css`'s own marks are inline SVG, and there is no icon font in
 * the book.
 *
 * Attribute for attribute the same pen as `Icon` below: a 24-unit box,
 * `stroke-width:2.2`, round caps and joins, no fill except the target's eye.
 */
export function SectionIcon({
  position,
  size = 14,
  color: ink,
}: {
  position: number;
  size?: number;
  color: string;
}) {
  const common = {
    stroke: ink,
    strokeWidth: lineWidth.iconStroke,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };
  // The modulus is `sectionTones.length`, not a literal: the marks and the
  // tones cycle as ONE (PLAYBOOK-SECTION-TONE-5), so a tone added without a
  // mark would put the 6th section's green under the 1st section's ball.
  const n = sectionTones.length;
  const slot = ((Math.trunc(position) % n) + n) % n;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {slot === 0 ? (
        /* ball — the game itself */
        <>
          <Circle cx={12} cy={12} r={8.5} {...common} />
          <Path d="M12 7.6 L16 10.5 L14.5 15.2 L9.5 15.2 L8 10.5 Z" {...common} />
        </>
      ) : slot === 1 ? (
        /* shield — keeping it out */
        <Path d="M12 3.4 L19 6.4 V12 c0 4.4 -3 7.4 -7 8.8 -4 -1.4 -7 -4.4 -7 -8.8 V6.4 Z" {...common} />
      ) : slot === 2 ? (
        /* arrows — the turn, both ways */
        <>
          <Path d="M4 9 H16 M13 6 L16 9 L13 12" {...common} />
          <Path d="M20 15 H8 M11 18 L8 15 L11 12" {...common} />
        </>
      ) : slot === 3 ? (
        /* target — where it is meant to end up.
           A CROSSHAIR, not concentric rings: rings plus a centre dot came out
           as a small circle with something in the middle at 14pt, which is
           exactly what the ball is, and on screen the 1st and 4th sections
           were wearing the same mark. The four ticks break the outline, so
           the two read apart at the size they are actually drawn. */
        <>
          <Circle cx={12} cy={12} r={7} {...common} />
          <Path d="M12 2.5 V6 M12 18 V21.5 M2.5 12 H6 M18 12 H21.5" {...common} />
          <Circle cx={12} cy={12} r={1.7} fill={ink} stroke="none" />
        </>
      ) : (
        /* glove — the keeper's own mark, and the 5th slot's
           (PLAYBOOK-SECTION-TONE-5).

           A MITTEN, not a five-finger hand: at 14pt the icon is 14 points
           across and the stroke lands at 1.28pt (2.2 × 14 / 24), so finger
           slots would close up into a grey block. The silhouette is a
           flat-bottomed, round-topped palm with ONE thumb loop — which is
           what tells it apart from the four before it at that size: the ball
           is a closed circle, the shield tapers to a point DOWN, the arrows
           are two open strokes and the target is a circle with four ticks.
           This is the only mark with a bump on one side and a straight edge
           along the bottom. The thumb's radius is 2.9 units (~1.7pt drawn) so
           its hole survives the stroke. */
        <>
          <Path d="M7.6 19.8 V11 a3.4 3.4 0 0 1 6.8 0 V19.8 Z" {...common} />
          <Path d="M14.4 12.6 h1.4 a2.9 2.9 0 0 1 0 5.8 h-1.4" {...common} />
        </>
      )}
    </Svg>
  );
}

/**
 * The right-hand cell of a TAPPABLE row — ruling PLAYBOOK-TYPE-PASS-E.
 *
 * Status (a pip, a medal) then the one cue, in that order. A row that is
 * pressable ends in a `Chev`; a row that is not gets no cue at all, which is
 * why this is a component a screen opts into rather than something `Row`
 * appends on its own.
 */
export function RowEnd({ children }: { children?: React.ReactNode }) {
  return (
    <View style={pbk.rowEnd}>
      {children ?? null}
      <Chev />
    </View>
  );
}

/**
 * "What you will learn" — the chapter's promise, as its own device.
 *
 * Ruling PLAYBOOK-TYPE-PASS-E: a KICKER over a FRAMED LIST, not a block label
 * over a paragraph. `items` is a list because the device is one; the frozen
 * content gives each chapter a single sentence, so one item renders without a
 * tick and two or more render with one each (see `pbk.learnbox`).
 */
export function LearnBox({ label, items }: { label: string; items: string[] }) {
  const list = items.filter((x) => !!x && x.trim().length > 0);
  if (list.length === 0) return null;
  return (
    <View>
      <Text style={pbk.learnLabel}>{label}</Text>
      <View style={pbk.learnbox}>
        {list.map((x, i) => (
          <View key={i} style={pbk.learnRow}>
            {list.length > 1 ? <Text style={pbk.learnTick}>✓</Text> : null}
            <Text style={pbk.learnText}>{x}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** `.index` — dashed rules between items, none after the last. */
export function IndexList({ children }: { children: React.ReactNode }) {
  const items = React.Children.toArray(children);
  return (
    <View style={pbk.index}>
      {items.map((child, i) => (
        <View
          key={i}
          style={[pbk.indexItem, i === items.length - 1 && pbk.indexItemLast]}
        >
          {child}
        </View>
      ))}
    </View>
  );
}

/**
 * `.secttl` — an uppercase section title with its optional count.
 *
 * `position` is the section's index in its chapter's own `subs` array, and
 * passing it is what turns the header on: the rail, the mark, the kicker's ink
 * and the pill's tint all come from `toneFor(position)` (ruling
 * PLAYBOOK-SECTION-RAIL). A header with NO position — the chapter-end screen's
 * "Your messages" — is not a section of the book and keeps the neutral kicker
 * it has always had.
 */
export function SectTitle({
  children,
  count,
  position,
}: {
  children: React.ReactNode;
  count?: string;
  position?: number;
}) {
  const tone = position == null ? null : toneFor(position);
  return (
    <View style={pbk.secttl}>
      {tone ? <View style={[pbk.secttlRail, { backgroundColor: tone.ink }]} /> : null}
      {tone && position != null ? <SectionIcon position={position} color={tone.ink} /> : null}
      <Text style={[pbk.secttlText, tone ? { color: tone.ink } : null]}>{children}</Text>
      {count ? (
        <View style={[pbk.secttlPill, tone ? { backgroundColor: tone.tint } : null]}>
          <Text style={[pbk.secttlPillText, tone ? { color: tone.ink } : null]}>{count}</Text>
        </View>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------- the buttons */

export type BtnVariant = 'primary' | 'ghost' | 'violet' | 'done';

/** `.btn` — one button, four variants, `small` being the web's `.btn small`. */
export function Btn({
  variant = 'primary',
  label,
  small,
  onPress,
  disabled,
  icon,
  style,
  stack,
}: {
  variant?: BtnVariant;
  label: string;
  /** `.btn small` — the second line, lighter and 15pt. */
  small?: string | null;
  onPress?: () => void;
  disabled?: boolean;
  icon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** `.cardbar .nextb` stacks its label over its small instead of inlining. */
  stack?: boolean;
}) {
  const face =
    variant === 'primary'
      ? pbk.btnPrimary
      : variant === 'ghost'
        ? pbk.btnGhost
        : variant === 'violet'
          ? pbk.btnViolet
          : pbk.btnDone;
  const ink =
    variant === 'primary'
      ? pbk.btnPrimaryText
      : variant === 'ghost'
        ? pbk.btnGhostText
        : variant === 'violet'
          ? pbk.btnVioletText
          : pbk.btnDoneText;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || !onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        pbk.btn,
        face,
        stack && { flexDirection: 'column', gap: 0 },
        disabled && pbk.btnDisabled,
        pressed && !disabled ? styles.btnPressed : null,
        style,
      ]}
    >
      {icon ?? null}
      <Text style={[pbk.btnText, ink]} numberOfLines={1}>
        {label}
      </Text>
      {small ? (
        <Text style={[pbk.btnText, ink, pbk.btnSmall, stack && pbk.cardbarNextSmall]} numberOfLines={1}>
          {stack ? small : ` ${small}`}
        </Text>
      ) : null}
    </Pressable>
  );
}

/**
 * `.cta` — the footer block. Inline, not sticky; see `styles.ts`.
 *
 * `style` exists for the one screen that centres its children: see
 * `pbk.ctaStretch` (fork QUIZ-RESULT-BUTTONS-ALIGN).
 */
export function Cta({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[pbk.cta, style]}>{children}</View>;
}

/* ------------------------------------------------------- chips and medals */

/** `.chip` / `.chip.g` */
export function Chip({
  children,
  green,
  style,
}: {
  children: React.ReactNode;
  green?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[pbk.chip, green && pbk.chipGreen, style]}>
      {typeof children === 'string' ? (
        <Text style={[pbk.chipText, green && pbk.chipGreenText]}>{children}</Text>
      ) : (
        children
      )}
    </View>
  );
}

/** `.medal` — the 18pt disc. `none` is never rendered by a screen. */
export function Medal({ medal }: { medal: 'gold' | 'silver' | 'none' }) {
  return (
    <View
      style={[
        pbk.medal,
        medal === 'gold' ? pbk.medalGold : medal === 'silver' ? pbk.medalSilver : pbk.medalNone,
      ]}
    >
      <Text style={pbk.medalText}>{medal === 'gold' ? 'G' : medal === 'silver' ? 'S' : '–'}</Text>
    </View>
  );
}

/* -------------------------------------------------------------- the icons */

/**
 * The header's and the search box's inline SVGs, attribute for attribute from
 * `PlaybookHeader.tsx` and `playbook.css` (`stroke-width:2.2`, round caps).
 */
export function Icon({
  name,
  size = 18,
  stroke = '#fff',
}: {
  name: 'search' | 'home' | 'back' | 'play';
  size?: number;
  stroke?: string;
}) {
  const common = {
    stroke,
    strokeWidth: lineWidth.iconStroke,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'search' ? (
        <>
          <Circle cx={11} cy={11} r={7} {...common} />
          <Path d="M20 20l-3.6-3.6" {...common} />
        </>
      ) : name === 'home' ? (
        <Path d="M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10" {...common} />
      ) : name === 'back' ? (
        <Path d="M15 5l-7 7 7 7" {...common} />
      ) : (
        <Path d="M7 4.5v15l13-7.5z" fill={stroke} />
      )}
    </Svg>
  );
}

/** `.legend` — us / them / pass / run, under every card board. */
export function Legend({ t }: { t: (k: 'legend_us' | 'legend_them' | 'legend_pass' | 'legend_run') => string }) {
  return (
    <View style={pbk.legend}>
      <View style={pbk.legendItem}>
        <View style={[pbk.lgDot, { backgroundColor: color.green }]} />
        <Text style={pbk.legendText}>{t('legend_us')}</Text>
      </View>
      <View style={pbk.legendItem}>
        <View style={[pbk.lgDot, { backgroundColor: color.them }]} />
        <Text style={pbk.legendText}>{t('legend_them')}</Text>
      </View>
      <View style={pbk.legendItem}>
        <View style={pbk.lgLine} />
        <Text style={pbk.legendText}>{t('legend_pass')}</Text>
      </View>
      <View style={pbk.legendItem}>
        <View style={[pbk.lgLine, pbk.lgLineDash]} />
        <Text style={pbk.legendText}>{t('legend_run')}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  rowPressed: { backgroundColor: 'rgba(255,255,255,0.06)' },
  btnPressed: { transform: [{ translateY: 1 }] },
});
