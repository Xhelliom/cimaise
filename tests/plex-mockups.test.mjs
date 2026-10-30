import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const dir = 'packages/plex/mockups/';
const pages = ['accueil', 'fiche', 'lecteur'];
let server, base;
before(async () => {
  const { startDevServer } = await import('../scripts/dev/server.mjs');
  server = await startDevServer({ port: 0 });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const read = (f) => readFileSync(dir + f, 'utf8');
const countTags = (html) => (html.replace(/<head>[\s\S]*<\/head>/, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<!--[\s\S]*?-->/g, '').match(/<[a-z][a-z0-9]*\b/gi) ?? []).length - 1; // sans <html>

test('maquette Plex servie par l’aperçu, police partagée, fond factice en JPEG', async () => {
  assert.match(await (await fetch(`${base}/mockups/plex/`)).text(), /En cours/);
  for (const f of ['accueil.html', 'fiche.html', 'lecteur.html', 'plex.css']) assert.equal((await fetch(`${base}/mockups/plex/${f}`)).status, 200, f);
  const jpg = await fetch(`${base}/mockups/plex/fond-factice.jpg`);
  assert.match(jpg.headers.get('content-type'), /^image\/jpeg/);
  assert.deepEqual([...new Uint8Array(await jpg.arrayBuffer()).slice(0, 2)], [0xff, 0xd8]);
  assert.match(read('plex.css'), /url\(\.\.\/outfit-latin\.woff2\)/);
  assert.match(await (await fetch(`${base}/mockups/`)).text(), /href="plex\/"/);
  assert.equal((await fetch(`${base}/mockups/plex/../../package.json`)).status, 404);
});

test('lecteur : icônes ▶ / ❚❚ sans mots, grand ❚❚ au centre, bouton actif indigo, titre + « finit à »', () => {
  const h = read('lecteur.html'), css = read('plex.css');
  assert.doesNotMatch(h.replace(/<script[\s\S]*?<\/script>/, ''), />\s*(Lecture|Pause)\s*</);
  assert.match(h, /class="grand"><i class="ic pau">/);
  assert.match(h, /class="rond gros f focus"><i class="ic pau">/);
  assert.match(css, /\.pause \.grand\{opacity:1\}/);
  assert.match(css, /\.ctl \.rond\.focus\{background:var\(--i\)\}/);
  assert.match(css, /--i:#6366f1/);
  assert.ok(h.indexOf('class="ligne"') < h.indexOf('class="barre"'));
  assert.match(h, /class="fin">finit à \d\d:\d\d</);
});

test('accueil : Rechercher puis roue dentée en tête, onglets Films · Séries, puis En cours et Ajoutés récemment', () => {
  const h = read('accueil.html');
  const order = ['Rechercher', 'title="Réglages"', '>Films<', '>Séries<', 'En cours', 'Ajoutés récemment'].map((s) => h.indexOf(s));
  assert.ok(order.every((x, i) => x > 0 && (i === 0 || x > order[i - 1])), order.join());
  assert.doesNotMatch(h, /Bibliothèques/);
  assert.equal((h.match(/class="[^"]*\bfocus\b/g) ?? []).length, 1);
  assert.equal((h.match(/class="bord d"/g) ?? []).length, 2);
});

test('fiche : fond = image du transcodeur (blur côté serveur), trois boutons', () => {
  const h = read('fiche.html');
  assert.match(h, /\/photo\/:\/transcode\?width=480&height=270&blur=\d+&opacity=\d+&background=/);
  assert.match(h, /<img class="fond" src="fond-factice\.jpg"/);
  for (const b of ['Reprendre', 'Depuis le début', 'Marquer vu']) assert.match(h, new RegExp(`${b}[^<]*</a>`), b);
  const jpg = readFileSync(dir + 'fond-factice.jpg');
  let i = 2; // dimensions lues dans le marqueur SOF0/SOF2
  while (jpg[i + 1] !== 0xc0 && jpg[i + 1] !== 0xc2) i += 2 + jpg.readUInt16BE(i + 2);
  assert.deepEqual([jpg.readUInt16BE(i + 7), jpg.readUInt16BE(i + 5)], [480, 270]);
});

test('aucun flou ni filtre CSS, animations transform/opacity seulement, ombres à rayon 0', () => {
  for (const f of ['plex.css', ...pages.map((p) => `${p}.html`)]) {
    const s = read(f);
    assert.doesNotMatch(s, /backdrop-filter|filter\s*:|blur\(|text-shadow/i, f);
    for (const m of s.matchAll(/transition\s*:([^;}]+)/g)) assert.match(m[1], /^\s*(transform|opacity)\b[^,]*$/, f);
    for (const m of s.matchAll(/box-shadow\s*:([^;}]+)/g)) assert.match(m[1], /^\s*(inset )?0 0 0 /, f);
  }
  const css = read('plex.css');
  assert.equal((css.match(/@font-face/g) ?? []).length, 1);
  assert.doesNotMatch(css, /url\((?!\.\.\/outfit-latin\.woff2)/);
  assert.ok(new Set([...css.matchAll(/font-weight\s*:\s*(\d+)/g)].map((m) => m[1])).size <= 2);
  // Focus homogène : une seule règle d'anneau + scale pour tous les éléments focalisables
  assert.match(css, /\.f\.focus\{box-shadow:0 0 0 6px #fff;transform:scale\(1\.06\)/);
});

test('fiche coût : CSS mesuré et DOM annoncé = DOM réel', () => {
  const fiche = read('COUTS.md');
  const brut = Number(fiche.match(/\*\*([\d ]+) o brut/)[1].replace(/ /g, ''));
  assert.equal(brut, readFileSync(dir + 'plex.css').length);
  for (const p of pages) {
    const m = fiche.match(new RegExp(`${p}\\.html[^\\n]*?DOM\\s*:\\s*(\\d+)`, 'i'));
    assert.ok(m, `DOM ${p}`);
    assert.equal(Number(m[1]), countTags(read(`${p}.html`)), p);
  }
});

test('captures de la maquette en 1920×1080', () => {
  for (const n of ['accueil', 'accueil-defilee', 'accueil-recherche', 'accueil-reglages', 'accueil-onglets', 'fiche', 'fiche-marquer-vu', 'lecteur', 'lecteur-pause']) {
    const b = readFileSync(`${dir}captures/maquette-plex-${n}.png`);
    assert.equal(b.readUInt32BE(16), 1920, n);
    assert.equal(b.readUInt32BE(20), 1080, n);
  }
});
