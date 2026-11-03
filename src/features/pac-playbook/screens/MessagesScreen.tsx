/**
 * Your messages — every question, comment and suggestion this family has sent,
 * across the whole book (PLAYBOOK-COVER-POLISH, FAMILY-MESSAGES-ON-COVER).
 *
 * WHY IT EXISTS. Until now a family's thread lived on the END-OF-CHAPTER screen
 * and nowhere else, so a reply to something asked three chapters ago could only
 * be found by remembering which chapter it was asked in. Lu's Nov 2 device
 * test: the messages belong on the first screen, with one door to all of them.
 *
 * GROUPED ANSWERED / WAITING, in that order, because the reason to open this
 * screen is a reply. Inside each group the server's order is kept — newest
 * first (`fetchMyMessages` orders by `created_at desc`).
 *
 * A TAP GOES TO THE CHAPTER'S OWN QUESTIONS & NOTES SCREEN rather than to a
 * thread of its own: that screen already draws the message, its replies and
 * the box to write another, and a second place to read one thread is a second
 * place to keep right.
 *
 * `MessageItem` IS EXPORTED because the cover block shows the newest three in
 * exactly this look. One component, so the two cannot drift.
 */

import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { kindLabel } from '../coachRpc';
import { latestReplyAt, messageAgeAt, type MyMessage } from '../familyRpc';
import type { Card, ChapterRow } from '../types';
import { pick, useLang } from '../strings';
import { ago } from '../staffFormat';
import { Chip, SectTitle, Stamp, Tape, TopHead } from '../ui';
import { pbk } from '../styles';

/**
 * One message, as both the cover block and this screen draw it.
 *
 * THE AGE IS THE REPLY'S when there is one — THREAD-STAMP-TIME. An answered
 * message reads "✓ 5 min", which is when the coach wrote; a waiting one reads
 * the age of the question, which is how long it has been waiting.
 */
export function MessageItem({
  m,
  where,
  isNew,
  onPress,
}: {
  m: MyMessage;
  /** "Chapter · Card", already resolved and localised by the caller. */
  where: string;
  isNew: boolean;
  onPress?: () => void;
}) {
  const { lang } = useLang();
  const es = lang === 'es';
  const answered = m.status === 'answered';
  const reply = latestReplyAt(m) ? m.replies[m.replies.length - 1] : null;

  const body = (
    <>
      <View style={pbk.qhead}>
        <Chip green={!answered}>{kindLabel(m.kind, es)}</Chip>
        <Text style={pbk.qmeta} numberOfLines={1}>
          {where}
        </Text>
        {isNew ? <View style={pbk.msgDot} /> : null}
        <Text style={pbk.ctMeta}>
          {answered ? '✓ ' : ''}
          {ago(messageAgeAt(m), es)}
        </Text>
      </View>
      <Text style={pbk.qtext} numberOfLines={3}>
        {m.body}
      </Text>
      {reply ? (
        <View style={pbk.qreply}>
          <Text style={pbk.qreplyLabel}>{es ? 'Respuesta del coach' : 'Coach reply'}</Text>
          <Text style={pbk.qreplyText} numberOfLines={2}>
            {reply.body}
          </Text>
        </View>
      ) : null}
    </>
  );

  if (!onPress) return <View style={[pbk.qitem, answered && pbk.qitemDone]}>{body}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [pbk.qitem, answered && pbk.qitemDone, pressed && pbk.pressed]}
    >
      {body}
    </Pressable>
  );
}

/**
 * "Principles · Delay" for a message — WHERE it was written.
 *
 * A HOOK rather than a function because two screens print it (this one and
 * the cover block) and both need the reader's language and the two id maps.
 * One resolver, so the cover and the list can never name a chapter
 * differently.
 */
export function useMessageWhere(chapters: ChapterRow[], cards: Card[]) {
  const { lang } = useLang();
  const chById = React.useMemo(() => new Map(chapters.map((c) => [c.id, c])), [chapters]);
  const cardById = React.useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  return React.useCallback(
    (m: MyMessage) => {
      const ch = chById.get(m.chapter_id);
      const card = m.card_id ? cardById.get(m.card_id) : null;
      return [pick(ch?.content?.name, lang), card ? pick(card.content?.name, lang) : '']
        .filter(Boolean)
        .join(' · ');
    },
    [chById, cardById, lang]
  );
}

export function MessagesScreen({
  messages,
  chapters,
  cards,
  isNew,
  loading,
  onOpenChapter,
}: {
  messages: MyMessage[];
  chapters: ChapterRow[];
  cards: Card[];
  isNew: (m: MyMessage) => boolean;
  loading: boolean;
  /** The chapter's Questions & notes screen, by chapter KEY. */
  onOpenChapter: (chapterKey: string) => void;
}) {
  const { lang } = useLang();
  const es = lang === 'es';

  const chById = React.useMemo(() => new Map(chapters.map((c) => [c.id, c])), [chapters]);
  const where = useMessageWhere(chapters, cards);

  const answered = messages.filter((m) => m.status === 'answered');
  const waiting = messages.filter((m) => m.status !== 'answered');

  const group = (rows: MyMessage[], label: string, position: number) =>
    !rows.length ? null : (
      <View key={label}>
        <SectTitle position={position} count={String(rows.length)}>
          {label}
        </SectTitle>
        <View style={pbk.qlist}>
          {rows.map((m) => {
            const ch = chById.get(m.chapter_id);
            return (
              <MessageItem
                key={m.id}
                m={m}
                where={where(m)}
                isNew={isNew(m)}
                onPress={ch ? () => onOpenChapter(ch.key) : undefined}
              />
            );
          })}
        </View>
      </View>
    );

  return (
    <>
      <TopHead
        tape={<Tape xl>{es ? 'Tus mensajes' : 'Your messages'}</Tape>}
        stamp={
          <Stamp lines={[String(messages.length), es ? 'mensajes' : 'messages']} />
        }
      />

      <Text style={pbk.snote}>
        {es
          ? 'Toca un mensaje para abrir el capítulo donde lo escribiste — ahí puedes escribir otro.'
          : 'Tap a message to open the chapter you wrote it in — that is where you can write another.'}
      </Text>

      {loading && !messages.length ? (
        <Text style={pbk.ctEmpty}>{es ? 'Cargando…' : 'Loading…'}</Text>
      ) : !messages.length ? (
        <Text style={pbk.ctEmpty}>
          {es
            ? 'Todavía no has escrito nada. Al final de cada capítulo hay un espacio para hacerlo.'
            : 'You have not written anything yet. There is a space for it at the end of every chapter.'}
        </Text>
      ) : (
        <>
          {group(answered, es ? 'Respondidos' : 'Answered', 0)}
          {group(waiting, es ? 'Esperando' : 'Waiting', 1)}
        </>
      )}
    </>
  );
}
