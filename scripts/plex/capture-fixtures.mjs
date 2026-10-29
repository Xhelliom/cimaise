// Régénère tests/fixtures/plex/*.json à partir de réponses RÉELLES (lecture seule), réduites et anonymisées :
//   node scripts/plex/capture-fixtures.mjs
// Liste blanche de champs (rien d'autre ne passe), titres/résumés remplacés, identifiants renumérotés,
// hôtes et jetons factices. Le script échoue si la sortie contient encore un secret ou un hôte réel.
// Les pin-*.json restent écrits à la main : créer un PIN écrit chez plex.tv, interdit ici.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { call, loadClient, loadEnv, nodeHttp, ROOT } from './lib.mjs';

const env = loadEnv();
const api = await loadClient();
const ID = { clientId: env.PLEX_CLIENT_ID, product: 'Cimaise', version: '0.0.0', platform: 'Tizen', device: 'Frame' };
const OUT = join(ROOT, 'tests/fixtures/plex');
const HASH = '0'.repeat(32), FAKE_TOKEN = 'FAKE-SERVER-TOKEN', TS = 1700000000;

const get = async (token, uri, path, extra) => {
  const r = await fetch(uri + path, { headers: { Accept: 'application/json', 'X-Plex-Client-Identifier': env.PLEX_CLIENT_ID, 'X-Plex-Token': token, ...(extra || {}) } });
  if (r.status !== 200) throw new Error('HTTP ' + r.status + ' sur ' + path.replace(/\?.*/, ''));
  return r.json();
};
const write = (name, v) => writeFileSync(join(OUT, name + '.json'), JSON.stringify(v, null, 2) + '\n');

// --- Anonymisation -----------------------------------------------------------------------------------------
const ids = new Map(); // identifiant réel → factice, stable d'un fichier à l'autre
const anonId = (real, base) => { const k = base + ':' + real; if (!ids.has(k)) ids.set(k, String(base + [...ids.keys()].filter((x) => x.startsWith(base + ':')).length)); return ids.get(k); };
const titles = new Map();
const label = (real, prefix) => { const k = prefix + '|' + real; if (!titles.has(k)) titles.set(k, prefix + ' ' + (1 + [...titles.keys()].filter((x) => x.startsWith(prefix + '|')).length)); return titles.get(k); };
const num = (v) => (typeof v === 'number' ? v : undefined);

function anonPart(p) {
  const m = /^\/library\/parts\/(\d+)\/\d+\/file\.(\w+)$/.exec(p.key || '');
  const pid = anonId(p.id, 10);
  return { id: Number(pid), key: '/library/parts/' + pid + '/' + TS + '/file.' + (m ? m[2] : 'mkv'), duration: num(p.duration) };
}
function anonItem(it, o) {
  o = o || {};
  const rk = anonId(it.ratingKey, o.base || 100);
  const out = { ratingKey: rk, key: it.key && '/library/metadata/' + rk, type: it.type };
  if (it.type === 'episode') {
    out.title = label(it.title, 'Titre d\'épisode');
    if (it.grandparentTitle) out.grandparentTitle = label(it.grandparentTitle, 'Titre de série');
    if (it.grandparentRatingKey) { out.grandparentRatingKey = anonId(it.grandparentRatingKey, 200); if (it.grandparentThumb) out.grandparentThumb = '/library/metadata/' + out.grandparentRatingKey + '/thumb/' + TS; }
    if (it.parentTitle) out.parentTitle = label(it.parentTitle, 'Titre de saison');
    out.parentIndex = num(it.parentIndex);
  } else if (it.type === 'season') {
    out.title = label(it.title, 'Titre de saison');
    if (it.parentTitle) out.parentTitle = label(it.parentTitle, 'Titre de série');
  } else if (it.type === 'album') {
    out.title = label(it.title, 'Titre d\'album');
    if (it.parentTitle) out.parentTitle = label(it.parentTitle, 'Titre d\'artiste');
  } else out.title = label(it.title, 'Titre de film');
  if (it.summary) out.summary = 'Résumé.';
  out.year = num(it.year); out.index = num(it.index); out.duration = num(it.duration);
  out.leafCount = num(it.leafCount); out.viewedLeafCount = num(it.viewedLeafCount);
  out.viewOffset = o.viewOffset !== undefined ? o.viewOffset : num(it.viewOffset);
  if (it.thumb) out.thumb = '/library/metadata/' + rk + '/thumb/' + TS;
  if (it.art) out.art = '/library/metadata/' + rk + '/art/' + TS;
  if (it.Media) out.Media = it.Media.slice(0, 1).map((m) => ({ id: Number(anonId(m.id, 10)) + 100, container: m.container, videoCodec: m.videoCodec, audioCodec: m.audioCodec, Part: (m.Part || []).slice(0, 1).map(anonPart) }));
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
  return out;
}
const wrap = (c, o) => ({ MediaContainer: Object.assign({ size: (o.Metadata || o.Directory || o.Hub || []).length }, c, o) });

// --- Capture -----------------------------------------------------------------------------------------------
const res = await (await fetch('https://plex.tv/api/v2/resources?includeHttps=1&includeRelay=1', { headers: { Accept: 'application/json', 'X-Plex-Client-Identifier': env.PLEX_CLIENT_ID, 'X-Plex-Token': env.PLEX_TOKEN } })).json();
const [, servers] = await call((cb) => api.getServers(nodeHttp, ID, env.PLEX_TOKEN, cb));
const real = servers.find((s) => s.owned);
const [, ref] = await call((cb) => api.chooseConnection(nodeHttp, ID, real, cb));

const fakeConns = (i) => [
  { protocol: 'https', address: '192.0.2.1' + i, port: 32400, uri: 'https://192-0-2-1' + i + '.' + HASH + '.plex.direct:32400', local: true, relay: false, IPv6: false },
  { protocol: 'https', address: '203.0.113.' + (5 + i), port: 32400, uri: 'https://203-0-113-' + (5 + i) + '.' + HASH + '.plex.direct:32400', local: false, relay: false, IPv6: false },
  { protocol: 'https', address: '203.0.113.' + (9 + i), port: 8443, uri: 'https://203-0-113-' + (9 + i) + '.' + HASH + '.plex.direct:8443', local: false, relay: true, IPv6: false },
];
const kinds = res.filter((r) => /server|player/.test(r.provides));
const srvRes = kinds.filter((r) => r.provides.split(',').indexOf('server') >= 0);
const owned = srvRes.filter((r) => r.owned)[0], shared = srvRes.filter((r) => !r.owned)[0], player = kinds.filter((r) => r.provides.split(',').indexOf('server') < 0)[0];
const entry = (r, name, tok, i) => ({ name, product: r.product, provides: r.provides, owned: r.owned, home: r.home, presence: r.presence, httpsRequired: r.httpsRequired, accessToken: tok, connections: fakeConns(i) });
write('resources', [entry(owned, 'Serveur test', FAKE_TOKEN, 0)].concat(shared ? [entry(shared, 'Serveur partagé', 'FAKE-SHARED-TOKEN', 1)] : [], player ? [entry(player, 'Lecteur', 'FAKE-PLAYER', 2)] : []));

const sec = (await get(ref.token, ref.uri, '/library/sections')).MediaContainer.Directory;
const names = { movie: ['1', 'Films'], show: ['2', 'Séries'], artist: ['3', 'Musique'] };
write('sections', wrap({}, { Directory: sec.filter((d) => names[d.type]).map((d) => ({ key: names[d.type][0], title: names[d.type][1], type: d.type })) }));
const movieKey = sec.find((d) => d.type === 'movie').key;

const all = (await get(ref.token, ref.uri, '/library/sections/' + movieKey + '/all', { 'X-Plex-Container-Start': '20', 'X-Plex-Container-Size': '2' })).MediaContainer;
write('section-all', wrap({ totalSize: all.totalSize, offset: all.offset }, { Metadata: all.Metadata.map((m) => anonItem(m, { base: 100 })) }));

const first = all.Metadata[0];
const meta = (await get(ref.token, ref.uri, '/library/metadata/' + first.ratingKey)).MediaContainer.Metadata[0];
const metaItem = anonItem(meta, { base: 100 });
write('metadata', wrap({}, { Metadata: [metaItem] }));

const deckAll = (await get(ref.token, ref.uri, '/library/onDeck')).MediaContainer.Metadata;
const ep = deckAll.filter((i) => i.type === 'episode');
if (!ep.length) throw new Error('aucun épisode en cours : impossible de capturer onDeck');
write('ondeck', wrap({}, { Metadata: ep.slice(0, 2).map((m, i) => anonItem(m, { base: 300, viewOffset: 600000 + i * 1000 })) }));

const recent = (await get(ref.token, ref.uri, '/library/recentlyAdded')).MediaContainer.Metadata;
const picks = [];
for (const t of ['movie', 'season', 'album']) { const m = recent.find((i) => i.type === t); if (m) picks.push(m); }
write('recently-added', wrap({}, { Metadata: picks.map((m) => anonItem(m, { base: 400 })) }));

const show = (await get(ref.token, ref.uri, '/library/sections/' + sec.find((d) => d.type === 'show').key + '/all', { 'X-Plex-Container-Start': '0', 'X-Plex-Container-Size': '1' })).MediaContainer.Metadata[0];
const seasons = (await get(ref.token, ref.uri, '/library/metadata/' + show.ratingKey + '/children')).MediaContainer.Metadata;
const eps = (await get(ref.token, ref.uri, '/library/metadata/' + seasons[0].ratingKey + '/children')).MediaContainer.Metadata;
write('children', wrap({}, { Metadata: eps.slice(0, 2).map((m) => anonItem(m, { base: 500 })) }));

const hubs = (await get(ref.token, ref.uri, '/hubs')).MediaContainer.Hub;
const hubAnon = (h, withItems) => Object.assign({ key: h.key.replace(/\d{3,}/g, '1'), title: label(h.title, 'Rayon'), type: h.type, hubIdentifier: h.hubIdentifier.replace(/\d{3,}/g, '1'), size: h.size },
  withItems && h.Metadata ? { Metadata: h.Metadata.slice(0, 2).map((m) => anonItem(m, { base: 600 })) } : {});
write('hubs', wrap({}, { Hub: hubs.slice(0, 4).map((h) => hubAnon(h, false)) }));
const sh = (await get(ref.token, ref.uri, '/hubs/sections/' + movieKey)).MediaContainer.Hub;
write('hubs-section', wrap({}, { Hub: sh.filter((h) => h.Metadata && h.Metadata.length).slice(0, 2).map((h) => hubAnon(h, true)) }));

// --- Garde-fou : plus aucun secret ni hôte réel dans ce qu'on vient d'écrire --------------------------------
import { readdirSync, readFileSync } from 'node:fs';
const hosts = [new URL(env.PLEX_SERVER_URL).hostname, ...real.connections.map((c) => new URL(c.uri).hostname), ...real.connections.map((c) => c.uri.split('.')[0].replace('https://', ''))];
const secrets = [env.PLEX_TOKEN, env.PLEX_CLIENT_ID, real.accessToken, ...hosts, ...res.map((r) => r.clientIdentifier), ...servers.map((s) => s.name)].filter(Boolean);
let bad = 0;
for (const f of readdirSync(OUT).filter((x) => x.endsWith('.json'))) {
  const txt = readFileSync(join(OUT, f), 'utf8');
  for (const sct of secrets) if (txt.includes(sct)) { bad++; console.error('SECRET dans ' + f); }
  if (/\b(?!192\.0\.2\.|203\.0\.113\.)\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/.test(txt)) { bad++; console.error('IP dans ' + f); }
}
if (bad) { console.error('fixtures non fiables : relancer après correction'); process.exit(1); }
console.log('fixtures écrites dans tests/fixtures/plex');
