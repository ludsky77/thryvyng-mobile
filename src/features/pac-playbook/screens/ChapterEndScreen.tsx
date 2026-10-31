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
 * LEFT OUT on the web, and carried over as the same gap rather than invented
 * here: the prototype's question / note / feedback chips. `playbook_questions`
 * has no `kind` column (schema :261-280), so there is nowhere to put that
 * choice and no server path to add one.
 *
 * M3 IS READ/RENDER ONLY. The thread READS — `fetchMyQuestions` — and shows
 * whatever the player already has. The SEND is a write, so `send()` is a
 * `TODO(M-later)`: the form is built, the empty-draft guard fires, and the
 * status line says plainly that it is not connected yet. Ruling R-5's
 * behaviour on a refusal (the sentence shows and the draft stays put) is the
 * branch the TODO becomes.
 *
 * ONE MOBILE DIFFERENCE: `<select>` has no React Native equivalent, so "About"
 * is a horizontal row of chips — the whole chapter, then one per card. Same
 * value, same `cardId` state, no new dependency (a picker package would be
 * one, and FORBIDDEN).
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { fetchMyQuestions } from '../rpc';
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

/** The one sentence M3 shows where the web shows the server's answer. */
const NOT_WIRED = {
  en: 'Sending is not connected yet — coming in a later step. Your message is kept.',
  es: 'El envío aún no está conectado — llega en un paso posterior. Tu mensaje se conserva.',
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
  const [cardId, setCardId] = useState('');
  const [status, setStatus] = useState('');
  const [sending] = useState(false);
  const [questions, setQuestions] = useState<QuestionRow[]>(offline?.questions ?? []);
  const [replies, setReplies] = useState<ReplyRow[]>(offline?.replies ?? []);
  const [nonce] = useState(0);

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

  const send = () => {
    const body = draft.trim();
    if (!body) {
      setStatus(es ? 'Escribe un mensaje primero.' : 'Write a message first.');
      return;
    }
    // TODO(M-later): the send. The web's own body —
    //   `await sendQuestion(playerId, chapter.id, cardId || null, body.slice(0, 2000))`
    //   then clear the draft, say "Sent. Your coaches will see it." and bump
    //   the nonce so the thread refetches; on refusal set
    //   `playbookErrorMessage(e, lang)` and KEEP the draft (R-5).
    // `sendQuestion` is already in `rpc.ts`. It INSERTS a
    // `playbook_questions` row, so M3 does not call it.
    setStatus(NOT_WIRED[es ? 'es' : 'en']);
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
        <View style={pbk.field}>
          <Text style={pbk.fieldLabel}>{es ? 'Sobre' : 'About'}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: 'row', gap: 6 }}>
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
          </ScrollView>
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
                      {pick(chapter.content?.name, lang)}
                      {card ? ' · ' + pick(card.content?.name, lang) : ''} · {ago(q.created_at, es)}
                    </Text>
                    {q.status === 'answered' ? <Chip green>✓</Chip> : null}
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
