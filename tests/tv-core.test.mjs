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

test('stockage : migre un schéma v0 vers la version courante (tuiles à 4 par défaut)', () => {
  const s = memStore({ 'cimaise.v1': JSON.stringify({ layout: 'dock', clock24: true }) });
  assert.deepEqual(core.loadStored(s), { version: 3, prefs: { layout: 'dock', clock24: true, homeTiles: 4 } });
  core.saveStored(core.loadStored(s), s);
  assert.equal(JSON.parse(s.getItem('cimaise.v1')).version, 3);
});

test('stockage : migre un schéma v1 vers v2 sans toucher aux préférences existantes', () => {
  const s = memStore({ 'cimaise.v1': JSON.stringify({ version: 1, prefs: { homeMode: 'rangee', plexToken: 'T' } }) });
  assert.deepEqual(core.loadStored(s), { version: 3, prefs: { homeMode: 'rangee', plexToken: 'T', homeTiles: 4 } });
  const kept = memStore({ 'cimaise.v1': JSON.stringify({ version: 1, prefs: { homeTiles: 6 } }) });
  assert.equal(core.loadStored(kept).prefs.homeTiles, 6, 'une valeur déjà présente est conservée');
});

test('stockage : vide ou JSON corrompu → version courante vide', () => {
  assert.deepEqual(core.loadStored(memStore()), { version: 3, prefs: {} });
  assert.deepEqual(core.loadStored(memStore({ 'cimaise.v1': '{oops' })), { version: 3, prefs: {} });
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

test('device.launchApp : launch, repli launchAppControl, erreurs explicites', () => {
  globalThis.window = {};
  try {
    assert.throws(() => core.launchApp('a.b'), (e) => e.code === 'NO_TIZEN');
    assert.throws(() => core.listInstalledApps(() => {}), (e) => e.code === 'NO_TIZEN');
  } finally { delete globalThis.window; }
  const calls = [];
  const app = {
    launch: (id, ok, err) => { calls.push('launch:' + id); err({ message: 'refus' }); },
    launchAppControl: (ctl, id, ok) => { calls.push('control:' + id); ok(); },
  };
  globalThis.window = { tizen: { application: app, ApplicationControl: function (op) { this.operation = op; } } };
  try {
    assert.throws(() => core.launchApp(''), (e) => e.code === 'NO_APP_ID');
    core.launchApp('a.b', () => calls.push('ok'), () => calls.push('ko'));
    assert.deepEqual(calls, ['launch:a.b', 'control:a.b', 'ok']);
    app.launchAppControl = (ctl, id, ok, err) => err({ message: 'non' });
    let failed = null;
    core.launchApp('a.b', () => {}, (e) => { failed = e; });
    assert.equal(failed.code, 'LAUNCH_FAILED');
  } finally { delete globalThis.window; }
});

test('device.listInstalledApps : id, nom, icône via getAppsInfo', () => {
  globalThis.window = { tizen: { application: {
    getAppsInfo: (ok) => ok([{ id: 'a.b', name: 'A', iconPath: 'file:///a.png', extra: 1, show: true }, { id: 'c.d', name: 'C', show: true }, { id: 'svc', name: 'B', show: false }]),
  } } };
  try {
    let got = null;
    core.listInstalledApps((l) => { got = l; });
    assert.deepEqual(got, [{ id: 'a.b', name: 'A', icon: 'file:///a.png' }, { id: 'c.d', name: 'C', icon: undefined }]);
    globalThis.window.tizen.application.getAppsInfo = (ok, err) => err({ message: 'x' });
    let failed = null;
    core.listInstalledApps(() => {}, (e) => { failed = e; });
    assert.equal(failed.code, 'LIST_FAILED');
  } finally { delete globalThis.window; }
});

test('device.listInstalledApps : 300 entrées, seules les apps visibles, triées par nom', () => {
  const raw = Array.from({ length: 300 }, (_, i) => ({ id: 'x.' + i, name: i % 10 === 0 ? 'app ' + i : 'Svc ' + i, show: i % 10 === 0 }));
  raw.push({ id: 'z.z', name: 'Zèbre', show: true }, { id: 'a.a', name: 'Alpha', show: true }, { id: 'n.n', name: 'Noshow' });
  globalThis.window = { tizen: { application: { getAppsInfo: (ok) => ok(raw) } } };
  try {
    let got = null;
    core.listInstalledApps((l) => { got = l; });
    assert.equal(got.length, 32);
    assert.ok(got.every((a) => a.id.startsWith('x.') ? Number(a.id.slice(2)) % 10 === 0 : ['z.z', 'a.a'].includes(a.id)));
    const names = got.map((a) => a.name.toLowerCase());
    assert.deepEqual(names, names.slice().sort());
    assert.equal(got[0].name, 'Alpha');
  } finally { delete globalThis.window; }
});

test('icônes : un chemin absolu sans schéma est essayé en file:// puis tel quel', () => {
  assert.deepEqual(core.iconCandidates('/opt/usr/apps/x/icon.png'), ['file:///opt/usr/apps/x/icon.png', '/opt/usr/apps/x/icon.png']);
  assert.deepEqual(core.iconCandidates('file:///a.png'), ['file:///a.png']);
  assert.deepEqual(core.iconCandidates('http://h/a.png'), ['http://h/a.png']);
  assert.deepEqual(core.iconCandidates('res/a.png'), ['res/a.png']);
  assert.deepEqual(core.iconCandidates(''), []);
});

function iconDoc() {
  return { createElement: () => {
    const img = { attrs: {}, parentNode: null, setAttribute(k, v) { this.attrs[k] = v; } };
    return img;
  } };
}
function iconTile() {
  const t = { children: [], textContent: '' };
  t.appendChild = (c) => { c.parentNode = t; t.children.push(c); };
  t.removeChild = (c) => { t.children.splice(t.children.indexOf(c), 1); c.parentNode = null; };
  return t;
}

test('icônes : repli sur la variante suivante, résultat dans le diagnostic', () => {
  core.resetIcons();
  const tile = iconTile();
  core.applyIcon(iconDoc(), tile, '/opt/a.png', 'Netflix', 'N');
  const img = tile.children[0];
  assert.equal(img.attrs.src, 'file:///opt/a.png');
  img.onerror();
  assert.equal(img.attrs.src, '/opt/a.png');
  img.onload();
  assert.match(core.iconReport(), /Netflix \[ok\] \/opt\/a\.png(\n|$)/);
  const t2 = iconTile();
  core.applyIcon(iconDoc(), t2, '/opt/b.png', 'Plex', 'P');
  t2.children[0].onload();
  assert.match(core.iconReport(), /Plex \[ok\] \/opt\/b\.png -> file:\/\/\/opt\/b\.png/);
  assert.equal(tile.textContent, '');
});

test('icônes : illisible -> image retirée, monogramme affiché, échec tracé', () => {
  core.resetIcons();
  const tile = iconTile();
  core.applyIcon(iconDoc(), tile, 'file:///x.png', 'YouTube', 'Y');
  tile.children[0].onerror();
  assert.equal(tile.children.length, 0);
  assert.equal(tile.textContent, 'Y');
  assert.match(core.iconReport(), /YouTube \[échec\] file:\/\/\/x\.png/);
  const vide = iconTile();
  core.applyIcon(iconDoc(), vide, '', 'Z', 'Z');
  assert.equal(vide.textContent, 'Z');
});

test('icônes : pas de doublon après plusieurs rendus, iconPath vide tracé', () => {
  core.resetIcons();
  for (let i = 0; i < 5; i++) core.applyIcon(iconDoc(), iconTile(), '/opt/dup.png', 'Dup', 'D');
  assert.equal(core.iconReport().split('\n').filter((l) => l.startsWith('Dup ')).length, 1);
  const t = iconTile();
  core.applyIcon(iconDoc(), t, '', 'SansIcone', 'S');
  core.applyIcon(iconDoc(), t, undefined, 'SansIcone', 'S');
  assert.equal(t.textContent, 'S');
  assert.equal(core.iconReport().split('\n').filter((l) => /^SansIcone \[vide\] \(vide\)$/.test(l)).length, 1);
});

test('icônes : toute app découverte est tracée, rapport plafonné', () => {
  core.resetIcons();
  globalThis.window = { tizen: { application: {
    getAppsInfo: (ok) => ok([{ id: 'x', name: 'Decouverte', iconPath: '/opt/d.png', show: true }, { id: 'y', name: 'DecouverteVide', show: true }]),
  } } };
  try { core.listInstalledApps(() => {}); } finally { delete globalThis.window; }
  const r = core.iconReport();
  assert.match(r, /Decouverte \[\?\] \/opt\/d\.png/);
  assert.match(r, /DecouverteVide \[vide\]/);
  for (let i = 0; i < 60; i++) core.applyIcon(iconDoc(), iconTile(), '/p' + i, 'A' + i, 'A');
  const lines = core.iconReport().split('\n');
  assert.ok(lines.length <= 23);
  assert.match(lines[lines.length - 1], /^\+ \d+ autres$/);
});

test('icônes : logo de la bibliothèque d’abord, icône TV en dernier recours, puis le nom', () => {
  core.resetIcons();
  const tile = iconTile();
  core.applyIcon(iconDoc(), tile, '/opt/a.png', 'Netflix', 'Netflix', 'logos/netflix.png');
  const img = tile.children[0];
  assert.equal(img.attrs.src, 'logos/netflix.png', 'le logo large passe avant l’icône de la TV');
  img.onload();
  assert.match(core.iconReport(), /Netflix \[logo\]/);
  assert.equal(tile.textContent, '');

  const t2 = iconTile();
  core.applyIcon(iconDoc(), t2, '/opt/a.png', 'YouTube', 'YouTube', 'logos/youtube.png');
  t2.children[0].onerror();
  assert.equal(t2.children[0].attrs.src, 'file:///opt/a.png', 'logo illisible : icône de la TV');
  t2.children[0].onerror();
  assert.equal(t2.children[0].attrs.src, '/opt/a.png');
  t2.children[0].onload();
  assert.match(core.iconReport(), /YouTube \[ok\]/);

  const nue = iconTile();
  core.applyIcon(iconDoc(), nue, '', 'Plex', 'Plex', 'logos/plex.png');
  assert.equal(nue.children[0].attrs.src, 'logos/plex.png');
  nue.children[0].onerror();
  assert.equal(nue.children.length, 0);
  assert.equal(nue.textContent, 'Plex', 'ni logo ni icône : le nom');
});

test('diagnostic : le user agent du moteur web figure dans le rapport', () => {
  Object.defineProperty(globalThis, "navigator", { value: { userAgent: 'Mozilla/5.0 (SMART-TV; Tizen 5.0) Chrome/56.0.2924.0 TV Safari/537.36' }, configurable: true });
  try { assert.match(core.report(), /userAgent: .*Tizen 5\.0.*Chrome\/56/); }
  finally { delete globalThis.navigator; }
});

test('diagnostic : latence touche → frame, min/médiane/max des 20 derniers', () => {
  core.resetLatency();
  for (let i = 1; i <= 25; i++) core.recordLatency(i * 10); // les 20 derniers : 60..250
  assert.deepEqual(core.latencyStats(), { n: 20, min: 60, median: 155, max: 250, maxCause: 'inconnue' });
  assert.match(core.report(), /latence touche→frame: min 60 \/ méd 155 \/ max 250 ms \(20\)/);
});

test('diagnostic : la sonde mesure keydown → 2 requestAnimationFrame', () => {
  let t = 1000; const q = [];
  core.resetLatency(); core.resetEvents();
  core.keyLatency(() => t, (fn) => q.push(fn));
  t = 1040; q.shift()();
  assert.equal(core.latencyStats(), null, 'pas avant la 2e frame');
  t = 1057; q.shift()();
  assert.deepEqual(core.latencyStats(), { n: 1, min: 57, median: 57, max: 57, maxCause: 'inconnue' });
});

test('device.hideApp : hide() de l’app courante ; hors TV, NO_TIZEN', () => {
  globalThis.window = {};
  try { assert.throws(() => core.hideApp(), (e) => e.code === 'NO_TIZEN'); } finally { delete globalThis.window; }
  let hidden = 0;
  globalThis.window = { tizen: { application: { getCurrentApplication: () => ({ hide: () => hidden++ }) } } };
  try { core.hideApp(); } finally { delete globalThis.window; }
  assert.equal(hidden, 1);
});

test('device.watchNetwork : état initial + événements webapis.network, retrait de l’écoute', () => {
  globalThis.window = {};
  try { assert.throws(() => core.watchNetwork(() => {}), (e) => e.code === 'NO_WEBAPIS'); } finally { delete globalThis.window; }
  let listener = null, removed = null;
  const net = {
    NetworkState: { GATEWAY_DISCONNECTED: 4, GATEWAY_CONNECTED: 5 },
    isConnectedToGateway: () => true,
    addNetworkStateChangeListener: (fn) => { listener = fn; return 7; },
    removeNetworkStateChangeListener: (id) => { removed = id; },
  };
  globalThis.window = { webapis: { network: net } };
  const seen = [];
  try {
    const stop = core.watchNetwork((on) => seen.push(on));
    listener(4); listener(5);
    assert.deepEqual(seen, [true, false, true]);
    stop();
    assert.equal(removed, 7);
  } finally { delete globalThis.window; }
});

test('langues : défaut « VO sous-titrée », mémorisé dans cimaise.v1 (prefs.plexLang), version courante', () => {
  const s = memStore();
  assert.deepEqual(core.loadLangPrefs(s), { mode: 'vo', audioList: ['fra'], subList: ['fra'] });
  core.saveLangPrefs({ mode: 'custom' }, s);
  core.saveLangPrefs({ audioList: ['eng', 'jpn'], subList: [] }, s);
  assert.deepEqual(core.loadLangPrefs(s), { mode: 'custom', audioList: ['eng', 'jpn'], subList: [] });
  const stored = JSON.parse(s.getItem('cimaise.v1'));
  assert.equal(stored.version, 3);
  assert.deepEqual(stored.prefs.plexLang, { mode: 'custom', audio: ['eng', 'jpn'], subs: [] });
  const bad = memStore({ 'cimaise.v1': JSON.stringify({ version: 3, prefs: { plexLang: { mode: 'x', audio: [42, '', 'eng', 'eng', 'fra', 'jpn', 'ita'], subs: {} } } }) });
  assert.deepEqual(core.loadLangPrefs(bad), { mode: 'vo', audioList: ['eng', 'fra', 'jpn'], subList: ['fra'] }, 'valeurs invalides : défaut ; listes nettoyées, 3 au plus');
  assert.deepEqual(core.loadLangPrefs(memStore({ 'cimaise.v1': JSON.stringify({ version: 3, prefs: { plexLang: { mode: 'fr', audio: [] } } }) })).audioList, ['fra'], 'audio jamais vide');
  assert.deepEqual(core.LANG_CHOICES.slice(0, 2).map((c) => c.code), ['fra', 'eng']);
});

test('migration v2 → v3 : les anciens réglages globaux passent dans prefs.plexLang (mode Personnalisé), les clés disparaissent', () => {
  const old = memStore({ 'cimaise.v1': JSON.stringify({ version: 2, prefs: { homeTiles: 5, plexAudioLang: 'eng', plexSubLang: 'fra', plexSeries: { 900: { audioLang: 'jpn' } } } }) });
  const d = core.loadStored(old);
  assert.equal(d.version, 3);
  assert.deepEqual(d.prefs.plexLang, { mode: 'custom', audio: ['eng'], subs: ['fra'] });
  assert.equal('plexAudioLang' in d.prefs, false);
  assert.equal('plexSubLang' in d.prefs, false);
  assert.equal(d.prefs.homeTiles, 5, 'le reste est intact');
  assert.deepEqual(d.prefs.plexSeries, { 900: { audioLang: 'jpn' } }, 'les choix par série sont conservés');
  assert.deepEqual(core.loadLangPrefs(old), { mode: 'custom', audioList: ['eng'], subList: ['fra'] });
  // sous-titres coupés (ancien défaut '') : liste vide ; audio seul enregistré : sous-titres vides
  assert.deepEqual(core.loadStored(memStore({ 'cimaise.v1': JSON.stringify({ version: 2, prefs: { plexAudioLang: 'fra', plexSubLang: '' } }) })).prefs.plexLang, { mode: 'custom', audio: ['fra'], subs: [] });
  assert.deepEqual(core.loadStored(memStore({ 'cimaise.v1': JSON.stringify({ version: 2, prefs: { plexSubLang: 'eng' } }) })).prefs.plexLang, { mode: 'custom', audio: ['fra'], subs: ['eng'] });
  // jamais réglé : rien n'est inventé, le défaut du module s'applique
  const none = core.loadStored(memStore({ 'cimaise.v1': JSON.stringify({ version: 2, prefs: { homeTiles: 4 } }) }));
  assert.equal('plexLang' in none.prefs, false);
  assert.equal(core.loadLangPrefs(memStore({ 'cimaise.v1': JSON.stringify({ version: 2, prefs: { homeTiles: 4 } }) })).mode, 'vo');
  // schéma v0 (à plat) avec anciennes clés : traversé jusqu'à la version courante
  assert.deepEqual(core.loadStored(memStore({ 'cimaise.v1': JSON.stringify({ plexAudioLang: 'ita' }) })).prefs.plexLang, { mode: 'custom', audio: ['ita'], subs: [] });
});

test('langues : le choix fait sur une série est retenu pour ses autres épisodes, sans toucher aux autres séries', () => {
  const s = memStore();
  core.rememberSeries('900', { audioLang: 'jpn' }, s);
  core.rememberSeries('900', { subLang: 'fra' }, s);
  const base = { mode: 'vo', audioList: ['fra'], subList: ['fra'] };
  assert.deepEqual(core.langPrefsFor('900', s), { ...base, audioLang: 'jpn', subLang: 'fra' });
  assert.deepEqual(core.langPrefsFor('901', s), base, 'les autres séries suivent le mode');
  assert.deepEqual(core.langPrefsFor(undefined, s), base);
  core.rememberSeries('900', { subLang: '' }, s);
  assert.equal(core.langPrefsFor('900', s).subLang, '', 'sous-titres coupés retenus aussi');
  core.saveLangPrefs({ mode: 'fr' }, s);
  assert.equal(core.langPrefsFor('900', s).subLang, '', 'le choix de la série prime sur le réglage du module');
  assert.equal(core.langPrefsFor('900', s).audioLang, 'jpn');
  assert.equal(core.langPrefsFor('900', s).mode, 'fr');
});

test('langues : la mémoire par série oublie la plus ancienne même avec des clés numériques', () => {
  const s = memStore();
  for (let i = 1000; i < 1250; i++) core.rememberSeries(String(i), { audioLang: 'eng' }, s); // garde 1050..1249
  core.rememberSeries('1050', { subLang: 'fra' }, s); // la plus ancienne redevient récente
  core.rememberSeries('999', { audioLang: 'jpn' }, s); // évince 1051 (la plus ancienne), pas la plus petite clé 999/1050
  const m = JSON.parse(s.getItem('cimaise.v1')).prefs.plexSeries;
  assert.equal(Object.keys(m).length, 200);
  assert.ok(m['1050'] && m['999'] && m['1249'] && m['1052']);
  assert.equal(m['1051'], undefined);
  assert.equal(m['1050'].audioLang, 'eng');
});

test('langues : la mémoire par série reste bornée (les plus anciennes disparaissent)', () => {
  const s = memStore();
  for (let i = 0; i < 250; i++) core.rememberSeries('k' + i, { audioLang: 'eng' }, s);
  const m = JSON.parse(s.getItem('cimaise.v1')).prefs.plexSeries;
  assert.equal(Object.keys(m).length, 200);
  assert.equal(m.k0, undefined);
  assert.equal(m.k249.audioLang, 'eng');
});

test('latence : la cause du maximum (événements notés dans la fenêtre) est consignée et affichée', () => {
  core.resetLatency(); core.resetEvents();
  let t = 1000;
  const frames = [];
  const run = (cost, events) => {
    core.keyLatency(() => t, (fn) => frames.push(fn));
    for (const [n, dt] of events) core.noteEvent(n, t + dt);
    t += cost; frames.shift()(); frames.shift()();
    t += 100;
  };
  run(18, []);
  run(298, [['logo netflix.png', 10], ['fondu', 20]]);
  run(20, []);
  const st = core.latencyStats();
  assert.equal(st.max, 298);
  assert.equal(st.maxCause, 'logo netflix.png, fondu');
  assert.match(core.report(), /max 298 ms \(logo netflix\.png, fondu\)/);
  core.resetLatency();
  run(150, []);
  assert.equal(core.latencyStats().maxCause, 'inconnue');
});

test('latence : un tas JS qui diminue pendant l’appui est noté comme GC probable', () => {
  core.resetLatency(); core.resetEvents();
  let t = 0, heap = 50e6;
  globalThis.performance = { memory: { get usedJSHeapSize() { return heap; } } };
  try {
    const frames = [];
    core.keyLatency(() => t, (fn) => frames.push(fn));
    heap = 30e6; t = 120;
    frames.shift()(); frames.shift()();
    assert.equal(core.latencyStats().maxCause, 'GC probable');
  } finally { delete globalThis.performance; }
});

test('storage : lecture du localStorage mémorisée, mise à jour par saveStored', () => {
  let reads = 0; const mem = {};
  globalThis.window = globalThis;
  globalThis.localStorage = { getItem: (k) => { reads++; return k in mem ? mem[k] : null; }, setItem: (k, v) => { mem[k] = v; } };
  try {
    core.resetStoredCache();
    core.loadStored(undefined, true); core.loadStored(undefined, true); core.loadStored(undefined, true);
    assert.equal(reads, 1);
    const s = core.loadStored(); s.prefs.x = 1; core.saveStored(s);
    assert.equal(core.loadStored(undefined, true).prefs.x, 1);
    assert.equal(reads, 2, 'le load-puis-save relit le stockage ; la lecture de démarrage reste en cache');
  } finally { delete globalThis.localStorage; core.resetStoredCache(); }
});

test('storage : la sauvegarde d\'un autre bundle survit à une sauvegarde ultérieure de app.js', async () => {
  // Deux copies du module (comme app.js et plex.js) : chacune a son propre cache.
  const mem = {};
  globalThis.window = globalThis;
  globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = v; } };
  const out = join(mkdtempSync(join(tmpdir(), 'tvcore2-')), 'core2.cjs');
  await build({ entryPoints: [join(es5Dir, 'index.js')], bundle: true, format: 'cjs', target: 'es5', outfile: out, logLevel: 'warning' });
  const chunk = createRequire(import.meta.url)(out);
  try {
    core.resetStoredCache();
    core.loadStored(undefined, true); // app.js lit au démarrage : son cache est posé
    const s = chunk.loadStored(); s.prefs.plexToken = 'T'; chunk.saveStored(s); // le chunk enregistre
    const a = core.loadStored(); a.prefs.homeMode = 'dock'; core.saveStored(a); // app.js enregistre ensuite
    assert.equal(JSON.parse(mem['cimaise.v1']).prefs.plexToken, 'T');
    assert.equal(JSON.parse(mem['cimaise.v1']).prefs.homeMode, 'dock');
  } finally { delete globalThis.localStorage; core.resetStoredCache(); }
});
