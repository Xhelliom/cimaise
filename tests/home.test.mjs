import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, statSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';

let H, TV, dir;
async function bundle(es5Dir, rel, name) {
  const out = join(dir, name + '.cjs');
  await build({ entryPoints: [join(es5Dir, rel)], bundle: true, format: 'cjs', target: 'es5', outfile: out, logLevel: 'warning' });
  return createRequire(import.meta.url)(out);
}
before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'home-'));
  const es5Dir = join(dir, 'es5');
  const t = spawnSync('node_modules/.bin/tsc', ['-p', 'packages/launcher/tsconfig.json', '--outDir', es5Dir], { encoding: 'utf8' });
  assert.equal(t.status, 0, t.stdout + t.stderr);
  H = await bundle(es5Dir, 'launcher/src/home/index.js', 'home');
  TV = await bundle(es5Dir, 'tv-core/src/index.js', 'tv');
});

// Faux DOM : style enregistre les écritures de background avec l'état du calque à cet instant.
function fakeDoc(log) {
  const mk = (tag) => {
    const bgOf = { v: '' };
    const el = {
      tag, children: [], parent: null, className: '', textContent: '', attrs: {}, offsetWidth: 1,
      appendChild(c) { c.parent = el; el.children.push(c); return c; },
      removeChild(c) { el.children.splice(el.children.indexOf(c), 1); c.parent = null; return c; },
      setAttribute(k, v) { el.attrs[k] = v; },
      removeAttribute(k) { delete el.attrs[k]; },
    };
    el.style = new Proxy({}, {
      set(o, k, v) {
        if (k === 'background') log && log.push({ el, visible: el.className.split(' ').includes('on') && o.transition !== 'none' });
        o[k] = v; return true;
      },
    });
    Object.defineProperty(el, 'firstChild', { get: () => el.children[0] || null });
    return el;
  };
  return { createElement: mk, head: mk('head') };
}
const walk = (el) => [el, ...el.children.flatMap(walk)];
const byClass = (el, c) => walk(el).filter((x) => x.className.split(' ').includes(c));
const one = (el, c) => byClass(el, c)[0];

const D = (iso) => new Date(iso);
function timers() {
  const t = { list: [], set(fn, ms) { const e = { ms, live: true, fn: () => { e.live = false; fn(); } }; t.list.push(e); return t.list.length - 1; }, clear(h) { if (t.list[h]) t.list[h].live = false; } };
  t.pending = () => t.list.filter((x) => x.live);
  return t;
}
const APPS = ['plex-int', 'plex', 'netflix', 'youtube', 'disney', 'canal', 'a7', 'a8', 'a9', 'a10', 'a11', 'a12'];
const PAL = ['#e5a00d', '#e50914', '#c4302b', '#113ccf', '#1f8a5b', '#8a3ffc', '#d6336c', '#5a5a5f'];
const catalog = (n) => APPS.slice(0, n).map((id, i) => ({ id, name: id.toUpperCase(), color: PAL[i % PAL.length], type: i === 0 ? 'interne' : 'tv' }));

function mount(extra = {}, n = 12) {
  const log = [];
  const doc = fakeDoc(log);
  const tm = timers();
  const calls = { launch: [], pastille: [], internal: [], errors: [] };
  const p = H.createHome({
    catalog: catalog(n), doc, timer: tm, now: () => D('2026-10-29T20:45:10'),
    launchApp: (id) => calls.launch.push(id),
    openInternal: (id) => calls.internal.push(id),
    onPastille: (n) => calls.pastille.push(n),
    onError: (e) => calls.errors.push(e),
    ...extra,
  });
  return { p, log, doc, tm, calls, press: (...ks) => ks.forEach((k) => p.onKey(k)) };
}
const ty = (rail) => { const m = /translateY\((-?[\d.]+)px\)/.exec(rail.style.transform || ''); return m ? Number(m[1]) : 0; };

test('modèle : salutation selon l’heure, horloge et date en français', () => {
  assert.equal(H.greeting(3), 'Bonne nuit');
  assert.equal(H.greeting(5), 'Bonjour');
  assert.equal(H.greeting(11), 'Bonjour');
  assert.equal(H.greeting(12), 'Bon après-midi');
  assert.equal(H.greeting(17), 'Bon après-midi');
  assert.equal(H.greeting(18), 'Bonsoir');
  assert.equal(H.greeting(23), 'Bonsoir');
  assert.equal(H.formatClock(D('2026-10-29T07:05:00')), '07:05');
  assert.equal(H.formatDate(D('2026-10-29T20:45:00')), 'jeudi 29 octobre');
  assert.equal(H.formatDate(D('2026-01-01T00:00:00')), 'jeudi 1 janvier');
});

test('modèle : dégradé de teinte depuis la couleur hex', () => {
  assert.deepEqual(H.hexToRgb('#e50914'), [229, 9, 20]);
  assert.match(H.tintGradient('#e50914'), /radial-gradient\(ellipse 70% 60% at 32% 42%,rgba\(229,9,20,\.5\),rgba\(11,11,13,0\) 75%\)/);
});

test('écran : salutation, horloge, date, 3 pastilles, titre = app focalisée, 12 tuiles', () => {
  const { p } = mount();
  assert.equal(one(p.el, 'salut').textContent, 'Bonsoir');
  assert.equal(one(p.el, 'horloge').textContent, '20:45');
  assert.equal(one(p.el, 'date').textContent, 'jeudi 29 octobre');
  assert.deepEqual(byClass(p.el, 'pastille').map((x) => x.textContent), ['Réglages', 'Smart Hub', 'Réseau']);
  assert.equal(byClass(p.el, 'tuile').length, 12);
  assert.equal(one(p.el, 'titre').textContent, 'PLEX-INT');
  assert.equal(byClass(p.el, 'focus').length, 1);
  assert.equal(byClass(p.el, 'fond').length, 2);
});

test('focus : D-pad via le moteur tv-core, un seul élément focalisé, titre suivi', () => {
  const { p, press } = mount();
  press('right', 'right');
  assert.equal(one(p.el, 'titre').textContent, 'NETFLIX');
  assert.equal(byClass(p.el, 'tuile')[2].className.includes('focus'), true);
  press('down');
  assert.equal(one(p.el, 'titre').textContent, 'A7'); // 2 + 4 = 6
  press('up', 'up'); // rangée 0 → pastilles
  assert.equal(byClass(p.el, 'pastille').filter((x) => x.className.includes('focus')).length, 1);
  assert.equal(byClass(p.el, 'tuile').filter((x) => x.className.includes('focus')).length, 0);
  assert.equal(byClass(p.el, 'focus').length, 1);
  press('right');
  assert.equal(one(p.el, 'titre').textContent, 'Smart Hub');
  press('down');
  assert.equal(byClass(p.el, 'tuile').filter((x) => x.className.includes('focus')).length, 1);
  assert.equal(p.onKey('back'), false, 'Retour est laissé au routeur');
});

// Le bac coupe son contenu (overflow:hidden dès 690 px) : bord haut visible + marge anneau/agrandissement (17 px, comme en bas).
const BAC_VISIBLE_TOP = 690 + 17;

test('défilement : la tuile focalisée est entièrement visible, rangée 2 (et suivantes) comprise', () => {
  const { p, press } = mount();
  const rail = one(p.el, 'rail');
  const seen = [];
  const check = () => {
    const i = byClass(p.el, 'tuile').findIndex((x) => x.className.includes('focus'));
    const box = H.tileBox(i);
    const t = box.top + ty(rail), b = box.bottom + ty(rail);
    assert.ok(t >= BAC_VISIBLE_TOP && b <= 1080 - 17, `tuile ${i} : ${t}–${b}`);
    seen.push(i);
  };
  check();
  for (const k of ['down', 'down', 'down']) { press(k); check(); }
  assert.deepEqual(seen.slice(0, 4), [0, 4, 8, 8], 'dernière rangée complète : reste sur place');
  press('right', 'right', 'right'); check();
  press('up'); check(); press('up'); // rangée 0 → pastilles : plus de tuile focalisée
  assert.equal(ty(rail), 0, 'rangée 1 : pas de décalage');
  // rangée 2 explicite, tuile par tuile
  for (let r = 0; r < 12; r++) {
    const m = mount();
    const row = Math.floor(r / 4);
    for (let d = 0; d < row; d++) m.press('down');
    for (let c = 0; c < r % 4; c++) m.press('right');
    const rl = one(m.p.el, 'rail');
    const box = H.tileBox(r);
    assert.ok(box.top + ty(rl) >= BAC_VISIBLE_TOP && box.bottom + ty(rl) <= 1080 - 17, `tuile ${r}`);
  }
  assert.ok(H.railOffset(1) > 0, 'la rangée 2 impose un défilement');
});

test('défilement par transform seulement (le bac ne bouge pas)', () => {
  const { p, press } = mount();
  press('down');
  const rail = one(p.el, 'rail');
  assert.match(rail.style.transform, /^translateY\(-\d+px\)$/);
  const bac = one(p.el, 'bac');
  assert.equal(bac.style.transform, undefined);
  assert.equal(bac.style.top, undefined);
});

test('Entrée : launchApp avec l’id ; module interne via callback ; erreur remontée', () => {
  const { p, calls, press } = mount();
  press('right', 'enter');
  assert.deepEqual(calls.launch, ['plex']);
  const m = mount();
  m.press('enter');
  assert.deepEqual(m.calls.internal, ['plex-int']);
  assert.deepEqual(m.calls.launch, []);
  const e = mount({ launchApp: () => { throw new Error('NO_TIZEN'); } });
  e.press('right', 'enter');
  assert.equal(e.calls.errors.length, 1);
  assert.equal(e.calls.errors[0].message, 'NO_TIZEN');
  const pa = mount();
  pa.press('up', 'right', 'right', 'enter');
  assert.deepEqual(pa.calls.pastille, ['reseau']);
  const pb = mount();
  pb.press('up', 'enter');
  assert.deepEqual(pb.calls.pastille, ['reglages']);
});

test('Entrée sur Plex intégré ouvre le module interne via le routeur (pile, Retour dépile)', () => {
  const root = { children: [], appendChild(c) { c.parent = root; root.children.push(c); return c; }, removeChild(c) { root.children.splice(root.children.indexOf(c), 1); c.parent = null; return c; } };
  const router = new TV.Router({ root, exit: () => {} });
  const mod = TV.lazy((done) => done({ build: () => ({ el: { parent: null } }) }));
  const { p } = mount({ openInternal: () => router.pushLazy(mod, (m) => m.build()) });
  router.push(p);
  assert.equal(router.depth, 1);
  router.handleKey('enter');
  assert.equal(router.depth, 2);
  router.handleKey('back');
  assert.equal(router.depth, 1);
});

test('teinte : fondu d’opacity entre 2 calques, couleur écrite uniquement sur un calque caché', () => {
  const { p, log, press, tm } = mount();
  const fonds = byClass(p.el, 'fond');
  assert.equal(fonds.filter((f) => f.className.split(' ').includes('on')).length, 1);
  log.length = 0;
  press('right');
  press('right');
  press('right'); // appuis rapprochés
  assert.ok(log.length >= 3);
  assert.ok(log.every((w) => !w.visible), 'écriture sur un calque visible');
  assert.ok(log.every((w) => fonds.includes(w.el)), 'background écrit ailleurs que sur un calque');
  tm.pending().filter((t) => t.ms < 1000).forEach((t) => t.fn()); // fin du fondu
  const on = fonds.filter((f) => f.className.split(' ').includes('on'));
  assert.equal(on.length, 1);
  assert.match(on[0].style.background, /rgba\(17,60,207/); // 4ᵉ teinte de la palette (index 3)
  // aucune autre propriété de couleur animée
  for (const el of walk(p.el)) assert.ok(!('transition' in el.style) || /^none$|^$/.test(el.style.transition || ''), 'transition inline');
});

test('teinte : après le fondu, l’ancien calque est éteint (minuterie annulée aux appuis rapides)', () => {
  const { p, tm, press } = mount();
  press('right');
  press('right');
  const pend = tm.pending().filter((t) => t.ms < 1000);
  assert.equal(pend.length, 1, 'une seule extinction en attente');
  pend[0].fn();
  assert.equal(byClass(p.el, 'fond').filter((f) => f.className.split(' ').includes('on')).length, 1);
});

test('horloge : seule minuterie au repos, alignée sur la minute ; suspend/resume/destroy', () => {
  let now = D('2026-10-29T20:45:10.500');
  const { p, tm } = mount({ now: () => now });
  let live = tm.pending();
  assert.equal(live.length, 1);
  assert.equal(live[0].ms, 60000 - (10 * 1000 + 500));
  now = D('2026-10-29T20:46:00.000');
  live[0].fn();
  assert.equal(one(p.el, 'horloge').textContent, '20:46');
  assert.equal(tm.pending().length, 1);
  p.suspend();
  assert.equal(tm.pending().length, 0);
  now = D('2026-10-29T23:10:00');
  p.resume();
  assert.equal(one(p.el, 'horloge').textContent, '23:10');
  assert.equal(one(p.el, 'salut').textContent, 'Bonsoir');
  assert.equal(tm.pending().length, 1);
  p.destroy();
  assert.equal(tm.pending().length, 0);
});

test('setCatalog : reconstruit les tuiles, ramène le focus dans les bornes', () => {
  const { p, press } = mount({}, 12);
  press('down', 'down');
  p.setCatalog(catalog(3));
  assert.equal(byClass(p.el, 'tuile').length, 3);
  assert.equal(byClass(p.el, 'focus').length, 1);
  assert.equal(ty(one(p.el, 'rail')), 0);
  p.setCatalog([]);
  assert.equal(byClass(p.el, 'tuile').length, 0);
  press('down', 'enter'); // ne plante pas
});

test('Haut remonte d’une seule rangée (pas de double déplacement), puis passe aux pastilles', () => {
  const { p, press } = mount();
  const titre = () => one(p.el, 'titre').textContent;
  press('down', 'down', 'left'); // rangée 3, colonne 0 : tuile 8
  assert.equal(titre(), 'A9');
  press('up');
  assert.equal(titre(), 'DISNEY'); // tuile 4 : rangée 2
  press('up');
  assert.equal(titre(), 'PLEX-INT'); // tuile 0 : rangée 1
  press('up');
  assert.equal(titre(), 'Réglages'); // pastilles
  const q = mount();
  q.press('down', 'down', 'right', 'right', 'right'); // tuile 11
  q.press('up');
  assert.equal(one(q.p.el, 'titre').textContent, 'A8'); // tuile 7, pas 3
});

test('CSS : une police Outfit 2 graisses embarquée, pas de flou, pas de couleur animée', () => {
  const dirH = 'packages/launcher/src/home/';
  const css = readFileSync(dirH + 'home.css', 'utf8');
  assert.equal((css.match(/@font-face/g) ?? []).length, 1);
  assert.match(css, /url\(fonts\/outfit-latin\.woff2\)/);
  assert.ok(statSync(dirH + 'fonts/outfit-latin.woff2').size < 30 * 1024);
  assert.match(readFileSync(dirH + 'fonts/OFL.txt', 'utf8'), /Outfit/);
  assert.doesNotMatch(css, /backdrop-filter|filter\s*:|blur\(|@keyframes|animation\s*:/i);
  const poids = new Set([...css.matchAll(/font-weight\s*:\s*(\d+)/g)].map((m) => m[1]));
  assert.ok(poids.size <= 2, [...poids].join());
  for (const m of css.matchAll(/transition\s*:([^;}]+)/g)) assert.match(m[1], /^\s*(opacity|transform)\b/, m[1]);
  assert.match(css, /\.fond[^}]*transition\s*:\s*opacity/);
  const src = readFileSync(dirH + 'screen.ts', 'utf8');
  assert.doesNotMatch(src, /(body|documentElement|bac|rail|tuile\w*)\.style\.background/);
});

let server, base;
before(async () => {
  const { startDevServer } = await import('../scripts/dev/server.mjs');
  server = await startDevServer({ port: 0 });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server && server.close());

test('aperçu : la démo Dock est servie (page, js, css, police)', async () => {
  const page = await fetch(base + '/demo/home');
  assert.equal(page.status, 200);
  assert.match(await page.text(), /home\.css/);
  const js = await fetch(base + '/demo/home.js');
  assert.equal(js.status, 200);
  assert.match(await js.text(), /tuile/);
  assert.equal((await fetch(base + '/demo/home.css')).status, 200);
  const f = await fetch(base + '/demo/fonts/outfit-latin.woff2');
  assert.equal(f.status, 200);
  assert.match(f.headers.get('content-type'), /font\/woff2/);
});
