import { Http, Identity, Item, Section, ServerRef, Timers } from '../api/types';
import { getSectionItems } from '../api/library';
import { Cache } from './cache';

// Index léger des titres des bibliothèques Films et Séries : la recherche locale répond dès la 1re lettre, sans réseau.
// Forme stockée (cache) : [titre, année, 0 film / 1 série, ratingKey, horodatage de l'affiche] — ~45 octets par titre,
// donc ~150 Ko pour 3 400 titres. Le résumé, les pistes et le reste de la fiche ne sont jamais gardés.
export type Packed = [string, number, number, string, number | string];

export interface Hit { title: string; year: number; type: 'movie' | 'show'; ratingKey: string; thumb?: string; }
export interface Found { movies: Hit[]; shows: Hit[]; }

export interface SearchIndex {
  start(onDone?: () => void): void;   // construit (ou relit le cache) en arrière-plan ; sans effet si déjà lancé
  cancel(): void;
  search(text: string, limit?: number): Found;
  size(): number;
  complete(): boolean;
}

export interface SearchIndexOptions {
  http?: Http; id?: Identity; session?: ServerRef; cache?: Cache; timers?: Timers;
  sections?: (on: (l: Section[]) => void, err: (e: Error) => void) => () => void;
  pageSize?: number;
  preload?: Packed[];   // tests : index déjà prêt
}

interface Entry { t: string; y: number; k: number; rk: string; th: number | string; n: string; a: number; }

var KEY = 'searchidx';
var TTL = 6 * 3600000;       // au-delà : l'index est utilisé tout de suite et reconstruit en arrière-plan
var PAGE = 100;              // petites pages : le JSON d'une page se lit vite sur la TV, la main revient entre deux
var GAP = 40;                // ms entre deux pages
var ARTICLES = ['le', 'la', 'les', 'l', 'un', 'une', 'the', 'a', 'an'];
var FROM = 'àáâãäåçèéêëìíîïñòóôõöùúûüýÿ', TO = 'aaaaaaceeeeiiiinooooouuuuyy';

// Minuscules, sans accents (liste latine explicite : String.normalize n'est pas garanti), ponctuation → espace.
export function foldTitle(s: string): string {
  s = s.toLowerCase().replace(/œ/g, 'oe').replace(/æ/g, 'ae');
  var out = '';
  for (var i = 0; i < s.length; i++) {
    var j = FROM.indexOf(s.charAt(i));
    out += j >= 0 ? TO.charAt(j) : s.charAt(i);
  }
  return out.replace(/[\s'’‘"“”.,:;!?()\[\]&\/_\-–—*+]+/g, ' ').replace(/^ | $/g, '');
}

function entry(p: Packed): Entry {
  var f = foldTitle(p[0]), sp = f.indexOf(' ');
  // a : longueur de l'article de tête, espace compris (0 s'il n'y en a pas ou s'il est seul)
  var a = sp > 0 && ARTICLES.indexOf(f.slice(0, sp)) >= 0 ? sp + 1 : 0;
  return { t: p[0], y: p[1], k: p[2], rk: p[3], th: p[4], n: ' ' + f, a: a };
}

function pack(it: Item, k: number): Packed {
  var m = it.thumb ? /^\/library\/metadata\/(\d+)\/thumb\/(\d+)$/.exec(it.thumb) : null;
  var th: number | string = m && m[1] === it.ratingKey ? Number(m[2]) : it.thumb || 0;
  return [it.title, it.year || 0, k, it.ratingKey, th];
}

function hit(e: Entry): Hit {
  var th = e.th;
  var thumb = typeof th === 'string' ? th : th ? '/library/metadata/' + e.rk + '/thumb/' + th : undefined;
  var h: Hit = { title: e.t, year: e.y, type: e.k ? 'show' : 'movie', ratingKey: e.rk };
  if (thumb) h.thumb = thumb;
  return h;
}

export function createSearchIndex(o: SearchIndexOptions): SearchIndex {
  var entries: Entry[] = [];
  var done = false, started = false, dead = false;
  var req: { abort(): void } | null = null, timer: any = null, secCancel: (() => void) | null = null;

  function fill(rows: Packed[]): Entry[] { return rows.map(entry); }
  if (o.preload) { entries = fill(o.preload); done = true; started = true; }

  function finish(next: Entry[], rows: Packed[], cb?: () => void): void {
    entries = next; done = true;
    if (o.cache) o.cache.set(KEY, { v: 1, l: rows });
    if (cb) cb();
  }

  function build(cb?: () => void): void {
    var fresh: Entry[] = [], rows: Packed[] = [];
    var live = entries.length === 0;   // index vide : les pages déjà là sont interrogeables avant la fin
    if (live) entries = fresh;
    var queue: Array<{ key: string; k: number }> = [], pos = 0;

    function fail(): void { started = false; }   // pages déjà lues : gardées (interrogeables) ; une prochaine ouverture relance
    function nextSection(): void {
      if (queue.length === 0) return finish(fresh, rows, cb);
      pos = 0; page();
    }
    function page(): void {
      if (dead) return;
      var q = queue[0];
      req = getSectionItems(o.http!, o.id!, o.session!, q.key, pos, o.pageSize || PAGE, function (e, p) {
        req = null;
        if (dead) return;
        if (e || !p) return fail();
        for (var i = 0; i < p.items.length; i++) {
          var it = p.items[i];
          if (it.type !== 'movie' && it.type !== 'show') continue;
          var r = pack(it, q.k);
          rows.push(r); fresh.push(entry(r));
        }
        pos = p.offset + p.items.length;
        if (p.items.length === 0 || pos >= p.total) { queue.shift(); return nextSection(); }
        timer = o.timers!.setTimeout(function () { timer = null; page(); }, GAP);
      });
    }

    secCancel = o.sections!(function (l) {
      secCancel = null;
      for (var i = 0; i < l.length; i++) queue.push({ key: l[i].key, k: l[i].type === 'show' ? 1 : 0 });
      nextSection();
    }, fail);
  }

  return {
    start: function (cb) {
      if (started) { if (done && cb) cb(); return; }
      started = true;
      var hit0 = o.cache ? o.cache.get<{ v: number; l: Packed[] }>(KEY, TTL) : null;
      if (hit0 && hit0.value && hit0.value.v === 1 && hit0.value.l instanceof Array) {
        entries = fill(hit0.value.l); done = true;
        if (hit0.fresh) { if (cb) cb(); return; }
      }
      build(cb);
    },
    cancel: function () {
      dead = true;
      if (req) req.abort();
      if (timer !== null) o.timers!.clearTimeout(timer);
      if (secCancel) secCancel();
      req = null; timer = null; secCancel = null;
    },
    size: function () { return entries.length; },
    complete: function () { return done; },
    search: function (text, limit) {
      var out: Found = { movies: [], shows: [] };
      var toks = foldTitle(text).split(' ');
      if (toks[0] === '') return out;
      if (toks.length > 1 && ARTICLES.indexOf(toks[0]) >= 0) toks.shift();   // « le seig » : l'article ne départage rien
      var phrase = toks.join(' '), cap = limit || 30;
      var found: Array<{ e: Entry; s: number; len: number }> = [];
      for (var i = 0; i < entries.length; i++) {
        var e = entries[i], ok = true;
        for (var j = 0; j < toks.length; j++) if (e.n.indexOf(' ' + toks[j]) < 0) { ok = false; break; }
        if (!ok) continue;
        // 0 : le titre (sans article) commence par la saisie ; 1 : la saisie est une suite de débuts de mots ; 2 : les mots sont dispersés
        var s = e.n.substr(1 + e.a, phrase.length) === phrase ? 0 : e.n.indexOf(' ' + phrase) >= 0 ? 1 : 2;
        found.push({ e: e, s: s, len: e.n.length - e.a });
      }
      found.sort(function (x, y) { return x.s - y.s || x.len - y.len || y.e.y - x.e.y; });
      for (var k = 0; k < found.length; k++) {
        var list = found[k].e.k ? out.shows : out.movies;
        if (list.length < cap) list.push(hit(found[k].e));
      }
      return out;
    }
  };
}
