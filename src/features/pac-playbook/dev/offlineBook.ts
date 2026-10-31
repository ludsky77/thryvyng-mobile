/**
 * The whole book, offline — `__DEV__` ONLY.
 *
 * WHY THIS EXISTS. M3 builds the reader shell, six screens and three panels,
 * and M4 is what gives any of it a route. Between the two there has to be a
 * way to LOOK at the thing, and the harness is it (`PLAYBOOK-DEV-HARNESS` in
 * `docs/ledger.md`). The real reader reads `playbook_*` through `rpc.ts`, which
 * needs a signed-in player and a network; the harness reads this instead and
 * needs neither.
 *
 * WHERE THE CONTENT COMES FROM — nothing here is invented, no coordinate and
 * no string. `pac-playbook-v2-FINAL-data.json` beside this file is a
 * BYTE-IDENTICAL copy of `thrive-and-score`'s
 * `docs/playbook/pac-playbook-v2-FINAL-data.json` @ `c772111`, which is the
 * frozen file the PROD SEED was generated from
 * (`supabase/migrations/20261028190001_playbook_v1_seed.sql`, built by
 * `scripts/playbook/build-seed.mjs`). So the harness renders the same book the
 * server serves. `MIRROR.md` carries its provenance row.
 *
 * THE MAPPING below is that seed script's, section 2, verbatim in intent —
 * every column is LIFTED out of the payload and `content` / `data` hold
 * exactly the remaining keys:
 *
 *   version                   → books.settings.version
 *   content.meta              → books.meta
 *   content.chapters[]        → playbook_chapters   key=id, n, sort=source order
 *   content.cards[]           → playbook_cards      key=id, chapter, sort, style,
 *                                                   diagram_key=diagram
 *   diagrams.<k>              → blocks kind 'diagram'   key=<k>
 *   formations.numbers        → blocks kind 'numbers'    key='numbers'
 *   formations.formations.<k> → blocks kind 'formation'  key=<k>
 *   positions (whole)         → blocks kind 'positions'  key='positions'
 *   movement  (whole)         → blocks kind 'movement'   key='movement'
 *   quiz.rules / quiz.types   → books.settings.quiz.{rules,types}
 *   quiz.questions[]          → playbook_quiz_questions  key=id, card_key,
 *                                                        chapter_key, type
 *
 * THE ONE THING THAT IS NOT THE SERVER'S. Row ids. The database issues uuids;
 * here a row's id is its own key (`'F0'`, `'foundations'`), because the reader
 * only ever uses an id to join rows and to key a progress set, and a key does
 * both. It means nothing in the harness can be compared against a prod uuid,
 * which is correct: nothing in the harness should be.
 *
 * THE DEAL is dealt HERE, which on the real route is the SERVER's job and
 * nobody else's (ruling R4). It is marked loudly for that reason: this is a
 * fixture so the run and result screens can be seen, not a second dealer. It
 * takes the first eight ACTIVE questions in source order — no shuffle, no
 * seed, none of the server's spread rules — and `useQuizRun` only accepts it
 * through its `offline` parameter, which the real route never sets.
 */

import { indexBlocks } from '../usePlaybookBook';
import { tapTarget } from '../diagram/tapTarget';
import type { DiagramBlock } from '../diagram/types';
import type {
  BookRow,
  Card,
  ChapterRow,
  DealtQuestion,
  PlaybookContent,
  QuizDeal,
} from '../types';
import type { OfflineBook } from '../usePlaybookBook';
import type { OfflineQuiz } from '../useQuizRun';
import DATA from './pac-playbook-v2-FINAL-data.json';

/* --------------------------------------------------- the file, loosely typed */

/**
 * The JSON is data, not a contract: it is typed here as the few shapes the
 * mapping reads and cast once, rather than letting TypeScript infer a 352 KB
 * literal type that would be re-checked on every build.
 */
interface RawDoc {
  version: string;
  content: {
    meta: Record<string, unknown>;
    chapters: Record<string, unknown>[];
    cards: Record<string, unknown>[];
  };
  diagrams: Record<string, unknown>;
  formations: { numbers: unknown; formations: Record<string, unknown> };
  positions: unknown;
  movement: unknown;
  quiz: { rules: Record<string, unknown>; types: Record<string, string>; questions: Record<string, unknown>[] };
}

const SRC = DATA as unknown as RawDoc;

/** The seed script's own helper, same name, same behaviour. */
function omit<T extends Record<string, unknown>>(o: T, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(o)) if (!keys.includes(k)) out[k] = o[k];
  return out;
}

/* ----------------------------------------------------------------- the rows */

const BOOK_ID = 'offline-pac-playbook';

const book = {
  id: BOOK_ID,
  slug: 'pac-playbook',
  owner_club_id: 'offline-club',
  author_name: String(SRC.content.meta.author ?? 'Provo Athletic Club'),
  meta: SRC.content.meta,
  settings: { version: SRC.version, quiz: { rules: SRC.quiz.rules, types: SRC.quiz.types } },
  published: true,
} as unknown as BookRow;

const chapters: ChapterRow[] = SRC.content.chapters.map((c, i) => ({
  id: String(c.id),
  key: String(c.id),
  n: Number(c.n),
  sort: i + 1,
  content: omit(c, ['id', 'n']),
})) as unknown as ChapterRow[];

const cards: Card[] = SRC.content.cards.map((c) => ({
  id: String(c.id),
  chapter_id: String(c.chapter),
  chapter_key: String(c.chapter),
  key: String(c.id),
  sort: Number(c.sort ?? 0),
  style: String(c.style ?? ''),
  // The seed keeps NULL for "the source had no `diagram` key at all", so that
  // absence round-trips as absence rather than as an empty string.
  diagram_key: Object.prototype.hasOwnProperty.call(c, 'diagram')
    ? ((c.diagram as string | null) ?? null)
    : null,
  content: omit(c, ['id', 'chapter', 'sort', 'style', 'diagram']),
  published: true,
})) as unknown as Card[];

const blockRows: { kind: string; key: string; data: unknown }[] = [
  ...Object.entries(SRC.diagrams).map(([key, data]) => ({ kind: 'diagram', key, data })),
  { kind: 'numbers', key: 'numbers', data: SRC.formations.numbers },
  ...Object.entries(SRC.formations.formations).map(([key, data]) => ({
    kind: 'formation',
    key,
    data,
  })),
  { kind: 'positions', key: 'positions', data: SRC.positions },
  { kind: 'movement', key: 'movement', data: SRC.movement },
];

const content: PlaybookContent = { book, chapters, cards };
const blocks = indexBlocks(blockRows, cards);

export const OFFLINE_BOOK: OfflineBook = {
  content,
  blocks,
  // No crest: there is no club row offline, which lands on the header's own
  // fallback — the prototype's text circle, exactly as a null `logo_url` does.
  crest: null,
};

/* ------------------------------------------------------------- the progress */

/**
 * A plausible half-read book, so the player-side screens have something to
 * show: every card of the first chapter, and the first two of the second.
 * Derived from the card list, never a hand-written list of keys.
 */
const gotKeys = (() => {
  const first = chapters[0]?.key;
  const second = chapters[1]?.key;
  return [
    ...cards.filter((c) => c.chapter_key === first).map((c) => c.id),
    ...cards.filter((c) => c.chapter_key === second).slice(0, 2).map((c) => c.id),
  ];
})();

export const OFFLINE_PROGRESS = {
  got: gotKeys,
  // 'parent' so the shell's R-4 note is visible on a card and a chapter; the
  // real value comes from `playbook_viewer_kind()`.
  viewer: 'parent' as const,
  quizResult: { best_score: 6, best_medal: 'silver' as const, last_score: 6, runs: 2 },
};

/* ------------------------------------------------------------------ the deal */

/**
 * A `tap` question whose diagram yields no target can never be answered
 * correctly — `tg && hypot(...) <= r` makes every tap wrong — so the seed marks
 * it inactive. The same rule, same reason, so the fixture cannot deal an
 * unwinnable slot.
 */
function quizActive(q: Record<string, unknown>): boolean {
  if (q.type !== 'tap') return true;
  const d = SRC.diagrams[String(q.card)] as DiagramBlock | undefined;
  return tapTarget(d) !== null;
}

const dealt: DealtQuestion[] = SRC.quiz.questions
  .filter(quizActive)
  .slice(0, Number(SRC.quiz.rules.perRun ?? 8))
  .map((q) => ({
    key: String(q.id),
    card_key: String(q.card),
    chapter_key: String(q.chapter),
    type: String(q.type),
    content: omit(q, ['id', 'card', 'chapter', 'type']),
  })) as unknown as DealtQuestion[];

export const OFFLINE_QUIZ: OfflineQuiz = {
  deal: {
    run_id: 'offline-run',
    rules: SRC.quiz.rules,
    questions: dealt,
  } as unknown as QuizDeal,
};

/* ------------------------------------------------------------ the questions */

/**
 * One answered thread and one open one, so the end-of-chapter list and its
 * "answered" border both appear. These two bodies ARE written here — they are
 * a family's own messages, which no frozen file can supply — and they say so
 * on screen.
 */
export const OFFLINE_QUESTIONS = {
  questions: [
    {
      id: 'offline-q1',
      chapter_id: chapters[0]?.key ?? 'foundations',
      card_id: cards[0]?.id ?? null,
      body: '[DEV FIXTURE] We read this one together. Is “regain” the same as winning the ball back?',
      status: 'answered' as const,
      created_at: new Date(Date.now() - 26 * 3600e3).toISOString(),
    },
    {
      id: 'offline-q2',
      chapter_id: chapters[0]?.key ?? 'foundations',
      card_id: null,
      body: '[DEV FIXTURE] Could we go over the three reasons at training this week?',
      status: 'open' as const,
      created_at: new Date(Date.now() - 40 * 60e3).toISOString(),
    },
  ],
  replies: [
    {
      id: 'offline-r1',
      question_id: 'offline-q1',
      body: '[DEV FIXTURE] Yes — regain is the moment you win it back, and what you do in the next two seconds is the card after this one.',
      created_at: new Date(Date.now() - 20 * 3600e3).toISOString(),
    },
  ],
};

/** Counts for the harness's own label, so the fixture states its own size. */
export const OFFLINE_COUNTS = {
  chapters: chapters.length,
  cards: cards.length,
  blocks: blockRows.length,
  diagrams: Object.keys(blocks.diagrams).length,
  dealt: dealt.length,
  got: gotKeys.length,
};

/** The first card of each `kind`, so the harness can link straight to a panel. */
export const PANEL_CARDS = {
  positions: cards.find((c) => c.content?.kind === 'positions')?.key ?? null,
  formation: cards.find((c) => c.content?.kind === 'formation')?.key ?? null,
  numbers: cards.find((c) => c.content?.kind === 'numbers')?.key ?? null,
  movement: cards.find((c) => c.content?.kind === 'movement')?.key ?? null,
};
