// Client Overseerr (packages/overseerr) : compilé comme sur la TV (tsc ES5 puis bundle), contre un faux serveur nourri des
// fixtures capturées en lecture seule (scripts/overseerr/capture-fixtures.mjs). Aucune vraie demande n'est jamais envoyée.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';

let api, bundle;
before(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'overseerr-api-'));
  const es5Dir = join(dir, 'es5');
  const t = spawnSync('node_modules/.bin/tsc', ['-p', 'packages/overseerr/tsconfig.json', '--outDir', es5Dir], { encoding: 'utf8' });
  assert.equal(t.status, 0, t.stdout + t.stderr);
  bundle = join(dir, 'overseerr.cjs');
  await build({ entryPoints: [join(es5Dir, 'overseerr/src/index.js')], bundle: true, format: 'cjs', target: 'es5', outfile: bundle, logLevel: 'warning' });
  api = createRequire(import.meta.url)(bundle);
});

const fx = (n) => readFileSync('tests/fixtures/overseerr/' + n + '.json', 'utf8');
const CFG = { url: 'https://ov.example.test', key: 'SECRET-KEY' };

// Faux transport : routes = [[regex sur l'URL, {status, body, error} | fonction]] ; enregistre les requêtes.
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

test('le bundle du client reste en ES5', () => {
  const r = spawnSync('node_modules/.bin/es-check', ['es5', bundle], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test('films du moment : GET /api/v1/discover/movies paginé, X-Api-Key, langue, titres normalisés', async () => {
  const http = fakeHttp([[/discover\/movies/, { body: fx('discover-movies') }]]);
  const [err, p] = await sync((cb) => api.discoverMovies(http, { ...CFG, language: 'fr' }, 2, cb));
  assert.equal(err, null);
  const req = http.calls[0];
  assert.equal(req.method, 'GET');
  assert.equal(req.url, 'https://ov.example.test/api/v1/discover/movies?page=2&language=fr');
  assert.equal(req.headers['X-Api-Key'], 'SECRET-KEY');
  assert.equal(req.headers.Accept, 'application/json');
  assert.equal(req.body, undefined);
  assert.ok(req.timeoutMs > 0);
  assert.deepEqual([p.page, p.totalPages, p.totalResults, p.items.length], [1, 1001, 20001, 6]);
  assert.deepEqual(p.items[0], { id: 1000, mediaType: 'movie', title: 'Film 1', year: 1994, posterPath: '/affiche1.jpg', overview: 'Résumé 1', availability: 'none' });
  assert.deepEqual(p.items.map((t) => t.availability), ['none', 'none', 'none', 'none', 'none', 'available']); // statut 1 = inconnu
});

test('séries du moment : name et firstAirDate ramenés à title et year', async () => {
  const http = fakeHttp([[/discover\/tv/, { body: fx('discover-tv') }]]);
  const [err, p] = await sync((cb) => api.discoverTv(http, CFG, 1, cb));
  assert.equal(err, null);
  assert.equal(http.calls[0].url, 'https://ov.example.test/api/v1/discover/tv?page=1');
  assert.ok(p.items.every((t) => t.mediaType === 'tv' && /^Série \d+$/.test(t.title) && typeof t.year === 'number'));
  assert.equal(p.items[5].availability, 'partial');
});

test('tendances : films et séries mêlés, statut 3 = demandé', async () => {
  const http = fakeHttp([[/discover\/trending/, { body: fx('trending') }]]);
  const [, p] = await sync((cb) => api.trending(http, CFG, 1, cb));
  assert.deepEqual(p.items.map((t) => t.mediaType), ['tv', 'movie', 'tv', 'movie', 'movie', 'movie']);
  assert.deepEqual(p.items.slice(4).map((t) => t.availability), ['available', 'processing']);
});

test('recherche : personnes retirées, affiche absente → null, totaux réels conservés', async () => {
  const http = fakeHttp([[/\/search\?/, { body: fx('search') }]]);
  const [err, p] = await sync((cb) => api.search(http, CFG, 'amelie', 1, cb));
  assert.equal(err, null);
  assert.equal(p.items.length, 5);
  assert.ok(p.items.every((t) => t.mediaType !== 'person'));
  assert.equal(p.items[2].posterPath, null);
  assert.equal(p.totalResults, 834);
});

test('recherche : encodage strict (Overseerr refuse ! \' ( ) * non encodés)', async () => {
  const http = fakeHttp([[/\/search\?/, { body: fx('search') }]]);
  await sync((cb) => api.search(http, CFG, "  l'été (1977)! *  ", 3, cb));
  assert.equal(http.calls[0].url, 'https://ov.example.test/api/v1/search?page=3&query=l%27%C3%A9t%C3%A9%20%281977%29%21%20%2A');
  assert.equal(api.strictEncode('1/2 & 3+4 #5 ?'), '1%2F2%20%26%203%2B4%20%235%20%3F');
  assert.equal(api.strictEncode('Spider-Man_v2.~'), 'Spider-Man_v2.~');
});

test('recherche vide : page vide sans requête', async () => {
  const http = fakeHttp([]);
  const [err, p] = await sync((cb) => api.search(http, CFG, '   ', 1, cb));
  assert.equal(err, null);
  assert.deepEqual(p, { items: [], page: 1, totalPages: 0, totalResults: 0 });
  assert.equal(http.calls.length, 0);
});

test('disponibilité et badge : 2 en attente, 3 demandé, 4 partiel, 5 disponible ; 1, absent ou inconnu → aucun badge', () => {
  const cases = [[undefined, 'none', null], [{ status: 1 }, 'none', null], [{ status: 2 }, 'pending', 'En attente'],
    [{ status: 3 }, 'processing', 'Demandé'], [{ status: 4 }, 'partial', 'Partiellement disponible'],
    [{ status: 5 }, 'available', 'Disponible'], [{ status: 7 }, 'none', null], [null, 'none', null]];
  for (const [mi, av, label] of cases) {
    assert.equal(api.availability(mi), av, JSON.stringify(mi));
    assert.equal(api.availabilityLabel(av), label);
  }
});

test('affiches : TMDB w185 ou w300, jamais l\'original', () => {
  assert.equal(api.posterUrl('/a.jpg', 'w185'), 'https://image.tmdb.org/t/p/w185/a.jpg');
  assert.equal(api.posterUrl('/a.jpg', 'w300'), 'https://image.tmdb.org/t/p/w300/a.jpg');
  assert.equal(api.posterUrl('/a.jpg', 'original'), 'https://image.tmdb.org/t/p/w185/a.jpg');
  assert.equal(api.posterUrl(null, 'w185'), null);
  assert.equal(api.posterUrl('/a.jpg', 'w185', 'https://ov.example.test/imageproxy/tmdb/t/p/'), 'https://ov.example.test/imageproxy/tmdb/t/p/w185/a.jpg');
});

test('pages voisines : appendTitles retire les doublons de TMDB (même type et même id)', () => {
  const t = (id, mediaType) => ({ id, mediaType, title: 'x', year: null, posterPath: null, overview: '', availability: 'none' });
  const list = [t(1, 'movie'), t(2, 'movie')];
  const out = api.appendTitles(list, [t(2, 'movie'), t(3, 'movie'), t(2, 'tv'), t(3, 'movie')]);
  assert.equal(out, list);
  assert.deepEqual(out.map((x) => x.mediaType + x.id), ['movie1', 'movie2', 'movie3', 'tv2']);
});

test('demande d\'un film : POST /api/v1/request {mediaType, mediaId}, sans seasons', async () => {
  const http = fakeHttp([[/\/request$/, { status: 201, body: fx('request') }]]);
  const [err, r] = await sync((cb) => api.requestMedia(http, CFG, 'movie', 603, cb));
  assert.equal(err, null);
  const req = http.calls[0];
  assert.equal(req.method, 'POST');
  assert.equal(req.url, 'https://ov.example.test/api/v1/request');
  assert.equal(req.headers['Content-Type'], 'application/json');
  assert.equal(req.headers['X-Api-Key'], 'SECRET-KEY');
  assert.deepEqual(JSON.parse(req.body), { mediaType: 'movie', mediaId: 603 });
  assert.deepEqual(r, { id: 1029, status: 2, availability: 'partial' });
});

test('demande d\'une série : seasons "all"', async () => {
  const http = fakeHttp([[/\/request$/, { status: 201, body: fx('request') }]]);
  await sync((cb) => api.requestMedia(http, CFG, 'tv', 1399, cb));
  assert.deepEqual(JSON.parse(http.calls[0].body), { mediaType: 'tv', mediaId: 1399, seasons: 'all' });
});

test('erreurs : codes typés, la clé n\'apparaît jamais', async () => {
  const cases = [
    ['GET', { status: 403, body: '{"status":403,"error":"You do not have permission to access this endpoint"}' }, 'unauthorized'],
    ['GET', { status: 401, body: '' }, 'unauthorized'],
    ['POST', { status: 403, body: '{}' }, 'forbidden'],
    ['POST', { status: 409, body: '{}' }, 'exists'],
    ['GET', { status: 400, body: '{}' }, 'invalid'],
    ['GET', { status: 500, body: '' }, 'http'],
    ['GET', { status: 0, body: '' }, 'unreachable'],
    ['GET', { error: 'délai dépassé' }, 'unreachable'],
    ['GET', { status: 200, body: '<html>' }, 'format'],
    ['POST', { status: 201, body: '{"message":"ok"}' }, 'format'],
  ];
  for (const [method, res, code] of cases) {
    const http = fakeHttp([[/./, res]]);
    const [err] = await sync((cb) => (method === 'GET' ? api.discoverMovies(http, CFG, 1, cb) : api.requestMedia(http, CFG, 'movie', 1, cb)));
    assert.equal(err && err.code, code, method + ' ' + JSON.stringify(res));
    assert.ok(!err.message.includes('SECRET-KEY'));
  }
});

test('sans configuration : erreur config, aucune requête', async () => {
  const http = fakeHttp([]);
  for (const cfg of [null, { url: '', key: 'k' }, { url: 'https://a.test', key: '' }]) {
    const [err] = await sync((cb) => api.trending(http, cfg, 1, cb));
    assert.equal(err.code, 'config');
  }
  const [err] = await sync((cb) => api.requestMedia(http, null, 'movie', 1, cb));
  assert.equal(err.code, 'config');
  assert.equal(http.calls.length, 0);
});

test('abandon : aucun rappel après abort()', async () => {
  const http = fakeHttp([[/./, { body: fx('discover-movies') }]]);
  let called = 0;
  api.discoverMovies(http, CFG, 1, () => { called++; }).abort();
  await new Promise((r) => setImmediate(r)); await new Promise((r) => setImmediate(r));
  assert.equal(called, 0);
});

test('configuration : Réglages (cimaise.v1) d\'abord, puis copie empaquetée (window), sinon null', () => {
  const w = { __cimaiseOverseerr: { url: 'https://pkg.test/', key: 'pk' } };
  assert.deepEqual(api.overseerrConfigFrom({ overseerrUrl: 'https://prefs.test//', overseerrKey: 'k' }, w), { url: 'https://prefs.test', key: 'k' });
  assert.deepEqual(api.overseerrConfigFrom({ overseerrUrl: 'https://prefs.test' }, w), { url: 'https://pkg.test', key: 'pk' });
  assert.deepEqual(api.overseerrConfigFrom(null, w), { url: 'https://pkg.test', key: 'pk' });
  assert.equal(api.overseerrConfigFrom({}, {}), null);
  assert.equal(api.overseerrConfigFrom(null, { __cimaiseOverseerr: { url: 'https://a.test' } }), null);
});

test('scripts de vérification : le transport Node refuse tout POST (aucune vraie demande possible)', async () => {
  const { nodeHttp } = await import('../scripts/overseerr/lib.mjs');
  const [err] = await sync((cb) => api.requestMedia(nodeHttp, CFG, 'movie', 1, cb));
  assert.equal(err.code, 'unreachable');
  assert.match(err.message, /lecture seule/);
});

test('Tester : /status sans clé, puis /settings/about avec la clé ; version et nombre de médias', async () => {
  const http = fakeHttp([[/\/status$/, { body: '{"version":"1.33.2","commitTag":"x"}' }], [/\/settings\/about$/, { body: '{"version":"1.33.2","totalMediaItems":771}' }]]);
  const [err, info] = await sync((cb) => api.testConnection(http, CFG, cb));
  assert.equal(err, null);
  assert.deepEqual(info, { version: '1.33.2', mediaItems: 771 });
  assert.deepEqual(http.calls.map((c) => c.url), ['https://ov.example.test/api/v1/status', 'https://ov.example.test/api/v1/settings/about']);
  assert.equal(http.calls[0].headers['X-Api-Key'], undefined, '/status part sans la clé');
  assert.equal(http.calls[1].headers['X-Api-Key'], 'SECRET-KEY');
});

test('Tester : clé refusée, injoignable, autre serveur, non configuré ; la clé n\'apparaît jamais', async () => {
  const st = { body: '{"version":"1.33.2"}' };
  const cases = [
    [[[/\/status$/, st], [/about/, { status: 403, body: '{}' }]], 'unauthorized', 2],
    [[[/\/status$/, { error: 'réseau' }]], 'unreachable', 1],
    [[[/\/status$/, { status: 0, body: '' }]], 'unreachable', 1],
    [[[/\/status$/, { status: 404, body: '' }]], 'http', 1],
    [[[/\/status$/, { body: '<html>' }]], 'format', 1],
  ];
  for (const [routes, code, n] of cases) {
    const http = fakeHttp(routes);
    const [err] = await sync((cb) => api.testConnection(http, CFG, cb));
    assert.equal(err && err.code, code, JSON.stringify(routes[routes.length - 1][1]));
    assert.equal(http.calls.length, n);
    assert.ok(!err.message.includes('SECRET-KEY'));
  }
  const none = fakeHttp([]);
  const [err] = await sync((cb) => api.testConnection(none, { url: 'https://a.test', key: '' }, cb));
  assert.equal(err.code, 'config');
  assert.equal(none.calls.length, 0);
});

test('Réglages : adresse et clé enregistrées dans cimaise.v1, relues après redémarrage (nouveau chargement du stockage)', () => {
  const mem = {};
  const store = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); } };
  api.saveOverseerrConfig('https://ov.example.test', 'SECRET-KEY', store);
  assert.deepEqual(Object.keys(mem), ['cimaise.v1']);
  const prefs = JSON.parse(mem['cimaise.v1']).prefs;
  assert.deepEqual(api.overseerrConfigFrom(prefs, {}), { url: 'https://ov.example.test', key: 'SECRET-KEY' });
  assert.equal(api.DEFAULT_OVERSEERR_URL, 'https://overseerr.wetter.land');
});
