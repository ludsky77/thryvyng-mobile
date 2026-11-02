/**
 * One player, chapter by chapter — the row a coach taps from Team progress.
 *
 * IT ADDS NO NEW READ. The per-chapter counts come from `fetchProgress()` —
 * the MIRRORED `rpc.ts` call the family side already makes, whose policy is
 * `playbook_can_see_player`, so a coach calling it for their own player is
 * the same query the parent makes for their child (coach-track recon Q1). The
 * quiz figures are already on the roster row the list screen loaded, so
 * nothing is fetched twice.
 *
 * READ-ONLY, ALWAYS. There is no "Got it" here and there cannot be: the write
 * RPC's gate is `playbook_is_player_family`, so staff pressing it would be
 * refused by the server (schema :1181-1184). A button that always fails is
 * worse than no button.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { fetchProgress } from '../rpc';
import type { RosterRow } from '../coachRpc';
import type { Card, ChapterRow } from '../types';
import { pick, useLang } from '../strings';
import { ago, fullName, pctOf } from '../staffFormat';
import { IndexList, Medal, Row, Stamp, Tape, TopHead } from '../ui';
import { pbk } from '../styles';
import { toneFor } from '../type';

export function PlayerProgressScreen({
  player,
  chapters,
  cards,
  offlineGot,
}: {
  player: RosterRow;
  chapters: ChapterRow[];
  cards: Card[];
  /** The harness's card-id set; the real route reads it from the server. */
  offlineGot?: string[] | null;
}) {
  const { lang } = useLang();
  const es = lang === 'es';
  const [got, setGot] = useState<Set<string>>(() => new Set(offlineGot ?? []));
  const [loading, setLoading] = useState(!offlineGot);

  useEffect(() => {
    if (offlineGot) return;
    let gone = false;
    setLoading(true);
    (async () => {
      try {
        const ids = await fetchProgress(player.player_id);
        if (!gone) setGot(new Set(ids));
      } catch (e) {
        console.warn('playbook: player progress failed to load', e);
      } finally {
        if (!gone) setLoading(false);
      }
    })();
    return () => {
      gone = true;
    };
  }, [player.player_id, offlineGot]);

  const byChapter = useMemo(
    () =>
      chapters.map((ch) => {
        const own = cards.filter((c) => c.chapter_key === ch.key);
        const n = own.filter((c) => got.has(c.id)).length;
        return { ch, n, total: own.length };
      }),
    [chapters, cards, got]
  );

  const total = cards.length;
  const gotTotal = cards.filter((c) => got.has(c.id)).length;
  const medal =
    player.quiz_best_medal && player.quiz_best_medal !== 'none' ? player.quiz_best_medal : null;

  return (
    <>
      <TopHead
        tape={<Tape xl>{fullName(player.first_name, player.last_name, es)}</Tape>}
        stamp={<Stamp lines={[`${gotTotal} / ${total}`, es ? 'entendidas' : 'got it']} />}
      />

      <Text style={pbk.snote}>
        {player.team_name ? `${player.team_name} · ` : ''}
        {es ? 'última actividad' : 'last active'} {ago(player.last_activity_at, es)}
      </Text>

      <View style={pbk.rolepanel}>
        <View style={pbk.rolepanelNum}>
          <Text style={pbk.rolepanelNumText}>{pctOf(gotTotal, total)}</Text>
        </View>
        <View style={pbk.rolepanelBody}>
          <View style={pbk.ctItemHead}>
            <Text style={pbk.rolepanelLabel}>{es ? 'Quiz' : 'Quiz'}</Text>
            {medal ? <Medal medal={medal} /> : null}
          </View>
          <Text style={pbk.rolepanelText}>
            {player.quiz_runs > 0
              ? `${es ? 'Mejor' : 'Best'} ${player.quiz_best_score ?? 0} · ${
                  es ? 'último' : 'last'
                } ${player.quiz_last_score ?? 0} · ${player.quiz_runs} ${
                  es ? 'intentos' : 'runs'
                } · ${ago(player.quiz_last_run_at, es)}`
              : es
                ? 'Todavía no ha hecho el quiz.'
                : 'Has not taken the quiz yet.'}
          </Text>
        </View>
      </View>

      {loading ? <Text style={pbk.ctEmpty}>{es ? 'Cargando…' : 'Loading…'}</Text> : null}

      <IndexList>
        {byChapter.map(({ ch, n, total: t }, i) => {
          const tone = toneFor(i);
          const pct = pctOf(n, t);
          return (
            <Row key={ch.key} num={String(ch.n).padStart(2, '0')}>
              <Text style={[pbk.rowName, pbk.rowNameSm]}>{pick(ch.content?.name, lang)}</Text>
              <View style={pbk.prog}>
                <View style={pbk.bar}>
                  <View style={[pbk.barFill, { width: `${pct}%`, backgroundColor: tone.ink }]} />
                </View>
                <Text style={[pbk.pct, !n && pbk.pctZero]}>
                  {n} / {t}
                </Text>
              </View>
            </Row>
          );
        })}
      </IndexList>
    </>
  );
}
