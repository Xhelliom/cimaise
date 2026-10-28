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
  const f = await fetch(`${base}/mockups/roboto-flex-latin.woff2`);
  assert.equal(f.status, 200);
  assert.match(f.headers.get('content-type'), /font\/woff2/);
  assert.equal((await fetch(`${base}/mockups/../../package.json`)).status, 404);
});

test('chaque maquette : heure, 8 raccourcis, un seul élément focalisé', () => {
  for (const p of pages) {
    const h = readFileSync(`${dir}${p}.html`, 'utf8');
    assert.match(h, /\d{2}:\d{2}/, p);
    for (const s of shortcuts) assert.ok(h.includes(`>${s}<`), `${p}: ${s}`);
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
  assert.doesNotMatch(css, /url\((?!roboto-flex-latin\.woff2)/);
  assert.ok(statSync(`${dir}roboto-flex-latin.woff2`).size < 30 * 1024);
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
