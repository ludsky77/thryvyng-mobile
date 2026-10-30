/**
 * The shapes the reader works with.
 *
 * Two layers, and the difference matters:
 *   ROWS    — the eleven `playbook_*` tables as the database returns them
 *             (supabase/migrations/20261028190000_playbook_v1_schema.sql:130-360).
 *   CONTENT — what each row's `content` / `data` jsonb holds. The seed put
 *             everything the source JSON carried beyond the real columns in
 *             there (scripts/playbook/build-seed.mjs:140-166), so these types
 *             describe docs/playbook/pac-playbook-v2-FINAL-data.json.
 *
 * None of this comes from `src/integrations/supabase/types.ts` — that file has
 * not been regenerated since the playbook shipped (gap PLAYBOOK-TYPES). Every
 * call goes through the one shim in rpc.ts; when the types are regenerated,
 * that file is the only place that changes.
 */

import type { Bilingual, DiagramBlock } from './diagram/types';

export type { Bilingual };

/* ------------------------------------------------------------------ rows */

export interface BookRow {
  id: string;
  slug: string;
  owner_club_id: string;
  author_name: string;
  meta: BookMeta;
  settings: BookSettings;
  published: boolean;
}

/** The book owner's club, for the header crest. Null logo = no crest. */
export interface ClubCrest {
  name: string | null;
  logo_url: string | null;
}

export interface ChapterRow {
  id: string;
  key: string;
  n: number;
  sort: number;
  content: ChapterContent;
}

export interface CardRow {
  id: string;
  chapter_id: string;
  key: string;
  sort: number;
  style: string;
  diagram_key: string | null;
  content: CardContent;
  published: boolean;
}

export interface BlockRow {
  kind: 'diagram' | 'formation' | 'numbers' | 'positions' | 'movement';
  key: string;
  data: unknown;
}

export interface QuestionRow {
  id: string;
  chapter_id: string;
  card_id: string | null;
  body: string;
  status: 'open' | 'answered' | 'closed';
  created_at: string;
}

export interface ReplyRow {
  id: string;
  question_id: string;
  body: string;
  created_at: string;
}

export interface QuizResultRow {
  best_score: number;
  best_medal: 'none' | 'silver' | 'gold';
  last_score: number | null;
  runs: number;
}

/* --------------------------------------------------------------- content */

export interface BookMeta {
  title?: Bilingual;
  subtitle?: Bilingual;
  reminder?: Bilingual;
  author?: string;
  rev?: string;
}

export interface QuizRules {
  perRun?: number;
  seconds?: number;
  silver?: number;
  gold?: number;
}

export interface BookSettings {
  version?: string;
  quiz?: { rules?: QuizRules; types?: Record<string, string> };
}

export interface ChapterSub {
  id: string;
  name?: Bilingual;
  desc?: Bilingual;
}

export interface ChapterContent {
  name?: Bilingual;
  tagline?: Bilingual;
  learn?: Bilingual;
  subs?: ChapterSub[];
}

export interface CardContent {
  name?: Bilingual;
  hook?: Bilingual;
  see?: Bilingual;
  do?: Bilingual;
  more?: Bilingual;
  cue?: Bilingual;
  ritual?: Bilingual;
  read?: Bilingual;
  ifnot?: Bilingual;
  roles?: Bilingual;
  use?: Bilingual;
  link?: Bilingual;
  links?: string[];
  pointers?: { en?: string[]; es?: string[] };
  /** '' | 'formation' | 'numbers' | 'positions' | 'movement' */
  kind?: string;
  sub?: string;
  line?: string;
  shape?: string;
}

/* ------------------------------------------------- the `*_block` payloads */

export interface FormationPos {
  n: number;
  abbr: string;
  x: number;
  y: number;
  role?: Bilingual;
}

export interface FormationBlock {
  shape?: string;
  label?: string;
  idea?: Bilingual;
  positions?: FormationPos[];
}

export interface NumbersBlock {
  table: { n: number | string; abbr: string; name?: Bilingual; role?: Bilingual }[];
  note?: Bilingual;
}

export interface PositionPicture {
  blobs?: { x: number; y: number; r?: number; w?: number }[];
  text?: Bilingual;
  keys?: Bilingual;
}

export interface PositionsBlock {
  legend?: Bilingual;
  gears: Record<string, Bilingual>;
  positions: {
    n: number;
    abbr: string;
    x: number;
    y: number;
    attack: PositionPicture;
    defend: Record<string, PositionPicture>;
  }[];
}

export interface MovementKey {
  ball: [number, number];
  holder?: number | string | null;
  cap?: Bilingual;
  pos: Record<string, [number, number]>;
  role?: Record<string, string>;
}

export interface MovementBlock {
  roles: Record<string, Record<string, Bilingual>>;
  modes: {
    id: string;
    phase: 'attack' | 'defend';
    name?: Bilingual;
    desc?: Bilingual;
    keys: MovementKey[];
  }[];
}

/* ------------------------------------------------------------------ quiz */

export interface DealtQuestion {
  key: string;
  card_key: string;
  chapter_key: string;
  type: 'cue' | 'do' | 'read' | 'where' | 'tap' | string;
  content: {
    prompt?: Bilingual;
    options?: { id: string; text?: Bilingual }[];
    answer?: string;
    why?: Bilingual;
    /** On a tap question this is the PROMPT text, not the target. */
    target?: Bilingual;
  };
}

export interface QuizDeal {
  run_id: string;
  rules: QuizRules;
  questions: DealtQuestion[];
}

/** What the client sends back; the server grades it. */
export type QuizAnswer = { key: string; choice?: string; x?: number; y?: number };

export interface QuizGrade {
  run_id: string;
  score: number;
  medal: 'none' | 'silver' | 'gold';
  best_score: number;
  best_medal: 'none' | 'silver' | 'gold';
}

/* ------------------------------------------------------------- assembled */

/** A card with its chapter key resolved and its diagram block attached. */
export interface Card extends CardRow {
  chapter_key: string;
}

export interface PlaybookContent {
  book: BookRow;
  chapters: ChapterRow[];
  cards: Card[];
}

/** Every block, indexed the way the reader asks for them. */
export interface PlaybookBlocks {
  diagrams: Record<string, DiagramBlock>;
  formations: Record<string, FormationBlock>;
  numbers: NumbersBlock | null;
  positions: PositionsBlock | null;
  movement: MovementBlock | null;
}

export type ViewerKind = 'player' | 'parent' | 'staff' | 'none';
