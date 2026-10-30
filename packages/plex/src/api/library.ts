import { Callback, Hub, Http, Identity, Item, Letter, Page, Section, ServerRef } from './types';
import { serverGet } from './request';

function container(j: any): any { return (j && j.MediaContainer) || {}; }
function items(j: any): Item[] { return container(j).Metadata || []; }

export function getSections(http: Http, id: Identity, s: ServerRef, cb: Callback<Section[]>) {
  return serverGet(http, id, s, '/library/sections', null, function (err, j) { err ? cb(err) : cb(null, container(j).Directory || []); });
}

// Pagination par en-têtes X-Plex-Container-Start / -Size.
export function getSectionItems(http: Http, id: Identity, s: ServerRef, sectionKey: string, start: number, size: number, cb: Callback<Page>) {
  var extra = { 'X-Plex-Container-Start': String(start), 'X-Plex-Container-Size': String(size) };
  return serverGet(http, id, s, '/library/sections/' + encodeURIComponent(sectionKey) + '/all?sort=titleSort', extra, function (err, j) {
    if (err) return cb(err);
    var c = container(j), list = items(j);
    cb(null, { items: list, total: typeof c.totalSize === 'number' ? c.totalSize : start + list.length, offset: typeof c.offset === 'number' ? c.offset : start });
  });
}

// Index alphabétique : nombre de titres par première lettre, dans l'ordre du tri par titre (# d'abord).
export function getFirstCharacter(http: Http, id: Identity, s: ServerRef, sectionKey: string, cb: Callback<Letter[]>) {
  return serverGet(http, id, s, '/library/sections/' + encodeURIComponent(sectionKey) + '/firstCharacter', null, function (err, j) {
    if (err) return cb(err);
    var d = container(j).Directory || [], out: Letter[] = [];
    for (var i = 0; i < d.length; i++) out.push({ title: String(d[i].title), size: Number(d[i].size) || 0 });
    cb(null, out);
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
