import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const dir = 'packages/overseerr/mockups/';
const pages = ['accueil', 'fiche'];
let server, base;
before(async () => {
  const { startDevServer } = await import('../scripts/dev/server.mjs');
  server = await startDevServer({ port: 0 });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const countTags = (html) => (html.replace(/<head>[\s\S]*<\/head>/, '').replace(/<script[\s\S]*?<\/script>/g, '').match(/<[a-z][a-z0-9]*\b/gi) ?? []).length - 1; // sans <html>

test('maquette Overseerr servie par l’aperçu, police partagée avec les maquettes d’accueil', async () => {
  assert.match(await (await fetch(`${base}/mockups/overseerr/`)).text(), /Films du moment/);
  for (const f of ['accueil.html', 'fiche.html', 'overseerr.css']) assert.equal((await fetch(`${base}/mockups/overseerr/${f}`)).status, 200, f);
  assert.match(readFileSync(dir + 'overseerr.css', 'utf8'), /url\(\.\.\/outfit-latin\.woff2\)/);
  assert.equal((await fetch(`${base}/mockups/outfit-latin.woff2`)).status, 200);
  assert.match(await (await fetch(`${base}/mockups/`)).text(), /href="overseerr\/"/);
  assert.equal((await fetch(`${base}/mockups/overseerr/../../package.json`)).status, 404);
});

test('accueil : deux rangées, un seul focus, badges en pilule', () => {
  const h = readFileSync(dir + 'accueil.html', 'utf8');
  assert.match(h, />Films du moment</);
  assert.match(h, />Séries du moment</);
  assert.equal((h.match(/class="af\b/g) ?? []).length, 14);
  assert.equal((h.match(/class="[^"]*\bfocus\b/g) ?? []).length, 1);
  for (const b of ['Disponible', 'Demandé', 'En attente']) assert.match(h, new RegExp(`class="b \\w+">${b}<`));
});

test('fiche : bouton Demander et les trois badges', () => {
  const h = readFileSync(dir + 'fiche.html', 'utf8');
  assert.match(h, />Demander</);
  for (const b of ['"Disponible"', '"Demandé"', '"En attente"']) assert.ok(h.includes(`b:${b}`), b);
});

test('aucun flou ni filtre, aucune image, animations transform seulement', () => {
  for (const f of ['overseerr.css', ...pages.map((p) => `${p}.html`)]) {
    const s = readFileSync(dir + f, 'utf8');
    assert.doesNotMatch(s, /backdrop-filter|filter\s*:|blur\(|<img|<svg|\.(png|jpe?g|webp)\b/i, f);
    for (const m of s.matchAll(/transition\s*:([^;}]+)/g)) assert.match(m[1], /^\s*transform\b[^,]*$/, f);
    for (const m of s.matchAll(/box-shadow\s*:([^;}]+)/g)) assert.match(m[1], /^\s*0 0 0 /, f);
  }
  const css = readFileSync(dir + 'overseerr.css', 'utf8');
  assert.equal((css.match(/@font-face/g) ?? []).length, 1);
  assert.doesNotMatch(css, /url\((?!\.\.\/outfit-latin\.woff2)/);
  assert.ok(new Set([...css.matchAll(/font-weight\s*:\s*(\d+)/g)].map((m) => m[1])).size <= 2);
});

test('fiche coût : CSS mesuré et DOM annoncé = DOM réel', () => {
  const fiche = readFileSync(dir + 'COUTS.md', 'utf8');
  const brut = Number(fiche.match(/\*\*([\d ]+) o brut/)[1].replace(/ /g, ''));
  assert.equal(brut, readFileSync(dir + 'overseerr.css').length);
  for (const p of pages) {
    const m = fiche.match(new RegExp(`${p}\\.html[^\\n]*?DOM\\s*:\\s*(\\d+)`, 'i'));
    assert.ok(m, `DOM ${p}`);
    assert.equal(Number(m[1]), countTags(readFileSync(`${dir}${p}.html`, 'utf8')), p);
  }
});

test('captures de la maquette en 1920×1080', () => {
  for (const n of ['accueil', 'accueil-series', 'fiche-demander', 'fiche-demande', 'fiche-attente', 'fiche-disponible']) {
    const b = readFileSync(`${dir}captures/maquette-overseerr-${n}.png`);
    assert.equal(b.readUInt32BE(16), 1920, n);
    assert.equal(b.readUInt32BE(20), 1080, n);
  }
});
