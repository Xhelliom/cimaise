// Liste DISTINCTE des contentRating par bibliothèque films/séries du vrai serveur (lecture seule, GET).
//   node scripts/plex/list-content-ratings.mjs
// Sert à construire la table de packages/plex/src/ui/age.ts (voir docs/decisions.md).
import { call, loadClient, loadEnv, makeRedact, nodeHttp } from './lib.mjs';
const env = loadEnv(), redact = makeRedact(env);
const api = await loadClient(['plex/src/api/request']);
const ID = { clientId: env.PLEX_CLIENT_ID, product: 'Cimaise', version: '0.0.0', platform: 'Tizen', device: 'Frame' };
const get = (ref, path) => call((cb) => api.serverGet(nodeHttp, ID, ref, path, null, cb));
const [, servers] = await call((cb) => api.getServers(nodeHttp, ID, env.PLEX_TOKEN, cb));
const server = servers.filter((s) => s.owned)[0] || servers[0];
const [, ref] = await call((cb) => api.chooseConnection(nodeHttp, ID, server, cb));
const [, sections] = await call((cb) => api.getSections(nodeHttp, ID, ref, cb));
for (const sec of sections.filter((s) => s.type === 'movie' || s.type === 'show')) {
  const [e, j] = await get(ref, '/library/sections/' + sec.key + '/contentRating');
  if (e) { console.log(sec.title, ':', redact(e.message)); continue; }
  const vals = (j.MediaContainer.Directory || []).map((d) => d.title);
  // Comptage par valeur (types=1 film, 2 série) pour savoir ce qui pèse.
  const [e2, all] = await get(ref, '/library/sections/' + sec.key + '/all?type=' + (sec.type === 'movie' ? 1 : 2));
  const n = {};
  if (!e2) for (const m of all.MediaContainer.Metadata || []) { const k = m.contentRating || '(vide)'; n[k] = (n[k] || 0) + 1; }
  console.log('== ' + sec.title + ' (' + sec.type + ') : ' + vals.length + ' valeurs');
  console.log('   ' + Object.keys(n).sort().map((k) => k + '×' + n[k]).join('  '));
}
