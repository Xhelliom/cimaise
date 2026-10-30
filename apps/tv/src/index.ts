// App cimaise : accueil Dock v2 alimenté par le catalogue persistant ; Plex et réglages sont des chunks
// (plex.js, settings.js) injectés à la première ouverture. Démarrage en deux temps : horloge + tuiles d'abord,
// puis, après la 1re peinture, police décorative, teinte, logos et touches média. Marques de diagnostic : storageRead, catalogLoaded,
// homeBuilt, firstPaint (fin du script), interactive, painted (2 requestAnimationFrame plus tard), enriched.
import { loadStored, mark, toggleDiag, keyLatency, normalizeKey, isDiagOpen, hasTizen, registerKeys, REGISTER_KEYS, listInstalledApps, launchApp, hideApp } from '../../../packages/tv-core/src/index';
import { Router, lazy, chunkLoader, Panel } from '../../../packages/tv-core/src/index';
import { createHome, loadHomeMode, saveHomeMode, loadHomeTiles, saveHomeTiles, loadSmartHubTarget } from '../../../packages/launcher/src/home';
import { loadCatalog, saveCatalog, launchEntry } from '../../../packages/launcher/src/catalog';
import { MODULES, moduleEnabled, setModuleEnabled, visibleCatalog, mergeHidden, removedModules, ensureTile } from '../../../packages/launcher/src/modules';
import { xhrHttp, haConfigFromPrefs, listScenes, activateScene, quickScenes, normalizeChosen, saveHaConfig, saveHaScenes } from '../../../packages/widgets/src/index';

interface Chunk { createPanel(arg?: any): Panel; createProbePanel?(arg?: any): Panel; createSettingsPanel?(arg?: any): Panel; createOverseerrProbe?(): Panel; }

var router = new Router({ root: document.getElementById('root')! });
var plex = lazy<Chunk>(chunkLoader('plex'));
var settings = lazy<Chunk>(chunkLoader('settings'));

// Le stockage n'est lu qu'une fois (tv-core/storage) : la première lecture est la seule à payer l'accès disque.
loadStored(undefined, true);
mark('storageRead');
var catalog = loadCatalog(undefined, true);
var mode = loadHomeMode(undefined, true);
// Apps intégrées : le catalogue complet garde les tuiles des modules masqués (couleur ; remises en fin de catalogue) ; l'accueil ne reçoit que les visibles.
var modulePrefs = loadStored(undefined, true).prefs;
var tiles = loadHomeTiles(undefined, true);
mark('catalogLoaded');

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

// Scènes Home Assistant (rangée au-dessus du Dock) : chargées après la 1re peinture, jamais au démarrage ; injoignable ou
// non configuré = pas de rangée (quickScenes ne remonte pas d'erreur).
function refreshScenes(): void {
  if (!moduleEnabled('scenes', loadStored().prefs)) { home.setScenes([]); return; } // module masqué : aucune requête vers Home Assistant
  quickScenes(xhrHttp, loadStored().prefs, function (list) { home.setScenes(list); });
}

var home = createHome({
  deferRich: true,
  catalog: visibleCatalog(catalog, modulePrefs),
  mode: mode,
  tiles: tiles,
  openInternal: function (id) {
    if (id !== 'plex') { home.notify('Module inconnu : ' + id); return; }
    if (!moduleEnabled('plex', loadStored().prefs)) { home.notify('Plex intégré est masqué (Réglages > Apps intégrées)'); return; }
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
  onScene: function (id, done) {
    activateScene(xhrHttp, haConfigFromPrefs(loadStored().prefs), id, function (err) { done(err); });
  },
  // Lancement impossible (pas d'ID relevé, hors TV…) : l'accueil affiche lui-même un message ; le diagnostic reste à la touche 0.
  onPastille: function (name) {
    if (name === 'smarthub') { openSmartHub(); return; }
    var scenesDirty = false;
    router.pushLazy(settings, function (m) {
      var prefs = loadStored().prefs;
      return m.createPanel({
        catalog: visibleCatalog(catalog, prefs),
        modules: MODULES.map(function (d) { return { id: d.id, name: d.name, enabled: moduleEnabled(d.id, prefs), hasSettings: true }; }),
        onModule: function (id: string, on: boolean) {
          try { setModuleEnabled(id, on); } catch (e) { /* stockage refusé : l'état ne change pas */ }
          if (on) catalog = ensureTile(catalog, id);
          try { saveCatalog(catalog); } catch (e) { /* stockage plein ou refusé */ }
          var vis = visibleCatalog(catalog, loadStored().prefs);
          home.setCatalog(vis);
          if (id === 'scenes') scenesDirty = true; // la rangée suit l'interrupteur à la fermeture, sans minuterie
          return vis;
        },
        // Réglages propres d'un module : Scènes s'ouvre dans les Réglages ; ceux de Plex (langues) sont servis par le chunk settings.js : plex.js n'est jamais chargé s'il est masqué.
        onModuleSettings: function (id: string) {
          if (id !== 'plex') return;
          router.pushLazy(settings, function (m) {
            return m.createSettingsPanel!({});
          });
        },
        ha: {
          url: typeof prefs.haUrl === 'string' ? prefs.haUrl : '',
          token: typeof prefs.haToken === 'string' ? prefs.haToken : '',
          chosen: normalizeChosen(prefs.haScenes),
          onConfig: function (url: string, token: string) {
            scenesDirty = true;
            try { saveHaConfig(url, token); } catch (e) { /* stockage refusé : valable pour cette session */ }
          },
          onChosen: function (ids: string[]) {
            scenesDirty = true;
            try { saveHaScenes(ids); } catch (e) { /* stockage refusé : valable pour cette session */ }
          },
          listScenes: function (cb: (err: Error | null, scenes?: any) => void) { listScenes(xhrHttp, haConfigFromPrefs(loadStored().prefs), cb); }
        },
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
          // Retirer la tuile d'un module revient à le masquer : l'entrée reste au catalogue, rangée avec les masquées.
          var gone = removedModules(visibleCatalog(catalog, loadStored().prefs), next);
          for (var g = 0; g < gone.length; g++) { try { setModuleEnabled(gone[g], false); } catch (e) { /* stockage refusé */ } }
          var now = loadStored().prefs;
          catalog = mergeHidden(catalog, next, now);
          try { saveCatalog(catalog); } catch (e) { /* stockage plein ou refusé : le catalogue reste valable pour cette session */ }
          home.setCatalog(visibleCatalog(catalog, now));
        },
        onClose: function () {
          router.pop();
          if (scenesDirty) { scenesDirty = false; refreshScenes(); } // la rangée suit les choix, sans minuterie
        }
      });
    });
  }
});
router.push(home);
mark('homeBuilt');

document.addEventListener('keydown', function (e) {
  var k = normalizeKey(e);
  if (k === null) return;
  keyLatency();
  router.handleKey(k);
});

// Diagnostic caché (horodatages) : touche 0 de la télécommande (pavé numérique) ou du clavier.
// Sonde formats : touche 1 (ou pavé 1) pendant que le diagnostic est ouvert ; le diagnostic se referme, l'écran de la sonde le remplace.
// Sonde Overseerr : touche 2, même principe (servie par le chunk settings.js, rien au démarrage).
// Seul 0 est enregistré au démarrage : 1 et 2 le sont à l'ouverture du diagnostic, sinon la TV ne les livre pas.
document.addEventListener('keydown', function (e) {
  var tag = e.target && (e.target as HTMLElement).tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return; // saisie en cours (adresse, jeton) : les chiffres sont du texte
  if (e.keyCode === 48 || e.keyCode === 96) {
    toggleDiag();
    if (isDiagOpen() && hasTizen()) { try { registerKeys(['1', '2']); } catch (err) { /* déjà signalé */ } }
    return;
  }
  if ((e.keyCode === 49 || e.keyCode === 97) && isDiagOpen() && moduleEnabled('plex', loadStored().prefs)) { // sonde du module Plex : jamais chargée s'il est masqué
    toggleDiag();
    router.pushLazy(plex, function (m) {
      return m.createProbePanel!({ nav: { push: function (p: Panel) { router.push(p); }, pop: function () { router.pop(); } } });
    });
    return;
  }
  if ((e.keyCode === 50 || e.keyCode === 98) && isDiagOpen()) {
    toggleDiag();
    router.pushLazy(settings, function (m) { return m.createOverseerrProbe!(); });
  }
});

mark('firstPaint');
mark('interactive');

// Après la 1re peinture (2 rAF ; sans rAF, un setTimeout 0) : police décorative, teinte, logos, touches média.
function afterPaint(fn: () => void): void {
  if (typeof requestAnimationFrame === 'undefined') { setTimeout(fn, 0); return; }
  requestAnimationFrame(function () { requestAnimationFrame(function () { setTimeout(fn, 0); }); });
}
afterPaint(function () {
  mark('painted');
  document.body.className = 'late';
  home.enrich();
  mark('enriched');
  refreshScenes();
  // Sans TV (aperçu), l'appel lève en signalant l'absence de TV ; l'accueil reste fonctionnel.
  if (hasTizen()) {
    try { registerKeys(REGISTER_KEYS); } catch (e) { /* l'erreur est déjà signalée (console + bandeau) */ }
  }
});
