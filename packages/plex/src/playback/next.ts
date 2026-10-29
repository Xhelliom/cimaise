import { Abortable, Http, Identity, Item, Marker, ServerRef } from '../api/types';
import { getChildren } from '../api/library';

// Épisode suivant d'un épisode : le suivant dans sa saison, sinon le premier de la saison suivante de la série (null : dernier épisode, ou introuvable).
// Trois requêtes au plus ; le résultat n'a de sens que pour un épisode (les films n'en ont pas).
export function findNextEpisode(http: Http, id: Identity, s: ServerRef, ep: Item, cb: (next: Item | null) => void): Abortable {
  var dead = false, cur: Abortable | null = null;
  function done(n: Item | null): void { if (!dead) cb(n); }
  function after(list: Item[], key: string): Item | null {
    for (var i = 0; i < list.length; i++) if (list[i].ratingKey === key) return list[i + 1] || null;
    return null;
  }
  if (ep.type !== 'episode' || !ep.parentRatingKey) { done(null); return { abort: function () { dead = true; } }; }
  cur = getChildren(http, id, s, ep.parentRatingKey, function (err, eps) {
    if (dead) return;
    var n = err || !eps ? null : after(eps, ep.ratingKey);
    if (n || err || !ep.grandparentRatingKey) { done(n); return; }
    cur = getChildren(http, id, s, ep.grandparentRatingKey, function (e2, seasons) {
      if (dead) return;
      var ns = e2 || !seasons ? null : after(seasons, ep.parentRatingKey!);
      if (!ns) { done(null); return; }
      cur = getChildren(http, id, s, ns.ratingKey, function (e3, first) {
        done(e3 || !first || !first.length ? null : first[0]);
      });
    });
  });
  return { abort: function () { dead = true; if (cur) cur.abort(); } };
}

export interface Span { start: number; end: number; }
export interface Markers { intro: Span | null; credits: Span | null; }

// Marqueurs exploitables : bornes numériques, fin après début ; le premier de chaque type l'emporte.
export function parseMarkers(list: Marker[] | undefined): Markers {
  var out: Markers = { intro: null, credits: null };
  for (var i = 0; list && i < list.length; i++) {
    var m = list[i];
    if (typeof m.startTimeOffset !== 'number' || typeof m.endTimeOffset !== 'number' || m.endTimeOffset <= m.startTimeOffset) continue;
    var span = { start: m.startTimeOffset, end: m.endTimeOffset };
    if (m.type === 'intro' && !out.intro) out.intro = span;
    else if (m.type === 'credits' && !out.credits) out.credits = span;
  }
  return out;
}

export function inSpan(sp: Span | null, ms: number): boolean { return !!sp && ms >= sp.start && ms < sp.end; }
