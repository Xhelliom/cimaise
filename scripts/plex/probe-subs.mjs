// Sonde en lecture seule (GET) : les sous-titres texte internes (ASS/SSA, mov_text, SRT) sont-ils servis en SRT par le serveur, et comment ?
//   node scripts/plex/probe-subs.mjs
// Sortie anonymisée : codecs, présence de clé, statuts HTTP, forme du corps (SRT ou non), jamais de texte de sous-titre.
import { call, loadClient, loadEnv, makeRedact, nodeHttp } from './lib.mjs';
process.env.PLEX_ENV_FILE = process.env.PLEX_ENV_FILE || '/home/swetterwald/git/cimaise/.local/plex.env';
const env = loadEnv(), redact = makeRedact(env);
const api = await loadClient(['plex/src/api/request', 'plex/src/playback/index']);
const ID = { clientId: env.PLEX_CLIENT_ID, product: 'Cimaise', version: '0.0.0', platform: 'Tizen', device: 'Frame' };
const get = (ref, path, extra) => call((cb) => api.serverGet(nodeHttp, ID, ref, path, extra || null, cb));
const [, servers] = await call((cb) => api.getServers(nodeHttp, ID, env.PLEX_TOKEN, cb));
const server = servers.filter((s) => s.owned)[0] || servers[0];
const [, ref] = await call((cb) => api.chooseConnection(nodeHttp, ID, server, cb));
const [, sections] = await call((cb) => api.getSections(nodeHttp, ID, ref, cb));
const seen = {}, samples = {};
for (const sec of sections.filter((s) => s.type === 'movie' || s.type === 'show')) {
  for (let start = 0; ; start += 500) {
    const [e, j] = await get(ref, '/library/sections/' + sec.key + '/all?type=' + (sec.type === 'movie' ? 1 : 4), { 'X-Plex-Container-Start': String(start), 'X-Plex-Container-Size': '500' });
    if (e) break;
    const c = j.MediaContainer, list = c.Metadata || [];
    const keys = list.map((i) => i.ratingKey);
    for (let i = 0; i < keys.length; i += 40) {
      const [e2, j2] = await get(ref, '/library/metadata/' + keys.slice(i, i + 40).join(','));
      if (e2) continue;
      for (const it of j2.MediaContainer.Metadata || []) (it.Media || []).forEach((m, mi) => (m.Part || []).forEach((p) => (p.Stream || []).forEach((s) => {
        if (s.streamType !== 3) return;
        const k = (s.codec || '?') + (s.key ? ' avec clé ' + s.key.replace(/\d+/g, 'N') : ' sans clé');
        seen[k] = (seen[k] || 0) + 1;
        if (!samples[k]) samples[k] = { rk: it.ratingKey, mi, partId: p.id, s };
      })));
    }
    if (!list.length || start + 500 >= (c.totalSize || 0)) break;
  }
}
console.log(JSON.stringify(seen, null, 1));
const shape = (b) => /^\s*1\s*\r?\n\d\d:\d\d:\d\d,\d{3} --> /.test(b) ? 'SRT' : /^\[Script Info\]/i.test(b) ? 'ASS' : /^WEBVTT/.test(b) ? 'VTT' : 'autre : ' + b.slice(0, 60).replace(/\s+/g, ' ');
const url = (path) => ref.uri + path + (path.includes('?') ? '&' : '?') + 'X-Plex-Token=' + env.PLEX_TOKEN;
for (const [k, x] of Object.entries(samples)) {
  if (!/^(ass|mov_text|srt)/.test(k)) continue;
  const id = x.s.id, tries = [x.s.key || '/library/streams/' + id,
    '/library/streams/' + id + '.srt', '/library/streams/' + id + '?format=srt',
    '/video/:/transcode/universal/subtitles?' + new URLSearchParams({ path: '/library/metadata/' + x.rk, mediaIndex: String(x.mi), partIndex: '0', protocol: 'http', subtitleStreamID: String(id), format: 'srt', 'X-Plex-Client-Identifier': env.PLEX_CLIENT_ID, 'X-Plex-Product': 'Cimaise', 'X-Plex-Platform': 'Tizen' }),
    ...[{ 'X-Plex-Client-Profile-Name': 'Generic' }, { 'X-Plex-Client-Profile-Name': 'Generic', subtitles: 'sidecar', offset: '0', copyts: '1', directPlay: '0' }].map((extra) => '/video/:/transcode/universal/subtitles?' + new URLSearchParams({ path: '/library/metadata/' + x.rk, mediaIndex: String(x.mi), partIndex: '0', protocol: 'http', subtitleStreamID: String(id), 'X-Plex-Client-Identifier': env.PLEX_CLIENT_ID, 'X-Plex-Product': 'Cimaise', 'X-Plex-Platform': 'Tizen', ...extra }))];
  for (const t of tries) {
    const [e, r] = await call((cb) => nodeHttp({ method: 'GET', url: url(t), headers: /transcode/.test(t) ? { 'X-Plex-Client-Profile-Name': 'Generic', 'X-Plex-Client-Identifier': env.PLEX_CLIENT_ID, 'X-Plex-Product': 'Cimaise', 'X-Plex-Platform': 'Tizen' } : {}, timeoutMs: 30000 }, cb));
    console.log(k, '|', redact(t.replace(/\d{3,}/g, 'N').replace(/X-Plex-[A-Za-z-]+=[^&]*&?/g, '')), '→', e ? 'ERR ' + redact(e.message) : r.status + ', ' + r.body.length + ' o, ' + shape(r.body));
  }
}
