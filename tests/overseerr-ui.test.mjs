// Écran Overseerr (packages/overseerr/src/ui/home.ts) : deux rangées « du moment », pagination au fil du focus, doublons
// écartés, badges, affiches w185, DOM borné, images libérées en quittant l'écran. Transport et DOM factices.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';

let U;
before(async () => {
  const out = join(mkdtempSync(join(tmpdir(), 'ov-ui-')), 'ui.cjs');
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

// 20 titres par page ; la page 2 reprend 2 titres de la page 1 (comme TMDB). Le 1er film est disponible, le 2e demandé.
function result(type, i) {
  const r = { id: i, mediaType: type, posterPath: i % 7 === 6 ? null : '/p' + i + '.jpg', overview: '' };
  r[type === 'movie' ? 'title' : 'name'] = type + ' ' + i;
  if (i === 1) r.mediaInfo = { status: 5 };
  if (i === 2) r.mediaInfo = { status: 3 };
  if (i === 3) r.mediaInfo = { status: 2 };
  return r;
}
function fakeHttp() {
  const calls = [], pending = [];
  const http = (req, cb) => {
    calls.push(req);
    const m = /discover\/(movies|tv)\?page=(\d+)/.exec(req.url), type = m[1] === 'movies' ? 'movie' : 'tv', page = Number(m[2]);
    const start = page === 1 ? 1 : (page - 1) * 20 - 1;
    const results = Array.from({ length: 20 }, (_, k) => result(type, start + k));
    pending.push(() => cb(null, { status: 200, body: JSON.stringify({ page, totalPages: 3, totalResults: 60, results }) }));
    return { abort() {} };
  };
  return { http, calls, flush: () => pending.splice(0).forEach((f) => f()) };
}

function open() {
  const f = fakeHttp(), doc = fakeDoc();
  const p = U.createOverseerrPanel({ http: f.http, doc, imageBase: 'img/', config: () => ({ url: 'https://ov', key: 'k', language: 'fr' }) });
  return { p, f, root: p.el };
}

test('ouverture : une page de films et une de séries, en français, clé dans l’en-tête', () => {
  const { f, root } = open();
  assert.deepEqual(f.calls.map((c) => c.url), ['https://ov/api/v1/discover/movies?page=1&language=fr', 'https://ov/api/v1/discover/tv?page=1&language=fr']);
  assert.equal(f.calls[0].headers['X-Api-Key'], 'k');
  assert.deepEqual(byClass(root, 'ov-t').map((t) => t.textContent), ['Films du moment', 'Séries du moment']);
  assert.equal(byClass(root, 'ov-st')[0].textContent, 'Chargement…');
  f.flush();
  assert.equal(byClass(root, 'ov-st')[0].textContent, '');
});

test('affiches w185 aux visibles seulement, nom à la place d’une affiche absente, DOM borné', () => {
  const { f, root } = open();
  f.flush();
  const tiles = byClass(byClass(root, 'ov-r1')[0], 'vtile');
  assert.ok(tiles.length <= 9, 'au plus 6 visibles + marges : ' + tiles.length);
  const srcs = tiles.map((t) => t.children[0].getAttribute('src')).filter(Boolean);
  assert.ok(srcs.length > 0 && srcs.every((s) => /^img\/w185\/p\d+\.jpg$/.test(s)), srcs.join());
  const noPoster = tiles.find((t) => !t.children[0].getAttribute('data-src'));
  assert.equal(noPoster.children[1].textContent, 'movie 6', 'sans affiche : le titre');
});

test('badges : Disponible, Demandé, En attente ; rien pour un titre jamais demandé', () => {
  const { f, root } = open();
  f.flush();
  const row = byClass(root, 'ov-r1')[0];
  assert.deepEqual(byClass(row, 'vbadge').map((b) => b.textContent + ':' + b.className.split(' ')[1]), ['Disponible:ok', 'Demandé:dem', 'En attente:att']);
  assert.equal(U.badgeFor('none'), null);
});

test('pagination : la page suivante est demandée en approchant de la fin, une seule fois, doublons écartés', () => {
  const { p, f } = open();
  f.flush();
  for (let i = 0; i < 11; i++) p.onKey('right');
  assert.equal(f.calls.length, 2, 'loin de la fin : rien');
  p.onKey('right'); // index 12 ≥ 20 - 8
  p.onKey('right');
  assert.equal(f.calls.length, 3, 'une seule requête en vol');
  assert.match(f.calls[2].url, /movies\?page=2/);
  f.flush();
  for (let i = 0; i < 30; i++) p.onKey('right');
  assert.match(f.calls[3].url, /movies\?page=3/);
  f.flush();
  for (let i = 0; i < 40; i++) p.onKey('right');
  assert.equal(f.calls.length, 4, 'dernière page atteinte : plus de requête');
});

test('Haut / Bas changent de rangée ; Retour n’est pas consommé ; quitter libère les images', () => {
  const { p, f, root } = open();
  f.flush();
  p.onKey('down');
  assert.equal(byClass(root, 'ov-box').map((b) => b.className).join('|'), 'ov-box|ov-box on');
  assert.equal(p.onKey('back'), false);
  p.suspend();
  assert.equal(all(root).filter((n) => n.tag === 'img' && n.getAttribute('src')).length, 0);
  p.resume();
  assert.ok(all(root).filter((n) => n.tag === 'img' && n.getAttribute('src')).length > 0);
});

test('Overseerr non configuré ou injoignable : message à la place des rangées', () => {
  const doc = fakeDoc();
  const p = U.createOverseerrPanel({ http: () => assert.fail('aucune requête sans configuration'), doc, config: () => null });
  assert.match(byClass(p.el, 'ov-st')[0].textContent, /non configuré/);
  const q = U.createOverseerrPanel({ http: (r, cb) => { cb(new Error('réseau')); return { abort() {} }; }, doc, config: () => ({ url: 'https://ov', key: 'k' }) });
  assert.match(byClass(q.el, 'ov-st')[0].textContent, /injoignable/);
});
