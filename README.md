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
| `index.html` | Static shell: top bar, three views, tab bar, sheet container |
| `app.css` | All styling; light/dark via `[data-theme]` custom properties. Type is `ui-rounded` (SF Pro Rounded on iOS), a system font, so nothing downloads |
| `app.js` | State, storage, rendering, and event handling |
| `sw.js` | Offline cache of the app shell |
| `manifest.webmanifest` | PWA metadata |
| `icons/` | Generated app icons |
| `tools/make_icons.py` | Regenerates the icons (`python3 tools/make_icons.py`) |
| `sync/worker.js` | The entire sync server: one encrypted blob per code |

## Behavior worth knowing

- **New homework defaults to tomorrow.** If you're looking at a different day on
  the calendar, it defaults to that day instead.
- **Everything dated shows on the calendar** as a small dot: homework and notes in
  their class colour, projects in purple, important dates in amber.
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

## Sync between devices

Sync is off until you turn it on, and it never asks for an account. One random
code — `4KP2-9TXQ-M7VB` — is both the name of your data and the key to it. Enter
the same code on another device and the two stay in step.

Nothing readable leaves the device. The app derives two things from the code:
a SHA-256 hash used as the record name, and (via PBKDF2) an AES-GCM key used to
encrypt the data. The server stores a name it cannot reverse and a blob it
cannot read. **The flip side: the code is the only key. Lose it on every device
and the data is gone — there is no reset link.**

Merging is per item, newest edit wins, with tombstones for deletions. Two
devices can both work offline and neither loses anything when they reconnect;
a delete on one device stays deleted instead of being resurrected by the other.

It syncs on open, a couple of seconds after an edit, when the app goes to the
background or comes back, when the network returns, and every five minutes
while open.

### Standing up the server

The whole server is `sync/worker.js` — about 50 lines on Cloudflare's free tier.

```bash
cd sync
npx wrangler kv namespace create SYNC
```

Put the printed id into `wrangler.toml`, then:

```bash
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

## Data

Data lives in this browser profile under the `planner.v1` key (sync settings sit
in `planner.sync`). It survives reloads and offline use, but clearing Safari's
website data will erase it. Home Screen apps get more durable storage than a
plain Safari tab, so that's the safer place to keep it — and with sync on, the
other device is your backup.

## Editing the icons

The icons are drawn from signed distance fields in `tools/make_icons.py` — no
image libraries required. Change the shape or `BG`/`FG` colours and re-run it,
then bump `CACHE` in `sw.js` so clients pick up the new files.
