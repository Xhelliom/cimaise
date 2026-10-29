// Démo de l'aperçu navigateur : accueil Dock v2 branché au routeur ; Réglages ouvert à la demande.
// Sans TV, « lancer » une app échoue avec la DeviceError NO_TIZEN (affichée dans le HUD) : aucun succès simulé.
import { Router, normalizeKey, lazy } from '../../tv-core/src/index';
import { createHome } from '../src/home/index';
import { AppEntry, DiscoveredApp } from '../src/settings/model';

var hud = document.getElementById('hud')!;
var catalog: AppEntry[] = [
  { id: 'cimaise.plex', name: 'Plex intégré', tint: '#e5a00d' },
  { id: 'fake.plex-officiel', name: 'Plex', tint: '#5a5a5f' },
  { id: 'fake.netflix', name: 'Netflix', tint: '#e50914' },
  { id: 'fake.youtube', name: 'YouTube', tint: '#c4302b' },
  { id: 'disney', name: 'Disney+', tint: '#113ccf' },
  { id: 'canal', name: 'Canal+', tint: '#5a5a5f' },
  { id: 'prime', name: 'Prime Video', tint: '#1f8a5b' },
  { id: 'arte', name: 'Arte', tint: '#d6336c' }
];

var router = new Router({ root: document.getElementById('root')!, exit: function () { hud.textContent = 'sortie confirmée'; } });
var settings = lazy<typeof import('../src/settings/index')>(function (done) { done(require('../src/settings/index')); });
var plex = lazy<{ panel: () => { el: HTMLElement } }>(function (done) {
  done({ panel: function () { var d = document.createElement('div'); d.className = 'home'; d.textContent = 'Module Plex (démo)'; d.style.padding = '120px'; return { el: d }; } });
});

var home = createHome({
  catalog: catalog,
  internal: { 'cimaise.plex': function () { router.pushLazy(plex, function (m) { return m.panel(); }); } },
  onError: function (e) { hud.textContent = e.message; },
  onPastille: function (name) {
    if (name !== 'reglages') { hud.textContent = 'pastille ' + name + ' : non branchée dans la démo'; return; }
    router.pushLazy(settings, function (m) {
      return m.createSettings({
        catalog: catalog,
        listInstalledApps: function (_ok: (a: DiscoveredApp[]) => void, fail: (e: Error) => void) { fail(new Error('Découverte : pas de TV dans l’aperçu')); },
        onChange: function (c: AppEntry[]) { catalog = c; home.setCatalog(c); },
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
