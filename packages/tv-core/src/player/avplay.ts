// Wrapper typé de webapis.avplay : seul point d'appel à AVPlay (HANDOFF §5.4).
// Rappels `(err)` plutôt que Promise (cible ES5 sans polyfill). L'API réelle vient de
// getWebapis() ; les tests injectent une fausse API via `opts.api`.
import { getWebapis } from '../device';

export type PlayerState = 'NONE' | 'IDLE' | 'READY' | 'PLAYING' | 'PAUSED';
export type TrackKind = 'audio' | 'text';

export interface Track { kind: TrackKind; index: number; info: { [k: string]: any }; }
export interface Rect { x: number; y: number; w: number; h: number; }

export interface PlayerEvents {
  onBuffering?: (buffering: boolean, percent: number) => void;
  onTime?: (ms: number) => void;
  onEnd?: () => void;
  onError?: (err: Error) => void;
  onSubtitle?: (text: string, durationMs: number) => void;
  // Sous-titre externe refusé par AVPlay : la lecture continue sans (distinct de onError, fatal).
  onSubtitleError?: (err: Error) => void;
  // Position visée par une rafale d'appuis ±, en attente d'application ; null quand le seek est parti ou abandonné.
  onSeekPending?: (targetMs: number | null) => void;
  // Un seek échoué n'arrête pas la lecture : on reste où on est (distinct de onError, fatal).
  onSeekError?: (err: Error) => void;
  // Transcodage HLS : saut hors de ce que la session a déjà produit ; la page relance la session à cette position (temps du film).
  onFarSeek?: (targetMs: number) => void;
  // Appelé avant le stop/close déclenché par visibilitychange, avec la position à reprendre.
  onSuspend?: (positionMs: number, url: string) => void;
}

export interface PlayerOptions extends PlayerEvents {
  api?: any;      // webapis.avplay ; défaut : getWebapis().avplay
  doc?: { hidden: boolean; addEventListener: Function; removeEventListener: Function };
  jumpMs?: number; // pas de base des touches ±, défaut 10 000
  settleMs?: number; // silence après le dernier appui avant d'appliquer le seek, défaut 400
  timers?: { setTimeout(fn: () => void, ms: number): any; clearTimeout(id: any): void };
}

// subtitleUrl : fichier de sous-titres externe (SRT à côté de la vidéo), posé avant prepareAsync (setExternalSubtitlePath).
export interface OpenOptions { rect?: Rect; startMs?: number; subtitleUrl?: string; }

export interface Player {
  open(url: string, opts: OpenOptions, done: (err: Error | null) => void): void;
  play(): void;
  pause(): void;
  // Transcodage : la session démarre à offsetMs du film (AVPlay compte depuis 0) ; totalMs = durée du film. Positions, durée et seeks passent en temps du film.
  // null : lecture directe. À appeler avant open().
  setTranscode(offsetMs: number | null, totalMs?: number): void;
  seekTo(ms: number, done?: (err: Error | null) => void): void;
  forward(): void;
  rewind(): void;
  stop(): void;
  close(): void;
  getState(): PlayerState;
  getPosition(): number;
  getDuration(): number;
  getTracks(): Track[];
  selectTrack(kind: TrackKind, index: number): void;
  setSubtitlesVisible(visible: boolean): void;
  destroy(): void;
}

// Au-delà de cette avance sur la position courante (pas sur ce qui est réellement transcodé, inconnu d'AVPlay), un saut en transcodage relance la session (le transcodeur n'a pas encore produit ces segments).
var AHEAD_MS = 30000;

function toError(e: any): Error {
  if (e instanceof Error) return e;
  var msg = e && e.message ? e.message : String(e);
  return new Error('AVPlay : ' + msg);
}

function parseInfo(raw: any): { [k: string]: any } {
  if (typeof raw !== 'string') return raw || {};
  try { return JSON.parse(raw); } catch (e) { return { raw: raw }; }
}

export function createPlayer(opts?: PlayerOptions): Player {
  var o: PlayerOptions = opts || {};
  var jump = o.jumpMs || 10000;
  var doc: any = o.doc || (typeof document !== 'undefined' ? document : null);
  var url = '';
  var opened = false;
  var lastTime = 0;
  var off = 0, total = 0, transcoded = false; // session de transcodage : décalage et durée du film
  var settle = o.settleMs === undefined ? 400 : o.settleMs;
  var timers = o.timers || {
    setTimeout: function (fn: () => void, ms: number) { return setTimeout(fn, ms); },
    clearTimeout: function (id: any) { clearTimeout(id); }
  };
  // Rafale d'appuis ±, un seul seek en vol, au plus un seek en attente (le dernier gagne).
  var burst: { dir: number; count: number; target: number } | null = null;
  var burstTimer: any = null;
  var inflight: { target: number; fail(e: Error): void } | null = null;
  var seekErrReported = false; // erreur déjà remontée par le rappel d'un seek : l'onerror qui suit est avalé
  var queued: { target: number; dones: Array<(err: Error | null) => void> } | null = null;

  function api(): any { return o.api || getWebapis().avplay; }
  function fail(e: any): void { if (o.onError) o.onError(toError(e)); }
  function guard(fn: () => void): void { try { fn(); } catch (e) { fail(e); } }

  function listener(): any {
    return {
      onbufferingstart: function () { if (o.onBuffering) o.onBuffering(true, 0); },
      onbufferingprogress: function (p: number) { if (o.onBuffering) o.onBuffering(true, p); },
      onbufferingcomplete: function () { if (o.onBuffering) o.onBuffering(false, 100); },
      oncurrentplaytime: function (ms: number) { lastTime = ms; if (o.onTime) o.onTime(ms + off); },
      onstreamcompleted: function () { if (o.onEnd) o.onEnd(); },
      onerror: function (type: any) {
        // PLAYER_ERROR_SEEK_FAILED : le flux continue, seul le seek a échoué.
        // Jamais fatal, quel que soit l'état : déjà signalé par le rappel d'erreur du seek → avalé (il peut arriver
        // après que le seek suivant est parti) ; sinon il appartient au seek en vol, ou à défaut est signalé tel quel.
        if (String(type).indexOf('SEEK') >= 0) {
          var err = new Error('AVPlay : erreur de lecture ' + type);
          if (seekErrReported) seekErrReported = false;
          else if (inflight) inflight.fail(err);
          else if (o.onSeekError) o.onSeekError(err);
          return;
        }
        fail(new Error('AVPlay : erreur de lecture ' + type));
      },
      onsubtitlechange: function (duration: number, text: string) { if (o.onSubtitle) o.onSubtitle(text, duration); }
    };
  }

  function bound(ms: number): number {
    var d = 0;
    try { d = transcoded && total > 0 ? total : api().getDuration(); } catch (e) { d = 0; }
    var max = d > 5000 ? d - 5000 : 0;
    return Math.max(0, d > 0 ? Math.min(ms, max) : ms);
  }
  function drain(): void {
    if (inflight || !queued) return;
    var q = queued;
    queued = null;
    startSeek(q.target, function (err) { for (var i = 0; i < q.dones.length; i++) q.dones[i](err); }, q.dones.length > 0);
  }
  function startSeek(target: number, done: ((err: Error | null) => void) | undefined, hasDone: boolean): void {
    var settled = false;
    var mine = { target: target, fail: function (e: Error) { end(e); } };
    inflight = mine;
    function end(err: Error | null): void {
      if (settled || inflight !== mine) return;
      settled = true;
      inflight = null;
      if (!err) lastTime = target - off; else seekErrReported = true;
      if (done && hasDone) done(err); else if (err && o.onSeekError) o.onSeekError(err);
      drain();
    }
    try {
      api().seekTo(target - off, function () { end(null); }, function (e: any) { end(toError(e)); });
    } catch (e) { end(toError(e)); }
  }
  function requestSeek(ms: number, done?: (err: Error | null) => void): void {
    var target = bound(ms);
    if (transcoded && o.onFarSeek && (target < off || target > p.getPosition() + AHEAD_MS)) {
      resetSeek();
      o.onFarSeek(target);
      if (done) done(null);
      return;
    }
    if (inflight) {
      if (!queued) queued = { target: target, dones: [] };
      queued.target = target;
      if (done) queued.dones.push(done);
      return;
    }
    startSeek(target, done, !!done);
  }
  function stepFor(count: number): number { return count <= 3 ? jump : count <= 6 ? jump * 3 : jump * 6; }
  function press(dir: number): void {
    if (!opened) return;
    var base: number;
    if (burst) base = burst.target;
    else if (queued) base = queued.target;
    else if (inflight) base = inflight.target;
    else base = p.getPosition();
    if (!burst || burst.dir !== dir) burst = { dir: dir, count: 0, target: base };
    burst.count++;
    burst.target = bound(burst.target + dir * stepFor(burst.count));
    if (o.onSeekPending) o.onSeekPending(burst.target);
    if (burstTimer !== null) timers.clearTimeout(burstTimer);
    burstTimer = timers.setTimeout(function () {
      burstTimer = null;
      var t = burst!.target;
      burst = null;
      if (o.onSeekPending) o.onSeekPending(null);
      requestSeek(t);
    }, settle);
  }
  function resetSeek(): void {
    if (burstTimer !== null) { timers.clearTimeout(burstTimer); burstTimer = null; }
    burst = null; inflight = null; queued = null; seekErrReported = false;
  }

  function release(): void {
    if (!opened) return;
    resetSeek();
    opened = false;
    var a = api();
    try { a.stop(); } catch (e) { /* déjà arrêté */ }
    try { a.close(); } catch (e) { /* déjà fermé */ }
  }

  function onVisibility(): void {
    if (!doc || !doc.hidden || !opened) return;
    var pos = p.getPosition();
    if (o.onSuspend) o.onSuspend(pos, url);
    release();
  }
  if (doc) doc.addEventListener('visibilitychange', onVisibility);

  var p: Player = {
    open: function (u, oo, done) {
      var a: any;
      try {
        a = api();
        if (opened) release();
        url = u;
        lastTime = 0;
        a.open(u);
        opened = true;
        a.setListener(listener());
        var r = oo.rect || { x: 0, y: 0, w: 1920, h: 1080 };
        a.setDisplayRect(r.x, r.y, r.w, r.h);
        // AVPlay ne dessine jamais les sous-titres : il envoie le texte par onsubtitlechange, que la page affiche. Pas de setSilentSubtitle(true) ici
        // (il couperait ces événements) ; l'appelant l'active/coupe avec setSubtitlesVisible selon la piste choisie.
        if (oo.subtitleUrl) {
          try { a.setExternalSubtitlePath(oo.subtitleUrl); } catch (e) { if (o.onSubtitleError) o.onSubtitleError(toError(e)); }
        }
      } catch (e) {
        release();
        done(toError(e));
        return;
      }
      a.prepareAsync(function () {
        try {
          if (oo.startMs && oo.startMs > 0) {
            // seekTo exige l'état READY : reprise avant play
            a.seekTo(oo.startMs, function () { guard(function () { a.play(); }); done(null); }, function (e: any) { release(); done(toError(e)); });
            return;
          }
          a.play();
          done(null);
        } catch (e) {
          release();
          done(toError(e));
        }
      }, function (e: any) { release(); done(toError(e)); });
    },
    play: function () { guard(function () { api().play(); }); },
    pause: function () { guard(function () { api().pause(); }); },
    seekTo: function (ms, done) { requestSeek(ms, done); },
    forward: function () { press(1); },
    rewind: function () { press(-1); },
    stop: function () { guard(function () { api().stop(); }); },
    close: function () { release(); },
    getState: function () { try { return api().getState(); } catch (e) { return 'NONE'; } },
    getPosition: function () { try { return api().getCurrentTime() + off; } catch (e) { return lastTime + off; } },
    getDuration: function () { try { return transcoded && total > 0 ? total : api().getDuration(); } catch (e) { return 0; } },
    setTranscode: function (offsetMs, totalMs) { transcoded = offsetMs !== null; off = offsetMs || 0; total = totalMs || 0; },
    getTracks: function () {
      var out: Track[] = [];
      try {
        var list = api().getTotalTrackInfo() || [];
        for (var i = 0; i < list.length; i++) {
          var t = list[i];
          var kind: TrackKind | null = t.type === 'AUDIO' ? 'audio' : t.type === 'TEXT' ? 'text' : null;
          if (kind) out.push({ kind: kind, index: t.index, info: parseInfo(t.extra_info) });
        }
      } catch (e) { fail(e); }
      return out;
    },
    selectTrack: function (kind, index) {
      guard(function () { api().setSelectTrack(kind === 'audio' ? 'AUDIO' : 'TEXT', index); });
    },
    setSubtitlesVisible: function (visible) { guard(function () { api().setSilentSubtitle(!visible); }); },
    destroy: function () {
      if (doc) doc.removeEventListener('visibilitychange', onVisibility);
      release();
    }
  };
  return p;
}
