export var STORAGE_KEY = 'cimaise.v1';
export var CURRENT_VERSION = 3;

export interface Stored { version: number; prefs: { [k: string]: any }; }

// v0 : objet de préférences à plat, sans champ `version`. v1 : { version, prefs }. v2 : prefs.homeTiles (tuiles à l'écran, défaut 4).
var migrations: Array<(d: any) => any> = [
  function (v0) { return { version: 1, prefs: v0 }; },
  function (v1) {
    var prefs = v1.prefs && typeof v1.prefs === 'object' ? v1.prefs : {};
    if (prefs.homeTiles === undefined) prefs.homeTiles = 4;
    return { version: 2, prefs: prefs };
  },
  // v3 : langues du lecteur Plex dans prefs.plexLang { mode, audio, subs } (Réglages du module Plex) ; remplace plexAudioLang / plexSubLang.
  function (v2) {
    var prefs = v2.prefs && typeof v2.prefs === 'object' ? v2.prefs : {};
    // Anciens réglages globaux (une langue audio, une langue de sous-titres) : repris tels quels en mode « Personnalisé »,
    // pour que le comportement ne change pas. Sans ancien réglage : défaut du module (VO sous-titrée).
    var a = prefs.plexAudioLang, s = prefs.plexSubLang;
    if (a !== undefined || s !== undefined) {
      prefs.plexLang = { mode: 'custom', audio: [typeof a === 'string' && a ? a : 'fra'], subs: typeof s === 'string' && s ? [s] : [] };
    }
    delete prefs.plexAudioLang;
    delete prefs.plexSubLang;
    return { version: 3, prefs: prefs };
  }
];

export function migrate(raw: any): Stored {
  if (raw === null || typeof raw !== 'object') return { version: CURRENT_VERSION, prefs: {} };
  var v = typeof raw.version === 'number' ? raw.version : 0;
  var data = raw;
  while (v < CURRENT_VERSION) { data = migrations[v](data); v = data.version; }
  return data;
}

// Sur la TV, chaque getItem coûte (stockage disque) : les lectures de démarrage (`startup`) partagent un seul getItem du
// stockage par défaut. Chaque bundle (app.js, plex.js, settings.js) embarque sa propre copie de ce module, donc son
// propre cache : toute lecture destinée à être réécrite (load puis save) relit le stockage, sinon elle effacerait
// ce qu'un autre bundle y a enregistré. Un Storage passé en argument (tests) n'est jamais mis en cache.
var cached: { txt: string | null } | null = null;
export function resetStoredCache(): void { cached = null; }

export function loadStored(store?: Storage, startup?: boolean): Stored {
  try {
    var txt: string | null;
    if (store) txt = store.getItem(STORAGE_KEY);
    else if (startup) {
      if (cached === null) cached = { txt: window.localStorage.getItem(STORAGE_KEY) };
      txt = cached.txt;
    } else txt = window.localStorage.getItem(STORAGE_KEY);
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
