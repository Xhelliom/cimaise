// Fiche Overseerr (packages/overseerr/src/ui/detail.ts) : affiche, année, résumé, badge ; « Demander » → POST /request
// (série : toutes les saisons), badge mis à jour sur la fiche et dans les rangées sans recharger ; erreurs lisibles.
// Transport et DOM factices : aucune demande ne part.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';

let U;
before(async () => {
  const out = join(mkdtempSync(join(tmpdir(), 'ov-detail-')), 'ui.cjs');
  await build({
    stdin: { contents: "export * from './packages/overseerr/src/ui/home'; export * from './packages/overseerr/src/ui/detail'; export { currentAvailability } from './packages/overseerr/src/ui/badge';", resolveDir: process.cwd(), loader: 'ts' },
    bundle: true, format: 'cjs', target: 'es2017', outfile: out, logLevel: 'warning',
  });
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
const one = (n, cls) => byClass(n, cls)[0];

// Transport : chaque requête attend sa réponse (reply), pour voir l'état « Envoi… ».
function fakeHttp() {
  const calls = [];
  const http = (req, cb) => { calls.push({ req, cb }); return { abort() {} }; };
  const reply = (status, body) => calls[calls.length - 1].cb(null, { status, body: JSON.stringify(body) });
  return { http, calls, reply };
}

let n = 1000;
function title(over) {
  return Object.assign({ id: ++n, mediaType: 'movie', title: 'Orbite basse', year: 2026, posterPath: '/af.jpg', overview: 'Une ingénieure reste seule.', availability: 'none' }, over);
}
function open(t, f = fakeHttp()) {
  const p = U.createOverseerrDetailPanel({ http: f.http, doc: fakeDoc(), imageBase: 'img/', title: t, config: () => ({ url: 'https://ov', key: 'SECRET-KEY', language: 'fr' }) });
  return { p, f, root: p.el };
}
const shown = (el) => el.style.display !== 'none';

test('film jamais demandé : affiche w300, type et année, titre, résumé, pas de badge, bouton Demander', () => {
  const { root, f } = open(title());
  assert.equal(one(root, 'ovd-af').getAttribute('src'), 'img/w300/af.jpg');
  assert.equal(one(one(root, 'ovd-col'), 'ov-sur').textContent, 'Film · 2026');
  assert.equal(one(root, 'ovd-h').textContent, 'Orbite basse');
  assert.equal(one(root, 'ovd-r').textContent, 'Une ingénieure reste seule.');
  assert.equal(shown(one(root, 'ovd-b')), false);
  assert.equal(one(root, 'ovd-btn').textContent, 'Demander');
  assert.equal(f.calls.length, 0, 'aucune requête à l’ouverture');
});

test('Demander un film : POST {mediaType, mediaId} sans seasons, une seule demande en vol, badge Demandé', () => {
  const t = title();
  const { p, root, f } = open(t);
  p.onKey('enter');
  assert.equal(f.calls.length, 1);
  const r = f.calls[0].req;
  assert.equal(r.method, 'POST');
  assert.equal(r.url, 'https://ov/api/v1/request');
  assert.deepEqual(JSON.parse(r.body), { mediaType: 'movie', mediaId: t.id });
  assert.equal(one(root, 'ovd-btn').textContent, 'Envoi…');
  p.onKey('enter');
  assert.equal(f.calls.length, 1, 'Entrée pendant l’envoi : rien');
  f.reply(201, { id: 7, status: 2, media: { status: 2 } });   // média encore « en attente » : la demande approuvée tranche
  assert.equal(one(root, 'ovd-b').textContent, 'Demandé');
  assert.match(one(root, 'ovd-b').className, /dem/);
  assert.equal(shown(one(root, 'ovd-btn')), false);
  assert.equal(one(root, 'ovd-note').textContent, 'Demande envoyée');
  p.onKey('enter');
  assert.equal(f.calls.length, 1, 'déjà demandé : Entrée ne renvoie rien');
});

test('Demander une série : toutes les saisons (seasons "all"), dit à l’écran avant et après', () => {
  const t = title({ mediaType: 'tv', title: 'Le Bureau des rêves' });
  const { p, root, f } = open(t);
  assert.equal(one(one(root, 'ovd-col'), 'ov-sur').textContent, 'Série · 2026');
  assert.equal(one(root, 'ovd-note').textContent, 'Toutes les saisons');
  p.onKey('enter');
  assert.deepEqual(JSON.parse(f.calls[0].req.body), { mediaType: 'tv', mediaId: t.id, seasons: 'all' });
  f.reply(201, { id: 8, status: 1, media: { status: 2 } });
  assert.equal(one(root, 'ovd-b').textContent, 'En attente');
  assert.equal(one(root, 'ovd-note').textContent, 'Demande envoyée : toutes les saisons');
});

test('erreurs lisibles, la clé n’apparaît jamais ; réessai possible sauf « déjà demandé »', () => {
  const cases = [
    [401, {}, /Clé API refusée/, true],
    [403, { message: 'quota' }, /droit ou quota/, true],
    [500, {}, /Échec de la demande : HTTP 500/, true],
    [409, { message: 'Request for this media already exists.' }, /^Déjà demandé$/, false],
    [202, { message: 'No seasons available to request' }, /^Déjà demandé$/, false],
  ];
  for (const [status, body, re, retry] of cases) {
    const { p, root, f } = open(title({ mediaType: status === 202 ? 'tv' : 'movie' }));
    p.onKey('enter');
    f.reply(status, body);
    const note = one(root, 'ovd-note').textContent;
    assert.match(note, re, status + ' : ' + note);
    assert.ok(!note.includes('SECRET'), 'clé absente du message');
    assert.equal(shown(one(root, 'ovd-btn')), retry, status + ' : bouton');
    if (retry) { assert.equal(one(root, 'ovd-btn').textContent, 'Demander'); p.onKey('enter'); assert.equal(f.calls.length, 2, 'réessai'); }
    else assert.equal(one(root, 'ovd-b').textContent, 'Demandé');
  }
  const { p, root } = open(title(), { http: (r, cb) => { cb(new Error('réseau')); return { abort() {} }; } });
  p.onKey('enter');
  assert.equal(one(root, 'ovd-note').textContent, 'Overseerr injoignable : réessayer');
});

test('déjà présent : badge et état, pas de bouton, Entrée n’envoie rien ; Retour n’est pas consommé', () => {
  for (const [a, b, note] of [['available', 'Disponible', 'Disponible dans Plex'], ['processing', 'Demandé', 'Demandé, pas encore disponible'], ['pending', 'En attente', 'Demande en attente de validation']]) {
    const { p, root, f } = open(title({ availability: a }));
    assert.equal(one(root, 'ovd-b').textContent, b);
    assert.equal(shown(one(root, 'ovd-btn')), false);
    assert.equal(one(root, 'ovd-note').textContent, note);
    p.onKey('enter');
    assert.equal(f.calls.length, 0);
    assert.equal(p.onKey('back'), false);
  }
});

test('retour aux rangées : le badge de la tuile change sans recharger, y compris pour un autre objet du même titre', () => {
  const doc = fakeDoc(), loads = [];
  let opened = null;
  const results = [{ id: 1, mediaType: 'movie', title: 'Absent', posterPath: '/a.jpg', overview: '' }];
  const home = U.createOverseerrPanel({
    doc, imageBase: 'img/', config: () => ({ url: 'https://ov', key: 'k' }), onOpen: (t) => { opened = t; },
    http: (req, cb) => { loads.push(req.url); cb(null, { status: 200, body: JSON.stringify({ page: 1, totalPages: 1, totalResults: 1, results }) }); return { abort() {} }; },
  });
  const row = one(home.el, 'ov-r1');
  assert.equal(byClass(row, 'vbadge').length, 0);
  home.onKey('enter');
  assert.equal(opened.title, 'Absent');
  const { p, f } = open(opened);
  home.suspend();
  p.onKey('enter');
  f.reply(201, { id: 9, status: 2, media: { status: 3 } });
  home.resume();
  assert.deepEqual(byClass(row, 'vbadge').map((b) => b.textContent), ['Demandé']);
  assert.equal(loads.length, 2, 'aucune page rechargée');
  assert.equal(U.currentAvailability({ id: 1, mediaType: 'movie', availability: 'none' }), 'processing', 'même titre vu ailleurs (recherche)');
  assert.equal(U.currentAvailability({ id: 1, mediaType: 'tv', availability: 'none' }), 'none', 'série de même id TMDB : autre titre');
});
