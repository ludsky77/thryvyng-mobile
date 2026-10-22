# Stage 4 — mobile type-error cleanup (64 → 0)

**Task.** `npx tsc --noEmit` reported **64 errors** at base `63d4b54` (main, clean),
2026-10-21. Goal: 0, with **no runtime behaviour change**. Types, imports, null-guards
and narrowings only.

**Config, unchanged.** `tsconfig.json` = `expo/tsconfig.base` + `"strict": true`.
Read-only in this pass, as was `.eslintrc.json`.

**Why there are 64 and not 0 already.** Two structural causes account for 20 of them:

1. `src/lib/supabase.ts` calls `createClient(url, key)` with **no `Database` generic**.
   Every `.select()` therefore returns column values as `any` and — this is the part that
   bites — infers each **nested embed as an array** (`teams: {...}[]`), because an untyped
   client cannot know a relationship is many-to-one. The runtime shape from PostgREST for
   these selects is a single object, which is what the hand-written local interfaces say.
   So 14 `as X` casts are all "neither type sufficiently overlaps" (TS2352). The types are
   right about runtime; the inference is not. (Group A.)
2. The inner `const Stack = createNativeStackNavigator()` in
   `src/navigation/AppNavigator.tsx:126` is **untyped**, and nothing augments the global
   `ReactNavigation.RootParamList`. So a bare `useNavigation()` yields
   `NavigationProp<{}>`, `keyof` that is `never`, and `navigate(name, params)` resolves its
   whole argument tuple to `never`. The existing `as never` casts satisfy the 1-argument
   form but not the 2-argument one. (Group B.)

`src/types/index.ts:288` holds a stale 4-route `RootStackParamList` (Auth/Dashboard/
TeamChat/Calendar) that is **not** the live one; the live list is
`src/navigation/linking.ts:16`. Nothing in `src/` imports the stale one. Left alone — out
of scope, recorded here so the next pass does not trust it.

---

## Groups (counts BEFORE editing — total 64)

| # | Group | Count | Codes | Root cause | Fix shape |
|---|---|---|---|---|---|
| A | Supabase nested-embed casts | 14 | TS2352 | untyped client infers embeds as arrays (see above) | `as X` → `as unknown as X` at the same site |
| B | Untyped `useNavigation()` | 6 | TS2345 | no `RootParamList`; arg tuple is `never` | type the hook with `RootStackParamList`, drop `as never` |
| C | `.catch()` on a PostgREST builder | 6 | TS2339 | `PostgrestBuilder.then()` is declared `PromiseLike`, which has no `.catch` | `.catch(f)` → `.then(undefined, f)` (spec-identical) |
| D | `styles.X` never defined | 5 | TS2339 ×4, TS2551 ×1 | style key referenced but absent from the `StyleSheet.create` object | add the missing key as `{}` — see the warning below |
| E | `drill.*` is `unknown` | 5 | TS2345 | `getLocalizedContent<T>` infers `T = unknown` from an untyped row field | cast the result, matching the file's own idiom at `:166-167` |
| F | hardcoded `const LANG = 'en'` | 3 | TS2367 | literal type `'en'`, so `LANG === 'es'` is "no overlap" | annotate `const LANG: 'en' \| 'es' = 'en'` |
| G | `Team.invitation_code` missing | 3 | TS2339 | field absent from the `Team` interface | add it, optional, at the type's source |
| H | duplicate object keys | 2 | TS1117 | same style key twice; **last wins** at runtime | delete the earlier, dead block |
| I | `string \| null` vs `undefined` | 2 | TS2345 | callee param narrower than the caller's value | widen the callee param at its source |
| J | nullable without a guard | 2 | TS18048, TS18047 | `engagement?.x?.length > 0` — `undefined > 0` is `false` at runtime | `(… ?? 0) > 0` and `?.[0]?.` |
| K | `lesson_type` undefined | 2 | TS2345 | callee takes `string \| null`, value is `string \| null \| undefined` | widen the callee param |
| L | one-offs (8 files) | 8 | see below | unrelated singles | per-site, listed below |
| — | **BEHAVIOUR-REQUIRED** | **6** | TS2304 ×2, TS2448, TS2454, TS2322 ×2 | real latent bugs; no type-only fix exists | **not fixed** — see the section at the end |

Group L, one error each:
- `CreateEvaluationScreen:418` TS2345 — `DIMENSIONS` lacks `as const`, so `key` is `string`
  and will not go into a 4-member union `setState`.
- `NotificationSettingsScreen:98` TS2783 — `{ user_id: user.id, ...updated }`; `updated`
  already carries `user_id` and overwrites it. The explicit key is dead.
- `TeamStaffScreen:216` TS2561 — `handleStaffPress({ ...member, profile: member.profiles })`
  passes `profile`, which `StaffMember` does not declare (it declares `profiles`).
- `useNotifications.ts:8` TS2724 — re-exports `type NotificationType` from
  `NotificationContext`, which has never exported it. Nothing imports it from here.
- `useLiveGameSession.ts:10` TS2554 — `useRef<T>()` with no argument; React 19 types
  require one.
- `DayView.tsx:205` TS2322 — `getEventStyle` returns `left: string` where RN wants
  `DimensionValue`; a template literal over a `number` widens to `string` with no
  contextual type to hold it.
- `JoinStaffScreen:244` TS2339 — `invitation.team?.name` on the raw row, where the embed
  is inferred as an array. Same root as Group A, one line earlier than its cast.
- `EventCard:54` TS2345 — counted in Group B.

### Group D warning — these are real visual bugs, not type noise

`styles.backButton`, `styles.backButtonIcon`, `styles.headerRight`
(`CoursesScreen:399-405`, the empty-state header only), `styles.content`
(`DrillDetailScreen:73`, the loading skeleton) and `styles.statusPillText`
(`LineupEditorScreen:972`) all evaluate to `undefined` **today**. React Native silently
ignores an undefined style, so those elements render unstyled right now.

Adding each key as `{}` is exactly behaviour-preserving (`undefined` and `{}` render
identically) and that is what this pass does. It does **not** fix the appearance. Writing
real values would change pixels, which this task forbids. `statusPillText` is the clearest
case: TS suggests `statusPill`, but applying a pill's padding/radius to the `<Text>` inside
the pill would visibly change the control. Left for a styling pass.

## `@ts-expect-error` used: 0 (budget was 3)
## `@ts-ignore` used: 0
## widening to `any`: none added

---

## BEHAVIOUR-REQUIRED — 6 errors left in place

Each is a live bug. Clearing the type error means changing what the code does at runtime,
which is outside this task. Smallest proposed change given for each; none applied.

1. **`src/components/games/DribbleRushGame.tsx:712` and `:713`** — TS2304,
   `Cannot find name 'getGutterBoundaryX'`. The function does not exist anywhere in the
   repo (grepped). `renderGutterZones()` is called from the render tree at `:764`, so this
   is a **ReferenceError on every render of the Dribble Rush field** — the game screen
   cannot be drawing today. Proposed: recover the helper (it looks deleted, not
   never-written — `git log -S getGutterBoundaryX` should find it) or remove the
   `renderGutterZones` call. Both change runtime. **Needs Lu.**
2. **`src/components/games/AnticipationArenaGame.tsx:283`** — TS2448 + TS2454 (2 errors,
   one site). `getEffectiveLanding` is a `useCallback` declared at `:318`, but it is named
   in the dependency array at `:283`, which is evaluated **during render**, before `:318`
   runs. That is a temporal-dead-zone **ReferenceError on mount**. Proposed: move the
   `getEffectiveLanding` declaration (`:318-328`) above `handlePrediction` (`:252`). Pure
   reorder, no logic edit — but it turns a crash into a working screen, so it is a
   behaviour change and is Lu's call. **Needs Lu.**
3. **`src/components/games/PatternPlayGame.tsx:427`** — TS2322.
   `onPress={startRound}` where `startRound(effectiveRound?: number)` uses
   `effectiveRound ?? round` at `:203`. React Native passes a `GestureResponderEvent` as
   the first argument, so the Start button runs the game with a **synthetic event object as
   the round number**. Proposed: `onPress={() => startRound()}`. One line, and it changes
   what the first round does. **Needs Lu.**
4. **`src/services/notifications.ts:30`** — TS2322. `NotificationBehavior` in
   expo-notifications 0.32 (SDK 54) requires `shouldShowBanner` and `shouldShowList`; the
   handler returns neither, only the deprecated `shouldShowAlert`.
   `node_modules/expo-notifications/build/NotificationsHandler.js:65-68` **only warns** on
   `shouldShowAlert` and then passes the object straight to the native module — there is no
   fallback mapping in JS. So foreground notifications are very likely showing **no banner
   at all** right now, in both branches of the handler. Whether the iOS native layer
   defaults a missing `shouldShowBanner` to true is **UNKNOWN** from this repo — INFERRED
   from the JS handler only. Proposed: in the "show" branch return
   `shouldShowBanner: true, shouldShowList: true`, in the in-channel suppress branch
   `false, false`, and drop `shouldShowAlert`. That would **start showing foreground
   banners**, a user-visible change. **Needs Lu.**

---

## Per-group result

tsc re-run after each group; the full error list was diffed against the base list every
time, and **no new error appeared at any step**.

| Group | Fix applied | tsc after |
|---|---|---|
| A | 13 × ` as X` → ` as unknown as X`, plus one `const invite = invitation as unknown as InvitationInfo;` hoisted above the `__DEV__` log in `JoinStaffScreen` so `:244` and `:248` share one cast | 64 → **49** |
| B | `useNavigation<NativeStackNavigationProp<RootStackParamList>>()` at 5 sites; 7 `as never` casts dropped; `RootStackParamList` gained `PlayerProfile`, `EvaluationDetail`, and `returnTo`/`returnParams` on `Login` | 49 → **43** |
| C | `.catch(fn)` → `.then(undefined, fn)` (its exact desugaring, per spec) at 6 sites, with the reason commented once in `CoachDashboard` | 43 → **37** |
| D | 5 missing style keys declared `{}`, each commented | 37 → ↓ |
| E | new local `type LocalizedText` in `DrillDetailScreen` + 5 casts, matching the file's `:166-167` idiom | ↓ |
| F | `const LANG: 'en' \| 'es' = 'en'` in 3 survey screens | ↓ |
| G | `invitation_code?: string \| null` on `CoachDashboard`'s local `Team` | ↓ |
| H | the earlier, dead duplicate deleted (`votedIndicator` in `PollCard`, `passButtonText` in `DribbleRushGame`) — last-wins means the surviving block is the one already in effect | ↓ |
| I | `openInMaps(address, locationName?: string \| null)`; the body's `address \|\| locationName \|\| ''` treats null and undefined alike | ↓ |
| J | `(engagement?.topics_viewed?.length ?? 0) > 0` and `engagement?.topics_viewed?.[0]?.title` | ↓ |
| K | `getLessonTypeIcon(lessonType: string \| null \| undefined)` in both course screens; the body already used `?.toLowerCase()` | ↓ |
| L | `DIMENSIONS` → `as const`; dead `user_id:` dropped from the upsert (it was spread over); `profile?:` added to `StaffMember`; the never-exported `type NotificationType` re-export removed; `useRef<T \| undefined>(undefined)`; `getEventStyle(): ViewStyle`; `placement_status?:` added to `UserRole` | **37 → 6** |

### Two changes worth a second look (both verified behaviour-identical)

- **`NotificationSettingsScreen`** — removing `user_id: user.id` from the upsert payload is
  safe because `...updated` was already overwriting it: `updatePreference` returns early on
  `!preferences` (`:87`), and `NotificationPreferences` declares `user_id` as required, so
  `updated.user_id` is always the key that reached PostgREST. Same bytes on the wire.
- **`CoursePlayerScreen:290`** — `.then(() => {}).catch(() => {})` became
  `.then(undefined, () => {})`. The awaited value is discarded either way and rejections
  are still swallowed.

## What this pass did not do

- `src/lib/supabase.ts` still has no `Database` generic. That is the single change that
  would delete Group A outright (14 of the 64) and type every `.select()` in the app. It
  needs generated types from the schema, so it is a slice of its own.
- No global `ReactNavigation.RootParamList` augmentation. Adding one would type every bare
  `useNavigation()` in the app at once — the right end state, but it would surface a large
  number of new errors in one go. The 5 sites that needed it were typed individually.
- The 6 BEHAVIOUR-REQUIRED errors above.
