import { Panel } from '../../tv-core/src/router/router';
import { createHomePanel } from './ui/home';
import { el, PlexArg, resolve } from './ui/context';

// Point d'entrée du chunk plex.js : l'accueil du module, ou un message tant qu'aucune session Plex n'est enregistrée
// (la connexion par PIN n'est pas dans cet écran).
export function createPlexPanel(arg: PlexArg): Panel {
  if (resolve(arg)) return createHomePanel(arg);
  var doc = arg.doc || document;
  var root = el(doc, 'plex-panel');
  root.appendChild(el(doc, 'plex-status', 'Connexion Plex requise : aucune session enregistrée sur cette TV.'));
  return { el: root };
}
