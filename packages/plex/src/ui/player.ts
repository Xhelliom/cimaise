import { Item, Part } from '../api/types';
import { directPlayUrl } from '../api/media';
import { getMetadata } from '../api/library';
import { xhrHttp } from '../api/xhr';
import { createProgress, Progress } from '../progress';
import { Panel } from '../../../tv-core/src/router/router';
import { Key } from '../../../tv-core/src/keys';
import { createPlayer, Player, Track } from '../../../tv-core/src/player';
import { Ctx, el, identityOf, PlexArg, realTimers, resolve } from './context';

var HIDE_MS = 3000;

function two(n: number): string { return (n < 10 ? '0' : '') + n; }
// hh:mm:ss, toujours avec les heures (« Reprendre à 00:51:22 »).
export function formatTime(ms: number): string {
  var s = Math.max(0, Math.floor(ms / 1000));
  return two(Math.floor(s / 3600)) + ':' + two(Math.floor(s / 60) % 60) + ':' + two(s % 60);
}

function trackLabel(t: Track): string {
  var lang = t.info.language || t.info.track_lang || t.info.lang;
  return (t.kind === 'audio' ? 'Audio' : 'Sous-titres') + ' · ' + (lang ? String(lang) : 'piste ' + t.index);
}

interface Choice { label: string; apply(): void; }
type Mode = 'loading' | 'resume' | 'play' | 'error';

// Écran lecteur (HANDOFF §5.4) : question de reprise, lecture directe par AVPlay (wrapper de tv-core), interface masquée
// au bout de 3 s, ±10 s, pistes, Retour = arrêt propre. Hors TV, le wrapper signale l'absence de webapis : aucune lecture simulée.
export function createPlayerPanel(arg: PlexArg, item: Item): Panel {
  var c = resolve(arg) as Ctx;
  var doc = c.doc;
  var timers = arg.timers || realTimers();
  var http = arg.http || xhrHttp;

  var root = el(doc, 'plex-player');
  var ui = el(doc, 'plex-pl-ui');
  var title = el(doc, 'plex-pl-title', item.title);
  var track = el(doc, 'plex-pl-track');
  var bar = el(doc, 'plex-pl-bar');
  var time = el(doc, 'plex-pl-time', '');
  var state = el(doc, 'plex-pl-state', '');
  var menu = el(doc, 'plex-pl-menu');
  var dialog = el(doc, 'plex-pl-dialog');
  var text = el(doc, 'plex-pl-text', 'Chargement…');
  var btns = el(doc, 'plex-pl-btns');
  track.appendChild(bar);
  ui.appendChild(title); ui.appendChild(track); ui.appendChild(time); ui.appendChild(state);
  dialog.appendChild(text); dialog.appendChild(btns);
  root.appendChild(ui); root.appendChild(menu); root.appendChild(dialog);

  var mode: Mode = 'loading';
  var closed = false;
  var player: Player | null = null;
  var progress: Progress | null = null;
  var full: Item = item;
  var part: Part | null = null;
  var durationMs = item.duration || 0;
  var paused = false, menuOpen = false;
  var suspendPos = -1;
  var hideTimer: any = null;
  var metaReq: { abort(): void } | null = null;
  var buttons: Array<{ label: string; run(): void }> = [];
  var at = 0;
  var choices: Choice[] = [], mi = 0;

  function setClass(node: HTMLElement, base: string, on: boolean): void { node.className = on ? base + ' on' : base; }

  function paintButtons(): void {
    while (btns.children.length) btns.removeChild(btns.children[0]);
    for (var i = 0; i < buttons.length; i++) btns.appendChild(el(doc, i === at ? 'plex-pl-btn focus' : 'plex-pl-btn', buttons[i].label));
  }
  function ask(message: string, list: Array<{ label: string; run(): void }>): void {
    text.textContent = message;
    buttons = list;
    at = 0;
    paintButtons();
    setClass(dialog, 'plex-pl-dialog', true);
  }

  function clearHide(): void { if (hideTimer !== null) { timers.clearTimeout(hideTimer); hideTimer = null; } }
  function show(): void {
    setClass(ui, 'plex-pl-ui', true);
    clearHide();
    if (mode === 'play' && !paused && !menuOpen) hideTimer = timers.setTimeout(function () { hideTimer = null; setClass(ui, 'plex-pl-ui', false); }, HIDE_MS);
  }

  function live(on: boolean): void {
    var d: any = doc;
    if (d.documentElement && d.documentElement.classList) {
      if (on) d.documentElement.classList.add('plex-live'); else d.documentElement.classList.remove('plex-live');
    }
    root.className = on ? 'plex-player live' : 'plex-player';
  }

  function cleanup(): void {
    closed = true;
    clearHide();
    if (metaReq) { metaReq.abort(); metaReq = null; }
    if (progress) progress.stop(false);
    if (player) player.destroy();
    live(false);
  }
  // Retour, touche stop, fin du flux ou suspension : arrêt propre puis retour à la fiche.
  function leave(ended: boolean): void {
    if (closed) return;
    if (progress) progress.stop(ended);
    cleanup();
    c.nav.pop();
  }

  function fail(err: Error): void {
    if (closed || mode === 'error') return;
    mode = 'error';
    menuOpen = false;
    setClass(menu, 'plex-pl-menu', false);
    if (progress) progress.stop(false);
    if (player) player.destroy();
    clearHide();
    live(false);
    setClass(ui, 'plex-pl-ui', false);
    var list: Array<{ label: string; run(): void }> = [];
    var official = arg.officialApp ? arg.officialApp() : null;
    if (official) {
      list.push({
        label: 'Ouvrir Plex officiel',
        run: function () {
          official!.open(function (e) { if (e) ask('Plex officiel n’a pas pu être lancé : ' + e.message, [{ label: 'Retour', run: function () { leave(false); } }]); });
        }
      });
    }
    list.push({ label: 'Retour', run: function () { leave(false); } });
    ask('Lecture impossible : ' + (err && err.message ? err.message : 'erreur inconnue'), list);
  }

  function start(startMs: number): void {
    if (closed) return;
    mode = 'loading';
    ask('Chargement…', []);
    var p = (arg.createPlayer || createPlayer)({
      doc: arg.doc as any,
      onTime: function (ms) {
        if (mode !== 'play') return;
        bar.style.transform = 'scaleX(' + (durationMs > 0 ? Math.min(1, ms / durationMs) : 0) + ')';
        time.textContent = formatTime(ms) + ' / ' + formatTime(durationMs);
      },
      onEnd: function () { leave(true); },
      onError: fail,
      onSuspend: function (pos) { suspendPos = pos; leave(false); }
    });
    player = p;
    progress = createProgress({
      http: http, id: identityOf(arg), session: c.session, timers: timers, ratingKey: full.ratingKey, durationMs: durationMs,
      getPosition: function () { return suspendPos >= 0 ? suspendPos : p.getPosition(); },
      onFinish: function (ms, watched) { c.data.progressed(full, ms, watched); }
    });
    p.open(directPlayUrl(c.session, part!.key), startMs > 0 ? { startMs: startMs } : {}, function (err) {
      if (closed || mode === 'error') return;
      if (err) { fail(err); return; }
      mode = 'play';
      setClass(dialog, 'plex-pl-dialog', false);
      time.textContent = formatTime(startMs) + ' / ' + formatTime(durationMs);
      bar.style.transform = 'scaleX(' + (durationMs > 0 ? Math.min(1, startMs / durationMs) : 0) + ')';
      live(true);
      progress!.playing();
      show();
    });
  }

  function begin(): void {
    var off = full.viewOffset || 0;
    if (off > 0) {
      mode = 'resume';
      ask(full.title, [
        { label: 'Reprendre à ' + formatTime(off), run: function () { start(off); } },
        { label: 'Depuis le début', run: function () { start(0); } }
      ]);
    } else start(0);
  }

  // Fiche à jour directement auprès du serveur (jamais le cache : la reprise vient peut-être d'un autre appareil).
  metaReq = getMetadata(http, identityOf(arg), c.session, item.ratingKey, function (err, v) {
    metaReq = null;
    if (closed) return;
    var m = v && v.Media && v.Media[0] && v.Media[0].Part && v.Media[0].Part![0];
    if (err || !v || !m) { fail(err || new Error('aucun fichier lisible pour ce titre')); return; }
    full = v;
    part = m;
    durationMs = v.duration || m.duration || durationMs;
    title.textContent = v.title;
    begin();
  }) || null;
  ask('Chargement…', []);

  function openMenu(): void {
    var tracks = player ? player.getTracks() : [];
    var out: Choice[] = [];
    var i: number;
    function pick(t: Track): Choice {
      return {
        label: trackLabel(t),
        apply: function () {
          if (t.kind === 'text') player!.setSubtitlesVisible(true);
          player!.selectTrack(t.kind, t.index);
        }
      };
    }
    for (i = 0; i < tracks.length; i++) if (tracks[i].kind === 'audio') out.push(pick(tracks[i]));
    out.push({ label: 'Sous-titres · Désactivés', apply: function () { player!.setSubtitlesVisible(false); } });
    for (i = 0; i < tracks.length; i++) if (tracks[i].kind === 'text') out.push(pick(tracks[i]));
    choices = out;
    mi = 0;
    menuOpen = true;
    paintMenu();
    setClass(menu, 'plex-pl-menu', true);
    show();
  }
  function paintMenu(): void {
    while (menu.children.length) menu.removeChild(menu.children[0]);
    for (var i = 0; i < choices.length; i++) menu.appendChild(el(doc, i === mi ? 'plex-pl-opt focus' : 'plex-pl-opt', choices[i].label));
  }
  function closeMenu(): void { menuOpen = false; setClass(menu, 'plex-pl-menu', false); show(); }

  function pause(): void { if (paused) return; paused = true; player!.pause(); progress!.paused(); state.textContent = 'Pause'; show(); }
  function resume(): void { if (!paused) return; paused = false; player!.play(); progress!.playing(); state.textContent = ''; show(); }

  function playKey(k: Key): boolean {
    if (menuOpen) {
      if (k === 'up') mi = Math.max(0, mi - 1);
      else if (k === 'down') mi = Math.min(choices.length - 1, mi + 1);
      else if (k === 'enter') { choices[mi].apply(); closeMenu(); return true; }
      else if (k === 'back') { closeMenu(); return true; }
      paintMenu();
      return true;
    }
    if (k === 'back' || k === 'stop') { leave(false); return true; }
    if (k === 'left' || k === 'rewind') { player!.rewind(); show(); return true; }
    if (k === 'right' || k === 'forward') { player!.forward(); show(); return true; }
    if (k === 'enter' || k === 'playpause') { if (paused) resume(); else pause(); return true; }
    if (k === 'pause') { pause(); return true; }
    if (k === 'play') { resume(); return true; }
    if (k === 'up') { openMenu(); return true; }
    show();
    return true;
  }

  return {
    el: root,
    onKey: function (k: Key): boolean {
      if (mode === 'play') return playKey(k);
      if (k === 'back') { leave(false); return true; }
      if (mode === 'loading' || !buttons.length) return true;
      if (k === 'left' || k === 'up') { at = Math.max(0, at - 1); paintButtons(); }
      else if (k === 'right' || k === 'down') { at = Math.min(buttons.length - 1, at + 1); paintButtons(); }
      else if (k === 'enter') buttons[at].run();
      return true;
    },
    destroy: cleanup
  };
}
