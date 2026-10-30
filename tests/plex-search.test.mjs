// Recherche du module Plex : index local de titres (instantané dès la 1re lettre, léger, mis en cache), complément serveur
// (épisodes) annulable, clavier qui n'attend jamais le réseau, Retour qui garde saisie et focus, dernières recherches, mesures.
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
  const dir = mkdtempSync(join(tmpdir(), 'plexsearch-'));
  const es5 = join(dir, 'es5');
  const t = spawnSync('node_modules/.bin/tsc', ['-p', 'packages/plex/tsconfig.json', '--outDir', es5], { encoding: 'utf8' });
  assert.equal(t.status, 0, t.stdout + t.stderr);
  const out = join(dir, 'ui.cjs');
  await build({
    stdin: { resolveDir: es5, contents: "export * from './plex/src/index.js'; export { Router } from './tv-core/src/router/index.js'; export * as diag from './tv-core/src/diag.js';" },
    bundle: true, format: 'cjs', target: 'es5', outfile: out, logLevel: 'warning',
  });
  ui = createRequire(import.meta.url)(out);
});

const SERVER = { uri: 'https://192-0-2-10.' + '0'.repeat(32) + '.plex.direct:32400', token: 'FAKE-SERVER-TOKEN' };
const ID = { clientId: 'test-client-uuid', product: 'Cimaise', version: '0.0.0', platform: 'Tizen', device: 'Frame' };

function makeDoc() {
  const mk = (tag) => {
    let cn = '';
    const attrs = {};
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
      setAttribute(k, v) { attrs[k] = String(v); },
      getAttribute: (k) => (k in attrs ? attrs[k] : null),
      removeAttribute(k) { delete attrs[k]; },
      getElementsByTagName(t) { const o = []; (function w(n) { n.children.forEach((c) => { if (c.tag === t) o.push(c); w(c); }); })(el); return o; },
      addEventListener() {},
    };
    return el;
  };
  return { createElement: mk };
}
const walk = (n, f) => { f(n); n.children.forEach((c) => walk(c, f)); };
const byClass = (n, cls) => { const o = []; walk(n, (x) => { if (x.classList && x.classList.contains(cls)) o.push(x); }); return o; };
const texts = (n) => { const o = []; walk(n, (x) => { if (x.textContent) o.push(x.textContent); }); return o; };
const srcs = (n) => n.getElementsByTagName('img').map((i) => i.getAttribute('src')).filter(Boolean);
const memStore = () => {
  const m = {};
  return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; },
    key: (i) => Object.keys(m)[i] || null, get length() { return Object.keys(m).length; }, _m: m };
};
const tick = () => new Promise((r) => setTimeout(r, 5));

// Horloge manuelle : advance(ms) déclenche les minuteries échues dans l'ordre.
function fakeTimers() {
  let t = 0, seq = 0;
  const q = [];
  const api = {
    now: () => t,
    setTimeout(fn, ms) { const id = ++seq; q.push({ id, at: t + ms, fn }); return id; },
    clearTimeout(id) { const i = q.findIndex((x) => x.id === id); if (i >= 0) q.splice(i, 1); },
    advance(ms) {
      const end = t + ms;
      for (;;) {
        q.sort((a, b) => a.at - b.at || a.id - b.id);
        if (!q.length || q[0].at > end) break;
        const x = q.shift(); t = x.at; x.fn();
      }
      t = end;
    },
    pending: () => q.length,
  };
  return api;
}

// ---- serveur factice ----------------------------------------------------------------------------------------------
const MOVIES = [
  ['Le Seigneur des anneaux', 2001], ['Les Évadés', 1994], ['L’Été meurtrier', 1983], ['The Matrix', 1999], ['Matrix Reloaded', 2003],
  ['Madame Doubtfire', 1993], ['Amélie', 2001], ['Mad Max', 1979], ['Dune', 2021], ['Le Marsupilami', 2012],
];
const SHOWS = [['Andor', 2022], ['Made For Love', 2021], ['Dark', 2017]];
const sectionsBody = JSON.stringify({ MediaContainer: { Directory: [
  { key: '1', type: 'movie', title: 'Films' }, { key: '2', type: 'show', title: 'Séries' }, { key: '3', type: 'artist', title: 'Musique' }] } });
function allRoute(req) {
  const sec = /sections\/(\d+)\/all/.exec(req.url)[1];
  const start = Number(req.headers['X-Plex-Container-Start'] || 0), size = Number(req.headers['X-Plex-Container-Size'] || 50);
  const src = sec === '1' ? MOVIES : SHOWS, base = sec === '1' ? 1000 : 5000;
  const items = src.map(([title, year], i) => ({ ratingKey: String(base + i), type: sec === '1' ? 'movie' : 'show', title, year,
    thumb: '/library/metadata/' + (base + i) + '/thumb/17000' + i, summary: 'x'.repeat(500) })).slice(start, start + size);
  return JSON.stringify({ MediaContainer: { size: items.length, totalSize: src.length, offset: start, Metadata: items } });
}
const EPISODES = [{ ratingKey: '9001', type: 'episode', title: 'Mais t’es qui, toi ?', grandparentTitle: 'Andor', grandparentRatingKey: '5000',
  grandparentThumb: '/library/metadata/5000/thumb/170000', parentIndex: 2, index: 8, year: 2025 }];
function hubsRoute() {
  return JSON.stringify({ MediaContainer: { size: 3, Hub: [
    { type: 'track', hubIdentifier: 'track', size: 1, Metadata: [{ ratingKey: '1', type: 'track', title: 'Musique' }] },
    { type: 'episode', hubIdentifier: 'episode', size: 1, Metadata: EPISODES },
    { type: 'actor', hubIdentifier: 'actor', size: 1, Directory: [{ tag: 'Quelqu’un' }] },
    { type: 'movie', hubIdentifier: 'movie', size: 0 }] } });
}
function fakeHttp(routes) {
  const calls = [];
  const http = (req, cb) => {
    const rec = { req, aborted: false, answered: false };
    calls.push(rec);
    const r = routes.find((x) => x[0].test(req.url));
    setImmediate(() => {
      if (rec.aborted) return;
      rec.answered = true;
      if (!r) return cb(new Error('pas de route ' + req.url));
      cb(null, { status: 200, body: typeof r[1] === 'function' ? r[1](req) : r[1] });
    });
    return { abort() { rec.aborted = true; } };
  };
  http.calls = calls;
  http.search = () => calls.filter((c) => /\/hubs\/search/.test(c.req.url));
  return http;
}
const routes = () => [[/\/library\/sections$/, sectionsBody], [/\/library\/sections\/\d+\/all/, allRoute], [/\/hubs\/search/, hubsRoute]];

function setup(extra = {}) {
  const timers = fakeTimers(), pushed = [], store = extra.store || memStore();
  const http = extra.http || fakeHttp(routes());
  const arg = { doc: makeDoc(), http, store, session: SERVER, id: ID, timers, nav: { push: (p) => pushed.push(p), pop() {} }, ...extra };
  return { arg, timers, pushed, store, http };
}
// Frappe au clavier à l'écran : « a » est sous le focus au départ ; on tape en positionnant le focus par les flèches.
const POS = {};
'abcdefghij'.split('').forEach((c, i) => { POS[c] = [0, i]; });
'klmnopqrst'.split('').forEach((c, i) => { POS[c] = [1, i]; });
'uvwxyz'.split('').forEach((c, i) => { POS[c] = [2, i]; });
function typeText(p, text) {
  for (const ch of text) {
    if (ch === ' ') { goTo(p, 4, 0); p.onKey('enter'); continue; }
    const [r, c] = POS[ch];
    goTo(p, r, c); p.onKey('enter');
  }
}
let cursor = [0, 0];
function goTo(p, r, c) {
  // le clavier mémorise sa position : on la rejoue
  while (cursor[0] < r) { p.onKey('down'); cursor[0]++; }
  while (cursor[0] > r) { p.onKey('up'); cursor[0]--; }
  while (cursor[1] < c) { p.onKey('right'); cursor[1]++; }
  while (cursor[1] > c) { p.onKey('left'); cursor[1]--; }
}
const field = (p) => byClass(p.el, 'kb-text')[0].textContent;
const rowTitles = (p) => byClass(p.el, 'plex-hub').filter((w) => w.style.display !== 'none').map((w) => w.children[0].textContent);
const reset = () => { cursor = [0, 0]; ui.diag.resetMeasures(); };

// ---- index ----------------------------------------------------------------------------------------------------------
test('pliage : casse, accents, ligatures, apostrophes, articles', () => {
  assert.equal(ui.foldTitle('Les Évadés'), 'les evades');
  assert.equal(ui.foldTitle('L’Été  meurtrier'), 'l ete meurtrier');
  assert.equal(ui.foldTitle('Cœur d’Œuvre'), 'coeur d oeuvre');
});

function packed(n) {
  const l = [];
  for (let i = 0; i < n; i++) l.push([['Titre de film ', 'La série ', 'Les '][i % 3] + 'numéro ' + i + ' extraordinaire', 1950 + (i % 75), i % 5 ? 0 : 1, String(10000 + i), 1700000000 + i]);
  return l;
}

test('index : correspondance tolérante (casse, accents, articles, début de mots) et classement', () => {
  const ix = ui.createSearchIndex({ preload: [['Le Seigneur des anneaux', 2001, 0, '1', 1], ['Les Évadés', 1994, 0, '2', 2], ['L’Été meurtrier', 1983, 0, '3', 3],
    ['The Matrix', 1999, 0, '4', 4], ['Matrix Reloaded', 2003, 0, '5', 5], ['Madame Doubtfire', 1993, 0, '6', 6], ['Andor', 2022, 1, '7', 7], ['Made For Love', 2021, 1, '8', 8]] });
  const t = (q) => ix.search(q).movies.map((h) => h.title);
  assert.deepEqual(t('seig'), ['Le Seigneur des anneaux'], 'article ignoré en tête de titre');
  assert.deepEqual(t('le seig'), ['Le Seigneur des anneaux'], 'article tapé, ignoré s’il est suivi d’autre chose');
  assert.deepEqual(t('EVAD'), ['Les Évadés'], 'casse et accents');
  assert.deepEqual(t('ete'), ['L’Été meurtrier']);
  assert.deepEqual(t('matrix'), ['The Matrix', 'Matrix Reloaded'], 'titre sans article, plus court d’abord');
  assert.deepEqual(t('anneaux seig'), ['Le Seigneur des anneaux'], 'tous les mots, dans n’importe quel ordre, en début de mot');
  assert.deepEqual(t('ma').slice(0, 3), ['The Matrix', 'Matrix Reloaded', 'Madame Doubtfire'], 'dès la 2e lettre');
  assert.equal(t('m').length, 4, 'dès la 1re lettre : Matrix, Matrix Reloaded, Madame, Made… films seulement');
  assert.deepEqual(ix.search('made').shows.map((h) => h.title), ['Made For Love']);
  assert.deepEqual(t('zzz'), []);
  assert.deepEqual(t(''), []);
});

test('index : 3 400 titres sous 300 Ko sérialisés, recherche en quelques ms', () => {
  const rows = packed(3400);
  assert.ok(JSON.stringify({ v: 1, l: rows }).length < 300 * 1024, 'taille du cache');
  const ix = ui.createSearchIndex({ preload: rows });
  assert.equal(ix.size(), 3400);
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < 20; i++) ix.search('extra');
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / 20;
  assert.ok(ms < 20, 'recherche locale : ' + ms + ' ms');
  assert.ok(ix.search('numero 17').movies.length + ix.search('numero 17').shows.length > 0);
});

test('index : construit en arrière-plan par pages, utilisable pendant la construction, puis mis en cache sans résumé', async () => {
  const d = setup();
  const cache = ui.createCache({ store: d.store, ns: SERVER.uri });
  const sections = ui.createData(d.http, ID, SERVER, cache).sections;
  const ix = ui.createSearchIndex({ http: d.http, id: ID, session: SERVER, cache, timers: d.timers, pageSize: 4, sections });
  let done = 0;
  ix.start(() => done++);
  await tick(); await tick();
  assert.ok(ix.size() > 0 && !ix.complete(), 'premières pages déjà interrogeables');
  for (let i = 0; i < 20; i++) { d.timers.advance(100); await tick(); }
  assert.ok(ix.complete());
  assert.equal(done, 1);
  assert.equal(ix.size(), MOVIES.length + SHOWS.length, 'films et séries seulement (pas la musique)');
  const pages = d.http.calls.filter((c) => /\/all/.test(c.req.url));
  assert.ok(pages.every((c) => c.req.headers['X-Plex-Container-Size'] === '4'));
  const raw = d.store.getItem('cimaise.plex.e.' + SERVER.uri + '|searchidx');
  assert.ok(raw && !/xxxx/.test(raw), 'le résumé n’est pas stocké');
  // 2e ouverture, cache frais : aucun appel réseau, index prêt aussitôt
  const d2 = setup({ store: d.store });
  const ix2 = ui.createSearchIndex({ http: d2.http, id: ID, session: SERVER, cache: ui.createCache({ store: d.store, ns: SERVER.uri }), timers: d2.timers, sections: () => () => {} });
  ix2.start();
  assert.ok(ix2.complete() && ix2.size() === 13);
  assert.equal(d2.http.calls.length, 0);
});

// ---- panneau --------------------------------------------------------------------------------------------------------
test('recherche : le clavier n’attend jamais le réseau ; résultats locaux dès la 1re lettre, sans requête serveur', async () => {
  reset();
  const d = setup();
  const p = ui.createSearchPanel(d.arg);
  for (let i = 0; i < 10; i++) { d.timers.advance(100); await tick(); }   // index construit
  const calls0 = d.http.calls.length;
  typeText(p, 'm');
  assert.equal(field(p), 'm', 'caractère affiché tout de suite');
  d.timers.advance(0);
  assert.deepEqual(rowTitles(p), ['Films', 'Séries'], 'Matrix… et Made For Love');
  assert.ok(texts(p.el).some((t) => /Matrix/.test(t)));
  assert.equal(d.http.search().length, 0, 'une lettre : pas de requête serveur');
  assert.equal(d.http.calls.length, calls0);
  assert.equal(srcs(p.el).length, 0, 'texte d’abord, vignettes ensuite');
  d.timers.advance(300);
  const s = srcs(p.el);
  assert.ok(s.length > 0);
  for (const u of s) assert.ok(u.startsWith(SERVER.uri + '/photo/:/transcode?') && /width=104&height=156/.test(u), u);
  p.destroy();
});

test('recherche : le complément serveur attend 400 ms de silence et 2 caractères, annule la requête précédente', async () => {
  reset();
  const d = setup();
  const p = ui.createSearchPanel(d.arg);
  for (let i = 0; i < 10; i++) { d.timers.advance(100); await tick(); }
  typeText(p, 'an');
  d.timers.advance(399);
  assert.equal(d.http.search().length, 0);
  d.timers.advance(1);
  assert.equal(d.http.search().length, 1);
  const u = new URL(d.http.search()[0].req.url);
  assert.equal(u.searchParams.get('query'), 'an');
  assert.equal(u.searchParams.get('sectionId'), '1,2', 'bibliothèques Films et Séries seulement (pas la musique)');
  typeText(p, 'd');   // frappe pendant que la requête est en vol : annulée
  assert.equal(d.http.search()[0].aborted, true);
  d.timers.advance(400);
  assert.equal(d.http.search().length, 2);
  await tick();
  d.timers.advance(0);
  assert.deepEqual(rowTitles(p), ['Séries', 'Épisodes']);
  assert.ok(texts(p.el).some((t) => /Andor · S2 E8/.test(t)), 'épisode du serveur');
  assert.ok(!texts(p.el).some((t) => /Quelqu/.test(t)), 'les acteurs ne sont pas montrés');
  p.destroy();
});

test('recherche : détruire l’écran annule la requête en vol et les minuteries', async () => {
  reset();
  const d = setup();
  const p = ui.createSearchPanel(d.arg);
  for (let i = 0; i < 10; i++) { d.timers.advance(100); await tick(); }
  typeText(p, 'an'); d.timers.advance(400);
  p.destroy();
  assert.equal(d.http.search()[0].aborted, true);
  assert.equal(d.timers.pending(), 0);
});

test('recherche : Entrée sur un résultat ouvre sa fiche ; Retour revient avec saisie et focus conservés', async () => {
  reset();
  const d = setup();
  const root = d.arg.doc.createElement('div');
  const router = new ui.Router({ root, exit() {} });
  d.arg.nav = { push: (p) => router.push(p), pop: () => router.pop() };
  const home = { el: d.arg.doc.createElement('div') };
  router.push(home);
  const p = ui.createSearchPanel(d.arg);
  router.push(p);
  for (let i = 0; i < 10; i++) { d.timers.advance(100); await tick(); }
  typeText(p, 'ma'); d.timers.advance(0);
  // dernière rangée du clavier : « valider » (4e touche) mène aux résultats
  goTo(p, 4, 3); p.onKey('enter');
  assert.ok(byClass(p.el, 'on').length === 1, 'focus dans une rangée de résultats');
  p.onKey('right');
  const before = byClass(p.el, 'focus').length;
  assert.equal(before, 1);
  router.handleKey('enter');
  assert.equal(router.depth, 3, 'la fiche est empilée');
  router.handleKey('back');
  assert.equal(router.depth, 2);
  assert.equal(field(p), 'ma', 'saisie conservée');
  assert.equal(byClass(p.el, 'focus').length, 1, 'focus conservé');
  assert.ok(byClass(p.el, 'on').length === 1, 'toujours dans les résultats');
  p.destroy();
});

test('dernières recherches : 5 au plus, la plus récente d’abord, sans doublon, proposées quand le champ est vide', async () => {
  reset();
  const store = memStore();
  for (const q of ['dune', 'andor', 'dark', 'matrix', 'made', 'amélie', 'ANDOR']) ui.rememberSearch(q, store);
  assert.deepEqual(ui.loadRecentSearches(store), ['ANDOR', 'amélie', 'made', 'matrix', 'dark']);
  assert.equal(JSON.parse(store.getItem('cimaise.v1')).prefs.plexSearches.length, 5, 'cimaise.v1, prefs.plexSearches');
  ui.rememberSearch('a', store);
  assert.equal(ui.loadRecentSearches(store)[0], 'ANDOR', 'moins de 2 caractères : pas retenu');
  const d = setup({ store });
  const p = ui.createSearchPanel(d.arg);
  assert.deepEqual(byClass(p.el, 'plex-recent-item').map((n) => n.textContent), ['ANDOR', 'amélie', 'made', 'matrix', 'dark']);
  p.destroy();
});

test('dernières recherches : choisir une entrée remplit le champ et lance la recherche', async () => {
  reset();
  const store = memStore();
  ui.rememberSearch('andor', store);
  const d = setup({ store });
  const p = ui.createSearchPanel(d.arg);
  for (let i = 0; i < 10; i++) { d.timers.advance(100); await tick(); }
  goTo(p, 4, 3); p.onKey('enter');   // valider (champ vide) → vers les dernières recherches
  p.onKey('enter');
  assert.equal(field(p), 'andor');
  d.timers.advance(0);
  assert.ok(texts(p.el).some((t) => /^Andor$/.test(t)));
  p.destroy();
});

test('mesures : frappe → caractère, frappe → 1ers résultats, frappe → complément serveur, dans le diagnostic', async () => {
  reset();
  const d = setup();
  const p = ui.createSearchPanel(d.arg);
  for (let i = 0; i < 10; i++) { d.timers.advance(100); await tick(); }
  typeText(p, 'an'); d.timers.advance(0);
  d.timers.advance(400); await tick(); d.timers.advance(0);
  assert.ok(ui.diag.measureStats('frappe').n >= 2);
  assert.ok(ui.diag.measureStats('recherche'));
  assert.ok(ui.diag.measureStats('recherche-serveur'));
  const r = ui.diag.report();
  assert.match(r, /frappe → caractère: min/);
  assert.match(r, /frappe → 1ers résultats: min/);
  assert.match(r, /frappe → complément serveur: min/);
  p.destroy();
});

test('accueil : « Rechercher » en haut, atteint par Haut depuis la 1re rangée puis les onglets ; Entrée ouvre la recherche', async () => {
  reset();
  const d = setup({ http: fakeHttp([...routes(), [/\/library\/onDeck/, readFileSync('tests/fixtures/plex/ondeck.json', 'utf8')],
    [/\/library\/recentlyAdded/, readFileSync('tests/fixtures/plex/recently-added.json', 'utf8')]]) });
  const p = ui.createHomePanel(d.arg);
  await tick(); await tick();
  assert.deepEqual(byClass(p.el, 'plex-search-txt').map((n) => n.textContent), ['Rechercher un film, une série…']);
  assert.equal(p.onKey('up'), true);
  assert.equal(p.onKey('up'), true);
  assert.equal(byClass(p.el, 'focus').length, 1, 'un seul élément focalisé');
  assert.ok(byClass(p.el, 'plex-search-btn')[0].classList.contains('focus'), 'le bouton porte le focus');
  p.onKey('enter');
  assert.equal(d.pushed.length, 1);
  assert.equal(byClass(d.pushed[0].el, 'plex-search').length, 1);
  d.pushed[0].destroy && d.pushed[0].destroy();
  p.destroy();
});

test('accueil : l’index se construit en arrière-plan après l’affichage de l’accueil, une seule fois', async () => {
  reset();
  const d = setup({ http: fakeHttp([...routes(), [/\/library\/onDeck/, readFileSync('tests/fixtures/plex/ondeck.json', 'utf8')],
    [/\/library\/recentlyAdded/, readFileSync('tests/fixtures/plex/recently-added.json', 'utf8')]]) });
  const p = ui.createHomePanel(d.arg);
  await tick(); await tick();
  assert.equal(d.http.calls.filter((c) => /\/all/.test(c.req.url)).length, 0, 'pas avant le délai');
  for (let i = 0; i < 30; i++) { d.timers.advance(200); await tick(); }
  assert.ok(d.http.calls.filter((c) => /\/all/.test(c.req.url)).length >= 2);
  p.destroy();
});

test('diagnostic : deux copies du module (app.js, plex.js) partagent les mesures par window', async () => {
  const load = async () => {
    const out = join(mkdtempSync(join(tmpdir(), 'diagcopy-')), 'diag.cjs');
    await build({ entryPoints: ['packages/tv-core/src/diag.ts'], bundle: true, format: 'cjs', target: 'es5', outfile: out, logLevel: 'warning' });
    return createRequire(import.meta.url)(out);
  };
  const hadWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { value: {}, configurable: true, writable: true });
  try {
    const plexCopy = await load(), appCopy = await load();
    assert.notEqual(plexCopy, appCopy, 'deux instances distinctes');
    plexCopy.recordMeasure('recherche', 12);
    plexCopy.recordMeasure('recherche', 30);
    assert.deepEqual(appCopy.measureStats('recherche'), { n: 2, min: 12, median: 21, max: 30 });
    assert.match(appCopy.report(), /frappe → 1ers résultats: min 12 \/ méd 21 \/ max 30 ms \(2\)/);
    appCopy.resetMeasures();
    assert.equal(plexCopy.measureStats('recherche'), null);
  } finally {
    if (hadWindow) Object.defineProperty(globalThis, 'window', hadWindow); else delete globalThis.window;
  }
});
