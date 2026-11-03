/**
 * One thread — the question, every reply, and the box to answer it.
 *
 * SENDING DOES NOT MARK IT ANSWERED; the server does. `playbook_reply_question`
 * inserts the reply, sets `status = 'answered'` and fires the push to the
 * asker and the family (rulings R2, R3) in one statement — so this screen
 * never writes a status and never sends a notification. On success it asks
 * the caller to refresh and shows the new reply.
 *
 * A REFUSAL KEEPS THE DRAFT (ruling R-5), the same promise the family's form
 * makes: `P0044 not_player_staff` is already in `playbookErrors`, so a
 * manager who reached this screen gets the sentence, not a crash, and their
 * text stays in the box.
 *
 * THE STAMP'S SECOND LINE IS THE LATEST REPLY'S AGE once this is answered —
 * THREAD-STAMP-TIME, Lu's device test, 2026-11-02. It used to read the age of
 * the QUESTION, so a thread answered a minute ago was stamped "ANSWERED · 72 h"
 * and looked stale. Open threads are unchanged and still read the question's
 * age, because that is how long somebody has been waiting.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { playbookErrorMessage } from '../../../lib/playbookErrors';
import {
  fetchThreadReplies,
  kindLabel,
  replyQuestion,
  type InboxRow,
  type ThreadReply,
} from '../coachRpc';
import { useLang } from '../strings';
import { ago, fullName, pickName } from '../staffFormat';
import { Btn, Chip, SectTitle, Stamp, Tape, TopHead } from '../ui';
import { pbk } from '../styles';
import { color } from '../theme';

/** HARNESS ONLY — the offline thread has no session to reply as. */
const HARNESS_ONLY = {
  en: 'The harness has no session — nothing is sent. Your reply is kept.',
  es: 'El harness no tiene sesión — no se envía nada. Tu respuesta se conserva.',
};

export function ThreadScreen({
  question,
  offlineReplies,
  onAnswered,
}: {
  question: InboxRow;
  /** The harness's replies; the real route reads them under RLS. */
  offlineReplies?: ThreadReply[] | null;
  /** Fired after a reply lands, so the inbox badge and tabs catch up. */
  onAnswered: () => void;
}) {
  const { lang } = useLang();
  const es = lang === 'es';
  const [replies, setReplies] = useState<ThreadReply[]>(offlineReplies ?? []);
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState('');
  const [sending, setSending] = useState(false);
  const [answered, setAnswered] = useState(question.status === 'answered');

  const load = useCallback(async () => {
    if (offlineReplies) return;
    try {
      setReplies(await fetchThreadReplies(question.question_id));
    } catch (e) {
      console.warn('playbook: thread failed to load', e);
    }
  }, [question.question_id, offlineReplies]);

  useEffect(() => {
    load();
  }, [load]);

  const send = async () => {
    const body = draft.trim();
    if (!body) {
      setStatus(es ? 'Escribe una respuesta primero.' : 'Write a reply first.');
      return;
    }
    if (offlineReplies) {
      setStatus(HARNESS_ONLY[es ? 'es' : 'en']);
      return;
    }
    setSending(true);
    try {
      await replyQuestion(question.question_id, body.slice(0, 2000));
      setDraft('');
      setAnswered(true);
      setStatus(
        es
          ? 'Enviado. La familia recibe un aviso.'
          : 'Sent. The family gets a notification.'
      );
      await load();
      onAnswered();
    } catch (e) {
      // The draft stays put — R-5.
      setStatus(playbookErrorMessage(e, lang));
    } finally {
      setSending(false);
    }
  };

  /**
   * THREAD-STAMP-TIME. The replies this screen loaded are the freshest source
   * — the last one is the newest, because `fetchThreadReplies` orders them
   * ascending — and `last_reply_at` off the inbox row is the fallback for the
   * instant before they arrive. A reply just sent lands in `replies` through
   * `load()`, so the stamp catches up on its own.
   */
  const lastReply = replies.length
    ? replies[replies.length - 1].created_at
    : question.last_reply_at;
  const stampAt = answered && lastReply ? lastReply : question.created_at;

  const where = [pickName(question.chapter_name, lang), pickName(question.card_name, lang)]
    .filter(Boolean)
    .join(' · ');

  return (
    <>
      <TopHead
        tape={<Tape xl>{fullName(question.first_name, question.last_name, es)}</Tape>}
        stamp={
          <Stamp
            lines={[
              answered ? (es ? 'resuelta' : 'answered') : es ? 'abierta' : 'open',
              ago(stampAt, es),
            ]}
          />
        }
      />

      <View style={[pbk.qitem, answered && pbk.qitemDone]}>
        {/* F1 THREAD ✓ CHIP. The ✓ lives in the SAME inner row as the kind
            pill, not as a third child of a wrapping `qhead`. It used to sit
            beside `ctItemHead`, and `qhead` wraps: a long chapter · card ·
            team line filled the first line and pushed the ✓ onto its own,
            where it read as an orphan circle under the pill. The two pills
            are now one unit and the meta line is what wraps. */}
        <View style={pbk.qhead}>
          <View style={pbk.ctItemHead}>
            <Chip green={!answered}>{kindLabel(question.kind, es)}</Chip>
            {answered ? <Chip green>✓</Chip> : null}
          </View>
          <Text style={[pbk.qmeta, pbk.ctFlex]}>
            {where}
            {question.team_name ? ` · ${question.team_name}` : ''}
          </Text>
        </View>
        <Text style={pbk.qtext}>{question.body}</Text>
        <Text style={pbk.ctMeta}>
          {question.sender_kind === 'parent'
            ? es
              ? 'Escrito por la familia'
              : 'Written by the family'
            : question.sender_kind === 'player'
              ? es
                ? 'Escrito por el jugador/a'
                : 'Written by the player'
              : ''}
        </Text>
      </View>

      {replies.length > 0 ? (
        <>
          <SectTitle>{es ? 'Respuestas' : 'Replies'}</SectTitle>
          <View style={pbk.qlist}>
            {replies.map((r) => (
              <View key={r.id} style={pbk.qreply}>
                <Text style={pbk.qreplyLabel}>
                  {es ? 'Respuesta del coach' : 'Coach reply'} · {ago(r.created_at, es)}
                </Text>
                <Text style={pbk.qreplyText}>{r.body}</Text>
              </View>
            ))}
          </View>
        </>
      ) : null}

      <View style={pbk.qform}>
        <View style={pbk.field}>
          <Text style={pbk.fieldLabel}>{es ? 'Tu respuesta' : 'Your reply'}</Text>
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
          label={es ? 'Enviar respuesta' : 'Send reply'}
          onPress={send}
          disabled={sending}
        />
        <Text style={pbk.qstatus}>{status}</Text>
      </View>
    </>
  );
}
