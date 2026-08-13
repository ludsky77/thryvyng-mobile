# Thryvyng Link Routing Policy

This document is the source of truth for whether a given `thryvyng.com` URL opens in the mobile app or stays in the browser. Every link produced by our web app, mobile app, backend, or email templates must fit into one of the two groups below.

## Group A — App links (claimed by mobile deep linking)

These paths open in the Thryvyng mobile app when installed, and fall back to the web app when not installed.

- `/join-team`
- `/join-staff`
- `/claim-player`
- `/accept-coparent`
- `/invitation`

**Rule:** parents, players, and staff onboarding links open the app when installed, fall back to web when not. The app is the preferred experience for these flows because the user is joining or claiming a role that they will use primarily from the app.

**Where Group A is wired up (must stay in sync):**
- `app.json` → `expo.android.intentFilters[].data[]` — one `pathPrefix` per route, for both `thryvyng.com` and `www.thryvyng.com` hosts.
- `app.json` → `expo.ios.associatedDomains` — `applinks:thryvyng.com` and `applinks:www.thryvyng.com` (iOS defers per-path selection to the AASA file hosted on the domain).
- `src/navigation/linking.ts` → `config.screens.*` — one entry per screen with the matching `path`.

## Group B — Web-only links (NEVER claimed by the app)

These paths always open in the browser. The mobile linking config and Android intent filters must NOT list them.

- Fundraiser and store purchases (product store, cart, checkout)
- Program registration and Stripe checkout (`success_url`, `cancel_url`, checkout session URLs)
- Course purchases (any Stripe-backed course flow)
- Email links: receipts, password resets, payment reminders, marketing
- Any `success_url` / `cancel_url` returning from Stripe

**Rule:** anything involving Stripe checkout or web-only features stays in the browser. Intercepting a Stripe success/cancel URL into the app breaks the checkout return contract and leaves users stranded mid-payment. Email links must render outside the app so recipients can complete the action even if the app is not installed.

## Rule for new links

Any new link type must be classified into **Group A** or **Group B** in this document **before implementation**.

**Group A additions require updating ALL THREE together, in the same change:**
1. `app.json` → `android.intentFilters` — add the `pathPrefix` for both `thryvyng.com` and `www.thryvyng.com` hosts.
2. `app.json` → `ios.associatedDomains` — verify the domain is already listed (it currently covers both hosts); ensure the AASA file on the web side lists the new path.
3. `src/navigation/linking.ts` → `config.screens` — add the matching screen entry.

Skipping any of the three yields a broken deep link on one platform or a route that opens the browser instead of the app. Failing to update all three counts as an incomplete change.

**Group B additions require nothing here** beyond adding the classification above so future maintainers see the intent. Do not add Group B paths to `linking.ts` or to Android intent filters.

## Current known gap (parked)

Android `intentFilters` in `app.json` list `pathPrefix: "/invitation"`, which by prefix-match also claims `/invitations`, `/invitation-success`, and `/invitation-cancel`. Two of those (`/invitation-success`, `/invitation-cancel`) currently exist in `src/navigation/linking.ts` but should be Group B (Stripe-return-adjacent) or removed from the linking config; `/invitations` is a legitimate Group A candidate but is not explicitly listed here yet. Tighten this by:
- moving `/invitation` to a more specific pattern (e.g. `pathPattern` with a trailing segment) so it stops matching siblings,
- or explicitly listing every intended sub-route in Android intent filters and this policy.

Do not depend on the current accidental prefix behavior when adding new `/invitation*` paths.
