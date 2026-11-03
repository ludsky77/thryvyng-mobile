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
import type { TeamMeta } from '../staffTeams';

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

/* ------------------- a whole club, for the drill-down -------------------- */

/**
 * A FAKE CLUB — `__DEV__` only, PLAYBOOK-STAFF-DRILLDOWN.
 *
 * The drill-down has five levels and `DEV_ROSTER` above cannot reach them: two
 * teams with no gender and no age group collapse straight to the team cards.
 * So this is a club with the shape the director view was designed for, and
 * every one of its awkward cases is here ON PURPOSE:
 *
 *   THREE GENDERS PRESENT    Boys, Girls and ONE Coed team — the ruling says
 *                            Coed renders only where such a team exists, and a
 *                            screenshot of that needs one to exist.
 *   AGES OUT OF ORDER        U8 before U10 before U12 before U14, so a string
 *                            sort (which would put U10 first) is visibly wrong.
 *   A ONE-TEAM BRANCH        Coed has one age with one team, which the flow
 *                            must SKIP twice over and land on the roster.
 *   A TWO-TEAM AGE           Boys U12, which must NOT be skipped.
 *   AN ARCHIVED TEAM         so "Past seasons ›" has something behind it.
 *   A TEST TEAM              which must NOT appear at all (`is_test`, the chat
 *                            list's own rule).
 *   A TEAM WITH NO `teams`   ROW — `nometa` is in the roster and absent from
 *                            `DEV_CLUB_META`, which is what an RLS refusal
 *                            looks like: its players stay, in the "Not set"
 *                            bucket, and the screen says one team could not be
 *                            placed.
 *
 * `gender` is spelled the way the column really holds it ("Boys", "Girls",
 * "Coed"), not the normalised key, so `normalizeGender` is exercised rather
 * than bypassed.
 */

interface DevClubTeam {
  id: string;
  name: string;
  gender: string | null;
  age: string | null;
  status: 'active' | 'archived';
  isTest?: boolean;
  coach: string;
  /** False = the `teams` read does not return this row (an RLS refusal). */
  meta?: boolean;
  size: number;
}

const CLUB_TEAMS: DevClubTeam[] = [
  { id: 'dev-b08', name: '[DEV] ZZ Lions', gender: 'Boys', age: 'U8', status: 'active', coach: '[DEV] R. Okafor', size: 4 },
  { id: 'dev-b10a', name: '[DEV] ZZ Comets', gender: 'Boys', age: 'U10', status: 'active', coach: '[DEV] M. Herrera', size: 5 },
  { id: 'dev-b10b', name: '[DEV] ZZ Rangers', gender: 'Boys', age: 'U10', status: 'active', coach: '[DEV] T. Blake', size: 4 },
  { id: 'dev-b12a', name: '[DEV] ZZ Thunder', gender: 'Boys', age: 'U12', status: 'active', coach: '[DEV] L. Sandoval', size: 6 },
  { id: 'dev-b12b', name: '[DEV] ZZ Falcons', gender: 'Boys', age: 'U12', status: 'active', coach: '[DEV] P. Ndiaye', size: 5 },
  { id: 'dev-g10', name: '[DEV] ZZ Aurora', gender: 'Girls', age: 'U10', status: 'active', coach: '[DEV] C. Duarte', size: 5 },
  { id: 'dev-g12a', name: '[DEV] ZZ Tide', gender: 'Girls', age: 'U12', status: 'active', coach: '[DEV] S. Whitfield', size: 6 },
  { id: 'dev-g12b', name: '[DEV] ZZ Summit', gender: 'Girls', age: 'U12', status: 'active', coach: '[DEV] A. Kowal', size: 4 },
  { id: 'dev-g14', name: '[DEV] ZZ Vanguard', gender: 'Girls', age: 'U14', status: 'active', coach: '[DEV] J. Amara', size: 5 },
  { id: 'dev-c12', name: '[DEV] ZZ United', gender: 'Coed', age: 'U12', status: 'active', coach: '[DEV] D. Roth', size: 4 },
  { id: 'dev-b12old', name: '[DEV] ZZ Thunder 25', gender: 'Boys', age: 'U12', status: 'archived', coach: '[DEV] L. Sandoval', size: 4 },
  { id: 'dev-test', name: '[DEV] ZZ Sandbox', gender: 'Boys', age: 'U12', status: 'active', isTest: true, coach: '[DEV] Q. A. Bot', size: 3 },
  { id: 'dev-nometa', name: '[DEV] ZZ Unreadable', gender: null, age: null, status: 'active', coach: '[DEV] Unknown', meta: false, size: 3 },
];

const FIRST = [
  'Ana', 'Mateo', 'Sofia', 'Jordan', 'Rafa', 'Harper', 'Luca', 'Nora',
  'Iker', 'Zoe', 'Omar', 'Maya', 'Diego', 'Ivy', 'Tomas', 'Lena',
  'Noah', 'Pilar', 'Enzo', 'Ruby', 'Kai', 'Vera', 'Milo', 'Sasha',
];
const LAST = ['Ruiz', 'Flores', 'Nguyen', 'Pike', 'Molina', 'Quinn', 'Serra', 'Hale', 'Vega', 'Bauer'];

/** Read counts and activity ages, spread so every level has a spread. */
const GOT = [0, 3, 9, 17, 24, 33, 41, 52, 61, 69];
/** Hours since the last Got-it or quiz run. Over 168 (7 d) is a nudge. */
const SINCE = [1, 6, 22, 70, 150, 200, 410, 900];

/**
 * DETERMINISTIC, not random: the same club every launch, so two screenshots
 * taken a minute apart can be compared. The arithmetic is a stride through
 * three prime-ish offsets, which is enough to stop a team reading as a
 * sequence without a generator.
 */
function clubPlayers(t: DevClubTeam, seed: number): RosterRow[] {
  const out: RosterRow[] = [];
  for (let i = 0; i < t.size; i += 1) {
    const n = seed + i * 7;
    const got = GOT[(seed + i * 3) % GOT.length];
    const hours = SINCE[(seed + i * 5) % SINCE.length];
    const runs = got > 20 ? ((seed + i) % 3) + 1 : 0;
    const best = runs ? Math.min(8, 4 + ((seed + i) % 5)) : null;
    out.push({
      player_id: `${t.id}-p${i + 1}`,
      first_name: `[DEV] ${FIRST[n % FIRST.length]}`,
      last_name: LAST[(n * 3) % LAST.length],
      player_status: 'active',
      team_id: t.id,
      team_name: t.name,
      club_id: 'dev-club',
      via: 'club',
      got_it_count: got,
      total_cards: TOTAL,
      quiz_best_score: best,
      quiz_best_medal: best == null ? 'none' : best >= 8 ? 'gold' : best >= 6 ? 'silver' : 'none',
      quiz_last_score: best == null ? null : Math.max(0, best - ((seed + i) % 3)),
      quiz_runs: runs,
      quiz_last_run_at: runs ? hoursAgo(hours + 2) : null,
      last_activity_at: hoursAgo(hours),
    });
  }
  return out;
}

/** Every player in the club, including the past, hidden and unreadable teams. */
export const DEV_CLUB_ROSTER: RosterRow[] = CLUB_TEAMS.flatMap((t, i) => clubPlayers(t, i + 1));

/** What the `teams` read returns — every team EXCEPT `dev-nometa`. */
export const DEV_CLUB_META: TeamMeta[] = CLUB_TEAMS.filter((t) => t.meta !== false).map((t) => ({
  id: t.id,
  name: t.name,
  age_group: t.age,
  gender: t.gender,
  team_status: t.status,
  is_test: !!t.isTest,
  season_id: t.status === 'archived' ? 'dev-season-25' : 'dev-season-26',
}));

/** What the `team_staff` → `profiles` read returns. */
export const DEV_CLUB_COACHES: Record<string, string> = Object.fromEntries(
  CLUB_TEAMS.filter((t) => t.meta !== false).map((t) => [t.id, t.coach])
);

/** The director's whole club — `coach=club`. */
export const DEV_STAFF_CLUB = {
  roster: DEV_CLUB_ROSTER,
  inbox: DEV_INBOX,
  canAnswer: true,
  replies: DEV_THREAD_REPLIES,
};

export const DEV_CLUB = { meta: DEV_CLUB_META, coaches: DEV_CLUB_COACHES };

/**
 * A COACH WITH EXACTLY ONE TEAM — `coach=one`, the landing Lu named: no
 * tiles, no ages, no team cards, straight onto the roster.
 */
const ONE = CLUB_TEAMS.find((t) => t.id === 'dev-b12a')!;

export const DEV_STAFF_ONE_TEAM = {
  roster: DEV_CLUB_ROSTER.filter((r) => r.team_id === ONE.id),
  inbox: [] as InboxRow[],
  canAnswer: true,
};

export const DEV_CLUB_ONE_TEAM = {
  meta: DEV_CLUB_META.filter((m) => m.id === ONE.id),
  coaches: { [ONE.id]: ONE.coach },
};

/**
 * The two-team fixture's own metadata, so `coach=1` keeps reading sensibly
 * after the rebuild: both teams are Boys U12 and ACTIVE, which lands that
 * reader on their two team cards (Lu's 2–4 rule).
 */
export const DEV_CLUB_AB = {
  meta: [
    {
      id: TEAM_A.id,
      name: TEAM_A.name,
      age_group: 'U12',
      gender: 'Boys',
      team_status: 'active',
      is_test: false,
      season_id: 'dev-season-26',
    },
    {
      id: TEAM_B.id,
      name: TEAM_B.name,
      age_group: 'U12',
      gender: 'Boys',
      team_status: 'active',
      is_test: false,
      season_id: 'dev-season-26',
    },
  ] as TeamMeta[],
  coaches: { [TEAM_A.id]: '[DEV] L. Sandoval', [TEAM_B.id]: '[DEV] P. Ndiaye' },
};
