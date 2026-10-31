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
 *
 * M3 ADDED ONE ENTRY: **Open reader**. It mounts the real `PlaybookScreen`
 * — the shell, its six screens and its three panels — over the OFFLINE book
 * (`./offlineBook.ts`, built from the frozen content file the prod seed itself
 * was generated from), so the reader can be looked at before M4 gives it a
 * route and without a signed-in player. Nothing about the reader is special-
 * cased for the harness: it is the same component M4 will register, handed its
 * data through the one `offline` prop each of its three hooks accepts.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { SvgXml } from 'react-native-svg';
import * as Linking from 'expo-linking';
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
import { withChalkEdge } from '../doodleChalk';
import PlaybookScreen, { type PlaybookOffline } from '../PlaybookScreen';
import {
  OFFLINE_BOOK,
  OFFLINE_COUNTS,
  OFFLINE_PROGRESS,
  OFFLINE_QUESTIONS,
  OFFLINE_QUIZ,
} from './offlineBook';
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
        // M3: the chalk edge, inlined per mark (`doodleChalk.ts`). M2 drew the
        // plain stroke here, because the web's filter lives in a different
        // <svg> root and `SvgXml` cannot see across roots.
        xml: withChalkEdge(
          withDoodleColors(mark.art, {
            stroke: color.chalk2,
            accent: mark.accent ? color.green : color.chalk2,
          })
        ),
        accent: mark.accent,
      }
    : null;
})();

type TapReadout = {
  source: 'finger' | 'synthetic centre' | 'synthetic corner';
  point: ViewBoxPoint;
  hit: boolean;
};

/**
 * THE DEEP LINK'S OWN QUERY STRING.
 *
 * `thryvyng://playbook-dev` routes here through `linking.ts`, whose entry is
 * `PlaybookDev: 'playbook-dev'` with no params — and that file is NOT this
 * prompt's to edit. It does not need to be: a query string does not affect the
 * path match, so the harness reads the URL itself with `expo-linking` (already
 * a dependency) and keeps the whole affordance inside this folder.
 *
 * WHY IT EXISTS. There is no way to tap a simulator from a shell on this
 * machine: `xcrun simctl` has no tap verb and neither `idb` nor `cliclick` is
 * installed. So the agent's look (DONE 5) reaches each screen and each panel
 * by opening a URL, which has the side benefit of being reproducible —
 * Lu's own look in M5 taps.
 *
 *   thryvyng://playbook-dev                               the board harness
 *   thryvyng://playbook-dev?open=reader                   the reader, on its cover
 *   thryvyng://playbook-dev?open=reader&screen=home       contents
 *   …&screen=home&q=press                                 contents, searching
 *   …&screen=chapter&ch=foundations                       a chapter
 *   …&screen=card&id=F3                                   a card (and its panel)
 *   …&screen=chend&ch=foundations                         questions & notes
 *   …&screen=quiz                                         the quiz entry
 *   …&screen=quiz&start=1                                 the quiz, running
 *   …&screen=quiz&start=1&autoplay=1                      through to the results
 *   …&lang=es                                             opened in Spanish
 *   …&dz=1|3                                              a doodle strength preview
 */
function useHarnessParams(): Record<string, string> {
  const url = Linking.useURL();
  return useMemo(() => {
    if (!url) return {};
    const out: Record<string, string> = {};
    const q = Linking.parse(url).queryParams || {};
    for (const k of Object.keys(q)) {
      const v = q[k];
      if (typeof v === 'string') out[k] = v;
    }
    return out;
  }, [url]);
}

export default function PlaybookDevHarness() {
  const params = useHarnessParams();
  const [view, setView] = useState<'board' | 'reader'>('board');

  // A link that asks for the reader opens it; closing it stays closed until
  // the next link.
  const wantReader = params.open === 'reader';
  useEffect(() => {
    if (wantReader) setView('reader');
  }, [wantReader]);

  if (view === 'reader')
    return <ReaderHost params={params} onBack={() => setView('board')} />;
  return <BoardHarness onOpenReader={() => setView('reader')} />;
}

/** The deep link's `screen` / `ch` / `id`, as the shell's `Nav`. */
function navFromParams(params: Record<string, string>): PlaybookOffline['initialNav'] {
  switch (params.screen) {
    case 'home':
      return { screen: 'home' };
    case 'chapter':
      return { screen: 'chapter', ch: params.ch || 'foundations' };
    case 'card':
      return { screen: 'card', id: params.id || 'F0' };
    case 'chend':
      return { screen: 'chend', ch: params.ch || 'foundations' };
    case 'quiz':
      return { screen: 'quiz' };
    default:
      return { screen: 'cover' };
  }
}

/**
 * The reader, over the offline book. The back bar is the harness's, not the
 * reader's: in the app the navigator owns that, and M4 wires it.
 */
function ReaderHost({
  params,
  onBack,
}: {
  params: Record<string, string>;
  onBack: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.readerHost}>
      {/* A fresh link is a fresh reader: `initialNav` is an initial state, so
          the key remounts the shell rather than quietly ignoring the new
          screen. Harness-only — the app never changes these params. */}
      <PlaybookScreen
        key={`${params.screen || 'cover'}|${params.ch || ''}|${params.id || ''}|${params.q || ''}|${params.start || ''}|${params.autoplay || ''}|${params.dz || ''}|${params.y || ''}|${params.lang || ''}`}
        offline={{
          book: OFFLINE_BOOK,
          progress: OFFLINE_PROGRESS,
          quiz: { ...OFFLINE_QUIZ, autoplay: params.autoplay === '1' },
          questions: OFFLINE_QUESTIONS,
          // R-4's player id. Any non-null value turns the player-side screens
          // on; nothing offline joins it against a real row.
          playerId: 'offline-player',
          initialNav: navFromParams(params),
          initialQuery: params.q,
          autoStartQuiz: params.start === '1',
          initialScrollY: params.y ? Number(params.y) : undefined,
          lang: params.lang === 'es' ? 'es' : 'en',
          dz: params.dz ? `dz=${params.dz}` : undefined,
        }}
      />
      <Pressable
        onPress={onBack}
        style={[styles.readerBack, { bottom: insets.bottom + space.px10 }]}
      >
        <Text style={styles.btnLabel}>‹ harness</Text>
      </Pressable>
    </View>
  );
}

function BoardHarness({ onOpenReader }: { onOpenReader: () => void }) {
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

      <Pressable onPress={onOpenReader} style={[styles.btn, styles.readerBtn]}>
        <Text style={styles.btnLabel}>Open reader ›</Text>
        <Text style={styles.readerBtnSub}>
          {OFFLINE_COUNTS.chapters} chapters · {OFFLINE_COUNTS.cards} cards ·{' '}
          {OFFLINE_COUNTS.diagrams} diagrams · {OFFLINE_COUNTS.dealt} dealt Q ·{' '}
          {OFFLINE_COUNTS.got} got it — offline fixture
        </Text>
      </Pressable>

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
 * string — `grep -c filter doodleArt.ts` is 0 — so M2 drew the plain stroke.
 * M3 FIXED IT: `withChalkEdge` gives every mark its own `<defs>` and its own
 * filter id, inside its own root, which is the only shape an `SvgXml` root can
 * carry one in. This probe is where the two can be told apart.
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
  readerHost: { flex: 1, backgroundColor: color.page },
  readerBack: {
    position: 'absolute',
    left: space.px12,
    paddingVertical: space.px8,
    paddingHorizontal: space.px12,
    borderRadius: radius.pill,
    backgroundColor: color.card2,
    borderWidth: 1,
    borderColor: color.line2,
  },
  readerBtn: { backgroundColor: color.violet, borderColor: color.violet, gap: space.px3 },
  readerBtnSub: { color: color.violetInk, fontSize: fontSize.tiny, textAlign: 'center' },
  animWrap: { gap: space.px6 },
  animBox: {
    width: '100%',
    backgroundColor: color.board,
    borderRadius: radius.control,
    overflow: 'hidden',
  },
});
