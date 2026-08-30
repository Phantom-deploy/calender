# Planner

A minimal personal calendar and school planner. One HTML file, one stylesheet,
one script — no framework, no build step, no accounts, no network calls.
Everything is stored in the browser's `localStorage` on the device.

## Run it

Any static server works:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`. Opening `index.html` directly from disk works
too, except the service worker (browsers only allow it over http/https).

## Put it on the iPhone Home Screen

Host the folder anywhere static (GitHub Pages, Netlify, Vercel, a Raspberry Pi —
it just needs HTTPS for the service worker). In iOS Safari: **Share → Add to Home
Screen**. It then launches standalone, without Safari's chrome, and works offline.

## How it's organized

| File | Purpose |
| --- | --- |
| `index.html` | Static shell: top bar, five views, tab bar, sheet and lock layers |
| `WORKSPACE.md` | How the whole thing is put together, view by view — read this first |
| `app.css` | All styling; light/dark via `[data-theme]` custom properties. Type is `ui-rounded` (SF Pro Rounded on iOS), a system font, so nothing downloads |
| `app.js` | State, storage, rendering, and event handling |
| `sw.js` | Offline cache of the app shell |
| `manifest.webmanifest` | PWA metadata |
| `icons/` | Generated app icons |
| `tools/make_icons.py` | Regenerates the icons (`python3 tools/make_icons.py`) |
| `bell.js` | Del Norte bell schedules, by weekday and by date |
| `sync/worker.js` | The entire sync server: one encrypted blob per code, plus the visit counter |
| `stats.html` | Private visit stats. Not linked from the app; open it by URL |

## Behavior worth knowing

- **New homework defaults to tomorrow.** If you're looking at a different day on
  the calendar, it defaults to that day instead.
- **Checking homework off doesn't delete it.** It just marks it done; it stays
  visible (crossed out) and quietly clears itself 2 days after you checked it,
  so a finished item doesn't linger forever but you also get a couple of days
  to undo a mistap. The removal is a real delete under the hood — it leaves a
  tombstone like any other delete, so it disappears from every synced device,
  not just the one you checked it off on.
- **Everything dated shows on the calendar** as a small dot: homework and notes in
  their class colour, projects in purple, important dates in amber — or in their
  class's colour too, if you tag a date to one (the class picker there is optional).
- **Today's view** lists what's due today, anything overdue, and the next few
  items within three weeks.
- **Adding a class** can happen inline — pick "New class…" in the class dropdown
  while adding homework or a note.
- **Deleting a class** also deletes its homework and notes (it asks first).
- **Theme** follows the button in the top right and is remembered.
- **The iOS status bar follows the theme.** iOS decides the status bar's colour
  from `apple-mobile-web-app-status-bar-style` when the app launches, and it
  ignores CSS — so the inline script in `index.html` sets that meta (and
  `theme-color`) from the stored theme while the `<head>` is still parsing:
  `black` for dark, `default` for light. The dark theme's background is pure
  black so the two meet seamlessly. Toggling the theme updates the metas
  immediately; the status bar itself catches up on the next launch.
- **Launch splash**: iOS builds it from `background_color` in the manifest,
  which is set to black. Switch it (and `theme_color`) to `#f6f7f9` if you
  decide to live in light mode.

## Home

The centre of the tab bar is a raised Home button — the hub the app opens on.
It shows the period you're in with the time left (tap it to jump to the full
schedule), a big **Add homework** button with quick chips for a note, project or
date, then two lists: **Do tonight** (due tomorrow) and **Still due** (due today
or already late).

## Tasks

Everything you have to finish, in one list: all homework and all projects
together, grouped by deadline — **Overdue**, **Today**, **Tomorrow**, **This
week**, **Later**, then **Done**. Each heading carries a count, and a chip on
the right of a row shows the deadline where the heading doesn't already say it
(`3d late` in red, a weekday this week, a short date beyond that).

The circle on the left is the status. Tap it on homework to check it off; tap
it on a project to move it *Not started → In progress → Done*. A checked item
stays where it is, crossed out, so the list never jumps under your finger — it
drops into **Done** the next time the view is built. Tapping the rest of the
row opens the usual edit sheet, and **New task** at the bottom opens the add
sheet, where you can switch the type to a project, note or date.

## Focus

A study session with the phone deliberately out of play. Pick the total focus
time, how many breaks and how long each is, then start. The plan splits into
equal stretches with the breaks in between, and the summary line spells out
what you chose before you commit.

Only the plan and the moment it started are stored, so both devices work out
the same phase from the clock — a phone that was asleep is correct the instant
it wakes, and nothing has to stream second by second. While a session is
running devices check in every 15 seconds instead of the usual five minutes, so
starting on a laptop locks the phone within moments.

Setup is three **− value +** controls, and every value can be typed directly:
focus time, number of breaks, break length (30 / 2 / 5 to begin with). A line
underneath reads back what you picked — *30 min focus → 2 breaks → 5 min each*.
Out-of-range numbers are clamped rather than refused.

- **On a phone** the whole site becomes the session: solid red **DO NOT USE**
  with the countdown, and solid blue **HAVE FUN** with a countdown during
  breaks. One reminder sentence shows at a time, fading to the next every
  fifteen seconds, so the screen stays calm instead of listing four at once. A
  soft chime sounds a minute before a break ends and an alarm rings when it
  hits zero, cleared only by holding **I WILL STUDY NOW** for three seconds.
- **On a computer** nothing is blocked. A strip above the tab bar shows the
  phase, the time left, and that the phone is locked.
- **Stopping.** The computer always has a clear **HOLD TO STOP**, which takes a
  deliberate seven seconds. On the phone, a faint *hold to end* appears only if
  the session was started there, and takes five. The alarm's *I WILL STUDY NOW*
  stays at three.
- **The phone's lock has a Sync button.** Devices check in every fifteen
  seconds during a session, but a phone that has been asleep can lag — tapping
  Sync makes it check immediately, which is how you free it right after
  stopping a session from the computer. It reports back (*Up to date*, or the
  problem) and settles again.

Sound is started by the tap that begins the session, which is what browsers
require, and kept alive by a silent loop. The chime and alarm are scheduled on
the audio clock rather than with timers, so they still fire when the page is in
the background and JS is being throttled. iOS can still cut audio off in some
states — treat background sound as best effort, not a guarantee.

## Schedule

The Schedule tab shows today's bell schedule with a live countdown for the
period you're in — big at the top, with the class name you assigned rather than
"Period 3". Under it is the whole day, current block highlighted, finished ones
dimmed.

Classes live here too, as one **Classes & periods** list: a period row opens
that class's homework and notes, an empty one asks what to put there, and any
class without a period sits underneath. Assign your classes once (tap a period, pick a class — you
can create one right there, and optionally add a room and teacher). Periods 1–5
are the same every day, so the app maps them onto whichever bell schedule the
day happens to use.

`bell.js` holds the schedules, transcribed from *DEL NORTE HIGH SCHOOL — Bell
Schedules (Printer Friendly)* (the PDF is in the repo). It knows the regular
day, Wednesday late start, the first day, minimum days, conferences, parade and
safety-drill days, pep rally, and all nine finals days, and picks the right one
by date. Weekends show "No school today". **Change** overrides just that one day
for anything unscheduled — a pep rally, say. Staff-only blocks (Pro Grow) are
left out.

Everything runs on `America/Los_Angeles` regardless of the device's own
timezone, so the countdown is right even on a laptop set to another zone, and
DST is handled by `Intl`. To update for next year, edit the rows and dates in
`bell.js`.

## Sync between devices

Sync is off until you turn it on, and it never asks for an account. One random
code — `4KP2-9TXQ-M7VB` — is both the name of your data and the key to it. Enter
the same code on another device and the two stay in step.

Nothing readable leaves the device. The app derives two things from the code:
a SHA-256 hash used as the record name, and (via PBKDF2) an AES-GCM key used to
encrypt the data. The server stores a name it cannot reverse and a blob it
cannot read. **The flip side: the code is the only key. Lose it on every device
and the data is gone — there is no reset link.**

**More than one person can share one deployment.** Every code is its own
isolated record: a different code means a different record name (a hash the
server can't reverse) and a different encryption key, so two people using the
same app and the same worker can never see — or overwrite — each other's data.
Someone who never turns sync on stays entirely local and sends nothing. Each
record has its own write allowance so one misbehaving client can't spend the
account's whole free-tier budget and take everyone else's sync down.

Merging is per item, newest edit wins, with tombstones for deletions. Two
devices can both work offline and neither loses anything when they reconnect;
a delete on one device stays deleted instead of being resurrected by the other.

It syncs on open, a couple of seconds after an edit, when the app goes to the
background or comes back, when the network returns, and every five minutes
while open.

### Standing up the server

The whole server is `sync/worker.js` — about 70 lines on Cloudflare's free tier.
Each sync code gets its own Durable Object instance, so the conflict check
(`rev` must match) is handled by a single strictly-consistent object instead of
a shared store — two devices writing at the same moment can't both read a
stale revision and silently overwrite one another. Verified with concurrent
writers against the live deployment: exactly one wins, the rest get a clean 409
with the current record to merge against.

```bash
cd sync
npx wrangler login      # opens a browser tab to sign in
npx wrangler deploy
```

Wrangler prints a URL like `https://planner-sync.<you>.workers.dev`. Paste it
into `SYNC_URL` near the top of `app.js` and push — then a new device only needs
the code. (You can also paste the URL into the Server field in the sync sheet on
each device, which is handy for trying it before committing to a URL.)

Any server implementing the same three-line protocol works: `GET /<32-hex id>`
returns `{rev, blob}`, `PUT /<id>` with `{rev, blob}` stores it and returns the
new `rev`, or `409` with the current record if `rev` is stale.

Sync needs a secure context (https, or localhost) because it uses WebCrypto.
GitHub Pages is https, so that comes free.

## Visit counter

The app counts how many times it is opened and how many separate devices that
adds up to. A visit is one launch, plus one more each time you come back after
the app has been out of sight for half an hour — without that, an installed
app (which is resumed rather than reloaded) would be counted once and then
effectively never again, while someone in a browser tab counts on every open.
Counting is entirely separate from sync: it happens whether or not sync is
turned on, and a device syncing every five minutes still registers one visit. Nothing identifying is collected: each device makes up a random id,
keeps it in its own `localStorage`, and that opaque string is all the server
ever sees — no IP addresses, no user agents, no fingerprinting, no third-party
script. If the counter is unreachable the app carries on without noticing.

The read-out lives at **`/stats.html`**. It is not linked from anywhere in the
app, is marked `noindex`, and is left out of the offline cache. Open it
directly and enter the password.

The password is not stored anywhere, in this repo or on the server. The browser
runs it through PBKDF2 (210k iterations) to get a token, and the worker holds
only the SHA-256 of that token — so the check happens on the server, where it
cannot be edited away. A static page's own password prompt is only a UI: the
gate has to be the API, or anyone could just read the file.

To change the password, derive a new verifier and replace `ADMIN_SHA` in
`sync/worker.js` (or better, set it as a secret so it never enters git):

```bash
npx wrangler secret put ADMIN_SHA
```

**The worker must be redeployed before any of this works** — the counter lives
in a new Durable Object:

```bash
cd sync && npx wrangler deploy
```

## Guided first use

The first time you open edit mode, the block picker, the pages sheet, the icon
sheet or settings, the page dims around it and a card explains what it is.
Each one appears once and never again; tap anywhere to dismiss. They are
skipped during setup and during a focus session.

## Data

Data lives in this browser profile under the `planner.v1` key (sync settings sit
in `planner.sync`, the theme in `planner.theme`, and the id of the last
announcement you were shown in `planner.news`). It survives reloads and offline use, but clearing Safari's
website data will erase it. Home Screen apps get more durable storage than a
plain Safari tab, so that's the safer place to keep it — and with sync on, the
other device is your backup.

## Editing the icons

The icons are drawn from signed distance fields in `tools/make_icons.py` — no
image libraries required. Change the shape or `BG`/`FG` colours and re-run it,
then bump `CACHE` in `sw.js` so clients pick up the new files.
