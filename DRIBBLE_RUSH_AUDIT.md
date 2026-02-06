# AUDIT REPORT: DribbleRushGame.tsx

## Section 1: Game Phases & Flow

- **Item 1 (Ready shows level name, "Tap to Start")**: ⚠️ PARTIAL — Ready phase shows level name via `safeConfig.name || \`Round ${currentRound}\`` and distance/shields. The button label is **"Start Round {currentRound}"**, not "Tap to Start".
- **Item 2 (Countdown 3, 2, 1, GO!)**: ✅ CORRECT — Countdown state 3→2→1 via 1s timeouts; when `countdownNum <= 0` phase switches to `'playing'`. Display shows `countdownNum > 0 ? countdownNum : 'GO!'`, so 3, 2, 1, then GO! for one render before playing.
- **Item 3 (Playing runs game loop)**: ✅ CORRECT — When `phase === 'playing'`, a `setInterval(..., FRAME_MS)` runs (16ms) and is cleared when phase changes.
- **Item 4 (Collision only on hit)**: ✅ CORRECT — Phase is set to `'collision'` only inside the game loop's `setObstacles` callback when an obstacle is in the same lane as the player, within ~55px vertically, and not a teammate_pass; shields are checked (decrement or collision).
- **Item 5 (roundComplete only when distance >= target)**: ✅ CORRECT — The only transition to `'roundComplete'` is in the game loop: `setDistance((d) => { const next = d + speed * dt * 10; if (next >= target) { setPhase('roundComplete'); return target; } return next; })` where `target = roundDistanceTargetRef.current`.
- **Item 6 (After Round 3, levelComplete with final score)**: ✅ CORRECT — In the roundComplete effect, when `currentRound < 3` it advances round and calls `startRound()`; when `currentRound === 3` it computes level score, calls `onComplete(...)`, then `setPhase('levelComplete')`.
- **Item 7 (Level complete: "Next Level" and "Back to Games")**: ❌ MISSING — When `phase === 'levelComplete'` the component returns `null`. The parent (`GamePlayScreen`) receives `onComplete` and is responsible for showing the post-level UI (e.g. Next Level / Back to Games). Inside DribbleRushGame there is no level-complete screen.

---

## Section 2: Round Completion Logic

- **roundDistanceTarget**: Set as `(safeConfig.distanceTarget ?? 150) * (roundMod.distMod ?? 0.85)`. So Round 1: 150×0.85 = **127.5m**, Round 2: 150×0.95 = **142.5m**, Round 3: 150×1.0 = **150m**. ✅ Matches spec.
- **Transition to roundComplete**: Only when `next >= target` inside the distance update in the game loop (`setDistance` callback). ✅ Correct.
- **Distance increment**: `next = d + speed * dt * 10`. So distance increases by `speed * 10` per second (e.g. baseSpeed 2.0 → 20 m/s). ✅ Implemented.
- **Check used**: `next >= roundDistanceTargetRef.current`. ✅ Correct.
- **Other triggers**: No other code sets phase to `'roundComplete'`. ✅ Only condition is distance >= target.

**Note on "round completing after 4–5 obstacles"**: At 2.0 speed, 20 m/s → 127.5m in ~6.4s. With spawn every 2.5s that’s ~2–3 obstacles. Seeing 4–5 obstacles implies either (a) play time ~10–12s and target is being reached correctly, or (b) `roundDistanceTargetRef` is out of sync (ref is updated every render from `roundDistanceTarget`; game loop only reads the ref, so it’s correct). So behavior is consistent with distance-based completion; if it feels early, the scale factor `* 10` in the distance formula makes meters add up quickly.

---

## Section 3: Collision Detection

- **Collision logic**: Inline inside the game loop’s `setObstacles` callback (no separate function). For each obstacle in `next`: skip if `Math.abs(o.y - PLAYER_Y) > 55` or `o.type === 'teammate_pass'`. For `sliding_tackle`, compute `effectiveLane` from slide progress; if `effectiveLane === plLane && !inInvincible` → collision. For others, if `o.lane === plLane && !inInvincible` → collision. ✅ Conditions match spec (same lane, vertical proximity ~55px, not teammate).
- **Where it runs**: Inside the same `setInterval` that updates distance/speed/obstacles, each frame. ✅ In game loop.
- **On collision**: `setCollisionObstacleType(o.type)`. If `sh > 0`: `setShields(s => s - 1)`, `setInvincibleUntil(now + 500)`. If shields === 0: `setPhase('collision')`. ✅ Shields checked and behavior as specified.
- **Summary**: ✅ CORRECT — Collision is in the loop, conditions and shield/invincibility handling are correct.

---

## Section 4: Obstacle Spawning

- **Spawn interval**: `spawnInterval = Math.max(500, spawnIntervalMsRef.current)` where `spawnIntervalMsRef` is synced from `(safeConfig.obstacleFrequency ?? 2500) * (roundMod.freqMod ?? 1.0)`. So Round 1: 2500×1.0 = **2500ms**. ✅ Matches spec.
- **Obstacle types**: From `obstacleTypesRef.current` (from `safeConfig.obstacleTypes ?? ['static_defender']`). Default is only `['static_defender']`. ✅ Config-driven.
- **Type selection**: Uses `obstacleWeightsRef.current`. Logic: `r = Math.random()` (0–1), then for each type `if (r < w)` pick it else `r -= w`. With default weight `{ static_defender: 100 }`, `r < 100` is always true, so one type works. For multiple types, weights are treated as absolute thresholds (not normalized); e.g. weights 70 and 30 would not give 70/30% because `r` is 0–1 and 70 is not a probability. 🐛 BUG — Weights should be normalized or in 0–1 range for correct probability.
- **Max obstacles**: `if (prev.length >= MAX_OBSTACLES_ON_SCREEN)` return prev; `MAX_OBSTACLES_ON_SCREEN = 8`. ✅ Max limit present (spec said 6–8; 8 is used).

---

## Section 5: Player Movement

- **changeLane**: Exists; `setPlayerLane` with `Math.max(0, currentLane - 1)` for left and `Math.min(2, currentLane + 1)` for right. ✅ Correct and clamped.
- **Controls**: ◀ and ▶ call `changeLane('left')` and `changeLane('right')`. ✅ Connected.
- **State**: `playerLane` is state; `playerLaneRef.current` is synced each render for use in the loop. ✅ Updates on button press.
- **Visual position**: Player is a `View` with `left: (playerLane * LANE_WIDTH) + (LANE_WIDTH / 2) - 25`. ✅ Position follows `playerLane`.

---

## Section 6: Scoring & XP

- **Round score**: `calculateRoundScore()` = distanceScore (up to 60) + actionScore (up to 30) + comboBonus (up to 20), clamped 0–100. Dodges/passes use `dodgePoints`/`passPoints` from config. ✅ Calculated; formula does not subtract penalties (fakePenalty/missPassPenalty) from the total. ⚠️ PARTIAL — Penalties in config are not applied in the formula.
- **roundScores**: `setRoundScores` in the roundComplete effect: `n[currentRound - 1] = rs`. ✅ Populated.
- **Level score**: `levelScore = Math.round(r1 * 0.25 + r2 * 0.35 + rs * 0.4)`. ✅ Matches spec (R1×0.25 + R2×0.35 + R3×0.40).
- **onComplete**: Called with `{ score: levelScore, accuracy: levelScore, xpEarned, isPerfect, levelCompleted: passed, newHighScore: false }` and `durationSeconds`. ✅ Correct shape and called on Round 3 complete.
- **XP**: `xpEarned = isPerfect ? xpReward + 10 : Math.round((levelScore / 100) * xpReward)`. No explicit tier multiplier. ⚠️ PARTIAL — XP uses levelScore and base xpReward; tier multiplier from config is not applied.

---

## Section 7: Game Loop

- **Loop type**: `setInterval(..., FRAME_MS)` with `FRAME_MS = 16`. ✅ setInterval at 16ms when `phase === 'playing'`.
- **Timing**: 16ms. ✅ Matches spec.
- **Guarded by phase**: Effect dependency `[phase]`; when `phase !== 'playing'` interval is cleared. ✅ Only runs when playing.
- **Steps**: (1) Distance: `d + speed * dt * 10` and check `next >= target` → roundComplete. (2) Speed: `s + accel * dt` clamped to max. (3) Obstacles: `o.y + speedPx * (dt/0.016)`, slide progress for sliding_tackle. (4) Filter: remove when `o.y > FIELD_HEIGHT + 50`, count dodge for non-teammate. (5) Collision: loop over obstacles, same lane + vertical proximity, set collision or shield. (6) Round complete: done inside distance update. ✅ All six behaviors present. Note: distance uses `* 10` (meters per second = speed×10).
- **Cleanup**: `return () => { clearInterval(gameLoopRef.current); gameLoopRef.current = null; }`. ✅ Cleanup on unmount or when phase leaves playing.

---

## Section 8: Config Usage

- **Props**: Component receives `config: DribbleRushConfig`. ✅ Received.
- **Merge**: `safeConfig` = deep merge of `DEFAULT_CONFIG` with `config` for `roundModifiers`, `scoring`, `environment`, `bonusElements`. ✅ Merged with defaults.
- **Usage**: `baseSpeed`, `maxSpeed`, `accelRate`, `distanceTarget`, `obstacleFrequency`, `roundModifiers`, `passThreshold`, `scoring.*`, `bonusElements.shields`, `obstacleTypes`, `obstacleWeights` are all read from `safeConfig` (or refs synced from it) in calculations and spawn. ✅ Config drives behavior.
- **Logging**: `console.log('DribbleRush config received:', ...)` and `console.log('DribbleRush safeConfig:', ...)` at top of component. ✅ Present (can be removed later).

---

## Section 9: UI Elements

- **HUD**: Distance (m), speed (x), round X/3, progress bar, shield count, quit (X). ✅ Present.
- **Field**: 3 lanes with dividers, green background (`gameField` with `flex: 1`). ✅ Present.
- **Player**: Bottom of field, moves by lane (left computed from `playerLane`). ✅ Present.
- **Obstacles**: Red (defender), green (teammate), yellow (sliding), with correct styles. ✅ Present.
- **Controls**: ◀, PASS, ▶ in a bottom bar (only when `phase === 'playing'`). ✅ Present.
- **Collision screen**: "TACKLED!", obstacle type, tip, round score %, Try Again, Quit. ✅ Present.
- **Round complete**: "Round X Complete!", score %, "Next round..." or "Level complete!". ✅ Present.
- **Level complete**: Component returns `null`; parent shows result and Next Level / Back. ❌ MISSING in-component — No level-complete screen inside DribbleRushGame; by design the parent handles it.

---

## CRITICAL ISSUES (bugs causing game to not work)

1. **Level complete screen** — In-component: when `phase === 'levelComplete'` the game returns `null`. If the parent does not immediately show a results screen, the user sees a blank screen. This is a design choice (parent owns post-game UI); ensure GamePlayScreen shows "Next Level" and "Back to Games" when `onComplete` has been called.
2. **Obstacle weights** — Weight selection uses raw weight values (e.g. 100) and compares `Math.random()` (0–1) with them. For a single type it works; for multiple types, weights must be normalized or in 0–1 to get correct probabilities.
3. **Round score formula** — `fakePenalty` and any miss-pass penalty are not applied in `calculateRoundScore()`; round score is distance + action + combo only.
4. **passWindow** — Default `passWindow: 3.0` is used as pixels via `Math.max(10, safeConfig.passWindow ?? 60)`, so 3.0 → 10px. Very small pass window may make passes hard; consider treating 3.0 as a scale or using a larger default for pixels.

---

## ROOT CAUSE ANALYSIS: Why might the round feel like it completes after 4–5 obstacles?

- **Only trigger for roundComplete** is `distance >= roundDistanceTarget` (127.5m for round 1).
- **Distance** increases by `speed * dt * 10` per frame (~20 m/s at speed 2.0). So 127.5m in ~6.4 seconds.
- **Spawn** every 2.5s → ~2.5 obstacles in 6.4s. So under default config, round 1 should complete after about **2–3 obstacles**, not 4–5.
- If the user sees **4–5 obstacles** before round complete, then either:
  - Play time is longer (e.g. 10–12s), so 127.5m is reached after more spawns (e.g. 4–5), which is correct; or
  - **Spawn interval** is shorter in practice (e.g. config or ref giving a smaller value); or
  - **Distance** is advancing faster (e.g. higher baseSpeed from config); or
  - **roundDistanceTarget** is smaller than 127.5 (e.g. different distMod or distanceTarget from DB).
- There is **no other code path** that sets `phase` to `'roundComplete'` (no timer, no obstacle count). So the only way the round can end without collision is `distance >= roundDistanceTarget`. To make rounds last longer (more obstacles), increase `distanceTarget` or lower `baseSpeed`/speed progression, or increase `roundModifiers.round1.distMod`.
