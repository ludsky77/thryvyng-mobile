/**
 * Team progress — the DIRECTOR'S DRILL-DOWN (PLAYBOOK-STAFF-DRILLDOWN, Lu's
 * canvas of 2026-11-02, row 2 / Flow1–Flow4).
 *
 * WHO SEES IT: anyone `playbook_staff_roster()` returns rows for — the
 * player's team staff, **managers included**, and the club-wide director set.
 * That is ruling R1 exactly, and it is the server's answer, not a role string
 * read here (`useStaffTrack` explains why those two differ). Managers are
 * unchanged by this rebuild: progress yes, Questions row no.
 *
 * FOUR LEVELS, AND EVERY STEP WITH ONE CHOICE IS SKIPPED:
 *
 *   1 HOME    "Find a team", the season line, one tile per gender PRESENT,
 *             and "Needs a nudge · whole club".
 *   2 GENDER  the age-group grid, U8 → U18 **by number** (`ageRank`).
 *   3 AGE     the team cards — coach, players, avg, nudge count.
 *   4 TEAM    the compact roster: a 3-stat strip, three sort chips and
 *             one-line ~44pt rows that open the player detail.
 *
 * THE SKIPS ARE THE POINT (Lu): one gender goes straight to the ages, one
 * team in an age goes straight to its roster, a coach with ONE team lands on
 * that roster and a coach with two to four lands on their team cards. Nobody
 * taps through a screen that offers them a single door. `landing` is where
 * that user's screen opens and the trail's first crumb always returns to it.
 *
 * SO THE CLUB-LEVEL FURNITURE IS GATED ON THE CLUB BEING ONE. The search box
 * appears for a reader with more than four teams — the only reader who cannot
 * see all of them at once — and the whole-club nudge row for anyone with more
 * than one team. A single-team coach gets their roster and nothing to search.
 *
 * THE TRAIL IS ON EVERY LEVEL and every crumb but the last is pressable. It
 * is built from the view, never accumulated, so it cannot drift out of step
 * with what is on screen; a level this reader SKIPPED is not offered as a
 * crumb, because there was never a screen there for them to go back to.
 *
 * WHAT IT READS: the roster RPC plus `teams` / `team_staff` / `profiles`
 * through `useStaffClub` — reads the app already makes elsewhere, no new RPC,
 * no new column. When the `teams` read comes back short, the players DO NOT
 * disappear: their team lands in the "Not set" bucket under the current
 * season and a line under the search box says how many (see `staffTree.ts`).
 *
 * THE SEASON SPLIT IS THE CHAT LIST'S OWN RULE — `getTeamBucket`,
 * `src/hooks/useUserTeams.ts:26-33`, copied into `staffTeams.ts` with its
 * provenance because it is not exported. **The season has no NAME here:**
 * nothing in this app reads a `seasons` table and `teams.season_id` is a bare
 * uuid, so the line reads "This season" rather than inventing "Season 2026".
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import type { RosterRow } from '../coachRpc';
import { useLang } from '../strings';
import { ago, fullName, pctOf } from '../staffFormat';
import { genderLabel, type GenderKey, type TeamMeta } from '../staffTeams';
import {
  ageLabel,
  buildClubTree,
  rosterStrip,
  searchTeams,
  type TeamNode,
} from '../staffTree';
import { Chev, Icon, IndexList, Row, RowEnd, SectTitle, Stamp, Tape, TopHead } from '../ui';
import { pbk } from '../styles';
import { color } from '../theme';
import { toneFor } from '../type';

/**
 * Where in the drill-down we are. NOT named `View` — `react-native`'s `View`
 * is imported into this file as both a value and a type.
 */
export type Spot =
  | { at: 'home' }
  | { at: 'gender'; gender: GenderKey }
  | { at: 'teams'; gender?: GenderKey; age?: string | null }
  | { at: 'team'; teamId?: string | null }
  | { at: 'nudge' };

/** How the roster is ordered. Least-read first is the default, and the point. */
type Sort = 'least' | 'az' | 'quiz';

/**
 * HARNESS ONLY — the same reason `PlaybookLook` exists. Four of this screen's
 * five levels are behind a TAP and this simulator cannot be tapped from a
 * shell, so each one is seeded here and reached by deep link instead. It is an
 * initial state and nothing more; every control still works afterwards.
 */
export interface ProgressLook {
  view?: Spot['at'];
  gender?: GenderKey;
  age?: string;
  teamId?: string;
  past?: boolean;
  sort?: Sort;
  /** A team search already typed, so the results body can be looked at. */
  query?: string;
}

/**
 * WHAT THE SHELL REMEMBERS WHILE YOU LOOK AT A PLAYER.
 *
 * Tapping a player leaves this screen and coming back remounts it, so a
 * director four levels down would land on the home tiles again. The shell
 * holds this between the two visits (`PlaybookScreen`'s `progressState`) and
 * hands it straight back — which is the same promise F2 makes for the
 * messages list: back is where you were.
 */
export interface ProgressState {
  spot: Spot | null;
  past: boolean;
  sort: Sort;
}

/** The harness's seed, as a spot. Pure — it does not need the tree. */
function seedSpot(look: ProgressLook | null | undefined): Spot | null {
  switch (look?.view) {
    case 'home':
      return { at: 'home' };
    case 'nudge':
      return { at: 'nudge' };
    case 'gender':
      return { at: 'gender', gender: look.gender ?? 'male' };
    case 'teams':
      return { at: 'teams', gender: look.gender, age: look.age ?? null };
    case 'team':
      return { at: 'team', teamId: look.teamId };
    default:
      return null;
  }
}

export function TeamProgressScreen({
  roster,
  loading,
  quizTotal,
  metaById,
  coaches,
  metaMissing,
  look,
  state,
  onState,
  onOpenPlayer,
}: {
  roster: RosterRow[];
  loading: boolean;
  /** Questions in one run (`rules.perRun`), or null if the book is silent. */
  quizTotal?: number | null;
  metaById: Map<string, TeamMeta>;
  coaches: Map<string, string>;
  /** Team ids the `teams` read could not return — reported, never hidden. */
  metaMissing: string[];
  look?: ProgressLook | null;
  /** What this screen was showing last time it was open, if anything. */
  state?: ProgressState | null;
  onState?: (next: ProgressState) => void;
  onOpenPlayer: (playerId: string) => void;
}) {
  const { lang } = useLang();
  const es = lang === 'es';

  const [past, setPast] = useState(state?.past ?? !!look?.past);
  const [query, setQuery] = useState(look?.query ?? '');
  const [focused, setFocused] = useState(false);
  const [sort, setSort] = useState<Sort>(state?.sort ?? look?.sort ?? 'least');
  /** `null` = wherever this reader's drill-down opens; see `landing`. */
  const [spot, setSpot] = useState<Spot | null>(() =>
    state ? state.spot : seedSpot(look)
  );

  /* Hand the level back up, so a trip to a player detail returns here. The
     search text is deliberately NOT remembered: a query is a question being
     asked now, not a place. */
  useEffect(() => {
    onState?.({ spot, past, sort });
  }, [spot, past, sort, onState]);

  /**
   * ONE CLOCK for the life of the screen. Seven days is the nudge boundary and
   * a fresh `Date.now()` per render would both re-key every memo below and let
   * a count disagree with the list it sits over.
   */
  const now = useMemo(() => Date.now(), []);

  const tree = useMemo(
    () => buildClubTree(roster, metaById, coaches, { past, es, now }),
    [roster, metaById, coaches, past, es, now]
  );

  /**
   * WHERE THIS READER'S SCREEN OPENS — Lu's skip rules, in order of how few
   * choices they leave: one team is a roster, two to four are team cards, one
   * gender is an age grid, and anything else is the home tiles.
   */
  const landing = useMemo<Spot>(() => {
    const n = tree.teams.length;
    if (n === 1) return { at: 'team', teamId: tree.teams[0].id };
    if (n >= 2 && n <= 4) return { at: 'teams' };
    if (tree.genders.length === 1) return { at: 'gender', gender: tree.genders[0].key };
    return { at: 'home' };
  }, [tree]);

  const at = spot ?? landing;
  const onLanding = spot === null;

  /* ------------------------------------------------------------- the moves */

  const teamOf = (id: string | null | undefined) =>
    id === undefined ? tree.teams[0] ?? null : tree.teams.find((t) => t.id === id) ?? null;

  /** An age group with one team has nothing to choose — skip to its roster. */
  const enterAge = (key: GenderKey | undefined, age: string | null) => {
    const g = tree.genders.find((x) => x.key === key);
    const node = g?.ages.find((a) => a.age === age);
    if (node && node.teams.length === 1) {
      setSpot({ at: 'team', teamId: node.teams[0].id });
      return;
    }
    setSpot({ at: 'teams', gender: key, age });
  };

  /** A gender with one age group has nothing to choose — skip to it. */
  const enterGender = (key: GenderKey) => {
    const g = tree.genders.find((x) => x.key === key);
    if (g && g.ages.length === 1) {
      enterAge(key, g.ages[0].age);
      return;
    }
    setSpot({ at: 'gender', gender: key });
  };

  /* ------------------------------------------------------------- the trail */

  interface Crumb {
    label: string;
    go?: () => void;
  }

  /** Whether this reader ever walked the gender / age levels at all. */
  const deepStart = landing.at === 'home' || landing.at === 'gender';

  const crumbs: Crumb[] = [
    {
      label: es ? 'Progreso' : 'Team progress',
      go: onLanding ? undefined : () => setSpot(null),
    },
  ];

  if (at.at === 'nudge') {
    crumbs.push({ label: es ? 'Para dar un empujón' : 'Needs a nudge' });
  } else if (at.at === 'gender') {
    crumbs.push({ label: genderLabel(at.gender, es) });
  } else if (at.at === 'teams') {
    if (deepStart && at.gender) {
      crumbs.push({
        label: genderLabel(at.gender, es),
        go: landing.at === 'gender' ? undefined : () => enterGender(at.gender as GenderKey),
      });
      crumbs.push({ label: ageLabel(at.age ?? null, es) });
    }
  } else if (at.at === 'team') {
    const t = teamOf(at.teamId);
    if (deepStart && t) {
      crumbs.push({
        label: genderLabel(t.gender, es),
        go: landing.at === 'gender' ? undefined : () => enterGender(t.gender),
      });
      crumbs.push({ label: ageLabel(t.age, es), go: () => enterAge(t.gender, t.age) });
    }
    if (t) crumbs.push({ label: t.name });
  }

  const trail = (
    <View style={pbk.ctCrumbs}>
      {crumbs.map((c, i) => (
        <React.Fragment key={`${c.label}-${i}`}>
          {i > 0 ? <Text style={pbk.ctCrumbSep}>›</Text> : null}
          {c.go ? (
            <Pressable onPress={c.go} accessibilityRole="button" hitSlop={6}>
              <Text style={[pbk.ctCrumb, pbk.ctCrumbLink]}>{c.label}</Text>
            </Pressable>
          ) : (
            <Text style={[pbk.ctCrumb, i === crumbs.length - 1 && pbk.ctCrumbNow]}>{c.label}</Text>
          )}
        </React.Fragment>
      ))}
    </View>
  );

  /* ------------------------------------------------------------- the parts */

  /** "6 / 8", or "6" where the book states no run length (QUIZ-SCORE-DENOM). */
  const outOf = (score: number) => (quizTotal ? `${score} / ${quizTotal}` : String(score));

  const bar = (pct: number, ink: string) => (
    <View style={pbk.bar}>
      <View style={[pbk.barFill, { width: `${pct}%`, backgroundColor: ink }]} />
    </View>
  );

  const nudgeLine = (n: number) =>
    n > 0
      ? es
        ? `${n} ${n === 1 ? 'necesita un empujón' : 'necesitan un empujón'}`
        : `${n} need${n === 1 ? 's' : ''} a nudge`
      : es
        ? 'Nadie atrasado'
        : 'Nobody behind';

  /** One tile — a gender on the home screen, an age group one level down. */
  const tile = (
    key: string,
    name: string,
    teams: number,
    pct: number,
    nudges: number,
    ink: string,
    go: () => void
  ) => (
    <Pressable
      key={key}
      onPress={go}
      accessibilityRole="button"
      style={({ pressed }) => [pbk.ctTile, pressed && pbk.pressed]}
    >
      <View style={pbk.ctTileRow}>
        <Text style={[pbk.ctTileName, pbk.ctFlex]} numberOfLines={1}>
          {name}
        </Text>
        <Chev />
      </View>
      <Text style={pbk.ctMeta}>
        {teams} {teams === 1 ? (es ? 'equipo' : 'team') : es ? 'equipos' : 'teams'}
      </Text>
      <View style={pbk.ctTileRow}>
        {bar(pct, ink)}
        <Text style={[pbk.pct, !pct && pbk.pctZero]}>{pct}%</Text>
      </View>
      <Text style={pbk.ctNudge}>{nudgeLine(nudges)}</Text>
    </Pressable>
  );

  /** A team card — coach, players, avg, nudge count (Lu's four). */
  const teamCard = (t: TeamNode, i: number) => (
    <Pressable
      key={t.id ?? `none-${i}`}
      onPress={() => setSpot({ at: 'team', teamId: t.id })}
      accessibilityRole="button"
      style={({ pressed }) => [pbk.ctItem, pressed && pbk.pressed]}
    >
      <View style={pbk.ctTileRow}>
        <Text style={[pbk.ctName, pbk.ctFlex]} numberOfLines={1}>
          {t.name}
        </Text>
        <Chev />
      </View>
      <Text style={pbk.ctMeta}>
        {t.coach ? `${t.coach} · ` : ''}
        {t.players}{' '}
        {t.players === 1 ? (es ? 'jugador/a' : 'player') : es ? 'jugadores' : 'players'}
        {t.age ? ` · ${t.age}` : ''}
      </Text>
      <View style={pbk.ctTileRow}>
        {bar(t.pct, toneFor(i).ink)}
        <Text style={[pbk.pct, !t.pct && pbk.pctZero]}>{t.pct}%</Text>
      </View>
      <Text style={pbk.ctNudge}>{nudgeLine(t.nudges)}</Text>
    </Pressable>
  );

  /**
   * A ONE-LINE roster row, ~44pt: name · thin bar · x / 69 · › (Lu's shape).
   *
   * ONE DEPARTURE, and it is flagged in the ledger: under the **Quiz** sort
   * the trailing number is the player's BEST QUIZ SCORE instead of their read
   * count. A list ordered by a number it does not show reads as shuffled —
   * the screenshot of it was the proof. The bar is still the read bar and the
   * two other sorts are exactly as specified; one line reverts it.
   */
  const playerRow = (r: RosterRow, ink: string, byQuiz: boolean) => {
    const pct = pctOf(r.got_it_count, r.total_cards);
    const ran = r.quiz_runs > 0 && r.quiz_best_score != null;
    return (
      <Row
        key={r.player_id}
        onPress={() => onOpenPlayer(r.player_id)}
        style={pbk.ctRowTight}
        right={<RowEnd />}
      >
        <View style={pbk.ctTightLine}>
          <Text style={[pbk.ctName, pbk.ctFlex]} numberOfLines={1}>
            {fullName(r.first_name, r.last_name, es)}
          </Text>
          <View style={pbk.ctMiniBar}>
            <View style={[pbk.barFill, { width: `${pct}%`, backgroundColor: ink }]} />
          </View>
          <Text style={pbk.ctNums}>
            {byQuiz
              ? ran
                ? outOf(r.quiz_best_score as number)
                : '—'
              : `${r.got_it_count} / ${r.total_cards}`}
          </Text>
        </View>
      </Row>
    );
  };

  /* ------------------------------------------------------- the club header */

  const searchHits = useMemo(() => searchTeams(tree.teams, query), [tree.teams, query]);
  const searching = !!query.trim();
  /** Only the reader who cannot see every team at once needs to search. */
  const showSearch = onLanding && tree.teams.length > 4;
  const showClubNudge =
    onLanding && tree.teams.length > 1 && tree.nudgeList.length > 0 && !(showSearch && searching);

  const searchBox = (
    <View style={[pbk.searchbox, focused && pbk.searchboxOn]}>
      <Icon name="search" stroke={color.mute} />
      <TextInput
        style={pbk.searchInput}
        value={query}
        onChangeText={setQuery}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        autoCorrect={false}
        autoCapitalize="none"
        placeholder={es ? 'Buscar equipo, coach o edad…' : 'Find a team, coach or age…'}
        placeholderTextColor={color.dim}
        accessibilityLabel={es ? 'Buscar un equipo' : 'Find a team'}
        returnKeyType="search"
      />
      {query ? (
        <Pressable
          onPress={() => setQuery('')}
          accessibilityRole="button"
          accessibilityLabel={es ? 'Borrar' : 'Clear'}
          hitSlop={8}
        >
          <Text style={pbk.searchClear}>×</Text>
        </Pressable>
      ) : null}
    </View>
  );

  /**
   * THE SEASON LINE. Current by default, the chat list's own active/past rule
   * (`staffTeams.teamBucket`), and the toggle only appears when the other
   * season actually holds a team. It says "This season" and not "Season
   * 2026-27" because no read in this app can name a season — reported.
   */
  const seasonLine = (
    <View style={pbk.ctSeason}>
      <Text style={pbk.ctSeasonText}>
        {past
          ? es
            ? 'Temporadas pasadas'
            : 'Past seasons'
          : es
            ? 'Esta temporada'
            : 'This season'}
      </Text>
      {tree.hasOtherSeason ? (
        <Pressable
          onPress={() => {
            setPast((p) => !p);
            setSpot(null);
            setQuery('');
          }}
          accessibilityRole="button"
          hitSlop={6}
        >
          <Text style={pbk.ctSeasonBtn}>
            {past
              ? es
                ? '‹ Esta temporada'
                : '‹ This season'
              : es
                ? 'Temporadas pasadas ›'
                : 'Past seasons ›'}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );

  /** "Needs a nudge · whole club" — the row Lu asked for, with its count. */
  const clubNudgeRow = (
    <IndexList>
      <Row
        onPress={() => setSpot({ at: 'nudge' })}
        right={
          <RowEnd>
            <View style={pbk.ctBadge}>
              <Text style={pbk.ctBadgeText}>{tree.nudgeList.length}</Text>
            </View>
          </RowEnd>
        }
      >
        <Text style={pbk.ctName}>{es ? 'Para dar un empujón' : 'Needs a nudge'}</Text>
        <Text style={pbk.ctMeta}>
          {es ? 'Todo el club · sin actividad en 7 días' : 'Whole club · no activity in 7 days'}
        </Text>
      </Row>
    </IndexList>
  );

  const empty = (
    <Text style={pbk.ctEmpty}>
      {loading && !roster.length
        ? es
          ? 'Cargando…'
          : 'Loading…'
        : past
          ? es
            ? 'No hay equipos de temporadas pasadas.'
            : 'No teams from past seasons.'
          : es
            ? 'No hay jugadores en esta vista.'
            : 'No players in this view.'}
    </Text>
  );

  /* ------------------------------------------------------------ the levels */

  let body: React.ReactNode = null;
  let heading: React.ReactNode = null;
  /** What the stamp counts — the players under the level being looked at. */
  let scope = tree.players;

  if (showSearch && searching) {
    heading = (
      <SectTitle count={`${searchHits.length}`}>{es ? 'Resultados' : 'Results'}</SectTitle>
    );
    body = searchHits.length ? (
      <View style={pbk.ctList}>{searchHits.map(teamCard)}</View>
    ) : (
      <Text style={pbk.ctEmpty}>{es ? 'Ningún equipo coincide.' : 'No team matches that.'}</Text>
    );
  } else if (at.at === 'home') {
    heading = tree.genders.length ? (
      <SectTitle count={`${tree.teams.length}`}>
        {es ? 'Equipos del club' : 'Club teams'}
      </SectTitle>
    ) : null;
    body = !tree.genders.length ? (
      empty
    ) : (
      <View style={pbk.ctTiles}>
        {tree.genders.map((g, i) =>
          tile(g.key, genderLabel(g.key, es), g.teams.length, g.pct, g.nudges, toneFor(i).ink, () =>
            enterGender(g.key)
          )
        )}
      </View>
    );
  } else if (at.at === 'gender') {
    const g = tree.genders.find((x) => x.key === at.gender);
    scope = g?.players ?? 0;
    heading = <SectTitle count={`${g?.teams.length ?? 0}`}>{es ? 'Por edad' : 'By age group'}</SectTitle>;
    body = !g ? (
      empty
    ) : (
      <View style={pbk.ctTiles}>
        {g.ages.map((a, i) =>
          tile(a.age ?? 'none', ageLabel(a.age, es), a.teams.length, a.pct, a.nudges, toneFor(i).ink, () =>
            enterAge(at.gender, a.age)
          )
        )}
      </View>
    );
  } else if (at.at === 'teams') {
    const list = at.gender
      ? (tree.genders.find((x) => x.key === at.gender)?.ages.find((a) => a.age === (at.age ?? null))
          ?.teams ?? [])
      : tree.teams;
    scope = list.reduce((n, t) => n + t.players, 0);
    heading = <SectTitle count={`${list.length}`}>{es ? 'Equipos' : 'Teams'}</SectTitle>;
    body = !list.length ? empty : <View style={pbk.ctList}>{list.map(teamCard)}</View>;
  } else if (at.at === 'nudge') {
    scope = tree.nudgeList.length;
    heading = (
      <SectTitle count={`${tree.nudgeList.length}`}>
        {es ? 'Todo el club' : 'Whole club'}
      </SectTitle>
    );
    body = !tree.nudgeList.length ? (
      <Text style={pbk.ctEmpty}>
        {es ? 'Nadie necesita un empujón ahora.' : 'Nobody needs a nudge right now.'}
      </Text>
    ) : (
      <IndexList>
        {tree.nudgeList.map(({ row, teamName }) => (
          <Row key={row.player_id} onPress={() => onOpenPlayer(row.player_id)} right={<RowEnd />}>
            <View style={pbk.ctLine}>
              <Text style={pbk.ctName} numberOfLines={1}>
                {fullName(row.first_name, row.last_name, es)}
              </Text>
              <Text style={pbk.ctNums}>
                {row.got_it_count} / {row.total_cards}
              </Text>
            </View>
            <Text style={pbk.ctMeta}>
              {teamName} · {es ? 'actividad' : 'active'} {ago(row.last_activity_at, es)}
            </Text>
          </Row>
        ))}
      </IndexList>
    );
  } else {
    /* --------------------------------------- THE COMPACT ROSTER (Flow4) --- */
    const t = teamOf(at.teamId);
    const rows = t?.rows ?? [];
    const strip = rosterStrip(rows, now);
    scope = rows.length;
    const ink = toneFor(Math.max(0, tree.teams.findIndex((x) => x.id === (t?.id ?? null)))).ink;
    const sorted = [...rows].sort((a, b) => {
      const byName = fullName(a.first_name, a.last_name, es).localeCompare(
        fullName(b.first_name, b.last_name, es)
      );
      if (sort === 'az') return byName;
      if (sort === 'quiz') {
        const qa = a.quiz_runs > 0 ? (a.quiz_best_score ?? 0) : -1;
        const qb = b.quiz_runs > 0 ? (b.quiz_best_score ?? 0) : -1;
        return qa === qb ? byName : qb - qa; // best first
      }
      const pa = pctOf(a.got_it_count, a.total_cards);
      const pb = pctOf(b.got_it_count, b.total_cards);
      return pa === pb ? byName : pa - pb; // least first — the nudge
    });

    const chips: { key: Sort; label: string }[] = [
      { key: 'least', label: es ? 'Menos leído' : 'Least read' },
      { key: 'az', label: 'A–Z' },
      { key: 'quiz', label: 'Quiz' },
    ];

    heading = t ? <SectTitle count={`${rows.length}`}>{t.name}</SectTitle> : null;
    body = (
      <>
        <View style={pbk.ctStrip}>
          <View style={pbk.ctStat}>
            <Text style={pbk.ctStatValue}>{strip.pct}%</Text>
            <Text style={pbk.ctStatLabel}>{es ? 'Media del equipo' : 'Team avg'}</Text>
          </View>
          <View style={pbk.ctStat}>
            <Text style={pbk.ctStatValue}>
              {strip.weekRead} / {strip.weekOf}
            </Text>
            <Text style={pbk.ctStatLabel}>{es ? 'Leyó esta semana' : 'Read this week'}</Text>
          </View>
          <View style={pbk.ctStat}>
            <Text style={pbk.ctStatValue}>
              {strip.quizAvg == null ? '—' : outOf(strip.quizAvg)}
            </Text>
            <Text style={pbk.ctStatLabel}>{es ? 'Media del quiz' : 'Quiz avg'}</Text>
          </View>
        </View>

        <View style={pbk.mvchips}>
          {chips.map((c) => (
            <Pressable
              key={c.key}
              onPress={() => setSort(c.key)}
              style={[pbk.mvchip, sort === c.key && pbk.mvchipOn]}
              accessibilityRole="button"
              accessibilityState={{ selected: sort === c.key }}
            >
              <Text style={[pbk.mvchipText, sort === c.key && pbk.mvchipOnText]}>{c.label}</Text>
            </Pressable>
          ))}
        </View>

        {!sorted.length ? (
          empty
        ) : (
          <>
            {t && t.nudges > 0 ? <Text style={pbk.snote}>{nudgeLine(t.nudges)}</Text> : null}
            <IndexList>{sorted.map((r) => playerRow(r, ink, sort === 'quiz'))}</IndexList>
          </>
        )}
      </>
    );
  }

  /* ---------------------------------------------------------------- render */

  return (
    <>
      <TopHead
        tape={<Tape xl>{es ? 'Progreso del equipo' : 'Team progress'}</Tape>}
        stamp={
          <Stamp
            lines={[
              String(scope),
              at.at === 'nudge'
                ? es
                  ? 'por avisar'
                  : 'to nudge'
                : es
                  ? 'jugadores'
                  : 'players',
            ]}
          />
        }
      />

      {trail}

      {onLanding ? (
        <>
          {showSearch ? searchBox : null}
          {seasonLine}
          {metaMissing.length && tree.teams.length > 1 ? (
            <Text style={pbk.snote}>
              {es
                ? `${metaMissing.length} ${metaMissing.length === 1 ? 'equipo' : 'equipos'} sin categoría ni edad legibles — aparecen en «Sin categoría».`
                : `${metaMissing.length} team${metaMissing.length === 1 ? '' : 's'} with no readable gender or age group — listed under “Not set”.`}
            </Text>
          ) : null}
          {showClubNudge ? clubNudgeRow : null}
        </>
      ) : null}

      {heading}
      {body}
    </>
  );
}
