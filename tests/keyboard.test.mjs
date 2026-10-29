import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';

let core;
before(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'kb-'));
  const es5Dir = join(dir, 'es5');
  const t = spawnSync('node_modules/.bin/tsc', ['-p', 'packages/tv-core/tsconfig.json', '--outDir', es5Dir], { encoding: 'utf8' });
  assert.equal(t.status, 0, t.stdout + t.stderr);
  const out = join(dir, 'core.cjs');
  await build({ entryPoints: [join(es5Dir, 'index.js')], bundle: true, format: 'cjs', target: 'es5', outfile: out, logLevel: 'warning' });
  core = createRequire(import.meta.url)(out);
});

function fakeDoc() {
  const mk = (tag) => {
    const classes = new Set();
    const el = {
      tag, children: [], parent: null, className: '', textContent: '', style: {},
      classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c) },
      appendChild(c) { c.parent = el; el.children.push(c); return c; },
      removeChild(c) { el.children.splice(el.children.indexOf(c), 1); c.parent = null; },
    };
    return el;
  };
  return { createElement: mk };
}
const all = (el) => [el].concat(...el.children.map(all));

function kb(extra = {}) {
  const doc = fakeDoc(), container = doc.createElement('div'), ev = [];
  const k = core.createKeyboard({
    container, doc,
    onChange: (v) => ev.push(['change', v]), onSubmit: (v) => ev.push(['submit', v]), onCancel: () => ev.push(['cancel']),
    ...extra,
  });
  return { k, container, ev, doc };
}
const press = (k, ...keys) => keys.forEach((x) => k.handleKey(x));
const label = (k) => k.focusedLabel();

test('démarre sur « a », ABC : 10 colonnes a–j', () => {
  const { k } = kb();
  assert.equal(label(k), 'a');
  press(k, 'right', 'right');
  assert.equal(label(k), 'c');
  press(k, 'down');
  assert.equal(label(k), 'm');
});

test('Entrée tape la lettre ; change à chaque frappe', () => {
  const { k, ev } = kb();
  press(k, 'enter', 'right', 'enter');
  assert.equal(k.getValue(), 'ab');
  assert.deepEqual(ev, [['change', 'a'], ['change', 'ab']]);
});

test('accents é è à ç, chiffres, espace atteignables au D-pad', () => {
  const { k } = kb();
  const typed = [];
  const seen = {};
  // balayage exhaustif : chaque touche du clavier est atteignable
  for (let r = 0; r < 12; r++) {
    for (let c = 0; c < 12; c++) { seen[label(k)] = true; k.handleKey('right'); }
    k.handleKey('down');
    for (let c = 0; c < 12; c++) k.handleKey('left');
  }
  'abcdefghijklmnopqrstuvwxyz0123456789éèàç'.split('').forEach((ch) => assert.ok(seen[ch], 'touche ' + ch));
  ['espace', 'effacer', 'tout effacer', 'valider'].forEach((l) => assert.ok(seen[l], 'touche ' + l));
});

test('espace, effacer, tout effacer, valider (par touches de la grille)', () => {
  const { k, ev } = kb({ value: 'ab' });
  const go = (l) => { // atteint la touche par D-pad exclusivement : bas de grille, bord gauche, puis vers la droite
    press(k, 'down', 'down', 'down', 'down', 'down', 'left', 'left', 'left', 'left', 'left', 'left', 'left', 'left', 'left', 'left');
    for (let i = 0; i < 10 && label(k) !== l; i++) k.handleKey('right');
    assert.equal(label(k), l);
  };
  go('espace'); k.handleKey('enter'); assert.equal(k.getValue(), 'ab ');
  go('effacer'); k.handleKey('enter'); assert.equal(k.getValue(), 'ab');
  go('tout effacer'); k.handleKey('enter'); assert.equal(k.getValue(), '');
  go('valider'); k.handleKey('enter');
  assert.deepEqual(ev, [['change', 'ab '], ['change', 'ab'], ['change', ''], ['submit', '']]);
});

test('effacer sur un champ vide ne déclenche pas change', () => {
  const { k, ev } = kb();
  k.press('delete');
  assert.deepEqual(ev, []);
});

test('focus mémorisé : colonne conservée en descendant puis remontant', () => {
  const { k } = kb();
  press(k, 'right', 'right', 'right', 'right', 'right', 'right', 'right', 'down', 'down', 'down', 'down', 'down');
  press(k, 'up', 'up', 'up', 'up', 'up');
  assert.equal(label(k), 'h');
});

test('Retour appelle onCancel ; pas d’effet sur la valeur', () => {
  const { k, ev } = kb({ value: 'x' });
  k.handleKey('back');
  assert.deepEqual(ev, [['cancel']]);
  assert.equal(k.getValue(), 'x');
});

test('touches de couleur : rouge effacer, vert espace, jaune tout effacer, bleu valider', () => {
  const { k, ev } = kb({ value: 'ab' });
  assert.equal(k.handleKeyCode(403), true);  // rouge
  assert.equal(k.handleKeyCode(404), true);  // vert
  assert.equal(k.handleKeyCode(405), true);  // jaune
  assert.equal(k.handleKeyCode(406), true);  // bleu
  assert.deepEqual(ev, [['change', 'a'], ['change', 'a '], ['change', ''], ['submit', '']]);
  assert.equal(k.handleKeyCode(999), false);
});

test('touches numériques 0–9 tapent le chiffre', () => {
  const { k } = kb();
  k.handleKeyCode(49); k.handleKeyCode(48);
  assert.equal(k.getValue(), '10');
});

test('maxLength respecté', () => {
  const { k, ev } = kb({ maxLength: 2 });
  press(k, 'enter', 'enter', 'enter');
  assert.equal(k.getValue(), 'aa');
  assert.equal(ev.length, 2);
});

test('setValue ne déclenche pas change ; champ affiché au-dessus', () => {
  const { k, ev, container } = kb();
  k.setValue('film');
  assert.deepEqual(ev, []);
  const field = all(container).find((e) => /kb-field/.test(e.className));
  assert.ok(field);
  assert.ok(/film/.test(all(field).map((e) => e.textContent).join('')));
  assert.equal(container.children[0].children[0], field);
});

test('rendu : transform/opacity seulement, DOM constant à la frappe, destroy retire tout', () => {
  const { k, container } = kb();
  const n = all(container).length;
  press(k, 'enter', 'right', 'enter', 'down');
  assert.equal(all(container).length, n);
  const used = new Set();
  all(container).forEach((e) => Object.keys(e.style).forEach((p) => used.add(p)));
  for (const p of used) assert.ok(['transform', 'width', 'height', 'position', 'left', 'top', 'opacity'].includes(p), 'style ' + p);
  k.destroy();
  assert.equal(container.children.length, 0);
});

test('handleKey rend true quand la touche est consommée', () => {
  const { k } = kb();
  assert.equal(k.handleKey('left'), true);   // bord : consommée quand même
  assert.equal(k.handleKey('play'), false);
});
