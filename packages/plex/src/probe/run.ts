import { ServerRef, Timers } from '../api/types';
import { directPlayUrl } from '../api/media';
import { assertPlexDirect } from '../playback/urls';
import { Player, PlayerOptions } from '../../../tv-core/src/player';
import { CATEGORIES, Sample } from './categories';

// ok : le temps de lecture avance ; fail : AVPlay refuse (code d'erreur) ; timeout : pas de réponse ou temps figé ; none : aucune fiche de cette catégorie.
export type ProbeStatus = 'ok' | 'fail' | 'timeout' | 'none';
export interface ProbeResult { id: string; label: string; status: ProbeStatus; code: string; ms: number; ratingKey: string; sample: string; }

export interface ProbeDeps {
  server: ServerRef;
  samples: { [category: string]: Sample };
  createPlayer: (o: PlayerOptions) => Player;
  timers: Timers;
  playMs?: number;      // durée de lecture observée, défaut 5000
  openMs?: number;      // délai max pour open → prepareAsync → play, défaut 15000
  minAdvanceMs?: number; // avance minimale du temps de lecture, défaut 1000
  onResult?: (r: ProbeResult, index: number, total: number) => void;
}

function codeOf(e: Error): string {
  return String(e && e.message ? e.message : e).replace(/^AVPlay : (erreur de lecture )?/, '');
}

// Essaie la lecture directe d'une fiche : open → prepareAsync → play ~5 s → le temps avance ? → stop/close.
// Lecture seule côté serveur : une simple URL de partie, jamais de /:/timeline ni de scrobble.
function probeOne(d: ProbeDeps, url: string, done: (status: ProbeStatus, code: string) => void): () => void {
  var T = d.timers, settled = false, timer: any = null, player: Player | null = null;
  var playMs = d.playMs === undefined ? 5000 : d.playMs, openMs = d.openMs === undefined ? 15000 : d.openMs;
  var minAdv = d.minAdvanceMs === undefined ? 1000 : d.minAdvanceMs;
  var firstPos = 0;
  function finish(status: ProbeStatus, code: string): void {
    if (settled) return;
    settled = true;
    if (timer !== null) T.clearTimeout(timer);
    var p = player;
    if (p) { try { p.destroy(); } catch (e) { /* déjà fermé */ } }
    done(status, code);
  }
  try {
    player = d.createPlayer({ onError: function (e) { finish('fail', codeOf(e)); } });
    player.open(url, {}, function (err) {
      if (settled) return;
      if (err) { finish('fail', codeOf(err)); return; }
      if (timer !== null) T.clearTimeout(timer);
      firstPos = player!.getPosition();
      timer = T.setTimeout(function () {
        var adv = player!.getPosition() - firstPos;
        if (adv >= minAdv) finish('ok', '+' + adv + ' ms');
        else finish('timeout', 'temps figé (+' + adv + ' ms)');
      }, playMs);
    });
  } catch (e) { finish('fail', codeOf(e as Error)); return function () { /* déjà terminé */ }; }
  if (!settled && timer === null) timer = T.setTimeout(function () { finish('timeout', 'pas de réponse en ' + openMs + ' ms'); }, openMs);
  return function () { settled = true; if (timer !== null) T.clearTimeout(timer); if (player) { try { player.destroy(); } catch (e) { /* déjà fermé */ } } };
}

// Une catégorie après l'autre : AVPlay n'a qu'une instance.
// Renvoie l'annulation (sortie de l'écran) : ferme le lecteur en cours, plus aucun rappel ensuite.
export function runProbe(d: ProbeDeps, done: (results: ProbeResult[]) => void): () => void {
  var results: ProbeResult[] = [], i = 0, stopped = false, abort: (() => void) | null = null;
  function next(): void {
    if (stopped) return;
    if (i >= CATEGORIES.length) { done(results); return; }
    var cat = CATEGORIES[i], s = d.samples[cat.id], idx = i++;
    function push(status: ProbeStatus, code: string, t0: number): void {
      var r: ProbeResult = {
        id: cat.id, label: cat.label, status: status, code: code, ms: d.timers.now() - t0,
        ratingKey: s ? s.ratingKey : '', sample: s ? [s.container, s.vcodec, s.acodec].join('/') : ''
      };
      results.push(r);
      if (d.onResult) d.onResult(r, idx, CATEGORIES.length);
      next();
    }
    var t0 = d.timers.now();
    if (!s) { push('none', 'aucune fiche', t0); return; }
    var url: string;
    try { assertPlexDirect(d.server); url = directPlayUrl(d.server, s.part); } catch (e) { push('fail', codeOf(e as Error), t0); return; }
    abort = probeOne(d, url, function (status, code) { abort = null; push(status, code, t0); });
  }
  next();
  return function () { stopped = true; if (abort) abort(); };
}
