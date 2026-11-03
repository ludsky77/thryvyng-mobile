# Sharing a Playbook link — what exists today

**Date:** 2026-11-03 · **Mode:** READ-ONLY. Static source, `app.json`, `eas.json`, the web
repo's route table and its `.well-known` files. **No DB query, no app run, no device test,
no code changed** — this file is the only thing this task wrote.
**Repos read:** `thryvyng-mobile` @ `2ef719f` · `thrive-and-score` @ `df8dabe` (READ-ONLY).
**Question asked:** can a coach drop a Playbook link in club chat, or send a push, and have it
open the book — on the phone, for the person who taps it?

**Tags:** PROVEN = read in a file with a line cite · INFERRED = reasoned, not run ·
UNKNOWN = needs the named check.

---

## 0. Headline findings — read these five

1. **IN A STORE BUILD, NO LINK OF ANY KIND REACHES THE PLAYBOOK. PROVEN.** The only deep-link
   path into the reader is inside a `__DEV__` spread (`src/navigation/linking.ts:159-167`), and
   Metro folds `__DEV__` to a literal, so a production bundle's config is `...{}` — the path
   does not exist. The file says so itself (`:100-105`): *"a production bundle has no URL into the reader …
   A real, release-time path must be gated on `playbookVisible`, not on `__DEV__`."*
2. **A SHARED `https://thryvyng.com/playbook` LINK OPENS THE WEBSITE, NOT THE APP. PROVEN
   from two files.** iOS path matching lives in the server-hosted
   `apple-app-site-association`, whose `paths` list is exactly four prefixes —
   `/join-team/*`, `/join-staff/*`, `/claim-player/*`, `/accept-coparent/*` — and **no
   `/playbook`** (`thrive-and-score/public/.well-known/apple-app-site-association`). Android's
   `intentFilters` carry the same four prefixes and no `/playbook` (`app.json`). So the OS has
   no reason to hand the link to the app, and the tap lands in the browser.
3. **PUSH ALREADY ROUTES INTO THE PLAYBOOK, and it is the one working door. PROVEN.**
   `routeNotification` sends `playbook_question` and `playbook_answer` to
   Main → HomeTab → Playbook (`src/navigation/AppNavigator.tsx:1011-1042`). **But both are
   aimed at the questions view and both need a `question_id`** — there is no notification type
   that opens the cover, a chapter or a card. A "read this card" push does not exist.
4. **CHAT LINKS ARE ALREADY TAPPABLE — the linkifier is not the missing piece.** `ChatBubble`
   linkifies `https://`, `http://` and bare `www.` (`:29-30`, call site `:619`), and it is the
   only message-body renderer, used by both chat screens. **`thryvyng://` is NOT matched** and
   renders as dead text. Already written up in `docs/recon/chat-links-check.md` (Oct 30).
5. **THERE IS NO OTA, SO EVERY MOBILE FIX BELOW COSTS A STORE BUILD. PROVEN.**
   `expo-updates` is **not installed**, `app.json` has no `updates` or `runtimeVersion` key,
   and `eas.json` configures no channels. The one exception is the iOS universal-link *path
   list*, which is a web deploy (see §7, row U-1) — but it is useless on its own, because the
   app still needs the JS route to answer with.

---

## 1. Deep links — scheme, config, and the exact link that works today

**Scheme:** `thryvyng` (`app.json`, `expo.scheme`) · **Prefixes** (`linking.ts:111-112`, used `:115`):
`thryvyng://`, `https://thryvyng.com`, `https://www.thryvyng.com`.

**The exact links that work today — DEV BUILD ONLY:**

```
thryvyng://playbook              → the reader, on the cover
thryvyng://playbook?card=F3      → the reader, opened on card F3
thryvyng://playbook-dev          → the M2 board harness (PLAYBOOK-DEV-HARNESS)
```

PROVEN, `linking.ts:159-167` (`PlaybookDev` `:161`, the nested `Playbook` `:165`). `Playbook: 'playbook'` is nested as
`Main → { HomeTab → { Playbook } }`, because the reader is a HomeStack screen (so the tab bar
stays on screen). `?card=` needs no `parse` entry — React Navigation passes query params
through as route params, and the route reads `props.route?.params?.card`
(`AppNavigator.tsx:353`).

**In a production build: nothing.** The whole `Main` key exists only inside that `__DEV__`
spread, so a release bundle has **no path into any nested tab screen at all**, not just the
Playbook. `thryvyng://playbook` in a store build falls to `NotFound: '*'` (`linking.ts:168`,
screen registered `AppNavigator.tsx:887`).

**COURSES HAS NO DEEP LINK IN ANY BUILD. PROVEN** — `grep "Courses" src/navigation/linking.ts`
returns nothing: no typed route entry and no path. `Courses` and `MyCourses` are HomeStack
screens (`AppNavigator.tsx:324-329`) reachable only by tapping through the UI.

**Signed-out is a second, separate wall. PROVEN, `AppNavigator.tsx:938-961`.** There is an
allow-list of 12 routes a signed-out user may sit on — `JoinTeam`, `Support`, `JoinStaff`, the
three `Register*`, `ProgramRegistration`, `AcceptCoParent`, `ClaimPlayer`, `Invitation`,
`Invitations`, `NotFound`. Anyone signed out on **any other route is `reset()` to `Welcome`**,
(`:943-955` the list, `:957-960` the reset) and **the destination is dropped.** `Playbook` is not on that list. So even with a working
path, a link sent to a parent who is signed out would bounce them to Welcome and forget where
they were going.

**The return-after-sign-in plumbing already exists and is barely used.** `Login` accepts
`returnTo` / `returnParams` and `LoginScreen.tsx:137-141` acts on them. **Exactly one caller
uses it:** `src/screens/invitation/InvitationAuthWrapper.tsx:25` — a thin route wrapper that,
when `!user`, navigates to `Login` with `returnTo: 'Invitation'` and the token. **That is the
pattern a Playbook link should copy**, not invent.

---

## 2. Universal / app links

| platform | where paths are decided | what it allows today | `/playbook`? |
|---|---|---|---|
| **iOS** | `app.json` `ios.associatedDomains` = `applinks:thryvyng.com`, `applinks:www.thryvyng.com` — **domain-level, every path** — then the server's AASA file filters by path | the 4 prefixes in the AASA | **NO** |
| **Android** | `app.json` `android.intentFilters` — one `VIEW` filter, `autoVerify: true`, `BROWSABLE`+`DEFAULT`, 8 data entries (4 prefixes x 2 hosts) | the same 4 prefixes | **NO** |

**This asymmetry is the useful part.** iOS's `associatedDomains` is already as broad as it can
be, so **adding `/playbook/*` to the AASA is a WEB-ONLY change with no store build** — the OS
re-reads the file from the server. Android's path list is *in the native manifest*, so it
**cannot** change without a new binary. `assetlinks.json` needs nothing: it already grants
`handle_all_urls` for `com.weolkn.thryvyng`
(`thrive-and-score/public/.well-known/assetlinks.json`).

**Note for whoever edits those files:** both exist twice, in `public/.well-known/` and in
`dist/.well-known/` (plus a `.backup` beside each AASA). `dist/` is build output; the source of
truth is `public/`. UNKNOWN whether the deploy serves them with
`Content-Type: application/json` and no redirect, which iOS requires — the check is
`curl -sI https://thryvyng.com/.well-known/apple-app-site-association`.

---

## 3. Chat — are URLs tappable, and does a tap stay in the app?

**Tappable: YES, and in one place only.** `src/components/chat/ChatBubble.tsx` is the single
message-body renderer, imported by `TeamChatRoomScreen.tsx:28` and `DMChatScreen.tsx:34` — the
only two screens that render messages, so there is no second unlinkified path.

| thing | line | behaviour |
|---|---|---|
| `URL_SPLIT` / `URL_TEST` | `:29-30` | matches `https://`, `http://`, bare `www.` |
| `TRAILING_PUNCTUATION` | `:31` | peeled off, so `…/a.` opens `…/a` |
| `openUrl()` | `:33-38` | **`Linking.openURL(href)`** — hands the URL to the OS; `Alert` on failure |
| call site | `:619-622` | inside the message body `<Text>` |

**Does a tap stay in-app? NO — it leaves.** `openUrl` hands the href to the OS, and since the
AASA has no `/playbook` (§2) the OS opens the browser. **Even if the AASA did list it, a
universal link opened with `Linking.openURL` from inside the app that owns it does not
re-enter that app on iOS — it opens Safari** (INFERRED: documented Apple behaviour, not tested
here; the check is a device tap once a path is registered). This is exactly why
`chat-links-check.md` proposed routing in-app hrefs through the **navigator** rather than
through `Linking`.

**`thryvyng://playbook` pasted into chat is dead text** — `URL_SPLIT` does not match the custom
scheme (PROVEN, `:29`). So neither of the two link shapes works from chat today: the custom
scheme is not tappable, and the https one leaves for the web.

**No share affordance exists to produce the link in the first place.** `grep` for `Share.` and
`Clipboard` across `src/features/pac-playbook/` returns **nothing**, and the web reader has no
`navigator.share` or `navigator.clipboard` either. Today a coach would have to type the URL by
hand, or copy it from a desktop browser's address bar (§5).

---

## 4. Push tap handler — which type goes where

`routeNotification(data)`, `src/navigation/AppNavigator.tsx:965-1068`. Key is
`data.type ?? data.reference_type`. Unmatched types fall through to `Notifications` (`:1066`).

| `type` | destination | needs |
|---|---|---|
| `chat_message` / `chat` / `message` | ChatTab → TeamChatRoom | `channel_id` ‖ `chat_id` ‖ `reference_id` |
| `event_reminder` / `event_created` / `event_changed` / `event_cancelled` / `event` | `EventDetail`, else CalendarTab → Calendar | `event_id` ‖ `reference_id` |
| `lineup_published` | `EventDetail`, else HomeTab → LineupList | `event_id` ‖ `team_id` |
| **`playbook_question`** | **HomeTab → Playbook**, `questionMode: 'inbox'` | `question_id` ‖ `reference_id` |
| **`playbook_answer`** | **HomeTab → Playbook**, `questionMode: 'family'` | same |
| `survey` / `survey_reminder` | HomeTab → SurveyResponse | `survey_id` |
| `evaluation` / `evaluation_published` | `EvaluationDetail` | `evaluation_id` ‖ `reference_id` |
| `staff_request` | HomeTab → StaffRequests | `teamId` ‖ `team_id` |
| anything else | `Notifications` | — |

**So: can a push route to the Playbook today? YES — two types already do.** Both are fired by
prod migration `20261102033000` (`:819`, `:892`) and both carry `card_key`, passed through as
the book's `card` param. **The gap is that both are question-shaped.** There is no
`playbook_card` / `playbook_chapter` type, so "the coach wants the team to read card F3"
has no push to send. Adding one is the cheapest real win in this file (§7, row P-1): it needs
**no deep link, no AASA, no `app.json`** — the push branch is plain JS beside two that already
work.

**Cold-start taps are already handled** — a tap arriving before the navigator mounts is stashed
in `pendingNotificationRef` and replayed 500 ms after loading finishes (`:1079-1090`, replay `:1089`).
**Signed-out is NOT handled:** `routeNotification` does not check `user`, so a tap by a
signed-out user navigates and then the §1 allow-list resets them to `Welcome`
(INFERRED from the two code paths; not device-tested).

---

## 5. Web (read-only) — the URL, and the sign-in return

**The URL is `https://thryvyng.com/playbook`**, and the card deep link is
**`https://thryvyng.com/playbook?card=<cardKey>`**. PROVEN: route `App.tsx:337`, gated on
`playbookVisible` with a `/dashboard` redirect when off; `PlaybookPage.tsx` is a 15-line lazy
shim over `PlaybookReader`.

**The web reader both READS and WRITES `?card=`** (`PlaybookReader.tsx:110-126`,
`useSearchParams`) — so the address bar tracks the card you are on. **That is today's only
practical way to get a shareable Playbook link: open the card on desktop and copy the URL.**

**Is a signed-out visitor sent back after sign-in? YES, for sign-IN. PROVEN end to end:**

1. `ProtectedRoute` wraps the route and, when `!user`, does
   `<Navigate to="/signin" replace state={{ from: location }} />` — and the comment says why:
   *"Carry the intended destination (path + query) so sign-in can return here."*
2. `SignIn.tsx:24-30` reads `location.state.from` and builds
   `redirectTarget = pathname + search + hash` — **so `?card=` survives.**
3. It is used in both directions: on an already-live session (`:39`) and after a successful
   sign-in (`:84-88`), where the comment notes an explicit destination beats the role map.

**But sign-UP does not return. PROVEN by absence:** `src/pages/SignUp.tsx` imports only
`Link, useNavigate` — no `useLocation`, no `from`, no `redirectTarget`. A brand-new parent who
taps a shared Playbook link, has no account, and signs up lands wherever SignUp sends them and
**loses the card.** Worth a ruling, since "a coach shares the book with new families" is the
likeliest reason this feature is wanted at all.

---

## 6. Prior art in the ledger and recon

| source | date | what it already says |
|---|---|---|
| **`docs/recon/chat-links-check.md`** | Oct 30 2026 | The closest prior art. Answers §3 in full, names the slice this belongs to — **"the links-consistency slice"** — and proposes the fix: match `thryvyng://` in `URL_SPLIT`, and route in-app hrefs through the navigator instead of `Linking.openURL`. **It also leaves an UNDECIDED ruling, which still stands:** should a deep link pasted into chat be trusted at all? A message is user content, and a tap navigates another member somewhere they did not choose — **allow-list the safe paths, or open unconditionally.** Called "a product call, not this room's". |
| **`docs/recon/deeplinks-audit.md`** | Aug 15 2026 | The full deep-link stack: prefixes, the 20 configured paths, cold-start ordering, `getInitialURL`. **STALE in one dimension: it predates the Playbook entirely** — its route table has no `Playbook`, `PlaybookDev` or `Courses` row. Everything it says about the other 20 paths still reads true against `linking.ts`. |
| `docs/ledger.md:117` | — | Indexes the audit above as the deep-link source of record. |
| `docs/ledger.md:316`, `:351`, `:440` | Oct 30 2026 | `PLAYBOOK-DEV-HARNESS` — the `__DEV__` deep link and its three gates. |
| `linking.ts:208-214` | — | The in-file instruction already quoted in §0.1: a release-time path must be gated on `playbookVisible`, not `__DEV__`. |

**There is no ledger item for "share a Playbook link".** No `PLAYBOOK-SHARE-*` id, no
`links-consistency` row, nothing in `## Planned`. The slice is named in a recon file and has
never been planned, scoped or ruled on.

---

## 7. The gaps, and the smallest change for each

Sizes are **this file's estimate, INFERRED.** "Store build" = a new binary through EAS, which
**every mobile row needs**, because there is no OTA (§0.5). Rows are independent unless noted.

| # | gap | smallest change | files | size | store build? |
|---|---|---|---|---|---|
| **P-1** | No push can say "read this card" | **The cheapest real win.** One `else if` beside the two that already work: a `playbook_card` type → `Main → HomeTab → Playbook` with `card: data.card_key`. The server side is a sender, not a schema change, **but who may push a whole team is a ruling, and the sender is SACRED-adjacent** | `AppNavigator.tsx` (1 branch) + a server sender | **S** mobile | yes |
| **D-1** | No deep-link path in a release build | Move the `Playbook` entry out of the `__DEV__` spread and gate it on **`playbookVisible`** — the instruction `linking.ts:100-109` already wrote. Gives `thryvyng://playbook` and `?card=` in a store build | `linking.ts` (~6 lines) | **S** | yes |
| **D-2** | A signed-out tap is reset to `Welcome`, destination dropped | Add `Playbook` to the 12-route allow-list **and** wrap the route the way `InvitationAuthWrapper` already does — `!user` → `Login` with `returnTo: 'Playbook'`, `returnParams: { card }`. The `returnTo` plumbing exists and works; this is its second caller | `AppNavigator.tsx` (allow-list) + 1 new wrapper (~45 lines, copy the existing one) | **S/M** | yes |
| **U-1** | `https://thryvyng.com/playbook` does not open the iOS app | Add `"/playbook"` + `"/playbook/*"` to the AASA `paths`. **WEB-ONLY, NO STORE BUILD** — `associatedDomains` is already domain-wide. **Useless without D-1**, or the app opens with no route to answer | `thrive-and-score/public/.well-known/apple-app-site-association` (2 lines) — **web repo, forbidden here** | **S** | **no** (web deploy) |
| **U-2** | Same on Android | Add a `/playbook` `pathPrefix` to the existing `intentFilters` data list (x2 hosts) | `app.json` — **forbidden here** | **S** | **yes** (native manifest) |
| **C-1** | A pasted in-app link leaves for the browser | `chat-links-check.md`'s own proposal: match `thryvyng://` in `URL_SPLIT`/`URL_TEST`, and in `openUrl()` send in-app hrefs to the navigator instead of `Linking.openURL`. **BLOCKED ON A RULING** — trust-the-pasted-link, still undecided since Oct 30 | `ChatBubble.tsx` (~15 lines) | **M** (small code, real product risk) | yes |
| **S-1** | Nothing produces the link | A share/copy affordance on the card — `Share.share()` with `https://thryvyng.com/playbook?card=<key>`. **Works the day it ships even with everything else unbuilt**, because the URL resolves on the web (§5). Mirror question: the reader is a REBUILD on mobile, the web has no share button either, so doing it web-first keeps the two honest | 1 mobile screen (~25 lines); optional web twin | **S** | yes |
| **W-1** | Sign-UP drops the destination | Give `SignUp.tsx` the `location.state.from` → `redirectTarget` block `SignIn.tsx:24-30` already has | `thrive-and-score/src/pages/SignUp.tsx` — **web repo, forbidden here** | **S** | no |
| **X-1** | Courses has no link at all | `Courses: 'courses'` nested under `Main → HomeTab`, same shape as D-1. Only worth doing in the same pass as D-1 | `linking.ts` (2 lines) | **S** | yes |
| **Z-1** | `deeplinks-audit.md` has no Playbook/Courses rows | Add them when D-1/X-1 land, so the audit stays the source of record | `docs/recon/deeplinks-audit.md` | **S** | no |

**The cheapest path to "a coach can share the book", in order:** **S-1 + U-1** gets a real,
tappable, sign-in-surviving link **today, on the web, with one web deploy and one small mobile
screen** — the link opens the site rather than the app, which may be good enough to ship.
Making it open the *app* is **D-1 + D-2 + U-1 + U-2**, one store build, and that is the point
at which C-1's undecided trust ruling has to be answered.

---

## 8. What this recon did NOT cover

* **Nothing was run.** No device, no simulator, no `uri-scheme` test, no `curl` of the AASA, no
  push sent. Every "works today" claim is read from source, and the exact dev links in §1 are
  **PROVEN as configured, not as tapped.**
* **The AASA's serving headers** — see §2's UNKNOWN. A correct file served with the wrong
  content type silently does nothing.
* **Email and SMS** as link channels, and whether any transactional template links the book.
* **Chat cards** — `PollCard`, `SurveyChatCard` and the attachment renderers were not read;
  `chat-links-check.md` flags the same hole.
* **Who may send a team-wide push** — named as a ruling in row P-1 and not investigated; the
  sender lives in the web repo / migrations, which were out of scope for edits.
* **Android verification state** — `autoVerify: true` is declared, but whether Play has
  actually verified the domain for the installed build is UNKNOWN from source.
