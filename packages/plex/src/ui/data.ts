import { Callback, Http, Identity, Item, Page, Section, ServerRef } from '../api/types';
import { getChildren, getMetadata, getOnDeck, getRecentlyAdded, getSectionItems, getSections } from '../api/library';
import { Cache } from './cache';

export type Cancel = () => void;
type On<T> = (value: T) => void;
type Err = (err: Error) => void;

// Durées de vie (ms) : l'accueil change vite, les bibliothèques et les fiches moins.
var TTL_HOME = 5 * 60000, TTL_SECTIONS = 3600000, TTL_PAGE = 10 * 60000, TTL_META = 30 * 60000;

function noop(): void { /* rien à annuler */ }

// Les listes n'ont besoin ni des pistes média ni du résumé : on ne met que l'utile dans le cache.
function slim(it: Item): Item {
  var o: any = {};
  for (var k in it) if (it.hasOwnProperty(k) && k !== 'Media' && k !== 'summary') o[k] = (it as any)[k];
  return o;
}
function slimAll(l: Item[]): Item[] { return l.map(slim); }

// Types montrables (la musique est hors MVP ; une saison s'ouvre sur sa série).
function shown(l: Item[]): Item[] {
  return l.filter(function (i) { return i.type === 'movie' || i.type === 'show' || i.type === 'episode' || i.type === 'season'; });
}

export interface Data {
  sections(on: On<Section[]>, err?: Err): Cancel;
  onDeck(on: On<Item[]>, err?: Err): Cancel;
  recent(on: On<Item[]>, err?: Err): Cancel;
  page(sectionKey: string, start: number, size: number, on: On<Page>, err?: Err): Cancel;
  metadata(ratingKey: string, on: On<Item>, err?: Err): Cancel;
  children(ratingKey: string, on: On<Item[]>, err?: Err): Cancel;
  // Retour de lecture : la fiche est corrigée sur place, « En cours » et les parents (saison, série) sont rechargés.
  progressed(it: Item, offsetMs: number, watched: boolean): void;
}

export function createData(http: Http, id: Identity, s: ServerRef, cache: Cache): Data {
  // Cache d'abord : une entrée est rendue tout de suite ; si elle est périmée (ou absente) on interroge le serveur,
  // et le résultat remplace l'affichage. Une erreur réseau après un affichage du cache est ignorée.
  function load<T>(key: string, ttl: number, run: (cb: Callback<T>) => { abort(): void } | void,
    post: (v: T) => T, on: On<T>, err?: Err): Cancel {
    var hit = cache.get<T>(key, ttl), dead = false;
    if (hit) { on(hit.value); if (hit.fresh) return noop; }
    var req = run(function (e, v) {
      if (dead) return;
      if (e || v === undefined) { if (!hit && err) err(e || new Error('réponse vide')); return; }
      var out = post(v);
      cache.set(key, out);
      on(out);
    });
    return function () { dead = true; if (req) req.abort(); };
  }
  function same<T>(v: T): T { return v; }

  return {
    sections: function (on, err) {
      return load<Section[]>('sections', TTL_SECTIONS, function (cb) { return getSections(http, id, s, cb); },
        function (l) { return l.filter(function (x) { return x.type === 'movie' || x.type === 'show'; }); }, on, err);
    },
    onDeck: function (on, err) {
      return load<Item[]>('ondeck', TTL_HOME, function (cb) { return getOnDeck(http, id, s, cb); }, function (l) { return slimAll(shown(l)); }, on, err);
    },
    recent: function (on, err) {
      return load<Item[]>('recent', TTL_HOME, function (cb) { return getRecentlyAdded(http, id, s, cb); }, function (l) { return slimAll(shown(l)); }, on, err);
    },
    page: function (key, start, size, on, err) {
      return load<Page>('p:' + key + ':' + start + ':' + size, TTL_PAGE, function (cb) { return getSectionItems(http, id, s, key, start, size, cb); },
        function (p) { return { items: slimAll(p.items), total: p.total, offset: p.offset }; }, on, err);
    },
    metadata: function (rk, on, err) {
      return load<Item>('m:' + rk, TTL_META, function (cb) { return getMetadata(http, id, s, rk, cb); }, same, on, err);
    },
    children: function (rk, on, err) {
      return load<Item[]>('c:' + rk, TTL_META, function (cb) { return getChildren(http, id, s, rk, cb); }, slimAll, on, err);
    },
    progressed: function (it, offsetMs, watched) {
      var hit = cache.get<Item>('m:' + it.ratingKey);
      if (hit) {
        var m: any = {};
        for (var k in hit.value) if (hit.value.hasOwnProperty(k) && k !== 'viewOffset') m[k] = (hit.value as any)[k];
        if (watched) m.viewCount = (m.viewCount || 0) + 1; else if (offsetMs > 0) m.viewOffset = Math.round(offsetMs);
        cache.set('m:' + it.ratingKey, m);
      }
      cache.remove('ondeck');
      if (it.parentRatingKey) cache.remove('c:' + it.parentRatingKey);
      if (it.grandparentRatingKey) { cache.remove('m:' + it.grandparentRatingKey); cache.remove('c:' + it.grandparentRatingKey); }
    }
  };
}
