# Arcade recon — hide the old games, add an arcade portal, run HTML games in a WebView

**Date:** 2026-11-02 · **Mode:** read-only (static source + migrations + generated types; no DB query, no app run)
**Repos read:** `thryvyng-mobile` @ `ccebd4f` · `thrive-and-score` @ `437d9a3` (READ-ONLY)
**Builds on:** [games-audit.md](games-audit.md) (Oct 9, `3834065`). Rechecked here: the 7 game components and line counts are unchanged except `DribbleRushGame.tsx` 2393 → 2387 (lint/type commits `0cd34dd`, `24f0596`, `31ad6b7`).
**Tags:** PROVEN = read in source/migration/types with file:line · INFERRED = reasoned, not run · UNKNOWN = needs the named check.

---

## 0. Headline findings (read first)

1. **Mobile brain games do not save — INFERRED, strong evidence.** `useGameSession.recordSession` inserts `player_id, game_id, level_number, score, xp_earned, …, is_perfect` into `game_sessions` ([useGameSession.ts:60-73](../../src/hooks/useGameSession.ts#L60)). The live `game_sessions` is now the **soccer live-stats table** (`event_id`, `team_id`, `status`, `home_score`, `stats_keeper_id`, … and no `player_id`/`game_id`/`score`) per the web's generated types, regenerated 2026-10-31 (`thrive-and-score/src/integrations/supabase/types.ts:4184`, last commit `d765132`). The insert should fail, `recordSession` throws at step 1, and **progress, daily time and XP are never written on mobile**. The mobile live-stats code uses the same table ([gameStatsService.ts:120,250](../../src/services/gameStatsService.ts#L120), [GameEntryButton.tsx:60](../../src/components/game-stats/GameEntryButton.tsx#L60)). Check: one played level on device → look for the "save failed" alert, or query `game_sessions` columns.
2. **Game XP is once per game, forever — PROVEN from SQL.** `award_xp_safe` refuses a second award for the same `(player_id, source_type, source_id)` (`thrive-and-score/supabase/migrations/20251214125018_…sql:52-87`) and every game passes `source_type 'cognitive_game'`, `source_id = game id` (mobile [useGameSession.ts:162-167](../../src/hooks/useGameSession.ts#L162); web e.g. `src/components/games/AnticipationArenaGame.tsx:94-99`). So a player earns `players.total_xp` from each game exactly once; later plays add nothing there.
3. **Hiding needs no code — PROVEN.** Both hubs list only `cognitive_games WHERE is_active = true` (mobile [useCognitiveGames.ts:23-27](../../src/hooks/useCognitiveGames.ts#L23), web `src/pages/GamesHub.tsx:20-23`), RLS `"Anyone can view active games"` filters the same way, and the web admin page already has an `is_active` toggle (`src/pages/admin/CognitiveGamesAdmin.tsx:392`, `/admin/games`). Flipping `is_active=false` hides a game on web and mobile at once. That is a live data write → SACRED-adjacent, Lu's call.
4. **Removing the old games breaks nothing that reads XP — INFERRED.** All XP surfaces read `players.total_xp` (§5.3); game XP already landed there stays. Only the games' own screens and tables lose meaning.

---

## 1. Mobile — files, routes, entry points

### 1.1 Games-only files (13 files, 10,428 lines)

| path | lines | one line |
|---|---|---|
| [src/screens/GamesHubScreen.tsx](../../src/screens/GamesHubScreen.tsx) | 470 | the hub: header, XP/min-left tiles, one card per active game, `GAME_ICONS` map (5 slugs, :20-26) |
| [src/screens/GamePlayScreen.tsx](../../src/screens/GamePlayScreen.tsx) | 677 | level select + slug router (:213-415) + shared results; unknown slug → "Coming soon!" (:415) |
| [src/hooks/useCognitiveGames.ts](../../src/hooks/useCognitiveGames.ts) | 115 | hub data: active games, progress, daily time; `minutesRemaining = 999` TEMP bypass (:93) |
| [src/hooks/useGameSession.ts](../../src/hooks/useGameSession.ts) | 188 | levels + `recordSession` (4 writes + XP RPC) |
| [src/types/games.ts](../../src/types/games.ts) | 178 | game/level/progress/session types |
| [src/components/games/FieldVisionGame.tsx](../../src/components/games/FieldVisionGame.tsx) | 1099 | `field-vision` |
| [src/components/games/PatternPlayGame.tsx](../../src/components/games/PatternPlayGame.tsx) | 1168 | `pattern-play` (also reads `pattern_play_scenarios`/`_formations`, :132) |
| [src/components/games/DecisionPointGame.tsx](../../src/components/games/DecisionPointGame.tsx) | 873 | `decision-point` |
| [src/components/games/AnticipationArenaGame.tsx](../../src/components/games/AnticipationArenaGame.tsx) | 1057 | `anticipation-arena` |
| [src/components/games/PressureProtocolGame.tsx](../../src/components/games/PressureProtocolGame.tsx) | 829 | `pressure-protocol` |
| [src/components/games/DribbleRushGame.tsx](../../src/components/games/DribbleRushGame.tsx) | 2387 | `dribble-rush` (mobile only, no web twin, no migration seed) |
| [src/components/games/AngleMasterGame.tsx](../../src/components/games/AngleMasterGame.tsx) | 1258 | `angle-master` |
| [src/components/games/SpinCueOverlay.tsx](../../src/components/games/SpinCueOverlay.tsx) | 129 | visual used by Anticipation Arena only |

NOT games (same word, different feature — live soccer stats): `src/screens/game-stats/`, `src/components/game-stats/`, `src/hooks/useLiveGameSession.ts`, `src/services/gameStatsService.ts`, `src/types/game-stats.ts`.

### 1.2 Routes and how the hub is reached

| what | where | note |
|---|---|---|
| `GamesHub` route | [AppNavigator.tsx:112](../../src/navigation/AppNavigator.tsx#L112) lazy import, [:407-408](../../src/navigation/AppNavigator.tsx#L407) `Stack.Screen`, `headerShown:false` | stack only, no tab |
| `GamePlay` route | [AppNavigator.tsx:129](../../src/navigation/AppNavigator.tsx#L129), [:467-468](../../src/navigation/AppNavigator.tsx#L467) | params `{gameId, gameSlug, gameName}` |
| Player entry | [PlayerDashboard.tsx:285-289](../../src/components/dashboards/PlayerDashboard.tsx#L285) quick action "Games" | |
| Coach entry | [CoachDashboard.tsx:479-483](../../src/components/dashboards/CoachDashboard.tsx#L479) quick action "Brain Games", passes `{teamId}` the hub never reads | |
| Deep links | none — `src/navigation/linking.ts` has no games route (grep) | |
| Feature flag | **none for games.** No role guard either. The app's flag pattern is `src/constants/playbookLaunch.ts` (`PLAYBOOK_LIVE`, a plain constant + derived gate) and `POLL_REMINDERS_ENABLED` in `CreatePollModal.tsx:85` | an `ARCADE_LIVE` would copy `playbookLaunch.ts` |

Which games show: whatever `cognitive_games` rows are `is_active` — the code has no list. Live row state is UNKNOWN (check: `select slug,is_active,display_order from cognitive_games`).

### 1.3 The "5 old games" — which 5?

Migration `20260115030431` seeds exactly 5: `field-vision`, `pattern-play`, `decision-point`, `anticipation-arena`, `pressure-protocol` (display 1-5). `angle-master` was added later (`20260214125209`, display 7). `dribble-rush` has **no migration anywhere** (grep) — live DB only, if at all. The mobile hub icon map and the web dashboard copy ("5 games designed…", web `PlayerDashboard.tsx:914`) both speak of 5. **NEEDS LU:** confirm "the 5" = the seeded 5, and what happens to Angle Master and Dribble Rush.

---

## 2. Mobile — WebView, haptics, session

| item | state | proof |
|---|---|---|
| `react-native-webview` | **YES, 13.15.0** | `package.json:49`; `node_modules/react-native-webview/package.json` `"version": "13.15.0"` |
| `expo-haptics` | **NO** | absent from `package.json`; `node_modules/expo-haptics` missing; 0 `Haptics` calls in `src` (also noted in `ChatBubble.tsx:95`, `RsvpPill.tsx:59`). Adding it = new dependency + native rebuild → SACRED |
| `expo-av` | yes ~16.0.8 | audio for HTML games would run inside the WebView instead |
| Expo SDK / RN | `expo ~54.0.32`, `react-native 0.81.5` | |

### Existing WebView screens (2) — neither passes the signed-in session

| file | what it loads | session? |
|---|---|---|
| [src/components/CaptchaModal.tsx:11,169-174](../../src/components/CaptchaModal.tsx#L169) | inline HTML (`source={{ html, baseUrl: 'https://thryvyng.com' }}`), page → app via `window.ReactNativeWebView.postMessage` (:90-91), app parses in `onMessage` (:143-153) | **no** — one-way token out |
| [src/screens/parent/ParentPaymentsScreen.tsx:23-31,1103-1106](../../src/screens/parent/ParentPaymentsScreen.tsx#L1103) | Stripe card-setup URL from edge fn `create-card-setup-session` (:831,864); guarded `require` so Expo Go doesn't crash (:23-31); watches `onNavigationStateChange` for return URL (:779) | **no** — Stripe URL is self-authorising |

Auth on mobile: Supabase client with `AsyncStorage`, `persistSession`, `autoRefreshToken` ([src/lib/supabase.ts:9-11](../../src/lib/supabase.ts#L9)). No code today injects the JWT into a page. **So the arcade WebView has no session pattern to copy;** the `postMessage` bridge in `CaptchaModal` is the pattern to reuse (game posts `{type:'result', …}` → app saves with its own session), which keeps the token out of the page. INFERRED design note, not a decision.

---

## 3. How the old games save results

### 3.1 Mobile — `recordSession` ([useGameSession.ts:54-177](../../src/hooks/useGameSession.ts#L54)), client-side, 4 non-atomic steps

| # | write | line |
|---|---|---|
| 1 | insert `game_sessions` (cognitive shape) — **see §0.1, likely fails here** | :60-75 |
| 2 | read + update/insert `player_game_progress` (`current_level`, `highest_level_completed`, `total_xp_earned`, `best_scores`) | :79-121 |
| 3 | read + update/insert `daily_game_time` | :130-153 |
| 4 | `rpc('award_xp_safe', {p_player_id, p_source_type:'cognitive_game', p_source_id: gameId, p_amount: xpEarned})` — amount computed on device | :162-167 |

Also read: `cognitive_games`, `player_game_progress`, `daily_game_time` ([useCognitiveGames.ts:24,43,63](../../src/hooks/useCognitiveGames.ts#L24)), `game_levels` ([useGameSession.ts:25](../../src/hooks/useGameSession.ts#L25)), `pattern_play_scenarios` + nested `pattern_play_formations` ([PatternPlayGame.tsx:132](../../src/components/games/PatternPlayGame.tsx#L132)). Player id = `currentRole.entity_id`.

### 3.2 Web — each game component saves for itself (6 copies)

Each of the 6 web games reads `cognitive_games`, `game_levels`, `player_game_progress`, calls `award_xp_safe` (`source_type 'cognitive_game'`, `source_id = game id`), then updates/inserts `player_game_progress`. Lines: FieldVision `:52,60,79,117,128,138` · PatternPlay `:54,63,82,114,124,133` · DecisionPoint `:118,127,145,170,179,188` · AnticipationArena `:42,51,69,94,103,112` · PressureProtocol `:207,216,233,265,274,286` · AngleMaster `:254,262,279,304,313,322` (all in `thrive-and-score/src/components/games/`). **Web writes neither `game_sessions` nor `daily_game_time`**, so web saves are not hit by §0.1.

### 3.3 `award_xp_safe` (PROVEN, `20251214125018_…sql:52-87`)

`SECURITY DEFINER`; if a row exists in `xp_awards` for `(player, source_type, source_id)` → returns `already_awarded`; else inserts `xp_awards` and adds `p_amount` to `players.total_xp`. No cap on `p_amount`, no check that the caller owns `p_player_id` in this definition. Not restated since (grep; `20261029110000_sec_roles_pathways.sql:82` lists it as "CALLED, none restated"). Grants: none found in migrations → UNKNOWN (check `\df+ award_xp_safe` / `has_function_privilege`).

---

## 4. Web — routes, components, admin

| what | where |
|---|---|
| `/games` hub | `src/App.tsx:131` lazy, `:230` `<ProtectedRoute><GamesHub/>` → `src/pages/GamesHub.tsx` (162) |
| `/games/:slug` | `src/App.tsx:132`, `:231` → `src/pages/GamePlay.tsx` (66), `switch(slug)` 6 cases (`:19-31`), no `dribble-rush` |
| admin `/admin/games` | `src/App.tsx:133`, `:296` → `src/pages/admin/CognitiveGamesAdmin.tsx` (797): edit games + levels, `is_active` toggles (`:392`, `:580`, `:709`) |
| admin nav | `src/components/admin/AdminSidebar.tsx:81-83` "🧠 COGNITIVE GAMES" → "Games Management" |
| player entry | `src/pages/PlayerDashboard.tsx:894-930` `CognitiveTrainingCard` ("5 games…" `:914`, navigate `/games` `:930`), tab `games` `:953-984` |
| components | `src/components/games/` — 6 games (`FieldVision 578`, `PatternPlay 579`, `DecisionPoint 525`, `AnticipationArena 494`, `PressureProtocol 791`, `AngleMaster 678`) + shared `SoccerField 421`, `PlayerMarker 89`, `SoccerBall 53`, `ProgressRing 61`, `TimerBar 45`, `GameCard 89`, barrel `index.ts 18` |
| tokens | `src/lib/game-design-tokens.ts` (322) — `gameColors` |

Web games files: **15** (13 in `components/games` + `GamesHub.tsx` + `GamePlay.tsx`), plus admin page and token file = 17. Web flag: none for games.

---

## 5. Database — games objects, RLS, and who reads them

### 5.1 Tables (source: `thrive-and-score/supabase/migrations/20260115030431_…sql` unless noted; mobile repo has 1 migration, none games)

| table | key columns | RLS |
|---|---|---|
| `cognitive_games` | slug UNIQUE, name, icon, skill_type, primary_color, `is_active`, display_order | SELECT `is_active = true` (anyone); INSERT/UPDATE/DELETE `platform_admin` |
| `game_levels` | game_id → cascade, level_number, `config jsonb`, xp_reward, field_type, is_active | same shape as above |
| `player_game_progress` | player_id, game_id UNIQUE pair, current_level, highest_level_completed, total_xp_earned, total_sessions, best_scores | SELECT/INSERT/UPDATE: `player_id IN (players WHERE parent_email = my profile email)` OR platform_admin; no DELETE |
| `game_sessions` | **migration** defines the cognitive shape; **live types** show the soccer-stats shape (§0.1). Soccer CREATE is not in any migration (grep `stats_keeper_id`: 0) | migration policies: own via parent_email; live policies UNKNOWN |
| `daily_game_time` | player_id, date UNIQUE pair, minutes_played, sessions_count, games_played | own via parent_email, no DELETE |
| `game_achievements` | player_id, achievement_type, game_id | own via parent_email; **no code reads or writes it** (grep both repos) |
| `angle_master_progress` | `20260214125209_…sql:41-55`, one row per player | **unused by code** (grep) |
| `angle_master_scenarios`, `pattern_play_scenarios`, `pattern_play_formations` | in live types (`types.ts:140,6165,6198`), **no migration** | UNKNOWN |
| `xp_awards` | `20251214125018`; (player, source_type, source_id) UNIQUE | SELECT policy rewritten `20260112205506:198-204`, `20260112214626:101-105`; INSERT `WITH CHECK (true)` |
| `daily_time_tracking` | **does not exist** — 0 hits in both repos and in types. The real name is `daily_game_time`. |

RLS note (INFERRED): the progress/session/daily policies match on `players.parent_email = the signed-in profile email`. A player who signs in with their own (non-parent) email would fail those writes. Check: one player-role account, play one web level, see if `player_game_progress` gets a row.

### 5.2 Functions

| fn | source | used by |
|---|---|---|
| `award_xp_safe` | migration `20251214125018:52` | all games (both repos), `award_pathway_xp` (`20261029110000:722`) |
| `increment_player_xp` | `20251214125018:10` | no game code |
| `generate_angle_master_scenario` | types only (`types.ts:13359`), no migration | no code (grep) |
| `award_game_participation_xp` | types only (`types.ts:13247`), no migration | no code (grep); name suggests soccer participation — UNKNOWN |

### 5.3 What else READS them = what could break if the games disappear

| reader | reads | breaks if games hidden? |
|---|---|---|
| mobile `PlayerDashboard.tsx:84,111-113,161-163,258,506,526` (XP badge, level = total_xp/1000, team leaderboard) | `players.total_xp` | no — value stays, just stops growing from games |
| mobile `CoachDashboard.tsx:139-141,184,557` (team XP total + leaderboard) | `players.total_xp` | no |
| mobile `PlayerProfileScreen.tsx:62,198` | `players.total_xp` | no |
| web `PlayerDashboard.tsx:398,421,755,838` (XP bar) | `players.total_xp` | no |
| web `components/team/TeamOverviewTab.tsx:82-97,589` (team XP leaderboard) | `players.total_xp` | no |
| web `admin/PlayersManagement.tsx:260` | `players.total_xp` | no |
| web `admin/Analytics.tsx:177` | `xp_awards` **filtered `source_type LIKE 'pathway%'`** | no — game awards already excluded |
| web `CognitiveGamesAdmin.tsx` | `cognitive_games`, `game_levels` | no — it is how you hide them |
| mobile `GamesHubScreen` "XP earned" tile | sum of `player_game_progress.total_xp_earned` (`useCognitiveGames.ts:96`) | goes away with the hub |
| `delete_team_guarded` (`20261022070000:441`) | `game_sessions.team_id` (soccer shape) | no — soccer table, not the games |

Nothing outside the games' own screens reads `cognitive_games`, `game_levels`, `player_game_progress`, `daily_game_time`, `game_achievements` or `angle_master_*` (grep both repos, excluding generated types). **Hard-deleting rows would cascade** (`ON DELETE CASCADE` from `cognitive_games` to levels, progress, sessions-by-migration, achievements) — use `is_active=false`, not delete.

---

## 6. Web static folder for a standalone HTML game

| item | value | proof |
|---|---|---|
| framework | Vite 5 SPA (`react-router-dom` 6) | `package.json` |
| static folder | `public/` (Vite default; `vite.config.ts` sets no `publicDir`) → copied to `dist/` root | grep `publicDir` 0 hits |
| URL pattern | `public/arcade/<name>.html` → `https://thryvyng.com/arcade/<name>.html` | existing `public/google6fae00e63a0a76e1.html` is served the same way (INFERRED it is live) |
| SPA catch-all | `vercel.json` last rewrite `"/(.*)" → "/index.html"` | Vercel serves a real file before applying rewrites (Vercel routing order — INFERRED from platform docs, not tested here) |
| service worker | `public/sw.js` handles push only, **no `fetch` listener** (grep) → will not intercept the HTML | |
| headers | `vercel.json` sets no `headers` (no CSP / X-Frame-Options) | |
| side effect | push to `main` deploys web to prod (ledger rule) — any file in `public/` goes live on push | `thrive-and-score/docs/ledger.md` |

---

## 7. Brand tokens the current hubs use

| side | file | what |
|---|---|---|
| mobile hub | **no token file** — [GamesHubScreen.tsx](../../src/screens/GamesHubScreen.tsx) uses inline hex: bg `#0f172a`, cards `#1e293b`, muted `#94a3b8`/`#64748b`, accent `#8b5cf6`, per-game `GAME_ICONS` colors (:20-26); system font | 10 unique hex, grep |
| mobile, newest system | `src/features/pac-playbook/theme.ts` (460; `color`, `fontSize`, `radius`, `space`, `playbookTheme`) + `font.ts` (Archivo via `@expo-google-fonts/archivo`, `useFonts`) | not used by games; "loaded for the Playbook and for nothing else" (`font.ts:2`) |
| mobile, recent tokens | `RSVP_TOKENS` in `src/components/calendar/RsvpPill.tsx` (purple `#8b5cf6` / slate / red-destructive rule) | |
| web hub + games | `src/lib/game-design-tokens.ts` `gameColors` (per-game palettes `:7-35`, field greens `:41-55`, markers `:60-68`, `ui.*`, `brand.*`, `status.*`) | used by GamesHub + 9 game components |
| web app theme | `src/index.css` CSS vars (`--background 222 47% 11%`, `--primary 160 84% 39%` green, `--accent 239 84% 67%`), `tailwind.config.ts`; fonts `Plus Jakarta Sans` + `Teko` (`font-fifa`) from Google Fonts in `index.html:10,13` | |

---

## 8. Counts

- Mobile games-only files: **13** (10,428 lines) + 3 referencing (navigator, 2 dashboards).
- Web games files: **15** in `src/components/games` + `src/pages` (+ admin page + token file = 17).
- Games tables (migration or live types): `cognitive_games`, `game_levels`, `player_game_progress`, `game_sessions` (contested), `daily_game_time`, `game_achievements`, `angle_master_progress`, `angle_master_scenarios`, `pattern_play_scenarios`, `pattern_play_formations`; XP: `xp_awards` + `players.total_xp`.
