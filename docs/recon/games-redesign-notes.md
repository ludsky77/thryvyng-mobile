# Thryvyng Games Redesign: notes, evidence and decisions

**Written:** Oct 9, 2026, at the close of the planning session that started the games redesign.
**Scope:** this structure applies to ALL current cognitive games and to every game built later. Anticipation Arena is the first game through the process and sets the pattern.
**Status words:** DECIDED = Lu said yes in the planning chat on Oct 9, 2026. PROPOSED = drafted by Claude, not yet approved. INFERRED = reasoning, not proven. Nothing here is built in the app yet.

---

## 1. What exists at close

| Item | Where | State |
|---|---|---|
| Code audit of the 7 games | `docs/recon/games-audit.md` (commit `7273de3`, audited at `3834065`) | Verified, pushed |
| Anticipation Arena playable prototype v3 | `docs/prototypes/anticipation-arena-prototype-v3.html` and https://claude.ai/artifact/EzBd6AsQY4F3kUFmrYj1Bx | Stages 1 to 3 liked by Lu. Stage 4 in this file is the OLD tap version, rejected, to be replaced |
| Stage 4 animated mockups v1 | `docs/prototypes/anticipation-arena-stage4-mockups-v1.html` and https://claude.ai/artifact/VkussFQm5XyFinj6i8Ua28 | Approved direction ("looking good"), not playable |
| This file | `docs/recon/games-redesign-notes.md` | The detailed record |

The prototypes are single web pages. Their code is NOT reused in the app (React Native). What carries over exactly: mechanics, level table, timings, scoring, colors, fonts, copy in EN/ES.

---

## 2. Process (DECIDED)

1. Audit all games first, then design one game per session.
2. Every game is designed as a **playable prototype in the planning chat first**. Lu plays it on phone or Mac and sends notes; it is revised until approved.
3. **New mechanics get short animated mockups before they are built** into the prototype (Lu's request after the first Stage 4 attempt).
4. The approved prototype plus its level table is saved to the repo as the spec.
5. Claude Code rebuilds it in the app on the shared kit; agent tests first, then Lu's play-test.

### The four tracks

| Track | What | Tier | State |
|---|---|---|---|
| A. Foundation decisions | Lineup, level ladder, scoring, look and feel, session wrapper, unlock model | Decisions | Lineup direction and ladder decided; the rest open (section 9) |
| B. Engineering baseline | Capture games schema into migrations, move scoring and XP to the server, one shared kit (pitch, players, timer, sound, haptics), analytics, tests | SACRED (schema, XP) | Not started |
| C. Games | One game per session: prototype, approval, spec, build, test | Mixed | Game 1 (Anticipation Arena) at prototype v3, v4 next |
| D. Games Unlock | Web checkout plus the paid-levels lock the app reads | SACRED (money, schema) | Not started |

---

## 3. Decisions made on Oct 9, 2026 (all DECIDED by Lu unless marked)

| # | Decision | Detail |
|---|---|---|
| 1 | Lineup direction = **A, soccer-reading core** | Paid depth goes into games where the player reads a real soccer situation (anticipation, decisions, patterns, scanning). Tracking and generic focus games become short warm-ups with no performance claims |
| 2 | Freemium | 5 free levels per game, the rest paid |
| 3 | Payment route | Unlock is bought in the **web app**, not inside the mobile app. Built as its own track alongside the games |
| 4 | Level ladder | **4 stages x 5 levels = 20 levels. Stage 1 is free.** One new thing per level |
| 5 | Navigation | Only the next level is open, no skipping. Passed levels can be replayed. Keep the simple layout Lu liked |
| 6 | Stage 4 control | **Swipe the defender**: up = step in, back = drop, across = slide |
| 7 | Stage 4 content | Live ball with no freeze, back four with real spacing, three situations (pass to feet, through ball, switch of play) mixed inside a level |
| 8 | Movement | Other players do small shuffles so the pitch feels alive. Focus stays on the player who earns the points. It must stay fair and clear |
| 9 | Teaching model | **Simple cues first for young and beginner players (plant foot), then more cues in advanced levels (hips, swing of the leg, scanning the situation), plus distance and trajectory variety** |
| 10 | Two-audience rule, for EVERY game | Each game teaches learning players a real reading technique AND gives experienced players a soccer challenge for reaction time and awareness |
| 11 | Look and feel of prototype | Approved: night-match design, colors, fonts, layout, sounds. The movement of the foot must stay clear at every level |
| 12 | Tips | Tips must follow the gradual process of the levels (built as Focus + Remember per level, and a results tip that adapts to the mistakes made) |
| 13 | Bilingual | EN/ES inside the game from the start |
| 14 | Parked by Lu | Later: 5 more variations inside each level. Later: more team-defending nuances |

Lu's guiding statement: these games are a foundation for players learning to read the game and apply techniques, for many clubs and coaches, not only PAC. The approach must be the best-supported one, not one club's method.

---

## 4. Evidence the design rests on

"Verified" = Claude opened the source in the planning session. "Research pass" = reported by a research sub-agent with the source listed, not re-opened.

| Skill | What research found | Strength | Status |
|---|---|---|---|
| Anticipation (action cut off, predict outcome) | Meta-analysis of 12 studies, 248 participants: large gains on video tests (d 1.26) and field tests (d 0.85). Publication-bias checks inconclusive | Moderate, best of the set | Verified: Muller et al. 2024, https://pmc.ncbi.nlm.nih.gov/articles/PMC11467115 |
| Decision-making ("what next") | Football review of 10 studies: 8 improved; on-field transfer rarely tested | Moderate in lab | Research pass: Zhao et al. 2022, https://www.frontiersin.org/articles/10.3389/fnhum.2022.945067 |
| Scanning (checking shoulders) | 27 Premier League players, 9,574 possessions: more scans before receiving went with slightly higher pass completion. Training it by app is unproven | Moderate link, weak trainability | Research pass: Jordet et al. 2020, https://pmc.ncbi.nlm.nih.gov/articles/PMC7573254 |
| Pattern recall | One small touchscreen study, better recall, no field test | Weak | Research pass: Schorer et al. 2018, https://frontiersin.org/articles/10.3389/fpsyg.2018.01260/full |
| Object tracking | 2025 follow-up with 62 academy players: no transfer to near tests or game performance | Contested, leaning weak | Verified: Romeas et al. 2025, https://pure.etsmtl.ca/en/publications/no-transfer-of-3d-multiple-object-tracking-training-on-game-perfo/ |
| Generic focus tasks (Stroop, math) | No evidence that generic executive-function training improves sport performance | Weak | Research pass: Furley et al. 2023, https://e-space.mmu.ac.uk/640234/1/Furley%20et%20al.%20%282023%29.%20A%20critical%20review%20of%20EF%20in%20sport_accepted.pdf |

### Cues for reading a kick or pass (asked by Lu: "what is the alternative to the plant foot?")

| Finding | Source (all verified) |
|---|---|
| Of 27 body cues on 126 penalty kicks, 5 predicted direction: plant-foot angle, hip angle as the kicking foot swings, and 3 whole-body patterns | Diaz 2010, https://news.rpi.edu/luwakkey/2745 |
| Most useful practical cues for goalkeepers: plant-foot direction, hip position, arm stretch | van de Koedijk 2018, https://lida.sport-iat.de/dfb/Record/4053940?lng=en |
| Near the ball, body cues matter most. Far from the ball, the pattern of players matters most | North, Hope and Williams 2016, https://researchonline.ljmu.ac.uk/id/eprint/20867/ |
| Rugby side-step: upper trunk and foot placement could be faked, centre of mass could not; experts watched the honest signal | Brault et al. 2012, https://pure.ulster.ac.uk/en/publications/detecting-deception-in-movement-the-case-of-the-side-step-in-rugb/ |

Consequences for the game:
- The plant foot is a well-supported first cue, not the only one. The model proposed was three looks: **Scan** (who is free, where the space is), **Shape** (plant foot and hips as he sets), **Strike** (swing of the leg). Lu's ruling (decision 9): start simple with the plant foot for beginners, add the other cues in advanced levels.
- These are penalty and rugby studies. Applying them to open-play passes is INFERRED.
- The supporting anticipation studies used real match video. A top-down animated version is INFERRED to help.
- Copy must not use absolutes. Prototype v3 tips say "Only the feet are honest" and "The feet tell the truth". Reword to "most reliable".

### Claims rule
Lumosity paid $2M in a 2016 FTC settlement over unproven brain-training claims (https://www.ftc.gov/news-events/news/press-releases/2016/01/lumosity-pay-2-million-settle-ftc-deceptive-advertising-charges-its-brain-training-program). Thryvyng may say "practise reading the game" and show in-app score gains. It may not say "proven to improve match performance, grades, attention or IQ".

### Market benchmarks (checked Oct 9, 2026)
| Product | Needs | Price |
|---|---|---|
| Soccer IntelliGym | Phone or desktop | $15.90 to $21.90 per month |
| Be Your Best | Meta Quest VR headset | $19 to $29 per month |
| Impulse (no soccer) | Phone | In-app purchases $6.99 to $49.99 |

INFERRED edge: none of these sits inside the club app the family, coach and team already use.

### Store rules for the web-payment route (checked Oct 9, 2026, re-check on the day of the decision)
- Apple: US-storefront apps may link out to an external purchase page. Sources conflict on Apple's fee (0% pending a court ruling vs 12% or 27%). One law-firm summary says in-app purchase must still be offered alongside for digital content. To verify on Apple's own pages.
- Google: developers in the US external-links program must report transactions and pay service fees from Oct 1, 2026 (https://support.google.com/googleplay/android-developer/answer/15582165?hl=en).
- Game levels are digital content, unlike registration payments, so the registration payment pattern cannot be copied as is.

---

## 5. Where the current games stand

Full code detail is in `docs/recon/games-audit.md`. Headline findings that shape the redesign:

| Finding | Evidence |
|---|---|
| 7 games exist: Field Vision, Pattern Play, Decision Point, Anticipation Arena, Pressure Protocol, Dribble Rush, Angle Master | audit section 1 |
| Level counts differ: Pattern Play 20, Angle Master 15, Dribble Rush 5 in code; the other four in the database. Hub shows "Level X/5" for all | audit section 3 |
| Three games ignore their database config while the level card still shows it | audit section 3 |
| No sound, no real haptics, no paywall code, no analytics, no tests, no translations | audit sections 4, 6, 7 |
| Daily-limit bypass is live in the shipped app: `minutesRemaining = 999` at `src/hooks/useCognitiveGames.ts:93` | audit section 4 |
| XP is computed on the device and passed to `award_xp_safe` | `src/hooks/useGameSession.ts:162` |
| Two games show scores like "450%" (raw points printed as percent) | `src/screens/GamePlayScreen.tsx:127` |
| Games schema is not in repo migrations | audit section 5 |
| Keep through any redesign: no flashing (seizure risk note in Pressure Protocol) | `PressureProtocolGame.tsx:240` |

### Visual audit (from Lu's 11 simulator screenshots, Oct 9, commit `3834065`)

| Game | What the screenshots show | Soccer link |
|---|---|---|
| Field Vision | Generic person icons, no teams or ball; two players overlap in the select phase; header says 2s while banner says 3s | Medium |
| Pattern Play | Real positions (GK, CB, RCM, ST) and a named scenario | Strong |
| Decision Point | Players bunched in one corner, most of the pitch empty; the described situation cannot be read from the picture in 5 seconds; stray unlabeled icon on the level card | Strong idea, weak picture |
| Anticipation Arena | Emoji ball on an empty pitch, no kicker, five unlabeled grey circles | Medium |
| Pressure Protocol | Number puzzle with a devil emoji | None |
| Dribble Rush | Pawn-shaped player; "PASS!" label wraps and is cut off; close button covers the timer | Arcade |
| Angle Master | Cleanest screen, abstract grid | Weak |

Shared problems: the app tab bar stays visible during play (Chat badge included), emoji are used as game art, each game draws its own pitch and players.

### Lineup per game (PROPOSED, not decided; Lu decided the direction only)

| Game | Proposed role under direction A |
|---|---|
| Anticipation Arena | Core. Rebuilt, prototype v3 exists |
| Decision Point | Core. Rebuild with full-pitch situations. Proposed as the next prototype |
| Pattern Play | Core. Already the strongest, polish and add movement |
| New scanning game | Core, new. No phone competitor found |
| Field Vision | Warm-up, or convert toward scanning |
| Angle Master | Warm-up, or reskin toward passing lanes |
| Pressure Protocol | Replace the number puzzle with soccer tasks under pressure |
| Dribble Rush | Arcade mode, decide later |

---

## 6. Anticipation Arena as built in prototype v3

### The core loop (stages 1 to 3, liked by Lu)
1. Setup: attackers (orange) and you, the white defender with a purple ring, appear on a half pitch seen from above. Your goal is at the bottom.
2. Watch: the passer takes a touch, plants a foot beside the ball, swings.
3. Freeze: play stops at a set moment of the swing. A gold bar counts down the time to decide. In later levels the passer is blacked out shortly after the freeze.
4. Tap the receiver you think gets the ball.
5. Reveal: the ball is played. Right answer: your defender steps into the lane and intercepts. Wrong answer: the ball reaches the receiver.
6. Tell: a gold dashed line from the plant foot to the real target, with a coach message that names the mistake.
8 reads per level. Pass mark 5 of 8. Stars: 5 = one, 6 = two, 7 or 8 = three. Points per correct read: 100 + up to 50 for speed + streak bonus. XP: (10 + 5 x level) x correct/8, +10 for a perfect level. Scoring and XP are placeholders until the shared scoring decision.

### Difficulty parameters (one table drives every level)
`recv` receivers, `sep` degrees between passing lanes, `freeze` point of the kick where play stops (1.0 = contact), `answer` ms to decide, `setup` ms before the kick, `kick` ms the kick takes, `spread` how neutral the run-up is (0 = body already aims at target), `move` receivers running, `headLie` / `shLie` chance the head / shoulders point at a decoy, `hold` ms the passer stays visible after the freeze (null = always), `trail` length of the swing-trail aid, `team` defenders you lead (stage 4 only).

| L | name | recv | sep | freeze | answer | setup | kick | spread | move | headLie | shLie | hold | trail | team |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Open Body | 2 | 64 | 1.00 | 4000 | 900 | 1500 | .10 | 0 | 0 | 0 | always | 4 | - |
| 2 | Third Man | 3 | 44 | 1.00 | 3600 | 850 | 1450 | .25 | 0 | 0 | 0 | 2000 | 4 | - |
| 3 | Early Cut | 3 | 44 | .80 | 3300 | 800 | 1400 | .45 | 0 | 0 | 0 | 1200 | 3 | - |
| 4 | Tight Lanes | 4 | 32 | .80 | 3000 | 750 | 1350 | .60 | 0 | 0 | 0 | 800 | 3 | - |
| 5 | On the Move | 4 | 32 | .72 | 2700 | 700 | 1300 | .75 | 1 | 0 | 0 | 450 | 2 | - |
| 6 | No-Look | 4 | 30 | .72 | 2500 | 650 | 1250 | .90 | 1 | .7 | 0 | 300 | 2 | - |
| 7 | Disguise | 5 | 26 | .64 | 2200 | 600 | 1200 | 1 | 1 | .7 | .6 | 250 | 1 | - |
| 8 | Elite Read | 5 | 24 | .58 | 1700 | 550 | 1150 | 1 | 1 | .8 | .8 | 150 | 0 | - |
| 9 | Nearest Man | 3 | 44 | .80 | 3600 | 850 | 1400 | .60 | 0 | 0 | 0 | 1200 | 2 | 3 |
| 10 | Four Across | 4 | 32 | .72 | 3200 | 800 | 1350 | .80 | 0 | 0 | 0 | 800 | 1 | 4 |
| 11 | Shifting Block | 4 | 32 | .72 | 2900 | 750 | 1300 | .90 | 1 | 0 | 0 | 450 | 0 | 4 |
| 12 | Full Picture | 5 | 26 | .64 | 2600 | 700 | 1250 | 1 | 1 | .6 | .4 | 250 | 0 | 5 |

Levels 9 to 12 are the rejected tap version of stage 4. Lu's verdict: not enough challenge, teammates too close, needs real scenarios, execution and a phone-game feel.

### What Lu approved in v2 and v3
- Bigger outlined boots, a swing trail behind the kicking foot that fades out by level, a white ring and thud when the plant foot lands, a flash at the strike.
- Levels grouped into named stages.
- Level card with New, Focus and Remember lines.
- Results tip that changes with the mistake: too slow, fooled by disguise, wrong lane.
- Sounds on every action; EN/ES switch.

### Art and build notes
- Top-down players: shoulders ellipse, head with a face patch showing gaze, visible legs and boots. Boots are the main cue, so they are bright, outlined, with a dark toe.
- Fonts: Barlow Condensed (display, italic for numerals) and Barlow (text). Colors: night navy ground, turf green, orange attackers, white-and-purple defenders, gold for tells and stars, green and red for right and wrong.
- No flashing anywhere.
- iPhone browsers cannot vibrate; haptics are designed but only proven on the real app later.

---

## 7. Prototype v4: what to build next (PROPOSED order, direction DECIDED)

1. **20 levels in 4 stages of 5**, Stage 1 free.
2. **Locked navigation**: only the next level open, passed levels replayable, one Continue button, simple layout (stage title with five tiles under it, four times). Keep an "unlock all" switch for Lu's review only.
3. **Stage 4 rebuilt as swipe**: live ball, no freeze; back four spread across the pitch; pick the defender and swipe up (step in), back (drop) or across (slide); purple reach ring shows how far he can travel before the ball arrives; bonus for swiping before the strike.
4. **Three situations mixed inside a level**: pass to feet, through ball, switch of play.
5. **Shuffles**: every player moves on their toes; only the passer and real runners make real moves; a shuffle never changes the right answer.
6. **Staged cues** (decision 9): plant foot only in the early levels; hips, swing and scanning added in later stages; draw the hips so they can be read from above.
7. **Variety**: speed, pass length and trajectory vary between the 8 reads of a level.
8. **Reword absolutes** in the tips ("most reliable", never "only the feet are honest").
9. **Tuning readout**: show accuracy and decision time per level so speeds are set from Lu's results.

### Proposed 20-level map (PROPOSED, not approved level by level)

| Stage | L | New thing |
|---|---|---|
| 1 Find the tell (free) | 1 | 2 options, freeze at contact, passer always visible |
| | 2 | 3 options |
| | 3 | Passer fades after the freeze |
| | 4 | 4 options |
| | 5 | Less time to decide |
| 2 Read it early (Pro) | 6 | Freeze before contact; hips introduced as a second cue |
| | 7 | Tighter lanes |
| | 8 | Passer hides sooner |
| | 9 | Receivers on the move, pass goes into their path |
| | 10 | Less time, swing trail off |
| 3 Beat the disguise (Pro) | 11 | No-look: head points at a decoy |
| | 12 | 5 options |
| | 13 | Closed shoulders |
| | 14 | Head and shoulders together |
| | 15 | Earliest freeze, least time |
| 4 Close the lane (Pro) | 16 | Swipe: pass to feet, pick the right man and step in |
| | 17 | Adds through balls (drop) |
| | 18 | Adds switches (slide) |
| | 19 | Attackers on the move |
| | 20 | Disguise and less time |

### Stage 4 mockup scenes (metres; x across a 44 m window, y up from your goal line)

| Situation | Ball | Target | Back four | Actor and action |
|---|---|---|---|---|
| Pass to feet | 24, 40 | striker at 19.5, 25 | 6,22 / 17.5,21 / 27,21 / 38,22 | Centre-back 2 steps in, cuts at 82% of the lane |
| Through ball | 20, 40 | space at 33.5, 11.5, runner from 30.5,24 | 6,22 / 16,21 / 25.5,21 / 38,22.5 | Centre-back 3 drops, cuts at 90% |
| Switch of play | 9, 37.5 | far winger at 40.3, 27 | 4.5,23.5 / 12.5,21.5 / 21.5,21.5 / 30.5,23 | Full-back 4 slides, cuts at 93% |

Fairness rules PROPOSED: pass mark stays 5 of 8; after two failed tries the next try gives a little more time and says so.

---

## 8. Engineering items the redesign depends on (from the audit; none started)

| Item | Tier |
|---|---|
| Capture the live games schema (7 tables + `award_xp_safe`) into numbered migrations | SACRED |
| Compute and validate score and XP on the server | SACRED |
| Decide the daily limit and remove the `999` bypass (candidate for 1.0.18) | Decision + ROUTINE |
| One score contract for all games (fixes the "450%" display) | ROUTINE |
| Shared kit: one pitch, one player style, timer, sound, haptics, full-screen play without the tab bar | ROUTINE |
| Analytics events and tests for scoring | ROUTINE |
| Translation layer for EN/ES | Own decision (i18n is parked app-wide) |
| Delete or supersede the stale `DRIBBLE_RUSH_AUDIT.md` at repo root | ROUTINE |

---

## 9. Open questions for Lu

1. Which level of prototype v3 first felt too hard? (asked twice, not answered)
2. Assist after two failed tries: yes or no? (PROPOSED)
3. Per-game lineup verdicts in section 5 (PROPOSED).
4. Remaining Track A decisions: scoring and XP rules shared by all games; session wrapper (first-play tutorial, results screen, streaks, daily limit, where the nutrition lens fits, proposed as a pre-session readiness check); unlock model (price, who pays, what is free beyond the 5 levels).
5. Which other team-defending nuances to add later.
