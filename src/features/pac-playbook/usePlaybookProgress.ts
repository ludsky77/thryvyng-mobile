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
 * `markGotIt` WRITES, and it is the web's own call: `setGotIt()`, which is
 * `playbook_set_got_it`. The tick is applied optimistically and rolled back on
 * a server "no", which then returns the sentence from `playbookErrors`
 * (ruling R-5) — the tick must never outlive a refusal. The `__DEV__` harness
 * is the one path that does not write: it has no player row, so its tick stays
 * local.
 */

import { useCallback, useEffect, useState } from 'react';
import { playbookErrorMessage } from '../../lib/playbookErrors';
import { fetchProgress, fetchQuizResult, fetchViewerKind, setGotIt } from './rpc';
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
      // a server "no" (R-5).
      setGot((prev) => {
        const next = new Set(prev);
        if (value) next.add(cardId);
        else next.delete(cardId);
        return next;
      });
      // HARNESS ONLY: `offline-player` is not a row, so the write could only
      // be a refusal with nothing to learn from it. The tick stays local.
      if (offline) return null;
      try {
        await setGotIt(playerId!, cardId, value);
        return null;
      } catch (e) {
        setGot((prev) => {
          const next = new Set(prev);
          if (value) next.delete(cardId);
          else next.add(cardId);
          return next;
        });
        return playbookErrorMessage(e, lang);
      }
    },
    [playerId, lang, offline]
  );

  const refreshQuizResult = useCallback(() => setResultNonce((n) => n + 1), []);

  return { got, viewer, quizResult, loading, markGotIt, refreshQuizResult };
}
