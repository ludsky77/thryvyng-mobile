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

  return (
    <LinearGradient
      colors={[color.violet2, color.violet]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0.18 }}
      style={[styles.hdr, { paddingTop: topInset + space.px10 }]}
    >
      {back ? (
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
      ) : (
        <Crest url={crestUrl} alt={crestAlt} />
      )}

      <View style={styles.titleCell}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {sub}
        </Text>
      </View>

      {onSearch ? (
        <Pressable
          onPress={onSearch}
          accessibilityRole="button"
          accessibilityLabel={lang === 'es' ? 'Buscar' : 'Search'}
          style={({ pressed }) => [styles.hbtn, pressed && styles.hbtnPressed]}
        >
          <Icon name="search" />
        </Pressable>
      ) : null}

      {onHome ? (
        <Pressable
          onPress={onHome}
          accessibilityRole="button"
          accessibilityLabel={t('home')}
          style={({ pressed }) => [styles.hbtn, pressed && styles.hbtnPressed]}
        >
          <Icon name="home" />
        </Pressable>
      ) : null}

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
