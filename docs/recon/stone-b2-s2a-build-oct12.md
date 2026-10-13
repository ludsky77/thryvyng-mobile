# Stone B2 S2a — "Leave group" in the mobile chat UI (build report, Oct 12, 2026)

Build on top of `b9a4c17`. The database enforces the rules (migration
`20261013013626`); this change only surfaces the action where it is allowed and
handles a refusal without lying about it. **No schema, SQL, `supabase/`, deps,
env or auth changes. Nothing committed.**

---

## Files changed

| file | change |
|---|---|
| **`src/lib/channelLeave.ts`** | **NEW** (105 lines). The rule, the writer and the copy, in one place: `canLeaveChannel()`, `leaveChannel()`, and the four copy constants. |
| `src/screens/ChatInfoScreen.tsx` | Adds the Leave action for **non-default team / club channels** (the ⋮ destination from `TeamChatRoomScreen`). Reads `name, channel_type` from the channel row; new `canLeave` gate, `performLeave`, `handleLeavePress`, a footer button above Archive, one style. |
| `src/screens/GroupInfoScreen.tsx` | Its existing group-chat Leave now goes through the shared rule, copy and writer. Gained the list-removal step and `logError`; lost its hand-rolled delete and its `__DEV__ console.error`. |
| `src/contexts/ChatUnreadContext.tsx` | New `forgetChatChannel(channelId)` — drops one channel from the chat list and the tab badge immediately, by re-running the existing classifier over the held rows minus that channel. |
| `docs/recon/stone-b2-s2a-build-oct12.md` | this file |

Untouched by design: `TeamChatRoomScreen`, `DMChatScreen`, `ChatScreen`,
`unreadRule.ts`, every RPC. No client logic for admin succession or
auto-archive — both are server-side triggers.

---

## Where the leavability condition lives

One function, [src/lib/channelLeave.ts:61-71](../../src/lib/channelLeave.ts#L61-L71):

```ts
export function canLeaveChannel(
  channel: LeavableChannel | null | undefined
): boolean {
  if (!channel) return false;
  if (channel.is_direct_message === true) return false;
  if (channel.channel_type === 'group_dm') return true;
  if (channel.channel_type === 'team' || channel.channel_type === 'club') {
    return channel.is_default !== true;
  }
  return false;
}
```

Both call sites, and nothing else, decide visibility from it:

* [ChatInfoScreen.tsx:327](../../src/screens/ChatInfoScreen.tsx#L327) — `const canLeave = useMemo(() => canLeaveChannel(channel), [channel]);`, rendered at [:589-604](../../src/screens/ChatInfoScreen.tsx#L589-L604) inside `canArchive || canLeave`.
* [GroupInfoScreen.tsx:437](../../src/screens/GroupInfoScreen.tsx#L437) — `{canLeaveChannel(channel) && (`.

**The action is ABSENT, never disabled**, where the rule says no: the
`TouchableOpacity` is not rendered at all.

### Why the facts come from the channel ROW, not the route param

`channelType` as a navigation param cannot carry this rule — the recon proves
two holes: a push-opened room passes **no** `channelType`
(`AppNavigator.tsx:904-917`, recon §F2) and `DMChatScreen` passes the illegal
value `'direct'` (recon §B). A param-based gate would therefore have offered
Leave inside a 1-on-1 DM and hidden it in a push-opened group. So
`ChatInfoScreen` now selects `channel_type` (and `name`) from `comm_channels`
([ChatInfoScreen.tsx:150-159](../../src/screens/ChatInfoScreen.tsx#L150-L159)) and gates on the row,
exactly as the pre-existing `canArchive` already did.
`GroupInfoScreen` already read the row with `select('*')` ([:98](../../src/screens/GroupInfoScreen.tsx#L98)) and needed no query change.

### The resulting matrix

| channel | Leave offered? | why |
|---|---|---|
| group chat (`group_dm`) | **yes** | `channel_type === 'group_dm'` |
| team channel, `is_default` false/null | **yes** | `is_default !== true` |
| club channel, `is_default` false/null | **yes** | `is_default !== true` |
| default team chat | no | `is_default === true` |
| default club chat | no | `is_default === true` |
| 1-on-1 DM | no | `is_direct_message === true`, checked first |
| channel row failed to load | no | `!channel` |
| any other / unknown `channel_type` | no | falls through to `return false` |

Unknown facts answer **false** on purpose: hiding an action the DB would have
allowed is recoverable; offering one it will refuse is not.

---

## The flow

Menu → confirm → leave, same shape in both screens:

1. **Entry.** `ChatInfoScreen` is the ⋮ destination for a team/club room
   (`TeamChatRoomScreen.tsx:722-731`); the Leave button sits in the footer
   directly above "Archive chat", matching that existing destructive-action
   pattern. For group chats the entry point is unchanged (header centre →
   `GroupInfo`). A group chat reached by ⋮ now also shows Leave in Chat Info —
   same rule, same copy, same writer; the two info screens for one group are
   pre-existing app structure (recon §G), not introduced here.
2. **Confirm dialog** — `Alert.alert`, the app's dialog primitive:
   `Leave <chat name>?` / `You will stop receiving its messages.` /
   `Cancel` · `Leave` (destructive).
   Title falls back to `Leave this chat?` when no name is known
   ([channelLeave.ts:46-49](../../src/lib/channelLeave.ts#L46-L49)).
3. **The write** — delete your own membership row, nothing else
   ([channelLeave.ts:87-108](../../src/lib/channelLeave.ts#L87-L108)):
   `DELETE comm_channel_members WHERE channel_id = ? AND user_id = <self>`
   with `.select('user_id')`.
4. **On success** — `forgetChatChannel(channelId)` drops the row from the list
   and the tab badge at once, `requestChatUnreadRefresh()` queues the
   confirming read, then navigate to the chat list (`Conversations`; Group Info
   keeps its existing `popToTop()` / `navigate('Main' → ChatTab)` fallback).
   No success alert — the chat is gone from the list, which is the feedback.

---

## How refusal is handled

`leaveChannel()` returns `'ok' | 'refused' | 'error'`, and **both shapes of RLS
refusal map to `'refused'`** ([channelLeave.ts:96-105](../../src/lib/channelLeave.ts#L96-L105)):

* `error.code === '42501'` — the policy rejected the statement;
* `error: null` with an **empty** result — the policy filtered the row out of
  the DELETE, which is what PostgREST actually returns for a USING-clause
  mismatch. The `.select('user_id')` is what makes this case visible; without
  it a refused delete is indistinguishable from a successful one. This is the
  empty-result-is-a-refusal pattern the chat stack already uses for rename and
  remove (recon §A).

On `'refused'`: `Alert.alert('Error', "You can't leave this chat")` and
**nothing changes locally** — no `forgetChatChannel`, no refresh, no
navigation. The user stays exactly where they were, still in the chat.

On `'error'` (offline, 5xx — not a permission problem): a separate message,
`'Could not leave this chat. Please try again.'`
([channelLeave.ts:31-37](../../src/lib/channelLeave.ts#L31-L37)). Telling someone they are not allowed to
leave when the truth is the request never arrived would be a lie, so the two
cases do not share copy.

Both outcomes also go to `logError` — the repo's convention for an absorbed
write failure, console in every build plus Sentry (`utils/logError.ts:1-19`).
**A refusal is logged deliberately**: it means this client gate and the DB rule
disagree, which is precisely the drift this stone is about. That is new
observability; the old group-leave path logged only in `__DEV__`, i.e. never on
a release build.

### Copy, in one place

`LEAVE_ACTION_LABEL` "Leave group" · `LEAVE_CONFIRM_BODY` "You will stop
receiving its messages." · `LEAVE_REFUSED_MESSAGE` "You can't leave this chat"
· `LEAVE_FAILED_MESSAGE` "Could not leave this chat. Please try again."
([channelLeave.ts:29-49](../../src/lib/channelLeave.ts#L29-L49)) — both screens import them, so the two
Leave controls cannot drift apart.

---

## Removing the chat from the list

`forgetChatChannel()` ([ChatUnreadContext.tsx:97-120](../../src/contexts/ChatUnreadContext.tsx#L97-L120)) is module-level, for the same
reason `requestChatUnreadRefresh()` is: the screens that leave a chat sit in
other navigators and cannot reach the provider by props.

The provider holds the last RPC result in `rawRowsRef`
([:164-171](../../src/contexts/ChatUnreadContext.tsx#L164-L171)) and, on a drop, re-runs **the same**
`classifyConversationRows` over those rows minus that channel
([:242-257](../../src/contexts/ChatUnreadContext.tsx#L242-L257)). That matters: `total` is by construction the sum
over `mainRows`, so the row and the tab badge lose the chat in one pass and the
local drop cannot invent a number a real fetch would not produce. The queued
refresh then reconciles with the server — a channel dropped locally that the DB
still returns comes straight back.

`syncTick` deliberately does **not** tick (it means "a successful recount");
the app-icon badge writer already re-runs on a `total` change
(`AppNavigator.tsx:183-185`).

---

## Deferred / not done, with reasons

1. **No automated test.** There is no test for either info screen, and the repo
   has no test runner wired into `package.json` (`scripts` is start/android/ios/web;
   `unreadRule.test.ts` and `sendResult.test.ts` exist but nothing runs them from
   an npm script). `canLeaveChannel` is a pure function and is the obvious unit
   to cover — **RECOMMEND** as its own task, with the runner question answered first.
2. **Not verified on a device/simulator.** This report claims typecheck and lint
   only (below). The six-row matrix above is reasoned from the code, not observed.
3. **`GroupInfoScreen`'s Leave now hides if the channel row fails to load**
   (previously it always rendered). `fetchGroupInfo` already alerts "Could not
   load group details." in that case ([:102-106](../../src/screens/GroupInfoScreen.tsx#L102-L106) → [:129](../../src/screens/GroupInfoScreen.tsx#L129)), so the
   screen is visibly degraded rather than silently missing a button.
4. **One ambiguity, resolved conservatively and worth a second look:** a
   `group_dm` with `is_default = true` would still be offered Leave, because
   the spec says group chats are leavable unconditionally. No such row should
   exist (`createGroup` never sets `is_default`, `ChatScreen.tsx:770-777`), and
   the DB is the final authority either way. Say the word and the gate becomes
   `is_default !== true` for all three types.
5. **Untouched known gaps from the recon**, all out of scope here and all still
   open: a left channel reached from a stale list or a push tap still renders a
   silently empty thread with a live composer (recon §F3); `routeNotification`
   does no membership check; `StaffMessageScreen`'s self-insert and discarded
   error (recon §B5); Club-Wide still dead (recon §B4).
6. **No admin-succession or auto-archive client logic**, as instructed — a lone
   admin leaving a group is entirely the triggers' business.
