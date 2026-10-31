/**
 * Move as one — the prototype's mvBlend / mvSVG / moveHTML / wireMove,
 * :614-665.
 *
 * Drag the ball; the team shape is an inverse-distance blend (power 2) of the
 * mode's keyframes on the ball position, and the roles and caption come from
 * the nearest keyframe. "Play the sequence" walks the keyframes in order.
 *
 * `mvBlend` IS THE WEB'S, LINE FOR LINE. It is the teaching — nearest keyframe
 * inside 0.6 units, else a weighted blend — and a difference in it would mean
 * the two apps show different shapes for the same ball position.
 *
 * WHAT IS REBUILT, AND WHY IT IS NOT A STRING. The web's `mvSVG()` composes
 * one SVG string per frame and assigns it to `innerHTML`, imperatively, 60
 * times a second during a drag (its own header explains why: routing a
 * pointermove through React state would make the drag feel different from the
 * frozen design). Handing that string to `SvgXml` would mean a full XML PARSE
 * per frame, which is the cost ruling E-R2 = A exists to avoid — M2 measured
 * that loop at 16.7 ms mean on a simulator and called it an UPPER bound, not
 * evidence about a phone.
 *
 * So the board is split where the cost is:
 *
 *   THE BACKDROP is `backdrop('full-pitch', 100, 140)` from the MIRRORED
 *   renderer, parsed ONCE through `SvgXml` and never again. It does not move.
 *
 *   THE PLAYERS, their role tags and the ball are `react-native-svg`
 *   COMPONENTS in a second `<Svg>` over it, sharing the same viewBox. A drag
 *   moves props on existing native views — no string, no parse — which is the
 *   mobile equivalent of what the web gets from touching `cx` / `cy`
 *   attributes directly, and it is why this panel can keep its drag while the
 *   card boards stay static.
 *
 * The shapes are the ones `mvSVG()` emits, attribute for attribute: r=3 and
 * r=2.8 and r=2.2 circles with a `#0b1220` 0.6 stroke, the 3.1 / 2.9 numerals
 * at `y + 1.1`, the 4.6 x 4 role tag at `(x + 3.2, y − 5.4)` with rx 1.2, and
 * the ball's dashed 4.4 halo at `stroke-dasharray 1.4 1.2`, opacity .7.
 * `ROLE_CLR` and the `roleColor()` swap for the defending phase are the web's.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Svg, { Circle, G, Rect, SvgXml, Text as SvgText } from 'react-native-svg';
import { backdrop, CLR } from '../diagram/renderDiagram';
import type { MovementBlock, MovementKey } from '../types';
import { pick, useLang } from '../strings';
import { Fmt } from '../Fmt';
import { Btn } from '../ui';
import { pbk } from '../styles';
import { color, radius } from '../theme';

const ROLE_CLR: Record<string, string> = {
  B: '#ffd166',
  S: '#10b981',
  W: '#7c6cf0',
  D: '#e5484d',
  R: '#8b95a5',
  P: '#e5484d',
  C: '#f08a3c',
  Bd: '#7c6cf0',
  Sd: '#10b981',
};

const roleColor = (k: string, phase: string) =>
  phase === 'defend' && k === 'B'
    ? ROLE_CLR.Bd
    : phase === 'defend' && k === 'S'
      ? ROLE_CLR.Sd
      : ROLE_CLR[k];

type Ball = [number, number];

/** The pitch is 100 x 140 portrait (`geometry.dims`, `full-pitch`). */
const VB = { w: 100, h: 140 };

/** Parsed once. The pitch lines never move. */
const PITCH_XML = `<svg viewBox="0 0 ${VB.w} ${VB.h}">${backdrop('full-pitch', VB.w, VB.h)}</svg>`;

/** :617-623 — nearest keyframe wins inside 0.6 units, else weighted blend. */
function mvBlend(keys: MovementKey[], ball: Ball): { pos: Record<string, Ball>; near: MovementKey } {
  let near = keys[0];
  let nd = 1e9;
  for (const k of keys) {
    const d = Math.hypot(k.ball[0] - ball[0], k.ball[1] - ball[1]);
    if (d < nd) {
      nd = d;
      near = k;
    }
  }
  if (nd < 0.6) return { pos: near.pos as Record<string, Ball>, near };

  let wsum = 0;
  const acc: Record<string, [number, number]> = {};
  for (const k of keys) {
    const d = Math.hypot(k.ball[0] - ball[0], k.ball[1] - ball[1]);
    const w = 1 / (d * d + 1e-6);
    wsum += w;
    for (const n in k.pos) {
      acc[n] = acc[n] || [0, 0];
      acc[n][0] += k.pos[n][0] * w;
      acc[n][1] += k.pos[n][1] * w;
    }
  }
  const pos: Record<string, Ball> = {};
  for (const n in acc) pos[n] = [acc[n][0] / wsum, acc[n][1] / wsum];
  return { pos, near };
}

export function MovementPanel({ block }: { block: MovementBlock }) {
  const { lang } = useLang();
  const es = lang === 'es';
  const [modeId, setModeId] = useState<string>(() => block.modes[0]?.id);
  const mode = block.modes.find((m) => m.id === modeId) || block.modes[0];

  const [ball, setBall] = useState<Ball>(() => [...mode.keys[0].ball] as Ball);
  const layoutRef = useRef({ width: 0, height: 0 });
  const animRef = useRef<{ dead: boolean } | null>(null);

  const stopAnim = useCallback(() => {
    if (animRef.current) animRef.current.dead = true;
    animRef.current = null;
  }, []);

  // Reset the ball whenever the mode changes, the way the prototype does
  // (`S.mvBallMode !== mode.id`, :636).
  useEffect(() => {
    stopAnim();
    setBall([...mode.keys[0].ball] as Ball);
  }, [mode, stopAnim]);

  useEffect(() => stopAnim, [stopAnim]);

  const { pos, near } = useMemo(() => mvBlend(mode.keys, ball), [mode, ball]);
  const def = mode.phase === 'defend';

  /** The web's `pointAt`, :clamped to the same 4..96 / 4..136 window. */
  const pointAt = useCallback((lx: number, ly: number): Ball => {
    const { width, height } = layoutRef.current;
    if (!width || !height) return [VB.w / 2, VB.h / 2];
    return [
      Math.min(96, Math.max(4, (lx / width) * VB.w)),
      Math.min(136, Math.max(4, (ly / height) * VB.h)),
    ];
  }, []);

  const play = useCallback(() => {
    stopAnim();
    const A = { dead: false };
    animRef.current = A;
    const ks = mode.keys;
    let i = 0;
    setBall([...ks[0].ball] as Ball);
    const seg = 1400;
    const hold = 1100;
    const step = () => {
      if (A.dead || i >= ks.length - 1) {
        if (animRef.current === A) animRef.current = null;
        return;
      }
      const a = ks[i].ball;
      const b = ks[i + 1].ball;
      const st = Date.now();
      const tick = () => {
        if (A.dead) return;
        const p = Math.min(1, (Date.now() - st) / seg);
        const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
        setBall([a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e]);
        if (p < 1) requestAnimationFrame(tick);
        else {
          i++;
          setTimeout(step, hold);
        }
      };
      requestAnimationFrame(tick);
    };
    setTimeout(step, hold);
  }, [mode, stopAnim]);

  const atk = block.modes.filter((m) => m.phase === 'attack');
  const dfn = block.modes.filter((m) => m.phase === 'defend');
  const rset = block.roles[mode.phase] || {};

  const chip = (m: MovementBlock['modes'][number]) => (
    <Pressable
      key={m.id}
      onPress={() => {
        stopAnim();
        setModeId(m.id);
      }}
      style={[pbk.mvchip, m.id === mode.id && pbk.mvchipOn]}
    >
      <Text style={[pbk.mvchipText, m.id === mode.id && pbk.mvchipOnText]}>
        {pick(m.name, lang)}
      </Text>
    </Pressable>
  );

  return (
    <>
      <View style={pbk.mvgroup}>
        <Text style={pbk.mvgroupLabel}>{es ? 'Con balón' : 'With the ball'}</Text>
        <View style={pbk.mvchips}>{atk.map(chip)}</View>
      </View>
      <View style={pbk.mvgroup}>
        <Text style={pbk.mvgroupLabel}>{es ? 'Sin balón' : 'Without the ball'}</Text>
        <View style={pbk.mvchips}>{dfn.map(chip)}</View>
      </View>

      <Text style={pbk.oneMute}>
        <Fmt text={pick(mode.desc, lang)} />
      </Text>

      <View style={pbk.frame}>
        <View
          style={{
            width: '100%',
            aspectRatio: VB.w / VB.h,
            backgroundColor: color.board,
            borderRadius: radius.control,
            borderWidth: 1,
            borderColor: color.line2,
            overflow: 'hidden',
          }}
          onLayout={(e) => {
            layoutRef.current = e.nativeEvent.layout;
          }}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderGrant={(e) => {
            stopAnim();
            setBall(pointAt(e.nativeEvent.locationX, e.nativeEvent.locationY));
          }}
          onResponderMove={(e) =>
            setBall(pointAt(e.nativeEvent.locationX, e.nativeEvent.locationY))
          }
        >
          {/* Parsed once — the pitch. */}
          <SvgXml
            xml={PITCH_XML}
            width="100%"
            height="100%"
            preserveAspectRatio="xMidYMid meet"
          />
          {/* Props, not strings — the shape. */}
          <Svg
            style={{ position: 'absolute', inset: 0 }}
            viewBox={`0 0 ${VB.w} ${VB.h}`}
            preserveAspectRatio="xMidYMid meet"
            pointerEvents="none"
          >
            {def ? (
              <Circle
                cx={ball[0]}
                cy={ball[1] - 3.2}
                r={2.8}
                fill={CLR.them}
                stroke="#0b1220"
                strokeWidth={0.6}
              />
            ) : null}

            {Object.keys(pos).map((n) => {
              const [x, y] = pos[n];
              const r = (near.role || {})[n];
              const rc = r ? roleColor(r, mode.phase) : null;
              return (
                <G key={n}>
                  <Circle
                    cx={x}
                    cy={y}
                    r={3}
                    fill={n === '1' ? CLR.gold : CLR.us}
                    stroke="#0b1220"
                    strokeWidth={0.6}
                  />
                  <SvgText
                    x={x}
                    y={y + 1.1}
                    textAnchor="middle"
                    fontSize={3.1}
                    fontWeight="800"
                    fill="#0b1220"
                  >
                    {n}
                  </SvgText>
                  {r && rc ? (
                    <G translateX={x + 3.2} translateY={y - 5.4}>
                      <Rect
                        width={4.6}
                        height={4}
                        rx={1.2}
                        fill="#0b1220"
                        stroke={rc}
                        strokeWidth={0.45}
                      />
                      <SvgText
                        x={2.3}
                        y={3}
                        textAnchor="middle"
                        fontSize={2.9}
                        fontWeight="800"
                        fill={rc}
                      >
                        {r}
                      </SvgText>
                    </G>
                  ) : null}
                </G>
              );
            })}

            <Circle
              cx={ball[0]}
              cy={ball[1]}
              r={2.2}
              fill="#fff"
              stroke="#0b1220"
              strokeWidth={0.6}
            />
            <Circle
              cx={ball[0]}
              cy={ball[1]}
              r={4.4}
              fill="none"
              stroke="#fff"
              strokeWidth={0.4}
              strokeDasharray="1.4 1.2"
              opacity={0.7}
            />
          </Svg>

          <View style={pbk.boardSt} pointerEvents="none">
            <Text style={pbk.boardStText}>
              {es ? 'arrastra el balón' : 'drag the ball'}
            </Text>
          </View>
        </View>
        <View style={pbk.tray}>
          <View style={pbk.trayChalk} />
        </View>
      </View>

      <View style={pbk.rolepanel}>
        <View style={pbk.rolepanelNum}>
          <Text style={pbk.rolepanelNumText}>
            {near.holder != null ? String(near.holder) : '•'}
          </Text>
        </View>
        <View style={pbk.rolepanelBody}>
          <Text style={pbk.rolepanelLabel}>{pick(mode.name, lang)}</Text>
          <Text style={pbk.rolepanelText}>{pick(near.cap, lang)}</Text>
        </View>
      </View>

      <View style={pbk.mvroles}>
        {Object.entries(rset).map(([k, v]) => {
          const c = roleColor(k, mode.phase);
          return (
            <View key={k} style={pbk.mvroleItem}>
              <View style={[pbk.mvroleKey, { borderColor: c }]}>
                <Text style={[pbk.mvroleKeyText, { color: c }]}>{k}</Text>
              </View>
              <Text style={pbk.mvroleText}>{pick(v, lang)}</Text>
            </View>
          );
        })}
      </View>

      <View style={pbk.two}>
        <Btn
          variant="ghost"
          label={`▶ ${es ? 'Ver la secuencia' : 'Play the sequence'}`}
          onPress={play}
          style={{ flex: 1 }}
        />
        <Btn
          variant="ghost"
          label={`↺ ${es ? 'Reiniciar' : 'Reset'}`}
          onPress={() => {
            stopAnim();
            setBall([...mode.keys[0].ball] as Ball);
          }}
          style={{ flex: 1 }}
        />
      </View>
    </>
  );
}
