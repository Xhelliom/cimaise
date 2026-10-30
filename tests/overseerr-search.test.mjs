// Recherche Overseerr (packages/overseerr/src/ui/search.ts) : clavier partagé de tv-core, requête après un silence de frappe,
// films et séries mêlés avec badge, pagination, Retour rendu au routeur. Transport, minuteries et DOM factices.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';

let U;
before(async () => {
  const out = join(mkdtempSync(join(tmpdir(), 'ov-search-')), 'ui.cjs');
  await build({ entryPoints: ['packages/overseerr/src/ui/home.ts'], bundle: true, format: 'cjs', target: 'es2017', outfile: out, logLevel: 'warning' });
  U = createRequire(import.meta.url)(out);
});

function fakeDoc() {
  const mk = (tag) => {
    const attrs = {};
    const el = {
      tag, children: [], parent: null, className: '', textContent: '', style: {},
      classList: {
        add: (c) => { if (!el.className.split(' ').includes(c)) el.className = (el.className + ' ' + c).trim(); },
        remove: (c) => { el.className = el.className.split(' ').filter((x) => x !== c).join(' '); },
      },
      appendChild(c) { c.parent = el; el.children.push(c); return c; },
      removeChild(c) { el.children.splice(el.children.indexOf(c), 1); c.parent = null; return c; },
      setAttribute: (k, v) => { attrs[k] = String(v); },
      getAttribute: (k) => (k in attrs ? attrs[k] : null),
      removeAttribute: (k) => { delete attrs[k]; },
    };
    return el;
  };
  return { createElement: mk };
}
const all = (n, out = []) => { out.push(n); n.children.forEach((c) => all(c, out)); return out; };
const byClass = (n, cls) => all(n).filter((x) => (x.className || '').split(' ').includes(cls));

function fakeTimers() {
  let t = 0, id = 0;
  const q = new Map();
  return {
    setTimeout: (f, ms) => { q.set(++id, { f, at: t + ms }); return id; },
    clearTimeout: (i) => { q.delete(i); },
    now: () => t,
    advance(ms) {
      t += ms;
      for (const [i, j] of [...q]) if (j.at <= t) { q.delete(i); j.f(); }
    },
  };
}

// 20 résultats par page, films et séries alternés, une personne glissée (retirée par le client) ; 3 pages.
function fakeHttp() {
  const calls = [], pending = [];
  const http = (req, cb) => {
    calls.push(req);
    const page = Number(/page=(\d+)/.exec(req.url)[1]);
    const results = Array.from({ length: 20 }, (_, k) => {
      const i = (page - 1) * 20 + k, movie = i % 2 === 0;
      const r = { id: i, mediaType: movie ? 'movie' : 'tv', posterPath: i === 3 ? null : '/s' + i + '.jpg', overview: '' };
      r[movie ? 'title' : 'name'] = (movie ? 'film ' : 'série ') + i;
      r[movie ? 'releaseDate' : 'firstAirDate'] = '2019-05-01';
      if (i === 0) r.mediaInfo = { status: 5 };
      if (i === 1) r.mediaInfo = { status: 2 };
      return r;
    });
    results.push({ id: 999, mediaType: 'person', name: 'Quelqu’un' });
    pending.push(() => cb(null, { status: 200, body: JSON.stringify({ page, totalPages: 3, totalResults: 60, results }) }));
    return { abort() {} };
  };
  return { http, calls, flush: () => pending.splice(0).forEach((f) => f()) };
}

// Ouvre l'accueil, monte sur la pastille, Entrée : la recherche est empilée.
function openSearch() {
  const f = fakeHttp(), doc = fakeDoc(), timers = fakeTimers(), pushed = [];
  const home = U.createOverseerrPanel({ http: f.http, doc, timers, imageBase: 'img/', push: (p) => pushed.push(p), config: () => ({ url: 'https://ov', key: 'k', language: 'fr' }) });
  f.flush();
  f.calls.length = 0;
  assert.equal(home.onKey('up'), true);
  assert.equal(byClass(home.el, 'ov-pill')[0].className, 'ov-pill focus');
  home.onKey('enter');
  assert.equal(pushed.length, 1);
  return { home, p: pushed[0], f, timers };
}
// Tape un texte au clavier à l'écran (disposition ABC : rangées de 10 lettres), touche par touche ; le focus du clavier est suivi d'un appel à l'autre.
const at = new WeakMap();
function type(p, word) {
  const rows = ['abcdefghij', 'klmnopqrst', 'uvwxyz'];
  let [r, c] = at.get(p) || [0, 0];
  for (const ch of word) {
    const nr = rows.findIndex((l) => l.includes(ch)), nc = rows[nr].indexOf(ch);
    while (r < nr) { p.onKey('down'); r++; }
    while (r > nr) { p.onKey('up'); r--; }
    while (c < nc) { p.onKey('right'); c++; }
    while (c > nc) { p.onKey('left'); c--; }
    p.onKey('enter');
  }
  at.set(p, [r, c]);
}

test('le clavier est celui de tv-core, importé et non recopié dans le module Overseerr', () => {
  const src = readFileSync('packages/overseerr/src/ui/search.ts', 'utf8');
  assert.match(src, /from '\.\.\/\.\.\/\.\.\/tv-core\/src\/keyboard'/);
  assert.doesNotMatch(src, /abcdefghij|kb-key/);
});

test('sans push, pas de pastille ; Haut depuis la 1re rangée reste sur place', () => {
  const f = fakeHttp();
  const home = U.createOverseerrPanel({ http: f.http, doc: fakeDoc(), config: () => ({ url: 'https://ov', key: 'k' }) });
  assert.equal(byClass(home.el, 'ov-pill').length, 0);
  home.onKey('up');
  assert.equal(byClass(home.el, 'ov-box')[0].className, 'ov-box on');
});

test('une seule requête après le silence de frappe, pas une par touche ; 1 lettre : rien', () => {
  const { p, f, timers } = openSearch();
  assert.ok(byClass(p.el, 'kb').length === 1, 'clavier tv-core monté');
  type(p, 'a');
  timers.advance(1000);
  assert.equal(f.calls.length, 0, 'une lettre : aucune requête');
  type(p, 'lien');
  timers.advance(399);
  assert.equal(f.calls.length, 0, 'frappe en cours');
  assert.equal(byClass(p.el, 'ovs-note')[0].textContent, 'Recherche…');
  timers.advance(1);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].url, 'https://ov/api/v1/search?page=1&language=fr&query=alien');
});

test('se déplacer sur le clavier relance le silence : pas de requête entre deux lettres lentes', () => {
  const { p, f, timers } = openSearch();
  type(p, 'al');
  timers.advance(300);
  p.onKey('right');          // vers la lettre suivante, lentement
  timers.advance(300);
  p.onKey('right');
  timers.advance(399);
  assert.equal(f.calls.length, 0, 'aucune requête pour « al » tant qu’on se déplace');
  timers.advance(1);
  assert.equal(f.calls.length, 1);
});

test('résultats films et séries mêlés, badges, type et année sous l’affiche w185, grille bornée', () => {
  const { p, f, timers } = openSearch();
  type(p, 'alien');
  timers.advance(400);
  f.flush();
  const tiles = byClass(p.el, 'vtile');
  assert.ok(tiles.length > 0 && tiles.length <= 10, '2 colonnes × (3 lignes + marges) : ' + tiles.length);
  const labels = tiles.map((t) => t.children[1].textContent);
  assert.ok(labels.includes('Film · 2019') && labels.includes('Série · 2019'), labels.join('|'));
  assert.ok(labels.includes('série 3 — Série · 2019'), 'sans affiche : le titre d’abord');
  assert.deepEqual(byClass(p.el, 'vbadge').map((b) => b.textContent + ':' + b.className.split(' ')[1]), ['Disponible:ok', 'En attente:att']);
  const srcs = tiles.map((t) => t.children[0].getAttribute('src')).filter(Boolean);
  assert.ok(srcs.every((s) => /^img\/w185\/s\d+\.jpg$/.test(s)), srcs.join());
  assert.equal(byClass(p.el, 'ovs-note')[0].textContent, '');
});

test('Droite au bord du clavier : vers les résultats ; Gauche en 1re colonne : retour au clavier ; pagination', () => {
  const { p, f, timers } = openSearch();
  type(p, 'alien');
  timers.advance(400);
  f.flush();
  for (let i = 0; i < 10; i++) p.onKey('right');
  assert.equal(byClass(p.el, 'ovs-box')[0].className, 'ovs-box on');
  for (let i = 0; i < 7; i++) p.onKey('down');   // index 1 → 15 ≥ 20 - 6
  assert.equal(f.calls.length, 2);
  assert.match(f.calls[1].url, /search\?page=2&.*query=alien/);
  f.flush();
  p.onKey('left');   // 2e colonne → 1re
  assert.equal(byClass(p.el, 'ovs-box')[0].className, 'ovs-box on');
  p.onKey('left');
  assert.equal(byClass(p.el, 'ovs-box')[0].className, 'ovs-box');
});

test('Retour, du clavier comme des résultats, n’est pas consommé : le routeur ramène à l’accueil Overseerr', () => {
  const { home, p, f, timers } = openSearch();
  assert.equal(p.onKey('back'), false);
  type(p, 'alien');
  timers.advance(400);
  f.flush();
  for (let i = 0; i < 10; i++) p.onKey('right');
  assert.equal(p.onKey('back'), false);
  p.destroy();
  assert.equal(home.onKey('down'), true);
  assert.equal(byClass(home.el, 'ov-box')[0].className, 'ov-box on', 'l’accueil reprend sur la 1re rangée');
});

test('frappe pendant la requête : la réponse dépassée est ignorée ; Valider n’attend pas le silence', () => {
  const { p, f, timers } = openSearch();
  type(p, 'alien');
  timers.advance(400);
  type(p, 's');
  f.flush();
  assert.equal(byClass(p.el, 'vtile').length, 0, 'réponse pour « alien » ignorée : le champ dit « aliens »');
  // Valider : rangée du bas du clavier (focus sur « s », 2e rangée), touche « valider » à droite.
  for (let i = 0; i < 3; i++) p.onKey('down');
  for (let i = 0; i < 3; i++) p.onKey('right');
  p.onKey('enter');
  assert.equal(f.calls.length, 2);
  assert.match(f.calls[1].url, /query=aliens$/);
});
