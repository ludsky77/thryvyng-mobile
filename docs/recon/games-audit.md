# Cognitive Games — Code Audit (read-only recon)

**Commit:** `3834065` · **Date:** 2026-10-09 · **Branch:** main (clean)
**Files scanned:** 13 games-only files (10,434 lines) + 4 referencing files (navigator, 2 dashboards, package.json) + `supabase/migrations/`
**Method:** static read only. No app run, no build, no DB query. Anything not provable from source is marked INFERRED.

> Disambiguation: `src/screens/game-stats/`, `src/components/game-stats/`, `src/hooks/useLiveGameSession.ts`, `src/services/gameStatsService.ts` and `src/types/game-stats.ts` are the **live soccer stats console**, a different feature. They are excluded from this audit.

---

## 1. INVENTORY

| path | lines | role |
|---|---|---|
| [src/components/games/DribbleRushGame.tsx](../../src/components/games/DribbleRushGame.tsx) | 2393 | game component |
| [src/components/games/AngleMasterGame.tsx](../../src/components/games/AngleMasterGame.tsx) | 1258 | game component |
| [src/components/games/PatternPlayGame.tsx](../../src/components/games/PatternPlayGame.tsx) | 1168 | game component |
| [src/components/games/FieldVisionGame.tsx](../../src/components/games/FieldVisionGame.tsx) | 1099 | game component |
| [src/components/games/AnticipationArenaGame.tsx](../../src/components/games/AnticipationArenaGame.tsx) | 1057 | game component |
| [src/components/games/DecisionPointGame.tsx](../../src/components/games/DecisionPointGame.tsx) | 873 | game component |
| [src/components/games/PressureProtocolGame.tsx](../../src/components/games/PressureProtocolGame.tsx) | 829 | game component |
| [src/components/games/SpinCueOverlay.tsx](../../src/components/games/SpinCueOverlay.tsx) | 129 | shared visual (Anticipation only) |
| [src/screens/GamePlayScreen.tsx](../../src/screens/GamePlayScreen.tsx) | 677 | level select + results + game router |
| [src/screens/GamesHubScreen.tsx](../../src/screens/GamesHubScreen.tsx) | 470 | hub |
| [src/hooks/useGameSession.ts](../../src/hooks/useGameSession.ts) | 188 | hook (levels + save + XP) |
| [src/types/games.ts](../../src/types/games.ts) | 178 | types |
| [src/hooks/useCognitiveGames.ts](../../src/hooks/useCognitiveGames.ts) | 115 | hook (hub data) |
| **total** | **10434** | |

Referencing files (not games-only): [AppNavigator.tsx:91,108,336,396](../../src/navigation/AppNavigator.tsx#L336) · [PlayerDashboard.tsx:288](../../src/components/dashboards/PlayerDashboard.tsx#L288) · [CoachDashboard.tsx:478](../../src/components/dashboards/CoachDashboard.tsx#L478).

No dedicated config file, no shared scoring/level module, no shared theme file. There is no `games/` barrel or index.

---

## 2. ENTRY POINTS

| route | registered | reached from | gating |
|---|---|---|---|
| `GamesHub` | [AppNavigator.tsx:336](../../src/navigation/AppNavigator.tsx#L336) (lazy, `headerShown:false`) | Player dashboard quick action "Games" [PlayerDashboard.tsx:288](../../src/components/dashboards/PlayerDashboard.tsx#L288); Coach dashboard quick action "Brain Games" [CoachDashboard.tsx:478](../../src/components/dashboards/CoachDashboard.tsx#L478) | none |
| `GamePlay` | [AppNavigator.tsx:396](../../src/navigation/AppNavigator.tsx#L396) (lazy) | `navigation.navigate('GamePlay', {gameId, gameSlug, gameName})` [GamesHubScreen.tsx:48](../../src/screens/GamesHubScreen.tsx#L48) | `minutesRemaining === 0` disables the card [GamesHubScreen.tsx:164](../../src/screens/GamesHubScreen.tsx#L164) — never true, see §4 |

- **Roles:** both player and coach entries exist. Routes live in the shared stack with **no role guard**; any role that can reach a dashboard with the button can open the hub.
- **Player identity:** `playerId = currentRole?.entity_id` ([useCognitiveGames.ts:12](../../src/hooks/useCognitiveGames.ts#L12), [useGameSession.ts:13](../../src/hooks/useGameSession.ts#L13)). For a coach, `entity_id` is not a player id — INFERRED: coach entry will read/write progress rows against a non-player entity, or no-op.
- **Coach passes `{teamId}`**, which `GamesHubScreen` never reads.
- No tab entry; games are stack-only, reached by quick action.
- `GamePlay` falls through to a **"Coming soon!"** placeholder for any slug it does not match ([GamePlayScreen.tsx:405-415](../../src/screens/GamePlayScreen.tsx#L405)).

---

## 3. GAME SHEETS

### 3.1 Field Vision (`field-vision`)

| | |
|---|---|
| **a. What the player does** | A set of players sits on a field; some are highlighted as targets during a memorize phase. All players then scatter and move randomly. When they stop, the player taps the ones they believe were the original targets. |
| **b. Phases / rounds** | `ready → memorize → tracking → select → result` ([FieldVisionGame.tsx:26](../../src/components/games/FieldVisionGame.tsx#L26)). **3 rounds** per session ([:235](../../src/components/games/FieldVisionGame.tsx#L235)), 3-2-1 countdown first ([:268](../../src/components/games/FieldVisionGame.tsx#L268)). Duration INFERRED ~45–60s: 3 × (memorize ~2s + tracking ~4s + select ≤10s + 2s reveal). |
| **c. Input** | tap (player circles, multi-select) |
| **d. Levels** | **Database** (`game_levels.config`). **0 levels defined in code** — only per-field fallbacks ([:191-206](../../src/components/games/FieldVisionGame.tsx#L191)). |
| **e. Scoring** | per round `round(correct / targets × 100)` [:289](../../src/components/games/FieldVisionGame.tsx#L289); final `score = accuracy = avg(roundScores)` [:385-388](../../src/components/games/FieldVisionGame.tsx#L385). Pass `avgScore >= 70` [:398](../../src/components/games/FieldVisionGame.tsx#L398). Perfect `=== 100` [:389](../../src/components/games/FieldVisionGame.tsx#L389). XP `isPerfect ? xpReward+10 : round(avgScore/100 × xpReward)` [:390](../../src/components/games/FieldVisionGame.tsx#L390). **No stars anywhere in the codebase.** |
| **f. Feedback** | visual only — result colors green/red/orange/gray [:118-124](../../src/components/games/FieldVisionGame.tsx#L118); target pulse during memorize [:93-105](../../src/components/games/FieldVisionGame.tsx#L93). sound ✗ · haptics ✗ |
| **g. Rendering** | **Reanimated** (`useSharedValue`/`withTiming`/`withDelay`/`withSequence`) [:9-16](../../src/components/games/FieldVisionGame.tsx#L9) — the only game using it. Phase/countdown timers are `setInterval` (4 sites). Movement is pre-scheduled `withDelay` chains, not a loop. |
| **h. Visuals** | 51 hex literals (14 unique), inline. System font only (no `fontFamily`). No image/audio assets. |
| **i. Text** | hardcoded English (e.g. "Track the highlighted players as they move around the field" [:453](../../src/components/games/FieldVisionGame.tsx#L453)). Not translated. |
| **j. Markers** | none in file. `config.positionChanges` is typed ([types/games.ts:40](../../src/types/games.ts#L40)) but never read. |

**Per-level parameters** (from `FieldVisionConfig`, [types/games.ts:33-45](../../src/types/games.ts#L33)):

| param | effect | code fallback |
|---|---|---|
| `targets` | how many to memorize | 3 |
| `players` | total on field | 8 |
| `speed` | movement multiplier | 1.0 |
| `duration` | tracking ms | 4000 |
| `memorize` | memorize ms | 2000 |
| `selectionTime` | select seconds | 10 |
| `roundModifiers.round2/3` | speed ×, memorize × | `{1.08, 0.88}` / `{1.15, 0.78}` |

---

### 3.2 Pattern Play (`pattern-play`)

| | |
|---|---|
| **a. What the player does** | A formation of players is shown and a passing sequence is animated between them as lines. After a retention gap the lines are gone and the player re-taps the players in the same pass order. |
| **b. Phases / rounds** | `loading → ready → ... → retention → replay → roundResult → gameComplete` ([PatternPlayGame.tsx:299-313](../../src/components/games/PatternPlayGame.tsx#L299)). **3 rounds** [:116](../../src/components/games/PatternPlayGame.tsx#L116). Round 2 dims the field, rounds 1 and 3 do not [:303-304](../../src/components/games/PatternPlayGame.tsx#L303). Duration INFERRED ~60–90s. |
| **c. Input** | tap (player nodes, ordered) |
| **d. Levels** | **Hybrid, and the DB config is ignored.** **20 levels hardcoded** in `getLevelConfig` [:62-86](../../src/components/games/PatternPlayGame.tsx#L62). The `config` prop is destructured [:89](../../src/components/games/PatternPlayGame.tsx#L89) and **never read** — `PatternPlayConfig.patternLength`/`showDuration` from `game_levels` are dead. Scenario *content* comes from `pattern_play_scenarios` keyed on `levelNumber`. |
| **e. Scoring** | per round `round(correct / passSequence.length × 100)`, strict positional match [:341-347](../../src/components/games/PatternPlayGame.tsx#L341); final `avg(roundScores)` [:364](../../src/components/games/PatternPlayGame.tsx#L364). Pass `>= 70` [:374](../../src/components/games/PatternPlayGame.tsx#L374). Perfect `=== 100` [:365](../../src/components/games/PatternPlayGame.tsx#L365). XP `isPerfect ? xpReward+10 : round(avg/100 × xpReward)` [:366](../../src/components/games/PatternPlayGame.tsx#L366). |
| **f. Feedback** | visual — immediate per-tap correct/incorrect flash, 300ms [:316-330](../../src/components/games/PatternPlayGame.tsx#L316); fading pass lines (`Animated.timing` on opacity) [:266,284](../../src/components/games/PatternPlayGame.tsx#L284). sound ✗ · haptics ✗ |
| **g. Rendering** | `react-native-svg` (`Line`) for pass lines + RN `Animated` (5 sites) for opacity. One `setInterval` (countdown). Phase advance via `await new Promise(setTimeout)` [:307](../../src/components/games/PatternPlayGame.tsx#L307). |
| **h. Visuals** | 66 hex literals (21 unique). System font. No assets. |
| **i. Text** | hardcoded English. Not translated. |
| **j. Markers** | no TODO/TEMP. **Dead end:** if the scenario fetch returns 0 rows it still sets `phase='ready'` [:161-162](../../src/components/games/PatternPlayGame.tsx#L161) and `startRound` then returns early with a `console.warn` [:190-193](../../src/components/games/PatternPlayGame.tsx#L190) — Start does nothing, with no message to the player. |

**Per-level parameters** (hardcoded table, levels 1–20; monotonic):

| param | L1 | L10 | L20 |
|---|---|---|---|
| `showDuration` | 1200ms | 600ms | 340ms |
| `lineFade` | 800ms | 400ms | 230ms |
| `retentionGap` | 1000ms | 600ms | 250ms |

Scenario category unlocks by level [:125-128](../../src/components/games/PatternPlayGame.tsx#L125): `build_out` always; `possession` ≥3; `switch` ≥6; `attacking` ≥10; `advanced` ≥16. Level >20 falls back to `configs[1]`, i.e. the easiest timings [:85](../../src/components/games/PatternPlayGame.tsx#L85).

---

### 3.3 Decision Point (`decision-point`)

| | |
|---|---|
| **a. What the player does** | A static top-down attacking situation is drawn (player, teammates, defenders, keeper) with a one-line description. Under a per-decision timer the player picks Shoot, Pass or Dribble, then sees the right answer with a short explanation. |
| **b. Phases / rounds** | `ready → playing → feedback → result` ([DecisionPointGame.tsx:16](../../src/components/games/DecisionPointGame.tsx#L16)). **8 scenarios** per session, hardcoded [:155](../../src/components/games/DecisionPointGame.tsx#L155). 1.5s feedback between [:218](../../src/components/games/DecisionPointGame.tsx#L218). Duration INFERRED ~60–90s. |
| **c. Input** | tap (3 fixed buttons) |
| **d. Levels** | **Database for timing only.** **0 levels in code**; **8 scenario templates hardcoded** [:42-120](../../src/components/games/DecisionPointGame.tsx#L42): basic 3, intermediate 3, advanced 2. |
| **e. Scoring** | `accuracy = round(score / 8 × 100)` [:251](../../src/components/games/DecisionPointGame.tsx#L251); `score` field = that same percentage [:257](../../src/components/games/DecisionPointGame.tsx#L257). Pass `>= 70` [:261](../../src/components/games/DecisionPointGame.tsx#L261). Perfect `=== 100` [:252](../../src/components/games/DecisionPointGame.tsx#L252). XP `isPerfect ? xpReward+10 : round(accuracy/100 × xpReward)` [:253](../../src/components/games/DecisionPointGame.tsx#L253). |
| **f. Feedback** | visual only — correct answer + explanation in feedback phase. sound ✗ · haptics ✗ · **animations ✗ (zero `Animated` usage)** |
| **g. Rendering** | **plain `View` positioning only** — no SVG, no Animated, no Reanimated. Timers: 3 × `setInterval` (countdown, per-decision timer). |
| **h. Visuals** | 48 hex literals (13 unique). System font. No assets. |
| **i. Text** | hardcoded English — all 8 descriptions and explanations are literals in the component. Not translated. |
| **j. Markers** | no TODO/TEMP/999/NaN. |

**Per-level parameters** (`DecisionPointConfig`, [types/games.ts:53-56](../../src/types/games.ts#L53)):

| param | effect |
|---|---|
| `timeLimit` | ms per decision, drives the countdown [:148](../../src/components/games/DecisionPointGame.tsx#L148) |
| `scenarioComplexity` | selects the template pool [:122-125](../../src/components/games/DecisionPointGame.tsx#L122) |

Pool mapping: `basic` → 3 templates · `intermediate` → 6 · everything else → all 8. The type allows `'expert'` and `'master'` ([types/games.ts:55](../../src/types/games.ts#L55)) but **no template set exists for them** — they resolve to the same 8 as `advanced`. Templates are drawn **with replacement** [:127-130](../../src/components/games/DecisionPointGame.tsx#L127), so an 8-scenario session repeats scenarios.

---

### 3.4 Anticipation Arena (`anticipation-arena`)

| | |
|---|---|
| **a. What the player does** | A ball is launched across the field on a spin-dependent curve and fades out partway. The player taps where they think it would have landed; the real landing spot is then revealed. |
| **b. Phases / rounds** | `ready → watching → predict → reveal → result` ([AnticipationArenaGame.tsx:41](../../src/components/games/AnticipationArenaGame.tsx#L41)). **5 rounds** [:114](../../src/components/games/AnticipationArenaGame.tsx#L114); 2s reveal [:281](../../src/components/games/AnticipationArenaGame.tsx#L281). Ball hides at 60% of path (`HIDE_POINT`) [:18](../../src/components/games/AnticipationArenaGame.tsx#L18). Duration INFERRED ~60s. |
| **c. Input** | tap (anywhere on field, `locationX/locationY`) [:269-273](../../src/components/games/AnticipationArenaGame.tsx#L269) |
| **d. Levels** | **Database**, and uniquely it reads **dedicated `game_levels` columns**, not just `config`: `spin_type`, `trajectory_type` passed as props [GamePlayScreen.tsx:361-362](../../src/screens/GamePlayScreen.tsx#L361), fallbacks `'none'`/`'linear'`. **0 levels in code**; `DEFAULT_CONFIG` fallback only [:35-40](../../src/components/games/AnticipationArenaGame.tsx#L35). |
| **e. Scoring** | distance-based: `roundScore = max(0, round(100 − distance/maxDistance × 150))` [:263-269](../../src/components/games/AnticipationArenaGame.tsx#L263); final `avg(scores)` [:471](../../src/components/games/AnticipationArenaGame.tsx#L471). Pass `>= 60` [:481](../../src/components/games/AnticipationArenaGame.tsx#L481) — **lowest threshold of any game**. Perfect `>= 95` (not 100) [:472](../../src/components/games/AnticipationArenaGame.tsx#L472). XP `isPerfect ? xpReward+10 : round(avg/100 × xpReward)` [:473](../../src/components/games/AnticipationArenaGame.tsx#L473). |
| **f. Feedback** | visual — spin glow per type [:20-29](../../src/components/games/AnticipationArenaGame.tsx#L20); `SpinCueOverlay` pre-round cue that decays by round and is suppressed at round 5 [:455-461](../../src/components/games/AnticipationArenaGame.tsx#L455); ball rotation loop + opacity fade. sound ✗ · haptics ✗ |
| **g. Rendering** | RN `Animated` only (`ValueXY`, `timing`, `loop`, `sequence`; 21 sites), `useNativeDriver:false` [:362](../../src/components/games/AnticipationArenaGame.tsx#L362). Quadratic Bézier computed in JS [:31-34](../../src/components/games/AnticipationArenaGame.tsx#L31). No SVG. 3 × `setInterval`. |
| **h. Visuals** | 43 hex literals (15 unique) + 8 in SpinCueOverlay. **Emoji used as spin icons** (🔴🔵🟣🟠🩷❓🔄) [SpinCueOverlay.tsx:5-12](../../src/components/games/SpinCueOverlay.tsx#L5). System font. No assets. |
| **i. Text** | hardcoded English, incl. all spin labels/behaviors ("Ball DIPS down and speeds up"). Not translated. |
| **j. Markers** | **`console.log` on every render** [:91-95](../../src/components/games/AnticipationArenaGame.tsx#L91) — not `__DEV__`-guarded, ships to production. |

**Per-level parameters:**

| param | source | code fallback |
|---|---|---|
| `ballSpeed` | `config` | 2.0 |
| `predictionTime` | `config` | 3000ms |
| `targetSize` | `config` | 50 |
| `showPath` | `config` | false |
| `spin_type` | **level column** | `'none'` |
| `trajectory_type` | **level column** | `'linear'` |

Spin keys handled: `none, topspin, backspin, curve_right, curve_left, knuckle, variable, changes`. Trajectory `'random'` picks one at runtime [:148-150](../../src/components/games/AnticipationArenaGame.tsx#L148). Round-hint decay is hardcoded for rounds 1–4 [SpinCueOverlay.tsx:15-20](../../src/components/games/SpinCueOverlay.tsx#L15).

---

### 3.5 Pressure Protocol (`pressure-protocol`)

| | |
|---|---|
| **a. What the player does** | Against a countdown the player answers as many quick cognitive questions as possible — arithmetic, a Stroop colour-word task, or a missing-number sequence. Meanwhile the screen shakes and emoji pop into the corners to break concentration. |
| **b. Phases / rounds** | `ready → playing → result` ([PressureProtocolGame.tsx:16](../../src/components/games/PressureProtocolGame.tsx#L16)). **No rounds** — one continuous timed block; tasks are unlimited until time runs out. Duration = `timeLimit` (default 30s). |
| **c. Input** | tap (4 option buttons) |
| **d. Levels** | **Database.** **0 levels in code** — only the NaN guard default. |
| **e. Scoring** | `accuracy = round(correct/attempted × 100)`; `speedBonus = min(20, attempted × 2)`; `finalScore = min(100, round(accuracy × 0.8 + speedBonus))` [:328-330](../../src/components/games/PressureProtocolGame.tsx#L328). Pass **`accuracy >= 60 && attempted >= 5`** [:339](../../src/components/games/PressureProtocolGame.tsx#L339) — note pass is gated on raw accuracy, not on `finalScore`, unlike every other game. Perfect `accuracy === 100 && attempted >= 10` [:330](../../src/components/games/PressureProtocolGame.tsx#L330). XP `isPerfect ? xpReward+10 : round(finalScore/100 × xpReward)` [:331](../../src/components/games/PressureProtocolGame.tsx#L331). |
| **f. Feedback** | **no per-answer feedback at all** — `handleAnswer` tallies and immediately advances [:287-310](../../src/components/games/PressureProtocolGame.tsx#L287); the player never learns which answers were wrong. Distraction shake animation + popup. sound ✗ · **haptics ✓ (the only game): `Vibration.vibrate(50)`** [:252](../../src/components/games/PressureProtocolGame.tsx#L252) — RN `Vibration`, not `expo-haptics`, in a try/catch, and fired **only as a distraction**, never as success/error feedback. |
| **g. Rendering** | RN `Animated` (shake, 7 sites). No SVG. **5 × `setInterval`** (countdown, timer, distractions) — the most timer sites of any game. |
| **h. Visuals** | 43 hex literals (12 unique); Stroop palette hardcoded [:100-106](../../src/components/games/PressureProtocolGame.tsx#L100). Emoji 😈 as the distraction [:430](../../src/components/games/PressureProtocolGame.tsx#L430). System font. No assets. |
| **i. Text** | hardcoded English — including the colour **words** "RED/BLUE/GREEN/YELLOW/PURPLE", which makes the Stroop task untranslatable without redesign. Not translated. |
| **j. Markers** | **NaN fallback:** `const safeTimeLimit = timeLimit && !isNaN(timeLimit) ? timeLimit : 30000` [:182](../../src/components/games/PressureProtocolGame.tsx#L182) — the only NaN guard in the games code, implying bad `timeLimit` data was hit in practice (INFERRED). Deliberate safety comment: "Only shake and popup - NO FLASH (seizure risk)" [:240](../../src/components/games/PressureProtocolGame.tsx#L240) — **keep this constraint through any redesign.** |

**Per-level parameters** (`PressureConfig`, [types/games.ts:59-63](../../src/types/games.ts#L59)):

| param | effect |
|---|---|
| `taskType` | `'math' \| 'color' \| 'sequence' \| 'mixed'` → generator [:152-168](../../src/components/games/PressureProtocolGame.tsx#L152) |
| `distractionLevel` | doubles as math difficulty **and** distraction interval `max(3000, 5000 − level×400)` [:231](../../src/components/games/PressureProtocolGame.tsx#L231) |
| `timeLimit` | session ms |

Math difficulty tiers are hardcoded at `<=1` add/sub, `<=2` multiply, else `a + b×c` [:57-80](../../src/components/games/PressureProtocolGame.tsx#L57).

---

### 3.6 Dribble Rush (`dribble-rush`)

| | |
|---|---|
| **a. What the player does** | An endless-runner down a perspective field: the player holds a lane and taps arrows to dodge oncoming defenders. A PASS button plays the ball to a winger in the gutter when one is alongside. Surviving to the level's target time clears it. |
| **b. Phases / rounds** | `ready → countdown → playing → collision → finished` ([DribbleRushGame.tsx:42](../../src/components/games/DribbleRushGame.tsx#L42)). **No rounds** — one continuous run. Duration = `targetTime`, **50s at L1 down to 30s at L5** [:62-66](../../src/components/games/DribbleRushGame.tsx#L62). |
| **c. Input** | **tap only** — ◀ / PASS / ▶ `TouchableOpacity` with `onPressIn` [:2350-2385](../../src/components/games/DribbleRushGame.tsx#L2350). No swipe, no drag, no `PanResponder`, no gesture-handler. |
| **d. Levels** | **Hardcoded, DB config ignored.** **5 levels** in `LEVEL_CONFIGS` [:61-67](../../src/components/games/DribbleRushGame.tsx#L61). The `config: DribbleRushConfig` prop is declared [:1741](../../src/components/games/DribbleRushGame.tsx#L1741) and **never read** — zero `config.` references in 2393 lines. The entire 30-field `DribbleRushConfig` type ([types/games.ts:97-131](../../src/types/games.ts#L97)) is dead, incl. `passThreshold`, `obstacleWeights`, `environment.rain/night`, `bonusElements.shields`, `scoring.*` and `roundModifiers` — yet [GamePlayScreen.tsx:255-262](../../src/screens/GamePlayScreen.tsx#L255) still shows the player `distanceTarget`/`baseSpeed`/`passThreshold` from the DB on the level-select card. |
| **e. Scoring** | raw points, **not a percentage**: dodge `+100` [:1878](../../src/components/games/DribbleRushGame.tsx#L1878), completed pass `+50` [:2072](../../src/components/games/DribbleRushGame.tsx#L2072), miss `−25` floored at 0 [:1889](../../src/components/games/DribbleRushGame.tsx#L1889). `accuracy = round(passesCompleted/passesAttempted × 100)`, **0 if no pass was attempted** [:1973-1974](../../src/components/games/DribbleRushGame.tsx#L1973). Pass = survive to `targetTime` [:2103-2104](../../src/components/games/DribbleRushGame.tsx#L2103). Perfect `attempted>0 && completed===attempted` [:1981](../../src/components/games/DribbleRushGame.tsx#L1981). XP **binary**: `success ? xpReward : floor(xpReward × 0.25)` [:1980](../../src/components/games/DribbleRushGame.tsx#L1980) — the only game whose XP is not score-proportional. |
| **f. Feedback** | visual — `FeedbackPopup` for pass/miss/late/dodge/collision [:2347](../../src/components/games/DribbleRushGame.tsx#L2347), combo counter, perspective scenery (benches, coach, flag, camera crew). sound ✗ · haptics ✗ · **no `Animated` at all** |
| **g. Rendering** | **plain `View`s driven by React state**, no SVG/Animated/Reanimated. Game loop is `setInterval(..., FRAME_MS)` with `FRAME_MS = 16` [:34](../../src/components/games/DribbleRushGame.tsx#L34), i.e. ~60fps **on the JS thread, re-rendering the tree each tick** [:2022](../../src/components/games/DribbleRushGame.tsx#L2022). No `requestAnimationFrame`. Physics constants hardcoded [:33-39](../../src/components/games/DribbleRushGame.tsx#L33): `BASE_SPEED 2.5`, `MAX_SPEED 7.0`, `ACCELERATION 0.003`, `SPEED_PENALTY_MULTIPLIER 0.6`, `PASS_LEEWAY_MS 150`. |
| **h. Visuals** | **149 hex literals (42 unique)** — by far the most in the codebase. Layout/perspective constants hardcoded [:14-31](../../src/components/games/DribbleRushGame.tsx#L14). System font. No image/audio assets — field, players and scenery are all styled `View`s. |
| **i. Text** | hardcoded English, incl. level names "Training Ground" … "World Cup Final" [:62-66](../../src/components/games/DribbleRushGame.tsx#L62). Not translated. |
| **j. Markers** | `zIndex: 9999` [:1626](../../src/components/games/DribbleRushGame.tsx#L1626). Debug `console.log`s are `__DEV__`-guarded [:2026-2027](../../src/components/games/DribbleRushGame.tsx#L2026), incl. one **per game-loop tick**. No TODO/TEMP/NaN. |

**Per-level parameters** (hardcoded, levels 1–5; level >5 clamps to L5 [:1753](../../src/components/games/DribbleRushGame.tsx#L1753)):

| level | name | targetTime | baseSpeed | defenderFreq | wingerFreq |
|---|---|---|---|---|---|
| 1 | Training Ground | 50s | 2.0 | 2500ms | 5000ms |
| 2 | Local Club | 45s | 2.5 | 2200ms | 4500ms |
| 3 | Pro Stadium | 40s | 3.0 | 1900ms | 4000ms |
| 4 | National Arena | 35s | 3.5 | 1600ms | 3500ms |
| 5 | World Cup Final | 30s | 4.0 | 1300ms | 3000ms |

> `DRIBBLE_RUSH_AUDIT.md` at repo root is **stale**: it documents a prior implementation (shields, obstacle weights, 3 rounds, `safeConfig`) committed in `378ca62`, all of which the current rewrite (`1eb409d`) removed — 0 occurrences of `shield`, `obstacle`, `safeConfig`, `currentRound` in the file today. Do not use it as a spec.

---

### 3.7 Angle Master (`angle-master`)

| | |
|---|---|
| **a. What the player does** | Deflector angles are shown briefly on a 6×6 grid, then hidden. A ball enters from one edge and the player must predict which of the 24 perimeter exit zones it will leave from after bouncing off the remembered angles. Decoy angles that the ball never touches are mixed in. |
| **b. Phases / rounds** | `ready → memorize → predict → reveal → trialResult → levelComplete` ([AngleMasterGame.tsx:69](../../src/components/games/AngleMasterGame.tsx#L69)). **3 trials** per level (`TRIALS_PER_LEVEL`) [:25](../../src/components/games/AngleMasterGame.tsx#L25); memorize 3000ms [:24](../../src/components/games/AngleMasterGame.tsx#L24). Duration INFERRED ~60–90s. |
| **c. Input** | tap (one of 24 exit zones) [:605](../../src/components/games/AngleMasterGame.tsx#L605) |
| **d. Levels** | **Hardcoded, DB config ignored for difficulty.** **15 levels** in `getLevelConfig` [:72-90](../../src/components/games/AngleMasterGame.tsx#L72); level >15 clamps to L15 [:89](../../src/components/games/AngleMasterGame.tsx#L89). Zero `config.` reads in the file except XP: `xp = config?.xpReward ?? xpReward ?? levelConfig.xp` [:451](../../src/components/games/AngleMasterGame.tsx#L451). **Drift:** the type comment says "levels 1–11" and `AngleMasterConfig` exposes `memorizeSeconds`/`trialsPerLevel`/`passThresholdPercent` ([types/games.ts:80-88](../../src/types/games.ts#L80)), but the code hardcodes all three and defines 15 levels. |
| **e. Scoring** | per trial `points = 100 + streak × 25` on correct, else 0 [:610-620](../../src/components/games/AngleMasterGame.tsx#L610). `accuracy = round(correctTrials/trials × 100)` [:480](../../src/components/games/AngleMasterGame.tsx#L480). Pass `trials >= 3 && accuracy >= PASS_PERCENT (67)` [:26,481](../../src/components/games/AngleMasterGame.tsx#L481). **`score` is the raw points sum, not a percentage** [:631](../../src/components/games/AngleMasterGame.tsx#L631). XP **binary**: `levelPassed ? xp : 0` [:628](../../src/components/games/AngleMasterGame.tsx#L628) — the only game that can award 0 XP. Perfect `accuracy === 100` [:634](../../src/components/games/AngleMasterGame.tsx#L634). |
| **f. Feedback** | richest of the seven — ball trail, angle flash on contact, score popup, streak, celebration, pulsing missed zone, `floatUpAnim`. **sound: dead code** — `playSound('ding'/'goal'/'wrong'/'fanfare')` is called at [:558,569,616,620](../../src/components/games/AngleMasterGame.tsx#L616) but `soundRef.current` is **never assigned** (no `createAsync`/`loadAsync` anywhere) and **no audio assets exist in the repo**, so `if (s)` is always false and every call silently no-ops [:483-487](../../src/components/games/AngleMasterGame.tsx#L483). haptics ✗ |
| **g. Rendering** | `react-native-svg` (`Line`, `Path`) for angles/trail + RN `Animated` (27 sites: pulse, floatUp, opacity). Ball travels on a **`setInterval` stepping at 100ms** [:560](../../src/components/games/AngleMasterGame.tsx#L560) — ~10fps, the coarsest motion in the codebase. No `requestAnimationFrame`. |
| **h. Visuals** | **the only game with a named palette** — `COLORS` object, 15 tokens [:29-45](../../src/components/games/AngleMasterGame.tsx#L29) (still file-local, not shared). 42 hex literals (18 unique). Grid geometry hardcoded [:16-26](../../src/components/games/AngleMasterGame.tsx#L16). System font. No assets. |
| **i. Text** | hardcoded English. Not translated. |
| **j. Markers** | `MAX_ATTEMPTS = 100` retry cap in scenario generation [:179-181](../../src/components/games/AngleMasterGame.tsx#L179) — INFERRED: on exhaustion it returns whatever the last attempt produced, so a malformed scenario is possible at high angle counts. No TODO/TEMP/NaN. |

**Per-level parameters** (hardcoded):

| level | realAngles | decoys | xp |
|---|---|---|---|
| 1 | 2 | 0 | 20 |
| 2 | 2 | 1 | 25 |
| 3 | 3 | 0 | 30 |
| 4 | 3 | 1 | 35 |
| 5 | 3 | 2 | 40 |
| 6 | 4 | 1 | 45 |
| 7 | 4 | 2 | 50 |
| 8 | 4 | 3 | 55 |
| 9 | 5 | 2 | 60 |
| 10 | 5 | 3 | 65 |
| 11 | 6 | 2 | 70 |
| 12 | 6 | 3 | 75 |
| 13 | 6 | 4 | 80 |
| 14 | 7 | 3 | 90 |
| 15 | 7 | 4 | 100 |

---

### Cross-game comparison

| game | levels in code | rounds | input | pass threshold | score scale | XP shape | sound | haptics | render |
|---|---|---|---|---|---|---|---|---|---|
| field-vision | 0 (DB) | 3 | tap | ≥70 | 0–100 | proportional +10 perfect | ✗ | ✗ | Reanimated |
| pattern-play | **20** (DB cfg dead) | 3 | tap | ≥70 | 0–100 | proportional +10 | ✗ | ✗ | SVG + Animated |
| decision-point | 0 (8 templates) | 8 scenarios | tap | ≥70 | 0–100 | proportional +10 | ✗ | ✗ | **none** |
| anticipation-arena | 0 (DB + columns) | 5 | tap | **≥60** | 0–100 | proportional +10 | ✗ | ✗ | Animated |
| pressure-protocol | 0 (DB) | continuous | tap | ≥60 acc & ≥5 tasks | 0–100 | proportional +10 | ✗ | **✓ distraction only** | Animated |
| dribble-rush | **5** (DB cfg dead) | continuous | tap | survive targetTime | **raw points** | **binary 100%/25%** | ✗ | ✗ | **none (state @16ms)** |
| angle-master | **15** (DB cfg dead) | 3 trials | tap | **≥67** | **raw points** | **binary 100%/0** | **dead code** | ✗ | SVG + Animated |

**Every game is tap-only.** No drag, swipe, or gesture input anywhere in the games code.

---

## 4. SHARED SYSTEMS

| system | state | evidence |
|---|---|---|
| **Daily time limit** | **bypassed** | `const minutesRemaining = 999; // TEMP: bypass limit for testing` [useCognitiveGames.ts:93](../../src/hooks/useCognitiveGames.ts#L93) (comment also at :92). Hard-coded constant — `dailyTime` is fetched [:55-74](../../src/hooks/useCognitiveGames.ts#L55) but **never used in the calculation**. Consequences: the hub's "min left today" tile shows **999** [GamesHubScreen.tsx:118](../../src/screens/GamesHubScreen.tsx#L118); the `<=15` warning [:140](../../src/screens/GamesHubScreen.tsx#L140), the `=== 0` limit banner [:149](../../src/screens/GamesHubScreen.tsx#L149) and the card `isDisabled` gate [:164](../../src/screens/GamesHubScreen.tsx#L164) are all unreachable. The info text still promises "3 hour daily limit helps maintain focus" [:236](../../src/screens/GamesHubScreen.tsx#L236). No enforcement exists anywhere else. |
| **Progress saving** | client-driven, 4 sequential writes, non-atomic | `recordSession` [useGameSession.ts:54-177](../../src/hooks/useGameSession.ts#L54): insert `game_sessions` → read+upsert `player_game_progress` → read+upsert `daily_game_time` → `award_xp_safe`. A failure midway leaves partial state; the whole body is one try/catch returning `false`, surfaced as a generic alert [GamePlayScreen.tsx:59-61](../../src/screens/GamePlayScreen.tsx#L59). Read-then-write on progress is a **lost-update race** if two sessions finish close together (INFERRED). |
| **XP award path** | **computed on device**, server only adds | every game computes `xpEarned` itself (see §3e) and the client passes it to `supabase.rpc('award_xp_safe', {p_amount: result.xpEarned, ...})` [useGameSession.ts:161-168](../../src/hooks/useGameSession.ts#L161). **No server-side validation of score or XP is present in the repo** — the RPC receives a client-chosen amount. `game_sessions.xp_earned` and `player_game_progress.total_xp_earned` are likewise client-supplied. INFERRED: a tampered client can mint arbitrary XP; cannot confirm what `award_xp_safe` clamps, as its definition is not in the repo (§5). |
| **Premium / paywall** | **absent** | zero matches for `is_premium`, `unlock_requirement`, `premium`, `paywall`, `purchase`, `RevenueCat`, `iap` across all games code. No purchase library in `package.json`. |
| **Level unlocking** | soft only | `current_level` advances on pass [useGameSession.ts:98-100](../../src/hooks/useGameSession.ts#L98), but the level-select grid renders **every** active level as tappable with no lock check [GamePlayScreen.tsx:192-206](../../src/screens/GamePlayScreen.tsx#L192). Any level is playable immediately. |
| **Streaks** | in-session only, one game | `streak` in Angle Master [AngleMasterGame.tsx:456](../../src/components/games/AngleMasterGame.tsx#L456), feeds trial points, resets to 0 on a miss [:619](../../src/components/games/AngleMasterGame.tsx#L619). Not persisted, not cross-session, not cross-game. No daily-play streak anywhere. |
| **Leaderboards** | **absent** | no matches. `best_scores` per level is stored [useGameSession.ts:89-93](../../src/hooks/useGameSession.ts#L89) but never displayed anywhere in the games UI. |
| **Analytics / telemetry** | **absent** | no analytics/track/logEvent calls in games code. Sentry is installed app-wide but not instrumented here. |
| **Stars** | **absent** | no star rating exists; results show score %, XP and a text label only [GamePlayScreen.tsx:125-134](../../src/screens/GamePlayScreen.tsx#L125). |
| **Results screen** | shared, one shape | `GamePlayScreen` renders score/XP/next-level for all games [:103-174](../../src/screens/GamePlayScreen.tsx#L103). It prints `{lastResult.score}%` [:127](../../src/screens/GamePlayScreen.tsx#L127) — correct for 5 games, **wrong for dribble-rush and angle-master**, whose `score` is a raw point total (e.g. "450%"). Its tip text hardcodes "Score 70% or higher to complete the level" [:144](../../src/screens/GamePlayScreen.tsx#L144), contradicting the 60/67 thresholds of three games. |

---

## 5. DATA TOUCHPOINTS

| name | file:line | read/write |
|---|---|---|
| `cognitive_games` | [useCognitiveGames.ts:24](../../src/hooks/useCognitiveGames.ts#L24) | read |
| `player_game_progress` | [useCognitiveGames.ts:43](../../src/hooks/useCognitiveGames.ts#L43) | read |
| `daily_game_time` | [useCognitiveGames.ts:63](../../src/hooks/useCognitiveGames.ts#L63) | read |
| `game_levels` | [useGameSession.ts:25](../../src/hooks/useGameSession.ts#L25) | read (`select('*')`) |
| `game_sessions` | [useGameSession.ts:72-73](../../src/hooks/useGameSession.ts#L72) | **write** (insert) |
| `player_game_progress` | [useGameSession.ts:79](../../src/hooks/useGameSession.ts#L79) | read |
| `player_game_progress` | [useGameSession.ts:111-112](../../src/hooks/useGameSession.ts#L111) | **write** (update) |
| `player_game_progress` | [useGameSession.ts:118-119](../../src/hooks/useGameSession.ts#L118) | **write** (insert) |
| `daily_game_time` | [useGameSession.ts:130](../../src/hooks/useGameSession.ts#L130) | read |
| `daily_game_time` | [useGameSession.ts:141-142](../../src/hooks/useGameSession.ts#L141) | **write** (update) |
| `daily_game_time` | [useGameSession.ts:150-151](../../src/hooks/useGameSession.ts#L150) | **write** (insert) |
| `award_xp_safe` (RPC) | [useGameSession.ts:162](../../src/hooks/useGameSession.ts#L162) | **write** (`p_source_type:'cognitive_game'`, `p_source_id: gameId`, `p_amount` client-computed) |
| `pattern_play_scenarios` | [PatternPlayGame.tsx:132](../../src/components/games/PatternPlayGame.tsx#L132) | read |
| `pattern_play_formations` | [PatternPlayGame.tsx:139](../../src/components/games/PatternPlayGame.tsx#L139) | read (nested join) |

- **7 tables + 1 RPC.** No edge functions referenced by games code.
- **None of these objects exist in repo migrations.** `supabase/migrations/` contains exactly one file, `20250224000000_notify_lineup_published.sql`; grep for all 7 table names and `award_xp_safe` returns nothing. The entire games schema — tables, columns, RLS, `award_xp_safe` — lives **only in the live database**, unversioned.
- `pattern_play_scenarios` / `pattern_play_formations` are queried **directly from a component**, the only games table access outside the hooks.
- Columns read off `game_levels` beyond `config`: `spin_type`, `trajectory_type` (used); `spin_intensity`, `visibility_percent`, `pass_threshold`, `has_teammate`, `teammate_speed`, `static_players`, `moving_players`, `round_count`, `field_type` are typed ([types/games.ts:21-31](../../src/types/games.ts#L21)) but **never read by any game**.

---

## 6. DEPENDENCIES (games-relevant)

| library | version | notes |
|---|---|---|
| `expo` | `~54.0.32` | **Expo SDK 54** |
| `react-native` | `0.81.5` | |
| `react` | `19.1.0` | |
| `react-native-reanimated` | `~4.1.1` | installed; used by **FieldVision only** |
| `react-native-svg` | `15.12.1` | used by AngleMaster, PatternPlay |
| `expo-av` | `~16.0.8` | installed; imported by AngleMaster but **no sound is ever loaded** (§3.7f) |
| `react-native-confetti-cannon` | `^1.5.2` | installed; **not used by any game** |
| `@expo/vector-icons` | `^15.0.3` | Feather icons, all games |
| `expo-linear-gradient` | `~15.0.8` | installed; not used by games |
| `react-native-gesture-handler` | **absent** | no gesture/drag/swipe capability installed |
| `@shopify/react-native-skia` | **absent** | |
| `expo-haptics` | **absent** | Pressure Protocol uses RN core `Vibration` instead |
| `lottie-react-native` | **absent** | |
| `react-native-iap` / `expo-in-app-purchases` / `react-native-purchases` (RevenueCat) | **absent** | no purchase capability of any kind |
| i18n (`i18next`, `react-i18next`, `expo-localization`, `react-intl`) | **absent** | no translation layer exists |

Also present app-wide but unused by games: `@sentry/react-native ~7.2.0`, `@supabase/supabase-js ^2.93.3` (used via `src/lib/supabase`).

---

## 7. TESTS

**No test coverage for games.** The repo contains exactly one test file — [src/lib/eventChangeSummary.test.ts](../../src/lib/eventChangeSummary.test.ts) — which covers event-change summaries, not games. There is no `__tests__` directory, no jest/vitest config, and no `test` script in `package.json`. Nothing exercises scoring formulas, level config, phase transitions or the save path.

---

## 8. ORPHANS

**None.** Every games file has at least one importer:

| file | imported by |
|---|---|
| all 7 `*Game.tsx` | `src/screens/GamePlayScreen.tsx` |
| `SpinCueOverlay.tsx` | `src/components/games/AnticipationArenaGame.tsx` |
| `types/games.ts`, both hooks | screens / each other |

Dead **code paths** rather than dead files (all evidenced above): the `config` prop in PatternPlay / DribbleRush / AngleMaster; most of `DribbleRushConfig`; 9 typed `game_levels` columns; `FieldVisionConfig.positionChanges`; the `'expert'`/`'master'` complexity values; `AngleMaster`'s four `playSound` calls; all four daily-limit UI branches in the hub; `best_scores`; `react-native-confetti-cannon`. Also stale: **`DRIBBLE_RUSH_AUDIT.md`** at repo root (§3.6), and `GAME_ICONS` [GamesHubScreen.tsx:20-26](../../src/screens/GamesHubScreen.tsx#L20) which maps only 5 of 7 slugs — `dribble-rush` and `angle-master` fall back to a generic "play" icon and the default purple.

---

## 9. OBSERVATIONS — top risks

All INFERRED (static reading only; nothing was run).

1. **INFERRED — XP is client-authoritative.** Each component computes its own `xpEarned` and the device hands that number to `award_xp_safe` as `p_amount` ([useGameSession.ts:162](../../src/hooks/useGameSession.ts#L162)). With no server-side score validation in the repo, XP is as trustworthy as the client. This is the single highest-value thing to fix in a redesign, and it is cheap to fix while the games are being rewritten anyway.
2. **INFERRED — the games schema is unversioned.** 7 tables, ~10 `game_levels` columns, 2 pattern-play tables and `award_xp_safe` exist only in the live DB (§5). A redesign that changes level shape has no migration baseline to build on and no way to review RLS. Capturing the current schema into numbered migrations should precede design work.
3. **INFERRED — "level config lives in the database" is only half true, and the half that's false is silent.** PatternPlay (20), DribbleRush (5) and AngleMaster (15) hardcode their difficulty curves and ignore the `config` they are passed. Worse, the level-select card still *renders* the ignored DB values for dribble-rush ([GamePlayScreen.tsx:255-262](../../src/screens/GamePlayScreen.tsx#L255)), so editing `game_levels` changes what the player is promised but not what they play. Any redesign must pick one source of truth per game and make the other impossible.
4. **INFERRED — the daily limit is off and has been for some time.** `minutesRemaining = 999` ([useCognitiveGames.ts:93](../../src/hooks/useCognitiveGames.ts#L93)) is a testing bypass left in a shipped build; it shows "999 min left today" to players while the UI still promises a 3-hour cap. For a youth-athlete product this is a duty-of-care and trust issue, not just a dead branch.
5. **INFERRED — two games report scores on a different scale than the shared results screen expects.** `GamePlayScreen` prints `{score}%` ([:127](../../src/screens/GamePlayScreen.tsx#L127)) but DribbleRush and AngleMaster return raw point totals, so a good run displays something like "450%". A redesign needs one score contract — normalized percentage, or a per-game display rule.
6. **INFERRED — thresholds and XP curves are inconsistent across the seven games** (70 / 70 / 70 / 60 / 60-accuracy / survive-time / 67; proportional-with-perfect-bonus vs two binary schemes; AngleMaster can award 0 XP). The results screen hardcodes "Score 70% or higher" for all of them. Progression will feel arbitrary to a player who plays more than one game.
7. **INFERRED — DribbleRush's render strategy will not hold up on low-end Android.** A `setInterval(16ms)` loop re-renders a 2393-line component tree ~60×/s on the JS thread, with a `console.log` per tick, no `Animated`, no `requestAnimationFrame` and 149 inline hex colors. Reanimated 4 is already installed and used by exactly one game; the redesign should standardize on worklet-driven motion.
8. **INFERRED — there is no audio and no real haptics, despite code implying both.** AngleMaster imports `expo-av`, keeps a `soundRef` and calls `playSound` four times, but nothing is ever loaded and the repo holds zero audio assets — so the whole path is decorative. `expo-haptics` is not installed; the only vibration in the product is a *distraction* in Pressure Protocol. For games whose appeal is feel, this is the largest experience gap.
9. **INFERRED — there is no feedback loop into the product or back to the player.** No analytics events, no leaderboards, `best_scores` written but never shown, streaks confined to one game's single session, and Pressure Protocol never tells the player which answers were wrong. A redesign has no baseline data to measure itself against, so adding instrumentation before the rewrite would be worth more than after.
10. **INFERRED — no tests, no translation layer, and no shared design system.** Zero games tests (§7) means every scoring change in the rewrite is unverifiable; ~380 inline hex literals across 10 files with no shared theme and no `fontFamily` means visual consistency cannot be enforced; and English is baked into gameplay itself — Pressure Protocol's Stroop task uses the literal words "RED"/"BLUE", which cannot be translated without redesigning the mechanic.

**Two things worth preserving through the redesign:** the deliberate no-flashing constraint in Pressure Protocol ("NO FLASH (seizure risk)" [:240](../../src/components/games/PressureProtocolGame.tsx#L240)), and AngleMaster's `COLORS` token object [:29-45](../../src/components/games/AngleMasterGame.tsx#L29) — the one place a shared palette has already been attempted.
