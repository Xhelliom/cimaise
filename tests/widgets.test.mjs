import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request as nodeRequest } from 'node:http';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';

let ha, srv, base, seen, mode;
const TOKEN = 'FAKE-HA-TOKEN-0123456789';

before(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'widgets-'));
  const es5 = join(dir, 'es5');
  const t = spawnSync('node_modules/.bin/tsc', ['-p', 'packages/widgets/tsconfig.json', '--outDir', es5], { encoding: 'utf8' });
  assert.equal(t.status, 0, t.stdout + t.stderr);
  const out = join(dir, 'widgets.cjs');
  await build({ entryPoints: [join(es5, 'widgets/src/index.js')], bundle: true, format: 'cjs', target: 'es5', outfile: out, logLevel: 'warning' });
  ha = createRequire(import.meta.url)(out);

  // Faux Home Assistant : enregistre les requêtes, refuse le mauvais jeton.
  seen = [];
  mode = {};
  srv = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      seen.push({ method: req.method, url: req.url, auth: req.headers.authorization, body });
      const send = (s, v, type) => res.writeHead(s, { 'content-type': type || 'application/json' }).end(typeof v === 'string' ? v : JSON.stringify(v));
      if (req.headers.authorization !== 'Bearer ' + TOKEN) return send(401, '401: Unauthorized', 'text/plain');
      if (mode.hang) return;
      if (req.method === 'GET' && req.url === '/api/') return send(200, { message: 'API running.' });
      if (req.method === 'GET' && req.url === '/api/states') return send(200, [
        { entity_id: 'light.salon', state: 'on', attributes: { friendly_name: 'Salon' } },
        { entity_id: 'scene.film', state: 'unknown', attributes: { friendly_name: 'Film' } },
        { entity_id: 'scene.diner', state: 'unknown', attributes: { friendly_name: 'Dîner' } },
        { entity_id: 'scene.nuit', state: 'unknown', attributes: {} },
      ]);
      if (req.method === 'POST' && req.url === '/api/template') {
        if (mode.templateFails) return send(400, 'TemplateError', 'text/plain');
        const ids = [...JSON.parse(body).template.matchAll(/'(scene\.[a-z0-9_]+)'/g)].map((m) => m[1]);
        const rooms = { 'scene.film': 'Salon', 'scene.diner': 'Cuisine' };
        return send(200, JSON.stringify(ids.map((i) => rooms[i] || null)), 'text/plain');
      }
      if (req.method === 'POST' && req.url === '/api/services/scene/turn_on') return send(200, []);
      send(404, '404: Not Found', 'text/plain');
    });
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  base = 'http://127.0.0.1:' + srv.address().port;
});
after(() => srv.close());

// Transport Node respectant le contrat Http du client (XHR sur la TV).
const http = (req, cb) => {
  let done = false;
  const u = new URL(req.url);
  const r = nodeRequest({ hostname: u.hostname, port: u.port, path: u.pathname + u.search, method: req.method, headers: req.headers, timeout: req.timeoutMs }, (res) => {
    let b = '';
    res.on('data', (c) => { b += c; });
    res.on('end', () => { if (!done) { done = true; cb(null, { status: res.statusCode, body: b }); } });
  });
  r.on('timeout', () => { r.destroy(); if (!done) { done = true; cb(new Error('délai dépassé')); } });
  r.on('error', (e) => { if (!done) { done = true; cb(new Error('réseau')); } });
  r.end(req.body);
  return { abort() { done = true; r.destroy(); } };
};
const call = (fn) => new Promise((res) => fn((err, v) => res([err, v])));
const cfg = () => ({ url: base, token: TOKEN });

test('ping : GET /api/ avec le jeton', async () => {
  seen.length = 0;
  const [err] = await call((cb) => ha.ping(http, cfg(), cb));
  assert.equal(err, null);
  assert.deepEqual(seen.map((s) => s.method + ' ' + s.url), ['GET /api/']);
  assert.equal(seen[0].auth, 'Bearer ' + TOKEN);
});

test('scènes : filtrées sur scene.*, nom convivial, pièce en un seul appel groupé', async () => {
  seen.length = 0;
  const [err, scenes] = await call((cb) => ha.listScenes(http, cfg(), cb));
  assert.equal(err, null);
  assert.deepEqual(scenes.map((s) => [s.id, s.name, s.area]).sort(), [
    ['scene.diner', 'Dîner', 'Cuisine'],
    ['scene.film', 'Film', 'Salon'],
    ['scene.nuit', 'scene.nuit', null],
  ]);
  assert.deepEqual(seen.map((s) => s.method + ' ' + s.url), ['GET /api/states', 'POST /api/template']);
  const tpl = JSON.parse(seen[1].body).template;
  assert.match(tpl, /area_name\('scene\.film'\)/);
  assert.doesNotMatch(tpl, /light\.salon/);
});

test('scènes : si le modèle échoue, la liste reste utilisable sans pièce', async () => {
  mode = { templateFails: true };
  const [err, scenes] = await call((cb) => ha.listScenes(http, cfg(), cb));
  mode = {};
  assert.equal(err, null);
  assert.equal(scenes.length, 3);
  assert.ok(scenes.every((s) => s.area === null));
});

test('activation : POST scene/turn_on {entity_id}', async () => {
  seen.length = 0;
  const [err] = await call((cb) => ha.activateScene(http, cfg(), 'scene.film', cb));
  assert.equal(err, null);
  assert.equal(seen[0].method + ' ' + seen[0].url, 'POST /api/services/scene/turn_on');
  assert.deepEqual(JSON.parse(seen[0].body), { entity_id: 'scene.film' });
  assert.equal(seen[0].auth, 'Bearer ' + TOKEN);
});

test('activation : un id qui n’est pas une scène est refusé sans requête', async () => {
  seen.length = 0;
  const [err] = await call((cb) => ha.activateScene(http, cfg(), 'light.salon', cb));
  assert.equal(err.code, 'invalid');
  assert.equal(seen.length, 0);
});

test('jeton refusé : erreur explicite « unauthorized »', async () => {
  for (const fn of [(cb) => ha.ping(http, { url: base, token: 'mauvais' }, cb), (cb) => ha.listScenes(http, { url: base, token: 'mauvais' }, cb)]) {
    const [err] = await call(fn);
    assert.equal(err.code, 'unauthorized');
    assert.match(err.message, /jeton/i);
    assert.ok(!err.message.includes('mauvais'));
  }
});

test('injoignable : erreur explicite « unreachable »', async () => {
  const dead = createServer(); await new Promise((r) => dead.listen(0, '127.0.0.1', r));
  const port = dead.address().port; await new Promise((r) => dead.close(r));
  const [err] = await call((cb) => ha.ping(http, { url: 'http://127.0.0.1:' + port, token: TOKEN }, cb));
  assert.equal(err.code, 'unreachable');
  assert.match(err.message, /injoignable/i);
});

test('délai court : un serveur muet donne « unreachable » et la requête porte un timeout ≤ 5 s', async () => {
  mode = { hang: true };
  let timeout;
  const spy = (req, cb) => { timeout = req.timeoutMs; return http(Object.assign({}, req, { timeoutMs: 100 }), cb); };
  const [err] = await call((cb) => ha.ping(spy, cfg(), cb));
  mode = {};
  assert.equal(err.code, 'unreachable');
  assert.ok(timeout > 0 && timeout <= 5000, String(timeout));
});

test('configuration absente : erreur « config », aucune requête', async () => {
  seen.length = 0;
  for (const prefs of [{}, { haUrl: base }, { haToken: TOKEN }]) assert.equal(ha.haConfigFromPrefs(prefs), null);
  const [err] = await call((cb) => ha.ping(http, null, cb));
  assert.equal(err.code, 'config');
  assert.equal(seen.length, 0);
});

test('configuration : lue depuis prefs.haUrl / prefs.haToken (cimaise.v1), « / » final retiré', () => {
  assert.deepEqual(ha.haConfigFromPrefs({ haUrl: 'http://ha.local:8123/', haToken: 'x' }), { url: 'http://ha.local:8123', token: 'x' });
});

test('REST seulement, aucune minuterie : le source n’a ni WebSocket, ni setTimeout/setInterval', () => {
  for (const f of readdirSync('packages/widgets/src')) {
    const src = readFileSync('packages/widgets/src/' + f, 'utf8').replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(src, /WebSocket|setTimeout|setInterval|requestAnimationFrame|EventSource/, f);
  }
});

test('aperçu : cimaise.v1 pointe sur le relais /__ha (jamais le jeton ni l’URL de HA) ; sans fichier, un avertissement sans secret', async () => {
  const { startDevServer } = await import('../scripts/dev/server.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'haenv-'));
  const file = join(dir, 'ha.env');
  writeFileSync(file, 'HA_URL=http://ha.invalid:8123\nHA_TOKEN=' + TOKEN + '\n');
  const get = async (env) => {
    process.env.HA_ENV_FILE = env;
    const s = await startDevServer({ port: 0 });
    try { return await (await fetch('http://127.0.0.1:' + s.address().port + '/__mocks/ha-session.js')).text(); } finally { s.close(); }
  };
  try {
    const js = await get(file);
    assert.match(js, /cimaise\.v1/);
    assert.ok(js.includes('haUrl') && js.includes('/__ha') && !js.includes(TOKEN) && !js.includes('ha.invalid'));
    const none = await get(join(dir, 'absent.env'));
    assert.match(none, /console\.warn/);
    assert.ok(!none.includes(TOKEN));
  } finally { delete process.env.HA_ENV_FILE; rmSync(dir, { recursive: true, force: true }); }
});

test('le build n’embarque aucun jeton ni chemin de ha.env', () => {
  const env = (() => { try { return readFileSync('/home/swetterwald/git/cimaise/.local/ha.env', 'utf8'); } catch (e) { return ''; } })();
  const secret = (/^HA_TOKEN=(.+)$/m.exec(env) || [])[1];
  for (const f of readdirSync('apps/tv/dist', { recursive: true }).filter((f) => /\.(js|css|html|xml)$/.test(f))) {
    const txt = readFileSync('apps/tv/dist/' + f, 'utf8');
    assert.ok(!/ha\.env/.test(txt), f);
    if (secret) assert.ok(!txt.includes(secret), f);
  }
});
