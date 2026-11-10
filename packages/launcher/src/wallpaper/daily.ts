// Fond d'écran du jour : appelé après la 1re peinture et enrich(), au retour des Réglages et au retour au premier plan.
// Une requête /photos/random par jour (et par jeu de réglages) au plus ; hors ligne ou en erreur, l'image d'hier (si le cache
// HTTP l'a encore) sinon le fond teinté. Sans clé ou source « Désactivé » : aucun appel, fond teinté.
import { Http } from '../../../widgets/src/ha';
import { loadStored, saveStored } from '../../../tv-core/src/storage';
import { noteEvent, diagNote } from '../../../tv-core/src/diag';
import { API, DailyPhoto, authHeaders, dayKey, isCurrent, normalizeWallpaper, parsePhoto, readDaily, randomPath, readTopics, parseTopics, Topic } from './model';

export interface ShownPhoto { url: string; author: string; authorUrl: string; portrait: boolean; }

export interface WallpaperDeps {
  http: Http;
  key: string;
  // Pose (ou retire, null) la photo ; onShown une fois l'image chargée et le fondu lancé.
  show: (p: ShownPhoto | null, onShown?: () => void) => void;
  now?: () => Date;
  store?: Storage;
}

var TIMEOUT_MS = 8000;
var busy = false;
// Diagnostic (touche 0) : ligne « fond tirage » = dernier appel à l'API (ou la raison de son absence) ; la ligne « fond »
// (image : chargement, échec ou mesures) est tenue par l'accueil (setPhoto).
function note(text: string): void { noteEvent('fond : ' + text); diagNote('fond tirage', text); }

function save(c: DailyPhoto, store?: Storage): void {
  try { var s = loadStored(store); s.prefs.wallpaperDay = c; saveStored(s, store); } catch (e) { /* stockage refusé : refait demain */ }
}

function display(d: WallpaperDeps, c: DailyPhoto): void {
  d.show({ url: c.url, author: c.author, authorUrl: c.authorUrl, portrait: c.portrait }, function () {
    if (c.tracked || !c.dl) return;
    // Règle de l'API Unsplash : signaler l'utilisation (download_location) quand la photo est affichée, une fois par photo.
    c.tracked = true;
    var cur = readDaily(loadStored(d.store).prefs.wallpaperDay);
    if (cur && cur.url === c.url) save(c, d.store);
    d.http({ method: 'GET', url: c.dl, headers: authHeaders(d.key), timeoutMs: TIMEOUT_MS }, function () { /* sans suite */ });
  });
}

export function refreshWallpaper(d: WallpaperDeps): void {
  if (!d.key) { diagNote('fond', 'pas de clé Unsplash dans le paquet'); d.show(null); return; }
  var prefs = loadStored(d.store).prefs;
  var p = normalizeWallpaper(prefs.wallpaper);
  if (p.source === 'off') { diagNote('fond', 'désactivé dans les Réglages'); d.show(null); return; }
  var day = dayKey((d.now || function () { return new Date(); })());
  var cached = readDaily(prefs.wallpaperDay);
  if (isCurrent(cached, p, day)) { diagNote('fond tirage', 'aucun, image du ' + day + ' en cache'); display(d, cached!); return; }
  if (busy) return;
  busy = true;
  var t0 = Date.now();
  note('en cours…');
  d.http({ method: 'GET', url: API + randomPath(p), headers: authHeaders(d.key), timeoutMs: TIMEOUT_MS }, function (err, res) {
    busy = false;
    var next: DailyPhoto | null = null;
    if (!err && res && res.status === 200) { try { next = parsePhoto(JSON.parse(res.body), p, day); } catch (e) { next = null; } }
    var ms = ' (' + (Date.now() - t0) + ' ms)';
    if (next) { note('HTTP 200' + ms); save(next, d.store); display(d, next); return; }
    note('échec : ' + (err ? err.message : res ? (res.status === 200 ? 'réponse illisible' : 'HTTP ' + res.status) : '?') + ms + (cached ? ', image précédente reprise' : ''));
    // Image d'hier (ou d'autres réglages) : affichée si le cache HTTP l'a, sinon l'<img> échoue et la teinte reste.
    if (cached) display(d, cached); else d.show(null);
  });
}

// « Changer d'image » : l'image du jour perd sa signature (un nouveau tirage aura lieu au prochain refreshWallpaper) mais
// reste en cache comme image de secours si le tirage échoue.
export function skipWallpaper(store?: Storage): void {
  try {
    var s = loadStored(store), c = readDaily(s.prefs.wallpaperDay);
    if (!c) return;
    c.sig = '';
    s.prefs.wallpaperDay = c;
    saveStored(s, store);
  } catch (e) { /* stockage refusé : rien ne change */ }
}

// Thèmes officiels pour les Réglages : relus du cache (30 jours), sinon UN GET /topics à l'ouverture de la section.
export function loadTopics(http: Http, key: string, cb: (err: Error | null, list?: Topic[]) => void, store?: Storage): void {
  var c = readTopics(loadStored(store).prefs.unsplashTopics, Date.now());
  if (c) { cb(null, c); return; }
  if (!key) { cb(new Error('clé Unsplash absente')); return; }
  http({ method: 'GET', url: API + '/topics?per_page=30&order_by=featured', headers: authHeaders(key), timeoutMs: TIMEOUT_MS }, function (err, res) {
    if (err || !res) return cb(err || new Error('réponse vide'));
    if (res.status !== 200) return cb(new Error('HTTP ' + res.status));
    var list: Topic[] = [];
    try { list = parseTopics(JSON.parse(res.body)); } catch (e) { /* liste vide */ }
    if (!list.length) return cb(new Error('aucun thème'));
    try { var s = loadStored(store); s.prefs.unsplashTopics = { at: Date.now(), list: list }; saveStored(s, store); } catch (e) { /* cache refusé */ }
    cb(null, list);
  });
}

