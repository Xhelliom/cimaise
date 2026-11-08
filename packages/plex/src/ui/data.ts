import { Callback, Http, Identity, Item, Letter, Page, Section, ServerRef } from '../api/types';
import { getChildren, getFirstCharacter, getMetadata, getOnDeck, getRecentlyAdded, getRecentlyAddedUnwatched, getSectionItems, getSectionOnDeck, getSectionRatings, getShowKeys, getSectionRecent, getSections, LibraryView, TITLE_VIEW, filterQuery, viewQuery } from '../api/library';
import { Cache } from './cache';

export type Cancel = () => void;
type On<T> = (value: T) => void;
type Err = (err: Error) => void;

// Durées de vie (ms) : l'accueil change vite, les bibliothèques et les fiches moins.
// Rangées d’une bibliothèque : 24 éléments (4 écrans de 6 tuiles), même durée de vie que l’accueil.
export var SECTION_ROW = 24;
var TTL_HOME = 5 * 60000, TTL_SECTIONS = 3600000, TTL_PAGE = 10 * 60000, TTL_META = 30 * 60000;

// Position quittée au lecteur : le serveur la reçoit avec un léger retard, une réponse plus ancienne ne doit pas la remplacer.
var LOCAL_MS = 60000;   // gardée dans le cache (clé 'o:'), donc partagée entre les écrans, qui ont chacun leur Data
// `unseen` : marqué non vu, le compteur de vues du serveur (encore ancien) est retiré.
interface Local { offset: number; watched: boolean; unseen?: boolean; }

function noop(): void { /* rien à annuler */ }

// Les listes n'ont besoin ni des pistes média ni du résumé : on ne met que l'utile dans le cache.
function slim(it: Item): Item {
  var o: any = {};
  for (var k in it) if (it.hasOwnProperty(k) && k !== 'Media' && k !== 'summary') o[k] = (it as any)[k];
  return o;
}
function slimAll(l: Item[]): Item[] { return l.map(slim); }
// Rangées de l'accueil : le bandeau montre 2 lignes de résumé (≈ 110 caractères) ; on en garde SUMMARY_MAX, coupé au mot.
export var SUMMARY_MAX = 200;
export function brief(t: string): string {
  if (t.length <= SUMMARY_MAX) return t;
  var c = t.slice(0, SUMMARY_MAX), sp = c.lastIndexOf(' ');
  return (sp > SUMMARY_MAX / 2 ? c.slice(0, sp) : c) + '…';
}
function slimHome(l: Item[]): Item[] {
  return l.map(function (it) { var o = slim(it); if (it.summary) o.summary = brief(it.summary); return o; });
}

// Types montrables (la musique est hors MVP ; une saison s'ouvre sur sa série).
function shown(l: Item[]): Item[] {
  return l.filter(function (i) { return i.type === 'movie' || i.type === 'show' || i.type === 'episode' || i.type === 'season'; });
}

// Vu en entier : film ou épisode lu, série ou saison dont tous les épisodes sont lus.
function seen(it: Item): boolean {
  return it.leafCount ? (it.viewedLeafCount || 0) >= it.leafCount : (it.viewCount || 0) > 0;
}

export interface Data {
  sections(on: On<Section[]>, err?: Err): Cancel;
  onDeck(on: On<Item[]>, err?: Err): Cancel;
  recent(on: On<Item[]>, err?: Err): Cancel;
  // « Pas encore vus » : ajouts récents non vus (une requête de plus à l'ouverture de l'accueil, même cache que « recent »).
  unseen(on: On<Item[]>, err?: Err): Cancel;
  // Rangées « En cours » et « Ajoutés récemment » d’une bibliothèque (`shows` : séries regroupées, une tuile par série).
  sectionDeck(sectionKey: string, on: On<Item[]>, err?: Err): Cancel;
  sectionRecent(sectionKey: string, shows: boolean, on: On<Item[]>, err?: Err): Cancel;
  // `view` : tri et filtre (défaut : par titre, tout) ; chaque combinaison a ses propres pages en cache.
  page(sectionKey: string, start: number, size: number, on: On<Page>, err?: Err, view?: LibraryView): Cancel;
  // `view` : seuls ses filtres (non vus, âge) comptent ; l’index suit la grille.
  letters(sectionKey: string, on: On<Letter[]>, err?: Err, view?: LibraryView): Cancel;
  // Classifications présentes dans la bibliothèque (filtre par âge), en cache une heure comme la liste des bibliothèques.
  ratings(sectionKey: string, on: On<string[]>, err?: Err): Cancel;
  // ratingKey des séries de la bibliothèque classées dans `codes` (filtre par âge des saisons de l'accueil), en cache une heure.
  showKeys(sectionKey: string, codes: string[], on: On<string[]>, err?: Err): Cancel;
  metadata(ratingKey: string, on: On<Item>, err?: Err, withOnDeck?: boolean): Cancel;
  children(ratingKey: string, on: On<Item[]>, err?: Err): Cancel;
  // Retour de lecture : la fiche est corrigée sur place, « En cours » et les parents (saison, série) sont rechargés.
  progressed(it: Item, offsetMs: number, watched: boolean): void;
  // Marqué vu ou non vu (scrobble réussi) : même correction sur place ; l'élément quitte « En cours » dans les deux cas.
  marked(it: Item, watched: boolean): void;
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

  function apply(it: Item): Item {
    var h = cache.get<Local>('o:' + it.ratingKey, LOCAL_MS);
    if (!h || !h.fresh) return it;
    var l = h.value;
    var o: any = {};
    for (var k in it) if (it.hasOwnProperty(k) && k !== 'viewOffset' && !(l.unseen && k === 'viewCount')) o[k] = (it as any)[k];
    if (l.watched) { if (!o.viewCount) o.viewCount = 1; } else if (l.offset > 0) o.viewOffset = l.offset;
    return o;
  }
  function applyAll(l: Item[]): Item[] { return l.map(apply); }
  function patch<T>(key: string, fn: (v: T) => T): void {
    var hit = cache.get<T>(key, 0);
    if (hit) cache.set(key, fn(hit.value), true);
  }

  // « En cours » de chaque bibliothèque ouverte (clés 'sd:' notées sous 'sdk') : position corrigée, élément vu retiré,
  // le tout marqué à redemander. Un élément nouvellement commencé n’y est pas ajouté (sa bibliothèque n’est pas connue ici) :
  // la réponse du serveur, demandée au retour sur la bibliothèque, l’apporte.
  function sectionDecks(it: Item, gone: boolean): void {
    var k = cache.get<string[]>('sdk', 0);
    if (k) for (var i = 0; i < k.value.length; i++) patch<Item[]>('sd:' + k.value[i], function (l) {
      return gone ? l.filter(function (x) { return x.ratingKey !== it.ratingKey; }) : applyAll(l);
    });
  }

  // Tout est corrigé sur place puis marqué à redemander : l'affichage est immédiat, le serveur reprend la main ensuite.
  // Un épisode qui passe vu ou non vu décale de ±1 les compteurs « vus » de sa saison (liste des saisons, fiche) et de sa série.
  function touch(it: Item, local: Local): void {
    var was = seenNow(it);
    cache.set('o:' + it.ratingKey, local);
    if (local.watched) patch<Item[]>('unseen', function (l) { return l.filter(function (x) { return x.ratingKey !== it.ratingKey; }); });
    patch<Item>('m:' + it.ratingKey, apply);
    if (it.parentRatingKey) patch<Item[]>('c:' + it.parentRatingKey, applyAll);
    var now = seenNow(it), d = was === null || now === null ? 0 : (now ? 1 : 0) - (was ? 1 : 0);
    var gp = it.grandparentRatingKey, pk = it.parentRatingKey;
    function count(x: Item): Item { return d && x.leafCount !== undefined ? counted(x, d) : x; }
    if (pk) patch<Item>('m:' + pk, count);
    if (gp) {
      patch<Item>('m:' + gp, count);
      patch<Item[]>('c:' + gp, function (l) { return l.map(function (s) { return s.ratingKey === pk ? count(s) : s; }); });
    }
  }
  // Vu d'après le cache (liste de la saison, sinon fiche de l'épisode) ; null si l'épisode n'y est pas.
  function seenNow(it: Item): boolean | null {
    var l = it.parentRatingKey ? cache.get<Item[]>('c:' + it.parentRatingKey, 0) : null;
    if (l) for (var i = 0; i < l.value.length; i++) if (l.value[i].ratingKey === it.ratingKey) return !!l.value[i].viewCount;
    var m = cache.get<Item>('m:' + it.ratingKey, 0);
    return m ? !!m.value.viewCount : null;
  }
  function counted(x: Item, d: number): Item {
    var o: any = {};
    for (var k in x) if (x.hasOwnProperty(k)) o[k] = (x as any)[k];
    o.viewedLeafCount = Math.max(0, Math.min(x.leafCount || 0, (x.viewedLeafCount || 0) + d));
    return o;
  }

  return {
    sections: function (on, err) {
      return load<Section[]>('sections', TTL_SECTIONS, function (cb) { return getSections(http, id, s, cb); },
        function (l) { return l.filter(function (x) { return x.type === 'movie' || x.type === 'show'; }); }, on, err);
    },
    onDeck: function (on, err) {
      return load<Item[]>('ondeck', TTL_HOME, function (cb) { return getOnDeck(http, id, s, cb); }, function (l) { return applyAll(slimHome(shown(l))); }, on, err);
    },
    recent: function (on, err) {
      return load<Item[]>('recent', TTL_HOME, function (cb) { return getRecentlyAdded(http, id, s, cb); }, function (l) { return slimHome(shown(l)); }, on, err);
    },
    // Le serveur filtre déjà (unwatched=1) ; le filtre local couvre ce qui vient d'être vu ici, avant que le serveur le sache.
    unseen: function (on, err) {
      return load<Item[]>('unseen', TTL_HOME, function (cb) { return getRecentlyAddedUnwatched(http, id, s, cb); },
        function (l) { return applyAll(slimHome(shown(l))).filter(function (x) { return !seen(x); }); }, on, err);
    },
    sectionDeck: function (key, on, err) {
      var k = cache.get<string[]>('sdk', 0), keys = k ? k.value : [];
      if (keys.indexOf(key) < 0) cache.set('sdk', keys.concat([key]).slice(-8));
      return load<Item[]>('sd:' + key, TTL_HOME, function (cb) { return getSectionOnDeck(http, id, s, key, SECTION_ROW, cb); },
        function (l) { return applyAll(slimAll(shown(l))); }, on, err);
    },
    sectionRecent: function (key, shows, on, err) {
      return load<Item[]>('sr:' + key, TTL_HOME, function (cb) { return getSectionRecent(http, id, s, key, shows, SECTION_ROW, cb); },
        function (l) { return slimAll(shown(l)); }, on, err);
    },
    page: function (key, start, size, on, err, view) {
      // Tri par titre sans filtre : clé d'origine (le cache déjà présent reste valable).
      var v = view || TITLE_VIEW, q = v.sort === TITLE_VIEW.sort && !filterQuery(v) ? '' : viewQuery(v) + ':';
      return load<Page>('p:' + key + ':' + q + start + ':' + size, TTL_PAGE, function (cb) { return getSectionItems(http, id, s, key, start, size, cb, v); },
        function (p) { return { items: slimAll(p.items), total: p.total, offset: p.offset }; }, on, err);
    },
    letters: function (key, on, err, view) {
      // Sans filtre : clé d'origine ; non vus seuls : ':u' (cache déjà présent) ; sinon la requête elle-même.
      var f = view ? filterQuery(view) : '', q = !f ? '' : f === '&unwatched=1' ? ':u' : ':' + f;
      return load<Letter[]>('l:' + key + q, TTL_PAGE, function (cb) { return getFirstCharacter(http, id, s, key, cb, view); }, same, on, err);
    },
    showKeys: function (key, codes, on, err) {
      return load<string[]>('sk:' + key + ':' + codes.join(','), TTL_SECTIONS, function (cb) { return getShowKeys(http, id, s, key, codes, cb); }, same, on, err);
    },
    ratings: function (key, on, err) {
      return load<string[]>('cr:' + key, TTL_SECTIONS, function (cb) { return getSectionRatings(http, id, s, key, cb); }, same, on, err);
    },
    metadata: function (rk, on, err, withOnDeck) {
      return load<Item>('m:' + rk, TTL_META, function (cb) { return getMetadata(http, id, s, rk, cb, withOnDeck); }, apply, on, err);
    },
    children: function (rk, on, err) {
      return load<Item[]>('c:' + rk, TTL_META, function (cb) { return getChildren(http, id, s, rk, cb); }, function (l) { return applyAll(slimAll(l)); }, on, err);
    },
    progressed: function (it, offsetMs, watched) {
      touch(it, { offset: Math.round(offsetMs), watched: watched });
      patch<Item[]>('ondeck', function (l) {
        var out = applyAll(l), seen = false;
        if (watched) return out.filter(function (x) { return x.ratingKey !== it.ratingKey; });
        for (var i = 0; i < out.length; i++) if (out[i].ratingKey === it.ratingKey) seen = true;
        if (!seen && offsetMs > 0 && (it.type === 'movie' || it.type === 'episode')) out.unshift(apply(slim(it)));
        return out;
      });
      sectionDecks(it, watched);
    },
    marked: function (it, watched) {
      touch(it, { offset: 0, watched: watched, unseen: !watched });
      patch<Item[]>('ondeck', function (l) { return l.filter(function (x) { return x.ratingKey !== it.ratingKey; }); });
      sectionDecks(it, true);
    }
  };
}
