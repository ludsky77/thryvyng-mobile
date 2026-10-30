/**
 * tapTarget() — where a `tap` quiz question's answer is.
 *
 * A verbatim port of the prototype's own, :875. It exists on the client only
 * to place the hit ring the player sees; the SCORE is the server's, recomputed
 * by the same rule in playbook_submit_quiz
 * (supabase/migrations/20261028190000_playbook_v1_schema.sql:1640-1677, whose
 * header cites this same line). The two must agree, so this is a port and not
 * a reimplementation.
 *
 * A null target means every tap is wrong — `tg && hypot(...) <= r` in the
 * prototype, the same `IF v_tx IS NOT NULL` guard on the server. The seed
 * marks such questions active = false so start_quiz never deals one, but a
 * Builder edit could create one between the deal and the submit.
 */

import type { DiagramBlock } from './types';

export type TapTarget = { x: number; y: number; r: number };

export function tapTarget(block: DiagramBlock | undefined | null): TapTarget | null {
  if (!block) return null;
  if (block.target) return { x: block.target.x, y: block.target.y, r: block.target.r ?? 9 };
  const d = block.frames ? block.frames[block.frames.length - 1].d : block;
  const els = d.elements || [];
  const passes = els.filter((e) => e.type === 'pass');
  const runs = els.filter((e) => e.type === 'run' && !e.hidden && e.dots);
  const pick = passes.length ? passes[passes.length - 1] : runs[0];
  if (!pick || !pick.points || !pick.points.length) return null;
  const e = pick.points[pick.points.length - 1];
  return { x: e[0], y: e[1], r: 9 };
}
