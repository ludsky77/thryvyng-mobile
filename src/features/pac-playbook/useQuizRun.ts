/**
 * One quiz run — the mobile ADAPT of the web's `useQuizRun.ts`
 * (`thrive-and-score` @ `c772111`).
 *
 * RULING R4 IS UNCHANGED AND IS THE POINT: the SERVER deals the run and the
 * SERVER grades it. This hook never picks a question and never decides a
 * score. What it does locally is reveal the answer right after each attempt,
 * out of the `answer` / `why` the deal already handed over, which is the other
 * half of R4.
 *
 * The running tally is computed with the same one-line rule the server uses
 * (prototype :908, server :1680-1683) so the two agree; the results screen
 * prints the SERVER's number, because that is the one written to
 * `playbook_quiz_results`.
 *
 * It lives above the quiz screen so that "Read the card" can navigate away
 * mid-run and come back to the same question, the way the prototype does
 * (:916, `S.quizReturn`).
 *
 * THREE MOBILE DIFFERENCES:
 *
 *  1. **`window.*` is gone.** `setInterval` / `setTimeout` / their clears are
 *     the globals React Native supplies; the handle type is
 *     `ReturnType<typeof setTimeout>` rather than `number`, because RN's is
 *     not a number on every platform.
 *  2. **Reduced motion** comes from `AccessibilityInfo.isReduceMotionEnabled()`
 *     instead of `matchMedia('(prefers-reduced-motion: reduce)')`. It is
 *     async, so the countdown starts on the long timing and is shortened once
 *     the answer arrives — which is the same outcome either way, because the
 *     answer arrives in under a frame.
 *  3. **M3 IS READ/RENDER ONLY.** `playbook_start_quiz` CREATES a run row and
 *     `playbook_submit_quiz` WRITES the score: both are writes, so neither is
 *     called here. Each one is a single `TODO(M-later)` with the call written
 *     out beside it, and the screen shows a labelled "not wired yet" line in
 *     the place the web shows a server refusal (ruling R-5's own slot). The
 *     `__DEV__` harness passes an `offline` deal instead, so the run screen
 *     and the results screen can be seen; its local grade uses the book's own
 *     `rules.silver` / `rules.gold` thresholds and is clearly fenced off from
 *     the real path.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { playbookErrorMessage } from '../../lib/playbookErrors';
import { tapTarget } from './diagram/tapTarget';
import type { DealtQuestion, PlaybookBlocks, QuizAnswer, QuizDeal, QuizGrade } from './types';
import type { Lang } from './strings';

export type QuizPhase = 'entry' | 'countdown' | 'run' | 'result';

/** The one sentence M3 shows where the web shows the server's refusal. */
const NOT_WIRED: Record<Lang, string> = {
  en: 'The quiz is not connected yet — coming in a later step.',
  es: 'El quiz aún no está conectado — llega en un paso posterior.',
};

/**
 * The harness's source: a deal already in hand. Never set on the real route.
 * `dev/offlineBook.ts` builds it from the frozen quiz bank.
 */
export interface OfflineQuiz {
  deal: QuizDeal;
  /**
   * HARNESS ONLY, and loudly: play the run through on its own, marking every
   * question right, so the run and result screens can be SEEN on a simulator
   * where there is no way to tap. It is not a grader and not a second dealer —
   * it records "the harness says this one was right" through the same `record`
   * a finger goes through, and the number on the results screen then comes
   * from `finish()`'s offline branch, which uses the book's own
   * `rules.silver` / `rules.gold`. The real route never sets `offline` at all,
   * so none of this can run in the app.
   */
  autoplay?: boolean;
}

export interface QuizRun {
  phase: QuizPhase;
  deal: QuizDeal | null;
  index: number;
  question: DealtQuestion | null;
  /** Per-question local verdicts, in dealt order. */
  verdicts: (boolean | undefined)[];
  /** Has the current question been attempted? Reveals the answer. */
  answered: boolean;
  lastCorrect: boolean | null;
  /** Which option was pressed, so the wrong one can be marked (:909). */
  lastChoice: string | null;
  /** Where the tap landed, so the board can show the ring. */
  lastTap: { x: number; y: number } | null;
  tally: number;
  secondsLeft: number;
  seconds: number;
  grade: QuizGrade | null;
  error: string | null;
  busy: boolean;
  countdownAt: number;
  start: () => void;
  answerChoice: (optionId: string) => void;
  answerTap: (x: number, y: number, blocks: PlaybookBlocks) => void;
  next: () => void;
  reset: () => void;
}

export function useQuizRun(
  playerId: string | null,
  bookId: string | null,
  lang: Lang,
  offline?: OfflineQuiz | null
): QuizRun {
  const [phase, setPhase] = useState<QuizPhase>('entry');
  const [deal, setDeal] = useState<QuizDeal | null>(null);
  const [index, setIndex] = useState(0);
  const [verdicts, setVerdicts] = useState<(boolean | undefined)[]>([]);
  const [answered, setAnswered] = useState(false);
  const [lastCorrect, setLastCorrect] = useState<boolean | null>(null);
  const [lastChoice, setLastChoice] = useState<string | null>(null);
  const [lastTap, setLastTap] = useState<{ x: number; y: number } | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(60);
  const [grade, setGrade] = useState<QuizGrade | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [countdownAt, setCountdownAt] = useState(0);
  const answersRef = useRef<QuizAnswer[]>([]);
  const reducedRef = useRef(false);

  // The web reads this synchronously off matchMedia; RN's is a promise, so it
  // is read once per mount and used by whatever timer fires next.
  useEffect(() => {
    let dead = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((on) => {
        if (!dead) reducedRef.current = on;
      })
      .catch(() => {});
    return () => {
      dead = true;
    };
  }, []);

  const seconds = deal?.rules?.seconds || 60;
  const question = deal && deal.questions[index] ? deal.questions[index] : null;

  const reset = useCallback(() => {
    setPhase('entry');
    setDeal(null);
    setIndex(0);
    answersRef.current = [];
    setVerdicts([]);
    setAnswered(false);
    setLastCorrect(null);
    setLastChoice(null);
    setLastTap(null);
    setGrade(null);
    setError(null);
  }, []);

  /** Everything a fresh deal resets, in one place, so the two paths agree. */
  const begin = useCallback((d: QuizDeal) => {
    setDeal(d);
    setIndex(0);
    answersRef.current = [];
    setVerdicts(new Array(d.questions.length).fill(undefined));
    setAnswered(false);
    setLastCorrect(null);
    setLastChoice(null);
    setLastTap(null);
    setGrade(null);
    setSecondsLeft(d.rules?.seconds || 60);
    setCountdownAt(Date.now());
    setPhase('countdown');
  }, []);

  const start = useCallback(() => {
    if (offline) {
      setError(null);
      begin(offline.deal);
      return;
    }
    if (!playerId || !bookId) {
      // The web's own first branch, kept: no player, no run (R-1 / R-5).
      setError(playbookErrorMessage({ hint: 'no_player_access' }, lang));
      return;
    }
    // TODO(M-later): the deal. One line —
    //   `const d = await startQuiz(playerId, bookId); begin(d)`
    //   inside the web's own try/catch, which sets
    //   `playbookErrorMessage(e, lang)` and stays on 'entry' (R-5).
    // `startQuiz` is already in `rpc.ts`. It CREATES a `playbook_quiz_runs`
    // row, so it is a write and M3 does not call it.
    setBusy(false);
    setError(NOT_WIRED[lang]);
    setPhase('entry');
  }, [offline, begin, lang, playerId, bookId]);

  /** Record one attempt. `correct` is local, for the reveal only. */
  const record = useCallback(
    (answer: QuizAnswer, correct: boolean) => {
      setAnswered(true);
      setLastCorrect(correct);
      setVerdicts((v) => {
        const next = v.slice();
        next[index] = correct;
        return next;
      });
      answersRef.current = answersRef.current
        .filter((a) => a.key !== answer.key)
        .concat(answer);
    },
    [index]
  );

  const answerChoice = useCallback(
    (optionId: string) => {
      if (!question || answered) return;
      setLastChoice(optionId);
      record({ key: question.key, choice: optionId }, optionId === question.content?.answer);
    },
    [question, answered, record]
  );

  const answerTap = useCallback(
    (x: number, y: number, blocks: PlaybookBlocks) => {
      if (!question || answered) return;
      const block = blocks.diagrams[question.card_key];
      const tg = tapTarget(block);
      // `tg && hypot(...) <= r` — a null target is always wrong, both here and
      // on the server.
      const ok = !!tg && Math.hypot(x - tg.x, y - tg.y) <= (tg.r || 8);
      setLastTap({ x, y });
      record({ key: question.key, x, y }, ok);
    },
    [question, answered, record]
  );

  const finish = useCallback(() => {
    if (!deal) return;
    if (offline) {
      // __DEV__ HARNESS ONLY. The server owns the score (R4); this exists so
      // the results screen can be looked at, and it uses the book's own
      // thresholds rather than a number of its own.
      const correct = verdicts.filter((v) => v === true).length;
      const gold = deal.rules?.gold ?? deal.questions.length;
      const silver = deal.rules?.silver ?? Math.ceil(deal.questions.length * 0.75);
      const medal: QuizGrade['medal'] =
        correct >= gold ? 'gold' : correct >= silver ? 'silver' : 'none';
      setGrade({
        run_id: deal.run_id,
        score: correct,
        medal,
        best_score: correct,
        best_medal: medal,
      });
      setError(null);
      setPhase('result');
      return;
    }
    // TODO(M-later): the submit. One line —
    //   `const g = await submitQuiz(deal.run_id, answersRef.current); setGrade(g)`
    //   inside the web's try/catch, which on refusal clears the grade and
    //   shows the sentence rather than a score nobody computed (R-5).
    // `submitQuiz` is already in `rpc.ts`. It WRITES `playbook_quiz_results`,
    // so M3 does not call it.
    setGrade(null);
    setError(NOT_WIRED[lang]);
    setPhase('result');
  }, [deal, offline, verdicts, lang]);

  const next = useCallback(() => {
    if (!deal) return;
    if (index >= deal.questions.length - 1) {
      finish();
      return;
    }
    setIndex((i) => i + 1);
    setAnswered(false);
    setLastCorrect(null);
    setLastChoice(null);
    setLastTap(null);
    setSecondsLeft(deal.rules?.seconds || 60);
  }, [deal, index, finish]);

  // The countdown the prototype runs before the first question, :921.
  useEffect(() => {
    if (phase !== 'countdown') return;
    const id = setTimeout(() => setPhase('run'), reducedRef.current ? 600 : 2100);
    return () => clearTimeout(id);
  }, [phase]);

  // Per-question timer. Running out scores a miss, which is exactly what the
  // server does with an answer that carries no choice and no point (:1670).
  useEffect(() => {
    if (phase !== 'run' || answered || !question) return;
    const id = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(id);
          record({ key: question.key }, false);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [phase, answered, question, record]);

  // HARNESS ONLY — see `OfflineQuiz.autoplay`.
  useEffect(() => {
    if (!offline?.autoplay || phase !== 'run' || !question) return;
    const id = setTimeout(() => {
      if (!answered) {
        if (question.content?.answer && question.type !== 'tap') {
          setLastChoice(question.content.answer);
        }
        record({ key: question.key, choice: question.content?.answer }, true);
      } else {
        next();
      }
    }, 450);
    return () => clearTimeout(id);
  }, [offline?.autoplay, phase, question, answered, record, next]);

  const tally = verdicts.filter((v) => v === true).length;

  return {
    phase,
    deal,
    index,
    question,
    verdicts,
    answered,
    lastCorrect,
    lastChoice,
    lastTap,
    tally,
    secondsLeft,
    seconds,
    grade,
    error,
    busy,
    countdownAt,
    start,
    answerChoice,
    answerTap,
    next,
    reset,
  };
}
