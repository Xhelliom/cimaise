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

test('choix par pièce : Entrée sur Pièce ouvre une liste déroulante avec compteurs ; choisir une pièce restreint la liste', () => {
  const { panel, press, log } = ready();
  press('down', 'down', 'down', 'enter');  // Pièce : le menu s'ouvre
  const t = texts(panel.el);
  assert.deepEqual(['Toutes', 'Bureau', 'Cuisine', 'Salon'].every((n) => t.includes(n)), true);
  assert.ok(t.includes('8') && t.includes('3') && t.includes('2'), 'compteurs : 8 au total, 3 Bureau, 2 Cuisine/Salon');
  assert.ok(!t.includes('Alpha'), 'la liste des scènes est masquée sous le menu');
  press('down', 'enter');                  // Bureau
  assert.ok(texts(panel.el).includes('Bureau'));
  assert.ok(texts(panel.el).includes('Alpha') && !texts(panel.el).includes('Film'));
  press('enter', 'down', 'down', 'enter'); // menu : Bureau → Salon
  press('down', 'down');                   // Recherche, puis la 1re candidate (Film)
  press('enter');
  assert.deepEqual(log.chosen.at(-1), ['scene.film']);
});

test('liste déroulante : Retour la ferme sans changer la pièce, sans fermer la section', () => {
  const { panel, press, log } = ready();
  press('down', 'down', 'down', 'enter', 'down', 'back');
  assert.ok(!texts(panel.el).includes('Toutes') || texts(panel.el).includes('Pièce'), 'menu fermé');
  assert.ok(texts(panel.el).includes('Recherche'));
  assert.ok(!log.closed);
  assert.ok(texts(panel.el).includes('Alpha') && texts(panel.el).includes('Bureau'), 'toujours « Toutes » : titres de section');
});

function typeWord(panel, word) {
  // clavier ABC : on déplace le focus lettre par lettre avec le D-pad, puis Entrée
  const rows = ['abcdefghij', 'klmnopqrst', 'uvwxyz'];
  let r = 0, c = 0;
  for (const ch of word) {
    const tr = rows.findIndex((x) => x.includes(ch)), tc = rows[tr].indexOf(ch);
    while (r < tr) { panel.onKey('down'); r++; }
    while (r > tr) { panel.onKey('up'); r--; }
    while (c < tc) { panel.onKey('right'); c++; }
    while (c > tc) { panel.onKey('left'); c--; }
    panel.onKey('enter');
  }
}

test('recherche : Entrée ouvre le clavier à l’écran (pas d’<input>), le filtre suit la saisie, valider revient à la liste', () => {
  const { panel, press, field } = ready();
  press('down', 'down', 'down', 'down');   // Recherche
  press('enter');
  assert.ok(!field(), 'aucun <input> : il n’ouvrirait pas le clavier Samsung');
  assert.ok(texts(panel.el).includes('valider') && texts(panel.el).includes('effacer'), 'clavier à l’écran affiché');
  typeWord(panel, 'di');
  assert.ok(texts(panel.el).includes('di'));
  assert.ok(texts(panel.el).some((t) => t === '1 scène'), 'compteur mis à jour en direct');
  panel.onKey('down'); panel.onKey('down'); panel.onKey('down'); panel.onKey('down'); // rangée d'actions
  for (let i = 0; i < 8; i++) panel.onKey('right');                                  // « valider »
  panel.onKey('enter');
  assert.ok(texts(panel.el).includes('Dîner'));
  assert.ok(!texts(panel.el).includes('Film'));
  assert.ok(texts(panel.el).includes('di'), 'la recherche reste visible dans la ligne');
});

test('recherche : Retour referme le clavier en gardant la saisie, sans fermer la section', () => {
  const { panel, press, log } = ready();
  press('down', 'down', 'down', 'down', 'enter');
  typeWord(panel, 'n');
  press('back');
  assert.ok(!log.closed);
  assert.ok(texts(panel.el).includes('Dîner') && !texts(panel.el).includes('Alpha'));
});

test('« Toutes » : scènes groupées par pièce avec titres de section ; les titres ne prennent pas le focus', () => {
  const { panel, press } = ready();
  const t = texts(panel.el);
  assert.ok(t.indexOf('Bureau') >= 0 && t.indexOf('Bureau') < t.indexOf('Alpha'));
  press('down', 'down', 'down', 'down', 'down'); // 5e ligne : 1re candidate (le titre « Bureau » est sauté)
  assert.ok(focused(panel.el).some((f) => f.includes('Alpha')));
});

test('scènes choisies en tête et marquées ; indisponibles masquées', () => {
  const list = [...SCENES, { ...SC('hs', 'Hors ligne', 'Salon'), state: 'unavailable' }, { ...SC('hs2', 'Hors ligne 2', 'Salon'), state: 'unavailable' }];
  const { panel, press } = ready({ chosen: ['scene.film'], listScenes: (cb) => cb(null, list) });
  const t = texts(panel.el);
  assert.ok(!t.some((x) => x.includes('Hors ligne')), 'indisponibles masquées');
  assert.ok(t.indexOf('Film') < t.indexOf('Alpha') && t.includes('✓ 1'), 'choisie en tête, marquée');
  assert.equal(t.filter((x) => x === 'Film').length, 1, 'pas en double dans les candidates');
  press('down', 'down', 'down', 'enter');
  assert.ok(texts(panel.el).includes('8') && !texts(panel.el).includes('10'), 'le compteur Toutes ignore les indisponibles');
});

test('100 scènes, 12 pièces : menu avec compteurs, une seule pièce affichée, DOM fenêtré, recherche au clavier', () => {
  const rooms = Array.from({ length: 12 }, (_, i) => 'Pièce ' + String.fromCharCode(65 + i));
  const many = Array.from({ length: 100 }, (_, i) => SC('s' + i, 'Scène ' + String(i).padStart(3, '0'), rooms[i % 12]));
  many.push({ ...SC('off', 'Panne', 'Pièce A'), state: 'unavailable' });
  const { panel, press } = ready({ listScenes: (cb) => cb(null, many) });
  assert.ok(all(panel.el, (e) => e.className === 'ligne' || e.className.startsWith('ligne ')).length < 20, 'seules les lignes visibles existent');
  press('down', 'down', 'down', 'enter');
  assert.ok(texts(panel.el).includes('100'), 'Toutes : 100 disponibles');
  assert.ok(!texts(panel.el).includes('101'));
  press('down', 'down', 'down', 'down', 'down', 'down', 'down', 'down', 'down'); // 9e pièce : défilement du menu
  press('enter');                                                                 // Pièce I (i%12 == 8)
  const t = texts(panel.el);
  assert.ok(t.includes('Pièce I') && t.includes('Scène 008') && !t.includes('Scène 000'));
  assert.ok(!t.some((x) => /^Pièce [A-H]$/.test(x)), 'pas de titres de section quand une pièce est choisie');
  press('down', 'enter');                  // Recherche
  typeWord(panel, 'n');
  panel.onKey('back');
  assert.ok(texts(panel.el).includes('Scène 008'));
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

test('« Toutes » : ajouter une scène garde le focus sur une candidate, jamais sur un titre de section', () => {
  const { panel, press, log } = ready();
  press('down', 'down', 'down', 'down', 'down');   // Alpha (1re du groupe Bureau)
  press('enter');
  assert.deepEqual(log.chosen.at(-1), ['scene.a']);
  assert.deepEqual(focused(panel.el).filter((f) => f.includes('Bravo')).length, 1, 'focus sur la candidate suivante');
  assert.ok(!focused(panel.el).some((f) => f === 'Bureau'), 'pas sur le titre');
  press('down', 'down');                           // Charlie, puis saute le titre « Cuisine » vers Dîner
  press('enter');                                  // ajoute Dîner
  assert.deepEqual(log.chosen.at(-1), ['scene.a', 'scene.diner']);
  assert.ok(focused(panel.el).some((f) => f.includes('Été')), 'focus sur la candidate suivante');
  press('enter');                                  // Entrée agit bien sur une scène
  assert.equal(log.chosen.at(-1).length, 3);
});

test('« Toutes » : retirer une choisie ou fermer le clavier ne laisse pas le focus sur un titre', () => {
  const { panel, press } = ready({ chosen: ['scene.film'] });
  press('down', 'down', 'down', 'down', 'down');   // Film (choisie)
  press('right', 'right', 'enter');                // Retirer
  assert.ok(focused(panel.el).length >= 1 && !focused(panel.el).some((f) => /^(Bureau|Cuisine|Salon|Sans pièce)$/.test(f)));
  press('up', 'enter');                            // Recherche → clavier
  typeWord(panel, 'z');
  panel.onKey('back');                             // filtre : aucune ligne ; rien ne casse
  assert.ok(!focused(panel.el).some((f) => /^(Bureau|Cuisine|Salon|Sans pièce)$/.test(f)));
});

test('menu des pièces : une pièce dont toutes les scènes sont indisponibles est omise', () => {
  const list = [...SCENES, { ...SC('x', 'Veilleuse', 'Cave'), state: 'unavailable' }];
  const { panel, press } = ready({ listScenes: (cb) => cb(null, list) });
  press('down', 'down', 'down', 'enter');
  const t = texts(panel.el);
  assert.ok(t.includes('Bureau') && !t.includes('Cave'));
  assert.ok(!t.includes('0'));
});

test('la feuille de style des Réglages cible titres de pièce et scènes choisies', () => {
  const doc = fakeDoc();
  S.createSettings({ doc, catalog: [], listInstalledApps: (ok) => ok([]), onChange: () => {}, onClose: () => {} });
  const css = all(doc.head, (e) => e.tag === 'style').map((e) => e.textContent).join('');
  assert.match(css, /\.reglages \.ligne\.titre\{[^}]*pointer-events:none/);
  assert.match(css, /\.reglages \.ligne\.titre\{[^}]*font-weight:500/);
  assert.match(css, /\.reglages \.ligne\.choisie\{[^}]*(background|box-shadow)/);
});
