# Bug-Class Sweep — route.params paint-hints · single-row queries · fallback literals
**Date:** 2026-10-02 · **Mode:** read-only recon, no code changed
**Scope:** `src/**`
**References:** Class 1 fix = commit `7cd8db9` (EventDetailScreen `route.params.event`).
Class 2 fix = commit `a205bbb` (count-based staff check in EventDetailScreen + ChannelPollsScreen).

## Headline

| Class | Found | Needs action |
|---|---|---|
| 1 — params paint-hints | 8 screens receive an entity object | **1 HIGH** (WellnessTopicScreen) |
| 2 — single-row queries | 127 call sites | **20 not guaranteed ≤1 row** (7 provable, 13 INFERRED) |
| Hygiene — fallback literals | 51 user-visible | 41 are identity-related |

**The single most actionable result:** the `team_staff` existence-check bug fixed in
`a205bbb` has **4 remaining instances**, all with byte-for-byte the same shape and
the same consequence — staff UI silently stripped from the most senior staff.

---

## CLASS 1 — route.params paint-hints

### Method
Enumerated every `route.params` reader in `src/**` (62 sites), then kept only those
destructuring a **non-scalar** value. Screens taking ids, names, slugs, tokens or
flags cannot exhibit this class: the id *is* the fetch input. Confirmed the sender
side by grepping navigation calls for object-valued / shorthand props.

### Table

| Screen | Params key | Shape | Fetch runs anyway? | Risk |
|---|---|---|---|---|
| [WellnessTopicScreen.tsx:20](../../src/screens/WellnessTopicScreen.tsx#L20) | `topic` | full `WellnessTopic` entity | **NO — no fetch exists in the file at all** | **HIGH** |
| [EventDetailScreen.tsx:170](../../src/screens/EventDetailScreen.tsx#L170) | `event` | full `CalendarEvent` | **YES** — unconditional, `fetchEvent(true)` | LOW (fixed `7cd8db9`) |
| [InvitationQuestionsScreen.tsx:40](../../src/screens/invitation/InvitationQuestionsScreen.tsx#L40) | `selectedPlayers[]` | wizard carry | YES — `useInvitation(token)` [:43](../../src/screens/invitation/InvitationQuestionsScreen.tsx#L43) | LOW |
| [InvitationVolunteerScreen.tsx:34](../../src/screens/invitation/InvitationVolunteerScreen.tsx#L34) | `selectedPlayers[]`, `answers` | wizard carry | YES — [:36](../../src/screens/invitation/InvitationVolunteerScreen.tsx#L36) | LOW |
| [InvitationPaymentScreen.tsx:50](../../src/screens/invitation/InvitationPaymentScreen.tsx#L50) | `selectedPlayers[]` | wizard carry | YES — [:54](../../src/screens/invitation/InvitationPaymentScreen.tsx#L54) | LOW |
| [InvitationDonateScreen.tsx:43](../../src/screens/invitation/InvitationDonateScreen.tsx#L43) | `selectedPlayers[]`, `answers` | wizard carry | YES — [:52](../../src/screens/invitation/InvitationDonateScreen.tsx#L52) | LOW |
| [InvitationAidScreen.tsx:43](../../src/screens/invitation/InvitationAidScreen.tsx#L43) | `selectedPlayers[]`, `answers` | wizard carry | YES — [:54](../../src/screens/invitation/InvitationAidScreen.tsx#L54) | LOW |
| [InvitationCheckoutScreen.tsx:48](../../src/screens/invitation/InvitationCheckoutScreen.tsx#L48) | `selectedPlayers[]`, `answers` | wizard carry | YES — [:61](../../src/screens/invitation/InvitationCheckoutScreen.tsx#L61) | LOW |

### HIGH — WellnessTopicScreen

```
const { topicId, topicTitle, topic, colorGradient, playerId, userId } = route.params || {};
const topicData = topic as WellnessTopic | undefined;
...
if (!topicData) return <Text>Topic not found</Text>;     // :41-50
```

`grep -c "supabase\|fetch"` on this file returns **0**. The screen has no data
layer. `topicId` is passed but used *only* for view tracking
(`startView(topicId)`, [:27](../../src/screens/WellnessTopicScreen.tsx#L27)) — never to load the topic it renders.

This is Class 1 in a more severe form than the reference: EventDetailScreen at
least *had* a fetch to short-circuit. Here the entity exists only as a
navigation parameter.

Consequences:
- Any entry without the object renders a permanent "Topic not found".
- Content is whatever the list screen happened to hold — never refreshed.
- React Navigation state restoration after a cold start / OS process kill
  rehydrates params from serialized state; a dropped or stale `topic` object
  surfaces as the dead-end screen. **INFERRED** — depends on whether state
  persistence is enabled, not verified here.

**Mitigating:** `WellnessTopic` is **not** in [linking.ts](../../src/navigation/linking.ts) (no `Wellness` entry), and the
only navigation into it is [WellnessCategoryScreen.tsx:58](../../src/screens/WellnessCategoryScreen.tsx#L58), which always supplies
the object. So there is no deep-link or notification path today. The risk is
latent, not live — it becomes live the moment wellness gets a deep link.

### Checked and clear
- [WellnessCategoryScreen.tsx:36](../../src/screens/WellnessCategoryScreen.tsx#L36) — receives `categoryId` + presentational
  `colorGradient`; fetches via `fetchTopics(categoryId)` [:48-54](../../src/screens/WellnessCategoryScreen.tsx#L48-L54). Correct.
- [ProductDetailScreen.tsx:50](../../src/screens/ProductDetailScreen.tsx#L50) — reads `productId` only and fetches
  unconditionally [:61-63](../../src/screens/ProductDetailScreen.tsx#L61-L63). (`ProductStoreScreen:112` matched an early grep but is a
  `renderItem` destructure, not a navigate payload — false positive.)
- Survey screens ([SurveyListScreen:24](../../src/screens/SurveyListScreen.tsx#L24), [SurveyResponseScreen:22](../../src/screens/SurveyResponseScreen.tsx#L22),
  [SurveyResultsScreen:17](../../src/screens/SurveyResultsScreen.tsx#L17)) and [CreateEvaluationScreen:118](../../src/screens/CreateEvaluationScreen.tsx#L118) — param
  interfaces are scalars only.
- [TeamResourcesScreen.tsx:96-99](../../src/screens/TeamResourcesScreen.tsx#L96-L99) — `if (teamId) ... else if (playerId) resolve...`
  is the *shape* of Class 1 but the param is a scalar id, so no dependent state
  is missed. LOW.

### The pattern to copy
[EventDetailScreen.tsx:436-448](../../src/screens/EventDetailScreen.tsx#L436-L448) — seed then always fetch, with the comment that
names the failure mode:

> *"A navigated-in event object is a paint hint, NOT a substitute for the fetch:
> it carries no RSVP rows. The old code took this branch and never called
> fetchEvent(), so eventRsvps stayed [] for the life of the screen."*

```
if (eventParam) { setEvent(eventParam); fetchEvent(true); }  // silent refetch
else            { fetchEvent(); }
```

---

## CLASS 2 — `.single()` / `.maybeSingle()` on queries that can return >1 row

### Method
Extracted all 127 call sites with their table and preceding filters
(`.eq/.in/.is/.ilike/.limit`) by script, grouped by `(table, filters)`, then read
each non-PK site. A site is **guaranteed ≤1** when it filters on a primary key,
is an `.insert(...).select().single()` (one row in → one row out), or carries
`.limit(1)`.

### Totals

| Category | Count |
|---|---|
| `.eq('id', …)` on a primary key | 70 |
| `.insert(...).select().single()` | 22 |
| `.limit(1)` before `single`/`maybeSingle` | 5 |
| Non-PK, multi-row-capable, judged ≤1 | 10 |
| **Not guaranteed ≤1 — provable** | **7** |
| **Not guaranteed ≤1 — INFERRED** | **13** |
| **total** | **127** |

### 2a. NOT GUARANTEED — provable from code in this repo

| file:line | Query | ≤1 guaranteed? | Consequence |
|---|---|---|---|
| [ChatInfoScreen.tsx:89](../../src/screens/ChatInfoScreen.tsx#L89) | `team_staff` `.eq(team_id).eq(user_id).maybeSingle()` → `setIsStaffInTeam(!!data)` | **NO** | staff UI lost for multi-role staff |
| [PollDetailScreen.tsx:166](../../src/screens/PollDetailScreen.tsx#L166) | `team_staff` `.eq(team_id).eq(user_id).maybeSingle()` → `if (staffRow) staffFound = true` | **NO** | poll management lost |
| [RosterScreen.tsx:107](../../src/screens/RosterScreen.tsx#L107) | `team_staff` `.eq(team_id).eq(user_id).maybeSingle()` → `setIsStaffInTeam(!!data)` | **NO** | roster admin lost |
| [TeamDetailScreen.tsx:96](../../src/screens/TeamDetailScreen.tsx#L96) | `team_staff` `.eq(team_id).eq(user_id).maybeSingle()` → `.then(({ data }) => setIsStaffInTeam(!!data))` | **NO** | staff UI lost; **`error` not even destructured** |
| [useCalendarEvents.ts:247](../../src/hooks/useCalendarEvents.ts#L247) | `cal_event_rsvps` `.eq(event_id).eq(user_id).maybeSingle()` | **NO** | RSVP write path errors out on a duplicate row |
| [ChannelPollsScreen.tsx:244](../../src/screens/ChannelPollsScreen.tsx#L244) | `comm_poll_votes` `.eq(poll_id).eq(user_id).maybeSingle()` | **NO** | duplicate votes inserted |
| [ChatScreen.tsx:886](../../src/screens/ChatScreen.tsx#L886) | `club_staff` `.eq(user_id).maybeSingle()` | **NO** | club broadcast lost for multi-club staff |

#### Why these four `team_staff` sites are provable, not inferred
The repo states the premise twice, in the two files `a205bbb` fixed —
[EventDetailScreen.tsx:200-202](../../src/screens/EventDetailScreen.tsx#L200-L202) and [ChannelPollsScreen.tsx:83-86](../../src/screens/ChannelPollsScreen.tsx#L83-L86):

> *"Existence check, not a row fetch: a user can hold several team_staff rows on
> one team (e.g. Head Coach + Team Manager), and maybeSingle() errors on 2+ rows
> — which silently stripped staff UI from exactly the most senior staff."*

All four remaining sites discard the row payload and coerce to a boolean, so each
one **wants** a count and does a row fetch instead. The fixed form:
```
const { count, error } = await supabase
  .from('team_staff').select('id', { count: 'exact', head: true })
  .eq('team_id', …).eq('user_id', …);
setIsStaffInTeam((count ?? 0) > 0);
```

#### Why `cal_event_rsvps` is provable
Two sibling write paths on the **same table with the same two filters** were
deliberately hardened, each carrying a comment that duplicates exist:
- [EventDetailScreen.tsx:606-613](../../src/screens/EventDetailScreen.tsx#L606-L613) — *"limit(1) rather than maybeSingle(): a
  duplicate row must not error the whole response out."*
- [CalendarScreen.tsx:317-323](../../src/screens/CalendarScreen.tsx#L317-L323) — *"limit(1), not maybeSingle(): a duplicate row
  must not error the answer out."*

[useCalendarEvents.ts:247](../../src/hooks/useCalendarEvents.ts#L247) is the **third** RSVP write path and still uses
`.maybeSingle()`. By the project's own documented premise it is the same bug.

#### Why `comm_poll_votes` is provable
`comm_poll_votes` carries a `rank` column ([usePolls.ts:32](../../src/hooks/usePolls.ts#L32)) and poll types include
`'multiple'` and `'ranked'` ([usePolls.ts:164](../../src/hooks/usePolls.ts#L164)). One user legitimately holds
**several** vote rows for one poll. [ChannelPollsScreen.tsx:244](../../src/screens/ChannelPollsScreen.tsx#L244) uses
`.maybeSingle()` as an upsert guard: on 2+ rows it errors, `existingVote` is
null, and the code takes the insert branch — **adding another duplicate** rather
than updating. Same file as the `a205bbb` fix; the fix was scoped to the staff
check only.

### 2b. NOT GUARANTEED — INFERRED (needs schema/constraint confirmation)

| file:line | Query | Why >1 is possible |
|---|---|---|
| [CreateEvaluationScreen.tsx:299](../../src/screens/CreateEvaluationScreen.tsx#L299) | `user_roles` `.eq(role,'player').eq(entity_id, playerId)` | two users can hold the player role on one player (co-claim, stale row) |
| [ProgramRegistrationScreen.tsx:778](../../src/screens/registration/ProgramRegistrationScreen.tsx#L778) | `program_registrations` `.eq(program_id).eq(player_id)` | re-registration after cancel → 2 rows. **Touches money** |
| [EventDetailScreen.tsx:249](../../src/screens/EventDetailScreen.tsx#L249) | `lineup_formations` `.eq(event_id).eq(status,'published')` | nothing prevents two published lineups on one event |
| [JoinTeamScreen.tsx:917](../../src/screens/registration/JoinTeamScreen.tsx#L917) | `team_staff` `.eq(team_id).ilike(email).is(user_id,null)` | two unclaimed invites, same email, same team |
| [WelcomeScreen.tsx:88](../../src/screens/WelcomeScreen.tsx#L88) | `teams` `.ilike('invitation_code', …).single()` | `ilike` matches more than a case-sensitive unique index would |
| [CourseDetailScreen.tsx:176](../../src/screens/CourseDetailScreen.tsx#L176) | `course_enrollments` `.eq(user_id).eq(course_id)` | re-enrollment |
| [useWellness.ts:25](../../src/hooks/useWellness.ts#L25) | `wellness_disclaimer_acceptances` `.eq(user_id)` | reads like an append-only acceptance log |
| [InviteCoParentModal.tsx:92](../../src/components/InviteCoParentModal.tsx#L92) | `coparent_invitations` `.eq(player_id).eq(invitee_email).eq(status)` | repeat invite |
| [CalendarSyncModal.tsx:46](../../src/components/calendar/CalendarSyncModal.tsx#L46) | `calendar_sync_tokens` `.eq(user_id).eq(is_active)` | two active tokens |
| [useCognitiveGames.ts:67](../../src/hooks/useCognitiveGames.ts#L67) | `daily_game_time` `.eq(player_id).eq(date)` | needs a composite unique |
| [useGameSession.ts:134](../../src/hooks/useGameSession.ts#L134) | `daily_game_time` `.eq(player_id).eq(date)` | same |
| [useGameSession.ts:83](../../src/hooks/useGameSession.ts#L83) | `player_game_progress` `.eq(player_id).eq(game_id)` | needs a composite unique |
| [GameEntryButton.tsx:63](../../src/components/game-stats/GameEntryButton.tsx#L63) | `game_sessions` `.eq(event_id)` | a replayed/abandoned session leaves a second row |

### 2c. Judged ≤1 (non-PK but constrained by intent)
[ChatInfoScreen.tsx:137](../../src/screens/ChatInfoScreen.tsx#L137) `comm_channel_members` (channel_id,user_id) ·
[SurveyChatCard.tsx:64](../../src/components/chat/SurveyChatCard.tsx#L64) `sv_chat_shares` (message_id) ·
[SurveyChatCard.tsx:89](../../src/components/chat/SurveyChatCard.tsx#L89) `sv_distributions` (survey_id,user_id) ·
[SurveyResponseScreen.tsx:121](../../src/screens/SurveyResponseScreen.tsx#L121) `sv_surveys` (public_slug,status) ·
[NotificationSettingsScreen.tsx:64](../../src/screens/NotificationSettingsScreen.tsx#L64) `notification_preferences` (user_id) — also
the one site that correctly tolerates **0** rows by whitelisting `PGRST116` ·
`program_additional_settings` (program_id) × 3 —
[useInvitation.ts:120](../../src/hooks/useInvitation.ts#L120), [useFamilyInvitations.ts:171](../../src/hooks/useFamilyInvitations.ts#L171),
[ProgramRegistrationScreen.tsx:229](../../src/screens/registration/ProgramRegistrationScreen.tsx#L229) · `player_placements`
(invitation_token) × 3 — [useInvitation.ts:39](../../src/hooks/useInvitation.ts#L39),
[useFamilyInvitations.ts:58](../../src/hooks/useFamilyInvitations.ts#L58), [FamilyCheckoutContext.tsx:116](../../src/contexts/FamilyCheckoutContext.tsx#L116).

### 2d. `.limit(1)`-guarded — safe from this class
[TeamResourcesScreen.tsx:157](../../src/screens/TeamResourcesScreen.tsx#L157) · [ChatScreen.tsx:970](../../src/screens/ChatScreen.tsx#L970) ·
[ParentPaymentsScreen.tsx:818](../../src/screens/parent/ParentPaymentsScreen.tsx#L818) · [ApplyScholarshipModal.tsx:120](../../src/screens/parent/ApplyScholarshipModal.tsx#L120) ·
[SurveyResponseScreen.tsx:250](../../src/screens/SurveyResponseScreen.tsx#L250).

> **Separate defect at [ChatScreen.tsx:970](../../src/screens/ChatScreen.tsx#L970):** `comm_channels.eq('channel_type','broadcast').limit(1)`
> has **no club or team filter**. `limit(1)` stops it erroring but it selects an
> arbitrary broadcast channel from the whole table. Not Class 2 — a correctness
> bug that `limit(1)` is masking.

---

## HYGIENE — user-visible fallback literals

**51 user-visible literals** (49 single-quoted + 2 as JSX text). Two further
`"Unknown"` occurrences — [GroupInfoScreen.tsx:78](../../src/screens/GroupInfoScreen.tsx#L78) and
[useChatSenderLabels.ts:31](../../src/hooks/useChatSenderLabels.ts#L31) — are inside comments and are excluded.

### Identity fallbacks (41) — overlaps `identity-resolution-oct02.md`

| Literal | file:line |
|---|---|
| `'Unknown'` | [PollCard.tsx:94](../../src/components/chat/PollCard.tsx#L94) · [ReactionDetailsModal.tsx:76](../../src/components/chat/ReactionDetailsModal.tsx#L76) · [useBoardVoteView.ts:114](../../src/hooks/useBoardVoteView.ts#L114) · [ChannelPollsScreen.tsx:150](../../src/screens/ChannelPollsScreen.tsx#L150) · [ChannelPollsScreen.tsx:211](../../src/screens/ChannelPollsScreen.tsx#L211) · [ChatInfoScreen.tsx:236](../../src/screens/ChatInfoScreen.tsx#L236) · [DMChatScreen.tsx:336](../../src/screens/DMChatScreen.tsx#L336) · [DMChatScreen.tsx:366](../../src/screens/DMChatScreen.tsx#L366) · [DirectMessagesScreen.tsx:70](../../src/screens/DirectMessagesScreen.tsx#L70) · [DirectMessagesScreen.tsx:194](../../src/screens/DirectMessagesScreen.tsx#L194) · [EvaluationsScreen.tsx:74](../../src/screens/EvaluationsScreen.tsx#L74) · [StaffMessageScreen.tsx:86](../../src/screens/StaffMessageScreen.tsx#L86) · [TeamChatRoomScreen.tsx:432](../../src/screens/TeamChatRoomScreen.tsx#L432) · [TeamChatRoomScreen.tsx:448](../../src/screens/TeamChatRoomScreen.tsx#L448) · [TeamChatRoomScreen.tsx:549](../../src/screens/TeamChatRoomScreen.tsx#L549) · [TeamDetailScreen.tsx:237](../../src/screens/TeamDetailScreen.tsx#L237) · [TeamStaffScreen.tsx:188](../../src/screens/TeamStaffScreen.tsx#L188) · [WorldCupPredictorScreen.tsx:177](../../src/screens/WorldCupPredictorScreen.tsx#L177) · [WorldCupPredictorScreen.tsx:179](../../src/screens/WorldCupPredictorScreen.tsx#L179) · [LineupEditorScreen.tsx:38](../../src/screens/lineup/LineupEditorScreen.tsx#L38) |
| `'Anonymous'` | [PollDetailScreen.tsx:342](../../src/screens/PollDetailScreen.tsx#L342) *(resolution failure)* |
| `Anonymous` (JSX) | [PollDetailScreen.tsx:386](../../src/screens/PollDetailScreen.tsx#L386) · [PollCard.tsx:408](../../src/components/chat/PollCard.tsx#L408) *(intended privacy)* |
| `'Unknown Player'` | [EvaluationDetailScreen.tsx:607](../../src/screens/EvaluationDetailScreen.tsx#L607) · [PlayerEvaluationsScreen.tsx:79](../../src/screens/PlayerEvaluationsScreen.tsx#L79) · [TeamCertificatesScreen.tsx:76](../../src/screens/TeamCertificatesScreen.tsx#L76) |
| `'Unknown User'` | [ChatScreen.tsx:338](../../src/screens/ChatScreen.tsx#L338) |
| `'Unknown Coach'` | [CoachActivityCard.tsx:56](../../src/components/training/CoachActivityCard.tsx#L56) |
| `'Team member'` | [EventDetailScreen.tsx:507](../../src/screens/EventDetailScreen.tsx#L507) |
| `'Someone'` | [useTypingPresence.ts:35](../../src/hooks/useTypingPresence.ts#L35) · [useTypingPresence.ts:105](../../src/hooks/useTypingPresence.ts#L105) |
| `'User'` | [MessageActionsModal.tsx:65](../../src/components/chat/MessageActionsModal.tsx#L65) · [ProfileScreen.tsx:160](../../src/screens/ProfileScreen.tsx#L160) |
| `'Coach'` | [CreateEvaluationScreen.tsx:232](../../src/screens/CreateEvaluationScreen.tsx#L232) · [:250](../../src/screens/CreateEvaluationScreen.tsx#L250) · [:568](../../src/screens/CreateEvaluationScreen.tsx#L568) · [TeamDetailScreen.tsx:69](../../src/screens/TeamDetailScreen.tsx#L69) · [LineupEditorScreen.tsx:563](../../src/screens/lineup/LineupEditorScreen.tsx#L563) |
| `'You'` | [useMessages.ts:338](../../src/hooks/useMessages.ts#L338) |
| `'this member'` | [GroupInfoScreen.tsx:245](../../src/screens/GroupInfoScreen.tsx#L245) |

### Non-identity (10) — same words, different meaning
| Literal | file:line | Meaning |
|---|---|---|
| `'Unknown'` | [AttendanceScreen.tsx:63](../../src/screens/AttendanceScreen.tsx#L63) | attendance status label for `maybe` |
| `'Unknown'` | [MyCoursesScreen.tsx:73](../../src/screens/MyCoursesScreen.tsx#L73) | course title |
| `'Unknown Course'` | [MyCoursesScreen.tsx:166](../../src/screens/MyCoursesScreen.tsx#L166) | course title |
| `'Unknown Team'` | [TeamsScreen.tsx:92](../../src/screens/TeamsScreen.tsx#L92) · [:130](../../src/screens/TeamsScreen.tsx#L130) | team name |
| `'Unknown error'` | [ChatInfoScreen.tsx:364](../../src/screens/ChatInfoScreen.tsx#L364) · [WorldCupPredictorScreen.tsx:938](../../src/screens/WorldCupPredictorScreen.tsx#L938) · [:1084](../../src/screens/WorldCupPredictorScreen.tsx#L1084) · [JoinStaffScreen.tsx:436](../../src/screens/registration/JoinStaffScreen.tsx#L436) · [RegisterTeamScreen.tsx:382](../../src/screens/registration/RegisterTeamScreen.tsx#L382) | error alert text |

### Plus ~35 bare `'?'` avatar-initial fallbacks across 20 files
`|| '?'` / `?? '?'` — the unlabelled form of the same failure. Highest
concentrations: [LiveSpectatorScreen.tsx](../../src/screens/game-stats/LiveSpectatorScreen.tsx) (5), [ChatScreen.tsx](../../src/screens/ChatScreen.tsx) (4),
[StatsConsoleScreen.tsx](../../src/screens/game-stats/StatsConsoleScreen.tsx) (3), [LineupEditorScreen.tsx](../../src/screens/lineup/LineupEditorScreen.tsx) (3).

### Two observations
1. **`'Anonymous'` is overloaded.** [PollDetailScreen.tsx:342](../../src/screens/PollDetailScreen.tsx#L342) uses it for *name
   failed to resolve*; [:386](../../src/screens/PollDetailScreen.tsx#L386) and [PollCard.tsx:408](../../src/components/chat/PollCard.tsx#L408) use it for *the poll is
   genuinely anonymous*. A resolution failure is indistinguishable from a privacy
   guarantee — so neither can be verified by looking at the screen.
2. **`'Unknown'` spans four unrelated meanings** (person, attendance status,
   course, error). Any grep-based audit of identity regressions will keep
   returning the same false positives until the identity fallback is a distinct
   token.

---

## Summary of what needs action

| Priority | Item | Sites |
|---|---|---|
| 1 | `team_staff` existence check — port the `a205bbb` count pattern | 4 |
| 2 | `cal_event_rsvps` upsert guard — port the `limit(1)` pattern | 1 |
| 3 | `comm_poll_votes` upsert guard — multi/ranked votes | 1 |
| 4 | `club_staff` multi-club staff | 1 |
| 5 | WellnessTopicScreen — no fetch exists (latent until deep-linked) | 1 |
| 6 | 13 INFERRED Class 2 sites — need constraint confirmation | 13 |
| 7 | `ChatScreen:970` broadcast channel has no club/team filter | 1 |

### Marked INFERRED
- All of §2b — each needs the actual unique constraints, which are not in this
  repo (`supabase/migrations/` holds one unrelated file).
- React Navigation state-restoration behaviour for WellnessTopicScreen.
- Whether `profiles.email` / `teams.invitation_code` carry unique indexes.
