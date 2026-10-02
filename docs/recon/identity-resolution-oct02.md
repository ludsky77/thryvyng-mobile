# Identity Resolution Audit — mobile app
**Date:** 2026-10-02 · **Mode:** read-only recon, no code changed
**Question:** every place the app turns a user id / profile id / player id into a display name, and the fallback string shown when that fails.

## Verdict up front

There are **two kinds of name resolution** in this codebase:

1. **SECURITY DEFINER RPC** (`get_channel_member_names`, `get_channel_members`,
   `search_chat_contacts`, `get_my_conversations`) — works for every viewer.
2. **Direct read of `profiles`** — either an embedded join
   (`profiles:profiles!user_id(...)`, `profile:profiles(...)`) or a
   `.from('profiles').select(...).in('id', ids)` lookup. This is **blocked by RLS
   for a non-staff viewer**, returns `null` / an empty map, and renders the
   fallback string.

All four reported symptoms are category 2. Chat sender names work because chat —
and only chat — was already migrated to category 1. The comment at
[useChatSenderLabels.ts:29-31](../../src/hooks/useChatSenderLabels.ts#L29-L31)
records that migration explicitly: *"RLS does not let a regular parent/player read
another member's profile, roster, or role rows — reading them directly returned
null and rendered 'Unknown'."*

That comment is the diagnosis of all four symptoms, written down before they were
all found.

---

## Table A — every id→name call site

`Starts from` = the id the call site holds. `Resolves via` = how it becomes a name.
`RLS-safe` = yes when the read goes through a SECURITY DEFINER RPC.

| # | Site | Starts from | Resolves via | Fallback shown | RLS-safe |
|---|------|-------------|--------------|----------------|----------|
| 1 | [useChatSenderLabels.ts:57](../../src/hooks/useChatSenderLabels.ts#L57) | auth uid (`comm_messages.user_id`) | RPC `get_channel_member_names(p_channel_id)` → `display_name` | empty map → caller falls back | **yes** |
| 2 | [useChatSenderLabels.ts:97](../../src/hooks/useChatSenderLabels.ts#L97) | auth uid | RPC `get_channel_member_labels(p_channel_id)` → `label_kind`, `child_names` | empty map → no suffix | **yes** |
| 3 | [TeamChatRoomScreen.tsx:577](../../src/screens/TeamChatRoomScreen.tsx#L577) | auth uid | `memberNames` (#1) → `profiles.full_name` join → `profile.full_name` | `undefined` → name hidden, avatar initial `?` | partial |
| 4 | [DMChatScreen.tsx:385](../../src/screens/DMChatScreen.tsx#L385) | auth uid | `memberNames` (#1) → `profile.full_name` | `undefined` → name hidden | partial |
| 5 | [TeamChatRoomScreen.tsx:549](../../src/screens/TeamChatRoomScreen.tsx#L549) | reply denorm column | `comm_messages.reply_to_sender` (denormalised text) | **`'Unknown'`** | n/a |
| 6 | [DMChatScreen.tsx:366](../../src/screens/DMChatScreen.tsx#L366) | reply denorm column | `reply_to_sender` | **`'Unknown'`** | n/a |
| 7 | [TeamChatRoomScreen.tsx:432](../../src/screens/TeamChatRoomScreen.tsx#L432), [:448](../../src/screens/TeamChatRoomScreen.tsx#L448) | auth uid | `message.profile.full_name` (join only — **skips `memberNames`**) | **`'Unknown'`** | no |
| 8 | [DMChatScreen.tsx:336](../../src/screens/DMChatScreen.tsx#L336) | auth uid | `message.profile.full_name` (skips `memberNames`) | **`'Unknown'`** | no |
| 9 | [useMessages.ts:66-70](../../src/hooks/useMessages.ts#L66-L70) | auth uid (reaction `user_id`) | `.from('profiles').select('id, full_name, avatar_url').in('id', ids)` | empty map → `null` profile | **no** |
| 10 | [ReactionDetailsModal.tsx:74-76](../../src/components/chat/ReactionDetailsModal.tsx#L74-L76) | reaction row | `user.profiles.full_name` → `user.profile.full_name` (from #9) | **`'Unknown'`** | no |
| 11 | [useMessages.ts:142](../../src/hooks/useMessages.ts#L142) | auth uid | realtime INSERT re-fetch; `reactions:comm_message_reactions(*)` — **no profile enrichment at all** | `profile: null` → `'Unknown'` | no |
| 12 | [useMessages.ts:338](../../src/hooks/useMessages.ts#L338) | own auth uid | `user.user_metadata.full_name` → **`user.email`** → `'You'` | **raw email**, then `'You'` | n/a (self) |
| 13 | [usePolls.ts:32](../../src/hooks/usePolls.ts#L32) | auth uid (`comm_poll_votes.user_id`) | embed `profiles:profiles!user_id(id, full_name, avatar_url)` | `null` → filtered out of voter list | **no** |
| 14 | [PollCard.tsx:94](../../src/components/chat/PollCard.tsx#L94) | voter profile (from #13) | `item.full_name` | **`'Unknown'`** | no |
| 15 | [PollDetailScreen.tsx:141](../../src/screens/PollDetailScreen.tsx#L141) | auth uid | embed `profiles:profiles!user_id(...)` inside `comm_polls` select | `{ full_name: null }` ([:243](../../src/screens/PollDetailScreen.tsx#L243)) | **no** |
| 16 | [PollDetailScreen.tsx:342](../../src/screens/PollDetailScreen.tsx#L342) | voter entry (from #15) | `item.profile.full_name` | **`'Anonymous'`** | no |
| 17 | [useBoardVoteView.ts:65](../../src/hooks/useBoardVoteView.ts#L65) | auth uid (`comm_channel_members.user_id`) | embed `profile:profiles(id, full_name)` | **`'Unknown'`** ([:114](../../src/hooks/useBoardVoteView.ts#L114)) | **no** |
| 18 | [ChannelPollsScreen.tsx:146-150](../../src/screens/ChannelPollsScreen.tsx#L146-L150) | `comm_polls.created_by` | `.from('profiles').select('id, full_name').in('id', creatorIds)` | **`'Unknown'`** ([:211](../../src/screens/ChannelPollsScreen.tsx#L211)) | **no** |
| 19 | [EventDetailScreen.tsx:352-355](../../src/screens/EventDetailScreen.tsx#L352-L355) | auth uid (`cal_event_rsvps.user_id`, `event_attendance.marked_by`) | `.from('profiles').select('id, email, full_name').in('id', ids)` | empty map ([:371](../../src/screens/EventDetailScreen.tsx#L371)) | **no** |
| 20 | [EventDetailScreen.tsx:507](../../src/screens/EventDetailScreen.tsx#L507) | auth uid (unmatched RSVP) | `responderEmails` (from #19) `.name` | **`'Team member'`** + `'not matched to a player'` | no |
| 21 | [EventDetailScreen.tsx:528](../../src/screens/EventDetailScreen.tsx#L528), [:542](../../src/screens/EventDetailScreen.tsx#L542) | `marked_by` / RSVP uid | `firstName()` / `shortName()` of `responderEmails.name` | `null` → source name omitted | no |
| 22 | [useChannelMembers.ts:23](../../src/hooks/useChannelMembers.ts#L23) | `comm_channel_members.user_id` | embed `profile:profiles(full_name)` | `null` | **no** |
| 23 | [ChatInfoScreen.tsx:166-167](../../src/screens/ChatInfoScreen.tsx#L166-L167) | channel member uid | `.from('profiles').select('id, full_name, avatar_url')` | **`'Unknown'`** ([:236](../../src/screens/ChatInfoScreen.tsx#L236)) | **no** |
| 24 | [GroupInfoScreen.tsx:98](../../src/screens/GroupInfoScreen.tsx#L98) | channel id | RPC `get_channel_members(p_channel_id)` | `'this member'` in confirm copy; initial `?` | **yes** |
| 25 | [GroupInfoScreen.tsx:131](../../src/screens/GroupInfoScreen.tsx#L131), [ChatScreen.tsx:507](../../src/screens/ChatScreen.tsx#L507)/[:596](../../src/screens/ChatScreen.tsx#L596) | search text | RPC `search_chat_contacts` → `display_name` | `null` name | **yes** |
| 26 | [ChatScreen.tsx:320](../../src/screens/ChatScreen.tsx#L320) | — | RPC `get_my_conversations` → `other_user_name` | **`'Unknown User'`** ([:338](../../src/screens/ChatScreen.tsx#L338)) | **yes** |
| 27 | [DirectMessagesScreen.tsx:132-133](../../src/screens/DirectMessagesScreen.tsx#L132-L133) | DM peer uid | `.from('profiles').select('id, full_name, avatar_url')` | **`'Unknown'`** ([:70](../../src/screens/DirectMessagesScreen.tsx#L70), [:194](../../src/screens/DirectMessagesScreen.tsx#L194)) | **no** |
| 28 | [DMChatScreen.tsx:181-184](../../src/screens/DMChatScreen.tsx#L181-L184) | DM peer uid | `.from('profiles')...eq('id', otherUserId)` | falls back to `memberNames` ([:413](../../src/screens/DMChatScreen.tsx#L413)) | partial |
| 29 | [StaffMessageScreen.tsx:77-78](../../src/screens/StaffMessageScreen.tsx#L77-L78) | `team_staff.user_id` | `.from('profiles').select('id, full_name')` | **`'Unknown'`** ([:86](../../src/screens/StaffMessageScreen.tsx#L86)) | **no** |
| 30 | [TeamStaffScreen.tsx:78](../../src/screens/TeamStaffScreen.tsx#L78) | `team_staff.user_id` | embedded `profiles` select | **`'Unknown'`** ([:188](../../src/screens/TeamStaffScreen.tsx#L188)) | **no** |
| 31 | [TeamDetailScreen.tsx:113](../../src/screens/TeamDetailScreen.tsx#L113) | `team_staff.user_id` | embed `profiles(full_name, email)` | **`'Unknown'`** ([:237](../../src/screens/TeamDetailScreen.tsx#L237)) | **no** |
| 32 | [useTypingPresence.ts:35](../../src/hooks/useTypingPresence.ts#L35) | own profile | `profile.full_name` broadcast over Realtime presence | **`'Someone'`** ([:105](../../src/hooks/useTypingPresence.ts#L105)) | n/a (self-published) |
| 33 | [RosterScreen.tsx:152](../../src/screens/RosterScreen.tsx#L152), [:243](../../src/screens/RosterScreen.tsx#L243) | player id | RPC (roster) + RPC `get_player_contact` → `parent_first_name` | blank contact block | **yes** |
| 34 | [AttendanceScreen.tsx:95](../../src/screens/AttendanceScreen.tsx#L95), [EventDetailScreen.tsx:290-293](../../src/screens/EventDetailScreen.tsx#L290-L293), [EvaluationRosterScreen.tsx:66](../../src/screens/EvaluationRosterScreen.tsx#L66) | player id | `players.first_name` / `last_name` direct | none (names are on the row) | n/a |
| 35 | [LineupEditorScreen.tsx:38](../../src/screens/lineup/LineupEditorScreen.tsx#L38) | player row | `full_name` → `first+last` | **`'Unknown'`** | n/a |
| 36 | [PlayerEvaluationsScreen.tsx:79](../../src/screens/PlayerEvaluationsScreen.tsx#L79), [TeamCertificatesScreen.tsx:76](../../src/screens/TeamCertificatesScreen.tsx#L76), [EvaluationDetailScreen.tsx:607](../../src/screens/EvaluationDetailScreen.tsx#L607) | denorm `player_name` column | stored text | **`'Unknown Player'`** | n/a |
| 37 | [EvaluationsScreen.tsx:74](../../src/screens/EvaluationsScreen.tsx#L74) | denorm `evaluator_name` | stored text, written at [CreateEvaluationScreen.tsx:232](../../src/screens/CreateEvaluationScreen.tsx#L232) from `user_metadata.full_name` → `email.split('@')[0]` → `'Coach'` | **`'Unknown'`** | n/a |
| 38 | [CoachActivityCard.tsx:56](../../src/components/training/CoachActivityCard.tsx#L56) | coach profile | `coach.full_name` | **`'Unknown Coach'`** | no |
| 39 | [WorldCupPredictorScreen.tsx:177-179](../../src/screens/WorldCupPredictorScreen.tsx#L177-L179) | profile row | `first_name` + `last_name` | **`'Unknown'`** | no |
| 40 | [AuthContext.tsx:139-142](../../src/contexts/AuthContext.tsx#L139-L142) | own auth uid | `.from('profiles').select('*').eq('id', session.user.id)` | `profile: null` | n/a (self — RLS always allows own row) |

**Call sites: 40. Distinct fallback strings: 11** — `'Unknown'`, `'Anonymous'`,
`'Team member'`, `'Unknown User'`, `'Unknown Player'`, `'Unknown Coach'`,
`'Someone'`, `'You'`, `'Coach'`, `'this member'`, and the bare `'?'` avatar
initial — plus **raw email** used as a name (#12, #37).

---

## Table B — the WORKING path (model the shared resolver on this)

Chat sender names are the one path that resolves for every viewer.

| Step | Where | What |
|------|-------|------|
| 1 | [useChatSenderLabels.ts:40](../../src/hooks/useChatSenderLabels.ts#L40) | Hook takes **`channelId`** only. `teamId` is a vestigial parameter, accepted for call-site compatibility and unused ([:42-43](../../src/hooks/useChatSenderLabels.ts#L42-L43)) — the RPC derives the team itself. |
| 2 | [:57](../../src/hooks/useChatSenderLabels.ts#L57) | `supabase.rpc('get_channel_member_names', { p_channel_id })` → rows of `{ user_id, display_name, avatar_url }`. SECURITY DEFINER, membership-gated. |
| 3 | [:63-70](../../src/hooks/useChatSenderLabels.ts#L63-L70) | Builds `Map<user_id, { name, avatar }>`. **Rows with a falsy `display_name` are skipped** — they never enter the map. |
| 4 | [:97](../../src/hooks/useChatSenderLabels.ts#L97) | `supabase.rpc('get_channel_member_labels', { p_channel_id })` → `{ user_id, label_kind, child_names }`. `label_kind ∈ parent \| player \| staff \| null`. |
| 5 | [:104-112](../../src/hooks/useChatSenderLabels.ts#L104-L112) | Two more maps: `labelKind` for everyone; `playerLabels` **only when `label_kind === 'parent'`**. |
| 6 | [:61](../../src/hooks/useChatSenderLabels.ts#L61), [:100](../../src/hooks/useChatSenderLabels.ts#L100) | `if (error) throw error` — **Supabase RPCs report failure as a returned `error`, not a throw.** Any resolver must check this explicitly. |
| 7 | [:72-76](../../src/hooks/useChatSenderLabels.ts#L72-L76), [:118-125](../../src/hooks/useChatSenderLabels.ts#L118-L125) | Failure degrades to empty maps, never crashes; caller falls back. |
| 8 | [TeamChatRoomScreen.tsx:577](../../src/screens/TeamChatRoomScreen.tsx#L577) | Consumption order: `memberNames.get(uid)?.name` **→** `profiles.full_name` **→** `profile.full_name`. RPC first, join as fallback. |

**Properties worth copying:** keyed by auth uid; one fetch per channel, not per
row ([:79-82](../../src/hooks/useChatSenderLabels.ts#L79-L82)); RPC result wins
over any local join; both name and role-label come from the same gated source.

**Gaps even here:** sites #7 and #8 (the actions/reaction-picker modals) read
`message.profile.full_name` and bypass `memberNames` entirely — so the *same
screen* that renders a correct name in the bubble shows `'Unknown'` in its
long-press modal.

---

## Symptom 3 — PLAYER sees "Team member / not matched to a player", Headcount 1 vs Going 6

### How an RSVP row is matched to a player

[EventDetailScreen.tsx:472-515](../../src/screens/EventDetailScreen.tsx#L472-L515),
`resolvedRsvps`. RSVP rows come from `cal_event_rsvps` ([:256-259](../../src/screens/EventDetailScreen.tsx#L256-L259)) and carry `user_id`, usually **no `player_id`**. Three tiers, in order:

1. **`rsvp.player_id`** if present → direct.
2. **`playerRoleMap.get(rsvp.user_id)`** — built at [:318-328](../../src/screens/EventDetailScreen.tsx#L318-L328) from
   `user_roles` where `role = 'player'` and `entity_id IN (team player ids)`.
   This is the user-IS-the-player case.
3. **Email bridge** — `responderEmails.get(rsvp.user_id).email` compared against
   `players.parent_email` / `players.secondary_parent_email`
   ([:495-500](../../src/screens/EventDetailScreen.tsx#L495-L500)). **Exactly one** match maps it; zero or
   two or more → pushed to `unmapped` with label
   `profile?.name || 'Team member'` ([:507](../../src/screens/EventDetailScreen.tsx#L507)).

The code comment at [:467-470](../../src/screens/EventDetailScreen.tsx#L467-L470) states the ambiguity is deliberately not guessed.

### Why a non-staff viewer fails the match

Tier 3 depends entirely on `responderEmails`, built at
[:352-372](../../src/screens/EventDetailScreen.tsx#L352-L372) by a **direct read**:

```
supabase.from('profiles').select('id, email, full_name').in('id', ids)
```

For a player/parent viewer, RLS returns only their **own** row — every other
responder is absent from the map, so `email` is `''`, `matches` is `[]`, and the
row lands in `unmapped` with the name `'Team member'`. The code already predicts
this, at [:365-367](../../src/screens/EventDetailScreen.tsx#L365-L367):
*"RLS may hide other members' profiles from a parent; those RSVPs then render as
un-mapped rows rather than being silently attached to a kid."*

Tier 2 fails for the same reason: the `user_roles` read at [:318](../../src/screens/EventDetailScreen.tsx#L318) is also
direct and almost certainly not readable for other users' role rows.

### Why Headcount shows 1 while Going shows 6

[:565-573](../../src/screens/EventDetailScreen.tsx#L565-L573) — the two numbers are computed from **different sources**:

- `going` = `eventRsvps.filter(r => r.status === 'yes').length` → counts **raw
  RSVP rows**, which the viewer *can* read → **6**.
- `headcount` = `roster.filter(r => r.status === 'going').length` → counts
  **roster entries resolved to a player** via `resolvedRsvps.byPlayer`
  ([:519-523](../../src/screens/EventDetailScreen.tsx#L519-L523)) → only the viewer's own row resolves → **1**.

The 6 vs 1 gap *is* the size of the resolution failure. The RSVP rows are visible;
only the id→player and id→name steps are blocked. **(Provable from code.
INFERRED: the exact RLS policies on `profiles` and `user_roles` — the policy SQL
is not in this repo, so "non-staff cannot read peers' rows" is inferred from the
two in-code comments above plus the observed symptoms.)**

---

## Symptom 4 — raw email with a "(Nathan's)" suffix

### Where the suffix is appended

[ChatBubble.tsx:123-129](../../src/components/chat/ChatBubble.tsx#L123-L129), `renderSenderSuffix()`:

```
if (labelKind === 'staff')  return null;
if (labelKind === 'player') return (Player);
if (!playerLabel)           return null;
return ({playerLabel}'s);        // <- "(Nathan's)"
```

`playerLabel` is only ever populated when `label_kind === 'parent'`
([useChatSenderLabels.ts:109-111](../../src/hooks/useChatSenderLabels.ts#L109-L111)), so **the suffix is correct behaviour** — the sender
really is a parent, and `get_channel_member_labels` resolved them fine. The bug is
the *name*, not the suffix. Note the branch is reached by fall-through rather than
an explicit `labelKind === 'parent'` test — the comment calls it the "legacy
possessive" path.

### Where the email comes from

Two independent sources:

1. **Fallback chain, the likely one here.**
   [TeamChatRoomScreen.tsx:577-580](../../src/screens/TeamChatRoomScreen.tsx#L577-L580) resolves
   `memberNames.get(uid)?.name || profiles?.full_name || profile?.full_name`. If
   `get_channel_member_names` returned a **null/empty `display_name`** for that
   user, [useChatSenderLabels.ts:64](../../src/hooks/useChatSenderLabels.ts#L64) (`if (row?.user_id && row.display_name)`) **drops the
   row from the map**, and rendering falls through to `profiles.full_name`. An
   email is then displayed **because `profiles.full_name` holds an email string
   for that account.** The labels RPC still returns `parent` + `child_names`,
   which is exactly the observed email + "(Nathan's)" pairing.
   *The skip-on-falsy at line 64 is provable from code. That this account's
   stored `full_name` is an email is **INFERRED** — it requires DB inspection,
   which was out of scope.*

2. **Self-echo path, own messages only.**
   [useMessages.ts:338](../../src/hooks/useMessages.ts#L338) builds the optimistic message with
   `full_name: user.user_metadata?.full_name || user.email || 'You'`. This writes
   a raw email into the local profile object. **It cannot produce this symptom as
   reported**, because [ChatBubble.tsx:275](../../src/components/chat/ChatBubble.tsx#L275) gates the name and suffix behind
   `!isOwnMessage` — the author never sees their own name. It is a real latent
   email leak (any screen rendering own-message sender info would show it), but a
   second viewer is seeing path 1.

Same email-as-name pattern, independently, at
[CreateEvaluationScreen.tsx:232](../../src/screens/CreateEvaluationScreen.tsx#L232) (`email.split('@')[0]`), persisted into
`evaluator_name`.

---

## Every DB object touched by Table A — for server-side RLS review

### Tables (17)
| Object | Read for identity by |
|---|---|
| `profiles` | #9, #15, #18, #19, #23, #27, #28, #29, #40 + embeds #13, #17, #22, #30, #31 |
| `user_roles` | EventDetail player-role map ([:318](../../src/screens/EventDetailScreen.tsx#L318)), DMChat ([:186](../../src/screens/DMChatScreen.tsx#L186)) |
| `players` | #34; email bridge ([:290](../../src/screens/EventDetailScreen.tsx#L290), [:386](../../src/screens/EventDetailScreen.tsx#L386)) |
| `team_staff` | #29, #30, #31; non-responders ([:379](../../src/screens/EventDetailScreen.tsx#L379)) |
| `cal_event_rsvps` | #19, #20, #21 (RSVP rows) |
| `cal_events` | event fetch |
| `event_attendance` | #19 (`marked_by`), roster marks ([:302](../../src/screens/EventDetailScreen.tsx#L302)) |
| `comm_messages` | #3–#8 (sender `user_id`, `reply_to_sender`) |
| `comm_message_reactions` | #9, #10, #11 |
| `comm_message_attachments` | message enrichment |
| `comm_channel_members` | #17, #22; PollCard non-voters |
| `comm_channels` | poll/channel team derivation |
| `comm_polls` | #13, #15, #18 |
| `comm_poll_votes` | #13, #15, #16, #17 |
| `comm_poll_options` | poll labels |
| `comm_poll_views` | #17 (seen/unread) |
| `teams`, `clubs`, `club_staff` | role/scope context around the above |

> `teams` / `clubs` / `club_staff` are grouped as one row; counted individually the
> table list is 20 objects.

### RPCs (8)
| RPC | Called from | Status |
|---|---|---|
| `get_channel_member_names(p_channel_id)` | [useChatSenderLabels.ts:57](../../src/hooks/useChatSenderLabels.ts#L57) | **works** — the model |
| `get_channel_member_labels(p_channel_id)` | [useChatSenderLabels.ts:97](../../src/hooks/useChatSenderLabels.ts#L97) | **works** |
| `get_channel_members(p_channel_id)` | [GroupInfoScreen.tsx:98](../../src/screens/GroupInfoScreen.tsx#L98) | **works** |
| `search_chat_contacts` | [GroupInfoScreen.tsx:131](../../src/screens/GroupInfoScreen.tsx#L131), [ChatScreen.tsx:507](../../src/screens/ChatScreen.tsx#L507)/[:596](../../src/screens/ChatScreen.tsx#L596) | **works** (`display_name`) |
| `get_my_conversations` | [ChatScreen.tsx:320](../../src/screens/ChatScreen.tsx#L320) | **works** (`other_user_name`) |
| `get_player_contact` | [RosterScreen.tsx:243](../../src/screens/RosterScreen.tsx#L243) | works (`parent_first_name`) |
| `ensure_team_channel_membership` | [ChatScreen.tsx:309](../../src/screens/ChatScreen.tsx#L309) | membership precondition for the above |
| `archive_channel` | [ChatInfoScreen.tsx:353](../../src/screens/ChatInfoScreen.tsx#L353) | not identity |

**Total DB objects listed: 28** (20 tables + 8 RPCs).

> **Blocked / not verifiable here:** no RPC or RLS policy definitions exist in this
> repo — `supabase/migrations/` holds a single file,
> `20250224000000_notify_lineup_published.sql`. Everything about what
> `get_channel_member_names` returns, and which `profiles` rows RLS exposes to
> whom, is inferred from call-site code and in-code comments. **Server-side
> confirmation is required before any fix.**

---

## What a shared resolver has to cover

Observations only — no fix proposed here.

1. Four symptoms, one cause: **direct `profiles` reads**. 14 of the 40 sites do it.
2. A gated-RPC pattern already exists and works, but is **channel-scoped**. Polls,
   reactions, RSVPs and rosters are team- or event-scoped, so a resolver for them
   needs a different gate than `p_channel_id`.
3. Two sites (#7, #8) bypass `memberNames` on a screen that already has it —
   fixable client-side alone.
4. Both `'Anonymous'` fallbacks are dangerous: [PollDetailScreen.tsx:342](../../src/screens/PollDetailScreen.tsx#L342) renders
   the *same word* for "name failed to resolve" as [:386](../../src/screens/PollDetailScreen.tsx#L386) and
   [PollCard.tsx:408](../../src/components/chat/PollCard.tsx#L408) use for a genuinely anonymous poll. A resolution
   failure is currently indistinguishable from an intended privacy guarantee.
5. `reply_to_sender`, `player_name` and `evaluator_name` are **denormalised name
   columns**. They sidestep RLS but go stale, and `evaluator_name` is already
   seeded from an email local-part.
6. The realtime-INSERT path ([useMessages.ts:142](../../src/hooks/useMessages.ts#L142)) never enriches reactions,
   so live reactions lack names even where the initial fetch succeeds.
