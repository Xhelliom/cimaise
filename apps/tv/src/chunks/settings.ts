import { Panel } from '../../../../packages/tv-core/src/router/router';
import { createSettings } from '../../../../packages/launcher/src/settings';
import { AppEntry, DiscoveredApp } from '../../../../packages/launcher/src/settings/model';
import { loadLangPrefs, saveLangPrefs } from '../../../../packages/tv-core/src/langprefs';
import { HomeMode } from '../../../../packages/launcher/src/home/model';
import { CatalogEntry } from '../../../../packages/launcher/src/catalog/model';
import { defaultCatalog } from '../../../../packages/launcher/src/catalog/defaults';
import { HaSettings } from '../../../../packages/launcher/src/settings/scenes';

// Les Réglages travaillent sur AppEntry (teinte) ; le catalogue persisté est un CatalogEntry (couleur, type, rappel).
// Au retour, on retrouve l'entrée d'origine (id + nom) pour ne pas perdre `type` ni `todo` (plusieurs entrées peuvent avoir un id vide).
export interface SettingsArg {
  catalog: CatalogEntry[];
  listInstalledApps: (ok: (apps: DiscoveredApp[]) => void, fail: (err: Error) => void) => void;
  mode?: HomeMode;
  onMode?: (mode: HomeMode) => void;
  tiles?: number;
  onTiles?: (n: number) => void;
  onChange: (catalog: CatalogEntry[]) => void;
  ha?: HaSettings;
  onClose: () => void;
}

// Modules internes que la découverte de la TV ne peut pas lister (ex. Plex intégré) : proposés dans « Apps intégrées ».
function internals(): CatalogEntry[] { return defaultCatalog().filter(function (c) { return c.type === 'interne'; }); }

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
  var ins = internals();
  for (var k = 0; k < ins.length; k++) if (ins[k].id === a.id && ins[k].name === a.name) return { id: a.id, name: a.name, color: a.tint, type: 'interne' };
  var n: CatalogEntry = { id: a.id, name: a.name, color: a.tint, type: 'tv' };
  if (a.icon) n.icon = a.icon;
  return n;
}

function createPanel(arg: SettingsArg): Panel {
  var current = arg.catalog, langs = loadLangPrefs();
  return createSettings({
    catalog: current.map(toApp),
    internalApps: internals().map(toApp),
    // Hors TV l'adaptateur lève (DeviceError) au lieu d'appeler fail : on ramène ça au rappel d'erreur de l'écran.
    listInstalledApps: function (ok, fail) {
      try { arg.listInstalledApps(ok, fail); } catch (e) { fail(e as Error); }
    },
    onChange: function (apps) {
      var next = apps.map(function (a) { return toEntry(a, current); });
      current = next;
      arg.onChange(next);
    },
    ha: arg.ha,
    mode: arg.mode,
    onMode: arg.onMode,
    tiles: arg.tiles,
    onTiles: arg.onTiles,
    // Langues par défaut du lecteur Plex : lues et écrites ici (chunk chargé à la demande), pas dans le bundle initial.
    audioLang: langs.audioLang,
    onAudioLang: function (code) { try { saveLangPrefs({ audioLang: code }); } catch (e) { /* stockage refusé : valable pour cette session */ } },
    subLang: langs.subLang,
    onSubLang: function (code) { try { saveLangPrefs({ subLang: code }); } catch (e) { /* stockage refusé : valable pour cette session */ } },
    onClose: arg.onClose
  });
}

(function (w: any) {
  (w.__cimaiseChunks || (w.__cimaiseChunks = {})).settings = { createPanel: createPanel };
})(window);
