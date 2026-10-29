import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';

const WGT = 'apps/tv/build/cimaise-unsigned.wgt';
const BLANK = 'apps/blank/build/blank-unsigned.wgt';
let build;
before(() => {
  build = spawnSync('npm', ['run', 'build'], { encoding: 'utf8' });
  assert.equal(build.status, 0, build.stdout + build.stderr);
});

function zip(buf) {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const n = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = {};
  for (let i = 0; i < n; i++) {
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20);
    const nl = buf.readUInt16LE(p + 28), xl = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32);
    const off = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nl);
    const lh = off + 30 + buf.readUInt16LE(off + 26) + buf.readUInt16LE(off + 28);
    const body = buf.subarray(lh, lh + csize);
    out[name] = method === 8 ? inflateRawSync(body) : body;
    p += 46 + nl + xl + cl;
  }
  return out;
}

test('build produit le .wgt cimaise (accueil Dock) non signé avec les fichiers de l’app', () => {
  assert.ok(existsSync(WGT));
  const f = zip(readFileSync(WGT));
  for (const n of ['config.xml', 'index.html', 'app.js', 'app.css', 'plex.js', 'settings.js', 'fonts/outfit-latin.woff2', 'OFL.txt']) assert.ok(n in f, n);
  assert.ok(!Object.keys(f).some((n) => /signature/i.test(n)), 'signature présente');
  assert.ok(!Object.keys(f).some((n) => n.endsWith('.wgt')));
  assert.ok(!f['app.js'].includes('CIMAISE_MOCK'), 'mock dans le .wgt');
  assert.match(f['index.html'].toString(), /id="root"/);
  assert.match(f['index.html'].toString(), /<script src="\$WEBAPIS\/webapis\/webapis\.js"><\/script>\s*<script src="app\.js"/, 'webapis.js avant app.js');
  assert.match(f['app.css'].toString(), /outfit-latin\.woff2/);
});

test('config.xml : identité stable, required_version, privilèges, documenté', () => {
  const cfg = readFileSync('apps/tv/config.xml', 'utf8');
  assert.match(cfg, /<tizen:application id="cimaise001\.Cimaise" package="cimaise001" required_version="5\.0"/);
  assert.match(cfg, /<tizen:profile name="tv-samsung"/);
  const privs = [...cfg.matchAll(/<tizen:privilege name="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(privs, ['http://tizen.org/privilege/tv.inputdevice', 'http://tizen.org/privilege/application.launch', 'http://tizen.org/privilege/application.info', 'http://tizen.org/privilege/internet']);
  assert.match(cfg, /<!--[\s\S]*required_version[\s\S]*-->/);
  assert.match(readFileSync('docs/decisions.md', 'utf8'), /required_version[\s\S]*cimaise001\.Cimaise|cimaise001\.Cimaise[\s\S]*required_version/);
  assert.equal(zip(readFileSync(WGT))['config.xml'].toString(), cfg);
});

test('la taille du .wgt est rapportée', () => {
  const size = statSync(WGT).size;
  assert.match(build.stdout, /\.wgt/);
  assert.ok(build.stdout.includes(String(size)), 'taille en octets absente : ' + size);
  assert.match(build.stdout, /Ko/);
});

test('la page vide de référence : .wgt séparé, identité propre, fond uni, heure, horodatages', () => {
  assert.ok(existsSync(BLANK));
  const f = zip(readFileSync(BLANK));
  const html = f['index.html'].toString();
  assert.match(html, /id="clock"/);
  assert.match(html, /id="marks"/);
  assert.match(f['app.css'].toString(), /background:#/);
  assert.deepEqual(Object.keys(f).sort(), ['app.css', 'app.js', 'config.xml', 'icon.png', 'index.html']);
  const cfg = f['config.xml'].toString();
  assert.match(cfg, /<tizen:application id="cimaiseblk\.Blank" package="cimaiseblk" required_version="5\.0"/);
  assert.doesNotMatch(cfg.replace(/<!--[\s\S]*?-->/, ''), /cimaise001/);
  const id = (c) => /<widget[^>]* id="([^"]+)"/.exec(c)[1];
  assert.notEqual(id(cfg), id(readFileSync('apps/tv/config.xml', 'utf8')));
});

test('le package de apps/tv et apps/blank fait exactement 10 caractères alphanumériques', () => {
  const cfgs = ['apps/tv/config.xml', 'apps/blank/config.xml'];
  for (const p of cfgs) {
    const m = /<tizen:application id="([^"]+)" package="([^"]+)"/.exec(readFileSync(p, 'utf8'));
    assert.ok(m, p);
    assert.match(m[2], /^[A-Za-z0-9]{10}$/, p + ' : package ' + m[2]);
    assert.ok(m[1].startsWith(m[2] + '.'), p);
  }
});

test('apps/tv déclare les privilèges de lancement et d’inventaire, documentés', () => {
  const cfg = readFileSync('apps/tv/config.xml', 'utf8');
  for (const p of ['application.launch', 'application.info', 'internet']) {
    assert.match(cfg, new RegExp('<tizen:privilege name="http://tizen\\.org/privilege/' + p.replace('.', '\\.') + '"'));
    assert.ok(readFileSync('docs/decisions.md', 'utf8').includes(p), p + ' non documenté');
  }
});
