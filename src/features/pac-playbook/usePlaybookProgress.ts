/**
 * The player's side of the book — the mobile ADAPT of the web's
 * `usePlaybookProgress.ts` (`thrive-and-score` @ `c772111`).
 *
 * RULING R-4: the player id is the role's `entity_id` and nothing else. A
 * staff viewer has no player id, so this hook is handed `null` and every read
 * is skipped — that is R-1's read-only book view, and it is why the reader
 * never has to ask whether somebody is "allowed": with no player there is
 * nothing player-shaped on the screen, and with a player the server answers.
 *
 * THE ONE DIFFERENCE FROM THE WEB, and it is M3's scope, not a port problem:
 * `markGotIt` does NOT write. The web calls `setGotIt()`, which is
 * `playbook_set_got_it`; M3 is read/render only, so the optimistic tick is
 * applied locally and the RPC is a `TODO(M-later)` at the one line where it
 * belongs. Everything around it — the optimistic add/delete, the rollback
 * shape, the error sentence from `playbookErrors` (ruling R-5) — is built and
 * in place, so the write prompt is one uncommented call and nothing else.
 */

import { useCallback, useEffect, useState } from 'react';
import { playbookErrorMessage } from '../../lib/playbookErrors';
import { fetchProgress, fetchQuizResult, fetchViewerKind } from './rpc';
import type { QuizResultRow, ViewerKind } from './types';
import type { Lang } from './strings';

export interface ProgressState {
  /** card_id set. Empty for a staff viewer. */
  got: Set<string>;
  viewer: ViewerKind;
  quizResult: QuizResultRow | null;
  loading: boolean;
  /** Returns null on success, or the sentence to show on refusal. */
  markGotIt: (cardId: string, value: boolean) => Promise<string | null>;
  refreshQuizResult: () => void;
}

/**
 * `offline` is the harness's source (`dev/offlineBook.ts`): a progress set and
 * a viewer kind in hand, so the player-side screens can be looked at without
 * a signed-in player. Never set on the real route.
 */
export interface OfflineProgress {
  got: string[];
  viewer: ViewerKind;
  quizResult: QuizResultRow | null;
}

export function usePlaybookProgress(
  playerId: string | null,
  bookId: string | null,
  lang: Lang,
  offline?: OfflineProgress | null
): ProgressState {
  const [got, setGot] = useState<Set<string>>(() => new Set(offline?.got ?? []));
  const [viewer, setViewer] = useState<ViewerKind>(offline?.viewer ?? 'none');
  const [quizResult, setQuizResult] = useState<QuizResultRow | null>(offline?.quizResult ?? null);
  const [loading, setLoading] = useState(false);
  const [resultNonce, setResultNonce] = useState(0);

  useEffect(() => {
    if (offline) return;
    if (!playerId || !bookId) {
      setGot(new Set());
      setViewer('none');
      setQuizResult(null);
      return;
    }
    let dead = false;
    setLoading(true);
    (async () => {
      // Three independent reads; one failing must not blank the other two.
      const [progress, kind, result] = await Promise.all([
        fetchProgress(playerId).catch((e) => {
          console.warn('playbook: progress failed to load', e);
          return [] as string[];
        }),
        fetchViewerKind(playerId).catch((e) => {
          console.warn('playbook: viewer kind failed to load', e);
          return 'none' as ViewerKind;
        }),
        fetchQuizResult(playerId, bookId).catch((e) => {
          console.warn('playbook: quiz result failed to load', e);
          return null;
        }),
      ]);
      if (dead) return;
      setGot(new Set(progress));
      setViewer(kind);
      setQuizResult(result);
      setLoading(false);
    })();
    return () => {
      dead = true;
    };
  }, [playerId, bookId, resultNonce, offline]);

  const markGotIt = useCallback(
    async (cardId: string, value: boolean): Promise<string | null> => {
      if (!playerId && !offline) return playbookErrorMessage({ hint: 'no_player_access' }, lang);
      // Optimistic, then rolled back on refusal — the tick must never outlive
      // a server "no" (R-5). The refusal cannot arrive yet: see below.
      setGot((prev) => {
        const next = new Set(prev);
        if (value) next.add(cardId);
        else next.delete(cardId);
        return next;
      });
      // TODO(M-later): the write. One line —
      //   `try { await setGotIt(playerId!, cardId, value); return null }`
      //   `catch (e) { <roll the set back>; return playbookErrorMessage(e, lang) }`
      // `setGotIt` is already in `rpc.ts`; M3 is read/render only, so the tick
      // is local and nothing is sent. The rollback branch is written out in
      // the web's own hook and is what this becomes.
      return null;
    },
    [playerId, lang, offline]
  );

  const refreshQuizResult = useCallback(() => setResultNonce((n) => n + 1), []);

  return { got, viewer, quizResult, loading, markGotIt, refreshQuizResult };
}
