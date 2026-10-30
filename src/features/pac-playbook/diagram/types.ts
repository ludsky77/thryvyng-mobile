/**
 * Diagram JSON — the shared spec, typed.
 *
 * Source of truth: docs/playbook/pac-playbook-diagram-motion-spec.md. One
 * renderer draws every diagram in reader, builder and quiz; motion is a `t`
 * (ms) parameter over the same JSON. These types describe exactly the shape
 * stored in `playbook_blocks.data` for kind = 'diagram'.
 *
 * Coordinate spaces: ZOOM boards are viewBox 100 x (d.h || 64); FULL PITCH is
 * 100 x 140 portrait, attack direction up.
 */

export type Bilingual = { en?: string; es?: string };

export type Backdrop =
  | 'zoom-goal-top'
  | 'zoom-goal'
  | 'zoom-touchline'
  | 'full-pitch'
  | 'none';

export type Point = [number, number];

/** Fields shared by every element; `type` discriminates the rest. */
interface ElementBase {
  id: string;
  type: string;
  x?: number;
  y?: number;
  size?: number;
  color?: string;
  opacity?: number;
  at?: number;
  dur?: number;
  ease?: string;
  follow?: string;
  points?: Point[];
  weight?: number;
  dots?: boolean;
  hidden?: boolean;
  noarrow?: boolean;
  cue?: boolean;
  until?: number;
  seq?: string[];
  tag?: string;
  to?: Point;
  len?: number;
  spread?: number;
  w?: number;
  h?: number;
  text?: string;
  text_es?: string;
}

export type DiagramElement = ElementBase;

export interface Diagram {
  backdrop?: Backdrop;
  h?: number;
  total?: number;
  hold?: number;
  beats?: { at?: number; label?: Bilingual }[];
  cue?: Bilingual;
  elements?: DiagramElement[];
  /** An explicit tap target; otherwise tapTarget() derives one. */
  target?: { x: number; y: number; r?: number };
}

/** Two-frame cards carry frames instead of elements. */
export interface DiagramBlock extends Diagram {
  frames?: { cap?: Bilingual; d: Diagram }[];
  crossfade?: number;
}

/** Options the three callers (reader, quiz, panels) pass to render(). */
export interface RenderOptions {
  /** id attribute on the <svg>, so a caller can find it again. */
  id?: string;
  /** Heat blobs drawn under the elements (the positions card). */
  heat?: { x: number; y: number; r?: number; w?: number }[];
  /** Shirt number to spotlight; every other `pos-*` element dims. */
  dim?: number | null;
  /** Players get a pointer cursor (the tap-a-number panels). */
  tap?: boolean;
  /** Draw the answer ring after a quiz tap. */
  target?: { x: number; y: number; r?: number } | null;
  /** Which language the `box` / `label` elements print (prototype reads S.lang). */
  lang?: 'en' | 'es';
  /** The reader never sets these two; they exist for the Builder (not in v1). */
  sel?: string;
  edit?: boolean;
}
