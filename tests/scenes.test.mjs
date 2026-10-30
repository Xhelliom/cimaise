import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';

let W;
before(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'scenes-'));
  const es5 = join(dir, 'es5');
  const t = spawnSync('node_modules/.bin/tsc', ['-p', 'packages/widgets/tsconfig.json', '--outDir', es5], { encoding: 'utf8' });
  assert.equal(t.status, 0, t.stdout + t.stderr);
  const out = join(dir, 'w.cjs');
  await build({ entryPoints: [join(es5, 'widgets/src/index.js')], bundle: true, format: 'cjs', target: 'es5', outfile: out, logLevel: 'warning' });
  W = createRequire(import.meta.url)(out);
});

const S = (id, name, area) => ({ id: 'scene.' + id, name, area: area || null });
const ALL = [S('film', 'Film', 'Salon'), S('diner', 'Dîner', 'Cuisine'), S('lecture', 'Lecture', 'Salon'), S('nuit', 'Nuit'), S('ete', 'Été', 'Cuisine')];

test('choix : identifiants valides, uniques, 6 au plus', () => {
  assert.deepEqual(W.normalizeChosen(['scene.a', 'scene.a', 'light.x', 3, 'scene.b']), ['scene.a', 'scene.b']);
  assert.deepEqual(W.normalizeChosen(undefined), []);
  assert.equal(W.normalizeChosen(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((x) => 'scene.' + x)).length, 6);
  let c = [];
  for (const x of 'abcdefg') c = W.addChosen(c, 'scene.' + x);
  assert.equal(c.length, 6, 'la 7e est refusée');
  assert.deepEqual(W.addChosen(['scene.a'], 'scene.a'), ['scene.a']);
});

test('ordre : déplacer (bornes sans effet) et retirer sans muter', () => {
  const c = ['scene.a', 'scene.b', 'scene.c'];
  assert.deepEqual(W.moveChosen(c, 0, 1), ['scene.b', 'scene.a', 'scene.c']);
  assert.deepEqual(W.moveChosen(c, 0, -1), c);
  assert.deepEqual(W.moveChosen(c, 2, 1), c);
  assert.deepEqual(W.removeChosen(c, 'scene.b'), ['scene.a', 'scene.c']);
  assert.equal(c.length, 3);
});

test('pièces triées, filtre par pièce et par lettres (sans casse ni accents)', () => {
  assert.deepEqual(W.areasOf(ALL), ['Cuisine', 'Salon']);
  assert.deepEqual(W.filterScenes(ALL, null, '').map((s) => s.name), ['Dîner', 'Été', 'Film', 'Lecture', 'Nuit']);
  assert.deepEqual(W.filterScenes(ALL, 'Salon', '').map((s) => s.name), ['Film', 'Lecture']);
  assert.deepEqual(W.filterScenes(ALL, null, 'DINER').map((s) => s.name), ['Dîner']);
  assert.deepEqual(W.filterScenes(ALL, null, 'ete').map((s) => s.name), ['Été']);
  assert.deepEqual(W.filterScenes(ALL, 'Cuisine', 'e').map((s) => s.name), ['Dîner', 'Été']);
  assert.deepEqual(W.filterScenes(ALL, 'Salon', 'zz'), []);
});

test('résolution : ordre choisi, scène disparue omise', () => {
  assert.deepEqual(W.resolveChosen(['scene.nuit', 'scene.perdue', 'scene.film'], ALL).map((s) => s.name), ['Nuit', 'Film']);
});

test('accueil : non configuré, aucune scène choisie ou Home Assistant coupé → aucune scène, jamais d’erreur', () => {
  const calls = [];
  const down = (req, cb) => { calls.push(req.url); cb(new Error('réseau')); };
  const run = (prefs, http) => { let got; W.quickScenes(http, prefs, (s) => { got = s; }); return got; };
  assert.deepEqual(run({}, down), []);
  assert.deepEqual(run({ haUrl: 'http://ha:8123', haToken: 't' }, down), [], 'rien de choisi : pas même une requête');
  assert.equal(calls.length, 0);
  assert.deepEqual(run({ haUrl: 'http://ha:8123', haToken: 't', haScenes: ['scene.film'] }, down), [], 'injoignable');
  assert.equal(calls.length, 1);
  const refused = (req, cb) => cb(null, { status: 401, body: '' });
  assert.deepEqual(run({ haUrl: 'http://ha:8123', haToken: 'x', haScenes: ['scene.film'] }, refused), [], 'jeton refusé');
  const ok = (req, cb) => cb(null, req.method === 'GET'
    ? { status: 200, body: JSON.stringify([{ entity_id: 'scene.film', attributes: { friendly_name: 'Film' } }, { entity_id: 'scene.nuit', attributes: {} }]) }
    : { status: 200, body: '[null, null]' });
  assert.deepEqual(run({ haUrl: 'http://ha:8123', haToken: 't', haScenes: ['scene.nuit', 'scene.film'] }, ok).map((s) => s.id), ['scene.nuit', 'scene.film']);
});

test('préférences : adresse, jeton et scènes dans cimaise.v1', () => {
  const mem = {};
  const store = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = v; } };
  W.saveHaConfig('http://ha:8123', 'tok', store);
  W.saveHaScenes(['scene.film', 'x', 'scene.nuit'], store);
  const p = JSON.parse(mem['cimaise.v1']).prefs;
  assert.deepEqual([p.haUrl, p.haToken, p.haScenes], ['http://ha:8123', 'tok', ['scene.film', 'scene.nuit']]);
});

test('countByArea et groupByArea : indisponibles ignorées, groupes par pièce, « sans pièce » en dernier', async () => {
  const { build } = await import('esbuild');
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { createRequire } = await import('node:module');
  const out = join(mkdtempSync(join(tmpdir(), 'scn-')), 's.cjs');
  await build({ entryPoints: ['packages/widgets/src/scenes.ts'], bundle: true, format: 'cjs', outfile: out, logLevel: 'silent' });
  const M = createRequire(import.meta.url)(out);
  const L = [
    { id: 'scene.a', name: 'A', area: 'Salon' }, { id: 'scene.b', name: 'B', area: 'Salon', state: 'unavailable' },
    { id: 'scene.c', name: 'C', area: 'Cuisine' }, { id: 'scene.d', name: 'D', area: null },
  ];
  assert.deepEqual(M.countByArea(L), { total: 3, byArea: { Salon: 1, Cuisine: 1 } });
  assert.deepEqual(M.groupByArea(L).map((g) => [g.area, g.scenes.length]), [['Cuisine', 1], ['Salon', 2], [null, 1]]);
  assert.deepEqual(M.filterScenes(L, null, '').map((s) => s.id), ['scene.a', 'scene.c', 'scene.d']);
});
