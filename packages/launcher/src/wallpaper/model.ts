// Fond d'écran Unsplash de l'accueil : modèle pur (réglages, image du jour, URL, crédit). Aucun appel réseau ici.
// Réglages dans cimaise.v1 : prefs.wallpaper { source, topicId, topicTitle, query, portrait } ; image du jour :
// prefs.wallpaperDay { day, sig, url, author, authorUrl, portrait, dl, tracked } ; thèmes : prefs.unsplashTopics { at, list }.
// Clés facultatives : sans elles, défauts ci-dessous (aucune migration de schéma).

export type WallpaperSource = 'off' | 'topic' | 'query';
export interface WallpaperPrefs { source: WallpaperSource; topicId: string; topicTitle: string; query: string; portrait: boolean; }
export interface Topic { id: string; title: string; }
// Image retenue pour un jour et un jeu de réglages (sig) ; dl = download_location, appelé une fois quand elle s'affiche.
export interface DailyPhoto { day: string; sig: string; url: string; author: string; authorUrl: string; portrait: boolean; dl: string; tracked: boolean; }

// Taille demandée à imgix = taille d'affichage (scène 1920×1080). 1280×720 coûterait 2,2 fois moins en mémoire décodée
// (3,5 Mo au lieu de 7,9 Mo) et ~100 Ko au lieu de ~200 Ko à télécharger : bascule ici si la mesure sur la Frame l'exige.
export var PHOTO_W = 1920, PHOTO_H = 1080, PHOTO_Q = 70;
export var UTM = 'utm_source=cimaise&utm_medium=referral';
export var API = 'https://api.unsplash.com';
// Thème par défaut : « Wallpapers », identifiant relevé dans GET /topics le 08/11/2026 (le même que la liste des Réglages).
export var DEFAULT_TOPIC: Topic = { id: 'bo8jQKTaE0Y', title: 'Wallpapers' };
export var TOPICS_TTL_MS = 30 * 24 * 3600 * 1000;

export function normalizeWallpaper(v: any): WallpaperPrefs {
  var o = v && typeof v === 'object' ? v : {};
  var src: WallpaperSource = o.source === 'off' || o.source === 'query' ? o.source : 'topic';
  var q = typeof o.query === 'string' ? o.query.replace(/\s+/g, ' ').replace(/^ | $/g, '') : '';
  if (src === 'query' && !q) src = 'topic';   // mot vide : retour au thème
  return {
    source: src,
    topicId: typeof o.topicId === 'string' && o.topicId ? o.topicId : DEFAULT_TOPIC.id,
    topicTitle: typeof o.topicTitle === 'string' && o.topicTitle ? o.topicTitle : DEFAULT_TOPIC.title,
    query: q,
    portrait: o.portrait === true
  };
}

// Jour local AAAA-MM-JJ : une image par jour calendaire de la TV.
export function dayKey(d: Date): string {
  var m = d.getMonth() + 1, j = d.getDate();
  return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (j < 10 ? '0' : '') + j;
}

// Signature des réglages qui choisissent l'image : la changer remplace l'image du jour.
export function signature(p: WallpaperPrefs): string {
  return p.source === 'query' ? 'q:' + p.query.toLowerCase() + (p.portrait ? ':p' : '') : p.source === 'topic' ? 't:' + p.topicId + (p.portrait ? ':p' : '') : 'off';
}

// Image du jour encore valable pour ces réglages ?
export function isCurrent(c: DailyPhoto | null, p: WallpaperPrefs, day: string): boolean {
  return !!c && c.day === day && c.sig === signature(p) && !!c.url;
}

export function randomPath(p: WallpaperPrefs): string {
  var q = p.source === 'query' ? 'query=' + encodeURIComponent(p.query) : 'topics=' + encodeURIComponent(p.topicId);
  return '/photos/random?' + q + (p.portrait ? '' : '&orientation=landscape') + '&content_filter=high';
}

function withParams(raw: string, params: string): string { return raw + (raw.indexOf('?') >= 0 ? '&' : '?') + params; }

// Paysage : recadrée à la taille exacte de l'écran. Portrait (h > l) : entière, à la hauteur de l'écran, centrée par le CSS.
export function imageUrl(raw: string, portrait: boolean): string {
  return withParams(raw, portrait
    ? 'h=' + PHOTO_H + '&fit=max&q=' + PHOTO_Q + '&fm=jpg'
    : 'w=' + PHOTO_W + '&h=' + PHOTO_H + '&fit=crop&q=' + PHOTO_Q + '&fm=jpg');
}

// Réponse de /photos/random -> image du jour ; null si la réponse est inutilisable.
export function parsePhoto(json: any, p: WallpaperPrefs, day: string): DailyPhoto | null {
  if (!json || typeof json !== 'object') return null;
  var raw = json.urls && json.urls.raw, user = json.user || {};
  if (typeof raw !== 'string' || !/^https:\/\/images\.unsplash\.com\//.test(raw)) return null;
  var portrait = p.portrait && typeof json.width === 'number' && typeof json.height === 'number' && json.height > json.width;
  var profile = user.links && typeof user.links.html === 'string' ? user.links.html : user.username ? 'https://unsplash.com/@' + user.username : 'https://unsplash.com';
  return {
    day: day, sig: signature(p), url: imageUrl(raw, portrait),
    author: typeof user.name === 'string' && user.name ? user.name : 'Unsplash',
    authorUrl: withParams(profile, UTM), portrait: portrait,
    dl: json.links && typeof json.links.download_location === 'string' ? json.links.download_location : '',
    tracked: false
  };
}

export function readDaily(v: any): DailyPhoto | null {
  if (!v || typeof v !== 'object' || typeof v.url !== 'string' || !v.url) return null;
  return {
    day: String(v.day || ''), sig: String(v.sig || ''), url: v.url, author: String(v.author || 'Unsplash'),
    authorUrl: String(v.authorUrl || 'https://unsplash.com?' + UTM), portrait: v.portrait === true, dl: String(v.dl || ''), tracked: v.tracked === true
  };
}

export var UNSPLASH_URL = 'https://unsplash.com/?' + UTM;

// Thèmes officiels (GET /topics) : identifiant et titre ; les doublons de titre (série « illustration ») sont précisés.
export function parseTopics(json: any): Topic[] {
  var out: Topic[] = [], seen: { [t: string]: boolean } = {};
  if (!json || typeof json.length !== 'number') return out;
  for (var i = 0; i < json.length; i++) {
    var t = json[i];
    if (!t || typeof t.id !== 'string' || typeof t.title !== 'string') continue;
    var title = t.title;
    if (seen[title.toLowerCase()]) title += typeof t.slug === 'string' && /^illustration-/.test(t.slug) ? ' (illustration)' : ' (2)';
    seen[title.toLowerCase()] = true;
    out.push({ id: t.id, title: title });
  }
  return out;
}

export function readTopics(v: any, now: number): Topic[] | null {
  if (!v || typeof v.at !== 'number' || now - v.at > TOPICS_TTL_MS || !v.list || !v.list.length) return null;
  var l: Topic[] = [];
  for (var i = 0; i < v.list.length; i++) if (v.list[i] && v.list[i].id && v.list[i].title) l.push({ id: String(v.list[i].id), title: String(v.list[i].title) });
  return l.length ? l : null;
}

// Clé du paquet (scripts/build/local-config.mjs) : window.__cimaiseUnsplash = { key } ; jamais dans localStorage.
export function packagedKey(w?: any): string {
  var c = (w || (typeof window !== 'undefined' ? window : {})).__cimaiseUnsplash;
  return c && typeof c.key === 'string' ? c.key : '';
}

export function authHeaders(key: string): { [k: string]: string } {
  return { 'Authorization': 'Client-ID ' + key, 'Accept-Version': 'v1' };
}
