import { Abortable, Callback, ConnectionInfo, Http, MediaType, OverseerrConfig, OverseerrError, RequestResult, Title, TitlePage } from './types';
import { availability, toTitle } from './media';

var TIMEOUT_MS = 10000;
var NOOP: Abortable = { abort: function () {} };

function fail(code: OverseerrError['code'], msg: string, status?: number): OverseerrError {
  var e = new Error(msg) as OverseerrError;
  e.code = code;
  if (status !== undefined) e.status = status;
  return e;
}

// Encodage strict : Overseerr répond 400 (« must be url encoded ») si la requête garde ! ' ( ) *, qu'encodeURIComponent
// laisse passer (vérifié le 30/10 : « l'été » et « star wars (1977)! » refusés, acceptés une fois encodés ainsi).
export function strictEncode(s: string): string {
  return encodeURIComponent(s).replace(/[!'()*]/g, function (c) { return '%' + c.charCodeAt(0).toString(16).toUpperCase(); });
}

// Appel JSON authentifié par X-Api-Key. La clé n'apparaît jamais dans un message d'erreur.
function call(http: Http, cfg: OverseerrConfig | null, method: string, path: string, body: any, cb: Callback<any>): Abortable {
  if (!cfg || !cfg.url || !cfg.key) { cb(fail('config', 'Overseerr non configuré (adresse ou clé absente)')); return NOOP; }
  var headers: { [k: string]: string } = { Accept: 'application/json', 'X-Api-Key': cfg.key };
  var txt: string | undefined;
  if (body !== undefined) { headers['Content-Type'] = 'application/json'; txt = JSON.stringify(body); }
  return http({ method: method, url: cfg.url + '/api/v1' + path, headers: headers, body: txt, timeoutMs: TIMEOUT_MS }, function (err, res) {
    if (err || !res) return cb(fail('unreachable', 'Overseerr injoignable : ' + (err ? err.message : 'pas de réponse')));
    var s = res.status;
    if (s === 0) return cb(fail('unreachable', 'Overseerr injoignable'));
    // Clé inconnue : 403 (« You do not have permission… »), pas 401, vérifié le 30/10. En lecture, la clé API (droits
    // d'administrateur) ouvre toutes les routes : un 403 ne peut venir que de la clé. Sur POST, il peut venir d'un droit ou d'un quota.
    if (s === 401 || (s === 403 && method === 'GET')) return cb(fail('unauthorized', 'clé API refusée', s));
    if (s === 403) return cb(fail('forbidden', 'action refusée (droit ou quota)', s));
    if (s === 409) return cb(fail('exists', 'déjà demandé', s));
    if (s === 400) return cb(fail('invalid', 'paramètre refusé', s));
    if (s < 200 || s >= 300) return cb(fail('http', 'HTTP ' + s, s));
    var data: any;
    try { data = JSON.parse(res.body); } catch (e) { return cb(fail('format', 'JSON invalide')); }
    cb(null, data);
  });
}

function query(cfg: OverseerrConfig | null, page: number, extra: string): string {
  var q = 'page=' + (page > 0 ? Math.floor(page) : 1);
  if (cfg && cfg.language) q += '&language=' + strictEncode(cfg.language);
  return '?' + q + extra;
}

function toPage(j: any, page: number): TitlePage {
  var raw = j && j.results instanceof Array ? j.results : [], items: Title[] = [];
  for (var i = 0; i < raw.length; i++) { var t = toTitle(raw[i]); if (t) items.push(t); }
  return {
    items: items,
    page: j && typeof j.page === 'number' ? j.page : page,
    totalPages: j && typeof j.totalPages === 'number' ? j.totalPages : page,
    totalResults: j && typeof j.totalResults === 'number' ? j.totalResults : items.length
  };
}

function getPage(http: Http, cfg: OverseerrConfig | null, path: string, page: number, cb: Callback<TitlePage>): Abortable {
  return call(http, cfg, 'GET', path, undefined, function (err, j) { err ? cb(err) : cb(null, toPage(j, page)); });
}

// Films du moment (TMDB « discover », tri par popularité), 20 par page.
export function discoverMovies(http: Http, cfg: OverseerrConfig | null, page: number, cb: Callback<TitlePage>): Abortable {
  return getPage(http, cfg, '/discover/movies' + query(cfg, page, ''), page, cb);
}

// Séries du moment.
export function discoverTv(http: Http, cfg: OverseerrConfig | null, page: number, cb: Callback<TitlePage>): Abortable {
  return getPage(http, cfg, '/discover/tv' + query(cfg, page, ''), page, cb);
}

// Tendances de la semaine, films et séries mêlés (personnes retirées).
export function trending(http: Http, cfg: OverseerrConfig | null, page: number, cb: Callback<TitlePage>): Abortable {
  return getPage(http, cfg, '/discover/trending' + query(cfg, page, ''), page, cb);
}

// Recherche films et séries (personnes retirées). Texte vide : page vide, sans requête (Overseerr répondrait 400).
export function search(http: Http, cfg: OverseerrConfig | null, text: string, page: number, cb: Callback<TitlePage>): Abortable {
  var t = String(text || '').replace(/^\s+|\s+$/g, '');
  if (!t) { cb(null, { items: [], page: 1, totalPages: 0, totalResults: 0 }); return NOOP; }
  return getPage(http, cfg, '/search' + query(cfg, page, '&query=' + strictEncode(t)), page, cb);
}

// Demande d'un titre (POST /request) : mediaId = id TMDB ; une série est demandée en entier (seasons "all").
// Écriture réelle chez Overseerr (puis Radarr/Sonarr) : jamais appelée par les scripts de vérification.
export function requestMedia(http: Http, cfg: OverseerrConfig | null, mediaType: MediaType, tmdbId: number, cb: Callback<RequestResult>): Abortable {
  var body: any = { mediaType: mediaType, mediaId: tmdbId };
  if (mediaType === 'tv') body.seasons = 'all';
  return call(http, cfg, 'POST', '/request', body, function (err, j) {
    if (err) return cb(err);
    if (!j || typeof j.id !== 'number' || typeof j.status !== 'number') return cb(fail('format', 'réponse de demande illisible'));
    cb(null, { id: j.id, status: j.status, availability: availability(j.media) });
  });
}

// Bouton « Tester » des Réglages : GET /status sans clé (joignable ? version), puis GET /settings/about avec la clé
// (route d'administration : 403 si la clé est fausse, vérifié le 30/10 ; ne renvoie ni pseudo ni courriel).
export function testConnection(http: Http, cfg: OverseerrConfig | null, cb: Callback<ConnectionInfo>): Abortable {
  if (!cfg || !cfg.url || !cfg.key) { cb(fail('config', 'Overseerr non configuré (adresse ou clé absente)')); return NOOP; }
  var cur: Abortable = http({ method: 'GET', url: cfg.url + '/api/v1/status', headers: { Accept: 'application/json' }, timeoutMs: TIMEOUT_MS }, function (err, res) {
    if (err || !res || res.status === 0) return cb(fail('unreachable', 'Overseerr injoignable' + (err ? ' : ' + err.message : '')));
    if (res.status < 200 || res.status >= 300) return cb(fail('http', 'HTTP ' + res.status + ' sur /status', res.status));
    var version = '';
    try { var j = JSON.parse(res.body); if (j && typeof j.version === 'string') version = j.version; } catch (e) { return cb(fail('format', 'réponse illisible : est-ce bien Overseerr ?')); }
    cur = call(http, cfg, 'GET', '/settings/about', undefined, function (err2, a) {
      if (err2) return cb(err2);
      cb(null, { version: version, mediaItems: a && typeof a.totalMediaItems === 'number' ? a.totalMediaItems : null });
    });
  });
  return { abort: function () { cur.abort(); } };
}
