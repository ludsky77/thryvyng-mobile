/**
 * The one renderer. A verbatim port of the frozen prototype's `backdrop()`
 * and `render()`, docs/playbook/pac-playbook-v2-FINAL-prototype.html:419-479.
 *
 * It returns an SVG **string**, exactly as the prototype does, for two
 * reasons: the animation loop replaces the whole board 60 times a second, and
 * keeping the output byte-shaped like the prototype is what makes "the frozen
 * design, unchanged" checkable by eye. Callers hand the string to
 * dangerouslySetInnerHTML; every piece of text that reaches it goes through
 * esc() first.
 *
 * `tt` is the clock in ms, or null for "show the finished picture".
 */

import { dims, easeIn, head, partial, waypointReached } from './geometry';
import { heatSVG } from './heat';
import type { Diagram, DiagramElement, Point, RenderOptions } from './types';

export const CLR = {
  us: '#10b981',
  them: '#8b95a5',
  chalk: '#d7dde6',
  ink: '#eef2f7',
  cone: 'rgba(148,163,184,.18)',
  ball: '#ffffff',
  gold: '#d9b44a',
};

/** SVG-safe text. The prototype's esc(), :388. */
export const esc = (s: unknown): string =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * DIAGRAM-LABEL-FIT (2026-10-30). A labelled box sizes to its label: the
 * declared width is a MINIMUM, and the box grows to fit the text, centred on
 * the element's declared x. The allowance is per character of the label as
 * drawn (font-size 4.2, weight 800, letter-spacing .3): measured in Chrome at
 * 3.43 viewBox units/char for the system UI stack ("RECUPERAR", -apple-system)
 * and 3.39 for Archivo, so 3.5 covers both platforms with slack, and the 6 of
 * padding is 3 clear units each side. Pure arithmetic, no DOM, no font metrics.
 */
export const BOX_CHAR_W = 3.5;
export const BOX_PAD_X = 6;
export function boxWidth(declared: number | undefined, label: string): number {
  return Math.max(declared || 30, label.length * BOX_CHAR_W + BOX_PAD_X);
}

/** A labelled box's rect in viewBox units, as render() draws it. */
export type BoxRect = { x0: number; x1: number; y0: number; y1: number };

/**
 * DIAGRAM-ARROW-UNDER-BOX (2026-10-30, same root as DIAGRAM-LABEL-FIT). Boxes
 * paint over passes and runs, and a box sized to its label can now reach past
 * the pass endpoint that used to touch its edge, hiding the arrowhead. So a
 * pass or run whose END lies inside a box rect is shortened along its own
 * last segment: the tip stops at the box edge minus `headLen` (the arrowhead's
 * length, geometry.ts head()). One whose START lies inside a box begins at
 * the edge, so the shaft does not paint under the box. Seed data untouched;
 * a segment wholly inside a box, or too short to shorten, is left as it is.
 */
export function clearBoxes(pts: Point[], rects: BoxRect[], headLen: number): Point[] {
  if (pts.length < 2 || !rects.length) return pts;
  const inside = (q: Point, r: BoxRect) => q[0] > r.x0 && q[0] < r.x1 && q[1] > r.y0 && q[1] < r.y1;
  // t along P→Q where the line crosses each slab, as entry/exit parameters.
  const slab = (p: number, d: number, lo: number, hi: number): [number, number] => {
    if (d === 0) return [-Infinity, Infinity];
    const a = (lo - p) / d;
    const b = (hi - p) / d;
    return a < b ? [a, b] : [b, a];
  };
  const out = pts.slice();
  const n = out.length;
  const endRect = rects.find((r) => inside(out[n - 1], r));
  if (endRect) {
    const [px, py] = out[n - 2];
    const [qx, qy] = out[n - 1];
    const dx = qx - px;
    const dy = qy - py;
    const len = Math.hypot(dx, dy);
    const tIn = Math.max(slab(px, dx, endRect.x0, endRect.x1)[0], slab(py, dy, endRect.y0, endRect.y1)[0]);
    const keep = tIn * len - headLen; // shaft length left after the trim
    if (len > 0 && tIn > 0 && tIn <= 1 && keep > 0) out[n - 1] = [px + (dx / len) * keep, py + (dy / len) * keep];
  }
  const startRect = rects.find((r) => inside(out[0], r));
  if (startRect) {
    const [px, py] = out[0];
    const [qx, qy] = out[1];
    const dx = qx - px;
    const dy = qy - py;
    const tOut = Math.min(slab(px, dx, startRect.x0, startRect.x1)[1], slab(py, dy, startRect.y0, startRect.y1)[1]);
    if (tOut > 0 && tOut < 1) out[0] = [px + dx * tOut, py + dy * tOut];
  }
  return out;
}

const chalkLine = (d: string, w: number, op: number) =>
  `<path d="${d}" stroke="${CLR.chalk}" stroke-width="${w}" fill="none" opacity="${op}"/>`;

/** Chalk-white reference lines only — no turf fill. Motion spec, "Coordinate spaces". */
export function backdrop(b: string | undefined, w: number, h: number): string {
  if (b === 'zoom-touchline')
    return (
      chalkLine(`M 4 ${h - 7} L ${w - 4} ${h - 7}`, 0.6, 0.5) +
      chalkLine(`M ${w - 4} 9 L ${w - 24} 9 L ${w - 24} 28`, 0.5, 0.35)
    );
  if (b === 'zoom-goal')
    return (
      chalkLine(`M 18 ${h - 4} L 18 ${h - 24} L ${w - 18} ${h - 24} L ${w - 18} ${h - 4}`, 0.5, 0.4) +
      `<line x1="${w / 2 - 9}" y1="${h - 3.5}" x2="${w / 2 + 9}" y2="${h - 3.5}" stroke="${CLR.ink}" stroke-width="1.4"/>` +
      chalkLine(`M ${w / 2 - 10} ${h - 24} A 10 10 0 0 1 ${w / 2 + 10} ${h - 24}`, 0.5, 0.4)
    );
  if (b === 'zoom-goal-top')
    return (
      chalkLine(`M 18 4 L 18 24 L ${w - 18} 24 L ${w - 18} 4`, 0.5, 0.4) +
      `<line x1="${w / 2 - 9}" y1="3.5" x2="${w / 2 + 9}" y2="3.5" stroke="${CLR.ink}" stroke-width="1.4"/>` +
      chalkLine(`M ${w / 2 - 10} 24 A 10 10 0 0 0 ${w / 2 + 10} 24`, 0.5, 0.4)
    );
  if (b === 'full-pitch') {
    const st = `stroke="${CLR.chalk}" stroke-width="0.5" fill="none" opacity="0.45"`;
    return (
      `<rect x="3" y="3" width="${w - 6}" height="${h - 6}" rx="1.5" ${st}/>` +
      `<line x1="3" y1="${h / 2}" x2="${w - 3}" y2="${h / 2}" ${st}/>` +
      `<circle cx="${w / 2}" cy="${h / 2}" r="10" ${st}/>` +
      `<rect x="${w / 2 - 22}" y="3" width="44" height="16" ${st}/>` +
      `<rect x="${w / 2 - 22}" y="${h - 19}" width="44" height="16" ${st}/>` +
      `<rect x="${w / 2 - 10}" y="3" width="20" height="7" ${st}/>` +
      `<rect x="${w / 2 - 10}" y="${h - 10}" width="20" height="7" ${st}/>` +
      `<line x1="${w / 2 - 9}" y1="3.4" x2="${w / 2 + 9}" y2="3.4" stroke="${CLR.ink}" stroke-width="1.4"/>`
    );
  }
  return '';
}

export function render(d: Diagram, tt: number | null, opts?: RenderOptions): string {
  const o0 = opts || {};
  const [w, h] = dims(d);
  const tnow = tt == null ? 1e9 : tt;
  const es = o0.lang === 'es';

  const progLin = (el: DiagramElement) =>
    Math.max(0, Math.min(1, (tnow - (el.at || 0)) / (el.dur || 600)));
  const prog = (el: DiagramElement) => {
    const p = progLin(el);
    return el.ease === 'in' ? easeIn(p) : p;
  };

  const byId: Record<string, DiagramElement> = {};
  (d.elements || []).forEach((e) => {
    byId[e.id] = e;
  });

  const col = (el: DiagramElement): string | null =>
    el.color === 'them' ? CLR.them : el.color === 'us' ? CLR.us : el.color || null;

  const pos = (el: DiagramElement): Point => {
    if (el.follow && byId[el.follow]) {
      const f = byId[el.follow];
      const pp = prog(f);
      const { end } = partial(f.points, pp);
      return pp > 0 ? end : [el.x ?? 0, el.y ?? 0];
    }
    if (el.seq) {
      let last: Point = [el.x ?? 0, el.y ?? 0];
      for (const id of el.seq) {
        const f = byId[id];
        if (!f || tnow < (f.at || 0)) break;
        const pp = prog(f);
        last = partial(f.points, pp).end;
        if (pp < 1) break;
      }
      return last;
    }
    return [el.x ?? 0, el.y ?? 0];
  };

  const bd = backdrop(d.backdrop, w, h);
  let o = bd;
  const E = d.elements || [];

  const boxLabel = (el: DiagramElement): string => (es && el.text_es ? el.text_es : el.text) || '';
  const boxRects: BoxRect[] = E.filter((el) => el.type === 'box').map((el) => {
    const bw = boxWidth(el.w, boxLabel(el));
    const bh = el.h || 9;
    const x = el.x ?? 0;
    const y = el.y ?? 0;
    return { x0: x - bw / 2, x1: x + bw / 2, y0: y - bh / 2, y1: y + bh / 2 };
  });

  // zones, then cones, then lines, then everything that sits on top — the
  // prototype's paint order, which is what keeps dots above their own runs.
  E.forEach((el) => {
    if (el.type !== 'zone') return;
    const ww = el.w || 20;
    const hh = el.h || 10;
    o += `<rect data-el="${el.id}" x="${(el.x ?? 0) - ww / 2}" y="${(el.y ?? 0) - hh / 2}" width="${ww}" height="${hh}" rx="1.5" fill="${col(el) || CLR.us}" opacity="${el.opacity ?? 0.14}"/>`;
  });

  E.forEach((el) => {
    if (el.type !== 'cone') return;
    const [cx, cy] = pos(el);
    const to = el.to || ([cx, cy - 10] as Point);
    const a = Math.atan2(to[1] - cy, to[0] - cx);
    const s = (el.spread || 30) * (Math.PI / 180);
    const L = el.len || 8;
    o += `<polygon data-el="${el.id}" points="${cx},${cy} ${cx + Math.cos(a - s) * L},${cy + Math.sin(a - s) * L} ${cx + Math.cos(a + s) * L},${cy + Math.sin(a + s) * L}" fill="${CLR.cone}" opacity="${el.opacity ?? 1}"/>`;
  });

  E.forEach((el) => {
    if (['pass', 'run', 'reference', 'option'].indexOf(el.type) < 0 || el.hidden) return;
    const p = el.type === 'reference' ? 1 : prog(el);
    if (p <= 0) return;
    const wgt =
      el.weight ||
      (el.type === 'pass' ? 0.8 : el.type === 'run' ? 0.7 : el.type === 'option' ? 0.7 : 0.5);
    const raw: Point[] = el.points || [
      [10, 10],
      [30, 30],
    ];
    const pts =
      el.type === 'pass' || el.type === 'run' ? clearBoxes(raw, boxRects, 2.2 + wgt * 0.6) : raw;
    const { pts: pp, end } = partial(pts, p);
    const c = el.type === 'reference' ? CLR.them : col(el) || CLR.us;
    const path = 'M ' + pp.map((q) => q.join(' ')).join(' L ');
    const dash =
      el.type === 'run'
        ? 'stroke-dasharray="2.6 2"'
        : el.type === 'reference'
          ? 'stroke-dasharray="1.4 2"'
          : '';
    const op =
      el.type === 'reference'
        ? (el.opacity ?? 0.65)
        : el.type === 'option'
          ? el.until != null && tnow >= el.until
            ? 0.2
            : 0.55
          : (el.opacity ?? 1);
    const sel = o0.sel === el.id;
    if (sel)
      o += `<path d="M ${pts.map((q) => q.join(' ')).join(' L ')}" stroke="#ffd166" stroke-width="${wgt * 4}" fill="none" opacity=".3"/>`;
    o += `<path data-el="${el.id}" d="${path}" stroke="${c}" stroke-width="${wgt}" fill="none" ${dash} stroke-linecap="round" stroke-linejoin="round" opacity="${op}"/>`;
    if (el.dots && pts.length > 2)
      pts.slice(1, -1).forEach((q, i) => {
        const on = waypointReached(pts, p, i + 1);
        o += `<circle cx="${q[0]}" cy="${q[1]}" r="1.4" fill="${on ? c : 'none'}" stroke="${c}" stroke-width="0.5"/>`;
      });
    if (el.type !== 'reference' && !el.noarrow && p >= 1)
      o += `<g opacity="${op}">${head(pts[pts.length - 2], end, c, wgt)}</g>`;
    if (el.cue && p > 0 && p < 1) {
      const r = 3.2 + 1.6 * Math.abs(Math.sin(tnow / 110));
      o += `<circle cx="${end[0]}" cy="${end[1]}" r="${r}" fill="none" stroke="${CLR.us}" stroke-width="0.6" opacity="${0.9 - 0.5 * ((r - 3.2) / 1.6)}"/>`;
    }
  });

  E.forEach((el) => {
    const sel = o0.sel === el.id;
    const hl = sel
      ? `<circle cx="${pos(el)[0]}" cy="${pos(el)[1]}" r="${(el.size || 4) + 3}" fill="none" stroke="#ffd166" stroke-width=".8" stroke-dasharray="2 1.5"/>`
      : '';
    if (el.type === 'player' || el.type === 'opponent') {
      const [x, y] = pos(el);
      const c = col(el) || (el.type === 'player' ? CLR.us : CLR.them);
      const sz = el.size || (d.backdrop === 'full-pitch' ? 2.6 : 3.4);
      const dimmed = o0.dim != null && el.id.startsWith('pos-') && el.id !== 'pos-' + o0.dim;
      const isPick = o0.dim != null && el.id === 'pos-' + o0.dim;
      o +=
        hl +
        (isPick
          ? `<circle cx="${x}" cy="${y}" r="${sz + 2.2}" fill="none" stroke="${CLR.us}" stroke-width=".8"/>`
          : '') +
        `<circle data-el="${el.id}" cx="${x}" cy="${y}" r="${sz}" fill="${c}" stroke="#0b1220" stroke-width="0.7" opacity="${dimmed ? 0.35 : (el.opacity ?? 1)}" ${o0.tap ? 'style="cursor:pointer"' : ''}/>`;
      if (el.tag)
        o += `<text x="${x}" y="${y + 1.2}" text-anchor="middle" font-size="${sz * 1.1}" font-weight="800" fill="#0b1220" pointer-events="none" opacity="${dimmed ? 0.5 : 1}">${esc(el.tag)}</text>`;
    } else if (el.type === 'ball') {
      const [x, y] = pos(el);
      o += `${hl}<circle data-el="${el.id}" cx="${x}" cy="${y}" r="${el.size || 1.8}" fill="${CLR.ball}" stroke="#0b1220" stroke-width="0.5"/>`;
    } else if (el.type === 'ring') {
      const p = el.at != null ? progLin(el) : 1;
      if (p <= 0) return;
      o += `${hl}<circle data-el="${el.id}" cx="${el.x}" cy="${el.y}" r="${el.size || 12}" fill="none" stroke="${col(el) || CLR.us}" stroke-width="0.7" stroke-dasharray="2.6 2.2" opacity="${(el.opacity ?? 0.85) * p}"/>`;
    } else if (el.type === 'badge') {
      o += `${hl}<circle data-el="${el.id}" cx="${el.x}" cy="${el.y}" r="3.2" fill="#0b1220" stroke="${CLR.us}" stroke-width="0.7"/><text x="${el.x}" y="${(el.y ?? 0) + 1.4}" text-anchor="middle" font-size="3.6" font-weight="800" fill="${CLR.ink}" pointer-events="none">${esc(el.text || '')}</text>`;
    } else if (el.type === 'box') {
      const txt = boxLabel(el);
      const bw = boxWidth(el.w, txt);
      const bh = el.h || 9;
      o += `${hl}<rect data-el="${el.id}" x="${(el.x ?? 0) - bw / 2}" y="${(el.y ?? 0) - bh / 2}" width="${bw}" height="${bh}" rx="2.2" fill="#172031" stroke="${col(el) || '#3a4556'}" stroke-width="0.6"/><text x="${el.x}" y="${(el.y ?? 0) + 1.5}" text-anchor="middle" font-size="4.2" font-weight="800" letter-spacing=".3" fill="${col(el) || CLR.ink}" pointer-events="none">${esc(txt || '')}</text>`;
    } else if (el.type === 'label') {
      o += `${hl}<text data-el="${el.id}" x="${el.x}" y="${el.y}" text-anchor="middle" font-size="${el.size || 4}" font-weight="700" fill="${col(el) || CLR.chalk}">${esc(es && el.text_es ? el.text_es : el.text || '')}</text>`;
    } else if (el.type === 'xmark') {
      const s = el.size || 2.4;
      o += `${hl}<path data-el="${el.id}" d="M ${(el.x ?? 0) - s} ${(el.y ?? 0) - s} L ${(el.x ?? 0) + s} ${(el.y ?? 0) + s} M ${(el.x ?? 0) - s} ${(el.y ?? 0) + s} L ${(el.x ?? 0) + s} ${(el.y ?? 0) - s}" stroke="${col(el) || '#e0705f'}" stroke-width="0.9" stroke-linecap="round"/>`;
    }
  });

  if (o0.target) {
    const g = o0.target;
    o += `<circle cx="${g.x}" cy="${g.y}" r="${g.r || 8}" fill="rgba(16,185,129,.14)" stroke="${CLR.us}" stroke-width=".6" stroke-dasharray="2 2"/>`;
  }

  // The heat field goes under the elements but over the backdrop, so the
  // backdrop is emitted once more and the first copy sliced back off.
  const heat = o0.heat && o0.heat.length ? heatSVG(o0.heat, w, h) : '';
  return `<svg viewBox="0 0 ${w} ${h}" ${o0.id ? `id="${o0.id}"` : ''} role="img" aria-label="tactical diagram">${bd}${heat}${o.slice(bd.length)}</svg>`;
}
