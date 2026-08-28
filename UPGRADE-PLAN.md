# Planner v2 — Upgrade Plan

A concept document, not an implementation guide. It describes what the app
should become and why. No code decisions are locked in here.

**Status:** draft for review. Nothing in this document has been built.

---

## 1. The idea in one paragraph

Today the app is five fixed tabs that everyone gets. v2 turns it into a planner
you assemble yourself: a small set of pages, each built from blocks you choose,
with a bottom tray you arrange. The reference point is Notion, but deliberately
simpler — Notion gives you an empty canvas and expects you to be a designer.
This gives you a shelf of finished, purpose-built parts that already know they
belong to a school planner. You pick parts; you never start from nothing.

The line to hold: **customizable, not open-ended.** Every block is opinionated
and does one job well. The freedom is in *which* blocks and *where*, not in
building a block from primitives.

---

## 2. What makes it different: the context layer

This is the most important idea in the document, and the thing that separates
it from every other planner.

The app already knows things most apps don't:

- what time it is in the school's timezone
- which bell schedule today uses (regular, late start, minimum day, finals)
- which block you are in right now, or whether you're in passing period,
  lunch, break, or done for the day
- which class sits in each period, with its room and teacher
- what you owe and when it's due

Almost nothing in the current app *uses* that knowledge. v2 should. The rule
for every block:

> If the app can reasonably guess what you meant, it should guess — and let
> you override in one tap.

The canonical example is the Add Homework button. You are in 3rd period Chem.
You tap Add Homework. The class field should already say **Chem**. If you tap
it during passing period, it should say the class you just walked out of, not
the one you're walking into — because you're writing down what was just
assigned. If you tap it at 7pm, it should offer the classes you actually had
today. That single behavior removes a dropdown from the most common action in
the app.

Every block below has a **Smart:** line. That line is the reason the block
exists rather than being a generic list.

**A guess must never be silent or sticky.** Show what was picked, make it
obviously editable, and don't "learn" a wrong guess into a permanent default.

---

## 3. First run

### 3.1 Onboarding

A short walkthrough — four or five screens, skippable, re-openable from
Settings. It should teach, not sell.

1. **What this is.** One screen. A planner that knows your bell schedule.
2. **Your school.** Pick the school → the bell schedule loads. (See §7.)
3. **Your classes.** Fill periods 1–5. Room and teacher optional. This is the
   single highest-value setup step, because it's what powers the context layer.
4. **Template or scratch.** The fork described in §4.
5. **Put it on your home screen.** Platform-aware instructions (§3.2).

Design notes:
- Progress should be visible, and every step skippable, with skipped steps
  surfaced later as a gentle "finish setting up" card rather than a nag.
- Nothing should block on network. Onboarding works fully offline.
- Someone who skips everything still lands on a working default planner.

### 3.2 Add to Home Screen

This matters more than it looks. Installed PWAs get more durable storage than a
plain browser tab, which is exactly what an app that keeps your data locally
needs. It's also the difference between "a website I visit" and "an app I have".

Detect the platform and show only the relevant path:

- **iOS Safari** — Share → Add to Home Screen. Must call out that it only works
  in Safari; Chrome on iOS can't do it. Show the actual share icon in the
  instructions so it's findable.
- **Android Chrome** — offer the native install prompt directly if the browser
  gives us one; fall back to menu → Install app / Add to Home Screen.
- **Desktop** — a quiet mention, not a wall. Install icon in the address bar.

Show it once at the end of onboarding, then make it available in Settings.
Never show it again automatically once the app is running installed.

---

## 4. Template or scratch

The choice right after onboarding, on its own screen.

### Start with a template

A selection UI showing **5 options; you pick 4.** The fifth slot in your tray
is always the **Empty** block-page — deliberately blank and fully customizable,
so that from the first minute you can see the app is made of parts you control.
That empty slot is a teaching device, not filler.

The five options are the app's current five sections:

| Option | What it is today |
| --- | --- |
| Calendar | Month grid plus what's on the selected day |
| Schedule | Today's bell schedule, live countdown, your classes and periods |
| Tasks | All homework and projects grouped by deadline |
| Focus | Timed study sessions with the phone locked out |
| Home | The hub — currently the live class card plus what's due |

Home is always present regardless (see §5), so in practice the picker chooses
which of the other four sections come pre-built. The picker should preview each
one — a small live thumbnail beats a description.

### Create from scratch

Straight to an empty tray with only Home, and the block picker open. This path
should feel fast and encouraging, not like an empty room. Offer page templates
(§6) prominently so "from scratch" doesn't mean "from nothing".

**Neither choice is permanent.** Anything a template gives you can be edited,
removed, or added later. Say so on the screen, so the choice feels low-stakes.

---

## 5. Pages and the bottom tray

- The tray holds **up to 7 sections**.
- **Home is always in the tray** and cannot be removed — but it is fully
  customizable like any other page. It's a fixed slot, not fixed content.
- Every tray item gets a **custom icon** and a custom name.
- Tray items can be **reordered** by drag.
- The tray should stay legible at 7 items on a small phone. Below a certain
  width that likely means icon-only with labels on the active item, or a
  slightly scrollable tray. This is a real design constraint, not an
  afterthought — 7 labelled items at 320px is tight.

Each page is a vertical stack of blocks. Pages are independent; the same block
type can appear on several pages with different settings.

### Edit mode

A distinct mode, entered deliberately (long-press the tray, or a pencil in the
top bar). In edit mode:

- blocks show drag handles and a remove affordance
- a **+ Add block** target sits at the end of the stack
- tapping a block opens its settings
- an obvious **Done** exits

Outside edit mode the page is completely inert to rearrangement — no accidental
drags while scrolling. This separation is what keeps a customizable app from
feeling fragile.

### The design menu

The block picker. It should feel like a shelf, not a database:

- grouped by category (§8), searchable
- each entry shows a **live preview using your real data**, not a generic mock
- blocks already on the page are marked, not hidden
- recently used and most-used float to the top

---

## 6. Page templates

Pre-made pages, so nobody has to assemble a good page from scratch. Each is
just a named stack of blocks with sensible settings — the same thing a user
could build by hand.

Starting set:

- **Today** — live class timer, what's due, quick add
- **Homework Hub** — add button, all tasks, overdue, by-class breakdown
- **This Week** — week calendar, workload meter, upcoming tests
- **Study** — focus session, notes, flashcards, break reminders
- **Grades** — grade tracker, GPA, what-if calculator
- **Class Page** — everything for one class: schedule slot, its homework, its
  notes, its links. Duplicated per class.
- **Minimal** — a class timer and one task list. For people who want almost
  nothing.
- **Empty** — the blank canvas.

Applying a template to an existing page should preview first and be undoable.

---

## 7. Settings — school and schedule import

> **Not being built now.** Recorded here so the design leaves room for it.

The Settings tab should let you choose your school, and have the bell schedule
arrive with it. Today `bell.js` hardcodes one school (Del Norte).

**Goal:** every middle school and high school in Poway Unified pre-loaded, with
schedules transcribed from the district's official pages, so a student picks
their school and is immediately done.

Schools in PUSD, from the district's own school listing (verified Aug 2026):

**High schools** — Del Norte, Mt. Carmel, Poway, Rancho Bernardo, Westview,
Abraxas (continuation), Poway to Palomar Middle College. (Poway Adult School is
also listed but is out of scope.)

**Middle schools** — Bernardo Heights, Black Mountain, Design39Campus,
Meadowbrook, Mesa Verde, Oak Valley, Twin Peaks.

That's roughly 13 schools in scope. Considerations for whenever this is picked
up:

- Schedules change every school year. This needs a yearly refresh path and a
  visible "schedule last updated" date, or it silently rots.
- Bell schedules are published as PDFs and web pages in inconsistent formats.
  Transcription is manual work; budget for it honestly.
- Middle schools may have period structures that don't fit the current fixed
  1–5 model. The data model must allow a variable number of periods, and
  probably named blocks rather than numbered ones.
- Some schools run split lunches (A/B), block/rotating days, or advisory
  periods. The schema should anticipate this even if v1 of the importer
  doesn't handle it.
- Worth offering a **manual/custom school** option as a first-class path, not a
  fallback — it makes the app useful outside PUSD and avoids blocking anyone
  whose schedule is unusual.
- A **schedule sharing code** (one student sets it up, shares a code with
  classmates) would sidestep a lot of transcription work. Worth considering.

---

## 8. The block library

### 8.1 Coverage check — does the library cover the app as it exists today?

Audited against every view, panel, and action in the current build. The
library must be a superset of what exists now, or the rebuild in phase 1
(§13) would lose functionality.

| In the app today | Covered by |
| --- | --- |
| Calendar: month grid with coloured dots | 32 Month Calendar |
| Calendar: weekday header, month arrows, swipe, tap-title-for-today | 32 Month Calendar (behaviours of the block, not separate blocks) |
| Calendar: selected-day agenda | 37 Day Detail |
| Calendar: "Overdue" section | 22 Overdue Only |
| Calendar: "Upcoming" (next 6 within 3 weeks) | 34 Agenda |
| Schedule: live countdown hero | 1 Class Timer (Live) |
| Schedule: today's blocks, current highlighted / past dimmed | 2 Today's Bell Schedule |
| Schedule: plan name + "Change" override | 8 Today Is Different |
| Schedule: "Classes & periods" list, P1–5 + spare classes | **3 Class Schedule** |
| Schedule: "New class" row, edit class, colour picker | **3 Class Schedule** (its management actions) |
| Schedule: period → room + teacher sheet | **3 Class Schedule** / 12 Where Am I Next |
| Class view: one class's Homework panel | 20 Homework by Class, **4 Class Card** |
| Class view: one class's Notes panel | 41 Class Notebook, **4 Class Card** |
| Home: hero link to schedule | 1 Class Timer (Live) |
| Home: "Add homework" button | 14 Add Homework Button |
| Home: Note / Project / Date chips | 15 Master Add Button, 58 Shortcut Row |
| Home: "Do tonight" (due tomorrow) | 19 Do Tonight |
| Home: "Still due" (due today or late) | **18 Still Due** |
| Tasks: six deadline groups with counts | 16 All Tasks |
| Tasks: due chips, overdue in red | 16 All Tasks, 22 Overdue Only |
| Tasks: check to complete, stays in place | 21 Quick Complete |
| Tasks: project status cycle (todo → doing → done) | 30 Long-Term Projects |
| Tasks: "New task" row | 15 Master Add Button |
| Focus: steppers, summary, start | 48 Focus Session |
| Focus: session screen, hold-to-stop, phone lock | 48 Focus Session (a mode, see §12) |
| Notes (all) | 40 My Notes |
| Important dates / events | 35 Important Dates |
| Sync status and controls | **60 Sync Status** |
| Theme toggle | **61 Theme Switch** |

**Gaps this audit found and fixed** (bold above): Class Schedule, Class Card,
Still Due, Sync Status, and Theme Switch were missing from the first draft.
Class Schedule is the notable one — it's one of the app's main surfaces today
and was named as an example block in the brief.

**Deliberately not blocks.** Some current things are app-level furniture, not
page content: the top bar, the bottom tray itself, the sheet/form system, the
update banner, offline caching, and the two-day auto-clear of finished
homework. These stay global.

### 8.2 The library

**65 blocks.** Each has a **Smart:** line — the specific behaviour that makes
it worth choosing over a generic list.

#### Live time and schedule

1. **Class Timer (Live)** — the big countdown for the block you're in right
   now, with the class name you assigned rather than "Period 3", and the room
   underneath. The centrepiece block; most people's Home starts here.
   **Smart:** it never goes dead. It flips itself between class, passing
   period, lunch, break, before-school and after-school on its own, always
   naming what comes next, so a glance answers "how long have I got" in every
   state of the day rather than just during a lesson.

2. **Today's Bell Schedule** — every block of today in order, with times, your
   class names, rooms and teachers, the current block highlighted and finished
   ones dimmed.
   **Smart:** it scrolls itself to the current block when you open the page and
   fades what's already over, so the part you need is where your eyes land
   instead of at the top of a list you have to read past.

3. **Class Schedule (Classes & Periods)** — your timetable as a persistent
   list: periods 1–5 (or however many your school runs), each with its class,
   room and teacher, plus any class you have that isn't tied to a period.
   Tapping a period opens that class; tapping an empty one asks what goes
   there. This is where classes are created, coloured and edited.
   **Smart:** it's defined once and mapped onto whatever bell schedule the day
   happens to use — so a late-start Wednesday, a minimum day and a finals day
   all show your real class names at their real times without you maintaining
   a separate timetable for each.

4. **Class Card** — one class, in full: when it next meets, its room and
   teacher, its open homework, its recent notes, and its links. Add one per
   class, or drop a single card on a page for the class you're struggling with.
   **Smart:** it knows when that class next meets and says so in plain terms
   ("next: tomorrow, 2nd period"), which turns an abstract pile of homework
   into a deadline you can feel.

5. **Next Up** — one compact line: what's next, how long until it starts, and
   where it is. The smallest useful block in the library.
   **Smart:** during your last block of the day it stops pointing at a class
   that doesn't exist and counts down to dismissal instead — the difference
   between a block that's right all day and one that's wrong after 2pm.

6. **Period Progress Ring** — a circular progress indicator for the current
   block, showing how much of it has elapsed. Visual rather than numeric.
   **Smart:** the ring is drawn in the colour you gave that class, so you can
   read which class you're in from across the room without reading any text.

7. **Week At A Glance** — the next five school days in a strip, each showing
   what kind of day it is and how much is due.
   **Smart:** it marks minimum days, finals, late starts and no-school days
   automatically from the bell calendar, so the odd days in a term stop being
   surprises you find out about the morning of.

8. **Today Is Different** — override today's bell schedule when something
   unscheduled happens: an assembly, a rally, an unexpected minimum day.
   **Smart:** it puts the likely alternates first rather than making you hunt a
   list, and it expires on its own at midnight, so a one-off change can never
   silently corrupt tomorrow.

9. **Countdown To…** — a large countdown to a date you care about: a break, a
   trip, finals, the last day.
   **Smart:** it offers the real milestones already known from the school
   calendar instead of opening a blank date picker, so setting one up is a tap
   rather than a lookup.

10. **Time Until Free** — how long until your last class ends.
    **Smart:** it also tells you how many classes are left, which is the number
    people actually want by sixth period — "1h 40m" means much less than
    "two classes left".

11. **Lunch Timer** — how much of lunch is left.
    **Smart:** it only appears on days that actually have a lunch block, and on
    schools with split A/B lunches it follows the one you're assigned to, so
    it's never counting down someone else's lunch.

12. **Where Am I Next** — the room and teacher for your *next* block, in large
    type.
    **Smart:** it deliberately shows the next room rather than the current one,
    because the only moment anybody needs this is the four minutes when they're
    walking between two rooms.

13. **Bell Schedule Comparison** — two schedule types side by side.
    **Smart:** it highlights only the rows that differ, answering "how is a
    minimum day actually different" in one glance instead of making you compare
    two lists by eye.

#### Homework and tasks

14. **Add Homework Button** — the most-used action in the app, as a single
    large target.
    **Smart:** the class is filled in before you get there. It uses the class
    you're in; during passing period, lunch or break it uses the class you just
    walked out of, because that's when work gets assigned; after school it
    offers the classes you actually had today. The guess is always visible and
    always one tap to change — it removes a dropdown from the thing you do most
    without ever silently filing something wrong.

15. **Master Add Button** — one button for all four types: homework, note,
    project, date.
    **Smart:** it orders the type list by what you actually add most, and takes
    the date from the page you're standing on — if you're looking at next
    Tuesday on a calendar, the new item defaults to next Tuesday rather than
    to today.

16. **All Tasks** — everything unfinished, homework and projects together,
    grouped by deadline: Overdue, Today, Tomorrow, This week, Later, Done.
    **Smart:** overdue floats to the top with a day count in red and nothing
    else is allowed to compete for that attention; finished items drop to the
    bottom only on the next open, so checking something off never makes the
    list jump under your finger.

17. **Due Today** — only what's due today, nothing else.
    **Smart:** when it's empty it says so as a small reward rather than showing
    a blank card — an empty state that means "you're done", which is the one
    piece of good news a planner can give you.

18. **Still Due** — everything not finished that's due today *or* already late,
    in one list. The "what do I owe right now" block.
    **Smart:** it merges today and overdue deliberately, because at 4pm the
    distinction doesn't matter — both are things you have to do tonight.
    Late items still carry their day count so the damage is visible.

19. **Do Tonight** — what's due tomorrow, which is what you actually have to do
    this evening.
    **Smart:** it hides itself during the school day and appears after a time
    you choose, so it isn't taking up space at 9am when it's useless and is
    waiting for you at 4pm when it isn't.

20. **Homework by Class** — open work grouped under each class.
    **Smart:** the classes are ordered by your period order, not alphabetically,
    so the list has the same shape as your day and you can read it in the order
    you'll live it.

21. **Quick Complete** — a stripped-down checklist with large tap targets, for
    burning down a list fast.
    **Smart:** checking an item leaves it exactly where it is, crossed out,
    with a brief undo — so a mistap costs nothing and the list never reshuffles
    while your finger is still moving.

22. **Overdue Only** — the nag block, and nothing but.
    **Smart:** it removes itself from the page entirely when nothing is
    overdue, so it's pure signal: if you can see it, something is wrong, and
    you never learn to ignore it.

23. **Assignment Spotlight** — one assignment shown large, with its details and
    a complete button.
    **Smart:** it auto-pins whatever is nearest due unless you pin something
    manually, so it's useful before you've configured it and obedient after.

24. **Workload Meter** — how heavy the next seven days look, as a single
    readable measure.
    **Smart:** it weights by how long that class's work has actually taken you
    before rather than counting items, so five maths problems and a five-page
    essay don't register as the same load.

25. **Subtasks** — break one assignment into steps and tick them off.
    **Smart:** the parent assignment completes itself when the last step is
    checked, so there's no double bookkeeping and no assignment left "open"
    because you forgot to close it after finishing the work.

26. **Recurring Homework** — standing work, like "read 20 minutes nightly".
    **Smart:** it regenerates on school days only, skipping weekends, holidays
    and breaks straight from the bell calendar, so it never guilt-trips you on
    a day you were never expected to work.

27. **Turn-In Reminder** — a nudge to actually hand something in, which is a
    different failure from not doing it.
    **Smart:** it fires on the morning it's due *and* again at the start of the
    period that class actually meets, which is the exact moment the physical
    act of handing it over has to happen.

28. **Priority Triage** — a proposed order for tonight.
    **Smart:** it scores by due date, estimated size and class weight and shows
    its suggested order, but every item is draggable — it's a starting point
    you're expected to argue with, not a schedule imposed on you.

29. **Done This Week** — what you've finished, as a count and a list.
    **Smart:** it keeps a visible streak of days you cleared everything due,
    which is the cheapest motivation mechanic available that doesn't
    manipulate you with fake urgency.

30. **Long-Term Projects** — multi-week work with a three-state status: not
    started, in progress, done, changed by tapping the status dot.
    **Smart:** it warns when a due date is closing in and the status hasn't
    moved off "not started" for a week — catching the specific way big projects
    fail, which is silently, early.

31. **Homework Estimate** — roughly how long tonight will take.
    **Smart:** it learns your real pace per class from how long things have
    actually taken rather than asking you to estimate, because nobody estimates
    their own homework accurately and nobody wants to be asked.

#### Calendar

32. **Month Calendar** — the month grid, each day carrying small coloured dots
    for what's on it: homework and notes in their class colour, projects,
    important dates. Month arrows and a horizontal swipe change month; tapping
    the month name jumps back to today.
    **Smart:** the dots inherit class colours, so a month view tells you *which
    subject* is busy, not just that a day is busy — and long-pressing a day
    adds straight to it rather than opening a form you have to re-date.

33. **Week Calendar** — one column per day for the current week.
    **Smart:** it draws bell blocks and assignments in the same column, so you
    can see that your history test lands on a minimum day, which is exactly the
    collision a month grid hides.

34. **Agenda** — a plain forward-rolling list of what's coming.
    **Smart:** it always starts at now and never shows an empty past, so it
    can't degrade into a list of things you've already missed.

35. **Important Dates** — trips, picture day, spirit week, anything dated that
    isn't work.
    **Smart:** an optional class tag colours the entry like that class, so a
    Bio field trip reads as Bio at a glance while a school-wide date stays
    neutral.

36. **Test & Quiz Countdown** — what's being tested and when.
    **Smart:** it collects anything marked as a test automatically, so there's
    no second list to maintain and nothing can be on your homework list but
    missing from your test list.

37. **Day Detail** — one day in full: its bell schedule, what's due, notes made
    on it.
    **Smart:** it follows whichever day is selected in any calendar block on
    the same page, so a Month Calendar and a Day Detail sitting together behave
    like one instrument instead of two.

38. **Workload Heat Map** — a month grid shaded by how much is due each day.
    **Smart:** it makes crunch weeks visible *before* you're inside them, which
    is the entire point of planning ahead and the thing a to-do list can never
    show you.

39. **Schedule Exceptions** — the upcoming non-standard days.
    **Smart:** it reads directly from the bell calendar, so you find out about
    a minimum day from your planner rather than from the school website or from
    turning up at the wrong time.

#### Notes and reference

40. **My Notes** — everything you've written, newest first.
    **Smart:** a new note auto-tags the class you're currently in, so notes
    file themselves and stay findable without you ever choosing a folder.

41. **Class Notebook** — the notes for one class.
    **Smart:** it groups by date and labels each with what kind of day it was,
    so "the one from the late-start Wednesday" is a findable thing rather than
    a vague memory.

42. **Quick Capture** — a scratchpad that asks nothing.
    **Smart:** you type first and classify later, if ever. It exists because
    the moment a teacher says something worth writing down is the moment you
    have the least patience for a form.

43. **Pinned Note** — one short note that stays visible and never scrolls away.
    **Smart:** it survives page switches and sits wherever you put it — locker
    combination, a formula, a lunch code, the wifi password.

44. **Flashcards** — self-quizzing from your own notes.
    **Smart:** it pulls from notes tagged for a test that's actually coming up,
    so the block is about the thing you're revising this week rather than a
    library you have to curate.

45. **Reference Card** — the things you keep looking up: formulas, conversions,
    a citation format.
    **Smart:** it renders simple maths legibly and stays readable in dark mode,
    which is where most reference material quietly breaks.

46. **Link Stash** — Canvas, Classroom, Drive, class sites.
    **Smart:** the current class's links surface during that class, so the link
    you need is the one on top at the moment you need it.

47. **Photo Note** — a picture of the whiteboard or a worksheet.
    **Smart:** it auto-tags with the class and the date it was taken, which are
    precisely the two things you need to ever find that photo again, and the two
    nobody remembers to add manually.

#### Focus and wellbeing

48. **Focus Session** — the timed study session with the phone deliberately
    locked out: pick a length, a number of breaks and a break length, then
    start. Both devices derive the same phase from the clock, so a phone that
    was asleep is correct the instant it wakes.
    **Smart:** it proposes a session length based on how much you actually owe
    tonight, so the timer is sized to the work rather than to a default someone
    else picked.

49. **Start Focus Button** — a one-tap start with your last-used plan, for a
    page where you don't want the whole setup panel.
    **Smart:** it starts immediately with no configuration screen, because the
    moment you decide to start studying is the moment any extra screen becomes
    an excuse not to.

50. **Focus Streak** — consecutive days with a completed session.
    **Smart:** it counts school days only, so a weekend or a holiday can't
    break a streak you never had a chance to keep.

51. **Break Reminder** — stand up, look away, drink something.
    **Smart:** it's silent during class blocks and only active during study
    time, so it never buzzes at you in the middle of a lesson.

52. **Sleep Countdown** — when you'd need to be asleep for a full night.
    **Smart:** it counts backwards from tomorrow's *actual* first block, so a
    late-start Wednesday correctly gives you the extra hour instead of assuming
    every day starts at the same time.

53. **Mood Check** — one tap, once a day.
    **Smart:** it's shown against your workload over time, so patterns surface
    on their own without anyone having to keep a journal.

#### Progress and insight

54. **Grade Tracker** — grades you enter yourself, per class.
    **Smart:** it includes a what-if calculator — "what do I need on the final
    to keep an A?" — which is the only question anyone has ever actually asked
    a grade tracker.

55. **GPA Snapshot** — the number, and the trend.
    **Smart:** it toggles weighted and unweighted and understands honours/AP
    weighting, so it matches the number your school reports rather than a
    simplified one.

56. **Completion Stats** — on-time versus late, broken down by class.
    **Smart:** it's framed per class, which is actionable ("I'm always late in
    History"), rather than as one global score, which is just a judgement you
    can't do anything with.

57. **Weekly Review** — an automatic Friday summary.
    **Smart:** it writes itself from the week's data — what got done, what
    slipped, what's coming — so the reflection happens even when you'd never
    sit down to do it manually.

#### Utility, layout and personality

58. **Shortcut Row** — three or four small actions in the height of one block.
    **Smart:** each slot can trigger any other block's primary action, so a
    whole page of buttons compresses into one row without losing anything.

59. **Search Everything** — one field across homework, notes, classes and dates.
    **Smart:** results are ranked by how soon each thing is relevant, so the
    assignment due tomorrow beats the identically-named one from last term.

60. **Sync Status** — whether your devices are actually in step, and the sync
    code controls.
    **Smart:** it shows itself only when something is genuinely unsynced or
    wrong. A sync indicator that's always green teaches you to stop reading it;
    one that's usually invisible means something when it appears.

61. **Theme Switch** — light and dark.
    **Smart:** it can follow the clock and flip after sunset, so an evening
    homework session doesn't start with a white screen in a dark room.

62. **Section Header** — a text label to divide a page into parts.
    **Smart:** it accepts live tokens, so a header can read "Chemistry" or
    "Tuesday" by itself and change as the day does, instead of being a static
    string you have to maintain.

63. **Spacer / Divider** — breathing room and a hairline.
    **Smart:** it collapses on small screens, so a layout tuned on a big phone
    doesn't waste half a small one on deliberate emptiness.

64. **Sticker / Emoji Tile** — pure personality, no function.
    **Smart:** none, deliberately. Not everything on a page a teenager owns has
    to be productive, and a planner people want to open beats a planner that's
    merely efficient.

65. **Empty Block** — the deliberate blank, and the fifth slot in the starter
    template.
    **Smart:** it's a teaching device. It ships visible so that within a minute
    of first use you can see the page is made of parts you're allowed to
    change — the single most important thing a customizable app has to
    communicate early.

---

## 9. Keeping it fast

The current app is ~35 KB gzipped total, no dependencies, no build step. That
is a genuine asset and the reason it feels instant. v2 adds a lot of surface
area, and the risk is obvious.

Principles to hold:

- **No framework.** The architecture that got here — one delegated click
  handler, render functions that build HTML strings — scales further than
  people assume, and it's why the app has no build step.
- **A block is not a component tree.** Keep blocks as small render functions
  with a settings object. Resist inventing a component system.
- **Only render the visible page.** Off-screen pages shouldn't render at all.
- **Targeted updates over full re-renders.** Already the pattern in Tasks:
  checking something off updates one row, not the list.
- **One clock.** A single shared ticker driving every live block, not a timer
  per block. Blocks subscribe. This matters a lot with several live blocks on
  a page.
- **Animate only `transform` and `opacity`.** Already the rule; keep it.
- **Set a budget and hold it.** Something like: total payload under ~150 KB
  gzipped, interaction under one frame, page switch under ~50 ms. A number you
  can fail is worth more than an intention.
- **Lazy-load block definitions** only if the payload actually demands it —
  56 small render functions may well be cheaper than a loading mechanism.

Animation stays. The goal was never a static app; it's that motion should be
purposeful and cheap. Drag-to-reorder, block insertion, and page transitions
are the places where good animation will most define how v2 feels.

---

## 10. Migration

This is the part most likely to hurt, and it isn't optional.

- Existing users have real data under `planner.v1` and, if they sync, a code
  that is the only key to it. **Losing either is unacceptable.**
- v2 needs a migration that reads v1 data and produces a default v2 layout
  reproducing the current five tabs, so an existing user updates and finds
  their planner intact and familiar — then discovers it's now editable.
- Layout is new state (pages, tray order, block settings). It has to sync too,
  and it needs the same per-item merge treatment as everything else, or two
  devices will fight over the tray.
- Consider whether layout should sync at all, or stay per-device. A phone and
  a laptop arguably want different layouts. Worth deciding deliberately rather
  than by accident.
- The existing sync model (one encrypted blob, newest-edit-wins per item,
  tombstones for deletes) should extend to blocks without redesign.
- Old versions will still be running against the same sync record for a while.
  Whatever schema change happens must be tolerated by v1 clients, or must be
  gated behind a version bump that v1 ignores cleanly.

---

## 11. Hosting and backend — findings

You asked whether there's a trusted free host meaningfully more generous than
Cloudflare. **Short answer: for this app's workload, no.** Cloudflare's free
tier is already at or near the top of the trusted options, and the numbers
below are why.

What this app actually needs is unusual and very cheap: static file hosting
plus a tiny API that stores one small encrypted blob per sync code. No
database queries, no user accounts, no media.

### Cross-checked free tiers (verified August 2026)

| Provider | Free compute | Free storage | Notes |
| --- | --- | --- | --- |
| **Cloudflare Workers** | **100,000 req/day** (~3M/mo), 10 ms CPU/req | Durable Objects 100k req/day + 13,000 GB-s/day; KV 1 GB (100k reads, 1k writes/day); D1 5 GB | What's in use today. R2 is *not* on the Workers free plan. |
| Google Cloud Run | 2M req/mo (~66k/day), 360k GB-s | none — bring your own | Containers, cold starts, needs a GCP project |
| AWS Lambda | 1M req/mo, 400k GB-s (always free) | none — bring your own | Card required at signup |
| Deno Deploy | 1M req/mo (~33k/day), 10 hr CPU | KV 1 GiB, 1M reads / 500k writes per mo | 20 GiB egress, 5 custom domains |
| Firebase (Spark) | — | Firestore 1 GiB, **50k reads + 20k writes/day**, 10 GiB egress/mo | No card required. Generous for this shape of work. |
| Supabase | 500k edge fn calls/mo | 500 MB DB, 1 GB files, 5 GB egress | **Projects pause after 1 week idle**; 2 project limit |
| Upstash Redis | 500k commands/mo (~16k/day) | 256 MB | The least generous of the group |

### Reading the table

- Cloudflare's **100k requests/day is roughly 3M/month** — three times Deno
  Deploy's 1M/month and above Cloud Run's 2M/month. The "more generous" option
  you were hoping for mostly doesn't exist among providers worth trusting.
- Supabase's **idle pause is a real problem** for a school app: over summer
  break a project would sleep, and the first student back in August hits a cold
  or paused backend.
- Cloud Run and Lambda give more raw requests but **no storage** — you'd still
  need a database alongside, so you'd be managing two free tiers instead of
  one, and gaining nothing.
- Firebase's free tier is genuinely competitive and requires no card, but it
  means adopting Google's SDK and data model for something the current 70-line
  worker already does. That's a large step backwards in simplicity.

### What actually limits you

Not the plan — the sync frequency. The app currently syncs on open, a few
seconds after an edit, on background/foreground, on network return, every five
minutes while open, **and every 15 seconds during a focus session**.

Rough arithmetic: a typical student device might make ~70 Durable Object
requests a day; two devices per user puts a user near ~140. Against 100k/day
that's somewhere in the range of **600–700 daily active users** before the free
tier binds. But a single one-hour focus session alone is ~240 syncs — focus
sessions are by far the most expensive thing the app does.

**The cheapest capacity win is not a new host — it's reducing sync chatter.**
Backing off the focus-session interval, or replacing polling with a push
channel, would likely buy more headroom than any provider switch.

### Recommendation

1. **Stay on Cloudflare.** It's the best free tier for this workload and you're
   already on it.
2. **Trim sync traffic** before considering anything else. It's free capacity.
3. **If and when you outgrow it, pay Cloudflare $5/month** (Workers Paid). That
   is dramatically simpler than migrating to a second-best free tier, and it's
   the same $5 you'd spend on nothing else. You offered to buy the next plan —
   that is the right move, and it's a small one.
4. Keep the sync protocol as boring as it is. It's three operations against a
   URL; that portability is worth more than any provider's free tier, because
   it means you can leave in an afternoon if you ever need to.

**Sources:** [Cloudflare Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/),
[Cloudflare Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing),
[Deno Deploy pricing](https://deno.com/deploy/pricing),
[Firestore quotas](https://firebase.google.com/docs/firestore/quotas),
[Supabase pricing](https://uibakery.io/blog/supabase-pricing),
[Serverless free tier comparison 2026](https://agentdeals.dev/serverless-free-tier-comparison-2026),
[GCP free tier guide 2026](https://agentdeals.dev/gcp-free-tier-2026),
[PUSD high schools](https://www.powayusd.com/apps/pages/high-schools),
[PUSD middle schools](https://www.powayusd.com/apps/pages/middle-and-K-8-Schools)

---

## 12. Risks and open questions

**Risks**

- **Scope.** 65 blocks, a layout engine, onboarding, and multi-school schedules
  is several projects. Shipping a third of it well beats shipping all of it
  badly.
- **The empty-planner problem.** Customizable apps are worse than fixed apps
  for anyone who doesn't customize. Defaults have to be excellent on their own.
- **Complexity tax on speed.** The app is fast because it's small. Every block
  is weight. The budget in §9 is the defence.
- **Layout sync conflicts.** Two devices editing a tray is a genuinely fiddly
  merge problem.
- **Schedule rot.** Imported schedules are wrong every August unless someone
  updates them. A wrong bell schedule makes the app actively harmful.
- **Smart guesses that are wrong** are worse than no guess, because they get
  saved without being read. Always visible, always one tap to change.

**Open questions**

- Does layout sync across devices, or stay per-device?
- Can a block appear on more than one page, and do they share settings?
- Is there a page-level "duplicate" (e.g. one Class Page per class), and does
  that generate six near-identical pages?
- How do notifications work at all in an installed PWA on iOS? Several blocks
  above (turn-in reminders, break reminders) assume notifications that iOS may
  not reliably deliver. **This needs verifying before those blocks are
  promised.**
- Does the 5-period model survive contact with middle schools?
- What happens to the Focus lock in a customizable world — is it a page, a
  mode, or a block?

---

## 13. Suggested phasing

Not a schedule, just an order that keeps the app usable throughout.

1. **Foundations** — page/tray/layout model, edit mode, migration from v1.
   Rebuild the existing five tabs *as blocks*. Ship when v2 looks identical to
   v1 but is editable underneath. This de-risks everything else.
2. **The context layer** — the shared clock and "what class am I in" service,
   plus the Add Homework auto-class. Highest value per unit of work in the
   whole document.
3. **The first 15 blocks** — the ones that replace current functionality plus
   the obvious wins. Block picker and page templates.
4. **Onboarding and the template picker** — once there's something worth
   onboarding into.
5. **The long tail of blocks** — grades, insights, flashcards, wellbeing.
6. **Multi-school schedules** — the PUSD import, with a yearly refresh plan.

---

## 14. What this document does not do

It doesn't choose a data structure, a file layout, or a rendering approach. It
doesn't estimate time. Those are the next document, once the concept here is
settled.
