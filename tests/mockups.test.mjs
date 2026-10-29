import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';

const dir = 'packages/launcher/mockups/';
const pages = ['list', 'dock', 'art'];
const shortcuts = ['Plex intégré', 'Plex', 'Netflix', 'YouTube', 'Disney+', 'Canal+', 'Smart Hub', 'Réglages'];
let server, base;
before(async () => {
  const { startDevServer } = await import('../scripts/dev/server.mjs');
  server = await startDevServer({ port: 0 });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const countTags = (html) => (html.replace(/<head>[\s\S]*<\/head>/, '').replace(/<script[\s\S]*?<\/script>/g, '').match(/<[a-z][a-z0-9]*\b/gi) ?? []).length - 1; // sans <html>

test('3 maquettes servies par l’aperçu, avec index', async () => {
  const idx = await fetch(`${base}/mockups/`);
  assert.equal(idx.status, 200);
  const t = await idx.text();
  for (const p of pages) assert.match(t, new RegExp(`href="${p}\\.html"`));
  for (const p of pages) assert.equal((await fetch(`${base}/mockups/${p}.html`)).status, 200);
  assert.equal((await fetch(`${base}/mockups/mockups.css`)).status, 200);
  const f = await fetch(`${base}/mockups/outfit-latin.woff2`);
  assert.equal(f.status, 200);
  assert.match(f.headers.get('content-type'), /font\/woff2/);
  assert.equal((await fetch(`${base}/mockups/../../package.json`)).status, 404);
});

test('chaque maquette : heure, 8 raccourcis, un seul élément focalisé', () => {
  for (const p of pages) {
    const h = readFileSync(`${dir}${p}.html`, 'utf8');
    assert.match(h, /\d{2}:\d{2}/, p);
    for (const s of shortcuts) assert.ok(h.includes(`>${s}<`) || h.includes(`data-nom="${s}"`), `${p}: ${s}`);
    assert.equal((h.match(/class="[^"]*\bfocus\b/g) ?? []).length, 1, p);
  }
});

test('pas de backdrop-filter ni de flou, une seule police, pas d’image', () => {
  const css = readFileSync(`${dir}mockups.css`, 'utf8');
  for (const f of ['mockups.css', ...pages.map((p) => `${p}.html`), 'index.html']) {
    const s = readFileSync(dir + f, 'utf8');
    assert.doesNotMatch(s, /backdrop-filter|filter\s*:|blur\(/i, f);
  }
  assert.equal((css.match(/@font-face/g) ?? []).length, 1);
  assert.doesNotMatch(css, /url\((?!outfit-latin\.woff2)/);
  assert.ok(statSync(`${dir}outfit-latin.woff2`).size < 30 * 1024);
});

test('fiche coût par maquette, DOM annoncé = DOM réel', () => {
  const fiche = readFileSync(`${dir}COUTS.md`, 'utf8');
  for (const p of pages) {
    const m = fiche.match(new RegExp(`${p}\\.html[^\\n]*?DOM\\s*:\\s*(\\d+)`, 'i'));
    assert.ok(m, `DOM ${p}`);
    assert.equal(Number(m[1]), countTags(readFileSync(`${dir}${p}.html`, 'utf8')), p);
  }
  for (const w of ['Police', 'Fond', 'Effets']) assert.match(fiche, new RegExp(w));
});

test('dock v2 : éléments de la référence (salutation, horloge, pastilles, titre, bac, deux calques)', () => {
  const h = readFileSync(dir + 'dock.html', 'utf8');
  assert.match(h, /Bonsoir/);
  assert.match(h, /class="horloge"[^>]*>\d{1,2}:\d{2}</);
  assert.match(h, /class="date"/);
  assert.equal((h.match(/class="pastille"/g) ?? []).length, 3);
  assert.equal((h.match(/class="pastille"[^>]*tabindex="0"/g) ?? []).length, 3);
  assert.match(h, /class="titre"/);
  assert.match(h, /class="bac"/);
  assert.equal((h.match(/class="fond\b/g) ?? []).length, 2);
  assert.ok((h.match(/class="tuile\b/g) ?? []).length >= 6);
});

test('dock v2 : la teinte change par fondu d’opacity, sans animation de couleur ni de background', () => {
  const css = readFileSync(dir + 'mockups.css', 'utf8');
  const h = readFileSync(dir + 'dock.html', 'utf8');
  const trans = [...(css + h).matchAll(/transition\s*:([^;}]+)/g)].map((m) => m[1]);
  assert.ok(trans.length > 0);
  for (const t of trans) assert.match(t, /^\s*(opacity|transform)\b(\s*[\d.]+m?s[^,]*)?(,\s*(opacity|transform)\b[^,]*)*$/, t);
  assert.doesNotMatch(css + h, /@keyframes|transition-property\s*:[^;]*(color|background)|animation\s*:/i);
  assert.match(css, /\.fond[^}]*transition\s*:\s*opacity/);
  // le script ne touche au background que sur le calque, jamais sur body/html/tuile
  assert.match(h, /style\.background\s*=/);
  assert.doesNotMatch(h, /(body|document\.documentElement|tuile|bac)\.style\.background/);
});

test('dock v2 : aucun logo de marque (ni image, ni svg), aucun flou, une seule police en 2 graisses', () => {
  const h = readFileSync(dir + 'dock.html', 'utf8');
  assert.doesNotMatch(h, /<img|<svg|<picture|url\(|\.(png|jpe?g|svg|webp)/i);
  const css = readFileSync(dir + 'mockups.css', 'utf8');
  const poids = new Set([...css.matchAll(/font-weight\s*:\s*(\d+)/g)].map((m) => m[1]));
  assert.ok(poids.size <= 2, [...poids].join());
  assert.match(readFileSync(dir + 'OFL.txt', 'utf8'), /Outfit/);
});

test('captures dock v2 publiées (1920×1080)', () => {
  for (const n of ['maquette-dock-v2.png', 'maquette-dock-v2-focus-disney.png']) {
    const b = readFileSync(dir + 'captures/' + n);
    assert.equal(b.readUInt32BE(16), 1920, n);
    assert.equal(b.readUInt32BE(20), 1080, n);
  }
});

test('dock v2 : deux appuis rapprochés laissent un seul calque .on, à la couleur de la dernière app', async () => {
  const { runInNewContext } = await import('node:vm');
  const h = readFileSync(dir + 'dock.html', 'utf8');
  const code = h.match(/<script>([\s\S]*?)<\/script>/)[1];
  const el = (extra = {}) => ({ className: 'fond', style: {}, offsetWidth: 1, attrs: {}, getAttribute(k) { return this.attrs[k]; }, ...extra });
  const tuiles = [['229,9,20'], ['214,32,31'], ['17,60,207'], ['90,90,95']].map(([rgb]) => el({ className: 'tuile', attrs: { 'data-rgb': rgb, 'data-nom': 'x' } }));
  const fonds = [el({ className: 'fond on' }), el()];
  const titre = el({ textContent: '' });
  let keydown, timers = [], hiddenWrites = [];
  runInNewContext(code, {
    document: {
      querySelectorAll: (q) => (q === '.tuile' ? tuiles : fonds),
      querySelector: () => titre,
      addEventListener: (_, fn) => (keydown = fn),
    },
    location: { hash: '' },
    setTimeout: (fn) => timers.push(fn) - 1,
    clearTimeout: (id) => { timers[id] = null; },
  });
  for (const f of fonds) {
    let bg;
    Object.defineProperty(f.style, 'background', { get: () => bg, set: (v) => { hiddenWrites.push(f.className.split(' ').includes('on') && f.style.transition !== 'none'); bg = v; } });
  }
  keydown({ keyCode: 39 });
  keydown({ keyCode: 37 });
  keydown({ keyCode: 37 });
  for (const fn of timers) fn?.();
  const on = fonds.filter((f) => f.className.split(' ').includes('on'));
  assert.equal(on.length, 1);
  assert.match(on[0].style.background, /rgba\(214,32,31|rgba\(229,9,20/);
  assert.ok(hiddenWrites.every((v) => !v), 'écriture de couleur sur un calque encore visible');
});
