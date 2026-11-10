# Handoff

Everything a new maintainer needs to take this project over. `README.md` is for
users and `WORKSPACE.md` explains how the code is laid out — **this file is for
the things you only learn by having worked on it.** Decisions and why they were
made, invariants you must not break, landmines, operational reality, and what
is actually true today rather than what the other docs imply.

Current as of November 2026, commit `910423d`.

---

## 1. Read this first

Three things will bite you before anything else.

### There are no tests

**The repo has never contained a test.** `git ls-files` confirms it.

A Playwright suite did exist — 20 files, roughly 300 assertions, covering
onboarding, the block organizer, both visual styles, bell schedules, rotation,
sync and the spotlight tour. It lived in a session scratchpad under `/tmp`, was
never committed, and **has since been deleted.** It is gone.

Everything in this codebase was verified by that harness and none of that
verification is reproducible today. Treat behavioural claims in `WORKSPACE.md`
as "was true when last checked by hand", not "is covered by a test".

**Rebuilding a harness is the highest-value thing you can do here.** Section 16
describes what it looked like and what it cost to learn, so you do not start
from nothing.

### Bump the service worker or your change does not ship

`sw.js` caches the shell cache-first. If you change `app.js`, `app.css`,
`index.html` or `bell.js` and do **not** bump `CACHE`, returning users keep the
old files indefinitely. Currently `planner-v33`.

This is the easiest way to ship a change that appears to do nothing at all.

### The deployed worker is a live, single-account dependency

`SYNC_URL` (`app.js:2896`) is hardcoded to
`https://planner-sync.aryan-malik8u8.workers.dev`, tied to one Cloudflare
account. Lose access and sync plus the visit counter break for every existing
install — and that URL is already baked into the cached service worker on every
device. There is no fallback, no config file, and the same literal is
duplicated in `stats.html`.

---

## 2. What this is

A personal calendar and school planner for Poway Unified (PUSD) students, built
as a static progressive web app.

- **No framework, no build step, no `npm install`, no `package.json`.** Edit the
  files, reload the page.
- All data lives in `localStorage`. There are no accounts.
- Sync is optional, off by default, and end-to-end encrypted.
- It is free and ad-free, and the in-app copy promises it stays that way.

Scale is small — one developer, a handful of users, a free Cloudflare tier.
Decisions throughout favour *obvious and debuggable* over *scalable*.

---

## 3. Ground rules

From `CLAUDE.md`, non-negotiable:

> **Always commit and push directly to `main`.** No feature branches or pull
> requests unless explicitly asked.

The conventions the codebase actually holds to:

- **No dependencies.** Not one line of third-party runtime code. Keep it that
  way — instant loading and offline capability are the whole proposition.
- **Comments explain *why*, never *what*.** Existing comments are unusually
  dense with rationale. A comment restating the code is noise here.
- **Prose, not bullet soup**, in docs and commit messages. Messages in this repo
  run several paragraphs explaining reasoning. Read `git log b0ab959 -1` before
  writing your first.
- Default style must stay cheap (section 9).

---

## 4. Repo map

| File | Lines | gz | What it is |
| --- | ---: | ---: | --- |
| `app.js` | 5,599 | 75 KB | Everything. One IIFE, strict mode, nothing on `window` |
| `app.css` | 3,727 | 24 KB | Every style, both visual styles, all themes |
| `bell.js` | 992 | 5.5 KB | 14 PUSD schools' bell schedules. Sets `window.SCHOOLS` |
| `index.html` | 92 | 1.6 KB | Shell: top bar, share banner, empty `<main>`, tab bar, sheet layer |
| `sw.js` | 49 | 0.7 KB | Offline cache. **Bump `CACHE` on every asset change** |
| `stats.html` | 245 | 3.7 KB | Private admin page, gated server-side |
| `sync/worker.js` | 245 | — | Cloudflare Worker: sync records + visit counter |
| `sync/wrangler.toml` | 20 | — | Worker config, two Durable Object bindings |
| `tools/make_icons.py` | — | — | Regenerates the PWA icons |

Docs: `README.md` (users + deployment), `WORKSPACE.md` (code layout, 744 lines),
`UPGRADE-PLAN.md` (the v2 concept doc, now largely implemented — read as
history), and this file.

`bell.js` loads before `app.js`. The PDF in the root is the source document for
the Del Norte schedule; reference material, not used at runtime.

### Finding things in a 5,600-line file

`app.js` is sectioned with banner comments — `grep -n "^/\* -\+" app.js` is your
index. Roughly:

| Lines | Section |
| --- | --- |
| 6–196 | Storage, dates, helpers |
| 197–408 | App state, `BLOCKS` registry begins |
| 409–1510 | The 66 block implementations, grouped by category |
| 1511–1860 | Rendering, pages, `blockWrap`, edit chrome |
| 1861–2097 | Home and Schedule views |
| 2098–2648 | Sheets, forms, saving |
| 2649–2895 | Focus sessions |
| 2896–3192 | Sync: crypto, merge, the sheet |
| 3193–3432 | News deck, share, schedule helpers |
| 3433–3574 | Settings |
| 3575–4145 | Edit mode: block organizer, pages, icons |
| 4146–5000 | The delegated event switch |
| 5000+ | Boot, onboarding, the tour, install guide, visit counter |

---

## 5. Running it

```bash
cd /home/phantomdeploy/Personal/calender
python3 -m http.server 8080
```

Then `http://localhost:8080/`. **Reload twice** after changing assets — the
service worker serves the old copy first and refreshes in the background.

To test onboarding you need a genuinely fresh profile: a new incognito window,
or clear `localStorage` for the origin. Deleting `planner.onboard` alone is not
enough — see landmine 4.

---

## 6. How rendering works

No virtual DOM, no component system.

1. `index.html` holds an empty `<main>` and a `<nav id="tabbar">`.
2. `render()` builds an HTML string and assigns it to `innerHTML`.
3. **One delegated `click` listener on `document`** reads `data-act` from the
   closest element and runs a `switch` (`app.js:4146`).

Attributes carry all the wiring: `data-act` (what a click does),
`data-kind`/`data-id` (which item), `data-type` (which form).

User text goes through `esc()` before entering an HTML string. There is no
sanitiser and no CSP — **`esc()` is the only thing between a pasted assignment
title and script injection.** Never bypass it.

---

## 7. Data model

### The synced database

One key, `planner.v1`, holding arrays plus a tombstone map:

```js
const KINDS = ['classes','homework','notes','projects','events','schedule',
               'overrides','focus','grades','links','moods','photos','recurs'];
```

**`KINDS` is authoritative.** A key not listed there will not load (`load()`,
`app.js:27`) and will not sync (`mergeInto`, `app.js:2979`). Adding a kind means
adding it here first. Note that *fields* on existing records need no
registration at all, because merging copies whole records — that is the cheap
way to extend.

Every record has `id` (string) and `updatedAt` (number, set only via `touch()`).

| List | Fields |
| --- | --- |
| `classes` | `id, name, color, h?` — `h: 1` is honors/AP, weights GPA |
| `homework` | `id, title, classId, due (YYYY-MM-DD), details, done, createdAt, completedAt?` |
| `notes` | `id, text, classId, date` |
| `projects` | `id, name, due, status ('todo'\|'doing'\|'done'), description` |
| `events` | `id, title, classId, date, details` — `classId` may be `''` |
| `schedule` | `id: 'p3'` (deterministic), `period, classId, room, teacher` |
| `overrides` | `id: <date>`, `date, key` — a schedule chosen for one day |
| `focus` | one record, `id: 'session'` |
| `grades` | `id, classId, name, score, max` |
| `links` | `id, label, url, classId` |
| `moods` | `id: <date>`, `v` |
| `photos` | `id, classId, date, img` (data URL, capped at 12) |
| `recurs` | `id, title, classId` |

Deterministic ids (`p3`, a date, `session`) exist so the record is *replaced*
rather than duplicated — that is what makes them survive a merge cleanly.

### Rules that matter

- **Dates are plain local `YYYY-MM-DD` strings.** There is no timezone maths
  anywhere except the bell schedule, pinned to `America/Los_Angeles` via `Intl`.
  `iso(date)` formats, `parseISO(s)` parses. Keep it that way.
- **Deleting writes a tombstone** into `deleted`, so the delete survives a merge
  instead of being resurrected. Tombstones expire after `TOMB_TTL` (120 days).
- **A newer `updatedAt` beats a tombstone** — editing on one device while
  deleting on another means the edit wins. Deliberate.
- `save()` = persist + mark dirty + schedule sync. `persist()` is localStorage
  only, used when applying remote data so you do not echo it back.
- `sweepCompleted()` removes homework finished more than 2 days ago, through the
  normal tombstone path.

### What is deliberately *not* synced

- `planner.layout.v1` — pages and blocks. A phone and a laptop want different
  layouts, and syncing it would make one device's edit wreck the other's.
- `planner.prefs.v1` — theme, style, school, clock format.
- `planner.sync` — the sync code, which *is* the encryption key.

### Idempotent generation

`ensureRecur()` (`app.js:3418`) is the pattern for anything that regenerates
records:

```js
const id = `r${r.id}:${t}`;
if (byId(db.homework, id) || db.deleted[id]) continue;
```

A deterministic id means re-running creates no duplicates; the `db.deleted[id]`
check means an item the user deleted stays deleted. Any future importer should
copy this shape exactly.

---

## 8. Pages, blocks and the tray

Not five fixed tabs any more — up to `PAGE_LIMIT` (7) pages, each a list of
blocks, with a tray you can reorder and re-icon.

`BLOCKS` is a registry of **66** entries:

```js
BLOCKS[type] = { n, c, d, sm, html(cfg, b), opts?, read? }
```

`n` name · `c` category · `d` one-line description · `sm` the "clever thing"
line shown in the organizer · `html()` renders · `opts`/`read` an optional
settings form. Seven categories in `CAT`: live, work, cal, notes, well, prog,
util.

`fixLayout()` repairs whatever comes out of storage: Home must exist and cannot
be deleted, **unknown block types are dropped rather than crashing** (a layout
from a newer version degrades instead of exploding), and the tray is capped.

Edit mode (the pencil) wraps each block in chrome: drag handle, name, and five
controls in a fixed order — up, down, duplicate, settings, remove. Dragging uses
one pointer-based FLIP engine shared by blocks and the pages sheet.

---

## 9. The two styles

`prefs.style` is `notebook` (default) or `default`, applied as `data-style` on
`<html>` by an inline script in `index.html` **before first paint**.

- **Default** — plain, light, fast. Pays for none of the notebook work and
  requests no webfont.
- **Notebook** — ruled paper, handwriting, drawn ink. Every rule scoped under
  `[data-style="notebook"]`.
- **Full notebook** (`prefs.full`, off by default) — one continuous sheet, no
  cards. The paper is painted on `<main>` so it *scrolls with* the content
  rather than sitting still behind it.

**Keeping Default untouched is an explicit product commitment**, not an
accident. A suite used to assert it — background, fonts, radii, borders, zero
font requests. That suite is gone, so the commitment is now only as good as your
discipline.

Notebook completion effects (the pencil strike, the self-writing tick) are
**transitions, not animations**, so that under `prefers-reduced-motion` the
finished state still renders. Convert one to an animation and you silently break
reduced-motion users.

---

## 10. Bell schedules

`bell.js` carries 14 PUSD schools, each with named schedules, period rows and
weekday mappings. All clock work runs in `America/Los_Angeles`.

Resolution order for a day: an override the user set for that date → `byDate` →
`byWeekday`.

**Block rotation.** Some middle schools run odd/even days where the same time
slot is a different period depending on the day. A row's period can therefore be
an **array**, resolved by `rowPeriod(row, date)`. The rotation anchor lives per
school in `prefs.rot` — the app asks once which day it is and counts school days
forward, because the published calendar is an image and shifts with holidays.

Two schools carry `stale: true` (their sites still showed 2024-25 when
transcribed) and the picker warns in red. Black Mountain's block rows carry **no
period at all**, because the school does not publish which of Thursday or Friday
is which — a deliberate blank rather than a confident wrong answer.

---

## 11. Onboarding and the spotlight tour

The philosophy is **start → experience → customise.** Nothing is asked for that
the app can start without.

Setup is two screens: welcome and school. No classes step, no
template-or-blank fork, no style question — everyone lands on the same built
planner (`defaultPages()`) in Notebook style. `Skip` finishes from either screen
and builds the same thing. Flag: `planner.onboard`.

Then `startTour()` runs the spotlights: Schedule tab → the periods → Home tab →
the live countdown → a seeded sample task ("Visit Planner") → the pencil → Add
block → Settings → finally the install prompt.

### The tip system contract

This is subtle and has broken twice. A step may carry:

- **`after`** — run by `closeTip()` instead of the next queued tip. **Every step
  needs one.** A step with only `onThrough` ended the tour silently when its own
  button was pressed; that was a user-reported bug.
- **`through`** — the overlay swallows every click, so a step asking you to press
  something passes that one press through the hole. It presses *what is under the
  finger* (`elementFromPoint`), not the first selector match — a hole over a list
  of periods must open the one you tapped.
- **`onThrough`** — where that press leads, when it differs from dismissing.
- **`sticky`** — not dismissed by tapping elsewhere.
- **`onShow`** — fired on display, so a timed step counts from when it is visible
  rather than when it was queued.

`runTip` scrolls a target into view *before* drawing, then requeues the step
behind the scroll. `isPinned()` skips that for the tab bar and top bar, which sit
at the screen edges and would otherwise always look off-screen.

The tour marks `pencil`, `gear`, `school`, `edit`, `addblk`, `picker` and
`trayicons` as seen, because it covers all of them properly and a queued hint
would otherwise cut in front of the step doing the same job.

---

## 12. Sync

Optional, off by default, no accounts. A 12-character code is the whole
credential.

- Alphabet is Crockford-style (no I, L, O, U); `cleanCode()` forgives O→0 and
  I/L→1.
- **Record id** = `SHA-256('planner.id.v1|' + code)`, first 32 hex chars.
- **Encryption key** = PBKDF2(code, `'planner.key.v1'`, 120,000 iters) →
  AES-GCM-256. Sealed as `b64(iv) + '.' + b64(ciphertext)`.

The server therefore stores an opaque blob under an opaque id and **cannot read
anything**. The code never leaves the device.

`syncNow()`: GET → decrypt → `mergeInto` → PUT with the revision. On `409`,
re-merge the returned record and retry once. `mergeInto` is whole-record
last-write-wins on `updatedAt`, plus the tombstone map.

Losing the code loses the data. That is the trade for having no accounts, and
the UI says so.

---

## 13. The worker

`sync/worker.js`, deployed as `planner-sync`. Two Durable Objects, both
SQLite-backed.

**Routing** — `OPTIONS` first, then exact-matches `/_a/hit` and `/_a/stats`, then
treats **every other path as a 32-hex record id** and 400s if it does not match.
A new route must go in *before* that fallback or it will never be reached. Use
the `/_a/` prefix convention.

| Endpoint | Behaviour |
| --- | --- |
| `GET /<32hex>` | Returns `{rev, blob}`. No auth — the id *is* the capability |
| `PUT /<32hex>` | `{rev, blob}` → `{rev}`, or `409` with the current record. Max 4 MB, 120 writes/min |
| `POST /_a/hit` | Visit counter. Always returns `{ok:true}`, even when rate-limited |
| `GET /_a/stats` | Admin only, `x-admin` header |

CORS is wildcard `*`, methods `GET,PUT,POST,OPTIONS`. Everything returns through
one `json()` helper, so CORS and `cache-control: no-store` come free — **use it
for any new endpoint.**

Rate limits are in-memory arrays on the DO instance: per-instance, lost on
eviction. They stop a runaway client, not a distributed attack.

### Deploying

```bash
cd sync && npx wrangler deploy
```

Adding a Durable Object class also needs a **new** `[[migrations]]` tag — never
edit an existing one.

### The one secret

`ADMIN_SHA` gates `/_a/stats`. It has a **committed fallback in the repo**
(`worker.js:122`), meant to be overridden in production with:

```bash
npx wrangler secret put ADMIN_SHA
```

Whether it is actually set on the live deployment cannot be determined from the
repo. **Verify this.** The plaintext password is not in the repo (`grep -r` is
clean), and `/stats.html` sends a PBKDF2-derived token that the worker compares
server-side — a static page's own password prompt could simply be deleted in
devtools, which is why the gate lives on the server.

---

## 14. Visit counter

One ping per launch to `/_a/hit`, plus another when the app returns after 30+
minutes hidden. Independent of sync — it fires whether or not a code is set, and
syncing never triggers it. The device id in `planner.vid` is random and
meaningless. Failure is silent by design.

---

## 15. Release checklist

1. `node --check app.js` (and `sw.js`, `bell.js` if touched).
2. **Bump `CACHE` in `sw.js`.** Currently `planner-v33`.
3. Check the gzipped size has not jumped: `gzip -c app.js | wc -c` — about 75 KB
   today, and that figure matters on a phone.
4. Exercise the change in **both styles and in dark mode.** A rule written for
   Notebook that leaks into Default is the most common regression.
5. Commit and push to `main` with a real explanation.
6. If `sync/` changed: `cd sync && npx wrangler deploy`.

---

## 16. Testing — what existed, and what to rebuild

There is nothing now. What there was, so you can rebuild it:

- **Playwright driven from plain `.mjs` scripts**, not a test runner. A shared
  `lib.mjs` exported `boot()`, which launched Chromium, stubbed `**/_a/hit`,
  seeded `localStorage` via `addInitScript`, and returned a page.
- Each suite printed `ok` / `FAIL` lines and exited non-zero on failure.
  Assertions were written as sentences — `ok('tapping a period opens that
  period', …)` — which made failures readable without opening the file.
- Coverage: onboarding and the tour, the block organizer, Default-style purity,
  notebook surfaces and animations, half/full notebook, bell schedules, rotation,
  the share banner and feedback link, the light+notebook rollout, and a broad
  click-through smoke test across every style.

**Hard-won lessons that cost real debugging time:**

- `addInitScript` re-runs on **every navigation, including reloads.** Seeding
  `localStorage` unconditionally there means a reload clobbers whatever the app
  just wrote. Guard every seed with `if (!localStorage.getItem(key))`. This
  produced false failures at least five separate times — each one looked like an
  app bug and was not.
- To simulate an *existing* user you must seed **before the first navigation.**
  Seeding after `goto()` is too late: the app has already run its one-time
  migrations and burned its flags.
- Do not sample a CSS transition at a fixed delay; wait for the computed value.
  A 0.42s transition checked at 500ms is flaky.
- Source line-wrapping puts newlines inside sentences. Collapse whitespace before
  matching rendered text.
- The spotlight overlay intercepts clicks, so any test touching the UI during
  onboarding must dismiss the tour first.

Whatever you build, **commit it this time.** `.gitignore` already excludes
`node_modules/`.

---

## 17. Landmines

In rough order of how likely they are to bite you.

1. **`.day` is the calendar grid's date cell** (`app.css:260`). The agenda's
   selected-day section is `.dsel` precisely because the first version collided
   with it and inherited the cell's centred flex layout. A find-and-replace "fix"
   then renamed the calendar's own rule and broke the month grid. Check before
   adding any day-ish class.

2. **Notebook adds a border to every `.card`, `.panel` and `.hero`.** Anything
   that dissolves one must clear `border` as well as background, shadow and
   radius. `.panel.is-grouped` forgot, and left a thin rectangle drawn around
   grouped day lists.

3. **The organizer's tab strip and list must agree.** `All` shows every family
   with headings; a single-family tab shows **no** heading, because the tab
   already names it. Re-adding the heading duplicates the name.

4. **"Erase this device" does not erase everything.** The list at `app.js:4561`
   is hardcoded and misses `planner.tips.v1`, `planner.triage`,
   `planner.lightNotebook` and `planner.pageTurnOn`. Visible consequence: after
   an erase, setup runs again but **the spotlight tour stays silent**, because
   every tip is still marked seen. Worth fixing; add any new key here.

5. **One-time migrations run before you can observe them.**
   `planner.lightNotebook` and `planner.pageTurnOn` flip prefs once per device on
   first load. Any check of "what does an existing user see" must account for
   them.

6. **`resolveClass()` reads `#f-class` out of the open sheet** (`app.js:2290`).
   It cannot be called outside a sheet context. Mirror its creation line instead.

7. **The spotlight overlay sits above everything** (`z-index: 55`) and swallows
   clicks. Anything that must stay pressable during a tip needs the `through`
   mechanism, not a z-index tweak.

8. **Block previews render real blocks with real data.** They are inert
   (`pointer-events: none`) and open one at a time, because rendering sixty-six
   live blocks at once is what made the first organizer heavy. Keep both
   properties.

---

## 18. Known limitations

- **All browser verification was Chromium-only.** No real-device iOS Safari pass
  has ever been done. Specific risks: the webfont swap, the fixed paper layer
  during rubber-band scroll, the pointer-based drag engine, sticky positioning
  inside sheets, and spotlight repositioning. **This is the single largest
  untested surface**, and the app's primary target is an iPhone home screen.
- Two bell schedules are flagged stale; one school's block-day mapping is
  deliberately blank.
- There is no error reporting. If the app throws on someone's phone, nobody finds
  out.
- The visit counter cannot distinguish a returning visitor from a cleared
  browser.

---

## 19. State of play

Clean tree at `910423d`. Everything committed and pushed to `main`.

Thirty commits of history. The arc: a minimal five-tab planner → sync → bell
schedules → Focus sessions → a full v2 rebuild into pages and blocks → the
Notebook style → the block organizer rebuild → onboarding rebuilt around using
the app rather than being taught it.

`UPGRADE-PLAN.md` was the concept document for that v2 rebuild and is largely
implemented — history, not a roadmap.

### Proposed, not built: Canvas import

A design exists for importing assignments from Canvas's per-user iCal feed,
written up but **not approved and not started.** It lives outside the repo at
`~/.claude/plans/polymorphic-hopping-kazoo.md`; move it in if you intend to
pursue it.

The shape: the existing Worker proxies the feed (Canvas sends no CORS headers,
so the browser cannot fetch it directly), taking `?h=<host>&t=<token>` components
rather than a URL, so the endpoint is structurally incapable of fetching anything
but a Canvas feed. Imported items reuse `ensureRecur()`'s deterministic-id
pattern so re-imports neither duplicate nor resurrect deleted work. It would
refresh on launch and on resume, with a short floor.

Two findings worth keeping even if the feature never ships:

- **Synergy/StudentVUE was ruled out.** No official API; the only route is posting
  a district username and password to an undocumented SOAP endpoint, and those
  credentials also unlock attendance and personal records.
- **Canvas API tokens are probably unavailable.** Admins can disable student token
  creation and districts have been doing exactly that. The calendar feed needs no
  token and is read-only, which is why the design chose it. It carries no
  submission status, so imported work will not tick itself off.

---

## 20. localStorage reference

| Key | Synced? | Holds |
| --- | --- | --- |
| `planner.v1` | **yes** | The database. The only synced key |
| `planner.layout.v1` | no | Pages, blocks, tray order |
| `planner.prefs.v1` | no | Style, theme, school, clock, density |
| `planner.sync` | no | `{code, rev, at, dirty}` — **the code is the encryption key** |
| `planner.stats.v1` | no | Local usage counters for the progress blocks |
| `planner.tips.v1` | no | Which spotlights have been seen |
| `planner.news` | no | Last-seen announcement id |
| `planner.onboard` | no | Setup completed |
| `planner.vid` | no | Anonymous visit-counter id |
| `planner.triage` | no | Manual task ordering |
| `planner.theme` | no | Legacy, migrated into prefs |
| `planner.lightNotebook` | no | One-time migration flag |
| `planner.pageTurnOn` | no | One-time migration flag |

---

## 21. Why things are the way they are

Short answers to "why on earth did they do that".

- **No framework** — it loads instantly on a school phone on bad Wi-Fi, and it
  will still build in five years with no toolchain.
- **No accounts** — a student planner that needs a signup is a planner nobody
  uses. The cost is that losing the sync code loses the data.
- **Layout is not synced** — a phone and a laptop genuinely want different pages.
- **Notebook is the default** — chosen deliberately after it was built; the plain
  style stays as the lightweight option.
- **Page turns are on by default** — flipped later, with a one-time per-device
  rollout so existing installs got them too.
- **The install prompt comes last** — asking someone to install an app they have
  not used yet is asking on the wrong side of the decision.
- **Nothing in the tour is compulsory** — every step can be skipped, and skipping
  straight through still reaches the end.
- **Schedules admit what they do not know** — a blank period beats a confident
  wrong one, and the picker tells you to trust your school over the app.
