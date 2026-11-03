/**
 * SURVEY SHARE — the insert shape, the content format, and the rollback.
 *
 * THE SOURCE OF THE COLUMN LIST, which is the whole point of this suite:
 * Lu's own read of the LIVE `sv_chat_shares` table, Q-05, 2026-11-03 12:41 MDT:
 *
 *   id          default
 *   survey_id   NOT NULL
 *   team_id     NOT NULL
 *   shared_by   NOT NULL
 *   message_id  NULL
 *   shared_at   default now()
 *
 * There is NO `channel_id` and NO `posted_by`. The audit is
 * `thrive-and-score/docs/recon/club-announcements-v1-server.md` § 7d.
 *
 * What this suite can and cannot prove: it proves the code SENDS that shape
 * and no other key, in that order, and rolls back when the second write is
 * refused. It cannot prove the live table accepts it — that is the server dry
 * run's V1/V2/V3, and a simulator share is still owed.
 */
'use strict';

/** Exactly the keys the live table has that a client may write. */
const WRITABLE_COLUMNS = ['survey_id', 'team_id', 'shared_by', 'message_id'];
/** The two the old mobile code sent that do not exist at all. */
const PHANTOM_COLUMNS = ['channel_id', 'posted_by'];

const CHANNEL = 'c0000000-0000-4000-8000-000000000001';
const TEAM = 'd0000000-0000-4000-8000-000000000002';
const SURVEY = 'e0000000-0000-4000-8000-000000000003';
const USER = 'f0000000-0000-4000-8000-000000000004';
const MESSAGE = 'a0000000-0000-4000-8000-000000000005';

const BASE = {
  channelId: CHANNEL,
  teamId: TEAM,
  surveyId: SURVEY,
  surveyTitle: 'Spring season feedback',
  userId: USER,
};

/** A plan where both writes succeed. */
const happyPlan = () => ({
  'comm_messages.insert': { data: { id: MESSAGE }, error: null },
  'sv_chat_shares.insert': { data: null, error: null },
});

async function run(t, env) {
  const { surveyShare, stub } = env;
  const {
    composeSurveyShareContent,
    parseSharedSurveyId,
    shareSurveyToChat,
    fetchSurveyShare,
    SURVEY_CONTENT_PATTERN,
    SURVEY_SHARE_FAILED_MESSAGE,
    SURVEY_SHARE_NO_TEAM_MESSAGE,
  } = surveyShare;

  /* ── 1. the cross-app content format ──────────────────────────────── */
  t.group('survey content format');

  t.eq(
    composeSurveyShareContent(SURVEY, 'Spring season feedback'),
    `[SURVEY:${SURVEY}] Spring season feedback`,
    'content is `[SURVEY:<id>] <title>`'
  );
  // The web card's own regex, from ChatPanel.tsx:511. If our format stops
  // matching it, a mobile share silently renders as plain text on web.
  t.ok(
    /\[SURVEY:([a-f0-9-]{36})\]/i.test(
      composeSurveyShareContent(SURVEY, 'x')
    ),
    "web's own regex matches what we send"
  );
  t.eq(
    parseSharedSurveyId(composeSurveyShareContent(SURVEY, 'Any title')),
    SURVEY,
    'the id round-trips back out of the content'
  );
  t.eq(
    parseSharedSurveyId('Spring season feedback'),
    null,
    'a bare title carries no id (the OLD format — not a share)'
  );
  t.eq(parseSharedSurveyId(null), null, 'null content carries no id');
  t.eq(parseSharedSurveyId(''), null, 'empty content carries no id');
  t.eq(
    parseSharedSurveyId('[SURVEY:not-a-uuid] t'),
    null,
    'a non-uuid marker is not an id'
  );
  t.ok(
    SURVEY_CONTENT_PATTERN.flags.includes('i'),
    'the pattern is case-insensitive, as web`s is'
  );
  t.ok(
    composeSurveyShareContent(SURVEY, 'A').startsWith('[SURVEY:'),
    'the marker leads, so LEFT(content,100) in the push still shows the title'
  );

  /* ── 2. the happy path's insert shape ─────────────────────────────── */
  t.group('survey share — insert shape');

  let client = stub.createStubClient(happyPlan());
  stub.setClient(client);
  let result = await shareSurveyToChat(BASE);

  t.eq(result.status, 'ok', 'both writes land → ok');
  t.eq(result.messageId, MESSAGE, 'the new message id comes back');

  const msgRow = client.firstArgsOf('comm_messages', 'insert');
  t.deepEq(
    Object.keys(msgRow).sort(),
    ['channel_id', 'content', 'message_type', 'user_id'],
    'the message row is exactly channel_id, content, message_type, user_id'
  );
  t.eq(msgRow.message_type, 'survey', "message_type is 'survey'");
  t.eq(
    msgRow.content,
    `[SURVEY:${SURVEY}] Spring season feedback`,
    'the message content is web`s format, not the bare title'
  );
  t.eq(msgRow.user_id, USER, 'user_id is the signed-in user');
  t.eq(msgRow.channel_id, CHANNEL, 'channel_id is on the MESSAGE (it belongs there)');

  const shareRow = client.firstArgsOf('sv_chat_shares', 'insert');
  t.deepEq(
    Object.keys(shareRow).sort(),
    [...WRITABLE_COLUMNS].sort(),
    'the share row is exactly survey_id, team_id, shared_by, message_id'
  );
  t.eq(shareRow.survey_id, SURVEY, 'survey_id is the survey');
  t.eq(shareRow.team_id, TEAM, 'team_id is the CHAT`S team (NOT NULL, no default)');
  t.eq(shareRow.shared_by, USER, 'shared_by is the signed-in user');
  t.eq(shareRow.message_id, MESSAGE, 'message_id points at the message just written');

  PHANTOM_COLUMNS.forEach((col) => {
    t.ok(
      !(col in shareRow),
      `the share row does NOT carry '${col}' — not a column on the live table`
    );
  });

  t.deepEq(
    client.opsOn('comm_messages'),
    [['insert', 'select', 'single']],
    'the message insert RETURNS its id (insert → select → single)'
  );
  t.deepEq(
    client.opsOn('sv_chat_shares'),
    [['insert']],
    'the share insert returns nothing — awaited bare, error still read'
  );
  t.eq(
    client.rpcCalls('soft_delete_message').length,
    0,
    'a successful share rolls nothing back'
  );
  t.eq(client.calls.length, 2, 'a share is exactly two writes, no more');

  /* ── 3. the message write order ───────────────────────────────────── */
  t.group('survey share — write order');

  t.eq(client.calls[0].table, 'comm_messages', 'the message is written FIRST');
  t.eq(
    client.calls[1].table,
    'sv_chat_shares',
    'the share row is written SECOND — it needs the message id'
  );

  /* ── 4. no team → nothing is written at all ───────────────────────── */
  t.group('survey share — no team');

  for (const teamId of [null, undefined, '']) {
    client = stub.createStubClient(happyPlan());
    stub.setClient(client);
    result = await shareSurveyToChat({ ...BASE, teamId });
    t.eq(
      result.status,
      'no-team',
      `teamId ${JSON.stringify(teamId)} → refused before any write`
    );
    t.eq(
      client.calls.length,
      0,
      `teamId ${JSON.stringify(teamId)} writes NOTHING — team_id is NOT NULL, so a message here would be a permanent orphan`
    );
    t.eq(
      result.message,
      SURVEY_SHARE_NO_TEAM_MESSAGE,
      `teamId ${JSON.stringify(teamId)} gets the team sentence, not the generic one`
    );
  }

  /* ── 5. the message insert is refused ─────────────────────────────── */
  t.group('survey share — message refused');

  // This is the live state until the server migration's PART 6 applies: the
  // CHECK on comm_messages.message_type does not list 'survey' yet, so every
  // share is refused right here with 23514.
  const checkViolation = {
    code: '23514',
    message:
      'new row for relation "comm_messages" violates check constraint "comm_messages_message_type_check"',
  };
  client = stub.createStubClient({
    'comm_messages.insert': { data: null, error: checkViolation },
  });
  stub.setClient(client);
  result = await shareSurveyToChat(BASE);

  t.eq(result.status, 'message-failed', 'a refused message insert is REPORTED');
  t.eq(
    result.message,
    SURVEY_SHARE_FAILED_MESSAGE,
    'and it is reported with the one sentence, never silently'
  );
  t.eq(result.error, checkViolation, 'the server`s own error travels with it');
  t.eq(
    client.callsOn('sv_chat_shares').length,
    0,
    'no share row is attempted once the message failed'
  );
  t.eq(
    client.rpcCalls('soft_delete_message').length,
    0,
    'nothing to roll back — the message never landed'
  );

  /* ── 6. the message insert answers with no id ─────────────────────── */
  t.group('survey share — message returned no id');

  client = stub.createStubClient({
    'comm_messages.insert': { data: null, error: null },
  });
  stub.setClient(client);
  result = await shareSurveyToChat(BASE);
  t.eq(
    result.status,
    'message-failed',
    'no error but no id is still a failure — there is nothing to point a share at'
  );
  t.eq(
    client.callsOn('sv_chat_shares').length,
    0,
    'and no share row is written with a null message_id'
  );

  /* ── 7. the share row is refused → the message is rolled back ─────── */
  t.group('survey share — share refused, rollback');

  // What an RLS refusal looks like: the row the policy would not take (the
  // dry run's V3 asserts a non-staff member gets exactly this).
  const rlsRefusal = {
    code: '42501',
    message: 'new row violates row-level security policy for table "sv_chat_shares"',
  };
  client = stub.createStubClient({
    'comm_messages.insert': { data: { id: MESSAGE }, error: null },
    'sv_chat_shares.insert': { data: null, error: rlsRefusal },
    'rpc.soft_delete_message': { data: true, error: null },
  });
  stub.setClient(client);
  result = await shareSurveyToChat(BASE);

  t.eq(result.status, 'share-failed', 'a refused share row is REPORTED');
  t.eq(
    result.message,
    SURVEY_SHARE_FAILED_MESSAGE,
    'with the one sentence — the user is never left thinking it worked'
  );
  t.eq(result.error, rlsRefusal, 'carrying the server`s own error');
  t.eq(result.messageId, MESSAGE, 'and the orphan`s id, for the log');
  t.eq(result.rolledBack, true, 'the orphan message was soft-deleted');

  const rollback = client.rpcCalls('soft_delete_message');
  t.eq(rollback.length, 1, 'the rollback is ONE call');
  t.deepEq(
    rollback[0].args,
    { p_message_id: MESSAGE },
    'through soft_delete_message — the SAME door the chat`s own delete uses'
  );
  t.ok(
    !client.callsOn('comm_messages').some((c) =>
      c.ops.some((o) => o.op === 'update')
    ),
    'and NOT by a direct update to comm_messages'
  );

  /* ── 8. the rollback itself fails ─────────────────────────────────── */
  t.group('survey share — rollback failed');

  for (const [label, plan] of [
    ['an error', { data: null, error: { code: '42501' } }],
    ['a false answer', { data: false, error: null }],
  ]) {
    client = stub.createStubClient({
      'comm_messages.insert': { data: { id: MESSAGE }, error: null },
      'sv_chat_shares.insert': { data: null, error: rlsRefusal },
      'rpc.soft_delete_message': plan,
    });
    stub.setClient(client);
    result = await shareSurveyToChat(BASE);
    t.eq(
      result.status,
      'share-failed',
      `rollback returning ${label} is still a share failure`
    );
    t.eq(
      result.rolledBack,
      false,
      `rollback returning ${label} is recorded as NOT rolled back`
    );
    t.eq(
      result.message,
      SURVEY_SHARE_FAILED_MESSAGE,
      `rollback returning ${label} still shows the user the failure`
    );
  }

  /* ── 9. the card's read ───────────────────────────────────────────── */
  t.group('survey share — the card read');

  const shareRead = {
    survey_id: SURVEY,
    shared_by: USER,
    shared_at: '2026-11-03T18:00:00.000Z',
    sv_surveys: {
      id: SURVEY,
      title: 'Spring season feedback',
      closes_at: '2026-11-30T23:59:59.000Z',
      status: 'open',
      public_slug: 'spring-feedback',
    },
  };
  client = stub.createStubClient({
    'sv_chat_shares.select': { data: shareRead, error: null },
  });
  stub.setClient(client);
  const card = await fetchSurveyShare(MESSAGE);

  t.eq(card.surveyId, SURVEY, 'the card gets the survey id');
  t.eq(card.sharedBy, USER, 'the card reads shared_by (NOT posted_by)');
  t.eq(
    card.sharedAt,
    '2026-11-03T18:00:00.000Z',
    'the card reads shared_at (NOT created_at)'
  );
  t.eq(card.title, 'Spring season feedback', 'the survey title comes through');
  t.eq(card.closesAt, '2026-11-30T23:59:59.000Z', 'the deadline comes through');
  t.eq(card.status, 'open', 'the status comes through');
  t.eq(card.publicSlug, 'spring-feedback', 'the slug comes through');

  const selectArg = client.firstArgsOf('sv_chat_shares', 'select');
  ['survey_id', 'shared_by', 'shared_at'].forEach((col) => {
    t.ok(selectArg.includes(col), `the select asks for '${col}'`);
  });
  ['posted_by', 'created_at', 'profiles'].forEach((gone) => {
    t.ok(
      !selectArg.includes(gone),
      `the select does NOT ask for '${gone}' — one bad name fails the WHOLE select`
    );
  });
  t.ok(
    selectArg.includes('sv_surveys!inner'),
    'the survey is an INNER join — a share whose survey the viewer cannot read resolves to nothing'
  );
  const readOps = client.opsOn('sv_chat_shares')[0];
  t.deepEq(
    readOps,
    ['select', 'eq', 'maybeSingle'],
    'the read is scoped by message_id and tolerates no row (maybeSingle, not single)'
  );
  t.deepEq(
    client.calls[0].ops.find((o) => o.op === 'eq').args,
    ['message_id', MESSAGE],
    'scoped by message_id — which is how a WEB share renders on mobile'
  );

  /* ── 10. the card read degrades ───────────────────────────────────── */
  t.group('survey share — the card read degrades');

  for (const [label, plan] of [
    ['an error', { data: null, error: { code: '42501' } }],
    ['no row', { data: null, error: null }],
  ]) {
    client = stub.createStubClient({ 'sv_chat_shares.select': plan });
    stub.setClient(client);
    t.eq(
      await fetchSurveyShare(MESSAGE),
      null,
      `${label} → null, so the card renders nothing rather than a half card`
    );
  }

  client = stub.createStubClient({
    'sv_chat_shares.select': {
      data: { survey_id: SURVEY, shared_by: null, shared_at: null },
      error: null,
    },
  });
  stub.setClient(client);
  const bare = await fetchSurveyShare(MESSAGE);
  t.eq(bare.surveyId, SURVEY, 'a row with no survey embed still carries its id');
  t.eq(bare.title, null, 'and a null title, for the caller to default');
  t.eq(bare.sharedBy, null, 'and a null sharer, so no name is looked up');
  t.eq(bare.sharedAt, null, 'and a null date, so no `NaNd ago` is rendered');
}

module.exports = { title: 'survey share — sv_chat_shares contract', run };
