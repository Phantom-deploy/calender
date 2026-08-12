/* Planner sync — the whole server.
   It stores one opaque blob per record and knows nothing else: no accounts,
   no email, no plaintext. The record name is a hash of your sync code and the
   blob is AES-GCM ciphertext the app encrypts before sending. Losing the code
   means losing the data — there is nothing here that could recover it.

   Deploy:  cd sync && npx wrangler kv namespace create SYNC
            (put the printed id in wrangler.toml, then)
            npx wrangler deploy                                              */

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

    if (request.method === 'GET') {
      return json(await env.SYNC.get(id, 'json') || { rev: 0, blob: null });
    }

    if (request.method === 'PUT') {
      let body;
      try { body = await request.json(); } catch { return json({ error: 'bad body' }, 400); }
      if (typeof body.blob !== 'string' || body.blob.length > MAX_BLOB) {
        return json({ error: 'bad blob' }, 400);
      }

      const current = await env.SYNC.get(id, 'json') || { rev: 0, blob: null };
      // Whoever wrote last wins the race; the client merges and retries.
      if ((body.rev | 0) !== current.rev) return json({ conflict: true, ...current }, 409);

      const next = { rev: current.rev + 1, blob: body.blob, at: Date.now() };
      await env.SYNC.put(id, JSON.stringify(next));
      return json({ rev: next.rev });
    }

    return json({ error: 'method not allowed' }, 405);
  }
};
