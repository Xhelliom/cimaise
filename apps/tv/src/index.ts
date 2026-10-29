// App cimaise : accueil Dock v2 alimenté par le catalogue persistant ; Plex et réglages sont des chunks
// (plex.js, settings.js) injectés à la première ouverture. Démarrage en deux temps : horloge + tuiles d'abord,
// puis (setTimeout 0) police décorative et touches média.
import { mark, toggleDiag, normalizeKey, hasTizen, registerKeys, REGISTER_KEYS, listInstalledApps } from '../../../packages/tv-core/src/index';
import { Router, lazy, chunkLoader, Panel } from '../../../packages/tv-core/src/index';
import { createHome } from '../../../packages/launcher/src/home';
import { loadCatalog, saveCatalog } from '../../../packages/launcher/src/catalog';

interface Chunk { createPanel(arg?: any): Panel; }

var router = new Router({ root: document.getElementById('root')! });
var plex = lazy<Chunk>(chunkLoader('plex'));
var settings = lazy<Chunk>(chunkLoader('settings'));

var catalog = loadCatalog();

var home = createHome({
  catalog: catalog,
  openInternal: function (id) {
    if (id !== 'plex') { toggleDiag(); return; }
    router.pushLazy(plex, function (m) { return m.createPanel(); });
  },
  // Lancement impossible (pas d'ID relevé, hors TV…) : l'écran de diagnostic caché s'ouvre (horodatages).
  onError: function () { toggleDiag(); },
  onPastille: function (name) {
    if (name !== 'reglages') return; // Smart Hub, Réseau : pas encore branchés
    router.pushLazy(settings, function (m) {
      return m.createPanel({
        catalog: catalog,
        listInstalledApps: listInstalledApps,
        onChange: function (next: typeof catalog) {
          catalog = next;
          try { saveCatalog(catalog); } catch (e) { /* stockage plein ou refusé : le catalogue reste valable pour cette session */ }
          home.setCatalog(catalog);
        },
        onClose: function () { router.pop(); }
      });
    });
  }
});
router.push(home);

document.addEventListener('keydown', function (e) {
  var k = normalizeKey(e);
  if (k === null) return;
  if (!router.handleKey(k) && k === 'enter') toggleDiag();
});

mark('firstPaint');
mark('interactive');

// Après le premier affichage : police décorative, touches média.
setTimeout(function () {
  document.body.className = 'late';
  // Sans TV (aperçu), l'appel lève en signalant l'absence de TV ; l'accueil reste fonctionnel.
  if (hasTizen()) {
    try { registerKeys(REGISTER_KEYS); } catch (e) { /* l'erreur est déjà signalée (console + bandeau) */ }
  }
}, 0);
