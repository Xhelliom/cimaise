// Empaquette apps/tv/dist en .wgt NON signé (zip). La signature reste à scripts/tizen (packager officiel).
// Usage : node scripts/build/wgt.mjs
import { copyFileSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { deflateRawSync, crc32 } from 'node:zlib';
import { join, relative } from 'node:path';

const app = process.env.CIMAISE_APP ?? 'apps/tv';
const dist = `${app}/dist`;
const out = `${app}/build/${process.env.CIMAISE_WGT ?? 'cimaise'}-unsigned.wgt`;

// dist/ est le dossier à signer (scripts/tizen/package.sh) : il doit contenir tout l'app.
for (const f of ['config.xml', 'index.html', 'icon.png']) copyFileSync(`${app}/${f}`, `${dist}/${f}`);

const files = [];
(function walk(d) {
  for (const e of readdirSync(d).sort()) {
    const p = join(d, e);
    statSync(p).isDirectory() ? walk(p) : files.push(p);
  }
})(dist);

const parts = [], central = [];
let off = 0;
for (const f of files) {
  const name = Buffer.from(relative(dist, f).split('\\').join('/'));
  const data = readFileSync(f);
  const comp = deflateRawSync(data, { level: 9 });
  const [method, body] = comp.length < data.length ? [8, comp] : [0, data];
  const crc = crc32(data);
  const h = Buffer.alloc(30);
  h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(method, 8);
  h.writeUInt16LE(0x21, 12); // date fixe (1980-01-01) : build reproductible
  h.writeUInt32LE(crc, 14); h.writeUInt32LE(body.length, 18); h.writeUInt32LE(data.length, 22); h.writeUInt16LE(name.length, 26);
  const c = Buffer.alloc(46);
  c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(method, 10);
  c.writeUInt16LE(0x21, 14); c.writeUInt32LE(crc, 16); c.writeUInt32LE(body.length, 20); c.writeUInt32LE(data.length, 24);
  c.writeUInt16LE(name.length, 28); c.writeUInt32LE(off, 42);
  parts.push(h, name, body); central.push(c, name);
  off += 30 + name.length + body.length;
}
const cd = Buffer.concat(central);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
mkdirSync(`${app}/build`, { recursive: true });
writeFileSync(out, Buffer.concat([...parts, cd, end]));
const size = statSync(out).size;
console.log(`${out}  ${files.length} fichiers, ${size} octets (${(size / 1024).toFixed(2)} Ko) / budget 1536.00 Ko, non signé`);
