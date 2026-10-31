// Remontée de la progression (timeline, scrobble) et rafraîchissement des caches au retour de lecture.
// Faux serveur uniquement : aucun appel d'écriture vers un vrai serveur.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';

let plex;
before(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'plexprog-'));
  const es5 = join(dir, 'es5');
  const t = spawnSync('node_modules/.bin/tsc', ['-p', 'packages/plex/tsconfig.json', '--outDir', es5], { encoding: 'utf8' });
  assert.equal(t.status, 0, t.stdout + t.stderr);
  const out = join(dir, 'plex.cjs');
  await build({ entryPoints: [join(es5, 'plex/src/index.js')], bundle: true, format: 'cjs', target: 'es5', outfile: out, logLevel: 'warning' });
  plex = createRequire(import.meta.url)(out);
});

const SERVER = { uri: 'https://192-0-2-10.' + '0'.repeat(32) + '.plex.direct:32400', token: 'FAKE-SERVER-TOKEN' };
const ID = { clientId: 'test-client-uuid', product: 'Cimaise', version: '0.0.0', platform: 'Tizen', device: 'Frame' };
const DUR = 100000;

function fakeTimers() {
  let now = 0, id = 0; const q = [];
  return {
    now: () => now,
    setTimeout: (f, ms) => { q.push({ id: ++id, at: now + ms, f }); return id; },
    clearTimeout: (i) => { const k = q.findIndex((x) => x.id === i); if (k >= 0) q.splice(k, 1); },
    pending: () => q.length,
    advance(ms) {
      const end = now + ms;
      for (;;) {
        q.sort((a, b) => a.at - b.at);
        if (!q.length || q[0].at > end) break;
        const t = q.shift(); now = t.at; t.f();
      }
      now = end;
    },
  };
}

// Faux serveur synchrone : enregistre les requêtes ; `failing` = erreur réseau.
function fakeServer() {
  const calls = [];
  const http = (req, cb) => {
    calls.push(req);
    if (http.failing) cb(new Error('réseau coupé')); else cb(null, { status: 200, body: '' });
    return { abort() {} };
  };
  http.calls = calls; http.failing = false;
  http.timelines = () => calls.filter((c) => /\/:\/timeline/.test(c.url));
  http.scrobbles = () => calls.filter((c) => /\/:\/scrobble/.test(c.url));
  return http;
}
const param = (req, k) => new URL(req.url).searchParams.get(k);

function setup(over = {}) {
  const http = over.http || fakeServer(), timers = fakeTimers();
  let pos = 0, finished = null;
  const p = plex.createProgress({
    http, id: ID, session: SERVER, timers, ratingKey: '101', durationMs: DUR,
    getPosition: () => pos, onFinish: (ms, w) => { finished = [ms, w]; },
  });
  return { http, timers, p, at: (ms) => { pos = ms; }, finished: () => finished };
}

test('timeline à chaque changement d\'état, avec en-têtes X-Plex-* complets', () => {
  const s = setup();
  s.at(2000); s.p.playing();
  s.at(5000); s.p.paused();
  s.at(6000); s.p.playing();
  const t = s.http.timelines();
  assert.deepEqual(t.map((r) => param(r, 'state')), ['playing', 'paused', 'playing']);
  assert.deepEqual(t.map((r) => param(r, 'time')), ['2000', '5000', '6000']);
  assert.equal(param(t[0], 'ratingKey'), '101');
  assert.equal(param(t[0], 'key'), '/library/metadata/101');
  assert.equal(param(t[0], 'duration'), String(DUR));
  assert.equal(t[0].headers['X-Plex-Client-Identifier'], 'test-client-uuid');
  assert.equal(t[0].headers['X-Plex-Token'], 'FAKE-SERVER-TOKEN');
  for (const h of ['X-Plex-Product', 'X-Plex-Version', 'X-Plex-Platform', 'X-Plex-Device']) assert.ok(t[0].headers[h], h);
});

test('timeline toutes les 10 s pendant la lecture, avec la position courante', () => {
  const s = setup();
  s.p.playing();
  s.at(10000); s.timers.advance(9999);
  assert.equal(s.http.timelines().length, 1);
  s.timers.advance(1);
  assert.equal(s.http.timelines().length, 2);
  s.at(20000); s.timers.advance(10000);
  const t = s.http.timelines();
  assert.equal(t.length, 3);
  assert.deepEqual(t.slice(1).map((r) => [param(r, 'state'), param(r, 'time')]), [['playing', '10000'], ['playing', '20000']]);
});

test('arrêt : state=stopped avec la position, plus aucun tick, la position reste (pas de scrobble avant 90 %)', () => {
  const s = setup();
  s.p.playing(); s.at(30000); s.timers.advance(10000);
  s.p.stop(false);
  const last = s.http.timelines().pop();
  assert.equal(param(last, 'state'), 'stopped');
  assert.equal(param(last, 'time'), '30000');
  assert.equal(s.http.scrobbles().length, 0);
  assert.equal(s.timers.pending(), 0);
  const n = s.http.calls.length;
  s.timers.advance(60000);
  assert.equal(s.http.calls.length, n);
  assert.deepEqual(s.finished(), [30000, false]);
});

test('scrobble au-delà de 90 %, une seule fois', () => {
  const s = setup();
  s.p.playing();
  s.at(89000); s.timers.advance(10000);
  assert.equal(s.http.scrobbles().length, 0);
  s.at(90000); s.timers.advance(10000);
  assert.equal(s.http.scrobbles().length, 1);
  assert.match(s.http.scrobbles()[0].url, /key=101/);
  s.at(95000); s.timers.advance(10000);
  s.p.stop(false);
  assert.equal(s.http.scrobbles().length, 1);
  assert.deepEqual(s.finished(), [95000, true]);
});

test('fin de flux : stopped à la durée et scrobble', () => {
  const s = setup();
  s.p.playing(); s.at(40000);
  s.p.stop(true);
  const last = s.http.timelines().pop();
  assert.equal(param(last, 'time'), String(DUR));
  assert.equal(s.http.scrobbles().length, 1);
  assert.deepEqual(s.finished(), [DUR, true]);
});

test('échecs réseau : aucune exception, nouvel essai au tick suivant, scrobble retenté', () => {
  const http = fakeServer();
  const s = setup({ http });
  http.failing = true;
  s.at(1000); s.p.playing();
  s.at(95000); s.timers.advance(10000);
  assert.equal(http.scrobbles().length, 1);
  s.timers.advance(10000);
  assert.equal(http.scrobbles().length, 2);   // l'échec n'a pas marqué « vu »
  http.failing = false;
  s.timers.advance(10000);
  assert.equal(http.scrobbles().length, 3);
  s.timers.advance(10000);
  assert.equal(http.scrobbles().length, 3);   // réussi : plus d'essai
  assert.equal(param(http.timelines().pop(), 'time'), '95000');
});

test('transport qui lève : la lecture n\'est pas touchée', () => {
  const s = setup({ http: () => { throw new Error('boum'); } });
  s.p.playing(); s.timers.advance(10000); s.p.paused(); s.p.stop(true);
  assert.deepEqual(s.finished(), [DUR, true]);
});

test('aucun appel après stop (changements d\'état ignorés)', () => {
  const s = setup();
  s.p.playing(); s.p.stop(false);
  const n = s.http.calls.length;
  s.p.playing(); s.p.stop(true);
  assert.equal(s.http.calls.length, n);
});

// ---- caches au retour -------------------------------------------------------------------------------------------
function memStore() {
  const m = {};
  return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; } };
}

test('retour de lecture : fiche corrigée sur place, « En cours » et parents rechargés', () => {
  const cache = plex.createCache({ store: memStore(), ns: 'srv' });
  const data = plex.createData(() => { throw new Error('pas de réseau'); }, ID, SERVER, cache);
  const ep = { ratingKey: '7', type: 'episode', title: 'E', parentRatingKey: '6', grandparentRatingKey: '5' };
  cache.set('m:7', { ...ep, viewOffset: 1000, duration: DUR });
  cache.set('ondeck', [ep]); cache.set('c:6', [ep]); cache.set('m:5', { ratingKey: '5' }); cache.set('c:5', []);

  data.progressed(ep, 42000, false);
  assert.equal(cache.get('m:7').value.viewOffset, 42000);
  // « En cours » et la liste du parent : position locale tout de suite, mais marqués périmés (le serveur est redemandé).
  assert.equal(cache.get('ondeck').value[0].viewOffset, 42000);
  assert.equal(cache.get('c:6').value[0].viewOffset, 42000);
  for (const k of ['m:7', 'ondeck', 'c:6', 'm:5', 'c:5']) assert.equal(cache.get(k).fresh, false, k + ' à redemander');

  data.progressed(ep, DUR, true);
  const m = cache.get('m:7').value;
  assert.equal(m.viewOffset, undefined);
  assert.equal(m.viewCount, 1);
});

test('cache.remove retire l\'entrée', () => {
  const cache = plex.createCache({ store: memStore(), ns: 'srv' });
  cache.set('a', 1); cache.remove('a');
  assert.equal(cache.get('a'), null);
});

test('timeline : en transcodage, la session est signalée au serveur (en-tête X-Plex-Session-Identifier) ; jamais en direct', () => {
  const http = fakeServer(), timers = fakeTimers();
  let pos = 0, session = 'cimaise-abc';
  const p = plex.createProgress({
    http, id: ID, session: SERVER, timers, ratingKey: '101', durationMs: DUR,
    getPosition: () => pos, getTranscodeSession: () => session,
  });
  p.playing();
  session = null;
  p.paused();
  const t = http.timelines();
  assert.equal(t[0].headers['X-Plex-Session-Identifier'], 'cimaise-abc');
  assert.equal(t[1].headers['X-Plex-Session-Identifier'], undefined);
});

test('vu / non vu : compteurs « vus » de la saison et de la série décalés de ±1 dans le cache, une seule fois', () => {
  const cache = plex.createCache({ store: memStore(), ns: 'srv' });
  const data = plex.createData(() => { throw new Error('pas de réseau'); }, ID, SERVER, cache);
  const ep = { ratingKey: '7', type: 'episode', title: 'E', parentRatingKey: '6', grandparentRatingKey: '5' };
  cache.set('c:6', [ep, { ratingKey: '8', type: 'episode', viewCount: 1 }]);
  cache.set('m:5', { ratingKey: '5', type: 'show', leafCount: 10, viewedLeafCount: 3 });
  cache.set('c:5', [{ ratingKey: '6', type: 'season', leafCount: 4, viewedLeafCount: 1 }, { ratingKey: '9', type: 'season', leafCount: 6, viewedLeafCount: 2 }]);
  const counts = () => [cache.get('m:5').value.viewedLeafCount, cache.get('c:5').value[0].viewedLeafCount, cache.get('c:5').value[1].viewedLeafCount];
  data.marked(ep, true);
  assert.deepEqual(counts(), [4, 2, 2]);
  data.marked(ep, true);   // déjà vu : pas de double compte
  assert.deepEqual(counts(), [4, 2, 2]);
  data.progressed(ep, 5000, false);   // entamé de nouveau : reste compté vu
  assert.deepEqual(counts(), [4, 2, 2]);
  data.marked(ep, false);
  assert.deepEqual(counts(), [3, 1, 2]);
  data.progressed(ep, DUR, true);
  assert.deepEqual(counts(), [4, 2, 2]);
});
