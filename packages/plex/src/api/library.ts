import { Callback, Hub, Http, Identity, Item, Letter, Page, Section, ServerRef } from './types';
import { serverGet } from './request';

function container(j: any): any { return (j && j.MediaContainer) || {}; }
function items(j: any): Item[] { return container(j).Metadata || []; }

export function getSections(http: Http, id: Identity, s: ServerRef, cb: Callback<Section[]>) {
  return serverGet(http, id, s, '/library/sections', null, function (err, j) { err ? cb(err) : cb(null, container(j).Directory || []); });
}

// Tri et filtre faits par le serveur, pagination intacte : `sort` est une valeur Plex (titleSort, addedAt:desc, year:desc ;
// à égalité le serveur départage par titre), `unwatched` ne garde que les non vus (séries : au moins un épisode non vu).
// `ratings` : filtre par âge, classifications gardées (contentRating=G,PG ; OU logique, sensible à la casse : vérifié sur le
// serveur le 08/11, « g » ne trouve rien). Absent = tout ; jamais vide (l'appelant n'interroge pas le serveur sans code permis).
export interface LibraryView { sort: string; unwatched: boolean; ratings?: string[] | null; }
export var TITLE_VIEW: LibraryView = { sort: 'titleSort', unwatched: false };
export function filterQuery(v: { unwatched?: boolean; ratings?: string[] | null }): string {
  return (v.unwatched ? '&unwatched=1' : '') + (v.ratings && v.ratings.length ? '&contentRating=' + v.ratings.map(encodeURIComponent).join(',') : '');
}
export function viewQuery(v: LibraryView): string { return 'sort=' + v.sort + filterQuery(v); }

// Pagination par en-têtes X-Plex-Container-Start / -Size.
export function getSectionItems(http: Http, id: Identity, s: ServerRef, sectionKey: string, start: number, size: number, cb: Callback<Page>, view?: LibraryView) {
  var extra = { 'X-Plex-Container-Start': String(start), 'X-Plex-Container-Size': String(size) };
  return serverGet(http, id, s, '/library/sections/' + encodeURIComponent(sectionKey) + '/all?' + viewQuery(view || TITLE_VIEW), extra, function (err, j) {
    if (err) return cb(err);
    var c = container(j), list = items(j);
    cb(null, { items: list, total: typeof c.totalSize === 'number' ? c.totalSize : start + list.length, offset: typeof c.offset === 'number' ? c.offset : start });
  });
}

// Index alphabétique : nombre de titres par première lettre, dans l'ordre du tri par titre (# d'abord).
// `filter` : même filtre que la grille (vérifié sur le serveur, non vus et âge : les tailles somment au total filtré).
export function getFirstCharacter(http: Http, id: Identity, s: ServerRef, sectionKey: string, cb: Callback<Letter[]>, filter?: { unwatched?: boolean; ratings?: string[] | null }) {
  var q = filter ? filterQuery(filter) : '';
  return serverGet(http, id, s, '/library/sections/' + encodeURIComponent(sectionKey) + '/firstCharacter' + (q ? '?' + q.slice(1) : ''), null, function (err, j) {
    if (err) return cb(err);
    var d = container(j).Directory || [], out: Letter[] = [];
    for (var i = 0; i < d.length; i++) out.push({ title: String(d[i].title), size: Number(d[i].size) || 0 });
    cb(null, out);
  });
}

// Classifications présentes dans une bibliothèque (≈ 1 Ko) : orthographe exacte du serveur pour le filtre par âge.
export function getSectionRatings(http: Http, id: Identity, s: ServerRef, sectionKey: string, cb: Callback<string[]>) {
  return serverGet(http, id, s, '/library/sections/' + encodeURIComponent(sectionKey) + '/contentRating', null, function (err, j) {
    if (err) return cb(err);
    var d = container(j).Directory || [], out: string[] = [];
    for (var i = 0; i < d.length; i++) if (d[i].title) out.push(String(d[i].title));
    cb(null, out);
  });
}

// Séries d'une bibliothèque dont la classification est dans `ratings` (filtre par âge de l'accueil) : seuls les ratingKey
// sont gardés. Les saisons des rangées de l'accueil n'ont pas de contentRating (vérifié le 08/11) : on les juge sur leur série.
// Mesuré le 08/11 : 11 séries (-10 ans) ≈ 21 Ko de JSON, 30 (-12 ans) ≈ 55 Ko ; /library/metadata/k1,k2… coûte 165 Ko pour 9
// séries et includeFields est ignoré par le serveur, d'où ce choix.
export function getShowKeys(http: Http, id: Identity, s: ServerRef, sectionKey: string, ratings: string[], cb: Callback<string[]>) {
  return serverGet(http, id, s, '/library/sections/' + encodeURIComponent(sectionKey) + '/all?type=2' + filterQuery({ ratings: ratings }), null, function (err, j) {
    if (err) return cb(err);
    var l = items(j), out: string[] = [];
    for (var i = 0; i < l.length; i++) out.push(String(l[i].ratingKey));
    cb(null, out);
  });
}

export function getOnDeck(http: Http, id: Identity, s: ServerRef, cb: Callback<Item[]>) {
  return serverGet(http, id, s, '/library/onDeck', null, function (err, j) { err ? cb(err) : cb(null, items(j)); });
}

export function getRecentlyAdded(http: Http, id: Identity, s: ServerRef, cb: Callback<Item[]>) {
  return serverGet(http, id, s, '/library/recentlyAdded', null, function (err, j) { err ? cb(err) : cb(null, items(j)); });
}

// Rangées d'une bibliothèque (vérifié sur le serveur du homelab le 07/11, 24 éléments par X-Plex-Container-Size) :
// « En cours » = /library/sections/{id}/onDeck (séries : épisodes à suivre, ≈ 29 Ko pour 6 ; films sans film commencé : 0,4 Ko) ;
// « Ajoutés récemment » = /library/sections/{id}/recentlyAdded pour les films (≈ 59 Ko). Pour les séries, cet endpoint rend les
// épisodes un par un (24 épisodes d'une même série) : on prend les séries triées par dernier épisode ajouté
// (/all?type=2&sort=episode.addedAt:desc, ≈ 41 Ko, une tuile par série, même ordre que le rayon tv.recentlyadded du serveur).
// Écartés : /hubs/sections/{id} (82 à 137 Ko, 7 ou 8 rayons dont 2 servis), /hubs/home/recentlyAdded (207 Ko pour 24).
export function getSectionOnDeck(http: Http, id: Identity, s: ServerRef, sectionKey: string, size: number, cb: Callback<Item[]>) {
  var extra = { 'X-Plex-Container-Start': '0', 'X-Plex-Container-Size': String(size) };
  return serverGet(http, id, s, '/library/sections/' + encodeURIComponent(sectionKey) + '/onDeck', extra, function (err, j) { err ? cb(err) : cb(null, items(j)); });
}
export function getSectionRecent(http: Http, id: Identity, s: ServerRef, sectionKey: string, shows: boolean, size: number, cb: Callback<Item[]>) {
  var extra = { 'X-Plex-Container-Start': '0', 'X-Plex-Container-Size': String(size) };
  var path = '/library/sections/' + encodeURIComponent(sectionKey) + (shows ? '/all?type=2&sort=episode.addedAt:desc' : '/recentlyAdded');
  return serverGet(http, id, s, path, extra, function (err, j) { err ? cb(err) : cb(null, items(j)); });
}

// Ajouts récents non vus (vérifié sur le serveur le 31/10 : 0 élément vu sur 50 ; une saison commencée reste si un épisode n'est pas vu).
// Même forme que /library/recentlyAdded (films, saisons, albums ; `type` est ignoré) : le tri se fait côté client.
export function getRecentlyAddedUnwatched(http: Http, id: Identity, s: ServerRef, cb: Callback<Item[]>) {
  return serverGet(http, id, s, '/library/recentlyAdded?unwatched=1', null, function (err, j) { err ? cb(err) : cb(null, items(j)); });
}

// Rayons : /hubs (descripteurs seuls) ou /hubs/sections/{id} (avec leurs éléments en ligne).
export function getHubs(http: Http, id: Identity, s: ServerRef, sectionKey: string | null, cb: Callback<Hub[]>) {
  var path = sectionKey === null ? '/hubs' : '/hubs/sections/' + encodeURIComponent(sectionKey);
  return serverGet(http, id, s, path, null, function (err, j) { err ? cb(err) : cb(null, container(j).Hub || []); });
}

// `withOnDeck` (séries) : le serveur ajoute l'épisode « à suivre » sous OnDeck. `withMarkers` : marqueurs intro / générique sous Marker.
export function getMetadata(http: Http, id: Identity, s: ServerRef, ratingKey: string, cb: Callback<Item>, withOnDeck?: boolean, withMarkers?: boolean) {
  var q = withOnDeck ? '?includeOnDeck=1' : withMarkers ? '?includeMarkers=1' : '';
  return serverGet(http, id, s, '/library/metadata/' + encodeURIComponent(ratingKey) + q, null, function (err, j) {
    if (err) return cb(err);
    var l = items(j);
    l.length ? cb(null, l[0]) : cb(new Error('métadonnées absentes'));
  });
}

export function getChildren(http: Http, id: Identity, s: ServerRef, ratingKey: string, cb: Callback<Item[]>) {
  return serverGet(http, id, s, '/library/metadata/' + encodeURIComponent(ratingKey) + '/children', null, function (err, j) { err ? cb(err) : cb(null, items(j)); });
}

// Recherche serveur : rayons (/hubs/search) filtrés sur les bibliothèques données (sectionId=1,2). Les rayons « actor » portent des
// étiquettes (Directory), pas des fiches : ils sont ignorés par l'appelant.
export function searchHubs(http: Http, id: Identity, s: ServerRef, text: string, sectionKeys: string[] | null, limit: number, cb: Callback<Hub[]>) {
  var q = 'query=' + encodeURIComponent(text) + '&limit=' + limit + (sectionKeys && sectionKeys.length ? '&sectionId=' + sectionKeys.join(',') : '');
  return serverGet(http, id, s, '/hubs/search?' + q, null, function (err, j) { err ? cb(err) : cb(null, container(j).Hub || []); });
}
