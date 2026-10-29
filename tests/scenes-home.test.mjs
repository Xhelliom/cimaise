import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';

let H;
before(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'scenes-home-'));
  const es5 = join(dir, 'es5');
  const t = spawnSync('node_modules/.bin/tsc', ['-p', 'packages/launcher/tsconfig.json', '--outDir', es5], { encoding: 'utf8' });
  assert.equal(t.status, 0, t.stdout + t.stderr);
  const out = join(dir, 'home.cjs');
  await build({ entryPoints: [join(es5, 'launcher/src/home/index.js')], bundle: true, format: 'cjs', target: 'es5', outfile: out, logLevel: 'warning' });
  H = createRequire(import.meta.url)(out);
});

function fakeDoc() {
  const mk = (tag) => {
    const el = {
      tag, children: [], parent: null, className: '', textContent: '', attrs: {}, offsetWidth: 1, style: {},
      appendChild(c) { c.parent = el; el.children.push(c); return c; },
      removeChild(c) { el.children.splice(el.children.indexOf(c), 1); c.parent = null; return c; },
      setAttribute(k, v) { el.attrs[k] = v; },
      removeAttribute(k) { delete el.attrs[k]; },
    };
    Object.defineProperty(el, 'firstChild', { get: () => el.children[0] || null });
    Object.defineProperty(el, 'parentNode', { get: () => el.parent });
    return el;
  };
  return { createElement: mk, head: mk('head') };
}
const walk = (el) => [el, ...el.children.flatMap(walk)];
const byClass = (el, c) => walk(el).filter((x) => x.className.split(' ').includes(c));
const text = (el) => [el.textContent, ...el.children.map(text)].join('');
function timers() {
  const t = { list: [], set(fn, ms) { const e = { ms, live: true, fn: () => { e.live = false; fn(); } }; t.list.push(e); return t.list.length - 1; }, clear(h) { if (t.list[h]) t.list[h].live = false; } };
  t.runAll = () => t.list.filter((x) => x.live && x.ms < 60000).forEach((x) => x.fn());
  return t;
}
const SC = [{ id: 'scene.film', name: 'Film' }, { id: 'scene.nuit', name: 'Nuit' }, { id: 'scene.lecture', name: 'Lecture' }];

function mount(extra = {}) {
  const doc = fakeDoc(), tm = timers();
  const calls = { pastille: [], scene: [] };
  const p = H.createHome({
    doc, timer: tm, now: () => new Date('2026-10-29T20:45:10'), watchNetwork: () => () => {},
    catalog: [{ id: 'a', name: 'A', color: '#e5a00d', type: 'tv' }, { id: 'b', name: 'B', color: '#e50914', type: 'tv' }],
    launchApp: () => {}, onPastille: (n) => calls.pastille.push(n),
    onScene: (id, done) => { calls.scene.push(id); calls.done = done; },
    ...extra,
  });
  const press = (...ks) => ks.forEach((k) => p.onKey(k));
  const pills = () => byClass(p.el, 'scene');
  const focus = () => walk(p.el).filter((x) => x.className.split(' ').includes('focus')).map(text);
  return { p, tm, calls, press, pills, focus };
}

test('sans scènes : aucune rangée dans l’accueil, Haut va aux pastilles comme avant', () => {
  const { p, press, focus, pills } = mount();
  assert.equal(pills().length, 0);
  assert.equal(byClass(p.el, 'scenes').length, 0);
  press('up');
  assert.deepEqual(focus(), ['Réglages']);
  p.setScenes([]);
  assert.equal(byClass(p.el, 'scenes').length, 0);
});

test('rangée : une pastille par scène (nom), au plus 6, retirée quand la liste redevient vide', () => {
  const { p, pills } = mount();
  p.setScenes(SC);
  assert.deepEqual(pills().map(text), ['Film', 'Nuit', 'Lecture']);
  p.setScenes([...SC, ...SC, ...SC].map((s, i) => ({ id: s.id + i, name: s.name + i })));
  assert.equal(pills().length, 6);
  p.setScenes([]);
  assert.equal(pills().length, 0);
});

test('Haut depuis le Dock monte à la rangée, puis aux pastilles ; Bas redescend', () => {
  const { p, press, focus } = mount();
  p.setScenes(SC);
  press('up');
  assert.deepEqual(focus(), ['Film']);
  press('right', 'right');
  assert.deepEqual(focus(), ['Lecture']);
  press('right');
  assert.deepEqual(focus(), ['Lecture'], 'borne');
  press('up');
  assert.deepEqual(focus(), ['Réglages']);
  press('down');
  assert.deepEqual(focus(), ['Lecture'], 'de retour à la rangée');
  press('down');
  assert.deepEqual(focus(), ['A'], 'puis au Dock');
});

test('si la rangée disparaît pendant qu’elle a le focus, le focus revient au Dock', () => {
  const { p, press, focus } = mount();
  p.setScenes(SC);
  press('up');
  p.setScenes([]);
  assert.deepEqual(focus(), ['A']);
});

test('Entrée : la pastille s’allume tout de suite, puis « ✓ » ; la marque s’efface seule', () => {
  const { p, press, calls, pills, tm } = mount();
  p.setScenes(SC);
  press('up', 'right', 'enter');
  assert.deepEqual(calls.scene, ['scene.nuit']);
  assert.ok(pills()[1].className.split(' ').includes('allume'), 'allumée avant la réponse');
  assert.ok(!pills()[0].className.split(' ').includes('allume'));
  calls.done(null);
  assert.equal(text(pills()[1]).includes('✓'), true);
  assert.equal(text(pills()[0]).includes('✓'), false);
  tm.runAll();
  assert.equal(text(pills()[1]).includes('✓'), false);
  assert.ok(!pills()[1].className.split(' ').includes('allume'));
});

test('Entrée : erreur → message discret nommant la scène, rien d’allumé, accueil intact', () => {
  const { p, press, calls, pills } = mount();
  p.setScenes(SC);
  press('up', 'enter');
  calls.done(Object.assign(new Error('Home Assistant injoignable'), { code: 'unreachable' }));
  const msg = byClass(p.el, 'message')[0];
  assert.match(msg.className, /\bon\b/);
  assert.match(msg.textContent, /Film.*Home Assistant injoignable/);
  assert.ok(!pills()[0].className.split(' ').includes('allume'));
  assert.equal(text(pills()[0]).includes('✓'), false);
  press('down');
  assert.deepEqual(byClass(p.el, 'tuile').length, 2);
});

test('rien dans les minuteries au repos : la rangée n’ajoute ni minuterie ni écoute', () => {
  const { p, tm } = mount();
  const before = tm.list.filter((x) => x.live).length;
  p.setScenes(SC);
  assert.equal(tm.list.filter((x) => x.live).length, before);
});
