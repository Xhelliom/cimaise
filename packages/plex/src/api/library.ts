import { Callback, Hub, Http, Identity, Item, Page, Section, ServerRef } from './types';
import { serverGet } from './request';

function container(j: any): any { return (j && j.MediaContainer) || {}; }
function items(j: any): Item[] { return container(j).Metadata || []; }

export function getSections(http: Http, id: Identity, s: ServerRef, cb: Callback<Section[]>) {
  return serverGet(http, id, s, '/library/sections', null, function (err, j) { err ? cb(err) : cb(null, container(j).Directory || []); });
}

// Pagination par en-têtes X-Plex-Container-Start / -Size.
export function getSectionItems(http: Http, id: Identity, s: ServerRef, sectionKey: string, start: number, size: number, cb: Callback<Page>) {
  var extra = { 'X-Plex-Container-Start': String(start), 'X-Plex-Container-Size': String(size) };
  return serverGet(http, id, s, '/library/sections/' + encodeURIComponent(sectionKey) + '/all', extra, function (err, j) {
    if (err) return cb(err);
    var c = container(j), list = items(j);
    cb(null, { items: list, total: typeof c.totalSize === 'number' ? c.totalSize : start + list.length, offset: typeof c.offset === 'number' ? c.offset : start });
  });
}

export function getOnDeck(http: Http, id: Identity, s: ServerRef, cb: Callback<Item[]>) {
  return serverGet(http, id, s, '/library/onDeck', null, function (err, j) { err ? cb(err) : cb(null, items(j)); });
}

export function getRecentlyAdded(http: Http, id: Identity, s: ServerRef, cb: Callback<Item[]>) {
  return serverGet(http, id, s, '/library/recentlyAdded', null, function (err, j) { err ? cb(err) : cb(null, items(j)); });
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
