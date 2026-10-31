import { Panel } from '../../../../packages/tv-core/src/router/router';
import { createSettings, ModuleRow } from '../../../../packages/launcher/src/settings';
import { AppEntry, DiscoveredApp } from '../../../../packages/launcher/src/settings/model';
import { HomeMode } from '../../../../packages/launcher/src/home/model';
import { CatalogEntry } from '../../../../packages/launcher/src/catalog/model';
import { defaultCatalog } from '../../../../packages/launcher/src/catalog/defaults';
import { createSettingsPanel } from '../../../../packages/plex/src/ui/settings';
import { HaSettings } from '../../../../packages/launcher/src/settings/scenes';
import { OverseerrSettings } from '../../../../packages/launcher/src/settings/overseerr';
import { testConnection } from '../../../../packages/overseerr/src/api/client';
import { Http as OverseerrHttp } from '../../../../packages/overseerr/src/api/types';
import { DEFAULT_OVERSEERR_URL, overseerrConfigFrom, saveOverseerrConfig } from '../../../../packages/overseerr/src/api/config';
import { loadStored } from '../../../../packages/tv-core/src/storage';
import { createOverseerrProbePanel } from '../../../../packages/widgets/src/overseerr-probe';
import { xhrHttp } from '../../../../packages/widgets/src/xhr';

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
  moduleEnabled?: (id: string) => boolean;
  modules?: ModuleRow[];
  onModule?: (id: string, enabled: boolean) => CatalogEntry[] | void;   // renvoie le catalogue visible à jour
  onModuleSettings?: (id: string) => void;
  onClose: () => void;
}

// Entrées internes du catalogue (ex. Plex intégré) : le type interne survit à l'aller-retour des Réglages.
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


// Réglages Overseerr : relus dans cimaise.v1 à chaque ouverture, enregistrés à chaque saisie validée. La clé ne sort
// d'ici que dans l'en-tête X-Api-Key ; le texte du test n'en contient rien.
function overseerrSettings(): OverseerrSettings {
  var p = loadStored().prefs;
  // Clé du paquet (window.__cimaiseOverseerr) : signalée à l'écran, jamais passée à la vue ; sert seulement au test.
  var pkg = overseerrConfigFrom(null);
  return {
    url: typeof p.overseerrUrl === 'string' && p.overseerrUrl ? p.overseerrUrl : pkg ? pkg.url : DEFAULT_OVERSEERR_URL,
    key: typeof p.overseerrKey === 'string' ? p.overseerrKey : '',
    packaged: !!pkg,
    onConfig: function (url, key) {
      try { saveOverseerrConfig(url, key); } catch (e) { /* stockage refusé : valable pour cette session */ }
    },
    test: function (url, key, cb) {
      // Même XHR que la sonde (renvoie toujours de quoi abandonner) : pas de second transport dans le chunk.
      testConnection(xhrHttp as OverseerrHttp, { url: url, key: key || (pkg ? pkg.key : '') }, function (err, info) {
        if (err || !info) return cb(err || new Error('réponse vide'));
        cb(null, 'Overseerr ' + (info.version || '?') + ' joignable, clé acceptée' +
          (info.mediaItems !== null ? ' (' + info.mediaItems + ' médias)' : '') + '.');
      });
    }
  };
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
    ha: arg.ha,
    ov: overseerrSettings(),
    moduleEnabled: arg.moduleEnabled,
    modules: arg.modules,
    onModule: arg.onModule && function (id, on) {
      var next = arg.onModule!(id, on);
      if (!next) return;
      current = next;
      return next.map(toApp);
    },
    onModuleSettings: arg.onModuleSettings,
    mode: arg.mode,
    onMode: arg.onMode,
    tiles: arg.tiles,
    onTiles: arg.onTiles,
    onClose: arg.onClose
  });
}

(function (w: any) {
  (w.__cimaiseChunks || (w.__cimaiseChunks = {})).settings = {
    createPanel: createPanel, createSettingsPanel: createSettingsPanel,
    // Sonde Overseerr du diagnostic (touche 2) : ici plutôt que dans app.js, pour ne rien ajouter au démarrage.
    createOverseerrProbe: function () { return createOverseerrProbePanel({ http: xhrHttp }); }
  };
})(window);
