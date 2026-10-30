import { OverseerrConfig } from './types';

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
