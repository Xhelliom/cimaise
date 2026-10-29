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
  assert.ok(texts(r.panel.el).includes('Au catalogue'), 'déjà au catalogue : marqué');
  r.press('down', 'down', 'down', 'down', 'down'); // 3 apps, puis Plex (déjà là), puis Disney+
  r.press('enter');
  const last = r.changes.at(-1).at(-1);
  assert.deepEqual([last.id, last.name, last.icon], ['disney.id', 'Disney+', 'file:///d.png']);

  const e = open();
  e.calls.impl = (ok, fail) => fail(Object.assign(new Error('tizen est absent : pas de TV (aperçu navigateur ?)'), { code: 'NO_TIZEN' }));
  e.press('enter');
  assert.ok(texts(e.panel.el).some((t) => /tizen est absent/.test(t)));
  assert.equal(e.changes.length, 0);
});

test('Affichage de l’accueil : Grille par défaut, Haut atteint la ligne, Entrée / gauche / droite basculent et préviennent', () => {
  const modes = [];
  const { panel, press } = open({ onMode: (m) => modes.push(m) });
  assert.ok(texts(panel.el).includes('Affichage de l’accueil'));
  assert.ok(texts(panel.el).includes('Grille'));
  press('up', 'up');
  assert.ok(focused(panel.el).some((f) => f.includes('Affichage de l’accueil')));
  press('enter');
  assert.deepEqual(modes, ['rangee']);
  assert.ok(texts(panel.el).includes('Une rangée'));
  press('right');
  press('left');
  assert.deepEqual(modes, ['rangee', 'grille', 'rangee']);
  press('up'); // borne haute
  press('down', 'down', 'enter'); // Découvrir, inchangé
  assert.equal(modes.length, 3);
});

test('Tuiles à l’écran : 4 par défaut, sous Affichage (même section), gauche/droite/Entrée parcourent 4 → 5 → 6', () => {
  const tiles = [];
  const { panel, press } = open({ onTiles: (n) => tiles.push(n) });
  const t = texts(panel.el);
  assert.ok(t.indexOf('Tuiles à l’écran') > t.indexOf('Affichage de l’accueil') && t.indexOf('Tuiles à l’écran') < t.indexOf('Découvrir les apps installées'));
  assert.ok(t.includes('4'));
  press('up');
  assert.ok(focused(panel.el).some((f) => f.includes('Tuiles à l’écran')));
  press('right');
  assert.deepEqual(tiles, [5]);
  press('enter');
  assert.deepEqual(tiles, [5, 6]);
  assert.ok(texts(panel.el).includes('6'));
  press('right');
  assert.deepEqual(tiles, [5, 6], 'borne haute : 6 est le maximum');
  press('left', 'left');
  assert.deepEqual(tiles, [5, 6, 5, 4]);
  press('left');
  assert.equal(tiles.length, 4, 'borne basse : 4 est le minimum');
  press('down', 'enter'); // Découvrir, inchangé
  assert.equal(tiles.length, 4);
});

test('Tuiles à l’écran : l’option reflète la valeur reçue, une valeur inconnue → 4', () => {
  assert.ok(texts(open({ tiles: 6 }).panel.el).includes('6'));
  assert.ok(!texts(open({ tiles: 9 }).panel.el).includes('9'));
});

test('Affichage : l’option reflète le mode reçu', () => {
  const { panel } = open({ mode: 'rangee' });
  assert.ok(texts(panel.el).includes('Une rangée'));
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

// --- défilement : 300 apps, focus toujours visible ---
const fake300 = () => Array.from({ length: 300 }, (_, i) => ({ id: 'app.' + String(i).padStart(3, '0'), name: 'App ' + String(i).padStart(3, '0') }));
const ty = (panel) => { const l = all(panel.el, (e) => e.className === 'liste')[0]; return 0 - Number(/translateY\((-?[\d.]+)px\)/.exec(l.style.transform)[1]); };
const focusTop = (panel) => {
  const f = all(panel.el, (e) => /(^| )ligne( |$)/.test(e.className) && /(^| )focus( |$)/.test(e.className))[0];
  return Number(/(\d+)px/.exec(f.style.top)[1]);
};
const assertVisible = (panel) => {
  const off = ty(panel), top = focusTop(panel);
  assert.ok(top >= off && top + S.ROW_H <= off + S.VIEW_H, 'ligne focalisée hors vue : top=' + top + ' offset=' + off);
};

test('défilement : le focus reste entièrement visible dans la liste des Réglages (catalogue long)', () => {
  const catalog = Array.from({ length: 40 }, (_, i) => app('c' + i));
  const { panel, press } = open({ catalog });
  for (let i = 0; i < 40; i++) { press('down'); assertVisible(panel); }
  assert.ok(ty(panel) > 0, 'la liste a défilé');
  for (let i = 0; i < 40; i++) { press('up'); assertVisible(panel); }
  assert.equal(ty(panel), 0);
});

test('découverte de 300 apps : défilement, DOM fenêtré, focus visible jusqu’en bas et au retour', () => {
  const r = open();
  r.calls.impl = (ok) => ok(fake300());
  r.press('enter');
  assert.ok(all(r.panel.el, (e) => /(^| )ligne( |$)/.test(e.className)).length <= 14, 'DOM fenêtré');
  for (let i = 0; i < 303; i++) { r.press('down'); assertVisible(r.panel); }
  assert.ok(texts(r.panel.el).includes('App 299'), 'dernière app atteinte et affichée');
  assert.ok(all(r.panel.el, (e) => /(^| )ligne( |$)/.test(e.className)).length <= 14);
  for (let i = 0; i < 303; i++) { r.press('up'); assertVisible(r.panel); }
});

test('découverte : ajout depuis le bas de la liste, le focus suit l’app ajoutée', () => {
  const r = open();
  r.calls.impl = (ok) => ok(fake300());
  r.press('enter');
  for (let i = 0; i < 303; i++) r.press('down');
  r.press('enter');
  assert.equal(r.changes.at(-1).at(-1).id, 'app.299');
  assertVisible(r.panel);
  assert.ok(texts(r.panel.el).includes('Au catalogue'));
  r.press('enter'); // déjà ajoutée : sans effet
  assert.equal(r.changes.length, 1);
});

test('découverte : complète l’ID des entrées sans ID par nom, sans doublon', () => {
  const catalog = [{ id: '', name: 'Netflix', tint: S.PALETTE[0] }, { id: '', name: 'Plex officiel', tint: S.PALETTE[0] }, { id: 'deja', name: 'YouTube', tint: S.PALETTE[0] }];
  const r = open({ catalog });
  r.calls.impl = (ok) => ok([...fake300(), { id: 'n.id', name: 'NETFLIX' }, { id: 'p.id', name: 'Plex' }, { id: 'y.id', name: 'YouTube' }, { id: 'n2.id', name: 'Netflix' }]);
  r.press('enter');
  assert.deepEqual(r.changes.at(-1).map((x) => x.id), ['n.id', 'p.id', 'deja']);
  assert.equal(r.changes.length, 1);
});

test('fillIds : insensible à la casse/accents, une app attribuée une fois, todo effacé, entrée non mutée', () => {
  const c = [{ id: '', name: 'Canal+', todo: 'x' }, { id: '', name: 'Canal+', todo: 'x' }, { id: 'k', name: 'Autre' }];
  const r = S.fillIds(c, [{ id: 'c1', name: 'canal+' }, { id: 'k', name: 'Autre' }]);
  assert.deepEqual(r.map((x) => x.id), ['c1', '', 'k']);
  assert.equal(r[0].todo, undefined);
  assert.equal(r[1].todo, 'x');
  assert.equal(c[0].id, '');
  assert.equal(S.fillIds([{ id: '', name: 'Épique' }], [{ id: 'e', name: 'epique' }])[0].id, 'e');
  assert.equal(S.fillIds([{ id: '', name: 'Disney+' }], [{ id: '', name: 'Disney+' }])[0].id, '', 'app sans ID ignorée');
});

test('scrollOffset : déplacement minimal, bornes', () => {
  assert.equal(S.scrollOffset(0, 3, 300), 0);
  assert.equal(S.scrollOffset(0, 7, 300), 8 * S.ROW_H - S.VIEW_H);
  assert.equal(S.scrollOffset(500, 1, 300), S.ROW_H);
  assert.equal(S.scrollOffset(0, 299, 300), 300 * S.ROW_H - S.VIEW_H);
});

test('Découvrir : logo + nom + description pour une app connue, monogramme pour une inconnue', () => {
  const r = open();
  r.calls.impl = (ok) => ok([
    { id: 'n.id', name: 'NETFLIX' },
    { id: 'd.id', name: 'Disney Plus', icon: 'file:///d.png' },
    { id: 'x.id', name: 'Inconnue' },
  ]);
  r.press('enter');
  const lignes = all(r.panel.el, (e) => /(^| )ligne( |$)/.test(e.className));
  const find = (nom) => lignes.filter((l) => texts(l).includes(nom)).pop(); // la dernière : la liste découverte, après le catalogue
  const netflix = find('NETFLIX'), disney = find('Disney Plus'), inconnue = find('Inconnue');
  const img = (l) => all(l, (e) => e.tag === 'img').map((i) => i.attrs.src);
  assert.deepEqual(img(netflix), ['logos/netflix.png']);
  assert.ok(texts(netflix).includes('Séries, films et documentaires en streaming.'));
  assert.deepEqual(img(disney), ['logos/disney.png'], 'logo large d’abord, icône TV en dernier recours');
  assert.ok(texts(disney).some((t) => /Disney/.test(t) && t !== 'Disney Plus'));
  assert.deepEqual(img(inconnue), []);
  assert.ok(texts(inconnue).includes('I'));
  assert.equal(texts(inconnue).length, 2, 'aucune description pour une inconnue');
});
