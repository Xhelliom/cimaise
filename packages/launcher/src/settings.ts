import { Panel } from '../../tv-core/src/router/router';

// Réglages : livrés dans le chunk settings.js, chargés à la première ouverture seulement.
// Pour l'instant : le diagnostic de démarrage (horodatages). Retour dépile (routeur).
export function createSettingsPanel(diag: string): Panel {
  var el = document.createElement('div');
  el.className = 'reglages';
  var h = document.createElement('h1');
  h.textContent = 'Réglages';
  var pre = document.createElement('pre');
  pre.textContent = diag;
  el.appendChild(h);
  el.appendChild(pre);
  return { el: el };
}
