/**
 * A FAKE ROSTER AND A FAKE INBOX — `__DEV__` ONLY, and not data.
 *
 * Same pattern and same reason as `./testCards.ts`: the coach track's four
 * screens cannot be looked at on a simulator without a coach login, a team,
 * players who have read something and questions somebody actually sent. The
 * harness has no session at all, so every one of those is invented here —
 * clearly, and in one file that no production path can reach.
 *
 * WHAT IS NOT FAKED. The SHAPES are the server's: `RosterRow` and `InboxRow`
 * are the `RETURNS TABLE` column lists of `playbook_staff_roster` and
 * `playbook_staff_inbox` from migration `20261102033000`, so a screen that
 * renders this fixture renders a real row too. What is invented is only the
 * contents — names, teams, counts, three questions.
 *
 * TWO TEAMS ON PURPOSE, so the director case (the picker's "All teams" and
 * the grouped list) has something to group, and the progress list has a
 * spread to sort: the point of that screen is that the least-read player
 * sorts to the top, which a roster of one cannot show.
 *
 * `MARK` is the string to grep an export for. It must not appear.
 */

import type { InboxRow, RosterRow } from '../coachRpc';

/** The grep token. If an export contains this, the fixture shipped. */
export const MARK = 'PLAYBOOK-DEV-COACHFIX';

const TEAM_A = { id: 'dev-team-a', name: '[DEV] ZZ Test Team 0826' };
const TEAM_B = { id: 'dev-team-b', name: '[DEV] ZZ Test Team B' };

const TOTAL = 69; // the seeded book's published card count

const hoursAgo = (h: number) => new Date(Date.now() - h * 36e5).toISOString();

const player = (
  id: string,
  first: string,
  last: string,
  team: { id: string; name: string },
  got: number,
  quiz: { best: number; medal: 'none' | 'silver' | 'gold'; last: number; runs: number } | null,
  activeHoursAgo: number
): RosterRow => ({
  player_id: id,
  first_name: first,
  last_name: last,
  player_status: 'active',
  team_id: team.id,
  team_name: team.name,
  club_id: 'dev-club',
  via: 'team',
  got_it_count: got,
  total_cards: TOTAL,
  quiz_best_score: quiz ? quiz.best : null,
  quiz_best_medal: quiz ? quiz.medal : 'none',
  quiz_last_score: quiz ? quiz.last : null,
  quiz_runs: quiz ? quiz.runs : 0,
  quiz_last_run_at: quiz ? hoursAgo(activeHoursAgo + 2) : null,
  last_activity_at: hoursAgo(activeHoursAgo),
});

/** Six players, two teams, deliberately uneven — the nudge has to be visible. */
export const DEV_ROSTER: RosterRow[] = [
  player('dev-p1', '[DEV] Ana', 'Ruiz', TEAM_A, 61, { best: 8, medal: 'gold', last: 7, runs: 3 }, 3),
  player('dev-p2', '[DEV] Mateo', 'Flores', TEAM_A, 24, { best: 6, medal: 'silver', last: 6, runs: 1 }, 28),
  player('dev-p3', '[DEV] Sofia', 'Nguyen', TEAM_A, 3, null, 200),
  player('dev-p4', '[DEV] Jordan', 'Pike', TEAM_B, 44, { best: 7, medal: 'silver', last: 5, runs: 4 }, 9),
  player('dev-p5', '[DEV] Rafa', 'Molina', TEAM_B, 0, null, 900),
  player('dev-p6', '[DEV] Harper', 'Quinn', TEAM_B, 69, { best: 8, medal: 'gold', last: 8, runs: 2 }, 1),
];

const question = (
  id: string,
  kind: string,
  status: 'open' | 'answered',
  from: RosterRow,
  body: string,
  chapter: { key: string; name: { en: string; es: string } },
  card: { key: string; name: { en: string; es: string } } | null,
  hours: number,
  replies: number
): InboxRow => ({
  question_id: id,
  kind,
  status,
  body,
  created_at: hoursAgo(hours),
  player_id: from.player_id,
  first_name: from.first_name,
  last_name: from.last_name,
  team_id: from.team_id,
  team_name: from.team_name,
  chapter_id: `dev-ch-${chapter.key}`,
  chapter_key: chapter.key,
  chapter_name: chapter.name,
  card_id: card ? `dev-cd-${card.key}` : null,
  card_key: card ? card.key : null,
  card_name: card ? card.name : null,
  sender_user_id: `dev-user-${from.player_id}`,
  sender_kind: from.player_id === 'dev-p2' ? 'parent' : 'player',
  reply_count: replies,
  last_reply_at: replies ? hoursAgo(Math.max(0, hours - 2)) : null,
});

const CH_PRINCIPLES = { key: 'principles', name: { en: 'Principles', es: 'Principios' } };
const CH_MOVEMENT = { key: 'movement', name: { en: 'Positions & movement', es: 'Posiciones y movimiento' } };

/** Three open and one answered, so both tabs have something to show. */
export const DEV_INBOX: InboxRow[] = [
  question(
    'dev-q1',
    'question',
    'open',
    DEV_ROSTER[2],
    `[${MARK}] On "Delay" — if I am the last defender and they are running at me, do I still slow them down or do I go win it?`,
    CH_PRINCIPLES,
    { key: 'P4', name: { en: 'Delay', es: 'Retrasar' } },
    3,
    0
  ),
  question(
    'dev-q2',
    'comment',
    'open',
    DEV_ROSTER[1],
    `[${MARK}] We read the check-in / check-out card together at home and he tried it on Saturday. It worked twice. Thank you.`,
    CH_MOVEMENT,
    { key: 'GF3', name: { en: 'Check in, check out', es: 'Pide y sal' } },
    20,
    0
  ),
  question(
    'dev-q3',
    'suggestion',
    'open',
    DEV_ROSTER[4],
    `[${MARK}] Could the quiz have a practice mode that does not count? I want to try it without it going on my score.`,
    CH_PRINCIPLES,
    null,
    50,
    0
  ),
  question(
    'dev-q4',
    'question',
    'answered',
    DEV_ROSTER[0],
    `[${MARK}] What does "the +1" mean when we are already losing 2-0?`,
    CH_PRINCIPLES,
    { key: 'P9', name: { en: 'The +1', es: 'El +1' } },
    72,
    1
  ),
];

/** The whole `OfflineStaff` shape, ready for the harness. */
export const DEV_STAFF = {
  roster: DEV_ROSTER,
  inbox: DEV_INBOX,
  canAnswer: true,
};

/**
 * A manager sees the SAME roster and NO inbox row — ruling R2, and the one
 * case worth being able to photograph, because it is a row that must NOT be
 * there.
 */
export const DEV_STAFF_MANAGER = {
  roster: DEV_ROSTER,
  inbox: [] as InboxRow[],
  canAnswer: false,
};
