# Round 1 results — 1.0.20, iOS simulator, Nov 3–4 2026

**Run:** Lu, **2026-11-03 23:40 → 2026-11-04 00:24** (~44 min).
**Device:** iOS simulator, **dev client `com.thryvyng.app`** on **live Metro**.
**Signed in as:** `ludriv@hotmail.com` — **club admin / director, Provo Athletic Club**.
**Source of every result below:** that run's screenshots and Metro log, pasted into the planning
room. **No database was queried to write this file.**
**Plan this run executed:** `docs/recon/test-plan-1.0.20-nov03.md`, Groups 1A, 3, 4 and 5a.

> **🛑 NOTHING WAS SENT. "Send announcement" was never tapped.** The run stopped at the Send
> button every time, deliberately. **~231 PAC families received no push from this run.**

**Tags.** `PASS` = seen on screen and screenshotted. `INFERRED PASS` = Lu reports it looked
right, but the specific detail the plan asked for was not captured. `NOT RUN` = attempted and
abandoned, with the reason. `PROVEN` = in the Metro log.

---

## 1. The headline

**The club-announcements feature works end to end up to the Send button, and the server is
live.** Nine of the ten things Group 1A asks for passed on the first attempt, including every
one of the refusal and ceiling cases. The Foundations content batch 2 added is on screen and
drawing.

**Two things are broken, one of them in a way a user will hit immediately** (the reactions sheet
does not scroll), and **four design calls came out of the run** (D1–D4). All are recorded in §4
and ruled in `docs/ledger.md` → `RELEASE-1.0.20-FIXES`.

**One thing could not be tested at all:** push **tap routing**. Delivery is proven; the tap
never got a banner to tap. Moved to Round 3 on a real phone. See §3.

---

## 2. PASS — seen on screen

### 2a. Club-Wide Message → compose (plan Groups 1A A4–A5, and all of Group 3)

| result | detail |
|---|---|
| **PASS** | **Club-Wide Message opens "New announcement".** The words **"broadcast"** and **"Contact admin"** appear nowhere. ← this is `CLUB-WIDE-FIX` confirmed on a screen for the first time; the button had been failing 100% of the time because it asked for `channel_type = 'broadcast'`, which the live CHECK does not allow |
| **PASS** | the audience line reads **"Goes to everyone in Provo Athletic Club announcements"** and **shows in full** — not truncated, not clipped |

**Group 3 of the plan is this same door.** It is PASSED and is merged into 1A; it does not need
a separate run again.

### 2b. Compose — every ceiling and every refusal (plan 1A A6–A12)

| result | detail |
|---|---|
| **PASS** | the **Title stops at 80/80** — the counter reads the cap and the field accepts nothing further |
| **PASS** | an **empty title** with a message typed shows the red **"Add a title: it's what families see on the card."** and **Send is greyed**. ← the title-required rule from `a73ec11`, on screen |
| **PASS** | a **bad card key `F3/../F4`** shows red **"Letters, numbers, _ and - only, up to 16 characters"**, the form says **"One button still needs its text or its card key."**, and **Send is greyed**. ← the step the plan called "the one that matters most on this screen" |
| **PASS** | a **good key `F3`** is accepted and **Send becomes active** |
| **PASS** | **the 3-button cap hides the chips** — after the third button the ＋ Playbook / ＋ Playbook card / ＋ Courses chips are gone |
| **PASS** | the **back arrow leaves the screen with nothing sent** |

**All six client-side guards hold.** Every one of them was previously proven only by the logic
smoke against a stub; this is the first time a human has seen them refuse.

### 2c. The feed and the detail screen (plan 1A A2, and Group 1B B1–B7)

| result | detail |
|---|---|
| **PASS** | the row opens **a feed of cards**, not chat bubbles |
| **PASS** | the header reads **"club-announcements / Provo Athletic Club"** — the channel name over the club name |
| **PASS** | the **All / New** filter chips are present |
| **PASS** | the **EARLIER** grouping heading is present |
| **PASS** | **the card detail has no reply box** — the ruling's central promise (reactions only, no replies) |
| **PASS** | **long-press on a reaction chip opens the who-reacted list** |

> **This supersedes the plan's A2.** The plan expected **"Announcements are being set up"**
> because the server side was unapplied when it was written. **The server went live Nov 3
> 13:33**, so A2 now shows the cards. The plan has been corrected.

### 2d. Batch 2 Foundations content (plan Group 5a)

| result | detail |
|---|---|
| **PASS** | Foundations shows a new section **LINES OF THE PASS** with **6 cards** |
| **PASS** | **cards 2–6 are `F7`–`F11`** — the five batch 2 inserted |
| **PASS** | the card badge reads **"F10 · Card 5 of 6"** on **4v2 The diamond** — so the key, the position and the section count all render |
| **PASS** | **all 6 cards draw a diagram. None shows "Diagram pending."** ← the plan's 5a steps 2–3, clean |

**This closes the question the previous plan draft got wrong.** `F7`–`F11` are real, published,
and visible in the mobile reader — exactly as the corrected §0.2 predicted from the apply SQL.

---

## 3. INFERRED PASS and NOT RUN

### 3a. `FM5v5` — INFERRED PASS, and the one question the plan asked was not captured

**Lu's report: "looks ok."**

**What the plan asked for, and did not get.** Group 5b carries a warning with **three possible
outcomes**, because batch 2 wrote the `FM5v5` diagram block but deliberately left the card row
alone: a **tabbed board** (done), a **formation panel**, or **"Diagram pending"** (one DB row
still needs changing). **Which of the three appeared was not captured, after two asks.**

**So this is recorded as INFERRED PASS, not PASS.** "Looks ok" rules out the dashed
"Diagram pending" panel with reasonable confidence — it does not look ok — but it does not
distinguish a tabbed 5-frame board from a formation panel, and that distinction is the whole
point of the check. **Re-check in Round 3, on the phone:** count the tabs. Five tabs = done.

Related: **D4** below — Lu's separate call that the FM5v5 diagram is "good enough for now".

### 3b. Push — delivery PROVEN, tap routing NOT RUN

| part | state | evidence |
|---|---|---|
| **delivery** | **PROVEN** | Metro log, **twice**: `[Notifications] Received … New in the Playbook`, app **in the foreground** |
| **tap routing** | **NOT RUN** | **no banner appeared in 3 tries.** Stopped under the two-strike rule rather than improvising |

**Why there was no banner is almost certainly the deprecation warning in §4b** — the handler asks
for `shouldShowAlert`, which this SDK no longer honours, so the notification is received and
never presented. Receipt without presentation is exactly the symptom. **INFERRED, not proven.**

**Moved to Round 3: real phone, real chat push.** The simulator could not produce a tappable
banner, and `simctl push` only delivers — the routing under test runs on the *tap*, so there was
nothing to test. Two further obstacles found while trying, both now in the plan:

* **The simulator has TWO dev clients installed** — `com.thryvyng.app` (Lu's usual, an older
  install) and `com.weolkn.thryvyng` (what `app.json` declares). **A push must name the bundle id
  of the app actually running**, or it is delivered to the other one and nothing happens.
* **Backgrounding:** use the simulator menu **Device → Home**. `Cmd-Shift-H` only works when the
  simulator window has focus, which it often did not.

---

## 4. Findings

All five are ruled in `docs/ledger.md` → **`RELEASE-1.0.20-FIXES`** (Lu, 2026-11-04 00:25).

### 4a. BROKEN FLOW — the announcement Reactions sheet does not scroll

**14 reactors, and the list is cut off with no way to reach the rest.** A user hits this the
first time an announcement gets more reactions than fit one screen — which, on a feed that
reaches ~231 families, is the normal case rather than the edge case.
**Ruled IN 1.0.20, ROUTINE.**

### 4b. BROKEN FLOW, INFERRED — no banner while the app is open

**Metro WARN on each receipt:**

```
`shouldShowAlert` is deprecated. Specify `shouldShowBanner` and / or `shouldShowList` instead.
```

The notification **arrives** (§3b) and is **never presented**. **INFERRED** that the deprecated
key is the cause — the warning and the symptom match exactly, but nothing was changed to prove
it. **This is also why §3b could not be run**, so fixing it unblocks the Round 3 push test.
**Ruled IN 1.0.20, ROUTINE.**

### 4c. D1 — the card footer runs together and clips

**On screen:** `LUDWIG SZ. · PROVO ATHLETIC CLUBCARD 11 / 12`

The club name and the card counter collide with no separator, and the line clips.
**Lu's ruling:** the **author goes on its own line below, in a different font style, on every
card.** **IN 1.0.20, ROUTINE.**

### 4d. D2 — diagram lines are too thick

Lu wants them **thinner, cleaner, professional**. **The renderer is mirrored with web**
(`src/features/pac-playbook/MIRROR.md`), so **the change is made on web first and mirrored
across** — not edited here, or the mirror breaks.
**IN 1.0.20, ROUTINE, with Lu seeing before/after.**

### 4e. D3 — "The whole team · natural triangles" is too busy

**Keep** the light-to-dark green shape movement. **Add** width in possession. This is **content**
(a `playbook_blocks` row), so it needs a content change and a dry run.
**AFTER 1.0.20.**

### 4f. D4 — the `FM5v5` diagram

**"Good enough for now."** Improve later. **AFTER 1.0.20.**

### 4g. Suggestions, not defects

| # | what | ruled |
|---|---|---|
| S1 | **no "discard?" prompt** when leaving a filled announcement form — the back arrow throws the draft away silently (§2b confirmed it leaves with nothing sent, which is correct; the missing warning is the gap) | **IN 1.0.20, ROUTINE** |
| S2 | the channel shows its **raw slug `club-announcements`** as a display name | **AFTER 1.0.20 — needs a Lu ruling** on what it should read |
| S3 | **no-name accounts render as "Member" / "Grayson's parent"** (seen on a Team Manager) | **AFTER 1.0.20** |

---

## 5. What Round 1 did NOT cover

* **Any send.** No announcement was posted; `Send announcement` was never tapped.
* **Push tap routing** (§3b) — Round 3, real phone.
* **`FM5v5`'s three-way question** (§3a) — Round 3, count the tabs.
* **Group 2, survey share** — not attempted this run.
* **Group 6b, the keeper board** — needs a dev client on a phone; the panel has no published card.
* **Group 7, the staff drill-down** — needs the director's four-level tree walked; not attempted.
* **Group 9, the 12 Playbook looks** — items 2, 3, 4, 5, 12 and 13 all need a non-admin login
  (coach, manager, parent). **Round 1 ran as club admin only**, so none of them were reachable.
* **The non-staff feed case** — no ✎ button, no route to compose. Same reason.

---

## 6. Round 3 shortlist, in the order it should run

1. **Fix 4b first, then re-run the push test** — it is a blocker for the test, not just a defect.
2. **`FM5v5`: count the tabs** (§3a).
3. **Push tap routing on a real phone, real chat push**, from all three app states.
4. **The reactions sheet** after 4a is fixed, with more reactors than fit a screen.
5. **The non-admin logins** — coach `ludwig.snchz+zztest6@gmail.com` and parent
   `ludwig.snchz+zztest7@gmail.com` — which unlock most of Group 9 and ruling **R2**
   (a team_manager must see **Team progress** and **no Questions row**).
