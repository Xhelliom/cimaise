import { noteEvent } from '../../../tv-core/src/diag';
import { applyIcon } from '../../../tv-core/src/icon';
import { Key } from '../../../tv-core/src/keys';
import { Focus } from '../../../tv-core/src/focus';
import { Panel } from '../../../tv-core/src/router/router';
import { launchApp as deviceLaunch, watchNetwork as deviceWatchNetwork } from '../../../tv-core/src/device';
import { CatalogEntry } from '../catalog/model';
import { knownApp } from '../catalog/known-apps';
import { greeting, formatClock, formatDate, tintGradient, tileInk, railOffset, pageShift, rowOffset, tileH, rowTileLeft, rowTileW, BAC_TOP, PAD, GAP, BAC_W, SCREEN_H, HomeMode, DEFAULT_MODE, normalizeTiles } from './model';

export type PastilleName = 'reglages' | 'smarthub';

export interface HomeOptions {
  catalog: CatalogEntry[];
  // Lancement d'une app ; défaut : tv-core/device (échoue hors TV avec une DeviceError explicite).
  launchApp?: (id: string, ok?: () => void, fail?: (err: Error) => void) => void;
  // Ouverture des entrées de type 'interne' (ex. Plex intégré) par le routeur ; elles ne passent jamais par device.
  openInternal?: (id: string) => void;
  // Suivi du réseau par événement : cb(true) = joignable, cb(false) = coupé ; renvoie le retrait de l'écoute. Défaut : tv-core/device
  // (lève hors TV : l'indicateur reste alors caché).
  watchNetwork?: (cb: (online: boolean) => void) => () => void;
  onPastille: (name: PastilleName) => void;
  onError?: (err: Error) => void;
  now?: () => Date;
  timer?: { set: (fn: () => void, ms: number) => any; clear: (h: any) => void };
  mode?: HomeMode;   // défaut : grille
  tiles?: number;    // tuiles à l'écran : 4 (défaut), 5 ou 6
  doc?: Document;
  // Premier rendu minimal : tuiles avec leur nom, sans logo ni teinte ni description ; enrich() ajoute le reste après la 1re peinture.
  deferRich?: boolean;
}

export interface HomePanel extends Panel {
  setCatalog(catalog: CatalogEntry[]): void;
  setMode(mode: HomeMode): void;
  setTiles(n: number): void;
  notify(text: string): void;   // petit message à l'écran (disparaît seul)
  enrich(): void;               // après la 1re peinture : teinte, description et logos (chargés hors DOM, posés une fois prêts)
}

var MESSAGE_MS = 4000;
var TINT_DELAY_MS = 150; // la teinte ne suit qu'après cet arrêt du focus ; le focus, lui, bouge tout de suite

var PASTILLES: Array<{ name: PastilleName; label: string }> = [
  { name: 'reglages', label: 'Réglages' },
  { name: 'smarthub', label: 'Smart Hub' }
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
  var mode: HomeMode = opts.mode || DEFAULT_MODE;
  var per = normalizeTiles(opts.tiles);
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
  var titre = div('titre'), desc = div('desc');
  var message = div('message');
  var reseau = div('reseau', 'Réseau coupé'); // non focalisable : visible seulement si le réseau est coupé
  var bac = div('bac'), rail = div('rail');
  bac.appendChild(rail);
  el.appendChild(layers[0]);
  el.appendChild(layers[1]);
  el.appendChild(header);
  el.appendChild(nav);
  el.appendChild(titre);
  el.appendChild(desc);
  el.appendChild(bac);
  el.appendChild(message);
  el.appendChild(reseau);

  var tiles: HTMLElement[] = [];
  // Logos posés dont la 1re peinture n'a pas encore eu lieu (ni par le pré-décodage, ni à l'écran).
  var unpainted: Array<{ tile: HTMLElement; file: string; pre: boolean }> = [];
  var grid = new Focus(0, per);
  var chips = new Focus(PASTILLES.length, PASTILLES.length);
  var zone: 'tiles' | 'pastilles' = 'tiles';
  var shownKey = '';
  var rich = !opts.deferRich;

  // --- teinte : écrite sur le calque caché, puis fondu d'opacity (CSS) ; jamais de couleur animée ---
  var cur = 0, fadeTimer: any = null, tintHex = '', tintTimer: any = null;
  function tintLater(hex: string): void {
    if (tintTimer !== null) { timer.clear(tintTimer); tintTimer = null; }
    if (hex === tintHex) return;
    if (tintHex === '') { tint(hex); return; }
    tintTimer = timer.set(function () { tintTimer = null; tint(hex); }, TINT_DELAY_MS);
  }
  function tint(hex: string): void {
    if (hex === tintHex) return;
    if (tintHex === '') { tintHex = hex; layers[0].style.background = tintGradient(hex); return; } // état initial : rien à fondre
    tintHex = hex;
    noteEvent('fondu');
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

  // Tuile à l'écran avec la page et le rail dans leur état courant (mêmes formules que le CSS).
  function onScreen(i: number): boolean {
    var idx = zone === 'tiles' && tiles.length ? grid.index : 0;
    if (mode === 'grille') {
      var cur = Math.floor(idx / per), th = tileH(per);
      var top = BAC_TOP - pageShift(cur) + PAD + Math.floor(i / per) * (th + GAP) - railOffset(cur, per);
      return top + th > 0 && top < SCREEN_H;
    }
    var left = rowTileLeft(i, per) - rowOffset(idx, tiles.length, per);
    return left + rowTileW(per) > 0 && left < BAC_W;
  }
  // Un logo n'est décodé qu'à sa 1re peinture (Chromium 63) : si un appui l'amène à l'écran, le diagnostic le dit.
  function notePaintedLogos(): void {
    for (var u = unpainted.length - 1; u >= 0; u--) {
      var i = tiles.indexOf(unpainted[u].tile);
      if (i < 0) { unpainted.splice(u, 1); continue; }
      if (onScreen(i)) { noteEvent('1re peinture logo ' + unpainted[u].file + (unpainted[u].pre ? ' (pré-décodé)' : '')); unpainted.splice(u, 1); }
    }
  }

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
    // Grille : la page remonte dès la 2e rangée ; une rangée : le rail défile en x. Seuls transform et classe changent.
    var idx = zone === 'tiles' && tiles.length ? grid.index : 0;
    var row = mode === 'grille' ? Math.floor(idx / per) : 0;
    var key = mode + per + ':' + row + ':' + idx;
    if (key !== shownKey) {
      shownKey = key;
      var hcls = homeClass(row);
      if (el.className !== hcls) el.className = hcls;
      rail.style.transform = mode === 'grille'
        ? 'translateY(' + -railOffset(row, per) + 'px)'
        : 'translateX(' + -rowOffset(idx, tiles.length, per) + 'px)';
    }
    if (unpainted.length) notePaintedLogos();
    var known = rich && zone === 'tiles' && catalog[grid.index] ? knownApp(catalog[grid.index].name) : null;
    if (desc.textContent !== (known ? known.desc : '')) desc.textContent = known ? known.desc : '';
    if (zone === 'tiles' && catalog[grid.index]) {
      titre.textContent = catalog[grid.index].name;
      if (rich) tintLater(catalog[grid.index].color);
    } else if (zone === 'pastilles') titre.textContent = PASTILLES[chips.index].label;
    else titre.textContent = '';
  }

  // La tuile EST la marque : logo large de la bibliothèque (par nom) sur son fond naturel ; sans logo, le nom sur la couleur
  // de l'app ; l'icône de la TV n'est qu'un dernier recours. Le logo ne se charge qu'à l'affichage.

  function cols(): number { return mode === 'grille' ? per : Math.max(1, catalog.length); }

  // 4 tuiles = style de base (aucune classe) ; 5 et 6 ajoutent n5 / n6 (tailles dans home.css).
  function homeClass(row: number): string { return 'home ' + mode + (per !== 4 ? ' n' + per : '') + (pageShift(row) ? ' defile' : ''); }

  function buildTiles(): void {
    while (rail.firstChild) rail.removeChild(rail.firstChild);
    tiles = [];
    unpainted = [];
    for (var i = 0; i < catalog.length; i++) {
      var t = div('tuile');
      var k = knownApp(catalog[i].name), bg = k && k.logoUrl ? k.bg : catalog[i].color;
      t.style.background = bg;
      t.style.color = tileInk(bg);
      // Sans logo large : le nom, jamais l'icône carrée de la TV (sauf app sans nom).
      if (k && k.logoUrl && rich) applyIcon(doc, t, catalog[i].icon || '', catalog[i].name, catalog[i].name, k.logoUrl);
      else if (catalog[i].name) t.textContent = catalog[i].name;
      else applyIcon(doc, t, catalog[i].icon || '', '', '?');
      tiles.push(t);
      rail.appendChild(t);
    }
    grid.setCount(catalog.length);
    if (!catalog.length) zone = 'pastilles';
    grid.cols = cols();
    shownKey = '';
  }

  // Chromium 63 (Tizen 5) n'a pas img.decode() et décode une image à sa première peinture : un logo hors écran serait donc décodé
  // sur l'appui qui l'amène à l'écran. Chaque logo prêt est peint une fois dans une couche cachée (1 px, quasi transparente) juste
  // après sa pose, puis la copie est retirée après deux peintures : le premier appui ne décode plus rien.
  function predecode(src: string, t: HTMLElement): void {
    var c: any = doc.createElement('img');
    c.className = 'predecode';
    c.setAttribute('src', src);
    el.appendChild(c);
    var drop = function () { if (c.parentNode) c.parentNode.removeChild(c); };
    if (typeof requestAnimationFrame === 'undefined') drop();
    else requestAnimationFrame(function () {
      // Copie peinte, mais rien ne prouve le décodage sur Chromium 63 : l'entrée reste, marquée, et c'est l'appui qui amène
      // la tuile à l'écran qui consigne « (pré-décodé) ».
      for (var u = 0; u < unpainted.length; u++) if (unpainted[u].tile === t) { unpainted[u].pre = true; break; }
      requestAnimationFrame(drop);
    });
  }

  // Logo d'une tuile : l'image est chargée hors DOM, puis posée à la place du nom une fois prête ; en cas d'échec le nom reste.
  function addLogo(t: HTMLElement, e: CatalogEntry): void {
    var k = knownApp(e.name);
    if (!k || !k.logoUrl || !e.name) return;
    var holder = div('');
    applyIcon(doc, holder, e.icon || '', e.name, e.name, k.logoUrl, function (img) {
      if (t.textContent) t.textContent = '';
      t.appendChild(img);
      var src: string = (img as any).src || '';
      unpainted.push({ tile: t, file: src.replace(/^.*\//, ''), pre: false });
      notePaintedLogos(); // déjà à l'écran : la 1re peinture est celle de la pose
      predecode(src, t);
    });
  }

  // Message transitoire : un seul élément, masqué par la classe, retiré par une minuterie ponctuelle.
  var msgTimer: any = null;
  function notify(text: string): void {
    message.textContent = text;
    message.className = 'message on';
    if (msgTimer !== null) timer.clear(msgTimer);
    msgTimer = timer.set(function () { msgTimer = null; message.className = 'message'; message.textContent = ''; }, MESSAGE_MS);
  }

  function activate(): void {
    var entry = catalog[grid.index];
    var fail = function (err: Error) {
      notify(entry.name + ' : lancement impossible');
      if (opts.onError) opts.onError(err);
    };
    try {
      if (entry.type === 'interne') {
        if (opts.openInternal) opts.openInternal(entry.id);
        else fail(new Error('Module interne sans ouverture : ' + entry.id));
      } else if (!entry.id) {
        notify(entry.name + ' : ID inconnu, va dans Réglages → Découvrir');
      } else launch(entry.id, undefined, fail);
    } catch (e) {
      fail(e as Error);
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

  var stopNet: (() => void) | null = null;
  try {
    stopNet = (opts.watchNetwork || deviceWatchNetwork)(function (online) { reseau.className = online ? 'reseau' : 'reseau on'; });
  } catch (e) { /* hors TV : l'indicateur reste caché */ }

  el.className = homeClass(0);
  buildTiles();
  var enriched = false;
  refresh();
  paint();
  tick();

  return {
    el: el,
    onKey: press,
    notify: notify,
    enrich: function () {
      if (enriched) return;
      enriched = true;
      if (rich) return;
      rich = true;
      for (var i = 0; i < tiles.length; i++) addLogo(tiles[i], catalog[i]);
      shownKey = '';
      paint();
    },
    setCatalog: function (c: CatalogEntry[]) {
      catalog = c.slice(0);
      buildTiles();
      paint();
    },
    setMode: function (m: HomeMode) {
      if (m === mode) return;
      mode = m;
      grid.cols = cols();
      grid.index = 0;
      shownKey = '';
      paint();
    },
    setTiles: function (n: number) {
      n = normalizeTiles(n);
      if (n === per) return;
      per = n;
      grid.cols = cols();
      shownKey = '';
      paint();
    },
    suspend: stopClock,
    resume: function () { stopClock(); tick(); },
    destroy: function () {
      stopClock();
      if (stopNet) { try { stopNet(); } catch (e) { /* écoute déjà retirée */ } stopNet = null; }
      if (fadeTimer !== null) { timer.clear(fadeTimer); fadeTimer = null; }
      if (tintTimer !== null) { timer.clear(tintTimer); tintTimer = null; }
      if (msgTimer !== null) { timer.clear(msgTimer); msgTimer = null; }
    }
  };
}
