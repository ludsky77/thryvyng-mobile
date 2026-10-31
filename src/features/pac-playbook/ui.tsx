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
import { color, lineWidth } from './theme';

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
export function StatusPip({ state }: { state: 'ok' | 'next' | 'none' }) {
  return (
    <View style={[pbk.st, state === 'ok' && pbk.stOk, state === 'next' && pbk.stNext]}>
      {state === 'ok' ? <Text style={pbk.stOkText}>✓</Text> : null}
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

/** `.secttl` — an uppercase section title with its optional count. */
export function SectTitle({ children, count }: { children: React.ReactNode; count?: string }) {
  return (
    <View style={pbk.secttl}>
      <Text style={pbk.secttlText}>{children}</Text>
      {count ? <Text style={pbk.secttlSmall}>{count}</Text> : null}
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

/** `.cta` — the footer block. Inline, not sticky; see `styles.ts`. */
export function Cta({ children }: { children: React.ReactNode }) {
  return <View style={pbk.cta}>{children}</View>;
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
