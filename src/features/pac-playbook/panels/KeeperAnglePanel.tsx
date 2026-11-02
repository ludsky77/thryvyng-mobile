/**
 * The keeper's angle board — PLAYBOOK-KEEPER-ANGLE, Lu, 2026-11-02.
 *
 * Drag the ball and watch where the keeper has to stand. The shooting triangle
 * is the ball and the two posts; the keeper stands on an arc in front of goal,
 * on that triangle's bisector; the goal line underneath shows what the keeper
 * actually covers from there and what is still open. Second mode: the reader
 * places the keeper and finds out.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * WHY THIS IS A COMPONENT AND NOT A DIAGRAM BLOCK.
 *
 * Every other figure in the book is JSON in `playbook_blocks`, drawn by the
 * mirrored renderer. This one cannot be, and the reason is not a missing
 * element type — it is that the picture is a FUNCTION OF THE FINGER. The
 * triangle, the keeper's spot, the reach ring and the covered runs are all
 * recomputed on every touch move, and no stored element list can express that.
 *
 * It also needs NO stored data, which is a deliberate choice
 * (`docs/recon/playbook-content-gaps.md`, RECOMMEND 1): the pitch is the laws
 * of the game, the three depths are the constants below, and the words are
 * this file's. So there is **no new `playbook_blocks.kind`**, no change to
 * `types.ts` or `search.ts` — both of which are byte-identical mirrors of the
 * web's (`MIRROR.md`) — and no migration. The card that shows this board
 * carries `content.kind = 'keeperangle'` and nothing else.
 *
 * THE RENDERER IS NOT TOUCHED. `renderDiagram.ts` is mirrored and
 * non-negotiable, so nothing is added to it and nothing is taken from it but
 * its colours. **This panel does not use the shared backdrop at all** — it
 * draws its own chalk at true scale, for the reason set out above
 * `GOAL_M` below: `zoom-goal`'s box is 26.0 m × 8.1 m and has no penalty
 * spot, so with the presets at their real distances the spot sat outside the
 * box. Every other board in the book still gets the shared backdrop,
 * unchanged.
 *
 * SO THERE IS NO `SvgXml` AND NO STRING HERE AT ALL. Both layers are
 * `react-native-svg` COMPONENTS sharing one viewBox: `Chalk`, which is static
 * and memoized with no props so React never re-renders it, and the live layer
 * over it. A drag moves props on existing native views — no string, no XML
 * parse per frame. Ruling E-R2 = A is about the cost of re-parsing an SVG
 * string sixty times a second, and this panel never parses one.
 *
 * NOTHING IS COPIED FROM THE RENDERER'S COORDINATES ANY MORE. The first cut
 * re-declared `POST` and `GY` from `renderDiagram.ts:112` and carried a
 * warning that they would rot if that backdrop ever moved. They are now
 * derived from the laws of the game instead — a goal is 7.32 m — so there is
 * nothing left to keep in step.
 *
 * NO ANIMATION, so nothing to reduce. There is no loop, no transition and no
 * timer in this file: every redraw is a touch the reader made. A reduced-motion
 * reader therefore gets the identical board, which is why there is no
 * `AccessibilityInfo` branch here (`CardBoard` has one because its tab
 * playback is real motion).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Polygon, Polyline, Text as SvgText } from 'react-native-svg';
import { CLR } from '../diagram/renderDiagram';
import { useLang } from '../strings';
import { Btn } from '../ui';
import { pbk } from '../styles';
import { color, fontFamily as ff, type SectionTone } from '../theme';

/* ------------------------------------------------------------- the geometry */

type Pt = [number, number];

/**
 * ──────────────────── THE PITCH, AND THE WINDOW ONTO IT ────────────────────
 *
 * THIS PANEL DRAWS ITS OWN CHALK, and the chalk is TRUE TO THE GEOMETRY —
 * Lu's ruling, 2026-11-02: the geometry is the teaching, so the lines have to
 * agree with it.
 *
 * WHY IT CANNOT USE THE SHARED BACKDROP. `zoom-goal`
 * (`renderDiagram.ts:110-115`) is schematic: read back at the scale its own
 * goal sets, its box is 26.0 m × 8.1 m — wider and deeper than a 6-yard box
 * (18.32 × 5.5) and far shallower than a penalty area (40.32 × 16.5) — its D
 * is 4.1 m where a real one is 9.15 m, and it draws no penalty spot at all.
 * With the presets at their true distances the penalty spot landed ABOVE that
 * box, which looks like a mistake and is really the chalk disagreeing with the
 * pitch. `renderDiagram.ts` is mirrored and may not be edited, so this panel
 * simply does not use it: `Chalk` below draws the goal, both boxes, the spot
 * and the D itself, at this file's own metre scale, in the renderer's own pen.
 * **Nothing mirrored changed; the shared backdrop is untouched for every other
 * board in the book.**
 *
 * EVERY DISTANCE HERE IS METRES, converted once by `M()`. The pitch numbers
 * are the laws of the game; the two margins are the only taste in this block.
 */
const GOAL_M = 7.32; //      post to post
const PA_W_M = 40.32; //     penalty area, across
const PA_D_M = 16.5; //      penalty area, deep
const SIX_W_M = 18.32; //    six-yard box, across
const SIX_D_M = 5.5; //      six-yard box, deep
const SPOT_M = 11; //        the penalty spot, out from the goal line
const ARC_R_M = 9.15; //     the D, radius about the spot

/** Chalk must not sit on the board's own edge. These two are taste. */
const SIDE_M = 1.2;
const BEHIND_M = 0.9; //     the strip of grass behind the goal line

/**
 * THE WINDOW, and the fit it was chosen for. The widest thing on the board is
 * the penalty area, 40.32 m. At the previous scale (1 unit = 0.4067 m, taken
 * from the shared backdrop's goal) that is **99.15 of 100 units** — it fits,
 * but its two touchlines land 0.17 m from the board's edge, which reads as a
 * box someone forgot to finish. Widening this panel's own window to the
 * penalty area plus 1.2 m a side is the smallest change that fits it properly;
 * it moves the unit scale by 4.8% and **no shared file**, since `VB` has
 * always been local to this panel. Metres are unchanged, so every angle and
 * every coverage number is unchanged with them.
 */
const VIEW_W_M = PA_W_M + 2 * SIDE_M; //                   42.72 m
const VIEW_D_M = BEHIND_M + SPOT_M + ARC_R_M + SIDE_M; //  22.25 m, to the top of the D

/** Board units per metre — fixed by asking for a viewBox a round 100 across. */
const U_PER_M = 100 / VIEW_W_M;
/** Metres → board units. The ONLY conversion in this file. */
const M = (m: number) => m * U_PER_M;

/** 100 × 52.08, derived — not a number anybody typed. */
const VB = { w: 100, h: M(VIEW_D_M) };

/** The goal line, and the mouth: the posts are at `w/2 ± POST`. */
const GY = VB.h - M(BEHIND_M);
const POST = M(GOAL_M / 2);
const PL: Pt = [VB.w / 2 - POST, GY];
const PR: Pt = [VB.w / 2 + POST, GY];

/**
 * THE ROPE — the arc a keeper walks.
 *
 * Coaches teach the starting position as an arc, not a line: step out far
 * enough to cut the angle, never so far that a lifted ball goes over you. The
 * arc is the circle through both posts whose apex is `ROPE_DEPTH` — **2.5 m** —
 * in front of the goal's centre.
 *
 * The circle from a chord and an apex: with the goal line as y = 0 and "in
 * front" as +y, the posts are (±hw, 0) and the apex is (0, d). A centre on
 * x = 0 at (0, k) gives hw² + k² = (d − k)², so **k = (d² − hw²) / 2d** and
 * **R = d − k**. Here d < hw, so k is NEGATIVE — the centre sits behind the
 * goal line, which is why the arc is shallow.
 */
const ROPE_DEPTH = M(2.5);
const ROPE_K = (ROPE_DEPTH * ROPE_DEPTH - POST * POST) / (2 * ROPE_DEPTH);
/** Board y grows downward and the goal is at the bottom, so `−k` is `+y`. */
const ROPE_C: Pt = [VB.w / 2, GY - ROPE_K];
const ROPE_R = ROPE_DEPTH - ROPE_K;

/** How far the keeper's hands reach, 1.6 m — the radius of the dashed ring. */
const REACH = M(1.6);

/**
 * Inside the rope there is no angle left to cut, so the keeper stops standing
 * and goes to the ball. A quarter of a metre goal-side of it: close enough to
 * smother, still between the ball and the net.
 */
const ATTACK = M(0.25);

/** Goal-line samples. 80 over 18 units is a sample every 0.225 — sub-pixel. */
const SAMPLES = 80;

/**
 * Touching within this of the keeper picks the keeper up, not the ball.
 *
 * The `+ 2` is in BOARD UNITS on purpose and is not converted: it is a
 * finger's worth of slack on a touchscreen, not a distance on a pitch.
 */
const GRAB = REACH + 2;

const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
const len = (v: Pt) => Math.hypot(v[0], v[1]);
const unit = (v: Pt): Pt => {
  const L = len(v) || 1;
  return [v[0] / L, v[1] / L];
};

/** The triangle's bisector at the ball, pointing into the goal. */
function bisector(ball: Pt): Pt {
  const a = unit(sub(PL, ball));
  const b = unit(sub(PR, ball));
  const s: Pt = [a[0] + b[0], a[1] + b[1]];
  // The two post directions cancel only when the ball is ON the goal line
  // between the posts, where "toward goal" is the goal's centre.
  if (len(s) < 1e-6) return unit(sub([VB.w / 2, GY], ball));
  return unit(s);
}

/** The angle the goal subtends at the ball, in degrees. */
function shotAngle(ball: Pt): number {
  const a = unit(sub(PL, ball));
  const b = unit(sub(PR, ball));
  const d = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1]));
  return (Math.acos(d) * 180) / Math.PI;
}

/** Where the keeper stands if nobody is dragging them. */
function autoKeeper(ball: Pt): Pt {
  const dir = bisector(ball);
  const f = sub(ball, ROPE_C);
  const b = f[0] * dir[0] + f[1] * dir[1];
  const c = f[0] * f[0] + f[1] * f[1] - ROPE_R * ROPE_R;
  const apex: Pt = [ROPE_C[0], ROPE_C[1] - ROPE_R];
  // Inside the rope — attack the ball. See ATTACK.
  if (c < 0) return [ball[0] + dir[0] * ATTACK, ball[1] + dir[1] * ATTACK];
  const disc = b * b - c;
  // A ray that misses the rope entirely (level with the goal line, outside the
  // posts) leaves the apex as the only honest answer.
  if (disc < 0) return apex;
  const root = Math.sqrt(disc);
  const t = -b - root;
  if (t > 0) return [ball[0] + dir[0] * t, ball[1] + dir[1] * t];
  const t2 = -b + root;
  if (t2 > 0) return [ball[0] + dir[0] * t2, ball[1] + dir[1] * t2];
  return apex;
}

/** Distance from `p` to the segment `a`–`b`. */
function distToSeg(a: Pt, b: Pt, p: Pt): number {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const L2 = vx * vx + vy * vy;
  if (L2 < 1e-9) return len(sub(p, a));
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / L2));
  return Math.hypot(p[0] - (a[0] + t * vx), p[1] - (a[1] + t * vy));
}

export interface GoalRun {
  x0: number;
  x1: number;
  covered: boolean;
}

/**
 * What the keeper covers, sampled along the goal line.
 *
 * A point is COVERED when the shot to it — the segment ball → point — passes
 * within `REACH` of the keeper. Distance to the SEGMENT and not to the line,
 * so a keeper standing behind the ball does not "cover" a shot going the other
 * way.
 *
 * Exported for the `__DEV__` harness, which checks the two ends of the rule
 * (nothing covered from a flat angle with the keeper on the far post; nearly
 * everything covered from the penalty spot) rather than trusting the picture.
 */
export function goalCoverage(ball: Pt, keeper: Pt): { pct: number; runs: GoalRun[] } {
  const span = PR[0] - PL[0];
  const runs: GoalRun[] = [];
  let n = 0;
  let prev: boolean | null = null;
  for (let i = 0; i < SAMPLES; i++) {
    const covered = distToSeg(ball, [PL[0] + ((i + 0.5) / SAMPLES) * span, GY], keeper) <= REACH;
    if (covered) n++;
    const x1 = PL[0] + ((i + 1) / SAMPLES) * span;
    if (prev === covered && runs.length) runs[runs.length - 1].x1 = x1;
    else runs.push({ x0: PL[0] + (i / SAMPLES) * span, x1, covered });
    prev = covered;
  }
  return { pct: Math.round((n / SAMPLES) * 100), runs };
}

/* ---------------------------------------------------------------- the words */

/**
 * The zone, by angle. Three bands, and the thresholds are the teaching: under
 * 14° there is almost no goal to see and the near post is everything; over 30°
 * the shooter can pick a corner and the keeper has to come out to shrink it.
 */
function zoneFor(angle: number, es: boolean): { label: string; tip: string } {
  if (angle < 14)
    return {
      label: es ? 'Ángulo cerrado · primer palo' : 'Tight · near post',
      tip: es
        ? 'Hazte dueño del primer palo. Tócalo, da un paso fuera de la línea — por dentro no se te cuela nada.'
        : 'Own your near post. Touch it, then set one step off your line — nothing sneaks inside you.',
    };
  if (angle <= 30)
    return {
      label: es ? 'Intermedio · primer palo primero' : 'In between · near post first',
      tip: es
        ? 'Primero el primer palo, después el centro. Colócate, pasos cortos, manos listas — que te ganen a ti, no al espacio.'
        : 'Near post first, then the middle. Set, small steps, hands ready — make them beat you, not the space.',
    };
  return {
    label: es ? 'Ángulo abierto · sal y quédate al centro' : 'Wide · step up, stay central',
    tip: es
      ? 'Sal y quédate al centro. Desde ahí el peligro es el pase — hazte grande y corta el centro antes del tiro.'
      : 'Step up and stay central. From there the pass is the danger — be big, and cut the cross before the shot.',
  };
}

/**
 * Four places worth standing a ball, **in metres** — `across` from the goal's
 * centre line, `out` from the goal line — so that a reader who knows the game
 * can check them against a pitch, and so no later one is placed by eye.
 *
 * The penalty spot is the one that matters: 11 m, the real distance. The
 * backdrop draws no spot to put it on (see the metre-scale note above), so it
 * goes at its true distance rather than onto chalk that is at another scale.
 */
const preset = (across: number, out: number): Pt => [VB.w / 2 - M(across), GY - M(out)];

const PRESETS: { id: string; en: string; es: string; ball: Pt }[] = [
  { id: 'byline', en: 'Byline', es: 'Línea de fondo', ball: preset(14, 1.2) },
  { id: 'corner', en: 'Box corner', es: 'Esquina del área', ball: preset(17, 15) },
  { id: 'wide', en: 'Wide angle', es: 'Ángulo abierto', ball: preset(8, 11) },
  { id: 'pk', en: 'PK spot', es: 'Punto penal', ball: preset(0, 11) },
];

/* -------------------------------------------------------------- the drawing */

/** An open three-sided box, drawn the way the renderer draws its boxes. */
const boxPoints = (wM: number, dM: number) => {
  const x0 = VB.w / 2 - M(wM / 2);
  const x1 = VB.w / 2 + M(wM / 2);
  const yt = GY - M(dM);
  return `${x0.toFixed(2)},${GY.toFixed(2)} ${x0.toFixed(2)},${yt.toFixed(2)} ${x1.toFixed(2)},${yt.toFixed(2)} ${x1.toFixed(2)},${GY.toFixed(2)}`;
};

/** The penalty spot, and the part of the D that shows outside the box. */
const SPOT: Pt = [VB.w / 2, GY - M(SPOT_M)];

/**
 * The D, sampled rather than drawn with an SVG arc — the same reason the rope
 * is (see `ROPE_POINTS`): the two arc flags cannot be checked by reading them.
 * Only the part OUTSIDE the penalty area is drawn, which is the only part of a
 * real D that exists, so the arc runs between its two crossings of the box's
 * top line and bulges away from the goal.
 */
const ARC_POINTS = (() => {
  const r = M(ARC_R_M);
  const top = GY - M(PA_D_M);
  const dy = SPOT[1] - top; // the box's top line, above the spot
  const half = Math.sqrt(Math.max(0, r * r - dy * dy));
  if (half <= 0) return ''; // the D would be swallowed by the box
  const a0 = Math.atan2(-dy, -half);
  const a1 = Math.atan2(-dy, half);
  const out: string[] = [];
  const n = 40;
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push(
      `${(SPOT[0] + Math.cos(a) * r).toFixed(2)},${(SPOT[1] + Math.sin(a) * r).toFixed(2)}`
    );
  }
  return out.join(' ');
})();

/**
 * THE CHALK — this panel's own, at true scale, in the renderer's pen.
 *
 * The widths and opacities are `renderDiagram.ts`'s own (`chalkLine` at 0.5 /
 * 0.4, the goal mouth at 1.4 in `CLR.ink`), so these lines sit beside the
 * book's other boards as the same hand drew them. Everything is static, so it
 * is memoized with no props and React never re-renders it during a drag.
 */
const Chalk = React.memo(function Chalk() {
  const chalk = {
    stroke: CLR.chalk,
    strokeWidth: 0.5,
    fill: 'none',
    opacity: 0.4,
  } as const;
  return (
    <Svg
      style={StyleSheet.absoluteFill}
      viewBox={`0 0 ${VB.w} ${VB.h}`}
      preserveAspectRatio="xMidYMid meet"
      pointerEvents="none"
    >
      {/* the goal line, running the width of the pitch */}
      <Line x1={0} y1={GY} x2={VB.w} y2={GY} {...chalk} />
      {/* the penalty area, then the six-yard box */}
      <Polyline points={boxPoints(PA_W_M, PA_D_M)} {...chalk} />
      <Polyline points={boxPoints(SIX_W_M, SIX_D_M)} {...chalk} />
      {/* the D — only the part outside the area */}
      {ARC_POINTS ? <Polyline points={ARC_POINTS} {...chalk} /> : null}
      {/* the penalty spot */}
      <Circle cx={SPOT[0]} cy={SPOT[1]} r={M(0.33)} fill={CLR.chalk} opacity={0.55} />
      {/* the goal mouth itself — the one line that is not chalk */}
      <Line x1={PL[0]} y1={GY} x2={PR[0]} y2={GY} stroke={CLR.ink} strokeWidth={1.4} />
    </Svg>
  );
});

/**
 * The rope, as a sampled polyline rather than an SVG arc.
 *
 * `A rx ry 0 laf sf x y` would draw the same curve, but which of the four arcs
 * it picks depends on two flags whose correctness cannot be read off the
 * source. Sampling from the left post's angle to the right post's — which
 * passes through the apex because the centre is behind the line — is the same
 * curve with nothing to get wrong, and it is computed once at module load.
 */
const ROPE_POINTS = (() => {
  const a0 = Math.atan2(PL[1] - ROPE_C[1], PL[0] - ROPE_C[0]);
  const a1 = Math.atan2(PR[1] - ROPE_C[1], PR[0] - ROPE_C[0]);
  const out: string[] = [];
  const n = 48;
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push(`${(ROPE_C[0] + Math.cos(a) * ROPE_R).toFixed(2)},${(ROPE_C[1] + Math.sin(a) * ROPE_R).toFixed(2)}`);
  }
  return out.join(' ');
})();

/**
 * The rope's ink — the book's sky, `theme.ts`'s `sectionTones[1].ink`, written
 * out rather than read from that array so the rope's colour cannot change the
 * day the tone list is reordered.
 */
const ROPE_INK = '#6FB1FF';

export function KeeperAnglePanel({
  tone,
  initialMode,
  initialBall,
}: {
  tone?: SectionTone | null;
  /**
   * Which mode and which preset to OPEN on — harness-only
   * (`PlaybookLook.keeperMode` / `.keeperBall`), because both of those states
   * are otherwise behind a press and a simulator cannot be tapped from a
   * shell. An unknown preset id falls back to the default, so a typo in a deep
   * link shows the board rather than nothing.
   */
  initialMode?: 'watch' | 'you';
  initialBall?: string;
}) {
  const { lang } = useLang();
  const es = lang === 'es';
  const ink = tone?.ink || CLR.us;

  const [mode, setMode] = useState<'watch' | 'you'>(initialMode ?? 'watch');
  const [ball, setBall] = useState<Pt>(() => {
    const p = initialBall ? PRESETS.find((x) => x.id === initialBall) : undefined;
    return [...(p ?? PRESETS[2]).ball] as Pt;
  });
  const [mine, setMine] = useState<Pt | null>(null);

  const layoutRef = useRef({ width: 0, height: 0 });
  const dragRef = useRef<'ball' | 'keeper'>('ball');

  const auto = useMemo(() => autoKeeper(ball), [ball]);
  const keeper = mode === 'you' && mine ? mine : auto;

  // Entering "you be the keeper" hands the reader the keeper where the board
  // was already showing them, so the first drag is a move and not a guess.
  useEffect(() => {
    if (mode === 'you') setMine((m) => m ?? autoKeeper(ball));
    // `ball` is read to SEED only; re-seating on every ball move would be the
    // auto keeper wearing a different name.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const angle = useMemo(() => shotAngle(ball), [ball]);
  const cov = useMemo(() => goalCoverage(ball, keeper), [ball, keeper]);
  const autoCov = useMemo(() => goalCoverage(ball, auto), [ball, auto]);
  const zone = zoneFor(angle, es);
  const delta = cov.pct - autoCov.pct;
  const best = delta >= -3;

  /** Screen point → board units, clamped. MovementPanel's `pointAt`. */
  const pointAt = useCallback((lx: number, ly: number): Pt => {
    const { width, height } = layoutRef.current;
    if (!width || !height) return [VB.w / 2, VB.h / 2];
    return [(lx / width) * VB.w, (ly / height) * VB.h];
  }, []);

  /**
   * The ball stays on the board and in front of the goal line — in METRES,
   * like everything else physical, so the limits survive a change of window.
   * Half a metre of grass at the edges, and the ball never crosses the line.
   */
  const clampBall = (p: Pt): Pt => [
    Math.min(VB.w - M(0.5), Math.max(M(0.5), p[0])),
    Math.min(GY - M(0.5), Math.max(M(0.5), p[1])),
  ];

  /**
   * The keeper stays in front of their line and near their goal: four metres
   * wide of each post, and never more than ten metres off the line — further
   * out than that is not a decision this board is teaching.
   */
  const clampKeeper = (p: Pt): Pt => [
    Math.min(PR[0] + M(4), Math.max(PL[0] - M(4), p[0])),
    Math.min(GY - M(0.3), Math.max(GY - M(10), p[1])),
  ];

  const grab = useCallback(
    (lx: number, ly: number) => {
      const p = pointAt(lx, ly);
      if (mode === 'you' && len(sub(p, keeper)) <= GRAB) {
        dragRef.current = 'keeper';
        setMine(clampKeeper(p));
        return;
      }
      dragRef.current = 'ball';
      setBall(clampBall(p));
    },
    [mode, keeper, pointAt]
  );

  const move = useCallback(
    (lx: number, ly: number) => {
      const p = pointAt(lx, ly);
      if (dragRef.current === 'keeper') setMine(clampKeeper(p));
      else setBall(clampBall(p));
    },
    [pointAt]
  );

  const dir = bisector(ball);
  // The dashed line runs from the ball down the bisector to the goal line.
  const sToLine = dir[1] > 0.01 ? (GY - ball[1]) / dir[1] : 0;
  const bisEnd: Pt = [ball[0] + dir[0] * sToLine, ball[1] + dir[1] * sToLine];

  const cell = (label: string, value: string, good?: boolean) => (
    <View style={pbk.kpcell} key={label}>
      <Text style={pbk.kpcellLabel}>{label}</Text>
      <Text style={[pbk.kpcellValue, good ? { color: color.green } : null]}>{value}</Text>
    </View>
  );

  return (
    <>
      <View style={pbk.mvgroup}>
        <Text style={pbk.mvgroupLabel}>{es ? 'Modo' : 'Mode'}</Text>
        <View style={pbk.mvchips}>
          {([
            ['watch', es ? 'Mira al portero' : 'Watch the keeper'],
            ['you', es ? 'Sé tú el portero' : 'You be the keeper'],
          ] as const).map(([id, label]) => (
            <Pressable
              key={id}
              onPress={() => setMode(id)}
              style={[pbk.mvchip, mode === id && pbk.mvchipOn]}
              accessibilityRole="button"
              accessibilityState={{ selected: mode === id }}
            >
              <Text style={[pbk.mvchipText, mode === id && pbk.mvchipOnText]}>{label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <Text style={pbk.oneMute}>
        {mode === 'watch'
          ? es
            ? 'Arrastra el balón. El portero se coloca solo, sobre la cuerda, en la bisectriz del triángulo de tiro.'
            : 'Drag the ball. The keeper places themself on the rope, on the bisector of the shooting triangle.'
          : es
            ? 'Arrastra el balón o al portero. Busca el punto donde tapas más portería.'
            : 'Drag the ball, or drag the keeper. Find the spot that covers the most goal.'}
      </Text>

      <View style={pbk.frame}>
        <View
          style={[pbk.kpboard, { aspectRatio: VB.w / VB.h }]}
          onLayout={(e) => {
            layoutRef.current = e.nativeEvent.layout;
          }}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderGrant={(e) => grab(e.nativeEvent.locationX, e.nativeEvent.locationY)}
          onResponderMove={(e) => move(e.nativeEvent.locationX, e.nativeEvent.locationY)}
        >
          {/* This panel's own chalk, at true scale — see `Chalk`. */}
          <Chalk />

          {/* Props, not strings — everything that moves. */}
          <Svg
            style={{ position: 'absolute', inset: 0 }}
            viewBox={`0 0 ${VB.w} ${VB.h}`}
            preserveAspectRatio="xMidYMid meet"
            pointerEvents="none"
          >
            {/* the shot: ball to both posts */}
            <Polygon
              points={`${ball[0]},${ball[1]} ${PL[0]},${PL[1]} ${PR[0]},${PR[1]}`}
              fill={ink}
              fillOpacity={0.16}
              stroke={ink}
              strokeWidth={0.5}
              strokeOpacity={0.9}
            />

            {/* the rope the keeper walks */}
            <Polyline
              points={ROPE_POINTS}
              fill="none"
              stroke={ROPE_INK}
              strokeWidth={0.55}
              strokeDasharray="0.9 1.5"
              strokeLinecap="round"
              opacity={0.95}
            />

            {/* the bisector — where the keeper has to be */}
            <Line
              x1={ball[0]}
              y1={ball[1]}
              x2={bisEnd[0]}
              y2={bisEnd[1]}
              stroke={CLR.chalk}
              strokeWidth={0.4}
              strokeDasharray="1.6 1.4"
              opacity={0.75}
            />

            {/* what is covered, and what is not, ON the goal line */}
            {cov.runs.map((r, i) => (
              <Line
                key={i}
                x1={r.x0}
                y1={GY}
                x2={r.x1}
                y2={GY}
                stroke={r.covered ? CLR.us : '#ffffff'}
                strokeWidth={1.9}
                strokeDasharray={r.covered ? undefined : '1 0.9'}
                strokeLinecap="butt"
              />
            ))}

            {/* the keeper's reach, then the keeper */}
            <Circle
              cx={keeper[0]}
              cy={keeper[1]}
              r={REACH}
              fill="none"
              stroke={CLR.gold}
              strokeWidth={0.4}
              strokeDasharray="1.2 1.1"
              opacity={0.8}
            />
            <Circle
              cx={keeper[0]}
              cy={keeper[1]}
              r={2.9}
              fill={CLR.gold}
              stroke="#0b1220"
              strokeWidth={0.6}
            />
            <SvgText
              x={keeper[0]}
              y={keeper[1] + 1.1}
              textAnchor="middle"
              fontSize={3.1}
              fontFamily={ff.extrabold}
              fill="#0b1220"
            >
              1
            </SvgText>

            {/* the ball */}
            <Circle
              cx={ball[0]}
              cy={ball[1]}
              r={2.2}
              fill={CLR.ball}
              stroke="#0b1220"
              strokeWidth={0.6}
            />
            <Circle
              cx={ball[0]}
              cy={ball[1]}
              r={4.4}
              fill="none"
              stroke="#ffffff"
              strokeWidth={0.4}
              strokeDasharray="1.4 1.2"
              opacity={0.7}
            />
          </Svg>

          <View style={pbk.boardSt} pointerEvents="none">
            <Text style={pbk.boardStText}>
              {mode === 'watch'
                ? es
                  ? 'arrastra el balón'
                  : 'drag the ball'
                : es
                  ? 'arrastra el balón o al portero'
                  : 'drag the ball or the keeper'}
            </Text>
          </View>
        </View>
        <View style={pbk.tray}>
          <View style={pbk.trayChalk} />
        </View>
      </View>

      <View style={pbk.kpreadouts}>
        {cell(es ? 'Ángulo' : 'Angle', `${Math.round(angle)}°`)}
        {cell(es ? 'Portería tapada' : 'Goal covered', `${cov.pct}%`)}
        {mode === 'you'
          ? cell(
              es ? 'Mejor sitio' : 'Best spot',
              best ? '✓' : `${delta}%`,
              best
            )
          : cell(es ? 'Portería libre' : 'Open goal', `${100 - cov.pct}%`)}
      </View>

      <View style={pbk.rolepanel}>
        <View style={pbk.rolepanelNum}>
          <Text style={pbk.rolepanelNumText}>{Math.round(angle)}</Text>
        </View>
        <View style={pbk.rolepanelBody}>
          <Text style={pbk.rolepanelLabel}>{zone.label}</Text>
          <Text style={pbk.rolepanelText}>{zone.tip}</Text>
        </View>
      </View>

      <Text style={pbk.subdesc}>
        {es
          ? 'En la línea de gol: verde = lo que el portero alcanza · blanco a trazos = lo que queda libre. La curva azul es la cuerda; el círculo a trazos, su alcance.'
          : 'On the goal line: green = what the keeper can reach · dashed white = what is still open. The blue curve is the rope; the dashed circle is their reach.'}
      </Text>

      <View style={pbk.kppresets}>
        {PRESETS.map((p) => (
          <Pressable
            key={p.id}
            onPress={() => setBall([...p.ball] as Pt)}
            style={({ pressed }) => [pbk.kppreset, pressed && pbk.pressed]}
            accessibilityRole="button"
          >
            <Text style={pbk.kppresetText}>{es ? p.es : p.en}</Text>
          </Pressable>
        ))}
      </View>

      {mode === 'you' ? (
        <Btn
          variant="ghost"
          label={`↺ ${es ? 'Ponlo donde debe ir' : 'Put them where they belong'}`}
          onPress={() => setMine(autoKeeper(ball))}
        />
      ) : null}
    </>
  );
}
