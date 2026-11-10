// Présence de cimaise pour Home Assistant : HA ne voit pas l'app au premier plan (docs/home-button.md), cimaise le sait.
// Masquée → cimaise_hidden { at, seq: 0, tvplus: null } par XHR SYNCHRONE dans le gestionnaire : mesuré sur la Frame
// (2026-11-10), la page est gelée dès qu'elle est masquée, seul le gestionnaire tourne ; un XHR asynchrone ne part qu'au retour.
// De nouveau visible → cimaise_visible { at } (asynchrone). sendBeacon est écarté : pas d'en-tête Authorization.
// tvplus vaut null : la page gelée ne peut pas voir TV Plus démarrer. Sans config HA : rien. Aucune minuterie.
import { Http, HaConfig } from './ha';

export interface PresenceDeps {
  http: Http;
  config: () => HaConfig | null; // relu à chaque événement (Réglages modifiés en cours de route)
  doc?: { hidden: boolean; addEventListener(t: string, f: () => void): void };
  now?: () => number;
}

export function watchPresence(d: PresenceDeps): void {
  var doc = d.doc || document, now = d.now || Date.now;
  doc.addEventListener('visibilitychange', function () {
    var cfg = d.config();
    if (!cfg) return;
    var hidden = doc.hidden;
    d.http({
      method: 'POST', url: cfg.url + '/api/events/' + (hidden ? 'cimaise_hidden' : 'cimaise_visible'),
      headers: { Authorization: 'Bearer ' + cfg.token, 'Content-Type': 'application/json' },
      body: JSON.stringify(hidden ? { at: now(), seq: 0, tvplus: null } : { at: now() }),
      sync: hidden, timeoutMs: hidden ? undefined : 2000
    }, function () { /* best effort */ });
  });
}
