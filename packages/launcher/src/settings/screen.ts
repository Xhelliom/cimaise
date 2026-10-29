import { applyIcon } from '../../../tv-core/src/icon';
import { Key } from '../../../tv-core/src/keys';
import { Panel } from '../../../tv-core/src/router/router';
import { AppEntry, DiscoveredApp, removeAt, moveItem, setTint, nextTint, addDiscovered, ROW_H, scrollOffset } from './model';
import { fillIds } from '../catalog/model';

export interface SettingsOptions {
  catalog: AppEntry[];
  // Appelé seulement quand l'utilisateur presse « Découvrir » ; échoue hors TV (DeviceError explicite).
  listInstalledApps: (ok: (apps: DiscoveredApp[]) => void, fail: (err: Error) => void) => void;
  onChange: (catalog: AppEntry[]) => void;   // le propriétaire persiste
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
  '.reglages .nom{flex:1}' +
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
  var row = 0;      // 0 = bouton Découvrir ; 1..n = catalogue ; ensuite apps découvertes
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
    if (icon) {
      applyIcon(doc, t, icon, name, monogram(name));
    } else t.textContent = monogram(name);
    return t;
  }

  function rowCount(): number { return 1 + catalog.length + found.length; }

  // Ligne sélectionnable -> position dans la liste (le titre de section occupe une ligne non sélectionnable).
  function posOf(r: number): number { return r + (found.length && r > catalog.length ? 1 : 0); }
  function totalPos(): number { return 1 + catalog.length + (found.length ? 1 + found.length : 0); }

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
    offset = scrollOffset(offset, posOf(row), totalPos());
    var vue = div('vue'), list = div('liste');
    list.style.transform = 'translateY(' + (offset ? -offset : 0) + 'px)';
    var total = totalPos();
    var from = Math.max(0, Math.floor(offset / ROW_H) - 1), to = Math.min(total - 1, Math.ceil(offset / ROW_H) + 8);
    var inCat: { [id: string]: boolean } = {};
    for (var q = 0; q < catalog.length; q++) if (catalog[q].id) inCat[catalog[q].id] = true;
    for (var pos = from; pos <= to; pos++) {
      if (pos === 0) {
        list.appendChild(absRow(div('ligne bouton' + (row === 0 ? ' focus' : ''), 'Découvrir les apps installées'), 0));
      } else if (pos <= catalog.length) {
        var i = pos - 1, on = row === pos;
        var line = div('ligne' + (on ? ' focus' : '') + (on && grabbed ? ' saisie' : ''));
        line.appendChild(tile(catalog[i].name, catalog[i].tint, catalog[i].icon));
        line.appendChild(div('nom', catalog[i].name));
        for (var c = 0; c < CHIPS.length; c++) {
          if (on) line.appendChild(div('puce' + (chip === c ? ' focus' : ''), CHIPS[c]));
        }
        list.appendChild(absRow(line, pos));
      } else if (pos === catalog.length + 1) {
        list.appendChild(absRow(div('titre-section', 'Apps installées'), pos));
      } else {
        var f = pos - catalog.length - 2, fon = row === pos - 1;
        var fl = div('ligne' + (fon ? ' focus' : ''));
        fl.appendChild(tile(found[f].name, null, found[f].icon));
        fl.appendChild(div('nom', found[f].name));
        if (inCat[found[f].id]) fl.appendChild(div('deja', 'Au catalogue'));
        else if (fon) fl.appendChild(div('puce focus', 'Ajouter'));
        list.appendChild(absRow(fl, pos));
      }
    }
    list.style.height = total * ROW_H + 'px';
    vue.appendChild(list);
    el.appendChild(vue);
    if (status) el.appendChild(div('etat', status));
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
    if (row < 0) row = 0;
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
      if (inCatalog) chip = Math.max(0, Math.min(CHIPS.length - 1, chip + (k === 'left' ? -1 : 1)));
    } else if (k === 'enter') {
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
