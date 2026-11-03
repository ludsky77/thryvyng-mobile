/**
 * Questions — the staff inbox (ruling R2).
 *
 * WHO GETS HERE: only a reader `playbook_can_answer_for_player` says yes for
 * — the player's head/assistant coaches and the club-wide director set. **A
 * team manager never sees the row that opens this screen**, which is R2's
 * "managers NEVER see the inbox entry"; the server agrees independently, so
 * a manager who somehow reached this screen would see an empty list rather
 * than someone else's messages.
 *
 * TWO TABS, because the server already keeps the state. `status` goes
 * `open → answered` when a reply lands (the reply RPC does it), so the tabs
 * are two calls to the same RPC and nothing is computed here. `closed`
 * exists in the CHECK and nothing can reach it yet, so it has no tab.
 *
 * AN ITEM SAYS WHO AND WHERE BEFORE IT SAYS WHAT: the kind pill, the player's
 * name and team, then the chapter and card it is about, then the message. A
 * coach triaging twenty of these is scanning for the name and the card.
 *
 * AN ANSWERED ITEM'S AGE IS ITS LATEST REPLY'S — THREAD-STAMP-TIME, the same
 * rule the thread's stamp follows, marked with a `✓` so the two ages are not
 * mistaken for each other. An open item's age is the question's, which is how
 * long it has been waiting.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { fetchStaffInbox, kindLabel, type InboxRow } from '../coachRpc';
import { useLang } from '../strings';
import { ago, fullName, pickName } from '../staffFormat';
import { Chip, Stamp, Tape, TopHead } from '../ui';
import { pbk } from '../styles';

export function InboxScreen({
  offline,
  onOpenThread,
}: {
  /** The harness's inbox; the real route calls the RPC. */
  offline?: InboxRow[] | null;
  onOpenThread: (row: InboxRow) => void;
}) {
  const { lang } = useLang();
  const es = lang === 'es';
  const [tab, setTab] = useState<'open' | 'answered'>('open');
  const [rows, setRows] = useState<InboxRow[]>([]);
  const [loading, setLoading] = useState(!offline);

  const load = useCallback(
    async (status: 'open' | 'answered') => {
      if (offline) {
        setRows(offline.filter((q) => q.status === status));
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        setRows(await fetchStaffInbox(status));
      } catch (e) {
        setRows([]);
        console.warn('playbook: inbox failed to load', e);
      } finally {
        setLoading(false);
      }
    },
    [offline]
  );

  useEffect(() => {
    load(tab);
  }, [tab, load]);

  const item = (q: InboxRow) => {
    const where = [pickName(q.chapter_name, lang), pickName(q.card_name, lang)]
      .filter(Boolean)
      .join(' · ');
    return (
      <Pressable
        key={q.question_id}
        onPress={() => onOpenThread(q)}
        style={({ pressed }) => [
          pbk.ctItem,
          q.status === 'open' && pbk.ctItemOpen,
          pressed && pbk.pressed,
        ]}
        accessibilityRole="button"
      >
        <View style={pbk.ctItemHead}>
          <Chip green={q.status === 'open'}>{kindLabel(q.kind, es)}</Chip>
          <Text style={pbk.ctItemWho} numberOfLines={1}>
            {fullName(q.first_name, q.last_name, es)}
            {q.team_name ? ` · ${q.team_name}` : ''}
          </Text>
          <Text style={pbk.ctMeta}>
            {q.status === 'answered' && q.last_reply_at
              ? `✓ ${ago(q.last_reply_at, es)}`
              : ago(q.created_at, es)}
          </Text>
        </View>
        <Text style={pbk.ctMeta}>
          {where}
          {q.sender_kind === 'parent' ? ` · ${es ? 'de la familia' : 'from the family'}` : ''}
          {q.reply_count > 0
            ? ` · ${q.reply_count} ${es ? 'respuestas' : 'replies'}`
            : ''}
        </Text>
        <Text style={pbk.ctItemBody} numberOfLines={3}>
          {q.body}
        </Text>
      </Pressable>
    );
  };

  return (
    <>
      <TopHead
        tape={<Tape xl>{es ? 'Preguntas' : 'Questions'}</Tape>}
        stamp={<Stamp lines={[String(rows.length), tab === 'open' ? (es ? 'abiertas' : 'open') : es ? 'resueltas' : 'answered']} />}
      />

      <View style={pbk.segrow}>
        {([
          ['open', es ? 'Abiertas' : 'Open'],
          ['answered', es ? 'Respondidas' : 'Answered'],
        ] as const).map(([id, label]) => (
          <Pressable
            key={id}
            onPress={() => setTab(id)}
            style={[pbk.seg2, tab === id && pbk.seg2On]}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === id }}
          >
            <Text style={[pbk.seg2Text, tab === id && pbk.seg2OnText]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <Text style={pbk.ctEmpty}>{es ? 'Cargando…' : 'Loading…'}</Text>
      ) : !rows.length ? (
        <Text style={pbk.ctEmpty}>
          {tab === 'open'
            ? es
              ? 'Nada pendiente. Buen trabajo.'
              : 'Nothing waiting. Good work.'
            : es
              ? 'Todavía no has respondido nada.'
              : 'Nothing answered yet.'}
        </Text>
      ) : (
        <View style={pbk.ctList}>{rows.map(item)}</View>
      )}
    </>
  );
}
