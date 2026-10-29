import { Key } from '../../../tv-core/src/keys';
import { Focus } from '../../../tv-core/src/focus';
import { Panel } from '../../../tv-core/src/router/router';
import { launchApp as deviceLaunch } from '../../../tv-core/src/device';
import { CatalogEntry } from '../catalog/model';
import { greeting, formatClock, formatDate, tintGradient, tileInk, COLS, railOffset } from './model';

export type PastilleName = 'reglages' | 'smarthub' | 'reseau';

export interface HomeOptions {
  catalog: CatalogEntry[];
  // Lancement d'une app ; défaut : tv-core/device (échoue hors TV avec une DeviceError explicite).
  launchApp?: (id: string, ok?: () => void, fail?: (err: Error) => void) => void;
  // Ouverture des entrées de type 'interne' (ex. Plex intégré) par le routeur ; elles ne passent jamais par device.
  openInternal?: (id: string) => void;
  onPastille: (name: PastilleName) => void;
  onError?: (err: Error) => void;
  now?: () => Date;
  timer?: { set: (fn: () => void, ms: number) => any; clear: (h: any) => void };
  doc?: Document;
}

export interface HomePanel extends Panel { setCatalog(catalog: CatalogEntry[]): void; }

var PASTILLES: Array<{ name: PastilleName; label: string }> = [
  { name: 'reglages', label: 'Réglages' },
  { name: 'smarthub', label: 'Smart Hub' },
  { name: 'reseau', label: 'Réseau' }
];

function has(el: HTMLElement, c: string): boolean { return (' ' + el.className + ' ').indexOf(' ' + c + ' ') >= 0; }

export function createHome(opts: HomeOptions): HomePanel {
  var doc = opts.doc || document;
  var now = opts.now || function () { return new Date(); };
  var timer = opts.timer || {
    set: function (fn, ms) { return window.setTimeout(fn, ms); },
    clear: function (h) { window.clearTimeout(h); }
  };
  var launch = opts.launchApp || deviceLaunch;
  var catalog = opts.catalog.slice(0);

  function div(cls: string, text?: string): HTMLElement {
    var d = doc.createElement('div');
    d.className = cls;
    if (text) d.textContent = text;
    return d;
  }

  // Structure de la maquette : 2 calques de teinte, en-tête, pastilles, titre, bac (clip) > rail (défile).
  var el = div('home');
  var layers = [div('fond on'), div('fond')];
  var salut = div('salut'), horloge = div('horloge'), date = div('date');
  var header = div('entete');
  var heure = div('heure');
  heure.appendChild(horloge);
  heure.appendChild(div('sep'));
  heure.appendChild(date);
  header.appendChild(salut);
  header.appendChild(heure);
  var pastilleEls: HTMLElement[] = [];
  var nav = div('pastilles');
  for (var p = 0; p < PASTILLES.length; p++) {
    var pe = div('pastille', PASTILLES[p].label);
    pastilleEls.push(pe);
    nav.appendChild(pe);
  }
  var titre = div('titre');
  var bac = div('bac'), rail = div('rail');
  bac.appendChild(rail);
  el.appendChild(layers[0]);
  el.appendChild(layers[1]);
  el.appendChild(header);
  el.appendChild(nav);
  el.appendChild(titre);
  el.appendChild(bac);

  var tiles: HTMLElement[] = [];
  var grid = new Focus(0, COLS);
  var chips = new Focus(PASTILLES.length, PASTILLES.length);
  var zone: 'tiles' | 'pastilles' = 'tiles';
  var shownRow = -1;

  // --- teinte : écrite sur le calque caché, puis fondu d'opacity (CSS) ; jamais de couleur animée ---
  var cur = 0, fadeTimer: any = null, tintHex = '';
  function tint(hex: string): void {
    if (hex === tintHex) return;
    if (tintHex === '') { tintHex = hex; layers[0].style.background = tintGradient(hex); return; } // état initial : rien à fondre
    tintHex = hex;
    if (fadeTimer !== null) timer.clear(fadeTimer);
    var nx = layers[1 - cur], old = layers[cur];
    nx.style.transition = 'none';
    nx.className = 'fond';
    void nx.offsetWidth; // fige l'état éteint avant de réécrire
    nx.style.background = tintGradient(hex);
    nx.style.zIndex = '2';
    old.style.zIndex = '1';
    void nx.offsetWidth;
    nx.style.transition = '';
    nx.className = 'fond on';
    fadeTimer = timer.set(function () { fadeTimer = null; old.className = 'fond'; }, 650);
    cur = 1 - cur;
  }

  // --- horloge : seule minuterie au repos ---
  var clockTimer: any = null;
  function refresh(): void {
    var d = now();
    var g = greeting(d.getHours()), c = formatClock(d), dt = formatDate(d);
    if (salut.textContent !== g) salut.textContent = g;
    if (horloge.textContent !== c) horloge.textContent = c;
    if (date.textContent !== dt) date.textContent = dt;
  }
  function tick(): void {
    refresh();
    var d = now();
    clockTimer = timer.set(tick, 60000 - (d.getSeconds() * 1000 + d.getMilliseconds()));
  }
  function stopClock(): void { if (clockTimer !== null) { timer.clear(clockTimer); clockTimer = null; } }

  // --- peinture : n'écrit que ce qui change ---
  function paint(): void {
    for (var i = 0; i < tiles.length; i++) {
      var on = zone === 'tiles' && i === grid.index;
      var cls = on ? 'tuile focus' : 'tuile';
      if (tiles[i].className !== cls) tiles[i].className = cls;
    }
    for (var j = 0; j < pastilleEls.length; j++) {
      var pon = zone === 'pastilles' && j === chips.index;
      var pcls = pon ? 'pastille focus' : 'pastille';
      if (pastilleEls[j].className !== pcls) pastilleEls[j].className = pcls;
    }
    var row = zone === 'tiles' && tiles.length ? Math.floor(grid.index / COLS) : shownRow < 0 ? 0 : shownRow;
    if (row !== shownRow) {
      shownRow = row;
      rail.style.transform = 'translateY(' + -railOffset(row) + 'px)';
    }
    if (zone === 'tiles' && catalog[grid.index]) {
      titre.textContent = catalog[grid.index].name;
      tint(catalog[grid.index].color);
    } else if (zone === 'pastilles') titre.textContent = PASTILLES[chips.index].label;
    else titre.textContent = '';
  }

  function buildTiles(): void {
    while (rail.firstChild) rail.removeChild(rail.firstChild);
    tiles = [];
    for (var i = 0; i < catalog.length; i++) {
      var t = div('tuile');
      t.style.background = catalog[i].color;
      t.style.color = tileInk(catalog[i].color);
      if (catalog[i].icon) {
        var img = doc.createElement('img');
        img.setAttribute('src', catalog[i].icon as string);
        t.appendChild(img);
      } else t.textContent = catalog[i].name ? catalog[i].name.charAt(0).toUpperCase() : '?';
      tiles.push(t);
      rail.appendChild(t);
    }
    grid.setCount(catalog.length);
    if (!catalog.length) zone = 'pastilles';
    shownRow = -1;
    rail.style.transform = 'translateY(0px)';
  }

  function activate(): void {
    try {
      var entry = catalog[grid.index];
      if (entry.type === 'interne') {
        if (opts.openInternal) opts.openInternal(entry.id);
        else if (opts.onError) opts.onError(new Error('Module interne sans ouverture : ' + entry.id));
      } else launch(entry.id, undefined, function (err) { if (opts.onError) opts.onError(err); });
    } catch (e) {
      if (opts.onError) opts.onError(e as Error);
    }
  }

  function press(k: Key): boolean {
    if (zone === 'tiles') {
      if (k === 'up') { if (!grid.move('up')) zone = 'pastilles'; }
      else if (k === 'left' || k === 'right' || k === 'down') grid.move(k);
      else if (k === 'enter') { if (catalog.length) activate(); return true; }
      else return false;
    } else {
      if (k === 'down' && catalog.length) zone = 'tiles';
      else if (k === 'left' || k === 'right') chips.move(k);
      else if (k === 'enter') { opts.onPastille(PASTILLES[chips.index].name); return true; }
      else if (k !== 'down' && k !== 'up') return false;
    }
    paint();
    return true;
  }

  buildTiles();
  refresh();
  paint();
  tick();

  return {
    el: el,
    onKey: press,
    setCatalog: function (c: CatalogEntry[]) {
      catalog = c.slice(0);
      buildTiles();
      paint();
    },
    suspend: stopClock,
    resume: function () { stopClock(); tick(); },
    destroy: function () {
      stopClock();
      if (fadeTimer !== null) { timer.clear(fadeTimer); fadeTimer = null; }
    }
  };
}
