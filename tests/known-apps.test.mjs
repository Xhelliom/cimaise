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
    assert.ok(existsSync(join(DIR, 'logos', k.logo)), 'logo manquant : ' + k.logo);
  }
});

test('logos : PNG ≤ 256 px, < 10 Ko chacun, aucun fichier orphelin', () => {
  const files = readdirSync(join(DIR, 'logos')).sort();
  assert.deepEqual(files, C.KNOWN_APPS.map((k) => k.logo).sort());
  for (const f of files) {
    const b = readFileSync(join(DIR, 'logos', f));
    assert.ok(b.length < 10 * 1024, f + ' : ' + b.length + ' octets');
    assert.equal(b.subarray(1, 4).toString(), 'PNG', f);
    assert.ok(b.readUInt32BE(16) <= 256 && b.readUInt32BE(20) <= 256, f + ' : dimensions');
  }
});

test('provenance : chaque logo est cité dans THIRD_PARTY_NOTICES.md', () => {
  const notices = readFileSync('THIRD_PARTY_NOTICES.md', 'utf8');
  for (const k of C.KNOWN_APPS) assert.ok(notices.includes(k.logo), 'provenance absente : ' + k.logo);
  assert.match(notices, /commons\.wikimedia\.org/);
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
  same('plex.png', 'Plex', 'Plex officiel', 'Plex Officiel', 'PLEX', 'Plex intégré', 'plex integre');
  same('francetv.png', 'France.tv', 'france tv', 'FRANCE.TV', 'France TV');
  same('arte.png', 'Arte', 'ARTE', 'arte.tv');
  same('tf1.png', 'TF1+', 'tf1', 'TF1');
  same('m6.png', 'M6+', 'm6', '6play');
  same('prime.png', 'Prime Video', 'prime video', 'Amazon Prime Video', 'PRIME VIDEO');
  same('appletv.png', 'Apple TV', 'apple tv', 'Apple TV+', 'APPLE TV');
  same('max.png', 'Max', 'HBO Max', 'OCS', 'ocs');
  same('paramount.png', 'Paramount+', 'Paramount Plus');
  same('smarthub.png', 'Smart Hub', 'smart hub', 'SmartHub', 'Smart Hub Samsung', 'Mode Art', 'mode art', 'Art Mode');
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
  for (const k of C.KNOWN_APPS) {
    const p = join('apps/tv/dist/logos', k.logo);
    assert.ok(existsSync(p), 'logo absent de dist : ' + k.logo);
    assert.equal(statSync(p).size, statSync(join(DIR, 'logos', k.logo)).size);
  }
});
