/**
 * DiagramBoard — the mobile board. One `<SvgXml>` over the mirrored
 * renderer's own string output, drawn ONCE per content change.
 *
 * STATIC BY RULING E-R2 = A. The web runs one `requestAnimationFrame` loop
 * per mounted board and replaces the whole SVG ~60 times a second
 * (`thrive-and-score` @ `83a3686`, `diagram/DiagramBoard.tsx:56-117`).
 * `SvgXml` re-parses its string on every change, so that loop would mean a
 * full XML parse per frame on the JS thread. The web already has the branch
 * mobile ships as its only behaviour: under `prefers-reduced-motion` its loop
 * runs once and holds on the finished picture. Here there is no loop at all —
 * one parse, the finished picture, and `useMemo` so a re-render that does not
 * change the content does not re-parse.
 *
 * "The finished picture" is `render(d, null, …)`: the renderer's own
 * documented value for it (`renderDiagram.ts:13`), and what the web's quiz
 * tap board already passes (`screens/QuizScreen.tsx:184`). It is equivalent
 * to the hold branch's `draw(total)` — at `tt = total` every element's
 * progress is already clamped to 1, every `option`'s `until` has passed, and
 * the only term that reads the clock directly is the `el.cue` pulse, which is
 * drawn only while `0 < p < 1`. `null` is used instead of `diagTotal(d)`
 * because it cannot drift with the clock.
 *
 * FRAMES: a two-frame card shows its LAST frame, which is the frame
 * `tapTarget()` also reads (`diagram/tapTarget.ts:25`). The picture and the
 * hit test must never disagree about which frame is on screen.
 *
 * THE HIT TEST IS GEOMETRY, NOT THE DOM. The web reads `data-el` attributes
 * back out of the DOM; `SvgXml` drops them and React Native has no DOM. It
 * does not need one: `tapTarget()` returns `{x, y, r}` in viewBox units and
 * the rule is `hypot(dx, dy) <= r` — the same rule the web uses
 * (`useQuizRun.ts:163`) and the same rule the SERVER regrades with
 * (`20261028190000_playbook_v1_schema.sql:1640-1677`). So a touch is
 * converted to viewBox units and compared against that circle. No `data-el`,
 * no `querySelector`, nothing to drift.
 *
 * PRESERVE-ASPECT-RATIO — stated because the conversion depends on it.
 * `render()` emits `<svg viewBox="0 0 w h">` with NO `preserveAspectRatio`
 * attribute (`renderDiagram.ts:233`), so the web gets the SVG default,
 * `xMidYMid meet`, and the web's CSS (`playbook.css:125`,
 * `.pbk .board svg{width:100%;height:auto}`) gives the box the viewBox's own
 * aspect ratio — so `meet` is a pure uniform scale with zero letterboxing,
 * and `((clientX - r.left) / r.width) * vb.width` is exact.
 *
 * This component reproduces that exactly: `xMidYMid meet` is passed
 * EXPLICITLY rather than left to a default, and the wrapper View carries
 * `aspectRatio: w / h` from the renderer's own `dims()`, so the laid-out box
 * again matches the viewBox aspect and `meet` again adds no offset. The
 * conversion is therefore the web's formula with `locationX / layout.width`
 * in place of `(clientX - left) / r.width`.
 */

import React, { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { StyleSheet, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { dims } from './diagram/geometry';
import { render } from './diagram/renderDiagram';
import { tapTarget, type TapTarget } from './diagram/tapTarget';
import type { Diagram, DiagramBlock } from './diagram/types';
import type { HeatBlob } from './diagram/heat';
import { color, radius } from './theme';

/** The SVG default the web relies on, made explicit. */
export const PRESERVE_ASPECT_RATIO = 'xMidYMid meet';

export type ViewBoxPoint = { x: number; y: number };
export type Lang = 'en' | 'es';

/** A laid-out box, in points. */
export type BoardLayout = { width: number; height: number };

/**
 * Screen point → viewBox units. The web's own formula
 * (`QuizScreen.tsx:130-134`) with `locationX` for `clientX - rect.left`:
 * both are "offset inside the box", which is what React Native hands over
 * directly. Exact only while the box keeps the viewBox's aspect ratio — see
 * the header.
 */
export function screenToViewBox(
  sx: number,
  sy: number,
  layout: BoardLayout,
  vb: { w: number; h: number }
): ViewBoxPoint {
  return {
    x: layout.width ? (sx / layout.width) * vb.w : 0,
    y: layout.height ? (sy / layout.height) * vb.h : 0,
  };
}

/** The inverse, for the harness's synthetic taps. */
export function viewBoxToScreen(
  vx: number,
  vy: number,
  layout: BoardLayout,
  vb: { w: number; h: number }
): { sx: number; sy: number } {
  return { sx: (vx / vb.w) * layout.width, sy: (vy / vb.h) * layout.height };
}

/**
 * `tg && hypot(...) <= r`. A null target means every tap is wrong, here, on
 * the web and on the server — the `IF v_tx IS NOT NULL` guard.
 */
export function isHit(p: ViewBoxPoint, tg: TapTarget | null | undefined): boolean {
  return !!tg && Math.hypot(p.x - tg.x, p.y - tg.y) <= (tg.r || 8);
}

export interface DiagramBoardProps {
  /** The diagram content — the mirrored `diagram/types.ts` shape. */
  block: DiagramBlock;
  lang: Lang;
  /** Heat blobs under the elements (the positions card). */
  heat?: HeatBlob[];
  /** Shirt number to spotlight; every other `pos-*` element dims. */
  dim?: number | null;
  /** Draw the answer ring. Pass `tapTarget(block)` after a quiz tap. */
  target?: TapTarget | null;
  /**
   * A tap question. When set, the board is touchable and reports every tap in
   * viewBox units with the verdict `tapTarget(block)` + `hypot <= r` gives.
   */
  onTap?: (point: ViewBoxPoint, hit: boolean) => void;
}

/**
 * The handle the __DEV__ harness drives its two synthetic taps through, so a
 * test goes down the SAME conversion and the SAME hit test a finger does.
 * Nothing in the app calls these.
 */
export interface DiagramBoardHandle {
  tapAtScreen: (sx: number, sy: number) => void;
  tapAtViewBox: (vx: number, vy: number) => void;
  viewBox: () => { w: number; h: number };
  layout: () => BoardLayout;
}

export const DiagramBoard = forwardRef<DiagramBoardHandle, DiagramBoardProps>(function DiagramBoard(
  { block, lang, heat, dim, target, onTap },
  ref
) {
  // A two-frame card's finished picture is its last frame — the same frame
  // tapTarget() reads.
  const shown: Diagram = block.frames?.length
    ? block.frames[block.frames.length - 1].d
    : block;

  const [w, h] = useMemo(() => dims(shown), [shown]);

  // ONE parse per content change: the string is memoized here and SvgXml
  // memoizes its parse on the string identity (`react-native-svg/src/xml.tsx`).
  const xml = useMemo(
    () => render(shown, null, { lang, heat, dim, target: target ?? null }),
    [shown, lang, heat, dim, target]
  );

  const tg = useMemo(() => tapTarget(block), [block]);

  const layoutRef = useRef<BoardLayout>({ width: 0, height: 0 });
  const [ready, setReady] = useState(false);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    layoutRef.current = { width, height };
    setReady(width > 0 && height > 0);
  }, []);

  /** The one tap path. The responder and the harness both end up here. */
  const tapAtScreen = useCallback(
    (sx: number, sy: number) => {
      if (!onTap) return;
      const point = screenToViewBox(sx, sy, layoutRef.current, { w, h });
      onTap(point, isHit(point, tg));
    },
    [onTap, tg, w, h]
  );

  const tapAtViewBox = useCallback(
    (vx: number, vy: number) => {
      const { sx, sy } = viewBoxToScreen(vx, vy, layoutRef.current, { w, h });
      tapAtScreen(sx, sy);
    },
    [tapAtScreen, w, h]
  );

  useImperativeHandle(
    ref,
    () => ({
      tapAtScreen,
      tapAtViewBox,
      viewBox: () => ({ w, h }),
      layout: () => layoutRef.current,
    }),
    [tapAtScreen, tapAtViewBox, w, h]
  );

  // onStartShouldSetResponder rather than Pressable: the quiz wants the
  // coordinate of the touch that started, with no press-vs-tap arbitration
  // over a board this large.
  const onStartShouldSetResponder = useCallback(() => !!onTap, [onTap]);
  const onResponderRelease = useCallback(
    (e: GestureResponderEvent) => {
      const { locationX, locationY } = e.nativeEvent;
      tapAtScreen(locationX, locationY);
    },
    [tapAtScreen]
  );

  return (
    <View
      style={[styles.board, { aspectRatio: w / h }]}
      onLayout={onLayout}
      onStartShouldSetResponder={onStartShouldSetResponder}
      onResponderRelease={onResponderRelease}
    >
      {ready ? (
        <SvgXml
          xml={xml}
          width="100%"
          height="100%"
          preserveAspectRatio={PRESERVE_ASPECT_RATIO}
        />
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  board: {
    width: '100%',
    backgroundColor: color.board,
    borderRadius: radius.control, // the web's .board is 8px (playbook.css:122)
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line2,
    overflow: 'hidden',
  },
});
