import { Callback, Http, Identity, Item, ServerRef } from '../api/types';
import { getSections } from '../api/library';
import { serverGet } from '../api/request';
import { pickSamples, Sample } from './categories';

// Choisit les fiches à sonder, en lecture seule (GET de liste et de fiches) : on parcourt chaque bibliothèque (films ; épisodes pour les séries),
// puis on ne charge la fiche complète (pistes) que de quelques fiches par « signature » de la liste (conteneur, codecs, définition),
// pour couvrir la variété sans lire toute la bibliothèque.
var PAGE = 200, BATCH = 40, PER_SIGNATURE = 8, MAX_FULL = 400, MAX_LISTED = 4000;

function signature(it: Item): string {
  var m = it.Media && it.Media[0];
  if (!m) return '';
  var w = m.width || 0;
  return [m.container, m.videoCodec, m.videoProfile, m.audioCodec, w > 1920 ? '4k' : w > 1280 ? 'hd' : 'sd'].join('|');
}

export function findSamples(http: Http, id: Identity, server: ServerRef, cb: Callback<{ [category: string]: Sample }>): void {
  var picked: Item[] = [], seen: { [sig: string]: number } = {};
  function container(j: any): any { return (j && j.MediaContainer) || {}; }

  function fetchFull(keys: string[], cb2: () => void): void {
    var at = 0;
    (function step(): void {
      if (at >= keys.length) { cb2(); return; }
      var batch = keys.slice(at, at + BATCH);
      at += BATCH;
      serverGet(http, id, server, '/library/metadata/' + batch.join(','), null, function (err, j) {
        if (!err) { var l: Item[] = container(j).Metadata || []; for (var i = 0; i < l.length; i++) picked.push(l[i]); }
        step();
      });
    })();
  }

  function scan(sectionKey: string, type: string, cb2: () => void): void {
    var start = 0, listed = 0, keys: string[] = [];
    (function page(): void {
      var extra = { 'X-Plex-Container-Start': String(start), 'X-Plex-Container-Size': String(PAGE) };
      serverGet(http, id, server, '/library/sections/' + encodeURIComponent(sectionKey) + '/all' + (type === 'show' ? '?type=4' : ''), extra, function (err, j) {
        var c = container(j), list: Item[] = c.Metadata || [];
        if (err || !list.length) { fetchFull(keys, cb2); return; }
        for (var i = 0; i < list.length; i++) {
          var sig = signature(list[i]);
          if (sig && (seen[sig] || 0) < PER_SIGNATURE && picked.length + keys.length < MAX_FULL) { seen[sig] = (seen[sig] || 0) + 1; keys.push(list[i].ratingKey); }
        }
        start += list.length;
        listed += list.length;
        if (start >= (c.totalSize || 0) || listed >= MAX_LISTED) fetchFull(keys, cb2); else page();
      });
    })();
  }

  getSections(http, id, server, function (err, sections) {
    if (err || !sections) { cb(err || new Error('bibliothèques introuvables')); return; }
    var todo = sections.filter(function (s) { return s.type === 'movie' || s.type === 'show'; }), n = 0;
    (function next(): void {
      if (n >= todo.length) { cb(null, pickSamples(picked)); return; }
      var s = todo[n++];
      scan(s.key, s.type, next);
    })();
  });
}
