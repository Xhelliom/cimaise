import { Item } from '../api/types';
import { bifFrameAt, Bif, decidePlayback, hasPreviewIndex, loadBif, directPlaybackUrl, newTranscodeSession, normalizeLang, PlaybackPlan, requestTranscode, stopTranscode, subtitleUrl, trackEntries, TrackEntry } from '../playback';
import { getMetadata } from '../api/library';
import { xhrBinary, xhrHttp } from '../api/xhr';
import { createProgress, Progress } from '../progress';
import { Panel } from '../../../tv-core/src/router/router';
import { Key } from '../../../tv-core/src/keys';
import { createPlayer, OpenOptions, Player, Track } from '../../../tv-core/src/player';
import { langPrefsFor, LangPrefs, rememberSeries } from '../../../tv-core/src/langprefs';
import { recordMeasure } from '../../../tv-core/src/diag';
import { Ctx, el, identityOf, PlexArg, realTimers, RESUME, resolve } from './context';

var HIDE_MS = 4000; // barre de contrôles : masquée après 4 s sans touche
var BAR_W = 1680;   // largeur de la barre de progression (px de la scène 1920×1080)
var SUB_MS = 3000; // durée d'affichage d'un sous-titre dont AVPlay ne donne pas la durée

function two(n: number): string { return (n < 10 ? '0' : '') + n; }
// hh:mm:ss, toujours avec les heures.
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
type Mode = 'loading' | 'play' | 'error';

// Écran lecteur (HANDOFF §5.4) : démarre directement à `startMs` (0, RESUME ou une position, choisi par l'appelant), lecture directe par AVPlay (wrapper de tv-core).
// Pendant la lecture rien à l'écran : Gauche/Droite = sauts (même rafale accélérée partout, indicateur discret du cumul, saut automatique en fin de rafale) ;
// Entrée = pause + barre ; Haut/Bas = barre, focus sur les boutons (Lecture/Pause, Audio, Sous-titres, sous-menus) ; Haut depuis les boutons = focus sur la barre de
// progression : même déplacement mais la vidéo continue et rien ne part tout seul (Entrée confirme, Retour annule). Retour ferme la barre, puis quitte le lecteur.
// Hors TV, le wrapper signale l'absence de webapis : aucune lecture simulée.
export function createPlayerPanel(arg: PlexArg, item: Item, startMs?: number): Panel {
  var c = resolve(arg) as Ctx;
  var doc = c.doc;
  var timers = arg.timers || realTimers();
  var http = arg.http || xhrHttp;
  var httpBin = arg.httpBinary || xhrBinary;
  var blobs = arg.blobUrl || {
    create: function (jpeg) { return URL.createObjectURL(new Blob([jpeg], { type: 'image/jpeg' })); },
    revoke: function (u) { URL.revokeObjectURL(u); }
  };

  var root = el(doc, 'plex-player');
  var ui = el(doc, 'plex-pl-ui');
  var title = el(doc, 'plex-pl-title', item.title);
  var prog = el(doc, 'plex-pl-prog');
  var track = el(doc, 'plex-pl-track');
  var bar = el(doc, 'plex-pl-bar');
  var cursor = el(doc, 'plex-pl-cursor');
  var preview = el(doc, 'plex-pl-preview'); // miniature de l'image visée (index BIF), au-dessus de l'heure
  var cursorTime = el(doc, 'plex-pl-cursor-time', '');
  var elapsed = el(doc, 'plex-pl-elapsed', '');
  var remaining = el(doc, 'plex-pl-remaining', '');
  var endsAt = el(doc, 'plex-pl-end', '');
  var ctls = el(doc, 'plex-pl-ctls');
  var jumpBox = el(doc, 'plex-pl-jump');
  var jumpSum = el(doc, 'plex-pl-jump-sum', '');
  var jumpTo = el(doc, 'plex-pl-jump-to', '');
  var state = el(doc, 'plex-pl-state', '');
  var modeLine = el(doc, 'plex-pl-mode', '');
  var sub = el(doc, 'plex-pl-sub', '');
  var menu = el(doc, 'plex-pl-menu');
  var dialog = el(doc, 'plex-pl-dialog');
  var text = el(doc, 'plex-pl-text', 'Chargement…');
  var btns = el(doc, 'plex-pl-btns');
  track.appendChild(bar);
  cursor.appendChild(preview); cursor.appendChild(cursorTime);
  prog.appendChild(track); prog.appendChild(cursor);
  ui.appendChild(title); ui.appendChild(prog); ui.appendChild(elapsed); ui.appendChild(remaining); ui.appendChild(endsAt);
  ui.appendChild(ctls); ui.appendChild(state); ui.appendChild(modeLine);
  jumpBox.appendChild(jumpSum); jumpBox.appendChild(jumpTo);
  dialog.appendChild(text); dialog.appendChild(btns);
  root.appendChild(sub); root.appendChild(jumpBox); root.appendChild(ui); root.appendChild(menu); root.appendChild(dialog);

  var mode: Mode = 'loading';
  var closed = false;
  var player: Player | null = null;
  var progress: Progress | null = null;
  var full: Item = item;
  var plan: PlaybackPlan | null = null;
  var durationMs = item.duration || 0;
  var paused = false, menuOpen = false;
  var suspendPos = -1;
  // Session de transcodage de cette lecture : une seule, réutilisée à chaque relance ; tActive = le serveur peut en avoir une ouverte.
  var tSession = newTranscodeSession(identityOf(arg)), tActive = false;
  // Sous-titres rendus par la page (AVPlay n'est réveillé que pour une piste choisie) : subsOn = la piste choisie est lue par AVPlay (interne ou externe), pas incrustée.
  var extFailed = false, subsOn = false, subTimer: any = null, seriesKey = item.grandparentRatingKey;
  // Mesure (diagnostic) : Entrée sur Lire → première image (1er temps de lecture signalé par AVPlay).
  var t0 = Date.now(), awaitFrame = false;
  var hideTimer: any = null, endTimer: any = null, lastMs = 0;
  var metaReq: { abort(): void } | null = null;
  var buttons: Array<{ label: string; run(): void }> = [];
  var at = 0;
  var choices: Choice[] = [], mi = 0;
  // Barre de contrôles : ouverte ou non ; focus sur la barre de progression ('track') ou sur la rangée de boutons ('btns', bi = bouton).
  // jumping : une position visée est en attente dans le lecteur (jumpBase : d'où la rafale est partie) ; holding : le lecteur est en mode maintien.
  var barOpen = false, zone: 'track' | 'btns' = 'btns', bi = 0, jumping = false, jumpBase = 0, holding = false;

  // Index de prévisualisation (BIF) : chargé seulement quand le focus entre sur la barre de progression, libéré en la quittant (ou en quittant le lecteur).
  // Une seule image vivante à la fois (URL d'objet révoquée au changement) ; sans index, seule l'heure visée est affichée.
  var bif: Bif | null = null, bifReq: { abort(): void } | null = null, bifTried = false, previewUrl: string | null = null, previewAt = -1, targetMs = -1;
  function dropPreview(): void {
    if (previewUrl !== null) { blobs.revoke(previewUrl); previewUrl = null; }
    previewAt = -1;
    preview.style.backgroundImage = '';
    setClass(preview, 'plex-pl-preview', false);
  }
  function releaseIndex(): void {
    if (bifReq) { bifReq.abort(); bifReq = null; }
    bif = null; bifTried = false; targetMs = -1;
    dropPreview();
  }
  function showPreview(ms: number): void {
    targetMs = ms;
    if (!bif) return;
    var f = bifFrameAt(bif, ms);
    if (!f) { dropPreview(); return; }
    if (f.start === previewAt) return;
    var old = previewUrl;
    previewUrl = blobs.create(bif.buf.slice(f.start, f.end));
    previewAt = f.start;
    preview.style.backgroundImage = 'url("' + previewUrl + '")';
    setClass(preview, 'plex-pl-preview', true);
    if (old !== null) blobs.revoke(old);
  }
  function loadIndex(): void {
    if (bif || bifReq || bifTried || !plan || !hasPreviewIndex(plan.part)) return;
    bifTried = true;
    bifReq = loadBif(httpBin, identityOf(arg), c.session, plan.part.id, function (err, b) {
      bifReq = null;
      if (closed || zone !== 'track' || !barOpen || err || !b) return; // échec : repli sur l'heure seule
      bif = b;
      if (targetMs >= 0) showPreview(targetMs);
    });
  }

  function setClass(node: HTMLElement, base: string, on: boolean): void { node.className = on ? base + ' on' : base; }

  function clock(t: number): string { var d = new Date(t); return two(d.getHours()) + ' h ' + two(d.getMinutes()); }
  function ratio(ms: number): number { return durationMs > 0 ? Math.max(0, Math.min(1, ms / durationMs)) : 0; }
  function paintTime(ms: number): void {
    lastMs = ms;
    bar.style.transform = 'scaleX(' + ratio(ms) + ')';
    elapsed.textContent = formatTime(ms);
    if (durationMs > 0) {
      var left = Math.max(0, durationMs - ms);
      remaining.textContent = '−' + formatTime(left);
      endsAt.textContent = 'Se termine à ' + clock((arg.now || timers.now)() + left);
    } else { remaining.textContent = ''; endsAt.textContent = ''; }
  }
  // « +10 s », « +1 min 50 », « −30 s » : cumul de la rafale depuis sa position de départ.
  function signed(ms: number): string {
    var sec = Math.round(Math.abs(ms) / 1000), sign = ms < 0 ? '−' : '+';
    if (sec < 60) return sign + sec + ' s';
    return sign + Math.floor(sec / 60) + ' min' + (sec % 60 ? ' ' + two(sec % 60) : '');
  }

  var ctlDefs: Array<{ label(): string; run(): void }> = [
    { label: function () { return paused ? 'Lecture' : 'Pause'; }, run: function () { if (paused) resume(); else pause(); } },
    { label: function () { return 'Audio'; }, run: function () { openMenu('audio'); } },
    { label: function () { return 'Sous-titres'; }, run: function () { openMenu('subtitle'); } }
  ];
  function paintCtl(): void {
    while (ctls.children.length) ctls.removeChild(ctls.children[0]);
    for (var i = 0; i < ctlDefs.length; i++) ctls.appendChild(el(doc, zone === 'btns' && i === bi ? 'plex-pl-ctl focus' : 'plex-pl-ctl', ctlDefs[i].label()));
    ctls.appendChild(el(doc, 'plex-pl-ctl plex-pl-next', '')); // emplacement réservé : Épisode suivant (carte suivante), jamais focalisable
    track.className = zone === 'track' ? 'plex-pl-track focus' : 'plex-pl-track';
  }
  // Maintien côté lecteur : actif seulement tant que le focus est sur la barre de progression (le quitter abandonne la cible).
  function setHold(on: boolean): void {
    if (holding === on) return;
    holding = on;
    if (player) player.holdSeek(on);
  }
  // En pause AVPlay n'émet plus onTime : tant que la barre est ouverte, l'heure de fin est recalculée chaque minute.
  function armEnd(): void {
    var need = barOpen && paused && mode === 'play';
    if (!need) { if (endTimer !== null) { timers.clearTimeout(endTimer); endTimer = null; } return; }
    if (endTimer !== null) return;
    endTimer = timers.setTimeout(function () { endTimer = null; paintTime(lastMs); armEnd(); }, 60000);
  }
  function armHide(): void {
    clearHide();
    armEnd();
    if (barOpen && mode === 'play' && !paused && !menuOpen && !jumping) hideTimer = timers.setTimeout(function () { hideTimer = null; closeBar(); }, HIDE_MS);
  }
  function openBar(z: 'track' | 'btns'): void {
    if (!barOpen) { barOpen = true; bi = 0; }
    zone = z;
    setHold(z === 'track');
    if (z === 'track') loadIndex(); else releaseIndex();
    paintCtl();
    setClass(ui, 'plex-pl-ui', true);
    armHide();
  }
  function closeBar(): void {
    barOpen = false; zone = 'btns';
    releaseIndex();
    setHold(false);
    setClass(ui, 'plex-pl-ui', false);
    clearHide();
    armEnd();
  }
  // Message passager (erreur de saut, sous-titres indisponibles) : la barre apparaît si elle était fermée.
  function showBar(): void { if (barOpen) armHide(); else openBar('btns'); }

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

  function live(on: boolean): void {
    var d: any = doc;
    if (d.documentElement && d.documentElement.classList) {
      if (on) d.documentElement.classList.add('plex-live'); else d.documentElement.classList.remove('plex-live');
    }
    root.className = on ? 'plex-player live' : 'plex-player';
  }

  // Arrête la session côté serveur (une seule fois par session ouverte) ; `then` part après la réponse, succès ou non.
  function stopSession(then?: () => void): void {
    if (!tActive) { if (then) then(); return; }
    tActive = false;
    try {
      stopTranscode(http, identityOf(arg), c.session, tSession, function () { if (then) then(); });
    } catch (e) { if (then) then(); }
  }

  function cleanup(): void {
    closed = true;
    stopSession();
    clearHide();
    clearSub();
    releaseIndex();
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
    stopSession();
    clearHide();
    clearSub();
    releaseIndex();
    live(false);
    barOpen = false; zone = 'btns'; holding = false; jumping = false;
    setClass(ui, 'plex-pl-ui', false);
    setClass(jumpBox, 'plex-pl-jump', false);
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
    awaitFrame = true;
    var p = (arg.createPlayer || createPlayer)({
      doc: arg.doc as any,
      onTime: function (ms) {
        if (awaitFrame && mode === 'play') { awaitFrame = false; recordMeasure('lecture', Date.now() - t0); }
        if (mode !== 'play') return;
        paintTime(ms);
      },
      timers: timers,
      // Rafale d'appuis ± (même mécanisme partout) : barre fermée, indicateur discret du cumul et du pas, le saut part à la fin de la rafale ;
      // focus sur la barre de progression : curseur à la position visée (heure au-dessus), le saut attend Entrée.
      onSeekPending: function (ms, step) {
        if (closed || mode !== 'play') return;
        if (ms === null) {
          jumping = false;
          setClass(jumpBox, 'plex-pl-jump', false);
          setClass(cursor, 'plex-pl-cursor', false);
          targetMs = -1;
          dropPreview();
          armHide();
          return;
        }
        if (!jumping) { jumping = true; jumpBase = ms - (step || 0); }
        if (barOpen && zone === 'track') {
          cursor.style.transform = 'translateX(' + Math.round(BAR_W * ratio(ms)) + 'px)';
          cursorTime.textContent = formatTime(ms);
          showPreview(ms);
          setClass(cursor, 'plex-pl-cursor', true);
          armHide();
        } else {
          jumpSum.textContent = signed(ms - jumpBase);
          jumpTo.textContent = '→ ' + formatTime(ms) + (step ? ' · pas ' + Math.round(Math.abs(step) / 1000) + ' s' : '');
          setClass(jumpBox, 'plex-pl-jump', true);
        }
      },
      onSeekError: function () {
        if (closed || mode !== 'play') return;
        state.textContent = 'Déplacement impossible';
        showBar();
      },
      onSubtitle: showSub,
      // Transcodage : saut hors du déjà transcodé → nouvelle session à cette position, pas de seekTo hors segment.
      onFarSeek: function (ms) {
        if (closed || mode !== 'play') return;
        relaunch(ms);
      },
      onSubtitleError: function () {
        if (closed) return;
        extFailed = true; // refus synchrone pendant open() : signalé une fois la lecture lancée (applyTracks)
        if (mode !== 'play') return;
        setSubs(false);
        clearSub();
        state.textContent = 'Sous-titres indisponibles';
        showBar();
      },
      onEnd: function () { leave(true); },
      onError: fail,
      onSuspend: function (pos) { suspendPos = pos; leave(false); }
    });
    player = p;
    progress = createProgress({
      http: http, id: identityOf(arg), session: c.session, timers: timers, ratingKey: full.ratingKey, durationMs: durationMs,
      getPosition: function () { return suspendPos >= 0 ? suspendPos : p.getPosition(); },
      getTranscodeSession: function () { return plan && plan.mode === 'transcode' ? tSession : null; },
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
      // Direct : seekTo avant play. Transcodé : le flux démarre déjà à startMs (offset), AVPlay compte depuis 0 et le wrapper ajoute le décalage.
      if (plan!.mode === 'transcode') p.setTranscode(startMs, durationMs);
      else { p.setTranscode(null); if (startMs > 0) oo.startMs = startMs; }
      try {
        var su = subtitleUrl(c.session, plan!);
        if (su) oo.subtitleUrl = su;
      } catch (e) { fail(e as Error); return; }
      p.open(url, oo, function (err) {
        if (closed || mode === 'error') return;
        if (err) { fail(err); return; }
        mode = 'play';
        setClass(dialog, 'plex-pl-dialog', false);
        paintTime(startMs);
        modeLine.textContent = plan!.reason;
        applyTracks(p, true, true);
        live(true);
        progress!.playing();
      });
    }
    if (plan!.mode === 'direct') {
      var url: string;
      try { url = directPlaybackUrl(c.session, plan!); } catch (e) { fail(e as Error); return; }
      opened(url);
    } else {
      // Une session encore ouverte (relance à un autre offset, changement de piste) est arrêtée d'abord : sinon son arrêt tardif tuerait la nouvelle.
      stopSession(function () {
        if (closed || mode === 'error') return;
        tActive = true; // la décision elle-même ouvre la session côté serveur
        metaReq = requestTranscode(http, identityOf(arg), c.session, plan!, tSession, function (err, r) {
          metaReq = null;
          if (closed || mode === 'error') return;
          if (err || !r) { fail(err || new Error('transcodage impossible')); return; }
          opened(r.url);
        }, startMs);
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

  // RESUME : position à jour du serveur (jamais celle, éventuellement en cache, de la fiche) ; un titre vu en entier repart de zéro.
  function begin(): void {
    var at = startMs === RESUME ? (full.viewOffset && (!durationMs || full.viewOffset < durationMs) ? full.viewOffset : 0) : startMs || 0;
    start(at);
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
        mode: g.mode, audioList: g.audioList, subList: g.subList, audioLang: g.audioLang, subLang: g.subLang,
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
    relaunch(p.getPosition());
  }

  // Relance le flux du plan courant à une position (changement de piste, saut lointain en transcodage).
  function relaunch(pos: number): void {
    clearSub();
    subsOn = false;
    paused = false;
    state.textContent = '';
    progress!.paused();
    mode = 'loading';
    awaitFrame = false;
    live(false);
    closeBar();
    jumping = false;
    setClass(jumpBox, 'plex-pl-jump', false);
    ask('Chargement…', []);
    // L'ancien flux est coupé avant l'arrêt de sa session serveur : il ne réclame plus de segments.
    if (player) { player.stop(); player.close(); }
    launch(pos);
  }

  // Sous-menu vertical d'un type de pistes : langue, codec, « forcés », piste active cochée ; les sous-titres ajoutent « Aucun ».
  function openMenu(kind: 'audio' | 'subtitle'): void {
    var out: Choice[] = [];
    var i: number;
    var entries = plan && plan.part.Stream && plan.part.Stream.length ? trackEntries(plan) : [];
    function strip(l: string): string { return l.replace(/^(Audio|Sous-titres) · /, '').replace(/^Désactivés$/, 'Aucun'); }
    if (entries.length) {
      var pickEntry = function (e: TrackEntry): Choice {
        return { label: (e.current ? '✓ ' : '') + strip(e.label), apply: function () { choose(e); } };
      };
      for (i = 0; i < entries.length; i++) if (entries[i].kind === kind) out.push(pickEntry(entries[i]));
    } else {
      // Fiche sans détail des flux : pistes telles qu'AVPlay les liste.
      var tracks = player ? player.getTracks() : [];
      var pick = function (t: Track): Choice {
        return {
          label: strip(trackLabel(t)),
          apply: function () {
            if (t.kind === 'text') clearSub();
            player!.selectTrack(t.kind, t.index);
            if (t.kind === 'text') setSubs(true);
          }
        };
      };
      if (kind === 'audio') {
        for (i = 0; i < tracks.length; i++) if (tracks[i].kind === 'audio') out.push(pick(tracks[i]));
      } else {
        out.push({ label: 'Aucun', apply: function () { setSubs(false); clearSub(); } });
        for (i = 0; i < tracks.length; i++) if (tracks[i].kind === 'text') out.push(pick(tracks[i]));
      }
    }
    if (!out.length) return;
    choices = out;
    mi = 0;
    menuOpen = true;
    paintMenu();
    setClass(menu, 'plex-pl-menu', true);
    armHide();
  }
  function paintMenu(): void {
    while (menu.children.length) menu.removeChild(menu.children[0]);
    for (var i = 0; i < choices.length; i++) menu.appendChild(el(doc, i === mi ? 'plex-pl-opt focus' : 'plex-pl-opt', choices[i].label));
  }
  function closeMenu(): void { menuOpen = false; setClass(menu, 'plex-pl-menu', false); armHide(); }

  function pause(): void { if (paused) return; paused = true; player!.pause(); progress!.paused(); state.textContent = 'Pause'; paintCtl(); armHide(); }
  function resume(): void { if (!paused) return; paused = false; player!.play(); progress!.playing(); state.textContent = ''; paintCtl(); armHide(); }

  function jumpKey(dir: number): void {
    if (dir < 0) player!.rewind(); else player!.forward();
    if (barOpen) armHide();
  }

  function playKey(k: Key): boolean {
    if (menuOpen) {
      if (k === 'up') mi = Math.max(0, mi - 1);
      else if (k === 'down') mi = Math.min(choices.length - 1, mi + 1);
      else if (k === 'enter') { choices[mi].apply(); closeMenu(); return true; }
      else if (k === 'back') { closeMenu(); return true; }
      paintMenu();
      return true;
    }
    if (k === 'stop') { leave(false); return true; }
    if (k === 'rewind') { jumpKey(-1); return true; }
    if (k === 'forward') { jumpKey(1); return true; }
    if (k === 'pause') { pause(); openBar('btns'); return true; }
    if (k === 'play') { resume(); return true; }
    if (k === 'playpause') { if (paused) resume(); else { pause(); openBar('btns'); } return true; }
    if (!barOpen) {
      if (k === 'back') { if (jumping) player!.cancelSeek(); else leave(false); }
      else if (k === 'left') jumpKey(-1);
      else if (k === 'right') jumpKey(1);
      else if (k === 'enter') { if (paused) resume(); else { pause(); openBar('btns'); } }
      else if (k === 'up' || k === 'down') openBar('btns');
      return true;
    }
    if (zone === 'track') {
      if (k === 'left') jumpKey(-1);
      else if (k === 'right') jumpKey(1);
      else if (k === 'enter') { if (jumping) player!.commitSeek(); else if (paused) resume(); else pause(); }
      else if (k === 'back') { if (jumping) player!.cancelSeek(); else closeBar(); }
      else if (k === 'down') openBar('btns');
      armHide();
      return true;
    }
    if (k === 'back') closeBar();
    else if (k === 'left') { bi = Math.max(0, bi - 1); paintCtl(); }
    else if (k === 'right') { bi = Math.min(ctlDefs.length - 1, bi + 1); paintCtl(); }
    else if (k === 'up') openBar('track');
    else if (k === 'enter') ctlDefs[bi].run();
    armHide();
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
