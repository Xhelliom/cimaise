import { loadStored, saveStored } from '../../../tv-core/src/storage';
import { OverseerrConfig } from './types';

// Adresse proposée tant que rien n'est enregistré ; la clé n'a jamais de valeur par défaut.
export var DEFAULT_OVERSEERR_URL = 'https://overseerr.wetter.land';

// URL et clé : d'abord cimaise.v1 (prefs.overseerrUrl, prefs.overseerrKey, saisies dans les Réglages), sinon
// window.__cimaiseOverseerr, écrit seulement dans la copie empaquetée (scripts/build/local-config.mjs). Jamais affichées.
export function overseerrConfigFrom(prefs: { [k: string]: any } | null | undefined, w?: any): OverseerrConfig | null {
  var url: any = prefs && prefs.overseerrUrl, key: any = prefs && prefs.overseerrKey;
  if (!(typeof url === 'string' && url && typeof key === 'string' && key)) {
    var c = (w || (typeof window !== 'undefined' ? window : {})).__cimaiseOverseerr;
    if (!c || !c.url || !c.key) return null;
    url = String(c.url); key = String(c.key);
  }
  return { url: url.replace(/\/+$/, ''), key: key };
}

// Saisie des Réglages : les deux champs sont enregistrés ensemble (l'adresse par défaut devient explicite avec la clé).
export function saveOverseerrConfig(url: string, key: string, store?: Storage): void {
  var s = loadStored(store);
  s.prefs.overseerrUrl = url;
  s.prefs.overseerrKey = key;
  saveStored(s, store);
}
