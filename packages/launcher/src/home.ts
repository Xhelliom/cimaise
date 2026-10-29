import { Panel } from '../../tv-core/src/router/router';
import { Focus } from '../../tv-core/src/focus';
import { Key } from '../../tv-core/src/keys';
import { Tile } from './tiles';
import { createTint, Tint } from './tint';

// Accueil Dock en deux temps. build() : premier affichage minimal (horloge + tuiles, aplats, police système).
// enhance() : le reste, appelé après le premier affichage (salutation, date, titre, pastille Réglages, fond teinté).
export interface HomeOptions {
  tiles: Tile[];
  onTile(tile: Tile): boolean;   // false = pas d’action (la touche reste libre pour le diagnostic)
  onSettings(): void;
}

export interface Home {
  panel: Panel;
  enhance(): void;
}

var COLS = 4;
var DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
var MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

function pad(n: number): string { return n < 10 ? '0' + n : '' + n; }
function div(cls: string, text?: string): HTMLElement {
  var e = document.createElement('div');
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function createHome(opts: HomeOptions): Home {
  var tiles = opts.tiles;
  var el = div('home');
  var clock = div('horloge');
  var bac = div('bac');
  el.appendChild(clock);
  el.appendChild(bac);

  var nodes: HTMLElement[] = [];
  for (var i = 0; i < tiles.length; i++) {
    var n = div('tuile', tiles[i].letter);
    n.style.background = tiles[i].color;
    n.style.color = tiles[i].ink;
    bac.appendChild(n);
    nodes.push(n);
  }

  var focus = new Focus(tiles.length, COLS);
  var onPill = false;
  var pill: HTMLElement | null = null;
  var title: HTMLElement | null = null;
  var tint: Tint | null = null;
  nodes[0].className = 'tuile focus';

  // Horloge à la minute : seule minuterie de l'accueil, arrêtée quand l'accueil est recouvert.
  var timer: any = 0;
  function tick(): void {
    var d = new Date();
    clock.textContent = pad(d.getHours()) + ':' + pad(d.getMinutes());
    timer = setTimeout(tick, 60000 - (d.getSeconds() * 1000 + d.getMilliseconds()));
  }
  tick();

  function paint(from: number): void {
    nodes[from].className = 'tuile';
    nodes[focus.index].className = onPill ? 'tuile' : 'tuile focus';
    if (title) title.textContent = tiles[focus.index].name;
    if (tint && from !== focus.index) tint.set(tiles[focus.index].rgb);
  }
  function setPill(on: boolean): void {
    onPill = on;
    pill!.className = on ? 'pastille focus' : 'pastille';
    nodes[focus.index].className = on ? 'tuile' : 'tuile focus';
  }

  var panel: Panel = {
    el: el,
    suspend: function () { clearTimeout(timer); },
    resume: function () { tick(); },
    onKey: function (k: Key): boolean {
      if (k === 'enter') {
        if (onPill) { opts.onSettings(); return true; }
        return opts.onTile(tiles[focus.index]);
      }
      if (k !== 'left' && k !== 'right' && k !== 'up' && k !== 'down') return false;
      if (onPill) { if (k === 'down') setPill(false); return true; }
      var from = focus.index;
      if (focus.move(k)) paint(from);
      else if (k === 'up' && pill) setPill(true);
      return true;
    }
  };

  function enhance(): void {
    var d = new Date();
    var h = d.getHours();
    var head = div('entete');
    head.appendChild(div('salut', h >= 5 && h < 18 ? 'Bonjour' : 'Bonsoir'));
    head.appendChild(div('date', DAYS[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()]));
    el.appendChild(head);
    pill = div('pastille', 'Réglages');
    el.appendChild(pill);
    title = div('titre', tiles[focus.index].name);
    el.appendChild(title);
    tint = createTint(el);
    tint.set(tiles[focus.index].rgb);
    document.body.className = 'late';
  }

  return { panel: panel, enhance: enhance };
}
