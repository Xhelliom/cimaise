import { Item } from '../api/types';
import { Panel } from '../../../tv-core/src/router/router';
import { Key } from '../../../tv-core/src/keys';
import { createGrid, VirtualList } from '../../../tv-core/src/virtual/list';
import { Ctx, el, openable, PlexArg, resolve, tileInfo } from './context';
import { createDetailPanel } from './detail';
import { POSTER } from './images';
import { recordMeasure } from '../../../tv-core/src/diag';

export var PAGE_SIZE = 36;   // X-Plex-Container-Size : 6 colonnes × 6 lignes

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

  function fetchPage(start: number, size: number): void {
    cancels.push(c.data.page(section.key, start, size, function (p) {
      loaded[start] = true;
      for (var i = 0; i < p.items.length; i++) items[p.offset + i] = p.items[i];
      status.textContent = '';
      count.textContent = p.total + ' éléments';
      if (p.total !== list.count) list.setCount(p.total); else list.refresh();
      if (!measured && p.offset === 0) { measured = true; recordMeasure(opening ? 'biblio-cache' : 'biblio-reseau', Date.now() - t0); }
    }, function (e) {
      list.pageFailed(start);
      if (!items.length) status.textContent = 'Serveur Plex injoignable : ' + e.message;
    }));
  }
  opening = true;
  fetchPage(0, PAGE_SIZE);
  opening = false;

  return {
    el: root,
    onKey: function (k: Key): boolean { return list.handleKey(k); },
    suspend: function () { list.release(); },
    resume: function () { list.restore(); },
    destroy: function () { for (var i = 0; i < cancels.length; i++) cancels[i](); list.release(); }
  };
}
