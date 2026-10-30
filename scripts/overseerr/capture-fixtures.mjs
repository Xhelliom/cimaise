// Régénère tests/fixtures/overseerr/*.json à partir de réponses RÉELLES (GET seulement), réduites et anonymisées :
//   node scripts/overseerr/capture-fixtures.mjs
// Liste blanche de champs (rien d'autre ne passe : ni plexUrl, ni serviceUrl, ni requestedBy), titres, résumés et affiches
// remplacés, identifiants TMDB renumérotés (titre + statut révéleraient le contenu de la bibliothèque). Les nombres de pages
// et de résultats restent réels. request.json vient d'une demande EXISTANTE (GET /request) : même schéma MediaRequest que la
// réponse 201 de POST /request, jamais appelé. Le script échoue si la sortie contient encore l'hôte, la clé ou un champ interdit.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { getJson, loadEnv, ROOT } from './lib.mjs';

const cfg = loadEnv();
const OUT = join(ROOT, 'tests/fixtures/overseerr');
mkdirSync(OUT, { recursive: true });

const ids = new Map();
const anonId = (real) => { if (!ids.has(real)) ids.set(real, 1000 + ids.size); return ids.get(real); };
let n = 0;
const year = (d) => (typeof d === 'string' && /^\d{4}/.test(d) ? d.slice(0, 4) + '-01-01' : d === '' ? '' : undefined);
const mediaInfo = (mi) => mi && { id: anonId('mi' + mi.id), tmdbId: anonId(mi.tmdbId), mediaType: mi.mediaType, status: mi.status, status4k: mi.status4k };

function anon(r) {
  const k = ++n;
  if (r.mediaType === 'person') return { id: anonId('p' + r.id), mediaType: 'person', name: 'Personne ' + k, knownFor: [] };
  const movie = r.mediaType === 'movie';
  const out = { id: anonId(r.id), mediaType: r.mediaType };
  out[movie ? 'title' : 'name'] = (movie ? 'Film ' : 'Série ') + k;
  out[movie ? 'releaseDate' : 'firstAirDate'] = year(movie ? r.releaseDate : r.firstAirDate);
  out.posterPath = r.posterPath ? '/affiche' + k + '.jpg' : null;
  out.overview = r.overview ? 'Résumé ' + k : '';
  if (r.mediaInfo) out.mediaInfo = mediaInfo(r.mediaInfo);
  return out;
}

// Garde au plus `max` résultats, en privilégiant la variété (type × statut, affiche absente, personne), puis l'ordre.
function pick(results, max) {
  const chosen = [], key = (r) => (r.mediaType === 'person' ? 'person' : r.mediaType + (r.mediaInfo ? r.mediaInfo.status : r.posterPath ? '' : '-sans-affiche'));
  const seen = new Set();
  for (const r of results) if (!seen.has(key(r)) && chosen.length < max) { seen.add(key(r)); chosen.push(r); }
  for (const r of results) if (chosen.length < max && !chosen.includes(r)) chosen.push(r);
  return results.filter((r) => chosen.includes(r)); // ordre d'origine
}

function page(j, max) { return { page: j.page, totalPages: j.totalPages, totalResults: j.totalResults, results: pick(j.results, max).map(anon) }; }

const files = {
  'discover-movies': page(await getJson(cfg, '/discover/movies?page=1&language=fr'), 6),
  'discover-tv': page(await getJson(cfg, '/discover/tv?page=1&language=fr'), 6),
  trending: page(await getJson(cfg, '/discover/trending?page=1&language=fr'), 6),
  search: page(await getJson(cfg, '/search?query=amelie&page=1&language=fr'), 6),
};
const reqs = await getJson(cfg, '/request?take=20&skip=0');
const r = reqs.results.find((x) => x.type === 'tv') || reqs.results[0];
files.request = { id: anonId('r' + r.id), status: r.status, type: r.type, is4k: r.is4k, media: mediaInfo(r.media), seasons: [] };

const forbidden = [cfg.key, new URL(cfg.url).host, 'plexUrl', 'serviceUrl', 'requestedBy', 'modifiedBy', 'email', 'ratingKey'];
for (const [name, v] of Object.entries(files)) {
  for (const f of forbidden) if (JSON.stringify(v).includes(f)) throw new Error('fixture ' + name + ' : champ ou secret interdit, rien écrit');
}
for (const [name, v] of Object.entries(files)) {
  writeFileSync(join(OUT, name + '.json'), JSON.stringify(v, null, 2) + '\n');
  console.log(name + '.json  ' + (v.results ? v.results.length + ' résultats, statuts ' + JSON.stringify(v.results.map((x) => (x.mediaInfo ? x.mediaInfo.status : x.mediaType === 'person' ? 'personne' : '-'))) : 'demande ' + v.type + ' statut ' + v.status + ', média ' + v.media.status));
}
