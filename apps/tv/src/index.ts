// App cimaise : accueil Dock v2 alimenté par le catalogue persistant ; Plex et réglages sont des chunks
// (plex.js, settings.js) injectés à la première ouverture. Démarrage en deux temps : horloge + tuiles d'abord,
// puis (setTimeout 0) police décorative et touches média.
import { mark, toggleDiag, keyLatency, normalizeKey, isDiagOpen, hasTizen, registerKeys, REGISTER_KEYS, listInstalledApps, launchApp, hideApp } from '../../../packages/tv-core/src/index';
import { Router, lazy, chunkLoader, Panel } from '../../../packages/tv-core/src/index';
import { createHome, loadHomeMode, saveHomeMode, loadHomeTiles, saveHomeTiles, loadSmartHubTarget } from '../../../packages/launcher/src/home';
import { loadCatalog, saveCatalog, launchEntry } from '../../../packages/launcher/src/catalog';

interface Chunk { createPanel(arg?: any): Panel; createProbePanel?(arg?: any): Panel; }

var router = new Router({ root: document.getElementById('root')! });
var plex = lazy<Chunk>(chunkLoader('plex'));
var settings = lazy<Chunk>(chunkLoader('settings'));

var catalog = loadCatalog();
var mode = loadHomeMode();
var tiles = loadHomeTiles();

// Pastille Smart Hub : l'app cible vient des préférences (jamais d'ID en dur) ; sans cible, ou si son lancement échoue,
// repli sur hide() de l'app courante, qui ramène au Smart Hub.
function openSmartHub(): void {
  var leave = function () {
    try { hideApp(); } catch (e) { home.notify('Smart Hub : sortie impossible (hors TV ?)'); }
  };
  var target = loadSmartHubTarget();
  if (!target) { leave(); return; }
  try { launchApp(target, undefined, leave); } catch (e) { leave(); }
}

var home = createHome({
  catalog: catalog,
  mode: mode,
  tiles: tiles,
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
    if (name === 'smarthub') { openSmartHub(); return; }
    router.pushLazy(settings, function (m) {
      return m.createPanel({
        catalog: catalog,
        mode: mode,
        onMode: function (next: typeof mode) {
          mode = next;
          try { saveHomeMode(mode); } catch (e) { /* stockage refusé : valable pour cette session */ }
          home.setMode(mode);
        },
        tiles: tiles,
        onTiles: function (next: number) {
          tiles = next;
          try { saveHomeTiles(tiles); } catch (e) { /* stockage refusé : valable pour cette session */ }
          home.setTiles(tiles);
        },
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
  keyLatency();
  router.handleKey(k);
});

// Diagnostic caché (horodatages) : touche 0 de la télécommande (pavé numérique) ou du clavier.
// Sonde formats : touche 1 (ou pavé 1) pendant que le diagnostic est ouvert ; le diagnostic se referme, l'écran de la sonde le remplace.
document.addEventListener('keydown', function (e) {
  if (e.keyCode === 48 || e.keyCode === 96) { toggleDiag(); return; }
  if ((e.keyCode === 49 || e.keyCode === 97) && isDiagOpen()) {
    toggleDiag();
    router.pushLazy(plex, function (m) {
      return m.createProbePanel!({ nav: { push: function (p: Panel) { router.push(p); }, pop: function () { router.pop(); } } });
    });
  }
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
