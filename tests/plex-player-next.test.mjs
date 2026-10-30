// Lecteur Plex : Épisode suivant, Passer l’intro / le générique (marqueurs Plex), enchaînement automatique (HANDOFF §5.4).
// Faux AVPlay, faux serveur (marqueurs factices), horloge simulée : aucune TV.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';

let ui;
before(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'plexnext-'));
  const es5 = join(dir, 'es5');
  const t = spawnSync('node_modules/.bin/tsc', ['-p', 'packages/plex/tsconfig.json', '--outDir', es5], { encoding: 'utf8' });
  assert.equal(t.status, 0, t.stdout + t.stderr);
  const out = join(dir, 'ui.cjs');
  await build({ stdin: { resolveDir: es5, contents: "export * from './plex/src/index.js';" }, bundle: true, format: 'cjs', target: 'es5', outfile: out, logLevel: 'warning' });
  ui = createRequire(import.meta.url)(out);
});

const SERVER = { uri: 'https://192-0-2-10.' + '0'.repeat(32) + '.plex.direct:32400', token: 'FAKE-SERVER-TOKEN' };
const ID = { clientId: 'test-client-uuid', product: 'Cimaise', version: '0.0.0', platform: 'Tizen', device: 'Frame' };
const BASE = JSON.parse(readFileSync('tests/fixtures/plex/metadata.json', 'utf8')).MediaContainer.Metadata[0];
const DUR = 1000000;

function makeDoc() {
  const mk = (tag) => {
    let cn = '';
    const el = {
      tag, children: [], parentNode: null, style: {}, textContent: '',
      get className() { return cn; }, set className(v) { cn = v; },
      classList: {
        add: (c) => { if (!cn.split(' ').includes(c)) cn = (cn + ' ' + c).trim(); },
        remove: (c) => { cn = cn.split(' ').filter((x) => x && x !== c).join(' '); },
        contains: (c) => cn.split(' ').includes(c),
      },
      appendChild(c) { if (c.parentNode) c.parentNode.removeChild(c); c.parentNode = el; el.children.push(c); return c; },
      removeChild(c) { el.children.splice(el.children.indexOf(c), 1); c.parentNode = null; return c; },
      setAttribute() {}, getAttribute: () => null, removeAttribute() {},
      getElementsByTagName() { return []; }, addEventListener() {}, removeEventListener() {},
    };
    return el;
  };
  return { createElement: mk, hidden: false, addEventListener() {}, removeEventListener() {} };
}
const walk = (n, f) => { f(n); n.children.forEach((c) => walk(c, f)); };
const byClass = (n, cls) => { const o = []; walk(n, (x) => { if (x.classList && x.classList.contains(cls)) o.push(x); }); return o; };
const texts = (n) => { const o = []; walk(n, (x) => { if (x.textContent) o.push(x.textContent); }); return o; };
const has = (n, re) => texts(n).some((t) => re.test(t));
// Laisse passer 10 ms puis vide les setImmediate en attente (les réponses du faux serveur) : un tour lent de la boucle ne fait plus échouer les tests.
const flush = () => new Promise((r) => setTimeout(() => { let n = 0; const go = () => (++n < 6 ? setImmediate(go) : r()); setImmediate(go); }, 10));

function fakeTimers() {
  let now = 0, id = 0; const q = [];
  return {
    now: () => now,
    setTimeout: (f, ms) => { q.push({ id: ++id, at: now + ms, f }); return id; },
    clearTimeout: (i) => { const k = q.findIndex((x) => x.id === i); if (k >= 0) q.splice(k, 1); },
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

function fakePlayer() {
  const p = {
    calls: [], pos: 0,
    open(url, o, done) { p.calls.push('open'); p.done = done; },
    ready() { p.done(null); },
    play() { p.calls.push('play'); }, pause() { p.calls.push('pause'); },
    forward() { p.calls.push('forward'); }, rewind() { p.calls.push('rewind'); },
    seekTo(ms) { p.calls.push('seekTo:' + ms); },
    holdSeek() {}, commitSeek() {}, cancelSeek() {}, setTranscode() {},
    stop() { p.calls.push('stop'); }, close() { p.calls.push('close'); }, destroy() { p.calls.push('destroy'); },
    getState() { return 'PLAYING'; }, getPosition() { return p.pos; }, getDuration() { return DUR; },
    getTracks() { return []; }, selectTrack() {}, setSubtitlesVisible() {},
  };
  p.factory = (o) => { p.events = o; return p; };
  return p;
}

// Série factice 202 : saison 1 (401) = épisodes 501…503, saison 2 (402) = 601, 602 ; 'marks' = marqueurs de l’épisode lu.
const EPS = { 401: ['501', '502', '503', '504', '505', '506'], 402: ['601', '602'] };
const SEASONS = [{ ratingKey: '401', type: 'season', index: 1, title: 'Saison 1' }, { ratingKey: '402', type: 'season', index: 2, title: 'Saison 2' }];
function episode(key) {
  const season = Object.keys(EPS).find((s) => EPS[s].includes(key));
  return { ...BASE, ratingKey: key, type: 'episode', title: 'Épisode ' + key, duration: DUR, parentRatingKey: season, grandparentRatingKey: '202', grandparentTitle: 'Série', parentIndex: Number(season) - 400, index: EPS[season].indexOf(key) + 1 };
}
const MARKS = [
  { type: 'credits', final: true, startTimeOffset: 900000, endTimeOffset: DUR },
  { type: 'intro', startTimeOffset: 60000, endTimeOffset: 90000 },
];
// Générique qui commence avant 90 % : seul l’enchaînement lui-même peut marquer l’épisode vu.
const EARLY = [{ type: 'credits', startTimeOffset: 800000, endTimeOffset: DUR }];
function fakeHttp(opts) {
  const calls = [];
  const http = (req, cb) => {
    calls.push(req);
    let body = '';
    const u = req.url.replace(SERVER.uri, '');
    let m;
    if ((m = /^\/library\/metadata\/(\d+)\/children$/.exec(u))) {
      const list = m[1] === '202' ? SEASONS : (EPS[m[1]] || []).map(episode);
      body = JSON.stringify({ MediaContainer: { Metadata: list } });
    } else if ((m = /^\/library\/metadata\/(\d+)(\?.*)?$/.exec(u))) {
      const e = m[1] === '100' ? { ...BASE, duration: DUR } : episode(m[1]);
      if (opts.marks && /includeMarkers=1/.test(u)) e.Marker = opts.marks;
      body = JSON.stringify({ MediaContainer: { Metadata: [e] } });
    }
    setImmediate(() => cb(null, { status: 200, body }));
    return { abort() {} };
  };
  http.calls = calls;
  http.scrobbles = () => calls.filter((c) => /\/:\/scrobble/.test(c.url));
  http.index = (re) => calls.findIndex((c) => re.test(c.url));
  return http;
}
function setup(opts = {}) {
  const pushed = []; let pops = 0;
  const timers = fakeTimers();
  const http = fakeHttp(opts);
  const player = fakePlayer();
  const m = {};
  const store = { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; }, key: (i) => Object.keys(m)[i] || null, get length() { return Object.keys(m).length; } };
  const arg = { doc: makeDoc(), http, store, session: SERVER, id: ID, now: () => 1000, timers, nav: { push: (x) => pushed.push(x), pop: () => { pops++; } }, createPlayer: player.factory };
  return { arg, pushed, pops: () => pops, timers, http, player };
}
async function play(key, opts) {
  const s = setup(opts);
  const item = key === '100' ? { ratingKey: '100', type: 'movie', title: 'Film' } : episode(key);
  const panel = ui.createPlayerPanel(s.arg, item, 0);
  await flush();
  s.player.ready();
  return { ...s, panel };
}
const at = (s, ms) => { s.player.pos = ms; s.player.events.onTime(ms); };
const skip = (s) => byClass(s.panel.el, 'plex-pl-skip')[0];
const card = (s) => byClass(s.panel.el, 'plex-pl-card')[0];
const on = (n) => n.classList.contains('on');
// Bouton lecture / pause : une icône, plus de mot (▶ en pause, ❚❚ pendant la lecture).
const lbl = (n) => n.textContent || (byClass(n, 'plex-ic-play').length ? '▶' : byClass(n, 'plex-ic-pause').length ? '❚❚' : '');
const ctls = (s) => byClass(s.panel.el, 'plex-pl-ctl').map(lbl);

// ----- Épisode suivant dans la barre -----

test('barre : « Épisode suivant » pour un épisode qui en a un, activable à la télécommande', async () => {
  const s = await play('501');
  s.panel.onKey('down');
  assert.deepEqual(ctls(s), ['❚❚', 'Audio', 'Sous-titres', 'Épisode suivant']);
  s.panel.onKey('right'); s.panel.onKey('right'); s.panel.onKey('right');
  s.panel.onKey('enter');
  assert.equal(s.pops(), 1);
  assert.equal(s.pushed.length, 1);
  await flush();
  assert.ok(s.http.index(/\/library\/metadata\/502\?/) >= 0, 'le suivant dans la saison est chargé');
});

test('barre : dernier épisode d’une saison → premier de la saison suivante', async () => {
  const s = await play('506');
  s.panel.onKey('down');
  for (let i = 0; i < 3; i++) s.panel.onKey('right');
  s.panel.onKey('enter');
  await flush();
  assert.ok(s.http.index(/\/library\/metadata\/601\?/) >= 0);
});

test('barre : aucun bouton pour un film ni pour le dernier épisode', async () => {
  const f = await play('100');
  f.panel.onKey('down');
  assert.deepEqual(ctls(f), ['❚❚', 'Audio', 'Sous-titres']);
  const e = await play('602');
  e.panel.onKey('down');
  assert.deepEqual(ctls(e), ['❚❚', 'Audio', 'Sous-titres']);
});

// ----- Passer l’intro / le générique -----

test('intro : le bouton n’existe que pendant le marqueur, Entrée saute à sa fin', async () => {
  const s = await play('602', { marks: MARKS });
  at(s, 30000);
  assert.ok(!on(skip(s)), 'avant le marqueur');
  at(s, 65000);
  assert.ok(on(skip(s)));
  assert.match(skip(s).textContent, /Passer l’intro/);
  s.player.calls.length = 0;
  assert.equal(s.panel.onKey('enter'), true);
  assert.deepEqual(s.player.calls, ['seekTo:90000']);
  at(s, 91000);
  assert.ok(!on(skip(s)), 'disparaît à la sortie de l’intervalle');
});

test('intro : la barre fermée garde le focus sur le bouton ; barre ouverte, Entrée agit sur la barre', async () => {
  const s = await play('602', { marks: MARKS });
  at(s, 65000);
  s.panel.onKey('down');
  s.player.calls.length = 0;
  s.panel.onKey('enter'); // bouton Pause
  assert.deepEqual(s.player.calls, ['pause']);
});

test('générique sans épisode suivant : « Passer le générique » saute à la fin du marqueur', async () => {
  const marks = [{ type: 'credits', startTimeOffset: 800000, endTimeOffset: 850000 }];
  const s = await play('602', { marks });
  at(s, 810000);
  assert.match(skip(s).textContent, /Passer le générique/);
  s.player.calls.length = 0;
  s.panel.onKey('enter');
  assert.deepEqual(s.player.calls, ['seekTo:850000']);
});

test('générique jusqu’à la fin du fichier sur un film : Entrée termine la lecture (vu) et revient à la fiche', async () => {
  const s = await play('100', { marks: MARKS.slice(0, 1) });
  at(s, 950000);
  s.panel.onKey('enter');
  assert.equal(s.pops(), 1);
  assert.equal(s.pushed.length, 0);
  assert.equal(s.http.scrobbles().length, 1);
});

test('sans marqueur (réponse sans « Marker ») : aucun bouton', async () => {
  const s = await play('602');
  at(s, 65000);
  assert.ok(!on(skip(s)));
});

// ----- Enchaînement automatique -----

test('générique + suivant : carte « Épisode suivant dans 10 s » avec compte à rebours, enchaînement à zéro après le scrobble', async () => {
  const s = await play('501', { marks: EARLY });
  at(s, 799000);
  assert.ok(!on(card(s)));
  at(s, 805000);
  assert.ok(on(card(s)));
  assert.ok(has(card(s), /^Épisode suivant dans 10 s$/));
  assert.ok(!on(skip(s)), 'la carte remplace le bouton de générique');
  s.timers.advance(3000);
  assert.ok(has(card(s), /^Épisode suivant dans 7 s$/));
  s.timers.advance(6999);
  assert.equal(s.pushed.length, 0);
  s.timers.advance(1);
  assert.equal(s.pushed.length, 1);
  await flush();
  const sc = s.http.index(/\/:\/scrobble\?.*key=501/), nx = s.http.index(/\/library\/metadata\/502\?/);
  assert.ok(sc >= 0 && nx > sc, 'scrobble envoyé avant le chargement du suivant');
});

test('carte : Entrée lance tout de suite (scrobble avant)', async () => {
  const s = await play('501', { marks: EARLY });
  at(s, 805000);
  s.panel.onKey('enter');
  assert.equal(s.pushed.length, 1);
  await flush();
  const sc = s.http.index(/\/:\/scrobble\?.*key=501/);
  assert.ok(sc >= 0 && sc < s.http.index(/\/library\/metadata\/502\?/));
});

test('carte : Retour annule, reste sur la fin ; le bouton « Passer le générique » prend le relais', async () => {
  const s = await play('501', { marks: MARKS });
  at(s, 905000);
  assert.equal(s.panel.onKey('back'), true);
  assert.ok(!on(card(s)));
  assert.equal(s.pops(), 0, 'on ne quitte pas le lecteur');
  s.timers.advance(30000);
  assert.equal(s.pushed.length, 0);
  at(s, 910000);
  assert.ok(!on(card(s)));
  assert.match(skip(s).textContent, /Passer le générique/);
});

test('carte : sortir du générique (retour en arrière) la retire', async () => {
  const s = await play('501', { marks: MARKS });
  at(s, 905000);
  at(s, 500000);
  assert.ok(!on(card(s)));
  s.timers.advance(20000);
  assert.equal(s.pushed.length, 0);
});

test('fin du flux sans marqueur : la carte s’affiche puis enchaîne après 10 s', async () => {
  const s = await play('501');
  s.player.events.onEnd();
  assert.ok(on(card(s)));
  assert.equal(s.pops(), 0);
  s.timers.advance(10000);
  assert.equal(s.pushed.length, 1);
  await flush();
  assert.ok(s.http.index(/\/:\/scrobble\?.*key=501/) >= 0);
});

test('fin du flux : Retour annule l’enchaînement, reste sur la fin, puis Retour quitte', async () => {
  const s = await play('501');
  s.player.events.onEnd();
  s.panel.onKey('back');
  assert.ok(!on(card(s)));
  assert.equal(s.pops(), 0);
  s.timers.advance(20000);
  assert.equal(s.pushed.length, 0);
  s.panel.onKey('back');
  assert.equal(s.pops(), 1);
});

test('dernier épisode ou film : la fin du flux ramène à la fiche, sans carte', async () => {
  const s = await play('602');
  s.player.events.onEnd();
  assert.equal(s.pops(), 1);
  assert.ok(!on(card(s)));
});

test('fin du flux pendant la carte du générique : enchaîne tout de suite', async () => {
  const s = await play('501', { marks: MARKS });
  at(s, 905000);
  s.timers.advance(2000);
  s.player.events.onEnd();
  assert.equal(s.pushed.length, 1);
});

// ----- « Vous regardez toujours ? » -----

// Enchaîne de panneau en panneau (même faux lecteur) : renvoie le panneau courant.
async function chainOnce(s, panel) {
  s.player.events.onEnd();
  s.timers.advance(10000);
  await flush();
  s.player.ready();
  return s.pushed[s.pushed.length - 1];
}

test('3 épisodes enchaînés sans touche : le 4ᵉ arrêt demande « Vous regardez toujours ? »', async () => {
  const s = setup();
  let panel = ui.createPlayerPanel(s.arg, episode('501'), 0);
  await flush(); s.player.ready();
  panel = await chainOnce(s, panel);
  panel = await chainOnce(s, panel);
  panel = await chainOnce(s, panel);
  assert.equal(s.pushed.length, 3);
  s.player.events.onEnd();
  s.timers.advance(10000);
  assert.equal(s.pushed.length, 3, 'plus d’enchaînement');
  assert.ok(has(panel.el, /^Vous regardez toujours \?$/));
  assert.equal(s.pops(), 3);
  panel.onKey('enter'); // « Continuer »
  assert.equal(s.pushed.length, 4);
});

test('une touche pendant un épisode remet le compte à zéro', async () => {
  const s = setup();
  let panel = ui.createPlayerPanel(s.arg, episode('501'), 0);
  await flush(); s.player.ready();
  panel = await chainOnce(s, panel);
  panel = await chainOnce(s, panel);
  panel.onKey('down'); // une touche dans le 3ᵉ épisode
  panel = await chainOnce(s, panel);
  panel = await chainOnce(s, panel);
  assert.equal(s.pushed.length, 4, 'toujours enchaîné');
});

test('« Vous regardez toujours ? » : Arrêter revient à la fiche', async () => {
  const s = setup();
  let panel = ui.createPlayerPanel(s.arg, episode('501'), 0);
  await flush(); s.player.ready();
  for (let i = 0; i < 3; i++) panel = await chainOnce(s, panel);
  s.player.events.onEnd();
  s.timers.advance(10000);
  const pops = s.pops();
  panel.onKey('right'); panel.onKey('enter'); // « Arrêter »
  assert.equal(s.pops(), pops + 1);
  assert.equal(s.pushed.length, 3);
});
