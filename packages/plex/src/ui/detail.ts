import { Item } from '../api/types';
import { Panel } from '../../../tv-core/src/router/router';
import { Key } from '../../../tv-core/src/keys';
import { createRow, VirtualList } from '../../../tv-core/src/virtual/list';
import { Ctx, el, PlexArg, realTimers, RESUME, resolve } from './context';
import { createPlayerPanel } from './player';
import { recordMeasure } from '../../../tv-core/src/diag';
import { detailPosterUrl, EPISODE, episodeThumbUrl } from './images';

type Zone = 'play' | 'seasons' | 'episodes';

var SEASON_FOLLOW_MS = 300;

function duration(ms?: number): string {
  if (!ms) return '';
  var m = Math.floor(ms / 60000);
  return m >= 60 ? Math.floor(m / 60) + ' h ' + (m % 60 < 10 ? '0' : '') + (m % 60) + ' min' : m + ' min';
}

// Part du contenu déjà vue (0 à 1) : position de reprise d'un film, épisodes vus d'une série.
function progress(it: Item): number {
  if (it.type === 'show') return it.leafCount ? (it.viewedLeafCount || 0) / it.leafCount : 0;
  return it.duration && it.viewOffset ? Math.min(1, it.viewOffset / it.duration) : 0;
}

// Position de reprise d'une pastille : « 12:34 » ou « 1:02:10 ».
function clock(ms: number): string {
  var s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, ss = s % 60;
  return (h ? h + ':' + (m < 10 ? '0' : '') : '') + m + ':' + (ss < 10 ? '0' : '') + ss;
}

// Fiche film ou série : affiche, titre, méta, Lire ou Reprendre + Depuis le début, résumé ; pour une série, saisons puis épisodes.
// `stub` (déjà connu par la liste) s'affiche tout de suite ; la fiche complète le remplace à son arrivée.
// `focus` : épisode visé (ouvert depuis « En cours ») ; sinon, pour une série, Lire = l'épisode « à suivre » du serveur,
// à défaut le premier. Le lecteur ne reçoit jamais une série ni une saison.
export function createDetailPanel(arg: PlexArg, stub: Item, focus?: Item): Panel {
  var c = resolve(arg) as Ctx;
  var doc = c.doc;
  var item = stub;
  var root = el(doc, 'plex-panel plex-detail');
  var poster = doc.createElement('img');
  poster.className = 'plex-dposter';
  var title = el(doc, 'plex-dtitle', stub.title);
  var meta = el(doc, 'plex-dmeta', '');
  var prog = el(doc, 'plex-prog');
  var bar = el(doc, 'plex-prog-bar');
  prog.appendChild(bar);
  var btns = el(doc, 'plex-btns');
  var play = el(doc, 'plex-play', 'Lire');
  var restart = el(doc, 'plex-restart', 'Depuis le début');
  btns.appendChild(play);
  var summary = el(doc, 'plex-dsummary', '');
  var msg = el(doc, 'plex-msg', '');
  var seasonsBox = el(doc, 'plex-seasons');
  var epTitle = el(doc, 'plex-ep-title', '');
  var episodesBox = el(doc, 'plex-episodes');
  var parts = [poster, title, meta, prog, btns, summary, seasonsBox, epTitle, episodesBox, msg];
  for (var p = 0; p < parts.length; p++) root.appendChild(parts[p]);

  var seasons: Item[] = [], episodes: Item[] = [];
  var target: Item | null = stub.type === 'show' && focus ? focus : null;   // l'épisode que lit Lire
  var pinned = !!target;   // visé par l'appelant : ni « à suivre » ni premier épisode ne le remplacent
  var cancels: Array<() => void> = [], epCancel: (() => void) | null = null;
  var zone: Zone = 'play';
  var held = false;
  var onRestart = false;   // focus sur « Depuis le début » plutôt que sur Lire/Reprendre
  var t0 = Date.now(), measured = false;   // mesure (diagnostic) : ouverture → fiche complète affichée

  function paint(): void {
    title.textContent = item.title;
    var bits: string[] = [];
    if (item.year) bits.push(String(item.year));
    if (item.duration) bits.push(duration(item.duration));
    if (item.type === 'show' && item.leafCount) bits.push(item.leafCount + ' épisodes');
    meta.textContent = bits.join(' · ');
    summary.textContent = item.summary || '';
    var r = progress(item);
    bar.style.transform = 'scaleX(' + r + ')';
    prog.style.opacity = r > 0 ? '1' : '0';
    var off = resumeAt();
    var ep = stub.type === 'show' ? target : null;
    var se = ep && ep.parentIndex !== undefined && ep.index !== undefined ? ' S' + ep.parentIndex + ' E' + ep.index : '';
    play.textContent = (off ? 'Reprendre' : 'Lire') + se + (off ? ' · ' + clock(off) : '');
    if (off && !restart.parentNode) btns.appendChild(restart);
    if (!off && restart.parentNode) { btns.removeChild(restart); onRestart = false; }
    if (!held) { var u = detailPosterUrl(c.session, item); if (u) poster.setAttribute('src', u); }
    play.className = zone === 'play' && !onRestart ? 'plex-play focus' : 'plex-play';
    restart.className = zone === 'play' && onRestart ? 'plex-restart focus' : 'plex-restart';
  }

  // Ce que lit Lire : l'épisode visé d'une série, sinon la fiche ; null tant que l'épisode n'est pas connu.
  function playable(): Item | null { return stub.type === 'show' ? target : item; }
  // Position de reprise (ms) de l'élément à lire, 0 s'il n'est pas entamé.
  function resumeAt(): number {
    var it = playable();
    return it && it.viewOffset && it.viewOffset > 0 && (!it.duration || it.viewOffset < it.duration) ? it.viewOffset : 0;
  }

  var seasonList: VirtualList | null = null, episodeList: VirtualList | null = null;
  if (stub.type === 'show') {
    seasonList = createRow({
      container: seasonsBox, doc: doc, count: 0, itemW: 240, itemH: 84, gap: 24, viewportW: 1400, viewportH: 84,
      render: function (i) { return seasons[i] ? { title: seasons[i].title, image: null, selected: seasons[i] === curSeason } : null; },
      onSelect: function (i) { settle(); loadEpisodes(seasons[i]); }
    });
    episodeList = createRow({
      container: episodesBox, doc: doc, count: 0, itemW: EPISODE.w, itemH: EPISODE.h + 72, gap: 48, viewportW: 1800, viewportH: EPISODE.h + 72,
      render: function (i) {
        var e = episodes[i];
        return e ? { title: (e.index ? e.index + '. ' : '') + e.title, image: episodeThumbUrl(c.session, e) } : null;
      },
      onSelect: function (i) { startPlay(episodes[i], RESUME); }
    });
  }

  function say(text: string): void { msg.textContent = text; }

  // Lire : l'écran lecteur, sauf si l'appelant fournit son propre `onPlay`.
  // `startMs` : 0 ou RESUME (le lecteur relit la position sur le serveur) ; le lecteur ne pose plus la question.
  function startPlay(it: Item, startMs: number): void {
    if (arg.onPlay) c.play(it, startMs); else c.nav.push(createPlayerPanel(arg, it, startMs));
  }

  var curSeason: Item | null = null;
  var timers = arg.timers || realTimers();
  var follow: any = null;   // le focus se pose sur une saison : elle s'affiche après un court délai, sans Entrée
  function settle(): void { if (follow !== null) { timers.clearTimeout(follow); follow = null; } }
  function followFocus(): void {
    settle();
    follow = timers.setTimeout(function () {
      follow = null;
      var s = seasons[seasonList!.focus.index];
      if (s && s !== curSeason) loadEpisodes(s);
    }, SEASON_FOLLOW_MS);
  }
  // `fresh` : autre saison que celle affichée (focus au premier épisode) ; sinon rechargement de la même (retour de lecture).
  function loadEpisodes(season: Item): void {
    var fresh = !curSeason || season.ratingKey !== curSeason.ratingKey;
    curSeason = season;
    if (epCancel) epCancel();
    epTitle.textContent = season.title;
    seasonList!.refresh();   // repère « sélectionnée » sur la saison affichée
    if (fresh) { episodes = []; episodeList!.setCount(0); }   // l'ancienne saison ne reste pas affichée pendant le chargement
    epCancel = c.data.children(season.ratingKey, function (l) {
      if (curSeason !== season) return;   // réponse d'une saison quittée entre-temps
      episodes = l;
      episodeList!.setCount(l.length);
      if (fresh) episodeList!.setFocus(0);
      var t = target ? target.ratingKey : '';
      for (var i = 0; i < l.length; i++) if (l[i].ratingKey === t) { target = l[i]; episodeList!.setFocus(i); break; }   // version à jour
      if (!target && l.length) target = l[0];
      paint();
    });
  }

  paint();
  var metaCancel: (() => void) | null = null;
  function loadMeta(): void {
    if (metaCancel) metaCancel();
    metaCancel = c.data.metadata(stub.ratingKey, function (full) {
      item = full;
      var d = full.OnDeck && full.OnDeck.Metadata;
      var next: Item | undefined = d instanceof Array ? d[0] : d;
      if (stub.type === 'show' && !pinned) {
        if (next && next.type === 'episode') target = next; else if (!next && target && !(target.ratingKey && episodes.length)) target = null;
      }
      paint();
      if (!measured) { measured = true; recordMeasure('fiche', Date.now() - t0); }
    }, undefined, stub.type === 'show');
  }
  loadMeta();
  if (seasonList) {
    cancels.push(c.data.children(stub.ratingKey, function (l) {
      seasons = l;
      seasonList!.setCount(l.length);
      var first = 0, want = focus;
      for (var i = 0; i < l.length; i++) if ((l[i].index || 0) > 0) { first = i; break; } // « Épisodes spéciaux » (0) en dernier recours
      if (want) {   // la saison de l'épisode visé, par clé puis par numéro
        for (var j = 0; j < l.length; j++) {
          if (want.parentRatingKey ? l[j].ratingKey === want.parentRatingKey : (want.parentIndex !== undefined && l[j].index === want.parentIndex)) { first = j; break; }
        }
      }
      if (l.length) { seasonList!.setFocus(first); loadEpisodes(l[first]); }
    }));
  }

  function setZone(z: Zone): void {
    zone = z;
    paint();
    if (seasonList) { seasonsBox.className = z === 'seasons' ? 'plex-seasons on' : 'plex-seasons'; seasonList.setActive(z === 'seasons'); }
    if (episodeList) { episodesBox.className = z === 'episodes' ? 'plex-episodes on' : 'plex-episodes'; episodeList.setActive(z === 'episodes'); }
  }
  function zones(): Zone[] {
    var z: Zone[] = ['play'];
    if (seasonList && seasons.length) z.push('seasons');
    if (episodeList && episodes.length) z.push('episodes');
    return z;
  }
  setZone('play');

  return {
    el: root,
    onKey: function (k: Key): boolean {
      say('');
      var z = zones(), at = z.indexOf(zone);
      if (k === 'down') { if (at >= z.length - 1) return false; setZone(z[at + 1]); return true; }
      if (k === 'up') { if (at <= 0) return false; setZone(z[at - 1]); return true; }
      if (zone === 'play') {
        if (k === 'left' || k === 'right') {
          if (!restart.parentNode || onRestart === (k === 'right')) return false;
          onRestart = k === 'right';
          paint();
          return true;
        }
        if (k !== 'enter') return false;
        var it = playable();
        if (!it) { say('Chargement de l’épisode…'); return true; }
        startPlay(it, onRestart || !resumeAt() ? 0 : RESUME);
        return true;
      }
      if (zone === 'seasons') {
        var moved = seasonList!.handleKey(k);
        if (moved && (k === 'left' || k === 'right')) followFocus();
        return moved;
      }
      return episodeList!.handleKey(k);
    },
    suspend: function () {
      held = true;
      poster.removeAttribute('src');
      if (seasonList) { seasonList.release(); episodeList!.release(); }
    },
    resume: function () {
      held = false;
      paint();
      loadMeta();   // retour de lecture : progression et « Reprendre » à jour
      if (curSeason) loadEpisodes(curSeason);
      if (seasonList) { seasonList.restore(); episodeList!.restore(); }
    },
    destroy: function () {
      settle();
      for (var i = 0; i < cancels.length; i++) cancels[i]();
      if (metaCancel) metaCancel();
      if (epCancel) epCancel();
      if (seasonList) { seasonList.release(); episodeList!.release(); }
    }
  };
}
