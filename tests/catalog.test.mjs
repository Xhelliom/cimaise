import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';

let C, dir;
before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'cat-'));
  const es5Dir = join(dir, 'es5');
  const t = spawnSync('node_modules/.bin/tsc', ['-p', 'packages/launcher/tsconfig.json', '--outDir', es5Dir], { encoding: 'utf8' });
  assert.equal(t.status, 0, t.stdout + t.stderr);
  const out = join(dir, 'catalog.cjs');
  await build({ entryPoints: [join(es5Dir, 'launcher/src/catalog/index.js')], bundle: true, format: 'cjs', target: 'es5', outfile: out, logLevel: 'warning' });
  C = createRequire(import.meta.url)(out);
});

const memStore = () => { const m = {}; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, m }; };
const withTizen = (tizen, fn) => { globalThis.window = { tizen }; try { return fn(); } finally { delete globalThis.window; } };
const e = (name, id = '') => ({ id, name, color: '#111111', type: 'tv' });

test('catalogue par défaut : Plex intégré et Overseerr internes, puis 6 apps TV aux IDs vides marqués M0', () => {
  const c = C.defaultCatalog();
  assert.deepEqual(c.map((x) => x.name), ['Plex intégré', 'Overseerr', 'Plex officiel', 'Netflix', 'YouTube', 'Disney+', 'Canal+', 'Smart Hub']);
  assert.equal(c[0].type, 'interne');
  assert.equal(c[1].type, 'interne');
  for (const x of c.slice(2)) {
    assert.equal(x.type, 'tv');
    assert.equal(x.id, '', x.name + ' : aucun ID inventé');
    assert.match(x.todo, /M0/);
  }
});

test('aucun ID d’app TV dans les sources du catalogue (ni recopié de CleanFrame)', () => {
  const src = ['catalog/model.ts', 'catalog/store.ts', 'catalog/defaults.ts'].map((f) => readFileSync('packages/launcher/src/' + f, 'utf8')).join('\n');
  assert.doesNotMatch(src, /org\.tizen|TizenYouTube|netflix-app/i);
  assert.doesNotMatch(src, /['"][A-Za-z0-9]{10}\.[A-Za-z0-9]+['"]/);
});

test('persistance : cimaise.v1, schéma versionné, autres préférences préservées', () => {
  const s = memStore();
  s.setItem('cimaise.v1', JSON.stringify({ version: 1, prefs: { theme: 'x' } }));
  const c = C.defaultCatalog();
  C.saveCatalog(c, s);
  const raw = JSON.parse(s.m['cimaise.v1']);
  assert.equal(raw.prefs.theme, 'x');
  assert.equal(raw.prefs.catalog.version, C.CATALOG_VERSION);
  assert.deepEqual(C.loadCatalog(s), c);
});

test('chargement : stockage vide ou corrompu → catalogue par défaut', () => {
  assert.deepEqual(C.loadCatalog(memStore()), C.defaultCatalog());
  const s = memStore(); s.setItem('cimaise.v1', '{pas du json');
  assert.deepEqual(C.loadCatalog(s), C.defaultCatalog());
});

test('migration : v0 (tableau brut, sans type ni couleur) → v1', () => {
  const m = C.migrateCatalog([{ id: 'a.b', name: 'Vieille' }, { id: '', name: 'Plex intégré', internal: true }, 42]);
  assert.equal(m.version, C.CATALOG_VERSION);
  assert.equal(m.entries.length, 2);
  assert.equal(m.entries[0].type, 'tv');
  assert.match(m.entries[0].color, /^#[0-9a-f]{6}$/i);
  assert.equal(m.entries[0].id, 'a.b');
  const s = memStore();
  s.setItem('cimaise.v1', JSON.stringify({ version: 1, prefs: { catalog: [{ id: 'a.b', name: 'Vieille' }] } }));
  assert.deepEqual(C.loadCatalog(s).map((x) => x.id), ['a.b']);
});

test('ajout d’une app découverte, sans doublon d’ID, sans muter', () => {
  const c = [e('A', 'a.a')];
  const r = C.addApp(c, { id: 'x.y', name: 'Mon app', icon: 'file:///i.png' });
  assert.equal(c.length, 1);
  assert.deepEqual([r[1].id, r[1].name, r[1].icon, r[1].type], ['x.y', 'Mon app', 'file:///i.png', 'tv']);
  assert.match(r[1].color, /^#/);
  assert.equal(C.addApp(r, { id: 'x.y', name: 'Autre' }).length, 2);
  assert.equal(C.addApp(r, { id: '', name: 'Vide' }).length, 2, 'ID vide refusé');
});

test('retrait et réordonnancement (bornes) sans muter', () => {
  const c = [e('A'), e('B'), e('C')];
  const names = (x) => x.map((y) => y.name).join('');
  assert.equal(names(C.removeApp(c, 1)), 'AC');
  assert.equal(names(C.removeApp(c, 9)), 'ABC');
  assert.equal(names(C.moveApp(c, 0, 1)), 'BAC');
  assert.equal(names(C.moveApp(c, 2, -1)), 'ACB');
  assert.equal(names(C.moveApp(c, 0, -1)), 'ABC');
  assert.equal(names(C.moveApp(c, 2, 1)), 'ABC');
  assert.equal(c.length, 3);
});

test('lancement : entrée sans ID → erreur claire, rien n’est appelé', () => {
  let called = 0;
  withTizen({ application: { launch: () => called++ } }, () => {
    assert.throws(() => C.launchEntry(e('Netflix')), (x) => x.code === 'NO_APP_ID' && /Netflix/.test(x.message) && /M0/.test(x.message));
  });
  assert.equal(called, 0);
  assert.throws(() => C.launchEntry({ id: '', name: 'Plex intégré', color: '#111111', type: 'interne' }), (x) => x.code === 'INTERNAL_ENTRY');
});

test('lancement : entrée avec ID → tizen.application.launch', () => {
  const seen = [];
  withTizen({ application: { launch: (id, ok) => { seen.push(id); ok(); } } }, () => C.launchEntry(e('X', 'z.z'), () => seen.push('ok')));
  assert.deepEqual(seen, ['z.z', 'ok']);
});

test('découverte jamais appelée au démarrage (défaut, chargement, sauvegarde, ajout)', () => {
  let discovered = 0;
  const tizen = { application: { getAppsInfo: () => discovered++, launch: () => {} } };
  withTizen(tizen, () => {
    const s = memStore();
    let c = C.loadCatalog(s);
    C.saveCatalog(c, s);
    c = C.addApp(C.moveApp(C.removeApp(c, 0), 0, 1), { id: 'a.b', name: 'N' });
    C.loadCatalog(s);
  });
  assert.equal(discovered, 0);
  const src = readFileSync('packages/launcher/src/catalog/store.ts', 'utf8') + readFileSync('packages/launcher/src/catalog/model.ts', 'utf8');
  assert.doesNotMatch(src, /listInstalledApps/);
});
