import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';

let S, dir, es5Dir;
before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'set-'));
  es5Dir = join(dir, 'es5');
  const t = spawnSync('node_modules/.bin/tsc', ['-p', 'packages/launcher/tsconfig.json', '--outDir', es5Dir], { encoding: 'utf8' });
  assert.equal(t.status, 0, t.stdout + t.stderr);
  const out = join(dir, 'settings.cjs');
  await build({ entryPoints: [join(es5Dir, 'launcher/src/settings/index.js')], bundle: true, format: 'cjs', target: 'es5', outfile: out, logLevel: 'warning' });
  S = createRequire(import.meta.url)(out);
});

const app = (id, tint) => ({ id, name: id.toUpperCase(), tint: tint || S.PALETTE[0] });

test('modèle : retrait, réordonnancement (bornes), couleur — sans muter l’entrée', () => {
  const c = [app('a'), app('b'), app('c')];
  assert.deepEqual(S.removeAt(c, 1).map((x) => x.id), ['a', 'c']);
  assert.deepEqual(c.length, 3);
  assert.deepEqual(S.moveItem(c, 0, 1).map((x) => x.id), ['b', 'a', 'c']);
  assert.deepEqual(S.moveItem(c, 2, -1).map((x) => x.id), ['a', 'c', 'b']);
  assert.deepEqual(S.moveItem(c, 0, -1).map((x) => x.id), ['a', 'b', 'c']);
  assert.deepEqual(S.moveItem(c, 2, 1).map((x) => x.id), ['a', 'b', 'c']);
  assert.equal(S.setTint(c, 1, S.PALETTE[3])[1].tint, S.PALETTE[3]);
  assert.equal(S.setTint(c, 1, '#123456')[1].tint, c[1].tint, 'hors palette refusé');
  assert.ok(S.PALETTE.length >= 4 && S.PALETTE.length <= 10);
});

test('modèle : ajout depuis la découverte (id, nom, icône), pas de doublon', () => {
  const c = [app('a')];
  const r = S.addDiscovered(c, { id: 'x.y', name: 'Mon app', icon: 'file:///i.png' });
  assert.deepEqual(r.map((x) => [x.id, x.name, x.icon]).pop(), ['x.y', 'Mon app', 'file:///i.png']);
  assert.ok(S.PALETTE.includes(r[1].tint));
  assert.equal(S.addDiscovered(r, { id: 'x.y', name: 'Autre' }).length, 2);
  assert.deepEqual(S.notInCatalog(r, [{ id: 'a', name: 'A' }, { id: 'z', name: 'Z' }]).map((x) => x.id), ['z']);
});

// Faux DOM : suffisant pour retrouver les textes et appuyer sur les touches.
function fakeDoc() {
  const mk = (tag) => {
    const el = {
      tag, children: [], parent: null, className: '', textContent: '', attrs: {}, style: {},
      appendChild(c) { c.parent = el; el.children.push(c); return c; },
      removeChild(c) { el.children.splice(el.children.indexOf(c), 1); c.parent = null; return c; },
      setAttribute(k, v) { el.attrs[k] = v; },
      removeAttribute(k) { delete el.attrs[k]; },
    };
    Object.defineProperty(el, 'firstChild', { get: () => el.children[0] || null });
    return el;
  };
  return { createElement: mk, head: mk('head') };
}
const texts = (el) => [el.textContent, ...el.children.flatMap(texts)].filter(Boolean);
const all = (el, p) => [...(p(el) ? [el] : []), ...el.children.flatMap((c) => all(c, p))];
const focused = (el) => all(el, (e) => / focus\b|^focus\b/.test(' ' + e.className)).map((e) => texts(e).join('|'));

function open(extra = {}) {
  const doc = fakeDoc(), changes = [], calls = { list: 0, closed: 0 };
  const panel = S.createSettings({
    doc,
    catalog: [app('plex'), app('netflix'), app('youtube')],
    listInstalledApps: (ok, fail) => { calls.list++; (calls.impl || ((o) => o([])))(ok, fail); },
    onChange: (c) => changes.push(c),
    onClose: () => calls.closed++,
    ...extra,
  });
  const press = (...ks) => ks.forEach((k) => assert.equal(panel.onKey(k), true, k));
  return { panel, doc, changes, calls, press };
}

test('ouverture : aucune découverte tant que l’utilisateur ne la demande pas', () => {
  const { calls, panel } = open();
  assert.equal(calls.list, 0);
  assert.ok(texts(panel.el).includes('Découvrir les apps installées'));
});

test('retrait à la télécommande', () => {
  const { panel, changes, press } = open();
  press('down');                 // 1re app (plex)
  press('down');                 // netflix
  press('right', 'right', 'enter'); // chips : couleur → déplacer → retirer
  assert.deepEqual(changes.at(-1).map((x) => x.id), ['plex', 'youtube']);
  assert.ok(!texts(panel.el).includes('NETFLIX'));
});

test('réordonnancement : saisir, monter/descendre, relâcher', () => {
  const { changes, press } = open();
  press('down', 'down');         // netflix
  press('right', 'enter');       // saisie
  press('up');
  assert.deepEqual(changes.at(-1).map((x) => x.id), ['netflix', 'plex', 'youtube']);
  press('down', 'down');
  assert.deepEqual(changes.at(-1).map((x) => x.id), ['plex', 'youtube', 'netflix']);
  press('enter');                // relâche
  press('up');                   // retour à la navigation : remonte d’une ligne, sans réordonner
  assert.deepEqual(changes.at(-1).map((x) => x.id), ['plex', 'youtube', 'netflix']);
});

test('couleur : la puce couleur parcourt la palette', () => {
  const { changes, press } = open();
  press('down', 'enter');
  assert.equal(changes.at(-1)[0].tint, S.PALETTE[1]);
  press('enter');
  assert.equal(changes.at(-1)[0].tint, S.PALETTE[2]);
});

test('découverte sur action : liste, ajout (id, nom, icône), erreur explicite hors TV', () => {
  const r = open();
  r.calls.impl = (ok) => ok([{ id: 'plex', name: 'Plex' }, { id: 'disney.id', name: 'Disney+', icon: 'file:///d.png' }]);
  r.press('enter');
  assert.equal(r.calls.list, 1);
  assert.ok(texts(r.panel.el).includes('Disney+'));
  assert.ok(!texts(r.panel.el).includes('Plex'), 'déjà au catalogue : non proposé');
  r.press('down', 'down', 'down', 'down'); // 3 apps puis la découverte
  r.press('enter');
  const last = r.changes.at(-1).at(-1);
  assert.deepEqual([last.id, last.name, last.icon], ['disney.id', 'Disney+', 'file:///d.png']);

  const e = open();
  e.calls.impl = (ok, fail) => fail(Object.assign(new Error('tizen est absent : pas de TV (aperçu navigateur ?)'), { code: 'NO_TIZEN' }));
  e.press('enter');
  assert.ok(texts(e.panel.el).some((t) => /tizen est absent/.test(t)));
  assert.equal(e.changes.length, 0);
});

test('Retour ferme l’écran ; pendant une saisie, il ne fait que relâcher', () => {
  const o = open();
  o.press('down', 'right', 'enter', 'back');
  assert.equal(o.calls.closed, 0);
  o.press('back');
  assert.equal(o.calls.closed, 1);
});

test('module absent du bundle initial du launcher, et propre à lui seul', async () => {
  const r = await build({ entryPoints: [join(es5Dir, 'launcher/src/index.js')], bundle: true, write: false, format: 'iife', target: 'es5', minify: true, logLevel: 'warning' });
  const code = r.outputFiles[0].text;
  assert.ok(!/Découvrir les apps installées/.test(code));
  assert.ok(!/createSettings/.test(code));
});
