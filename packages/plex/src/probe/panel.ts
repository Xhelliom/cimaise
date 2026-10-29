import { Panel } from '../../../tv-core/src/router/router';
import { createPlayer } from '../../../tv-core/src/player';
import { xhrHttp } from '../api/xhr';
import { el, identityOf, PlexArg, realTimers, storedSession } from '../ui/context';
import { CATEGORIES } from './categories';
import { findSamples } from './discover';
import { runProbe, ProbeResult } from './run';
import { compact, saveProbe } from './report';

var SHORT: { [s: string]: string } = { ok: 'OK', fail: 'ÉCHEC', timeout: 'DÉLAI', none: 'aucune fiche' };

// Écran caché « Sonde formats » (diagnostic, touche 0 puis 1) : essaie seul la lecture directe d'un échantillon par catégorie,
// affiche le tableau, le range en JSON dans localStorage (cimaise.probe.v1) et en ligne compacte pour une photo.
// Aucune écriture serveur : que des GET et des lectures d'URL de partie, jamais de timeline.
export function createProbePanel(arg: PlexArg): Panel {
  var doc = arg.doc || document;
  var timers = arg.timers || realTimers();
  var root = el(doc, 'plex-panel plex-probe');
  var title = el(doc, 'plex-probe-title', 'Sonde formats');
  var status = el(doc, 'plex-probe-status', 'Recherche des fiches…');
  var table = el(doc, 'plex-probe-table');
  var summary = el(doc, 'plex-probe-compact');
  root.appendChild(title); root.appendChild(status); root.appendChild(table); root.appendChild(summary);

  var rows: { [id: string]: HTMLElement } = {};
  for (var i = 0; i < CATEGORIES.length; i++) {
    rows[CATEGORIES[i].id] = el(doc, 'plex-probe-row', CATEGORIES[i].label + ' · …');
    table.appendChild(rows[CATEGORIES[i].id]);
  }
  function paint(r: ProbeResult): void {
    rows[r.id].textContent = r.label + ' · ' + SHORT[r.status] + (r.status === 'none' ? '' : ' · ' + r.code) + (r.sample ? ' · ' + r.sample : '');
    rows[r.id].className = 'plex-probe-row ' + r.status;
  }

  var session = arg.session === undefined ? storedSession(arg.store) : arg.session;
  var cancel: (() => void) | null = null, dead = false;
  if (!session) status.textContent = 'Pas de session Plex : ouvrir Plex et se connecter d’abord.';
  else {
    var server = session;
    findSamples(arg.http || xhrHttp, identityOf(arg), server, function (err, samples) {
      if (dead) return;
      if (err || !samples) { status.textContent = 'Recherche impossible : ' + (err ? err.message : 'réponse vide'); return; }
      status.textContent = 'Lecture directe de chaque échantillon (~5 s)…';
      cancel = runProbe({
        server: server, samples: samples, timers: timers,
        createPlayer: arg.createPlayer || createPlayer,
        onResult: function (r, idx, total) { paint(r); status.textContent = 'Sonde ' + (idx + 1) + '/' + total; }
      }, function (results) {
        cancel = null;
        var saved = saveProbe(results, timers.now(), arg.store);
        status.textContent = 'Terminé' + (saved ? ' · exporté (cimaise.probe.v1)' : ' · export refusé par le stockage');
        summary.textContent = compact(results);
      });
    });
  }

  return {
    el: root,
    destroy: function () { dead = true; if (cancel) { cancel(); cancel = null; } }
  };
}
