import { Item } from '../api/types';
import { decidePlayback, directPlaybackUrl, normalizeLang, PlaybackPlan, requestTranscode, subtitleUrl, trackEntries, TrackEntry } from '../playback';
import { getMetadata } from '../api/library';
import { xhrHttp } from '../api/xhr';
import { createProgress, Progress } from '../progress';
import { Panel } from '../../../tv-core/src/router/router';
import { Key } from '../../../tv-core/src/keys';
import { createPlayer, OpenOptions, Player, Track } from '../../../tv-core/src/player';
import { langPrefsFor, LangPrefs, rememberSeries } from '../../../tv-core/src/langprefs';
import { recordMeasure } from '../../../tv-core/src/diag';
import { Ctx, el, identityOf, PlexArg, realTimers, resolve } from './context';

var HIDE_MS = 3000;
var SUB_MS = 3000; // durée d'affichage d'un sous-titre dont AVPlay ne donne pas la durée

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

// Texte d'un événement AVPlay : balises HTML (<i>) et codes de style ASS/SSA ({\an8}) retirés, retours à la ligne gardés.
export function cleanSubtitle(text: string): string {
  return String(text || '').replace(/<[^>]*>/g, '').replace(/\{\\[^}]*\}/g, '').replace(/\\N/g, '\n').replace(/\r/g, '').replace(/^\s+|\s+$/g, '');
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
  var modeLine = el(doc, 'plex-pl-mode', '');
  var sub = el(doc, 'plex-pl-sub', '');
  var menu = el(doc, 'plex-pl-menu');
  var dialog = el(doc, 'plex-pl-dialog');
  var text = el(doc, 'plex-pl-text', 'Chargement…');
  var btns = el(doc, 'plex-pl-btns');
  track.appendChild(bar);
  ui.appendChild(title); ui.appendChild(track); ui.appendChild(time); ui.appendChild(state); ui.appendChild(modeLine);
  dialog.appendChild(text); dialog.appendChild(btns);
  root.appendChild(sub); root.appendChild(ui); root.appendChild(menu); root.appendChild(dialog);

  var mode: Mode = 'loading';
  var closed = false;
  var player: Player | null = null;
  var progress: Progress | null = null;
  var full: Item = item;
  var plan: PlaybackPlan | null = null;
  var durationMs = item.duration || 0;
  var paused = false, menuOpen = false;
  var suspendPos = -1;
  // Sous-titres rendus par la page (AVPlay n'est réveillé que pour une piste choisie) : subsOn = la piste choisie est lue par AVPlay (interne ou externe), pas incrustée.
  var extFailed = false, subsOn = false, subTimer: any = null, seriesKey = item.grandparentRatingKey;
  // Mesure (diagnostic) : Entrée sur Lire → première image (1er temps de lecture signalé par AVPlay). Avec la question de reprise, part du choix.
  var t0 = Date.now(), awaitFrame = false;
  var hideTimer: any = null;
  var metaReq: { abort(): void } | null = null;
  var buttons: Array<{ label: string; run(): void }> = [];
  var at = 0, resumeAsked = false;
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

  // AVPlay n'émet onsubtitlechange que s'il n'est pas silencieux : on le réveille seulement quand une piste est choisie.
  function setSubs(on: boolean): void {
    subsOn = on;
    if (player) player.setSubtitlesVisible(on);
  }
  function clearSub(): void {
    if (subTimer !== null) { timers.clearTimeout(subTimer); subTimer = null; }
    sub.textContent = '';
  }
  function showSub(text: string, durationMs: number): void {
    if (closed || !subsOn || mode !== 'play') return;
    var t = cleanSubtitle(text);
    if (subTimer !== null) { timers.clearTimeout(subTimer); subTimer = null; }
    sub.textContent = t;
    if (t) subTimer = timers.setTimeout(function () { subTimer = null; sub.textContent = ''; }, durationMs > 0 ? durationMs : SUB_MS);
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
    clearSub();
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
    clearSub();
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
    if (resumeAsked) t0 = Date.now();
    awaitFrame = true;
    var p = (arg.createPlayer || createPlayer)({
      doc: arg.doc as any,
      onTime: function (ms) {
        if (awaitFrame && mode === 'play') { awaitFrame = false; recordMeasure('lecture', Date.now() - t0); }
        if (mode !== 'play') return;
        bar.style.transform = 'scaleX(' + (durationMs > 0 ? Math.min(1, ms / durationMs) : 0) + ')';
        time.textContent = formatTime(ms) + ' / ' + formatTime(durationMs);
      },
      timers: timers,
      // Rafale d'appuis ± : la barre montre la position visée, le seek part à l'arrêt de la rafale.
      onSeekPending: function (ms) {
        if (closed || mode !== 'play') return;
        if (ms === null) { state.textContent = paused ? 'Pause' : ''; return; }
        bar.style.transform = 'scaleX(' + (durationMs > 0 ? Math.min(1, ms / durationMs) : 0) + ')';
        time.textContent = formatTime(ms) + ' / ' + formatTime(durationMs);
        state.textContent = '→ ' + formatTime(ms);
        show();
      },
      onSeekError: function () {
        if (closed || mode !== 'play') return;
        state.textContent = 'Déplacement impossible';
        show();
      },
      onSubtitle: showSub,
      onSubtitleError: function () {
        if (closed) return;
        extFailed = true; // refus synchrone pendant open() : signalé une fois la lecture lancée (applyTracks)
        if (mode !== 'play') return;
        setSubs(false);
        clearSub();
        state.textContent = 'Sous-titres indisponibles';
        show();
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
    launch(startMs);
  }

  // Ouvre le flux du plan courant (direct ou transcodé) dans le lecteur déjà créé ; sert aussi à relancer après un changement de piste.
  function launch(startMs: number): void {
    var p = player!;
    function opened(url: string): void {
      var oo: OpenOptions = {};
      extFailed = false;
      if (startMs > 0) oo.startMs = startMs;
      try {
        var su = subtitleUrl(c.session, plan!);
        if (su) oo.subtitleUrl = su;
      } catch (e) { fail(e as Error); return; }
      p.open(url, oo, function (err) {
        if (closed || mode === 'error') return;
        if (err) { fail(err); return; }
        mode = 'play';
        setClass(dialog, 'plex-pl-dialog', false);
        time.textContent = formatTime(startMs) + ' / ' + formatTime(durationMs);
        bar.style.transform = 'scaleX(' + (durationMs > 0 ? Math.min(1, startMs / durationMs) : 0) + ')';
        modeLine.textContent = plan!.reason;
        applyTracks(p, true, true);
        live(true);
        progress!.playing();
        show();
      });
    }
    if (plan!.mode === 'direct') {
      var url: string;
      try { url = directPlaybackUrl(c.session, plan!); } catch (e) { fail(e as Error); return; }
      opened(url);
    } else {
      metaReq = requestTranscode(http, identityOf(arg), c.session, plan!, identityOf(arg).clientId, function (err, r) {
        metaReq = null;
        if (closed || mode === 'error') return;
        if (err || !r) { fail(err || new Error('transcodage impossible')); return; }
        opened(r.url);
      });
    }
  }

  // Pistes du plan, appliquées une fois le flux préparé (ou en place après un changement de piste). Le n-ième flux interne d'un type est
  // la n-ième piste AVPlay de ce type (les index d'AVPlay ne sont pas ceux de Plex). Transcodé, le flux porte déjà l'audio choisi et les
  // sous-titres incrustés. Les sous-titres d'une piste externe sont, d'après la doc, ajoutés après les pistes internes : on prend la dernière.
  function applyTracks(p: Player, doAudio: boolean, doSub: boolean): void {
    if (plan!.mode !== 'direct') { if (doSub) { setSubs(false); clearSub(); } return; }
    var streams = plan!.part.Stream || [], tracks = p.getTracks();
    function avplayTrack(kind: 'audio' | 'text', type: number, wanted: { id: number } | null): Track | null {
      if (!wanted) return null;
      var rank = 0, i: number;
      for (i = 0; i < streams.length && streams[i].id !== wanted.id; i++) if (streams[i].streamType === type && !streams[i].key) rank++;
      for (i = 0; i < tracks.length; i++) if (tracks[i].kind === kind && rank-- === 0) return tracks[i];
      return null;
    }
    if (doAudio) {
      var a = avplayTrack('audio', 2, plan!.audio);
      if (a) p.selectTrack('audio', a.index);
    }
    if (!doSub) return;
    clearSub();
    var t: Track | null = null;
    if (plan!.subtitleMode === 'external' && extFailed) {
      setSubs(false);
      state.textContent = 'Sous-titres indisponibles';
      return;
    }
    if (plan!.subtitleMode === 'embedded') t = avplayTrack('text', 3, plan!.subtitle);
    else if (plan!.subtitleMode === 'external') {
      for (var i = tracks.length - 1; i >= 0 && !t; i--) if (tracks[i].kind === 'text') t = tracks[i];
    }
    if (t) p.selectTrack('text', t.index);
    setSubs(!!t);
  }

  function prefs(): LangPrefs { return langPrefsFor(seriesKey, arg.store); }

  function begin(): void {
    var off = full.viewOffset || 0;
    if (off > 0) {
      mode = 'resume';
      resumeAsked = true;
      ask(full.title, [
        { label: 'Reprendre à ' + formatTime(off), run: function () { start(off); } },
        { label: 'Depuis le début', run: function () { start(0); } }
      ]);
    } else start(0);
  }

  // Fiche à jour directement auprès du serveur (jamais le cache : la reprise vient peut-être d'un autre appareil).
  metaReq = item.type === 'show' || item.type === 'season' ? null : getMetadata(http, identityOf(arg), c.session, item.ratingKey, function (err, v) {
    metaReq = null;
    if (closed) return;
    var m = v && v.Media && v.Media[0] && v.Media[0].Part && v.Media[0].Part![0];
    if (err || !v || !m) { fail(err || new Error('aucun fichier lisible pour ce titre')); return; }
    seriesKey = v.grandparentRatingKey || item.grandparentRatingKey;
    try { plan = decidePlayback(v, prefs()); } catch (e) { fail(e as Error); return; }
    full = v;
    durationMs = v.duration || plan.part.duration || durationMs;
    title.textContent = v.title;
    begin();
  }) || null;
  // Une série ou une saison n'a pas de fichier : la fiche doit passer un épisode ou un film.
  if (item.type === 'show' || item.type === 'season') fail(new Error('une ' + (item.type === 'show' ? 'série' : 'saison') + ' ne se lit pas : choisir un épisode'));
  else ask('Chargement…', []);

  // Choix d'une piste dans le menu : nouvelle décision avec les deux pistes explicites. Lecture directe → directe sans fichier externe :
  // en place (setSelectTrack). Sinon (transcodage, sous-titre externe, autre mode) : le flux est relancé à la position courante.
  // Le choix est retenu pour la série (par langue : les identifiants de piste changent d'un épisode à l'autre).
  function choose(e: TrackEntry): void {
    var p = player!, cur = plan!, g = prefs();
    var next: PlaybackPlan;
    try {
      next = decidePlayback(full, {
        audioLang: g.audioLang, subLang: g.subLang,
        audioId: e.kind === 'audio' ? e.id! : cur.audio ? cur.audio.id : undefined,
        subtitleId: e.kind === 'subtitle' ? e.id : cur.subtitle ? cur.subtitle.id : null
      });
    } catch (err) { fail(err as Error); return; }
    if (seriesKey) {
      try {
        if (e.kind === 'audio') { var al = normalizeLang(e.stream ? e.stream.languageCode : ''); if (al) rememberSeries(seriesKey, { audioLang: al }, arg.store); }
        else rememberSeries(seriesKey, { subLang: e.stream && !e.stream.forced ? normalizeLang(e.stream.languageCode) : '' }, arg.store);
      } catch (err) { /* stockage refusé : le choix vaut pour cet épisode */ }
    }
    plan = next;
    if (cur.mode === 'direct' && next.mode === 'direct' && next.mediaIndex === cur.mediaIndex && cur.subtitleMode !== 'external' && next.subtitleMode !== 'external') {
      applyTracks(p, e.kind === 'audio', e.kind === 'subtitle');
      modeLine.textContent = next.reason;
      return;
    }
    var pos = p.getPosition();
    clearSub();
    subsOn = false;
    progress!.paused();
    mode = 'loading';
    awaitFrame = false;
    live(false);
    setClass(ui, 'plex-pl-ui', false);
    ask('Chargement…', []);
    launch(pos);
  }

  function openMenu(): void {
    var out: Choice[] = [];
    var i: number;
    var entries = plan && plan.part.Stream && plan.part.Stream.length ? trackEntries(plan) : [];
    if (entries.length) {
      var pickEntry = function (e: TrackEntry): Choice {
        return { label: (e.current ? '● ' : '') + e.label, apply: function () { choose(e); } };
      };
      for (i = 0; i < entries.length; i++) out.push(pickEntry(entries[i]));
    } else {
      // Fiche sans détail des flux : pistes telles qu'AVPlay les liste.
      var tracks = player ? player.getTracks() : [];
      var pick = function (t: Track): Choice {
        return {
          label: trackLabel(t),
          apply: function () {
            if (t.kind === 'text') clearSub();
            player!.selectTrack(t.kind, t.index);
            if (t.kind === 'text') setSubs(true);
          }
        };
      };
      for (i = 0; i < tracks.length; i++) if (tracks[i].kind === 'audio') out.push(pick(tracks[i]));
      out.push({ label: 'Sous-titres · Désactivés', apply: function () { setSubs(false); clearSub(); } });
      for (i = 0; i < tracks.length; i++) if (tracks[i].kind === 'text') out.push(pick(tracks[i]));
    }
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
