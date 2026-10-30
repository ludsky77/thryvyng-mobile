/**
 * Heat field for the positions card — the prototype's own, :481-490.
 *
 * Sum of weighted gaussians on a 2.5-unit grid, ramped green → yellow →
 * orange → red and blurred. The blobs come straight out of the `positions`
 * block (`positions[].attack.blobs` / `.defend.<gear>.blobs`).
 */

export type HeatBlob = { x: number; y: number; r?: number; w?: number };

const HEAT_STOPS: [number, [number, number, number]][] = [
  [0, [16, 185, 129]],
  [0.38, [233, 197, 74]],
  [0.68, [240, 138, 60]],
  [1, [229, 72, 77]],
];

export function heatColor(v: number): [number, number, number] {
  for (let i = 1; i < HEAT_STOPS.length; i++) {
    const [a, ca] = HEAT_STOPS[i - 1];
    const [b, cb] = HEAT_STOPS[i];
    if (v <= b) {
      const f = (v - a) / (b - a);
      return ca.map((c, k) => Math.round(c + (cb[k] - c) * f)) as [number, number, number];
    }
  }
  return HEAT_STOPS[HEAT_STOPS.length - 1][1];
}

export function heatSVG(blobs: HeatBlob[], w: number, h: number): string {
  const cell = 2.5;
  const nx = Math.ceil(w / cell);
  const ny = Math.ceil(h / cell);
  const vals: number[] = [];
  let max = 0;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const x = (i + 0.5) * cell;
      const y = (j + 0.5) * cell;
      let v = 0;
      for (const b of blobs) {
        const s = (b.r || 12) / 1.7;
        const d2 = (x - b.x) ** 2 + (y - b.y) ** 2;
        v += (b.w ?? 0.7) * Math.exp(-d2 / (2 * s * s));
      }
      vals.push(v);
      if (v > max) max = v;
    }
  }
  let r = '';
  vals.forEach((v, k) => {
    const n = max ? v / max : 0;
    if (n < 0.07) return;
    const [R, G, B] = heatColor(n);
    const i = k % nx;
    const j = Math.floor(k / nx);
    r += `<rect x="${i * cell}" y="${j * cell}" width="${cell + 0.05}" height="${cell + 0.05}" fill="rgb(${R},${G},${B})" opacity="${(0.18 + 0.6 * n).toFixed(2)}"/>`;
  });
  return `<defs><filter id="heatblur" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="1.6"/></filter></defs><g filter="url(#heatblur)">${r}</g>`;
}
