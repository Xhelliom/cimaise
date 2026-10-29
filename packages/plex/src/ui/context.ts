import { Http, Identity, Item, ServerRef, Timers } from '../api/types';
import { xhrHttp } from '../api/xhr';
import { getClientId } from '../api/identity';
import { loadStored } from '../../../tv-core/src/storage';
import { Panel } from '../../../tv-core/src/router/router';
import { TileInfo } from '../../../tv-core/src/virtual/list';
import { createCache } from './cache';
import { createData, Data } from './data';
import { posterUrl } from './images';
import { Player, PlayerOptions } from '../../../tv-core/src/player';

// Pile d'écrans : celle du routeur de l'app (Retour dépile).
export interface Nav { push(p: Panel): void; pop(): void; }

// Tout est injectable pour les tests ; les valeurs par défaut sont celles de la TV.
export interface PlexArg {
  nav: Nav;
  doc?: Document;
  http?: Http;
  store?: Storage;
  session?: ServerRef | null;   // null = pas de session ; absent = lue dans le stockage (prefs.plexSession)
  id?: Identity;
  now?: () => number;
  onPlay?: (item: Item, startMs?: number) => void;
  timers?: Timers;   // connexion par PIN : interrogation périodique ; minuteries du lecteur
  createPlayer?: (o: PlayerOptions) => Player;   // défaut : wrapper AVPlay de tv-core
  // App Plex officielle de la TV, cherchée par nom dans le catalogue (jamais un ID en dur) ; null = introuvable.
  officialApp?: () => OfficialApp | null;
}

export interface OfficialApp { open(done: (err: Error | null) => void): void; }

export interface Ctx { doc: Document; data: Data; session: ServerRef; nav: Nav; play(item: Item, startMs?: number): void; }

export function storedSession(store?: Storage): ServerRef | null {
  var s = loadStored(store).prefs.plexSession;
  return s && typeof s.uri === 'string' && typeof s.token === 'string' ? { uri: s.uri, token: s.token } : null;
}

export function identityOf(arg: PlexArg): Identity {
  return arg.id || { clientId: getClientId(arg.store), product: 'Cimaise', version: '0.0.0', platform: 'Tizen', device: 'Frame' };
}

export function realTimers(): Timers {
  return {
    now: function () { return new Date().getTime(); },
    setTimeout: function (fn, ms) { return window.setTimeout(fn, ms); },
    clearTimeout: function (id) { window.clearTimeout(id); }
  };
}

export function resolve(arg: PlexArg): Ctx | null {
  var session = arg.session === undefined ? storedSession(arg.store) : arg.session;
  if (!session) return null;
  var doc = arg.doc || document;
  var id = identityOf(arg);
  var cache = createCache({ store: arg.store, ns: session.uri, now: arg.now });
  var data = createData(arg.http || xhrHttp, id, session, cache);
  return { doc: doc, data: data, session: session, nav: arg.nav, play: arg.onPlay || function () { /* message de la fiche */ } };
}

export function el(doc: Document, cls: string, text?: string): HTMLElement {
  var e = doc.createElement('div');
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

// Libellé d'une tuile : « Série · S1 E8 » pour un épisode, « Série · Saison 2 » pour une saison.
export function tileTitle(it: Item): string {
  if (it.type === 'episode') {
    var se = (it.parentIndex !== undefined ? 'S' + it.parentIndex + ' ' : '') + (it.index !== undefined ? 'E' + it.index : '');
    return (it.grandparentTitle || it.title) + (se ? ' · ' + se.replace(/\s+$/, '') : '');
  }
  if (it.type === 'season') return (it.parentTitle ? it.parentTitle + ' · ' : '') + it.title;
  return it.title;
}

export function tileInfo(s: ServerRef, it: Item, withImage: boolean): TileInfo {
  return { title: tileTitle(it), image: withImage ? posterUrl(s, it) : null };
}

// Ce qu'ouvre une tuile : un film ou une série ; un épisode ou une saison ouvre sa série.
export function openable(it: Item): Item | null {
  if (it.type === 'movie' || it.type === 'show') return it;
  if (it.type === 'episode' && it.grandparentRatingKey) {
    return { ratingKey: it.grandparentRatingKey, type: 'show', title: it.grandparentTitle || it.title, thumb: it.grandparentThumb };
  }
  if (it.type === 'season' && it.parentRatingKey) {
    return { ratingKey: it.parentRatingKey, type: 'show', title: it.parentTitle || it.title, thumb: it.parentThumb };
  }
  return null;
}
