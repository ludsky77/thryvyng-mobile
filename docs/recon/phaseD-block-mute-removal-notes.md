# Phase D — removal of the fake "Block user" / "Mute user" actions (mobile chat)

**Date:** 2026-10-18 · **Repo:** `thryvyng-mobile` · **Base:** `main` @ `6412f54`
**Ruling:** 2026-10-15 (Lu) — Thryvyng has **no block feature**. Hide and Mute arrive later
as **Chat List v2 swipe actions**. Web never shipped these buttons (re-verified Oct 18), so
removing them on mobile **restores parity** rather than dropping a feature.

**Status:** AGENT-ONLY. Typecheck, lint and an iOS bundle export are the only proof;
nothing was run on a device or simulator. Click-through still owed (see §5).

---

## 1. What was actually there (why it had to go)

Both actions were **cosmetic**. Neither wrote anything, to any table, ever.

| Action | Handler at HEAD `6412f54` | What it did |
|---|---|---|
| Mute | `TeamChatRoomScreen.tsx:502-505` | `// TODO: Implement mute in database` then `Alert.alert('Muted', '<name> has been muted in this conversation')` |
| Block | `TeamChatRoomScreen.tsx:507-510` | `// TODO: Implement block in database` then `Alert.alert('Blocked', '<name> has been blocked from this channel')` |

So the sheet told a user the person **had been** muted/blocked — past tense, as a completed
fact — while no row was written and the next message from that sender arrived normally. The
Block row was additionally gated to staff (`isStaff`), which made it read as a real
moderation power the product does not have.

The confirm copy was worse than the toast, because it was specific:
`'This user will not be able to send messages in this channel until unblocked.'`

## 2. Sites found (grep sweep, not just the named lines)

Sweep run before editing:

```
grep -rniE "block ?user|blockuser|mute ?user|muteuser" src/
```

**14 hits across 2 files** — no third file anywhere under `src/`. Both files were already
named in SCOPE, so the same-stone sweep added **0** new files (well under the 10-site fold-in
limit). `MessageActionsModal` has exactly **one** consumer (`TeamChatRoomScreen.tsx:29`),
confirmed by `grep -rn "MessageActionsModal" src/`, so no other screen lost a prop.

## 3. What changed, file:line (line numbers are **pre-edit**, against `6412f54`)

### `src/components/chat/MessageActionsModal.tsx` (−95 lines net)

| Removed | Was at | Note |
|---|---|---|
| Mute row (icon `bell-off`, title + description) | `264-275` | rendered on every non-own message |
| Block row (icon `x-square`, title + description) | `277-288` | staff-only, destructive styling |
| `handleMute` confirm dialog | `142-159` | |
| `handleBlock` confirm dialog | `161-179` | |
| `onMuteUser` / `onBlockUser` props | `61-62`, `78-79` | interface + destructuring |
| `senderName` prop + its doc comment | `50-55`, `72` | **dead once both rows went** — it existed only for the Mute/Block copy |
| `const senderName = …` | `105` | last reader was `handleMute`/`handleBlock` |
| `message.profile?.full_name` type field | `44-46` | its only read was the `senderName` fallback |
| `TONE.neutral` (`#9CA3AF`) | `30-31` | only use was the Mute row's icon colour |
| `styles.actionContent` | `336-338` | only the two removed two-line rows used it |
| `styles.actionDescription` | `344-349` | same — no remaining row has a description |

Also updated the `TONE` doc comment: it said "Three tones, and only three … red is reserved
for Delete and Block". Now two tones, and `danger` is reserved for Delete alone. A comment
block replaces the two rows at the same spot, recording the ruling so the rows are not
re-added before the state is real — matching the existing "View Profile was removed here"
comment convention already in this file.

**Kept deliberately:** `isStaff` (still gates `canDelete` and `canViewReadHistory`),
`Alert` (still used by Copy and Delete), `onViewProfile` (its own earlier comment says the
prop is kept so callers do not break — out of this scope).

### `src/screens/TeamChatRoomScreen.tsx` (−17 lines)

| Removed | Was at |
|---|---|
| `handleMuteUser` | `502-505` |
| `handleBlockUser` | `507-510` |
| `onMuteUser={handleMuteUser}` / `onBlockUser={handleBlockUser}` | `926-927` |
| `senderName={…memberNames.get(...)…}` prop pass | `917-921` |

**Kept:** `memberNames` (15 other call sites — bubbles, replies, typing, reaction picker),
`Alert` (4 remaining uses in this file), `isStaffInChannel` (still passed as `isStaff`).

## 4. How verified

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | **64 errors before → 64 after.** `diff` of the two full outputs is **empty** — byte-identical error list. Zero errors in either touched file. (The ~70 figure in older notes is now 64 at this HEAD.) |
| `npx eslint <each touched file>` | `TeamChatRoomScreen.tsx` **0e/38w → 0e/38w**; `MessageActionsModal.tsx` **0e/1w → 0e/1w**. No new warnings. The modal's one surviving warning is pre-existing: `onViewProfile` defined but never used. |
| `npx expo export --platform ios --output-dir /tmp/exp-check` | **exit 0**, iOS bundle written (`index-e00c27ff….hbc`, 9.01 MB) |
| grep sweep (§2) re-run | **zero hits under `src/`** |

**ESLint note (worth fixing later, not fixed here):** the repo has a legacy
`.eslintrc.json` but ESLint **9.39.4**, which defaults to flat config — a bare
`npx eslint` **fails to start** ("couldn't find an eslint.config.js"). Lint was run as
`ESLINT_USE_FLAT_CONFIG=false npx eslint …`, which still works in v9 but is **removed in
v10**. There is also no `lint` script in `package.json`. Migrating is a config +
possibly-dependency change, so it was left alone and is reported instead.

## 5. Click-through still owed (device or simulator)

Long-press any message **from someone else** in a team chat, as a **staff** account (staff is
what used to reveal Block). The Actions sheet must show only: Copy · Delete Message ·
View Read History · Add Reaction · Reply (Edit appears only on your own message within
5 minutes). **"Mute <name>" and "Block <name>" must not appear at all** — not greyed out,
not disabled, absent. Repeat as a non-staff account: Mute must also be gone there, since it
previously rendered for every non-own message regardless of role.

## 6. Carried forward

- Chat List v2 (Hide / Mute as swipe actions) is where mute returns. When it lands, the
  message-actions sheet is **not** the place to re-add a row until a real mute/hide row
  exists to write — the replacement comment in `MessageActionsModal.tsx` says so inline.
- Nothing server-side was touched: no migration, no RLS, no RPC. There is no
  block/mute table to drop, because there never was one.
