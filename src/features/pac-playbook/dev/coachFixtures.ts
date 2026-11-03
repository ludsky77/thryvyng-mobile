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

import type { InboxRow, RosterRow, ThreadReply } from '../coachRpc';
import type { MyMessage } from '../familyRpc';

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
  replies: number,
  /** How long ago the latest reply landed; defaults to two hours after. */
  replyHours?: number
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
  last_reply_at: replies ? hoursAgo(replyHours ?? Math.max(0, hours - 2)) : null,
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
    1,
    /* ASKED THREE DAYS AGO, ANSWERED FOUR MINUTES AGO — THREAD-STAMP-TIME's
       whole point in one row. The stamp used to read "72 h" here. */
    4 / 60
  ),
];

/**
 * The replies a thread loads, by question id. Only the answered one has any.
 *
 * `author_user_id` is a coach's, not the asker's, because the thread labels
 * every reply "Coach reply" — the staff screen is the only writer of them
 * (`playbook_reply_question`).
 */
export const DEV_THREAD_REPLIES: Record<string, ThreadReply[]> = {
  'dev-q4': [
    {
      id: 'dev-r1',
      question_id: 'dev-q4',
      body: `[${MARK}] The +1 is always the spare one — at 2-0 down it is usually you, pushing up. Ask me at training and I will show you with cones.`,
      created_at: new Date(Date.now() - 4 * 6e4).toISOString(),
      author_user_id: 'dev-user-coach',
    },
  ],
};

/** The whole `OfflineStaff` shape, ready for the harness. */
export const DEV_STAFF = {
  roster: DEV_ROSTER,
  inbox: DEV_INBOX,
  canAnswer: true,
  replies: DEV_THREAD_REPLIES,
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

/* ------------------------------- the family's side of the same thread ----- */

/**
 * THE FAMILY'S OWN MESSAGES — `__DEV__` only, PLAYBOOK-COVER-POLISH.
 *
 * `FAMILY-MESSAGES-ON-COVER` needs four states visible in one screenshot and
 * the harness has no session to have sent anything, so they are invented here:
 *
 *   ONE ANSWERED WITH A FRESH REPLY  (5 min ago) — newer than `DEV_SEEN_AT`,
 *                                    so it carries the "new reply" dot.
 *   ONE ANSWERED WITH AN OLD REPLY   (30 h ago) — older than `DEV_SEEN_AT`,
 *                                    so it does NOT. The dot rule is only
 *                                    proven by having both.
 *   TWO STILL WAITING                so the See-all screen has a second group.
 *
 * `chapter_id` and `card_id` are the OFFLINE book's ids, which are its keys
 * (`offlineBook.ts` maps `id: String(c.id)`) — so a tap resolves to a real
 * chapter and opens its Questions & notes screen.
 */
const minsAgo = (m: number) => new Date(Date.now() - m * 6e4).toISOString();

/** The pretend "last time this reader looked", six hours back. */
export const DEV_SEEN_AT = minsAgo(6 * 60);

export const DEV_MY_MESSAGES: MyMessage[] = [
  {
    id: 'dev-m3',
    kind: 'question',
    status: 'open',
    body: `[${MARK}] On the 1-2-1 — if their 6 steps up, is that still the same press or do we drop?`,
    created_at: minsAgo(40),
    chapter_id: 'formations',
    card_id: null,
    replies: [],
  },
  {
    id: 'dev-m1',
    kind: 'question',
    status: 'answered',
    body: `[${MARK}] Is "regain" the same as winning the ball back, or does it mean the five seconds after?`,
    created_at: minsAgo(8 * 60),
    chapter_id: 'foundations',
    card_id: 'F2',
    replies: [
      {
        id: 'dev-mr1',
        body: `[${MARK}] Regain is the MOMENT you win it. What you do in the next five seconds is the card right after this one — read them together and it clicks.`,
        created_at: minsAgo(5),
      },
    ],
  },
  {
    id: 'dev-m2',
    kind: 'comment',
    status: 'answered',
    body: `[${MARK}] We read Delay together at home and she tried it on Saturday. She slowed him down twice.`,
    created_at: minsAgo(50 * 60),
    chapter_id: 'principles',
    card_id: 'P4',
    replies: [
      {
        id: 'dev-mr2',
        body: `[${MARK}] Saw both of them — that is exactly the card. Tell her the second one was the better of the two.`,
        created_at: minsAgo(30 * 60),
      },
    ],
  },
  {
    id: 'dev-m4',
    kind: 'suggestion',
    status: 'open',
    body: `[${MARK}] Could the quiz have a practice mode that does not count towards the medal?`,
    created_at: minsAgo(72 * 60),
    chapter_id: 'mind',
    card_id: null,
    replies: [],
  },
];

/** The whole `OfflineMessages` shape, ready for the harness. */
export const DEV_MAIL = {
  messages: DEV_MY_MESSAGES,
  seenAt: DEV_SEEN_AT,
};
