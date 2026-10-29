import { Http, Identity, ServerRef, Timers } from './api/types';
import { scrobble, sendTimeline } from './api/media';

// Remontée de la progression pendant la lecture (HANDOFF §5.1-7, §5.2). Aucune erreur réseau ne remonte à l'appelant :
// un échec est simplement retenté au tick suivant (le scrobble aussi, tant qu'il n'a pas réussi).
export var TICK_MS = 10000;
export var WATCHED_RATIO = 0.9;

export interface ProgressOptions {
  http: Http; id: Identity; session: ServerRef; timers: Timers;
  ratingKey: string;
  durationMs: number;
  getPosition: () => number;
  // Session du transcodeur en cours (null en lecture directe) : signalée au serveur dans la timeline.
  getTranscodeSession?: () => string | null;
  // Fin de lecture (arrêt ou fin de flux) : position retenue et vu ou non, pour rafraîchir les caches locaux.
  onFinish?: (positionMs: number, watched: boolean) => void;
}

export interface Progress {
  playing(): void;
  paused(): void;
  // `ended` : le flux est allé au bout. Sinon la position reste côté serveur pour « Reprendre ».
  stop(ended: boolean): void;
}

export function createProgress(o: ProgressOptions): Progress {
  var state: 'playing' | 'paused' | 'stopped' = 'paused';
  var timer: any = null;
  var scrobbled = false, scrobbling = false;

  function pos(): number {
    var t = 0;
    try { t = o.getPosition(); } catch (e) { t = 0; }
    return t > 0 ? t : 0;
  }
  function past(ms: number): boolean { return o.durationMs > 0 && ms / o.durationMs >= WATCHED_RATIO; }

  function send(s: 'playing' | 'paused' | 'stopped', ms: number): void {
    try {
      sendTimeline(o.http, o.id, o.session, { ratingKey: o.ratingKey, state: s, timeMs: ms, durationMs: o.durationMs, transcodeSession: (o.getTranscodeSession && o.getTranscodeSession()) || undefined }, function () { /* retenté au tick suivant */ });
    } catch (e) { /* transport en panne : la lecture continue */ }
  }
  function markWatched(): void {
    if (scrobbled || scrobbling) return;
    scrobbling = true;
    try {
      scrobble(o.http, o.id, o.session, o.ratingKey, function (err) { scrobbling = false; if (!err) scrobbled = true; });
    } catch (e) { scrobbling = false; }
  }

  function clear(): void { if (timer !== null) { o.timers.clearTimeout(timer); timer = null; } }
  function schedule(): void {
    clear();
    timer = o.timers.setTimeout(function () {
      timer = null;
      var ms = pos();
      send(state === 'stopped' ? 'paused' : state, ms);
      if (past(ms)) markWatched();
      schedule();
    }, TICK_MS);
  }

  function change(s: 'playing' | 'paused'): void {
    if (state === 'stopped') return;
    state = s;
    var ms = pos();
    send(s, ms);
    if (past(ms)) markWatched();
    schedule();
  }

  return {
    playing: function () { change('playing'); },
    paused: function () { change('paused'); },
    stop: function (ended) {
      if (state === 'stopped') return;
      state = 'stopped';
      clear();
      var ms = ended && o.durationMs > 0 ? o.durationMs : pos();
      var watched = ended || past(ms);
      send('stopped', ms);
      if (watched) markWatched();
      if (o.onFinish) o.onFinish(ms, watched);
    }
  };
}
