// Registre des modules intégrés (packages/launcher/src/modules) : défauts, activation, filtrage du catalogue, migration v3 → v4.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';

let M, core;
before(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'modules-'));
  const es5 = join(dir, 'es5');
  const t = spawnSync('node_modules/.bin/tsc', ['-p', 'packages/launcher/tsconfig.json', '--outDir', es5], { encoding: 'utf8' });
  assert.equal(t.status, 0, t.stdout + t.stderr);
  const out = join(dir, 'modules.cjs');
  await build({ entryPoints: [join(es5, 'launcher/src/modules/index.js')], bundle: true, format: 'cjs', target: 'es5', outfile: out, logLevel: 'warning' });
  M = createRequire(import.meta.url)(out);
  const out2 = join(dir, 'core.cjs');
  await build({ entryPoints: [join(es5, 'tv-core/src/storage.js')], bundle: true, format: 'cjs', target: 'es5', outfile: out2, logLevel: 'warning' });
  core = createRequire(import.meta.url)(out2);
});

const memStore = (init = {}) => { const m = { ...init }; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = v; } }; };
const PLEX = { id: 'plex', name: 'Plex intégré', color: '#e5a00d', type: 'interne' };
const NF = { id: 'nf', name: 'Netflix', color: '#e50914', type: 'tv' };

test('registre : chaque module déclare id, nom, chunk, section de réglages et condition « configuré »', () => {
  const ids = M.MODULES.map((m) => m.id);
  assert.deepEqual(ids, ['plex', 'scenes', 'overseerr']);
  for (const m of M.MODULES) {
    assert.equal(typeof m.name, 'string');
    assert.equal(typeof m.configured, 'function');
    assert.ok('tileId' in m && 'chunk' in m && 'settings' in m);
  }
  assert.equal(M.moduleById('plex').tileId, 'plex');
  assert.equal(M.moduleById('plex').chunk, 'plex');
  assert.equal(M.moduleById('overseerr').tileId, 'overseerr');
  assert.equal(M.moduleById('scenes').tileId, null, 'les scènes sont une rangée, pas une tuile');
  assert.equal(M.moduleById('nope'), null);
});

test('défauts : Plex activé ; Scènes seulement si Home Assistant est configuré ; choix explicite prioritaire', () => {
  assert.equal(M.moduleEnabled('plex', {}), true);
  assert.equal(M.moduleEnabled('scenes', {}), false);
  assert.equal(M.moduleEnabled('scenes', { haUrl: 'http://ha', haToken: '' }), false);
  assert.equal(M.moduleEnabled('scenes', { haUrl: 'http://ha', haToken: 't' }), true);
  assert.equal(M.moduleEnabled('scenes', { haUrl: 'http://ha', haToken: 't', modules: { scenes: false } }), false);
  assert.equal(M.moduleEnabled('scenes', { modules: { scenes: true } }), true);
  assert.equal(M.moduleEnabled('overseerr', {}), false, 'Overseerr masqué tant que non configuré');
  assert.equal(M.moduleEnabled('overseerr', { overseerrUrl: 'https://ov', overseerrKey: '' }), false);
  assert.equal(M.moduleEnabled('overseerr', { overseerrUrl: 'https://ov', overseerrKey: 'k' }), true);
  assert.equal(M.moduleEnabled('overseerr', { overseerrUrl: 'https://ov', overseerrKey: 'k', modules: { overseerr: false } }), false);
  assert.equal(M.moduleEnabled('plex', { modules: { plex: false } }), false);
  assert.equal(M.moduleEnabled('inconnu', {}), false);
});

test('masquer puis réactiver chaque module : persisté dans cimaise.v1', () => {
  const s = memStore();
  for (const m of M.MODULES) {
    M.setModuleEnabled(m.id, false, s);
    assert.equal(M.moduleEnabled(m.id, core.loadStored(s).prefs), false, m.id + ' masqué');
    M.setModuleEnabled(m.id, true, s);
    assert.equal(M.moduleEnabled(m.id, core.loadStored(s).prefs), true, m.id + ' réactivé');
  }
  assert.equal(core.loadStored(s).version, 4);
});

test('catalogue : un module masqué n’a plus de tuile, ses réglages (entrée) restent mémorisés', () => {
  const full = [PLEX, NF];
  assert.deepEqual(M.visibleCatalog(full, {}).map((e) => e.id), ['plex', 'nf']);
  const hidden = { modules: { plex: false } };
  assert.deepEqual(M.visibleCatalog(full, hidden).map((e) => e.id), ['nf']);
  assert.equal(full.length, 2, 'entrée non mutée');
  // Les Réglages renvoient le catalogue visible modifié : l’entrée masquée n’est pas perdue.
  assert.deepEqual(M.mergeHidden(full, [NF], hidden).map((e) => e.id), ['nf', 'plex']);
  assert.deepEqual(M.mergeHidden(full, [NF], {}).map((e) => e.id), ['nf'], 'module actif retiré du visible : retiré');
});

test('catalogue : retirer la tuile d’un module depuis la liste l’affiche comme masqué', () => {
  assert.deepEqual(M.removedModules([PLEX, NF], [NF]), ['plex']);
  assert.deepEqual(M.removedModules([PLEX, NF], [PLEX]), []);
  assert.deepEqual(M.removedModules([NF], [NF]), []);
});

test('réactiver : la tuile absente du catalogue revient en tête, sans doublon', () => {
  assert.deepEqual(M.ensureTile([NF], 'plex').map((e) => e.id), ['plex', 'nf']);
  assert.deepEqual(M.ensureTile([PLEX, NF], 'plex').map((e) => e.id), ['plex', 'nf']);
  assert.deepEqual(M.ensureTile([NF], 'scenes').map((e) => e.id), ['nf'], 'module sans tuile');
});

test('tuile d’un module arrivé après le catalogue : ajoutée si le module est activé et qu’elle manque, jamais retirée', () => {
  const OV = { overseerrUrl: 'https://ov', overseerrKey: 'k' };
  assert.deepEqual(M.addNewTiles([PLEX, NF], OV).map((e) => e.id), ['overseerr', 'plex', 'nf']);
  assert.equal(M.addNewTiles([PLEX, NF], {}), null, 'Overseerr non configuré : rien');
  assert.equal(M.addNewTiles([PLEX, NF], { ...OV, modules: { overseerr: false } }), null, 'masqué (tuile retirée) : ne revient pas');
  const withOv = M.addNewTiles([PLEX, NF], OV);
  assert.equal(M.addNewTiles(withOv, OV), null, 'déjà là : rien');
  assert.equal(M.addNewTiles([NF], { modules: { plex: false } }), null, 'Plex masqué : pas de retour');
});

test('migration v3 → v4 : une tuile Plex déjà retirée du catalogue devient « masqué » ; sinon rien ne change', () => {
  const v3 = (prefs) => memStore({ 'cimaise.v1': JSON.stringify({ version: 3, prefs }) });
  const removed = core.loadStored(v3({ catalog: { version: 1, entries: [NF] } }));
  assert.equal(removed.version, 4);
  assert.deepEqual(removed.prefs.modules, { plex: false });
  const kept = core.loadStored(v3({ catalog: { version: 1, entries: [PLEX, NF] } }));
  assert.equal(kept.prefs.modules, undefined);
  const fresh = core.loadStored(v3({ homeTiles: 5 }));
  assert.equal(fresh.prefs.modules, undefined, 'catalogue par défaut : Plex activé');
  assert.equal(fresh.prefs.homeTiles, 5);
  // Une chaîne complète depuis v0 aboutit aussi à la v4.
  assert.equal(core.loadStored(memStore({ 'cimaise.v1': JSON.stringify({ layout: 'dock' }) })).version, 4);
});
