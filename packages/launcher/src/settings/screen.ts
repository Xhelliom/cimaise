import { Key } from '../../../tv-core/src/keys';
import { Panel } from '../../../tv-core/src/router/router';
import { AppEntry, DiscoveredApp, removeAt, moveItem, setTint, nextTint, notInCatalog, addDiscovered } from './model';

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
  '.reglages .liste{position:absolute;left:120px;top:190px;width:1200px}' +
  '.reglages .ligne{display:flex;align-items:center;height:96px;margin-bottom:12px;padding:0 24px;border-radius:28px;font-size:34px;font-weight:300;color:rgba(255,255,255,.7)}' +
  '.reglages .ligne.focus{background:rgba(255,255,255,.1);color:#fff}' +
  '.reglages .ligne.saisie{background:rgba(255,255,255,.2)}' +
  '.reglages .tuile{width:64px;height:64px;margin-right:28px;border-radius:16px;display:flex;align-items:center;justify-content:center;font-size:32px;font-weight:500;overflow:hidden}' +
  '.reglages .tuile img{width:64px;height:64px}' +
  '.reglages .nom{flex:1}' +
  '.reglages .puce{margin-left:16px;padding:10px 24px;border-radius:24px;font-size:26px;font-weight:500;background:rgba(255,255,255,.08)}' +
  '.reglages .puce.focus{background:rgba(255,255,255,.9);color:#111;transform:scale(1.1)}' +
  '.reglages .bouton{font-weight:500;color:#fff}' +
  '.reglages .etat{position:absolute;left:120px;bottom:72px;font-size:28px;font-weight:300;color:rgba(255,255,255,.6)}' +
  '.reglages .titre-section{margin:28px 0 12px 24px;font-size:26px;font-weight:500;color:rgba(255,255,255,.5)}';

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
      var img = doc.createElement('img');
      img.setAttribute('src', icon);
      t.appendChild(img);
    } else t.textContent = monogram(name);
    return t;
  }

  function rowCount(): number { return 1 + catalog.length + found.length; }

  function render(): void {
    while (el.firstChild) el.removeChild(el.firstChild);
    var h = doc.createElement('h1');
    h.textContent = 'Réglages';
    el.appendChild(h);
    var list = div('liste');
    var btn = div('ligne bouton' + (row === 0 ? ' focus' : ''), 'Découvrir les apps installées');
    list.appendChild(btn);
    for (var i = 0; i < catalog.length; i++) {
      var r = i + 1, on = row === r;
      var line = div('ligne' + (on ? ' focus' : '') + (on && grabbed ? ' saisie' : ''));
      line.appendChild(tile(catalog[i].name, catalog[i].tint, catalog[i].icon));
      line.appendChild(div('nom', catalog[i].name));
      for (var c = 0; c < CHIPS.length; c++) {
        if (on) line.appendChild(div('puce' + (chip === c ? ' focus' : ''), CHIPS[c]));
      }
      list.appendChild(line);
    }
    if (found.length) list.appendChild(div('titre-section', 'Apps installées'));
    for (var f = 0; f < found.length; f++) {
      var fr = 1 + catalog.length + f, fon = row === fr;
      var fl = div('ligne' + (fon ? ' focus' : ''));
      fl.appendChild(tile(found[f].name, null, found[f].icon));
      fl.appendChild(div('nom', found[f].name));
      if (fon) fl.appendChild(div('puce focus', 'Ajouter'));
      list.appendChild(fl);
    }
    el.appendChild(list);
    if (status) el.appendChild(div('etat', status));
  }

  function changed(): void { opts.onChange(catalog.slice(0)); }

  function discover(): void {
    status = 'Recherche des apps installées…';
    opts.listInstalledApps(
      function (apps) {
        found = notInCatalog(catalog, apps);
        status = found.length ? '' : 'Aucune app à ajouter.';
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
        catalog = addDiscovered(catalog, app);
        found = notInCatalog(catalog, found);
        changed();
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
