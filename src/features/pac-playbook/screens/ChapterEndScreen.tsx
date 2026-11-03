/**
 * End of chapter — questions & notes, the prototype's chendHTML() +
 * wireChend() + qItemHTML(), :817-851.
 *
 * The family writes to the coaching staff through `playbook_send_question` and
 * reads its own thread back from `playbook_questions` /
 * `playbook_question_replies`. Staff replies arrive through
 * `playbook_reply_question`, which is the staff screen's job — here a reply is
 * read, not written.
 *
 * THE KIND CHIPS ARE HERE NOW — Question / Comment / Suggestion, Lu's three
 * words (ES: Pregunta / Comentario / Sugerencia). They were left out at M3
 * for a real reason — `playbook_questions` had no `kind` column — and that
 * reason is gone: migration `20261102033000` added the column with
 * `CHECK (kind IN ('question','comment','suggestion'))` and a FIVE-argument
 * `playbook_send_question`. The send below calls the five-arg form through
 * `coachRpc.ts`; the mirrored four-arg `sendQuestion` in `rpc.ts` is left
 * untouched, and the server still carries it as a wrapper for any build that
 * has not shipped yet.
 *
 * THE SEND is wired to `playbook_send_question` through `sendQuestion()`. The
 * empty-draft guard fires first; on success the draft clears and the thread
 * refetches through the nonce; on a refusal the sentence from `playbookErrors`
 * shows and the draft STAYS PUT (ruling R-5), so nothing a family typed is
 * lost to a "no". The `__DEV__` harness is read-only here — its `offline`
 * thread has no player row to send as, and it says so.
 *
 * ONE MOBILE DIFFERENCE: `<select>` has no React Native equivalent, so "About"
 * is a row of chips — the whole chapter, then one per card. Same value, same
 * `cardId` state, no new dependency (a picker package would be one, and
 * FORBIDDEN). The row WRAPS (fork QUESTION-PILLS-WRAP): it was a horizontal
 * scroller, which on a narrow phone left the later cards off screen with
 * nothing to say they were there.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { playbookErrorMessage } from '../../../lib/playbookErrors';
import { fetchMyQuestions } from '../rpc';
import {
  QUESTION_KINDS,
  kindLabel,
  sendQuestionWithKind,
  type QuestionKind,
} from '../coachRpc';
import type { Card, ChapterRow, QuestionRow, ReplyRow } from '../types';
import { pick, useLang } from '../strings';
import { Btn, Chip, Cta, SectTitle, Stamp, Tape, TopHead } from '../ui';
import { pbk } from '../styles';
import { color } from '../theme';

const ago = (iso: string, es: boolean): string => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 6e4);
  if (m < 60) return `${Math.max(0, m)} min`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h`;
  return `${Math.round(h / 24)} ${es ? 'd' : 'd'}`;
};

/** HARNESS ONLY — the offline thread has no player row to send as. */
const HARNESS_ONLY = {
  en: 'The harness has no session — nothing is sent. Your message is kept.',
  es: 'El harness no tiene sesión — no se envía nada. Tu mensaje se conserva.',
};

export function ChapterEndScreen({
  chapter,
  cards,
  playerId,
  got,
  onNextChapter,
  nextChapterName,
  offline,
}: {
  chapter: ChapterRow;
  cards: Card[];
  playerId: string;
  got: Set<string>;
  onNextChapter: () => void;
  nextChapterName: string | null;
  /** The harness's thread, so the list can be looked at with no session. */
  offline?: { questions: QuestionRow[]; replies: ReplyRow[] } | null;
}) {
  const { lang } = useLang();
  const es = lang === 'es';

  const [draft, setDraft] = useState('');
  const [kind, setKind] = useState<QuestionKind>('question');
  const [cardId, setCardId] = useState('');
  const [status, setStatus] = useState('');
  const [sending, setSending] = useState(false);
  const [questions, setQuestions] = useState<QuestionRow[]>(offline?.questions ?? []);
  const [replies, setReplies] = useState<ReplyRow[]>(offline?.replies ?? []);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (offline) return;
    let dead = false;
    (async () => {
      try {
        const r = await fetchMyQuestions(playerId, chapter.id);
        if (dead) return;
        setQuestions(r.questions);
        setReplies(r.replies);
      } catch (e) {
        console.warn('playbook: questions failed to load', e);
      }
    })();
    return () => {
      dead = true;
    };
  }, [playerId, chapter.id, nonce, offline]);

  const repliesFor = useMemo(() => {
    const m = new Map<string, ReplyRow[]>();
    for (const r of replies) {
      const list = m.get(r.question_id) || [];
      list.push(r);
      m.set(r.question_id, list);
    }
    return m;
  }, [replies]);

  const cardsById = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  const gotCount = cards.filter((c) => got.has(c.id)).length;

  const send = async () => {
    const body = draft.trim();
    if (!body) {
      setStatus(es ? 'Escribe un mensaje primero.' : 'Write a message first.');
      return;
    }
    if (offline) {
      setStatus(HARNESS_ONLY[es ? 'es' : 'en']);
      return;
    }
    setSending(true);
    try {
      // 2000 is the field's own `maxLength`, trimmed again here because a
      // paste can outrun the input.
      await sendQuestionWithKind(playerId, chapter.id, cardId || null, body.slice(0, 2000), kind);
      setDraft('');
      setStatus(es ? 'Enviado. Tus coaches lo verán.' : 'Sent. Your coaches will see it.');
      setNonce((n) => n + 1);
    } catch (e) {
      // The draft stays put — R-5. A refusal must not cost the message.
      setStatus(playbookErrorMessage(e, lang));
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <TopHead
        tape={
          <Tape xl>
            {es ? 'Fin · ' : 'End · '}
            {pick(chapter.content?.name, lang)}
          </Tape>
        }
        stamp={
          <Stamp lines={[`${gotCount} / ${cards.length}`, es ? 'entendidas' : 'got it']} />
        }
      />

      <Text style={pbk.lead}>
        {es
          ? '¿Algo no quedó claro, o quieres comentarle algo a tu coach? Jugadoras, jugadores y familias pueden escribir aquí. Lo leen tus coaches y la dirección del club.'
          : 'Anything unclear, or something to tell your coach? Players and families can write here. Your coaches and the club directors read it.'}
      </Text>

      <View style={pbk.qform}>
        {/* The three kinds, default Question. They are the CHECK constraint's
            own values, so a chip can never send something the server will
            refuse. */}
        <View style={pbk.field}>
          <Text style={pbk.fieldLabel}>{es ? 'Tipo' : 'Kind'}</Text>
          <View style={pbk.pillwrap}>
            {QUESTION_KINDS.map((k) => (
              <Pressable
                key={k}
                onPress={() => setKind(k)}
                accessibilityRole="button"
                accessibilityState={{ selected: kind === k }}
              >
                <Chip green={kind === k}>{kindLabel(k, es)}</Chip>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={pbk.field}>
          <Text style={pbk.fieldLabel}>{es ? 'Sobre' : 'About'}</Text>
          <View style={pbk.pillwrap}>
            <Pressable onPress={() => setCardId('')}>
              <Chip green={cardId === ''}>
                {es ? 'Todo el capítulo' : 'The whole chapter'}
              </Chip>
            </Pressable>
            {cards.map((x) => (
              <Pressable key={x.id} onPress={() => setCardId(x.id)}>
                <Chip green={cardId === x.id}>{pick(x.content?.name, lang)}</Chip>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={pbk.field}>
          <Text style={pbk.fieldLabel}>{es ? 'Tu mensaje' : 'Your message'}</Text>
          <TextInput
            style={[pbk.fieldInput, pbk.fieldTextarea]}
            maxLength={2000}
            multiline
            placeholder={es ? 'Escribe aquí…' : 'Write here…'}
            placeholderTextColor={color.dim}
            value={draft}
            onChangeText={setDraft}
          />
        </View>

        <Btn
          variant="primary"
          label={es ? 'Enviar a mis coaches' : 'Send to my coaches'}
          onPress={send}
          disabled={sending}
        />
        <Text style={pbk.qstatus}>{status}</Text>
      </View>

      {questions.length > 0 ? (
        <>
          <SectTitle>{es ? 'Tus mensajes' : 'Your messages'}</SectTitle>
          <View style={pbk.qlist}>
            {questions.map((q) => {
              const rs = repliesFor.get(q.id) || [];
              const card = q.card_id ? cardsById.get(q.card_id) : null;
              return (
                <View key={q.id} style={[pbk.qitem, q.status === 'answered' && pbk.qitemDone]}>
                  <View style={pbk.qhead}>
                    <Text style={pbk.qmeta}>
                      {kindLabel((q as { kind?: string }).kind || 'question', es)} ·{' '}
                      {pick(chapter.content?.name, lang)}
                      {card ? ' · ' + pick(card.content?.name, lang) : ''} ·{' '}
                      {/* THREAD-STAMP-TIME: an answered message is stamped
                          with the COACH'S latest reply, not with when it was
                          asked — the same rule the staff thread follows. */}
                      {q.status === 'answered' && rs.length
                        ? `✓ ${ago(rs[rs.length - 1].created_at, es)}`
                        : ago(q.created_at, es)}
                    </Text>
                    {q.status === 'answered' ? (
                      <Chip green>{es ? 'Respondida ✓' : 'Answered ✓'}</Chip>
                    ) : null}
                  </View>
                  <Text style={pbk.qtext}>{q.body}</Text>
                  {rs.map((r) => (
                    <View key={r.id} style={pbk.qreply}>
                      <Text style={pbk.qreplyLabel}>
                        {es ? 'Respuesta del coach' : 'Coach reply'}
                      </Text>
                      <Text style={pbk.qreplyText}>{r.body}</Text>
                    </View>
                  ))}
                </View>
              );
            })}
          </View>
        </>
      ) : null}

      <Cta>
        <Btn
          variant="violet"
          label={
            nextChapterName
              ? (es ? 'Siguiente capítulo · ' : 'Next chapter · ') + nextChapterName + ' ›'
              : es
                ? 'Volver al índice'
                : 'Back to contents'
          }
          onPress={onNextChapter}
        />
      </Cta>
    </>
  );
}
