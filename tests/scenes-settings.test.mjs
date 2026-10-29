import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';

let S;
before(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'scenes-set-'));
  const es5 = join(dir, 'es5');
  const t = spawnSync('node_modules/.bin/tsc', ['-p', 'packages/launcher/tsconfig.json', '--outDir', es5], { encoding: 'utf8' });
  assert.equal(t.status, 0, t.stdout + t.stderr);
  const out = join(dir, 'settings.cjs');
  await build({ entryPoints: [join(es5, 'launcher/src/settings/index.js')], bundle: true, format: 'cjs', target: 'es5', outfile: out, logLevel: 'warning' });
  S = createRequire(import.meta.url)(out);
});

function fakeDoc() {
  const mk = (tag) => {
    const el = {
      tag, children: [], parent: null, className: '', textContent: '', attrs: {}, style: {}, value: '', focused: false,
      appendChild(c) { c.parent = el; el.children.push(c); return c; },
      removeChild(c) { el.children.splice(el.children.indexOf(c), 1); c.parent = null; return c; },
      setAttribute(k, v) { el.attrs[k] = v; },
      removeAttribute(k) { delete el.attrs[k]; },
      addEventListener() {}, focus() { el.focused = true; }, blur() { el.focused = false; },
    };
    Object.defineProperty(el, 'firstChild', { get: () => el.children[0] || null });
    Object.defineProperty(el, 'parentNode', { get: () => el.parent });
    return el;
  };
  return { createElement: mk, head: mk('head') };
}
const texts = (el) => [el.textContent, ...el.children.flatMap(texts)].filter(Boolean);
const all = (el, p) => [...(p(el) ? [el] : []), ...el.children.flatMap((c) => all(c, p))];
const focused = (el) => all(el, (e) => / focus\b|^focus\b/.test(' ' + e.className)).map((e) => texts(e).join('|'));

const SC = (id, name, area) => ({ id: 'scene.' + id, name, area: area || null });
const SCENES = [SC('film', 'Film', 'Salon'), SC('lecture', 'Lecture', 'Salon'), SC('diner', 'Dîner', 'Cuisine'), SC('nuit', 'Nuit'), SC('ete', 'Été', 'Cuisine'), SC('a', 'Alpha', 'Bureau'), SC('b', 'Bravo', 'Bureau'), SC('c', 'Charlie', 'Bureau')];

function open(ha = {}) {
  const doc = fakeDoc(), log = { cfg: [], chosen: [], loads: 0 };
  const panel = S.createSettings({
    doc, catalog: [], listInstalledApps: (ok) => ok([]), onChange: () => {}, onClose: () => { log.closed = true; },
    ha: {
      url: '', token: '', chosen: [],
      onConfig: (u, t) => log.cfg.push([u, t]),
      onChosen: (ids) => log.chosen.push(ids),
      listScenes: (cb) => { log.loads++; (log.impl || ((c) => c(null, SCENES)))(cb); },
      ...ha,
    },
  });
  const press = (...ks) => ks.forEach((k) => assert.equal(panel.onKey(k), true, k));
  // Atteint la ligne « Scènes Home Assistant » (tout en haut) et l'ouvre.
  const enter = () => { press('up', 'up', 'up', 'enter'); };
  const field = () => all(panel.el, (e) => e.tag === 'input')[0];
  return { panel, log, press, enter, field };
}

test('Réglages : la ligne « Scènes Home Assistant » ouvre la section ; Retour ramène à la liste puis ferme', () => {
  const { panel, press, enter, log } = open();
  assert.ok(texts(panel.el).includes('Scènes Home Assistant'));
  enter();
  assert.ok(texts(panel.el).includes('Adresse'));
  assert.ok(texts(panel.el).includes('Jeton'));
  press('back');
  assert.ok(texts(panel.el).includes('Scènes Home Assistant'));
  assert.ok(!log.closed);
  press('back');
  assert.ok(log.closed);
});

test('adresse et jeton : saisie, validation par Entrée, normalisation, jeton jamais affiché', () => {
  const { panel, press, enter, log, field } = open();
  enter();
  press('enter');                          // ligne Adresse : le champ de saisie s'ouvre
  assert.ok(field() && field().focused);
  field().value = ' 192.168.1.5:8123/ ';
  press('enter');
  assert.deepEqual(log.cfg.at(-1), ['http://192.168.1.5:8123', '']);
  assert.ok(!field(), 'champ refermé');
  press('down', 'enter');                  // Jeton
  field().value = 'SECRET-TOKEN-1234';
  press('enter');
  assert.deepEqual(log.cfg.at(-1), ['http://192.168.1.5:8123', 'SECRET-TOKEN-1234']);
  assert.ok(!texts(panel.el).some((t) => t.includes('SECRET-TOKEN')), 'le jeton n’est pas affiché');
  assert.ok(texts(panel.el).some((t) => t.includes('192.168.1.5:8123')));
});

test('saisie : Retour annule sans enregistrer ; pendant la saisie les flèches ne bougent pas la liste', () => {
  const { panel, press, enter, log, field } = open({ url: 'http://ha:8123', token: 't' });
  enter();
  press('enter');
  field().value = 'autre';
  panel.onKey('down'); panel.onKey('up'); // laissées au champ, la liste ne bouge pas
  assert.ok(field());
  press('back');
  assert.ok(!field());
  assert.equal(log.cfg.length, 0);
  assert.ok(!log.closed, 'Retour n’a fermé que le champ');
  assert.ok(texts(panel.el).includes('Adresse'));
});

test('ouverture configurée : les scènes se chargent ; non configurée : aucune requête', () => {
  const a = open();
  a.enter();
  assert.equal(a.log.loads, 0);
  const b = open({ url: 'http://ha:8123', token: 't' });
  b.enter();
  assert.equal(b.log.loads, 1);
  assert.ok(texts(b.panel.el).some((t) => /8 scènes/.test(t)));
});

test('erreur de chargement : message explicite, rien ne casse', () => {
  const { panel, enter, log } = open({ url: 'http://ha:8123', token: 't' });
  log.impl = (cb) => cb(Object.assign(new Error('Home Assistant injoignable'), { code: 'unreachable' }));
  enter();
  assert.ok(texts(panel.el).some((t) => /injoignable/.test(t)));
});

function ready(extra = {}) {
  const r = open({ url: 'http://ha:8123', token: 't', ...extra });
  r.enter();
  return r;
}
// Positions : 0 Adresse, 1 Jeton, 2 Charger, 3 Pièce, 4 Recherche, puis choisies, puis candidates.

test('choix par pièce : le filtre Pièce restreint la liste ; Entrée ajoute la scène', () => {
  const { panel, press, log } = ready();
  press('down', 'down', 'down');           // Pièce
  press('right');                          // 1re pièce triée : Bureau
  assert.ok(texts(panel.el).includes('Bureau'));
  assert.ok(texts(panel.el).includes('Alpha') && !texts(panel.el).includes('Film'));
  press('right');                          // Cuisine
  assert.deepEqual(['Dîner', 'Été'].every((n) => texts(panel.el).includes(n)), true);
  press('right');                          // Salon
  press('down', 'down');                   // Recherche, puis la 1re candidate (Film)
  press('enter');
  assert.deepEqual(log.chosen.at(-1), ['scene.film']);
});

test('recherche par lettres : filtre la liste (sans casse ni accents)', () => {
  const { panel, press, field } = ready();
  press('down', 'down', 'down', 'down');   // Recherche
  press('enter');
  field().value = 'DINER';
  press('enter');
  assert.ok(texts(panel.el).includes('Dîner'));
  assert.ok(!texts(panel.el).includes('Film'));
  assert.ok(texts(panel.el).includes('DINER') || texts(panel.el).some((t) => t.includes('DINER')), 'la recherche reste visible');
});

test('ordre réglable : Monter / Descendre / Retirer sur les scènes choisies', () => {
  const { panel, press, log } = ready({ chosen: ['scene.film', 'scene.nuit', 'scene.diner'] });
  press('down', 'down', 'down', 'down', 'down'); // 1re choisie : Film
  assert.ok(focused(panel.el).some((f) => f.includes('Film')));
  press('down');                                 // Nuit
  press('right', 'enter');                       // chips : Monter, Descendre → « Descendre »
  assert.deepEqual(log.chosen.at(-1), ['scene.film', 'scene.diner', 'scene.nuit']);
  press('left', 'enter');                        // « Monter » : Nuit remonte d’un cran (sa ligne suit le focus)
  assert.deepEqual(log.chosen.at(-1), ['scene.film', 'scene.nuit', 'scene.diner']);
  press('right', 'right', 'enter');              // « Retirer »
  assert.deepEqual(log.chosen.at(-1), ['scene.film', 'scene.diner']);
});

test('six scènes au plus : la 7e est refusée avec un message', () => {
  const six = ['film', 'lecture', 'diner', 'nuit', 'ete', 'a'].map((x) => 'scene.' + x);
  const { panel, press, log } = ready({ chosen: six });
  press('down', 'down', 'down', 'down');         // Recherche
  press('down', 'down', 'down', 'down', 'down', 'down', 'down'); // 6 choisies, puis la 1re candidate (Bravo)
  press('enter');
  assert.equal(log.chosen.length, 0);
  assert.ok(texts(panel.el).some((t) => /six/i.test(t)));
});

test('saisie : une flèche pendant la saisie laisse le champ attaché et focalisé, et passe au champ', () => {
  const { panel, enter, field } = open({ url: 'http://ha:8123', token: 't' });
  enter();
  panel.onKey('enter');
  const input = field();
  assert.ok(input && input.focused);
  input.focused = false; // un re-rendu ne le refocaliserait pas : on vérifie qu'il n'a pas lieu
  for (const k of ['left', 'right', 'down', 'up']) assert.equal(panel.onKey(k), false, k + ' non consommée : elle va au champ');
  assert.equal(field(), input, 'même champ, jamais détaché');
  assert.ok(input.parent, 'toujours dans le DOM');
  assert.equal(input.focused, false, 'aucun re-rendu pendant la saisie');
  panel.onKey('back');
  assert.ok(!field());
});
