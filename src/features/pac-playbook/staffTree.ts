/**
 * THE CLUB, AS A TREE — PLAYBOOK-STAFF-DRILLDOWN, pure and no I/O.
 *
 * The staff screen is four levels deep (gender → age group → team → roster)
 * and every level prints the same three numbers: how many teams or players are
 * under it, what share of the book they have read, and how many of them need a
 * nudge. Computing those inside the screen would mean four nearly-identical
 * reduces inside render; computing them here means ONE pass and a model the
 * screen only has to draw.
 *
 * PURE ON PURPOSE. Everything below is a function of (roster rows, team
 * metadata, now) with no clock of its own and no network — so a fixture and a
 * live club go through the identical arithmetic, and `now` is a parameter
 * rather than a `Date.now()` buried in a loop (one call per build, so a list
 * cannot disagree with its own count).
 *
 * THE NUDGE RULE, Lu 2026-11-02: a player needs one when they have no Got-it
 * and no quiz activity in the LAST SEVEN DAYS, or never had any. The roster's
 * `last_activity_at` is the server's own answer to that — it is the greater of
 * the player's latest Got-it and their latest quiz run — so this never
 * recomputes it from parts.
 *
 * WHAT HAPPENS WHEN THE TEAM METADATA IS SHORT. A team the `teams` read did
 * not return keeps its players: it lands in the `unset` gender bucket with no
 * age group and under the CURRENT season (`teamBucket` → 'unknown'). The
 * alternative — dropping it — would quietly shorten a club, and a director
 * counting their own teams is exactly who this screen is for.
 */

import type { RosterRow } from './coachRpc';
import { pctOf } from './staffFormat';
import {
  GENDER_ORDER,
  normalizeGender,
  teamBucket,
  type GenderKey,
  type TeamBucket,
  type TeamMeta,
} from './staffTeams';

/** Lu's rule: seven days of silence, or never. */
export const NUDGE_DAYS = 7;

const DAY_MS = 864e5;

export function needsNudge(row: RosterRow, now: number): boolean {
  if (!row.last_activity_at) return true;
  const t = new Date(row.last_activity_at).getTime();
  if (!Number.isFinite(t)) return true;
  return now - t > NUDGE_DAYS * DAY_MS;
}

/** Active in the last seven days — the roster strip's "read this week". */
export function activeThisWeek(row: RosterRow, now: number): boolean {
  return !needsNudge(row, now);
}

/* ---------------------------------------------------------------- the nodes */

/** The three numbers every level of the tree prints. */
export interface Tally {
  players: number;
  /** Mean percent read across the players under this node, whole. */
  pct: number;
  nudges: number;
}

export interface TeamNode extends Tally {
  /** `null` is the roster's own "no team" bucket. */
  id: string | null;
  name: string;
  gender: GenderKey;
  /** The raw `teams.age_group` string, or null where there is none. */
  age: string | null;
  coach: string | null;
  bucket: TeamBucket;
  rows: RosterRow[];
}

export interface AgeNode extends Tally {
  age: string | null;
  teams: TeamNode[];
}

export interface GenderNode extends Tally {
  key: GenderKey;
  teams: TeamNode[];
  ages: AgeNode[];
}

/** One row of the whole-club nudge list. */
export interface NudgeRow {
  row: RosterRow;
  teamName: string;
}

export interface ClubTree extends Tally {
  /** Every team in the season being shown, in name order. */
  teams: TeamNode[];
  genders: GenderNode[];
  /** Least read first, each labelled with its team. */
  nudgeList: NudgeRow[];
  /** True when the OTHER season has something in it — the toggle's gate. */
  hasOtherSeason: boolean;
}

/* ------------------------------------------------------------- the helpers */

function tally(rows: RosterRow[], now: number): Tally {
  if (!rows.length) return { players: 0, pct: 0, nudges: 0 };
  let sum = 0;
  let nudges = 0;
  for (const r of rows) {
    sum += pctOf(r.got_it_count, r.total_cards);
    if (needsNudge(r, now)) nudges += 1;
  }
  return { players: rows.length, pct: Math.round(sum / rows.length), nudges };
}

/**
 * U8 before U10 before U18 — **numeric, not alphabetical.** A string sort puts
 * U10 before U8, which is the one thing a coach scanning an age grid will
 * notice immediately. Anything with no number in it sorts last, by name.
 */
export function ageRank(age: string | null): number {
  if (!age) return Number.POSITIVE_INFINITY;
  const m = age.match(/(\d+)/);
  return m ? Number(m[1]) : Number.POSITIVE_INFINITY;
}

export function ageLabel(age: string | null, es: boolean): string {
  return age || (es ? 'Sin categoría' : 'No age group');
}

function byAge(a: AgeNode, b: AgeNode): number {
  const ra = ageRank(a.age);
  const rb = ageRank(b.age);
  if (ra !== rb) return ra - rb;
  return (a.age || '').localeCompare(b.age || '');
}

/* --------------------------------------------------------------- the build */

export interface BuildOpts {
  /** 'past' builds the archived/inactive season instead of the current one. */
  past?: boolean;
  es?: boolean;
  now?: number;
}

/**
 * One pass over the roster, grouped by team, then by age, then by gender.
 *
 * `metaById` is whatever `fetchTeamMeta` managed to read; `coaches` whatever
 * `fetchHeadCoaches` did. Both may be short and neither may be empty-checked
 * by the caller — a missing entry is a missing fact, handled above.
 */
export function buildClubTree(
  roster: RosterRow[],
  metaById: Map<string, TeamMeta>,
  coaches: Map<string, string>,
  opts: BuildOpts = {}
): ClubTree {
  const now = opts.now ?? Date.now();
  const es = !!opts.es;
  const wantPast = !!opts.past;

  /** Which bucket a roster row's team falls in, and whether we want it. */
  const bucketOf = (teamId: string | null) =>
    teamBucket(teamId ? metaById.get(teamId) : null);
  const wanted = (b: TeamBucket) =>
    wantPast ? b === 'past' : b === 'active' || b === 'unknown';

  let hasOtherSeason = false;

  /* ---- group the rows by team, dropping the season we are not showing ---- */
  const byTeam = new Map<string, RosterRow[]>();
  for (const r of roster) {
    const b = bucketOf(r.team_id);
    if (b === 'hidden') continue; // a test team, exactly as the chat list does
    if (!wanted(b)) {
      hasOtherSeason = true;
      continue;
    }
    const key = r.team_id ?? '';
    const list = byTeam.get(key);
    if (list) list.push(r);
    else byTeam.set(key, [r]);
  }

  const teams: TeamNode[] = [];
  for (const [key, rows] of byTeam) {
    const id = key || null;
    const meta = id ? metaById.get(id) : undefined;
    teams.push({
      id,
      name:
        meta?.name ||
        rows[0].team_name ||
        (es ? 'Sin equipo' : 'No team'),
      gender: normalizeGender(meta?.gender),
      age: meta?.age_group || null,
      coach: (id ? coaches.get(id) : null) ?? meta?.coach_name ?? null,
      bucket: bucketOf(id),
      rows,
      ...tally(rows, now),
    });
  }
  teams.sort((a, b) => a.name.localeCompare(b.name));

  /* ------------------------------- gender → age group → team ------------- */
  const genders: GenderNode[] = [];
  for (const key of GENDER_ORDER) {
    const mine = teams.filter((t) => t.gender === key);
    if (!mine.length) continue; // "Coed only if such teams exist" — Lu
    const ages: AgeNode[] = [];
    const seen = new Map<string, TeamNode[]>();
    for (const t of mine) {
      const k = t.age || '';
      const list = seen.get(k);
      if (list) list.push(t);
      else seen.set(k, [t]);
    }
    for (const [k, list] of seen) {
      ages.push({
        age: k || null,
        teams: list,
        ...tally(list.flatMap((t) => t.rows), now),
      });
    }
    ages.sort(byAge);
    genders.push({
      key,
      teams: mine,
      ages,
      ...tally(mine.flatMap((t) => t.rows), now),
    });
  }

  /* ------------------------------------------- the whole-club nudge list -- */
  const nameOf = new Map<string | null, string>(teams.map((t) => [t.id, t.name]));
  const nudgeList: NudgeRow[] = [];
  for (const t of teams) {
    for (const r of t.rows) {
      if (needsNudge(r, now)) {
        nudgeList.push({ row: r, teamName: nameOf.get(t.id) || t.name });
      }
    }
  }
  nudgeList.sort((a, b) => {
    const pa = pctOf(a.row.got_it_count, a.row.total_cards);
    const pb = pctOf(b.row.got_it_count, b.row.total_cards);
    if (pa !== pb) return pa - pb;
    return (a.row.first_name || '').localeCompare(b.row.first_name || '');
  });

  return {
    teams,
    genders,
    nudgeList,
    hasOtherSeason,
    ...tally(teams.flatMap((t) => t.rows), now),
  };
}

/* -------------------------------------------------------------- the search */

/**
 * "Find a team" — by TEAM NAME, COACH or AGE (Lu's three). Case- and
 * accent-insensitive on the two names; the age matches on the raw column, so
 * "12" finds U12 and "u12" does too.
 */
export function searchTeams(teams: TeamNode[], query: string): TeamNode[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return teams.filter((t) => {
    const hay = [t.name, t.coach || '', t.age || ''].join(' ').toLowerCase();
    return hay.includes(q);
  });
}

/* ----------------------------------------------------- the roster's strip */

/** The three numbers over a team's roster (team avg · this week · quiz avg). */
export interface RosterStrip {
  pct: number;
  weekRead: number;
  weekOf: number;
  /** Mean BEST score across the players who have run the quiz, or null. */
  quizAvg: number | null;
}

export function rosterStrip(rows: RosterRow[], now: number): RosterStrip {
  const t = tally(rows, now);
  const week = rows.filter((r) => activeThisWeek(r, now)).length;
  const ran = rows.filter((r) => r.quiz_runs > 0 && r.quiz_best_score != null);
  const quizAvg = ran.length
    ? Math.round((ran.reduce((s, r) => s + (r.quiz_best_score || 0), 0) / ran.length) * 10) / 10
    : null;
  return { pct: t.pct, weekRead: week, weekOf: rows.length, quizAvg };
}
