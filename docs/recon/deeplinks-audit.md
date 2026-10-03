# Deep Linking Audit — thryvyng-mobile

Read-only audit of the mobile deep-link stack. No source files were modified.

---

## 1. Linking Config

**File:** `src/navigation/linking.ts`

**Prefixes** (`linking.ts:79-83`)
- `thryvyng://` (custom scheme, matches `app.json:10` `scheme: "thryvyng"`)
- `https://thryvyng.com`
- `https://www.thryvyng.com`

**Configured screens** (`linking.ts:84-126`)

| Screen | Path pattern | Line |
|---|---|---|
| `JoinTeam` | `join-team/:slug/:code?` | `86-92` |
| `Support` | `support/:slug/:code?` | `93-99` |
| `JoinStaff` | `join-staff/:code` | `100` |
| `RegisterClub` | `register/club` | `101` |
| `RegisterTeam` | `register/team` | `102` |
| `RegisterCreator` | `register/creator` | `103` |
| `ProgramRegistration` | `register/program/:programId` | `104-109` |
| `AcceptCoParent` | `accept-coparent/:code` | `110` |
| `ClaimPlayer` | `claim-player/:code` | `111` |
| `Invitation` | `invitation/:token` | `112-115` |
| `Invitations` | `invitations` | `116` |
| `InvitationSuccess` | `invitation-success` | `117` |
| `InvitationCancel` | `invitation-cancel` | `118` |
| `Login` | `login` | `119` |
| `Dashboard` | `dashboard` | `120` |
| `CheckoutSuccess` | `checkout-success` | `121` |
| `ProductStore` | `store` | `122` |
| `ProductDetail` | `product/:productId` | `123` |
| `Cart` | `cart` | `124` |
| `NotFound` | `*` | `125` |

**Flagged: web routes missing from mobile linking config** — none of the five routes called out by the audit request are missing. All are present:
- `join-team` — present (`linking.ts:86`)
- `join-staff` — present (`linking.ts:100`)
- `claim-player` — present (`linking.ts:111`)
- `invitation` — present (`linking.ts:112`)
- `accept-coparent` — present (`linking.ts:110`)

**Notable observation:** the `JoinTeam` path requires a `:slug` segment (`join-team/:slug/:code?`). Any web-issued link of the form `https://thryvyng.com/join-team/CODE` (single segment) would parse `CODE` as `slug`, leaving `code` empty. `JoinTeamScreen.tsx:142` compensates: `const invitationCode = code || slug || ''`. Worth noting as a subtle contract between web URL shape and the mobile parser.

---

## 2. Cold Start URL Handling

**Files:** `App.tsx`, `src/navigation/AppNavigator.tsx`, `src/contexts/AuthContext.tsx`, `src/navigation/linking.ts`

- **No custom `getInitialURL`** is defined in `linking.ts` (see `linking.ts:82-128`). No `subscribe` function either. React Navigation therefore uses its built-in default, which calls `Linking.getInitialURL()` and `Linking.addEventListener('url', ...)` **only after `NavigationContainer` mounts** (`AppNavigator.tsx:963-972`).
- The **only** `Linking.getInitialURL()` call in the app is scoped to `ProgramRegistrationScreen.tsx:380` for handling Stripe redirect returns — it has no bearing on the initial launch URL.

**Mount ordering (cold start from a killed state):**
1. `App.tsx:54` renders `<AppContent />`, which reads `loading` from `useAuth()` (`App.tsx:21`).
2. `AppContent` always renders `<AppNavigator />` (`App.tsx:40`).
3. `AppNavigator` (default export at `AppNavigator.tsx:809`) reads `{ user, loading }` from auth.
4. **Gate:** `AppNavigator.tsx:953-960` — if `loading && !hasMountedNavRef.current`, it returns a plain `<View>` with a spinner. `NavigationContainer` is **not mounted** during this window.
5. `AuthContext.tsx:106-171` triggers `supabase.auth.getSession()` (`AuthContext.tsx:168`) and drives `loading` via `onAuthStateChange`. `loading` becomes `false` only after profile + roles + saved role ID resolve (`AuthContext.tsx:149`) — a `Promise.all` gated on a network round-trip.
6. Once `loading` flips to `false`, `NavigationContainer` mounts (`AppNavigator.tsx:963`), passes `linking` (`:965`), and React Navigation's default machinery reads `Linking.getInitialURL()`.
7. `hasMountedNavRef.current = true` in `onReady` (`AppNavigator.tsx:967-969`) so the spinner never returns on later `loading` toggles.

**Race analysis — is the URL dropped?**
- **No, it is not lost.** iOS and Android both persist the launching URL at the OS level; `Linking.getInitialURL()` returns it whenever it's called during the same process lifetime. The delay before `NavigationContainer` mounts does not clear it.
- **But the URL is only consumed after auth finishes**, meaning the user sees the loading spinner (`AppNavigator.tsx:955-957`) followed by a splash overlay (`App.tsx:41-48`, `SplashScreen isReady={!loading}`) for the entire duration of `supabase.auth.getSession()` plus profile/roles fetch. On slow networks this can be seconds — during which the deep link visually appears to do nothing.
- **Secondary concern — the post-auth reset effect:** `AppNavigator.tsx:817-876` fires when `loading` flips. It only resets to `Main`/`Welcome` when `currentRoute` is `Login` or `Welcome` (`:821`, `:853-868`). The mid-flow guard at `:823-831` protects only `activeFlow === 'join-team'`. Cold-start deep links to `JoinTeam`, `AcceptCoParent`, `ClaimPlayer`, `Invitation`, `Support`, `JoinStaff`, etc. are safe because `currentRoute` will already be that screen (in the allowlist at `:855-867` for the signed-out branch, and not `Login`/`Welcome` for the signed-in branch), so the reset never fires. No race for the initial URL.
- **`RootStackNavigator` initial route:** `AppNavigator.tsx:663-665` snapshots `user ? 'Main' : 'Welcome'` into a ref at first mount. React Navigation's linking parser overrides this when a URL is present, so the ref does not clobber a deep link.

**Summary:** the URL survives the auth wait, but there is a UX cost — a blank/splash for the duration of session hydration before the linked screen renders. No custom `getInitialURL` and no auth-priority handling exists.

---

## 3. App Config — iOS & Android

**File:** `app.json`

**iOS `associatedDomains`** (`app.json:19-22`)
- `applinks:thryvyng.com`
- `applinks:www.thryvyng.com`

Path selection on iOS is delegated to the AASA file hosted on `thryvyng.com`; the mobile app config does not enumerate paths for iOS. This audit cannot verify the AASA contents from the repo.

**Android `intentFilters`** (`app.json:40-86`) — single filter with `action="VIEW"`, `autoVerify: true`, categories `BROWSABLE` + `DEFAULT`, host `thryvyng.com` (only — `www.thryvyng.com` is not enumerated on Android).

`pathPrefix` entries:
- `/join-team` (`:47-49`)
- `/join-staff` (`:52-54`)
- `/register` (`:57-59`)
- `/accept-coparent` (`:62-64`)
- `/claim-player` (`:67-69`)
- `/invitation` (`:72-74`)
- `/invitations` (`:77-79`)

**Flagged issues:**

1. **`www.thryvyng.com` is NOT in Android intentFilters.** iOS lists both `thryvyng.com` and `www.thryvyng.com` in `associatedDomains` (`app.json:20-21`), but the Android intent filter has only `host: "thryvyng.com"` (`:47`, `:52`, etc.). Any `https://www.thryvyng.com/...` link will open in the browser on Android, not the app. Requires an additional filter (or a second `host` entry) if `www.` links are expected to universal-link.

2. **Web routes present in mobile `linking.ts` but NOT covered by Android `pathPrefix`:**
   - `/support/...` — configured in `linking.ts:93-99` but no matching Android intent filter. Android will not open Support links in-app.
   - `/login` — configured (`linking.ts:119`), no Android filter.
   - `/dashboard` — configured (`linking.ts:120`), no Android filter.
   - `/checkout-success` — configured (`linking.ts:121`), no Android filter.
   - `/store`, `/product/...`, `/cart` — all configured (`linking.ts:122-124`), no Android filters.
   - `/invitation-success`, `/invitation-cancel` — configured (`linking.ts:117-118`). **These do work by accident** because Android `pathPrefix` is a prefix match and `/invitation` (`:72-74`) covers `/invitation-success`, `/invitation-cancel`, and `/invitations` too. That's why `/invitations` (`:77-79`) is arguably redundant. This is a fragile coupling — renaming `/invitations` to something not starting with `/invitation` would silently break it.

3. **All five web routes explicitly named in the request are present** in Android filters: `/join-team`, `/join-staff`, `/claim-player`, `/invitation`, `/accept-coparent`. No gaps there.

4. **`autoVerify: true`** (`:43`) means Android requires a `.well-known/assetlinks.json` file on `thryvyng.com` matching this package + SHA-256 for App Links to open without the disambiguation chooser. This audit cannot verify the remote file.

---

## 4. Manual Code Entry

Two places allow a user to type or paste an invitation/team code:

### 4a. `WelcomeScreen` — primary entry point
**File:** `src/screens/WelcomeScreen.tsx`

- Trigger: tapping the "I have an invitation code" card (`WelcomeScreen.tsx:113-127`) opens a modal (`showCodeModal`, `:25`).
- Input: single `TextInput` (`:195-207`) with placeholder `"e.g., UPS-RV2RLR"`, `maxLength={20}`, auto-uppercased on change (`:199`).
- Validation flow: `validateAndRouteCode` (`:30-83`)
  1. Trims and uppercases (`:31`).
  2. Guards empty input (`:33-36`).
  3. Queries `teams` table filtering by `invitation_code` (`:44-48`). On hit → `navigation.navigate('JoinTeam', { code })` (`:54`).
  4. If not a team, queries `team_staff_invitations` by `code` (`:58-63`). On hit, checks `used_at` (`:65-68`) and either shows "already used" or navigates `navigation.navigate('JoinStaff', { code })` (`:72`).
  5. Otherwise sets error `"Invalid invitation code. Please check and try again."` (`:76`).
- **Only two code shapes recognized:** team `invitation_code` and staff `code`. There is no handling for co-parent, claim-player, or invitation-token codes typed manually — a user with one of those codes and no working link is stuck.

### 4b. `JoinTeamScreen` error-state retry
**File:** `src/screens/registration/JoinTeamScreen.tsx`

- Triggered when the deep-linked code fails validation (`screenState === 'invalid'` or `'expired'`), showing the error card (`JoinTeamScreen.tsx:1679-1711`).
- Input: `TextInput` at `:1690-1700`, placeholder `"e.g. 691-911-933"` (dashed numeric format), `keyboardType="number-pad"`, `maxLength={11}`, formatted through `formatTeamInviteInput` (`:118`, applied at `:1693`).
- Submit button "Try this code" (`:1701-1706`) re-calls `validateInvitationCode(manualInviteCode)` (`:344-`), which normalizes candidates (`:352 normalizeTeamInviteCandidates`) and re-runs the team lookup. Success stays on `JoinTeam` with the new team info; failure loops back to the same error card.
- Only handles team codes (no staff fallback), unlike `WelcomeScreen`.

### Everywhere else
Grepping for `TextInput` bound to a code/token field and for placeholders matching `code|invite|token` across `src/screens` (excluding discount code inputs) turns up only the two above. `JoinStaffScreen.tsx` has no `TextInput` at all — it's fully driven by the URL param. `AcceptCoParentScreen`, `ClaimPlayerScreen`, and the `invitation/*` screens likewise take the code/token exclusively from route params; there is no manual paste-in for those flows.

---

## 5. First-Launch Experience

**Fresh install, no persisted session, no launch URL:**

1. `App.tsx:38-51` mounts `SplashScreen` overlay with `isReady={!loading}` while `AuthContext` runs `supabase.auth.getSession()` (`AuthContext.tsx:168`). Because there is no session, `loading` flips to `false` fairly quickly (`AuthContext.tsx:158-163`).
2. `AppNavigator.tsx:953-960` releases the spinner; `NavigationContainer` mounts (`:963`).
3. `RootStackNavigator.initialRouteName` evaluates to `'Welcome'` (`AppNavigator.tsx:665`, since `user` is null).
4. `SplashScreen` fades out (`App.tsx:26-36`) and the user lands on `WelcomeScreen`.

**What the user sees on `WelcomeScreen`:**
- Logo + tagline (`WelcomeScreen.tsx:93-97`).
- Primary CTA: **"Sign In"** (`:100-105`).
- Divider labelled **"New to Thryvyng?"** (`:107-111`).
- Option card **"I have an invitation code — Join a team as player or staff"** (`:113-127`) — this is the prompt asking about a team/invitation code. Tapping opens the modal described in §4a.
- Option card **"Register a Team — I'm a coach or team manager"** (`:129-143`).
- Option card **"For Club Owners — Partner with Thryvyng"** (`:145-157`).
- Footer with ToS/Privacy line (`:160-164`).

**Answer to the specific prompt question:** yes, there is an explicit prompt asking whether the user has a code — the second option card and the modal it opens. It's not modal on top of the Welcome screen at first render (i.e., the user is not auto-asked); it's discoverable but requires a tap. The label "I have an invitation code" is the surface area that guides a code-holder to the manual entry flow.

---

## Cross-cutting findings (summary)

1. **Android `www.` host missing** — iOS covers `www.thryvyng.com` (`app.json:21`) but Android does not. Add a `host: "www.thryvyng.com"` variant to every intent-filter data block, or add a second filter, to keep parity.
2. **Android `/support` missing** — configured in `linking.ts:93-99` and produced by `SupportScreen.tsx:12`, but no Android `pathPrefix` covers it. Support links will not universal-link on Android.
3. **`/invitations` filter is redundant** (`app.json:77-79`) — the `/invitation` prefix already covers it. Leaving the redundancy is fine, but note that removing `/invitation` alone would silently break `/invitations`, `/invitation-success`, and `/invitation-cancel` deep links on Android.
4. **No auth-priority URL handling** — `NavigationContainer` mounts only after `AuthContext` finishes hydrating (`AppNavigator.tsx:953-960` gated on `loading`). The URL survives, but the user waits through session + profile + roles fetch before the deep-linked screen renders. Consider passing a custom `getInitialURL` on the `linking` option to unblock UX or rendering the target screen with a lightweight skeleton before auth completes.
5. **Manual entry covers only team + staff codes** — `WelcomeScreen.tsx:30-83` recognizes those two shapes; users holding a co-parent, claim-player, or invitation token have no fallback if their link fails to open in-app.
