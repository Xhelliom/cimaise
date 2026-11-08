import { Item, Letter } from '../api/types';
import { LibraryView } from '../api/library';
import { Panel } from '../../../tv-core/src/router/router';
import { Key } from '../../../tv-core/src/keys';
import { loadStored, saveStored } from '../../../tv-core/src/storage';
import { createGrid, createRow, VirtualList } from '../../../tv-core/src/virtual/list';
import { Ctx, el, openable, PlexArg, resolve, tileInfo } from './context';
import { createDetailPanel } from './detail';
import { POSTER } from './images';
import { recordMeasure } from '../../../tv-core/src/diag';
import { AGE_FILTERS, ageAllowed, ageCodes, ageFilter } from './age';

export var PAGE_SIZE = 36;   // X-Plex-Container-Size : 6 colonnes × 6 lignes

// Rangées en tête (En cours, Ajoutés récemment) : titre puis la rangée d’affiches ; la grille vient dessous.
// Tout défile d’un seul transform sur la couche : rangée active en haut, ou grille à sa place d’origine (rangées hors écran).
var ROW_PITCH = 560;

var LABELS = '#ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

// Tris proposés, dans l'ordre où Entrée les fait défiler sur la pilule. Défaut : par titre (seul tri avec barre alphabétique).
export var SORTS = [
  { id: 'added', label: 'Ajout récent', sort: 'addedAt:desc' },
  { id: 'title', label: 'Titre', sort: 'titleSort' },
  { id: 'year', label: 'Année', sort: 'year:desc' }
];
var TITLE = 1;

// Choix d'une bibliothèque : prefs.plexLibrary[clé de section] = { sort, unwatched, age } dans cimaise.v1
// (champs ajoutés sans changer le schéma : absent ou inconnu = tri par titre, tout afficher, tous âges).
export interface LibraryChoice { sort: string; unwatched: boolean; age?: string; }
export function loadLibraryChoice(sectionKey: string, store?: Storage): LibraryChoice {
  var all = loadStored(store).prefs.plexLibrary, v = all && typeof all === 'object' ? all[sectionKey] : null;
  var sort = v && typeof v.sort === 'string' ? v.sort : SORTS[TITLE].id;
  for (var i = 0; i < SORTS.length && SORTS[i].id !== sort; i++) { /* recherche */ }
  return { sort: i < SORTS.length ? sort : SORTS[TITLE].id, unwatched: !!(v && v.unwatched === true), age: ageFilter(v && v.age).id };
}
export function saveLibraryChoice(sectionKey: string, choice: LibraryChoice, store?: Storage): void {
  try {
    var data = loadStored(store);
    var all = data.prefs.plexLibrary && typeof data.prefs.plexLibrary === 'object' ? data.prefs.plexLibrary : {};
    var o: any = { sort: choice.sort, unwatched: choice.unwatched };
    if (choice.age && choice.age !== AGE_FILTERS[0].id) o.age = choice.age;   // « Tous » : rien d'écrit
    all[sectionKey] = o;
    data.prefs.plexLibrary = all;
    saveStored(data, store);
  } catch (e) { /* stockage refusé : le choix vaut pour cette ouverture seulement */ }
}

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

// `all` : rangée telle que reçue ; `items` : ce qui passe le filtre par âge (les mêmes sur « Tous »).
interface Row { title: string; wrap: HTMLElement; box: HTMLElement; list: VirtualList; items: Item[]; all: Item[]; }
type Zone = 'pills' | 'rows' | 'grid';

// Bibliothèque : rangées « En cours » et « Ajoutés récemment » de la section (masquées si vides), puis la grille :
// 6 colonnes de 240 px, pages de 36 demandées à mesure du défilement ; tri, non vus et âge (serveur) sur les pilules.
// Âge : la grille est filtrée par le serveur (contentRating=…, pagination et barre alpha justes), les rangées localement.
// Haut depuis la première ligne de la grille → dernière rangée → … → pilules ; Bas depuis la dernière rangée → grille.
// `type` : 'show' regroupe les ajouts par série (une tuile par série) ; absent = films.
export function createLibraryPanel(arg: PlexArg, section: { key: string; title: string; type?: string }): Panel {
  var c = resolve(arg) as Ctx;
  var doc = c.doc;
  var root = el(doc, 'plex-panel plex-library');
  var count = el(doc, 'plex-lib-count', '');
  var status = el(doc, 'plex-status', 'Chargement…');
  root.appendChild(el(doc, 'plex-lib-title', section.title));
  root.appendChild(count);
  var pills = el(doc, 'plex-lib-pills');
  var sortPill = el(doc, 'plex-pill'), unseenPill = el(doc, 'plex-pill', 'Non vus'), agePill = el(doc, 'plex-pill');
  var pillEls = [sortPill, unseenPill, agePill];
  for (var pe = 0; pe < pillEls.length; pe++) pills.appendChild(pillEls[pe]);
  root.appendChild(pills);
  var body = el(doc, 'plex-lib-body'), layer = el(doc, 'plex-lib-layer');
  body.appendChild(layer);
  root.appendChild(body);
  var box = el(doc, 'plex-grid');
  layer.appendChild(box);
  root.appendChild(status);
  var bar = el(doc, 'plex-alpha');
  layer.appendChild(bar);
  var rows: Row[] = [];
  var zone: Zone = 'rows', active = 0, held = false;
  var cells: HTMLElement[] = [];
  var starts: Array<{ label: string; start: number; size: number }> = [];
  var inBar = false, barAt = 0, curAt = -1;
  var inPills = false, pillAt = 0;
  var choice = loadLibraryChoice(section.key, arg.store);
  var items: Item[] = [];
  var cancels: Array<() => void> = [];   // requêtes du tri en cours, annulées au changement de tri ou de filtre
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

  function sortOf(): { id: string; label: string; sort: string } {
    for (var i = 0; i < SORTS.length; i++) if (SORTS[i].id === choice.sort) return SORTS[i];
    return SORTS[TITLE];
  }
  // `codes` : classifications permises pour l'âge choisi (null sur « Tous ») ; fixées à chaque load().
  var codes: string[] | null = null;
  function view(): LibraryView { return { sort: sortOf().sort, unwatched: choice.unwatched, ratings: codes }; }
  function byTitle(): boolean { return choice.sort === SORTS[TITLE].id; }
  function paintPills(): void {
    sortPill.textContent = 'Tri : ' + sortOf().label;
    if (choice.unwatched) unseenPill.classList.add('on'); else unseenPill.classList.remove('on');
    var a = ageFilter(choice.age);
    agePill.textContent = 'Âge : ' + a.label;
    if (a.max !== undefined) agePill.classList.add('on'); else agePill.classList.remove('on');
    var p = pillEls;
    for (var k = 0; k < p.length; k++) if (inPills && k === pillAt) p[k].classList.add('focus'); else p[k].classList.remove('focus');
  }

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
  function pillKey(k: Key): boolean {
    if (k === 'left') pillAt = Math.max(0, pillAt - 1);
    else if (k === 'right') pillAt = Math.min(pillEls.length - 1, pillAt + 1);
    else if (k === 'down') { inPills = false; go(shown().length ? 'rows' : 'grid', 0); }
    else if (k === 'enter') {
      if (pillAt === 0) { var i = 0; while (SORTS[i].id !== sortOf().id) i++; choice.sort = SORTS[(i + 1) % SORTS.length].id; }
      else if (pillAt === 1) choice.unwatched = !choice.unwatched;
      else { var at = 0; while (AGE_FILTERS[at].id !== ageFilter(choice.age).id) at++; choice.age = AGE_FILTERS[(at + 1) % AGE_FILTERS.length].id; filterRows(); }
      saveLibraryChoice(section.key, choice, arg.store);
      load();
    }
    else if (k !== 'up') return false;
    paintPills();
    return true;
  }

  function fetchPage(start: number, size: number): void {
    cancels.push(c.data.page(section.key, start, size, function (p) {
      loaded[start] = true;
      for (var i = 0; i < p.items.length; i++) items[p.offset + i] = p.items[i];
      status.textContent = p.total ? '' : codes ? 'Aucun titre de cet âge.' : choice.unwatched ? 'Tout a été vu.' : 'Bibliothèque vide.';
      count.textContent = p.total + (choice.unwatched ? ' non vus' : ' éléments');
      if (p.total !== list.count) list.setCount(p.total); else list.refresh();
      follow();
      if (!measured && p.offset === 0) { measured = true; recordMeasure(opening ? 'biblio-cache' : 'biblio-reseau', Date.now() - t0); }
    }, function (e) {
      list.pageFailed(start);
      if (!items.length) status.textContent = 'Serveur Plex injoignable : ' + e.message;
    }, view()));
  }
  // Barre alphabétique : seulement en tri par titre (index /firstCharacter, filtré comme la grille) ; masquée sinon.
  function fetchLetters(): void {
    starts = [];
    curAt = -1;
    inBar = false;
    if (!byTitle()) { bar.classList.add('off'); return; }
    bar.classList.remove('off');
    cancels.push(c.data.letters(section.key, function (dirs) {
      starts = letterStarts(dirs);
      if (!cells.length) for (var k = 0; k < starts.length; k++) { cells.push(el(doc, 'plex-alpha-l' + (starts[k].size ? '' : ' empty'), starts[k].label)); bar.appendChild(cells[k]); }
      else for (var j = 0; j < cells.length; j++) { if (starts[j].size) cells[j].classList.remove('empty'); else cells[j].classList.add('empty'); }
      curAt = -1;
      follow();
    }, undefined, view()));
  }
  // (Re)chargement complet : requêtes du choix précédent annulées, grille vidée, première page et index demandés.
  // Âge choisi : d'abord les classifications présentes dans la bibliothèque (une heure en cache), pour en tirer les codes.
  function clear(keep: number): void {
    for (var i = keep; i < cancels.length; i++) cancels[i]();
    cancels = cancels.slice(0, keep);
    items = [];
    loaded = {};
    if (list.count) list.reset();
    count.textContent = '';
    status.textContent = 'Chargement…';
  }
  function load(): void {
    clear(0);
    var a = ageFilter(choice.age);
    if (a.max === undefined) { codes = null; start(); return; }
    var got: string | null = null;
    cancels.push(c.data.ratings(section.key, function (present) {
      var l = ageCodes(present, a) as string[], k = l.join(',');
      if (k === got) return;   // réponse réseau identique au cache : rien à refaire
      if (got !== null) clear(1);   // le serveur a changé la liste depuis le cache : grille redemandée
      got = k;
      codes = l;
      if (l.length) start(); else empty();   // aucun titre de cet âge : pas de requête
    }, function (e) { status.textContent = 'Serveur Plex injoignable : ' + e.message; }));
  }
  function start(): void { fetchLetters(); paint(); fetchPage(0, PAGE_SIZE); }
  function empty(): void {
    starts = []; curAt = -1; inBar = false; bar.classList.add('off'); paint();
    count.textContent = '0 éléments';
    status.textContent = 'Aucun titre de cet âge.';
  }

  // ---- rangées en tête ----
  function shown(): Row[] { return rows.filter(function (r) { return r.items.length > 0; }); }
  // Zone qui porte vraiment le focus : sans rangée (chargement, rangées vides), il reste dans la grille.
  function current(): Zone { return zone === 'rows' && !shown().length ? 'grid' : zone; }
  // Images : rangée active et suivante (la grille est hors écran sous la 1re rangée pleine) ; aucune une fois dans la grille.
  function wants(r: Row): boolean { var k = shown().indexOf(r); return !held && current() === 'rows' && k >= active && k <= active + 1; }
  function addRow(title: string, aimed: boolean): Row {
    var wrap = el(doc, 'plex-hub'), rbox = el(doc, 'plex-row'), more = el(doc, 'plex-more');
    var r: Row = { title: title, wrap: wrap, box: rbox, items: [], all: [], list: null as any };
    r.list = createRow({
      container: rbox, doc: doc, count: 0, itemW: POSTER.w, itemH: POSTER.h + 72, gap: 48, viewportW: 1800, viewportH: POSTER.h + 72, edge: more,
      render: function (i) { return r.items[i] ? tileInfo(c.session, r.items[i], wants(r)) : null; },
      onSelect: function (i) {
        var it = r.items[i], t = it && openable(it);
        if (t) c.nav.push(createDetailPanel(arg, t, aimed && it.type === 'episode' ? it : undefined));
      }
    });
    wrap.appendChild(el(doc, 'plex-hub-title', title));
    wrap.appendChild(rbox);
    wrap.appendChild(more);
    layer.appendChild(wrap);
    rows.push(r);
    return r;
  }
  // Positions : rangées vides masquées, grille juste dessous ; un seul transform pour défiler.
  function relayout(): void {
    var v = shown(), z = current();
    for (var i = 0, n = 0; i < rows.length; i++) {
      if (!rows[i].items.length) { rows[i].wrap.style.display = 'none'; continue; }
      rows[i].wrap.style.display = '';
      rows[i].wrap.style.transform = 'translate3d(0,' + n * ROW_PITCH + 'px,0)';
      n++;
    }
    if (active > v.length - 1) active = Math.max(0, v.length - 1);
    var gridTop = v.length * ROW_PITCH + 'px';
    if (box.style.top !== gridTop) { box.style.top = gridTop; bar.style.top = gridTop; }
    var y = inPills ? 0 : z === 'rows' ? active * ROW_PITCH : v.length * ROW_PITCH;
    layer.style.transform = 'translate3d(0,' + -y + 'px,0)';
    for (var j = 0; j < rows.length; j++) {
      var on = !inPills && z === 'rows' && v[active] === rows[j];
      rows[j].box.className = on ? 'plex-row on' : 'plex-row';
      rows[j].list.setActive(on);
      rows[j].list.refresh();
    }
    list.setActive(!inPills && !inBar && z === 'grid');
  }
  function go(z: Zone, at: number): boolean { zone = z; active = at; relayout(); return true; }
  function toPills(): void { inPills = true; pillAt = 0; relayout(); paintPills(); }
  function rowKey(k: Key): boolean {
    var v = shown();
    if (k === 'up') { if (active > 0) return go('rows', active - 1); toPills(); return true; }
    if (k === 'down') { if (active < v.length - 1) return go('rows', active + 1); return list.count > 0 ? go('grid', active) : true; }
    if (k === 'left' || k === 'right' || k === 'enter') return v[active].list.handleKey(k);
    return false;
  }
  function keep(l: Item[]): Item[] {
    var a = ageFilter(choice.age);
    return a.max === undefined ? l : l.filter(function (it) { return ageAllowed(it.contentRating, a); });
  }
  function setRow(r: Row, l: Item[]): void { r.all = l; r.items = keep(l); r.list.setCount(r.items.length); relayout(); }
  // Âge changé : rangées refiltrées sur place (rien de redemandé) ; le focus revient à leur début.
  function filterRows(): void {
    for (var i = 0; i < rows.length; i++) { rows[i].items = keep(rows[i].all); rows[i].list.reset(); rows[i].list.setCount(rows[i].items.length); }
    relayout();
  }
  var deckRow = addRow('En cours', true), recentRow = addRow('Ajoutés récemment', false);
  var rowCancels: Array<() => void> = [], deckCancel: (() => void) | null = null;
  function quiet(): void { /* rangée absente : la grille suffit */ }
  // Coût : deux requêtes de plus à l'ouverture (≈ 0,4 à 29 Ko et 41 à 59 Ko de JSON), en cache 5 min comme l'accueil.
  function loadDeck(): void {
    if (deckCancel) deckCancel();
    deckCancel = c.data.sectionDeck(section.key, function (l) { setRow(deckRow, l); }, quiet);
  }
  loadDeck();
  rowCancels.push(c.data.sectionRecent(section.key, section.type === 'show', function (l) { setRow(recentRow, l); }, quiet));

  paintPills();
  opening = true;
  load();
  opening = false;

  return {
    el: root,
    onKey: function (k: Key): boolean {
      if (inPills) return pillKey(k);
      zone = current();
      if (zone === 'rows') return rowKey(k);
      if (inBar) return barKey(k);
      if (list.handleKey(k)) { follow(); return true; }
      if (k === 'left' && curAt >= 0 && list.count > 0) { inBar = true; barAt = curAt; list.setActive(false); paint(); return true; }
      if (k === 'up') { var v = shown(); if (v.length) return go('rows', v.length - 1); toPills(); return true; }
      return false;
    },
    suspend: function () { held = true; list.release(); for (var i = 0; i < rows.length; i++) rows[i].list.release(); },
    resume: function () { held = false; list.restore(); for (var i = 0; i < rows.length; i++) rows[i].list.restore(); relayout(); loadDeck(); },
    destroy: function () {
      for (var i = 0; i < cancels.length; i++) cancels[i]();
      for (var j = 0; j < rowCancels.length; j++) rowCancels[j]();
      if (deckCancel) deckCancel();
      list.release();
      for (var r = 0; r < rows.length; r++) rows[r].list.release();
    }
  };
}
