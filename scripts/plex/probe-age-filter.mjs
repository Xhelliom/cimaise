// Vérifie le filtre serveur contentRating=… (lecture seule, GET) : /all et /firstCharacter, totaux cohérents, codes inconnus.
//   node scripts/plex/probe-age-filter.mjs
import { call, loadClient, loadEnv, makeRedact, nodeHttp } from './lib.mjs';
const env = loadEnv(), redact = makeRedact(env);
const api = await loadClient(['plex/src/api/request']);
const ID = { clientId: env.PLEX_CLIENT_ID, product: 'Cimaise', version: '0.0.0', platform: 'Tizen', device: 'Frame' };
const get = (ref, path, extra) => call((cb) => api.serverGet(nodeHttp, ID, ref, path, extra || null, cb));
const [, servers] = await call((cb) => api.getServers(nodeHttp, ID, env.PLEX_TOKEN, cb));
const server = servers.filter((s) => s.owned)[0] || servers[0];
const [, ref] = await call((cb) => api.chooseConnection(nodeHttp, ID, server, cb));
const [, sections] = await call((cb) => api.getSections(nodeHttp, ID, ref, cb));
const page = { 'X-Plex-Container-Start': '0', 'X-Plex-Container-Size': '5' };
const tests = (process.argv[2] || 'G,PG|g,pg|G%2CPG|TV-Y,TV-G,G|PG-13|XYZ').split('|');
for (const sec of sections.filter((s) => s.type === 'movie' || s.type === 'show')) {
  const [, d] = await get(ref, '/library/sections/' + sec.key + '/contentRating');
  console.log('== ' + sec.title + ' keys: ' + (d.MediaContainer.Directory || []).map((x) => x.key + '/' + x.title).join(' '));
  for (const t of tests) {
    const [e, j] = await get(ref, '/library/sections/' + sec.key + '/all?sort=titleSort&contentRating=' + t, page);
    if (e) { console.log('  ' + t + ' : ' + redact(e.message)); continue; }
    const c = j.MediaContainer;
    const [, f] = await get(ref, '/library/sections/' + sec.key + '/firstCharacter?contentRating=' + t);
    const fs = (f.MediaContainer.Directory || []).reduce((a, x) => a + Number(x.size), 0);
    const [, u] = await get(ref, '/library/sections/' + sec.key + '/all?sort=titleSort&unwatched=1&contentRating=' + t, page);
    console.log('  ' + t + ' : total ' + c.totalSize + ' firstChar ' + fs + ' unwatched ' + u.MediaContainer.totalSize + ' ex: ' + (c.Metadata || []).map((m) => m.contentRating).join(','));
  }
}
