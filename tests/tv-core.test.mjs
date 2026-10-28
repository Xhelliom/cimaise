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

// --- routeur à pile de panneaux (DOM factice : seuls appendChild/removeChild/parentNode servent) ---
function fakeEl(name) {
  const el = { name, parentNode: null, children: [] };
  el.appendChild = (c) => { if (c.parentNode) c.parentNode.removeChild(c); c.parentNode = el; el.children.push(c); return c; };
  el.removeChild = (c) => { el.children.splice(el.children.indexOf(c), 1); c.parentNode = null; return c; };
  return el;
}
function fakePanel(name, log) {
  return {
    el: fakeEl(name),
    onKey: (k) => { log.push(name + ':' + k); return k === 'enter'; },
    suspend: () => log.push(name + ':suspend'),
    resume: () => log.push(name + ':resume'),
    destroy: () => log.push(name + ':destroy')
  };
}
function mkRouter() {
  const root = fakeEl('root'), log = [], exits = [];
  const confirmPanel = { el: fakeEl('confirm'), onKey: (k) => { log.push('confirm:' + k); return true; }, destroy: () => log.push('confirm:destroy') };
  const router = new core.Router({ root, exit: () => exits.push(1), createExitConfirm: (ctx) => { confirmPanel.ctx = ctx; return confirmPanel; } });
  return { root, log, exits, router, confirmPanel };
}

test('routeur : push/pop, seul le panneau du dessus est dans le DOM', () => {
  const { root, log, router } = mkRouter();
  const a = fakePanel('a', log), b = fakePanel('b', log);
  router.push(a);
  assert.deepEqual(root.children, [a.el]);
  router.push(b);
  assert.deepEqual(root.children, [b.el]);
  assert.equal(a.el.parentNode, null);
  assert.equal(router.depth, 2);
  assert.deepEqual(log, ['a:suspend']);
  router.pop();
  assert.deepEqual(root.children, [a.el]);
  assert.equal(b.el.parentNode, null);
  assert.deepEqual(log, ['a:suspend', 'b:destroy', 'a:resume']);
  assert.equal(router.depth, 1);
});

test('routeur : les touches vont au panneau du dessus ; Retour dépile', () => {
  const { log, router } = mkRouter();
  router.push(fakePanel('a', log));
  router.push(fakePanel('b', log));
  assert.equal(router.handleKey('left'), false);
  assert.equal(router.handleKey('enter'), true);
  assert.deepEqual(log.filter((l) => /:(left|enter)$/.test(l)), ['b:left', 'b:enter']);
  assert.equal(router.handleKey('back'), true);
  assert.equal(router.depth, 1);
  assert.ok(log.includes('b:destroy'));
});

test('routeur : un panneau peut consommer Retour lui-même', () => {
  const { log, router } = mkRouter();
  const a = fakePanel('a', log), b = fakePanel('b', log);
  b.onKey = (k) => k === 'back';
  router.push(a); router.push(b);
  router.handleKey('back');
  assert.equal(router.depth, 2);
});

test('routeur : Retour à la racine ouvre la confirmation, sans quitter', () => {
  const { root, log, router, exits, confirmPanel } = mkRouter();
  const a = fakePanel('a', log);
  router.push(a);
  assert.equal(router.handleKey('back'), true);
  assert.equal(exits.length, 0);
  assert.deepEqual(root.children, [confirmPanel.el]);
  assert.equal(router.depth, 2);
  // Retour dans la confirmation : elle est fermée, on retrouve la racine
  confirmPanel.onKey = undefined;
  router.handleKey('back');
  assert.deepEqual(root.children, [a.el]);
  assert.equal(exits.length, 0);
  // la confirmation peut déclencher la sortie via le contexte
  router.handleKey('back');
  confirmPanel.ctx.confirm();
  assert.equal(exits.length, 1);
});

test('routeur : pile vide → Retour ne fait rien de fatal', () => {
  const { router, exits } = mkRouter();
  assert.equal(router.handleKey('back'), true);
  assert.equal(exits.length, 0);
});

test('routeur : replace remplace le sommet et libère l’ancien', () => {
  const { root, log, router } = mkRouter();
  const a = fakePanel('a', log), b = fakePanel('b', log);
  router.push(a); router.replace(b);
  assert.deepEqual(root.children, [b.el]);
  assert.equal(router.depth, 1);
  assert.ok(log.includes('a:destroy'));
});

test('chargement différé : un seul chargement, partagé, rappelé depuis le cache', () => {
  let calls = 0, finish;
  const mod = core.lazy((done) => { calls++; finish = done; });
  const got = [];
  mod.get((m) => got.push(['1', m]));
  mod.get((m) => got.push(['2', m]));
  assert.equal(calls, 1);
  assert.equal(mod.loaded, false);
  finish({ x: 1 });
  assert.deepEqual(got, [['1', { x: 1 }], ['2', { x: 1 }]]);
  mod.get((m) => got.push(['3', m]));
  assert.equal(calls, 1);
  assert.equal(mod.loaded, true);
  assert.deepEqual(got[2], ['3', { x: 1 }]);
});

test('chargement différé : un échec est signalé puis le chargement peut être retenté', () => {
  let calls = 0;
  const mod = core.lazy((done, fail) => { calls++; if (calls === 1) fail(new Error('réseau')); else done('ok'); });
  const errs = [];
  mod.get(() => assert.fail('ne doit pas réussir'), (e) => errs.push(e.message));
  assert.deepEqual(errs, ['réseau']);
  let v;
  mod.get((m) => { v = m; });
  assert.equal(v, 'ok');
  assert.equal(calls, 2);
});

test('routeur : pushLazy charge le module à la première ouverture seulement', () => {
  const { root, log, router } = mkRouter();
  let loads = 0;
  const mod = core.lazy((done) => { loads++; done({ build: () => fakePanel('plex', log) }); });
  router.push(fakePanel('home', log));
  assert.equal(loads, 0);
  router.pushLazy(mod, (m) => m.build());
  assert.equal(loads, 1);
  assert.equal(root.children[0].name, 'plex');
  router.pop();
  router.pushLazy(mod, (m) => m.build());
  assert.equal(loads, 1);
});

test('routeur : si le module échoue, la pile reste inchangée et onError est appelé', () => {
  const { root, log, router } = mkRouter();
  const home = fakePanel('home', log);
  router.push(home);
  const mod = core.lazy((done, fail) => fail(new Error('boom')));
  let err;
  router.pushLazy(mod, () => fakePanel('x', log), (e) => { err = e; });
  assert.equal(err.message, 'boom');
  assert.deepEqual(root.children, [home.el]);
  assert.equal(router.depth, 1);
});

test('device.exitApp passe par tizen.application', () => {
  let exited = 0;
  globalThis.window = { tizen: { application: { getCurrentApplication: () => ({ exit: () => exited++ }) } } };
  try { core.exitApp(); } finally { delete globalThis.window; }
  assert.equal(exited, 1);
});
