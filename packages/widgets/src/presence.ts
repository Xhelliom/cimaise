// Présence de cimaise pour Home Assistant : HA ne voit pas l'app au premier plan (docs/home-button.md), cimaise le sait.
// Masquée → POST /api/events/cimaise_hidden (seq 0 tout de suite, seq 1 ~3 s plus tard si la page tourne encore : TV Plus
// peut démarrer après) ; de nouveau visible → cimaise_visible. Sans config HA : rien. Aucune minuterie hors de ces 3 s.
// sendBeacon est écarté : il ne peut pas porter l'en-tête Authorization exigé par HA. Le jeton n'est jamais journalisé.
import { Http, HaConfig } from './ha';

export interface PresenceDeps {
  http: Http;
  config: () => HaConfig | null;          // relu à chaque événement (Réglages modifiés en cours de route)
  apps?: (cb: (ids: string[] | null) => void) => void; // apps lancées ; absent, levant ou cb(null) : champs nuls
  doc?: { hidden: boolean; addEventListener(t: string, f: () => void): void };
  now?: () => number;
  later?: (f: () => void, ms: number) => any; // minuterie ponctuelle injectée par l'app ; absente : pas de 2e salve
  cancel?: (h: any) => void;
}

export interface AppsSummary { tvplus: boolean | null; netflix: boolean | null; youtube: boolean | null; plex: boolean | null; }

var LATER_MS = 3000;

// TV Plus relevé dans l'applist de la Frame : com.samsung.tv.tvPlusDeeplinker, com.samsung.tv.tvplus.
// Motifs plutôt qu'IDs en dur : YouTube a deux IDs (9Ur5IzDKqV.TizenYouTube, com.samsung.tv.cobalt-yt), Plex kIciSQlYEM.plex.
export function summarizeApps(ids: string[] | null): AppsSummary {
  if (!ids) return { tvplus: null, netflix: null, youtube: null, plex: null };
  function any(re: RegExp) { for (var i = 0; i < ids!.length; i++) if (re.test(ids![i])) return true; return false; }
  return {
    tvplus: any(/^com\.samsung\.tv\.tvplus/i),
    netflix: any(/netflix/i),
    youtube: any(/youtube$|\.cobalt-yt$/i),
    plex: any(/\.plex$/i)
  };
}

export function watchPresence(d: PresenceDeps): void {
  var doc = d.doc || document, now = d.now || Date.now;
  var pending: any = null;

  function post(type: string, data: any) {
    var cfg = d.config();
    if (!cfg) return;
    d.http({ method: 'POST', url: cfg.url + '/api/events/' + type, headers: { Authorization: 'Bearer ' + cfg.token, 'Content-Type': 'application/json' }, body: JSON.stringify(data), timeoutMs: 2000 }, function () { /* best effort */ });
  }
  function hidden(seq: number) {
    var at = now(), sent = false;
    function go(ids: string[] | null) {
      if (sent) return;
      sent = true;
      var s = summarizeApps(ids);
      post('cimaise_hidden', { at: at, seq: seq, tvplus: s.tvplus, netflix: s.netflix, youtube: s.youtube, plex: s.plex });
    }
    if (!d.apps) return go(null);
    try { d.apps(go); } catch (e) { go(null); }
  }

  doc.addEventListener('visibilitychange', function () {
    if (!d.config()) return;
    if (pending !== null && d.cancel) { d.cancel(pending); pending = null; }
    if (doc.hidden) {
      hidden(0);
      if (d.later) pending = d.later(function () { pending = null; if (doc.hidden) hidden(1); }, LATER_MS);
    } else post('cimaise_visible', { at: now() });
  });
}
