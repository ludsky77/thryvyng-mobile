/**
 * __DEV__-ONLY harness for the M2 board. Not a product screen, not a step
 * toward one: it exists so the renderer, the EN/ES toggle and the geometric
 * hit test can be exercised on a device before any of them is wired into the
 * reader. `PLAYBOOK-DEV-HARNESS` in `docs/ledger.md` tracks removing or
 * keeping it at M4.
 *
 * It is reachable ONLY by deep link — `thryvyng://playbook-dev` — and only in
 * a dev bundle: both its navigator entry and its linking path are inside
 * `if (__DEV__)` / `...(__DEV__ ? … : {})` gates, which Metro folds to a
 * constant and drops from a production build.
 *
 * Three boards, from REAL content (`./fixtures.ts`), plus:
 *
 *   EN / ES          local `useState`, ruling E-R4 = A. F0 carries `text_es`
 *                    on five elements, so the toggle visibly redraws it.
 *   HIT / MISS       under the tap board, from the board's own callback.
 *   Two synthetic    "Tap target centre" and "Tap far corner" go through the
 *   taps             board's `tapAtViewBox` / `tapAtScreen`, which are the
 *                    same `screenToViewBox` + `isHit` the finger uses — not a
 *                    shortcut that recomputes the answer locally.
 *   One doodle       `withDoodleColors` over a mark from `doodlePlan`, in its
 *                    own `<SvgXml>`, to see what survives without a
 *                    stylesheet.
 *   ANIMATE (5 s)    optional measurement for the E-R2 record: re-renders the
 *                    board on every frame with a real clock, counting frames,
 *                    so "static" has a number behind it. The board's own
 *                    default stays static; this switch is harness-only.
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { SvgXml } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  DiagramBoard,
  type DiagramBoardHandle,
  type Lang,
  type ViewBoxPoint,
} from '../DiagramBoard';
import { dims, diagTotal } from '../diagram/geometry';
import { render } from '../diagram/renderDiagram';
import { tapTarget } from '../diagram/tapTarget';
import { STRENGTH, doodlePlan, withDoodleColors } from '../doodleArt';
import { color, fontSize, fontWeight, radius, space } from '../theme';
import { FIXTURES, TAP_P1 } from './fixtures';

const TAP_FIXTURE = FIXTURES.find((f) => f.key === 'P1')!;
const PLAIN_FIXTURE = FIXTURES.find((f) => f.key === 'F0')!;
const HEAT_FIXTURE = FIXTURES.find((f) => f.key === 'F3')!;

/** One mark from the real picker, coloured for a world with no stylesheet. */
const DOODLE = (() => {
  const plan = doodlePlan('card', 'M2-harness');
  const mark = plan.top[0] || plan.foot[0];
  return mark
    ? {
        xml: withDoodleColors(mark.art, {
          stroke: color.chalk2,
          accent: mark.accent ? color.green : color.chalk2,
        }),
        accent: mark.accent,
      }
    : null;
})();

type TapReadout = {
  source: 'finger' | 'synthetic centre' | 'synthetic corner';
  point: ViewBoxPoint;
  hit: boolean;
};

export default function PlaybookDevHarness() {
  const insets = useSafeAreaInsets();
  const [lang, setLang] = useState<Lang>('en');
  const [readout, setReadout] = useState<TapReadout | null>(null);
  const sourceRef = useRef<TapReadout['source']>('finger');
  const boardRef = useRef<DiagramBoardHandle>(null);

  const target = useMemo(() => tapTarget(TAP_P1), []);
  const [vbW, vbH] = useMemo(() => dims(TAP_P1), []);

  const onTap = useCallback((point: ViewBoxPoint, hit: boolean) => {
    setReadout({ source: sourceRef.current, point, hit });
    sourceRef.current = 'finger';
  }, []);

  const tapCentre = useCallback(() => {
    if (!target) return;
    sourceRef.current = 'synthetic centre';
    boardRef.current?.tapAtViewBox(target.x, target.y);
  }, [target]);

  const tapCorner = useCallback(() => {
    sourceRef.current = 'synthetic corner';
    // Screen (0,0) — the box's own top-left corner, which converts to
    // viewBox (0,0) through the identical path a finger there would take.
    boardRef.current?.tapAtScreen(0, 0);
  }, []);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + space.px12, paddingBottom: insets.bottom + space.px24 },
      ]}
    >
      <Text style={styles.h1}>Playbook M2 · board harness</Text>
      <Text style={styles.sub}>
        __DEV__ only · thryvyng://playbook-dev · boards are STATIC (ruling E-R2 = A)
      </Text>

      <View style={styles.seg}>
        {(['en', 'es'] as Lang[]).map((l) => (
          <Pressable
            key={l}
            onPress={() => setLang(l)}
            style={[styles.segBtn, lang === l && styles.segBtnOn]}
          >
            <Text style={[styles.segLabel, lang === l && styles.segLabelOn]}>
              {l.toUpperCase()}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* 1 — plain board */}
      <Text style={styles.label}>{PLAIN_FIXTURE.label}</Text>
      <DiagramBoard block={PLAIN_FIXTURE.block} lang={lang} />

      {/* 2 — heat field: the feGaussianBlur filter from heat.ts */}
      <Text style={styles.label}>{HEAT_FIXTURE.label}</Text>
      <DiagramBoard block={HEAT_FIXTURE.block} lang={lang} heat={HEAT_FIXTURE.heat} dim={6} />

      {/* 3 — tap board */}
      <Text style={styles.label}>{TAP_FIXTURE.label}</Text>
      <Text style={styles.prompt}>
        {TAP_FIXTURE.prompt ? TAP_FIXTURE.prompt[lang] : ''}
      </Text>
      <DiagramBoard
        ref={boardRef}
        block={TAP_P1}
        lang={lang}
        onTap={onTap}
        target={readout ? target : null}
      />

      <View style={styles.readout}>
        <Text style={styles.readoutHead}>
          {readout ? (
            <Text style={readout.hit ? styles.hit : styles.miss}>
              {readout.hit ? 'HIT' : 'MISS'}
            </Text>
          ) : (
            <Text style={styles.mutedBold}>NO TAP YET</Text>
          )}
          {readout
            ? `  ${readout.source} · (${readout.point.x.toFixed(2)}, ${readout.point.y.toFixed(2)})`
            : ''}
        </Text>
        <Text style={styles.readoutLine}>
          viewBox {vbW}×{vbH} · target{' '}
          {target ? `(${target.x}, ${target.y}) r=${target.r}` : 'none — every tap is wrong'}
        </Text>
        <Text style={styles.readoutLine}>
          answer: {TAP_FIXTURE.answer ? TAP_FIXTURE.answer[lang] : ''}
        </Text>
      </View>

      <View style={styles.row}>
        <Pressable onPress={tapCentre} style={styles.btn}>
          <Text style={styles.btnLabel}>Tap target centre</Text>
        </Pressable>
        <Pressable onPress={tapCorner} style={styles.btn}>
          <Text style={styles.btnLabel}>Tap far corner</Text>
        </Pressable>
      </View>

      <DoodleProbe />
      <AnimateProbe lang={lang} />
    </ScrollView>
  );
}

/**
 * ONE doodle mark through `withDoodleColors`. What is being looked for is the
 * CHALK EDGE: on the web every mark is filtered through `url(#pbkd-chalk)`
 * (`feTurbulence` + `feDisplacementMap`), and that filter is defined in a
 * SEPARATE `<svg class="pbkd-defs">` and applied by CSS
 * (`Doodles.tsx:64-81`, `playbook.css:503`). Neither travels with the art
 * string — `grep -c filter doodleArt.ts` is 0 — so the mark drawn here is the
 * plain stroke. Reported, not fixed: inlining the filter per mark is M3.
 */
function DoodleProbe() {
  if (!DOODLE) return null;
  return (
    <View style={styles.doodleWrap}>
      <Text style={styles.label}>
        DOODLE · withDoodleColors, opacity {STRENGTH[2]}
        {DOODLE.accent ? ' · accented' : ''}
      </Text>
      <View style={[styles.doodleBox, { opacity: Number(STRENGTH[2]) }]}>
        <SvgXml xml={DOODLE.xml} width="100%" height="100%" preserveAspectRatio="xMidYMid meet" />
      </View>
    </View>
  );
}

/**
 * The E-R2 measurement, on the record. Runs the web's shape of loop — a new
 * `render(...)` string into `SvgXml` on every frame, so a full XML parse per
 * frame — for 5 seconds, and reports frames and the mean JS frame time. The
 * board above is unaffected; this draws its own.
 */
function AnimateProbe({ lang }: { lang: Lang }) {
  const [state, setState] = useState<'idle' | 'running' | 'done'>('idle');
  const [tt, setTt] = useState(0);
  const [result, setResult] = useState<string | null>(null);
  const [boxW, setBoxW] = useState(0);
  const raf = useRef(0);

  const total = useMemo(() => diagTotal(TAP_P1), []);
  const [w, h] = useMemo(() => dims(TAP_P1), []);

  const onLayout = useCallback((e: LayoutChangeEvent) => setBoxW(e.nativeEvent.layout.width), []);

  const start = useCallback(() => {
    if (state === 'running') return;
    setState('running');
    const t0 = Date.now();
    let frames = 0;
    let worst = 0;
    let prev = t0;
    const step = () => {
      const now = Date.now();
      const dt = now - prev;
      prev = now;
      if (frames > 0 && dt > worst) worst = dt;
      frames += 1;
      const elapsed = now - t0;
      if (elapsed >= 5000) {
        setResult(
          `${frames} frames in ${elapsed} ms · ${(frames / (elapsed / 1000)).toFixed(1)} fps · ` +
            `mean ${(elapsed / frames).toFixed(1)} ms · worst ${worst} ms`
        );
        setState('done');
        return;
      }
      setTt(elapsed % total);
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  }, [state, total]);

  const xml = useMemo(() => render(TAP_P1, tt, { lang }), [tt, lang]);

  return (
    <View style={styles.animWrap}>
      <Text style={styles.label}>ANIMATE probe · E-R2 measurement (harness only)</Text>
      <Pressable onPress={start} style={styles.btn} disabled={state === 'running'}>
        <Text style={styles.btnLabel}>
          {state === 'running' ? 'running 5 s…' : 'Run 5 s re-parse loop'}
        </Text>
      </Pressable>
      {result ? <Text style={styles.readoutLine}>{result}</Text> : null}
      <View
        style={[styles.animBox, { height: boxW ? (boxW * h) / w : undefined }]}
        onLayout={onLayout}
      >
        {state === 'idle' ? null : (
          <SvgXml xml={xml} width="100%" height="100%" preserveAspectRatio="xMidYMid meet" />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.page },
  content: { paddingHorizontal: space.px16, gap: space.px10 },
  h1: { color: color.chalk, fontSize: fontSize.h2, fontWeight: fontWeight.extrabold },
  sub: { color: color.mute, fontSize: fontSize.meta },
  label: {
    color: color.mute,
    fontSize: fontSize.micro,
    fontWeight: fontWeight.bold,
    letterSpacing: 1,
    marginTop: space.px10,
  },
  prompt: { color: color.chalk2, fontSize: fontSize.secondary },
  seg: { flexDirection: 'row', gap: space.px6, marginTop: space.px6 },
  segBtn: {
    paddingHorizontal: space.px16,
    paddingVertical: space.px8,
    borderRadius: radius.control,
    backgroundColor: color.card,
    borderWidth: 1,
    borderColor: color.line,
  },
  segBtnOn: { backgroundColor: color.violet, borderColor: color.violet },
  segLabel: { color: color.mute, fontSize: fontSize.meta, fontWeight: fontWeight.bold },
  segLabelOn: { color: color.violetInk },
  readout: {
    backgroundColor: color.card,
    borderRadius: radius.field,
    padding: space.px12,
    gap: space.px4,
  },
  readoutHead: { fontSize: fontSize.button, color: color.chalk2 },
  readoutLine: { color: color.mute, fontSize: fontSize.meta },
  hit: { color: color.green, fontWeight: fontWeight.extrabold },
  miss: { color: color.bad, fontWeight: fontWeight.extrabold },
  mutedBold: { color: color.dim, fontWeight: fontWeight.bold },
  row: { flexDirection: 'row', gap: space.px8 },
  btn: {
    flex: 1,
    paddingVertical: space.px12,
    borderRadius: radius.control,
    backgroundColor: color.card2,
    borderWidth: 1,
    borderColor: color.line2,
    alignItems: 'center',
  },
  btnLabel: { color: color.chalk, fontSize: fontSize.meta, fontWeight: fontWeight.bold },
  doodleWrap: { gap: space.px6 },
  doodleBox: { width: '100%', aspectRatio: 220 / 62 },
  animWrap: { gap: space.px6 },
  animBox: {
    width: '100%',
    backgroundColor: color.board,
    borderRadius: radius.control,
    overflow: 'hidden',
  },
});
