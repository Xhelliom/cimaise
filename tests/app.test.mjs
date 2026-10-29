// App cimaise (apps/tv) exécutée dans un DOM factice : premier affichage minimal, chargement différé,
// retour à la racine. Le bundle et les chunks sont construits en mémoire (pas de dist/ : pas de course avec les autres tests).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';

const code = {};
before(async () => {
  const es5 = join(mkdtempSync(join(tmpdir(), 'app-')), 'es5');
  const t = spawnSync('node_modules/.bin/tsc', ['-p', 'apps/tv/tsconfig.json', '--outDir', es5], { encoding: 'utf8' });
  assert.equal(t.status, 0, t.stdout + t.stderr);
  for (const [name, p] of [['app', 'index'], ['plex', 'chunks/plex'], ['settings', 'chunks/settings']]) {
    const r = await build({ entryPoints: [join(es5, `apps/tv/src/${p}.js`)], bundle: true, write: false, format: 'iife', target: 'es5', logLevel: 'silent' });
    code[name] = r.outputFiles[0].text;
  }
});

function el(tag) {
  const e = { tag, children: [], parentNode: null, style: {}, className: '', textContent: '', offsetWidth: 0 };
  e.appendChild = (c) => { if (c.parentNode) c.parentNode.removeChild(c); c.parentNode = e; e.children.push(c); if (e.onAppend) e.onAppend(c); return c; };
  e.removeChild = (c) => { e.children.splice(e.children.indexOf(c), 1); c.parentNode = null; return c; };
  e.removeAttribute = () => {};
  e.getElementsByTagName = () => [];
  return e;
}
const find = (n, cls, out = []) => { if ((n.className || '').split(' ').includes(cls)) out.push(n); n.children.forEach((c) => find(c, cls, out)); return out; };

function boot({ failChunk } = {}) {
  const body = el('body'), head = el('head'), root = el('div');
  const loaded = [];
  head.onAppend = (s) => {
    if (s.tag !== 'script') return;
    loaded.push(s.src);
    Promise.resolve().then(() => {
      if (failChunk === s.src) { s.onerror(); return; }
      vm.runInContext(code[s.src.replace('.js', '')], ctx);
      s.onload();
    });
  };
  const listeners = [];
  const timers = [];
  const exits = [];
  const document = {
    body, head, createElement: el,
    getElementById: (id) => (id === 'root' ? root : null),
    addEventListener: (t, f) => t === 'keydown' && listeners.push(f),
  };
  const ctx = vm.createContext({
    document, Date, console, Promise, Error,
    setTimeout: (f, ms) => { timers.push({ f, ms }); return timers.length; },
    clearTimeout: () => {},
    tizen: { tvinputdevice: { registerKey() {} }, application: { getCurrentApplication: () => ({ exit: () => exits.push(1) }) } },
  });
  ctx.window = ctx;
  vm.runInContext(code.app, ctx);
  const key = (keyCode) => listeners.forEach((f) => f({ keyCode }));
  const tick = () => new Promise((r) => setImmediate(r));
  const flush = () => { const t = timers.splice(0).filter((x) => x.ms === 0); t.forEach((x) => x.f()); }; // minuteries différées (0 ms)
  return { root, body, loaded, key, tick, flush, exits };
}
const LEFT = 37, UP = 38, RIGHT = 39, DOWN = 40, OK = 13, BACK = 10009;

test('premier affichage minimal : horloge et tuiles, ni fond teinté ni police décorative', () => {
  const a = boot();
  assert.equal(find(a.root, 'horloge').length, 1);
  assert.match(find(a.root, 'horloge')[0].textContent, /^\d\d:\d\d$/);
  assert.equal(find(a.root, 'tuile').length, 6);
  assert.equal(find(a.root, 'fond').length, 0);
  assert.equal(find(a.root, 'titre').length, 0);
  assert.notEqual(a.body.className, 'late');
  assert.deepEqual(a.loaded, [], 'aucun chunk au démarrage');
});

test('chargement différé : après le premier affichage, fond teinté, titre, pastille et police', () => {
  const a = boot();
  a.flush();
  assert.equal(find(a.root, 'fond').length, 2);
  assert.equal(find(a.root, 'titre')[0].textContent, 'Plex intégré');
  assert.equal(find(a.root, 'pastille').length, 1);
  assert.equal(a.body.className, 'late');
  assert.deepEqual(a.loaded, [], 'Plex et réglages restent à la demande');
});

test('le focus suit les flèches et le titre suit le focus', () => {
  const a = boot();
  a.flush();
  a.key(RIGHT); a.key(RIGHT);
  assert.equal(find(a.root, 'titre')[0].textContent, 'Netflix');
  assert.deepEqual(find(a.root, 'focus').map((n) => n.textContent), ['N']);
  a.key(DOWN);
  assert.equal(find(a.root, 'titre')[0].textContent, 'Canal+'); // dernière rangée incomplète
});

test('Plex : le chunk n’est chargé qu’à la première ouverture ; Retour revient à l’accueil', async () => {
  const a = boot();
  a.flush();
  a.key(OK);
  assert.deepEqual(a.loaded, ['plex.js']);
  await a.tick();
  assert.equal(find(a.root, 'plex-panel').length, 1);
  assert.equal(find(a.root, 'home').length, 0, 'seul le panneau du dessus est dans le DOM');
  a.key(BACK);
  assert.equal(find(a.root, 'plex-panel').length, 0);
  assert.equal(find(a.root, 'home').length, 1);
  a.key(OK); await a.tick();
  assert.deepEqual(a.loaded, ['plex.js'], 'chunk déjà enregistré : pas de second script');
  assert.equal(find(a.root, 'plex-panel').length, 1);
});

test('Réglages : pastille atteinte par Haut, chunk settings chargé à l’ouverture, diagnostic affiché', async () => {
  const a = boot();
  a.flush();
  a.key(UP);
  assert.equal(find(a.root, 'pastille')[0].className, 'pastille focus');
  assert.equal(find(a.root, 'focus').filter((n) => n.className === 'tuile focus').length, 0);
  a.key(OK);
  assert.deepEqual(a.loaded, ['settings.js']);
  await a.tick();
  const panel = find(a.root, 'reglages')[0];
  assert.ok(panel);
  assert.match(panel.children[1].textContent, /scriptLoaded[\s\S]*firstPaint[\s\S]*interactive/);
});

test('un chunk qui ne charge pas laisse l’accueil en place', async () => {
  const a = boot({ failChunk: 'plex.js' });
  a.flush();
  a.key(OK);
  await a.tick();
  assert.equal(find(a.root, 'home').length, 1);
  assert.equal(find(a.root, 'plex-panel').length, 0);
});

test('Retour à la racine demande confirmation avant de quitter', () => {
  const a = boot();
  a.flush();
  a.key(BACK);
  assert.equal(a.exits.length, 0, 'pas de sortie sans confirmation');
  assert.equal(find(a.root, 'exit-confirm').length, 1);
  a.key(OK); // focus sur « Rester »
  assert.equal(a.exits.length, 0);
  assert.equal(find(a.root, 'exit-confirm').length, 0);
  assert.equal(find(a.root, 'home').length, 1);
  a.key(BACK); a.key(RIGHT); a.key(OK); // « Quitter »
  assert.equal(a.exits.length, 1);
});

test('diagnostic caché : Entrée sur une tuile sans action affiche les horodatages (script, premier affichage, interactif)', () => {
  const a = boot();
  a.flush();
  a.key(RIGHT); a.key(OK);
  const pre = a.body.children.find((c) => c.tag === 'pre');
  assert.ok(pre);
  assert.match(pre.textContent, /scriptLoaded[\s\S]*firstPaint[\s\S]*interactive/);
});

test('l’app ne dépend d’aucun mock', () => {
  assert.doesNotMatch(readFileSync('apps/tv/src/index.ts', 'utf8'), /mock/i);
});
