import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const WGT = 'bench/cleanframe/dist/cleanframe-bench.wgt';

before(() => {
  const r = spawnSync('node', ['bench/cleanframe/build.mjs'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

// Lecture minimale d'un zip : liste des entrées via le répertoire central.
function zipEntries(buf) {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(eocd >= 0, 'pas un zip');
  const n = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const names = [];
  for (let i = 0; i < n; i++) {
    const nl = buf.readUInt16LE(p + 28), xl = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32);
    names.push(buf.toString('utf8', p + 46, p + 46 + nl));
    p += 46 + nl + xl + cl;
  }
  return names;
}

test('produit un .wgt non signé', () => {
  assert.ok(existsSync(WGT));
  const names = zipEntries(readFileSync(WGT));
  assert.ok(names.includes('config.xml'));
  assert.ok(names.includes('index.html'));
  assert.ok(!names.some((n) => /signature\d*\.xml$|author-signature\.xml$/.test(n)), 'signature présente');
});

test('required_version abaissé à 5.0 et documenté', () => {
  const cfg = readFileSync('bench/cleanframe/work/app/config.xml', 'utf8');
  assert.match(cfg, /required_version="5\.0"/);
  assert.doesNotMatch(cfg, /required_version="6\.5"/);
  assert.match(readFileSync('bench/cleanframe/README.md', 'utf8'), /required_version/);
});

test('identité distincte de cimaise', () => {
  const cfg = readFileSync('bench/cleanframe/work/app/config.xml', 'utf8');
  const m = cfg.match(/<tizen:application id="([^"]+)" package="([^"]+)"/);
  assert.ok(m);
  assert.notEqual(m[2], 'cimaise001');
  assert.notEqual(m[1], 'cimaise001.Cimaise');
  assert.match(m[2], /^[A-Za-z0-9]{10}$/);
  assert.ok(m[1].startsWith(m[2] + '.'));
});

test('licence MIT conservée', () => {
  assert.match(readFileSync('bench/cleanframe/LICENSE', 'utf8'), /MIT License/);
  assert.ok(existsSync('bench/cleanframe/THIRD_PARTY_NOTICES.md'));
  assert.ok(readFileSync(WGT).includes(Buffer.from('LICENSE')), 'LICENSE absent du .wgt');
});
