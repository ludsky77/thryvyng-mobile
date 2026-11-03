/**
 * Team progress — who has read what (ruling R1).
 *
 * WHO SEES IT: anyone `playbook_staff_roster()` returns rows for — the
 * player's team staff, **managers included**, and the club-wide director set.
 * That is R1 exactly, and it is the server's answer, not a role string read
 * here (`useStaffTrack` explains why those two differ).
 *
 * SORTED LEAST-PROGRESS FIRST, on purpose and against habit. An alphabetical
 * roster buries the player who has opened nothing; this screen is for finding
 * them, so the list is ordered by percent read ascending and a name is only
 * the tie-break. Lu's word for it: nudge.
 *
 * THE TEAM PICKER is built from the roster itself, so it needs no second
 * call and no role test: a coach of one team gets one chip and no row to
 * choose, a coach of two gets two, a director gets "All teams" plus one chip
 * per team and the list groups under team headings. `via` ('team' | 'club')
 * is what says which of those a row arrived through.
 *
 * THE BAR'S TONE IS THE TEAM'S, not the book's green: in a grouped director
 * view the colour is the only thing that keeps two teams' rows apart at a
 * glance, and it uses `toneFor()` so it stays inside the section palette
 * (ruling PLAYBOOK-SECTION-RAIL's colours, used here for a list that has no
 * sections of its own).
 *
 * THE QUIZ SCORE CARRIES ITS TOTAL — QUIZ-SCORE-DENOM, Lu's device test. "best
 * 6" is unreadable without knowing the run is eight questions long; "best 6 /
 * 8" is a grade. `quizTotal` comes from the BOOK — `settings.quiz.rules.perRun`
 * — and `PlaybookScreen` passes null if the book does not state one, in which
 * case the bare number is printed exactly as before rather than guessed at.
 */

import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { RosterRow } from '../coachRpc';
import { useLang } from '../strings';
import { ago, fullName, pctOf } from '../staffFormat';
import { IndexList, Row, RowEnd, SectTitle, Stamp, Tape, TopHead } from '../ui';
import { pbk } from '../styles';
import { toneFor } from '../type';

/** One team as the picker sees it. `null` id is the "no team" bucket. */
interface TeamOpt {
  id: string | null;
  name: string;
}

export function TeamProgressScreen({
  roster,
  loading,
  quizTotal,
  onOpenPlayer,
}: {
  roster: RosterRow[];
  loading: boolean;
  /** Questions in one run (`rules.perRun`), or null if the book is silent. */
  quizTotal?: number | null;
  onOpenPlayer: (playerId: string) => void;
}) {
  const { lang } = useLang();
  const es = lang === 'es';
  const [teamId, setTeamId] = useState<string | null | undefined>(undefined);

  /** Distinct teams, in the order the server listed them. */
  const teams = useMemo(() => {
    const out: TeamOpt[] = [];
    const seen = new Set<string>();
    for (const r of roster) {
      const key = r.team_id ?? '';
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ id: r.team_id, name: r.team_name || (es ? 'Sin equipo' : 'No team') });
    }
    return out;
  }, [roster, es]);

  /** One team and nothing to choose: no picker, no "All". */
  const single = teams.length <= 1;
  const showing = single ? teams[0]?.id ?? null : teamId;

  const toneOf = (id: string | null) => {
    const i = teams.findIndex((t) => t.id === id);
    return toneFor(i < 0 ? 0 : i);
  };

  const sorted = useMemo(() => {
    const rows = showing === undefined ? roster : roster.filter((r) => r.team_id === showing);
    return [...rows].sort((a, b) => {
      const pa = pctOf(a.got_it_count, a.total_cards);
      const pb = pctOf(b.got_it_count, b.total_cards);
      if (pa !== pb) return pa - pb; // least first — the nudge
      return fullName(a.first_name, a.last_name, es).localeCompare(
        fullName(b.first_name, b.last_name, es)
      );
    });
  }, [roster, showing, es]);

  /** When "All teams" is on, the list is grouped; otherwise it is one list. */
  const groups = useMemo(() => {
    if (showing !== undefined) return [{ team: null as TeamOpt | null, rows: sorted }];
    return teams.map((t) => ({ team: t, rows: sorted.filter((r) => r.team_id === t.id) }));
  }, [showing, sorted, teams]);

  /** "6 / 8", or "6" where the book states no run length. */
  const outOf = (score: number | null) =>
    quizTotal ? `${score ?? 0} / ${quizTotal}` : String(score ?? 0);

  const playerRow = (r: RosterRow) => {
    const pct = pctOf(r.got_it_count, r.total_cards);
    const tone = toneOf(r.team_id);
    const medal = r.quiz_best_medal && r.quiz_best_medal !== 'none' ? r.quiz_best_medal : null;
    return (
      <Row
        key={r.player_id}
        onPress={() => onOpenPlayer(r.player_id)}
        /* `RowEnd` draws the chevron itself (PLAYBOOK-TYPE-PASS-E: one cue
           per tappable row), so this row adds nothing to the right. */
        right={<RowEnd />}
      >
        <View style={pbk.ctLine}>
          <Text style={pbk.ctName}>{fullName(r.first_name, r.last_name, es)}</Text>
          <Text style={pbk.ctNums}>
            {r.got_it_count} / {r.total_cards}
          </Text>
        </View>
        <View style={pbk.prog}>
          <View style={pbk.bar}>
            <View style={[pbk.barFill, { width: `${pct}%`, backgroundColor: tone.ink }]} />
          </View>
          <Text style={[pbk.pct, !r.got_it_count && pbk.pctZero]}>{pct}%</Text>
        </View>
        <Text style={pbk.ctMeta}>
          {r.quiz_runs > 0
            ? `${es ? 'Quiz' : 'Quiz'} ${es ? 'mejor' : 'best'} ${outOf(r.quiz_best_score)}${
                medal ? ` · ${medal === 'gold' ? (es ? 'oro' : 'gold') : es ? 'plata' : 'silver'}` : ''
              } · ${es ? 'último' : 'last'} ${outOf(r.quiz_last_score)}`
            : es
              ? 'Sin quiz todavía'
              : 'No quiz yet'}
          {' · '}
          {es ? 'actividad' : 'active'} {ago(r.last_activity_at, es)}
        </Text>
      </Row>
    );
  };

  return (
    <>
      <TopHead
        tape={<Tape xl>{es ? 'Progreso del equipo' : 'Team progress'}</Tape>}
        stamp={<Stamp lines={[String(roster.length), es ? 'jugadores' : 'players']} />}
      />

      {!single ? (
        <View style={pbk.mvgroup}>
          <Text style={pbk.mvgroupLabel}>{es ? 'Equipo' : 'Team'}</Text>
          <View style={pbk.mvchips}>
            <Pressable
              onPress={() => setTeamId(undefined)}
              style={[pbk.mvchip, showing === undefined && pbk.mvchipOn]}
              accessibilityRole="button"
              accessibilityState={{ selected: showing === undefined }}
            >
              <Text style={[pbk.mvchipText, showing === undefined && pbk.mvchipOnText]}>
                {es ? 'Todos los equipos' : 'All teams'}
              </Text>
            </Pressable>
            {teams.map((t) => (
              <Pressable
                key={t.id ?? 'none'}
                onPress={() => setTeamId(t.id)}
                style={[pbk.mvchip, showing === t.id && pbk.mvchipOn]}
                accessibilityRole="button"
                accessibilityState={{ selected: showing === t.id }}
              >
                <Text style={[pbk.mvchipText, showing === t.id && pbk.mvchipOnText]}>{t.name}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      <Text style={pbk.snote}>
        {es
          ? 'Ordenado de menos a más leído — arriba está quien necesita el empujón.'
          : 'Sorted least-read first — the nudge is at the top.'}
      </Text>

      {loading && !roster.length ? (
        <Text style={pbk.ctEmpty}>{es ? 'Cargando…' : 'Loading…'}</Text>
      ) : !sorted.length ? (
        <Text style={pbk.ctEmpty}>
          {es ? 'No hay jugadores en esta vista.' : 'No players in this view.'}
        </Text>
      ) : (
        groups.map((g) =>
          !g.rows.length ? null : (
            <View key={g.team?.id ?? 'one'}>
              {g.team ? (
                <SectTitle
                  position={teams.findIndex((t) => t.id === g.team?.id)}
                  count={`${g.rows.length}`}
                >
                  {g.team.name}
                </SectTitle>
              ) : null}
              <IndexList>{g.rows.map(playerRow)}</IndexList>
            </View>
          )
        )
      )}
    </>
  );
}
