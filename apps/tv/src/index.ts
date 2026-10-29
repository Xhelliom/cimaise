// App cimaise : premier affichage minimal (horloge + tuiles), puis chargement différé du reste.
// Plex et réglages sont des chunks séparés (plex.js, settings.js), injectés à la première ouverture.
import { mark, report, toggleDiag, normalizeKey, hasTizen, registerKeys, REGISTER_KEYS } from '../../../packages/tv-core/src/index';
import { Router, lazy, chunkLoader, Panel } from '../../../packages/tv-core/src/index';
import { createHome } from '../../../packages/launcher/src/home';
import { TILES } from '../../../packages/launcher/src/tiles';

interface Chunk { createPanel(arg?: string): Panel; }

var router = new Router({ root: document.getElementById('root')! });
var plex = lazy<Chunk>(chunkLoader('plex'));
var settings = lazy<Chunk>(chunkLoader('settings'));

var home = createHome({
  tiles: TILES,
  onTile: function (tile) {
    if (tile.module !== 'plex') return false; // lancement des apps réelles : M2
    router.pushLazy(plex, function (m) { return m.createPanel(); });
    return true;
  },
  onSettings: function () {
    router.pushLazy(settings, function (m) { return m.createPanel(report()); });
  }
});
router.push(home.panel);

document.addEventListener('keydown', function (e) {
  var k = normalizeKey(e);
  if (k === null) return;
  if (!router.handleKey(k) && k === 'enter') toggleDiag(); // écran de diagnostic caché
});

mark('firstPaint');
mark('interactive');

// Après le premier affichage : fond teinté, police, pastille, touches média.
setTimeout(function () {
  home.enhance();
  // Sans TV (aperçu), l'appel lève en signalant l'absence de TV ; l'accueil reste fonctionnel.
  if (hasTizen()) {
    try { registerKeys(REGISTER_KEYS); } catch (e) { /* l'erreur est déjà signalée (console + bandeau) */ }
  }
}, 0);
