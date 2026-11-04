# F-4 — a push tap on a FULLY CLOSED app opens the app and routes nowhere

**Written 2026-11-04**, before the fix, from source only.
**Tags:** PROVEN = read in source with file:line · INFERRED = reasoned, not run · UNKNOWN = needs
the named check.
**No database was queried and no device was driven to write this file.** Lu's Round 3 phone run
is the only observation in it.

---

## 0. The observation — Lu, iPhone dev build 1.0.19 #53 on Metro, 2026-11-04

| state when the push arrived | tap result |
|---|---|
| **backgrounded** | opens the app **and lands in the chat room** ✅ |
| **foreground** | the in-app banner shows (`RELEASE-1.0.20-FIXES` item 3 **VERIFIED on device**) and the tap **lands in the chat room** ✅ — one first-try miss of the newest message, not reproduced on retry, logged as a watch item |
| **fully closed (killed)** | **the app opens and routing never happens** ❌ — this is F-4 |

The JS came from **Metro**, so the code under test was the working tree as it stood, **including**
the cold-start block added in `c3924b4` ("push cold-start tap routing"). **So F-4 is not a missing
feature. It is a cold-start path that exists and does not work.**

---

## 1. How a tap is handled today — PROVEN

Everything lives in **one component**, `AppNavigator` (`src/navigation/AppNavigator.tsx`).

| piece | where | what it does |
|---|---|---|
| `routeNotification(data)` | **:1077** | the ONE router. `const nav = navigationRef.current; if (!nav) return;` then one branch per type — chat / announcement, events, lineups, `playbook_question`, `playbook_answer`, `playbook_open`, `courses_open`, survey, evaluation, `staff_request`, else `Notifications`. |
| the listener | **:1301** | `addNotificationListeners(undefined, handleResponse)` → `Notifications.addNotificationResponseReceivedListener` (`src/services/notifications.ts:192`). This is the **background / foreground** path. |
| the cold-start read | **:1304** | `Notifications.getLastNotificationResponse()`, asked **once**, inside the same `[]` effect, wrapped in `try/catch` because it throws `UnavailabilityError` where the native method is absent. |
| the dedupe | **:1012, :1287-1288** | `routedNotificationIdsRef`, a `Set` of `request.identifier`, **per mount**. |
| the hold | **:1004, :1295** | `pendingNotificationRef` — one payload, stashed when `navigationRef.current` is null. |
| the flush | **:1314-1320** | `useEffect(..., [loading])`: `if (!loading && navigationRef.current && pendingNotificationRef.current)` → `setTimeout(() => routeNotification(data), 500)`. |
| readiness, such as it is | **:1326, :1340** | the component early-returns a spinner while `loading && !hasMountedNavRef.current`; `hasMountedNavRef` is set in the container's `onReady` and is used **only** by that early return — **never as a routing gate**. |

### The native half, and it is NOT the culprit — PROVEN

`node_modules/expo-notifications` **0.32.16**:

* `getLastNotificationResponse()` is the current, non-deprecated sync API;
  `getLastNotificationResponseAsync()` is now a thin `async` wrapper around it and is marked
  `@deprecated` (`build/NotificationsEmitter.js:93-96`). The official
  `useLastNotificationResponse` hook calls the **same** function
  (`build/useLastNotificationResponse.js`). **So the API this app uses is the right one** — that
  was the first suspect and it is cleared.
* iOS stores the launching tap: `EmitterModule.didReceive(_ response:)` sets `lastResponse` and
  emits `onDidReceiveNotificationResponse`
  (`ios/EXNotifications/Notifications/Emitter/EmitterModule.swift:39-45`).
* **A tap that arrives before any delegate exists is NOT lost.**
  `NotificationCenterManager.userNotificationCenter(_:didReceive:…)` appends it to
  `pendingResponses` when no delegate handled it, and `addDelegate()` **replays every pending
  response** to the delegate as it registers
  (`ios/EXNotifications/Notifications/NotificationCenterManager.swift:64-71, :108-120`).
  `EmitterModule`'s `OnCreate` registers that delegate.

**Conclusion: the payload reaches JS. The native side holds it, replays it, and hands it over
through both doors — the stored `lastResponse` AND the emitted event. F-4 is entirely in the JS
hold-and-flush.**

---

## 2. The cause — PROVEN from the code's own structure

**The hold-and-flush is keyed on the wrong signals.** It waits for *a `loading` transition* and
*a non-null ref*, when what it must wait for is *a payload existing* AND *the navigator being
ready* AND *the session being restored*. Four holes follow from that, and each one is readable in
the code:

### HOLE 1 — the flush only fires when `loading` CHANGES (:1314)

`useEffect(..., [loading])`. The payload is stashed in a **ref** (:1295), and writing a ref
triggers **no re-render**, so nothing re-evaluates the flush condition. A payload that arrives
**after** `loading` has already settled to `false` is therefore **stranded forever** — there is no
later `loading` transition to flush it.

This is exactly the window a cold start opens: the native `addDelegate` replay (§1) can deliver
the response through the **listener** at any point after the module registers, and
`getLastNotificationResponse()` is asked **once**, at mount (:1304). If the stored value is not
there yet at that instant, the only remaining delivery is the listener — into a stash that may
never be flushed.

### HOLE 2 — nothing waits for the navigator to be READY (:1294, :1315)

Both gates test `navigationRef.current` for **non-null**. A `NavigationContainer` ref is non-null
from the moment the container **mounts**, which is strictly earlier than when it becomes
**ready**. React Navigation only handles actions dispatched through the ref after readiness; the
container's own signal is the `onReady` callback — which this file **does capture** (:1340) and
then uses for nothing but the spinner's early return (:1326). So `routeNotification` can be called
on a mounted-but-not-ready container, and the navigate is dropped.

### HOLE 3 — the id is marked routed BEFORE the route lands (:1287-1288)

`routedNotificationIdsRef.current.add(id)` runs at the **top** of `handleResponse`, before any
navigate is attempted and before the stash. So if the navigate is dropped (HOLE 2) or the stash is
stranded (HOLE 1), the **one retry that could have saved it is refused as a duplicate** — and the
native side does deliver twice on a cold start (stored value *and* replayed event, §1). The guard
built to stop double-routing is what stops the recovery.

### HOLE 4 — nothing waits for the SESSION, and a signed-out user is not handled (:1315)

The flush tests `!loading` only. `loading === false` with `user === null` is a signed-out app, and
the flush would still route — into `Main`, which a signed-out user is not in. And a route
dispatched the instant `loading` flips can beat the screen's own session read.

### Which hole fires first on Lu's phone — INFERRED / UNKNOWN

The four overlap, and telling them apart needs a log from the device (the stored value's presence
at mount is a race against native module creation, and Metro makes JS startup slow). **UNKNOWN,
and deliberately not guessed.** The fix below closes **all four**, so it does not depend on the
answer. **The check that would name the winner:** a `console.log` of
`getLastNotificationResponse()`'s result at mount plus one in `handleResponse`, read off Metro
during a killed-app tap.

---

## 3. The fix — what changes, and what must not

**Changed: the hold-and-flush, and only it.**

1. **The pending payload becomes STATE, not a ref.** Writing it re-renders, so the flush effect
   re-evaluates — closing HOLE 1. The effect's deps become the things it actually waits on:
   the payload, navigator readiness, `loading` and `user`.
2. **A real readiness gate.** `onReady` now sets `navReady` (state, for the effect) **and** a ref
   (for the listener's synchronous decision), and the gate also asks the container's own
   `isReady()` — closing HOLE 2.
3. **The id is recorded when the route is DISPATCHED**, not when the response is seen — closing
   HOLE 3. A duplicate delivery while the payload is still held is recognised by the held id and
   ignored, so it cannot stash twice.
4. **The session gate.** The flush waits for `!loading` **and** a `user`. **Signed out → the
   payload is dropped** (and the stored native response cleared), so the app lands on sign-in with
   no crash and nothing queued — closing HOLE 4.
5. **Dedupe that survives a remount.** The routed-id `Set` moves to **module scope**, and the
   cold-start response is **cleared natively** (`clearLastNotificationResponse`) once JS has taken
   custody of it. Together these mean a Fast Refresh, a sign-out/in or any later remount cannot
   re-read and re-route the same tap — which the per-mount `Set` alone could not prevent.

**Not changed — Lu proved these work on the device:**

* **Background and foreground taps.** When the navigator is ready, `handleResponse` still calls
  `routeNotification(data)` **immediately and synchronously**, exactly as today. The only
  behaviour that differs is the *not-ready* case, which used to lose the tap and now holds it.
* **`routeNotification` itself.** Not one branch is touched, so every type — chat, announcement,
  events, lineups, the four playbook/courses types, survey, evaluation, `staff_request`, and the
  `Notifications` fallback — inherits the cold path with no per-type wiring. That is the whole
  reason the fix sits in the hold-and-flush and not in the router.
* **The spinner's early return and `hasMountedNavRef`.** Untouched.

**One trap worth writing down, because it is invisible and it bit during the build.** Clearing the
held payload is a `setState`, so the flush effect re-runs immediately — and React runs the
**previous invocation's cleanup before the next one**. A `clearTimeout` cleanup in that effect
therefore **cancels its own pending route, every time**. The effect deliberately returns **no
cleanup**; the timer is left to fire, and `routeNotification`'s own `if (!nav) return` is what
covers an unmount. The version that was written first had the cleanup and would have routed
nowhere — the same symptom F-4 reports, from a different cause.

`routeNotification` is additionally wrapped in `useCallback` with an empty dependency list — it
reads only `navigationRef` (a ref), the module constant `playbookVisible` and the imported
`isAnnounceCardKey`, so its identity is genuinely stable. That is what lets it be named honestly
in both effects' dependency arrays instead of being omitted from them.

---

## 4. How Lu retests it — the phone, not the simulator

The simulator cannot do this test: it has no real APNs delivery, and Round 1 and Round 2 both
failed to produce a banner there. **iPhone, dev build on Metro.**

| # | steps | expected |
|---|---|---|
| F4a | **Kill the app** (swipe it out of the app switcher — not just Home). Send a **chat** push. Tap the banner. | The app launches **and lands in the chat room** for that channel. The splash may show first; the chat room must be where it settles. |
| F4b | Repeat F4a but **tap the app icon** instead of the notification, then open Notifications | **No routing.** Nothing was tapped, so nothing is queued — the app opens where it normally would. |
| F4c | Kill the app, send a **club announcement** push (payload carries `announcement: true`), tap it | Lands on the **announcements FEED** (cards), not the bubble room. |
| F4d | From F4a, once landed: **background the app, send another push, tap it** | Still routes ✅ — the path Lu already proved must not have regressed. |
| F4e | With the app **open in the foreground**, send a push, tap the in-app banner | Still routes ✅ — same. |
| F4f | Kill the app, tap a push, and **while the splash is still up, do nothing** | It routes once and **stays** there. It must not bounce to Dashboard afterwards. |
| F4g | **Sign out**, kill the app, send/tap a push *(a push to a signed-out device needs a token that is still registered — if it cannot be produced, say so and skip)* | The app opens on **Welcome / sign-in**, no crash, and **nothing routes later** once signed back in. |
| F4h | Kill the app, tap a push, let it route, then **kill and reopen** the app normally | It opens **where it normally opens** — the same tap must **not** route a second time. |

**⚠️ None of these taps is "Send announcement" from the compose form.** F4c needs a push, not a
real club-wide send to ~231 families; use whatever test sender Round 3 used.

---

## 5. What this file does not claim

* **The fix is `built, unverified by Lu`.** No agent has run a killed-app tap on a phone; the four
  holes are read from source, and the device behaviour after the change is **INFERRED**.
* Which hole was the one that bit on #53 stays **UNKNOWN** (§2).
* The **foreground first-try miss of the newest message** Lu saw once is a **separate** watch item
  and is not addressed here. It is a message-list freshness question, not a routing one.
* The announcement push **title** is still built server-side by `chatContextName` in the edge
  function and still reads the slug `club-announcements`. Unrelated to F-4, still owed, still
  SACRED.
