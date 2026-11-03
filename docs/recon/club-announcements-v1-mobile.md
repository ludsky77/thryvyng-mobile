# Club announcement cards — v1, mobile. What was built, and how Lu tests it

**Date:** 2026-11-03 · **Ruling:** Lu, 2026-11-03 01:57 — *"feed of cards → tap → full
message → emoji reactions only, no replies; staff compose with title + message + buttons +
live preview."* · **Release:** 1.0.20 · **Status:** `BUILT-UNCOMMITTED`.

**NOTHING HERE HAS BEEN TAPPED BY A HUMAN.** No simulator run, no device run, no `expo
export`. Every claim below is a typecheck, a lint run, a logic smoke against a stub client,
or a grep — named as such in § 6.

**TWO THINGS MUST HAPPEN BEFORE THE FEATURE WORKS, and neither is in this repo:**

1. **the server side must be APPLIED** (web repo, being prepared in parallel) — the `title`
   column, the `comm_message_actions` table and the `post_club_announcement` RPC;
2. **Lu must approve the announcement WORDING** before anything is sent to the real club
   channel, because ~231 PAC families receive a push for every row inserted there (§ 5).

Until (1) lands, the screens show **"Announcements are being set up"** rather than crashing
or drawing a feed with no titles and no buttons. That is a deliberate state, not a bug —
§ 3.4.

**Tags:** PROVEN = read in a file or measured, with a cite · INFERRED = reasoned, not run ·
UNKNOWN = needs the named check.

---

## 1. The contract this build was written against

**UPDATED 2026-11-03, SECOND PASS — these are now READ FACTS, not agreed shapes.** The
server side is written and **still unapplied**, but it exists as a file, so every line of
this table was read out of it rather than assumed:

* `~/Documents/thrive-and-score/supabase/migrations/20261103031500_club_announcements_v1.sql`
  (BUILT-UNAPPLIED) — the columns, the CHECK constraints, the grants, the RPC and all ten
  refusals.
* `~/Documents/thrive-and-score/supabase/functions/notify-chat-message/core.ts` — the push
  payload shape (`core.ts:170-181` for the `data` block, `core.ts:499,552` for the flag).

| Object | Shape, as the migration defines it | Who writes it |
|---|---|---|
| `comm_messages.title` | `text NULL` + `comm_messages_title_check`: `title IS NULL OR char_length(btrim(title)) BETWEEN 1 AND 80`. A titled message's `content` **is** `title \|\| E'\n\n' \|\| body`, composed server-side | the RPC only |
| `comm_message_actions` | `(id, message_id, kind, target, label, sort_order, created_by, created_at)`. `kind` CHECKed ∈ `{playbook, playbook_card, courses}`; `target` CHECKed — key-shaped `^[A-Za-z0-9_-]{1,16}$` for `playbook_card`, **NULL for the other two**; `label` CHECKed 1–40 after trim. `authenticated` holds **SELECT only** — INSERT/UPDATE/DELETE are REVOKEd, so nobody inserts directly even if a policy appeared | the RPC only |
| `post_club_announcement` | `(p_channel_id uuid, p_title text, p_body text, p_actions jsonb DEFAULT '[]') → uuid`. SECURITY DEFINER; EXECUTE granted to `authenticated` only. Gate order: signed in → channel exists → `is_channel_staff` → the chat is the club's default → not archived → title → body → every button. Refuses with **ERRCODE P0070–P0074 + a HINT sentinel** | — |
| push payload | `data: { type: 'chat_message', channel_id, sender_id, announcement?: true }`. The flag is present **only** for a club's default chat and omitted (not `undefined`) for every other, so other pushes are byte-for-byte unchanged | the edge function |

### 1.1 The limits, in one place

| What | The server's rule | Where mobile holds it |
|---|---|---|
| title | **required**, 1–80 after trim → P0073 `title_invalid` | `ANNOUNCEMENT_TITLE_MIN` / `_MAX` |
| body | required, 1–4000 after trim → P0073 `body_invalid` | `ANNOUNCEMENT_BODY_MAX` |
| button label | 1–40 after trim → P0074 `action_label_invalid` | `ANNOUNCEMENT_ACTION_LABEL_MAX` |
| buttons | at most 3 → P0074 `too_many_actions` | `ANNOUNCEMENT_MAX_ACTIONS` |
| card key | `^[A-Za-z0-9_-]{1,16}$` → P0074 `action_card_key_invalid` | `ANNOUNCE_CARD_KEY` |

### 1.2 THE TITLE IS REQUIRED — ruling, and the RPC agrees

Lu's ruling of 2026-11-03 and the function's own rule are the same rule: there is **no
branch in `post_club_announcement` that accepts a NULL or blank `p_title`**. An untitled
announcement is not a quieter card, it is a refusal that writes nothing.

The first pass sent `p_title: args.title.trim() || null`, which turned a blank field into a
round trip whose only outcome was P0073. **Fixed:** the write path sends the trimmed string
and never null, and compose keeps **Send disabled** until 1–80 characters survive the trim,
with the inline hint *"Add a title: it's what families see on the card."* The hint waits
until there is a message to send — a form that opens already complaining reads as an error
rather than as guidance. The live preview shows the title slot, never the body, because a
card previewed from the body is a card that cannot be posted.

### 1.3 The refusal map — all ten, from the migration's own text

The first pass carried **five invented sentinels** in the `close_poll` convention
(`title_too_long`, `body_required`, `actions_invalid`, plus two that happened to be right).
Three of them do not exist, so three of the function's refusals would have fallen through
to *"Could not send this announcement. Please try again."* whenever a layer in between
dropped the server's message. **Fixed:** `REFUSAL_HINTS` in `clubAnnouncementCards.ts` now
holds all fourteen HINT strings raised at migration lines 311–394, each with a plain
sentence.

| ERRCODE | HINT | The sentence mobile falls back to |
|---|---|---|
| P0070 | `not_signed_in` | Sign in to post an announcement |
| P0071 | `channel_not_found` | Chat not found |
| P0072 | `not_channel_staff` | Only a club admin or club staff can post announcements |
| P0071 | `not_club_announcements` | Announcements can only be posted to the club's announcements chat |
| P0071 | `channel_archived` | This chat is archived |
| P0073 | `title_invalid` | A title is required, up to 80 characters |
| P0073 | `body_invalid` | A message is required, up to 4000 characters |
| P0074 | `actions_not_array` | Buttons must be a list |
| P0074 | `too_many_actions` | An announcement can have at most 3 buttons |
| P0074 | `action_invalid` | One of the buttons could not be saved |
| P0074 | `action_kind_invalid` | One of the buttons has a type this app cannot send |
| P0074 | `action_card_key_invalid` | That Playbook card key is not valid |
| P0074 | `action_target_invalid` | One of the buttons has a destination it cannot take |
| P0074 | `action_label_invalid` | Each button label must be 1 to 40 characters |

**The ladder is unchanged and still matters:** the server's own `message` is preferred over
every row above, so the copy lives in ONE place — the function — and an eleventh refusal
added later still reads as a sentence. The map is only reached when a layer in between
dropped the message.

**Refusal vs "we could not ask"** is now decided by `isPostAnnouncementRefusal`: any of
`P0070–P0074`, `P0001` (a bare plpgsql RAISE) or `42501` (RLS), **or any HINT at all** —
`RAISE ... USING HINT` is something a function sets deliberately, while a dropped request
and a 500 carry none. A code-less, hint-less failure stays `status: 'error'` and keeps
"try again", which is the distinction `getClubAnnouncementsChannel` exists to protect
(§FC-3).

**Why `content` carries the title too.** `comm_messages` rows are drawn by **both apps**
(recon `club-announcements.md` §LB-3a). A web client that has never heard of the `title`
column renders the content, and the content reads correctly because the headline is its
first line. Nothing is hidden behind a marker.

**Why the client never inserts an action row.** One RPC = one transaction. Three separate
writes is exactly what leaves a poll with options and no card when the third is refused
(§P-4 of the recon, `usePolls.createPoll`). Here the message and its buttons both exist or
neither does.

---

### 1.4 CONTRACT SWEEP — every point checked against the migration and the edge function

Second pass, 2026-11-03. Each row was read in the server file and then in the mobile file;
"✅" means the two already agreed and nothing was changed.

| # | Contract point | Server says | Mobile | Verdict |
|---|---|---|---|---|
| 1 | RPC name | `public.post_club_announcement` | `supabase.rpc('post_club_announcement', …)` | ✅ |
| 2 | parameter names | `p_channel_id, p_title, p_body, p_actions` | the same four, named | ✅ |
| 3 | parameter types | `uuid, text, text, jsonb` | string, string, string, array | ✅ |
| 4 | **`p_title` nullability** | NULL raises P0073 `title_invalid` | sent `\|\| null` on a blank | **FIXED** — never null; trimmed string only |
| 5 | return type | `uuid` | `typeof data === 'string'` | ✅ |
| 6 | `p_actions` default | `DEFAULT '[]'::jsonb` | the builder always sends an array, `[]` when empty | ✅ |
| 7 | action object keys | reads `kind`, `target`, `label` per element | sends `kind, target, label, sort_order` | ✅ — see note (a) |
| 8 | **action ORDER vs `sort_order`** | `WITH ORDINALITY`: the ARRAY ORDER decides, the sent `sort_order` is **ignored** | the builder renumbers from the surviving order, so the two can never disagree | ✅ — note (a) |
| 9 | `kind` allow-list | CHECK `IN ('playbook','playbook_card','courses')` | `ANNOUNCEMENT_ACTION_KINDS`, same three, same order | ✅ |
| 10 | card-key shape | `target ~ '^[A-Za-z0-9_-]{1,16}$'` | `ANNOUNCE_CARD_KEY`, character-for-character the same | ✅ |
| 11 | `target` on other kinds | must be **NULL** (`comm_message_actions_target_check`) | the builder nulls it for every kind but `playbook_card` | ✅ |
| 12 | **`label` length** | CHECK 1–40 after trim | only non-blank was tested in the lib | **FIXED** — `isSendableAction` enforces ≤ 40; the input's `maxLength` now uses the constant |
| 13 | **`p_body` length** | 1–4000 after trim | no ceiling anywhere | **FIXED** — `ANNOUNCEMENT_BODY_MAX`, input `maxLength`, Send gated, counter near the limit |
| 14 | title length | 1–80 after trim | `ANNOUNCEMENT_TITLE_MAX = 80` | ✅ |
| 15 | button count | `> 3` raises `too_many_actions` | `ANNOUNCEMENT_MAX_ACTIONS = 3`, builder slices first | ✅ |
| 16 | `comm_message_actions` columns read | `message_id, kind, target, label, sort_order` all exist | `select('message_id, kind, target, label, sort_order')` | ✅ |
| 17 | action ordering on read | index is `(message_id, sort_order)` | `.order('sort_order', { ascending: true })` | ✅ |
| 18 | title column name | `comm_messages.title` | `Message.title`, and `useMessages`' `select('*')` returns it | ✅ |
| 19 | content composition | `title \|\| E'\n\n' \|\| body` | `splitAnnouncement` strips exactly `title + "\n\n"`, and keeps the content whole when it is not a prefix | ✅ |
| 20 | **refusal ERRCODEs** | P0070–P0074 | matched `P0001`/`42501`/any hint | **FIXED** — P0070–P0074 matched explicitly, P0001 and 42501 kept |
| 21 | **refusal HINTs** | 14 sentinels, § 1.3 | 5, three of them invented | **FIXED** — all 14, read from the migration |
| 22 | which chat | `channel_type = 'club' AND is_default`, not archived | `getClubAnnouncementsChannel` asks for exactly that, `is_archived = false` | ✅ |
| 23 | who may post | `is_channel_staff(chat, caller) IS NOT TRUE` refuses | every gate calls `isChannelStaff`; no client-side role list | ✅ |
| 24 | push data key | `data.announcement = true`, club default chat only | `AppNavigator` reads `data.announcement`, truthily (`true`/`'true'`/`1`/`'1'`) | ✅ |
| 25 | push type key | `data.type = 'chat_message'` | the `chat_message` branch | ✅ |
| 26 | push channel key | `data.channel_id` | `data.channel_id ?? data.chat_id ?? data.reference_id` | ✅ |
| 27 | missing-object codes | `42883` / `PGRST202` are what an unapplied RPC returns | both in `CONTRACT_MISSING_CODES` | ✅ |
| 28 | direct insert | INSERT/UPDATE/DELETE **REVOKEd** from `authenticated` | the client never inserts an action row; the RPC is the only door | ✅ |

**22 points already matched; 6 were mobile-side mismatches and all 6 are fixed.** Four of
the six (#4, #12, #13, #21) would have cost a user a refusal the composer could have
prevented; #20 and #21 together are the pair that would have printed "try again" for a
rule the server had already explained.

**(a) The `sort_order` mobile sends is dead weight, deliberately left in.** The RPC
assigns `sort_order` from `WITH ORDINALITY` and never reads the key out of the payload, so
the field is ignored. It stays because the builder's job is to emit the row shape the
*table* holds, the two values are provably equal (the builder numbers from the same
surviving order the array carries), and a reader comparing the payload to the table should
not have to wonder where `sort_order` went. An extra key in a jsonb object cannot refuse:
the function only does `->>` on the three names it wants.

**Not a mismatch, worth recording:** the migration lets a member of an OPEN chat insert
their own message *with a title* (`msg_insert` is not gated on `title`) — the migration's
PART 1 comment calls it a known, accepted edge. In club-announcements only staff can
insert at all, so it changes nothing here.

---

## 2. Files

### New

| File | Lines | What it is |
|---|---|---|
| `src/constants/announceCardKey.ts` | 44 | `ANNOUNCE_CARD_KEY = /^[A-Za-z0-9_-]{1,16}$/` + `isAnnounceCardKey`. **Moved** out of `AppNavigator.tsx`, where ruling B had put it, so the push branch, compose and detail share **one** definition. A leaf: imports nothing. |
| `src/lib/clubAnnouncementCards.ts` | 482 | The whole client/server contract: the title split, the action allow-list, the jsonb builder, the "is the server applied?" probe, the one write and its refusal copy. |
| `src/screens/AnnouncementsFeedScreen.tsx` | 781 | The card feed. |
| `src/screens/AnnouncementDetailScreen.tsx` | 462 | One announcement in full. |
| `src/screens/ComposeAnnouncementScreen.tsx` | 706 | Staff compose + live preview. |

### Changed

| File | Change |
|---|---|
| `src/navigation/AppNavigator.tsx` | three routes registered in **ChatStack** (lazy); the chat push branch routes `announcement: true` to the feed; the card-key regex now imported from the constant |
| `src/screens/ChatScreen.tsx` | the club's default club chat row opens the feed; the Club-Wide Message tile opens compose; the temporary `'club'` step and its 11 orphaned styles deleted; one dead `broadcast` arm removed |
| `src/types/index.ts` | `Message.title?: string \| null` added; `broadcast` removed from `Channel.channel_type` |
| `src/lib/permissions.ts` | dead `canCreatePollInChannel` deleted (it carried the same ghost `broadcast` string) |

**Net in `src/`:** +2,475 new lines, +269/−199 in the four changed files.

---

## 3. The four screens, and the decisions inside them

### 3.1 Feed — `AnnouncementsFeed`

* **Which channel.** `channelId` when the caller has one (the chat-list row, a push tap,
  compose). Otherwise `clubId` and the ONE shared lookup
  `getClubAnnouncementsChannel` — `channel_type = 'club' AND is_default AND club_id = …`,
  **never a name** (`src/lib/clubAnnouncements.ts`, recon §FC-1).
* **Reuses `useMessages` whole**, rather than growing a second message fetch. Realtime
  inserts, the reaction reconcile and the edit/soft-delete UPDATE stream all come with it,
  and `select('*')` returns `title` the moment the column exists.
* **Newest first, grouped `This week` / `Earlier`.** "This week" is the reader's own
  calendar week (`startOfWeek`), not a rolling seven days — a heading that says *This week*
  on a Monday must not still be showing last Tuesday.
* **Card** = title (or the first ~80 characters, for anything posted before the column
  existed) · date (`Today` / `Yesterday` / `Tue, Oct 7`, the app's existing day formatter) ·
  sender name + role · a read-only reaction summary. A tap on a reaction chip opens the
  card rather than reacting, so scrolling cannot leave a reaction behind.
* **The NEW badge is a SNAPSHOT, and it has to be.** Read state in this app is per
  **channel**, never per message (recon §B9; a per-message table is SACRED and bigger than
  the rest of this feature put together). So `last_read_at` is captured **once, when the
  screen opens, BEFORE the channel is marked read** — afterwards the stamp is `now()` and
  nothing could be told apart. The badge rule is the server's own:
  `user_id <> me AND created_at > COALESCE(last_read_at, now() - 30 days)`, so a badge and
  the chat list's unread count cannot disagree. **Reopening the feed is a new snapshot**,
  which means badges clear on the second visit — exactly as the row's unread count does
  today.
* **All / New filter.** `New` counts and shows only what that rule marks unread.
* **Polls keep the card they already have** — one branch, the existing `PollCard`, no
  second renderer and no extra query (recon §P-5).
* **Mark-read is the existing way**: `comm_channel_members.last_read_at` + the immediate
  `requestChatUnreadRefresh()`, on open and on every focus, copied from
  `TeamChatRoomScreen`.

### 3.2 Detail — `AnnouncementDetail`

* **No composer, no reply, no swipe-reply.** That is the ruling, and it is also what the
  server already does: `club-announcements` is `allow_member_text = false` live, so
  `msg_insert` refuses a member's text while `comm_reactions_insert` accepts their reaction
  on membership alone (recon §B8, §B10, both PROVEN). The screen simply does not draw the
  controls the server would refuse.
* **Reactions reuse the existing path whole**: `useMessages.toggleReaction` (paint →
  persist → rollback → reconcile) and `ReactionPicker` (six quick emoji, 30 behind its
  "+"). Long-press a chip for the existing who-reacted list.
* **It loads the channel, not one row.** `useMessages` is the only reader in this app that
  keeps a message's reactions correct while it is on screen. The cost is the same 100-row
  page the chat room fetches, and the feed can only offer a card inside that page.
* **Buttons are in-app navigation**, the nested `Main → HomeTab → <screen>` shape
  `routeNotification` already uses. **No `thryvyng://` URL is involved** — that path does
  not work in a store build (`docs/recon/playbook-share-links.md`).

### 3.3 Compose — `ComposeAnnouncement`

* **The door is the server's answer.** `is_channel_staff` decides whether a form is drawn
  at all — the predicate `msg_insert` asks (ruling FND-4d3), never a client role list. The
  tile in `ChatScreen` is *additionally* gated on `isClubAdmin`; that keeps it out of a
  parent's modal and is **not** the permission.
* Title (≤ 80, live counter) · message · **up to 3 buttons** from the allow-list
  (Playbook / a Playbook card by key / Courses) · a **live preview card** built from the
  same two strings the feed will split apart · an optional **Add a poll**.
* **A card key is validated as you type** against the shared pattern. Whether a card by
  that key exists, and whether a given viewer's book holds it, is the **reader's** question
  and is deliberately not asked here — `PlaybookScreen` opens the cover for a key it does
  not hold, against the book that viewer was actually served under RLS.
* **Send is ONE call.** Buttons that are still incomplete block the send with a plain
  sentence rather than being silently dropped.
* **"Add a poll" is a SECOND message, deliberately.** It opens the existing
  `CreatePollModal` on this same channel, which posts its own `message_type = 'poll'` row
  and renders through `PollCard` in the feed. Folding a poll into the RPC is a server
  change nobody has ruled on.
* Sent → a success state → **Back to announcements** lands on the feed whichever door
  opened compose.

### 3.4 "Announcements are being set up" — the one state that exists for the gap

Shown when, and **only** when, the server replies with one of these codes:

```
42703  undefined_column    comm_messages.title
42P01  undefined_table     comm_message_actions
42883  undefined_function  post_club_announcement
PGRST202 / PGRST204 / PGRST205   PostgREST's schema-cache equivalents
```

**Everything else keeps its own sentence.** An RLS refusal (`42501`), a 500 and offline are
**not** "being set up" — telling someone a feature is being installed when the truth is *we
could not reach the server* is the exact mistake `getClubAnnouncementsChannel` was written
to stop making (recon §FC-3). The feed probes once on open (two of the cheapest possible
reads); compose finds out from the RPC itself.

---

## 4. Entry points — all four, and the grep that shows each one

| # | Door | Lands on | Cite |
|---|---|---|---|
| 1 | the chat-list row for the club's default club chat | `AnnouncementsFeed` | `ChatScreen.tsx` `handleConversationPress`, `clubDefaultChannelIds.has(conversation.id)` |
| 2 | the **Club-Wide Message** tile | `ComposeAnnouncement` | `ChatScreen.tsx` `openClubAnnouncementCompose` |
| 3 | a push tap carrying `announcement: true` | `AnnouncementsFeed` | `AppNavigator.tsx`, the chat branch of `routeNotification` |
| 4 | the feed's ✎ button (staff only) | `ComposeAnnouncement` | `AnnouncementsFeedScreen.tsx` |

**Row 1 is identified by the ROW, not the name** — the shared `isDefaultClubChannel`
(`channel_type = 'club' AND is_default = true`, `src/lib/channelLeave.ts`). Default channels
have been renamed before, and the club's other seeded channel `coaches-lounge` is private
and not default, so it can never be matched. `get_my_conversations` is not known to return
`is_default`, so the ids come from one extra read; **a failed read leaves the set empty and
the row opens the chat room**, which is what it did before this feature.

**Row 3 inherits all three tap states for free** — foreground, background and **cold start**
— because it sits inside `routeNotification`, the single door `handleResponse` and the
pending-tap flush both go through (the cold path added in `c3924b4`). `"true"` is accepted
as well as `true`: a remote push's `data` values arrive as strings
(`docs/recon/announce-push-test.md`), so a boolean-only test would work on the simulator and
nowhere else.

**🔧 PRE-EXISTING HOLE, not created or fixed here:** a push tap by a **signed-out** user is
still `reset()` to `Welcome` by the auth guard, losing the destination — true for all ten
push types (`docs/recon/playbook-share-links.md` § 1).

---

## 5. TEST PLAN FOR LU — simulator, one small step at a time

**Read this first.**

* **Do NOT send anything to the real club channel until § 5.D.** Every row inserted into
  `club-announcements` fires the `comm_messages` trigger and pushes **~231 PAC families**
  (recon §B11). Push is unconditional on insert — there is no per-message switch and no
  column to write one into. **Lu approves the wording before a single send.**
* Steps A–C **send nothing** and are safe to run today, before the server is applied.
* Nothing in this plan requires a database command. If a step needs one, it says so and
  stops.

### 5.A — Before the server is applied (safe, sends nothing)

| Step | What to tap | What you should see |
|---|---|---|
| A1 | Start Metro, open the app, go to the **Chat** tab | the list as it is today — the announcements row still there, same tan dot, same unread count |
| A2 | Tap the **club announcements** row | **not** the chat bubbles any more: a screen headed with the channel's name and the club's name underneath, and, since the server is not applied, **"Announcements are being set up"** |
| A3 | Tap **back** | the chat list, unchanged. The row's unread count has dropped to zero — opening the feed marks the channel read exactly as opening the chat did |
| A4 | Tap **+ / New chat → Club-Wide Message** | the tile's line reads *Opening…* for a moment, then the **New announcement** screen. If it says *This club has no announcements chat yet* or *Couldn't reach the server*, stop and report which one |
| A5 | On **New announcement** | a spinner, then either the form or *Only a coach, manager or club admin of this chat can post an announcement*. On Lu's account it should be the **form** |
| A6 | Type a title, then keep typing past 80 characters | the counter turns red and the box stops accepting at 80 |
| A7 | Type a message. Watch the **Preview** card | the preview's headline follows the title, or the message when there is no title |
| A8 | Tap **+ Playbook card**, leave the key empty | a red box and *Letters, numbers, _ and - only, up to 16 characters*; the **Send** button is greyed out and the form says one button still needs its card key |
| A9 | Type `F3` into the key | the red clears, the hint reads *Opens the book on this card*, **Send** becomes available |
| A10 | Type `F3/../F4` instead | red again, Send greyed out again. **This is the test that matters most on this screen** |
| A11 | Add a third and a fourth button | after the third, the **+ Playbook / + Playbook card / + Courses** chips disappear — three is the ceiling |
| A12 | Tap **Send announcement** | **"Announcements are being set up"**, and **nothing is sent**. ← the whole point of step A: the app does not crash and does not post a half-made announcement while the server is behind |

**If any of A1–A12 differs, stop and report the step number.** Nothing here writes
anything except A3's mark-read, which is the same write opening the chat has always made.

### 5.B — After the server is applied, with NOTHING sent (safe)

Run this the moment the web side is applied, **before** writing any real announcement.

| Step | What to tap | What you should see |
|---|---|---|
| B1 | Open the feed again (A2) | **the cards**, not the "being set up" state. Every existing message in that channel appears as a card whose headline is its first ~80 characters — they have no `title`, and that is correct |
| B2 | Look at the headings | `THIS WEEK` above anything from this calendar week, `EARLIER` below |
| B3 | Tap **All / New** | `New` shows only what you had not read; it is probably empty, because A3 marked the channel read |
| B4 | Tap any card | the full message. **No text box, no Reply, no swipe-to-reply anywhere on this screen** |
| B5 | Tap the ☺+ and pick 👍 | the emoji appears immediately with a count of 1 and a purple outline |
| B6 | Tap your own 👍 chip | it disappears again |
| B7 | **Long-press** a chip with a count on it | the existing who-reacted list |
| B8 | Tap back, then open the same card again | the reaction is still there — it was really written |

### 5.C — A real send, to a channel that is NOT the club's (safe)

**Only if Lu wants a live send proved before the real one.** This needs a throwaway club
channel, which is a **database write** and therefore **NOT this session's to make** — it is
a decision for Lu and the planning room. If there is no such channel, skip C and go to D
with the wording approved.

### 5.D — The real send. ONLY after Lu approves the wording

| Step | What to tap | What you should see |
|---|---|---|
| D1 | **Lu writes the exact title and message and approves them.** Nothing before this | — |
| D2 | **Say out loud who gets it:** every member of `club-announcements` — ~231 people — each getting a push. There is no per-message push switch | — |
| D3 | Compose it, check the Preview reads the way Lu wants, tap **Send announcement** | *Announcement sent*, then **Back to announcements** |
| D4 | On the feed | the new card at the top, under `THIS WEEK`, with its title as the headline |
| D5 | Tap it | the title once at the top and the body under it — **the title must not appear twice** |
| D6 | Tap a button on it | the Playbook (on the card, if a card key was used) or the Courses screen, with the tab bar still on screen and a way back |
| D7 | On a second device/account that is a member | the push arrives; tapping it opens **the feed**, not the chat bubbles. **This needs the sender to include `announcement: true`** — until it does, the tap opens the chat room, which is correct behaviour for a payload with no flag |

### 5.E — Still owed after all of the above

* **A real poll from compose** (`Add a poll` → the existing poll creator) — untested on
  device in this build.
* **A non-staff account opening the feed**: no ✎ button, and no way to reach compose.
* **The club-less and the two-club staff cases** of the Club-Wide Message tile.
* **`announcement: true` end to end**, which needs a sender that does not exist yet.

---

## 6. What was actually verified here, and how

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | **5 errors = baseline**, all pre-existing in `src/components/games/*`; **0 in any touched or new file** |
| `eslint` on the 5 new files | **0 errors, 0 warnings** |
| `eslint` on the 4 changed files | **0 errors**; warnings unchanged vs HEAD — ChatScreen 79 → 79, AppNavigator 23 → 23, types 1 → 1, permissions 0 → 0 |
| logic smoke, **120 assertions** | **ALL PASS, 0 failures** (second pass, 2026-11-03). The pure helpers transpiled with the project's `tsc` under `strict` and run against a **stub** client — nothing left the process, no network, no database. Ten groups: title split 13, compose round trip 5, action allow-list 10, jsonb builder 6, contract-missing codes 10, refusal copy ladder 3, queries built 14, **NEW** title-required 7, **NEW** full error map 44, **NEW** migration limits 8. The first-pass harness was never committed, so these rebuild its 38 documented cases (more finely counted) and add 59. New coverage: `p_title` is never null and never a non-string; a blank title sends `''`; an 80-char title survives whole; all 14 HINT sentinels map to their own sentence; each of P0070–P0074 is a refusal even with the hint stripped; an unseen hint is still a refusal; a code-less hint-less failure is `error`, not `refused`; `title_invalid` end-to-end returns the server's sentence; a message-less refusal falls to the map; `42883` is `setup_pending`, not a refusal; offline is `error`; the body/label/action ceilings are 4000/40/3; a 41-char label is dropped and a 40-char one is kept; the kind list equals the CHECK constraint |
| greps | every entry point routes to the new screens (§ 4); `grep -rn canCreatePollInChannel src/` → the definition only, before deleting it |
| simulator / device / `expo export` | **NONE.** Nothing was tapped |
| cross-repo reads | READ-ONLY, nothing written: the migration, `notify-chat-message/core.ts`, and `docs/recon/club-announcements-v1-server.md` |

**THE SMOKE HARNESS IS NOT IN THE REPO.** It is rebuilt each session in the scratchpad and
run from there — this pass at
`/private/tmp/claude-501/-Users-ludsanz-Documents-thryvyng-mobile/c55e0d1a-2e9b-4c8d-9ced-2c2a1ef73627/scratchpad/smoke/run.js`,
with a stub `supabase` that records every call and a `tsconfig.json` that transpiles the
three real source files unchanged. That path is **session-scoped and will be gone**, which
is precisely why the first pass's 38 cases had to be reconstructed from this document's
prose rather than re-run. See the RECOMMEND in § 7.

**`grep "'broadcast'" src/` → 1 hit, and it is prose:** `src/lib/clubAnnouncements.ts:5`,
the module header explaining the defect that file was written to fix. Every executable
occurrence is gone — the `Channel.channel_type` union, `getChannelColor`'s arm, the
`channel_type IN (…)` filter and `canCreatePollInChannel`. (`grep -rn
canCreatePollInChannel src/` now returns two hits, both inside the comment that records
the deletion.)

---

## 7. FOUND outside scope, and RECOMMEND

* **`src/lib/permissions.ts` is entirely unimported.** `canCreatePollInChannel` was deleted
  here because the ruling named it; `STAFF_ROLES`, `canCreatePoll`, `canCreateEvent` and
  `isStaffRole` are **also** unimported (`grep -rn "lib/permissions" src/` → 0 hits outside
  a comment). **RECOMMEND (a suggestion):** delete the file in whatever slice next touches
  client-side role checks. Not done here — it is outside the ruling.
* **🛡 `comm_poll_votes_insert` is still the pre-4a reactions hole** —
  `WITH CHECK (user_id = auth.uid())` and nothing else, so anyone signed in who knows an
  `option_id` can vote in a poll in a channel they are not in (recon §P-2, and slice 4a's
  own file is a ready-made template for the fix). Untouched by this build, and it matters
  more now that polls can appear in a club-wide feed. **SACRED — Lu's call.**
* **The card's reaction chips are read-only.** The mockup shows a summary, and reacting from
  a scrolling list is easy to do by accident. **RECOMMEND:** leave it; revisit only if Lu
  asks for one-tap reacting from the feed.
* **No per-card unread, and no push toggle.** Both need schema (recon §B9, §B12 rows 7 and
  10) and both were cut from v1. The feed carries ONE unread count, the one the chat list
  row already shows.
* **🔁 THE LOGIC SMOKE HAS NO HOME IN THE REPO, and it cost this session real work.**
  The first pass's 38 assertions lived in a scratchpad that no longer exists, so this pass
  rebuilt them from § 6's prose before it could add to them. The repo has **no test
  infrastructure at all** — no `scripts/`, no jest, no `test` script in `package.json` — so
  putting it somewhere is a new pattern, not a routine choice, and it is not in this
  ruling. **RECOMMEND (a suggestion, Lu's call):** commit the harness as
  `scripts/smoke/clubAnnouncements.js` plus its stub and `tsconfig`, and add a
  `npm run smoke:announcements` script. **It needs no new dependency** — it runs on the
  `typescript` and `node` already installed. The payoff is that "re-run the smoke" becomes
  a command instead of a reconstruction. **It is NOT free:** it is the repo's first test
  file, and the first one sets where the next twenty go.
* **The push title is still the raw channel slug** — `club-announcements`, lower-case and
  hyphenated (recon §B11, §B12 row 8). It is a **one-arm change in `chatContextName`** in
  the edge function, **no store build**, and it is the cheapest visible win left on this
  feature. Not in this repo.
