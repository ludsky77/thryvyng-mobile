# RELEASE-1.0.20-FIXES — what was built, and how Lu sees each one

**Built 2026-11-04.** Scope: the mobile ledger entry **`RELEASE-1.0.20-FIXES`** plus the new
rulings **R-01** (announcements chat name + icon) and **R-04** (§13 — the old brain games are
hidden and an arcade "coming soon" tile stands in their place).
**Status of every row below: `built, unverified by Lu`** — nothing here has been seen on a
simulator or a phone by a human. **This file is the Round 2 test list.**

**Gates, all run after the last edit** (full output in the task's EVIDENCE block):
`npx tsc --noEmit` → **0 errors** (baseline was 5) · `ESLINT_USE_FLAT_CONFIG=false npx eslint`
on all 23 changed files → **0 errors, 234 warnings** (pre-existing classes) ·
`npx expo export --platform ios` → **exit 0**, iOS bundle 9.51 MB ·
`diff` of the three mirrored `diagram/` files web↔mobile → **no differences**.

**No database was queried to write this file.** Every claim is from source, from a migration,
from an apply SQL, or from `docs/recon/test-results-1.0.20-round1-nov04.md`.

---

## 0. The three test accounts these rows need

| role needed | account | why |
|---|---|---|
| **club admin / director, PAC** | `ludriv@hotmail.com` | items 1, 2, 3, 6 — the only role with the ✎ compose door and an announcements feed with reactions; and **13d** (a dashboard that must show NO arcade tile) |
| **coach** | `ludwig.snchz+zztest6@gmail.com` | item 1's non-staff view of the announcements row (name + megaphone, no ✎); and **13c / 13e** (the coach's arcade tile and the Team XP surfaces) |
| **parent** | `ludwig.snchz+zztest7@gmail.com` | items 4, 5 (the Playbook reader is reachable for every role), item 1 as a family sees it, **13a / 13b / 13e**, and **§10's one INFERRED check** — the Responses bar's roster total as a parent |
| **a player-role account** | *none known* | **No longer needed for Round 2.** It was item 8's only, and **R-04 (§13) hides the games**, so §8 is MOOT and dropped. Recorded here because it is still true: no test player account is written down anywhere in `docs/`, and the brain games save against `currentRole.entity_id`. |

---

## 1. R-01 · The announcements chat is called "PAC Announcements"

**What changed.** Families were reading the raw database slug `club-announcements`. One
function now decides the name on every surface, and a hand-drawn megaphone takes the round
badge spot instead of the ⚽ / the club crest.

| | |
|---|---|
| **the name rule** | `clubShortName()` + `announcementsChatName()` in `src/lib/clubAnnouncements.ts`. A club name of **14 characters or fewer is shown whole**; longer, and it becomes the **initials** of its significant words (skipping *of/the/and/de/del/la/las/los/el/y*). "Provo Athletic Club" (19) → **PAC** → **"PAC Announcements"**. "Thryvyng FC" (11) → **"Thryvyng FC Announcements"**. No club name at all → the bare word **"Announcements"**, never the slug. |
| **why a rule and not a column** | There is **no `short_name` on `clubs`** — mobile reads `id, name, logo_url, payment_terms_text` and nothing else (grep, 2026-11-04). The 14-character line is a **JUDGEMENT, not a measurement**, chosen so PAC initials and "Thryvyng FC" does not become "TF". **Lu may want a different line; it is one constant, `SHOW_WHOLE_UP_TO`.** |
| **which chat** | Identified by the **ROW** — `channel_type = 'club' AND is_default = true`, `isAnnouncementsChannel()` — exactly as `isDefaultClubChannel` and the leave gate already do. **Never by the name.** `coaches-lounge` is private and not default, so it can never be matched. |
| **DISPLAY ONLY** | No data write. The row keeps its `name`; the channel is still chosen by id; rename in Chat info still edits the real `name` (and a club chat cannot be renamed there anyway). |
| **the icon** | `src/components/chat/MegaphoneIcon.tsx` (**new**) — a 24×24 inline SVG, three stroke-only paths (cone, grip, one sound arc), round caps, `color` from the caller. **`react-native-svg` 15.12.1 was already in `package.json`** and already used by the lineup and training boards: **no new dependency.** Not an emoji, because an emoji cannot be tinted to the row's channel colour and changes between iOS versions. |

**Files:** `src/lib/clubAnnouncements.ts` · `src/components/chat/MegaphoneIcon.tsx` (new) ·
`src/screens/ChatScreen.tsx` · `src/screens/AnnouncementsFeedScreen.tsx` ·
`src/screens/TeamChatRoomScreen.tsx` · `src/screens/ChatInfoScreen.tsx`

### How Lu sees it — FOUR surfaces, as club admin

| # | screen and taps | what should be on screen |
|---|---|---|
| 1a | **Chat tab** → look at the announcements row in the list | Line 1 reads **"PAC Announcements"**, not `club-announcements`. The round badge on the left is a **line-drawn megaphone on the tan circle (#C4976D)** — **not** a ⚽ and **not** the PAC crest. Line 3 still reads "Provo Athletic Club". |
| 1b | tap that row → the **feed** header | Title **"PAC Announcements"** with the **megaphone in an 18pt tan circle to its left**; the second line still reads "Provo Athletic Club". |
| 1c | **the chat-room fallback** — hard to reach on purpose. Tap the announcements row **in the first instant after the Chat tab finishes loading**, before the `is_default` read lands; or send a club-chat push **without** `announcement: true` and tap it | Opens `TeamChatRoom` (bubbles). Its header should also read **"PAC Announcements"** over "Provo Athletic Club", with the megaphone where a team chat shows its crest. **If this one still says `club-announcements`, say so — it is the surface with the least certainty.** |
| 1d | from 1c, **⋮ → Chat info** | The big channel name reads **"PAC Announcements"**. |

**Also check, as coach and as parent:** 1a and 1b read the same, and there is **no ✎** in the
feed header.

### ⚠️ THE PUSH TITLE IS SERVER-SIDE AND WAS NOT TOUCHED

A push for an announcement still arrives titled **`club-announcements`** — lower case and
hyphenated. It is built by **`chatContextName` in the Supabase edge function**, which lives in
neither this repo nor the app bundle. Recorded already at
`docs/recon/club-announcements-v1-mobile.md:457-460`: *"a one-arm change in `chatContextName`
in the edge function, no store build… Not in this repo."* **So R-01 is complete for every
in-app surface and the notification title is a separate, cheap, non-mobile change.** Expect
the mismatch on the Round 3 push test and do not read it as R-01 failing.

---

## 2. The Reactions sheet scrolls

**What changed — two things, and the first is the real bug.** The dismiss backdrop used to be
a full-screen `TouchableOpacity` **wrapping** the sheet, and the sheet blocked taps from
reaching it with `onStartShouldSetResponder={() => true}`. That claims the touch responder on
touch-down, **before the list's scroll view can**, so a drag inside the list went nowhere. The
backdrop is now an **absolutely-positioned `Pressable` sibling**. Second, the `FlatList` got
`flexShrink: 1`: inside a box bounded only by `maxHeight`, a list with no flex lays itself out
at full content height and the parent clips it, so it never believes it has anything to scroll.

**File:** `src/components/chat/ReactionDetailsModal.tsx`

| screen and taps | what should happen |
|---|---|
| **Chat → PAC Announcements → open any announcement with many reactors → long-press a reaction chip** | The "Reactions" sheet opens. **Drag up inside the list: it scrolls, and every one of the 14 reactors can be reached.** Tapping the dimmed area above the sheet still closes it, and so does the ✕. |

**Needs an announcement with more reactors than fit ~60% of the screen** — Round 1 had one with
14.

---

## 3. Foreground banner — the deprecation WARN is gone

**What changed.** `shouldShowAlert` is **removed** from both branches of the notification
handler. `shouldShowBanner` + `shouldShowList` — the current API — were **already there and
already correct**; sending the deprecated key alongside them is what logged
`` `shouldShowAlert` is deprecated… `` on every receipt.

**File:** `src/services/notifications.ts`

> **BE CLEAR ABOUT WHAT THIS DOES AND DOES NOT FIX.** It removes the **warning**. It is
> **unlikely to be why no banner appeared** — see item 12 below and the corrected ledger line.
> The two new keys were being honoured the whole time.

| screen and taps | what should happen |
|---|---|
| App open on Home, send a push to the **bundle id of the dev client actually running** (`com.thryvyng.app` on Lu's simulator, **not** `com.weolkn.thryvyng` from `app.json`) | Metro logs `[Notifications] Received …` with **no `shouldShowAlert is deprecated` WARN under it**. Whether a banner appears is the Round 3 question, not this one. |
| Open the announcements feed, then push for **that same channel** | **No banner and no sound** (the message is already on screen), but the tab badge still updates. That branch is unchanged. |

---

## 4. D1 · The card footer is two lines

**What changed.** The footer was one row — `[dot + whole credit] … [Card n / N]` — and on a
phone it collided: `LUDWIG SZ. · PROVO ATHLETIC CLUBCARD 11 / 12`. The book's credit
(`meta.author`, one string "Ludwig Sz. · Provo Athletic Club") is now **split at the first
`" · "`**: the **club** rides with the card count on line 1, the **author's name** gets line 2.
A credit with **no `" · "` is all name**, and the club half is empty.

Mirrors web `playbook.css` `.auth` / `.auth-row` / `.auth-by` and the web `CardScreen.tsx`
markup; values from `thrive-and-score/docs/recon/d2-strokes.md` §D1. `splitByline()` is the
web's function verbatim.

| | line 1 | line 2 |
|---|---|---|
| content | tan dot · **club**, then **Card n / N** hard right | the **author's name** |
| type | 700 · 12.5pt · UPPERCASE · `capsWide` tracking · `mute` | **italic · 500 · 11.5pt · sentence case** · `ls.button` tracking · `lh.compact` · **`dim` #8690a0**, indented **18pt** so it lines up under the club text (10pt dot + 8pt margin) |
| wrapping | club **wraps and never clips** (`flexShrink: 1` on BOTH the wrapper and the text — RN gives a flex child `flexShrink: 0` where the web gives it 1); **the count never breaks** (`flexShrink: 0`) | — |

**The italic is a real font face, not a slant.** Archivo ships here as separate files and
`fontStyle: 'italic'` over `Archivo_500Medium` gets a synthetic oblique on Android and nothing
at all on iOS. So **a fifth face is registered**, `Archivo_500Medium_Italic`, from the
`@expo-google-fonts/archivo` package **already installed** — one more subpath import, ~0.1 MB,
**no new dependency**. It is the book's only italic.

**Files:** `src/features/pac-playbook/screens/CardScreen.tsx` ·
`src/features/pac-playbook/styles.ts` · `src/features/pac-playbook/theme.ts` (the
`mediumItalic` face name) · `src/features/pac-playbook/font.ts` (registers it)

| screen and taps | what should be on screen |
|---|---|
| **Home → Courses → the PAC Playbook featured card → Foundations → any card**, scroll to the bottom | Line 1: tan dot, **PROVO ATHLETIC CLUB** in caps, and **Card 11 / 12** hard right, **not touching it**. Line 2 under it: *Ludwig Sz.* in **italic, sentence case, smaller and greyer**, starting under the "P" of PROVO. |
| the **same card with the app in Spanish** | Line 1 wraps the club onto two lines; **"Tarjeta 12 / 12" stays whole on the first line and is not clipped.** |
| a card in **a different chapter** (Principles, etc.) | Same two lines — it is every card's footer, not Foundations' only. |

---

## 5. D2 · Thinner diagram lines — mirrored byte for byte

**What changed, and how.** The renderer is a **mirror** of web
(`src/features/pac-playbook/MIRROR.md`), so nothing was designed here. Three files were copied
from `thrive-and-score` @ **`e222074`** and are **byte-identical** (`diff -q` silent, md5
match):

| file | state |
|---|---|
| `diagram/strokes.ts` | **NEW on mobile.** Every stroke width the renderer draws, in one place. |
| `diagram/renderDiagram.ts` | re-mirrored — all width literals now read from `strokes.ts` |
| `diagram/geometry.ts` | re-mirrored — `head()` takes the **drawn** width and sizes the head from `headSize()` |

`MIRROR.md` is updated: provenance `b31b922` → `e222074`, `strokes.ts` added as the **ninth**
mirrored file, and the manifest's own drift command extended to include it. **That command was
run and passes** — silence from the nine, exactly one declared `doodleArt.ts` hunk, data file
identical.

**The numbers** (full table, old values and every use site:
`thrive-and-score/docs/recon/d2-strokes.md`):

* **lines**: drawn width = `max(0.24, stored_weight × 0.6)`. **Content is NOT edited** — it
  stores its own weights (run 0.7, pass 0.8, emphasis 1.2/1.4, F11 triangles 0.3–0.6) and the
  renderer thins all of them, so emphasis keeps its proportion. The 0.24 floor is what keeps
  F11's ghost lines (0.3 → 0.18) visible.
* **arrowheads**: length `1.5 + drawn_width × 1.25` (was `2.2 + stored × 0.6`), and the shaft
  now stops **half a head short of the tip** so its round cap hides inside the triangle instead
  of poking a blunt nub past it.
* **field**: lines `0.5 → 0.3`, touchline `0.6 → 0.36`, goal mouth `1.4 → 0.9`.
* **marks**: player `0.7 → 0.5`, ball `0.5 → 0.35`, waypoints `0.5 → 0.35`, ring `0.7 → 0.45`,
  badge `0.7 → 0.5`, box `0.6 → 0.4`, xmark `0.9 → 0.6`, cue `0.6 → 0.4`.
* **unchanged on purpose**: dash patterns, colours, opacities, all geometry, and every
  tap-target calculation — `tapTarget()` is untouched, so **the quiz still grades the same as
  the server**.
* `crispEdges` rides along in the mirrored source and **react-native-svg ignores it** (harmless
  — it is a browser pixel-snapping hint).

| screen and taps | what should be on screen |
|---|---|
| **Courses → PAC Playbook → Foundations → LINES OF THE PASS**, step through all 6 cards (`F7`–`F11` are cards 2–6) | Every diagram draws. Lines are **noticeably thinner and cleaner**; arrowheads are **sharp at the tip with no blunt nub** behind them; pitch markings are fainter than the players' lines. **Nothing has vanished** — the F11 ghost triangles are still visible, just faint. |
| **a `full-pitch` card and the `FM5v5` futsal card** | Outline, halfway line, circle, boxes and goal mouths all thinner; the goal mouth is still clearly the heaviest line on the board. **On `FM5v5`, count the tabs — five = the tabbed board** (this is Round 1's §3a question, still owed). |
| **a quiz with a tap target** | Tap where you did before. **Right answers are still right** — if a tap you know is correct is now graded wrong, stop and report: that would mean geometry drifted, which this change was not supposed to touch. |

---

## 6. Discard prompt on the compose form

**What changed.** Leaving a filled "New announcement" threw the draft away with nothing said.
The **leave itself was always correct** and Round 1 confirmed nothing is sent; the missing
**warning** was the gap. Same shape as the one this repo already has on
`SurveyResponseScreen.handleBack` — `Alert`, "Keep writing" as the cancel, destructive
"Discard" second — so the two screens cannot ask one question two ways.

**Dirty** = a title, a body **or** a drafted button. An untouched form, and a form whose
message has already been sent, leave without a word. Both the arrow **and** the swipe /
hardware back are covered: the arrow directly, the other two through React Navigation's
`beforeRemove`.

**File:** `src/screens/ComposeAnnouncementScreen.tsx`

| # | screen and taps | what should happen |
|---|---|---|
| 6a | **Chat → PAC Announcements → ✎** → type **nothing** → back arrow | Leaves **immediately, no prompt.** |
| 6b | ✎ → type a title → **back arrow** | **"Discard this announcement?"** / "What you have written will not be saved, and nothing is sent." → **Keep writing** returns to the form **with the text still there**; **Discard** leaves. |
| 6c | ✎ → type a body only, or add one ＋ Playbook button only → back arrow | Same prompt. Any one of the three is enough. |
| 6d | ✎ → type a title → **swipe from the left edge** to go back | **Same prompt.** Cancelling leaves you on the form. |
| 6e | ✎ → fill it → **Send announcement** → it posts | Lands on the feed with **no prompt** — the message is sent, there is nothing to discard. **⚠️ This one sends a real push to ~231 PAC families. Do not run 6e until Lu wants to send.** |

---

## 7. The 5 games `tsc` errors → 0

**Baseline was 5, all in the games; it is now 0.** Two of the three were real defects, not just
type noise.

| file | error | fix | was it a real bug? |
|---|---|---|---|
| `AnticipationArenaGame.tsx:283` | TS2448 + TS2454 — `getEffectiveLanding` read before its declaration | **declaration hoisted** above `handlePrediction`, body byte-for-byte unchanged (deps `[]`) | **No.** It is only ever read inside callbacks that run after first render. |
| `DribbleRushGame.tsx:712-713` | TS2304 ×2 — `getGutterBoundaryX` **did not exist** | **added** beside `getLaneX`, using that function's own arithmetic (same `getFieldWidthAtY`, same taper, same centring). `getLaneX(-1)` gives the gutter's MIDDLE; this gives its inner EDGE, which is what a boundary line wants | **No, and this answers the ledger's "UNKNOWN if reachable in prod":** the only caller is `PerspectiveField`, which is **declared in that file and rendered nowhere** (grep: one hit, the declaration). The `ReferenceError` was unreachable. |
| `PatternPlayGame.tsx:427` | TS2322 — `onPress={startRound}` handed the `GestureResponderEvent` to `startRound(effectiveRound?: number)` | `onPress={() => startRound()}` | **YES — a live defect.** The event object became `roundForThisGame`, so `roundForThisGame === 1` was false on round 1 and **`startTimeRef.current` was never stamped**, and `showPattern`'s `roundForRetention === 2` dim check could never fire either. |

| screen and taps | what should happen |
|---|---|
| **Player dashboard → Games → Pattern Play → pick a level → Start Game** | The countdown runs, the pattern plays, and the results screen shows a **sane elapsed time** rather than a nonsense one. **This is the only one of the three with anything to look at**; the other two are unreachable or inert. |

---

## 8. Games silent save — ⚠️ MOOT after R-04 (§13). The fix is KEPT, not reverted


> **DROP THIS FROM THE ROUND 2 LIST.** Ruling **R-04**, the same day, **hides the old brain
> games** (§13), so **nothing can reach this code in 1.0.20** — there is no longer a way to
> finish a level. The fix stays in place behind the same switch, because it is the better code
> the day `LEGACY_GAMES_VISIBLE` goes back to `true`, and `logError` means whoever looks next
> gets the real Postgres error instead of nothing. **Do not read "no alert appeared" as a
> pass.** It was already untestable for want of a player-role account; now it is unreachable as
> well. The rest of this section is the record, for whenever the games return.

**What was actually silent.** The screen **did** already alert when `recordSession` returned
false, so a whole-save failure was visible. What was not:

* **step 3, `daily_game_time`** — both the update and the insert threw their `{ error }` away;
* **step 4, `award_xp_safe`** — the same, so the XP the results screen had just promised could
  fail to be added and the save still reported **success**;
* **every** failure went to `console.error`, which reaches no report. This repo's rule for an
  absorbed failure is `utils/logError` (Sentry + a fixed console format); this hook predates it.

**What it does now.** `recordSession` returns `{ ok: true }` or
`{ ok: false, step: 'signed-out' | 'session' | 'progress' | 'daily' | 'xp' }`; every step
checks its error and reports through `logError`; the screen shows a sentence **per step** from
`RECORD_SESSION_MESSAGES`, which lives beside the steps so the message and the code cannot
drift. Each sentence says what **did** land ("Your score and level were saved, but the XP was
not added to your total") because "failed to save" over a half-written save is worse than
naming the half.

**Files:** `src/hooks/useGameSession.ts` · `src/screens/GamePlayScreen.tsx`

### 🛑 NO SCHEMA, RPC OR RLS CHANGE WAS NEEDED — and the bigger half is NOT fixed

Lu's item said *"Fix it so a failed save is not silent"*, and that needed **no** schema work.
**The save itself is still expected to fail**, for the reason `docs/recon/arcade.md` §0.1 gives:
step 1 inserts `player_id, game_id, level_number, score, …` into **`game_sessions`**, and the
**live `game_sessions` is the soccer live-stats table** (`event_id`, `team_id`, `status`,
`home_score`, `stats_keeper_id` … and **no `player_id` / `game_id` / `score`**), per the web's
generated types regenerated 2026-10-31. That is a **SCHEMA question — SACRED** — and was left
alone. **After this change that failure reports itself as `step: 'session'` with the real
Postgres error in Sentry, instead of a bare sentence.** That is the whole of what this item
asked for.

| screen and taps | what should happen |
|---|---|
| **Player dashboard → Games → any game → finish a level** | **INFERRED, from §0.1:** an alert headed **"Progress didn't save"** reading *"Your score couldn't be saved. Your level and XP are unchanged."* Metro shows `[useGameSession.insertSession] <the real error>`. **An alert here is the fix working, not a new bug.** |
| if instead it **saves cleanly** | No alert at all. That would mean §0.1's INFERRED diagnosis is wrong, which is **worth reporting** — it has never been checked on a device. |

> **⚠️ UNTESTABLE AS IS.** `recordSession` saves against `currentRole.entity_id`, a **player**
> role. **No player-role test account is recorded anywhere in `docs/`** — the three known
> accounts are club admin, coach and parent. Signed in as any of those, the save short-circuits
> at `{ ok: false, step: 'signed-out' }` ("We couldn't tell who was playing…"), which is a
> correct message but tests nothing. **NEEDS LU: a player-role login, or confirmation that the
> games are being retired and this row can be dropped from the Round 2 list.**

---

## 9. Courses header behind the notch — the ledger's target was ALREADY FIXED

**The ledger line is stale.** It names the Courses header, and the finding
(`docs/recon/playbook-m5-fix.md` §5, `ledger.md:289-292`) is about **`CoursesScreen.tsx`** — the
back arrow and "Course Library". **That was fixed on 2026-10-30 in `892edbe`** ("Courses
safe-area"): the screen has carried `SafeAreaView edges={['top']}` with a comment citing Lu's
Oct 30 ruling ever since. `git log -S"edges={['top']}"` on that file names the commit.
**Nothing was changed there.**

**What WAS fixed — the same root, one more site.** `MyCoursesScreen.tsx` is registered
`headerShown: false` (`AppNavigator.tsx:353`) and had a bare `View` root, so its header row was
drawn at y 0 and **the back arrow and "My Courses" sat behind the notch**. It now uses the same
`SafeAreaView edges={['top']}` pattern. Bottom edge deliberately not claimed — that is the tab
bar's.

**File:** `src/screens/MyCoursesScreen.tsx`

| screen and taps | what should be on screen |
|---|---|
| **Home → My Courses** | The ← button and **"My Courses"** sit **below the notch / status bar**, clear of the clock and the battery. The "n courses enrolled" line and the cards below shift down with it. |
| **Home → Courses** (the regression check) | Unchanged — ← and the hero still clear the notch, as they have since Oct 30. |

> **FOUND, not fixed (out of scope, reported only):** `CourseDetailScreen.tsx` also has a bare
> `View` root and its own custom header — but it is registered with `options={{ title: 'Course' }}`,
> so the **native stack header is shown above it** and handles the inset. It is therefore **not**
> a notch bug; it is a **double header**, a different (cosmetic) defect. Not touched.

---

## 10. Calendar "?" count — **OUT OF 1.0.20 AND PARKED.** Nothing to test

**Not built. Nothing was changed, in either pass.** **Moved out of 1.0.20 on 2026-11-04** into
its own ledger entry, **`CAL-NOREPLY-COUNT`**.

**Lu answered the blocking question that same day by reading the live `players` SELECT policies
(prod `pg_policies`), and the answer CLOSES this approach rather than unblocking it:** the
policies are **not symmetric** — staff and club admins see the whole team (`is_team_staff` /
`is_club_admin`), but **a parent sees only their own child** (*"Parents and players can view own
records"*). So a widened `players` read would hand a parent **1** where a coach gets **14**, and
`noReplyFromRoster` would print a confidently wrong number on a parent's calendar — **worse than
today's `? 0`, which is at least wrong the same way for everyone.** Three options (A staff-only
count · B a count-only DB function, SACRED · C leave it) are written up in the ledger entry.
**Round 2 action: none. It is a Lu decision, not a test.**

> **ALSO FOUND, and INFERRED, not proven:** the same policies mean the **event-detail Responses
> bar has probably been under-counting for parents all along** — `fetchRoster` runs unfiltered
> for every role and feeds that bar, so a parent's call returns their own child only. **The one
> check, worth doing in Round 2 because it is a bigger defect than the card:** open one event's
> detail **as a parent** and read the Responses bar's roster total. If it says "1 on the
> roster", it is confirmed.

The original record of the defect follows, unchanged, because the defect itself has not moved.

**Not built. Nothing was changed.** The card tallies RSVP **rows** with `status === 'pending'`
(`CalendarScreen.tsx:256-262`), but a player who never answered **has no row at all**, so it
shows `? 0` for an event where the detail bar correctly shows 11.

**The rule already exists** — `noReplyFromRoster(rosterSize, going, cantGo)`
(`src/utils/attendanceResolver.ts:214`) — and the list has `going` / `cantGo`. **It lacks a
roster SIZE.** There is no roster hook: the shared source is the inline `fetchRoster` in
`EventDetailScreen.tsx:280-294`, which is **per event**. The sanctioned fallback is one batched
`players.select('id, team_id').in('team_id', teamIds)` per fetch.

**Why it stopped — Lu's own standing condition, from Oct 26:** *"if widening `players` would
give a parent a different number than staff (RLS), stop and report."* That cannot be answered
from here. `supabase/migrations/` holds exactly one migration and **no `players` policy SQL**,
and **this task forbids any prod DB access.** Widening the read while the condition is
unanswered would be improvising around a Lu rule, so it was not done.

**The one check that unblocks it:** sign in as a **parent** and as a **staff member** on the
**same team** and compare **the Responses bar's roster total on the same event**. Same number →
build the widened read (a ~3-line change to the existing `players` read). Different number →
the RLS question is real and needs its own ruling. *(Or read the `players` SELECT policy
directly, which needs DB access.)*

**Round 2 action: none on this item.** It is a Lu decision, not a build step. Until then the
`?` on the calendar list card is **knowingly wrong** — do not file it again as a new bug.

---

## 11. `announceCardKey.ts` docblock corrected

**What changed.** Lines 30-33 said *"All 69 in the frozen book are `[A-Z0-9]{2,6}` — F0..F5,
…"*. That stopped being true when web content **batch 2** was applied to prod **2026-11-03**:
it inserted **five more Foundations cards, `F7`–`F11`** (sorts 8–12, published). The comment
now reads **F0..F5 and F7..F11 (there is no F6)** and says **74, not 69**.

Sources named in the comment: the apply SQL
(`thrive-and-score/supabase/content/20261102224500_playbook_content_b_apply.sql:223-232`, gate
P03 `:295-299`), `docs/recon/test-plan-1.0.20-nov03.md` §0.2, and Round 1's own screen — the
card badge read **"F10 · Card 5 of 6"**. **The 74 is arithmetic over that SQL, not a DB count.**

**The PATTERN never needed changing.** `^[A-Za-z0-9_-]{1,16}$` always matched `F7`. This was a
comment that had gone stale, **not a gate that was wrong** — which is why there is nothing to
test on screen.

**File:** `src/constants/announceCardKey.ts` · **nothing for Lu to check.**

> **FOUND, not fixed:** the **same stale list** is written out a second time in
> `docs/ledger.md:1976` (`"[A-Z0-9]{2,6}` — F0..F5, P1..P19, …"`). Correcting that line was not
> in this task's scope. **RECOMMEND** sweeping it with the next ledger edit.

---

## 12. Ledger correction — the foreground banner was NOT the push-test failure

The ledger said the foreground banner caused the push test to fail. **That is wrong for the
backgrounded attempt, and the correction is written into `docs/ledger.md`
`RELEASE-1.0.20-FIXES`.** iOS presents a banner for a **backgrounded** app **itself** — the
JS `setNotificationHandler` is only consulted while the app is in the **foreground**, so it
cannot explain a missing banner with the app backgrounded.

**Likely cause instead, marked INFERRED:** **notification permission was never granted** on
that simulator, or the banner appeared and closed inside its **~5 second window** before Lu
looked. Neither was checked during the run.

**What is still true:** the deprecation WARN was real and is now gone (item 3). What changed is
the **diagnosis**, not the fix.

**Round 3, before pushing again — two checks, in this order:**

1. **Permission.** Simulator → Settings → Notifications → the dev client in use
   (**`com.thryvyng.app`**, Lu's install — **not** `com.weolkn.thryvyng` from `app.json`).
   **Allow Notifications must be ON.** If it is off, nothing else below can work.
2. **Watch the screen when the push is sent**, do not send and then look. The banner window is
   about five seconds.

Then run the tap test from all three app states, naming the **running** bundle id in the push.

---

## 13. R-04 · The old brain games are hidden; "PAC Arcade — coming soon" stands in

**The ruling** (Lu, 2026-11-04): hide the old brain games in 1.0.20 and show a "coming soon"
tile in their place. A new set of arcade games replaces them in a later build.

### What changed

**ONE CONSTANT, ONE FILE.** `src/constants/arcadeLaunch.ts` (**new**) holds
`LEGACY_GAMES_VISIBLE = false`, the derived gate `legacyGamesVisible`, and the three strings the
stand-in says. Same pattern as `playbookLaunch.ts`, and a **leaf**: it imports **only
`react-native`** (for `Alert`) and nothing of `src/screens`, `src/hooks` or `supabase`, so both
role dashboards and the navigator can read it without pulling a game screen into their bundle.
**Flip it back to `true` and every entry point and both routes revert, with no other edit.**

**NOTHING IS DELETED — that is what the switch is for.** All 13 game files stay on disk; **no
row, table or policy was touched**, so every `player_game_progress`, `xp_awards` and
`players.total_xp` value a family already earned is intact and still shown. Hiding the games
stops that number *growing* from games; it changes nothing already there.

**THE TILE.** Same slot in the same grid, **same size** (it is a flex child of the same row, so
the row stretches all three tiles to one height), **calmer ink**: a neutral slate frame instead
of the grid's purple, a muted icon box, and a small uppercase **"Coming soon"** chip above the
icon. The chip is deliberately *not* in the top-right corner — that corner belongs to the
numeric unread pill, and a word there would read as a count. Title **"PAC Arcade"**, from
`clubShortName()` in `src/lib/clubAnnouncements.ts` — **the same one rule R-01 uses** (§1), so
the arcade tile and the announcements chat can never abbreviate the club two ways. Subtitle
**"New games coming soon"**. With no club name in hand it reads **"Thryvyng Arcade"** rather
than a bare " Arcade".

**THE ALERT**, for the tile tap and for any route or deep link that still aims at an old game:
**"New games are on the way"** / *"We're building a brand-new set of soccer brain games. We'll
let you know when they're ready."*, one **OK**. Its words live **once**, in `arcadeLaunch.ts`,
so the tile and both route guards cannot word it three ways.

**THE ROUTES STAY REGISTERED — a deliberate difference from how `playbookVisible` gates the
`Playbook` route**, which removes the `Stack.Screen` outright. The Playbook route had never
shipped, so nothing could point at it. `GamesHub` and `GamePlay` **have** shipped: a navigation
state restored from disk, a saved link or any future push payload can still name them, and
`navigate()` to an **unregistered** name does nothing at all — the person would tap and watch
the app ignore them. Registered-and-guarded, they get the same sentence as the tile.
`LegacyGameClosedScreen` renders an empty dark view, fires the Alert **once** (a `useRef` latch,
so a remount cannot stack dialogs), and on OK goes back — or to `Dashboard` when there is no
stack under it.

### Every entry point, found by grep, and its new behaviour

`grep -rn "'GamesHub'\|'GamePlay'" src` returns **exactly five sites**:

| # | entry point | roles it serves | new behaviour |
|---|---|---|---|
| 1 | `PlayerDashboard.tsx:308` — the **"Games"** quick-action tile | **player AND parent** (`DashboardScreen.tsx:282-291` sends both to this dashboard) | → **"PAC Arcade"** tile, tap opens the Alert |
| 2 | `CoachDashboard.tsx:500` — the **"Brain Games"** tile | **head_coach, assistant_coach, team_manager** | → **"PAC Arcade"** tile, tap opens the Alert |
| 3 | the **`GamesHub` route**, `AppNavigator.tsx` | any caller, incl. a restored nav state | → `LegacyGameClosedScreen`: Alert, then back. The lazy `import()` is **never called**, so no game screen is constructed |
| 4 | the **`GamePlay` route**, `AppNavigator.tsx` | the route a saved link is likeliest to name — it carries `gameId` / `gameSlug` / `gameName` | → same guard |
| 5 | `GamesHubScreen.tsx:48` → `GamePlay` | inside the feature | **unreachable** once (3) never renders — **and its target is (4), so it is guarded twice over** |

**Four more places checked and clean, so this is a sweep and not a guess:**

| checked | result |
|---|---|
| `ClubAdminDashboard`, `NoRoleDashboard` | **no games tile** |
| **Club Hub** (`ClubHubScreen.tsx`) | **no games entry** — one "game" string, an unrelated subtitle |
| **bottom tabs** | **no games tab**; the five are Home, Teams (staff), Chat, Calendar, Profile |
| **deep links** (`linking.ts`) | **no games route declared** |
| **notification taps** (`routeNotification`) | **no games type** among its twelve branches |
| **XP / progress widgets** | `PlayerDashboard`'s XP badge, level bar and team leaderboard, and `CoachDashboard`'s Team XP and Top XP Earners, all read `players.total_xp` and **navigate nowhere** (grep: no `onPress` to either route). **Left exactly as they are.** |

**Files (5):** `src/constants/arcadeLaunch.ts` (new) · `src/components/QuickActionsCard.tsx`
(two optional fields, `subtitle` and `comingSoon`/`comingSoonLabel`, so every existing action on
every dashboard renders as before) · `src/components/dashboards/PlayerDashboard.tsx` ·
`src/components/dashboards/CoachDashboard.tsx` · `src/navigation/AppNavigator.tsx`.
**No game file was edited.**

### How Lu sees it

| # | screen and taps | test account | what should be on screen |
|---|---|---|---|
| 13a | **Dashboard** as a **parent** (`ludwig.snchz+zztest7@gmail.com`) → look at the quick-action grid | **parent** | Where **"Games"** used to be, second tile of row 1: a **calmer, grey-framed** tile reading **"PAC Arcade"** with **"New games coming soon"** under it and a small **COMING SOON** chip above the icon. **Same size as Courses and Store either side of it**, nothing clipped. |
| 13b | tap that tile | parent | Alert **"New games are on the way"** / *"We're building a brand-new set of soccer brain games. We'll let you know when they're ready."* with **one OK**. OK closes it and **stays on the dashboard** — it must not navigate anywhere. |
| 13c | **Dashboard** as a **coach** (`ludwig.snchz+zztest6@gmail.com`) → the quick-nav grid | **coach** (head_coach / assistant_coach / team_manager) | The **"Brain Games"** tile is now the same **"PAC Arcade"** tile, in the same slot, and taps to the same Alert. |
| 13d | **Dashboard** as **club admin** (`ludriv@hotmail.com`) | **club admin** | **No games tile and no arcade tile** — that dashboard never had one. Nothing should have appeared. |
| 13e | **the XP surfaces**: as a player/parent, the XP badge, the level bar and the team leaderboard; as a coach, **TEAM PERFORMANCE → Team XP** and **TOP XP EARNERS** | parent + coach | **All unchanged, and all still showing their numbers.** Hiding the games must not blank or zero any XP a family already earned. |
| 13f | **the route guard.** Hardest to reach on purpose — there is no button left. Easiest path: with the dev client on Metro, flip `LEGACY_GAMES_VISIBLE` to `true`, open a game, flip it back to `false` and reload so the navigation state is restored pointing at `GamePlay` | any | The **same Alert**, and OK **leaves the screen** (back, or the dashboard if there is no stack). **It must not show a game, a blank page, or a crash.** |
| 13g | **the revert check, worth one minute** — flip `LEGACY_GAMES_VISIBLE` to `true`, reload | any | The **old "Games" / "Brain Games" tiles are back** and open the real games hub, exactly as before R-04. That proves nothing was deleted. Flip it back to `false` before building. |

> **Related: §8 is now MOOT.** The games save fix is **kept, not reverted** — it is behind the
> same switch and will be the better code the day the games return — but with the games hidden
> **nothing can reach it in 1.0.20**, so **drop §8 from the Round 2 list**. Do not read "no
> alert appeared" as a pass there: there is no longer a way to reach a game.

---

## 14. One-line index — the Round 2 list

| item | what | status | Lu checks |
|---|---|---|---|
| **1** | R-01 announcements name + megaphone, 4 surfaces | built, unverified by Lu | §1, four rows + coach/parent |
| **2** | Reactions sheet scrolls | built, unverified by Lu | §2 |
| **3** | `shouldShowAlert` removed, WARN gone | built, unverified by Lu | §3 |
| **4** | D1 card footer, two lines + real italic face | built, unverified by Lu | §4, three rows |
| **5** | D2 strokes, 3 files mirrored byte-identical + `MIRROR.md` | built, unverified by Lu | §5, three rows |
| **6** | Discard prompt (arrow, swipe, hardware back) | built, unverified by Lu | §6, 6a–6d (**not 6e**) |
| **7** | 5 games `tsc` errors → 0; one was a live defect | built, unverified by Lu | §7, Pattern Play only |
| **8** | Games save reports which step failed, via `logError` | **MOOT** — kept, but R-04 hides the games | §8 — **drop from the Round 2 list** |
| **9** | `MyCoursesScreen` safe area (the ledger's own target was already fixed Oct 30) | built, unverified by Lu | §9 |
| **10** | Calendar `?` count | **PARKED out of 1.0.20** as `CAL-NOREPLY-COUNT`; the RLS question is answered and it closes the approach | §10 — **a Lu decision, not a test** |
| **11** | `announceCardKey.ts` docblock | built, unverified by Lu | nothing on screen |
| **12** | Ledger line corrected, cause re-marked INFERRED | written | §12, the two pre-push checks |
| **13** | **R-04 · old games hidden, "PAC Arcade" coming-soon tile**, 5 entry points guarded | built, unverified by Lu | §13, 13a-13g |

> **🛑 ONE SERVER STEP BEFORE THE LAUNCH ANNOUNCEMENT, AND IT IS SACRED.** The announcement
> **push title** is built server-side by **`chatContextName` in the edge function** and still
> reads **`club-announcements`**, so the first announcement to ~231 families would land on every
> lock screen titled with the raw slug. R-01 fixed every in-app surface and could not touch this
> one. **Order: fix + deploy `chatContextName` → send one test announcement to a staff-only
> audience and read the banner → only then the launch announcement.** Deploying that function
> affects **every other push type it titles**, not only announcements. Ledger:
> `RELEASE-1.0.20-FIXES` → "BEFORE THE LAUNCH ANNOUNCEMENT GOES OUT".

---

## 15. F-1 · R-05 = A · ONE brand mark, on every announcements layer

**Built 2026-11-04, after Round 2.** Status: **`built, unverified by Lu`.**

**Why it was not already right.** R-01 (§1) put a megaphone in three different places, each
with its own size, its own circle and its own copy of the idea: a 40pt tan circle in the chat
list, an 18pt one in the feed header, another 18pt one in the chat-room header. **None of them
carried the club.** A family moving list → feed → announcement saw three badges for one chat
and no crest anywhere, and the opened announcement said only the word **"Announcement"** —
a reader arriving from a push tap could not tell whose announcement it was.

**R-05 = A (Lu, 2026-11-04): one mark, consistent, getting smaller as you go deeper.**

| | |
|---|---|
| **the component** | `src/components/chat/AnnouncementsMark.tsx` (**new**) — the single renderer. Props: `size` (the crest's diameter), `logoUrl`, `clubName`, `ringColor`. |
| **the three parts** | **1.** the **crest** — the club's `clubs.logo_url`, filling the circle. **2.** a **2px ring in #C4976D**, the tan the chat list already gives every club/announcement row (`ChatScreen.getChannelColor`) and the colour of the feed cards' left strip. **3.** the **megaphone badge** — the existing `MegaphoneIcon`, **navy on a tan circle**, overlapping the bottom-right corner, ringed in the screen's own background colour so it sits proud of the crest. |
| **no crest?** | Falls back to the club's **initials on navy** — `clubShortName()`, R-01's own rule, initialled further if it returns a multi-word name. **No club name at all → "A"**, matching `announcementsChatName()`'s own fallback to the bare word "Announcements". Never a blank circle, never an emoji. |
| **sizes** | badge = **44%** of the crest with a **14pt floor** (below that the megaphone's three strokes stop reading as a megaphone); it overhangs by a fifth of its own width on the two edges it touches. |
| **the club read** | `src/lib/announcementsMarkClub.ts` (**new**) — ONE cached two-step read (`comm_channels.club_id` → `clubs(name, logo_url)`), keyed per channel for the life of the process. The feed used to read `clubs.name` in its own effect and read no crest; that effect is **gone**, replaced by this hook. The chat list and the chat room already held both and do **not** call it. |
| **no new dependency** | `react-native-svg` (the megaphone) and `AsyncStorage` (§16) were both already in `package.json`. |
| **DISPLAY ONLY** | No write of any kind. The channel is still chosen by `channel_type = 'club' AND is_default`, never by a name and never by this mark. A failed club read leaves the mark on its initials and costs nothing else. |

**The megaphone is now drawn in exactly one place.** `grep -rn MegaphoneIcon src` →
`AnnouncementsMark.tsx` and the icon's own file, nothing else. The three one-off badge styles
(`AnnouncementsFeedScreen.headerBadge`, `TeamChatRoomScreen.headerAnnounceBadge`, and the chat
list's inline megaphone circle) are deleted.

**Every screen that shows this chat — found by grep, six of them:**

| layer | screen | the mark | the rest of the header |
|---|---|---|---|
| **1** | `src/screens/ChatScreen.tsx` — the chat list row | **40pt**, the existing avatar size; `ringColor` is the **card's** `#1e293b`, not the screen's | the tan left strip is untouched; line 1 still "PAC Announcements", line 3 still "Provo Athletic Club" |
| **2** | `src/screens/AnnouncementsFeedScreen.tsx` — the feed | **44pt**, the largest: this is the chat's front door | "PAC Announcements" + "Provo Athletic Club" **beside** the mark (left-aligned, not centred — a 44pt mark plus two centred lines leaves the title nowhere to go between two 40pt buttons) + a **full-width 2px tan rule**, which REPLACES the old hairline border |
| **2-alt** | `src/screens/TeamChatRoomScreen.tsx` — the chat-room **fallback** (bubbles) | **26pt** — this header is one title line and its crest spot is 18pt; 18 leaves the badge unreadable, 32 would grow the header | title and subtitle unchanged (R-01's) |
| **3** | `src/screens/AnnouncementDetailScreen.tsx` — one announcement opened | **32pt** | **the word "Announcement" is gone**: a **small-caps tan kicker** with the chat name (`announcementsChatName`) + **this announcement's date** as the subtitle + the same tan rule |
| **3b** | `src/screens/ComposeAnnouncementScreen.tsx` — compose | **32pt** | same as layer 3, subtitle **"New announcement"** |
| **4** | `src/screens/ChatInfoScreen.tsx` — Chat info | **64pt**, in the spot the `#` circle held | the big name is R-01's "PAC Announcements"; **every other chat keeps the `#`** |

### How Lu sees it — as club admin, PAC

| # | screen and taps | what should be on screen |
|---|---|---|
| F1a | **Chat tab** → the announcements row | The badge is the **PAC crest in a circle with a 2px tan ring**, and a **small tan megaphone circle on its bottom-right corner**. **Not** a plain megaphone on a solid tan circle (that was R-01), **not** a ⚽, **not** a bare crest. The tan left strip on the card is still there. |
| F1b | tap that row → the **feed** header | The same mark, **bigger**, to the left of **"PAC Announcements"** / "Provo Athletic Club". Under the whole header, a **full-width tan line** — and only ONE line, not a tan line plus a grey hairline. |
| F1c | tap any card → the **opened announcement** | Header: the **same mark, smaller**, then **"PAC ANNOUNCEMENTS"** in small tan capitals with **the announcement's date** underneath, then the tan rule. **The header must not say the single word "Announcement" any more.** |
| F1d | from the feed, **✎** | The **same** header as F1c, with **"New announcement"** where the date was. |
| F1e | **Chat info** for this chat (reach it through the chat-room fallback, §1's row 1c) | A **64pt** mark where the `#` circle was. Open Chat info on a **team** chat too: it must still show the `#`. |
| F1f | the **chat-room fallback** itself (§1 row 1c's trick) | A **26pt** mark where a team chat shows its crest. |
| F1g | **as coach and as parent** | F1a–F1c read the same, and there is still **no ✎** in the feed header. |
| F1h | **the crest-less case** — only reachable on a club with no `logo_url` (PAC has one) | The circle shows **PAC** in white on navy, inside the same tan ring, with the same corner badge. **Not testable on PAC; recorded so it is not mistaken for a bug elsewhere.** |

---

## 16. F-2 · Save draft on the compose form

**Built 2026-11-04, after Round 2.** Status: **`built, unverified by Lu`.**

**What changed.** §6's prompt had two answers — keep writing, or throw it away. A staff member
half way through a long message who got a phone call had those two and nothing else. The prompt
now has **three**, and the wording changed with it:

> **"Leave this announcement?"** / "Nothing has been sent. You can keep it as a draft on this
> device."
> **Keep writing** (cancel) · **Save draft** · **Discard** (destructive)

Cancel first, destructive last, the new answer in the middle — the same ordering safety §6 had.

| | |
|---|---|
| **where the draft lives** | `src/lib/announcementDraft.ts` (**new**) — **`AsyncStorage`, on the device only.** `@react-native-async-storage/async-storage` **2.2.0 was already in `package.json`** (the supabase session lives in it, `src/lib/supabase.ts`): **no new dependency.** |
| **NO DB WRITE** | An unsent announcement is not a row anywhere. There is no drafts table and none was added — that is a schema change and SACRED. Same trade `useMyMessages` makes for its last-seen stamp and `SurveyPopupModal` for its dismissal. |
| **the key** | `announce.draft.v1.<user id>.<club id>`. The **user** half keeps two accounts on one phone from reading each other's writing; the **club** half keeps a multi-club admin from carrying one club's draft into another's. There is exactly one announcements channel per club, so a per-channel key would be the same key with a worse name. The club id comes from §15's cached read. |
| **what is stored** | the **title**, the **body**, and the **drafted buttons** (kind, label, card key) — plus a `savedAt` stamp, written but not yet shown. The buttons' local render ids are **not** stored; a restored row gets a fresh one. |
| **what is NOT stored** | A **poll** added through "Add a poll". A poll is its own posted message the moment it is created (§1's recon, P-5) — it is already in the feed and was never part of the draft. |
| **restore** | Opening **✎** with a saved draft puts it back and shows a quiet tan **"Draft restored"** note under the audience line. It restores **once**, and **only into an untouched form** — the key's club half can land a frame after the first keystroke, and overwriting what someone had started typing would be worse than no restore. The note **retires on the first edit**. |
| **what clears it** | **Discard** (so the next open cannot restore what was just thrown away) and a **successful send**. Nothing else. |
| **every storage call is wrapped** | A phone that refuses the read answers "no draft" and the form opens empty — exactly what it did before F-2. A failed **write** is reported: **"Draft not saved · This device would not store the draft. Nothing was sent."** and it still leaves, because staying would trap someone who has already decided to go. |
| **the cost, stated** | The draft is **per device**. Start a message on the phone and the tablet does not have it. |

**Files:** `src/lib/announcementDraft.ts` (new) · `src/screens/ComposeAnnouncementScreen.tsx`

### How Lu sees it — as club admin, PAC. **Nothing here sends.**

| # | screen and taps | what should happen |
|---|---|---|
| F2a | **✎** → type **nothing** → back arrow | Leaves **immediately, no prompt.** (§6a, unchanged.) |
| F2b | ✎ → type a title → back arrow | **"Leave this announcement?"** with **three** buttons: Keep writing · Save draft · Discard. **Keep writing** returns to the form with the text still there. |
| F2c | from F2b → **Save draft** → leaves → **✎ again** | The title is **back in the field**, and a small tan **"Draft restored"** sits under "Goes to everyone in Provo Athletic Club announcements". |
| F2d | from F2c → type one more character | The **"Draft restored"** note **disappears**. The text stays. |
| F2e | ✎ → title **and** body **and** one ＋ Playbook card button with key `F3` → back → **Save draft** → **✎** | **All three come back**: title, body, and the button row with its kind, its label and `F3`. |
| F2f | from F2e → back arrow → **Discard** → **✎** | The form is **empty**. The discarded draft is gone, not restored. |
| F2g | ✎ → type a title → **swipe from the left edge** | The **same three-answer prompt** (React Navigation's `beforeRemove`). Save draft works from here too. |
| F2h | **force-quit the app** after F2c, reopen → ✎ | The draft is **still there** — it is on disk, not in memory. |
| F2i | sign out, sign in as **coach** (`ludwig.snchz+zztest6@gmail.com`) | That account has **no ✎** at all, so there is nothing to restore. The admin's draft is keyed to the admin's user id and must never appear for anyone else. |
| F2j | ✎ → fill it → **Send announcement** → it posts → **✎ again** | The form is **empty**: a sent message's draft is cleared. **⚠️ This sends a real push to ~231 PAC families — do not run F2j until Lu wants to send.** |

---

## 17. One-line index — the Round 3 additions

| item | what | status | Lu checks |
|---|---|---|---|
| **F-1** | R-05 = A · one crest + tan ring + megaphone mark, **six** screens, megaphone drawn in one place | built, unverified by Lu | §15, F1a–F1g (**F1h not testable on PAC**) |
| **F-2** | Save draft on the compose form — AsyncStorage, per user + club, device only | built, unverified by Lu | §16, F2a–F2i (**not F2j**) |

**Gates, run after the last edit:** `npx tsc --noEmit` → **0 errors** ·
`ESLINT_USE_FLAT_CONFIG=false npx eslint` on all 9 changed files → **0 errors, 128 warnings**
(the same 128 the six screens already carried before this task; the three new files are clean) ·
`npx expo export --platform ios` → **succeeded**, iOS bundle 9.53 MB ·
`npm run smoke` → **257 assertions, 0 failures**.

**Nothing SACRED touched:** no schema, migration, SQL, Supabase write, RPC or RLS; **no
dependency and no `package.json`**; no `app.json` or version bump; no env, no delete, no auth;
**no DB access of any kind**; `docs/recon/arcade.md` not written; no edit in the web repo; **no
commit and no push.** `Send announcement` was never triggered.

---

## 18. R-06 · The announcements colour is a pastel sky, softly tinted

**Built 2026-11-04, after Round 2b.** Status: **`built, unverified by Lu`.**
**Lu ruled option 2.**

**Why the old colour was never a decision.** R-01 and R-05 built every announcements surface
in the tan **`#C4976D`**, and nobody chose it: it is what `ChatScreen.getChannelColor` has
always returned for a `club` channel, and the mark's ring, the kicker, the rules and the card
edges each inherited it. The chat every family in the club reads was wearing a colour borrowed
from a lookup table.

| | |
|---|---|
| **the tokens, defined ONCE** | `src/lib/announcementsTheme.ts` (**new**). `ANN_SKY` **#A9CCEB** (rings, badge, edges, kicker, banner borders, F-3's dashed border) · `ANN_SKY_TINT` **rgba(169,204,235,0.22)** (the list card's and the banners' fill) · `ANN_TEXT` **#FFFFFF** · `ANN_SUBTEXT` **#C7DDF2** · `ANN_NAVY` **#0F1D2F**. |
| **why its own module** | Eight files draw part of this surface and five of them used to write the accent out by hand. A colour defined in five places drifts on the sixth change. The module is **pure** — no supabase, no react — which is what lets `NotificationsScreen` take a token without pulling the announcements data layer in behind it. |
| **ANN_NAVY exists for legibility, not decoration** | White on `#A9CCEB` is about **1.4:1**. So the megaphone drawn ON the sky circle is navy, and so are the digits on a sky unread badge. A tan accent never had to think about this; a pastel does. |
| **ANNOUNCEMENTS ONLY — and this is the structural part** | `getChannelColor` gained **a new arm ABOVE the `club` one**, gated on `isAnnouncements` (the ROW test `channel_type = 'club' AND is_default`, never a name). The old arm matches every `club` channel **and anything whose name merely contains "club"**, so recolouring it in place would have taken the **coaches' lounge** and any club channel added later with it. **No team colour is touched** — `resolveTeamColor` is untouched, and the DM / group / lounge arms still return what they always did. |
| **the one remaining `#C4976D` in `src`** | **`ChatScreen.tsx:186`** — the club's OTHER channels, by design. The announcements chat returns from the sky arm **23 lines above it** and can no longer reach it. (Two more hits are prose in docblocks explaining the change.) |

**Surface by surface:**

| surface | before (R-05, tan) | after (R-06, sky) |
|---|---|---|
| `AnnouncementsMark` | 2px tan ring, navy megaphone on a tan circle | **2px `ANN_SKY` ring, `ANN_NAVY` megaphone on a sky circle.** Shape unchanged; only the two colours. |
| chat list row | tan 4px left strip on the standard dark card | **the whole card is `ANN_SKY_TINT` with a 1px `ANN_SKY` border**, the left strip now sky, the name **white read or unread**, the preview and the member/club line **`ANN_SUBTEXT`**, and the unread badge's digits **navy**. **No other chat card changes.** |
| feed header | a bar ending in a full-width 2px tan rule | **a rounded (12) banner** — tint fill, 1px sky border — holding the back arrow, the 44pt mark, "PAC Announcements" + the club name, and the ✎. **The rule is gone, not doubled.** |
| opened announcement | 32pt mark, tan kicker, tan rule | **the same banner**, 30pt mark, **`ANN_SKY` small-caps kicker** + the date |
| compose | 32pt mark, tan kicker, tan rule | **the same banner**, 30pt mark, kicker + "New announcement"; the restored-draft note is sky |
| feed cards + compose's preview card | 3px tan left edge | **3px `ANN_SKY` left edge, dark bed kept.** The cards stay dark deliberately: tinting them too would leave the feed with no contrast between the chrome and the content. |
| chat-room fallback · Chat info | the mark's tan | **the mark's sky** — their only tan was inside the mark, so both recoloured with it |

### How Lu sees it — as club admin, PAC

| # | screen and taps | what should be on screen |
|---|---|---|
| R6a | **Chat tab** → the announcements row | The **whole card** has a pale blue wash and a thin blue outline; the name is **white**; the preview and "Provo Athletic Club" are **pale blue**. **Every other card in the list looks exactly as it did** — same dark bed, same colours. |
| R6b | the same list, find the **coaches' lounge** or any other club chat | **Still its old colour.** If a second chat went blue, the row gate is wrong — say so. |
| R6c | any **team** chat row | **Unchanged.** No team colour was touched. |
| R6d | tap the announcements row → the **feed** | The header is now a **rounded blue-tinted panel with a thin blue border**, holding the arrow, the mark, the name, the club and the ✎. **There is no 2px line under it** — if you see both a panel and a line, say so. |
| R6e | the cards in that feed | **Dark cards with a blue left edge** (they were brown). |
| R6f | open one card | The banner again, smaller, with **"PAC ANNOUNCEMENTS"** in blue small caps and the date. |
| R6g | the mark, anywhere | The crest's ring is **blue**, and the corner megaphone is **dark navy on a blue circle** — never white on blue. |
| R6h | a row with an **unread count** | The count's digits are **dark**, not white. White on this pastel is unreadable, and that is the one place the colour forced a change beyond the accent. |
| R6i | **Notifications tab**, an announcement notification | See §20. |

---

## 19. F-3 · The draft is visible in the feed

**Built 2026-11-04.** Status: **`built, unverified by Lu`.**

**Why.** F-2 (§16) made Save draft possible but **invisible**: the only way to discover a saved
draft was to open ✎ and see it appear. A draft you cannot see is a draft you forget you wrote.

| | |
|---|---|
| **when it is drawn** | **Only** when `announcementDraft` storage holds a draft for **THIS user id + THIS club id** (F-2's key). A reader who has never composed — every family in the club — never sees it, and it cannot surface for the wrong account or the wrong club. |
| **where** | At the **top of the feed, above the first date heading**, as the list's header row, so it **scrolls with the feed** rather than pinning. It is shown under **both** filters: a draft is this person's own unfinished work, and "All / New" is about what has been read. |
| **what it looks like** | **Transparent, 1.5px DASHED `ANN_SKY`**, radius 14 — the same corner a real announcement card has, and deliberately the opposite treatment: a real card is a **solid dark bed with a solid 3px edge**. Nothing on it has been sent, and the border alone says so. |
| **three lines** | **1.** a small-caps sky kicker, **"DRAFT · SAVED 5 MIN AGO"**, with a **trash icon** hard right. **2.** the draft's **title**, or **"Untitled draft"**. **3.** muted **"Tap to keep writing"**. |
| **the age** | `announcementDraftAge()` in `src/lib/announcementDraft.ts` — one wording, used by **both** this card and compose's restored note: *just now · 5 min ago · 1 hour ago · 3 hours ago · yesterday · 3 days ago*, then a date. A clock that moved **backwards** prints "just now", never a negative. **No stamp → the kicker is just "DRAFT"**, with no age invented. |
| **refreshed on FOCUS, not on mount** | The round trip this card exists for is feed → ✎ → Save draft → **back to this feed**. A mount-only read would show the draft as it was before compose opened, or miss it. |
| **tap** | Opens compose, which restores the draft through **F-2's existing path** — no second restore route was written. |
| **trash** | **"Delete draft?"** / *"This draft will be removed from this phone."* → **Cancel** · **Delete** (destructive). The copy names the blast radius — **one phone** — because that is the whole truth about where a draft lives. The card disappears. |
| **compose's note grew too** | **"Draft restored · saved 5 min ago"**, built from `savedAt` at the moment of the restore (it describes when the draft was saved, not how long the form has been open). It still retires on the first edit. |

**Files:** `src/lib/announcementDraft.ts` (the age helper) · `src/screens/AnnouncementsFeedScreen.tsx`

### How Lu sees it — as club admin, PAC. **Nothing here sends.**

| # | screen and taps | what should happen |
|---|---|---|
| F3a | **Chat → PAC Announcements** with **no** draft saved | **No draft card.** The feed starts at "This week" / "Earlier" as before. |
| F3b | **✎** → type a title and a body → back → **Save draft** → you land on the feed | A **dashed blue card at the very top**: **"DRAFT · SAVED JUST NOW"**, the title, and "Tap to keep writing". |
| F3c | from F3b, **tap the draft card** | Compose opens with the title and body **back in the fields** and **"Draft restored · saved just now"** under the audience line. |
| F3d | leave compose with **Keep writing**… then with the **arrow → Save draft** again | Back on the feed, **one** draft card — never two. |
| F3e | ✎ → type **a body only**, no title → Save draft → feed | The card's line 2 reads **"Untitled draft"**. |
| F3f | **wait a few minutes**, then pull-to-refresh / leave and come back to the feed | The kicker's age **has moved on** ("SAVED 5 MIN AGO"). It refreshes on focus. |
| F3g | tap the **trash** on the card | **"Delete draft?"** / "This draft will be removed from this phone." **Cancel** leaves the card. **Delete** removes it **immediately**, and ✎ then opens an **empty** form. |
| F3h | tap the trash, **Delete**, then pull-to-refresh | The card **stays gone**. |
| F3i | with a draft saved, **sign out → in as coach** (`ludwig.snchz+zztest6@gmail.com`) → the announcements feed | **No draft card.** The draft is keyed to the admin's user id. |
| F3j | save a draft, **force-quit**, reopen → the feed | The card is **still there** — it is on disk. |
| F3k | with a draft saved, ✎ → **Send announcement** → back to the feed | The card is **gone**: a sent message's draft is cleared. **⚠️ This sends a real push to ~231 PAC families — do not run F3k until Lu wants to send.** |

---

## 20. R-05 · The notifications list wears the mark

**Built 2026-11-04.** Status: **`built, unverified by Lu`.**

The `announcement` notification type drew a **pink `#ec4899` megaphone-outline Ionicon** — the
last megaphone in the app that disagreed with the surface it belongs to (it was reported as a
FOUND item when F-1 landed). It is now **`AnnouncementsMark` at 32pt** inside the row's existing
44pt circle, whose wash is `ANN_SKY_TINT`. **Every other notification type is untouched**: same
glyph, same colour, same bed.

**⚠️ IT HAS NO CREST, and that is a limit, not a choice.** A `notifications` row carries `type`,
`title`, `body` and an untyped `data` bag. **Whether `data` holds a `club_id` is UNKNOWN** — the
rows are written by the Supabase edge function, which is in neither repo — so the mark falls back
to its documented **initials** ("A" with no club name in hand). **The check that would settle
it:** log one real announcement notification's `data` keys; if a club id is there, pass it and
the crest appears with no other change.

**File:** `src/screens/NotificationsScreen.tsx`

| # | screen and taps | what should be on screen |
|---|---|---|
| R5a | **Notifications**, find an **announcement** row | A **blue-ringed circle with a dark megaphone badge** on a pale blue bed — **not** a pink megaphone. Expect **"A"** inside the ring, not the PAC crest (see the limit above). |
| R5b | the rows **around** it — an event, a chat message, a survey | **Unchanged**: green calendar, blue chat bubble, amber clipboard, each on its own tinted circle. |

---

## 21. One-line index — the Round 3 additions

| item | what | status | Lu checks |
|---|---|---|---|
| **R-06** | pastel sky `#A9CCEB` + soft tint replaces the tan on announcements surfaces **only**; one token module; `getChannelColor` gained a row-gated arm | built, unverified by Lu | §18, R6a–R6i (**R6b/R6c are the "nothing else moved" checks**) |
| **F-3** | the draft is visible at the top of the feed — dashed card, age, tap to resume, trash to delete | built, unverified by Lu | §19, F3a–F3j (**not F3k**) |
| **R-05 icon** | the notifications list's announcement row wears the mark | built, unverified by Lu | §20, R5a–R5b |

**Gates, run after the last edit:** `npx tsc --noEmit` → **0 errors** ·
`ESLINT_USE_FLAT_CONFIG=false npx eslint` on all 11 changed files → **0 errors, 131 warnings**
(all pre-existing classes; the two new/changed lib files and the mark are clean) ·
`npx expo export --platform ios` → **succeeded** · `npm run smoke` → **257 assertions, 0
failures** · `grep -rn "C4976D" src` → **one live hit, `ChatScreen.tsx:186`, the club's other
channels by design**, plus two docblock mentions.

**Nothing SACRED touched:** no schema, migration, SQL, Supabase write, RPC or RLS; **no
dependency and no `package.json`**; no `app.json` or version bump; no env, no delete, no auth;
**no DB access of any kind**; **no team colour**; `docs/recon/arcade.md` not written and **no
`git stash`**; no edit in the web repo; **no commit and no push.** `Send announcement` was never
triggered.
