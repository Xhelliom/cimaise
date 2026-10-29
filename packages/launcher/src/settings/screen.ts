import { applyIcon } from '../../../tv-core/src/icon';
import { Key } from '../../../tv-core/src/keys';
import { Panel } from '../../../tv-core/src/router/router';
import { AppEntry, DiscoveredApp, removeAt, moveItem, setTint, nextTint, addDiscovered, ROW_H, scrollOffset } from './model';
import { HomeMode, normalizeMode, normalizeTiles, TILES_CHOICES } from '../home/model';
import { fillIds } from '../catalog/model';
import { knownApp } from '../catalog/known-apps';

export interface SettingsOptions {
  catalog: AppEntry[];
  // Appelé seulement quand l'utilisateur presse « Découvrir » ; échoue hors TV (DeviceError explicite).
  listInstalledApps: (ok: (apps: DiscoveredApp[]) => void, fail: (err: Error) => void) => void;
  onChange: (catalog: AppEntry[]) => void;   // le propriétaire persiste
  mode?: HomeMode;                           // affichage de l'accueil ; défaut : grille
  onMode?: (mode: HomeMode) => void;         // le propriétaire persiste
  tiles?: number;                            // tuiles à l'écran : 4 (défaut), 5 ou 6
  onTiles?: (n: number) => void;             // le propriétaire persiste
  onClose: () => void;
  doc?: Document;
}

// Même langage que le Dock v2 : fond #0b0b0d, Outfit 300/500, tuiles de teinte, anneau blanc 6 px statique
// au focus, scale 1.1 (transform seul). Aucun flou, aucune image sauf l'icône d'une app qui en a une.
var CSS =
  '.reglages{position:absolute;left:0;top:0;width:1920px;height:1080px;background:#0b0b0d;color:#fff;font-family:Outfit,sans-serif;overflow:hidden}' +
  '.reglages h1{margin:72px 0 0 120px;font-size:56px;font-weight:300}' +
  '.reglages .vue{position:absolute;left:120px;top:190px;width:1200px;height:756px;overflow:hidden}' +
  '.reglages .liste{position:absolute;left:0;top:0;width:1200px}' +
  '.reglages .ligne{position:absolute;left:0;width:1200px;box-sizing:border-box;display:flex;align-items:center;height:96px;padding:0 24px;border-radius:28px;font-size:34px;font-weight:300;color:rgba(255,255,255,.7)}' +
  '.reglages .ligne.focus{background:rgba(255,255,255,.1);color:#fff}' +
  '.reglages .ligne.saisie{background:rgba(255,255,255,.2)}' +
  '.reglages .tuile{width:64px;height:64px;margin-right:28px;border-radius:16px;display:flex;align-items:center;justify-content:center;font-size:32px;font-weight:500;overflow:hidden}' +
  '.reglages .tuile img{width:64px;height:64px}' +
  '.reglages .nom{flex:1;min-width:0}' +
  '.reglages .nom .desc{margin-top:6px;font-size:22px;color:rgba(255,255,255,.5);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
  '.reglages .puce{margin-left:16px;padding:10px 24px;border-radius:24px;font-size:26px;font-weight:500;background:rgba(255,255,255,.08)}' +
  '.reglages .puce.focus{background:rgba(255,255,255,.9);color:#111;transform:scale(1.1)}' +
  '.reglages .bouton{font-weight:500;color:#fff}' +
  '.reglages .etat{position:absolute;left:120px;bottom:72px;font-size:28px;font-weight:300;color:rgba(255,255,255,.6)}' +
  '.reglages .titre-section{position:absolute;left:24px;height:96px;display:flex;align-items:center;font-size:26px;font-weight:500;color:rgba(255,255,255,.5)}' +
  '.reglages .deja{font-size:26px;color:rgba(255,255,255,.5)}';

var CHIPS = ['Couleur', 'Déplacer', 'Retirer'];

function monogram(name: string): string { return name ? name.charAt(0).toUpperCase() : '?'; }

export function createSettings(opts: SettingsOptions): Panel {
  var doc = opts.doc || document;
  var catalog = opts.catalog.slice(0);
  var found: DiscoveredApp[] = [];
  var mode: HomeMode = normalizeMode(opts.mode);
  var tiles = normalizeTiles(opts.tiles);
  var row = 0;      // -2 = affichage de l'accueil ; -1 = tuiles à l'écran ; 0 = bouton Découvrir ; 1..n = catalogue ; ensuite apps découvertes
  var chip = 0;
  var grabbed = false;
  var status = '';
  var offset = 0;   // défilement de la liste, en px

  var style = doc.createElement('style');
  style.textContent = CSS;
  (doc.head || doc.createElement('head')).appendChild(style);

  var el = doc.createElement('div');
  el.className = 'reglages';

  function div(cls: string, text?: string): HTMLElement {
    var d = doc.createElement('div');
    d.className = cls;
    if (text) d.textContent = text;
    return d;
  }

  function tile(name: string, tint: string | null, icon?: string): HTMLElement {
    var t = div('tuile');
    if (tint) t.style.background = tint;
    var k = knownApp(name);
    applyIcon(doc, t, icon || '', name, monogram(name), k ? k.logoUrl : undefined);
    return t;
  }

  function rowCount(): number { return 1 + catalog.length + found.length; }

  // Ligne sélectionnable -> position dans la liste (le titre de section occupe une ligne non sélectionnable).
  function posOf(r: number): number { return r + 2 + (found.length && r > catalog.length ? 1 : 0); }
  function totalPos(): number { return 3 + catalog.length + (found.length ? 1 + found.length : 0); }

  function absRow(node: HTMLElement, pos: number): HTMLElement {
    node.style.top = pos * ROW_H + 'px';
    return node;
  }

  // Fenêtrage : seules les lignes visibles (± 1) existent dans le DOM, même avec ~300 apps découvertes.
  function render(): void {
    while (el.firstChild) el.removeChild(el.firstChild);
    var h = doc.createElement('h1');
    h.textContent = 'Réglages';
    el.appendChild(h);
    offset = row <= 0 ? 0 : scrollOffset(offset, posOf(row), totalPos()); // la section Accueil et Découvrir restent en haut
    var vue = div('vue'), list = div('liste');
    list.style.transform = 'translateY(' + (offset ? -offset : 0) + 'px)';
    var total = totalPos();
    var from = Math.max(-2, Math.floor(offset / ROW_H) - 3), to = Math.min(total - 3, Math.ceil(offset / ROW_H) + 7); // pos = position visuelle - 2
    var inCat: { [id: string]: boolean } = {};
    for (var q = 0; q < catalog.length; q++) if (catalog[q].id) inCat[catalog[q].id] = true;
    for (var pos = from; pos <= to; pos++) {
      if (pos === -2) {
        var ml = div('ligne bouton' + (row === -2 ? ' focus' : ''));
        ml.appendChild(div('nom', 'Affichage de l’accueil'));
        ml.appendChild(div('puce' + (row === -2 ? ' focus' : ''), mode === 'grille' ? 'Grille' : 'Une rangée'));
        list.appendChild(absRow(ml, 0));
      } else if (pos === -1) {
        var tl = div('ligne bouton' + (row === -1 ? ' focus' : ''));
        tl.appendChild(div('nom', 'Tuiles à l’écran'));
        tl.appendChild(div('puce' + (row === -1 ? ' focus' : ''), '' + tiles));
        list.appendChild(absRow(tl, 1));
      } else if (pos === 0) {
        list.appendChild(absRow(div('ligne bouton' + (row === 0 ? ' focus' : ''), 'Découvrir les apps installées'), 2));
      } else if (pos <= catalog.length) {
        var i = pos - 1, on = row === pos;
        var line = div('ligne' + (on ? ' focus' : '') + (on && grabbed ? ' saisie' : ''));
        line.appendChild(tile(catalog[i].name, catalog[i].tint, catalog[i].icon));
        line.appendChild(div('nom', catalog[i].name));
        for (var c = 0; c < CHIPS.length; c++) {
          if (on) line.appendChild(div('puce' + (chip === c ? ' focus' : ''), CHIPS[c]));
        }
        list.appendChild(absRow(line, pos + 2));
      } else if (pos === catalog.length + 1) {
        list.appendChild(absRow(div('titre-section', 'Apps installées'), pos + 2));
      } else {
        var f = pos - catalog.length - 2, fon = row === pos - 1;
        var fl = div('ligne' + (fon ? ' focus' : ''));
        fl.appendChild(tile(found[f].name, null, found[f].icon));
        var fk = knownApp(found[f].name), nom = div('nom', fk ? undefined : found[f].name);
        if (fk) { nom.appendChild(div('', found[f].name)); nom.appendChild(div('desc', fk.desc)); }
        fl.appendChild(nom);
        if (inCat[found[f].id]) fl.appendChild(div('deja', 'Au catalogue'));
        else if (fon) fl.appendChild(div('puce focus', 'Ajouter'));
        list.appendChild(absRow(fl, pos + 2));
      }
    }
    list.style.height = total * ROW_H + 'px';
    vue.appendChild(list);
    el.appendChild(vue);
    if (status) el.appendChild(div('etat', status));
  }

  function toggleMode(): void {
    mode = mode === 'grille' ? 'rangee' : 'grille';
    if (opts.onMode) opts.onMode(mode);
  }

  // Un pas dans 4 / 5 / 6 (borné) ; Entrée avance et revient à 4 après 6.
  function stepTiles(d: number, wrap: boolean): void {
    var i = TILES_CHOICES.indexOf(tiles) + d;
    if (i >= TILES_CHOICES.length) i = wrap ? 0 : TILES_CHOICES.length - 1;
    if (i < 0) i = 0;
    if (TILES_CHOICES[i] === tiles) return;
    tiles = TILES_CHOICES[i];
    if (opts.onTiles) opts.onTiles(tiles);
  }

  function changed(): void { opts.onChange(catalog.slice(0)); }

  function discover(): void {
    status = 'Recherche des apps installées…';
    opts.listInstalledApps(
      function (apps) {
        var filled = fillIds(catalog, apps);
        var n = 0;
        for (var i = 0; i < filled.length; i++) if (filled[i] !== catalog[i]) n++;
        if (n) { catalog = filled; changed(); }
        found = apps;
        status = n ? n + (n > 1 ? ' ID complétés.' : ' ID complété.') : apps.length ? '' : 'Aucune app trouvée.';
        row = 0;
        render();
      },
      function (err) { status = err.message; found = []; render(); }
    );
    render();
  }

  function clampRow(): void {
    if (row >= rowCount()) row = rowCount() - 1;
    if (row < -2) row = -2;
  }

  function press(k: Key): boolean {
    var idx = row - 1; // index dans le catalogue si 1 ≤ row ≤ n
    var inCatalog = row >= 1 && row <= catalog.length;
    if (k === 'back') {
      if (grabbed) grabbed = false; else opts.onClose();
      render();
      return true;
    }
    if (grabbed) {
      if (k === 'up' || k === 'down') {
        var moved = moveItem(catalog, idx, k === 'up' ? -1 : 1);
        if (moved[idx] !== catalog[idx]) { catalog = moved; row += k === 'up' ? -1 : 1; changed(); }
      } else if (k === 'enter') grabbed = false;
      render();
      return true;
    }
    if (k === 'up' || k === 'down') {
      row += k === 'up' ? -1 : 1;
      clampRow();
      chip = 0;
    } else if (k === 'left' || k === 'right') {
      if (row === -2) toggleMode();
      else if (row === -1) stepTiles(k === 'left' ? -1 : 1, false);
      else if (inCatalog) chip = Math.max(0, Math.min(CHIPS.length - 1, chip + (k === 'left' ? -1 : 1)));
    } else if (k === 'enter') {
      if (row === -2) { toggleMode(); render(); return true; }
      if (row === -1) { stepTiles(1, true); render(); return true; }
      if (row === 0) { discover(); return true; }
      if (inCatalog) {
        if (chip === 0) { catalog = setTint(catalog, idx, nextTint(catalog[idx].tint)); changed(); }
        else if (chip === 1) grabbed = true;
        else { catalog = removeAt(catalog, idx); chip = 0; clampRow(); changed(); }
      } else {
        var app = found[row - 1 - catalog.length];
        var before = catalog.length;
        catalog = addDiscovered(catalog, app);
        if (catalog.length !== before) { row++; changed(); } // le catalogue grandit d'une ligne : le focus reste sur l'app
        clampRow();
      }
    } else return false;
    render();
    return true;
  }

  render();
  return {
    el: el,
    onKey: press,
    destroy: function () { if (style.parentNode) style.parentNode.removeChild(style); }
  };
}
