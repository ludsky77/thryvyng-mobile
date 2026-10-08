# Recon — Current date/time picker implementation (event forms + all reuse sites)

Date: 2026-10-07 · Branch: `main` @ `00e83e7` · Mode: READ ONLY (no source files touched)
Purpose: baseline map before replacing inline expanding spin pickers with an overlay
bottom-sheet + Done pattern (UI only, zero behavior change).

---

## 0. Headline

- **Library:** `@react-native-community/datetimepicker` — declared `^8.6.0` in
  `package.json:15`, installed `8.6.0` (`node_modules/.../package.json`), iOS pod
  `RNDateTimePicker` present (`ios/Podfile.lock:2457`). No other date/time picker
  library in the project. No Expo picker, no custom wheel.
- **There is NO shared wrapper component.** Every picker is a raw `<DateTimePicker>`
  written inline in the consuming file. 14 call sites across 5 files.
- **Two distinct existing UI patterns** (important — the refactor must not assume one):
  - **Pattern A — "inline expand"** (the target of the refactor): a `TouchableOpacity`
    row showing label + current value + ▲/▼ chevron; tapping it flips a local
    `*Expanded` boolean and the picker renders **in document flow, below the row**,
    inside a `CollapsibleSection` inside a `ScrollView`. Animated with
    `LayoutAnimation.configureNext(easeInEaseOut)`. **No Done button, no dismiss
    event handling** — `onChange` writes straight to state on every wheel settle.
  - **Pattern B — "field + picker + Done"** (DOB fields): a field-looking
    `TouchableOpacity` opens the picker via a `*PickerVisible` boolean; the picker
    renders inline but an explicit iOS-only **Done** `TouchableOpacity` is rendered
    under it, and `onChange` is a named handler that inspects
    `DateTimePickerEvent.type === 'dismissed'` and branches on `Platform.OS`.
    This is already closer to the intended end state.

---

## 1. File + line refs for each picker usage

### Event forms (primary scope)

| # | File | Line | Field | Mode | Pattern |
|---|------|------|-------|------|---------|
| 1 | [src/components/calendar/CreateEventModal.tsx:633](../../src/components/calendar/CreateEventModal.tsx#L633) | 633 | Event Date | `date` | A |
| 2 | [src/components/calendar/CreateEventModal.tsx:665](../../src/components/calendar/CreateEventModal.tsx#L665) | 665 | Start Time | `time` | A |
| 3 | [src/components/calendar/CreateEventModal.tsx:689](../../src/components/calendar/CreateEventModal.tsx#L689) | 689 | Arrival Time | `time` | A |
| 4 | [src/components/calendar/CreateEventModal.tsx:718](../../src/components/calendar/CreateEventModal.tsx#L718) | 718 | End Time | `time` | A |
| 5 | [src/components/calendar/CreateEventModal.tsx:810](../../src/components/calendar/CreateEventModal.tsx#L810) | 810 | End Repeat (recurrence) | `date` | A |
| 6 | [src/components/calendar/EditEventModal.tsx:390](../../src/components/calendar/EditEventModal.tsx#L390) | 390 | Event Date | `date` | A |
| 7 | [src/components/calendar/EditEventModal.tsx:418](../../src/components/calendar/EditEventModal.tsx#L418) | 418 | Start Time | `time` | A |
| 8 | [src/components/calendar/EditEventModal.tsx:444](../../src/components/calendar/EditEventModal.tsx#L444) | 444 | Arrival Time | `time` | A |
| 9 | [src/components/calendar/EditEventModal.tsx:473](../../src/components/calendar/EditEventModal.tsx#L473) | 473 | End Time | `time` | A |

Import sites: `CreateEventModal.tsx:19`, `EditEventModal.tsx:18` (default import only,
no type import).

### Other reuse sites (blast radius)

| # | File | Line | Field | Mode | Pattern |
|---|------|------|-------|------|---------|
| 10 | [src/components/chat/CreatePollModal.tsx:482](../../src/components/chat/CreatePollModal.tsx#L482) | 482 | Poll custom deadline — Date | `date` | A |
| 11 | [src/components/chat/CreatePollModal.tsx:516](../../src/components/chat/CreatePollModal.tsx#L516) | 516 | Poll custom deadline — Time | `time` | A (+`minuteInterval={30}`) |
| 12 | [src/screens/EditChildScreen.tsx:421](../../src/screens/EditChildScreen.tsx#L421) | 421 | Child date of birth | `date` | B |
| 13 | [src/screens/registration/JoinTeamScreen.tsx:3011](../../src/screens/registration/JoinTeamScreen.tsx#L3011) | 3011 | Claim-flow DOB | `date` | B |
| 14 | [src/screens/registration/JoinTeamScreen.tsx:3727](../../src/screens/registration/JoinTeamScreen.tsx#L3727) | 3727 | Player DOB (register) | `date` | B |
| 15 | [src/screens/registration/JoinTeamScreen.tsx:4000](../../src/screens/registration/JoinTeamScreen.tsx#L4000) | 4000 | Player DOB (confirm step) | `date` | B |

Import sites: `CreatePollModal.tsx:17`; `EditChildScreen.tsx:18` and
`JoinTeamScreen.tsx:16-18` additionally import `type DateTimePickerEvent`.

---

## 2. Component / library + props currently passed

### Pattern A props (event forms, poll deadline)

```tsx
<DateTimePicker
  value={<Date state>}
  mode="date" | "time"
  display={Platform.OS === 'ios' ? 'spinner' : 'default'}   // ← the only platform branch
  minimumDate={...}        // only on some; see table below
  maximumDate={...}        // only End Repeat
  minuteInterval={30}      // only CreatePollModal time picker
  onChange={(_, d) => { if (d) setX(d); }}
  textColor={colors.text /* '#ffffff' */}
  themeVariant="dark"
  style={styles.datePicker}  // only CreateEventModal End Repeat (bg #1e1e3a, marginTop 8)
/>
```

Per-site constraint props:

| Site | `minimumDate` | `maximumDate` | Notes |
|------|---------------|---------------|-------|
| CreateEventModal Date (633) | `new Date()` | — | computed fresh each render; **stale-at-midnight** is re-checked in `validate()` at :300-308 (see §4) |
| CreateEventModal Start/Arrival/End (665/689/718) | — | — | unconstrained; no `is24Hour`, no `locale` |
| CreateEventModal End Repeat (810) | `minEndRepeatDate` = eventDate + 1 day (`:430-434`) | `addMonths(new Date(eventDate), 2)` | |
| EditEventModal Date (390) | — | — | **deliberately no `minimumDate`** — past events are edited |
| EditEventModal times (418/444/473) | — | — | |
| CreatePollModal Date (482) | today @ 00:00:00 (IIFE) | — | |
| CreatePollModal Time (516) | — | — | `minuteInterval={30}`; `value={customDateTime}` (a derived `useMemo`, not the state itself) |

### Pattern B props (DOB)

```tsx
<DateTimePicker
  value={dobDate ?? new Date(2010, 0, 1)}     // or a dedicated *PickerDate state
  mode="date"
  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
  maximumDate={new Date()}
  minimumDate={MIN_PLAYER_DOB | MIN_SELF_REGISTER_DOB}   // JoinTeamScreen only
  onChange={onDobPickerChange}                 // named handler, inspects event.type
  textColor={colors.text} themeVariant="dark"  // JoinTeamScreen only
/>
```

**Note:** [src/screens/EditChildScreen.tsx:421-427](../../src/screens/EditChildScreen.tsx#L421-L427)
passes **no `textColor` and no `themeVariant`** — the only site that doesn't. Pre-existing
inconsistency, not introduced by the refactor.

### Platform branching — summary

- **Yes, one branch, repeated 14×, identical every time:**
  `display={Platform.OS === 'ios' ? 'spinner' : 'default'}`.
  iOS = wheel rendered inline; Android `'default'` = **OS-owned dialog**, which already
  overlays and already has its own OK/Cancel.
- **Pattern B adds a second branch** in the `onChange` handler and a third for the Done
  button: `if (Platform.OS === 'android') setVisible(false)` /
  `if (Platform.OS === 'ios') setVisible(false)` on dismiss /
  `{Platform.OS === 'ios' && visible ? <Done/> : null}`.
- Pattern A has **no** Android auto-close: on Android the OS dialog closes itself but the
  `*Expanded` flag stays `true`, so the row's chevron still reads ▲ and the (now
  invisible) picker element remains mounted. Pre-existing cosmetic drift.

---

## 3. State flow — field tap → state → submit payload

### CreateEventModal

```
STATE (all local useState, all Date objects for date/time):
  eventDate      : Date        = new Date()                        (:204)
  startTime      : Date        = today @ 16:00:00.000              (:205, getDefaultStartTime :96)
  arrivalTime    : Date        = startTime − 45 min                (:206, getDefaultArrivalTime :102)
  endTime        : Date        = startTime + 90 min                (:207, getDefaultEndTime :108)
  endRepeatDate  : string      = '' (YYYY-MM-DD, NOT a Date)       (:216)
  isAllDay       : boolean                                         (:208)
  dateExpanded / startTimeExpanded / arrivalTimeExpanded /
  endTimeExpanded / endRepeatExpanded : boolean                    (:224-228)

FLOW:
  tap row (:619-631)  [TouchableOpacity + subCollapsible row]
    → Keyboard.dismiss()
    → LayoutAnimation.configureNext(easeInEaseOut)
    → setXExpanded(!xExpanded)
    → picker mounts inline in flow (:633)
  wheel settles
    → onChange(_, d) fires PER SETTLE (no commit step)
    → setEventDate(d) / handleStartTimeChange(d) / setArrivalTime(d) / setEndTime(d)
    → endRepeat only: setEndRepeatDate(formatDateForPayload(d))  ← Date → string (:822-824)
  (no Done; the row stays expanded until tapped again or the modal closes)

SUBMIT (handleCreate :328):
  validate() :288  → on failure, setErrors + return (nothing sent)
  basePayload :333 :
    event_date  = formatDateForPayload(eventDate)   → "YYYY-MM-DD"  (:59, local getters)
    start_time  = isAllDay ? null : formatTimeForPayload(startTime) → "HH:mm" 24h (:67)
    arrival_time= isAllDay ? null : formatTimeForPayload(arrivalTime)
    end_time    = isAllDay ? null : formatTimeForPayload(endTime)
    is_all_day  = isAllDay
  if recurring (selectedDays.length>0 && endRepeatDate && onCreateRecurring):
    dates = calculateRecurrenceDates(formatDateForPayload(eventDate), endRepeatDate, selectedDays)  (:163)
    → onCreateRecurring({...basePayload, dates, recurrence_pattern: selectedDays.join(',')})
    → CalendarScreen.handleCreateRecurring (:451) → useCalendarEvents.createRecurringEvents (:177)
    → one generated recurrence_group_id, bulk insert into cal_events, ONE push for the series
  else:
    → onSubmit(basePayload) → CalendarScreen.handleCreateEvent (:446)
    → useCalendarEvents.createEvent (:123) → supabase.from(EVENTS_TABLE).insert({...})
    → notifyTeamOfEvent({ eventId, action:'created' })
  then onSuccess?.() → CalendarScreen.handleCreateSuccess (:458) → fetchEvents(), close
```

### EditEventModal

```
STATE: same four Date states, all initialised from the event row in a
  useEffect([visible, event]) (:112-133):
    eventDate = new Date(event.event_date + 'T12:00:00')   ← noon anchor, deliberate
    startTime/arrivalTime/endTime = parseTime(event.start_time|...) (:45)
      parseTime (:45) splits "HH:mm[:ss]" and sets those H/M on TODAY's date
      → the Date's CALENDAR DAY is today, not the event's day. Only H/M are ever read.
    *Expanded all reset to false on open (dateExpanded defaults false here, unlike Create)

FLOW: identical Pattern A to Create, except Start Time has NO cascade (:422-424 is a
  plain `if (d) setStartTime(d)`).

SUBMIT (handleSave :162):
  validate() :137 → setErrors + return on failure
  updatePayload: event_date = formatDate(eventDate) "YYYY-MM-DD";
                 start/arrival/end = isAllDay ? null : formatTime(x) "HH:mm";
                 updated_at = new Date().toISOString()   ← the ONLY ISO/UTC value written
  → supabase.from('cal_events').update(updatePayload).eq('id', event.id)   (direct, no hook)
  → changedFields = diffEventFields(event, updatePayload)   (src/lib/eventChangeSummary.ts)
  → onSuccess()
  → await confirmAndNotifyTeam({ event, eventId, action:'updated', changedFields })
```

### CreatePollModal (different shape — note for the refactor)

```
customDate : Date    (:104)  — date only
customTime : string  (:105)  = '18:00'  ← STRING, not Date
customDateTime : useMemo(() => timeStringToDate(customDate, customTime)) (:142)
  → this derived value is what the TIME picker's `value` prop receives (:517)
  → the time picker's onChange re-stringifies: setCustomTime(`HH:mm`)  (:521-529)
getClosesAt() (:114) → Date → poll `closes_at`
```

### Timezone handling — verdict

**Wall-clock only. Nothing in the event path is timezone-converted.**
- `formatDateForPayload` (`CreateEventModal.tsx:59`) / `formatDate` (`EditEventModal.tsx:54`) use `getFullYear/getMonth/getDate` (local
  getters, never `toISOString`) specifically to avoid the UTC day shift.
  Comment at `CreateEventModal.tsx:58`: "local date, no timezone shift".
- `formatTimeForPayload` (`CreateEventModal.tsx:67`) / `formatTime` (`EditEventModal.tsx:61`) use `getHours/getMinutes` → `"HH:mm"`.
- DB columns: `cal_events.event_date` (DATE) + `start_time`/`arrival_time`/`end_time`
  (TIME). No `timestamptz` for the event itself.
- The only ISO string written is `updated_at`.
- `EditEventModal.parseTime` and `new Date(event_date + 'T12:00:00')` deliberately use a
  noon/today anchor so no DST or midnight rollover can move the displayed day.

---

## 4. Side effects + validation rules found

### Side effects

1. **Start-time cascade (CREATE ONLY)** —
   [CreateEventModal.tsx:230-241 `handleStartTimeChange`](../../src/components/calendar/CreateEventModal.tsx#L230-L241):
   every start-time `onChange` **overwrites** arrival (= start − 45 min) and end
   (= start + 90 min), discarding any value the user already picked for them.
   Because Pattern A has no commit step, this fires on **every wheel settle** while the
   user is still scrolling. **EditEventModal has no cascade** (`:422-424`, a plain `if (d) setStartTime(d)`).
2. **Keyboard.dismiss() + LayoutAnimation** on every expand-row tap (all Pattern A rows).
3. `useEffect([eventType])` (`CreateEventModal.tsx:242`) clears `selectedDays` and
   `endRepeatDate` when the type leaves practice/club_event.
4. `useEffect([selectedDays.length, eventDate])` (`:249-257`) auto-seeds `endRepeatDate` to
   eventDate + 2 months when days are first selected, and clears it when days empty.
   **Changing the event date re-runs this** (only seeds if `endRepeatDate` is falsy).
5. `useEffect([visible])` (`:259`) resets every field **and every `*Expanded` flag** when
   the Create modal closes. EditEventModal's `useEffect([visible, event])` (`:112-133`) does
   the same on open.
6. Post-save notification side effects: `notifyTeamOfEvent` (create),
   `confirmAndNotifyTeam` + `diffEventFields` (edit). Diff-gated on the 10 fields in
   `COMPARED_FIELDS`, which includes `event_date`, `start_time`, `end_time`,
   `arrival_time`.
7. **Android**: the `*Expanded` flag is never reset when the OS dialog closes itself
   (Pattern A), so the chevron stays ▲. Pattern B handles this correctly.

### Validation rules

**CreateEventModal.validate() (`:288-326`)**
- `title` (or `opponent` for game/scrimmage) required.
- `eventDate` **cannot be in the past** — both dates floored to 00:00 local and compared.
  Explicit comment (`:300-301`): `minimumDate` can be stale if the modal is left open
  past midnight, so it is **re-checked at submit**.
- When `!isAllDay`:
  - `endMins <= startMins` → "End time must be after start time"
  - `arrivalMins > startMins` → "Arrival must be before start time"
  - Compared as **minutes-since-midnight** (`getHours()*60 + getMinutes()`), explicitly so
    that a picker carrying a different calendar day cannot skew it (`:310-311`).
- Soft gate: `isValid` (`:443`) = title/opponent non-empty — only disables the Save button.
- Recurrence: `dates.length === 0` → Alert "Invalid recurrence", abort.

**EditEventModal.validate() (`:137-158`)**
- Same title/opponent + same two minutes-since-midnight time rules.
- **No past-date check** — intentional, commented at `:144-145` (past events are edited to
  correct attendance/results).

**Pattern B (DOB)** — validation is in the `onChange` handler, not at submit:
`JoinTeamScreen.onPlayerDobPickerChange` (`:2411`) / `onClaimDobPickerChange` (`:2440`)
run `clampDate(date, MIN_*_DOB, new Date())` and then store `formatYmd(clamped)`, and clear
`formErrors.playerDOB`. `EditChildScreen` stores the raw Date and converts at save
(`dateToIsoDate(dobDate)`, `:291`).

---

## 5. Reuse list — every file importing `@react-native-community/datetimepicker`

**5 files, 14 call sites.** (`grep -rn "datetimepicker" src` — no other matches.)

| File | Sites | Pattern | In scope for the overlay refactor? |
|------|-------|---------|------------------------------------|
| `src/components/calendar/CreateEventModal.tsx` | 5 | A | **Yes — primary** |
| `src/components/calendar/EditEventModal.tsx` | 4 | A | **Yes — primary** |
| `src/components/chat/CreatePollModal.tsx` | 2 | A | Same pattern — would be the natural second wave, but is a different feature (polls) and uses a string time state |
| `src/screens/EditChildScreen.tsx` | 1 | B | Already field+Done; out of the stated goal |
| `src/screens/registration/JoinTeamScreen.tsx` | 3 | B | Already field+Done; registration flow — highest-risk to touch |

**Who mounts the event forms (second-order blast radius):**
- `CreateEventModal` ← [src/screens/CalendarScreen.tsx:31,1260](../../src/screens/CalendarScreen.tsx#L1260) (only consumer)
- `EditEventModal` ← [src/screens/EventDetailScreen.tsx:24,1684](../../src/screens/EventDetailScreen.tsx#L1684) (only consumer)
- Shared container: [src/components/CollapsibleSection.tsx](../../src/components/CollapsibleSection.tsx) — also used by other
  sections of both modals; it owns its own `expanded` state and `LayoutAnimation`.

**Automated test coverage of the picker UI: NONE.** The only test file in the repo is
[src/lib/eventChangeSummary.test.ts](../../src/lib/eventChangeSummary.test.ts) (pure diff logic, no rendering). There is no
Jest/RNTL setup for components, so the refactor has **no regression net besides device
testing**.

---

## 6. Risks the overlay refactor could plausibly break

Ranked.

1. **Nested `<Modal>` inside a `presentationStyle="fullScreen"` Modal (iOS).**
   `CreateEventModal` (`CreateEventModal.tsx:452`), `EditEventModal` (`EditEventModal.tsx:229`) and `CreatePollModal` (`CreatePollModal.tsx:266`)
   are each *already* a full-screen `Modal` wrapping a `KeyboardAvoidingView` +
   `ScrollView`, and **none of them currently nests a second Modal**. An overlay sheet
   implemented as a child `<Modal transparent>` is an untested configuration in this app on
   iOS — known RN issues: the inner modal mounting before the outer finishes its slide
   animation, backdrop touches falling through, and safe-area/inset loss. The repo's
   existing sheet precedent, [CantGoReasonModal](../../src/components/calendar/CantGoReasonModal.tsx) (`transparent` +
   `animationType="fade"` + backdrop), is mounted from a *screen*, not from inside another
   modal — so it is not proof this works nested. `InviteCoParentModal.tsx:308` carries a
   comment about deliberately not wrapping in SafeAreaView "(CreateEventModal,
   EditEventModal)" — there is existing insets fragility here.
   *Mitigation to evaluate: absolutely-positioned overlay `View` inside the existing Modal
   instead of a nested Modal.*

2. **Adding a Done/commit step changes WHEN the start-time cascade fires.**
   `handleStartTimeChange` (`CreateEventModal.tsx:230`) clobbers arrival and end on every
   `onChange`. Today that means "while scrolling". If the sheet buffers into a draft value
   and only commits on Done, the cascade fires once instead of N times — and if a user
   edits start *then* arrival, the ordering of clobbers changes. If the sheet instead
   writes through on every settle, Cancel/backdrop-dismiss cannot truthfully revert.
   **This is the single place where "UI only, zero behavior change" is hardest to hold.**
   Decide explicitly: write-through (behavior preserved, Done is cosmetic) vs. draft+commit
   (cleaner UX, cascade timing changes).

3. **Android already gets an OS dialog; a second overlay would double-wrap it.**
   `display='default'` on Android opens the platform picker dialog. Wrapping that in a
   custom sheet + Done button yields a sheet containing nothing visible plus an OS dialog
   on top, and two dismiss paths. The Android branch needs its own handling (likely: keep
   the current visible-flag approach, add the missing `setExpanded(false)` on dismiss, and
   apply the sheet to iOS only).

4. **Dismiss events are currently unhandled in Pattern A.** Pattern A's
   `onChange={(_, d) => { if (d) setX(d); }}` ignores `event.type`. A Done/Cancel sheet
   must start consuming `DateTimePickerEvent` (as Pattern B does at
   `EditChildScreen.tsx:250`, `JoinTeamScreen.tsx:2411/2440`) or Android cancels will
   silently behave as "no change but sheet left open".

5. **Collapsible summary strings and `*Expanded` state are load-bearing.** The
   `CollapsibleSection` `summary` props read the live Date state
   (`CreateEventModal.tsx:616`, `EditEventModal.tsx:373`), and the `*Expanded` flags are
   reset in the visible/open effects (`CreateEventModal.tsx:259`,
   `EditEventModal.tsx:112`). Replacing expand-booleans with sheet-visibility booleans
   must keep those resets, or a reopened modal can mount with a sheet already showing.

6. **Date→string asymmetry at two call sites.** `endRepeatDate` is a **string**
   (`CreateEventModal.tsx:216`) converted at `onChange` time (`:822-824`), and
   `CreatePollModal.customTime` is a **string** whose picker `value` is a derived `useMemo`
   (`:142`, `:517`). A generic sheet component typed `value: Date; onChange: (d: Date) =>
   void` will not drop into those two without adapters.

7. **`minimumDate={new Date()}` is computed at render.** Today a re-render refreshes it and
   `validate()` re-checks at submit (`:300-308`). If the sheet memoises props or holds a draft
   across a long-open modal, re-verify the past-date guard still fires — the submit-time
   check is the real guard and must not be bypassed.

8. **No component test net.** Only `src/lib/eventChangeSummary.test.ts` exists; there is no
   RNTL/Jest component setup. Every claim about the refactor will have to be device-proven,
   and the EditEventModal notify diff (`diffEventFields`, HH:MM normalisation) must be
   re-smoked because it is sensitive to the exact `"HH:mm"` string the form produces.

9. **`LayoutAnimation` removal.** Both modals call
   `UIManager.setLayoutAnimationEnabledExperimental(true)` at module scope
   (`CreateEventModal.tsx:26-30`, `EditEventModal.tsx:27-31`) and `CollapsibleSection.tsx:14-18`
   does too. If sheet rows stop calling `LayoutAnimation.configureNext`, the remaining
   `CollapsibleSection` animations still depend on that flag — don't remove the enabling
   block with the row code.

10. **Cosmetic inconsistency to not "fix" silently.** `EditChildScreen.tsx:421` omits
    `textColor`/`themeVariant`; `CreateEventModal.tsx:726` has a mis-indented
    `themeVariant` (End Time picker). Both are pre-existing; a UI-only refactor that normalises them would be
    a visual change on the DOB screen.

---

## 7. Baseline for comparing the refactor

Recorded 2026-10-07 on `main` @ `00e83e7`, before any change:

- `npx tsc --noEmit` → **70 pre-existing errors**, **0 of them in any of the 5 picker
  files** (`CreateEventModal`, `EditEventModal`, `CreatePollModal`, `EditChildScreen`,
  `JoinTeamScreen`). So "0 new tsc errors" is a meaningful gate for this refactor, and the
  picker files must stay at zero.
- No component test suite exists; `src/lib/eventChangeSummary.test.ts` is the only test
  file and does not render any picker.
- `git status` clean apart from this doc — no source file was modified by this recon.

---

## 8. Ambiguities for Lu (not blocking this recon)

- **Scope of "event forms":** Create + Edit (9 sites) only, or also `CreatePollModal`'s 2
  Pattern-A sites? They share the exact same expand pattern, so leaving them out means two
  picker idioms coexist.
- **Cascade semantics (risk 2):** write-through or draft+commit? This decides whether
  "zero behavior change" is literally true.
- **Android:** sheet on iOS only (keep the OS dialog), or a custom wheel on both?

---

# Implementation notes — overlay sheet refactor (2026-10-08)

Appended after the build. The sections above describe the **pre-refactor** state and are
left unedited as the baseline; this section records what changed.

## What was built

- **New:** [src/components/common/DateTimeSheet.tsx](../../src/components/common/DateTimeSheet.tsx) — one shared overlay picker with
  Cancel / label / Done, draft+commit semantics, and an Android branch that keeps the OS
  dialog. 227 lines.
- **All 11 Pattern-A sites converted** (9 event-form + 2 poll). Pattern-B DOB sites
  (EditChildScreen ×1, JoinTeamScreen ×3) were **not touched** — no shared code forced it.
- `<DateTimePicker>` is now imported in exactly one file. Hosts import `DateTimeSheet`.

## STEP 0 finding — the cascade was FLAT

Verified at `CreateEventModal.tsx:230-241` before building: `handleStartTimeChange`
hardcoded `-45` / `+90` with **no `eventType` branch**. The only `eventType` branches in
the file were recurrence gating (`:243`) and `isGameOrScrimmage` (`:286`). Recon was
correct; Lu's per-type table was therefore implemented as a spec correction.

`START_OFFSETS_BY_TYPE` now single-sources the offsets:

| event_type | arrival | end | source |
|---|---|---|---|
| `game` | start − 45 min | start + 1 h 30 | Lu's table |
| `scrimmage` | start − 45 min | start + 1 h 30 | inferred — game-shaped everywhere else in the file (`isGameOrScrimmage`) |
| `practice` | start − 10 min | start + 1 h 15 | Lu's table |
| `other_event`, `club_event` | start − 45 min | start + 1 h 30 | unspecified → kept the old flat values, so no behaviour change where the spec is silent |

**Two interpretation calls worth Lu's eye:**

1. The table feeds **both** the cascade and the mount defaults
   (`getDefaultArrivalTime` / `getDefaultEndTime`). A fresh form opens on `practice`, so an
   untouched Create form now defaults to arrival 15:50 / end 17:15 for a 16:00 start,
   where it used to be 15:15 / 17:30. Making only the cascade type-aware would have left
   the form self-contradicting (a Practice event created without opening the Start sheet
   would have kept Game offsets). One-line revert if Lu wants the old defaults back.
2. **Changing event type after setting start does NOT re-apply the offsets.** Re-deriving
   on type change would clobber arrival/end the user had already overridden, and it was
   not requested. So the offsets apply when start is committed, not retroactively.

## Semantics

- **Draft + commit.** The wheel writes a local draft inside the sheet. `onDone` is the only
  moment form state changes; `onCancel` and a backdrop tap discard the draft.
- **The cascade fires once**, on Done. Previously it ran on every wheel settle, so
  scrolling 4pm → 7pm clobbered arrival and end at every intermediate hour.
- **Sequence:** Start's Done reads "Next: End" and advances the sheet to End; every other
  field's Done closes it. Implemented on **both** event forms. Date → close and
  End Repeat → close, because Lu's spec only named Starts → Ends.
- **Edit form has no cascade**, as before: Start's Done commits start only, then advances.
- **Android** keeps `display="default"` (the OS dialog) and gets no custom sheet.

## Risk register — how each recon §6 risk landed

| # | Risk | Outcome |
|---|---|---|
| 1 | Nested `<Modal>` on iOS | **Avoided.** The sheet is an absolutely-positioned `View` mounted as the last child of each host's `KeyboardAvoidingView`, inside the host's existing Modal. No new Modal surface anywhere. |
| 2 | Cascade timing | **Addressed by design.** Draft+commit means it fires once. This is a deliberate behaviour change (fewer clobbers), recorded here rather than hidden. |
| 3 | Android double-wrap | **Avoided.** iOS-only sheet; Android path renders the bare picker. |
| 4 | Dismiss events unhandled | **Fixed.** The Android branch inspects `event.type === 'dismissed'` and calls `onCancel`, which clears the host's `sheetField`. |
| 5 | Summary strings / `*Expanded` resets load-bearing | **Preserved.** All `CollapsibleSection summary` props are untouched. The five (Create) / four (Edit) / two (Poll) booleans collapsed into one nullable `sheetField`, reset in the same close/open effects. |
| 6 | String-typed state (`endRepeatDate`, `customTime`) | **Handled with call-site converters.** Stored shapes unchanged: `endRepeatDate` stays `"YYYY-MM-DD"` via `formatDateForPayload`, `customTime` stays `"HH:mm"`. The poll time sheet still reads the existing `customDateTime` memo. |
| 7 | `minimumDate={new Date()}` computed at render | **Still fresh** — `sheetConfig` is recomputed every render. The real guard, `validate()`'s submit-time past-date re-check, was not touched. |
| 8 | No component test net | **Still none.** Nothing was added; this refactor is device-verify-only. The `diffEventFields` HH:MM contract is unaffected because `formatTime` is untouched. |
| 9 | `LayoutAnimation` removal | **Enabling blocks kept** (`CreateEventModal.tsx:26-28`, `EditEventModal.tsx:27-29`), since `CollapsibleSection` still animates. Only the now-unused `LayoutAnimation` *import* was dropped from the two hosts. |
| 10 | Don't silently normalise DOB sites | **Respected.** Pattern-B files were not opened. `EditChildScreen`'s missing `textColor`/`themeVariant` is still missing, by choice. |

## Deliberate non-changes

- Submit payloads, `formatDateForPayload` / `formatTimeForPayload` / `formatDate` /
  `formatTime`, every `validate()` rule, and all notify logic
  (`notifyTeamOfEvent`, `confirmAndNotifyTeam`, `diffEventFields`) are byte-identical.
- `new Date(endRepeatDate)` on a `"YYYY-MM-DD"` string still parses as **UTC midnight**,
  so in negative-offset zones it can render the previous day. Pre-existing; carried over
  verbatim rather than fixed inside a UI-only change. Worth its own ticket.
- The sheet uses a fixed `paddingBottom: 28` instead of `useSafeAreaInsets()`, because
  insets read from inside a full-screen Modal are the exact fragility
  `InviteCoParentModal.tsx:308` documents.

## Visible UI changes beyond "same picker, new container"

1. **Create's Date field no longer starts open.** `dateExpanded` defaulted to `true`, so
   the form used to open with an inline date spinner already showing. Nothing is open now.
2. Mount defaults for Practice shifted — see interpretation call 1 above.
3. Chevrons now reflect "this field's sheet is open" rather than "this row is expanded".

## Still to do

- **Device pass on iOS and Android** for all 11 sites. Specifically: the overlay inside
  each of the three host Modals, the Start → End advance, backdrop-tap discard, and the
  Android dismiss path now clearing the chevron.
- Decide whether the poll's Date → Time should also chain (left unchained; Lu's spec
  scoped sequencing to event forms).
