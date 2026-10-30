// Vérifie le client Overseerr contre la vraie instance, EN LECTURE SEULE :
//   node scripts/overseerr/verify.mjs
// Chaque fonction de lecture est appelée telle quelle (client compilé en ES5) ; la demande (POST /request) n'est JAMAIS
// envoyée : sa forme est vérifiée contre la doc OpenAPI de l'instance (/api-docs) et contre des demandes existantes (GET /request).
// Rien de secret n'est affiché (clé et hôte masqués). Code de sortie 1 au premier écart.
import { call, getJson, loadClient, loadEnv, makeRedact, nodeHttp } from './lib.mjs';

const cfg = loadEnv();
const redact = makeRedact(cfg);
const api = await loadClient();
let bad = 0;
const ok = (cond, msg) => { console.log((cond ? 'OK   ' : 'ÉCHEC ') + redact(msg)); if (!cond) bad++; };
const AV = ['none', 'pending', 'processing', 'partial', 'available'];

function checkPage(name, err, p, opts = {}) {
  ok(!err, name + (err ? ' : ' + err.code + ' ' + err.message : ''));
  if (err) return;
  ok(p.page >= 1 && p.totalPages >= p.page && p.totalResults >= p.items.length, `${name} : page ${p.page}/${p.totalPages}, ${p.totalResults} résultats, ${p.items.length} titres`);
  ok(p.items.length > 0 || opts.empty, name + ' : au moins un titre');
  ok(p.items.every((t) => typeof t.id === 'number' && (t.mediaType === 'movie' || t.mediaType === 'tv') && t.title && AV.includes(t.availability)), name + ' : titres normalisés (id, type, titre, disponibilité)');
  if (opts.type) ok(p.items.every((t) => t.mediaType === opts.type), name + ' : tous de type ' + opts.type);
  const counts = {};
  for (const t of p.items) counts[t.availability] = (counts[t.availability] || 0) + 1;
  console.log('     disponibilités : ' + JSON.stringify(counts));
}

const lang = { ...cfg, language: 'fr' };
let [e, p] = await call((cb) => api.discoverMovies(nodeHttp, lang, 1, cb)); checkPage('discover/movies p1', e, p, { type: 'movie' });
const firstPoster = p && p.items.find((t) => t.posterPath);
const p1 = p ? p.items : [], p1ids = p1.map((t) => t.id);
[e, p] = await call((cb) => api.discoverMovies(nodeHttp, lang, 2, cb)); checkPage('discover/movies p2', e, p, { type: 'movie' });
// TMDB répète quelques titres d'une page à l'autre : appendTitles doit les retirer.
const dup = p ? p.items.filter((t) => p1ids.includes(t.id)).length : -1;
const merged = p ? api.appendTitles(p1.slice(), p.items) : [];
ok(p && p.page === 2 && merged.length === p1.length + p.items.length - dup && new Set(merged.map((t) => t.id)).size === merged.length,
  `discover/movies : pages 1 + 2 fusionnées sans doublon (${dup} titre(s) répété(s) par TMDB)`);
[e, p] = await call((cb) => api.discoverTv(nodeHttp, lang, 1, cb)); checkPage('discover/tv', e, p, { type: 'tv' });
[e, p] = await call((cb) => api.trending(nodeHttp, lang, 1, cb)); checkPage('discover/trending', e, p);
[e, p] = await call((cb) => api.search(nodeHttp, lang, 'amelie', 1, cb)); checkPage('search « amelie »', e, p);
// Caractères qu'encodeURIComponent laisse passer et qu'Overseerr refuse (400) : l'encodage strict doit les couvrir.
for (const q of ["l'été", 'star wars (1977)!', 'a*b', 'Spider-Man: Across the Spider-Verse', '1/2 & 3+4 #5 ?']) {
  [e, p] = await call((cb) => api.search(nodeHttp, lang, q, 1, cb));
  ok(!e, `search « ${q} » acceptée` + (e ? ' : ' + e.code + ' ' + e.message : ` (${p.totalResults} résultats)`));
}
[e] = await call((cb) => api.discoverMovies(nodeHttp, { ...cfg, key: 'cle-invalide' }, 1, cb));
ok(e && e.code === 'unauthorized', 'clé invalide → unauthorized' + (e ? ' (HTTP ' + e.status + ')' : ''));

// Affiches : TMDB en taille réduite.
if (firstPoster) {
  for (const size of ['w185', 'w300']) {
    const url = api.posterUrl(firstPoster.posterPath, size);
    const r = await fetch(url);
    const n = (await r.arrayBuffer()).byteLength;
    ok(r.status === 200 && /^image\//.test(r.headers.get('content-type') || ''), `affiche ${size} : ${r.status}, ${(n / 1024).toFixed(1)} Ko`);
  }
}

// Demande : le transport refuse tout POST (aucune écriture possible depuis ce script).
[e] = await call((cb) => api.requestMedia(nodeHttp, cfg, 'movie', 1, cb));
ok(e && e.code === 'unreachable' && /lecture seule/.test(e.message), 'POST /request refusé par le transport (aucune demande envoyée)');

// Forme de la demande contre la doc OpenAPI de l'instance.
const init = await (await fetch(cfg.url + '/api-docs/swagger-ui-init.js')).text();
const m = /"swaggerDoc":\s*(\{[\s\S]*\}),\s*\n\s*"customOptions"/.exec(init);
ok(!!m, 'doc OpenAPI lue (/api-docs)');
if (m) {
  const doc = JSON.parse(m[1]);
  const post = doc.paths['/request'] && doc.paths['/request'].post;
  const schema = post && post.requestBody.content['application/json'].schema;
  ok(schema && schema.required.includes('mediaType') && schema.required.includes('mediaId'), 'POST /request : mediaType et mediaId requis');
  ok(schema && JSON.stringify(schema.properties.mediaType.enum) === '["movie","tv"]', 'POST /request : mediaType movie | tv');
  ok(schema && schema.properties.seasons.oneOf.some((o) => o.enum && o.enum.includes('all')), 'POST /request : seasons accepte "all"');
  ok(post && post.responses['201'], 'POST /request : réponse 201');
  const mr = doc.components.schemas.MediaRequest;
  ok(mr.required.includes('id') && mr.required.includes('status') && mr.properties.media, 'MediaRequest : id, status requis, media présent');
  const st = doc.components.schemas.MediaInfo.properties.status.description;
  ok(/2 = `PENDING`/.test(st) && /3 = `PROCESSING`/.test(st) && /4 = `PARTIALLY_AVAILABLE`/.test(st) && /5 = `AVAILABLE`/.test(st), 'MediaInfo.status : 2 en attente, 3 en cours, 4 partiel, 5 disponible');
  for (const path of ['/discover/movies', '/discover/tv', '/discover/trending', '/search']) {
    const props = doc.paths[path].get.responses['200'].content['application/json'].schema.properties;
    ok(props.page && props.totalPages && props.totalResults && props.results, `GET ${path} : page, totalPages, totalResults, results`);
  }
}

// Demandes existantes (GET, lecture seule) : même schéma MediaRequest que la réponse 201 du POST.
const reqs = await getJson(cfg, '/request?take=5&skip=0');
ok(reqs.results.every((r) => typeof r.id === 'number' && typeof r.status === 'number' && r.media && typeof r.media.status === 'number'), `GET /request : ${reqs.results.length} demandes au schéma attendu (id, status, media.status)`);
console.log('     statuts (demande, média) : ' + JSON.stringify(reqs.results.map((r) => [r.status, r.media.status])));

console.log(bad ? `\n${bad} écart(s)` : '\nTout est conforme');
process.exit(bad ? 1 : 0);
