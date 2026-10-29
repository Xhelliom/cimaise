import { Panel } from '../../../../packages/tv-core/src/router/router';
import { createSettings } from '../../../../packages/launcher/src/settings';
import { AppEntry, DiscoveredApp } from '../../../../packages/launcher/src/settings/model';
import { HomeMode } from '../../../../packages/launcher/src/home/model';
import { CatalogEntry } from '../../../../packages/launcher/src/catalog/model';

// Les Réglages travaillent sur AppEntry (teinte) ; le catalogue persisté est un CatalogEntry (couleur, type, rappel).
// Au retour, on retrouve l'entrée d'origine (id + nom) pour ne pas perdre `type` ni `todo` (plusieurs entrées peuvent avoir un id vide).
export interface SettingsArg {
  catalog: CatalogEntry[];
  listInstalledApps: (ok: (apps: DiscoveredApp[]) => void, fail: (err: Error) => void) => void;
  mode?: HomeMode;
  onMode?: (mode: HomeMode) => void;
  onChange: (catalog: CatalogEntry[]) => void;
  onClose: () => void;
}

function toApp(c: CatalogEntry): AppEntry { return { id: c.id, name: c.name, icon: c.icon, tint: c.color }; }

function toEntry(a: AppEntry, from: CatalogEntry[]): CatalogEntry {
  for (var i = 0; i < from.length; i++) {
    var o = from[i];
    if (o.id === a.id && o.name === a.name) {
      var e: CatalogEntry = { id: o.id, name: o.name, color: a.tint, type: o.type };
      if (o.icon) e.icon = o.icon;
      if (o.todo) e.todo = o.todo;
      return e;
    }
  }
  var n: CatalogEntry = { id: a.id, name: a.name, color: a.tint, type: 'tv' };
  if (a.icon) n.icon = a.icon;
  return n;
}

function createPanel(arg: SettingsArg): Panel {
  var current = arg.catalog;
  return createSettings({
    catalog: current.map(toApp),
    // Hors TV l'adaptateur lève (DeviceError) au lieu d'appeler fail : on ramène ça au rappel d'erreur de l'écran.
    listInstalledApps: function (ok, fail) {
      try { arg.listInstalledApps(ok, fail); } catch (e) { fail(e as Error); }
    },
    onChange: function (apps) {
      var next = apps.map(function (a) { return toEntry(a, current); });
      current = next;
      arg.onChange(next);
    },
    mode: arg.mode,
    onMode: arg.onMode,
    onClose: arg.onClose
  });
}

(function (w: any) {
  (w.__cimaiseChunks || (w.__cimaiseChunks = {})).settings = { createPanel: createPanel };
})(window);
