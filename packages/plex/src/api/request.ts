import { Callback, Http, Identity, PlexError, ServerRef } from './types';
import { plexHeaders } from './identity';

function fail(msg: string, status?: number): PlexError {
  var e = new Error(msg) as PlexError;
  if (status !== undefined) e.status = status;
  return e;
}

// Requête vers plex.tv (token de compte) ou un serveur ; renvoie le JSON, ou null si le corps est vide.
export function requestJson(http: Http, id: Identity, method: string, url: string, token: string | undefined,
  extra: { [k: string]: string } | null, cb: Callback<any>) {
  var h = plexHeaders(id, token);
  if (extra) for (var k in extra) if (extra.hasOwnProperty(k)) h[k] = extra[k];
  return http({ method: method, url: url, headers: h, timeoutMs: 10000 }, function (err, res) {
    if (err || !res) return cb(fail(err ? err.message : 'pas de réponse'));
    if (res.status < 200 || res.status >= 300) return cb(fail('HTTP ' + res.status, res.status));
    if (!res.body) return cb(null, null);
    var data: any;
    try { data = JSON.parse(res.body); } catch (e) { return cb(fail('JSON invalide')); }
    cb(null, data);
  });
}

export function serverGet(http: Http, id: Identity, s: ServerRef, path: string, extra: { [k: string]: string } | null, cb: Callback<any>) {
  return requestJson(http, id, 'GET', s.uri + path, s.token, extra, cb);
}

export function query(params: Array<[string, string | number]>): string {
  var out: string[] = [];
  for (var i = 0; i < params.length; i++) out.push(params[i][0] + '=' + encodeURIComponent(String(params[i][1])));
  return out.join('&');
}
