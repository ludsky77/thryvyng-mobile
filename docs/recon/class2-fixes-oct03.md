# Class 2 Fixes — single-row queries that break on duplicates
**Date:** 2026-10-03 · **Mode:** code changed, not committed · **Follows:** [bug-class-sweep-oct02.md](bug-class-sweep-oct02.md) §2a
**Patterns ported from:** `a205bbb` (count/head existence check) · EventDetailScreen + CalendarScreen (`limit(1)` upsert guard)

## The 7 sites — all fixed
| file:realLine | Pattern | before → after |
|---|---|---|
| [ChatInfoScreen.tsx:90](../../src/screens/ChatInfoScreen.tsx#L90) | count/head | `team_staff` `.select('id').maybeSingle()` → `.select('id',{count:'exact',head:true})`; `!!data` → `(count ?? 0) > 0`, error handled |
| [PollDetailScreen.tsx:167](../../src/screens/PollDetailScreen.tsx#L167) | count/head | `team_staff` row fetch → count; `if (staffRow)` → `(staffCount ?? 0) > 0`; error branch no longer grants staff |
| [RosterScreen.tsx:108](../../src/screens/RosterScreen.tsx#L108) | count/head | `team_staff` row fetch → count; `!!data` → `(count ?? 0) > 0`, error handled |
| [TeamDetailScreen.tsx:98](../../src/screens/TeamDetailScreen.tsx#L98) | count/head | `.maybeSingle().then(({data}) => …)` → awaited count in an async effect fn; **`error` now destructured at all** |
| [useCalendarEvents.ts:250](../../src/hooks/useCalendarEvents.ts#L250) | limit(1) | `cal_event_rsvps` `.maybeSingle()` → `.limit(1)` + `rows?.[0]`; `lookupError` returns `false` instead of falling through |
| [ChannelPollsScreen.tsx:249](../../src/screens/ChannelPollsScreen.tsx#L249) | limit(1) | `comm_poll_votes` `.maybeSingle()` → `.limit(1)`; lookup error returns early instead of reaching insert; all 3 writes error-checked |
| [ChatScreen.tsx:889](../../src/screens/ChatScreen.tsx#L889) | limit(1) | `club_staff` `.maybeSingle()` → `.limit(1)` + `rows?.[0]`, error handled |

**Duplicate-vote bug closed at both ends.** ChannelPollsScreen was *creating* duplicates:
`maybeSingle()` errored on 2+ rows → `existingVote` null → insert branch → another duplicate.
Fixed by a lookup that tolerates duplicates **and** an early return on lookup error. The update
still targets `(poll_id, user_id)`, not one row id, so existing duplicates converge on the chosen
option. **Nothing deleted** — see queued (a).

Three `.maybeSingle()` remain in these files, all out of scope and judged safe Oct-02:
[PollDetailScreen.tsx:158](../../src/screens/PollDetailScreen.tsx#L158) (`comm_channels` by PK) · [ChatInfoScreen.tsx:146](../../src/screens/ChatInfoScreen.tsx#L146) (§2c ≤1) · [ChatScreen.tsx:979](../../src/screens/ChatScreen.tsx#L979) (§2d `limit(1)`).

## tsc baseline — "delta 0" rule adopted
`npx tsc --noEmit` has **never been green** here: **70 pre-existing error lines** (TrainingStudioScreen,
WellnessParentDashboardScreen, notifications.ts, roleFilters.ts, others) — none from this work. Proven by running tsc
in a throwaway `git worktree` at HEAD: **baseline 70, after 70, delta 0**. The only errors in a touched file are 3
pre-existing `navigation.navigate(… as never)` lines in ChatInfoScreen, byte-identical to HEAD, shifted 338/342/346 →
347/351/355. **Rule adopted:** the gate is *error count unchanged vs HEAD*, not "tsc passes", until the 70 clear. No lint gate exists (`package.json` scripts are start/android/ios/web).

## Queued
**(a) `comm_poll_votes` dedupe migration + unique constraint — SACRED, after 4e.** The client fix converges
duplicate rows but cannot remove them; `total_votes` / `non_voter_count` stay inflated by any row written
before today. Needs one-off dedupe + unique constraint. Schema + data deletion = Lu's approval.

**(b) ㊶a (item 41a) unresolved — check at 4f prep.** Not found in any recon doc:
[identity-resolution-oct02.md](identity-resolution-oct02.md) Table A ends at 40 ("Call sites: 40"), [bug-class-sweep-oct02.md](bug-class-sweep-oct02.md) has no such
numbering, [lineup-master-oct02.md](lineup-master-oct02.md) tables stop at 4, and no lettered sub-items exist in any of the three.
Source unknown — needs whoever cited it to name the table, or re-derive at 4f prep.

## Addendum Oct 5 — 4e link 2 (client-only)
- TeamChatRoomScreen:436,456 + DMChatScreen:340 — reply sender name now memberNames-first (was profile?.full_name ?? Unknown); also stops Unknown persisting into reply_to_sender
- Found: DMChatScreen:298 setCelebration undefined (TS2304, pre-existing) — ticketed
