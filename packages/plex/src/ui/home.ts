import { Item, Section } from '../api/types';
import { Panel } from '../../../tv-core/src/router/router';
import { Key } from '../../../tv-core/src/keys';
import { createRow, VirtualList } from '../../../tv-core/src/virtual/list';
import { Ctx, el, openable, PlexArg, realTimers, resolve, tileInfo } from './context';
import { createLibraryPanel } from './library';
import { createDetailPanel } from './detail';
import { createSettingsPanel } from './settings';
import { createSearchPanel, ensureSearch } from './search';
import { POSTER } from './images';
import { createBand } from './band';

// Bandeau (maquette du 07/11, variante A) : fixe sur les 480 px du haut, avec l'en-tête sur une ligne (Rechercher, roue dentée,
// onglets). Les rangées défilent dessous, dans une zone découpée (.plex-home-rows, y = 488) : la rangée active y est toujours
// en haut (titre à y = 488, affiches à y = 558), la suivante pointe en bas ; la précédente sort entièrement de la zone.
var PITCH = 560;   // distance entre deux rangées
var GAP = 48;
// L'index des titres (recherche) se construit en arrière-plan une fois l'accueil posé : il ne dispute rien au premier affichage.
var INDEX_DELAY = 1500;

interface Hub { title: string; box: HTMLElement; list: VirtualList; items: any[]; }
type Zone = 'head' | 'tabs' | 'rows';

// Roue dentée en CSS (6 blocs, 0 image, 0 SVG) : 4 barres croisées = 8 dents, un disque, un trou de la couleur du bouton.
function gear(doc: Document): HTMLElement {
  var g = el(doc, 'plex-gear');
  for (var i = 0; i < 4; i++) { var b = el(doc, 'plex-gear-t'); b.style.transform = 'rotate(' + i * 45 + 'deg)'; g.appendChild(b); }
  g.appendChild(el(doc, 'plex-gear-d'));
  g.appendChild(el(doc, 'plex-gear-h'));
  return g;
}

// Accueil (maquettes du 30/10 et du 07/11) : bandeau de l'élément sélectionné, en-tête sur une ligne (« Rechercher un film,
// une série… », roue dentée des Réglages Plex, onglets en pilules des bibliothèques), puis les rangées En cours, Ajoutés
// récemment et Pas encore vus. Haut depuis la 1re rangée → onglets.
// Les rangées vides disparaissent ; les rangées à plus d'une rangée du visible (au-dessus comme en dessous) sont libérées ;
// une rangée partiellement visible garde ses images.
export function createHomePanel(arg: PlexArg): Panel {
  var c = resolve(arg) as Ctx;
  var doc = c.doc;
  var root = el(doc, 'plex-panel plex-home');
  var layer = el(doc, 'plex-hubs');
  var clip = el(doc, 'plex-home-rows');
  var status = el(doc, 'plex-status', 'Chargement…');
  var head = el(doc, 'plex-head');
  var searchBtn = el(doc, 'plex-search-btn');
  searchBtn.appendChild(el(doc, 'plex-ic-search'));
  searchBtn.appendChild(el(doc, 'plex-search-txt', 'Rechercher un film, une série…'));
  var gearBtn = el(doc, 'plex-gear-btn');
  gearBtn.appendChild(gear(doc));
  head.appendChild(searchBtn);
  head.appendChild(gearBtn);
  var tabsBox = el(doc, 'plex-tabs');
  // Sans minuteries (hors navigateur, sans injection) : pas d'index, et le bandeau change d'image sans délai.
  var timers = arg.timers || (typeof window !== 'undefined' ? realTimers() : null);
  var band = createBand(doc, c.session, timers);
  root.appendChild(band.el);
  root.appendChild(head);
  root.appendChild(tabsBox);
  clip.appendChild(layer);
  root.appendChild(clip);
  root.appendChild(status);
  var hubs: Hub[] = [];
  var active = 0;
  var zone: Zone = 'rows';
  var headIdx = 0;   // 0 = Rechercher, 1 = roue dentée
  var tabIdx = 0;
  var sections: Section[] = [];
  var tabEls: HTMLElement[] = [];
  var cancels: Array<() => void> = [];
  var held = false;

  function loaded(): boolean { return visible().length > 0 || sections.length > 0; }
  function visible(): Hub[] { return hubs.filter(function (h) { return h.items.length > 0; }); }
  function wants(h: Hub): boolean {
    var v = visible(), k = v.indexOf(h);
    // active + suivante (visibles), plus une rangée de marge au-dessus (demi-cachée par le décalage) et en dessous
    return !held && k >= 0 && k >= active - 1 && k <= active + 2;
  }
  // Zone qui porte vraiment le focus : sans rangée (chargement, serveur vide), il remonte aux onglets ou à l'en-tête.
  function current(): Zone {
    if (zone === 'rows' && !visible().length) return sections.length ? 'tabs' : 'head';
    if (zone === 'tabs' && !sections.length) return 'head';
    return zone;
  }

  function addHub(title: string, tile: (it: any, withImage: boolean) => any, open: (it: any) => void): Hub {
    var box = el(doc, 'plex-row'), more = el(doc, 'plex-more');
    var h: Hub = { title: title, box: box, items: [], list: null as any };
    h.list = createRow({
      container: box, doc: doc, count: 0, itemW: POSTER.w, itemH: POSTER.h + 72, gap: GAP, viewportW: 1800, viewportH: POSTER.h + 72, edge: more,
      render: function (i) { return h.items[i] ? tile(h.items[i], wants(h)) : null; },
      onSelect: function (i) { open(h.items[i]); }
    });
    var wrap = el(doc, 'plex-hub');
    wrap.appendChild(el(doc, 'plex-hub-title', title));
    wrap.appendChild(box);
    wrap.appendChild(more);
    layer.appendChild(wrap);
    hubs.push(h);
    return h;
  }

  // Onglets : « Accueil » (page courante, non focalisable) puis une pilule par bibliothèque, reconstruits à chaque réponse.
  function setSections(l: Section[]): void {
    sections = l;
    while (tabsBox.children.length) tabsBox.removeChild(tabsBox.children[0]);
    tabsBox.appendChild(el(doc, 'plex-tab here', 'Accueil'));
    tabEls = [];
    for (var i = 0; i < l.length; i++) { var t = el(doc, 'plex-tab', l[i].title); tabsBox.appendChild(t); tabEls.push(t); }
    if (tabIdx > l.length - 1) tabIdx = Math.max(0, l.length - 1);
    relayout();
  }

  // `aimed` : seul « En cours » vise l'épisode ; pour les ajouts (récents ou non vus), la fiche choisit elle-même l'épisode à suivre.
  function openItem(it: Item, aimed: boolean): void {
    var target = openable(it);
    if (target) c.nav.push(createDetailPanel(arg, target, aimed && it.type === 'episode' ? it : undefined));
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
    var z = current();
    for (var j = 0; j < hubs.length; j++) {
      var on = z === 'rows' && v[active] === hubs[j];
      hubs[j].box.className = on ? 'plex-row on' : 'plex-row';
      hubs[j].list.setActive(on);
      hubs[j].list.refresh();
    }
    searchBtn.className = z === 'head' && headIdx === 0 ? 'plex-search-btn focus' : 'plex-search-btn';
    gearBtn.className = z === 'head' && headIdx === 1 ? 'plex-gear-btn focus' : 'plex-gear-btn';
    for (var t = 0; t < tabEls.length; t++) tabEls[t].className = z === 'tabs' && t === tabIdx ? 'plex-tab focus' : 'plex-tab';
    status.textContent = loaded() ? '' : status.textContent;
    follow();
  }

  // Bandeau : l'élément sélectionné de la rangée active (il garde le dernier quand le focus monte dans l'en-tête).
  function follow(): void {
    var v = visible(), h = v[active];
    if (!h) return;
    if (current() === 'rows' || !shownOnce) { shownOnce = true; band.show(h.items[h.list.focus.index] || null); }
  }
  var shownOnce = false;

  function setItems(h: Hub, items: any[]): void {
    h.items = items;
    h.list.setCount(items.length);
    relayout();
  }

  function fail(e: Error): void { if (!loaded()) status.textContent = 'Serveur Plex injoignable : ' + e.message; }

  var onDeck = addHub('En cours', function (it, img) { return tileInfo(c.session, it, img); }, function (it) { openItem(it, true); });
  var recent = addHub('Ajoutés récemment', function (it, img) { return tileInfo(c.session, it, img); }, function (it) { openItem(it, false); });
  var unseen = addHub('Pas encore vus', function (it, img) { return tileInfo(c.session, it, img); }, function (it) { openItem(it, false); });
  setSections([]);
  var deckCancel: (() => void) | null = null;
  function loadDeck(): void {
    if (deckCancel) deckCancel();
    deckCancel = c.data.onDeck(function (l) { setItems(onDeck, l); }, fail);
  }
  loadDeck();
  // Sans minuteries : pas d'index ; la recherche le lance elle-même à son ouverture.
  var indexT: any = timers ? timers.setTimeout(function () { indexT = null; ensureSearch(arg, c).start(); }, INDEX_DELAY) : null;
  cancels.push(c.data.recent(function (l) { setItems(recent, l); }, fail));
  // Coût : une requête de plus à l'ouverture (/library/recentlyAdded?unwatched=1, ≈ 116 Ko de JSON sur le serveur du homelab,
  // même ordre que « Ajoutés récemment »), mise en cache 5 min comme elle ; aucune requête si le cache est frais.
  cancels.push(c.data.unseen(function (l) { setItems(unseen, l); }, fail));
  cancels.push(c.data.sections(setSections, fail));

  function go(z: Zone): boolean { zone = z; relayout(); return true; }
  // En-tête et onglets sont sur la même ligne : Rechercher · roue dentée · onglets. Gauche/Droite la parcourent (bornée aux
  // deux bouts, « Accueil » n'est pas focalisable), Bas → rangée active. Haut depuis les onglets → Rechercher (comme avant le
  // bandeau : Haut, Haut depuis la 1re rangée mène toujours à la recherche) ; Haut depuis Rechercher ou la roue est retenu.
  function headKey(k: Key): boolean {
    if (k === 'enter') { c.nav.push(headIdx === 0 ? createSearchPanel(arg) : createSettingsPanel(arg)); return true; }
    if (k === 'right' && headIdx === 1 && sections.length) { tabIdx = 0; return go('tabs'); }
    if (k === 'left' || k === 'right') { headIdx = k === 'left' ? 0 : 1; relayout(); return true; }
    if (k === 'down') return visible().length ? go('rows') : true;
    return k === 'up';
  }
  function tabsKey(k: Key): boolean {
    if (k === 'enter') { var s = sections[tabIdx]; c.nav.push(createLibraryPanel(arg, { key: s.key, title: s.title, type: s.type })); return true; }
    if (k === 'left' && tabIdx === 0) { headIdx = 1; return go('head'); }
    if (k === 'left' || k === 'right') { tabIdx = Math.max(0, Math.min(sections.length - 1, tabIdx + (k === 'left' ? -1 : 1))); relayout(); return true; }
    if (k === 'down') return visible().length ? go('rows') : true;
    if (k === 'up') { headIdx = 0; return go('head'); }
    return false;
  }

  return {
    el: root,
    onKey: function (k: Key): boolean {
      zone = current();
      if (zone === 'head') return headKey(k);
      if (zone === 'tabs') return tabsKey(k);
      if (k === 'up' && active === 0) return go(sections.length ? 'tabs' : 'head');
      var v = visible();
      if (k === 'down') { if (active >= v.length - 1) return false; active++; relayout(); return true; }
      if (k === 'up') { active--; relayout(); return true; }
      if (k === 'left' || k === 'right') { var moved = v[active].list.handleKey(k); follow(); return moved; }
      if (k === 'enter') return v[active].list.handleKey(k);
      return false;
    },
    suspend: function () { held = true; band.release(); for (var i = 0; i < hubs.length; i++) hubs[i].list.release(); },
    resume: function () { held = false; for (var i = 0; i < hubs.length; i++) hubs[i].list.restore(); band.restore(); relayout(); loadDeck(); },
    destroy: function () { if (indexT !== null && timers) timers.clearTimeout(indexT); if (deckCancel) deckCancel(); for (var i = 0; i < cancels.length; i++) cancels[i](); for (var j = 0; j < hubs.length; j++) hubs[j].list.release(); band.destroy(); }
  };
}
