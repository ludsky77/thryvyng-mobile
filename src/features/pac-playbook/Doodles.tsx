/**
 * The chalk sketch layer — what `doodleArt.ts` picked, drawn.
 *
 * The web has three pieces (`thrive-and-score` @ `c772111`, `Doodles.tsx`):
 * two in-flow bands and a `DoodleMargins` that is both the margin marks and
 * the one place the chalk-edge filter is defined. Mobile has ONE:
 *
 *   `DoodleBand place="top"`   the first row of the scroller
 *   `DoodleBand place="foot"`  the row before the footer
 *
 * `DoodleMargins` is not ported, and its absence is a ruling rather than an
 * omission. **DOODLES-NO-MARGINS (Lu, 2026-10-30): marks live only INSIDE the
 * content column, web and mobile.** `doodlePlan` returns `margins: []` for
 * every screen (`doodleArt.ts`, `ZONES`), so there is nothing to draw there —
 * and a phone has no dark gutter to draw it in. The field stays in the plan's
 * shape; this layer simply never reads it.
 *
 * THREE THINGS THE MOBILE MARKS NEED THAT THE WEB GETS FROM CSS:
 *
 *  1. **Colour.** The 13 art strings carry no `stroke` and no `fill`; the web
 *     colours them with `.pbk .pbkd-mark g{stroke:var(--chalk)}` and greens
 *     the accent arrow with `.pbkd-accent .ac`. There is no stylesheet here,
 *     so each string goes through `withDoodleColors` — which lives in the
 *     MIRRORED `doodleArt.ts` precisely so both apps share one answer.
 *  2. **The chalk edge.** `withChalkEdge` inlines the filter per mark
 *     (`doodleChalk.ts`). This is § E2 Fix 3's remaining half, and the reason
 *     it is a mobile adapter and not a mirror edit is written there.
 *  3. **Strength.** `--pbk-dop` is `opacity` on the wrapper. `STRENGTH[2]`
 *     = 0.40 is the locked default (Lu, 2026-10-29); `strengthPreset()` reads
 *     the `__DEV__`-only `dz` preview, which the shell passes down so a phone
 *     can be judged the way the desktop was.
 *
 * Nothing here is interactive or announced: `pointerEvents="none"` and
 * `accessibilityElementsHidden`, so a mark can neither be read out nor swallow
 * a tap meant for a button or a quiz board — the same guarantee as the web's
 * `aria-hidden` + `pointer-events:none`.
 *
 * SIZE. `.pbkd-strip` is `calc(190px * --pbk-dsz)` with `height:auto`, and
 * `--pbk-dsz` is 1 on a narrow screen (`theme.ts`, `doodle.size.narrow`), so a
 * strip is 190 points wide at the art's own 220 x 62 aspect. `maxWidth:'100%'`
 * keeps it inside a 375pt column with the scroller's 16pt gutters.
 */

import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { withChalkEdge } from './doodleChalk';
import { withDoodleColors, type Sketch } from './doodleArt';
import { color, doodle } from './theme';
import { bandStyles } from './styles';

/** The art's own viewBox, from the STRIPS pool (`doodleArt.ts`). */
const STRIP_VIEWBOX = { w: 220, h: 62 };

/**
 * One mark, coloured and edged. `seq` is the mark's index on the screen and
 * becomes its filter id, so two marks in two `SvgXml` roots cannot collide.
 */
function Mark({ mark, seq, opacity }: { mark: Sketch; seq: number; opacity: number }) {
  const xml = useMemo(
    () =>
      withChalkEdge(
        withDoodleColors(mark.art, {
          stroke: color.chalk,
          // The picker decides whether a mark is accented, not this layer:
          // an unaccented mark passes the chalk colour as its accent, which is
          // what `withDoodleColors` documents.
          accent: mark.accent ? color.green : color.chalk,
        }),
        seq
      ),
    [mark.art, mark.accent, seq]
  );

  return (
    <View
      style={[
        styles.strip,
        { opacity, height: (doodle.stripWidth * STRIP_VIEWBOX.h) / STRIP_VIEWBOX.w },
      ]}
    >
      <SvgXml xml={xml} width="100%" height="100%" preserveAspectRatio="xMidYMid meet" />
    </View>
  );
}

export function DoodleBand({
  place,
  marks,
  strength,
}: {
  place: 'top' | 'foot';
  marks: Sketch[];
  /** `STRENGTH[preset]` as a number — the web's `--pbk-dop`. */
  strength: number;
}) {
  // `.pbkd-band-foot .pbkd-strip:nth-of-type(n+2){display:none}` — narrow
  // screens show ONE mark in the foot band, so a phone carries two in all.
  const shown = place === 'foot' ? marks.slice(0, 1) : marks;
  if (!shown.length) return null;
  return (
    <View
      style={[bandStyles.band, place === 'top' ? bandStyles.bandTop : bandStyles.bandFoot]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {shown.map((m, i) => (
        <Mark key={`${place}${i}`} mark={m} seq={place === 'top' ? i : 8 + i} opacity={strength} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  strip: { width: doodle.stripWidth * doodle.size.narrow, maxWidth: '100%' },
});
