// Capture de fixtures « médias » (Media/Part/Stream complets) pour packages/plex/src/playback, lecture seule :
//   node scripts/plex/capture-media-fixtures.mjs
// Parcourt la bibliothèque de films, choisit un exemple par cas (voir CASES), puis écrit
// tests/fixtures/plex/media-samples.json : [{ name, MediaContainer }] au format de /library/metadata/{id}.
// Liste blanche de champs, titres remplacés, identifiants renumérotés, chemins de fichiers supprimés. Le script
// échoue si la sortie contient encore un secret ou un hôte réel, ou si un cas n'a pas d'exemple.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { call, loadClient, loadEnv, nodeHttp, ROOT } from './lib.mjs';

const env = loadEnv();
const api = await loadClient();
const ID = { clientId: env.PLEX_CLIENT_ID, product: 'Cimaise', version: '0.0.0', platform: 'Tizen', device: 'Frame' };
const [, servers] = await call((cb) => api.getServers(nodeHttp, ID, env.PLEX_TOKEN, cb));
const real = servers.find((s) => s.owned);
const [, ref] = await call((cb) => api.chooseConnection(nodeHttp, ID, real, cb));
const get = async (path, extra) => {
  const r = await fetch(ref.uri + path, { headers: { Accept: 'application/json', 'X-Plex-Client-Identifier': env.PLEX_CLIENT_ID, 'X-Plex-Token': ref.token, ...(extra || {}) } });
  if (r.status !== 200) throw new Error('HTTP ' + r.status + ' sur ' + path.replace(/\?.*/, ''));
  return r.json();
};

const streams = (md, t) => ((md.Media[0].Part[0].Stream) || []).filter((s) => s.streamType === t);
const subs = (md) => streams(md, 3);
const ext = (s) => !!s.key;
const video = (md) => streams(md, 1)[0] || {};
const has = (md, codec) => subs(md).some((s) => s.codec === codec);
const m0 = (md) => md.Media[0];
// Un cas = un nom + un prédicat sur la fiche complète. Le premier film qui convient est retenu.
const CASES = [
  ['mp4-h264-aac', (md) => m0(md).container === 'mp4' && m0(md).videoCodec === 'h264' && m0(md).audioCodec === 'aac' && m0(md).Part.length === 1],
  ['mkv-h264-ac3-srt-externe', (md) => m0(md).container === 'mkv' && m0(md).videoCodec === 'h264' && m0(md).audioCodec === 'ac3' && subs(md).some(ext) && !has(md, 'pgs') && !has(md, 'ass')],
  ['mkv-hevc-eac3-srt-interne-et-externe', (md) => m0(md).container === 'mkv' && m0(md).videoCodec === 'hevc' && m0(md).audioCodec === 'eac3' && video(md).colorTrc !== 'smpte2084' && has(md, 'srt') && subs(md).some(ext) && !has(md, 'pgs')],
  ['mkv-hevc-hdr10', (md) => m0(md).container === 'mkv' && m0(md).videoCodec === 'hevc' && video(md).colorTrc === 'smpte2084' && ['ac3', 'eac3'].indexOf(m0(md).audioCodec) >= 0 && !has(md, 'pgs')],
  ['mkv-h264-dts', (md) => m0(md).container === 'mkv' && m0(md).videoCodec === 'h264' && m0(md).audioCodec === 'dca' && has(md, 'srt')],
  ['mkv-h264-truehd-pgs', (md) => m0(md).videoCodec === 'h264' && m0(md).audioCodec === 'truehd' && has(md, 'pgs')],
  ['mkv-h264-ac3-pgs', (md) => m0(md).container === 'mkv' && m0(md).videoCodec === 'h264' && m0(md).audioCodec === 'ac3' && has(md, 'pgs') && !has(md, 'ass')],
  ['mkv-h264-ac3-ass', (md) => m0(md).container === 'mkv' && m0(md).videoCodec === 'h264' && m0(md).audioCodec === 'ac3' && has(md, 'ass')],
  ['mkv-h264-ac3-srt-force', (md) => m0(md).container === 'mkv' && m0(md).videoCodec === 'h264' && m0(md).audioCodec === 'ac3' && subs(md).some((s) => s.forced && s.codec === 'srt')],
  ['mkv-h264-ac3-vobsub', (md) => m0(md).videoCodec === 'h264' && has(md, 'vobsub')],
  ['avi-mpeg4-mp3', (md) => m0(md).container === 'avi' && m0(md).videoCodec === 'mpeg4'],
  ['mkv-av1-opus', (md) => m0(md).videoCodec === 'av1'],
];

const sec = (await get('/library/sections')).MediaContainer.Directory.filter((d) => d.type === 'movie');
const found = new Map();
for (const s of sec) {
  const all = (await get('/library/sections/' + s.key + '/all', { 'X-Plex-Container-Start': '0', 'X-Plex-Container-Size': '400' })).MediaContainer.Metadata || [];
  for (const it of all) {
    if (found.size === CASES.length) break;
    if (!CASES.some((c) => !found.has(c[0]))) break;
    const md = (await get('/library/metadata/' + it.ratingKey)).MediaContainer.Metadata[0];
    if (!md.Media || !md.Media[0] || !md.Media[0].Part || !md.Media[0].Part[0]) continue;
    for (const [name, pred] of CASES) if (!found.has(name) && pred(md)) { found.set(name, md); break; }
  }
}
const missing = CASES.filter((c) => !found.has(c[0])).map((c) => c[0]);
if (missing.length) { console.error('cas sans exemple : ' + missing.join(', ')); process.exit(1); }

// --- Anonymisation (liste blanche) -------------------------------------------------------------------------
const TS = 1700000000;
let n = 0;
const pick = (o, keys) => { const r = {}; for (const k of keys) if (o[k] !== undefined) r[k] = o[k]; return r; };
function anonStream(s, i, base) {
  const out = pick(s, ['streamType', 'codec', 'index', 'languageCode', 'default', 'selected', 'forced', 'format', 'channels', 'profile', 'bitDepth', 'colorTrc', 'width', 'height', 'DOVIPresent', 'DOVIProfile', 'hearingImpaired']);
  out.id = base + i;
  if (s.key) out.key = '/library/streams/' + out.id;
  return out;
}
function anon(md, idx) {
  const base = 1000 * (idx + 1), rk = String(100 + idx);
  return {
    MediaContainer: {
      size: 1,
      Metadata: [{
        ratingKey: rk, key: '/library/metadata/' + rk, type: 'movie', title: 'Titre de film ' + (idx + 1), duration: md.duration,
        Media: md.Media.map((m, mi) => Object.assign(pick(m, ['container', 'videoCodec', 'audioCodec', 'videoProfile', 'width', 'height', 'bitrate', 'audioChannels', 'duration']), {
          id: base + 100 + mi,
          Part: m.Part.map((p, pi) => ({ id: base + 200 + mi * 10 + pi, key: '/library/parts/' + (base + 200 + mi * 10 + pi) + '/' + TS + '/file.' + (p.container || m.container),
            duration: p.duration, container: p.container, videoProfile: p.videoProfile,
            Stream: (p.Stream || []).map((s, si) => anonStream(s, si, base + 300 + mi * 100 + pi * 50)) }))
        }))
      }]
    }
  };
}
const out = [...found.entries()].map(([name, md], i) => ({ name, ...anon(md, i) }));
const path = join(ROOT, 'tests/fixtures/plex/media-samples.json');
writeFileSync(path, JSON.stringify(out, null, 2) + '\n');

// --- Garde-fou ---------------------------------------------------------------------------------------------
const txt = readFileSync(path, 'utf8');
const secrets = [env.PLEX_TOKEN, env.PLEX_CLIENT_ID, real.accessToken, new URL(env.PLEX_SERVER_URL).hostname, ...real.connections.map((c) => new URL(c.uri).hostname)].filter(Boolean);
let bad = 0;
for (const x of secrets) if (txt.includes(x)) { bad++; console.error('SECRET dans media-samples.json'); }
if (/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/.test(txt)) { bad++; console.error('IP dans media-samples.json'); }
if (bad) { process.exit(1); }
console.log(out.length + ' cas écrits dans tests/fixtures/plex/media-samples.json : ' + out.map((o) => o.name).join(', '));
