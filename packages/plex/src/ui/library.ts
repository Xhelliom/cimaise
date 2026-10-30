import { Item, Letter } from '../api/types';
import { Panel } from '../../../tv-core/src/router/router';
import { Key } from '../../../tv-core/src/keys';
import { createGrid, VirtualList } from '../../../tv-core/src/virtual/list';
import { Ctx, el, openable, PlexArg, resolve, tileInfo } from './context';
import { createDetailPanel } from './detail';
import { POSTER } from './images';
import { recordMeasure } from '../../../tv-core/src/diag';

export var PAGE_SIZE = 36;   // X-Plex-Container-Size : 6 colonnes × 6 lignes

var LABELS = '#ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

// Barre alphabétique : index de départ de chaque lettre dans le tri par titre (somme cumulée des tailles de
// /firstCharacter, dans l'ordre du serveur). Les lettres sans titre (ou hors # et A–Z) gardent size 0.
export function letterStarts(dirs: Letter[]): Array<{ label: string; start: number; size: number }> {
  var out = LABELS.map(function (l) { return { label: l, start: 0, size: 0 }; }), n = 0;
  for (var i = 0; i < dirs.length; i++) {
    var at = LABELS.indexOf(String(dirs[i].title).toUpperCase());
    if (at >= 0) { out[at].start = n; out[at].size += dirs[i].size; }
    n += dirs[i].size;
  }
  return out;
}

// Grille d'une bibliothèque : 6 colonnes de 240 px, pages de 36 demandées à mesure du défilement.
export function createLibraryPanel(arg: PlexArg, section: { key: string; title: string }): Panel {
  var c = resolve(arg) as Ctx;
  var doc = c.doc;
  var root = el(doc, 'plex-panel plex-library');
  var count = el(doc, 'plex-lib-count', '');
  var status = el(doc, 'plex-status', 'Chargement…');
  root.appendChild(el(doc, 'plex-lib-title', section.title));
  root.appendChild(count);
  var box = el(doc, 'plex-grid');
  root.appendChild(box);
  root.appendChild(status);
  var bar = el(doc, 'plex-alpha');
  root.appendChild(bar);
  var cells: HTMLElement[] = [];
  var starts: Array<{ label: string; start: number; size: number }> = [];
  var inBar = false, barAt = 0, curAt = -1;
  var items: Item[] = [];
  var cancels: Array<() => void> = [];
  var loaded: { [start: number]: boolean } = {};
  // Mesure (diagnostic) : ouverture → premières affiches posées ; réponse rendue pendant l'appel même = cache.
  var t0 = Date.now(), measured = false, opening = false;

  var list: VirtualList = createGrid({
    container: box, doc: doc, count: 0, cols: 6, itemW: POSTER.w, itemH: POSTER.h + 72, gap: 48, viewportW: 1800, viewportH: 880,
    pageSize: PAGE_SIZE,
    render: function (i) { return items[i] ? tileInfo(c.session, items[i], true) : null; },
    onPage: function (start, size) { if (!loaded[start]) fetchPage(start, size); },
    onSelect: function (i) {
      var t = items[i] && openable(items[i]);
      if (t) c.nav.push(createDetailPanel(arg, t));
    }
  });

  // Lettre qui contient l'élément : la dernière dont le départ est ≤ à l'index.
  function letterOf(i: number): number {
    var at = -1;
    for (var k = 0; k < starts.length; k++) if (starts[k].size > 0 && starts[k].start <= i) at = k;
    return at;
  }
  function paint(): void {
    for (var k = 0; k < cells.length; k++) {
      var c = cells[k].classList;
      if (k === curAt) c.add('cur'); else c.remove('cur');
      if (inBar && k === barAt) c.add('focus'); else c.remove('focus');
    }
  }
  function follow(): void {
    var at = starts.length ? letterOf(list.focus.index) : -1;
    if (at !== curAt) { curAt = at; paint(); }
  }
  function step(dir: number): void {
    for (var k = barAt + dir; k >= 0 && k < starts.length; k += dir) if (starts[k].size > 0) { barAt = k; return; }
  }
  function barKey(k: Key): boolean {
    if (k === 'up') step(-1);
    else if (k === 'down') step(1);
    else if (k === 'right') { inBar = false; list.setActive(true); }
    else if (k === 'enter') { inBar = false; list.setActive(true); list.jumpTo(starts[barAt].start); follow(); }
    else if (k !== 'left') return false;
    paint();
    return true;
  }

  function fetchPage(start: number, size: number): void {
    cancels.push(c.data.page(section.key, start, size, function (p) {
      loaded[start] = true;
      for (var i = 0; i < p.items.length; i++) items[p.offset + i] = p.items[i];
      status.textContent = '';
      count.textContent = p.total + ' éléments';
      if (p.total !== list.count) list.setCount(p.total); else list.refresh();
      follow();
      if (!measured && p.offset === 0) { measured = true; recordMeasure(opening ? 'biblio-cache' : 'biblio-reseau', Date.now() - t0); }
    }, function (e) {
      list.pageFailed(start);
      if (!items.length) status.textContent = 'Serveur Plex injoignable : ' + e.message;
    }));
  }
  cancels.push(c.data.letters(section.key, function (dirs) {
    starts = letterStarts(dirs);
    if (!cells.length) for (var k = 0; k < starts.length; k++) { cells.push(el(doc, 'plex-alpha-l' + (starts[k].size ? '' : ' empty'), starts[k].label)); bar.appendChild(cells[k]); }
    else for (var j = 0; j < cells.length; j++) { if (starts[j].size) cells[j].classList.remove('empty'); else cells[j].classList.add('empty'); }
    curAt = -1;
    follow();
  }));
  opening = true;
  fetchPage(0, PAGE_SIZE);
  opening = false;

  return {
    el: root,
    onKey: function (k: Key): boolean {
      if (inBar) return barKey(k);
      if (list.handleKey(k)) { follow(); return true; }
      if (k === 'left' && curAt >= 0 && list.count > 0) { inBar = true; barAt = curAt; list.setActive(false); paint(); return true; }
      return false;
    },
    suspend: function () { list.release(); },
    resume: function () { list.restore(); },
    destroy: function () { for (var i = 0; i < cancels.length; i++) cancels[i](); list.release(); }
  };
}
