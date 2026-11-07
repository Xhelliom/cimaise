import { Item, ServerRef, Timers } from '../api/types';
import { ageLabel } from './age';
import { duration } from './detail';
import { bandArtUrl } from './images';
import { el } from './dom';

// Bandeau de l'accueil (maquette du 07/11, variante A « bandeau haut ») : l'élément qui a le focus, en haut de l'écran.
// Légèreté (docs/decisions.md, 07/11) :
// - le texte suit le focus après BAND_TEXT_DELAY ms sans touche : une touche maintenue ne relance ni mise en page ni peinture
//   du bandeau (mesuré : sans ce délai, l'image suivant une touche répétée passait de 12 à 25 ms, CPU ralenti ×6) ;
// - l'image ne change qu'après BAND_DELAY ms de focus immobile : défiler une rangée ne décode aucune image intermédiaire ;
// - une seule <img> : on l'efface par l'opacité (BAND_FADE ms), on change son src (l'ancienne n'est plus référencée), puis
//   elle réapparaît au chargement. Jamais deux fonds décodés en même temps, aucun flou ni filter : un JPEG 960×540 du
//   transcodeur photo, assombri par un dégradé CSS statique.
export var BAND_DELAY = 300;
export var BAND_FADE = 200;
export var BAND_TEXT_DELAY = 100;
var BAR_W = 320;

export interface Band {
  el: HTMLElement;
  show(it: Item | null): void;
  release(): void;   // écran recouvert : image retirée
  restore(): void;   // retour : l'image de l'élément courant revient (après le même délai)
  destroy(): void;
}

// Titre de tête : la série pour un épisode ou une saison.
function headTitle(it: Item): string {
  if (it.type === 'episode') return it.grandparentTitle || it.title;
  if (it.type === 'season') return it.parentTitle || it.title;
  return it.title;
}
// Ligne sous le titre : « S2 · E5 — Titre de l'épisode » ou « Saison 2 ».
function subLine(it: Item): string {
  if (it.type === 'episode') {
    var se = (it.parentIndex !== undefined ? 'S' + it.parentIndex : '') + (it.index !== undefined ? (it.parentIndex !== undefined ? ' · ' : '') + 'E' + it.index : '');
    return se + (it.title ? (se ? ' — ' : '') + it.title : '');
  }
  return it.type === 'season' ? it.title : '';
}

export function createBand(doc: Document, s: ServerRef, timers: Timers | null): Band {
  var root = el(doc, 'plex-band');
  var img = doc.createElement('img');
  img.className = 'plex-band-img';
  var info = el(doc, 'plex-band-info');
  var title = el(doc, 'plex-band-title'), sub = el(doc, 'plex-band-sub'), meta = el(doc, 'plex-band-meta');
  var metaTxt = el(doc, 'plex-band-mt'), age = el(doc, 'plex-age');
  var prog = el(doc, 'plex-band-prog'), bar = el(doc, 'plex-band-bar'), fill = el(doc, 'plex-band-fill'), left = el(doc, 'plex-band-left');
  var sum = el(doc, 'plex-band-sum');
  meta.appendChild(metaTxt); meta.appendChild(age);
  bar.appendChild(fill); prog.appendChild(bar); prog.appendChild(left);
  info.appendChild(title); info.appendChild(sub); info.appendChild(meta); info.appendChild(prog); info.appendChild(sum);
  root.appendChild(img);
  root.appendChild(el(doc, 'plex-band-veil'));
  root.appendChild(info);

  var cur: Item | null = null;
  var want: string | null = null;    // URL de l'élément courant
  var shown: string | null = null;   // URL posée sur l'<img>
  var wait: any = null, fade: any = null, typing: any = null;
  var held = false;

  function clear(): void {
    if (wait !== null && timers) timers.clearTimeout(wait);
    if (fade !== null && timers) timers.clearTimeout(fade);
    wait = fade = null;
  }
  function visible(v: boolean): void { img.className = v ? 'plex-band-img on' : 'plex-band-img'; }
  function put(url: string | null): void {
    shown = url;
    if (url) { img.onload = function () { if (shown === url) visible(true); }; img.setAttribute('src', url); }
    else { img.onload = null; img.removeAttribute('src'); }
  }
  // Efface l'image affichée (si elle l'est), puis pose la nouvelle.
  function swap(): void {
    wait = null;
    var url = want;
    if (url === shown) { if (url) visible(true); return; }
    if (!shown || !timers) { visible(false); put(url); return; }
    visible(false);
    fade = timers.setTimeout(function () { fade = null; put(url); }, BAND_FADE);
  }
  function schedule(): void {
    clear();
    if (held) return;
    if (want === shown) { if (want) visible(true); return; }
    if (!timers) { swap(); return; }
    wait = timers.setTimeout(swap, BAND_DELAY);
  }

  function text(it: Item): void {
    title.textContent = headTitle(it);
    var sl = subLine(it);
    sub.textContent = sl;
    sub.style.display = sl ? '' : 'none';
    var parts: string[] = [];
    if (it.year) parts.push(String(it.year));
    var d = duration(it.duration);
    if (d) parts.push(d);
    metaTxt.textContent = parts.join(' · ');
    var a = ageLabel(it.contentRating);
    age.textContent = a || '';
    age.style.display = a ? '' : 'none';
    var p = it.duration && it.viewOffset ? Math.min(1, it.viewOffset / it.duration) : 0;
    prog.style.display = p > 0 ? '' : 'none';
    if (p > 0) {
      fill.style.transform = 'translate3d(' + Math.round((p - 1) * BAR_W) + 'px,0,0)';
      left.textContent = 'reste ' + duration((it.duration || 0) - (it.viewOffset || 0));
    }
    sum.textContent = it.summary || '';
  }

  return {
    el: root,
    show: function (it) {
      if (!it) return;
      if (cur && cur.ratingKey === it.ratingKey && cur.viewOffset === it.viewOffset && cur.summary === it.summary) return;
      var first = !cur;
      cur = it;
      if (typing !== null && timers) timers.clearTimeout(typing);
      typing = null;
      // Premier affichage : texte tout de suite (rien à économiser) ; ensuite, après un court silence du clavier.
      if (first || !timers) text(it);
      else typing = timers.setTimeout(function () { typing = null; if (cur) text(cur); }, BAND_TEXT_DELAY);
      var path = it.art || it.grandparentArt;
      want = path ? bandArtUrl(s, path) : null;
      schedule();
    },
    release: function () { held = true; clear(); visible(false); put(null); },
    restore: function () { held = false; schedule(); },
    destroy: function () { held = true; clear(); if (typing !== null && timers) timers.clearTimeout(typing); typing = null; put(null); }
  };
}
