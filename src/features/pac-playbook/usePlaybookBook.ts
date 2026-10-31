/**
 * Loading the book — the mobile ADAPT of the web's `usePlaybookBook.ts`
 * (`thrive-and-score` @ `c772111`).
 *
 * Two stages, for the web's reason and unchanged by the crossing: the contents
 * screen needs 7 chapter rows and 69 card rows (~100 KB) and no diagram at
 * all; the 53 blocks are ~150 KB and are not fetched until the first card
 * opens. `formationDiag`, `positionsDiag` and `indexBlocks` below are the
 * web's, line for line — they are plain TypeScript over the row shapes and
 * there is nothing in them for a platform to disagree about.
 *
 * ONE ADDITION, and it is why this file is `adapt` and not `mirror`: the
 * optional `offline` argument. Passing a whole book skips both fetches and
 * returns it as already-loaded. That is how the `__DEV__` harness mounts the
 * reader without a signed-in player (`dev/offlineBook.ts` builds it from the
 * frozen content file the prod seed itself was built from), and it is the only
 * way M3 can be LOOKED at before M4 gives the reader a route. The real route
 * passes nothing and this parameter is dead weight on that path — one
 * `if (offline)` at the top of each effect.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchBlocks, fetchBook, fetchCards, fetchChapters, fetchClubCrest } from './rpc';
import type {
  Card,
  ClubCrest,
  FormationBlock,
  MovementBlock,
  NumbersBlock,
  PlaybookBlocks,
  PlaybookContent,
  PositionsBlock,
} from './types';
import type { DiagramBlock } from './diagram/types';

const EMPTY_BLOCKS: PlaybookBlocks = {
  diagrams: {},
  formations: {},
  numbers: null,
  positions: null,
  movement: null,
};

/**
 * A whole book, already in hand. The harness's offline source; never set on
 * the real route.
 */
export interface OfflineBook {
  content: PlaybookContent;
  blocks: PlaybookBlocks;
  crest?: ClubCrest | null;
}

/**
 * The prototype synthesises a board for the formation / positions / numbers
 * cards, which carry no diagram of their own (:393-396). Ported as written:
 * numbered dots from the formation's own staggered positions, GK gold.
 */
function formationDiag(f: FormationBlock | undefined): DiagramBlock | null {
  if (!f || !f.positions || !f.positions.length) return null;
  return {
    backdrop: 'full-pitch',
    total: 2000,
    beats: [],
    elements: f.positions.map((p) => ({
      id: 'pos-' + p.n,
      type: 'player',
      x: p.x,
      y: p.y,
      size: 3.1,
      tag: String(p.n),
      color: p.n === 1 ? '#d9b44a' : undefined,
    })),
  };
}

function positionsDiag(p: PositionsBlock | null): DiagramBlock | null {
  if (!p) return null;
  return {
    backdrop: 'full-pitch',
    total: 2000,
    beats: [],
    elements: p.positions.map((q) => ({
      id: 'pos-' + q.n,
      type: 'player',
      x: q.x,
      y: q.y,
      size: 3.1,
      tag: String(q.n),
      color: q.n === 1 ? '#d9b44a' : undefined,
    })),
  };
}

export function indexBlocks(
  rows: { kind: string; key: string; data: unknown }[],
  cards: Card[]
): PlaybookBlocks {
  const out: PlaybookBlocks = {
    diagrams: {},
    formations: {},
    numbers: null,
    positions: null,
    movement: null,
  };
  for (const r of rows) {
    if (r.kind === 'diagram') out.diagrams[r.key] = r.data as DiagramBlock;
    else if (r.kind === 'formation') out.formations[r.key] = r.data as FormationBlock;
    else if (r.kind === 'numbers') out.numbers = r.data as NumbersBlock;
    else if (r.kind === 'positions') out.positions = r.data as PositionsBlock;
    else if (r.kind === 'movement') out.movement = r.data as MovementBlock;
  }

  // :396 — the three kinds whose board is derived, not stored.
  for (const c of cards) {
    const kind = c.content?.kind;
    if (out.diagrams[c.key]) continue;
    if (kind === 'formation') {
      const d = formationDiag(out.formations[c.key]);
      if (d) out.diagrams[c.key] = d;
    } else if (kind === 'positions') {
      const d = positionsDiag(out.positions);
      if (d) out.diagrams[c.key] = d;
    } else if (kind === 'numbers') {
      const d = formationDiag(out.formations['FM433']);
      if (d) out.diagrams[c.key] = d;
    }
  }
  return out;
}

export interface BookState {
  content: PlaybookContent | null;
  /** The owner club's crest; null logo or no row = keep the text circle. */
  crest: ClubCrest | null;
  blocks: PlaybookBlocks;
  blocksReady: boolean;
  loading: boolean;
  error: unknown;
  /** Idempotent; safe to call on every card render. */
  needBlocks: () => void;
  reload: () => void;
}

export function usePlaybookBook(offline?: OfflineBook | null): BookState {
  const [content, setContent] = useState<PlaybookContent | null>(offline?.content ?? null);
  const [crest, setCrest] = useState<ClubCrest | null>(offline?.crest ?? null);
  const [blocks, setBlocks] = useState<PlaybookBlocks>(offline?.blocks ?? EMPTY_BLOCKS);
  const [blocksReady, setBlocksReady] = useState(!!offline);
  const [loading, setLoading] = useState(!offline);
  const [error, setError] = useState<unknown>(null);
  const [nonce, setNonce] = useState(0);
  const wantBlocks = useRef(false);

  useEffect(() => {
    if (offline) return;
    let dead = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const book = await fetchBook();
        if (dead) return;
        if (!book) {
          setContent(null);
          setError(new Error('playbook_not_found'));
          return;
        }
        const [chapters, cardRows] = await Promise.all([
          fetchChapters(book.id),
          fetchCards(book.id),
        ]);
        if (dead) return;
        const byId = new Map(chapters.map((c) => [c.id, c.key]));
        const cards: Card[] = cardRows.map((c) => ({
          ...c,
          chapter_key: byId.get(c.chapter_id) || '',
        }));
        setContent({ book, chapters, cards });

        // The crest is decoration: it must never delay or fail the book.
        fetchClubCrest(book.owner_club_id)
          .then((c) => {
            if (!dead) setCrest(c);
          })
          .catch((e) => console.warn('playbook: club crest failed to load', e));
      } catch (e) {
        if (!dead) setError(e);
      } finally {
        if (!dead) setLoading(false);
      }
    })();
    return () => {
      dead = true;
    };
  }, [nonce, offline]);

  // Second stage: the blocks, once a screen has asked for them.
  const [blocksWanted, setBlocksWanted] = useState(false);
  const needBlocks = useCallback(() => {
    if (wantBlocks.current) return;
    wantBlocks.current = true;
    setBlocksWanted(true);
  }, []);

  useEffect(() => {
    if (offline || !blocksWanted || !content) return;
    let dead = false;
    (async () => {
      try {
        const rows = await fetchBlocks(content.book.id);
        if (dead) return;
        setBlocks(indexBlocks(rows, content.cards));
        setBlocksReady(true);
      } catch (e) {
        // A missing diagram is not a missing book: the card still reads, and
        // the prototype's own "Diagram pending" panel covers the hole.
        if (!dead) setBlocksReady(true);
        console.warn('playbook: blocks failed to load', e);
      }
    })();
    return () => {
      dead = true;
    };
  }, [blocksWanted, content, offline]);

  const reload = useCallback(() => {
    if (offline) return;
    wantBlocks.current = false;
    setBlocksWanted(false);
    setBlocksReady(false);
    setBlocks(EMPTY_BLOCKS);
    setNonce((n) => n + 1);
  }, [offline]);

  return { content, crest, blocks, blocksReady, loading, error, needBlocks, reload };
}
