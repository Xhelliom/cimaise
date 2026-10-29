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
    stdin: { resolveDir: es5, contents: "export * from './plex/src/index.js'; export { Router } from './tv-core/src/router/index.js'; export * as diag from './tv-core/src/diag.js';" },
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
test('accueil : quatre rangées (dont Réglages), affichage immédiat du cache (réseau muet), images en transcodeur', async () => {
  const store = memStore();
  const warm = deps({ store });
  const p0 = ui.createHomePanel(warm.arg);
  await tick(); await tick();
  p0.destroy && p0.destroy();
  // second affichage : le serveur ne répond plus, tout vient du cache, synchrone
  const cold = deps({ store, http: fakeHttp([], { silent: true }) });
  const p = ui.createHomePanel(cold.arg);
  const titles = byClass(p.el, 'plex-hub-title').map((n) => n.textContent);
  assert.deepEqual(titles, ['En cours', 'Ajoutés récemment', 'Bibliothèques', 'Réglages']);
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
  assert.equal(p.onKey('down'), true); assert.equal(p.onKey('down'), true); assert.equal(p.onKey('down'), true);
  assert.equal(p.onKey('down'), false, 'dernière rangée : la touche reste au routeur');
  assert.equal(p.onKey('back'), false, 'Retour est laissé au routeur (dépile)');
  p.onKey('up');
  p.onKey('enter');
  assert.equal(d.pushed.length, 1);
  assert.ok(byClass(d.pushed[0].el, 'plex-library').length === 1);
});

test('accueil : seules les rangées visibles et la suivante chargent leurs images', async () => {
  const d = deps();
  const p = ui.createHomePanel(d.arg);
  await tick(); await tick();
  const rows = byClass(p.el, 'plex-row');
  assert.equal(rows.length, 4);
  const loaded = (r) => srcs(r).length;
  assert.ok(loaded(rows[0]) > 0 && loaded(rows[1]) > 0);
  // « Bibliothèques » n’a pas d’image du tout (aplat) : rien à précharger
  assert.equal(loaded(rows[2]), 0);
});

// ---- Réglages du module : langues audio / sous-titres -----------------------------------------------------------
const stored = (store) => JSON.parse(store.getItem('cimaise.v1')).prefs.plexLang;
const rowsOf = (p) => byClass(p.el, 'plex-set-row').map((r) => byClass(r, 'plex-set-name')[0].textContent + ' = ' + byClass(r, 'plex-set-val')[0].textContent);

test('Réglages Plex : une entrée de l’accueil ouvre les langues ; défaut « VO sous-titrée », rien n’est écrit tant qu’on ne change rien', async () => {
  const d = deps();
  const home = ui.createHomePanel(d.arg);
  await tick(); await tick();
  home.onKey('down'); home.onKey('down'); home.onKey('down'); // En cours → Ajoutés → Bibliothèques → Réglages
  home.onKey('enter');
  assert.equal(d.pushed.length, 1);
  const p = d.pushed[0];
  assert.equal(byClass(p.el, 'plex-settings').length, 1);
  assert.deepEqual(rowsOf(p), ['Langues du lecteur = VO sous-titrée']);
  assert.ok(texts(p.el).some((t) => /version originale/.test(t)), 'explication du mode');
  assert.equal(d.arg.store.getItem('cimaise.v1'), null);
});

test('Réglages Plex : le mode se change à la télécommande et est enregistré (cimaise.v1, prefs.plexLang)', () => {
  const d = deps();
  const p = ui.createSettingsPanel(d.arg);
  assert.equal(p.onKey('right'), true);
  assert.deepEqual(rowsOf(p), ['Langues du lecteur = Français si disponible']);
  assert.deepEqual(stored(d.arg.store), { mode: 'fr', audio: ['fra'], subs: ['fra'] });
  p.onKey('enter'); // Personnalisé : les listes apparaissent
  assert.equal(stored(d.arg.store).mode, 'custom');
  assert.equal(rowsOf(p).length, 7);
  p.onKey('enter'); // boucle sur « VO sous-titrée »
  assert.equal(stored(d.arg.store).mode, 'vo');
  assert.equal(rowsOf(p).length, 1);
  p.onKey('left');
  assert.equal(stored(d.arg.store).mode, 'vo', 'borne basse');
  assert.equal(p.onKey('back'), false, 'Retour reste au routeur');
});

test('Réglages Plex : mode Personnalisé — trois langues audio et trois de sous-titres, ordonnées, sans trou ni doublon dans le stockage', () => {
  const d = deps();
  const p = ui.createSettingsPanel(d.arg);
  p.onKey('enter'); p.onKey('enter'); // vo → fr → custom
  p.onKey('down');
  assert.deepEqual(rowsOf(p).slice(1, 4), ['Audio 1 = Français', 'Audio 2 = Aucune', 'Audio 3 = Aucune']);
  p.onKey('right'); // Audio 1 : Anglais
  p.onKey('down'); p.onKey('right'); p.onKey('right'); // Audio 2 : Aucune → Français → Anglais (doublon : ignoré à l’enregistrement)
  assert.deepEqual(stored(d.arg.store).audio, ['eng']);
  p.onKey('left'); // Audio 2 : Français
  assert.deepEqual(stored(d.arg.store).audio, ['eng', 'fra']);
  p.onKey('down'); p.onKey('down'); // Sous-titres 1 (Français)
  assert.equal(rowsOf(p)[4], 'Sous-titres 1 = Français');
  p.onKey('left'); // Aucune
  assert.deepEqual(stored(d.arg.store).subs, []);
  p.onKey('down'); p.onKey('right'); p.onKey('right'); // Sous-titres 2 : Anglais ; 1 reste vide (trou comblé)
  assert.deepEqual(stored(d.arg.store).subs, ['eng']);
  // la première langue audio est obligatoire : pas de « Aucune »
  p.onKey('up'); p.onKey('up'); p.onKey('up'); p.onKey('up'); // Audio 1
  p.onKey('left'); p.onKey('left'); p.onKey('left');
  assert.equal(rowsOf(p)[1].split(' = ')[1], 'Français');
  assert.ok(stored(d.arg.store).audio.length >= 1);
});

test('Réglages Plex : les valeurs migrées de l’ancien schéma s’affichent (mode Personnalisé)', () => {
  const store = memStore();
  store.setItem('cimaise.v1', JSON.stringify({ version: 2, prefs: { plexAudioLang: 'eng', plexSubLang: 'fra' } }));
  const p = ui.createSettingsPanel(deps({ store }).arg);
  const r = rowsOf(p);
  assert.equal(r[0], 'Langues du lecteur = Personnalisé');
  assert.equal(r[1], 'Audio 1 = Anglais');
  assert.equal(r[4], 'Sous-titres 1 = Français');
});

test('Réglages Plex : un stockage qui refuse l’écriture ne casse pas l’écran', () => {
  const d = deps();
  d.arg.store.setItem = () => { throw new Error('quota'); };
  const p = ui.createSettingsPanel(d.arg);
  assert.doesNotThrow(() => p.onKey('right'));
  assert.deepEqual(rowsOf(p), ['Langues du lecteur = Français si disponible']);
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
test('fiche film : titre, durée, progression, Reprendre ; Lire ouvre l’écran lecteur', async () => {
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
  assert.equal(d.pushed.length, 1, 'l’écran lecteur est poussé');
  d.pushed[0].destroy();
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

// ---- retour de lecture : les panneaux rechargent depuis le serveur --------------------------------------------
const reqs = (http, re) => http.calls.filter((c) => re.test(c.url)).length;
const sharedData = (d) => ui.createData(d.arg.http, ID, SERVER, ui.createCache({ store: d.arg.store, ns: SERVER.uri, now: d.arg.now }));

test('retour de lecture : l’accueil redemande « En cours » au serveur et le réaffiche', async () => {
  let deck = fx('ondeck');
  const d = deps({ http: fakeHttp([[/\/library\/onDeck/, () => deck], ...serverRoutes()]) });
  const p = ui.createHomePanel(d.arg);
  await flush();
  assert.equal(reqs(d.arg.http, /\/library\/onDeck/), 1);
  assert.ok(texts(p.el).some((t) => /Titre de série 1/.test(t)));

  p.suspend();
  deck = JSON.stringify({ MediaContainer: { size: 1, Metadata: [{ ratingKey: '777', type: 'movie', title: 'Film repris', thumb: '/library/metadata/777/thumb/1' }] } });
  sharedData(d).progressed({ ratingKey: '300', type: 'episode' }, 42000, false);
  p.resume();
  await flush();
  assert.equal(reqs(d.arg.http, /\/library\/onDeck/), 2, 'redemandé au retour');
  assert.ok(texts(p.el).some((t) => /Film repris/.test(t)), 'nouvelle rangée affichée');
});

test('retour de lecture : la fiche film affiche la nouvelle position (Reprendre, barre)', async () => {
  const d = deps();
  const movie = { ratingKey: '100', type: 'movie', title: 'Titre de film 1', thumb: '/library/metadata/100/thumb/1700000000' };
  const p = ui.createDetailPanel(d.arg, movie);
  await flush();
  assert.equal(byClass(p.el, 'plex-play')[0].textContent, 'Lire');
  const bar = byClass(p.el, 'plex-prog-bar')[0];
  assert.equal(bar.style.transform, 'scaleX(0)');

  p.suspend();
  sharedData(d).progressed(movie, 3082192, false);   // moitié de 6164384 ms
  p.resume();
  await flush();
  assert.equal(byClass(p.el, 'plex-play')[0].textContent, 'Reprendre');
  assert.equal(bar.style.transform, 'scaleX(0.5)');
});

test('retour de lecture : la fiche série recharge les épisodes de la saison courante', async () => {
  const d = deps();
  const show = { ratingKey: '200', type: 'show', title: 'Titre de série 1', thumb: '/library/metadata/200/thumb/1700000000' };
  const p = ui.createDetailPanel(d.arg, show);
  await flush();
  const seasonKids = () => reqs(d.arg.http, /\/library\/metadata\/500\/children/);
  assert.equal(seasonKids(), 1, 'épisodes de la saison 500 chargés une fois');
  assert.equal(reqs(d.arg.http, /\/library\/metadata\/200(\?|$)/), 1);

  p.suspend();
  sharedData(d).progressed({ ratingKey: '9', type: 'episode', parentRatingKey: '500', grandparentRatingKey: '200' }, 42000, false);
  p.resume();
  await flush();
  assert.equal(seasonKids(), 2, 'épisodes de la saison courante redemandés');
  assert.equal(reqs(d.arg.http, /\/library\/metadata\/200(\?|$)/), 2, 'fiche de la série redemandée');
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
  assert.deepEqual(byClass(p.el, 'plex-hub-title').map((n) => n.textContent), ['En cours', 'Ajoutés récemment', 'Bibliothèques', 'Réglages']);
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

// ---- un seul anneau de focus ---------------------------------------------------------------------------------
test('accueil : un seul élément focalisé à tout moment ; la sélection de chaque rangée est mémorisée', async () => {
  const d = deps();
  const p = ui.createHomePanel(d.arg);
  await tick(); await tick();
  const rows = byClass(p.el, 'plex-row');
  const count = () => byClass(p.el, 'focus').length;
  const marked = (r) => byClass(r, 'mark').length;
  assert.equal(count(), 1);
  p.onKey('right'); p.onKey('right'); // décale la première rangée
  const labelOf = (r, c) => byClass(r, c)[0].children.map((x) => x.textContent).join('');
  const before = labelOf(rows[0], 'focus');
  p.onKey('down');
  assert.equal(count(), 1, 'changer de rangée déplace l’anneau');
  assert.equal(byClass(rows[0], 'focus').length, 0);
  assert.equal(marked(rows[0]), 1, 'la rangée quittée garde un repère discret');
  assert.equal(labelOf(rows[0], 'mark'), before, 'position mémorisée');
  p.onKey('down');
  assert.equal(count(), 1);
  p.onKey('up'); p.onKey('up');
  assert.equal(count(), 1);
  assert.equal(labelOf(rows[0], 'focus'), before, 'retour à la même tuile');
});

test('fiche série : un seul élément focalisé quand on passe boutons → saisons → épisodes', async () => {
  const d = deps();
  const show = { ratingKey: '200', type: 'show', title: 'Titre de série 1', thumb: '/library/metadata/200/thumb/1700000000' };
  const p = ui.createDetailPanel(d.arg, show);
  await tick(); await tick(); await tick();
  for (let k = 0; k < 3; k++) {
    assert.equal(byClass(p.el, 'focus').length, 1, 'zone ' + k);
    p.onKey('down');
  }
});

test('alignement : titres de rangée, première tuile, grille et fiche sur la même marge gauche (120 px)', () => {
  const css = readFileSync('packages/plex/src/plex.css', 'utf8');
  const px = (re) => +re.exec(css)[1];
  const rowLeft = px(/\.plex-row\{left:(\d+)px/) + px(/\.plex-row \.vlayer,\.plex-grid \.vlayer\{margin:\d+px 0 0 (\d+)px/);
  assert.equal(px(/\.plex-hub-title\{[^}]*left:(\d+)px/), rowLeft);
  assert.equal(px(/\.plex-lib-title\{[^}]*left:(\d+)px/), rowLeft);
  assert.equal(px(/\.plex-grid\{left:(\d+)px/) + px(/\.plex-grid \.vlayer\{margin:\d+px 0 0 (\d+)px/), rowLeft);
});

test('accueil : verticalement, la rangée active et son titre tiennent dans 0–1080 ; la précédente est entière ou hors écran', async () => {
  const d = deps();
  const p = ui.createHomePanel(d.arg);
  await tick(); await tick();
  const css = readFileSync('packages/plex/src/plex.css', 'utf8');
  const px = (re) => +re.exec(css)[1];
  const titleTop = px(/\.plex-hub-title\{[^}]*top:(\d+)px/), titleH = 48; // 40 px de police
  const rowTop = px(/\.plex-row\{left:\d+px;top:(\d+)px/);
  const layerMargin = +/\.plex-row \.vlayer,\.plex-grid \.vlayer\{margin:(\d+)px/.exec(css)[1];
  const tileTop = rowTop + layerMargin, tileBottom = tileTop + 360 + 72; // affiche + étiquette
  const ty = (e) => { const m = /translate3d\(0,\s*(-?[\d.]+)px/.exec(e.style.transform || ''); return m ? +m[1] : 0; };
  const layer = byClass(p.el, 'plex-hubs')[0];
  const wraps = byClass(p.el, 'plex-hub');
  assert.equal(wraps.length, 4);
  for (let a = 0; a < 4; a++) {
    const y = (i) => ty(layer) + ty(wraps[i]);
    assert.ok(y(a) + titleTop >= 0 && y(a) + titleTop + titleH <= 1080, 'titre actif ' + a);
    assert.ok(y(a) + tileTop >= 0 && y(a) + tileBottom <= 1080, 'tuiles actives ' + a);
    if (a > 0) {
      const top = y(a - 1) + tileTop, bottom = y(a - 1) + tileBottom;
      assert.ok(bottom <= 0 || (top >= 0 && bottom <= 1080), 'rangée précédente coupée : ' + top + '–' + bottom);
    }
    p.onKey('down');
  }
});

test('accueil : les images restent chargées sur la rangée précédente (partiellement visible) et une rangée de marge au-delà', async () => {
  const d = deps();
  const p = ui.createHomePanel(d.arg);
  await tick(); await tick();
  const rows = byClass(p.el, 'plex-row');
  const count = (i) => srcs(rows[i]).length;
  const before = count(0);
  assert.ok(before > 0, 'rangée 0 chargée');
  p.onKey('down'); // la rangée 0 passe au-dessus, à moitié visible
  assert.equal(count(0), before, 'rangée précédente : images conservées');
  assert.ok(count(1) > 0, 'rangée active chargée');
  p.onKey('up');
  assert.equal(count(0), before, 'retour en haut : images présentes');
});

// ---- Lire depuis la fiche d’une série : toujours un épisode ----------------------------------------------------
// Réponses réelles (anonymisées) de /library/metadata/{série}?includeOnDeck=1 : série entamée (OnDeck.Metadata = un objet)
// et série terminée (pas d'OnDeck). Voir scripts/plex/capture-show-fixtures.mjs.
const SHOW = { ratingKey: '200', type: 'show', title: 'Titre de série 1', thumb: '/library/metadata/200/thumb/1700000000' };
const SHOW_DECK = { ratingKey: '700', type: 'show', title: 'Titre de série 700' };
const SHOW_DONE = { ratingKey: '800', type: 'show', title: 'Titre de série 800' };
const playBtn = (p) => byClass(p.el, 'plex-play')[0].textContent;
const showDeps = (fixture) => {
  const played = [];
  const routes = fixture ? [[/\/library\/metadata\/(700|800)(\?|$)/, fx(fixture)]] : [];
  const d = deps({ onPlay: (it) => played.push(it), http: fakeHttp([...routes, ...serverRoutes()]) });
  return { d, played };
};

test('depuis « En cours » : la fiche de la série garde l’épisode visé et Lire lit CET épisode', async () => {
  const { d, played } = showDeps(null);
  const home = ui.createHomePanel(d.arg);
  await flush();
  const deck = JSON.parse(fx('ondeck')).MediaContainer.Metadata;
  assert.equal(deck[0].type, 'episode');
  home.onKey('enter');   // première tuile de « En cours » : l’épisode 300 de la série 200
  assert.equal(d.pushed.length, 1);
  const detail = d.pushed[0];
  await flush();
  assert.equal(playBtn(detail), 'Reprendre S1 E8');
  detail.onKey('enter');
  assert.deepEqual(played.map((i) => i.ratingKey), ['300'], 'l’épisode, jamais la série');
  assert.equal(played[0].type, 'episode');
});

test('depuis « En cours » : la fiche s’ouvre sur la saison et l’épisode visés', async () => {
  const { d, played } = showDeps(null);
  const ep = { ratingKey: '501', type: 'episode', title: 'Titre d’épisode 4', grandparentRatingKey: '200', parentIndex: 1, index: 2, viewOffset: 5000 };
  const p = ui.createDetailPanel(d.arg, SHOW, ep);
  await flush();
  assert.equal(playBtn(p), 'Lire S1 E2', 'la version du serveur (sans reprise) remplace celle de En cours');
  p.onKey('down'); p.onKey('down'); p.onKey('down');
  const focused = byClass(byClass(p.el, 'plex-episodes')[0], 'focus');
  assert.equal(focused.length, 1);
  assert.ok(texts(focused[0]).some((t) => /Titre d'épisode 4/.test(t)), 'tuile de l’épisode visé focalisée : ' + texts(focused[0]));
});

test('fiche de série : Lire = l’épisode « à suivre » du serveur (réponse réelle), libellé saison/épisode', async () => {
  const { d, played } = showDeps('show-ondeck');
  const p = ui.createDetailPanel(d.arg, SHOW_DECK);
  await flush();
  assert.ok(d.arg.http.calls.some((c) => /\/library\/metadata\/700\?includeOnDeck=1/.test(c.url)), 'demande includeOnDeck');
  assert.equal(playBtn(p), 'Lire S1 E2', 'pas « S1 E1 » : l’épisode à suivre du serveur est le 2');
  p.onKey('enter');
  assert.deepEqual(played.map((i) => i.ratingKey), ['701']);
  assert.equal(played[0].type, 'episode');
});

test('fiche de série sans « à suivre » (série terminée, réponse réelle) : Lire = le premier épisode', async () => {
  const { d, played } = showDeps('show-finished');
  const p = ui.createDetailPanel(d.arg, SHOW_DONE);
  await flush();
  assert.equal(playBtn(p), 'Lire S1 E1');
  p.onKey('enter');
  assert.deepEqual(played.map((i) => i.ratingKey), ['500']);
  assert.equal(played[0].type, 'episode');
});

test('le lecteur refuse une série ou une saison avec un message explicite, sans requête', async () => {
  for (const type of ['show', 'season']) {
    const d = deps();
    const p = ui.createPlayerPanel(d.arg, { ratingKey: '200', type, title: 'Titre' });
    await flush();
    assert.equal(d.arg.http.calls.length, 0, type + ' : aucune requête');
    assert.ok(texts(p.el).some((t) => /Lecture impossible : .*(série|saison).*épisode/.test(t)), type + ' : ' + texts(p.el));
    p.destroy && p.destroy();
  }
});

// ---- saisons : la liste d'épisodes suit la saison affichée -----------------------------------------------------
function seasonsDeps() {
  const eps = (s) => JSON.stringify({ MediaContainer: { size: 2, Metadata: [1, 2].map((n) => ({ ratingKey: s + n, type: 'episode', index: n, title: 'S' + s + ' ép ' + n, parentRatingKey: s, thumb: '/library/metadata/' + s + n + '/thumb/1' })) } });
  const seasons = JSON.stringify({ MediaContainer: { size: 2, Metadata: [{ ratingKey: '500', type: 'season', index: 1, title: 'Saison 1' }, { ratingKey: '501', type: 'season', index: 2, title: 'Saison 2' }] } });
  const held = {};   // réponses retenues : clé de saison -> libération
  const http = fakeHttp([]);
  const base = (req, cb) => {
    const m = /metadata\/(\d+)\/children/.exec(req.url);
    if (!m) return fakeHttp(serverRoutes())(req, cb);
    http.calls.push(req);
    let live = true;
    const body = m[1] === '200' ? seasons : eps(m[1]);
    const go = () => { if (live) cb(null, { status: 200, body }); };
    if (held[m[1]] === true) held[m[1]] = go; else setImmediate(go);
    return { abort() { live = false; } };
  };
  base.calls = http.calls;
  const pending = [];
  const timers = { now: () => 0, setTimeout: (fn, ms) => { const t = { fn, ms }; pending.push(t); return t; }, clearTimeout: (t) => { const i = pending.indexOf(t); if (i >= 0) pending.splice(i, 1); } };
  const d = deps({ http: base, timers });
  return { d, held, pending, show: { ratingKey: '200', type: 'show', title: 'Série', thumb: '/t' } };
}
const epTitles = (p) => byClass(byClass(p.el, 'plex-episodes')[0], 'vlabel').map((n) => n.textContent).sort();

test('fiche série : changer de saison redessine tout de suite les épisodes, même à nombre égal', async () => {
  const { d, show } = seasonsDeps();
  const p = ui.createDetailPanel(d.arg, show);
  await flush();
  assert.deepEqual(epTitles(p), ['1. S500 ép 1', '2. S500 ép 2']);
  p.onKey('down'); p.onKey('right'); p.onKey('enter');
  await flush();
  assert.deepEqual(epTitles(p), ['1. S501 ép 1', '2. S501 ép 2'], 'sans déplacement dans les épisodes');
  const sel = byClass(byClass(p.el, 'plex-seasons')[0], 'sel');
  assert.equal(sel.length, 1);
  assert.equal(sel[0].children[1].textContent, 'Saison 2');
});

test('fiche série : la réponse lente d’une saison quittée est ignorée', async () => {
  const { d, held, show } = seasonsDeps();
  const p = ui.createDetailPanel(d.arg, show);
  await flush();
  held['501'] = true;
  p.onKey('down'); p.onKey('right'); p.onKey('enter');   // saison 2 : réponse retenue
  p.onKey('left'); p.onKey('enter');                      // retour saison 1 (en cache)
  await flush();
  held['501']();                                          // la saison 2 arrive en retard
  await flush();
  assert.deepEqual(epTitles(p), ['1. S500 ép 1', '2. S500 ép 2']);
});

test('fiche série : la saison suit le focus après 300 ms, sans Entrée', async () => {
  const { d, pending, show } = seasonsDeps();
  const p = ui.createDetailPanel(d.arg, show);
  await flush();
  p.onKey('down'); p.onKey('right');
  assert.deepEqual(epTitles(p), ['1. S500 ép 1', '2. S500 ép 2'], 'pas avant le délai');
  assert.equal(pending.length, 1);
  assert.equal(pending[0].ms, 300);
  pending[0].fn();
  await flush();
  assert.deepEqual(epTitles(p), ['1. S501 ép 1', '2. S501 ép 2']);
});

// ---- mesures de performance (diagnostic, touche 0) -----------------------------------------------------------
function withClock(fn) {
  const real = Date.now; let t = 5000;
  Date.now = () => t;
  const clock = { set: (v) => { t = v; } };
  return fn(clock).finally(() => { Date.now = real; });
}

test('mesures : bibliothèque sans cache → « réseau », avec cache → « cache », dans les 10 dernières', async () => {
  await withClock(async (clock) => {
    ui.diag.resetMeasures();
    const store = memStore();
    const first = deps({ store, http: fakeHttp(serverRoutes().map((r) => [r[0], r[1]])) });
    clock.set(1000);
    const slow = { ...first.arg.http };
    const p = ui.createLibraryPanel(first.arg, { key: '1', title: 'Films' });
    clock.set(1400); await tick(); await tick();
    const net = ui.diag.measureStats('biblio-reseau');
    assert.equal(net.n, 1);
    assert.equal(net.min, 400);
    assert.equal(ui.diag.measureStats('biblio-cache'), null);
    p.destroy();
    clock.set(2000);
    const d = deps({ store, http: fakeHttp([], { silent: true }) });
    clock.set(2000);
    ui.createLibraryPanel(d.arg, { key: '1', title: 'Films' });
    assert.equal(ui.diag.measureStats('biblio-cache').n, 1);
    assert.equal(ui.diag.measureStats('biblio-cache').max, 0);
    assert.equal(ui.diag.measureStats('biblio-reseau').n, 1, 'une seule mesure par ouverture');
  });
});

test('mesures : une seule mesure par ouverture de bibliothèque, pas une par page', async () => {
  ui.diag.resetMeasures();
  const d = deps();
  const p = ui.createLibraryPanel(d.arg, { key: '1', title: 'Films' });
  await tick(); await tick();
  for (let k = 0; k < 40; k++) { p.onKey('down'); await tick(); }
  const n = (ui.diag.measureStats('biblio-reseau') || { n: 0 }).n + (ui.diag.measureStats('biblio-cache') || { n: 0 }).n;
  assert.equal(n, 1);
  p.destroy();
});

test('mesures : ouverture d’une fiche = création → métadonnées complètes affichées, une fois', async () => {
  await withClock(async (clock) => {
    ui.diag.resetMeasures();
    const d = deps();
    clock.set(1000);
    const p = ui.createDetailPanel(d.arg, { ratingKey: '100', type: 'movie', title: 'Titre de film 1', thumb: '/t' });
    assert.equal(ui.diag.measureStats('fiche'), null, 'pas avant l’arrivée de la fiche');
    clock.set(1250); await tick(); await tick();
    assert.deepEqual(ui.diag.measureStats('fiche'), { n: 1, min: 250, median: 250, max: 250 });
    p.destroy();
  });
});

test('mesures : aucune mesure n’ajoute de requête ni de minuterie', async () => {
  const d = deps();
  const base = deps();
  const realSet = global.setTimeout; let timers = 0;
  const p = ui.createDetailPanel(d.arg, { ratingKey: '100', type: 'movie', title: 'T', thumb: '/t' });
  await tick(); await tick();
  const q = ui.createDetailPanel(base.arg, { ratingKey: '100', type: 'movie', title: 'T', thumb: '/t' });
  await tick(); await tick();
  assert.equal(d.arg.http.calls.length, base.arg.http.calls.length);
  assert.ok(d.arg.http.calls.every((c) => !/measure|diag/i.test(c.url)));
  const src = readFileSync('packages/tv-core/src/diag.ts', 'utf8');
  const plexSrc = ['library', 'detail', 'player'].map((n) => readFileSync('packages/plex/src/ui/' + n + '.ts', 'utf8')).join('\n');
  assert.ok(!/setTimeout|setInterval|requestAnimationFrame/.test(src.slice(src.indexOf('Mesures nommées'), src.indexOf('export function report'))));
  assert.ok(!/recordMeasure[^;]*setTimeout/.test(plexSrc));
  p.destroy(); q.destroy();
});

test('diagnostic : section Plex avec min/médiane/max des 10 dernières mesures', () => {
  ui.diag.resetMeasures();
  for (let i = 1; i <= 12; i++) ui.diag.recordMeasure('fiche', i * 100); // les 10 derniers : 300..1200
  assert.deepEqual(ui.diag.measureStats('fiche'), { n: 10, min: 300, median: 750, max: 1200 });
  const r = ui.diag.report();
  assert.match(r, /Plex\n/);
  assert.match(r, /fiche: min 300 \/ méd 750 \/ max 1200 ms \(10\)/);
  assert.match(r, /bibliothèque \(cache\): —/);
  assert.match(r, /bibliothèque \(réseau\): —/);
  assert.match(r, /lecture \(Entrée → 1re image\): —/);
});

test('diagnostic : la mémoire JS n’apparaît que si le moteur expose performance.memory', () => {
  assert.doesNotMatch(ui.diag.plexReport(), /mémoire/);
  const had = Object.getOwnPropertyDescriptor(globalThis, 'performance');
  Object.defineProperty(globalThis, 'performance', { value: { memory: { usedJSHeapSize: 52428800 } }, configurable: true });
  try { assert.match(ui.diag.plexReport(), /mémoire JS: 50 Mo/); }
  finally { Object.defineProperty(globalThis, 'performance', had); }
});
