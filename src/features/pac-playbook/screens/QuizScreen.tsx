/**
 * The quiz — the prototype's quizEntryHTML / quizRunHTML / quizResHTML and the
 * parts of wireQuiz() that are not dealing or grading, :876-921.
 *
 * What is on the SERVER (ruling R4) and is NOT here: picking the eight
 * questions, shuffling the options, and the score. The deal arrives from
 * `playbook_start_quiz` already shuffled; the verdict shown after each attempt
 * is read off the dealt `answer`; the number on the results screen is the one
 * `playbook_submit_quiz` wrote to `playbook_quiz_results`.
 *
 * LEFT OUT on the web and carried over: the entry screen's "N questions in the
 * bank" chip. `playbook_quiz_questions` is readable only by the book's editors
 * (schema :1060-1077, ruling R4 — the rows carry the answer key), so a
 * player's client cannot count the bank and must not pretend to.
 *
 * THE TAP BOARD IS M2's. The web converts a click with
 * `svg.getBoundingClientRect()` and `svg.viewBox.baseVal`, then scores it with
 * `hypot <= r`. Mobile hands the whole job to `DiagramBoard`, which does the
 * same conversion from `locationX` / `onLayout` and the same `isHit`, because
 * that is the rule the SERVER regrades with — so this screen only forwards the
 * point to `run.answerTap`. Nothing here recomputes a verdict.
 *
 * M3 IS READ/RENDER ONLY: `run.start` and the submit are `TODO(M-later)` in
 * `useQuizRun.ts`, and the entry screen shows the sentence that hook sets in
 * the slot the web uses for a server refusal.
 */

import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, Pressable, Text, View } from 'react-native';
import { DiagramBoard } from '../DiagramBoard';
import { tapTarget } from '../diagram/tapTarget';
import type { Card, PlaybookBlocks, QuizResultRow } from '../types';
import { pick, useLang } from '../strings';
import type { QuizRun } from '../useQuizRun';
import { Btn, Chip, Cta, Medal, Stamp, Tape, TopHead } from '../ui';
import { pbk } from '../styles';
import { color } from '../theme';

export function QuizScreen({
  run,
  blocks,
  cardsByKey,
  bestResult,
  onReadCard,
  onHome,
}: {
  run: QuizRun;
  blocks: PlaybookBlocks;
  cardsByKey: Map<string, Card>;
  bestResult: QuizResultRow | null;
  onReadCard: (cardKey: string) => void;
  onHome: () => void;
}) {
  const { t } = useLang();

  if (run.phase === 'countdown') return <Countdown />;
  if (run.phase === 'result') return <Results run={run} cardsByKey={cardsByKey} onHome={onHome} />;
  if (run.phase === 'run' && run.question)
    return <RunScreen run={run} blocks={blocks} cardsByKey={cardsByKey} onReadCard={onReadCard} />;

  return <Entry run={run} bestResult={bestResult} t={t} />;
}

/** The entry screen — the quiz's own cover. */
function Entry({
  run,
  bestResult,
  t,
}: {
  run: QuizRun;
  bestResult: QuizResultRow | null;
  t: (k: 'quiz' | 'quizsub' | 'start') => string;
}) {
  const { lang } = useLang();
  const es = lang === 'es';
  const medal = bestResult && bestResult.best_medal !== 'none' ? bestResult.best_medal : null;

  return (
    <>
      <TopHead tape={<Tape xl>{t('quiz')}</Tape>} stamp={<Stamp lines={['8 Q', '60 s']} />} />

      <Text style={pbk.lead}>
        {t('quizsub')}.{' '}
        {es
          ? 'Plata con 6 de 8, oro con 8 de 8. El quiz nunca cambia tu progreso con el coach.'
          : 'Silver at 6 of 8, gold at 8 of 8. The quiz never changes your coach progress.'}
      </Text>

      {medal ? (
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <Chip green>
            <Medal medal={medal} />
            <Text style={[pbk.chipText, pbk.chipGreenText]}>
              {es ? 'mejor medalla' : 'best medal'}
            </Text>
          </Chip>
        </View>
      ) : null}

      {run.error ? <Text style={pbk.qstatus}>{run.error}</Text> : null}

      <Cta>
        <Btn variant="primary" label={t('start')} onPress={run.start} disabled={run.busy} />
      </Cta>
    </>
  );
}

/** `.count3` — the 3-2-1, :921. */
function Countdown() {
  const [n, setN] = useState(3);
  useEffect(() => {
    let dead = false;
    let id: ReturnType<typeof setInterval> | null = null;
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reduced) => {
        if (dead) return;
        id = setInterval(() => setN((x) => x - 1), reduced ? 200 : 700);
      });
    return () => {
      dead = true;
      if (id) clearInterval(id);
    };
  }, []);
  return (
    <View style={pbk.count3}>
      <Text style={pbk.count3Text}>{Math.max(1, n)}</Text>
    </View>
  );
}

function RunScreen({
  run,
  blocks,
  cardsByKey,
  onReadCard,
}: {
  run: QuizRun;
  blocks: PlaybookBlocks;
  cardsByKey: Map<string, Card>;
  onReadCard: (cardKey: string) => void;
}) {
  const { lang, t } = useLang();
  const es = lang === 'es';
  const q = run.question!;
  const card = cardsByKey.get(q.card_key);
  const total = run.deal?.questions.length || 0;

  const isTap = q.type === 'tap';
  const block = blocks.diagrams[q.card_key];
  const target = run.answered ? tapTarget(block) : null;

  return (
    <>
      <View style={pbk.bug}>
        <View style={pbk.bugBody}>
          <Text style={pbk.bugTitle}>
            {t('question')} {run.index + 1} {t('of')} {total} · {pick(card?.content?.name, lang)}
          </Text>
          <View style={pbk.qpips}>
            {Array.from({ length: total }).map((_, i) => (
              <View
                key={i}
                style={[
                  pbk.qpip,
                  run.verdicts[i] === true
                    ? pbk.qpipOk
                    : run.verdicts[i] === false
                      ? pbk.qpipNo
                      : i === run.index
                        ? pbk.qpipCur
                        : null,
                ]}
              />
            ))}
          </View>
        </View>
        <View style={pbk.scoreBox}>
          <Text style={pbk.scoreLabel}>{t('score')}</Text>
          <Text style={pbk.scoreValue}>{run.tally}</Text>
        </View>
      </View>

      <View style={pbk.timer}>
        <View
          style={[
            pbk.timerFill,
            run.secondsLeft <= 10 && pbk.timerLow,
            { width: `${(run.secondsLeft / run.seconds) * 100}%` },
          ]}
        />
      </View>

      <Text style={pbk.q}>{pick(q.content?.prompt, lang)}</Text>

      {isTap ? (
        <>
          <View style={pbk.frame}>
            {block ? (
              <DiagramBoard
                block={block}
                lang={lang}
                target={target}
                onTap={
                  run.answered
                    ? undefined
                    : (point) => run.answerTap(point.x, point.y, blocks)
                }
              />
            ) : (
              <View style={pbk.pend}>
                <Text style={pbk.pendText}>{t('pend')}</Text>
              </View>
            )}
            <View style={pbk.tray}>
              <View style={pbk.trayChalk} />
            </View>
          </View>
          <Text style={pbk.oneMute}>
            {t('tapit')}: {pick(q.content?.target, lang)}
          </Text>
        </>
      ) : (
        <View style={pbk.opts}>
          {(q.content?.options || []).map((o, i) => {
            // :909 — the right one turns green; the one that was pressed turns
            // red when it was not the right one.
            const isAnswer = o.id === q.content?.answer;
            const yes = run.answered && isAnswer;
            const no = run.answered && !isAnswer && o.id === run.lastChoice;
            return (
              <Pressable
                key={o.id}
                disabled={run.answered}
                onPress={() => run.answerChoice(o.id)}
                accessibilityRole="button"
                style={[pbk.opt, yes && pbk.optYes, no && pbk.optNo]}
              >
                <View style={[pbk.optKey, yes && pbk.optYesKey, no && pbk.optNoKey]}>
                  <Text
                    style={[
                      pbk.optKeyText,
                      yes && pbk.optYesKeyText,
                      no && pbk.optNoKeyText,
                    ]}
                  >
                    {'ABC'[i] || String(i + 1)}
                  </Text>
                </View>
                <Text style={pbk.optText}>{pick(o.text, lang)}</Text>
              </Pressable>
            );
          })}
        </View>
      )}

      <View style={pbk.coach}>
        <View
          style={[
            pbk.coachDot,
            run.answered && (run.lastCorrect ? pbk.coachDotGood : pbk.coachDotBad),
          ]}
        />
        <View style={pbk.coachBody}>
          <Text
            style={[
              pbk.coachText,
              run.answered && (run.lastCorrect ? pbk.coachTextGood : pbk.coachTextBad),
            ]}
          >
            {run.answered
              ? run.lastCorrect
                ? es
                  ? '¡Eso!'
                  : 'That’s it.'
                : es
                  ? 'Esa no.'
                  : 'Not that one.'
              : es
                ? 'Elige una'
                : 'Pick one'}
          </Text>
          <Text style={pbk.coachSmall}>
            {run.answered ? pick(q.content?.why, lang) : pick(card?.content?.hook, lang)}
          </Text>
        </View>
      </View>

      {run.answered ? (
        <Cta>
          <View style={pbk.two}>
            <Btn
              variant="ghost"
              label={t('readcard')}
              onPress={() => onReadCard(q.card_key)}
              style={{ flex: 1 }}
            />
            <Btn
              variant="primary"
              label={run.index < total - 1 ? t('nextq') : t('results')}
              onPress={run.next}
              disabled={run.busy}
              style={{ flex: 1 }}
            />
          </View>
        </Cta>
      ) : null}
    </>
  );
}

function Results({
  run,
  cardsByKey,
  onHome,
}: {
  run: QuizRun;
  cardsByKey: Map<string, Card>;
  onHome: () => void;
}) {
  const { lang, t } = useLang();
  const es = lang === 'es';
  const total = run.deal?.questions.length || 0;
  const medal = run.grade?.medal || 'none';
  const score = run.grade?.score;

  const missed = (run.deal?.questions || [])
    .filter((_, i) => run.verdicts[i] === false)
    .map((q) => pick(cardsByKey.get(q.card_key)?.content?.name, lang))
    .filter(Boolean)
    .join(' · ');

  return (
    <View style={pbk.res}>
      <Text style={pbk.bugTitle}>{t('results')}</Text>

      {run.error ? (
        <Text style={pbk.lead}>{run.error}</Text>
      ) : (
        <>
          <View
            style={[
              pbk.medalbig,
              medal === 'gold'
                ? { backgroundColor: color.gold }
                : medal === 'silver'
                  ? { backgroundColor: color.silver }
                  : pbk.medalbigNone,
            ]}
          >
            <Text style={[pbk.medalbigText, medal === 'none' && pbk.medalbigNoneText]}>
              {medal === 'gold' ? t('gold') : medal === 'silver' ? t('silver') : t('nomedal')}
            </Text>
          </View>
          <Text style={pbk.resBig}>
            {score ?? 0}
            <Text style={pbk.resBigSmall}> / {total}</Text>
          </Text>
          <View style={[pbk.qpips, { justifyContent: 'center' }]}>
            {run.verdicts.map((v, i) => (
              <View key={i} style={[pbk.qpip, v ? pbk.qpipOk : pbk.qpipNo]} />
            ))}
          </View>
          <Text style={pbk.lead}>
            {es
              ? 'Orden nuevo en cada intento. Las tarjetas que fallaste:'
              : 'New order every retake. Cards you missed:'}{' '}
            {missed || '—'}
          </Text>
        </>
      )}

      <Cta>
        <Btn variant="primary" label={t('again')} onPress={run.start} disabled={run.busy} />
        <Btn variant="ghost" label={t('home')} onPress={onHome} />
      </Cta>
    </View>
  );
}
