# Recon: four chat findings from the Oct 8 device run — 2026-10-10

Device build: dev-client at **3834065**.
`git diff --stat 3834065 HEAD` over the four scoped chat files is **empty**, so
HEAD is byte-identical to the tested build here and every line cite below is
valid for both. Read only; no code changed.

Files read: `TeamChatRoomScreen.tsx`, `DMChatScreen.tsx`, `hooks/useMessages.ts`,
`hooks/useChatSenderLabels.ts`, `components/chat/ChatInputBar.tsx`,
`components/chat/MessageActionsModal.tsx`, `components/chat/ChatBubble.tsx`.

---

## B1 — text-only reply fails with the ATTACHMENT alert

### The alert string
Exactly one origin: **`src/components/chat/ChatInputBar.tsx:125-129`**

```ts
const result = await onSendMessage(draft, pending);
if (result === false) {
  Alert.alert('Message not sent',
    'Your attachment could not be uploaded. Please try again.');
  return;
}
```

**The condition is `result === false` and nothing else.** The copy names the
attachment; the trigger is any falsy-boolean return, whatever the reason.

### The send path
`ChatInputBar.handleSend` (`ChatInputBar.tsx:112`)
→ `onSendMessage` = `TeamChatRoomScreen.handleSendMessage` (`TeamChatRoomScreen.tsx:290`)
→ `sendMessage(content, { attachment, replyTo })` (`useMessages.ts:217`)
→ insert (`useMessages.ts:308-311`).

`handleSendMessage` forwards the boolean (`TeamChatRoomScreen.tsx:331` returns
`success`; its catch returns `false` at `:334-336`), so every failure inside
`sendMessage` reaches the alert.

### Does the reply path enter the upload branch? NO.
The upload block is gated `if (options?.attachment)` (`useMessages.ts:245`).
A text-only reply passes `attachment: undefined` (`TeamChatRoomScreen.tsx:308-316`, `replyTo` at `:317`),
so it skips the branch entirely and goes straight to the insert, where the
reply adds three keys (`useMessages.ts:301-305`):

```ts
if (options?.replyTo) {
  insertPayload.reply_to_id      = options.replyTo.id;
  insertPayload.reply_to_content = options.replyTo.content;
  insertPayload.reply_to_sender  = options.replyTo.senderName;
}
```

### So: a non-attachment error IS being misreported.
`sendMessage` has **six** `return false` sites; only three are about attachments:

| line | cause | attachment-related? |
|---|---|---|
| `useMessages.ts:231` | no user / no channelId | no |
| `:233` | no content | no |
| `:257` | attachment read as empty | yes |
| `:274` | storage upload error | yes |
| `:291` | upload threw | yes |
| **`:317`** | **`comm_messages` INSERT failed** | **no** |

A text-only reply can only fail at **`:317`**, and `:317` renders as "Your
attachment could not be uploaded." That is the misreport, and it is why the
message on screen pointed the investigation at the wrong subsystem.

### Does a plain (non-reply) send share the path?
**Yes — identical path, one difference.** Same `handleSend` → same
`handleSendMessage` → same `sendMessage` → same insert. The *only* delta is the
three `reply_to_*` keys added at `:301-305`. A plain send omits them.

### Most likely root cause of the insert failure (needs one check)
The three `reply_to_*` columns are named **only** in the insert payload.
Nothing else in the repo writes or selects them by name:

* the message reads use `select('*', …)` (`useMessages.ts:50-55`, `:158-163`),
  so a missing column cannot break a read;
* the renderers only *consume* them off the row
  (`TeamChatRoomScreen.tsx:574-577`, `:626-627`; `DMChatScreen.tsx:369-372`, `:403-404`);
* the type declares them optional (`src/types/index.ts:68-70`).

So if `comm_messages` lacks `reply_to_id` / `reply_to_content` /
`reply_to_sender` (or PostgREST's schema cache is stale), the insert 400s with
PGRST204, `messageError` is set, `:317` returns false, and the attachment alert
appears — while plain sends keep working because they never mention the
columns. **This matches the symptom exactly**, but the repo cannot confirm the
columns: `supabase/migrations/` holds a single unrelated file
(`20250224000000_notify_lineup_published.sql`), so the schema lives only in the
remote DB. Confirm with either:
* the Metro log line `[useMessages] message insert failed` — it IS printed on
  this build, because `__DEV__` is true in a dev client (`useMessages.ts:314-316`); or
* `select column_name from information_schema.columns where table_name='comm_messages';`

DMChatScreen sends through the same hook and also passes `replyTo`
(`DMChatScreen.tsx:284`), so replies should fail there too — a useful
cross-check.

---

## B2 — "View Read History" does nothing

Fully wired on the client, **pointing at a route that does not exist**.

* Action sheet item: `MessageActionsModal.tsx:189-200`, shown when
  `canViewReadHistory = isOwnMessage || isStaff` (`:71`); `onPress` calls
  `onViewReadHistory(message.id)` (`:194`).
* Prop passed in: `TeamChatRoomScreen.tsx:817` → handler at
  **`TeamChatRoomScreen.tsx:398-401`**:

```ts
const handleViewReadHistory = (messageId: string) => {
  navigation.navigate('MessageReadHistory', { messageId, channelId });
};
```

* **The route is never registered.** `grep -rn "MessageReadHistory" src/`
  returns exactly one hit — the `navigate` call above. There is no
  `Stack.Screen name="MessageReadHistory"` in `AppNavigator.tsx` and no
  `MessageReadHistoryScreen` file anywhere in `src/`.

React Navigation treats a navigate to an unknown route as a no-op (it warns in
dev, does nothing in production), so the handler IS wired, fires, and silently
goes nowhere. There is no screen to build on: the target does not exist yet.

Note: `DMChatScreen` renders no `MessageActionsModal` at all (no
`onViewReadHistory` / `onEdit` / `onDelete` wiring), so this long-press menu —
and B2 — are team-room-only.

---

## B3 — sender shown as raw email "googes333@gmail.com (Finn's)"

### Which resolver supplies the name
`useChatSenderLabels` (`hooks/useChatSenderLabels.ts`), via **two SECURITY
DEFINER RPCs**, because RLS blocks a parent from reading another member's
profile directly (`:28-38`):

* `get_channel_member_names(p_channel_id)` → `memberNames` (`:57-72`)
* `get_channel_member_labels(p_channel_id)` → `labelKind` + `playerLabels` (`:96-115`)

Render-time chain in the room — **`TeamChatRoomScreen.tsx:604-608`**:

```ts
senderName={
  memberNames.get(item.user_id)?.name ||
  (item as any).profiles?.full_name ||
  item.profile?.full_name
}
```
No email at this site. Same order at `:438-441` (actions modal) and `:458-461`
(reaction picker), and `MessageActionsModal.tsx:73`.

### Is there ALSO a client-side email fallback? YES — one site.
**`src/hooks/useMessages.ts:358`**, in the optimistic echo of the sender's own
just-sent message:

```ts
profile: {
  full_name: user.user_metadata?.full_name || user.email || 'You',
```

This is a **missed site**: the sibling optimistic path 34 lines later had its
email fallback deliberately removed and carries the rule as a comment
(`useMessages.ts:393-395`):

```ts
// No email fallback here -- a raw email must never become a name.
full_name: user.user_metadata?.full_name || 'You',
```

So `:358` violates a rule the file already states. Because `memberNames` is
consulted first at render, this email is masked as soon as the names RPC map
lands — it shows on the sender's own fresh bubble, and persists while
`memberNames` lacks that user.

### Two candidate sources for what the device showed
1. **`useMessages.ts:358`** — the viewer's own message, before/without
   `memberNames`. Pure client bug, fixable in scope.
2. **The RPC returned the email as `display_name`** — i.e. `get_channel_member_names`
   COALESCEs to email, or `profiles.full_name` itself holds the email for that
   account. Server-side; not fixable in `src/`.

Discriminator: `(Finn's)` proves `get_channel_member_labels` **succeeded** for
this user (it returned `label_kind='parent'` + `child_names='Finn'`). Both RPCs
are called for the same channel, so the names RPC was almost certainly
reachable too — which tilts toward **(2)**, the RPC/`profiles.full_name` holding
the email. Confirm with:
`select user_id, display_name from get_channel_member_names('<channel_id>');`

### The "(Finn's)" suffix source
`ChatBubble.tsx:182` — `({playerLabel}'s)`, where `playerLabel` is
`playerLabels.get(item.user_id)` (`TeamChatRoomScreen.tsx:570-571`) =
`child_names` from the labels RPC (`useChatSenderLabels.ts:110-112`). So
`"Finn"` + `"'s"` → `(Finn's)`. Contract documented at
`useChatSenderLabels.ts:5-8`: parent → `(Zack's)`, player → `(Player)`
(`ChatBubble.tsx:178-180`), staff → no suffix (`:177`).

---

## F2 — edit-own-message feasibility

### Every write to `comm_messages` in `src/`

| op | site | what |
|---|---|---|
| INSERT | `hooks/useMessages.ts:308-311` | the one real message send |
| INSERT | `screens/TeamChatRoomScreen.tsx:265-274` | `message_type:'survey'` share card |
| INSERT | `hooks/usePolls.ts:267` | poll announcement card |
| DELETE | `screens/ChannelPollsScreen.tsx:413-414` | hard delete, poll cleanup |
| soft delete | via RPC `soft_delete_message` (`TeamChatRoomScreen.tsx:375-377`) | not a direct table write |

Reads (for completeness): `useMessages.ts:49`, `:157`; `ChatInfoScreen.tsx:118`,
`:123`; `DirectMessagesScreen.tsx:170`; `useTotalChatUnread.ts:118`.

### Does any UPDATE of `content` exist today? NO.
**There is no `.update()` against `comm_messages` anywhere in `src/`.** Editing
is entirely unimplemented client-side:

* `MessageActionsModal.tsx:174` shows Edit only when `isOwnMessage && canEdit`,
  where `canEdit` is a **3-minute window** from `created_at`
  (`MessageActionsModal.tsx:62-69`).
* It calls `onEdit(message.id)` (`:84-86`) → `TeamChatRoomScreen.tsx:392-395`:

```ts
const handleEditMessage = (messageId: string) => {
  setEditingMessageId(messageId);
  // TODO: Implement edit UI - for now just show alert
  Alert.alert('Edit', 'Edit functionality coming soon');
};
```

* `editingMessageId` is **declared and set but never read** —
  `TeamChatRoomScreen.tsx:122` is its only other occurrence. Dead state.

### What the bubble would need for an "edited" marker
The data contract already exists; the UI does not.

* `src/types/index.ts:57,59` already declare `is_edited: boolean` and
  `edited_at: string | null`.
* `useMessages.ts:352,354` write them (`false` / `null`) into the optimistic
  row only — nothing ever sets them true, and no read path references them.
* **`ChatBubble.tsx` contains zero occurrences of "edited"** (`grep -c` → 0), so
  there is no marker element, style, or prop. Adding one means: a new optional
  prop on `ChatBubble`, a small muted "edited" `<Text>` beside the timestamp,
  and passing `item.is_edited` at the `TeamChatRoomScreen.tsx:604` call site
  (plus `DMChatScreen.tsx`'s equivalent at `:369-372`).
* The `*` selects mean `is_edited`/`edited_at` already arrive on every row if
  the columns exist server-side — unverified here, same gap as B1's columns.

So F2 is: **one UPDATE (new), one 3-minute policy already written, one dead
state variable to use, and one marker element to add.** No read path needs to
change.

---

## Swallowed-error sites in the scoped files

Same hazard class as the Oct 9 attendance read: `__DEV__`-gated logging means a
release build reports nothing. **14 sites.**

| file:line | what is hidden |
|---|---|
| `useMessages.ts:135` | realtime INSERT event trace (log, not an error) |
| `useMessages.ts:146` | realtime row skipped |
| `useMessages.ts:174` | post-INSERT hydrate read failed |
| `useMessages.ts:194` | realtime/refetch failure |
| `useMessages.ts:254` | attachment read as empty → `return false` |
| `useMessages.ts:271` | storage upload error → `return false` |
| `useMessages.ts:288` | upload threw → `return false` |
| **`useMessages.ts:314`** | **message INSERT failed → `return false`** (B1's cause) |
| `useMessages.ts:330` | attachment-row insert failed |
| `useMessages.ts:478` | reaction write refused / rolled back |
| `useChatSenderLabels.ts:74` | names RPC failed → every sender falls back |
| `useChatSenderLabels.ts:120` | labels RPC failed → every suffix disappears |
| `TeamChatRoomScreen.tsx:150` | `error && __DEV__` |
| `DMChatScreen.tsx:128` | `error && __DEV__` |

The two in `useChatSenderLabels` are the most consequential for B3: either RPC
failing degrades silently to "no names / no suffixes" with no signal at all
(`:73-76`, `:117-123`). `TeamChatRoomScreen.tsx:150` / `DMChatScreen.tsx:128`
are the exact `if (error && __DEV__)` shape that hid yesterday's bug — both are
the `last_read_at` mark-read stamps.

Counter-example worth keeping: `handleDeleteMessage`
(`TeamChatRoomScreen.tsx:374-390`) checks `error || data === false` and alerts
the user unconditionally. That is the pattern the rest should follow.

---

## Verdicts

| finding | status | fixable in `src/`? |
|---|---|---|
| **B1** | cause located: wrong copy on a generic failure (`ChatInputBar.tsx:125-129`); the real failure is the INSERT at `useMessages.ts:317` | the misreport yes; the insert failure only if the `reply_to_*` columns exist |
| **B2** | route `MessageReadHistory` never registered; handler fine (`TeamChatRoomScreen.tsx:400`) | needs a new screen + route — not a wiring fix |
| **B3** | one real client email fallback (`useMessages.ts:358`); evidence tilts to the RPC/`profiles.full_name` supplying the email | `:358` yes; the RPC no |
| **F2** | no content UPDATE exists; type + 3-min policy already present, marker absent | yes, entirely |
