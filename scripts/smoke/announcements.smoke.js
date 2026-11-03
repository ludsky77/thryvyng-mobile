/**
 * CLUB ANNOUNCEMENTS — the client/server contract in `lib/clubAnnouncementCards.ts`.
 *
 * THIS IS THE HARNESS THAT KEPT GETTING THROWN AWAY. Two passes built it in a
 * scratchpad and lost it; the second had to rebuild the first's 38 cases from
 * the prose in `docs/recon/club-announcements-v1-mobile.md` § 6. The coverage
 * below is that document's ten groups, rebuilt against the committed module —
 * title split, compose round trip, the action allow-list, the jsonb builder,
 * the contract-missing codes, the refusal ladder, the queries built, the
 * title-required rule, the full error map, and the migration's limits.
 *
 * EVERY LIMIT AND SENTINEL IS THE SERVER'S. They were read out of
 * `thrive-and-score/supabase/migrations/20261103031500_club_announcements_v1.sql`
 * (BUILT, UNAPPLIED as of 2026-11-03) and are asserted here so a change on one
 * side cannot pass unnoticed on the other. Nothing here enforces anything —
 * the server refuses; this only decides what compose will let someone TRY.
 */
'use strict';

const CHANNEL = 'b0000000-0000-4000-8000-000000000001';

/** Every HINT sentinel `post_club_announcement` raises, in the order it checks. */
const HINTS = [
  'not_signed_in',
  'channel_not_found',
  'not_channel_staff',
  'not_club_announcements',
  'channel_archived',
  'title_invalid',
  'body_invalid',
  'actions_not_array',
  'too_many_actions',
  'action_invalid',
  'action_kind_invalid',
  'action_card_key_invalid',
  'action_target_invalid',
  'action_label_invalid',
];

/** The ERRCODEs that mean "the server decided no". */
const REFUSAL_CODES = ['P0070', 'P0071', 'P0072', 'P0073', 'P0074', 'P0001', '42501'];

/** The codes that mean "the agreed object is not there yet". */
const MISSING_CODES = ['42703', '42P01', '42883', 'PGRST202', 'PGRST204', 'PGRST205'];

async function run(t, env) {
  const { announcements: A, cardKey, stub } = env;

  /* ── 1. the migration's limits ────────────────────────────────────── */
  t.group('announcement limits');

  t.eq(A.ANNOUNCEMENT_TITLE_MAX, 80, 'title ceiling is 80 (the column CHECK)');
  t.eq(A.ANNOUNCEMENT_TITLE_MIN, 1, 'a title is REQUIRED — 1 char after trim');
  t.eq(A.ANNOUNCEMENT_BODY_MAX, 4000, 'body ceiling is 4000 (p_body)');
  t.eq(
    A.ANNOUNCEMENT_ACTION_LABEL_MAX,
    40,
    'label ceiling is 40 (comm_message_actions_label_check)'
  );
  t.eq(A.ANNOUNCEMENT_MAX_ACTIONS, 3, 'at most 3 buttons (jsonb_array_length)');
  t.eq(
    A.ANNOUNCEMENT_PREVIEW_CHARS,
    A.ANNOUNCEMENT_TITLE_MAX,
    'a derived headline occupies the same space as a real title'
  );
  t.deepEq(
    [...A.ANNOUNCEMENT_ACTION_KINDS],
    ['playbook', 'playbook_card', 'courses'],
    'the kind list equals the CHECK constraint, in order'
  );
  t.deepEq(
    Object.keys(A.ANNOUNCEMENT_ACTION_LABELS).sort(),
    ['courses', 'playbook', 'playbook_card'],
    'every kind has a default label'
  );

  /* ── 2. the action allow-list ─────────────────────────────────────── */
  t.group('action allow-list');

  t.ok(A.isAnnouncementActionKind('playbook'), "'playbook' is a kind");
  t.ok(A.isAnnouncementActionKind('playbook_card'), "'playbook_card' is a kind");
  t.ok(A.isAnnouncementActionKind('courses'), "'courses' is a kind");
  t.ok(!A.isAnnouncementActionKind('calendar'), "'calendar' is NOT in v1");
  t.ok(!A.isAnnouncementActionKind(''), 'the empty string is not a kind');
  t.ok(!A.isAnnouncementActionKind(null), 'null is not a kind');
  t.ok(!A.isAnnouncementActionKind(7), 'a number is not a kind');

  t.ok(
    A.isSendableAction({ kind: 'playbook', label: 'Open the Playbook' }),
    'a playbook button with a label is sendable'
  );
  t.ok(
    !A.isSendableAction({ kind: 'playbook', label: '   ' }),
    'a blank label is not sendable (label_check is 1-40 AFTER trim)'
  );
  t.ok(
    !A.isSendableAction({ kind: 'playbook', label: null }),
    'a null label is not sendable'
  );
  t.ok(
    A.isSendableAction({ kind: 'playbook', label: 'x'.repeat(40) }),
    'a 40-char label is sendable'
  );
  t.ok(
    !A.isSendableAction({ kind: 'playbook', label: 'x'.repeat(41) }),
    'a 41-char label is DROPPED here, not refused by the server'
  );
  t.ok(
    A.isSendableAction({ kind: 'playbook_card', target: 'P7', label: 'Open' }),
    'a playbook_card with a key-shaped target is sendable'
  );
  t.ok(
    !A.isSendableAction({ kind: 'playbook_card', target: null, label: 'Open' }),
    'a playbook_card with NO target is not sendable'
  );
  t.ok(
    !A.isSendableAction({ kind: 'playbook_card', target: '../etc', label: 'Open' }),
    'a playbook_card whose target is not key-SHAPED is not sendable'
  );
  t.ok(
    A.isSendableAction({ kind: 'courses', target: 'P7', label: 'Open Courses' }),
    'a stray target does NOT kill a courses button — the builder nulls it'
  );

  /* ── 3. the card key pattern ──────────────────────────────────────── */
  t.group('card key');

  ['F0', 'P19', 'MV2', 'GF7', 'SET', 'HUNT', 'HOLD', 'STORM', 'a-b_C9'].forEach(
    (key) => t.ok(cardKey.isAnnounceCardKey(key), `'${key}' is key-shaped`)
  );
  ['', 'a/b', 'a b', 'a.b', "a'b", 'ñ', 'x'.repeat(17), null, 7].forEach((bad) =>
    t.ok(
      !cardKey.isAnnounceCardKey(bad),
      `${JSON.stringify(bad)} is NOT key-shaped`
    )
  );
  t.ok(cardKey.isAnnounceCardKey('x'.repeat(16)), '16 chars is the ceiling, inclusive');

  /* ── 4. the jsonb builder ─────────────────────────────────────────── */
  t.group('actions payload');

  t.deepEq(
    A.buildAnnouncementActionsPayload([
      { kind: 'playbook', label: '  Open the Playbook  ' },
      { kind: 'playbook_card', target: 'P7', label: '  Open this card  ' },
      { kind: 'courses', target: 'P7', label: 'Open Courses' },
    ]),
    [
      { kind: 'playbook', target: null, label: 'Open the Playbook', sort_order: 0 },
      { kind: 'playbook_card', target: 'P7', label: 'Open this card', sort_order: 1 },
      { kind: 'courses', target: null, label: 'Open Courses', sort_order: 2 },
    ],
    'labels are trimmed, targets nulled off playbook_card, sort_order 0..n'
  );

  /*
   * FOUND, 2026-11-03, BY THIS ASSERTION — reported, NOT fixed (outside the
   * SURVEY-SHARE-FIX-MOBILE scope). `isSendableAction` tests the card key
   * UNTRIMMED, while `buildAnnouncementActionsPayload` trims it and
   * `ComposeAnnouncementScreen.tsx:380` trims it for the inline "bad key"
   * warning. So a key with a trailing space — `'P7 '` — shows NO warning next
   * to the field, yet counts as an incomplete action, and `canSend`
   * (`:179`, `incompleteActions === 0`) goes DOWN with nothing on screen
   * saying why. The two assertions below pin the behaviour as it is today, so
   * a fix flips them deliberately rather than by accident.
   */
  t.ok(
    !A.isSendableAction({ kind: 'playbook_card', target: 'P7 ', label: 'Open' }),
    "FOUND: a card key with a trailing space is NOT sendable (untrimmed test) — compose's own warning trims and stays silent"
  );
  t.deepEq(
    A.buildAnnouncementActionsPayload([
      { kind: 'playbook_card', target: ' P7 ', label: 'Open this card' },
    ]),
    [],
    'FOUND: and the builder therefore drops it, although its own map would have trimmed it'
  );
  t.eq(
    A.buildAnnouncementActionsPayload([
      { kind: 'playbook', label: 'a' },
      { kind: 'playbook', label: 'b' },
      { kind: 'playbook', label: 'c' },
      { kind: 'playbook', label: 'd' },
    ]).length,
    3,
    'a fourth button is sliced off before the server can refuse the whole post'
  );
  t.deepEq(
    A.buildAnnouncementActionsPayload([
      { kind: 'playbook', label: '' },
      { kind: 'courses', label: 'Open Courses' },
    ]),
    [{ kind: 'courses', target: null, label: 'Open Courses', sort_order: 0 }],
    'a dropped row leaves NO gap in sort_order'
  );
  t.deepEq(A.buildAnnouncementActionsPayload([]), [], 'no buttons is an empty array');

  /* ── 5. title / body split ────────────────────────────────────────── */
  t.group('title split');

  t.deepEq(
    A.splitAnnouncement({ title: 'Kit pickup', content: 'Kit pickup\n\nSaturday 9am' }),
    { cardTitle: 'Kit pickup', hasTitle: true, body: 'Saturday 9am' },
    'a titled row strips the title prefix from the body'
  );
  t.deepEq(
    A.splitAnnouncement({ title: 'Kit pickup', content: 'Saturday 9am' }),
    { cardTitle: 'Kit pickup', hasTitle: true, body: 'Saturday 9am' },
    'a content that does NOT start with its title keeps its whole body'
  );
  t.deepEq(
    A.splitAnnouncement({ title: 'Kit pickup', content: 'Kit pickup' }),
    { cardTitle: 'Kit pickup', hasTitle: true, body: '' },
    'content identical to the title leaves an empty body, not a repeat'
  );
  t.eq(
    A.splitAnnouncement({ title: null, content: 'Saturday 9am' }).hasTitle,
    false,
    'an untitled row reports hasTitle false'
  );
  t.eq(
    A.splitAnnouncement({ title: '   ', content: 'Saturday 9am' }).hasTitle,
    false,
    'a whitespace title is no title'
  );
  t.eq(
    A.splitAnnouncement({ title: null, content: 'Saturday 9am' }).cardTitle,
    'Saturday 9am',
    'an untitled row derives its headline from the content'
  );
  t.eq(
    A.splitAnnouncement({ title: null, content: null }).cardTitle,
    '(no message)',
    'an empty row still has a headline'
  );
  t.eq(
    A.splitAnnouncement({ title: '  Kit pickup  ', content: 'x' }).cardTitle,
    'Kit pickup',
    'the title is trimmed'
  );
  t.eq(
    A.splitAnnouncement({ title: 'x'.repeat(80), content: 'x'.repeat(80) }).cardTitle
      .length,
    80,
    'an 80-char title survives whole'
  );

  t.group('preview');
  t.eq(
    A.announcementPreview('a\nb   c'),
    'a b c',
    'a preview is one line with runs of whitespace collapsed'
  );
  t.eq(A.announcementPreview(''), '(no message)', 'an empty preview is the placeholder');
  t.eq(A.announcementPreview(null), '(no message)', 'a null preview is the placeholder');
  t.eq(A.announcementPreview('x'.repeat(80)).length, 80, '80 chars is kept whole');
  t.eq(
    A.announcementPreview('x'.repeat(81)),
    `${'x'.repeat(79)}…`,
    '81 chars is cut to 79 plus an ellipsis — 80 cells either way'
  );

  t.group('compose round trip');
  t.eq(
    A.composeAnnouncementContent('Kit pickup', 'Saturday 9am'),
    'Kit pickup\n\nSaturday 9am',
    'the preview content is title + blank line + body'
  );
  t.eq(A.composeAnnouncementContent('', 'Saturday 9am'), 'Saturday 9am', 'no title, no prefix');
  t.eq(A.composeAnnouncementContent('Kit pickup', ''), 'Kit pickup', 'no body, no separator');
  t.deepEq(
    A.splitAnnouncement({
      title: 'Kit pickup',
      content: A.composeAnnouncementContent('Kit pickup', 'Saturday 9am'),
    }),
    { cardTitle: 'Kit pickup', hasTitle: true, body: 'Saturday 9am' },
    'what compose previews is what the feed splits back apart — the one way they cannot disagree'
  );
  t.eq(
    A.composeAnnouncementContent('  Kit pickup  ', '  Saturday 9am  '),
    'Kit pickup\n\nSaturday 9am',
    'both halves are trimmed before they are joined'
  );

  /* ── 6. contract-missing codes ────────────────────────────────────── */
  t.group('contract missing');

  MISSING_CODES.forEach((code) =>
    t.ok(
      A.isAnnouncementContractMissing({ code }),
      `${code} means the server side is not applied yet`
    )
  );
  ['42501', 'P0072', '23514', '500', ''].forEach((code) =>
    t.ok(
      !A.isAnnouncementContractMissing({ code }),
      `${JSON.stringify(code)} is NOT "being set up"`
    )
  );
  t.ok(!A.isAnnouncementContractMissing(null), 'no error is not "being set up"');
  t.ok(
    !A.isAnnouncementContractMissing({ message: 'Network request failed' }),
    'offline is NOT "being set up" — that was the exact mistake to avoid'
  );

  /* ── 7. the refusal map, every sentinel ───────────────────────────── */
  t.group('refusal copy');

  t.eq(
    A.describePostAnnouncementFailure({ message: 'The server said this' }),
    'The server said this',
    "the server's own sentence wins over every constant here"
  );
  t.eq(
    A.describePostAnnouncementFailure({ message: '   ', hint: 'title_invalid' }),
    A.POST_ANNOUNCEMENT_TITLE_INVALID_MESSAGE,
    'a blank message falls through to the hint'
  );

  const seen = new Set();
  HINTS.forEach((hint) => {
    const sentence = A.describePostAnnouncementFailure({ hint });
    t.ok(
      sentence !== A.POST_ANNOUNCEMENT_FAILED_MESSAGE,
      `hint '${hint}' has a sentence of its own, not the generic line`
    );
    t.ok(!seen.has(sentence), `hint '${hint}' does not reuse another hint's sentence`);
    seen.add(sentence);
  });
  t.eq(seen.size, HINTS.length, `all ${HINTS.length} sentinels map to distinct sentences`);

  t.eq(
    A.describePostAnnouncementFailure({ hint: 'a_sentinel_added_later' }),
    A.POST_ANNOUNCEMENT_FAILED_MESSAGE,
    'an unknown hint with no message falls to the generic line'
  );
  t.eq(
    A.describePostAnnouncementFailure(null),
    A.POST_ANNOUNCEMENT_FAILED_MESSAGE,
    'no error at all falls to the generic line'
  );
  t.eq(
    A.POST_ANNOUNCEMENT_REFUSED_MESSAGE,
    A.describePostAnnouncementFailure({ hint: 'not_channel_staff' }),
    'the exported "refused" constant IS the not_channel_staff sentence'
  );
  t.ok(
    A.POST_ANNOUNCEMENT_TITLE_INVALID_MESSAGE.includes('80'),
    'the title sentence names the real ceiling'
  );
  t.ok(
    A.POST_ANNOUNCEMENT_BODY_INVALID_MESSAGE.includes('4000'),
    'the body sentence names the real ceiling'
  );

  t.group('refusal detection');
  REFUSAL_CODES.forEach((code) =>
    t.ok(A.isPostAnnouncementRefusal({ code }), `${code} alone is a refusal`)
  );
  t.ok(
    A.isPostAnnouncementRefusal({ hint: 'a_sentinel_added_later' }),
    'ANY hint is a refusal — a dropped request carries none'
  );
  t.ok(!A.isPostAnnouncementRefusal(null), 'no error is no refusal');
  t.ok(
    !A.isPostAnnouncementRefusal({ message: 'Network request failed' }),
    'offline is not a refusal'
  );
  t.ok(
    !A.isPostAnnouncementRefusal({ code: '23514' }),
    'a CHECK violation is not one of the function`s refusals'
  );

  /* ── 8. the one write ─────────────────────────────────────────────── */
  t.group('post_club_announcement');

  let client = stub.createStubClient({
    'rpc.post_club_announcement': { data: 'msg-1', error: null },
  });
  stub.setClient(client);
  let result = await A.postClubAnnouncement({
    channelId: CHANNEL,
    title: '  Kit pickup  ',
    body: '  Saturday 9am  ',
    actions: [{ kind: 'playbook', label: 'Open the Playbook' }],
  });

  t.eq(result.status, 'ok', 'a clean call is ok');
  t.eq(result.messageId, 'msg-1', 'and returns the new message id');
  const sent = client.rpcCalls('post_club_announcement')[0];
  t.eq(client.calls.length, 1, 'ONE call — title, body and buttons go together');
  t.deepEq(
    Object.keys(sent.args).sort(),
    ['p_actions', 'p_body', 'p_channel_id', 'p_title'],
    'exactly the four arguments the RPC declares'
  );
  t.eq(sent.args.p_title, 'Kit pickup', 'p_title is trimmed');
  t.eq(sent.args.p_body, 'Saturday 9am', 'p_body is trimmed');
  t.deepEq(
    sent.args.p_actions,
    [{ kind: 'playbook', target: null, label: 'Open the Playbook', sort_order: 0 }],
    'p_actions is the built payload, never the raw input'
  );

  t.group('post — p_title is never null');
  for (const title of ['', '   ']) {
    client = stub.createStubClient({
      'rpc.post_club_announcement': { data: 'msg-1', error: null },
    });
    stub.setClient(client);
    await A.postClubAnnouncement({ channelId: CHANNEL, title, body: 'b', actions: [] });
    const args = client.rpcCalls('post_club_announcement')[0].args;
    t.eq(
      args.p_title,
      '',
      `a ${JSON.stringify(title)} title sends '' — NEVER null, which the RPC has no branch for`
    );
    t.eq(typeof args.p_title, 'string', 'p_title is always a string');
  }
  client = stub.createStubClient({
    'rpc.post_club_announcement': { data: 'msg-1', error: null },
  });
  stub.setClient(client);
  await A.postClubAnnouncement({
    channelId: CHANNEL,
    title: 'x'.repeat(80),
    body: 'b',
    actions: [],
  });
  t.eq(
    client.rpcCalls('post_club_announcement')[0].args.p_title.length,
    80,
    'an 80-char title reaches the server whole'
  );

  t.group('post — the result ladder');
  const cases = [
    ['42883', { code: '42883' }, 'setup_pending'],
    ['PGRST202', { code: 'PGRST202' }, 'setup_pending'],
    ['P0072 refusal', { code: 'P0072', hint: 'not_channel_staff' }, 'refused'],
    ['42501 RLS', { code: '42501' }, 'refused'],
    ['a hint alone', { hint: 'title_invalid' }, 'refused'],
    ['offline', { message: 'Network request failed' }, 'error'],
    ['a bare 500', { code: '500' }, 'error'],
  ];
  for (const [label, error, expected] of cases) {
    client = stub.createStubClient({
      'rpc.post_club_announcement': { data: null, error },
    });
    stub.setClient(client);
    result = await A.postClubAnnouncement({
      channelId: CHANNEL,
      title: 't',
      body: 'b',
      actions: [],
    });
    t.eq(result.status, expected, `${label} → ${expected}`);
  }
  client = stub.createStubClient({
    'rpc.post_club_announcement': {
      data: null,
      error: { code: 'P0073', hint: 'title_invalid', message: 'A title is required' },
    },
  });
  stub.setClient(client);
  result = await A.postClubAnnouncement({
    channelId: CHANNEL,
    title: 't',
    body: 'b',
    actions: [],
  });
  t.eq(
    result.message,
    'A title is required',
    "a refusal end to end carries the SERVER's sentence"
  );
  client = stub.createStubClient({
    'rpc.post_club_announcement': { data: null, error: null },
  });
  stub.setClient(client);
  result = await A.postClubAnnouncement({
    channelId: CHANNEL,
    title: 't',
    body: 'b',
    actions: [],
  });
  t.eq(result.status, 'ok', 'no error is ok even when the id did not come back');
  t.eq(result.messageId, null, 'and the id is null rather than undefined');

  /* ── 9. the queries built ─────────────────────────────────────────── */
  t.group('contract probe');

  client = stub.createStubClient({});
  stub.setClient(client);
  t.eq(
    (await A.checkAnnouncementContract(CHANNEL)).status,
    'ready',
    'both probes answering means ready'
  );
  t.deepEq(
    client.firstArgsOf('comm_messages', 'select'),
    'id, title',
    'the title probe names the column explicitly — select(*) could not tell a missing column from a null one'
  );
  t.deepEq(
    client.calls[0].ops.find((o) => o.op === 'eq').args,
    ['channel_id', CHANNEL],
    'the title probe is scoped to the channel, so the viewer`s own membership covers it'
  );
  t.eq(
    client.firstArgsOf('comm_message_actions', 'select'),
    'message_id',
    'the actions probe reads one column'
  );

  client = stub.createStubClient({
    'comm_messages.select': { data: null, error: { code: '42703' } },
  });
  stub.setClient(client);
  t.eq(
    (await A.checkAnnouncementContract(CHANNEL)).status,
    'pending',
    'a missing title column is pending'
  );
  t.eq(
    client.callsOn('comm_message_actions').length,
    0,
    'and the second probe is not even made'
  );

  client = stub.createStubClient({
    'comm_messages.select': { data: null, error: { code: '42501' } },
  });
  stub.setClient(client);
  t.eq(
    (await A.checkAnnouncementContract(CHANNEL)).status,
    'error',
    'an RLS refusal is error, NOT "being set up"'
  );

  client = stub.createStubClient({
    'comm_message_actions.select': { data: null, error: { code: '42P01' } },
  });
  stub.setClient(client);
  t.eq(
    (await A.checkAnnouncementContract(CHANNEL)).status,
    'pending',
    'a missing actions table is pending'
  );

  t.group('fetch actions');
  client = stub.createStubClient({});
  stub.setClient(client);
  let fetched = await A.fetchAnnouncementActions([]);
  t.eq(client.calls.length, 0, 'no ids means no query at all');
  t.eq(fetched.data.size, 0, 'and an empty map');
  t.eq(fetched.error, null, 'with no error');

  client = stub.createStubClient({
    'comm_message_actions.select': {
      data: [
        { message_id: 'm1', kind: 'playbook', target: null, label: ' Open ', sort_order: 0 },
        { message_id: 'm1', kind: 'playbook_card', target: 'P7', label: 'Card', sort_order: 1 },
        { message_id: 'm1', kind: 'playbook_card', target: '../x', label: 'Bad', sort_order: 2 },
        { message_id: 'm1', kind: 'calendar', target: null, label: 'Event', sort_order: 3 },
        { message_id: 'm1', kind: 'playbook', target: null, label: '  ', sort_order: 4 },
        { message_id: null, kind: 'playbook', target: null, label: 'Orphan', sort_order: 5 },
        { message_id: 'm2', kind: 'courses', target: null, label: 'Courses', sort_order: 0 },
      ],
      error: null,
    },
  });
  stub.setClient(client);
  fetched = await A.fetchAnnouncementActions(['m1', 'm2']);
  t.eq(
    client.firstArgsOf('comm_message_actions', 'select'),
    'message_id, kind, target, label, sort_order',
    'the actions read names all five columns'
  );
  t.deepEq(
    client.calls[0].ops.map((o) => o.op),
    ['select', 'in', 'order'],
    'scoped by message id and ordered by sort_order'
  );
  t.eq(fetched.data.get('m1').length, 2, 'an unknown kind, a bad key and a blank label are all DROPPED');
  t.eq(fetched.data.get('m1')[0].label, 'Open', 'labels are trimmed on the way in');
  t.eq(fetched.data.get('m1')[1].target, 'P7', 'a valid card key survives');
  t.eq(fetched.data.get('m2').length, 1, 'a second message gets its own list');
  t.eq(fetched.data.has('m3'), false, 'a message with no buttons is simply absent');
  t.eq(fetched.error, null, 'a clean read reports no error');

  client = stub.createStubClient({
    'comm_message_actions.select': { data: null, error: { code: '42501' } },
  });
  stub.setClient(client);
  fetched = await A.fetchAnnouncementActions(['m1']);
  t.eq(fetched.data.size, 0, 'a failed read returns an empty map');
  t.ok(
    fetched.error !== null,
    'AND the error — "no buttons" and "could not ask" must not render the same'
  );

  /* ── 10. the setup-pending copy ───────────────────────────────────── */
  t.group('setup pending copy');
  t.ok(
    A.ANNOUNCEMENTS_SETUP_PENDING_MESSAGE.length > 0,
    'the pending headline exists'
  );
  t.ok(
    A.ANNOUNCEMENTS_SETUP_PENDING_DETAIL.includes('not affected'),
    'the pending detail reassures that existing messages still work'
  );
}

module.exports = { title: 'club announcements — client/server contract', run };
