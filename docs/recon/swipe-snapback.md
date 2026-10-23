# Chat-list swipe: snap-back + vertical scroll during swipe — diagnosis

Date: 2026-10-22 · Diagnose only, no code changed.
Symptoms reported by Lu: (1) left-swipe on a group/DM row springs back instead of
latching open; (2) the list scrolls vertically while you are swiping horizontally.
ZZ Test Team's row *does* hold open.

Every claim below is labelled **PROVEN** (file:line + quoted code) or **INFERRED**
(stated reasoning, no device/prod access from this session).

---

## 0. What the swipe actually is

**PROVEN — there is no swipe library. The row is hand-rolled on React Native core.**

- `SwipeableChatRow` is a local component: `src/screens/ChatScreen.tsx:176-336`.
- It uses `Animated` + `PanResponder` imported from `react-native`
  (`src/screens/ChatScreen.tsx:20-21`).
- `react-native` is `0.81.5` (`package.json:41`).
- **`react-native-gesture-handler` is NOT installed.** `grep gesture-handler package.json`
  → no match (exit 1); `ls node_modules | grep gesture-handler` → no match (exit 1).
  So `Swipeable` / `ReanimatedSwipeable` / `activeOffsetX` / `failOffsetY` /
  `rightThreshold` / `friction` / `overshoot*` / `simultaneousHandlers`
  **do not exist in this codebase** — the repo-wide grep for them returns zero hits
  in `src/` apart from an unrelated `friction: 8` spring in `SplashScreen.tsx:82`.
- `react-native-reanimated` `~4.1.1` **is** installed (`package.json:43`) but this row
  does not use it.
- The author's own note says the same, and why:
  `ChatScreen.tsx:165-167` — *"PanResponder, not react-native-gesture-handler: RNGH is
  NOT installed and adding it is a dependency change."*
- Precedent it was copied from: `src/screens/NotificationsScreen.tsx:19-64` (swipe-to-delete).

**Threshold / friction / overshoot props — PROVEN equivalents (all hand-rolled):**

| RNGH prop | This code | Value |
|---|---|---|
| action strip width | `ChatScreen.tsx:161-162` | `160` (2 actions) / `80` (1 action) |
| `rightThreshold` | `ChatScreen.tsx:272` | half the width → `80px` / `40px` |
| `friction` | `ChatScreen.tsx:222-225` | `Animated.spring`, all defaults |
| `overshootRight` | `ChatScreen.tsx:265-267` | clamped: `Math.min(0, Math.max(-w, base + g.dx))` |
| claim gate | `ChatScreen.tsx:259-260` | `Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy)` |

---

## 1. Is there an axis lock between the row gesture and the parent list?

**PROVEN — NO. None, on either side.**

- Repo-wide grep for `activeOffsetX`, `failOffsetY`, `simultaneousHandlers`,
  `onPanResponderTerminationRequest`, `onMoveShouldSetPanResponderCapture`:
  **zero hits in `src/`** (only unrelated `onStartShouldSetPanResponder: () => true`
  at `src/components/lineup/LineupFieldEditor.tsx:55`).
- `grep -n scrollEnabled src/screens/ChatScreen.tsx` → **no match**. The list's scroll
  is never disabled while a row is being dragged.
- The row's `PanResponder.create` config (`ChatScreen.tsx:255-282`) declares only:
  `onMoveShouldSetPanResponder`, `onPanResponderGrant`, `onPanResponderMove`,
  `onPanResponderRelease`, `onPanResponderTerminate`.

So the JS row gesture and the native vertical scroll are **never made mutually
exclusive**. Both symptoms fall out of that one hole.

---

## 2. CAUSE 1 — the row springs back instead of staying open

### C1-A — PROVEN — the list's native scroll view is *permitted* to steal the gesture mid-drag, and the steal path springs the row shut

Three facts chain:

1. The row's config defines **no** `onPanResponderTerminationRequest`
   (`ChatScreen.tsx:255-282`).
2. React Native's default when that key is absent is **`true` = "yes, anyone may take
   this gesture from me"**:
   ```js
   // node_modules/react-native/Libraries/Interaction/PanResponder.js:550-553
   onResponderTerminationRequest(event) {
     return config.onPanResponderTerminationRequest == null
       ? true
       : config.onPanResponderTerminationRequest(event, gestureState);
   }
   ```
3. When the scroll view does take it, the row runs:
   ```js
   // ChatScreen.tsx:281
   onPanResponderTerminate: () => settle(isOpenRef.current),
   ```
   For a closed row `isOpenRef.current === false` → `settle(false)` →
   `Animated.spring(translateX, { toValue: 0 })` (`ChatScreen.tsx:221-233`)
   → **the row springs back.**

Critically, `onPanResponderRelease` (`ChatScreen.tsx:269-280`) is the **only** code
path that can latch a row open — and a *terminated* gesture never reaches Release.
So a stolen swipe can only ever spring back. The author already suspected this; the
handler's own comment reads *"The list took the gesture over mid-swipe: return to
where we were"* (`ChatScreen.tsx:280`).

Platform note — **PROVEN**: `onShouldBlockNativeResponder` also defaults to `true`
(`PanResponder.js:479-481`), but RN's own doc comment says it *"is currently only
supported on android"* (`PanResponder.js:107`). So on **iOS there is no block at
all** and the UIScrollView is free to claim the touch.

### C1-B — PROVEN — a DM/group row needs twice the travel of a team row, so there is twice the window for C1-A to fire

```js
// ChatScreen.tsx:191-192
const width = actions.length > 1 ? SWIPE_ACTION_WIDTH : SWIPE_ACTION_WIDTH_SINGLE;
// ChatScreen.tsx:161-162 → 160 and 80
// ChatScreen.tsx:272
const shouldOpen = base + g.dx < -w / 2;
```

- 2 actions → `w = 160` → must travel **80px** to latch.
- 1 action  → `w = 80`  → must travel **40px** to latch.

And the action count is decided by channel type:

```js
// ChatScreen.tsx:1681-1704 — Mute always; Hide only if hideable
if (canHideChannelType(conversation.channel_type)) { actions.push({ key: 'hide', ... }) }
// src/lib/hiddenChats.ts:33
const HIDEABLE_CHANNEL_TYPES = ['dm', 'group_dm'] as const;
```

→ **DM and group chats get 2 actions and an 80px threshold. Team chats get 1 action
and a 40px threshold.** That is exactly the split Lu is seeing.

### C1-C — PROVEN asymmetry, INFERRED contribution — nothing in this component can drive a row *open* from state

```js
// ChatScreen.tsx:246-252
useEffect(() => {
  if (isOpen) {
    setRevealed(true);
    return;        // <-- never settle(true)
  }
  settle(false);
}, [isOpen, settle]);
```

`settle(true)` is reachable **only** from `onPanResponderRelease`. So if `openSwipeKey`
ever names a row whose `translateX` is `0` — any remount, or any path that sets the key
other than that row's own release — the row renders visually **shut while state says
open**, and the next touch anywhere on a card is swallowed with no visible effect by
the capture handler:

```js
// ChatScreen.tsx:302-305
const consumeOutsideTap = () => { if (!openKey) return false; onOpen(null); return true; };
// mounted at ChatScreen.tsx:331
```

**INFERRED:** this is the second half of what reads as "it snapped back — and then my
next tap did nothing."

### C1-D — PROVEN — one steal closes the row twice

Both lists close any open row the moment the list starts scrolling:

```js
// ChatScreen.tsx:2677 (Recent FlatList) and ChatScreen.tsx:2754 (by-team SectionList)
onScrollBeginDrag={() => setOpenSwipeKey(null)}
```

So in the C1-A scenario, even if a row had latched, the scroll that the un-blocked list
then performs clears `openSwipeKey` → the effect at `:246-252` runs `settle(false)`.
**Two independent closers from a single stolen gesture.**

---

## 3. CAUSE 2 — the list scrolls vertically during a horizontal swipe

### C2-A — PROVEN — same root as C1-A: nothing stops it

Section 1 above: no `onPanResponderTerminationRequest: () => false`, no
`scrollEnabled={false}` during drag, no RNGH axis props (the library isn't installed).
Once the row has the responder, the native scroll view may take it back at will
(`PanResponder.js:550-553` default `true`), and on iOS nothing blocks the native
gesture (`PanResponder.js:107`). Horizontal drag and vertical scroll are therefore
free to interleave within one touch.

### C2-B — PROVEN — the claim test is bubble-phase, cumulative, and loses a diagonal start outright

```js
// ChatScreen.tsx:259-260
onMoveShouldSetPanResponder: (_, g) =>
  Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy),
```

- There is **no** `onMoveShouldSetPanResponderCapture`, so this runs in the bubble
  phase — after descendants, and after the native scroll view has had its chance.
- `g.dx` / `g.dy` are **cumulative from touch-down**, so a swipe that starts with a few
  px of vertical drift must out-travel that drift before it can ever claim; until then
  the scroll view owns the touch.
- A swipe that is even slightly more vertical than horizontal **never claims at all**
  → the row does not move and only the list scrolls.

**INFERRED:** the thumb arc on a real left-swipe is rarely pure horizontal, which is
why this is intermittent rather than constant.

---

## 4. Why ZZ Test Team holds open

**PROVEN mechanism, INFERRED premise.**

- **PROVEN:** any channel whose `channel_type` is not `dm` or `group_dm`
  (`src/lib/hiddenChats.ts:33`) gets **one** action from `swipeActionsFor`
  (`ChatScreen.tsx:1681-1704`) → `width = 80` (`ChatScreen.tsx:192`) → latch threshold
  **40px** (`ChatScreen.tsx:272`), half a DM/group's 80px.
- **PROVEN:** nothing *else* about that row differs. Same component, same
  `rowKey={item.id}`, same `keyExtractor={(item) => item.id}`, same `renderItem`
  (Recent: `ChatScreen.tsx:2658-2673`; by-team: `ChatScreen.tsx:2720-2752`). No
  per-type styling, no per-type gesture config.
- **INFERRED** (cannot query prod from this session): ZZ Test Team is a team-type
  channel, so it takes the 40px path. It latches after ~40px — usually before the
  scroll view decides to claim, and over too little travel to accumulate the vertical
  drift that would fail the `|dx| > |dy|` test.

**Conclusion: ZZ Test Team is not special. It is the same bug seen through a threshold
that is half as far away.**

---

## 5. Re-renders: what triggers them, and can one reset an open row?

**A plain re-render does NOT reset an open row — PROVEN:**

- `keyExtractor` is `(item) => item.id` on every list — Recent `:2659`, Past `:2696`,
  by-team `:2721`, plus modal lists `:2074 :2259 :2356 :2536`. `item.id` is the channel
  id, stable across refetches → React keeps each row's identity.
- The open position lives in refs/state that survive a re-render:
  `translateX = useRef(new Animated.Value(0))` (`ChatScreen.tsx:190`) and
  `revealed` (`ChatScreen.tsx:203`).
- The moving values are deliberately read through refs so a re-render cannot stale them
  (`ChatScreen.tsx:208-219`, with the author's note that reading from the closure
  *"meant it saw the FIRST render's values forever: an already-open row dragged from
  base 0 and jumped shut"*).

**Nothing is memoized — PROVEN:** `grep "React.memo" src/screens/ChatScreen.tsx` → zero
hits. `ConversationItem` (`:339`) and `SwipeableChatRow` (`:176`) are both unmemoized,
and `renderItem`, `actions={swipeActionsFor(item)}` and `onPress={() => ...}` are new
identities every render. So **every row re-renders on every refresh.** That is wasted
work, not a reset.

**What fires a refresh (PROVEN, all in `src/contexts/ChatUnreadContext.tsx` unless noted):**

| Trigger | Location |
|---|---|
| any incoming message insert (realtime) | `ChatUnreadContext.tsx:277-280` |
| `postgres_changes` UPDATE on `comm_channel_members` for this user | `ChatUnreadContext.tsx:282-296` |
| app returns to foreground | `ChatUnreadContext.tsx:300-307` |
| screen regains focus — **also sets `openSwipeKey` null** | `ChatScreen.tsx:971-976` |
| a chat is opened — sets `openSwipeKey` null | `ChatScreen.tsx:1902-1903` |
| Mute / Hide completing → `refresh()` | `ChatScreen.tsx:1895` |
| list starts scrolling — sets `openSwipeKey` null | `ChatScreen.tsx:2677`, `:2754` |

Note the feedback loop (**PROVEN**): a Mute writes `comm_channel_members`, which is
exactly the table the realtime subscription at `ChatUnreadContext.tsx:282-296` watches
for this user — so one Mute causes **two** refreshes (its own `refresh()` plus the
realtime echo). Harmless to the gesture today only because the action button closes the
row first (`ChatScreen.tsx:325-328`).

**Paths that CAN lose an open row — both INFERRED, both low-likelihood for a row under
your finger:**

1. **Virtualization remount.** A row scrolled out of the FlatList render window
   unmounts; on return `translateX` is a fresh `0` and, by **C1-C**, nothing will
   re-open it. Requires the open row to leave the window.
2. **Data-set removal.** `conversations` is filtered by the club chip
   (`ChatScreen.tsx:940-943`); selecting a chip can drop the open row from `data`
   entirely while `openSwipeKey` still names it. In practice `consumeChromeTap`
   (`ChatScreen.tsx:641-645`, mounted on the chips at `:1715`) swallows that first tap
   and clears the key, so this is latent rather than live.
3. `sortByRecent` (`ChatScreen.tsx:143`, applied at `:897`) re-orders rows when a new
   message lands. With stable keys React **moves** the cell rather than remounting it,
   so this should be safe — **INFERRED**, not device-verified.

---

## 6. Ranked fixes

Ranked by (symptom coverage × confidence) ÷ blast radius. **No code was changed.**

| # | Fix | Covers | Files touched |
|---|---|---|---|
| 1 | Add `onPanResponderTerminationRequest: () => false` to the row's config | **Cause 1 (C1-A, C1-D) AND Cause 2 (C2-A)** | `src/screens/ChatScreen.tsx` (one line inside `:255-282`) |
| 2 | Add `onMoveShouldSetPanResponderCapture` with a cheaper axis test (e.g. `|dx| > 4 && |dx| > |dy| * 1.5`) so the row wins the responder before the scroll view decides | Cause 2 (C2-B) | `src/screens/ChatScreen.tsx:259-260` |
| 3 | In the open effect, call `settle(true)` when `isOpen` instead of only `setRevealed(true)` — make state drive the pixels | C1-C; makes the row remount-safe | `src/screens/ChatScreen.tsx:246-252` |
| 4 | Make the latch travel-based, not half-width (e.g. `g.dx < -40 \|\| g.vx < -0.3`), so a DM latches on the same flick a team row does | C1-B | `src/screens/ChatScreen.tsx:269-280` |
| 5 | Stop the gesture's own momentum closing the row: ref flag set in `onPanResponderGrant`, cleared on release/terminate, consulted by `onScrollBeginDrag` | C1-D | `src/screens/ChatScreen.tsx` (row component + `:2677`, `:2754`) |
| 6 | Wrap `ConversationItem` / `SwipeableChatRow` in `React.memo` and `useCallback` the `renderItem`s | neither cause — perf only | `src/screens/ChatScreen.tsx` |
| 7 | **Last resort:** install `react-native-gesture-handler` and rebuild the row on `ReanimatedSwipeable` with `activeOffsetX` / `failOffsetY` | both causes, properly | `package.json`, `App.tsx` (`GestureHandlerRootView`), `ios/Podfile.lock`, `android/`, `src/screens/ChatScreen.tsx` |

**#7 is SACRED — new dependency + native rebuild. Needs Lu's explicit approval.**
#1-#5 are same-root, ROUTINE, and confined to one file. Fix #1 alone is the highest-value
single line; #2 and #3 are what make it reliable rather than just better.

Same bug class also present at `src/screens/NotificationsScreen.tsx:23-44` (same missing
`onPanResponderTerminationRequest`, same bubble-phase `|dx| > 8` gate) — **out of scope
here, flagged only.**

---

## 7. APPLIED — 2026-10-22

Fixes #1-#5 applied to `src/screens/ChatScreen.tsx`; #1 and #2 also applied to
`src/screens/NotificationsScreen.tsx` (same root, flagged at the end of §6).
Fix #6 (memo) and #7 (react-native-gesture-handler) were **not** applied — #6 was
forbidden for this pass, #7 is SACRED (dependency + native rebuild) and still needs Lu.

| # | What changed | Where |
|---|---|---|
| 1 | `onPanResponderTerminationRequest: () => false` added — the row now keeps the gesture until the finger lifts, so the list can no longer steal it. `onPanResponderTerminate` kept as a recovery path (termination can still arrive unasked) and now also clears the drag flag | `ChatScreen.tsx:332`, terminate at `:366-369` |
| 2 | `onMoveShouldSetPanResponderCapture` added: `|dx| > 4 && |dx| > |dy| * 1.5`. Capture phase, so a clearly horizontal drag is claimed from the 4th pixel, before the scroll view decides. The looser bubble test is kept as the late fallback | `ChatScreen.tsx:313-314` (bubble unchanged at `:317-318`) |
| 3 | The open effect now calls `settle(true)` instead of `return`-ing after `setRevealed(true)` — open state drives the pixels, so a remounted row re-opens itself instead of sitting visibly shut while `openSwipeKey` still names it | `ChatScreen.tsx:285-296` |
| 4 | Latch is travel-based, not half-the-strip-width: `SWIPE_LATCH_TRAVEL = 40` / `SWIPE_LATCH_VELOCITY = 0.3`, applied asymmetrically (a closed row opens on 40px left or a left flick; an open row stays open unless dragged 40px right or flicked right). **A DM/group row now latches at the same 40px a team row always did** — this is the line that removes the ZZ-Test-Team-vs-DM split | consts `ChatScreen.tsx:174-175`, test `:353-355` |
| 5 | A shared `swipeDragActiveRef` is set on grant and cleared on both terminal paths; both lists' `onScrollBeginDrag` return early while it is true, so the scroll view twitching *inside* a swipe no longer closes the row being swiped | ref `ChatScreen.tsx:725`, prop threaded at `:215 :224 :1884 :2760 :2846`, set/cleared `:334 :343 :367`, read `:2777 :2861` |
| 1+2 | Same two fixes on the notifications swipe-to-delete row | `NotificationsScreen.tsx:28-29` (capture), `:36` (termination guard) |

**One deviation from §6 worth recording.** #5 was specified as "a ref flag" and was first
written as a module-level `{ current: false }` object, which is what the one-responder-at-a-time
argument allows. `react-hooks/immutability` rejects writing to a module-scope value from
inside a component (3 errors), so it became a real `useRef(false)` owned by `ChatScreen`
and passed to every row as `dragActiveRef`. Same single shared flag, same behaviour,
lint-clean. The `DragActiveRef` type and the reasoning are at `ChatScreen.tsx:178-193`.

**Also note:** #4's replacement removed the now-unused `const w` / `const base` lines from
`onPanResponderRelease`. `onPanResponderMove` still computes both — the drag still clamps
to the strip width, only the *latch decision* stopped being width-derived.

**Verification — static only. NOT run on device or simulator.**

```
npx tsc --noEmit | grep -c "error TS"            → 5   (= baseline; all 5 pre-existing, in the games)
ESLINT_USE_FLAT_CONFIG=false npx eslint <2 files> → 94 problems, 0 errors, 94 warnings
                                                    (before: 94 problems, 0 errors, 94 warnings — identical)
npx expo export --platform ios                   → exit 0
grep -c onPanResponderTerminationRequest          → 1 in ChatScreen.tsx, 1 in NotificationsScreen.tsx
```

**Owed:** a device/simulator pass on the two reported symptoms — swipe a DM *and* a group
row past 40px and confirm each holds; swipe diagonally and confirm the list does not scroll
under the finger. Neither claim is device-proven by this pass.
