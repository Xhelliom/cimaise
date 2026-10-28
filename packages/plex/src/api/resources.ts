import { Callback, Connection, Http, Identity, Server, ServerRef } from './types';
import { requestJson } from './request';

export function getServers(http: Http, id: Identity, accountToken: string, cb: Callback<Server[]>) {
  return requestJson(http, id, 'GET', 'https://plex.tv/api/v2/resources?includeHttps=1&includeRelay=1', accountToken, null, function (err, j) {
    if (err) return cb(err);
    if (!(j instanceof Array)) return cb(new Error('réponse des ressources invalide'));
    var out: Server[] = [];
    for (var i = 0; i < j.length; i++) {
      var r = j[i];
      if (!r) continue;
      if (String(r.provides).split(',').indexOf('server') < 0) continue;
      var cs: Connection[] = [];
      var rc = r.connections instanceof Array ? r.connections : [];
      for (var k = 0; k < rc.length; k++) {
        var c = rc[k];
        cs.push({ uri: c.uri, local: !!c.local, relay: !!c.relay });
      }
      out.push({ name: r.name, accessToken: r.accessToken, connections: cs });
    }
    cb(null, out);
  });
}

// Ordre d'essai : locales, puis directes distantes, puis relais. S'arrête à la première qui répond sur /identity.
export function orderConnections(cs: Connection[]): Connection[] {
  function rank(c: Connection) { return c.relay ? 2 : c.local ? 0 : 1; }
  var out: Connection[] = [];
  for (var r = 0; r < 3; r++) for (var i = 0; i < cs.length; i++) if (rank(cs[i]) === r) out.push(cs[i]);
  return out;
}

export function chooseConnection(http: Http, id: Identity, server: Server, cb: Callback<ServerRef>) {
  var list = orderConnections(server.connections), i = 0;
  function next() {
    if (i >= list.length) return cb(new Error('aucune connexion joignable'));
    var c = list[i++];
    requestJson(http, id, 'GET', c.uri + '/identity', server.accessToken, null, function (err) {
      if (err) return next();
      cb(null, { uri: c.uri, token: server.accessToken });
    });
  }
  next();
}
