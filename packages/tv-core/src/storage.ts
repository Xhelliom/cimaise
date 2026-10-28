export var STORAGE_KEY = 'cimaise.v1';
export var CURRENT_VERSION = 1;

export interface Stored { version: number; prefs: { [k: string]: any }; }

// v0 : objet de préférences à plat, sans champ `version`. v1 : { version, prefs }.
var migrations: Array<(d: any) => any> = [
  function (v0) { return { version: 1, prefs: v0 }; }
];

export function migrate(raw: any): Stored {
  if (raw === null || typeof raw !== 'object') return { version: CURRENT_VERSION, prefs: {} };
  var v = typeof raw.version === 'number' ? raw.version : 0;
  var data = raw;
  while (v < CURRENT_VERSION) { data = migrations[v](data); v = data.version; }
  return data;
}

export function loadStored(store?: Storage): Stored {
  try {
    var s = store || window.localStorage;
    var txt = s.getItem(STORAGE_KEY);
    return migrate(txt === null ? null : JSON.parse(txt));
  } catch (e) {
    return migrate(null);
  }
}

export function saveStored(data: Stored, store?: Storage): void {
  (store || window.localStorage).setItem(STORAGE_KEY, JSON.stringify(data));
}
