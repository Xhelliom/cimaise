// Référence de mesure (HANDOFF §6 bis, étape 2) : CleanFrame tel quel, adapté au strict minimum
// pour Tizen 5, empaqueté en .wgt NON signé. Aucune optimisation. Usage : node build.mjs
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { deflateRawSync, crc32 } from 'node:zlib';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = 'https://github.com/nthnclrk/CleanFrame';
const COMMIT = '58ac92a7b8f80047ca26e5b7097f5e1616762db0'; // figé : la référence ne bouge pas
const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, 'work', 'upstream');
const app = join(here, 'work', 'app');
const out = join(here, 'dist', 'cleanframe-bench.wgt');

const git = (...a) => execFileSync('git', a, { stdio: 'inherit' });
if (!existsSync(join(src, '.git'))) {
  mkdirSync(src, { recursive: true });
  git('-C', src, 'init', '-q');
  git('-C', src, 'fetch', '-q', '--depth', '1', REPO, COMMIT);
}
git('-C', src, 'checkout', '-q', '--detach', COMMIT);

rmSync(app, { recursive: true, force: true });
cpSync(join(src, 'app'), app, { recursive: true });
cpSync(join(src, 'LICENSE'), join(app, 'LICENSE'));
cpSync(join(src, 'THIRD_PARTY_NOTICES.md'), join(app, 'THIRD_PARTY_NOTICES.md'));

// Seules modifications : required_version, identité, nom affiché (voir README.md).
const cfgPath = join(app, 'config.xml');
let cfg = readFileSync(cfgPath, 'utf8');
const patch = (from, to) => {
  assert(cfg.includes(from), 'config.xml amont inattendu : ' + from);
  cfg = cfg.replace(from, to);
};
const assert = (c, m) => { if (!c) throw new Error(m); };
patch('id="https://local.frame-home/app"', 'id="https://local.cimaise-bench/cleanframe"');
patch('id="nClrkHome1.FrameHome" package="nClrkHome1" required_version="6.5"', 'id="cmbnchcf01.CleanFrameBench" package="cmbnchcf01" required_version="5.0"');
patch('<name>CleanFrame</name>', '<name>CleanFrame (bench)</name>');
writeFileSync(cfgPath, cfg);

// Zip minimal (deflate), sans signature.
const files = [];
(function walk(d) {
  for (const e of readdirSync(d).sort()) {
    const p = join(d, e);
    statSync(p).isDirectory() ? walk(p) : files.push(p);
  }
})(app);

const parts = [], central = [];
let off = 0;
for (const f of files) {
  const name = Buffer.from(relative(app, f).split('\\').join('/'));
  const data = readFileSync(f);
  const comp = deflateRawSync(data);
  const [method, body] = comp.length < data.length ? [8, comp] : [0, data];
  const h = Buffer.alloc(30);
  h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(method, 8);
  h.writeUInt16LE(0x21, 12); // date fixe (1980-01-01) : build reproductible
  h.writeUInt32LE(crc32(data), 14); h.writeUInt32LE(body.length, 18); h.writeUInt32LE(data.length, 22); h.writeUInt16LE(name.length, 26);
  const c = Buffer.alloc(46);
  c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(method, 10);
  c.writeUInt16LE(0x21, 14); c.writeUInt32LE(crc32(data), 16); c.writeUInt32LE(body.length, 20); c.writeUInt32LE(data.length, 24);
  c.writeUInt16LE(name.length, 28); c.writeUInt32LE(off, 42);
  parts.push(h, name, body); central.push(c, name);
  off += 30 + name.length + body.length;
}
const cd = Buffer.concat(central);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, Buffer.concat([...parts, cd, end]));
console.log(`${relative(process.cwd(), out)} : ${files.length} fichiers, ${statSync(out).size} octets (non signé)`);
