// App cimaise : accueil Dock v2 alimenté par le catalogue persistant ; Plex et réglages sont des chunks
// (plex.js, settings.js) injectés à la première ouverture. Démarrage en deux temps : horloge + tuiles d'abord,
// puis (setTimeout 0) police décorative et touches média.
import { mark, toggleDiag, normalizeKey, hasTizen, registerKeys, REGISTER_KEYS, listInstalledApps } from '../../../packages/tv-core/src/index';
import { Router, lazy, chunkLoader, Panel } from '../../../packages/tv-core/src/index';
import { createHome } from '../../../packages/launcher/src/home';
import { loadCatalog, saveCatalog, launchEntry } from '../../../packages/launcher/src/catalog';

interface Chunk { createPanel(arg?: any): Panel; }

var router = new Router({ root: document.getElementById('root')! });
var plex = lazy<Chunk>(chunkLoader('plex'));
var settings = lazy<Chunk>(chunkLoader('settings'));

var catalog = loadCatalog();

var home = createHome({
  catalog: catalog,
  openInternal: function (id) {
    if (id !== 'plex') { home.notify('Module inconnu : ' + id); return; }
    router.pushLazy(plex, function (m) {
      return m.createPanel({
        nav: { push: function (p: Panel) { router.push(p); }, pop: function () { router.pop(); } },
        // Secours des fichiers qui échouent : l'app Plex officielle est cherchée par nom dans le catalogue, jamais par ID en dur.
        officialApp: function () {
          for (var i = 0; i < catalog.length; i++) {
            var e = catalog[i];
            if (e.type === 'tv' && e.id && /^plex(?!\s*int)/i.test(e.name)) {
              return { open: function (done: (err: Error | null) => void) { launchEntry(e, function () { done(null); }, function (err) { done(err); }); } };
            }
          }
          return null;
        }
      });
    });
  },
  // Lancement impossible (pas d'ID relevé, hors TV…) : l'accueil affiche lui-même un message ; le diagnostic reste à la touche 0.
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
  router.handleKey(k);
});

// Diagnostic caché (horodatages) : touche 0 de la télécommande (pavé numérique) ou du clavier.
document.addEventListener('keydown', function (e) {
  if (e.keyCode === 48 || e.keyCode === 96) toggleDiag();
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
