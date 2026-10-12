# Recon — Stone B badge freshness check at HEAD

**Date:** 2026-10-10 · **Mode:** READ-ONLY. No file under `src/` or app config was touched.
**Repo:** `thryvyng-mobile` @ `95821b2` (branch `main`, clean before and after).
**Purpose:** refresh `docs/recon/badge-counters-mobile-oct09.md` so the Stone B build
prompt can cite current `file:line`.

**Sibling repo read (read-only, nothing written):** `thrive-and-score` @ `cc2e848` —
`docs/recon/badge-counters-web-oct09.md` and `supabase/functions/notify-chat-message/index.ts`.

**Base-commit note:** the prompt cites the Oct 9 recon as written at `27e8a6a`. `27e8a6a`
is the commit that *added* the doc; the doc's own header says it was read at `7273de3`,
which is `27e8a6a`'s parent. The two commits have identical `src/` trees, so the diff
used throughout below is `7273de3..HEAD`. Both resolve to the same answer.

---

## 1. Which Oct 9 `file:line` references moved

Six commits landed since the recon's base. `git diff --stat 7273de3..HEAD` touched 30
files; only **6** of them are cited by the badge recon:

| File | Cited lines (Oct 9) | Current lines (HEAD) | Why |
|---|---|---|---|
| `src/navigation/AppNavigator.tsx` | `:167` (hook call), `:219` (tabBarBadge), `:962` (addNotificationListeners) | **`:169`**, **`:221`**, **`:967`** | `MessageReadHistory` route added (+6), `Attendance` route removed (-3), lazy import swapped (+2) |
| `src/screens/TeamChatRoomScreen.tsx` | `:142-154` (markChannelAsRead), `:162` (useMessages), `:136` (missedCount) | **`:147-158`**, **`:168`**, **`:140`** | reply/quote + edit + read-history work in `95821b2` |
| `src/screens/DMChatScreen.tsx` | `:120-131` (markChannelRead), `:140` (useMessages), `:106` (missedCount) | **`:122-133`**, **`:142`**, **`:108`** | same commit |
| `src/types/index.ts` | `:36` (`last_read_at: string`) | **`:36` — unchanged** | file changed elsewhere; this line did not move |

**Behavioural change inside those moves:** both screen writers no longer use the
`if (error && __DEV__) console.warn` pattern. They now call `logError(...)`
(`TeamChatRoomScreen.tsx:156`, `DMChatScreen.tsx:131`). The Oct 9 note "both screen
writers log failures in `__DEV__` rather than throwing" is **stale** — they log in
release builds too now.

### Unchanged since the recon — every cited line still correct

Not in the diff at all, so all Oct 9 line numbers for these hold at HEAD:

`ChatScreen.tsx` · `useTotalChatUnread.ts` · `NotificationContext.tsx` ·
`NotificationBell.tsx` · `NotificationsScreen.tsx` · `useChannelMembers.ts` ·
`services/notifications.ts` · `useUserTeams.ts` · `AuthContext.tsx` ·
`ClubAdminDashboard.tsx` · `QuickActionsCard.tsx` · `CoachDashboard.tsx` ·
`usePendingStaffRequests.ts` · `ScreenHeader.tsx` · `DashboardScreen.tsx` ·
`registration/ProgramRegistrationScreen.tsx`

Spot-verified at HEAD rather than assumed: `ChatScreen.tsx:210-217` (per-card badge),
`ChatScreen.tsx:329` + `:343` (RPC + `unread_count`), `NotificationBell.tsx:24-28`,
`NotificationsScreen.tsx:332`, `types/index.ts:36`.

One cosmetic drift: the Oct 9 doc writes the ChatScreen row-split as `:414-421`. At HEAD
the `rows` filter is `:415` and the split is `:416-421`; `:414` is the comment line. The
doc's range was approximate, not wrong.

---

## 2. ChatScreen activeTeams / pastTeams channel filter (from `6f5e38a`)

**Still present and unchanged.** `ChatScreen.tsx` is not in the diff since the recon base.

| What | Line at HEAD | Was (Oct 9) |
|---|---|---|
| `useUserTeams()` destructure | `src/screens/ChatScreen.tsx:247` | 247 |
| `allTeams = [...activeTeams, ...pastTeams]` | `:248` | 248 |
| `activeTeamIds` set | `:338` | 338 |
| `pastTeamIds` set | `:339` | 339 |
| archived rows dropped | `:415` | ~414 |
| `activeRows` filter | `:416-418` | 416-418 |
| `pastRows` filter | `:419-421` | 419-421 |
| results written to state | `:430-431` | — |
| `fetchConversations` deps | `:438` | 438 |

### Everything else that reads those lists

Inside `ChatScreen.tsx` (complete, `grep -n "activeTeams\|pastTeams\|allTeams"`):

- `:313` — `if (!membershipEnsuredRef.current && activeTeams.length > 0)` — the
  self-heal membership backfill runs for **active teams only**.
- `:316` — `activeTeams.map(...)` — the backfill loop itself.
- `:385` — `allTeams.find((t) => t.id === row.team_id)` — team name/colour lookup for a
  card. A row whose team is in neither bucket gets no team, but it has already been
  dropped at `:416-421`, so this is unreachable for hidden-bucket rows.
- `:438` — effect deps.

Elsewhere in the app, `pastTeams` is read only by `src/screens/CalendarScreen.tsx`
(`:87, :128, :132, :138, :148, :155, :158, :264, :402, :442, :452, :1179-1196`) — the
calendar team picker's "Past teams" section, also from `6f5e38a`. No other screen reads
either list.

### The bucket rule those lists come from

`src/hooks/useUserTeams.ts:24-32` (`getTeamBucket`) and `:34-43` (`bucketTeams`),
**unchanged**. A team is `hidden` when `is_test === true`, or `team_status` is null, or
`team_status` is not one of `active|archived|inactive`. `bucketTeams` drops `hidden`
entirely — it reaches neither `activeTeams` nor `pastTeams`.

So the Oct 9 divergence stands verbatim at HEAD: a channel owned by a `hidden`-bucket
team is **counted by the tab badge** and **shown in neither ChatScreen list**.

---

## 3. Total chat unread — where, formula, what is included

**File:** `src/hooks/useTotalChatUnread.ts` — unchanged since the recon base.
**Computed in:** `fetchUnread`, `:72-136`. **Consumed at:** `AppNavigator.tsx:169`,
rendered as `tabBarBadge` at `AppNavigator.tsx:221` (capped to the string `'99+'` above 99).

### Exact formula

```
total = Σ over channels c ∈ visibleMemberships:
          count(comm_messages
                  where channel_id   = c.channel_id          -- :120
                    and is_deleted   = false                 -- :121
                    and user_id     != me                    -- :122
                    and created_at   > unreadFloor(c.last_read_at, cutoff30d))  -- :123

visibleMemberships = { m ∈ comm_channel_members where m.user_id = me }   -- :79-82
                     ∩ { channels where is_archived = false }            -- :93-97, :104-106

unreadFloor(lastReadAt, fallback) = lastReadAt ?? fallback               -- :35-40
cutoff30d = now - 30 days   (LOOKBACK_DAYS = 30, :6; unreadFallbackCutoff, :28-32)
```

Per-channel `count: 'exact', head: true` queries fanned out with `Promise.all` (`:116-127`),
summed at `:128`. Refresh: mount (`:149-158`), `subscribeToMessageInserts` (`:166`), and a
`comm_channel_members` UPDATE filter on `user_id=eq.me` (`:168-180`), all behind a
3000 ms debounce (`:7`, `:139-146`).

### Inclusions — the two questions asked

| | Included in the tab total? | Evidence |
|---|---|---|
| **Muted channels** | **YES — counted.** `is_muted` is selected at `:81` but never filtered on. The comment at `:101-102` says so explicitly, and `:23-24` states mute is deliberately not part of the rule. `countsTowardUnread()` (`:60-64`) exists for the push layer and has **zero callers in `src/`**. | `:81`, `:101-102`, `:23-24` |
| **Archived channels** | **NO — excluded.** The only channel-level exclusion. | `:93-97` |
| **Past-team channels** | **YES — counted.** No team join anywhere in the hook. | whole file |
| **Hidden-team channels** | **YES — counted,** and unreachable in the UI (§2). | whole file |

There is no `team_status`, `activeTeams`, `pastTeams`, or `teams` reference anywhere in
`useTotalChatUnread.ts`. A channel counts iff I am a member and the channel is not archived.

---

## 4. Server parity — `notify-chat-message`

**Location:** `~/Documents/thrive-and-score/supabase/functions/notify-chat-message/index.ts`
(where the prompt expected it). Last modified `a7e6747`, **2026-09-01** — unchanged since
the Oct 9 web recon, whose line numbers I re-verified against the live file and found exact.

**Computed in:** `computeUnreadBadges()` — `index.ts:28-85`. Called once per chat message
at `:141`, attached per recipient at `:154` (`badge: badges.get(userId) ?? 0`).
**Chat only** — the function never reads the `notifications` table
(`grep "notifications" index.ts` → no matches), so the push badge is a pure chat count
and the bell's notification unread is **not** folded in.

### Server formula

```
badge[u] = Σ over memberships m of u:
             |{ msg ∈ comm_messages :
                  msg.channel_id = m.channel_id
                  and is_deleted = false                        -- :58
                  and msg.user_id != m.user_id                  -- :79
                  and msg.created_at > (m.last_read_at || now-30d) }|   -- :46, :79

memberships = comm_channel_members where user_id IN recipientIds   -- :34-37
                                     (NO channel filter, NO is_muted filter)
UNREAD_FALLBACK_MS = 30 days                                       -- :18
```

Two queries by design (`:23-26`): memberships, then one over-fetch of candidate messages
bounded by the global minimum cutoff (`:49-52`, `:54-59`), narrowed in memory (`:67-82`).
On either query erroring the whole map returns zeros (`:41`, `:63`) and the push still
ships with `badge: 0`.

### Verdict: **MISMATCH** — one divergence, archived channels

| Rule | Client (§3) | Server | |
|---|---|---|---|
| floor = `last_read_at`, else 30-day | yes | yes (`:46`) | MATCH |
| strict `>` on `created_at` | yes (`:123`) | yes (`:79`) | MATCH |
| exclude own messages | yes (`:122`) | yes (`:79`) | MATCH |
| exclude deleted | yes (`:121`) | yes (`:58`) | MATCH |
| **muted channels counted** | **yes** (`:81`, never filtered) | **yes** (`:34-37`, no `is_muted`) | **MATCH** |
| **archived channels** | **excluded** (`:93-97`) | **counted** — no `is_archived` filter, no `comm_channels` join at all | **MISMATCH** |
| team-status buckets applied | no | no | MATCH (both diverge from the ChatScreen list) |
| scope | chat only | chat only | MATCH |

**So: the push badge ≥ the tab badge, by exactly the unread in the recipient's archived
channels.** Mute is *not* the divergence — both sides count muted channels identically.

Two further consequences that follow from the code (carried forward from the web recon,
re-verified at `index.ts:107-112`):

1. **Recipient selection *does* exclude mute** (`:112`, `.or('is_muted.is.null,is_muted.eq.false')`)
   while the badge *count* does not (`:34-37`). A user muted on every channel they belong
   to never receives another push, so their device badge is never refreshed again by this path.
2. **Nothing server-side ever zeroes the badge.** It is recomputed only at push time, from
   `last_read_at`, on the *next* message that reaches that recipient. Reading in-app lowers
   the number only on the next push. Clearing the device badge must be done client-side.

---

## 5. `setBadgeCountAsync` / `getBadgeCountAsync` call sites

```
grep -rn "setBadgeCountAsync|getBadgeCountAsync|setBadgeCount|BadgeCount" src/ App.tsx index.ts app.json
→ no matches (exit 1)
```

**Confirmed: none. Expectation met.**

The only badge-adjacent code in `src/` is two `shouldSetBadge: true` fields inside
`Notifications.setNotificationHandler` — `src/services/notifications.ts:40` and `:47`
(handler block `:29-50`). Those only tell the OS to honour the number the incoming push
already carries; neither sets a value. `expo-notifications` is imported in exactly one
file, `src/services/notifications.ts:1`.

**`expo-notifications` in `package.json`: YES — `"expo-notifications": "~0.32.16"`,
`package.json:36`.** No install needed for Stone B.

---

## 6. Hook points

### AppState `'active'` listeners — two exist, neither touches the badge

| Site | Current lines | What it does on `'active'` |
|---|---|---|
| `src/contexts/AuthContext.tsx` | listener registered **`:230`**, handler **`:215-229`** | `'background'`/`'inactive'` → removes realtime channels (`:216-218`); `'active'` → throttled `refreshRoles` (`:219`) |
| `src/screens/registration/ProgramRegistrationScreen.tsx` | registered **`:428-431`**, handler **`:422-427`** | `'active' && awaitingPayment` → payment-return re-check only |

`AuthContext.tsx:230` is the app-lifetime listener and the natural Stone B hook point.
Note the warning already in the file at `:46`: that effect has `[]` deps, so its closure
captures the first-render `session`.

### Where a channel or DM gets marked read — three writers, all on `comm_channel_members`

| Writer | Current lines | Fires when | Error handling |
|---|---|---|---|
| `TeamChatRoomScreen.markChannelAsRead` | **`:147-159`** | mount (`:225-227`), focus (`:230-240`), and each incoming message via `useMessages`' `onNewMessage` (wired at `:168`, invoked at `useMessages.ts:191`) | `logError('TeamChatRoom.markChannelAsRead', …)` at **`:156`** — warns in prod now |
| `DMChatScreen.markChannelRead` | **`:122-134`** | mount (`:227-229`), focus (`:232-242`), incoming message (wired at `:142`) | `logError('DMChat.markChannelRead', …)` at **`:131`** |
| `useChannelMembers.updateLastReadMessage` | `src/hooks/useChannelMembers.ts:47-63` (unchanged) | explicit call with a message id; also writes `last_read_message_id` (`:56`) | **still swallows — the `await` at `:52-59` destructures nothing and no error is checked** |

`useMessages(channelId, onNewMessage?)` — signature at `src/hooks/useMessages.ts:23`,
callback invoked at `:191`, in deps at `:254`.

These three are the only writes to `last_read_at` in `src/`. Both screen writers are
fire-and-forget `.then()` chains, so a mark-read followed immediately by a badge write
is **not** ordered — relevant if Stone B wants to set the icon badge right after a read.

---

## 7. Bell badge

**Number rendered:** `unreadCount` from `useNotifications()` —
`src/components/NotificationBell.tsx:9`, rendered at **`:24-30`**, capped to `'99+'` above
99 (`:27`). Refetches on focus (`:12-16`).

**Where that number comes from:** `src/contexts/NotificationContext.tsx` — `fetchNotifications`
at `:44-70`. The query is `:54-59`:

```ts
supabase.from('notifications').select('*')
  .eq('user_id', user.id)
  .order('created_at', { ascending: false })
  .limit(100)          // <-- the cap, NotificationContext.tsx:59
```

and the count is derived **in memory from that page**:

```ts
setUnreadCount((data || []).filter((n) => !n.is_read).length);   // :63
```

**So the cap is at `NotificationContext.tsx:59` (`.limit(100)`), applied to the count at
`:63`.** A user with unread rows outside the newest 100 is undercounted. Decremented
optimistically by `markAsRead` (`:88`, `Math.max(0, prev - 1)`); `markAllAsRead` begins
`:94`.

**`getUnreadCount()` lives at `src/services/notifications.ts:190-204`.** It does the right
thing — `count: 'exact', head: true` with `.eq('is_read', false)`, no limit (`:192-196`) —
and has **zero callers** (`grep -rn "getUnreadCount" src/` returns only the definition).
It is dead code that already solves the cap.

**Bell mount sites (5):** `AppNavigator.tsx:624`, `ScreenHeader.tsx`, `DashboardScreen.tsx`,
`ChatScreen.tsx`, `CalendarScreen.tsx`.

Same source feeds the "Mark all read" affordance at `NotificationsScreen.tsx:332`
(unchanged) and `unreadCount` destructured at `NotificationsScreen.tsx:128`.

---

## 8. AppNavigator swallowed error + `logError` signature

**Current location: `src/navigation/AppNavigator.tsx:836-844`** — the guard `if` opens at
`:836`, the silent branch is `:840-842`:

```ts
840:          if (__DEV__) {
841:            console.log('[AppNavigator] Auth restored mid join-team flow — staying on JoinTeam');
842:          }
```

At the recon base this block was `:831-838` with the `__DEV__` gate at `:835-837`, so
"was ~:831" matches. It shifted +5 from the `MessageReadHistory`/`Attendance` route edits.

**Precision, not a guess:** this is the only `__DEV__`-gated silent site in the file, and
the only candidate for "swallowed error" — but it is a **`console.log` of a guard branch,
not an absorbed error**. `AppNavigator.tsx` contains **no `try`/`catch` at all**
(`grep -n "catch"` → no matches) and no `error`/`Error` identifier anywhere
(`grep -n "error\|Error"` → the single hit is the word "silently" in a comment at `:554`).
If the Stone B prompt means a different site, it is not in this file.

The release-build silence is real either way: a release build is not `__DEV__`, so this
line never prints on the builds we test on — exactly the pattern `logError`'s header
documents (`src/utils/logError.ts:4-8`).

### `utils/logError.ts` signature

`src/utils/logError.ts` — new in `95821b2`, 55 lines.

```ts
export function logError(
  scope: string,                        // e.g. 'useMessages.sendMessage' -> "[scope] message"
  error: unknown,                       // Error | supabase { message, code, … } | string
  extra?: Record<string, unknown>       // ids/state, logged and sent as Sentry context
): void                                 // :40-44
```

Behaviour: `console.warn` **always**, dev or prod, in the fixed greppable format
`[scope] message {extra}` (`:47-52`); then `captureError(err, { scope, ...extra })`
(`:54`), which owns the "disabled in development" gate — this module never tests
`__DEV__` itself (`:11-15`). `toError()` at `:24-32` normalises a supabase error object
into `message (code)`. Intended for failures being **absorbed**; anything the user must
act on keeps its own `Alert` (`:17-18`).

---

## 9. Archive / dismiss

### Every `archive_channel` call site — exactly one

**`src/screens/ChatInfoScreen.tsx:368-370`**, inside `performArchive` (`:364-394`):

```ts
368:      const { data, error } = await supabase.rpc('archive_channel', {
369:        p_channel_id: channelId,
370:      });
```

Errors surface to the user: transport error → `Alert` with the raw message (`:372-375`);
`{ success: false }` → `Alert` with `mapArchiveError(result.error)` (`:377-381`), whose
code table is `:41-56` (`not_authenticated`, `channel_not_found`, `already_archived`,
`default_channel_protected`, `permission_denied`). Success → `Alert`, then
`navigation.navigate('Conversations')` (`:383-388`).

**Unarchive: no call site exists.** `grep -rn "unarchive" src/` → no matches. Archiving is
one-way from the mobile client.

### Gesture and reachability

- **Gesture:** a footer button, not a swipe. `ChatInfoScreen.tsx:521-534`
  (`ListFooterComponent`, `:518-537`) → `handleArchivePress` (`:396-410`) → a destructive
  `Alert.alert` confirm with DM-specific vs group-specific copy (`:400-409`) → `performArchive`.
- **Reached from:** the Chat Info screen only, which is entered from inside an open room —
  `TeamChatRoomScreen.tsx:720` and `DMChatScreen.tsx:509`
  (`navigation.navigate('ChatInfo', …)`; route registered at `AppNavigator.tsx:534-536`).
- **No archive affordance on the conversation list.** `ChatScreen.tsx` has no `Swipeable`
  and no `onLongPress` (`grep -n "Swipeable\|onLongPress"` → no matches). Its `archive`
  icon (`:154`) and "Archived" label (`:184-185`) are **display-only** — see Adjacent
  findings #1; they are not buttons.

### UI-side role check — `canArchive`, `ChatInfoScreen.tsx:285-300`

```ts
285:  const canArchive = useMemo(() => {
286:    if (!channel || !user?.id) return false;
287:    if (channel.is_default === true) return false;
289:    if (channel.is_direct_message === true) {
290:      return user.id === channel.dm_participant_1 || user.id === channel.dm_participant_2;
293:    }
295:    return channel.created_by === user.id
297:        || myMembershipRole === 'admin'
298:        || isPlatformAdmin;
300:  }, [channel, user?.id, myMembershipRole, isPlatformAdmin]);
```

`myMembershipRole` is `comm_channel_members.role` read at `:148-154`; `isPlatformAdmin` at
`:278-283`. `canArchive === false` renders `null` instead of the footer (`:519`, `:536`) —
the button is hidden, not disabled.

**Does it hide archive from parents or players? Not by app role — no.** There is no
`parent`/`player` test in the gate. The `role` union at `:28` and the parent/player
bucketing at `:224-245` are for the **member list display only**. A parent or player who
created a group chat, or holds channel `role = 'admin'`, sees and can use the button. DMs
are archivable by **either** participant (`:289-292`), whatever their app role. What
actually blocks most team chats is `channel.is_default === true` (`:287`), which hides the
button from everyone.

### Can a past- or hidden-team channel be archived from the list today?

**Neither can be archived *from the list* — there is no list-level archive action at all (§9
gesture).** Reachability of the only path, open room → Chat Info → footer button:

| Channel's team bucket | In a ChatScreen list? | Can reach Chat Info? | Archivable today? |
|---|---|---|---|
| **active** | yes (`:416-418`, active tab) | yes | yes, if `canArchive` |
| **past** | yes (`:419-421`, "Past" tab, `:1725-1751`) | yes — rows are tappable (`:1738`, `handleConversationPress`) | **yes, if `canArchive`** — i.e. not `is_default`, and creator / channel-admin / platform-admin |
| **hidden** | **no — dropped by both filters at `:416-421`** | **no** | **NO — unreachable** |

**This is the Stone B trap.** A hidden-bucket channel's unread is counted by the tab badge
(§3) and by the push badge (§4), appears in no list, cannot be opened, cannot be marked
read, and cannot be archived from the client. There is no mobile path to clear it.

---

## 10. Typecheck baseline

```
$ npx tsc --noEmit 2>&1 | grep -c "error TS"
70
```

**70 — matches the expected baseline exactly.** Pre-existing; unrelated to this recon
(nothing was edited).

---

## Adjacent findings (observed, NOT fixed — out of scope)

1. **`ChatScreen`'s `muted` card prop renders "Archived" and is only ever passed for
   past-team rows.** The prop is declared `muted` with the comment "Channel is muted for
   this user" (`ChatScreen.tsx:49-50`, `:91`, `:95`), but its only call site is
   `:1739` — the **past-teams** FlatList, passed bare (`muted` → `true`) for every row.
   It drives an `archive` icon (`:152-159`), the `conversationCardPast` style (`:147`),
   suppression of the timestamp (`:176`), and the literal text **"Archived"** (`:183-186`).
   Three different concepts share one flag: a past-team row is labelled "Archived" with an
   archive icon although it is neither muted nor archived (archived rows are dropped at
   `:415` and never render).
2. **Real mute state is carried to the card and never shown.** `isMuted` is computed at
   `ChatScreen.tsx:344` and set on every conversation object (`:361`, `:380`, `:404`), and
   the type declares it at `:50` — but `conversation.isMuted` is never read in any render
   path. Mute is invisible in the list.
3. **`countsTowardUnread()` has zero callers.** `useTotalChatUnread.ts:60-64` is exported
   "for the push layer", but the push layer is a Deno edge function in a different repo and
   re-implements the rule inline (§4). Nothing in `src/` calls it.
4. **`getUnreadCount()` is dead code that already fixes the bell cap.** Correct
   `count: 'exact'` query at `services/notifications.ts:190-204`, zero callers, while the
   bell undercounts past 100 (§7).
5. **`useChannelMembers.updateLastReadMessage` still swallows its error**
   (`useChannelMembers.ts:52-59`) — now the only `last_read_at` writer that does, since
   the two screen writers moved to `logError` in `95821b2`.
6. **The archived/unread mismatch is one-directional and permanent without a client fix**
   (§4): the server counts archived channels, the client does not, and no server path ever
   zeroes the badge.
7. **No unarchive exists on mobile** (§9) — archiving is irreversible from this client.
8. **Mark-read and any badge write would be unordered.** Both screen writers are
   fire-and-forget `.then()` chains (`TeamChatRoomScreen.tsx:149-158`,
   `DMChatScreen.tsx:124-133`) with no await and no completion signal.

---

## Still unverified (would require leaving SCOPE)

- The SQL body of `get_my_conversations`, which produces the per-card `unread_count`
  (`ChatScreen.tsx:343`). Whether it applies the same floor, the same 30-day fallback, and
  the same archived/mute treatment as §3 is **unverified** — `supabase/**` in this repo was
  not read. The claim at `useTotalChatUnread.ts:10-12` that these helpers are "the single
  writer" of the rule for "every surface" cannot hold while the per-card count comes from SQL.
- The SQL body of `archive_channel` (§9). Only its error codes are known, from the client's
  `mapArchiveError` table (`ChatInfoScreen.tsx:41-56`). The server-side permission rule may
  be narrower or wider than `canArchive`.
- Whether any **other** edge function, DB trigger, or RPC writes a push badge. Only
  `notify-chat-message` was read; `grep -rn "badge" supabase/` across `thrive-and-score`
  was not run — that would exceed the read scope granted for the sibling repo.

---

# Stone B build notes (Oct 11)

Built on `95821b2`, JS/TS only, nothing committed. No schema, RPC, dependency,
app config or native change. The counters below are the phone app's half of the
parity work; the server half (`notify-chat-message`) is the next step and does
**not** match yet — see "Known gap" at the end.

## EVIDENCE FROM PRODUCTION (verified Oct 11, `get_my_conversations` definition)

- It returns **every** channel the caller has a `comm_channel_members` row for.
  No filter of any kind; archived channels are returned too.
- It returns `team_id` and `team_name` but **not** `team_status`.
- Its `unread_count` per channel = messages where `is_deleted = false`
  AND `user_id <> caller` AND `created_at > COALESCE(last_read_at, now() - 30 days)`.
- DM `other_user_name` falls back to the other person's **EMAIL** when no name exists.

The first and third lines are why the client now sums this RPC instead of running
its own per-channel counts (see "What changed", item 3). The second is why the
team lifecycle has to be supplied from the client side. The fourth is a defect —
see Parked.

## PARITY SPEC v2

This is the contract the server function must be made to match. It **replaces**
v1, which bucketed teams and got the `is_test` case wrong.

### The channel rule, in plain words

> A channel is **QUIET** — its unread does not count, and it does not belong in
> the main chat list — when **either**:
>
> 1. **the channel is archived** (`comm_channels.is_archived = true`).
>    An archived channel is listed nowhere and counted nowhere.
> 2. **its team is retired** — `teams.team_status` is `'archived'` or
>    `'inactive'`, **regardless of `teams.is_test`**.
>    These channels still appear, in the Past section, so they stay readable.
>
> **Everything else COUNTS:**
> an active team · **an `is_test` team that has not been retired** ·
> a team whose `team_status` is `null` · a team whose `team_status` is an
> unrecognised value · a `team_id` the client holds no team record for ·
> a channel with no team at all (DMs, group chats) · **a muted channel**
> (mute suppresses push delivery, never an in-app count).
>
> And the companion rule, which is what makes the number honest: **every channel
> that counts is openable from the main chat list.** The main list is built as
> the exact complement of the Past section among non-archived channels, so a
> number on the tab always has a row behind it to open.

**What changed from v1.** v1 asked `useUserTeams`' bucket, where `is_test = true`
made a team `hidden` and therefore *counted* — so a retired test team kept
contributing a number forever. v2 reads raw `team_status` and retires a test team
like any other. `is_test` is now consulted by **nothing** in the rule.

### The message rule, in plain words

> Inside a counting channel, a message is unread when it is **not the reader's
> own**, **not deleted**, and **strictly newer** than that channel's floor, where
> the floor is `comm_channel_members.last_read_at` falling back to
> `now() - 30 days` **only** when `last_read_at` is null.

This is already exactly what `get_my_conversations` computes (evidence line 3
above), which is what makes summing its `unread_count` equivalent to re-deriving
the rule client-side.

### Which fields decide the channel rule

| Field | Where | Decides |
|---|---|---|
| `comm_channels.is_archived` | the channel row; on RPC rows as `is_archived` | `true` → quiet, listed nowhere |
| `comm_channels.team_id` | the channel row; on RPC rows as `team_id` | null → counts (DM / group) |
| `teams.team_status` | the channel's team | `'archived'` or `'inactive'` → quiet, Past section |
| `teams.is_test` | the channel's team | **nothing — deliberately ignored** |

Reduced to a truth table:

| `is_test` | `team_status` | v2 verdict | v1 verdict (wrong) |
|---|---|---|---|
| any | `'active'` | **counts** | counts |
| `false` | `null` | **counts** | counts |
| `false` | unrecognised | **counts** | counts |
| `true` | `'active'` | **counts** | counts |
| `false` | `'archived'` / `'inactive'` | **quiet** (Past) | quiet (Past) |
| **`true`** | **`'archived'` / `'inactive'`** | **quiet (Past)** | **counts** ← the fix |
| any | — (no `team_id`) | **counts** | counts |
| any | any, channel archived | **quiet, unlisted** | quiet, unlisted |

Code: `src/utils/unreadRule.ts` — pure, no react/react-native/supabase imports,
and covered by `src/utils/unreadRule.test.ts` (16 cases, including the partition
property). Two callers: `useTotalChatUnread.ts:133` and `ChatScreen.tsx:445`,
`:448`.

## What changed

Line numbers are current after the Oct 11 tidy pass.

| # | Item | Where |
|---|---|---|
| 1 | **THE rule extracted to a pure file** — `isQuietChannel` / `countsTowardUnread` / `isPastTeamChannel` / `isRetiredTeam`, no react / react-native / supabase imports, so it loads under `node --test` | `src/utils/unreadRule.ts:44-113` |
| 1 | The message-level half kept alongside it as the canonical statement (`unreadFloor`, `isUnreadMessage`, 30-day cutoff). Enforced in SQL by the RPC; no longer executed on the hot path | `unreadRule.ts:115-157` |
| 1 | Both surfaces import that one function; nothing restates the rule | `useTotalChatUnread.ts:133`, `ChatScreen.tsx:445`, `:448` |
| 2 | `useUserTeams` additively exposes `teamLifecycle` — `teamId → {team_status, is_test}` for **every** team found, built from `teamMap` *before* bucketing so hidden teams are included. No existing return value or bucket changed | `useUserTeams.ts:84-93`, `:332-343`, `:401` |
| 2 | **Duplicate team fetch removed** via one new provider mounted above the navigator, which calls `useUserTeams()` once and hands the value to both consumers | `src/contexts/TeamsContext.tsx`, mounted at `AppNavigator.tsx:1020-1022` |
| 3 | **Total is now the sum of RPC rows**: one `get_my_conversations` call, summing `unread_count` over rows the predicate counts, replacing two reads plus one count query per channel | `useTotalChatUnread.ts:118-137` |
| 4 | Repo test suite, existing `node:test` convention — 16 cases incl. every case the spec names and the partition property | `src/utils/unreadRule.test.ts` |
| — | List split now reads raw `team_status`: main list = `countsTowardUnread`, Past = `isPastTeamChannel` (which already excludes archived) | `ChatScreen.tsx:443-448` |
| — | `muted` card prop renamed `pastTeam`; label "Archived" → **"Past team"**; prefix icon `archive` → `clock`; no unread number on those rows, a neutral gray dot when unread > 0 | `ChatScreen.tsx:95`, `:105`, `:162-168`, `:201-204`, `:228-246` |
| — | Real mute indicator: a `bell-off` icon wherever `conversation.isMuted` — computed since before Stone B and never rendered | `ChatScreen.tsx:186-193` |
| — | `src/services/appBadge.ts` wrapping `setBadgeCountAsync`: clamps, failures through `logError`, never requests permission, no-ops without a user id | `services/appBadge.ts` |
| — | Badge written at the single mount of `useTotalChatUnread`, so there is exactly one writer | `AppNavigator.tsx:173-179` |
| — | Foreground re-count, so the server's push number is replaced by this rule's answer on return | `useTotalChatUnread.ts:206-215` |
| — | Badge zeroed on sign-out (badge only — no other auth behaviour touched) | `AuthContext.tsx:250-252` |
| — | `requestChatUnreadRefresh()` — module-level notifier the mark-read writers call on success, bypassing the hook's 3 s debounce. **Leading-edge throttle**, see self-review | `useTotalChatUnread.ts:50-96`, `:193-202` |
| — | Called from all three mark-read writers after a successful write; none of them changed what they write | `TeamChatRoomScreen.tsx:162`, `DMChatScreen.tsx:137`, `useChannelMembers.ts:74` |
| — | `useChannelMembers.updateLastReadMessage` no longer discards its error | `useChannelMembers.ts:56-71` |
| — | Bell badge uses `getUnreadCount()` (`count: 'exact'`, unlimited) instead of counting inside the newest-100 page. List paging unchanged at `.limit(100)` | `NotificationContext.tsx:46-56`, `:86`, `:115`, `:137`, `:156`, `:174`, `:199` |

### Why the RPC path (item 3)

Taken, not skipped. The production definition makes the sum provably equal to the
rule: the RPC applies **no filter**, so every channel the rule must judge is
present before the rule runs, and its `unread_count` is already the exact
message-level rule (not deleted · not the caller's own · `> COALESCE(last_read_at,
now() - 30 days)`). Summing `unread_count` over counting rows is therefore the
same number the old 2 + N queries produced, in one round trip.

The real prize is parity. ChatScreen builds its list from this same RPC, so the
tab total and the list now read the **identical row set** and can only disagree
if they disagree about the predicate — of which there is one copy. **That closes
the gap recorded as adjacent finding 5 in the Oct 10 notes**, where the total was
counted from `comm_channel_members` while the list came from the RPC and the two
could diverge invisibly.

Cost: `comm_channel_members` / `comm_messages` are no longer read directly by
this hook, so `unreadFloor` / `isUnreadMessage` are no longer on the hot path.
They are kept in `unreadRule.ts` as the written statement of the spec the server
must match, not as dead weight.


## Known gap until the server step

`notify-chat-message` still computes the push badge over **every** membership
with no `is_archived` filter and no team join
(`computeUnreadBadges`, `index.ts:28-85`, unchanged since Sep 1). So the number
a push puts on the app icon still includes archived channels **and** past-team
channels, and is therefore ≥ the in-app total.

What the client now does about it: the app overwrites the icon with its own
number whenever the chat total changes and whenever the app returns to the
foreground. The push number is therefore correct-by-overwrite within one
foreground cycle, but a user who receives a push and does not open the app sees
the server's inflated count. Closing this properly means teaching
`computeUnreadBadges` the PARITY SPEC above.

Mute is **not** part of this gap — client and server already agree that muted
channels count. The only divergences are archived and past-team.

## Parked (not built, not decided)

- **`archive_channel` sets one channel-wide flag, so a DM archived by one
  participant is archived for both.** INFERRED from the function definition
  (`comm_channels.is_archived` is a single column on the channel row, and the
  mobile client has no per-member archive field); **actual app behaviour was not
  checked**, and the SQL body of `archive_channel` was not read. The DM-archive
  confirmation copy at `ChatInfoScreen.tsx:403` already tells the user "removed
  from both your chat lists", which reads as though this is intended rather than
  accidental — worth confirming before anything is changed.
- **`get_my_conversations` DM name falls back to EMAIL.** When the other
  participant has no name, the RPC returns their email address as
  `other_user_name`, which ChatScreen renders as the conversation title
  (`ChatScreen.tsx:368`, `:375`). This contradicts the no-email-fallback rule of
  migration `20261010204000`. Fixing it means changing the function body, which
  is **SACRED** (schema/migration) and out of scope for any client task — it
  needs its own migration. Candidate for Stone B2.
- **"Leave group" for group chats = Stone B2.** There is no leave affordance
  today; archiving is the only exit and it takes the chat away from everyone.
  A team's main chat cannot be left (it is `is_default`, which already blocks
  archiving at `ChatInfoScreen.tsx:287`).

## Self-review of the Stone B diff (Oct 11)

Re-read the whole `git diff` as a reviewer. What was checked, and what it found.

### Bug found and fixed: the notifier starved under load

`requestChatUnreadRefresh()` was a **trailing debounce** — it cleared and reset
its 250 ms timer on every call. The chat room marks read on mount, on focus *and
on every incoming message*, so a stream of messages arriving less than 250 ms
apart would postpone the refresh for as long as the stream lasted: the one
situation where the count moves fastest was the one situation where it would
never update. Replaced with a **leading-edge throttle plus one guaranteed
trailing call** (`useTotalChatUnread.ts:53-96`), so the common case (open a
channel, one mark-read) now refreshes with *no* delay, bursts are capped at one
re-count per 250 ms, and the last event in a burst is never dropped.

### Checked and clean

- **Refresh loops (total → badge → refresh).** None. `appBadge` only ever
  writes; nothing reads the OS badge back and nothing subscribes to it. The
  chain is `fetchUnread → setTotalUnread → effect → syncAppBadge → (end)`.
  Nothing on the fetch path calls `requestChatUnreadRefresh`.
- **A subtler loop: roles → teams → unread.** `AuthContext`'s foreground
  handler calls `refreshRoles`, which changes `currentRole`. `useUserTeams`'
  `fetchTeams` depends only on `[user?.id, user?.email]`, so a role change does
  **not** refetch teams and cannot cascade into a re-count.
- **Effect dependencies.** All six in `useTotalChatUnread` are complete
  (`:141, :151, :163, :191, :202, :215`). `NotificationContext`'s
  `refreshUnreadCount` depends on `[user?.id]` only and is a stable identity, so
  the five callbacks that now list it do not churn. `ChatScreen`'s
  `fetchConversations` swapped `pastTeams` for `teamLifecycle`; `pastTeams` is
  still covered through the `allTeams` memo it feeds.
- **Listener cleanup on unmount.** All four have one: the message-insert
  unsubscribe and the supabase channel (`:187-190`), the refresh listener
  (`:199-201`), and the AppState subscription (`:214`). The module-level
  throttle timer is deliberately not cancelled on unmount — if it fires with no
  listeners the `forEach` is a no-op.
- **Sign-out.** `clearAppBadge()` runs before `supabase.auth.signOut()`, then
  `user` becomes null, so the badge effect re-runs with `userId` undefined and
  `syncAppBadge` no-ops rather than re-writing the departed user's number. Note
  the ordering: if `signOut()` itself threw, the badge would already be cleared
  for a still-signed-in user — it self-heals on the next total change, and the
  order mirrors the existing `deactivatePushToken` call directly above it.
- **Notification permission denied.** `setBadgeCountAsync` resolves `false`
  rather than throwing when the badge permission is absent (and on Android
  launchers that do not support it), so the denied case produces no error and no
  `logError` noise. The module never requests permission, so a passive counter
  update can never surface a permission prompt.

## Adjacent findings (observed, NOT fixed)

1. **A failed teams fetch silently inflates the count.** If `useUserTeams`
   errors, `loading` goes false with `teamLifecycle` empty, and every channel
   counts — including retired teams. This is *spec-compliant* (an unknown team
   counts), and it fails toward "readable and reachable" rather than toward a
   hidden number, but it is worth knowing that a teams outage reads as a larger
   badge. Changing it would mean changing `useUserTeams`' error semantics, which
   was additive-only in this task.
2. **`TeamsProvider` re-renders the navigator subtree on teams state changes.**
   `useUserTeams` returns a fresh object each render, so the context value is a
   new identity whenever teams load or refetch. React Navigation memoizes its
   screens so the cost is small; memoizing the provider value would remove it.
3. **Two RPC calls when the Chat tab is open.** `useTotalChatUnread` (in
   `MainTabs`) and `ChatScreen` each call `get_my_conversations`. They now agree
   by construction, but one shared fetch would halve the calls.
4. **No ESLint config exists.** `eslint` and three plugins are in
   `devDependencies` with no `eslint.config.js`, so `npx eslint` fails outright
   on v9. Lint could not be run as a check on this work.
5. **`src/hooks/useNotifications.ts` imports a type that does not exist.** It
   expects `NotificationType` from `NotificationContext`, which has never
   exported it — one of the 70 pre-existing typecheck errors. Untouched.
6. **The `byTeam` tab groups by `displaySubtitle || 'Other'`.** Hidden-bucket
   team rows now reach that tab and group under their server-supplied
   `team_name`, or fall into "Other" when the RPC returns none. Sensible, but it
   is the first time those rows have had to render there.
7. **`getTeamBucket` and the rule now disagree on purpose.** `useUserTeams`'
   bucket still calls a retired test team `hidden`; the rule calls it `quiet`.
   Nothing reads the bucket for counting any more, but the two live side by side
   and a future reader could pick the wrong one. Collapsing `getTeamBucket` onto
   `unreadRule` would remove the ambiguity — it would change `pastTeams`, which
   `CalendarScreen` renders, so it needs its own task.

---

# Simulator test Oct 11

New build loaded from Metro, human-observed on the iOS simulator.

## PASS

- Past-team rows show "Past team" + clock icon + gray dot, with no number.
- A retired team's unread is **not** in the chat tab total.
- Bell-off icon appears on a muted row.
- A muted chat **does** count toward the chat total.
- The bell shows an exact number (34) — no longer capped by the newest-100 page.

## FAIL

- **Two messages arrived while the app was open on the Chat tab. The row showed
  `2` immediately; the chat TAB BADGE showed nothing. After background →
  foreground the tab badge showed the number.** So the list refreshed on
  incoming messages and the total did not.

## N/A

- The iOS simulator does not display app-icon badges at all. `xcrun simctl push`
  with `aps.badge=7` showed nothing, twice.

---

## Diagnosis of the FAIL

Not a missing realtime event. `lib/realtimeHub` is a correct ref-counted
`Set` fan-out, and both subscribers were receiving the INSERT.

The cause was **structural: two independent fetchers of the same RPC.**
ChatScreen refetched on every incoming message *immediately*
(`subscribeToMessageInserts` → `fetchConversations()`), while the tab total sat
behind its own **3000 ms debounce** (`debouncedFetch`). Two fetches, two
schedules, two answers — so the row and the badge were showing different moments
in time by design, and "the list updates, the total doesn't" is precisely what
that looks like to a human who doesn't wait three seconds.

Worth stating plainly: the previous pass reported "the tab total and the list now
read the identical row set". That was true of the *rows*, and false of the
*timing* — they read the same query on two unsynchronised schedules. Same-source
was necessary; same-fetch is what was actually required.

## What this prompt changed

| # | Change | Where |
|---|---|---|
| 1 | **One shared source.** New `ChatUnreadProvider` owns the single `get_my_conversations` fetch and every trigger that re-runs it. It hands out the classified rows **and** the total from the same result | `src/contexts/ChatUnreadContext.tsx`, mounted `AppNavigator.tsx:1025-1027` |
| 1 | `classifyConversationRows` — one pure pass producing `mainRows`, `pastRows` and `total`, where `total` is **by construction** the sum over `mainRows`. The tab badge can no longer be a second opinion about the rows the list shows | `utils/unreadRule.ts:142-162` |
| 1 | ChatScreen no longer fetches, splits, or subscribes to messages. It enriches the provider's rows (`toConversation` hoisted to component level) and derives both lists with `useMemo` | `ChatScreen.tsx:342`, `:415-422`, `:862-864` |
| 1 | Triggers on the one fetch: mount, `comm_messages` INSERT (**any tab, no background round trip** — this is the FAIL fix), this user's `comm_channel_members` UPDATE, app foreground, and `requestChatUnreadRefresh()` from the three mark-read writers | `ChatUnreadContext.tsx:190-245` |
| 1 | Throttle kept, and kept leading-edge: first event refreshes with **no** delay, bursts capped at one fetch per 250 ms, one guaranteed trailing call | `ChatUnreadContext.tsx:46-94` |
| 2a | **FIXED** — the badge effect now also keys on `syncTick`, which increments on every *successful* recount even when the total is unchanged. Keying on `total` alone skipped the exact case that matters: a push changed the OS badge while backgrounded, so returning to the same total must still re-apply our number | `AppNavigator.tsx:184`, tick at `ChatUnreadContext.tsx:175` |
| 2b | **OK** — mark-read and the live update both route through `requestChatUnreadRefresh` → provider → recount → tick → badge write | `TeamChatRoomScreen.tsx:162`, `DMChatScreen.tsx:137`, `useChannelMembers.ts:74` |
| 2c | **OK** — sign-out clears it, and the effect then re-runs with no user id so `syncAppBadge` no-ops instead of rewriting the departed user's number | `AuthContext.tsx:252` |
| 2d | **OK** — `setBadgeCountAsync` resolves `false` on denied permission rather than throwing, and the return value is deliberately not inspected, so the denied case produces no error and no log noise. Only a genuine throw logs | `services/appBadge.ts:28-35` |
| 3 | **Teams-load failure holds.** While teams are loading **or their fetch errored**, the provider returns before fetching, so the last good rows, the last good split and the last good total all stand until teams load again. Nothing is recomputed against an empty lifecycle map | `ChatUnreadContext.tsx:160` |
| 4 | Bell badge fits "99+": `minWidth` 18→20, `paddingHorizontal` 4→5, `fontSize` 11→10, plus `borderRadius` 9, `textAlign: center`, `includeFontPadding: false`, `numberOfLines={1}`, `allowFontScaling={false}`, and `overflow: visible` on the container | `components/NotificationBell.tsx:26-32`, `:40-70` |
| 5 | Past-team rows keep the channel name: the subtitle is now `"<channel name> · Past team"` instead of the bare words, so two channels of one retired team are distinguishable again | `ChatScreen.tsx:207-216` |
| 6 | 7 new test cases for `classifyConversationRows`, including the invariant `total === sum(mainRows)` directly | `utils/unreadRule.test.ts` — 23 pass |

### Why the preferred path and not the minimum

The minimum acceptable option was to make the total refresh on the same events
as the list. That would have fixed this symptom while leaving the cause — two
fetchers — in place, so the next divergence would be a new bug of the same
shape. One fetch removes the category.

Cost: ChatScreen's fetch logic moved out of the screen, which is a real
restructure of ~140 lines. It also means the chat rows are fetched at app start
rather than when the Chat tab opens — slightly more startup work, and the reason
the tab badge is now correct on any tab without opening Chat at all.

## Unverified

- **App-icon badge number: not verifiable on the simulator; verify on a physical
  phone with the 1.0.18 dev build.**
- The bell badge at >99: the test account shows 34, so "99+" was only reproduced
  by inspection of the style box, not observed. Needs an account with 100+ unread
  notifications, or a temporary threshold change.
- Behaviour when the teams fetch fails (item 3) — the hold path is in code and
  reasoned, but was not exercised; it needs a forced failure to confirm.
