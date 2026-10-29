// Écrans du module Plex (docs/plex-design.md) dans un DOM factice : accueil en rangées, grille paginée, fiche,
// cache avec durée de vie, images via le transcodeur photo, libération en quittant l'écran, Retour par le routeur.
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
  const dir = mkdtempSync(join(tmpdir(), 'plexui-'));
  const es5 = join(dir, 'es5');
  const t = spawnSync('node_modules/.bin/tsc', ['-p', 'packages/plex/tsconfig.json', '--outDir', es5], { encoding: 'utf8' });
  assert.equal(t.status, 0, t.stdout + t.stderr);
  const out = join(dir, 'ui.cjs');
  await build({
    stdin: { resolveDir: es5, contents: "export * from './plex/src/index.js'; export { Router } from './tv-core/src/router/index.js';" },
    bundle: true, format: 'cjs', target: 'es5', outfile: out, logLevel: 'warning',
  });
  ui = createRequire(import.meta.url)(out);
});

const fx = (n) => readFileSync('tests/fixtures/plex/' + n + '.json', 'utf8');
const SERVER = { uri: 'https://192-0-2-10.' + '0'.repeat(32) + '.plex.direct:32400', token: 'FAKE-SERVER-TOKEN' };
const ID = { clientId: 'test-client-uuid', product: 'Cimaise', version: '0.0.0', platform: 'Tizen', device: 'Frame' };

// ---- DOM factice ---------------------------------------------------------------------------------------------
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
const count = (n) => { let k = 0; walk(n, () => k++); return k; };
const srcs = (n) => ui_imgs(n).map((i) => i.getAttribute('src')).filter(Boolean);
const ui_imgs = (n) => n.getElementsByTagName('img');
const texts = (n) => { const o = []; walk(n, (x) => { if (x.textContent) o.push(x.textContent); }); return o; };

// ---- transport factice : routes = [[regex, corps | fonction]] ; `silent` = ne répond jamais -------------------------
function fakeHttp(routes, { silent = false } = {}) {
  const calls = [];
  const http = (req, cb) => {
    calls.push(req);
    let live = true;
    if (silent) return { abort() { live = false; } };
    const r = routes.find((x) => x[0].test(req.url));
    setImmediate(() => {
      if (!live) return;
      if (!r) return cb(new Error('pas de route ' + req.url));
      cb(null, { status: 200, body: typeof r[1] === 'function' ? r[1](req) : r[1] });
    });
    return { abort() { live = false; } };
  };
  http.calls = calls;
  return http;
}
const tick = () => new Promise((r) => setTimeout(r, 5));
const memStore = () => {
  const m = {};
  return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; },
    key: (i) => Object.keys(m)[i] || null, get length() { return Object.keys(m).length; }, _m: m };
};

// Serveur factice : 412 films, pages découpées d'après les en-têtes X-Plex-Container-*.
function pagedAll(req) {
  const start = Number(req.headers['X-Plex-Container-Start'] || 0), size = Number(req.headers['X-Plex-Container-Size'] || 50);
  const items = [];
  for (let i = start; i < Math.min(412, start + size); i++) {
    items.push({ ratingKey: String(1000 + i), type: 'movie', title: 'Film ' + i, thumb: '/library/metadata/' + (1000 + i) + '/thumb/1700000000' });
  }
  return JSON.stringify({ MediaContainer: { size: items.length, totalSize: 412, offset: start, Metadata: items } });
}
const serverRoutes = () => [
  [/\/library\/sections\/\d+\/all/, pagedAll],
  [/\/library\/sections$/, fx('sections')],
  [/\/library\/onDeck/, fx('ondeck')],
  [/\/library\/recentlyAdded/, fx('recently-added')],
  [/\/library\/metadata\/100\/children/, fx('children')],
  [/\/library\/metadata\/\d+\/children/, fx('children')],
  [/\/library\/metadata\/\d+$/, fx('metadata')],
];
function deps(extra = {}) {
  const pushed = [];
  const store = extra.store || memStore();
  return {
    pushed,
    arg: {
      doc: makeDoc(), http: fakeHttp(serverRoutes()), store, session: SERVER, id: ID, now: () => 1000,
      nav: { push: (p) => pushed.push(p), pop() {} },
      ...extra,
    },
  };
}

// ---- cache ---------------------------------------------------------------------------------------------------
test('cache : frais dans la durée de vie, périmé mais affichable ensuite, absent une fois la limite dépassée', () => {
  const store = memStore();
  let now = 0;
  const c = ui.createCache({ store, ns: 'a', now: () => now, staleMs: 10000 });
  assert.equal(c.get('k'), null);
  c.set('k', { x: 1 });
  now = 4000;
  assert.deepEqual(c.get('k', 5000), { value: { x: 1 }, fresh: true });
  now = 6000;
  assert.deepEqual(c.get('k', 5000), { value: { x: 1 }, fresh: false });
  now = 11000;
  assert.equal(c.get('k', 5000), null, 'au-delà de staleMs l’entrée est supprimée');
  assert.equal(store.length, 1, 'seul l’index reste');
});

test('cache : persiste dans le Storage, isolé par serveur, plafonné, et tolère un stockage plein', () => {
  const store = memStore();
  const a = ui.createCache({ store, ns: 'a', now: () => 0, max: 3 });
  a.set('1', 1); a.set('2', 2); a.set('3', 3); a.set('4', 4);
  assert.equal(a.get('1', 9), null, 'la plus ancienne est évincée');
  assert.equal(ui.createCache({ store, ns: 'a', now: () => 0, max: 3 }).get('4', 9).value, 4, 'relu depuis le Storage');
  assert.equal(ui.createCache({ store, ns: 'b', now: () => 0 }).get('4', 9), null, 'autre serveur : cache vide');
  const full = { ...memStore(), setItem() { throw new Error('QuotaExceededError'); } };
  const c = ui.createCache({ store: full, ns: 'a', now: () => 0 });
  c.set('k', 1); // ne lève pas
  assert.equal(c.get('k', 9), null);
});

// ---- images --------------------------------------------------------------------------------------------------
test('images : toujours /photo/:/transcode, à la taille exacte d’affichage', () => {
  const cases = [
    [ui.posterUrl(SERVER, { thumb: '/library/metadata/1/thumb/9' }), 240, 360],
    [ui.detailPosterUrl(SERVER, { thumb: '/library/metadata/1/thumb/9' }), 360, 540],
    [ui.episodeThumbUrl(SERVER, { thumb: '/library/metadata/1/thumb/9' }), 360, 203],
  ];
  for (const [u, w, h] of cases) {
    assert.ok(u.startsWith(SERVER.uri + '/photo/:/transcode?'), u);
    const q = new URL(u).searchParams;
    assert.equal(q.get('width'), String(w)); assert.equal(q.get('height'), String(h));
    assert.equal(q.get('upscale'), '1'); assert.equal(q.get('url'), '/library/metadata/1/thumb/9');
  }
  assert.equal(ui.posterUrl(SERVER, {}), null, 'sans image : aplat, pas d’appel');
  // un épisode de « En cours » montre l’affiche de sa série
  assert.ok(new URL(ui.posterUrl(SERVER, { type: 'episode', thumb: '/e', grandparentThumb: '/s' })).searchParams.get('url') === '/s');
});

// ---- accueil -------------------------------------------------------------------------------------------------
test('accueil : trois rangées, affichage immédiat du cache (réseau muet), images en transcodeur', async () => {
  const store = memStore();
  const warm = deps({ store });
  const p0 = ui.createHomePanel(warm.arg);
  await tick(); await tick();
  p0.destroy && p0.destroy();
  // second affichage : le serveur ne répond plus, tout vient du cache, synchrone
  const cold = deps({ store, http: fakeHttp([], { silent: true }) });
  const p = ui.createHomePanel(cold.arg);
  const titles = byClass(p.el, 'plex-hub-title').map((n) => n.textContent);
  assert.deepEqual(titles, ['En cours', 'Ajoutés récemment', 'Bibliothèques']);
  assert.ok(texts(p.el).some((t) => /Titre de série 1/.test(t)), 'tuiles de la rangée En cours déjà là');
  const s = srcs(p.el);
  assert.ok(s.length > 0);
  for (const u of s) assert.ok(u.startsWith(SERVER.uri + '/photo/:/transcode?') && /width=240&height=360/.test(u), u);
});

test('accueil : télécommande — droite/bas déplacent le focus, Entrée sur une bibliothèque pousse la grille', async () => {
  const d = deps();
  const p = ui.createHomePanel(d.arg);
  await tick(); await tick();
  assert.equal(byClass(p.el, 'on').length, 1, 'une seule rangée active');
  assert.equal(byClass(byClass(p.el, 'on')[0], 'focus').length, 1);
  assert.equal(p.onKey('right'), true);
  assert.equal(p.onKey('down'), true); assert.equal(p.onKey('down'), true);
  assert.equal(p.onKey('down'), false, 'dernière rangée : la touche reste au routeur');
  assert.equal(p.onKey('back'), false, 'Retour est laissé au routeur (dépile)');
  p.onKey('enter');
  assert.equal(d.pushed.length, 1);
  assert.ok(byClass(d.pushed[0].el, 'plex-library').length === 1);
});

test('accueil : seules les rangées visibles et la suivante chargent leurs images', async () => {
  const d = deps();
  const p = ui.createHomePanel(d.arg);
  await tick(); await tick();
  const rows = byClass(p.el, 'plex-row');
  assert.equal(rows.length, 3);
  const loaded = (r) => srcs(r).length;
  assert.ok(loaded(rows[0]) > 0 && loaded(rows[1]) > 0);
  // « Bibliothèques » n’a pas d’image du tout (aplat) : rien à précharger
  assert.equal(loaded(rows[2]), 0);
});

// ---- bibliothèque --------------------------------------------------------------------------------------------
test('bibliothèque : pages de 36 par X-Plex-Container-Start/Size, DOM borné, toutes les images en transcodeur', async () => {
  const d = deps();
  const p = ui.createLibraryPanel(d.arg, { key: '1', title: 'Films' });
  await tick(); await tick();
  const pageCalls = () => d.arg.http.calls.filter((c) => /\/all/.test(c.url)).map((c) => [c.headers['X-Plex-Container-Start'], c.headers['X-Plex-Container-Size']]);
  assert.deepEqual(pageCalls()[0], ['0', '36']);
  assert.ok(texts(p.el).some((t) => /412/.test(t)), 'compteur');
  let worst = 0;
  for (let k = 0; k < 66; k++) {
    p.onKey('down');
    worst = Math.max(worst, count(p.el));
    await tick();
  }
  assert.ok(worst <= 140, 'nœuds max ' + worst); // 6 colonnes × (2 visibles + 2 de marge) tuiles × 3 nœuds + décor
  const starts = pageCalls().map((c) => Number(c[0]));
  assert.ok(starts.includes(36) && starts.includes(72), 'pages suivantes demandées : ' + starts);
  assert.ok(starts.every((s) => s % 36 === 0), 'pas aligné : ' + starts);
  assert.equal(new Set(starts).size, starts.length, 'aucune page demandée deux fois');
  for (const u of srcs(p.el)) assert.ok(u.includes('/photo/:/transcode?') && /width=240&height=360/.test(u), u);
});

test('bibliothèque : ouverture instantanée depuis le cache, avec le total', async () => {
  const store = memStore();
  const w = ui.createLibraryPanel(deps({ store }).arg, { key: '1', title: 'Films' });
  await tick(); await tick();
  w.destroy && w.destroy();
  const d = deps({ store, http: fakeHttp([], { silent: true }) });
  const p = ui.createLibraryPanel(d.arg, { key: '1', title: 'Films' });
  assert.ok(texts(p.el).some((t) => /412/.test(t)));
  assert.ok(srcs(p.el).length > 0);
});

// ---- fiche ---------------------------------------------------------------------------------------------------
test('fiche film : titre, durée, progression, Reprendre ; Lire hors TV dit clairement que la lecture n’est pas là', async () => {
  const d = deps();
  const movie = { ratingKey: '100', type: 'movie', title: 'Titre de film 1', thumb: '/library/metadata/100/thumb/1700000000' };
  const p = ui.createDetailPanel(d.arg, movie);
  assert.ok(texts(p.el).includes('Titre de film 1'), 'affiché tout de suite avec les données de la liste');
  await tick(); await tick();
  const all = texts(p.el).join('|');
  assert.match(all, /1980/); assert.match(all, /1 h 42/); // 6164384 ms
  assert.equal(byClass(p.el, 'plex-play').length, 1);
  const big = srcs(p.el).filter((u) => /width=360&height=540/.test(u));
  assert.equal(big.length, 1);
  p.onKey('enter');
  const msg = byClass(p.el, 'plex-msg')[0];
  assert.match(msg.textContent, /lecture/i);
  assert.match(msg.textContent, /TV/);
  p.onKey('left');
  assert.equal(msg.textContent, '', 'le message s’efface à la touche suivante');
});

test('fiche série : saisons en pastilles puis épisodes en vignettes 16:9, épisodes chargés pour la saison choisie', async () => {
  const d = deps();
  const show = { ratingKey: '200', type: 'show', title: 'Titre de série 1', thumb: '/library/metadata/200/thumb/1700000000' };
  const p = ui.createDetailPanel(d.arg, show);
  await tick(); await tick(); await tick();
  const kids = d.arg.http.calls.filter((c) => /\/children/.test(c.url)).map((c) => c.url.replace(/\?.*/, '').replace(SERVER.uri, ''));
  assert.ok(kids.length >= 2, 'saisons puis épisodes de la première saison : ' + kids);
  assert.equal(byClass(p.el, 'plex-seasons').length, 1);
  assert.equal(byClass(p.el, 'plex-episodes').length, 1);
  const eps = srcs(byClass(p.el, 'plex-episodes')[0]);
  assert.ok(eps.length > 0);
  for (const u of eps) assert.ok(u.includes('/photo/:/transcode?') && /width=360&height=203/.test(u), u);
  assert.equal(srcs(byClass(p.el, 'plex-seasons')[0]).length, 0, 'pastilles de saison : aucune image');
  p.onKey('down'); p.onKey('down'); // boutons → saisons → épisodes
  const focusInEpisodes = byClass(byClass(p.el, 'plex-episodes')[0], 'focus').length;
  assert.equal(focusInEpisodes, 1);
});

// ---- libération et retour ------------------------------------------------------------------------------------
test('quitter un écran (suspend) libère les images ; au retour (resume) elles reviennent', async () => {
  const d = deps();
  const p = ui.createLibraryPanel(d.arg, { key: '1', title: 'Films' });
  await tick(); await tick();
  const before = srcs(p.el).length;
  assert.ok(before > 0);
  p.suspend();
  assert.equal(srcs(p.el).length, 0);
  p.resume();
  assert.equal(srcs(p.el).length, before);
});

test('Retour dépile fiche → grille → accueil par le routeur ; l’écran dépilé n’a plus aucune image', async () => {
  const root = makeDoc().createElement('div');
  const router = new ui.Router({ root, exit() {}, createExitConfirm: () => ({ el: makeDoc().createElement('div') }) });
  const base = deps();
  const nav = { push: (p) => router.push(p), pop: () => router.pop() };
  const arg = { ...base.arg, nav };
  const home = ui.createHomePanel(arg);
  router.push(home);
  await tick(); await tick();
  const lib = ui.createLibraryPanel(arg, { key: '1', title: 'Films' });
  router.push(lib);
  await tick(); await tick();
  const detail = ui.createDetailPanel(arg, { ratingKey: '100', type: 'movie', title: 'x', thumb: '/t' });
  router.push(detail);
  assert.equal(router.depth, 3);
  assert.equal(root.children.length, 1);
  router.handleKey('back');
  assert.equal(router.depth, 2);
  assert.equal(srcs(detail.el).length, 0);
  router.handleKey('back');
  assert.equal(router.depth, 1);
  assert.equal(srcs(lib.el).length, 0, 'grille dépilée : images libérées');
  assert.equal(root.children[0], home.el);
});

test('sans session Plex : écran de connexion (une seule requête, la création du PIN), pas l’accueil', () => {
  const d = deps({ session: null, store: memStore(), http: fakeHttp([], { silent: true }) });
  const p = ui.createPlexPanel(d.arg);
  assert.equal(byClass(p.el, 'plex-panel').length, 1);
  assert.equal(byClass(p.el, 'plex-login').length, 1);
  assert.match(texts(p.el).join(' '), /plex\.tv/i);
  assert.equal(d.arg.http.calls.length, 1);
  assert.match(d.arg.http.calls[0].url, /plex\.tv\/api\/v2\/pins/);
  p.destroy();
});

// ---- connexion par PIN et choix du serveur ---------------------------------------------------------------------
// Minuteries factices : on avance à la main. Le transport répond selon des routes ; le PIN reste « en attente »
// jusqu'à ce que `state.token` soit posé.
function fakeTimers() {
  let t = 0; const q = [];
  return {
    now: () => t,
    setTimeout: (fn, ms) => { const h = { fn, at: t + ms }; q.push(h); return h; },
    clearTimeout: (h) => { const i = q.indexOf(h); if (i >= 0) q.splice(i, 1); },
    advance(ms) { t += ms; q.filter((h) => h.at <= t).forEach((h) => { q.splice(q.indexOf(h), 1); h.fn(); }); },
    pending: () => q.length,
  };
}
const RES = JSON.parse(fx('resources'));
const ONE = [RES[0]];   // la fixture a deux serveurs : ONE = le cas « un seul, choisi sans demander »
function loginDeps({ resources = RES, token = null, extra = {} } = {}) {
  const state = { token: null };
  const store = extra.store || memStore();
  const timers = fakeTimers();
  const routes = [
    [/plex\.tv\/api\/v2\/pins\?/, fx('pin-create')],
    [/plex\.tv\/api\/v2\/pins\/1234/, () => (state.token ? JSON.stringify({ id: 1234, code: 'ABCD', authToken: state.token }) : fx('pin-pending'))],
    [/plex\.tv\/api\/v2\/resources/, JSON.stringify(resources)],
    [/\/identity$/, '{}'],
  ];
  const http = fakeHttp(routes);
  const popped = [];
  const d = deps({ store, http, session: undefined, timers, nav: { push() {}, pop: () => popped.push(1) }, ...extra });
  if (token) { const s = { version: 1, prefs: { plexToken: token } }; store.setItem('cimaise.v1', JSON.stringify(s)); }
  return { ...d, state, timers, store, http, popped };
}
const prefs = (store) => (store.getItem('cimaise.v1') ? JSON.parse(store.getItem('cimaise.v1')).prefs : {});
const flush = async () => { for (let i = 0; i < 6; i++) await tick(); };

test('connexion : sans token, le code PIN est affiché en grand avec plex.tv/link, rien n’est stocké', async () => {
  const l = loginDeps();
  const p = ui.createPlexPanel(l.arg);
  await flush();
  assert.ok(texts(p.el).includes('ABCD'));
  assert.ok(texts(p.el).some((t) => /plex\.tv\/link/.test(t)));
  assert.equal(byClass(p.el, 'plex-pin').length, 1);
  assert.equal(prefs(l.store).plexToken, undefined);
  p.destroy();
});

test('connexion : Retour annule l’attente — plus de minuterie ni d’interrogation', async () => {
  const l = loginDeps();
  const router = new ui.Router({ root: makeDoc().createElement('div'), exit() {} });
  const p = ui.createPlexPanel(l.arg);
  router.push({ el: makeDoc().createElement('div') });
  router.push(p);
  await flush();
  assert.equal(l.timers.pending(), 1, 'une interrogation planifiée');
  assert.equal(router.handleKey('back'), true);
  assert.equal(l.timers.pending(), 0);
  const n = l.http.calls.length;
  l.state.token = 'ACCOUNT-TOK'; l.timers.advance(5000); await flush();
  assert.equal(l.http.calls.length, n, 'aucune requête après Retour');
  assert.equal(prefs(l.store).plexToken, undefined);
});

test('connexion : PIN validé, un seul serveur → choisi sans demander ; token et serveur mémorisés, connexion locale préférée, accueil', async () => {
  const l = loginDeps({ resources: ONE });
  const p = ui.createPlexPanel(l.arg);
  await flush();
  l.state.token = 'ACCOUNT-TOK';
  l.timers.advance(2000); await flush(); l.timers.advance(0); await flush();
  const pr = prefs(l.store);
  assert.equal(pr.plexToken, 'ACCOUNT-TOK');
  assert.equal(pr.plexServer, 'Serveur test');
  assert.equal(pr.plexSession.token, 'FAKE-SERVER-TOKEN');
  assert.ok(/^https:\/\/192-0-2-10\./.test(pr.plexSession.uri), 'locale choisie : ' + pr.plexSession.uri);
  assert.equal(l.http.calls.filter((c) => /\/identity$/.test(c.url))[0].url.slice(0, 19), 'https://192-0-2-10.');
  assert.equal(byClass(p.el, 'plex-hub').length > 0 || byClass(p.el, 'plex-home').length === 1, true, 'accueil monté');
  p.destroy();
});

test('connexion : le token n’est jamais écrit dans les logs', async () => {
  const seen = [];
  const orig = { log: console.log, warn: console.warn, error: console.error };
  console.log = console.warn = console.error = (...a) => seen.push(a.join(' '));
  try {
    const l = loginDeps({ resources: ONE });
    const p = ui.createPlexPanel(l.arg);
    await flush(); l.state.token = 'ACCOUNT-TOK'; l.timers.advance(2000); await flush(); l.timers.advance(0); await flush();
    p.destroy();
  } finally { Object.assign(console, orig); }
  assert.ok(!seen.join('\n').includes('ACCOUNT-TOK'));
});

test('réouverture : token et session stockés → accueil Plex directement, aucun appel plex.tv', async () => {
  const store = memStore();
  store.setItem('cimaise.v1', JSON.stringify({ version: 1, prefs: { plexToken: 'T', plexSession: SERVER, plexServer: 'Serveur test' } }));
  const d = deps({ store, session: undefined });
  const p = ui.createPlexPanel(d.arg);
  await tick(); await tick();
  assert.equal(byClass(p.el, 'plex-login').length, 0);
  assert.deepEqual(byClass(p.el, 'plex-hub-title').map((n) => n.textContent), ['En cours', 'Ajoutés récemment', 'Bibliothèques']);
  assert.ok(!d.arg.http.calls.some((c) => /plex\.tv/.test(c.url)));
});

test('serveurs : token déjà là et plusieurs serveurs → liste à choisir, choix mémorisé', async () => {
  const second = { ...RES[0], name: 'Autre serveur', accessToken: 'OTHER-TOKEN' };
  const l = loginDeps({ resources: [RES[0], second], token: 'ACCOUNT-TOK' });
  const p = ui.createPlexPanel(l.arg);
  await flush();
  assert.equal(l.http.calls.some((c) => /\/pins/.test(c.url)), false, 'pas de PIN : le token est là');
  const names = byClass(p.el, 'plex-server').map((n) => n.textContent);
  assert.deepEqual(names, ['Serveur test', 'Autre serveur']);
  assert.equal(p.onKey('down'), true);
  assert.equal(p.onKey('enter'), true);
  await flush(); l.timers.advance(0); await flush();
  assert.equal(prefs(l.store).plexServer, 'Autre serveur');
  assert.equal(prefs(l.store).plexSession.token, 'OTHER-TOKEN');
  p.destroy();
});

test('serveurs : si une connexion locale ne répond pas, on passe à la suivante', async () => {
  const l = loginDeps({ resources: ONE, token: 'ACCOUNT-TOK' });
  const base = l.arg.http;
  l.arg.http = (req, cb) => (/^https:\/\/192-0-2-10\..*\/identity$/.test(req.url) ? (base.calls.push(req), setImmediate(() => cb(new Error('réseau'))), { abort() {} }) : base(req, cb));
  const p = ui.createPlexPanel(l.arg);
  await flush(); await flush();
  assert.ok(/^https:\/\/203-0-113-5\./.test(prefs(l.store).plexSession.uri));
  p.destroy();
});
