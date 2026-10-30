// Pastilles de la fiche sur le vrai serveur (lecture seule, GET) : un film 4K HDR, un film à piste DTS, un film à sous-titres SRT.
//   node scripts/plex/verify-badges.mjs
// Affiche, par cas : titre, faits bruts (définition, colorTrc, DOVI, codec et canaux audio, codecs de sous-titres) et pastilles calculées.
import { call, loadClient, loadEnv, makeRedact, nodeHttp } from './lib.mjs';
const env = loadEnv(), redact = makeRedact(env);
const api = await loadClient(['plex/src/api/request', 'plex/src/playback/index']);
const ID = { clientId: env.PLEX_CLIENT_ID, product: 'Cimaise', version: '0.0.0', platform: 'Tizen', device: 'Frame' };
const get = (ref, path, extra) => call((cb) => api.serverGet(nodeHttp, ID, ref, path, extra || null, cb));
const [, servers] = await call((cb) => api.getServers(nodeHttp, ID, env.PLEX_TOKEN, cb));
const server = servers.filter((s) => s.owned)[0] || servers[0];
const [, ref] = await call((cb) => api.chooseConnection(nodeHttp, ID, server, cb));
const [, sections] = await call((cb) => api.getSections(nodeHttp, ID, ref, cb));
const CASES = {
  '4K HDR': (it, v) => v && (it.Media[0].width >= 3200) && (v.colorTrc === 'smpte2084' || v.DOVIPresent),
  'DTS': (it) => { try { const p = api.decidePlayback(it, {}); return p.audio && p.audio.codec === 'dca'; } catch (e) { return false; } },
  '4K HDR direct': (it, v) => v && it.Media[0].width >= 3200 && v.colorTrc === 'smpte2084' && api.decidePlayback(it, {}).mode === 'direct',
  'SRT': (it, v, a, st) => st.some((s) => s.codec === 'srt'),
};
const found = {};
outer: for (const sec of sections.filter((s) => s.type === 'movie')) {
  for (let start = 0; ; start += 200) {
    const [e, j] = await get(ref, '/library/sections/' + sec.key + '/all', { 'X-Plex-Container-Start': String(start), 'X-Plex-Container-Size': '200' });
    if (e) break;
    const c = j.MediaContainer, list = c.Metadata || [];
    for (let i = 0; i < list.length; i += 40) {
      const [e2, j2] = await get(ref, '/library/metadata/' + list.slice(i, i + 40).map((x) => x.ratingKey).join(','));
      if (e2) continue;
      for (const it of j2.MediaContainer.Metadata || []) {
        const st = (it.Media && it.Media[0] && it.Media[0].Part && it.Media[0].Part[0].Stream) || [];
        const v = st.find((s) => s.streamType === 1), a = st.filter((s) => s.streamType === 2), t = st.filter((s) => s.streamType === 3);
        for (const [k, f] of Object.entries(CASES)) if (!found[k] && f(it, v, a, t)) found[k] = it;
        if (Object.keys(found).length === Object.keys(CASES).length) break outer;
      }
    }
    if (!list.length || start + 200 >= (c.totalSize || 0)) break;
  }
}
for (const k of Object.keys(CASES)) {
  const hit = found[k];
  if (!hit) { console.log(k, ': aucun film trouvé'); continue; }
  const [e, it] = await call((cb) => api.getMetadata(nodeHttp, ID, ref, hit.ratingKey, cb));
  if (e) { console.log(k, ': ', redact(e.message)); continue; }
  const m = it.Media[0], st = m.Part[0].Stream || [], v = st.find((s) => s.streamType === 1);
  const plan = api.decidePlayback(it, {}), b = api.techBadges(it, {});
  console.log('\n== ' + k + ' : ' + it.title + ' (' + it.year + '), ratingKey ' + it.ratingKey);
  console.log('   faits : ' + [m.width + '×' + m.height, m.container, m.videoCodec, v && v.colorTrc, v && v.DOVIPresent ? 'DOVI p' + v.DOVIProfile : '',
    'audio ' + st.filter((s) => s.streamType === 2).map((s) => s.codec + '/' + s.channels + 'ch/' + (s.languageCode || '?')).join(' '),
    'st ' + st.filter((s) => s.streamType === 3).map((s) => s.codec + '/' + (s.languageCode || '?') + (s.key ? '/ext' : '')).join(' ')].filter(Boolean).join(', '));
  console.log('   lecteur : ' + plan.reason);
  console.log('   pastilles : ' + (b ? b.labels.map((l) => '[' + l + ']').join(' ') : 'aucune'));
}
