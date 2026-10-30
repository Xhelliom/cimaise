// Registre des modules intégrés : chaque module déclare ce qu'il apporte à l'accueil (tuile, rangée) et à quoi il se
// rattache (chunk, section de réglages). Un module masqué n'a ni tuile ni rangée et son chunk n'est jamais chargé.
// Pour en ajouter un : une entrée dans MODULES (et, s'il a une tuile, son entrée interne dans catalog/defaults).
import { loadStored, saveStored } from '../../../tv-core/src/storage';
import { CatalogEntry } from '../catalog/model';
import { defaultCatalog } from '../catalog/defaults';

export interface ModuleDef {
  id: string;
  name: string;
  tileId: string | null;                            // id de l'entrée interne du catalogue ; null = pas de tuile (rangée, widget)
  chunk: string | null;                             // chunk chargé à la demande ; null = rien à charger
  settings: string;                                 // section de réglages propre au module
  configured: (prefs: { [k: string]: any }) => boolean;   // vrai : le module a de quoi fonctionner (défaut « activé »)
}

export var MODULES: ModuleDef[] = [
  { id: 'plex', name: 'Plex intégré', tileId: 'plex', chunk: 'plex', settings: 'plex', configured: function () { return true; } },
  {
    id: 'scenes', name: 'Scènes Home Assistant', tileId: null, chunk: null, settings: 'scenes',
    configured: function (p) { return typeof p.haUrl === 'string' && !!p.haUrl && typeof p.haToken === 'string' && !!p.haToken; }
  }
];

export function moduleById(id: string): ModuleDef | null {
  for (var i = 0; i < MODULES.length; i++) if (MODULES[i].id === id) return MODULES[i];
  return null;
}

// Choix explicite de l'utilisateur (prefs.modules[id]) ; à défaut, le module est activé s'il est configuré.
export function moduleEnabled(id: string, prefs: { [k: string]: any }): boolean {
  var def = moduleById(id);
  if (!def) return false;
  var m = prefs && prefs.modules;
  if (m && typeof m === 'object' && typeof m[id] === 'boolean') return m[id];
  return def.configured(prefs || {});
}

export function setModuleEnabled(id: string, on: boolean, store?: Storage): void {
  var s = loadStored(store);
  var m = s.prefs.modules && typeof s.prefs.modules === 'object' ? s.prefs.modules : {};
  m[id] = on;
  s.prefs.modules = m;
  saveStored(s, store);
}

function hiddenTile(e: CatalogEntry, prefs: { [k: string]: any }): boolean {
  if (e.type !== 'interne') return false;
  for (var i = 0; i < MODULES.length; i++) if (MODULES[i].tileId === e.id) return !moduleEnabled(MODULES[i].id, prefs);
  return false;
}

// Catalogue affiché : sans les tuiles des modules masqués.
export function visibleCatalog(c: CatalogEntry[], prefs: { [k: string]: any }): CatalogEntry[] {
  return c.filter(function (e) { return !hiddenTile(e, prefs); });
}

// Les Réglages renvoient le catalogue visible modifié : on y rattache les tuiles masquées pour ne rien perdre (couleur).
export function mergeHidden(full: CatalogEntry[], visible: CatalogEntry[], prefs: { [k: string]: any }): CatalogEntry[] {
  return visible.concat(full.filter(function (e) { return hiddenTile(e, prefs); }));
}

// Modules dont la tuile (visible) a disparu du catalogue : retirer la tuile revient à masquer le module.
export function removedModules(before: CatalogEntry[], after: CatalogEntry[]): string[] {
  var out: string[] = [];
  for (var i = 0; i < MODULES.length; i++) {
    var t = MODULES[i].tileId;
    if (t === null) continue;
    var had = false, has = false;
    for (var a = 0; a < before.length; a++) if (before[a].id === t && before[a].type === 'interne') had = true;
    for (var b = 0; b < after.length; b++) if (after[b].id === t && after[b].type === 'interne') has = true;
    if (had && !has) out.push(MODULES[i].id);
  }
  return out;
}

// Réactivation : la tuile du module revient en tête si le catalogue ne l'a plus ; sans doublon, sans effet sans tuile.
export function ensureTile(c: CatalogEntry[], moduleId: string): CatalogEntry[] {
  var def = moduleById(moduleId);
  if (!def || def.tileId === null) return c.slice(0);
  for (var i = 0; i < c.length; i++) if (c[i].id === def.tileId && c[i].type === 'interne') return c.slice(0);
  var d = defaultCatalog();
  for (var j = 0; j < d.length; j++) if (d[j].id === def.tileId) return [d[j]].concat(c);
  return c.slice(0);
}
