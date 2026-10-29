import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';

const DIR = 'packages/launcher/src/catalog/known-apps';
let C;
before(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'known-'));
  const es5Dir = join(dir, 'es5');
  const t = spawnSync('node_modules/.bin/tsc', ['-p', 'packages/launcher/tsconfig.json', '--outDir', es5Dir], { encoding: 'utf8' });
  assert.equal(t.status, 0, t.stdout + t.stderr);
  const out = join(dir, 'catalog.cjs');
  await build({ entryPoints: [join(es5Dir, 'launcher/src/catalog/index.js')], bundle: true, format: 'cjs', target: 'es5', outfile: out, logLevel: 'warning' });
  C = createRequire(import.meta.url)(out);
});

test('bibliothèque : une vingtaine d’apps, chacune avec logo et description d’une ligne', () => {
  const list = C.KNOWN_APPS;
  assert.ok(list.length >= 20, 'apps connues : ' + list.length);
  for (const k of list) {
    assert.match(k.desc, /^[^\n]{10,90}$/, k.logo);
    assert.ok(/[.!]$/.test(k.desc), 'phrase terminée : ' + k.desc);
    if (k.logo) assert.ok(existsSync(join(DIR, 'logos', k.logo)), 'logo manquant : ' + k.logo);
    assert.match(k.bg, /^#[0-9a-f]{6}$/i, 'fond de tuile : ' + k.names[0]);
  }
});

test('logos larges : PNG ≤ 320 × 160 px, < 15 Ko chacun, logotype (largeur ≥ 1,3 × hauteur), aucun orphelin', () => {
  const files = readdirSync(join(DIR, 'logos')).sort();
  assert.deepEqual(files, C.KNOWN_APPS.map((k) => k.logo).filter(Boolean).sort());
  for (const f of files) {
    const b = readFileSync(join(DIR, 'logos', f));
    assert.ok(b.length < 15 * 1024, f + ' : ' + b.length + ' octets');
    assert.equal(b.subarray(1, 4).toString(), 'PNG', f);
    const w = b.readUInt32BE(16), h = b.readUInt32BE(20);
    assert.ok(w <= 320 && h <= 160, f + ' : dimensions ' + w + '×' + h);
    assert.ok(w >= 1.3 * h, f + ' : pas un logotype large ' + w + '×' + h);
  }
});

test('logos : seul Smart Hub (pictogramme maison) n’a pas de logo, la tuile porte son nom', () => {
  const sans = C.KNOWN_APPS.filter((k) => !k.logo);
  assert.deepEqual(sans.map((k) => k.names[0]), ['smarthub']);
  const m = C.knownApp('Smart Hub');
  assert.equal(m.logoUrl, undefined);
  assert.equal(m.desc.length > 10, true);
});

// Palette d'un PNG : entrées avec leur alpha (tRNS), pour juger de la couleur du logo sans le décoder.
function palette(file) {
  const b = readFileSync(join(DIR, 'logos', file));
  let pos = 8, plte, trns = Buffer.alloc(0);
  while (pos < b.length) {
    const len = b.readUInt32BE(pos), type = b.toString('latin1', pos + 4, pos + 8);
    if (type === 'PLTE') plte = b.subarray(pos + 8, pos + 8 + len);
    if (type === 'tRNS') trns = b.subarray(pos + 8, pos + 8 + len);
    pos += 12 + len;
  }
  const out = [];
  for (let i = 0; i < plte.length / 3; i++) out.push({ rgb: [plte[i * 3], plte[i * 3 + 1], plte[i * 3 + 2]], a: i < trns.length ? trns[i] : 255 });
  return out;
}
const TWO_INKS = ['canal.png', 'm6.png', 'plex.png'];
const lum = ([r, g, b]) => (0.299 * r + 0.587 * g + 0.114 * b);
const rel = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const contrast = (x, y) => { const [p, q] = [rel(x), rel(y)].sort((m, n) => n - m); return (p + 0.05) / (q + 0.05); };

test('fond de tuile : la couleur forte de la marque (carte « couleur de marque »)', () => {
  const bg = (n) => C.knownApp(n).bg.toLowerCase();
  assert.equal(bg('YouTube'), '#ff0000');
  assert.equal(bg('Netflix'), '#e50914');
  assert.equal(bg('Prime Video'), '#00a8e1');
  assert.equal(bg('Disney+'), '#0e1a3d');
  assert.equal(bg('Canal+'), '#000000', 'Canal+ : le noir est la marque');
  assert.equal(bg('Molotov'), '#fecf21', 'Molotov : jaune du logo fourni');
  assert.equal(bg('Plex officiel'), '#000000', 'Plex officiel inchangé');
  assert.equal(bg('Plex intégré'), '#e5a00d', 'Plex intégré : jaune Plex');
  assert.equal(bg('Smart Hub'), '#1428a0', 'Smart Hub : bleu Samsung');
});

test('Plex : « intégré » et « officiel » sont deux tuiles distinguables', () => {
  const i = C.knownApp('Plex intégré'), o = C.knownApp('Plex officiel');
  assert.notEqual(i.bg, o.bg);
  assert.notEqual(i.logo, o.logo, 'logo noir sur jaune / blanc sur noir');
  assert.equal(o.tag, 'officiel', 'petite mention sous le logo');
  assert.equal(i.tag, undefined);
  assert.equal(C.knownApp('Plex').logo, o.logo);
});

test('lisibilité : chaque logo a une encre blanche ou noire, contraste ≥ 2,5 : 1 (Prime : #fff sur #00a8e1 imposé par la carte, 2,7) avec le fond de la tuile', () => {
  for (const k of C.KNOWN_APPS.filter((k) => k.logo)) {
    assert.match(k.ink, /^#(ffffff|000000)$/, k.logo + ' : encre');
    assert.ok(contrast(k.ink, k.bg) >= 2.5, k.logo + ' : contraste ' + contrast(k.ink, k.bg).toFixed(2) + ' (' + k.ink + ' sur ' + k.bg + ')');
    if (TWO_INKS.includes(k.logo)) continue; // logos à deux encres (Canal+ noir/blanc, M6 blanc/rouge, Plex blanc/jaune)
    // le PNG porte vraiment cette encre : ≥ 60 % des entrées visibles de la palette en sont proches
    const vis = palette(k.logo).filter((e) => e.a > 0);
    const ok = vis.filter((e) => (k.ink === '#ffffff' ? lum(e.rgb) > 200 : lum(e.rgb) < 60)).length;
    assert.ok(ok / vis.length >= 0.6, k.logo + ' : encre du PNG ' + ok + '/' + vis.length);
  }
});

test('Molotov : logo fourni par Stéphane, logotype ≤ 320 px, < 15 Ko, sur transparent', () => {
  const b = readFileSync(join(DIR, 'logos', 'molotov.png'));
  assert.ok(b.length < 15 * 1024);
  assert.ok(b.readUInt32BE(16) <= 320 && b.readUInt32BE(16) >= 300, 'à la taille d’affichage');
  const vis = palette('molotov.png');
  assert.ok(vis.some((e) => e.a === 0), 'fond transparent');
  assert.ok(vis.filter((e) => e.a > 200).every((e) => lum(e.rgb) < 60), 'logotype noir (pas le rouge de l’ancien logo)');
});

test('provenance : chaque logo est cité dans THIRD_PARTY_NOTICES.md', () => {
  const notices = readFileSync('THIRD_PARTY_NOTICES.md', 'utf8');
  for (const k of C.KNOWN_APPS) if (k.logo) assert.ok(notices.includes(k.logo), 'provenance absente : ' + k.logo);
  assert.match(notices, /commons\.wikimedia\.org/);
  assert.match(notices, /jaimelesstartups\.fr\/wp-content\/uploads\/2019\/02\/logo-molotov-1024x421\.png/, 'Molotov : source fournie');
  assert.doesNotMatch(notices, /Molotov-logo\.svg/, 'ancienne source Molotov retirée');
  assert.ok(notices.includes('plex-integre.png'));
});

test('aucun ID d’app TV committé dans la bibliothèque', () => {
  const src = readFileSync(join(DIR, 'index.ts'), 'utf8');
  assert.doesNotMatch(src, /org\.tizen|\b[A-Za-z0-9]{10}\.[A-Za-z]/);
  for (const k of C.KNOWN_APPS) assert.ok(!('id' in k));
});

test('correspondance par nom : casse, accents, ponctuation, suffixes', () => {
  const key = (n) => { const k = C.knownApp(n); return k && k.logo; };
  const same = (logo, ...names) => names.forEach((n) => assert.equal(key(n), logo, n));
  same('netflix.png', 'Netflix', 'NETFLIX', 'netflix', '  Netflix ');
  same('disney.png', 'Disney+', 'disney+', 'Disney Plus', 'DISNEY PLUS', 'Disney +');
  same('canal.png', 'Canal+', 'CANAL+', 'canal plus', 'myCANAL');
  same('plex.png', 'Plex', 'Plex officiel', 'Plex Officiel', 'PLEX');
  same('plex-integre.png', 'Plex intégré', 'plex integre');
  same('francetv.png', 'France.tv', 'france tv', 'FRANCE.TV', 'France TV');
  same('arte.png', 'Arte', 'ARTE', 'arte.tv');
  same('tf1.png', 'TF1+', 'tf1', 'TF1');
  same('m6.png', 'M6+', 'm6', '6play');
  same('prime.png', 'Prime Video', 'prime video', 'Amazon Prime Video', 'PRIME VIDEO');
  same('appletv.png', 'Apple TV', 'apple tv', 'Apple TV+', 'APPLE TV');
  same('max.png', 'Max', 'HBO Max', 'OCS', 'ocs');
  same('paramount.png', 'Paramount+', 'Paramount Plus');
  for (const n of ['Smart Hub', 'smart hub', 'SmartHub', 'Smart Hub Samsung', 'Mode Art', 'mode art', 'Art Mode']) assert.deepEqual(C.knownApp(n).names.slice(0, 1), ['smarthub'], n);
  same('pluto.png', 'Pluto TV', 'pluto tv');
  same('rakuten.png', 'Rakuten TV', 'rakuten tv');
  same('molotov.png', 'Molotov', 'Molotov TV');
});

test('correspondance : apps inconnues et pas de faux positifs', () => {
  for (const n of ['', 'Ma super app', 'Netflixer', 'Plexus', 'Calculatrice', 'Disney', 'Canal']) assert.equal(C.knownApp(n), null, n);
  assert.equal(C.knownApp(undefined), null);
});

test('le logo se résout en chemin relatif à la page, jamais en ID', () => {
  assert.equal(C.knownApp('Netflix').logoUrl, 'logos/netflix.png');
});

test('le logo n’est jamais embarqué dans le JS initial ; le .wgt le contient', () => {
  const r = spawnSync('npm', ['run', 'build'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const js = readFileSync('apps/tv/dist/app.js', 'utf8');
  assert.ok(!js.includes('data:image'), 'image en data: dans app.js');
  assert.ok(!js.includes('iVBORw0KGgo'), 'PNG en base64 dans app.js');
  for (const k of C.KNOWN_APPS.filter((k) => k.logo)) {
    const p = join('apps/tv/dist/logos', k.logo);
    assert.ok(existsSync(p), 'logo absent de dist : ' + k.logo);
    assert.equal(statSync(p).size, statSync(join(DIR, 'logos', k.logo)).size);
  }
});
