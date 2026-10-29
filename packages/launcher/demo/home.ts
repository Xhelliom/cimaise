// Démo de l'aperçu navigateur : accueil Dock v2 branché au routeur ; Réglages ouvert à la demande.
// Sans TV, « lancer » une app échoue avec la DeviceError NO_TIZEN (affichée dans le HUD) : aucun succès simulé.
import { Router, normalizeKey, lazy } from '../../tv-core/src/index';
import { createHome } from '../src/home/index';
import { AppEntry, DiscoveredApp } from '../src/settings/model';
import { CatalogEntry } from '../src/catalog/model';

var hud = document.getElementById('hud')!;
var catalog: CatalogEntry[] = [
  { id: 'cimaise.plex', name: 'Plex intégré', color: '#e5a00d', type: 'interne' },
  { id: 'fake.plex-officiel', name: 'Plex', color: '#5a5a5f', type: 'tv' },
  { id: 'fake.netflix', name: 'Netflix', color: '#e50914', type: 'tv' },
  { id: 'fake.youtube', name: 'YouTube', color: '#c4302b', type: 'tv' },
  { id: 'disney', name: 'Disney+', color: '#113ccf', type: 'tv' },
  { id: 'canal', name: 'Canal+', color: '#5a5a5f', type: 'tv' },
  { id: 'prime', name: 'Prime Video', color: '#1f8a5b', type: 'tv' },
  { id: 'arte', name: 'Arte', color: '#d6336c', type: 'tv' }
];

var router = new Router({ root: document.getElementById('root')!, exit: function () { hud.textContent = 'sortie confirmée'; } });
var settings = lazy<typeof import('../src/settings/index')>(function (done) { done(require('../src/settings/index')); });
var plex = lazy<{ panel: () => { el: HTMLElement } }>(function (done) {
  done({ panel: function () { var d = document.createElement('div'); d.className = 'home'; d.textContent = 'Module Plex (démo)'; d.style.padding = '120px'; return { el: d }; } });
});

var home = createHome({
  catalog: catalog,
  openInternal: function () { router.pushLazy(plex, function (m) { return m.panel(); }); },
  onError: function (e) { hud.textContent = e.message; },
  onPastille: function (name) {
    if (name !== 'reglages') { hud.textContent = 'pastille ' + name + ' : non branchée dans la démo'; return; }
    router.pushLazy(settings, function (m) {
      return m.createSettings({
        catalog: catalog.map(function (c) { return { id: c.id, name: c.name, icon: c.icon, tint: c.color }; }),
        listInstalledApps: function (_ok: (a: DiscoveredApp[]) => void, fail: (e: Error) => void) { fail(new Error('Découverte : pas de TV dans l’aperçu')); },
        onChange: function (c: AppEntry[]) {
          catalog = c.map(function (a) { return { id: a.id, name: a.name, icon: a.icon, color: a.tint, type: a.id === 'cimaise.plex' ? 'interne' : 'tv' } as CatalogEntry; });
          home.setCatalog(catalog);
        },
        onClose: function () { router.pop(); }
      });
    });
  }
});
router.push(home);

// Latence touche → focus : de keydown à l'image suivante (requestAnimationFrame), médiane des 20 dernières.
var lat: number[] = [];
document.addEventListener('keydown', function (e) {
  var k = normalizeKey(e);
  if (!k) return;
  var t0 = performance.now();
  if (router.handleKey(k)) e.preventDefault();
  var t1 = performance.now();
  requestAnimationFrame(function () {
    lat.push(performance.now() - t0);
    if (lat.length > 20) lat.shift();
    var s = lat.slice(0).sort(function (a, b) { return a - b; });
    hud.textContent = 'touche→image : ' + (performance.now() - t0).toFixed(1) + ' ms (médiane ' + s[Math.floor(s.length / 2)].toFixed(1) + ', JS ' + (t1 - t0).toFixed(1) + ')';
  });
});
