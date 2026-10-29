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
  const dir = mkdtempSync(join(tmpdir(), 'virt-'));
  const es5Dir = join(dir, 'es5');
  const t = spawnSync('node_modules/.bin/tsc', ['-p', 'packages/tv-core/tsconfig.json', '--outDir', es5Dir], { encoding: 'utf8' });
  assert.equal(t.status, 0, t.stdout + t.stderr);
  const out = join(dir, 'core.cjs');
  await build({ entryPoints: [join(es5Dir, 'index.js')], bundle: true, format: 'cjs', target: 'es5', outfile: out, logLevel: 'warning' });
  core = createRequire(import.meta.url)(out);
});

// Faux DOM minimal : enregistre les écritures de style/attributs après `log.length = 0`.
function fakeDoc(log) {
  const mk = (tag) => {
    const classes = new Set(), attrs = {};
    const el = {
      tag, children: [], parent: null, className: '', textContent: '',
      classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c) },
      appendChild(c) { c.parent = el; el.children.push(c); },
      removeChild(c) { el.children.splice(el.children.indexOf(c), 1); c.parent = null; },
      setAttribute(k, v) { attrs[k] = v; log.push('attr:' + k); },
      getAttribute: (k) => (k in attrs ? attrs[k] : null),
      removeAttribute(k) { delete attrs[k]; log.push('attr:' + k); },
    };
    el.style = new Proxy({}, { set(o, k, v) { o[k] = v; log.push('style:' + k); return true; } });
    return el;
  };
  return { createElement: mk };
}

const count = (el) => 1 + el.children.reduce((n, c) => n + count(c), 0);
const xy = (t) => /translate3d\((-?[\d.]+)px,(-?[\d.]+)px/.exec(t.style.transform).slice(1).map(Number);
const layerY = (layer) => Number(/translate3d\(0,(-?[\d.]+)px/.exec(layer.style.transform)[1]);

function grid(extra = {}) {
  const log = [], doc = fakeDoc(log), container = doc.createElement('div'), pages = [];
  const g = core.createGrid({
    container, doc, count: 5000, cols: 5, itemW: 200, itemH: 300, gap: 20, viewportW: 1920, viewportH: 1080,
    pageSize: 50, render: (i) => ({ title: 't' + i, image: 'img/' + i }),
    onPage: (s, n) => pages.push([s, n, g.focus.index]), ...extra,
  });
  g.update();
  return { g, log, container, layer: container.children[0], pages };
}

test('grille de 5000 éléments : DOM borné (≤ 30 tuiles, ≤ 92 nœuds) pendant tout le parcours', () => {
  const { g, container } = grid();
  // 4 lignes visibles dont 1 partielle (ceil(1080/320)) + 1 de marge de chaque côté = 6 lignes × 5 colonnes
  let worst = 0;
  for (let k = 0; k < 900; k++) {
    g.handleKey('down');
    worst = Math.max(worst, container.children[0].children.length);
  }
  for (let k = 0; k < 4; k++) g.handleKey('right');
  assert.ok(worst <= 30, 'tuiles max ' + worst);
  assert.ok(count(container) <= 2 + 30 * 3, 'nœuds ' + count(container));
});

test('rangée de 5000 éléments : DOM borné', () => {
  const log = [], doc = fakeDoc(log), container = doc.createElement('div');
  const r = core.createRow({ container, doc, count: 5000, itemW: 300, itemH: 170, gap: 20, viewportW: 1920, viewportH: 170, render: () => null });
  r.update();
  let worst = 0;
  for (let k = 0; k < 3000; k++) { r.handleKey('right'); worst = Math.max(worst, container.children[0].children.length); }
  assert.equal(r.focus.index, 3000);
  assert.ok(worst <= 8, 'tuiles max ' + worst); // 5 pleines + 2 marges (+1 partielle)
});

test('défilement par transform uniquement (aucune autre écriture de style)', () => {
  const { g, log } = grid();
  log.length = 0;
  for (let k = 0; k < 200; k++) g.handleKey('down');
  assert.ok(log.length > 0);
  assert.deepEqual([...new Set(log.filter((l) => l.startsWith('style:')))], ['style:transform']);
});

test('focus cohérent : une seule tuile focus, dans la fenêtre visible', () => {
  const { g, container, layer } = grid();
  const dirs = ['down', 'right', 'down', 'down', 'left', 'up', 'down', 'right', 'right', 'down'];
  for (let k = 0; k < 600; k++) {
    g.handleKey(dirs[(k * 7 + (k >> 3)) % dirs.length]);
    const focused = layer.children.filter((t) => t.classList.contains('focus'));
    assert.equal(focused.length, 1);
    const [, y] = xy(focused[0]);
    const vy = y + layerY(layer);
    assert.ok(vy >= 0 && vy + 300 <= 1080, 'tuile hors écran, y=' + vy + ' index=' + g.focus.index);
    assert.equal(focused[0].children[1].textContent, 't' + g.focus.index);
  }
  for (let k = 0; k < 2000; k++) g.handleKey('up');
  assert.equal(g.focus.index, 0 + g.focus.index % 5);
  assert.equal(layerY(layer) + 0, 0);
});

test('images : seulement lignes visibles + la suivante ; libérées au recyclage', () => {
  const { g, layer } = grid();
  const withSrc = () => layer.children.filter((t) => t.children[0].getAttribute('src'));
  assert.equal(withSrc().length, 5 * 5); // 4 visibles (dont 1 partielle) + la suivante, entièrement cachée
  const hidden = layer.children.filter((t) => xy(t)[1] >= 1080); // première ligne sous le viewport (y = 1280)
  assert.equal(hidden.length, 5);
  assert.ok(hidden.every((t) => t.children[0].getAttribute('src')));
  for (let k = 0; k < 100; k++) g.handleKey('down');
  assert.ok(withSrc().length <= 6 * 5);
  assert.ok(layer.children.every((t) => !t.children[0].getAttribute('src') || t.children[0].getAttribute('src') === 'img/' + [...Array(5000).keys()].find((i) => 't' + i === t.children[1].textContent)));
});

test('refresh() ne retouche pas src quand l’URL est inchangée, le remplace quand elle change', () => {
  const urls = {};
  const { g, log, layer } = grid({ render: (i) => ({ title: 't' + i, image: urls[i] || 'img/' + i }) });
  log.length = 0;
  g.refresh();
  assert.deepEqual(log.filter((l) => l === 'attr:src'), []);
  assert.equal(layer.children.filter((t) => t.children[0].getAttribute('src')).length, 25);
  urls[0] = 'img/new0';
  g.refresh();
  const t0 = layer.children.find((t) => t.children[1].textContent === 't0');
  assert.equal(t0.children[0].getAttribute('src'), 'img/new0');
  assert.equal(log.filter((l) => l === 'attr:src').length, 2); // retrait + pose, pour cette seule tuile
});

test('pagination : page demandée avant que le focus n’atteigne sa première ligne', () => {
  const { g, pages } = grid();
  assert.deepEqual(pages[0].slice(0, 2), [0, 50]);
  while (!pages.some((p) => p[0] === 50)) g.handleKey('down');
  const p = pages.find((q) => q[0] === 50);
  assert.ok(p[2] < 50 - 5, 'focus ' + p[2]); // au moins une ligne d’avance
  const before = pages.length;
  g.setFocus(4999);
  assert.ok(pages.some((q) => q[0] === 4950 && q[1] === 50));
  g.update();
  assert.equal(pages.filter((q) => q[0] === 4950).length, 1); // pas de doublon
  g.pageFailed(4950);
  g.update();
  assert.equal(pages.filter((q) => q[0] === 4950).length, 2);
  assert.ok(pages.length > before);
});

test('bords : handleKey renvoie false pour passer la main ; Entrée → onSelect', () => {
  const sel = [];
  const { g } = grid({ onSelect: (i) => sel.push(i) });
  assert.equal(g.handleKey('up'), false);
  assert.equal(g.handleKey('left'), false);
  g.handleKey('right');
  g.handleKey('enter');
  assert.deepEqual(sel, [1]);
});

test('aperçu : la démo de virtualisation est servie et se compile', async () => {
  const { startDevServer } = await import('../scripts/dev/server.mjs');
  const srv = await startDevServer({ port: 0 });
  try {
    const base = `http://127.0.0.1:${srv.address().port}`;
    const page = await fetch(base + '/demo/virtual');
    assert.equal(page.status, 200);
    const js = await fetch(base + '/demo/virtual.js');
    assert.equal(js.status, 200);
    assert.match(await js.text(), /vtile/);
  } finally { srv.close(); }
});

test('images : la ligne de marge au-dessus du visible est aussi chargée', () => {
  const { g, layer } = grid();
  g.setFocus(2500);
  const above = layer.children.filter((t) => xy(t)[1] < layerY(layer) * -1 && t.children[0].getAttribute('src'));
  assert.ok(above.length >= 5, 'ligne de marge supérieure sans image');
});
