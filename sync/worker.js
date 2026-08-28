/* Planner sync — the whole server.
   It stores one opaque blob per record and knows nothing else: no accounts,
   no email, no plaintext. The record name is a hash of your sync code and the
   blob is AES-GCM ciphertext the app encrypts before sending. Losing the code
   means losing the data — there is nothing here that could recover it.

   Each record is its own Durable Object instance, so the read-check-write
   that backs conflict detection is handled by a single, strictly-consistent
   object instead of a shared store — two near-simultaneous writes can't both
   read the same stale revision and silently clobber one another.

   Deploy:  cd sync && npx wrangler deploy                                   */

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,PUT,POST,OPTIONS',
  'access-control-allow-headers': 'content-type,x-admin',
  'access-control-max-age': '86400'
};

const MAX_BLOB = 4_000_000;   // ~4 MB of ciphertext is a very full planner

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'content-type': 'application/json', 'cache-control': 'no-store' }
  });

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    const path = new URL(request.url).pathname;

    // Visit counting and the admin read-out both live on one shared instance.
    if (path === '/_a/hit' || path === '/_a/stats') {
      const stats = env.STATS_DO.get(env.STATS_DO.idFromName('global'));
      return stats.fetch(request);
    }

    const id = path.replace(/^\/+/, '');
    if (!/^[a-f0-9]{32}$/.test(id)) return json({ error: 'bad record' }, 400);

    if (request.method !== 'GET' && request.method !== 'PUT') {
      return json({ error: 'method not allowed' }, 405);
    }

    // One Durable Object instance per record id: every GET/PUT for a given
    // code is handled by the same single-threaded instance, so the
    // rev check inside it can't race against a concurrent write.
    const stub = env.SYNC_DO.get(env.SYNC_DO.idFromName(id));
    return stub.fetch(request);
  }
};

/* Several people can share one deployment, each with their own code. A single
   runaway client would otherwise be able to spend the whole account's daily
   free-tier budget and take everyone else's sync down with it, so each record
   gets its own modest write allowance. Reads are left alone: they are cheap
   and a stuck client that can only read cannot corrupt anything. */
const WRITE_WINDOW = 60_000;
// A device debounces to at most ~24 writes a minute, so several devices editing
// hard still sit far below this; a runaway loop does hundreds a second and is
// caught immediately.
const WRITES_PER_WINDOW = 120;

export class SyncRecord {
  constructor(state) {
    this.state = state;
    this.writes = [];
  }

  async fetch(request) {
    if (request.method === 'GET') {
      const rec = (await this.state.storage.get('rec')) || { rev: 0, blob: null };
      return json(rec);
    }

    const now = Date.now();
    this.writes = this.writes.filter(t => now - t < WRITE_WINDOW);
    if (this.writes.length >= WRITES_PER_WINDOW) {
      return json({ error: 'too many writes, try again shortly' }, 429);
    }
    this.writes.push(now);

    let body;
    try { body = await request.json(); } catch { return json({ error: 'bad body' }, 400); }
    if (typeof body.blob !== 'string' || body.blob.length > MAX_BLOB) {
      return json({ error: 'bad blob' }, 400);
    }

    const current = (await this.state.storage.get('rec')) || { rev: 0, blob: null };
    // Whoever's write lands with the rev they last read wins; the client
    // merges the returned record and retries on a 409.
    if ((body.rev | 0) !== current.rev) return json({ conflict: true, ...current }, 409);

    const next = { rev: current.rev + 1, blob: body.blob, at: Date.now() };
    await this.state.storage.put('rec', next);
    return json({ rev: next.rev });
  }
}

/* ---------------- visit counting ----------------
   Counts visits and how many distinct devices they came from. Nothing that
   identifies a person is stored: the client makes up a random id, keeps it in
   its own localStorage, and that opaque string is all this ever sees. No IP
   addresses, no user agents, no fingerprinting, no third party.

   The read-out is gated on a password the repo does not contain. The browser
   turns the password into a token with PBKDF2, and only the SHA-256 of that
   token is stored below — so this file leaking reveals neither the password
   nor anything usable against the endpoint, and each guess an attacker tries
   costs them a full 210k-iteration derivation.

   The gate is here, on the server, and not in the admin page: a static page's
   own password check can always be edited away in devtools, so it must never
   be the thing standing between someone and the data. */

const ADMIN_SALT = 'planner.admin.v2';
const ADMIN_ITER = 210000;
/* Override in production with:  npx wrangler secret put ADMIN_SHA           */
const ADMIN_SHA = '57149eec9148465eadd3beee02ffa5168244dc1ebe0cd84716914ba24e1fdcd6';

const DAY_KEEP = 60;            // per-device day markers older than this are pruned
const HIT_WINDOW = 60_000;
const HITS_PER_WINDOW = 600;    // a stuck tab reloading can't inflate the numbers

const todayUTC = () => new Date().toISOString().slice(0, 10);
const dayShift = (iso, n) => {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const sha256Hex = async str => {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
};

/** Compare without leaking, through timing, how much of the token was right. */
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export class Stats {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.hits = [];
  }

  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === '/_a/hit') return this.hit(request);
    if (path === '/_a/stats') return this.report(request);
    return json({ error: 'not found' }, 404);
  }

  async hit(request) {
    if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);

    const now = Date.now();
    this.hits = this.hits.filter(t => now - t < HIT_WINDOW);
    if (this.hits.length >= HITS_PER_WINDOW) return json({ ok: true });   // quietly drop
    this.hits.push(now);

    let body;
    try { body = await request.json(); } catch { return json({ error: 'bad body' }, 400); }

    // An id we did not generate is still only an opaque string, but cap it so
    // a client cannot use the key space as free storage.
    const vid = String(body.v || '').slice(0, 64);
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(vid)) return json({ error: 'bad id' }, 400);

    const st = this.state.storage;
    const day = todayUTC();

    const [total, uniques, seen, seenToday, dayRec] = await Promise.all([
      st.get('total'), st.get('uniques'), st.get('v:' + vid),
      st.get(`dv:${day}:${vid}`), st.get('d:' + day)
    ]);

    const rec = dayRec || { v: 0, u: 0, s: 0 };
    rec.v++;
    if (body.s) rec.s++;                       // opened from the home screen

    const writes = { total: (total | 0) + 1, ['d:' + day]: rec };

    if (!seen) {
      writes.uniques = (uniques | 0) + 1;
      writes['v:' + vid] = now;
    }
    if (!seenToday) {
      rec.u++;
      writes[`dv:${day}:${vid}`] = 1;
      // First hit of a new day is the cheapest moment to drop stale markers.
      if (!dayRec) this.state.waitUntil?.(this.prune(day));
    }

    await st.put(writes);
    return json({ ok: true });
  }

  /** Day markers are only needed to dedupe within their own day. */
  async prune(day) {
    try {
      const cutoff = dayShift(day, -DAY_KEEP);
      const old = await this.state.storage.list({ prefix: 'dv:', end: `dv:${cutoff}`, limit: 2000 });
      if (old.size) await this.state.storage.delete([...old.keys()]);
    } catch {}
  }

  async report(request) {
    const expected = this.env.ADMIN_SHA || ADMIN_SHA;
    const token = request.headers.get('x-admin') || '';
    if (!token || !safeEqual(await sha256Hex(token), expected)) {
      return json({ error: 'nope' }, 401);
    }

    const st = this.state.storage;
    const day = todayUTC();
    const days = [];
    for (let i = 29; i >= 0; i--) days.push(dayShift(day, -i));

    const [total, uniques] = await Promise.all([st.get('total'), st.get('uniques')]);
    const recs = await st.get(days.map(d => 'd:' + d));

    const series = days.map(d => {
      const r = recs.get('d:' + d) || { v: 0, u: 0, s: 0 };
      return { day: d, visits: r.v | 0, uniques: r.u | 0, installed: r.s | 0 };
    });

    return json({
      totalVisits: total | 0,
      uniqueVisitors: uniques | 0,
      today: series[series.length - 1],
      days: series,
      salt: ADMIN_SALT,
      iter: ADMIN_ITER
    });
  }
}
