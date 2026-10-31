/**
 * The violet header — the prototype's header(), :526-554, rebuilt.
 *
 * Back label, an optional search button, home, and the EN/ES segmented
 * control, in the prototype's own order and at the prototype's own sizes
 * (`playbook.css`, `.hdr` / `.crest` / `.hdr .t` / `.seg` / `.hbtn`). The
 * gradient is `linear-gradient(100deg,var(--violet-2),var(--violet))` through
 * `expo-linear-gradient`, which this app already depends on — 100deg left to
 * right is `start {x:0,y:0}` → `end {x:1,y:0.18}`.
 *
 * RULING E-R4 = A: the EN/ES control stays exactly where the prototype put it,
 * and it moves the READER's language, not the app's — this app has no app-wide
 * language setting to move. `strings.tsx` carries the reasoning.
 *
 * The crest is the club's stored `logo_url`, the same column the chat list
 * draws (`src/components/comm/ChannelList.tsx`). A null logo, or one that
 * fails to load, falls back to the prototype's own lettering (:543), because
 * the header has always had something in that spot and an empty ring would
 * read as a loading state that never finishes.
 *
 * The header is NOT sticky here. On the web it is `position:sticky;top:0`
 * inside a page that scrolls; on mobile it sits above the `ScrollView` as a
 * sibling, which is the same result by simpler means — it never scrolls away.
 */

import React, { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from './ui';
import { useLang, type Lang } from './strings';
import {
  color,
  control,
  fontSize as fs,
  fontWeight as fw,
  letterSpacingEm as ls,
  lineHeightRatio as lh,
  lineWidth,
  radius,
  space,
} from './theme';

export interface HeaderBack {
  label: string;
  go: () => void;
}

/** `.crest` — the white disc with its lavender ring. */
function Crest({ url, alt }: { url?: string | null; alt?: string | null }) {
  const [broken, setBroken] = useState(false);
  const show = url && !broken;
  return (
    <View style={styles.crest} accessibilityLabel={alt || undefined}>
      {show ? (
        <Image
          source={{ uri: url }}
          style={styles.crestImg}
          resizeMode="contain"
          onError={() => setBroken(true)}
        />
      ) : (
        <Text style={styles.crestText}>PAC</Text>
      )}
    </View>
  );
}

export function PlaybookHeader({
  title,
  sub,
  back,
  crestUrl,
  crestAlt,
  onSearch,
  onHome,
  topInset = 0,
}: {
  title: string;
  sub: string;
  back?: HeaderBack | null;
  crestUrl?: string | null;
  crestAlt?: string | null;
  onSearch?: (() => void) | null;
  onHome?: (() => void) | null;
  /** The safe-area top; the web gets this from the app chrome above it. */
  topInset?: number;
}) {
  const { lang, setLang, t } = useLang();

  const backBtn = back ? (
    <Pressable
      onPress={back.go}
      accessibilityRole="button"
      style={({ pressed }) => [styles.hbtn, styles.hbtnBack, pressed && styles.hbtnPressed]}
    >
      <Icon name="back" />
      <Text style={styles.hbtnLabel} numberOfLines={1}>
        {back.label}
      </Text>
    </Pressable>
  ) : null;

  const titleCell = (
    <View style={back ? styles.titleCellWide : styles.titleCell}>
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      <Text style={styles.sub} numberOfLines={1}>
        {sub}
      </Text>
    </View>
  );

  const searchBtn = onSearch ? (
    <Pressable
      onPress={onSearch}
      accessibilityRole="button"
      accessibilityLabel={lang === 'es' ? 'Buscar' : 'Search'}
      style={({ pressed }) => [styles.hbtn, pressed && styles.hbtnPressed]}
    >
      <Icon name="search" />
    </Pressable>
  ) : null;

  const homeBtn = onHome ? (
    <Pressable
      onPress={onHome}
      accessibilityRole="button"
      accessibilityLabel={t('home')}
      style={({ pressed }) => [styles.hbtn, pressed && styles.hbtnPressed]}
    >
      <Icon name="home" />
    </Pressable>
  ) : null;

  const segCtl = (
    <View style={styles.seg} accessibilityRole="radiogroup" accessibilityLabel="Language">
      {(['en', 'es'] as Lang[]).map((l) => (
        <Pressable
          key={l}
          onPress={() => setLang(l)}
          accessibilityRole="radio"
          accessibilityState={{ selected: lang === l }}
          style={[styles.segBtn, lang === l && styles.segBtnOn]}
        >
          <Text style={[styles.segLabel, lang === l && styles.segLabelOn]}>
            {l.toUpperCase()}
          </Text>
        </Pressable>
      ))}
    </View>
  );

  return (
    <LinearGradient
      colors={[color.violet2, color.violet]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0.18 }}
      style={[back ? styles.hdrStack : styles.hdr, { paddingTop: topInset + space.px10 }]}
    >
      {back ? (
        /* RULE R-G (ledger, Oct 26: text never overflows its container), and
         * the close of `PLAYBOOK-HEADER-TITLE-TRUNCATES`.
         *
         * The web's header is ONE row, and at phone width five things cannot
         * share it: a back button capped at 132pt, the title, search, home and
         * the EN/ES control. On a 375pt screen that leaves the title cell
         * ~47pt and "PAC Playbook" needs ~118pt at 18pt extrabold, so the
         * title read "PAC Pl…" — a two-character book title, which is what the
         * M3 looks caught (`docs/recon/m3-looks/05-card.png`).
         *
         * R-G's own remedies are "shortened, wrapped deliberately, or given
         * numberOfLines with a layout that cannot clip". Shortening is not
         * available: every candidate — the title, the back label (often a
         * chapter name), the language control — is already as short as it
         * reads. So the row is WRAPPED DELIBERATELY: the chrome keeps row one
         * in the web's own order (back left, search / home / EN-ES right) and
         * the title block takes row two at the full column width, where
         * "PAC Playbook" and the chapter subtitle both fit whole with room
         * over. Nothing is cut and nothing moved sides.
         *
         * With NO back label there is no squeeze (crest 32pt + title + the
         * control fits at 375pt), so that header is the web's single row,
         * untouched — which is the cover and nothing else. */
        <>
          <View style={styles.chromeRow}>
            {backBtn}
            <View style={styles.spacer} />
            {searchBtn}
            {homeBtn}
            {segCtl}
          </View>
          {titleCell}
        </>
      ) : (
        <>
          <Crest url={crestUrl} alt={crestAlt} />
          {titleCell}
          {searchBtn}
          {homeBtn}
          {segCtl}
        </>
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  /** `.hdr` — `padding:10px 12px`, `gap:8px`, a dark hairline underneath. */
  hdr: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.px8,
    paddingHorizontal: space.px12,
    paddingBottom: space.px10,
    borderBottomWidth: lineWidth.hairline,
    borderBottomColor: 'rgba(0, 0, 0, 0.25)',
  },

  /** The same box, stacked — rule R-G's two rows. See the comment in render. */
  hdrStack: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: space.px6,
    paddingHorizontal: space.px12,
    paddingBottom: space.px10,
    borderBottomWidth: lineWidth.hairline,
    borderBottomColor: 'rgba(0, 0, 0, 0.25)',
  },
  /** Row one of the stacked header: `.hdr`'s own row, minus the title. */
  chromeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.px8,
  },
  /** What holds the chrome apart when the title is not between it. */
  spacer: { flex: 1 },

  crest: {
    width: control.crest,
    height: control.crest,
    borderRadius: control.crest / 2,
    backgroundColor: '#fff',
    borderWidth: lineWidth.thick,
    borderColor: '#cdc6ff',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  crestImg: { width: '100%', height: '100%', padding: space.px2 },
  crestText: { fontWeight: fw.extrabold, fontSize: fs.micro, color: color.violet2 },

  titleCell: { flex: 1, minWidth: 0 },
  /** Row two of the stacked header: the title block, the whole column wide. */
  titleCellWide: { width: '100%' },
  title: {
    fontWeight: fw.extrabold,
    fontSize: fs.headerTitle,
    lineHeight: Math.round(fs.headerTitle * lh.tight),
    letterSpacing: fs.headerTitle * ls.heading,
    color: '#fff',
  },
  sub: {
    fontSize: fs.meta,
    color: '#e4e0ff',
    lineHeight: Math.round(fs.meta * lh.heading),
    marginTop: space.px1,
  },

  /** `.hbtn` — `max-width:132px`, round caps, white ink. */
  hbtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.px4,
    padding: space.px6,
    borderRadius: radius.control,
  },
  hbtnBack: { maxWidth: 132 },
  hbtnPressed: { backgroundColor: 'rgba(255, 255, 255, 0.15)' },
  hbtnLabel: { color: '#fff', fontWeight: fw.bold, fontSize: fs.lead, flexShrink: 1 },

  /** `.seg` — one bordered box, two halves, the on half filled white. */
  seg: {
    flexDirection: 'row',
    borderWidth: lineWidth.hairline,
    borderColor: 'rgba(255, 255, 255, 0.5)',
    borderRadius: radius.control,
    overflow: 'hidden',
  },
  segBtn: { paddingVertical: space.px6, paddingHorizontal: space.px9 },
  segBtnOn: { backgroundColor: '#fff' },
  segLabel: {
    fontWeight: fw.bold,
    fontSize: fs.meta,
    letterSpacing: fs.meta * ls.caps,
    color: color.violetInk,
  },
  segLabelOn: { color: color.violet2 },
});
