// Capture de la fiche d'une série avec ?includeOnDeck=1, lecture seule :
//   node scripts/plex/capture-show-fixtures.mjs
// Écrit tests/fixtures/plex/show-ondeck.json (série entamée : OnDeck présent) et show-finished.json (série terminée :
// pas d'OnDeck). Liste blanche de champs, titres remplacés, identifiants factices ; le script échoue si la sortie
// contient encore un secret ou un hôte réel, ou si un cas n'a pas d'exemple.
import { writeFileSync } from 'node:fs';
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
const num = (v) => (typeof v === 'number' ? v : undefined);
const clean = (o) => { for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k]; return o; };
const TS = 1700000000;

// Épisode « à suivre » : mêmes champs que la liste blanche de capture-fixtures.mjs, plus parentRatingKey (présent en réel).
function anonEpisode(e, base) {
  const rk = String(base + 1);
  return clean({
    ratingKey: rk, key: '/library/metadata/' + rk, type: 'episode', title: 'Titre d\'épisode ' + (base + 1),
    grandparentTitle: 'Titre de série ' + base, grandparentRatingKey: String(base), grandparentThumb: '/library/metadata/' + base + '/thumb/' + TS,
    parentTitle: 'Titre de saison ' + e.parentIndex, parentRatingKey: String(base + 50), parentIndex: num(e.parentIndex),
    summary: e.summary ? 'Résumé.' : undefined, year: num(e.year), index: num(e.index), duration: num(e.duration), viewOffset: num(e.viewOffset),
    thumb: '/library/metadata/' + rk + '/thumb/' + TS, art: '/library/metadata/' + rk + '/art/' + TS,
    Media: (e.Media || []).slice(0, 1).map((m) => ({ id: 900 + base, container: m.container, videoCodec: m.videoCodec, audioCodec: m.audioCodec,
      Part: (m.Part || []).slice(0, 1).map((p) => ({ id: 900 + base, key: '/library/parts/' + (900 + base) + '/' + TS + '/file.' + (m.container || 'mkv'), duration: num(p.duration) })) })),
  });
}
function anonShow(s, base) {
  const d = s.OnDeck && s.OnDeck.Metadata;
  const ep = Array.isArray(d) ? d[0] : d;
  return clean({
    ratingKey: String(base), key: '/library/metadata/' + base, type: 'show', title: 'Titre de série ' + base, summary: s.summary ? 'Résumé.' : undefined,
    year: num(s.year), leafCount: num(s.leafCount), viewedLeafCount: num(s.viewedLeafCount),
    thumb: '/library/metadata/' + base + '/thumb/' + TS, art: '/library/metadata/' + base + '/art/' + TS,
    // Forme réelle conservée : OnDeck.Metadata est UN objet (pas un tableau).
    OnDeck: ep ? { Metadata: anonEpisode(ep, base) } : undefined,
  });
}

const sec = (await get('/library/sections')).MediaContainer.Directory.find((d) => d.type === 'show');
const shows = (await get('/library/sections/' + sec.key + '/all', { 'X-Plex-Container-Size': '100' })).MediaContainer.Metadata;
const cases = [
  ['show-ondeck', shows.find((s) => s.viewedLeafCount > 0 && s.viewedLeafCount < s.leafCount), 700],
  ['show-finished', shows.find((s) => s.leafCount > 0 && s.viewedLeafCount === s.leafCount), 800],
];
const written = [];
for (const [name, s, base] of cases) {
  if (!s) throw new Error('aucune série pour le cas ' + name);
  const m = (await get('/library/metadata/' + s.ratingKey + '?includeOnDeck=1')).MediaContainer.Metadata[0];
  if (name === 'show-ondeck' && !m.OnDeck) throw new Error('série entamée sans OnDeck');
  if (name === 'show-finished' && m.OnDeck) throw new Error('série terminée avec OnDeck');
  const txt = JSON.stringify({ MediaContainer: { size: 1, Metadata: [anonShow(m, base)] } }, null, 2) + '\n';
  const secrets = [env.PLEX_TOKEN, env.PLEX_CLIENT_ID, real.accessToken, new URL(env.PLEX_SERVER_URL).hostname, ...real.connections.map((c) => new URL(c.uri).hostname), m.title].filter(Boolean);
  for (const x of secrets) if (txt.includes(x)) throw new Error('SECRET ou titre réel dans ' + name);
  if (/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/.test(txt)) throw new Error('IP dans ' + name);
  written.push([name, txt]);
}
for (const [name, txt] of written) writeFileSync(join(ROOT, 'tests/fixtures/plex', name + '.json'), txt);
console.log('écrit : ' + written.map((w) => w[0]).join(', '));
