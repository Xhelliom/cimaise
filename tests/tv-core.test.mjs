import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';

let core, es5Dir;
before(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tvcore-'));
  es5Dir = join(dir, 'es5');
  const t = spawnSync('node_modules/.bin/tsc', ['-p', 'packages/tv-core/tsconfig.json', '--outDir', es5Dir], { encoding: 'utf8' });
  assert.equal(t.status, 0, t.stdout + t.stderr);
  const out = join(dir, 'core.cjs');
  await build({ entryPoints: [join(es5Dir, 'index.js')], bundle: true, format: 'cjs', target: 'es5', outfile: out, logLevel: 'warning' });
  core = createRequire(import.meta.url)(out);
});

test('touches : normalisation flèches, Entrée, Retour, médias', () => {
  const k = (keyCode) => core.normalizeKey({ keyCode });
  assert.deepEqual([37, 38, 39, 40, 13, 10009, 415, 19, 413].map(k),
    ['left', 'up', 'right', 'down', 'enter', 'back', 'play', 'pause', 'stop']);
  assert.equal(k(65), null);
});

test('focus déterministe dans une grille 3 colonnes × 7 éléments', () => {
  const f = new core.Focus(7, 3);
  const run = (...dirs) => dirs.map((d) => { f.move(d); return f.index; });
  assert.deepEqual(run('right', 'right', 'right', 'down', 'left', 'down', 'down', 'up'), [1, 2, 2, 5, 4, 6, 6, 3]);
  assert.equal(f.move('left'), false); // 3 est au bord gauche
});

test('focus : bords refusés, liste à 1 colonne', () => {
  const f = new core.Focus(3, 1);
  assert.equal(f.move('up'), false);
  assert.equal(f.move('left'), false);
  assert.equal(f.move('down'), true);
  assert.equal(f.move('down'), true);
  assert.equal(f.move('down'), false);
  assert.equal(f.index, 2);
});

function memStore(initial) {
  const m = new Map(Object.entries(initial || {}));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}

test('stockage : migre un schéma v0 vers v1', () => {
  const s = memStore({ 'cimaise.v1': JSON.stringify({ layout: 'dock', clock24: true }) });
  assert.deepEqual(core.loadStored(s), { version: 1, prefs: { layout: 'dock', clock24: true } });
  core.saveStored(core.loadStored(s), s);
  assert.equal(JSON.parse(s.getItem('cimaise.v1')).version, 1);
});

test('stockage : vide ou JSON corrompu → v1 vide', () => {
  assert.deepEqual(core.loadStored(memStore()), { version: 1, prefs: {} });
  assert.deepEqual(core.loadStored(memStore({ 'cimaise.v1': '{oops' })), { version: 1, prefs: {} });
});

test('adaptateur : erreur explicite quand tizen est absent', () => {
  globalThis.window = globalThis;
  assert.equal(core.hasTizen(), false);
  assert.throws(() => core.getTizen(), (e) => e instanceof core.DeviceError && e.code === 'NO_TIZEN' && /tizen est absent/.test(e.message));
  assert.throws(() => core.registerKeys(['MediaPlay']), (e) => e.code === 'NO_TIZEN');
  assert.throws(() => core.getWebapis(), (e) => e.code === 'NO_WEBAPIS');
});

test('adaptateur : enregistre les touches via tvinputdevice quand présent', () => {
  const seen = [];
  globalThis.window = globalThis;
  globalThis.tizen = { tvinputdevice: { registerKey: (n) => seen.push(n) } };
  try { core.registerKeys(core.REGISTER_KEYS); } finally { delete globalThis.tizen; }
  assert.deepEqual(seen, core.REGISTER_KEYS);
});

test('diagnostic : horodatages relatifs', () => {
  core.mark('firstPaint');
  assert.match(core.report(), /scriptLoaded: \+0 ms\nfirstPaint: \+\d+ ms/);
});

test('sortie tv-core validée ES5 (bundle minifié)', async () => {
  const out = join(es5Dir, '..', 'core.iife.js');
  await build({ entryPoints: [join(es5Dir, 'index.js')], bundle: true, format: 'iife', globalName: 'core', target: 'es5', minify: true, outfile: out, logLevel: 'warning' });
  const r = spawnSync('node', ['scripts/build/check-es5.mjs', out], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});
