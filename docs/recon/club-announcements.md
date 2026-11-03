# Club announcements — the "channel not found" bug, and what a card feed would cost

**Date:** 2026-11-03 · **Mode:** READ-ONLY. Static source only. **No DB query was run**
(Lu runs all DB commands), no app run, no device test, no code changed — this file is the
only thing this task wrote.
**Repos read:** `thryvyng-mobile` @ `689a04e` · `thrive-and-score` @ `df8dabe` (READ-ONLY).

**Tags:** PROVEN = read in a file, with a line cite · INFERRED = reasoned, not run ·
UNKNOWN = needs the named check. 🛡 HACKER RISK · 🔧 BROKEN FLOW.

---

## 0. Headline — read these five

1. **THE BUG IS NOT A MISSING ROW. IT IS A ROW THAT CANNOT EXIST. PROVEN.** Mobile looks for
   `comm_channels.channel_type = 'broadcast'`
   (`src/screens/ChatScreen.tsx:1676-1681`). The live CHECK constraint
   `comm_channels_channel_type_check` allows exactly **`team`, `club`, `dm`, `group_dm`** —
   measured against prod and printed in
   `thrive-and-score/docs/recon/BF-dryrun-output.txt:20`, and stated again in
   `20261013053147_…sql:573-575`: *"the channel_type CHECK constraint (team, club, dm,
   group_dm) means no broadcast row can exist"*. So the lookup returns `null` **every time,
   for every user, and always has**. No SQL deleted anything.
2. **NOTHING REGRESSED. The code has been this way since its first commit.** `git log -S` for
   both the error string and `sendClubWideMessage` returns **one** commit — `db5dedb` "Major
   Chat System Overhaul". The Oct gender/season refactor, the Oct 13 Phase A/B work and the
   Oct 21–22 PAC cleanup did **not** touch this path. PROVEN.
3. **THE OCT 22 PAC CLEANUP DID NOT DELETE A BROADCAST CHANNEL OR ITS MEMBERS. PROVEN** from
   the applied script and its captured output (`docs/recon/chat_cleanup_apply.sql`,
   `chat_cleanup_apply_oct22.txt`). 13 channels went: 11 `group_dm`, 1 `team`
   (`b2-archive-test`), 1 `club` (`coaches-lounge`). Guard **G3 refuses outright** if
   `club-announcements` or `Team Chat` is in the target list, and guard G2 refuses any
   `is_default` channel. `club-announcements` was never a target. Zero broadcast rows existed
   to delete.
4. **THE REAL CLUB-WIDE CHAT IS `club-announcements`: `channel_type = 'club'`,
   `is_default = true`, `club_id` set, ~231 members, membership kept by a server sync.** That
   is the channel web opens and the one mobile already lists. The whole bug is that mobile's
   compose button looks for a *different, impossible* channel instead of this one. PROVEN.
5. **WEB IS FINE AND USES A DIFFERENT LOOKUP. PROVEN.** `useChannels` filters
   `.eq('club_id', clubId)` and never mentions `channel_type`
   (`thrive-and-score/src/hooks/useChannels.ts:57-69`). Web has no "Club-Wide Message"
   compose at all: it opens `club-announcements` in the normal channel list and types in the
   normal composer. Only mobile has the broken door.

---

# PART A · the bug

## A1. The exact code and the exact query

`src/screens/ChatScreen.tsx:1671-1694` — `sendClubWideMessage`:

```ts
const { data: clubChannel } = await supabase
  .from('comm_channels')
  .select('id')
  .eq('channel_type', 'broadcast')   // <- can never match
  .limit(1)
  .maybeSingle();
if (clubChannel) { navigation.navigate('TeamChatRoom', { … }); }
else { Alert.alert('Info', 'Club broadcast channel not found. Contact admin.'); }
```

The alert string lives at `:1692` and **nowhere else in either repo** (grep, both trees).

| Part of the query | Value | Problem |
|---|---|---|
| table | `comm_channels` | ok |
| filter | `channel_type = 'broadcast'` | **no such value is permitted** (A2) |
| filter | *(none on club)* | 🔧 even if a row existed, a multi-club admin would get an arbitrary club's channel — `limit(1)` with no `club_id` and no `ORDER BY` |
| columns | `id` only | too thin for a card feed (B7/B12) |
| error handling | `data` only; `error` discarded | a real failure (offline, RLS) prints the same "contact admin" sentence |

**Second, independent defect on the same path. PROVEN.** `broadcastToTeams: targetTeamIds`
is passed as a navigation param at `:1689` and is **read nowhere** — one grep hit in the
whole mobile tree, the write itself. So the audience picker above it (All teams / filter by
age + gender, `:2455-2615`) is **decorative**: even with the channel found, every message
would go to the whole club. 🔧 BROKEN FLOW.

## A2. How the channel is created, and how members get in

**Creation (web, client-side, lazily).** `thrive-and-score/src/components/club/ClubMessagesTab.tsx:46-93`
inserts two defaults the first time a club's channel list comes back empty:

```
club-announcements   channel_type 'club'  is_default true   description 'Club-wide announcements'
coaches-lounge       channel_type 'club'  is_private true
```

…then inserts the creating user as `role 'admin'`. **There is no migration, trigger or RPC
that creates a club chat.** If a club admin never opens the web Club → Messages tab, that
club has no club-wide chat at all. **A channel per club is NOT guaranteed.** PROVEN.

**Membership (server, best-effort).** `public.sync_club_default_channel_members(club_id)` —
`20261013053147_…sql:238-277` — inserts **every** `club_member_user_ids(club_id)` as
`role 'member'` into the club's `channel_type='club' AND is_default IS TRUE` channel,
`ON CONFLICT DO NOTHING`, skipping only the channel's own creator. It returns `0` and does
nothing if no such channel exists. It is fired by **eight** triggers
(`:379-420`: `club_staff`, `clubs`, `teams`, `team_staff`, `players`,
`player_placements`, `profiles`, `comm_channels`) through one guarded trigger function
(`:295`) whose every failure is downgraded to a `WARNING` so a chat problem can never fail a
registration. The migration says so itself: *"the sync is best effort; the lazy repair is the
next write on any of these tables"*. **Insert-only — it never removes anybody**
(already on record: `docs/ledger.md:210-215`, a removed player's family stays in
club-announcements).

**Visibility (RLS).** `comm_channels_select`, `20261013053147_…sql:581-614`. For
`team`/`club`/`broadcast`:
* `is_default IS TRUE` → team-wide or club-staff or club-admin reach, **plus** its own members;
* anything else → **current members only**.

So club-announcements is readable by Lu two ways over (club admin *and* a member row), and
a hypothetical broadcast row — which is never `is_default` — would have needed a membership
row on top of existing at all.

**Belt and braces: a broadcast row would also have to pass `channel_scope`** (`team_id` XOR
`club_id`, or both NULL only for `dm`/`group_dm` — `20260108184412_…sql:61-65`,
live definition in `BF-dryrun-output.txt:20`).

## A3. What changed since Oct 13 — nothing on this path

| Suspect | Verdict | Evidence |
|---|---|---|
| The mobile lookup itself | **never changed** | `git log -S"Club broadcast channel not found"` and `-S"sendClubWideMessage"` → one commit, `db5dedb` |
| Oct gender/season chat refactor (`ccebd4f`, `953866e`) | touched `getTeamBucket`/`teamGender` and the *audience picker's* chips only; `sendClubWideMessage` untouched | `src/utils/teamGender.ts`, `ChatScreen.tsx:1636-1658` |
| Oct 13 Phase A/B "club-announcements shows count only" | a **Chat Info cosmetic** — member list hidden, count kept (`ChatInfoScreen.tsx:120-122`, ledger `docs/ledger.md:85`). Does not touch channel lookup | ledger + `docs/recon/phaseB-mobile-cosmetics.md:187` |
| Oct 21–22 PAC cleanup SQL | **deleted no broadcast row and no broadcast member row** (none existed); `club-announcements` protected by guard G3 | `thrive-and-score/docs/recon/chat_cleanup_apply.sql`, `chat_cleanup_apply_oct22.txt` |
| Any migration altering `channel_type` | **none**. Zero `ADD CONSTRAINT`/`DROP CONSTRAINT` on `comm_channels` anywhere in 274 migrations | grep over `supabase/migrations/` |

**Conclusion: PROVEN — this feature never worked on mobile. It is a build defect, not a regression.**

## A4. Does web's club-wide message still work?

**Yes, and by a different route. PROVEN.**

* Lookup: `useChannels(teamId?, clubId?)` → `.from('comm_channels').select('*')
  .eq('is_archived', false).eq('club_id', clubId).order('is_default', {ascending:false})`
  (`thrive-and-score/src/hooks/useChannels.ts:57-69`). **No `channel_type` filter**, and
  `select('*')` so it gets `allow_member_text`, `is_default`, `description` — the columns
  mobile's `select('id')` throws away.
* UI: `ClubMessagesTab` → `ChannelList` + `ChatPanel`; `club-announcements` sorts first
  because of the `is_default` ordering. Sending is the ordinary `useMessages.sendMessage`.
* Web has **no** audience picker and **no** per-message push toggle. There is nothing on web
  called "Club-Wide Message" (grep: only `ClubMessagesTab.tsx:54`, the channel's description
  string). So the mobile modal has no web counterpart to copy. PROVEN.

## A5. The proof SQL (READ-ONLY — Lu runs it)

Plain English per block. Nothing below writes.

```sql
-- 1. Is there ANY broadcast channel? Expected: 0 rows. This alone proves the cause.
select id, name, channel_type, club_id, team_id, is_default
from public.comm_channels
where channel_type = 'broadcast';

-- 2. What does the constraint actually allow? Expect 'broadcast' to be ABSENT.
select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.comm_channels'::regclass and contype = 'c'
order by conname;

-- 3. PAC's real club-wide chat: does it exist, is it the default, can members post,
--    and how many people are in it?
select c.id, c.name, c.channel_type, c.is_default, c.is_private, c.is_archived,
       c.allow_member_text, c.club_id, cl.name as club,
       (select count(*) from public.comm_channel_members m where m.channel_id = c.id) as members
from public.comm_channels c
join public.clubs cl on cl.id = c.club_id
where c.channel_type = 'club'
order by cl.name, c.is_default desc, c.name;

-- 4. Is Lu a member of it, and is it muted or hidden for him?
select cl.name as club, c.name as channel, m.role, m.is_muted, m.last_read_at, m.hidden_at
from public.comm_channel_members m
join public.comm_channels c on c.id = m.channel_id
join public.clubs cl on cl.id = c.club_id
join public.profiles p on p.id = m.user_id
where c.channel_type = 'club' and c.is_default is true
  and p.email = 'ludwig.snchz@gmail.com';

-- 5. Are there clubs with NO club-wide chat at all? (A2: creation is a web side effect)
select cl.id, cl.name
from public.clubs cl
where not exists (
  select 1 from public.comm_channels c
   where c.club_id = cl.id and c.channel_type = 'club' and c.is_default is true
);
```

**Expected result if the diagnosis is right:** block 1 → **0 rows**; block 2 → `broadcast`
not in the list; block 3 → PAC's `club-announcements` present, `is_default = t`, hundreds of
members; block 4 → Lu has a row. If block 1 returns rows, the diagnosis is wrong and the
constraint was changed outside the repo — then block 2 tells us when the repo stopped being
the truth.

### Fix options

**(a) Restore the row + members — SQL. 🛡 SACRED. NOT RECOMMENDED.**
There is nothing to restore. It would mean *widening a CHECK constraint on a chat table*
(`ALTER TABLE comm_channels DROP CONSTRAINT … ADD CONSTRAINT … broadcast`), creating a
channel, and back-filling hundreds of member rows — inventing a second club-wide chat beside
`club-announcements`, with a second unread count, a second push stream and a second member
list. It also needs `allow_member_text`, `is_default` and a sync arm of its own. **Schema +
member back-fill = SACRED, and it buys a duplicate of a channel that already works.**

**(b) Code fix — mobile only. RECOMMENDED.**
Point the lookup at the channel that exists: the caller's club's `channel_type = 'club'`,
`is_default IS TRUE` chat. One function, ~25 lines, one file.
* Files: `src/screens/ChatScreen.tsx` (`sendClubWideMessage`, `:1671-1694`). `fetchClubTeams`
  (`:1596-1619`) already reads the caller's `club_staff.club_id` immediately above — the club
  id is already in hand, so the new query is `.eq('club_id', clubId).eq('channel_type','club')
  .eq('is_default', true).eq('is_archived', false).maybeSingle()`.
* Also worth doing in the same edit: check `error` separately from `data` so a network
  failure stops saying "contact admin"; and either **wire or remove** the dead
  `broadcastToTeams` audience picker (A1) — today it promises filtering it does not do.
* Tier: **ROUTINE** (one screen, one query, no schema, no policy).
* Cost: **STORE BUILD.** `expo-updates` is not installed and `app.json` has no `updates`
  key — there is no OTA (PROVEN, `docs/recon/playbook-share-links.md` §0.5). Nothing to
  deploy on web.

**(c) Both.** Not needed. (b) alone makes the button work, and makes mobile and web open the
same chat — which is the parity the rest of the comms stack is built on.

**Decision needed from Lu (not sacred, but a product call):** the audience picker. Either
(i) drop it — one club-wide chat, everyone gets it, matches web exactly; or (ii) keep the
promise, which means *per-audience delivery* and that is a new table or N channels → SACRED,
and a much bigger slice than this bug. **Recommend (i) for the fix, and treat audience as a
Part B question.**

---

# PART B · club announcements as cards

## B6. How club announcements are stored and shown today

**Stored:** as **ordinary chat messages** — `comm_messages` rows whose `channel_id` is the
club's `is_default` `club` channel. There is no announcements table, no `announcements`
column, no separate feed. PROVEN.

**Mobile:**
| Surface | File | What it shows |
|---|---|---|
| Chat list row | `src/screens/ChatScreen.tsx` | one row among the chats; tan `#C4976D` avatar colour for club/announcement names (`:131-143`); rows come from `get_my_conversations` |
| The chat itself | `src/screens/TeamChatRoomScreen.tsx` | a normal bubble list (`ChatBubble`), normal composer or the locked banner |
| Chat Info | `src/screens/ChatInfoScreen.tsx` | **the "count only" view** — `memberCount` is read separately from `members` *precisely because* club-announcements prints "N members" with no roster and no sort control (`:120-122`, `:448`, helper `isDefaultClubChannel` in `src/lib/channelLeave.ts:111-130`) |
| Compose entry | `ChatScreen.tsx:2455-2615` | the "Club-Wide Message" modal — **the broken one** (Part A) |

**Web:** `ClubMessagesTab` → `ChannelList` + `ChatPanel`; `ChatPanel.tsx:140` hides the
member list on that one channel for the same reason. Same "it's just a chat" shape.

**There is no card feed on either app today.** The mockup is new UI, not a re-skin.

## B7. Message fields — where a card title could live

`comm_messages` columns, from the creating migration plus every `ALTER` (3 of them, all
found):

| Column | Source |
|---|---|
| `id`, `channel_id`, `user_id`, `content text NOT NULL`, `created_at` | `20260108184412_…sql:81-95` |
| `message_type varchar(20)` CHECK `('standard','alert','system','poll')` | same, `:86-87` |
| `parent_id`, `thread_count`, `is_pinned`, `is_edited`, `is_deleted`, `edited_at` | same, `:88-94` |
| `poll_id uuid` | `20260111220754_…sql:2-3` |
| `reply_to_id`, `reply_to_content`, `reply_to_sender` | `20261010204000_…sql:6-9` |

**There is NO title, NO subject, NO metadata column, and NO jsonb column of any kind on
`comm_messages`. PROVEN.** Attachments live in a child table
(`comm_message_attachments`, `:98-106`).

Three places a card title could come from:

| Option | Tier | Cost | Honest assessment |
|---|---|---|---|
| **New `title text` column** (nullable) | 🛡 **SACRED** (schema) | one tiny migration + both clients | Cleanest. A nullable column breaks nothing: every existing message reads `title IS NULL` and the card falls back to B7-c. Also needs `msg_insert`/`msg_update` reviewed so a title can't be set on someone else's message. |
| **Existing jsonb** | — | — | **Does not exist. Not an option.** |
| **Derive from the first line** of `content` | **ROUTINE** | client-only, both apps, ~15 lines each | Zero schema. Convention: first line = title, rest = body; compose writes `"<title>\n\n<body>"`. Risk: a plain chat message with a long first line becomes a card with a title that is the whole message. Mitigate by only treating it as a title when the first line is short (≤ ~80 chars) and a blank line follows. |

**RECOMMEND (suggestion):** ship the card feed on **derive-from-first-line** first, because
it needs no migration and no schema approval, and prove the UI is what Lu wants. Add the
`title` column later only if the derivation turns out to read badly — at which point the
column is a one-line migration and the fallback is already written.

## B8. Reactions — live, and members can react today

* **Table:** `comm_message_reactions (id, message_id, user_id, emoji varchar(20), created_at,
  UNIQUE(message_id, user_id, emoji))` — `20260108184412_…sql:109-116`.
* **Realtime: FIXED, applied to prod 2026-10-16 15:53 MDT** by
  `20261016150000_4a_reactions_realtime.sql` (commit `064ceec`), which added the table to the
  `supabase_realtime` publication. **The Oct 13 `CHANNEL_ERROR` note is stale** — it is the
  symptom slice 4a was written to cure (the old note: `docs/recon/phaseC-audit.md:215`,
  `docs/ledger.md:207`). The migration also records that prod's `relreplident = 'f'` (FULL),
  set outside the repo, **by whom and when is UNKNOWN**.
* **Clients repaint by refetching** the shown messages' reactions rather than trusting the
  event payload — deliberate, so the UI is correct under FULL *and* DEFAULT
  (`src/hooks/useMessages.ts`, subscription in `src/lib/realtimeHub.ts:36-37`).
* **Can members react today? YES. PROVEN, both layers:**
  * Server: `comm_reactions_insert` = `user_id = auth.uid()` **AND** the message is in a
    channel you are a member of (`20261016150000_…sql` PART 2). Membership is the only
    requirement — **staff is not** — so an announcement-only channel still accepts reactions.
  * Mobile UI: `onEmojiPress` / `onReactionPress` on every bubble are **ungated** by
    `allowMemberText` or staff (`TeamChatRoomScreen.tsx:890`, `:900`). Vocabulary: 6 quick +
    30 full (`src/components/chat/ReactionPicker.tsx`).
* **So "emoji reactions only, no replies" is already the server's behaviour** for an
  announcement-only channel. The card feed does not need any reaction work beyond rendering.

## B9. Read / unread — per channel, never per message

* **What feeds the count (Stone B):** `get_my_conversations()`
  (`20261019040000_stage3_club_cols.sql:98-150`). `unread` CTE =
  `count(*) from comm_messages where not deleted and user_id <> me and created_at >
  COALESCE(last_read_at, now() - interval '30 days')`, per channel the caller has a
  membership row for.
* **The stamp:** `comm_channel_members.last_read_at` (`20260108184412_…sql:75`), written by
  `TeamChatRoomScreen.markChannelAsRead` on mount, on focus and on each incoming message
  (`:210-227`). Hiding never writes it (`src/lib/hiddenChats.ts:12`).
* **The client rule:** `src/utils/unreadRule.ts` splits the rows and totals the tab badge;
  the floor is `last_read_at` else `now() - 30 days` (`:235`, `:254`).
* **Per-message read state: DOES NOT EXIST.** `ReadReceipts` and
  `MessageReadHistoryScreen` *derive* "who read this" by comparing each member's
  `last_read_at` to the message's `created_at` (`MessageReadHistoryScreen.tsx:9-10`,
  `:107-118`). There is no per-message read table.
* **Consequence for a card feed:** opening ONE card marks the WHOLE channel read. A feed of
  cards where each card has its own unread dot **cannot be built on today's schema** — it
  needs a new per-member-per-message table. 🛡 SACRED, and bigger than the rest of the
  mockup put together. **Recommend: one unread count for the whole feed** (exactly what the
  chat row shows now), and no per-card dot in v1.

## B10. The posting lock — server-enforced. No gap.

**Enforced on the server. PROVEN.** `20261017032300_phaseD_4b_staff_only_posting.sql`:
* PART 1 — `public.channel_allows_member_text(channel_id)` reads
  `comm_channels.allow_member_text` as `IS NOT FALSE` (`:222-241`).
* PART 2 — the `msg_insert` policy on `comm_messages` requires
  `channel_allows_member_text(channel_id) OR is_channel_staff(channel_id, auth.uid())`
  (`:308-320`) — **on top of** the pre-existing "you must be a member" arm.
* PART 3 — `set_channel_announcement_mode(channel_id, enabled)` is the **only** way to write
  the flag; `comm_channels_update` is still creator-or-channel-admin, so a client
  `.update()` silently changes nothing. Refusals arrive as `ERRCODE P0024` with a hint
  sentinel (`:412-470`, client side `src/lib/announcementChannel.ts`).
* The migration's own header records the pre-4b state: *"a coach toggled it on his phone, web
  members got the emoji-only banner, and mobile members typed freely and the database
  accepted it"* — i.e. the UI-only gap **was real and is closed**.
* Mobile mirrors it rather than owning it: `allowMemberText` starts `true` so no composer
  flashes, `isStaffHere` comes from the server's `is_channel_staff`, and `canSendText` gates
  the composer vs `LockedChannelNotice` (`TeamChatRoomScreen.tsx:176-205`,
  `src/components/chat/ChatInputBar.tsx:21`).

**No 🛡 HACKER RISK on the lock itself.** Two things to flag anyway:

* 🔧 **BROKEN FLOW — the flag's live value is UNKNOWN.** The server will refuse a member's
  post **only if `allow_member_text = false` on that row**, and the column is
  `BOOLEAN DEFAULT true`. Nothing in the repo ever sets it on `club-announcements`, and web's
  creation insert (`ClubMessagesTab.tsx:59-69`) does not pass it. **So club-announcements is
  very likely wide open today — any of its ~231 members can post to the whole club.** The
  one check: block 3 of A5 (`allow_member_text`). *Turning it off is a data write through
  `set_channel_announcement_mode` → not in this task's scope.*
* 🔧 Before 4b the Chat Info toggle was gated on `isStaffInTeam`, false for any chat with no
  team, so **club-announcements could never be switched from either app**. 4b re-gated it on
  `is_channel_staff` (`ChatInfoScreen.tsx:948-965`). Fixed, but it means the flag has had no
  way of being set until 2026-10-17 — which supports the paragraph above.

## B11. Push today, and what the title looks like

**The whole chain. PROVEN.**
1. `AFTER INSERT` on `comm_messages` → trigger `on_new_chat_message` →
   `public.notify_new_chat_message()`
   (`20260902090000_capture_drift_chat_registration_objects.sql:330-354`). Skips deleted or
   blank content. `net.http_post` to the edge function with exactly
   **`channel_id`, `sender_id`, `message_preview` (LEFT 100)** — note it sends **no channel
   name**. Any failure becomes a `WARNING`; the message still lands. The live function carries
   the project anon key; the repo ships `__ANON_KEY__`.
2. Edge function `notify-chat-message` (`index.ts` shell → `core.ts` flow).
   * `quietReason` drops the push for an archived channel / retired team (`core.ts:~400-420`).
   * Recipients = all channel members except the sender, **`excludeMuted: true`**.
   * Badge = per-recipient unread total.
   * Title: `chatContextName(channel, team?.name)`
     (`notify-chat-message/unreadRule.ts:274-294`) — a DM has no context; a team's **default**
     chat is titled by the **team** name; **any other named non-DM channel keeps its own
     name**.
   * Shape: `chatPushText` (`_shared/pushText.ts:277-296`) —
     iOS `title = context, subtitle = sender, body = message`;
     Android/Web `title = context, body = "<sender>: <message>"`.

**So a club-wide message pushes today as:**

```
iOS       club-announcements
          Lud Sanchez
          Practice moved to 6pm Saturday

Android   club-announcements
          Lud Sanchez: Practice moved to 6pm Saturday
```

🔧 **The title is the raw channel slug — "club-announcements", lower-case and hyphenated.**
That is `chatContextName` rule 3 taking the channel's own `name`. If the cards feature wants
"PAC Announcements" (or the club's name), that is a **one-arm change in
`chatContextName`** — `channel_type = 'club' AND is_default IS TRUE` → the **club's** name,
exactly as the `team` arm already does for teams. It needs the club name loaded in `core.ts`
(the function already loads the team row for the same purpose). **Edge-function deploy, no
store build, no schema.** ROUTINE.

**There is no per-message push toggle anywhere.** Push is unconditional on insert; the only
suppression is per-member `is_muted`. A compose-time "send push" switch therefore has
**no column to write and no branch to read** — see B12 row 7.

## B12. Smallest path to the mockup

Target: *feed of cards → tap → full message → emoji reactions only, no replies; admin
compose with title + message + audience + optional "Open the Playbook" button + push toggle.*

| # | Piece | Tier | Size | Ship via | Notes |
|---|---|---|---|---|---|
| 1 | **Fix the lookup** (Part A, option b) — `club-announcements` instead of `channel_type='broadcast'` | ROUTINE | ~25 lines, 1 file | store build | Blocks everything else. Do this alone, first. |
| 2 | **Announcements feed screen** — cards from `comm_messages` for that one channel; reuse `useMessages` | ROUTINE | new screen ~250-350 lines + 1 nav route | store build | `get_my_conversations` does **not** return `allow_member_text` or `is_default`, so the screen reads the channel row itself, as `TeamChatRoomScreen` already does |
| 3 | **Card title** — first-line convention + fallback to a content snippet | ROUTINE | ~15 lines, shared helper | store build | B7. The `title` column alternative is **SACRED** and can wait |
| 4 | **Detail view** — full message + reactions, **no composer, no reply** | ROUTINE | ~150 lines | store build | Reactions already work for members (B8); just don't render reply/swipe-reply |
| 5 | **Admin compose** — title + body, writes one `comm_messages` row | ROUTINE | ~150 lines; replaces the modal at `ChatScreen.tsx:2455-2615` | store build | Gate the entry on the server's `is_channel_staff`, the same answer the `msg_insert` policy uses — never on a client role list (FND-4d3) |
| 6 | **Audience** (All club / by team) | 🛡 **SACRED** | new table or N channels + a sync arm + RLS + a push fan-out change | migration + both apps | **No column exists for this.** Today's `broadcastToTeams` param is dead (A1). **Recommend: cut it from v1** — "all club" is what the channel already means, and it is what web does |
| 7 | **Push toggle** on compose | 🛡 **SACRED** (schema) **or** cut | needs a column on `comm_messages` + a read in `notify_new_chat_message()` | migration + edge deploy | B11: push is unconditional today. **Recommend: cut from v1**; members already control it per-chat with mute |
| 8 | **Push title** → the club's name instead of `club-announcements` | ROUTINE | one arm in `chatContextName` + a club-name load in `core.ts` | **edge deploy only** | Cheapest visible win on this list. No store build |
| 9 | **"Open the Playbook" button** | ROUTINE **but blocked** | ~20 lines once a route exists | store build | **A `thryvyng://playbook` link cannot work in a store build today — PROVEN.** The only deep-link path into the reader sits inside a `__DEV__` spread (`src/navigation/linking.ts:159-167`), iOS AASA and Android intent filters carry no `/playbook`, and `ChatBubble` does not linkify `thryvyng://`. Full write-up and the fix list: `docs/recon/playbook-share-links.md`. **In-app navigation from a card does work** — pass a flag on the message and `navigation.navigate('Main', {screen:'HomeTab', params:{screen:'Playbook'}})`, the route `routeNotification` already uses (`AppNavigator.tsx:1011-1042`). Storing *which* card it opens is item 3's title problem again |
| 10 | **Unread per card** | 🛡 **SACRED** | new per-member-per-message table | migration + both apps | B9: read state is per *channel*. **Recommend: cut** — one count for the feed, as the chat row shows now |

**Smallest shippable v1 (suggestion, Lu's call):** items **1 + 2 + 3 + 4 + 5 + 8**. All
ROUTINE, no migration, no new dependency. One store build plus one edge-function deploy.
Items 6, 7, 9 (the link form) and 10 are each a separate, gated slice — and three of the four
need schema.

---

## Open questions for Lu

1. **Audience picker: cut it or build it?** It is dead code today and honest-looking UI that
   does nothing. Cutting it is ROUTINE; building it is SACRED.
2. **Is `allow_member_text` false on PAC's club-announcements?** A5 block 3 answers it. If it
   is true, ~231 people can post club-wide right now.
3. **Card title: first-line convention (no migration) or a `title` column (SACRED)?**
4. **Push toggle and per-card unread: cut from v1?** Both need schema.

## EVIDENCE — files read

Mobile `689a04e`: `src/screens/ChatScreen.tsx` · `TeamChatRoomScreen.tsx` ·
`ChatInfoScreen.tsx` · `MessageReadHistoryScreen.tsx` · `src/lib/announcementChannel.ts` ·
`channelLeave.ts` · `realtimeHub.ts` · `src/utils/unreadRule.ts` ·
`src/components/chat/ReactionPicker.tsx` · `src/hooks/useMessages.ts` ·
`src/contexts/ChatUnreadContext.tsx` · `docs/ledger.md` ·
`docs/recon/{playbook-share-links,phaseC-audit,phaseB-mobile-cosmetics,deeplinks-audit}.md`

Web `df8dabe` (READ-ONLY): `supabase/migrations/{20260108184412,20260109195004,20260111220754,20260112025123,20260112233024,20260902090000,20261010204000,20261013053147,20261016120000,20261016150000,20261017032300,20261018170000,20261019040000}` ·
`supabase/functions/notify-chat-message/{index,core,unreadRule}.ts` ·
`supabase/functions/_shared/pushText.ts` ·
`src/{hooks/useChannels.ts,components/club/ClubMessagesTab.tsx,components/comm/ChatPanel.tsx}` ·
`docs/recon/{BF-dryrun-output.txt,chat_cleanup_apply.sql,chat_cleanup_apply_oct22.txt,stone-b2-rulings-and-live-facts-oct12.md}` · `docs/ledger.md`

---
---

# Follow-up audit — 2026-11-03 (second pass)

**Mode:** READ-ONLY. Static source only, plus **one read-only result Lu ran and pasted**
(§FC-1). No DB command was run here, no app run, no device test, no code changed.
**Repos read:** `thryvyng-mobile` @ `689a04e` · `thrive-and-score` @ `df8dabe` (READ-ONLY).

---

# Fact check

## FC-1. What Lu's query returned (Nov 3, 01:32)

| Field | Value |
|---|---|
| `id` | `500dad94-2914-44d6-a299-74623f4dd5ab` |
| `name` | `club-announcements` |
| `channel_type` | **`club`** — not `broadcast` |
| `is_default` | `true` |
| `allow_member_text` | **`false`** |
| `created_at` | `2026-01-09` |
| Belmont Club | **has its own row** |

## FC-2. Does the cause still hold? **YES — and it is now PROVEN twice over.**

The first pass argued the cause from the CHECK constraint alone (the row *cannot* exist).
Lu's read proves the stronger, simpler version: **the row that does exist is typed `club`,
and mobile asks for `broadcast`.** Those are different strings, so
`.eq('channel_type', 'broadcast')` matches it and nothing else. **PROVEN, from live data.**

Four claims from pass 1, re-checked against this result:

| Pass-1 claim | Status after FC-1 |
|---|---|
| §0.1 the lookup matches nothing | **PROVEN** (live). The constraint argument still stands and is now redundant |
| §0.4 the real club-wide chat is `club-announcements`, type `club`, `is_default` | **CONFIRMED verbatim**, id and all |
| §A2 creation is a web client-side side effect, not a migration | **CORROBORATED.** `created_at` = **2026-01-09**, one day after the chat tables were created (`20260108184412`) and the same day web's defaults-creation code landed. Two clubs, two rows — exactly what a per-club lazy auto-create produces |
| §A5 block 1 (`channel_type = 'broadcast'` → 0 rows) | **Still worth running once** — it is the one line that closes the question for good. Blocks 3 and 4 are now partly answered by FC-1 |

## FC-3. TWO corrections to pass 1

**① §B10's 🔧 flag is WITHDRAWN. The posting lock is ON.**
Pass 1 flagged that `allow_member_text` is `BOOLEAN DEFAULT true`, that nothing in either
repo ever sets it, and that **~231 members could therefore probably post club-wide**. That
inference was reasonable and it was **wrong**: the live value is **`false`**. So:
* the server's `msg_insert` arm (`channel_allows_member_text OR is_channel_staff`,
  `20261017032300_…sql:308-320`) **is biting today** — an ordinary member's text message to
  club-announcements is **refused by the database**, not merely hidden;
* mobile shows them `LockedChannelNotice` with the announcement banner, which is correct and
  not cosmetic;
* **"members can't post" needs no work.** It is already true, on the server, for the one
  channel the cards feature targets. The card feed inherits it for free.

**WHO set it, and when, is UNKNOWN.** No migration writes the column, and the only writer is
`set_channel_announcement_mode`, whose own gate (`is_channel_staff`) was not reachable for a
team-less chat from either app until slice 4b landed **2026-10-17** (§B10). So either someone
set it directly on prod, or a staff member used the Chat Info switch after Oct 17. The one
check that would tell us: nothing in the schema records it — there is no audit row for this
column. **Leave it as UNKNOWN; it does not block anything.**

**② The missing `club_id` filter is now a REAL defect, not a hypothetical one.**
Pass 1 (§A1) called the absent club filter a 🔧 "even if a row existed". With **two clubs
each holding their own `club-announcements`**, `.limit(1)` with no `club_id` and no
`ORDER BY` would hand a PAC admin **whichever row Postgres returned first** — plausibly
Belmont's. So the fix in §A5(b) must filter on the caller's club: it is **required for
correctness**, not a tidy-up. (RLS would refuse the *read* of another club's row for a
single-club admin, which masks the bug — but it would not for anyone holding `club_staff`
rows at both clubs, which is exactly the case `fetchClubTeams`'s `limit(1)` comment at
`ChatScreen.tsx:1596-1597` says exists.)

**Net effect on the recommended fix: unchanged, and now narrower.** Same file, same function,
same ~25 lines, still ROUTINE, still a store build. One clause more certain, one worry gone.

---

# Link buttons

**The ask:** can an announcement carry an admin-picked button whose destination comes from an
allow-list (playbook · playbook card · courses · calendar event), routed through the new
`playbook_open` / `courses_open` navigation?

## LB-1. The honest headline

**The navigation is ready. The storage is not.** Every destination on the allow-list already
has a working in-app route; **`comm_messages` has nowhere to put the destination** (§B7: no
title, no metadata, no jsonb). So this is a storage question wearing a navigation costume.

Second thing worth saying plainly: **`playbook_open` and `courses_open` are PUSH types, and
an in-app card button does not need them.** The comment at `AppNavigator.tsx:1068-1072` says
so itself — *"RECEIVING SIDE ONLY: nothing in this app sends either type yet"* — and
`docs/recon/announce-push-test.md` records that **no human has tapped either one**. A button
inside a card calls `navigation.navigate(...)` directly. The two push types matter only if a
*push* should carry the same button, which is a separate sender.

## LB-2. The four destinations, and what each already costs

All four are **client-side navigation that exists today**. PROVEN, with the exact shapes to
copy from `routeNotification`:

| Destination | Route that already exists | Cite | Catch |
|---|---|---|---|
| **Playbook (cover)** | `Main → HomeTab → Playbook` | `AppNavigator.tsx:1100-1110` | **Gated on `playbookVisible`**, which is `PLAYBOOK_LIVE \|\| __DEV__` and `PLAYBOOK_LIVE = false` — so in a **store build the screen is not registered at all** (ledger, PLAYBOOK-M4 row). The handler's own answer is to send such a viewer to the Dashboard (`:1104`). A card button must be **hidden**, not dead, in release until the flag flips |
| **Playbook card** | same route, `params: { card }` | `:1105-1110` | Key validation already written: **`ANNOUNCE_CARD_KEY = /^[A-Za-z0-9_-]{1,16}$/`** (`:167`), with the reader's own fallback to the cover for a key this viewer's book does not hold. **Reuse it — do not write a second validator** |
| **Courses** | `Main → HomeTab → Courses` | `:1101` | None |
| **Calendar event** | `nav.navigate('EventDetail', { eventId, onRefetch })` | `:1011`, `:1030`; screen registered three times (`:513`, `:677`, `:889`) | The event must still exist and be visible to the viewer — `EventDetail` is already the push target for `event`/`event_reminder`/`event_created`, so the "row is gone" case is already handled there (`:1014`) |

**So the allow-list is free on the navigation side.** The regex, the gate and the
nested-navigate shape are all written and in use.

## LB-3. Where the destination could live — three options, one recommendation

| Option | Uses existing fields? | Tier | Size | Honest assessment |
|---|---|---|---|---|
| **a. Sentinel line in `content`** | **Yes** — `content` is the only field with room | **ROUTINE** | S (~30 lines, one shared parser, both apps) | Cheapest and needs no migration. **The cost is real and must be said: `comm_messages` rows are rendered by BOTH apps.** Until web ships the same parser, a web viewer sees the raw marker as text. So it is ROUTINE × 2 repos, not ROUTINE × 1 |
| **b. Side table keyed by `message_id`** | No — new table | 🛡 **SACRED** | M | **This is the pattern the codebase already uses for exactly this problem.** `sv_chat_shares(message_id, survey_id, channel_id, posted_by)` is how a survey card carries its payload — written at `TeamChatRoomScreen.tsx:452-457`, read at `SurveyChatCard.tsx:52-64`. Invisible to any client that does not join it, so **web sees a plain message and nothing breaks**. Needs a migration + RLS |
| **c. New `message_type` value** | No — widens a CHECK | 🛡 **SACRED** | S | And the live value set is **UNKNOWN** — see LB-4 |

**RECOMMEND (suggestion):** **(b), the `sv_chat_shares` shape.** It is the one option that
does not make web render a marker it has never heard of, and it is a pattern this codebase
has already shipped once, so there is a working precedent to copy rather than a convention to
invent. It is SACRED, so it needs Lu's go — but it is a *new* table, which is the mildest
kind of schema change: nothing existing is altered, nothing is back-filled, and dropping it
later costs nothing.

If Lu wants zero schema in v1, **(a) works** — provided the marker is chosen so that a web
viewer seeing it reads as slightly odd rather than broken, and provided the web parser is
scheduled, not assumed.

## LB-4. Two drift facts this touched, both UNKNOWN, both worth one query

1. **`message_type` live CHECK is not what the repo says.** The repo's only definition is
   `CHECK (message_type IN ('standard','alert','system','poll'))`
   (`20260108184412_…sql:86-87`) and **no migration ever widens it**. But **both apps write
   `message_type: 'survey'`** — mobile `TeamChatRoomScreen.tsx:442`, web
   `TeamMessagesTab.tsx:502` — and web's own type union lists it
   (`src/types/communication.ts:62`). Either the live constraint was widened outside the repo
   or every survey share has been failing. **Survey-in-chat is a shipped feature, so
   INFERRED: the live CHECK includes `'survey'` and the repo is stale.**
2. **`sv_chat_shares` has no migration in either repo** — `grep -rln sv_chat_shares
   supabase/migrations/` returns nothing, yet both apps read and write it. Another prod-only
   object, same class as `archive_channel` (already on record in
   `thrive-and-score/docs/recon/stone-b2-rulings-and-live-facts-oct12.md`).

**One read-only query settles both** (Lu runs it):

```sql
-- What does the live message_type CHECK allow, and does sv_chat_shares exist?
select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.comm_messages'::regclass and contype = 'c';

select to_regclass('public.sv_chat_shares') as sv_chat_shares_exists;
```

This matters to the decision: if the live CHECK is already open-ended, option (c) gets
cheaper; if `sv_chat_shares` exists with usable RLS, option (b) has a policy to copy.

## LB-5. What each NEW destination costs later

| Kind of new destination | Cost |
|---|---|
| A screen that **already has a route** (Dashboard, Courses, EventDetail, Playbook) | allow-list entry + a navigate arm. **Client only → STORE BUILD** (no OTA: `expo-updates` is not installed, `docs/recon/playbook-share-links.md` §0.5) |
| A screen with **no route yet** (a specific course, a playbook chapter) | new route registration **+** the allow-list entry. Still client only → **STORE BUILD**, slightly larger |
| The same button **inside a push** | the **sender** is server-side → **edge deploy / web only**, no store build — *provided* the push `type` is one `routeNotification` already handles. `playbook_open` and `courses_open` are already handled (`:1068`), so those two are free; a brand-new type needs a new arm → **STORE BUILD** |

**Cheapest sequencing (suggestion):** ship the allow-list with **courses + calendar event**
first — neither is gated and both routes are live — and add the two playbook destinations in
the same release as the `PLAYBOOK_LIVE` flip, so the button is never visible-but-dead.

---

# Polls

## P-1. Tables

| Table | Key columns | Cite |
|---|---|---|
| `comm_polls` | `channel_id`, `created_by`, `question`, `poll_type` CHECK `single\|multiple\|ranked\|yes_no`, `allow_add_options`, `is_anonymous`, `show_results_live`, `ends_at`, `is_active` | `20260108184412_…sql:119-132` |
| `comm_poll_options` | `poll_id`, `option_text`, `sort_order`, `added_by` | `:135-142` |
| `comm_poll_votes` | `poll_id`, `option_id`, `user_id`, `comment` | `:145-…`; `selected_option_ids uuid[]` (`20260109044233`), `ranked_choices integer[]` (`20260109044651`) |

**Drift, UNKNOWN:** mobile writes `team_id` and `display_style` on `comm_polls`
(`src/hooks/usePolls.ts:307`, `:312`) and **neither column appears in any migration**. Two
more prod-only columns, same class as LB-4. Add to the query above if Lu wants them pinned:
`select column_name from information_schema.columns where table_name = 'comm_polls';`

## P-2. RLS — and one hole

| Policy | Rule | Verdict |
|---|---|---|
| `comm_polls_select` | member of the poll's channel | ok |
| `comm_polls_insert` | `created_by = auth.uid()` **AND** member of the channel | **membership only — not staff.** See P-4 |
| `comm_polls_update` | `created_by = auth.uid()` | ok |
| `comm_poll_options_select` | via the poll's channel membership | ok |
| `comm_poll_options_insert` | poll's creator, **or** `allow_add_options` + membership + `added_by = auth.uid()` | ok |
| `comm_poll_votes_select` | via the poll's channel membership | ok |
| `comm_poll_votes_insert` | **`WITH CHECK (user_id = auth.uid())` and nothing else** | 🛡 **HACKER RISK** |
| `comm_poll_votes_delete` | `user_id = auth.uid()` | ok |

All from `20260108184412_…sql:433-481`. **No later migration changes any of them** — the only
three other files mentioning `comm_poll_votes` add the two array columns and the realtime
publication, and slice 4i-polls changes **one REVOKE and nothing else** (its own header:
*"ONE LINE OF SERVER CHANGE … the rest of slice 4i-polls is client-side"*).

🛡 **`comm_poll_votes_insert` is the pre-4a reactions hole, still open.** Anyone signed in who
knows an `option_id` can insert a vote on any poll in any channel they are not a member of —
`SELECT` and `DELETE` are both scoped, `INSERT` is not. This is **byte-for-byte the shape
ruling Q2 A closed for reactions** on 2026-10-16: *"comm_reactions_insert is WITH CHECK
(user_id = auth.uid()) and NOTHING ELSE … so anyone signed in who knows a message_id can
attach a reaction to a chat they are not in"* (`20261016150000_…sql`). The fix would be the
same predicate 4a used, one policy, and **4a's file is a ready-made template** — including its
drop-every-INSERT-policy-by-name loop, which exists precisely because a prod policy may carry
a name the repo has never seen.

**PROVEN for the repo; INFERRED for prod** (live policy bodies not read). Proof query:

```sql
-- Live INSERT policies on the three poll tables. Expect comm_poll_votes to
-- show a with_check of just (user_id = auth.uid()).
select tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('comm_polls','comm_poll_options','comm_poll_votes')
order by tablename, cmd, policyname;
```

Out of scope for the cards feature — recorded here because this audit found it.

## P-3. Does the database allow a vote when `allow_member_text = false`? **YES. PROVEN.**

Slice 4b amended **one** policy: `msg_insert` on `comm_messages`
(`20261017032300_…sql:308-320`). Its own scope note says *"NO change to `is_channel_staff`,
`close_poll`, or anything else 4a or 4d created"* (`:163-164`), and
`channel_allows_member_text` is referenced by **nothing else** in any migration.
`comm_poll_votes_insert` has no `allow_member_text` test, no channel join and no staff test.

**So "a poll in the announcements channel, members voting but not posting" is already exactly
what the server does** — a vote lands, a text message is refused. Nothing needs changing for
it. And since `club-announcements` really is `allow_member_text = false` (FC-1), that is the
live behaviour today, not a plan.

## P-4. But: a member can create a poll there, and it half-works. 🔧 BROKEN FLOW

`comm_polls_insert` asks for **membership, not staff**. So any of the club-announcements
members can insert a poll row. What happens next is the interesting part — `createPoll` runs
**three separate statements, not a transaction** (`usePolls.ts:300-375`):

1. insert `comm_polls` → **succeeds** (membership is enough);
2. insert `comm_poll_options` → **succeeds**; (a failure here *is* rolled back, `:328-350`)
3. insert `comm_messages` with `message_type: 'poll'` → **refused by `msg_insert`** for a
   non-staff member in an announcement-only channel.

And step 3's failure is **deliberately not a rollback** (`:355-370`): the code returns
*"Your poll was created, but it could not be posted to the chat. Open Polls to share it."*
Result: a **live poll with options and no card**, reachable from the Polls list, votable by
anyone who can see it, invisible in the feed. Nobody is harmed, but it is a real
inconsistency and it would be reachable the moment any screen offers poll creation on this
channel.

**Today it is UI-gated, not server-gated.** The live gate is the server's `is_channel_staff`
(`TeamChatRoomScreen.tsx:705-710`, moved there by slice 4i, rulings I1/I2/I5 — ledger row
`906568b`). So the client asks the right question; the **database does not ask it at all**.

Also still on disk: `src/lib/permissions.ts:41-59`, `canCreatePollInChannel`, the old global
role list — and it still lists **`'broadcast'`** among its channel types, the same ghost as
the bug in Part A. Slice 4i left it unimported (ledger I7); `grep` confirms the poll path
does not use it. **Dead code, worth deleting in whatever slice next touches this file.**

## P-5. Verdict for the cards feature

| Question | Answer |
|---|---|
| Could a poll appear in the announcements channel? | **Yes, with no server work.** It is a `comm_messages` row with `message_type='poll'` + `poll_id`, and the card renderer already exists (`PollCard`, dispatched at `TeamChatRoomScreen.tsx:790-803`) |
| Members voting but not posting? | **Already the server's behaviour.** PROVEN, P-3 |
| Who may create one? | staff, per the client gate; **anyone, per the database** (P-4). If polls join the cards feature, gate the compose entry on `is_channel_staff` — the same answer `msg_insert` asks — and treat the server gap as a separate, optional hardening slice |
| Tier / size to show polls in the card feed | **ROUTINE, S** — one more branch in the feed's renderer, reusing `PollCard`. Store build |

---

# Club-wide events

**The ask (new):** can club directors/staff create ONE calendar event for the whole club,
on top of team events?

## CE-1. The one fact that decides this

```sql
-- 20260108184412_…sql:174
team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
```

**`cal_events.team_id` is NOT NULL.** PROVEN. So option (A) — "one club-level row with
`team_id` null" — **cannot be built without dropping a NOT NULL on the calendar's core
table**, and that NOT NULL is load-bearing in more places than it looks (CE-3).

`club_id uuid REFERENCES clubs(id)` **does** exist (`:175`, nullable) and **is populated** —
both clients derive it from the team and write it on every insert (mobile
`src/hooks/useCalendarEvents.ts:83-91`, `:142-153`; web `useCalendarEvents.ts:212-214`,
`:269-270`). But **no reader anywhere uses it as a scope.** It is a denormalised tag today,
nothing more.

## CE-2a. How events are scoped, and who can create

**Tables:** `cal_events` (`:172-200`), `cal_event_rsvps` (`:203-213`),
`cal_event_comments`, `cal_locations`.

**RLS on `cal_events`** (`20260108184412_…sql:505-515`):
```sql
cal_events_insert  WITH CHECK (created_by = auth.uid()
                     AND team_id IN (SELECT team_id FROM team_staff WHERE user_id = auth.uid()))
cal_events_update   USING (created_by = auth.uid()
                     OR team_id IN (SELECT team_id FROM team_staff WHERE user_id = auth.uid()))
```
**Team staff and no one else.** There is **no club-staff arm and no club-admin arm**. A club
director holding only `club_staff` rows **cannot insert a calendar event at all** — the
database refuses it. PROVEN for the repo; the live policy body was not read, so **INFERRED for
prod** (proof query in CE-5).

**Mobile client gate — REWRITTEN since the Oct 12 recon; read this, not that file.**
At `689a04e` the gate is one clause:

```ts
// CalendarScreen.tsx:416-418
// Staff on at least one active team is the whole gate -- All Teams included.
// The form asks which team, and RLS refuses anything staffTeams would not
// have offered, so hiding the + in All Teams only hid the feature.
const canCreate = staffTeams.length > 0;
```

`staffTeams` is `teams.filter(t => t.access_type === 'staff')`
(`useUserTeams.ts:401-405`), and `access_type === 'staff'` is set for every team that came
back from a **`team_staff` row** for this user — **any `staff_role`; the role string is never
compared**. The `+` render guard is `CalendarScreen.tsx:710-717`; the modal is handed
`teams={staffTeams}` with a **single**-select team field (`CreateEventModal.tsx:352-354`).

So, against the Oct 12 recon:
* its clause (b) — *"no `+` button in the All Teams view, for anyone"* — **is FIXED.** The
  `+` now shows in All Teams and the form asks which team. The old four-clause gate at
  `:409-413` **no longer exists**; `docs/recon/calendar-add-permission-oct12.md` §1 is stale
  on this point and its other findings should be re-read against `689a04e` before being
  relied on;
* the part that still holds, and the part this task cares about: **a club director with only
  `club_staff` rows and no `team_staff` row has `staffTeams.length === 0`, so no `+` on
  mobile — and `cal_events_insert` would refuse the write anyway.**

**Dead code, same file family:** `src/lib/permissions.ts:25-28` defines `canCreateEvent(role)`
accepting `club_admin` among others — **nothing imports it** (that recon's §2, re-confirmed
by grep). It is not the gate, despite the name.

**RSVP writes:** `cal_rsvps_insert WITH CHECK (user_id = auth.uid())` (`:525-526`) — 🛡 the
same unscoped-INSERT shape as `comm_poll_votes` (P-2), no event or team test. Noted, out of
scope.

## CE-2b. Does anything club-level exist already? **No. PROVEN, three readers checked.**

| Reader | Query | Cite |
|---|---|---|
| Mobile calendar | `.from('cal_events').select('*').in('team_id', teamIds)` where All-Teams = `teams.map(t => t.id)` | `CalendarScreen.tsx:170-185` |
| Web calendar | `.eq('team_id', teamId)` — one team at a time | `thrive-and-score/src/hooks/useCalendarEvents.ts:36` |
| ICS feed (edge) | `.select("*, teams:team_id(name)").in("team_id", teamIds)` | `supabase/functions/calendar-feed/index.ts:164-166` |

No `club_events` table, no `club_calendar` anything, in either repo (grep). Web has no
club-calendar page (`src/pages/club/` holds email logs, surveys, program check-in and team
assignment — no calendar). **An event with `team_id` NULL would be invisible in all three
readers.**

## CE-2c. What a club-level event would have to survive

| Surface | Mechanism today | What `team_id` NULL does to it |
|---|---|---|
| **Team filter / All Teams** | both built from `teams.map(t => t.id)` → `.in('team_id', …)` | **Event never appears.** All Teams is not "no filter", it is "the union of my teams" |
| **The `+` button** | needs a single non-All-Teams team selected | **No UI can create it** — the club-wide case is exactly the state the gate excludes |
| **RSVPs** | `UNIQUE NULLS NOT DISTINCT (event_id, user_id, player_id)` (`20261009210500_rsvp_attendance_integrity.sql:8`) → **one row per (event, adult, child)**. A parent of two kids RSVPs twice; `player_id` NULL is the adult-player/no-child case | Rows would insert fine, but `cal_rsvps_select` scopes **through the event's `team_id`** (`:518-523`) → **nobody can read them back** |
| **2-hour push reminder** | `get_event_reminder_recipients(event_id)` resolves `ev.team_id`, then UNIONs team staff + players' parent/adult emails **through that team** | **Zero recipients → no reminder is sent.** The function's own comment names the premise: *"cal_events.team_id is NOT NULL (20260108184412_...:174), so a found event always yields a team"* (`20261007090200_…sql:106-110`) |
| **Push title** | `eventPushText`: `title = team ? teamName + ' · ' + label : label` (`_shared/pushText.ts:171-198`) | Blank team → **bare label** ("Meeting in 2 h"), no club name, no context |
| **ICS feed** | `.in("team_id", teamIds)`, team name joined for the event summary | **Event absent from every subscriber's calendar** |

**That is six surfaces, three of them server-side (one RLS policy, one SECURITY DEFINER
function, one edge function).** This is the real cost of option (A), and it is why the
column being nullable-in-theory is not the same as club events being cheap.

## CE-2d. Options

### (A) One club-level row — `team_id` NULL, `club_id` set
**Tier 🛡 SACRED · Size L · migration + both apps + 2 edge functions**

Needs: `ALTER TABLE cal_events ALTER COLUMN team_id DROP NOT NULL` **plus** a club arm in
`cal_events_insert`, `cal_events_update`, `cal_rsvps_select`, `cal_comments_select` and
`get_event_reminder_recipients`; **plus** a second scope in the mobile fetch, the web fetch
and the ICS feed; **plus** a club arm in `eventPushText`; **plus** a new mobile create gate
(the current one cannot express "club-wide"). **Nine-plus sites, five of them server-side.**

Risks: every existing `.in('team_id', …)` reader **silently drops the event** rather than
erroring, so a half-done migration looks like it worked and the event simply never shows up.
Dropping the NOT NULL also removes the one invariant the reminder function documents as a
premise — a future reader joining through `team_id` inherits the bug with no warning.

**Honest verdict: this is the right end state and the wrong first step.**

### (B) Fan-out — one row per selected team, every row with `team_id` set
**Tier ROUTINE · Size M · NO migration · store build (mobile) + web deploy if web creates them too**

Nothing on CE-2c's list changes: the calendar shows it under each team, RSVPs scope and read
correctly, the reminder finds recipients, each push leads with the right team name, the ICS
feed carries it. **Zero schema, zero RLS, zero edge-function work.** The work is a team
picker plus a loop.

Risks, stated plainly:
* **Duplicate pushes. The main one.** A parent with kids on two selected teams is in both
  teams' recipient sets (`get_event_reminder_recipients` UNIONs players by `team_id`, and the
  UNION dedups *within* one event, not across events) → **N events = N pushes.** For a
  20-team club announcement to a two-kid family: 2 reminders, 2 created-notifications.
* **RSVP counts are per team.** Possibly a feature for a director ("how many from U12?"),
  definitely not one number for the club.
* **Editing one vs all.** N independent rows. Changing the time means N updates, and nothing
  ties them together — unless a grouping key is added:
  * `parent_event_id` **already exists** (`:195`, self-FK) — but it is **occupied by
    recurrence**, and `DeleteRecurringEventModal` reads it (web
    `src/components/cal/DeleteRecurringEventModal.tsx:50-69`). Reusing it would make a
    club event look like a recurring series to that modal. **Do not.**
  * a clean `club_event_group_id uuid` → 🛡 SACRED, Size S, but it is **one nullable column
    with no back-fill and no policy change** — the mildest schema change on this page.
  * **or no grouping in v1**: the director edits each copy. Ugly at 20 teams, fine at 3.

### (C) Other — two that cost less than either
* **(C1) Announcement only, no calendar row.** Post it to `club-announcements` as a card with
  the date in the text, and (via **Link buttons**) a button to **one** canonical team's event
  if one exists. **ROUTINE, Size S**, and it is *already most of the Part B build* — the only
  new piece is the date in the compose form. Buys: everyone hears about it, one push, one
  place to edit. Does not buy: it on anyone's calendar, RSVPs, or the 2-hour reminder.
* **(C2) Fan-out, driven by the Club-Wide Message picker.** Same as (B), with the audience UI
  reused. **Be clear about what "reuse" means here: that picker's wiring does not exist** —
  `broadcastToTeams` is written and read nowhere (§A1). The *UI* is reusable
  (`ChatScreen.tsx:2455-2615`); the *plumbing* would be written for the first time, for both
  features at once. That is an argument for doing it, not against — but it is not free.

## CE-3. Recommendation (a suggestion — Lu decides)

**(B) fan-out, no grouping key in v1.** ROUTINE · **Size M** · **store build** (mobile), plus
a web deploy only if directors should also create these from web.

Why: it is the only option that leaves all six surfaces in CE-2c working on day one, and the
only one with no migration. It also *reveals* the real requirement — if directors immediately
ask "why did this family get three reminders?" then (A) is worth its cost and we will know
that from use rather than from a guess.

**Pre-flag, per the side-effect rule — this also triggers:** one push per fan-out row to each
team's recipient set, so a multi-team family gets multiple notifications for one real event.
That is **not** a bug in the fan-out; it is the existing per-team push design meeting a
cross-team event, and Lu should agree to it before it ships.

**Sequence (suggestion):** (C1) with the cards feature → (B) when a director actually needs
it on the calendar → `club_event_group_id` (SACRED, S) only when editing N copies becomes the
complaint → (A) only if one-number RSVPs or single-push delivery becomes a requirement.

## CE-4. 🔧 Worth flagging regardless of which option is chosen

**The event form is single-team by construction.** `CreateEventModal` holds one
`selectedTeamId` and `chooseTeam` replaces it (`:352-354`); `teams.length <= 1` even collapses
the field to a label (`:778`). So **option (B)'s multi-select is new UI, not a prop change** —
and it is the same multi-select the Club-Wide Message modal draws but never wires (§A1). One
picker component would serve both, which is the strongest argument for doing (B) and the
announcement audience in the same slice rather than twice.

**Correction to the Oct 12 calendar recon, recorded here so it is not re-read as current:**
its headline finding (no `+` in All Teams) was fixed before `689a04e` — see CE-2a. The
no-empty-state-hint complaint went with it, because there is no longer a state to hint about.

## CE-5. Proof SQL for Part 4 (READ-ONLY — Lu runs it)

```sql
-- 1. Is team_id really NOT NULL, and is club_id populated on existing events?
select column_name, is_nullable, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'cal_events'
  and column_name in ('team_id','club_id','parent_event_id');

select count(*) as events,
       count(team_id) as with_team,
       count(club_id) as with_club
from public.cal_events;

-- 2. Live INSERT/UPDATE rules on cal_events — is there any club arm?
select policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename in ('cal_events','cal_event_rsvps')
order by tablename, cmd, policyname;

-- 3. How many teams would a PAC fan-out create rows for?
select cl.name as club, count(t.id) as active_teams
from public.clubs cl
left join public.teams t on t.club_id = cl.id and t.team_status = 'active'
group by cl.name order by cl.name;
```

Block 1 confirms CE-1 and tells us whether `club_id` is reliably filled (it is written by both
clients, but older rows are UNKNOWN). Block 2 confirms whether prod's policies match the
repo's team-staff-only rule. Block 3 sizes the duplicate-push risk in (B) with a real number.
