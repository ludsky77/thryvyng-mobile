/**
 * `StillBoard` — the panels' board: one still picture, and "tap a number".
 *
 * The web's version (`thrive-and-score` @ `c772111`,
 * `diagram/DiagramBoard.tsx`, `StillBoard`) takes a pre-rendered HTML string,
 * drops it into a `<div>` and finds the tapped shirt number by walking the
 * DOM: `ev.target.closest('[data-el]')`, then `key.startsWith('pos-')`.
 *
 * NEITHER HALF EXISTS HERE. `SvgXml` drops `data-el` along with every other
 * unknown attribute, and React Native has no DOM to walk. So the hit test is
 * geometry, the same answer M2 gave for the quiz board: the tap is converted
 * to viewBox units by the renderer's own `dims()` ratio, and the `pos-*`
 * element whose centre is nearest — within its own drawn radius, with a
 * finger's worth of slack — is the one that was tapped.
 *
 * This is a SEPARATE component from `DiagramBoard` on purpose. `DiagramBoard`
 * answers a quiz question ("did this tap land on the answer?", `tapTarget()` +
 * `hypot <= r`, the rule the SERVER regrades with); this answers a panel
 * ("which shirt number is under my finger?"). Mixing them would put a second
 * meaning into the one function whose rule the server shares, and M2's hit
 * test is not to be touched.
 *
 * THE SLACK, stated because it is the one number here that the web does not
 * have. A `pos-*` player is drawn at `size: 3.1` in a 100-wide viewBox
 * (`usePlaybookBook.formationDiag`), which on a 343pt column is about 21pt
 * across — under the 44pt a finger wants. The web does not need slack: a
 * click either hits the circle's own pixels or it does not. `TAP_SLACK = 2.2`
 * viewBox units grows the catch radius to roughly a 44pt target at phone
 * width, and NEAREST-WINS keeps it unambiguous — two players 6 units apart
 * cannot both claim a tap, because only the closer one is returned.
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from 'react-native';
import { SvgXml } from 'react-native-svg';
import { dims } from './diagram/geometry';
import type { Diagram } from './diagram/types';
import { pbk } from './styles';
import { color, radius } from './theme';

/** The SVG default the web relies on, made explicit (same as M2's board). */
const PRESERVE_ASPECT_RATIO = 'xMidYMid meet';

/** Extra catch radius, in viewBox units. See the header. */
export const TAP_SLACK = 2.2;

/**
 * Which `pos-*` element a viewBox point lands on, or null.
 *
 * Nearest wins; ties cannot happen because `<` is strict and the elements are
 * in a stable order. `size` is the element's own drawn radius, so a bigger dot
 * catches a wider area exactly as it looks like it should.
 */
export function posAt(d: Diagram, vx: number, vy: number): string | null {
  let best: string | null = null;
  let bestD = Infinity;
  for (const el of d.elements || []) {
    if (!el.id?.startsWith('pos-') || el.x == null || el.y == null) continue;
    const dist = Math.hypot(vx - el.x, vy - el.y);
    if (dist <= (el.size || 3) + TAP_SLACK && dist < bestD) {
      bestD = dist;
      best = el.id;
    }
  }
  return best;
}

export function StillBoard({
  xml,
  diagram,
  caption,
  onPressPos,
}: {
  /** The already-rendered string, so a panel controls its own render options. */
  xml: string;
  /** The same diagram the string was rendered from — the hit test reads it. */
  diagram: Diagram;
  /** `.board .st` — the little pill, e.g. "tap a number". */
  caption?: string;
  /** Called with the element id, `pos-6`, as the web's `onClickEl` is. */
  onPressPos?: (elId: string) => void;
}) {
  const [w, h] = useMemo(() => dims(diagram), [diagram]);
  const layoutRef = useRef({ width: 0, height: 0 });
  const [ready, setReady] = useState(false);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    layoutRef.current = { width, height };
    setReady(width > 0 && height > 0);
  }, []);

  const onStartShouldSetResponder = useCallback(() => !!onPressPos, [onPressPos]);

  const onResponderRelease = useCallback(
    (e: GestureResponderEvent) => {
      if (!onPressPos) return;
      const { width, height } = layoutRef.current;
      if (!width || !height) return;
      const { locationX, locationY } = e.nativeEvent;
      const hit = posAt(diagram, (locationX / width) * w, (locationY / height) * h);
      if (hit) onPressPos(hit);
    },
    [onPressPos, diagram, w, h]
  );

  return (
    <View style={pbk.frame}>
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
        {caption ? (
          <View style={pbk.boardSt} pointerEvents="none">
            <Text style={pbk.boardStText}>{caption}</Text>
          </View>
        ) : null}
      </View>
      <View style={pbk.tray}>
        <View style={pbk.trayChalk} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  /** `.board` — the flat colour under the web's three stacked gradients. */
  board: {
    width: '100%',
    backgroundColor: color.board,
    borderRadius: radius.control,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line2,
    overflow: 'hidden',
  },
});
