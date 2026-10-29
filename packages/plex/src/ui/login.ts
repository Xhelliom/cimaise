import { Server, ServerRef, PlexError } from '../api/types';
import { xhrHttp } from '../api/xhr';
import { createPin, pollPin } from '../api/pin';
import { getServers, chooseConnection } from '../api/resources';
import { loadStored, saveStored } from '../../../tv-core/src/storage';
import { Panel } from '../../../tv-core/src/router/router';
import { Key } from '../../../tv-core/src/keys';
import { el, identityOf, PlexArg, realTimers } from './context';

var POLL_MS = 2000;
var PIN_LIFETIME_MS = 15 * 60 * 1000;

function setPref(arg: PlexArg, name: string, value: any): void {
  try {
    var s = loadStored(arg.store);
    if (value === undefined) delete s.prefs[name]; else s.prefs[name] = value;
    saveStored(s, arg.store);
  } catch (e) { /* stockage refusé : la session vaut pour cette ouverture seulement */ }
}

// Premier écran sans session : code PIN (à valider sur plex.tv/link), puis choix du serveur. Le token de compte et le
// serveur choisi vont dans le stockage tv-core (prefs.plexToken, plexServer, plexSession) ; jamais dans un log.
// Retour (géré par le routeur) dépile l'écran, destroy() annule l'attente.
export function createLoginPanel(arg: PlexArg, done: (s: ServerRef) => void): Panel {
  var doc = arg.doc || document;
  var http = arg.http || xhrHttp;
  var id = identityOf(arg);
  var timers = arg.timers || realTimers();
  var root = el(doc, 'plex-panel plex-login');
  var view: HTMLElement | null = null;
  var dead = false;
  var cancel: (() => void) | null = null;   // opération en cours (requête ou interrogation)
  var onEnter: (() => void) | null = null;
  var picking = false;   // la liste des serveurs est à l'écran
  var list: Server[] = [], sel = 0;

  function stop(): void { if (cancel) { var c = cancel; cancel = null; c(); } }
  function show(): HTMLElement {
    if (view) root.removeChild(view);
    view = el(doc, 'plex-login-view');
    root.appendChild(view);
    onEnter = null;
    picking = false;
    return view;
  }
  function message(text: string, retry?: () => void): void {
    var v = show();
    v.appendChild(el(doc, 'plex-status', text));
    if (retry) { v.appendChild(el(doc, 'plex-hint', 'OK pour réessayer · Retour pour quitter')); onEnter = retry; }
  }
  function fail(prefix: string, e: Error, retry: () => void): void { message(prefix + ' : ' + e.message, retry); }

  function begin(): void {
    stop();
    var token = loadStored(arg.store).prefs.plexToken;
    if (typeof token === 'string' && token) servers(token); else pin();
  }

  function pin(): void {
    message('Connexion à plex.tv…');
    var req = createPin(http, id, function (err, p) {
      cancel = null;
      if (dead) return;
      if (err || !p) return fail('plex.tv injoignable', err || new Error('réponse vide'), pin);
      var v = show();
      v.appendChild(el(doc, 'plex-login-lead', 'Va sur plex.tv/link'));
      v.appendChild(el(doc, 'plex-login-sub', 'et saisis ce code'));
      v.appendChild(el(doc, 'plex-pin', p.code));
      v.appendChild(el(doc, 'plex-hint', 'En attente de la validation · Retour pour annuler'));
      cancel = pollPin(http, id, p.id, timers, { intervalMs: POLL_MS, timeoutMs: PIN_LIFETIME_MS }, function (r) {
        cancel = null;
        if (dead) return;
        if (r.status === 'token') { setPref(arg, 'plexToken', r.token); return servers(r.token); }
        if (r.status === 'expired') return message('Code expiré.', pin);
        fail('Connexion refusée', new Error(r.message), pin);
      });
    });
    cancel = function () { req.abort(); };
  }

  function servers(token: string): void {
    message('Recherche de ton serveur Plex…');
    var req = getServers(http, id, token, function (err: PlexError | null, found?: Server[]) {
      cancel = null;
      if (dead) return;
      if (err && err.status === 401) { setPref(arg, 'plexToken', undefined); return pin(); }   // jeton révoqué
      if (err || !found) return fail('Serveurs injoignables', err || new Error('réponse vide'), begin);
      if (!found.length) return message('Aucun serveur Plex sur ce compte.', begin);
      list = found;
      var remembered = loadStored(arg.store).prefs.plexServer;
      for (var i = 0; i < found.length; i++) if (found[i].name === remembered) return connect(found[i]);
      if (found.length === 1) return connect(found[0]);
      pick();
    });
    cancel = function () { req.abort(); };
  }

  function pick(): void {
    var v = show();
    v.appendChild(el(doc, 'plex-login-lead', 'Choisis ton serveur'));
    var rows = el(doc, 'plex-servers');
    var nodes: HTMLElement[] = [];
    for (var i = 0; i < list.length; i++) {
      var n = el(doc, 'plex-server' + (i === sel ? ' focus' : ''), list[i].name);
      nodes.push(n);
      rows.appendChild(n);
    }
    v.appendChild(rows);
    picking = true;
    onEnter = function () { connect(list[sel]); };
  }

  function connect(s: Server): void {
    message('Connexion à ' + s.name + '…');
    var again = list.length > 1 ? pick : function () { connect(s); };
    var done_ = false;
    chooseConnection(http, id, s, function (err, ref) {
      cancel = null;
      if (dead || done_) return;
      if (err || !ref) return fail('Serveur injoignable', err || new Error('aucune connexion'), again);
      done_ = true;
      setPref(arg, 'plexServer', s.name);
      setPref(arg, 'plexSession', ref);
      done(ref);
    });
    cancel = function () { done_ = true; };
  }

  begin();

  return {
    el: root,
    onKey: function (k: Key): boolean {
      if (k === 'enter' && onEnter) { onEnter(); return true; }
      if ((k === 'up' || k === 'down') && picking) {
        var next = sel + (k === 'down' ? 1 : -1);
        if (next < 0 || next >= list.length) return true;
        sel = next;
        pick();
        return true;
      }
      return false;
    },
    destroy: function () { dead = true; stop(); }
  };
}
