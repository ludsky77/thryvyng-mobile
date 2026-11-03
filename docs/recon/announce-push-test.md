# Announcement push taps — iOS simulator test recipe

**For:** whoever runs the owed tap test for **PLAYBOOK-ANNOUNCE-PUSH** (ruling B, Lu,
2026-11-03 01:19). **Written 2026-11-03.** The receiving side is built and typechecks; **no
human has tapped either notification.** This file is the recipe that closes that.

**Bundle id: `com.weolkn.thryvyng`** — read from `app.json`, `expo.ios.bundleIdentifier`.
Payloads live in [`test-payloads/`](test-payloads/).

---

## 0. Before you start — two things that will waste your morning

1. **EXPO GO CANNOT RUN THIS TEST.** `src/services/notifications.ts:8` is
   `const isExpoGo = Constants.appOwnership === 'expo'`, and
   `addNotificationListeners` returns a **no-op unsubscribe** when it is true (`:177-180`).
   A tap in Expo Go does nothing and proves nothing. **Use a dev client or a standalone
   build** on the simulator.
2. **THE DATA GOES IN A TOP-LEVEL `body` OBJECT, NOT AT THE TOP LEVEL.** This is the one
   thing worth getting right, and it is counter-intuitive. See §1.

---

## 1. Why the payload has that shape — derived from the handler, not guessed

The app reads the payload at `AppNavigator.tsx:1143`:

```js
const data = response.notification.request.content.data;
```

`content.data` is filled by the native serializer,
`node_modules/expo-notifications/ios/EXNotifications/Notifications/EXNotificationSerializer.m:79-83`:

```objc
+ (NSDictionary *)serializedNotificationData:(UNNotificationRequest *)request
{
  BOOL isRemote = [request.trigger isKindOfClass:[UNPushNotificationTrigger class]];
  return isRemote ? request.content.userInfo[@"body"] : request.content.userInfo;
}
```

**`xcrun simctl push` produces a remote-push trigger**, so the `isRemote` arm is the one that
runs: **`content.data` is exactly `userInfo["body"]`.** Everything else in the APNs payload —
including every top-level key that is not `body` — never reaches `data`.

So a payload that puts `"type": "playbook_open"` at the top level **silently routes nowhere**:
`data.type` is `undefined`, and `routeNotification` falls through to its `else` and opens the
Notifications screen (`:1135-1137`, the navigate at `:1136`). That failure looks like "the new code is broken" and is
not.

**Mind the two `body`s.** `aps.alert.body` is the text the user sees on the lock screen. The
**top-level** `body` is the data envelope. They are different keys at different depths and
both appear in every payload here. (This envelope is the shape Expo's own push service sends,
which is why the existing eight notification types work the same way.)

`routeNotification` reads the type as `data.type ?? data.reference_type` (`:994`), so either
spelling works; these payloads use `type`.

**No `experienceId` or `scopeKey` is needed** — `grep` finds no scoping gate in the module's
iOS source for this SDK (`expo-notifications ~0.32.16`).

---

## 2. Run it

Boot a simulator, install and launch the dev client / build, **sign in as a user who can see
the Playbook**, then background the app (push taps are the point — a foreground delivery just
shows a banner).

```sh
# one-time: confirm a simulator is booted and which one
xcrun simctl list devices booted

# 1 — Playbook, on card F7
xcrun simctl push booted com.weolkn.thryvyng docs/recon/test-payloads/playbook-open-F7.apns

# 2 — Courses
xcrun simctl push booted com.weolkn.thryvyng docs/recon/test-payloads/courses-open.apns

# 3 — malformed card key, must still land somewhere sane
xcrun simctl push booted com.weolkn.thryvyng docs/recon/test-payloads/playbook-open-malformed.apns
```

Each prints the notification on the simulator's screen. **Tap it** — `simctl push` only
delivers; the routing under test runs on the *tap*.

> The bundle id is also inside each file as `"Simulator Target Bundle"`, so
> `xcrun simctl push booted <file>` works too. The explicit form above is given because it
> fails loudly if the id is ever wrong, instead of pushing to nothing.

---

## 3. What each tap must land on

| # | payload | `data` the app sees | must land on | why |
|---|---|---|---|---|
| 1 | `playbook-open-F7.apns` | `{type:'playbook_open', card:'F7'}` | the Playbook reader **open on card F7**, tab bar visible | key is key-shaped and `F7` is a real card (it is one of the 69 in the frozen book) |
| 2 | `courses-open.apns` | `{type:'courses_open'}` | the **Courses** screen | `courses_open` takes no params |
| 3 | `playbook-open-malformed.apns` | `{type:'playbook_open', card:'../../etc/passwd'}` | the Playbook reader **on the COVER** — no error, no blank screen | `ANNOUNCE_CARD_KEY` rejects it, so `card` is `undefined` |

**Two more cases worth covering while you are there, no new payload needed:**

| case | how | must land on |
|---|---|---|
| a card key that is *shaped* right but is not in this viewer's book | edit payload 1's `card` to `"ZZZZ"` | the **cover** — the reader's own fallback (`PlaybookScreen.tsx:358-362` opens the card only `if (cardsByKey.has(cardParam))`) |
| the viewer cannot see the book | set `PLAYBOOK_LIVE = false` in `src/constants/playbookLaunch.ts`, rebuild the bundle, send payload 1 | the **Dashboard** (Home), *not* a dead navigate — the `playbookVisible` check in the branch |

**The three tap states.** All three go through the same `routeNotification`, so each case above
should be tried from:

1. **foreground** — app open and visible;
2. **background** — app backgrounded, then tap (the main case);
3. **cold start** — app force-quit, then tap.

**Record cold start honestly.** It is the weakest of the three and the weakness is
**pre-existing and shared by all ten notification types**, not something this ruling added:
the app registers `addNotificationResponseReceivedListener` in a `useEffect`
(`AppNavigator.tsx:1140-1152`), and that is a plain event subscription which **does not replay
a response that fired before it was registered** (read in
`node_modules/expo-notifications/build/NotificationsEmitter.js:79-84`). The
`pendingNotificationRef` stash (`:1146-1148`, flushed `:1155-1161`) only covers "the listener
fired but the navigator was not mounted yet" — a different race. **The canonical fix is
`getLastNotificationResponse()` / `useLastNotificationResponse()`, which this app never
calls** (`grep` → 0 hits in `src/`). If cold start misses, that is the reason, it affects every
existing type equally, and it is **outside this ruling's scope** — report it rather than
patching it here.

---

## 4. What this recipe does not cover

* **Android.** `simctl` is iOS-only; the Android equivalent is an FCM data message, not written
  here.
* **The sender.** Ruling B is receiving-side only. Nothing in the app or the server sends
  either type yet, so these payloads are hand-made stand-ins for a sender that does not exist.
* **A real APNs round trip.** `simctl push` injects locally; it does not prove the app's push
  token, the Expo push service, or entitlements work.
* **The signed-out case.** A tap by a signed-out user navigates and is then `reset()` to
  `Welcome` by the auth guard (`AppNavigator.tsx:938-961`, allow-list `:943-955`), which
  neither the two new types nor the eight existing ones handle. Recorded in
  `docs/recon/playbook-share-links.md` §1.
