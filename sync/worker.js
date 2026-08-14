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
  'access-control-allow-methods': 'GET,PUT,OPTIONS',
  'access-control-allow-headers': 'content-type',
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

    const id = new URL(request.url).pathname.replace(/^\/+/, '');
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
