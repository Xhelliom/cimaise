import { Panel } from '../../tv-core/src/router/router';
import { Key } from '../../tv-core/src/keys';
import { ServerRef } from './api/types';
import { createHomePanel } from './ui/home';
import { createLoginPanel } from './ui/login';
import { el, PlexArg, resolve } from './ui/context';

// Point d'entrée du chunk plex.js : l'accueil du module si une session est stockée, sinon la connexion (PIN, puis
// choix du serveur) qui s'efface au profit de l'accueil. L'enveloppe transmet touches et cycle de vie au panneau courant.
export function createPlexPanel(arg: PlexArg): Panel {
  var shell = el(arg.doc || document, 'plex-shell');
  var cur: Panel;

  function mount(p: Panel): void { cur = p; shell.appendChild(p.el); }
  function enter(session?: ServerRef): void {
    var a: PlexArg = { nav: arg.nav };
    for (var k in arg) if (arg.hasOwnProperty(k)) (a as any)[k] = (arg as any)[k];
    if (session) a.session = session;
    mount(createHomePanel(a));
  }

  if (resolve(arg)) enter();
  else mount(createLoginPanel(arg, function (ref) {
    shell.removeChild(cur.el);
    if (cur.destroy) cur.destroy();
    enter(ref);
  }));

  return {
    el: shell,
    onKey: function (k: Key): boolean { return !!cur.onKey && cur.onKey(k); },
    suspend: function () { if (cur.suspend) cur.suspend(); },
    resume: function () { if (cur.resume) cur.resume(); },
    destroy: function () { if (cur.destroy) cur.destroy(); }
  };
}
