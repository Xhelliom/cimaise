import { loadStored, saveStored } from '../../../tv-core/src/storage';
import { DeviceError, launchApp } from '../../../tv-core/src/device';
import { CatalogEntry, COLORS } from './model';
import { defaultCatalog } from './defaults';

export var CATALOG_VERSION = 1;

export interface StoredCatalog { version: number; entries: CatalogEntry[]; }

function isString(v: any): boolean { return typeof v === 'string'; }

// v0 : tableau brut d'entrées { id, name, icon?, internal? }. v1 : { version, entries } avec couleur et type.
export function migrateCatalog(raw: any): StoredCatalog {
  var list: any[] = raw && Object.prototype.toString.call(raw.entries) === '[object Array]' ? raw.entries : raw;
  var out: CatalogEntry[] = [];
  if (list && typeof list.length === 'number') {
    for (var i = 0; i < list.length; i++) {
      var o = list[i];
      if (!o || typeof o !== 'object' || !isString(o.name)) continue;
      var type: 'interne' | 'tv' = o.type === 'interne' || o.internal === true ? 'interne' : 'tv';
      var e: CatalogEntry = {
        id: isString(o.id) ? o.id : '',
        name: o.name,
        color: isString(o.color) && /^#[0-9a-f]{6}$/i.test(o.color) ? o.color : COLORS[out.length % COLORS.length],
        type: type
      };
      if (isString(o.icon)) e.icon = o.icon;
      if (isString(o.todo)) e.todo = o.todo;
      out.push(e);
    }
  }
  return { version: CATALOG_VERSION, entries: out };
}

// Lecture seule du stockage local : ne déclenche jamais la découverte des apps.
export function loadCatalog(store?: Storage): CatalogEntry[] {
  var raw = loadStored(store).prefs.catalog;
  if (raw === undefined) return defaultCatalog();
  return migrateCatalog(raw).entries;
}

export function saveCatalog(c: CatalogEntry[], store?: Storage): void {
  var s = loadStored(store);
  s.prefs.catalog = { version: CATALOG_VERSION, entries: c };
  saveStored(s, store);
}

// Lance une entrée « tv » ; sans ID (à relever en M0) ou interne, erreur claire.
export function launchEntry(e: CatalogEntry, onOk?: () => void, onErr?: (err: DeviceError) => void): void {
  if (e.type === 'interne') throw new DeviceError('INTERNAL_ENTRY', e.name + " : module interne, ouvert par le routeur, pas par l'adaptateur TV");
  if (!e.id) throw new DeviceError('NO_APP_ID', e.name + " : ID d'app absent, à relever en M0 sur la TV");
  launchApp(e.id, onOk, onErr);
}
