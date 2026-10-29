// Vérifie le client packages/plex/src/api contre le VRAI serveur (HANDOFF §5.2). Hors gate npm :
//   node scripts/plex/verify.mjs
// Lecture seule : le transport refuse tout sauf GET/HEAD ; timeline et scrobble ne sont jamais appelés
// (leurs requêtes sont seulement construites). La sortie ne contient ni jeton, ni IP, ni identifiant.
import { call, loadClient, loadEnv, makeRedact, nodeHttp } from './lib.mjs';

const env = loadEnv();
const redact = makeRedact(env);
const api = await loadClient();
const ID = { clientId: env.PLEX_CLIENT_ID, product: 'Cimaise', version: '0.0.0', platform: 'Tizen', device: 'Frame' };

let failed = 0;
const ok = (name, detail) => console.log('  ok   ' + name + (detail ? ' — ' + redact(detail) : ''));
const ko = (name, detail) => { failed++; console.log('  FAIL ' + name + ' — ' + redact(detail)); };
const check = (name, cond, detail) => (cond ? ok(name, detail) : ko(name, detail || 'faux'));

// Forme attendue (types.ts) : { champ: 'string' | 'number' | 'boolean' | 'array' | 'object' | '?type' (optionnel) }.
function shapeProblems(v, shape) {
  const bad = [];
  for (const k of Object.keys(shape)) {
    const opt = shape[k][0] === '?', t = opt ? shape[k].slice(1) : shape[k];
    const x = v == null ? undefined : v[k];
    if (x === undefined) { if (!opt) bad.push(k + ' absent'); continue; }
    const real = Array.isArray(x) ? 'array' : typeof x;
    if (real !== t) bad.push(k + ' : ' + real + ' au lieu de ' + t);
  }
  return bad;
}
function checkShape(name, v, shape) {
  const bad = shapeProblems(v, shape);
  bad.length ? ko(name, bad.join(', ')) : ok(name, 'forme conforme');
}
const ITEM = { ratingKey: 'string', title: 'string', type: 'string', thumb: '?string', art: '?string', summary: '?string',
  duration: '?number', viewOffset: '?number', index: '?number', leafCount: '?number', viewedLeafCount: '?number', year: '?number',
  grandparentTitle: '?string', grandparentRatingKey: '?string', grandparentThumb: '?string', parentTitle: '?string', parentIndex: '?number', Media: '?array' };

async function main() {
  console.log('plex.tv');
  const [e1, servers] = await call((cb) => api.getServers(nodeHttp, ID, env.PLEX_TOKEN, cb));
  if (e1) return ko('getServers', e1.message);
  check('getServers : au moins un serveur', servers.length > 0, servers.length + ' serveur(s)');
  const owned = servers.filter((s) => s.owned);
  check('getServers : serveur(s) du compte distingué(s) (owned)', owned.length > 0, owned.length + ' possédé(s)');
  const server = owned[0] || servers[0];
  checkShape('Server', server, { name: 'string', accessToken: 'string', connections: 'array' });
  for (const c of server.connections) checkShape('Connection', c, { uri: 'string', local: 'boolean', relay: 'boolean' });
  const ordered = api.orderConnections(server.connections);
  check('orderConnections : une locale en premier', ordered[0] && ordered[0].local && !ordered[0].relay,
    ordered.map((c) => (c.relay ? 'relay' : c.local ? 'local' : 'distante')).join(' > '));
  check('connexions en *.plex.direct (certificat valide)', server.connections.every((c) => /^https:\/\/[^/]*\.plex\.direct(:\d+)?$/.test(c.uri)));

  const [e2, ref] = await call((cb) => api.chooseConnection(nodeHttp, ID, server, cb));
  if (e2) return ko('chooseConnection', e2.message);
  check('chooseConnection : connexion locale *.plex.direct', /\.plex\.direct:\d+$/.test(ref.uri) && ordered[0].uri === ref.uri, ref.uri);

  console.log('serveur');
  const [e3, sections] = await call((cb) => api.getSections(nodeHttp, ID, ref, cb));
  if (e3) return ko('getSections', e3.message);
  check('getSections', sections.length > 0, sections.length + ' bibliothèque(s)');
  for (const s of sections) checkShape('Section', s, { key: 'string', title: 'string', type: 'string' });
  const movie = sections.find((s) => s.type === 'movie') || sections[0];
  const show = sections.find((s) => s.type === 'show');

  const [e4, p1] = await call((cb) => api.getSectionItems(nodeHttp, ID, ref, movie.key, 0, 5, cb));
  if (e4) return ko('getSectionItems', e4.message);
  check('getSectionItems : pagination (size=5)', p1.items.length > 0 && p1.items.length <= 5 && p1.total >= p1.items.length && p1.offset === 0,
    'total ' + p1.total + ', reçu ' + p1.items.length);
  const [e5, p2] = await call((cb) => api.getSectionItems(nodeHttp, ID, ref, movie.key, 2, 3, cb));
  if (e5) return ko('getSectionItems page 2', e5.message);
  check('getSectionItems : offset honoré', p2.offset === 2 && (p1.total < 4 || (p2.items[0] && p2.items[0].ratingKey === p1.items[2].ratingKey)), 'offset ' + p2.offset);
  for (const it of p1.items) checkShape('Item (all)', it, ITEM);

  const [e6, deck] = await call((cb) => api.getOnDeck(nodeHttp, ID, ref, cb));
  if (e6) return ko('getOnDeck', e6.message);
  ok('getOnDeck', deck.length + ' élément(s)');
  for (const it of deck) checkShape('Item (onDeck)', it, ITEM);

  const [e7, recent] = await call((cb) => api.getRecentlyAdded(nodeHttp, ID, ref, cb));
  if (e7) return ko('getRecentlyAdded', e7.message);
  check('getRecentlyAdded', recent.length > 0, recent.length + ' élément(s) ; types ' + Array.from(new Set(recent.map((i) => i.type))).join(','));
  for (const it of recent.slice(0, 10)) checkShape('Item (recentlyAdded)', it, ITEM);

  const HUB = { key: 'string', title: 'string', type: 'string', hubIdentifier: 'string', size: 'number', Metadata: '?array' };
  const [e8, hubs] = await call((cb) => api.getHubs(nodeHttp, ID, ref, null, cb));
  if (e8) ko('getHubs', e8.message);
  else {
    check('getHubs (/hubs)', hubs.length > 0, hubs.length + ' rayon(s)');
    for (const h of hubs) checkShape('Hub', h, HUB);
  }
  const [e8b, shubs] = await call((cb) => api.getHubs(nodeHttp, ID, ref, movie.key, cb));
  if (e8b) ko('getHubs (section)', e8b.message);
  else {
    const withItems = shubs.filter((h) => h.Metadata && h.Metadata.length);
    check('getHubs (/hubs/sections/{id}) : éléments en ligne', withItems.length > 0, shubs.length + ' rayon(s), ' + withItems.length + ' avec éléments');
    for (const h of shubs) checkShape('Hub (section)', h, HUB);
    for (const h of withItems.slice(0, 2)) for (const it of h.Metadata.slice(0, 3)) checkShape('Item (hub)', it, ITEM);
  }

  const first = p1.items[0];
  const [e9, meta] = await call((cb) => api.getMetadata(nodeHttp, ID, ref, first.ratingKey, cb));
  if (e9) return ko('getMetadata', e9.message);
  checkShape('getMetadata : Item', meta, ITEM);
  const part = meta.Media && meta.Media[0] && meta.Media[0].Part && meta.Media[0].Part[0];
  check('getMetadata : Media[0].Part[0].key', !!part && typeof part.key === 'string');
  if (part) checkShape('Part', part, { id: 'number', key: 'string', duration: '?number' });
  if (meta.Media) checkShape('Media', meta.Media[0], { id: 'number', container: '?string', videoCodec: '?string', audioCodec: '?string', Part: '?array' });

  if (show) {
    const [e10, shows] = await call((cb) => api.getSectionItems(nodeHttp, ID, ref, show.key, 0, 1, cb));
    if (e10 || !shows.items[0]) return ko('série pour children', e10 ? e10.message : 'vide');
    const [e11, seasons] = await call((cb) => api.getChildren(nodeHttp, ID, ref, shows.items[0].ratingKey, cb));
    if (e11) return ko('getChildren (saisons)', e11.message);
    check('getChildren (saisons)', seasons.length > 0, seasons.length + ' saison(s)');
    for (const s of seasons) checkShape('Item (saison)', s, ITEM);
    if (seasons[0]) {
      const [e12, eps] = await call((cb) => api.getChildren(nodeHttp, ID, ref, seasons[0].ratingKey, cb));
      if (e12) return ko('getChildren (épisodes)', e12.message);
      check('getChildren (épisodes)', eps.length > 0, eps.length + ' épisode(s)');
      for (const ep of eps.slice(0, 5)) checkShape('Item (épisode)', ep, ITEM);
    }
  } else ok('getChildren', 'non testé : aucune bibliothèque de séries');

  console.log('médias');
  if (first.thumb) {
    const u = api.photoUrl(ref, first.thumb, 300, 450);
    const r = await fetch(u);
    const buf = Buffer.from(await r.arrayBuffer());
    check('photoUrl : image réellement téléchargée', r.status === 200 && /^image\//.test(r.headers.get('content-type') || '') && buf.length > 500,
      'HTTP ' + r.status + ', ' + r.headers.get('content-type') + ', ' + buf.length + ' o');
    const isJpeg = buf[0] === 0xff && buf[1] === 0xd8;
    let w = 0, h = 0;
    if (isJpeg) for (let i = 2; i < buf.length - 9;) { if (buf[i] !== 0xff) { i++; continue; } const m = buf[i + 1]; if (m >= 0xc0 && m <= 0xc3) { h = buf.readUInt16BE(i + 5); w = buf.readUInt16BE(i + 7); break; } i += 2 + buf.readUInt16BE(i + 2); }
    if (w) check('photoUrl : dimensions ≤ demandées (300×450)', w <= 300 && h <= 450, w + '×' + h);
  } else ko('photoUrl', 'aucune vignette sur le premier élément');
  if (part) {
    const u = api.directPlayUrl(ref, part.key);
    const r = await fetch(u, { method: 'HEAD' });
    check('directPlayUrl : HEAD', r.status === 200, 'HTTP ' + r.status + ', ' + r.headers.get('content-type') + ', ' + r.headers.get('content-length') + ' o');
  }

  console.log('requêtes d\'écriture : construction seulement (jamais envoyées)');
  const sent = [];
  const dry = (req, cb) => { sent.push(req); setImmediate(() => cb(null, { status: 200, body: '' })); return { abort() {} }; };
  await call((cb) => api.sendTimeline(dry, ID, ref, { ratingKey: first.ratingKey, state: 'playing', timeMs: 1000, durationMs: 60000 }, cb));
  await call((cb) => api.scrobble(dry, ID, ref, first.ratingKey, cb));
  await call((cb) => api.unscrobble(dry, ID, ref, first.ratingKey, cb));
  check('timeline/scrobble/unscrobble construits', sent.length === 3 && /\/:\/timeline\?/.test(sent[0].url) && /\/:\/scrobble\?/.test(sent[1].url) && /\/:\/unscrobble\?/.test(sent[2].url));
}

try { await main(); } catch (e) { ko('exception', e.stack || e.message); }
console.log(failed ? '\n' + failed + ' échec(s)' : '\ntout est conforme');
process.exit(failed ? 1 : 0);
