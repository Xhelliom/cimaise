import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';

let api;
before(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'plexapi-'));
  const es5Dir = join(dir, 'es5');
  const t = spawnSync('node_modules/.bin/tsc', ['-p', 'packages/plex/tsconfig.json', '--outDir', es5Dir], { encoding: 'utf8' });
  assert.equal(t.status, 0, t.stdout + t.stderr);
  const out = join(dir, 'plex.cjs');
  await build({ entryPoints: [join(es5Dir, 'plex/src/api/index.js')], bundle: true, format: 'cjs', target: 'es5', outfile: out, logLevel: 'warning' });
  api = createRequire(import.meta.url)(out);
});

const fx = (n) => readFileSync('tests/fixtures/plex/' + n + '.json', 'utf8');
const ID = { clientId: 'test-client-uuid', product: 'Cimaise', version: '0.0.0', platform: 'Tizen', device: 'Frame' };
const SERVER = { uri: 'http://192.0.2.10:32400', token: 'FAKE-SERVER-TOKEN' };

// Faux transport : routes = [[regex sur l'URL, {status, body} | fonction]] ; enregistre les requêtes.
function fakeHttp(routes) {
  const calls = [];
  const http = (req, cb) => {
    calls.push(req);
    const r = routes.find((x) => x[0].test(req.url));
    let live = true;
    if (!r) { cb(new Error('pas de route ' + req.url)); return { abort() {} }; }
    const res = typeof r[1] === 'function' ? r[1](req) : r[1];
    setImmediate(() => { if (live) res.error ? cb(new Error(res.error)) : cb(null, { status: res.status === undefined ? 200 : res.status, body: res.body }); });
    return { abort() { live = false; } };
  };
  http.calls = calls;
  return http;
}
const sync = (fn) => new Promise((resolve) => fn((err, v) => resolve([err, v])));

// Horloge simulée.
function fakeTimers() {
  let now = 0, id = 0; const q = [];
  return {
    now: () => now,
    setTimeout: (f, ms) => { q.push({ id: ++id, at: now + ms, f }); return id; },
    clearTimeout: (i) => { const k = q.findIndex((x) => x.id === i); if (k >= 0) q.splice(k, 1); },
    pending: () => q.length,
    advance: async (ms) => {
      const end = now + ms;
      for (;;) {
        q.sort((a, b) => a.at - b.at);
        if (!q.length || q[0].at > end) break;
        const t = q.shift(); now = t.at; t.f();
        await new Promise((r) => setImmediate(r)); await new Promise((r) => setImmediate(r));
      }
      now = end;
    },
  };
}

test('en-têtes communs', () => {
  const h = api.plexHeaders(ID, 'FAKE-TOKEN');
  assert.equal(h['X-Plex-Client-Identifier'], 'test-client-uuid');
  assert.equal(h['X-Plex-Token'], 'FAKE-TOKEN');
  assert.equal(h['Accept'], 'application/json');
  for (const k of ['X-Plex-Product', 'X-Plex-Version', 'X-Plex-Platform', 'X-Plex-Device']) assert.ok(h[k], k);
  assert.equal('X-Plex-Token' in api.plexHeaders(ID), false);
});

test('identifiant client : UUID généré une fois puis relu du stockage tv-core', () => {
  const mem = { d: {}, getItem(k) { return k in this.d ? this.d[k] : null; }, setItem(k, v) { this.d[k] = String(v); } };
  const a = api.getClientId(mem);
  assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(api.getClientId(mem), a);
  assert.ok(JSON.parse(mem.d['cimaise.v1']).prefs.plexClientId === a);
});

test('PIN : création', async () => {
  const http = fakeHttp([[/plex\.tv\/api\/v2\/pins/, { body: fx('pin-create') }]]);
  const [err, pin] = await sync((cb) => api.createPin(http, ID, cb));
  assert.equal(err, null);
  assert.deepEqual([pin.id, pin.code], [1234, 'ABCD']);
  assert.equal(http.calls[0].method, 'POST');
  assert.equal(http.calls[0].headers['X-Plex-Client-Identifier'], 'test-client-uuid');
});

test('PIN : interrogation périodique avec horloge simulée, jusqu\'au jeton', async () => {
  let n = 0;
  const http = fakeHttp([[/pins\/1234/, () => ({ body: ++n < 3 ? fx('pin-pending') : fx('pin-done') })]]);
  const timers = fakeTimers(); let result = null;
  api.pollPin(http, ID, 1234, timers, { intervalMs: 1000, timeoutMs: 60000 }, (r) => { result = r; });
  await timers.advance(900); assert.equal(n, 0);
  await timers.advance(100); assert.equal(n, 1); assert.equal(result, null);
  await timers.advance(1000); assert.equal(n, 2);
  await timers.advance(1000);
  assert.deepEqual(result, { status: 'token', token: 'FAKE-ACCOUNT-TOKEN' });
  assert.equal(timers.pending(), 0);
});

test('PIN : annulation propre (minuterie effacée, requête abandonnée, aucun rappel)', async () => {
  const http = fakeHttp([[/pins\/1234/, { body: fx('pin-pending') }]]);
  const timers = fakeTimers(); let called = 0;
  const cancel = api.pollPin(http, ID, 1234, timers, { intervalMs: 1000, timeoutMs: 60000 }, () => { called++; });
  await timers.advance(1000); // requête en vol
  cancel();
  assert.equal(timers.pending(), 0);
  await timers.advance(10000);
  assert.equal(called, 0);
  assert.equal(http.calls.length, 1);
  cancel(); // idempotent
});

test('PIN : expiration au délai', async () => {
  const http = fakeHttp([[/pins\/1234/, { body: fx('pin-pending') }]]);
  const timers = fakeTimers(); let result = null;
  api.pollPin(http, ID, 1234, timers, { intervalMs: 1000, timeoutMs: 3500 }, (r) => { result = r; });
  await timers.advance(5000);
  assert.equal(result.status, 'expired');
  assert.equal(timers.pending(), 0);
});

test('ressources : serveurs seulement, locale joignable choisie en priorité', async () => {
  const http = fakeHttp([
    [/plex\.tv\/api\/v2\/resources/, { body: fx('resources') }],
    [/192\.0\.2\.11.*\/identity/, { error: 'injoignable' }],
    [/192\.0\.2\.10.*\/identity/, { body: '{}' }],
  ]);
  const [err, servers] = await sync((cb) => api.getServers(http, ID, 'FAKE-ACCOUNT-TOKEN', cb));
  assert.equal(err, null);
  assert.equal(servers.length, 1);
  assert.equal(servers[0].name, 'Serveur test');
  const [e2, ref] = await sync((cb) => api.chooseConnection(http, ID, servers[0], cb));
  assert.equal(e2, null);
  assert.deepEqual(ref, { uri: 'http://192.0.2.10:32400', token: 'FAKE-SERVER-TOKEN' });
  const probed = http.calls.filter((c) => /identity/.test(c.url)).map((c) => c.url);
  assert.ok(probed[0].indexOf('192.0.2.11') === 0 || probed[0].indexOf('http://192.0.2.11') === 0);
  assert.ok(probed.every((u) => u.indexOf('203.0.113') < 0 && u.indexOf('relay') < 0), 'distantes non sondées si une locale répond');
});

test('ressources : repli sur une connexion distante si aucune locale ne répond', async () => {
  const http = fakeHttp([
    [/plex\.tv/, { body: fx('resources') }],
    [/192\.0\.2\./, { error: 'hors ligne' }],
    [/203\.0\.113\.5.*identity/, { body: '{}' }],
  ]);
  const [, servers] = await sync((cb) => api.getServers(http, ID, 'T', cb));
  const [err, ref] = await sync((cb) => api.chooseConnection(http, ID, servers[0], cb));
  assert.equal(err, null);
  assert.equal(ref.uri, 'https://203.0.113.5:32400');
});

test('ressources : aucune connexion joignable → erreur', async () => {
  const http = fakeHttp([[/plex\.tv/, { body: fx('resources') }], [/identity/, { error: 'non' }]]);
  const [, servers] = await sync((cb) => api.getServers(http, ID, 'T', cb));
  const [err] = await sync((cb) => api.chooseConnection(http, ID, servers[0], cb));
  assert.ok(err);
});

test('/library/sections', async () => {
  const http = fakeHttp([[/\/library\/sections$/, { body: fx('sections') }]]);
  const [err, s] = await sync((cb) => api.getSections(http, ID, SERVER, cb));
  assert.equal(err, null);
  assert.deepEqual(s.map((x) => [x.key, x.title, x.type]), [['1', 'Films', 'movie'], ['2', 'Séries', 'show']]);
  assert.equal(http.calls[0].headers['X-Plex-Token'], 'FAKE-SERVER-TOKEN');
});

test('/library/sections/{id}/all paginé', async () => {
  const http = fakeHttp([[/sections\/1\/all/, { body: fx('section-all') }]]);
  const [err, page] = await sync((cb) => api.getSectionItems(http, ID, SERVER, '1', 20, 2, cb));
  assert.equal(err, null);
  assert.equal(page.total, 57); assert.equal(page.offset, 20); assert.equal(page.items.length, 2);
  assert.equal(http.calls[0].headers['X-Plex-Container-Start'], '20');
  assert.equal(http.calls[0].headers['X-Plex-Container-Size'], '2');
});

test('onDeck, recentlyAdded', async () => {
  const http = fakeHttp([[/onDeck/, { body: fx('ondeck') }], [/recentlyAdded/, { body: fx('recently-added') }]]);
  const [, d] = await sync((cb) => api.getOnDeck(http, ID, SERVER, cb));
  assert.equal(d[0].viewOffset, 600000);
  const [, r] = await sync((cb) => api.getRecentlyAdded(http, ID, SERVER, cb));
  assert.equal(r[0].title, 'Nouveau film');
  assert.match(http.calls[0].url, /\/library\/onDeck$/);
});

test('metadata et children', async () => {
  const http = fakeHttp([[/metadata\/101\/children/, { body: fx('children') }], [/metadata\/101$/, { body: fx('metadata') }]]);
  const [, m] = await sync((cb) => api.getMetadata(http, ID, SERVER, '101', cb));
  assert.equal(m.Media[0].Part[0].key, '/library/parts/11/1700000000/file.mkv');
  const [, c] = await sync((cb) => api.getChildren(http, ID, SERVER, '101', cb));
  assert.equal(c.length, 2);
});

test('erreur HTTP → erreur typée', async () => {
  const http = fakeHttp([[/sections/, { status: 401, body: '' }]]);
  const [err] = await sync((cb) => api.getSections(http, ID, SERVER, cb));
  assert.equal(err.status, 401);
});

test('transcodeur photo : largeur/hauteur exactes, URL source encodée', () => {
  const u = api.photoUrl(SERVER, '/library/metadata/101/thumb/1', 300, 450);
  assert.ok(u.indexOf('http://192.0.2.10:32400/photo/:/transcode?') === 0);
  assert.match(u, /[?&]width=300(&|$)/);
  assert.match(u, /[?&]height=450(&|$)/);
  assert.match(u, /[?&]url=%2Flibrary%2Fmetadata%2F101%2Fthumb%2F1(&|$)/);
  assert.match(u, /X-Plex-Token=FAKE-SERVER-TOKEN/);
  assert.match(api.photoUrl(SERVER, '/x', 300.4, 449.6), /width=300&height=450|height=450.*width=300/);
});

test('lecture directe : URL de la partie avec jeton', () => {
  assert.equal(api.directPlayUrl(SERVER, '/library/parts/11/1700000000/file.mkv'),
    'http://192.0.2.10:32400/library/parts/11/1700000000/file.mkv?X-Plex-Token=FAKE-SERVER-TOKEN');
});

test('timeline, scrobble, unscrobble', async () => {
  const http = fakeHttp([[/./, { body: '' }]]);
  const [e1] = await sync((cb) => api.sendTimeline(http, ID, SERVER,
    { ratingKey: '101', state: 'playing', timeMs: 5000, durationMs: 7200000 }, cb));
  assert.equal(e1, null);
  const u = http.calls[0].url;
  assert.match(u, /\/:\/timeline\?/);
  assert.match(u, /ratingKey=101/); assert.match(u, /state=playing/); assert.match(u, /time=5000/); assert.match(u, /duration=7200000/);
  assert.match(u, /key=%2Flibrary%2Fmetadata%2F101/);
  await sync((cb) => api.scrobble(http, ID, SERVER, '101', cb));
  await sync((cb) => api.unscrobble(http, ID, SERVER, '101', cb));
  assert.match(http.calls[1].url, /\/:\/scrobble\?.*key=101/);
  assert.match(http.calls[2].url, /\/:\/unscrobble\?.*key=101/);
});

test('aucun secret ni hôte réel dans les sources et fixtures', () => {
  const out = spawnSync('grep', ['-rIEn', '--exclude=*.test.mjs', '-e', 'X-Plex-Token=[A-Za-z0-9]{15,}', '-e', '\\b(10|192\\.168)\\.[0-9]+\\.[0-9]+', 'packages/plex', 'tests/fixtures/plex'], { encoding: 'utf8' });
  assert.equal(out.stdout, '');
});

test('un rappel qui lève n\'est appelé qu\'une fois (pas de second appel « JSON invalide »)', async () => {
  const http = fakeHttp([[/sections$/, { body: fx('sections') }]]);
  const seen = [];
  const prev = process.listeners('uncaughtException');
  process.removeAllListeners('uncaughtException');
  const thrown = new Promise((resolve) => process.once('uncaughtException', resolve));
  api.getSections(http, ID, SERVER, (err, v) => { seen.push([err, v]); throw new Error('boum'); });
  const e = await thrown;
  await new Promise((r) => setImmediate(r));
  prev.forEach((l) => process.on('uncaughtException', l));
  assert.equal(e.message, 'boum');
  assert.equal(seen.length, 1);
  assert.equal(seen[0][0], null);
});

test('JSON invalide → une seule erreur', async () => {
  const http = fakeHttp([[/sections$/, { body: '{pas du json' }]]);
  const seen = [];
  api.getSections(http, ID, SERVER, (err) => seen.push(err));
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(seen.length, 1);
  assert.match(seen[0].message, /JSON invalide/);
});

test('ressources : corps non tableau ou ressource sans connections → pas d\'exception', async () => {
  for (const body of ['null', '{"a":1}', '']) {
    const http = fakeHttp([[/plex\.tv/, { body }]]);
    const [err, s] = await sync((cb) => api.getServers(http, ID, 'T', cb));
    assert.ok(err || (Array.isArray(s) && s.length === 0), 'corps ' + body);
  }
  const http = fakeHttp([[/plex\.tv/, { body: '[{"name":"X","provides":"server","accessToken":"T"}]' }]]);
  const [err, s] = await sync((cb) => api.getServers(http, ID, 'T', cb));
  assert.equal(err, null);
  assert.deepEqual(s.map((x) => x.connections.length), [0]);
});
