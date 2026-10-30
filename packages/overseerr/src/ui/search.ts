import { Panel } from '../../../tv-core/src/router/router';
import { Key } from '../../../tv-core/src/keys';
import { createKeyboard, Keyboard } from '../../../tv-core/src/keyboard';
import { createGrid, TileInfo } from '../../../tv-core/src/virtual/list';
import { recordMeasure } from '../../../tv-core/src/diag';
import { Abortable, Http, OverseerrConfig, Title } from '../api/types';
import { appendTitles, posterUrl } from '../api/media';
import { search } from '../api/client';
import { badgeFor, currentAvailability } from './badge';

// Recherche Overseerr : le clavier à l'écran de tv-core (le même que la recherche Plex et les Réglages, CSS déjà dans app.css)
// à gauche, les résultats films et séries mêlés à droite, en grille virtualisée de 2 colonnes. Affiches w185 à leur taille
// native (185×278) : jamais agrandies ni plus grandes que l'affichage. Le CSS part avec celui de l'accueil (chunk).
export var SEARCH_CSS =
  '.ovs-kb{position:absolute;left:120px;top:200px}' +
  '.ovs-kb.off .kb-focus{opacity:0}' +   // un seul repère de focus à l'écran : celui du clavier s'efface sur les résultats
  '.ovs-res{position:absolute;left:1388px;top:200px;width:420px;height:840px;overflow:hidden}' +
  '.ovs-box{position:absolute;left:8px;top:8px}' +
  '.ovs-note{position:absolute;left:1388px;top:200px;width:420px;font-size:30px;color:#94a3b8}' +
  // La tuile couvre affiche + légende : le fond ardoise passe sur l'affiche (visible tant qu'elle manque ou charge).
  '.ovs .vtile{background:none}' +
  '.ovs .vimg{width:185px;height:278px;border-radius:12px;background:#1e293b;transition:none}' +
  '.ovs .vimg:not([src]){visibility:visible}' +
  '.ovs .vlabel{left:0;top:288px;bottom:auto;width:185px;font-size:22px;line-height:26px;max-height:52px;overflow:hidden;color:#cbd5e1}' +
  '.ovs-box.on .vtile.focus .vimg{box-shadow:0 0 0 6px rgba(255,255,255,.92)}' +
  '.ovs .vbadge{left:10px;top:10px;height:32px;padding:0 12px;border-radius:16px;font-size:20px;line-height:32px}';

var W = 185, H = 278 + 52, GAP = 32, COLS = 2;
var DELAY = 400;    // silence de frappe avant la requête (comme la recherche Plex côté serveur) : jamais une requête par touche
var MIN = 2;        // une lettre ramène des milliers de titres TMDB : on attend la deuxième
var AHEAD = 6;      // titres restants avant la fin : page suivante

export interface Timers { setTimeout(f: () => void, ms: number): any; clearTimeout(id: any): void; now(): number; }
var REAL: Timers = {
  setTimeout: function (f, ms) { return setTimeout(f, ms); },
  clearTimeout: function (id) { clearTimeout(id); },
  now: function () { return Date.now(); }
};

export interface OverseerrSearchArg {
  http: Http;
  config: () => OverseerrConfig | null;
  imageBase?: string;
  doc?: Document;
  timers?: Timers;
  onOpen?: (t: Title) => void;   // fiche ; absente : Entrée ne fait rien
}

function trim(s: string): string { return s.replace(/^\s+|\s+$/g, ''); }

// Sous l'affiche : le type (les résultats mêlent films et séries) et l'année ; sans affiche, le titre d'abord.
export function searchLabel(t: Title): string {
  var kind = (t.mediaType === 'movie' ? 'Film' : 'Série') + (t.year ? ' · ' + t.year : '');
  return t.posterPath ? kind : t.title + ' — ' + kind;
}

export function createOverseerrSearchPanel(arg: OverseerrSearchArg): Panel {
  var doc = arg.doc || document;
  var timers = arg.timers || REAL;
  function div(cls: string, text?: string): HTMLElement {
    var d = doc.createElement('div');
    d.className = cls;
    if (text) d.textContent = text;
    return d;
  }
  var root = div('ov ovs');
  var head = div('ov-head');
  head.appendChild(div('ov-sur', 'Overseerr'));
  head.appendChild(div('ov-h', 'Rechercher'));
  root.appendChild(head);
  var kbBox = div('ovs-kb'), res = div('ovs-res'), box = div('ovs-box'), note = div('ovs-note');
  res.appendChild(box);
  root.appendChild(kbBox);
  root.appendChild(res);
  root.appendChild(note);

  var q = '', shown = '', items: Title[] = [], page = 0, total = 0;
  var zone: 'kb' | 'res' = 'kb';
  var timer: any = null, req: Abortable | null = null, askedAt = 0;

  var grid = createGrid({
    container: box, doc: doc, count: 0, itemW: W, itemH: H, gap: GAP, cols: COLS, viewportW: 402, viewportH: 832,
    render: function (i): TileInfo | null {
      var t = items[i];
      return t ? { title: searchLabel(t), image: posterUrl(t.posterPath, 'w185', arg.imageBase), badge: badgeFor(currentAvailability(t)) } : null;
    },
    onSelect: function (i) { if (arg.onOpen && items[i]) arg.onOpen(items[i]); }
  });

  function paint(): void {
    box.className = zone === 'res' ? 'ovs-box on' : 'ovs-box';
    kbBox.className = zone === 'res' ? 'ovs-kb off' : 'ovs-kb';
    grid.setActive(zone === 'res');
  }

  function say(text: string): void { note.textContent = text; }

  // Page 1 d'un nouveau texte (remplace la grille) ou page suivante du texte affiché (s'ajoute, doublons écartés).
  function load(text: string, p: number): void {
    if (req) req.abort();
    askedAt = timers.now();
    req = search(arg.http, arg.config(), text, p, function (err, r) {
      req = null;
      if (text !== trim(q)) return;   // réponse d'un texte dépassé (abort sans effet sur le transport)
      if (err || !r) {
        if (p === 1) say(err && err.code === 'config' ? 'Overseerr non configuré (Réglages > Apps intégrées)' : 'Échec : ' + (err ? err.message : 'réponse vide'));
        return;
      }
      if (p === 1) { items = []; shown = text; grid.jumpTo(0); }
      appendTitles(items, r.items);
      page = r.page;
      total = r.totalPages;
      grid.setCount(items.length);
      grid.refresh();
      if (!items.length) zone = 'kb';
      say(items.length ? '' : 'Aucun résultat pour « ' + text + ' »');
      paint();
      if (p === 1) recordMeasure('overseerr-recherche', timers.now() - askedAt);
    });
  }

  function clear(): void {
    if (req) { req.abort(); req = null; }
    items = []; shown = ''; page = 0; total = 0;
    grid.setCount(0);
    zone = 'kb';
    paint();
  }

  function schedule(t: string): void {
    if (timer !== null) timers.clearTimeout(timer);
    timer = timers.setTimeout(function () { timer = null; load(t, 1); }, DELAY);
  }

  function onChange(v: string): void {
    q = v;
    if (timer !== null) { timers.clearTimeout(timer); timer = null; }
    var t = trim(v);
    if (t.length < MIN) { clear(); say(t ? 'Encore une lettre…' : ''); return; }
    if (t === shown) { say(''); return; }
    say('Recherche…');
    schedule(t);
  }

  // Valider : pas d'attente ; vers les résultats s'il y en a.
  function submit(): void {
    var t = trim(q);
    if (timer !== null) { timers.clearTimeout(timer); timer = null; load(t, 1); return; }
    toResults();
  }

  function toResults(): boolean {
    if (!items.length) return false;
    zone = 'res';
    paint();
    return true;
  }
  function toKeyboard(): void { zone = 'kb'; paint(); }

  function near(): void {
    if (!req && page < total && grid.focus.index >= items.length - AHEAD) load(shown, page + 1);
  }

  var kb: Keyboard = createKeyboard({ container: kbBox, doc: doc, placeholder: 'Un film, une série…', onChange: onChange, onSubmit: submit });
  paint();

  return {
    el: root,
    onKey: function (k: Key): boolean {
      if (k === 'back') return false;   // le routeur dépile : retour à l'accueil Overseerr, où qu'on soit
      if (zone === 'res') {
        if (k === 'enter') return grid.handleKey(k);
        if (!grid.handleKey(k)) { if (k === 'left' || k === 'up') toKeyboard(); return true; }
        near();
        return true;
      }
      if (k === 'right' && !kb.canMove('right')) { toResults(); return true; }
      // Au D-pad, aller d'une lettre à l'autre prend souvent plus de 400 ms : un déplacement sur le clavier relance aussi
      // le silence, sinon chaque lettre partirait en requête (« al », « ali »…).
      if (timer !== null && k !== 'enter') schedule(trim(q));
      return kb.handleKey(k);
    },
    suspend: function () { grid.release(); },
    resume: function () { grid.refresh(); grid.restore(); },   // refresh : badge changé par la fiche
    destroy: function () {
      if (timer !== null) timers.clearTimeout(timer);
      if (req) req.abort();
      grid.release();
      kb.destroy();
    }
  };
}
