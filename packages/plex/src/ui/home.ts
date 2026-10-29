import { Item, Section } from '../api/types';
import { Panel } from '../../../tv-core/src/router/router';
import { Key } from '../../../tv-core/src/keys';
import { createRow, VirtualList } from '../../../tv-core/src/virtual/list';
import { Ctx, el, openable, PlexArg, resolve, tileInfo } from './context';
import { createLibraryPanel } from './library';
import { createDetailPanel } from './detail';
import { POSTER } from './images';

var PITCH = 560;   // distance entre deux rangées (titre à y = 200, puis 760, comme le Dock)
var GAP = 48;

interface Hub { title: string; box: HTMLElement; list: VirtualList; items: any[]; }

// Accueil : En cours, Ajoutés récemment, Bibliothèques. Les rangées vides disparaissent ; seules la rangée courante et
// la suivante chargent leurs images, la précédente (hors écran) est libérée.
export function createHomePanel(arg: PlexArg): Panel {
  var c = resolve(arg) as Ctx;
  var doc = c.doc;
  var root = el(doc, 'plex-panel plex-home');
  var layer = el(doc, 'plex-hubs');
  var status = el(doc, 'plex-status', 'Chargement…');
  root.appendChild(layer);
  root.appendChild(status);
  var hubs: Hub[] = [];
  var active = 0;
  var cancels: Array<() => void> = [];
  var held = false;

  function visible(): Hub[] { return hubs.filter(function (h) { return h.items.length > 0; }); }
  function wants(h: Hub): boolean {
    var v = visible(), k = v.indexOf(h);
    return !held && k >= 0 && (k === active || k === active + 1);
  }

  function addHub(title: string, tile: (it: any, withImage: boolean) => any, open: (it: any) => void): Hub {
    var box = el(doc, 'plex-row');
    var h: Hub = { title: title, box: box, items: [], list: null as any };
    h.list = createRow({
      container: box, doc: doc, count: 0, itemW: POSTER.w, itemH: POSTER.h + 72, gap: GAP, viewportW: 1800, viewportH: POSTER.h + 72,
      render: function (i) { return h.items[i] ? tile(h.items[i], wants(h)) : null; },
      onSelect: function (i) { open(h.items[i]); }
    });
    var wrap = el(doc, 'plex-hub');
    wrap.appendChild(el(doc, 'plex-hub-title', title));
    wrap.appendChild(box);
    layer.appendChild(wrap);
    hubs.push(h);
    return h;
  }

  function openItem(it: Item): void {
    var target = openable(it);
    if (target) c.nav.push(createDetailPanel(arg, target));
  }

  // Positions : une rangée vide est masquée, les suivantes remontent. Le défilement vertical est un seul transform.
  function relayout(): void {
    var v = visible(), k = 0;
    for (var i = 0; i < hubs.length; i++) {
      var wrap = hubs[i].box.parentNode as HTMLElement;
      if (hubs[i].items.length === 0) { wrap.style.display = 'none'; continue; }
      wrap.style.display = '';
      wrap.style.transform = 'translate3d(0,' + k * PITCH + 'px,0)';
      k++;
    }
    if (active > v.length - 1) active = Math.max(0, v.length - 1);
    layer.style.transform = 'translate3d(0,' + -PITCH * active + 'px,0)';
    for (var j = 0; j < hubs.length; j++) {
      var on = v[active] === hubs[j];
      hubs[j].box.className = on ? 'plex-row on' : 'plex-row';
      hubs[j].list.setActive(on);
      hubs[j].list.refresh();
    }
    status.textContent = v.length ? '' : status.textContent;
  }

  function setItems(h: Hub, items: any[]): void {
    h.items = items;
    h.list.setCount(items.length);
    relayout();
  }

  function fail(e: Error): void { if (!visible().length) status.textContent = 'Serveur Plex injoignable : ' + e.message; }

  var onDeck = addHub('En cours', function (it, img) { return tileInfo(c.session, it, img); }, openItem);
  var recent = addHub('Ajoutés récemment', function (it, img) { return tileInfo(c.session, it, img); }, openItem);
  var libs = addHub('Bibliothèques', function (s: Section) { return { title: s.title, image: null }; }, function (s: Section) {
    c.nav.push(createLibraryPanel(arg, { key: s.key, title: s.title }));
  });
  cancels.push(c.data.onDeck(function (l) { setItems(onDeck, l); }, fail));
  cancels.push(c.data.recent(function (l) { setItems(recent, l); }, fail));
  cancels.push(c.data.sections(function (l) { setItems(libs, l); }, fail));

  return {
    el: root,
    onKey: function (k: Key): boolean {
      var v = visible();
      if (!v.length) return false;
      if (k === 'down') { if (active >= v.length - 1) return false; active++; relayout(); return true; }
      if (k === 'up') { if (active <= 0) return false; active--; relayout(); return true; }
      if (k === 'left' || k === 'right' || k === 'enter') return v[active].list.handleKey(k);
      return false;
    },
    suspend: function () { held = true; for (var i = 0; i < hubs.length; i++) hubs[i].list.release(); },
    resume: function () { held = false; for (var i = 0; i < hubs.length; i++) hubs[i].list.restore(); relayout(); },
    destroy: function () { for (var i = 0; i < cancels.length; i++) cancels[i](); for (var j = 0; j < hubs.length; j++) hubs[j].list.release(); }
  };
}
