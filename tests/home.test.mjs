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
const APPS = ['plex-int', 'plex', 'netflix', 'youtube', 'disney', 'canal', 'a7', 'a8', 'a9', 'a10', 'a11', 'a12', 'a13', 'a14', 'a15', 'a16', 'a17', 'a18', 'a19', 'a20'];
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
  assert.deepEqual(byClass(p.el, 'pastille').map((x) => x.textContent), ['Réglages', 'Smart Hub']);
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

const clsOf = (p) => p.el.className.split(' ');
const bacTop = (p) => (clsOf(p).includes('defile') ? 690 - 520 : 690);
const ox = (rail) => { const m = /translateX\((-?[\d.]+)px\)/.exec(rail.style.transform || ''); return m ? Number(m[1]) : 0; };

test('Grille (défaut) : classe grille, pas de remontée sur la 1re rangée', () => {
  const { p } = mount();
  assert.deepEqual(clsOf(p), ['home', 'grille']);
  assert.equal(ty(one(p.el, 'rail')), 0);
});

for (const n of [4, 10, 20]) {
  test(`Grille, ${n} apps : la page défile dès la 2e rangée, rangée focalisée toujours entière, retour à l'accueil d'origine`, () => {
    const m = mount({}, n);
    const rail = one(m.p.el, 'rail');
    const rows = Math.ceil(n / 4);
    const check = (i) => {
      assert.ok(byClass(m.p.el, 'tuile')[i].className.includes('focus'), 'focus sur ' + i);
      const row = Math.floor(i / 4), box = H.tileBox(i);
      assert.equal(clsOf(m.p).includes('defile'), row >= 1, 'defile rangée ' + row);
      assert.equal(Math.abs(ty(rail)), H.railOffset(row));
      assert.ok(box.top >= bacTop(m.p) + 17 && box.bottom <= 1080 - 17, `tuile ${i} : ${box.top}–${box.bottom}`);
    };
    check(0);
    for (let r = 1; r < rows; r++) { m.press('down'); check(Math.min(r * 4, n - 1)); }
    if (rows > 1) assert.ok(clsOf(m.p).includes('defile'));
    for (let r = rows - 1; r >= 1; r--) { m.press('up'); check(Math.min((r - 1) * 4, n - 1) === 0 ? 0 : Math.min((r - 1) * 4, n - 1)); }
    assert.deepEqual(clsOf(m.p), ['home', 'grille']);
    assert.equal(ty(rail), 0);
    // toutes les tuiles, une à une
    for (let i = 0; i < n; i++) {
      const q = mount({}, n);
      for (let d = 0; d < Math.floor(i / 4); d++) q.press('down');
      for (let c = 0; c < i % 4; c++) q.press('right');
      const box = H.tileBox(i), top = bacTop(q.p);
      assert.ok(box.top >= top + 17 && box.bottom <= 1080 - 17, `tuile ${i}`);
    }
  });
}

test('Grille, 20 apps : 3 rangées entières visibles à la fois une fois la page remontée', () => {
  const m = mount({}, 20);
  m.press('down');
  const top = bacTop(m.p);
  const seen = [0, 1, 2].filter((r) => { const b = H.tileBox(r * 4); return b.top >= top && b.bottom <= 1080; });
  assert.deepEqual(seen, [0, 1, 2]);
});

test('Grille : titre et description restent lisibles (pas de remontée hors écran), l’en-tête remonte par transform', () => {
  const css = readFileSync('packages/launcher/src/home/home.css', 'utf8');
  assert.match(css, /\.home\.defile \.entete[^{]*\{transform:translateY\(-520px\)/);
  assert.match(css, /\.home\.defile \.bac\{transform:translateY\(-520px\)/);
  const t = /\.home\.defile \.titre\{transform:translateY\((-?\d+)px\) scale\(([\d.]+)\)/.exec(css);
  assert.ok(t, 'titre compact');
  assert.ok(520 + Number(t[1]) >= 0 && 520 + Number(t[1]) + 120 * Number(t[2]) <= 170, 'titre au-dessus du bac remonté');
  const d = /\.home\.defile \.desc\{transform:translateY\((-?\d+)px\)/.exec(css);
  assert.ok(646 + Number(d[1]) >= 0 && 646 + Number(d[1]) + 30 <= 170, 'description au-dessus du bac remonté');
  for (const m of css.matchAll(/^\.home\.defile[^{]*\{([^}]*)\}/gm)) if (!/message/.test(m[0])) assert.doesNotMatch(m[1], /\b(top|left|width|height|margin)\s*:/, m[0]);
});

test('page : le défilement ne touche que transform et classes (le bac ne change pas de top)', () => {
  const { p, press } = mount();
  press('down');
  const rail = one(p.el, 'rail');
  assert.match(rail.style.transform, /^translateY\(-?\d+px\)$/);
  const bac = one(p.el, 'bac');
  assert.equal(bac.style.transform, undefined);
  assert.equal(bac.style.top, undefined);
});

for (const n of [4, 10, 20]) {
  test(`Une rangée, ${n} apps : défilement horizontal, tuile focalisée entière, suivante esquissée à droite`, () => {
    const m = mount({ mode: 'rangee' }, n);
    const rail = one(m.p.el, 'rail');
    assert.deepEqual(clsOf(m.p), ['home', 'rangee']);
    for (let i = 0; i < n; i++) {
      assert.ok(byClass(m.p.el, 'tuile')[i].className.includes('focus'));
      const left = H.rowTileLeft(i) + ox(rail), right = left + H.rowTileW(4);
      assert.ok(left >= 25 && right <= H.BAC_W - 25, `tuile ${i} : ${left}–${right}`); // anneau + agrandissement ≈ 25 px
      if (i < n - 1 && H.rowOffset(i, n) > 0) {
        const nextLeft = H.rowTileLeft(i + 1) + ox(rail);
        assert.ok(nextLeft < H.BAC_W - 40 && nextLeft + 40 > right, 'la suivante est visible en partie');
      }
      assert.ok(!clsOf(m.p).includes('defile'));
      m.press('right');
    }
    for (let i = n - 1; i >= 0; i--) { // retour à gauche : la tuile reste entière
      const left = H.rowTileLeft(i) + ox(rail);
      assert.ok(left >= 25 && left + H.rowTileW(4) <= H.BAC_W - 25, `retour ${i}`);
      m.press('left');
    }
    if (n === 4) assert.equal(ox(rail), 0, 'tout tient : pas de défilement');
    else assert.ok(H.rowOffset(n - 1, n) > 0);
  });
}

test('Une rangée : haut → pastilles, bas sans effet, Entrée lance l’app focalisée', () => {
  const m = mount({ mode: 'rangee' }, 10);
  m.press('right', 'right', 'down');
  assert.equal(one(m.p.el, 'titre').textContent, 'NETFLIX');
  m.press('enter');
  assert.deepEqual(m.calls.launch, ['netflix']);
  m.press('up');
  assert.equal(one(m.p.el, 'titre').textContent, 'Réglages');
  m.press('down');
  assert.equal(one(m.p.el, 'titre').textContent, 'NETFLIX');
});

test('setMode : bascule grille ↔ une rangée sans reconstruire les tuiles', () => {
  const m = mount({}, 10);
  m.press('down');
  const t0 = byClass(m.p.el, 'tuile')[0];
  m.p.setMode('rangee');
  assert.deepEqual(clsOf(m.p), ['home', 'rangee']);
  assert.equal(byClass(m.p.el, 'tuile')[0], t0);
  m.press('right');
  assert.equal(one(m.p.el, 'titre').textContent, 'PLEX');
  m.p.setCatalog(catalog(6));
  m.press('right', 'right');
  assert.equal(one(m.p.el, 'titre').textContent, 'YOUTUBE');
  m.p.setMode('grille');
  assert.deepEqual(clsOf(m.p), ['home', 'grille']);
  assert.equal(ty(one(m.p.el, 'rail')), 0);
});

test('mode : préférence mémorisée dans cimaise.v1 (prefs.homeMode), défaut grille, valeur inconnue → grille', () => {
  const mem = () => { const d = {}; return { d, getItem: (k) => (k in d ? d[k] : null), setItem: (k, v) => { d[k] = String(v); } }; };
  const st = mem();
  assert.equal(H.loadHomeMode(st), 'grille');
  H.saveHomeMode('rangee', st);
  assert.equal(JSON.parse(st.d['cimaise.v1']).prefs.homeMode, 'rangee');
  assert.equal(JSON.parse(st.d['cimaise.v1']).version, 2);
  assert.equal(H.loadHomeMode(st), 'rangee');
  H.saveHomeMode('grille', st);
  assert.equal(H.loadHomeMode(st), 'grille');
  const other = mem();
  other.setItem('cimaise.v1', JSON.stringify({ version: 1, prefs: { catalog: { version: 1, entries: [] }, homeMode: 'rangee' } }));
  H.saveHomeMode('grille', other);
  assert.deepEqual(JSON.parse(other.d['cimaise.v1']).prefs.catalog, { version: 1, entries: [] }, 'les autres préférences sont conservées');
  const junk = mem();
  junk.setItem('cimaise.v1', JSON.stringify({ version: 1, prefs: { homeMode: 'diagonale' } }));
  assert.equal(H.loadHomeMode(junk), 'grille');
  junk.setItem('cimaise.v1', '{pas du json');
  assert.equal(H.loadHomeMode(junk), 'grille');
  const v0 = mem();
  v0.setItem('cimaise.v1', JSON.stringify({ homeMode: 'rangee' })); // ancien schéma à plat : migré
  assert.equal(H.loadHomeMode(v0), 'rangee');
});

test('coins : rayons concentriques bac / tuile agrandie, marge intérieure suffisante dans les deux modes', () => {
  const css = readFileSync('packages/launcher/src/home/home.css', 'utf8');
  const num = (re) => Number(re.exec(css)[1]);
  const R = num(/\.bac\{[^}]*border-radius:(\d+)px/), r = num(/\.tuile\{[^}]*border-radius:(\d+)px/);
  const pad = num(/\.rail\{padding:(\d+)px/), gap = num(/\.rail\{[^}]*grid-gap:(\d+)px/);
  const ring = num(/\.tuile\.focus\{[^}]*0 0 0 (\d+)px/), scale = num(/\.tuile\.focus\{transform:scale\(([\d.]+)\)/);
  assert.equal(pad, H.PAD);
  const gridW = (H.BAC_W - 2 * pad - 3 * gap) / 4;
  for (const w of [gridW, H.rowTileW(4)]) {
    const marge = pad - (w * (scale - 1)) / 2 - ring * scale; // bord du bac → anneau de la tuile agrandie (la plus serrée : horizontale)
    assert.ok(marge >= 12, 'la tuile de bord déborde ou frôle le bac : ' + marge);
    const outer = r * scale + ring * scale; // rayon extérieur de l'anneau
    assert.ok(Math.abs(R - outer - marge) <= 3, `rayons non concentriques : bac ${R}, anneau ${outer}, marge ${marge}`);
  }
  assert.ok((pad - (216 * (scale - 1)) / 2 - ring * scale) >= 12, 'marge verticale');
  assert.match(css, /\.home\.rangee \.tuile\{[^}]*width:378px/);
  assert.equal(H.rowTileW(4), 378);
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
  pa.press('up', 'right', 'right', 'enter'); // Réseau n'est plus focalisable : le focus s'arrête sur Smart Hub
  assert.deepEqual(pa.calls.pastille, ['smarthub']);
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
  assert.equal(log.length, 0, 'la teinte ne bouge pas pendant les appuis');
  tm.pending().filter((t) => t.ms === 150).forEach((t) => t.fn()); // arrêt du focus
  assert.equal(log.length, 1);
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
  assert.equal(tm.pending().filter((t) => t.ms === 150).length, 1, 'une seule teinte en attente');
  tm.pending().filter((t) => t.ms === 150)[0].fn();
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

test('tuile sans ID : message clair, aucun lancement, pas d’erreur de diagnostic', () => {
  const { p, press, calls, tm } = mount({ catalog: [{ id: '', name: 'Netflix', color: '#e50914', type: 'tv' }] }, 1);
  press('enter');
  assert.deepEqual(calls.launch, []);
  assert.equal(calls.errors.length, 0);
  const m = one(p.el, 'message');
  assert.equal(m.textContent, 'Netflix : ID inconnu, va dans Réglages → Découvrir');
  assert.ok(m.className.split(' ').includes('on'));
  tm.pending().at(-1).fn();
  assert.equal(m.textContent, '');
});

test('échec de lancement (rappel ou exception) : message « lancement impossible »', () => {
  let fail;
  const a = mount({ launchApp: (id, ok, f) => { fail = f; } }, 3);
  a.press('right', 'enter');
  fail(new Error('refus'));
  assert.equal(one(a.p.el, 'message').textContent, 'PLEX : lancement impossible');
  const b = mount({ launchApp: () => { throw new Error('NO_TIZEN'); } }, 3);
  b.press('right', 'enter');
  assert.equal(one(b.p.el, 'message').textContent, 'PLEX : lancement impossible');
});

const kcat = [
  { id: 'a', name: 'Netflix', color: '#e50914', type: 'tv' },
  { id: 'b', name: 'Disney+', color: '#113ccf', type: 'tv', icon: 'file:///tv/d.png' },
  { id: 'c', name: 'Ma super app', color: '#5a5a5f', type: 'tv' },
];

test('Dock : logo large de la bibliothèque d’abord, icône TV en dernier recours, le nom si rien', () => {
  const { p } = mount({ catalog: kcat });
  const [n, d, c] = byClass(p.el, 'tuile');
  assert.equal(n.children[0].attrs.src, 'logos/netflix.png');
  assert.equal(d.children[0].attrs.src, 'logos/disney.png', 'le logo passe avant l’icône de la TV');
  d.children[0].onerror();
  assert.equal(d.children[0].attrs.src, 'file:///tv/d.png', 'logo illisible : icône de la TV');
  assert.equal(c.children.length, 0);
  assert.equal(c.textContent, 'Ma super app', 'nom en grand, pas une initiale');
});

test('Dock : app inconnue avec icône TV → son nom, aucune <img> (l’icône carrée n’est pas chargée)', () => {
  const { p } = mount({ catalog: [{ id: 'x', name: 'Ma super app', color: '#8a3ffc', type: 'tv', icon: 'file:///tv/x.png' }] });
  const [x] = byClass(p.el, 'tuile');
  assert.equal(x.children.length, 0);
  assert.equal(x.textContent, 'Ma super app');
  assert.equal(x.style.background, '#8a3ffc');
});

test('Dock : la tuile prend la couleur de marque de la bibliothèque ; app inconnue, la couleur de l’app', () => {
  const { p } = mount({ catalog: [...kcat, { id: 'h', name: 'Smart Hub', color: '#5a5a5f', type: 'tv' }] });
  const [n, d, c, h] = byClass(p.el, 'tuile');
  assert.equal(n.style.background, '#e50914', 'Netflix : rouge de la marque');
  assert.match(d.style.background, /^#[0-9a-f]{6}$/i);
  assert.equal(d.style.background, '#0e1a3d', 'Disney+ : bleu nuit de la bibliothèque, pas la couleur de l’app');
  assert.equal(c.style.background, '#5a5a5f', 'app inconnue : sa couleur');
  assert.equal(h.style.background, '#1428a0', 'Smart Hub sans logo : bleu Samsung de la bibliothèque');
  assert.equal(h.style.color, '#fff');
  assert.equal(h.textContent, 'Smart Hub');
  assert.equal(h.children.length, 0);
});

test('Dock : la teinte du fond d’écran suit toujours la couleur de l’app, pas le fond du logo', () => {
  const { p, tm } = mount({ catalog: kcat });
  tm.list.filter((x) => x.live).forEach((x) => x.fn());
  assert.match(byClass(p.el, 'fond').map((f) => f.style.background).join('|'), /rgba\(229,9,20/); // Netflix #e50914, pas blanc
});

test('Dock : description de l’app focalisée sous le titre, vide pour une app inconnue', () => {
  const { p, press } = mount({ catalog: kcat });
  assert.equal(one(p.el, 'titre').textContent, 'Netflix');
  assert.equal(one(p.el, 'desc').textContent, 'Séries, films et documentaires en streaming.');
  press('right', 'right');
  assert.equal(one(p.el, 'titre').textContent, 'Ma super app');
  assert.equal(one(p.el, 'desc').textContent, '');
});

test('latence : le focus bouge tout de suite, la teinte suit après 150 ms sans bloquer', () => {
  const { p, tm, press, log } = mount();
  log.length = 0;
  press('right');
  const tuiles = byClass(p.el, 'tuile');
  assert.ok(tuiles[1].className.split(' ').includes('focus'));
  assert.equal(log.length, 0);
  assert.ok(tm.pending().some((t) => t.ms === 150));
});

test('latence : dégradé en 960×540 mis à l’échelle, tuiles et calques promus, titre/description en hauteur fixe', () => {
  const css = readFileSync('packages/launcher/src/home/home.css', 'utf8');
  assert.match(css, /\.fond\{[^}]*width:960px;height:540px[^}]*transform:scale\(2\)/);
  assert.match(css, /\.tuile\{[^}]*will-change:transform/);
  assert.match(css, /\.fond\{[^}]*will-change:opacity/);
  assert.match(css, /\.titre\{[^}]*height:\d+px/);
  assert.match(css, /\.desc\{[^}]*height:\d+px/);
});

// --- Tuiles à l'écran : 4 / 5 / 6 ---
const cssOf = () => readFileSync('packages/launcher/src/home/home.css', 'utf8');
const nOf = (p) => { const m = /(?:^| )n(\d)(?: |$)/.exec(p.el.className); return m ? Number(m[1]) : 4; };

test('tuiles : modèle — 4 / 5 / 6, défaut 4, valeur inconnue → 4, largeur déduite du bac, hauteur au même ratio', () => {
  assert.deepEqual(H.TILES_CHOICES, [4, 5, 6]);
  assert.equal(H.DEFAULT_TILES, 4);
  for (const [v, e] of [[4, 4], [5, 5], [6, 6], [3, 4], [7, 4], ['6', 4], [undefined, 4], [null, 4]]) assert.equal(H.normalizeTiles(v), e, String(v));
  for (const n of [4, 5, 6]) {
    const w = H.tileW(n);
    assert.ok(Math.abs(n * w + (n - 1) * H.GAP - (H.BAC_W - 2 * H.PAD)) < 1e-6, 'n tuiles remplissent le bac : ' + n);
    assert.ok(Math.abs(H.tileH(n) - (w * 216) / 378) <= 1, 'ratio conservé : ' + n);
    assert.ok(H.rowTileW(n) <= w && H.rowTileW(n) > w - 1.5);
  }
  assert.equal(H.tileH(4), 216);
  assert.ok(H.tileH(6) < H.tileH(5) && H.tileH(5) < H.tileH(4));
});

for (const n of [4, 5, 6]) {
  test('tuiles ' + n + ' : grille à ' + n + ' colonnes, focus et défilement vertical corrects', () => {
    const m = mount({ tiles: n }, 20);
    assert.equal(nOf(m.p), n);
    assert.match(cssOf(), n === 4 ? /\.rail\{[^}]*repeat\(4,1fr\)/ : new RegExp('\\.home\\.n' + n + ' \\.rail\\{[^}]*repeat\\(' + n + ',1fr\\)'));
    m.press('down');
    assert.equal(one(m.p.el, 'titre').textContent, APPS[n].toUpperCase(), 'bas = +' + n);
    for (let i = 0; i < 20; i++) {
      const q = mount({ tiles: n }, 20);
      for (let d = 0; d < Math.floor(i / n); d++) q.press('down');
      for (let c = 0; c < i % n; c++) q.press('right');
      const box = H.tileBox(i, n), top = bacTop(q.p);
      assert.ok(box.top >= top + 17 && box.bottom <= 1080 - 17, 'n=' + n + ' tuile ' + i + ' : ' + box.top + '–' + box.bottom);
      assert.equal(Math.abs(ty(one(q.p.el, 'rail'))), H.railOffset(Math.floor(i / n), n));
    }
  });

  test('tuiles ' + n + ' : une rangée — les ' + n + ' premières tuiles entières, défilement horizontal ensuite, suivante esquissée', () => {
    const total = 14, w = H.rowTileW(n);
    const m = mount({ mode: 'rangee', tiles: n }, total);
    const rail = one(m.p.el, 'rail');
    assert.equal(nOf(m.p), n);
    for (let i = 0; i < total; i++) {
      const left = H.rowTileLeft(i, n) + ox(rail), right = left + w;
      assert.ok(left >= 25 && right <= H.BAC_W - 25, 'n=' + n + ' tuile ' + i + ' : ' + left + '–' + right);
      if (i < n) assert.equal(ox(rail), 0, 'les ' + n + ' premières sans défilement (' + i + ')');
      else if (i < total - 1) assert.ok(H.rowTileLeft(i + 1, n) + ox(rail) < H.BAC_W - 40, 'la suivante dépasse à droite');
      m.press('right');
    }
    for (let i = total - 1; i >= 0; i--) {
      const left = H.rowTileLeft(i, n) + ox(rail);
      assert.ok(left >= 25 && left + w <= H.BAC_W - 25, 'retour ' + i);
      m.press('left');
    }
    assert.equal(ox(rail), 0);
  });
}

test('tuiles : peu d’apps → rien ne défile en une rangée', () => {
  const m = mount({ mode: 'rangee', tiles: 6 }, 6);
  for (let i = 0; i < 6; i++) { assert.equal(ox(one(m.p.el, 'rail')), 0); m.press('right'); }
});

test('setTiles : appliqué tout de suite, sans reconstruire les tuiles, focus conservé, valeur inconnue → 4', () => {
  const m = mount({}, 20);
  m.press('right', 'right', 'right');
  const t0 = byClass(m.p.el, 'tuile')[0];
  m.p.setTiles(6);
  assert.equal(nOf(m.p), 6);
  assert.equal(byClass(m.p.el, 'tuile')[0], t0);
  assert.equal(one(m.p.el, 'titre').textContent, 'YOUTUBE', 'le focus reste sur la même tuile');
  m.press('down');
  assert.equal(one(m.p.el, 'titre').textContent, APPS[9].toUpperCase(), 'colonnes = 6');
  m.p.setTiles(5);
  assert.equal(nOf(m.p), 5);
  m.p.setMode('rangee');
  assert.deepEqual(clsOf(m.p).slice(0, 2), ['home', 'rangee']);
  assert.ok(clsOf(m.p).includes('n5'));
  m.p.setTiles(4);
  assert.deepEqual(clsOf(m.p), ['home', 'rangee']);
  m.p.setTiles(9);
  assert.equal(nOf(m.p), 4);
});

test('tuiles : logo large centré à 60–70 % de la largeur, sans cadre, nom lisible à 4/5/6, rayons concentriques', () => {
  const css = cssOf();
  const img = /\.home \.tuile img\{([^}]*)\}/.exec(css)[1];
  const pct = Number(/width:(\d+)%/.exec(img)[1]);
  assert.ok(pct >= 60 && pct <= 70, 'largeur du logo : ' + pct + ' %');
  assert.match(img, /object-fit:contain/);
  assert.doesNotMatch(img, /border-radius|box-shadow|background|border:/, 'aucun cadre autour du logo');
  assert.doesNotMatch(css, /\.tuile img\{[^}]*\b\d+px/, 'le logo suit la tuile en %, aucune taille fixe');
  const pad = H.PAD, ring = 6, scale = 1.1, R = Number(/\.bac\{[^}]*border-radius:(\d+)px/.exec(css)[1]);
  for (const n of [5, 6]) {
    const rule = (sel) => new RegExp('\\.home\\.n' + n + ' ' + sel + '\\{([^}]*)\\}').exec(css)[1];
    const tuile = rule('\\.tuile');
    const h = Number(/height:(\d+)px/.exec(tuile)[1]), r = Number(/border-radius:(\d+)px/.exec(tuile)[1]), fs = Number(/font-size:(\d+)px/.exec(tuile)[1]);
    assert.equal(h, Math.round(H.tileH(n)), 'hauteur = ratio : ' + n);
    assert.ok(fs >= (n === 6 ? 26 : 34), 'nom en grand à ' + n + ' : ' + fs);
    const w = H.tileW(n), marge = pad - (w * (scale - 1)) / 2 - ring * scale;
    assert.ok(marge >= 12);
    assert.ok(Math.abs(R - (r * scale + ring * scale) - marge) <= 3, 'rayons ' + n);
    assert.match(css, new RegExp('\\.home\\.rangee\\.n' + n + ' \\.tuile\\{[^}]*width:' + Math.floor(H.rowTileW(n)) + 'px'));
  }
  assert.match(/\.home \.tuile\{([^}]*)\}/.exec(css)[1], /font-size:(4\d|5\d)px/, 'nom en grand à 4 tuiles');
  assert.doesNotMatch(css, /url\((?!fonts\/)/, 'pas de nouvelle image');
});

test('tuiles : préférence mémorisée dans cimaise.v1 (prefs.homeTiles), défaut 4, valeur inconnue → 4, migration d’un v1', () => {
  const mem = () => { const d = {}; return { d, getItem: (k) => (k in d ? d[k] : null), setItem: (k, v) => { d[k] = String(v); } }; };
  const st = mem();
  assert.equal(H.loadHomeTiles(st), 4);
  H.saveHomeTiles(6, st);
  const saved = JSON.parse(st.d['cimaise.v1']);
  assert.equal(saved.prefs.homeTiles, 6);
  assert.equal(saved.version, 2);
  assert.equal(H.loadHomeTiles(st), 6);
  H.saveHomeMode('rangee', st);
  assert.equal(H.loadHomeTiles(st), 6, 'le mode n’écrase pas les tuiles');
  assert.equal(H.loadHomeMode(st), 'rangee');
  const old = mem();
  old.setItem('cimaise.v1', JSON.stringify({ version: 1, prefs: { homeMode: 'rangee', catalog: { version: 1, entries: [] } } }));
  assert.equal(H.loadHomeTiles(old), 4, 'v1 migré : 4 par défaut');
  H.saveHomeTiles(5, old);
  const m = JSON.parse(old.d['cimaise.v1']);
  assert.deepEqual([m.version, m.prefs.homeMode, m.prefs.homeTiles, m.prefs.catalog.version], [2, 'rangee', 5, 1]);
  const junk = mem();
  junk.setItem('cimaise.v1', JSON.stringify({ version: 2, prefs: { homeTiles: 8 } }));
  assert.equal(H.loadHomeTiles(junk), 4);
  junk.setItem('cimaise.v1', '{pas du json');
  assert.equal(H.loadHomeTiles(junk), 4);
});

test('Réseau : alerte non focalisable, visible seulement si coupé, pilotée par événement', () => {
  let push = null, stopped = 0;
  const watch = (cb) => { push = cb; return () => stopped++; };
  const { p } = mount({ watchNetwork: watch });
  const alerte = () => one(p.el, 'reseau');
  assert.equal(alerte().textContent, 'Réseau coupé');
  assert.equal(alerte().className.includes('on'), false, 'caché tant que le réseau est là');
  assert.equal(byClass(p.el, 'pastille').some((x) => x.textContent.includes('Réseau')), false);
  push(false);
  assert.equal(alerte().className.includes('on'), true);
  push(true);
  assert.equal(alerte().className.includes('on'), false);
  p.destroy();
  assert.equal(stopped, 1, 'écoute retirée à la destruction');
});

test('Réseau : hors TV (API absente) l’indicateur reste caché, sans planter', () => {
  const { p } = mount({ watchNetwork: () => { throw new Error('NO_WEBAPIS'); } });
  assert.equal(one(p.el, 'reseau').className.includes('on'), false);
});

test('Réseau : l’état initial coupé s’affiche tout de suite', () => {
  const { p } = mount({ watchNetwork: (cb) => { cb(false); return () => {}; } });
  assert.equal(one(p.el, 'reseau').className.includes('on'), true);
});

test('Préférence Smart Hub : ID configurable, vide par défaut', () => {
  const m = {};
  const store = { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; } };
  assert.equal(H.loadSmartHubTarget(store), '');
  H.saveSmartHubTarget('x.y', store);
  assert.equal(H.loadSmartHubTarget(store), 'x.y');
});

test('Dock : Plex officiel porte la mention « officiel » sous le logo, Plex intégré non', () => {
  const { p } = mount({ catalog: [
    { id: 'plex', name: 'Plex intégré', color: '#e5a00d', type: 'interne' },
    { id: 'o', name: 'Plex officiel', color: '#3a3d42', type: 'tv' },
  ] });
  const [i, o] = byClass(p.el, 'tuile');
  assert.equal(i.style.background, '#e5a00d');
  assert.equal(o.style.background, '#000000');
  assert.equal(i.children[0].attrs.src, 'logos/plex-integre.png');
  assert.equal(o.children[0].attrs.src, 'logos/plex.png');
  assert.equal(i.children.length, 1);
  assert.equal(o.children.length, 2);
  assert.equal(o.children[1].textContent, 'officiel');
  assert.match(o.children[0].className, /avec-mention/, 'le logo remonte pour laisser la place');
  assert.equal(o.children[1].className, 'mention');
  assert.doesNotMatch(i.children[0].className || '', /avec-mention/);
});
