import { Callback, Http, Identity, ServerRef } from './types';
import { query, serverGet } from './request';

// Les <img> et AVPlay ne peuvent pas poser d'en-tête : le jeton passe dans l'URL.
// Toujours passer par le transcodeur photo, à la taille exacte d'affichage (HANDOFF §5.5).
export function photoUrl(s: ServerRef, imagePath: string, width: number, height: number): string {
  return s.uri + '/photo/:/transcode?' + query([
    ['width', Math.round(width)], ['height', Math.round(height)], ['minSize', 1], ['upscale', 1],
    ['url', imagePath], ['X-Plex-Token', s.token]
  ]);
}

export function directPlayUrl(s: ServerRef, partKey: string): string {
  return s.uri + partKey + '?' + query([['X-Plex-Token', s.token]]);
}

export interface TimelineUpdate { ratingKey: string; state: 'playing' | 'paused' | 'stopped'; timeMs: number; durationMs: number; }

export function sendTimeline(http: Http, id: Identity, s: ServerRef, u: TimelineUpdate, cb: Callback<null>) {
  var q = query([
    ['ratingKey', u.ratingKey], ['key', '/library/metadata/' + u.ratingKey], ['state', u.state],
    ['time', Math.round(u.timeMs)], ['duration', Math.round(u.durationMs)]
  ]);
  return serverGet(http, id, s, '/:/timeline?' + q, null, function (err) { err ? cb(err) : cb(null, null); });
}

function mark(path: string) {
  return function (http: Http, id: Identity, s: ServerRef, ratingKey: string, cb: Callback<null>) {
    var q = query([['key', ratingKey], ['identifier', 'com.plexapp.plugins.library']]);
    return serverGet(http, id, s, path + '?' + q, null, function (err) { err ? cb(err) : cb(null, null); });
  };
}
export var scrobble = mark('/:/scrobble');
export var unscrobble = mark('/:/unscrobble');
