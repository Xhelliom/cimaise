export var STORAGE_KEY = 'cimaise.v1';
export var CURRENT_VERSION = 2;

export interface Stored { version: number; prefs: { [k: string]: any }; }

// v0 : objet de préférences à plat, sans champ `version`. v1 : { version, prefs }. v2 : prefs.homeTiles (tuiles à l'écran, défaut 4).
var migrations: Array<(d: any) => any> = [
  function (v0) { return { version: 1, prefs: v0 }; },
  function (v1) {
    var prefs = v1.prefs && typeof v1.prefs === 'object' ? v1.prefs : {};
    if (prefs.homeTiles === undefined) prefs.homeTiles = 4;
    return { version: 2, prefs: prefs };
  }
];

export function migrate(raw: any): Stored {
  if (raw === null || typeof raw !== 'object') return { version: CURRENT_VERSION, prefs: {} };
  var v = typeof raw.version === 'number' ? raw.version : 0;
  var data = raw;
  while (v < CURRENT_VERSION) { data = migrations[v](data); v = data.version; }
  return data;
}

// Sur la TV, chaque getItem coûte (stockage disque) : le texte du stockage par défaut n'est lu qu'une fois, puis tenu à jour par
// saveStored. Un Storage passé en argument (tests) n'est jamais mis en cache.
var cached: { txt: string | null } | null = null;
export function resetStoredCache(): void { cached = null; }

export function loadStored(store?: Storage): Stored {
  try {
    var txt: string | null;
    if (store) txt = store.getItem(STORAGE_KEY);
    else {
      if (cached === null) cached = { txt: window.localStorage.getItem(STORAGE_KEY) };
      txt = cached.txt;
    }
    return migrate(txt === null ? null : JSON.parse(txt));
  } catch (e) {
    return migrate(null);
  }
}

export function saveStored(data: Stored, store?: Storage): void {
  var txt = JSON.stringify(data);
  (store || window.localStorage).setItem(STORAGE_KEY, txt);
  if (!store) cached = { txt: txt };
}
