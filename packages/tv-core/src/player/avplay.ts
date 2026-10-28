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
  // Appelé avant le stop/close déclenché par visibilitychange, avec la position à reprendre.
  onSuspend?: (positionMs: number, url: string) => void;
}

export interface PlayerOptions extends PlayerEvents {
  api?: any;      // webapis.avplay ; défaut : getWebapis().avplay
  doc?: { hidden: boolean; addEventListener: Function; removeEventListener: Function };
  jumpMs?: number; // saut des touches ±, défaut 10 000
}

export interface OpenOptions { rect?: Rect; startMs?: number; }

export interface Player {
  open(url: string, opts: OpenOptions, done: (err: Error | null) => void): void;
  play(): void;
  pause(): void;
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

  function api(): any { return o.api || getWebapis().avplay; }
  function fail(e: any): void { if (o.onError) o.onError(toError(e)); }
  function guard(fn: () => void): void { try { fn(); } catch (e) { fail(e); } }

  function listener(): any {
    return {
      onbufferingstart: function () { if (o.onBuffering) o.onBuffering(true, 0); },
      onbufferingprogress: function (p: number) { if (o.onBuffering) o.onBuffering(true, p); },
      onbufferingcomplete: function () { if (o.onBuffering) o.onBuffering(false, 100); },
      oncurrentplaytime: function (ms: number) { lastTime = ms; if (o.onTime) o.onTime(ms); },
      onstreamcompleted: function () { if (o.onEnd) o.onEnd(); },
      onerror: function (type: any) { fail(new Error('AVPlay : erreur de lecture ' + type)); },
      onsubtitlechange: function (duration: number, text: string) { if (o.onSubtitle) o.onSubtitle(text, duration); }
    };
  }

  function release(): void {
    if (!opened) return;
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
    seekTo: function (ms, done) {
      var target = Math.max(0, ms);
      try {
        api().seekTo(target, function () { lastTime = target; if (done) done(null); }, function (e: any) { if (done) done(toError(e)); else fail(e); });
      } catch (e) { if (done) done(toError(e)); else fail(e); }
    },
    forward: function () { var d = p.getDuration(); var t = p.getPosition() + jump; p.seekTo(d > 0 ? Math.min(t, d) : t); },
    rewind: function () { p.seekTo(p.getPosition() - jump); },
    stop: function () { guard(function () { api().stop(); }); },
    close: function () { release(); },
    getState: function () { try { return api().getState(); } catch (e) { return 'NONE'; } },
    getPosition: function () { try { return api().getCurrentTime(); } catch (e) { return lastTime; } },
    getDuration: function () { try { return api().getDuration(); } catch (e) { return 0; } },
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
