import { Http } from './ha';

// Sonde Overseerr (diagnostic caché, touche 0 puis 2) : la Frame joint-elle Overseerr en HTTPS ? Lecture seule, trois essais à la suite :
//  1. image /favicon.ico : ni CORS ni en-tête, seulement TLS + réseau ;
//  2. XHR GET /api/v1/status sans clé (requête simple, sans pré-vol) : TLS + CORS ;
//  3. XHR GET /api/v1/discover/movies avec X-Api-Key (en-tête non standard, donc pré-vol OPTIONS hors TV) : TLS + CORS + clé.
// Image OK et XHR à 0 → CORS ; tout à 0 → TLS ou réseau. URL et clé viennent de window.__cimaiseOverseerr, écrit seulement
// dans la copie empaquetée (scripts/build/local-config.mjs) : jamais dans le build commité. La clé n'est jamais affichée.
export interface OverseerrConfig { url: string; key: string; }
export interface ProbeStep { name: string; code: number; ms: number; err: string; detail: string; }
export type LoadImage = (url: string, cb: (ok: boolean) => void) => void;

var TIMEOUT_MS = 15000;

export function overseerrConfig(w?: any): OverseerrConfig | null {
  var c = (w || (typeof window !== 'undefined' ? window : {})).__cimaiseOverseerr;
  return c && c.url && c.key ? { url: String(c.url).replace(/\/+$/, ''), key: String(c.key) } : null;
}

export var loadImage: LoadImage = function (url, cb) {
  // Pas de minuterie (règle du paquet widgets) : un refus TLS ou réseau déclenche onerror sans attendre.
  var img = new Image(), done = false;
  function end(ok: boolean) { if (done) return; done = true; img.onload = img.onerror = null; cb(ok); }
  img.onload = function () { end(true); };
  img.onerror = function () { end(false); };
  img.src = url;
};

function jsonField(body: string, pick: (j: any) => string): string {
  try { return pick(JSON.parse(body)); } catch (e) { return 'réponse non JSON'; }
}

export function runOverseerrProbe(cfg: OverseerrConfig, http: Http, img: LoadImage, now: () => number,
                                  onStep: (s: ProbeStep) => void, done: () => void): void {
  var t0 = now();
  img(cfg.url + '/favicon.ico?_=' + t0, function (ok) {
    onStep({ name: 'image /favicon.ico (TLS seul)', code: ok ? 200 : 0, ms: now() - t0, err: ok ? '' : 'échec du chargement', detail: '' });
    var t1 = now();
    http({ method: 'GET', url: cfg.url + '/api/v1/status', headers: { Accept: 'application/json' }, timeoutMs: TIMEOUT_MS }, function (e1, r1) {
      onStep({ name: 'XHR /api/v1/status (sans clé)', code: r1 ? r1.status : 0, ms: now() - t1, err: e1 ? e1.message : '',
               detail: r1 && r1.status === 200 ? jsonField(r1.body, function (j) { return 'version ' + j.version; }) : '' });
      var t2 = now();
      http({ method: 'GET', url: cfg.url + '/api/v1/discover/movies?page=1', headers: { Accept: 'application/json', 'X-Api-Key': cfg.key }, timeoutMs: TIMEOUT_MS }, function (e2, r2) {
        onStep({ name: 'XHR /api/v1/discover/movies (X-Api-Key)', code: r2 ? r2.status : 0, ms: now() - t2, err: e2 ? e2.message : '',
                 detail: r2 && r2.status === 200 ? jsonField(r2.body, function (j) { return (j.results ? j.results.length : 0) + ' films'; }) : '' });
        done();
      });
    });
  });
}

export function stepLine(s: ProbeStep): string {
  return s.name + ' → ' + (s.code || 'aucun code') + ' · ' + s.ms + ' ms' + (s.err ? ' · erreur : ' + s.err : '') + (s.detail ? ' · ' + s.detail : '');
}

// Écran texte, sur le modèle du diagnostic (pas de CSS ajoutée). Retour : dépilé par le routeur.
export function createOverseerrProbePanel(arg: { http: Http; img?: LoadImage; now?: () => number; config?: OverseerrConfig | null; doc?: Document }) {
  var doc = arg.doc || document;
  var root = doc.createElement('pre');
  root.style.cssText = 'position:absolute;left:0;top:0;width:1920px;height:1080px;margin:0;padding:48px 80px;box-sizing:border-box;background:#000;color:#0f0;font:26px/1.5 monospace;white-space:pre-wrap';
  var cfg = arg.config === undefined ? overseerrConfig() : arg.config;
  var lines = ['Sonde Overseerr (lecture seule)'];
  function paint() { root.textContent = lines.join('\n'); }
  if (!cfg) lines.push('', 'Pas de configuration : paquet construit sans .local/overseerr.env.');
  else {
    var host = cfg.url.replace(/^https?:\/\//, '');
    lines.push('hôte : ' + host, '');
    runOverseerrProbe(cfg, arg.http, arg.img || loadImage, arg.now || function () { return Date.now(); },
      function (s) { lines.push(stepLine(s)); paint(); },
      function () { lines.push('', 'Terminé. Retour pour quitter.'); paint(); });
  }
  paint();
  return { el: root as HTMLElement };
}
