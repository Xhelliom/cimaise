import { Item, Section } from '../api/types';
import { searchHubs } from '../api/library';
import { Panel } from '../../../tv-core/src/router/router';
import { Key } from '../../../tv-core/src/keys';
import { createKeyboard, Keyboard } from '../../../tv-core/src/keyboard';
import { createRow, VirtualList } from '../../../tv-core/src/virtual/list';
import { loadStored, saveStored } from '../../../tv-core/src/storage';
import { recordMeasure } from '../../../tv-core/src/diag';
import { Ctx, el, openable, PlexArg, realTimers, resolve, tileTitle } from './context';
import { createDetailPanel } from './detail';
import { SEARCH_POSTER, searchPosterUrl } from './images';
import { createSearchIndex, foldTitle, Hit, SearchIndex } from './search-index';

var RENDER_DELAY = 0;      // les résultats ne se calculent qu'après la peinture du caractère : le clavier passe toujours d'abord
var IMAGE_DELAY = 150;     // vignettes après le texte, et seulement quand la frappe s'est calmée (pas d'affiche demandée par lettre)
var SERVER_DELAY = 400;    // silence avant d'interroger le serveur
var MIN_SERVER = 2;
var KEEP = 5;
var SERVER_LIMIT = 12;
var PITCH = 300, GAP = 16;

// Dernières recherches : prefs.plexSearches dans cimaise.v1 (champ ajouté sans changer le schéma : absent = aucune).
export function loadRecentSearches(store?: Storage): string[] {
  var l = loadStored(store).prefs.plexSearches;
  return l instanceof Array ? l.filter(function (s) { return typeof s === 'string'; }).slice(0, KEEP) : [];
}
export function rememberSearch(text: string, store?: Storage): void {
  var q = text.replace(/^\s+|\s+$/g, '');
  if (foldTitle(q).length < MIN_SERVER) return;
  var f = foldTitle(q);
  var rest = loadRecentSearches(store).filter(function (s) { return foldTitle(s) !== f; });
  rest.unshift(q);
  try {
    var data = loadStored(store);
    data.prefs.plexSearches = rest.slice(0, KEEP);
    saveStored(data, store);
  } catch (e) { /* stockage refusé : la liste vaut pour cette session seulement */ }
}

// L'index est partagé par tous les écrans de la session (l'accueil le lance, la recherche le lit) : posé sur l'argument.
export function ensureSearch(arg: PlexArg, c: Ctx): SearchIndex {
  if (!arg.search) {
    arg.search = createSearchIndex({ http: arg.http, id: c.id, session: c.session, cache: c.cache, timers: arg.timers || realTimers(), sections: c.data.sections });
  }
  return arg.search;
}

interface Row { type: string; title: string; box: HTMLElement; wrap: HTMLElement; list: VirtualList; items: Item[]; }

function asItem(h: Hit): Item { return { ratingKey: h.ratingKey, type: h.type, title: h.title, year: h.year || undefined, thumb: h.thumb }; }

// Recherche : clavier à gauche, résultats à droite en rangées (Films, Séries, Épisodes). Les films et séries viennent de l'index
// local (instantané) ; le serveur ne complète que pour les épisodes (et ce que l'index ne couvre pas), après un court silence.
export function createSearchPanel(arg: PlexArg): Panel {
  var c = resolve(arg) as Ctx;
  var doc = c.doc;
  var timers = arg.timers || realTimers();
  var index = ensureSearch(arg, c);
  var root = el(doc, 'plex-panel plex-search');
  var kbBox = el(doc, 'plex-search-kb');
  var resBox = el(doc, 'plex-search-res');
  var note = el(doc, 'plex-search-note', '');
  var recentBox = el(doc, 'plex-recents');
  root.appendChild(el(doc, 'plex-lib-title', 'Rechercher'));
  root.appendChild(kbBox);
  root.appendChild(resBox);
  root.appendChild(recentBox);
  root.appendChild(note);

  var q = '', changedAt = 0;
  var renderT: any = null, imageT: any = null, serverT: any = null;
  var req: { abort(): void } | null = null;
  var srv: { q: string; movies: Item[]; shows: Item[]; episodes: Item[] } | null = null;
  var images = false, held = false, zone: 'kb' | 'res' = 'kb', active = 0, recentAt = 0;
  var recents = loadRecentSearches(arg.store);
  var sectionKeys: string[] | null = null;
  var cancels: Array<() => void> = [];

  function visible(): Row[] { return rows.filter(function (r) { return r.items.length > 0; }); }
  function addRow(type: string, title: string): Row {
    var box = el(doc, 'plex-row'), wrap = el(doc, 'plex-hub');
    var r: Row = { type: type, title: title, box: box, wrap: wrap, items: [], list: null as any };
    r.list = createRow({
      container: box, doc: doc, count: 0, itemW: SEARCH_POSTER.w, itemH: SEARCH_POSTER.h + 64, gap: GAP, viewportW: 560, viewportH: SEARCH_POSTER.h + 64,
      render: function (i) {
        var it = r.items[i];
        return it ? { title: tileTitle(it), image: images && !held ? searchPosterUrl(c.session, it) : null } : null;
      },
      onSelect: function (i) { open(r.items[i]); }
    });
    wrap.appendChild(el(doc, 'plex-hub-title', title));
    wrap.appendChild(box);
    resBox.appendChild(wrap);
    return r;
  }
  var rows: Row[] = [addRow('movie', 'Films'), addRow('show', 'Séries'), addRow('episode', 'Épisodes')];

  function open(it: Item): void {
    var target = openable(it);
    if (!target) return;
    rememberSearch(q, arg.store);
    c.nav.push(createDetailPanel(arg, target, it.type === 'episode' ? it : undefined));
  }

  function layout(): void {
    var v = visible(), k = 0;
    for (var i = 0; i < rows.length; i++) {
      var on = zone === 'res' && v[active] === rows[i];
      if (rows[i].items.length === 0) { rows[i].wrap.style.display = 'none'; continue; }
      rows[i].wrap.style.display = '';
      rows[i].wrap.style.transform = 'translate3d(0,' + k * PITCH + 'px,0)';
      k++;
      rows[i].box.className = on ? 'plex-row on' : 'plex-row';
      rows[i].list.setActive(on);
    }
    if (active > v.length - 1) active = Math.max(0, v.length - 1);
    paintRecents();
  }

  function paintRecents(): void {
    while (recentBox.children.length) recentBox.removeChild(recentBox.children[0]);
    if (q !== '' || recents.length === 0) return;
    recentBox.appendChild(el(doc, 'plex-hub-title plex-recent-title', 'Dernières recherches'));
    for (var i = 0; i < recents.length; i++) {
      recentBox.appendChild(el(doc, i === recentAt && zone === 'res' ? 'plex-recent-item focus' : 'plex-recent-item', recents[i]));
    }
  }

  function setRow(r: Row, items: Item[]): void {
    r.items = items;
    r.list.setCount(items.length);
    r.list.refresh();
  }

  function paint(): void {
    var local = q === '' ? { movies: [], shows: [] } : index.search(q);
    var m = local.movies.map(asItem), s = local.shows.map(asItem), e: Item[] = [];
    if (srv && srv.q === q) {
      var seen: { [k: string]: boolean } = {};
      for (var i = 0; i < m.length; i++) seen[m[i].ratingKey] = true;
      for (var j = 0; j < s.length; j++) seen[s[j].ratingKey] = true;
      m = m.concat(srv.movies.filter(function (x) { return !seen[x.ratingKey]; }));
      s = s.concat(srv.shows.filter(function (x) { return !seen[x.ratingKey]; }));
      e = srv.episodes;
    }
    setRow(rows[0], m); setRow(rows[1], s); setRow(rows[2], e);
    layout();
    var none = q !== '' && !m.length && !s.length && !e.length;
    note.textContent = none && (index.complete() && (foldTitle(q).length < MIN_SERVER || (srv !== null && srv.q === q))) ? 'Aucun résultat pour « ' + q + ' »'
      : q !== '' && !index.complete() ? 'Index des titres en cours de construction…' : '';
    if (zone === 'res' && q !== '' && visible().length === 0) zone = 'kb';
  }

  function sectionOk(h: { Metadata?: Item[] }): Item[] { return h.Metadata || []; }
  function askServer(): void {
    serverT = null;
    var asked = q;
    req = searchHubs(c.http, c.id, c.session, asked, sectionKeys, SERVER_LIMIT, function (err, hubs) {
      req = null;
      if (err || !hubs || asked !== q) return;
      var out = { q: asked, movies: [] as Item[], shows: [] as Item[], episodes: [] as Item[] };
      for (var i = 0; i < hubs.length; i++) {
        var h = hubs[i];
        // Musique, acteurs et le reste : hors périmètre (les acteurs sont des étiquettes, sans fiche à ouvrir).
        if (h.type === 'movie') out.movies = sectionOk(h);
        else if (h.type === 'show') out.shows = sectionOk(h);
        else if (h.type === 'episode') out.episodes = sectionOk(h);
      }
      srv = out;
      paint();
      recordMeasure('recherche-serveur', timers.now() - changedAt);
    });
  }

  function onChange(v: string): void {
    q = v;
    changedAt = timers.now();
    srv = null;
    if (req) { req.abort(); req = null; }
    if (serverT !== null) { timers.clearTimeout(serverT); serverT = null; }
    if (renderT !== null) timers.clearTimeout(renderT);
    renderT = timers.setTimeout(function () {
      renderT = null;
      images = false;
      paint();
      if (q !== '') recordMeasure('recherche', timers.now() - changedAt);
      if (imageT !== null) timers.clearTimeout(imageT);
      imageT = timers.setTimeout(function () {
        imageT = null; images = true;
        for (var i = 0; i < rows.length; i++) rows[i].list.refresh();
      }, IMAGE_DELAY);
    }, RENDER_DELAY);
    if (foldTitle(v).length >= MIN_SERVER) serverT = timers.setTimeout(askServer, SERVER_DELAY);
  }

  // Vers les résultats (ou les dernières recherches quand le champ est vide) ; false s'il n'y a rien où aller.
  function toResults(): boolean {
    if (q === '' ? recents.length === 0 : visible().length === 0) return false;
    zone = 'res'; active = 0; recentAt = 0;
    layout();
    return true;
  }
  function toKeyboard(): void { zone = 'kb'; layout(); }

  var kb: Keyboard = createKeyboard({
    container: kbBox, doc: doc, placeholder: 'Un film, une série…',
    onChange: onChange,
    onSubmit: function () { rememberSearch(q, arg.store); recents = loadRecentSearches(arg.store); toResults(); }
  });

  cancels.push(c.data.sections(function (l: Section[]) { sectionKeys = l.map(function (s) { return s.key; }); }, function () { /* sans filtre : le client trie par type */ }));
  index.start(function () { if (q !== '') paint(); else note.textContent = ''; });
  paint();

  function onKeyRes(k: Key): boolean {
    if (q === '') {   // dernières recherches
      if (k === 'up') { if (recentAt > 0) recentAt--; else return false; paintRecents(); return true; }
      if (k === 'down') { if (recentAt < recents.length - 1) recentAt++; paintRecents(); return true; }
      if (k === 'left') { toKeyboard(); return true; }
      if (k === 'enter') {
        kb.setValue(recents[recentAt]);
        zone = 'kb';
        onChange(recents[recentAt]);
        return true;
      }
      return false;
    }
    var v = visible();
    if (k === 'down') { if (active < v.length - 1) { active++; layout(); } return true; }
    if (k === 'up') { if (active > 0) { active--; layout(); } else toKeyboard(); return true; }
    if (k === 'left') { if (!v[active].list.handleKey('left')) toKeyboard(); return true; }
    if (k === 'right' || k === 'enter') return v[active].list.handleKey(k);
    return false;
  }

  return {
    el: root,
    onKey: function (k: Key): boolean {
      if (zone === 'res') return onKeyRes(k);
      if (k === 'back') return false;   // le routeur dépile
      if (k === 'right' && !kb.canMove('right')) { toResults(); return true; }
      var t0 = timers.now(), before = kb.getValue();
      var used = kb.handleKey(k);
      if (kb.getValue() !== before) recordMeasure('frappe', timers.now() - t0);
      return used;
    },
    suspend: function () { held = true; for (var i = 0; i < rows.length; i++) rows[i].list.release(); },
    resume: function () { held = false; for (var i = 0; i < rows.length; i++) { rows[i].list.restore(); rows[i].list.refresh(); } recents = loadRecentSearches(arg.store); layout(); },
    destroy: function () {
      if (req) req.abort();
      if (renderT !== null) timers.clearTimeout(renderT);
      if (imageT !== null) timers.clearTimeout(imageT);
      if (serverT !== null) timers.clearTimeout(serverT);
      for (var i = 0; i < cancels.length; i++) cancels[i]();
      for (var j = 0; j < rows.length; j++) rows[j].list.release();
      kb.destroy();
    }
  };
}
