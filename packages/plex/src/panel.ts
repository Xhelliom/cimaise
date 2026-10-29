import { Panel } from '../../tv-core/src/router/router';

// Écran du module Plex, livré dans le chunk plex.js (chargé à la première ouverture seulement).
// Provisoire : l'interface réelle (connexion, accueil, bibliothèques) est le jalon M3.
export function createPlexPanel(): Panel {
  var el = document.createElement('div');
  el.className = 'plex-panel';
  el.textContent = 'Plex — module en construction (M3)';
  return { el: el };
}
