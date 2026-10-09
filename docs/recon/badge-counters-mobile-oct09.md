# Recon: unread-badge counters (mobile) — 2026-10-09

Repo: thryvyng-mobile @ `7273de3` (branch `main`, clean)
Scope read: `src/**` (read-only). No file in `src/` was modified.
Not inspected (outside scope): `supabase/**` — so the SQL bodies of
`get_my_conversations` and the push-sending edge function are **unverified** here.
Anything about them below is marked INFERRED.

---

## 1. Inventory — every unread/count badge surface in the app

| # | Surface | Rendered at | Count source | Filters applied |
|---|---------|-------------|--------------|-----------------|
| 1 | Chat **tab** badge (bottom tab bar) | `src/navigation/AppNavigator.tsx:219` (value from `:167`) | `useTotalChatUnread()` — `src/hooks/useTotalChatUnread.ts:66` | client-side; see §2 |
| 2 | Chat **per-card** badge (conversation row) | `src/screens/ChatScreen.tsx:210-217` | `row.unread_count` from RPC `get_my_conversations` — `src/screens/ChatScreen.tsx:329, 343` | server-side (RPC) + client `is_archived` + active/past team split |
| 3 | **Notification bell** badge (header) | `src/components/NotificationBell.tsx:24-28` | `useNotifications().unreadCount` — `src/contexts/NotificationContext.tsx:63` | `notifications` where `user_id = me`, newest **100 only**, counted `!is_read` |
| 4 | Notifications screen "mark all read" affordance | `src/screens/NotificationsScreen.tsx:332` | same context as #3 | same as #3 |
| 5 | Club-admin **pending staff requests** quick-action badge | `src/components/dashboards/ClubAdminDashboard.tsx:290` → `src/components/QuickActionsCard.tsx:36-39` | `usePendingStaffRequests(null, clubId)` — `src/hooks/usePendingStaffRequests.ts:31` | `team_join_requests.status = 'pending'`, `team_id IN (club's teams)` |
| 6 | Coach **pending staff requests** stat tile (number, not a badge) | `src/components/dashboards/CoachDashboard.tsx:397` | `usePendingStaffRequests(teamId)` — same hook | `status = 'pending'`, `team_id = teamId` |
| 7 | **App icon** badge (OS springboard) | not set anywhere in `src/` | push payload only — see §3 | n/a |

Bell mount sites (#3): `AppNavigator.tsx`, `ScreenHeader.tsx`, `DashboardScreen.tsx`,
`ChatScreen.tsx`, `CalendarScreen.tsx`.

Not an unread badge, noted to avoid confusion: `missedCount` /
"jump to bottom" counters in `TeamChatRoomScreen.tsx:136` and
`DMChatScreen.tsx:106` are in-session scroll counters, not persisted unread.

---

## 2. `useTotalChatUnread` — current query and filters

File: `src/hooks/useTotalChatUnread.ts`

Query chain (`fetchUnread`, `:70`):

1. `:79-82` — `comm_channel_members` select `channel_id, last_read_at, is_muted`
   where `user_id = me`. **No team filter, no status filter.**
2. `:92-96` — `comm_channels` select `id` where `id IN (my channel ids)`
   **and `is_archived = false`**. This is the only channel-level exclusion.
3. `:104-106` — memberships narrowed to that active-channel set.
4. `:116-124` — per-channel `count(exact, head)` on `comm_messages` where
   `channel_id = c` · `is_deleted = false` · `user_id != me` ·
   `created_at > unreadFloor(last_read_at, 30-day cutoff)`.
5. `:126-127` — summed.

Declared rule (header comment `:9-26`): archived excluded, own messages excluded,
deleted excluded, strictly newer than floor. **Mute is deliberately NOT a filter** —
`countsTowardUnread()` (`:63`) exists but is exported for the push layer only; muted
channels count toward both in-app surfaces.

Refresh: initial on mount (`:149-156`), `subscribeToMessageInserts` via realtimeHub
(`:170`), and `comm_channel_members` UPDATE for `user_id = me` (`:172-184`),
all behind a 3000 ms debounce (`:7`, `:140-147`).

### Does it still count channels regardless of team status?
**YES.** There is no `team_status`, `activeTeams`, `pastTeams`, or `teams` join
anywhere in the hook. A channel counts if (a) I am a member and
(b) `is_archived = false` — whatever the owning team's lifecycle is.

### Was the Jun 2026 "remove team-status filter from ChatScreen fetchConversations" fix applied?
**NO — and the history says it went the other way.**

- `src/screens/ChatScreen.tsx:338-339` still builds
  `activeTeamIds` / `pastTeamIds` from `useUserTeams()`.
- `src/screens/ChatScreen.tsx:414-421` still splits RPC rows:
  `activeRows = rows.filter(r => !r.team_id || activeTeamIds.has(r.team_id))`,
  `pastRows = rows.filter(r => r.team_id && pastTeamIds.has(r.team_id))`.
- `fetchConversations` deps (`:438`) still include `activeTeams, pastTeams, allTeams`.

Git history (`git log --date=short --all | grep -iE "unread|badge|lifecycle|team.status"`):

```
413ef36 2026-09-01 Unread accuracy: shared isUnreadMessage rule, muted excluded from tab total only...
fc86707 2026-07-23 fix(mobile): exclude archived channels from chat unread badge count
6f5e38a 2026-06-04 mobile: extend lifecycle filter to chat list and calendar picker
989408a 2026-06-04 mobile: filter role switcher into active and past teams via RPC enrichment
```

The only June 2026 commit touching `ChatScreen.tsx` is `6f5e38a` (2026-06-04),
which **added** the lifecycle filter to the chat list (+222 lines in ChatScreen).
No commit in the repo removes a team-status filter from `fetchConversations`.
INFERRED: the "remove the filter" fix was planned but never landed, or landed only
as the archived-channel fix `fc86707` (July), which is a different filter.

### Resulting divergence (the "badge you cannot clear" class)
`getTeamBucket` in `src/hooks/useUserTeams.ts:24-32` sorts a team into
`active` / `past` / **`hidden`**. A team is `hidden` when `is_test === true`,
or `team_status` is null, or `team_status` is anything other than
`active|archived|inactive`. `bucketTeams` (`:34-40`) drops `hidden` entirely —
it is in neither `activeTeams` nor `pastTeams`.

Therefore a channel whose `team_id` belongs to a `hidden` team:
- appears in **neither** ChatScreen list (fails both filters at `:416-421`), yet
- **is counted** by `useTotalChatUnread` (no team filter at all).

Net effect: the Chat tab badge can show a number with no reachable conversation
row to open, so the user has no way to stamp `last_read_at` and clear it.
Same shape for any channel whose `team_id` is set but is absent from the user's
`useUserTeams` result for any other reason.

---

## 3. App icon badge — every call site

```
grep -rn "setBadgeCountAsync|getBadgeCountAsync|setBadgeCount" src/ App.tsx index.ts main
→ no matches (exit 1)
```

`expo-notifications` is imported in exactly one file: `src/services/notifications.ts:1`.
The only badge-related code in `src/`:

- `src/services/notifications.ts:40` — `shouldSetBadge: true` (push arrives for the
  channel already on screen: no alert, no sound, badge still applied)
- `src/services/notifications.ts:47` — `shouldSetBadge: true` (default branch)

Both are fields of `Notifications.setNotificationHandler` (`:28-50`), which only
tells the OS whether to **honour the badge value the incoming push carries**.
Neither sets a number.

`app.json` contains no badge key (`grep -i badge app.json` → no matches).

### Is the icon badge ever set or cleared from inside the app?
**NO.** Checked every plausible hook point:

- **On app open / foreground** — `AppState` listeners exist at
  `src/contexts/AuthContext.tsx:215-231` (removes realtime channels on background,
  throttled `refreshRoles` on active) and
  `src/screens/registration/ProgramRegistrationScreen.tsx:422-431` (payment return).
  Neither touches the badge.
- **On read** — the three `last_read_at` writers (§4) only write Postgres; none
  calls into `expo-notifications`.
- **On push received / tapped** — `addNotificationListeners`
  (`src/services/notifications.ts:164-187`) is called once, at
  `src/navigation/AppNavigator.tsx:962`, with `onNotificationReceived = undefined`;
  the response handler only deep-links via `routeNotification`. No badge write,
  no `dismissAllNotificationsAsync`.
- **On sign-out** — `deactivatePushToken` (`:141-161`) clears the DB token only.

So the icon badge is written **solely by the `badge` field of the push payload**,
produced server-side. INFERRED (not verified, `supabase/**` out of scope): whatever
number the sender puts there is absolute and monotonic from the app's point of view —
nothing in the client ever decrements it or zeroes it, so it should be expected to
drift upward and stay stale after the user reads messages in-app.

---

## 4. `last_read_at` — writers and consumers

### Writers (all `comm_channel_members`, all `.eq(channel_id).eq(user_id)`)

| Site | Trigger | Also writes |
|------|---------|-------------|
| `src/screens/TeamChatRoomScreen.tsx:142-154` (`markChannelAsRead`) | passed to `useMessages(channelId, markChannelAsRead)` at `:162` — fires on mount, on focus, and on each incoming message | — |
| `src/screens/DMChatScreen.tsx:120-131` (`markChannelRead`) | same wiring, `useMessages(...)` at `:140` | — |
| `src/hooks/useChannelMembers.ts:47-63` (`updateLastReadMessage`) | explicit call with a message id | `last_read_message_id` |

Both screen writers log failures in `__DEV__` rather than throwing (a failed stamp
leaves a stale badge — the comment at both sites says so explicitly).
`useChannelMembers.updateLastReadMessage` does **not** check its error.

### Consumers

| Consumer | How it reads the floor |
|----------|------------------------|
| `useTotalChatUnread` (Chat tab badge) | reads `last_read_at` at `src/hooks/useTotalChatUnread.ts:81`, applies it at `:123` via `unreadFloor()` (`:35-40`) — falls back to a 30-day cutoff (`LOOKBACK_DAYS = 30`, `:6`, `:29-33`) **only when `last_read_at` is null** |
| `get_my_conversations` RPC → ChatScreen per-card badge | INFERRED — `row.unread_count` arrives precomputed (`src/screens/ChatScreen.tsx:343`); the client never sees `last_read_at` here. Whether the RPC applies the same floor and the same 30-day fallback is **unverified** (`supabase/**` out of scope) |
| `src/types/index.ts:36` | type declaration only (`last_read_at: string`, non-nullable — the runtime value can be null, which the hook handles) |

Counters that do **not** use `last_read_at`: the notification bell
(`notifications.is_read`) and both staff-request counters
(`team_join_requests.status`).

---

## Gaps worth a follow-up task (no action taken)

1. **Tab total vs. chat list disagree on `hidden`-bucket teams** (§2) — the tab badge
   counts channels the list will not show. One of the two must change: either
   `useTotalChatUnread` learns the same bucket rule, or ChatScreen stops dropping
   rows (the un-landed June fix).
2. **No in-app icon-badge reconciliation** (§3) — nothing calls
   `setBadgeCountAsync(0)` or `setBadgeCountAsync(totalChatUnread)` on open, on
   foreground, or on read.
3. **Bell badge is capped at the newest 100 notifications**
   (`src/contexts/NotificationContext.tsx:54-63`) — a user with more than 100 unread,
   or unread rows older than the newest 100, is undercounted. No `count: 'exact'`
   query is used for the badge, although `getUnreadCount()`
   (`src/services/notifications.ts:190-204`) already exists and does exactly that,
   unused.
4. **Two unread rules, one unverified** — the RPC's rule for `unread_count` was not
   read (out of scope). The in-hook comment at `useTotalChatUnread.ts:8-26` claims to
   be "the single writer" of the rule for "every surface", which cannot be true while
   the per-card count comes from SQL.
5. **`useChannelMembers.updateLastReadMessage` swallows errors** (`:54-62`) while the
   two screen writers log them.
