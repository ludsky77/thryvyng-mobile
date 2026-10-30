/**
 * Diagram geometry — a verbatim port of the frozen prototype's own helpers,
 * docs/playbook/pac-playbook-v2-FINAL-prototype.html:411-427.
 *
 * These are shared by the renderer and by tapTarget(), which the quiz uses to
 * place its hit test. The server grades a tap with the same arithmetic
 * (supabase/migrations/20261028190000_playbook_v1_schema.sql:1640-1677), so
 * any drift here shows up as a tap the player sees as right and the server
 * scores as wrong. Do not "improve" the formulas.
 */

import type { Diagram, DiagramElement, Point } from './types';

export const easeIn = (p: number): number => (p < 0.4 ? (p * p) / 0.8 : 0.2 + (p - 0.4)) / 0.8;

/** Cumulative segment lengths of a polyline, and the total. */
export function segLens(pts: Point[]): { L: number[]; tot: number } {
  const L: number[] = [];
  let tot = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    L.push(d);
    tot += d;
  }
  return { L, tot };
}

/** The first `p` (0..1) of a polyline, by arc length, plus its end point. */
export function partial(pts: Point[] | undefined, p: number): { pts: Point[]; end: Point } {
  if (!pts || pts.length < 2) {
    const fallback: Point[] = pts || [[0, 0]];
    return { pts: fallback, end: fallback[0] };
  }
  if (p >= 1) return { pts, end: pts[pts.length - 1] };
  const { L, tot } = segLens(pts);
  let left = p * tot;
  const out: Point[] = [pts[0]];
  for (let i = 0; i < L.length; i++) {
    if (left >= L[i]) {
      out.push(pts[i + 1]);
      left -= L[i];
    } else {
      const f = left / L[i];
      const e: Point = [
        pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f,
        pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f,
      ];
      out.push(e);
      return { pts: out, end: e };
    }
  }
  return { pts: out, end: out[out.length - 1] };
}

/** Has the line reached waypoint `idx` at progress `p`? Drives the dots. */
export function waypointReached(pts: Point[], p: number, idx: number): boolean {
  const { L, tot } = segLens(pts);
  let cum = 0;
  for (let i = 0; i < idx; i++) cum += L[i];
  return p * tot >= cum - 0.01;
}

/** The arrow head at the end of a pass or run. */
export function head(p1: Point, p2: Point, color: string, w?: number): string {
  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  const l = Math.hypot(dx, dy) || 1;
  const ux = dx / l;
  const uy = dy / l;
  const s = 2.2 + (w || 0.8) * 0.6;
  const bx = p2[0] - ux * s;
  const by = p2[1] - uy * s;
  const px = -uy;
  const py = ux;
  return `<polygon points="${p2[0]},${p2[1]} ${bx + px * s * 0.5},${by + py * s * 0.5} ${bx - px * s * 0.5},${by - py * s * 0.5}" fill="${color}"/>`;
}

/** viewBox of a diagram: full pitch is portrait 100x140, zoom boards 100x(h||64). */
export function dims(d: Diagram): [number, number] {
  return d.backdrop === 'full-pitch' ? [100, 140] : [100, d.h || 64];
}

/** How long one pass of the animation runs, including the trailing hold. */
export function diagTotal(d: Diagram): number {
  if (d.total) return d.total;
  const ends = (d.elements || []).map((e: DiagramElement) => (e.at || 0) + (e.dur || 600));
  return Math.max(2500, ...ends) + (d.hold || 1500);
}
