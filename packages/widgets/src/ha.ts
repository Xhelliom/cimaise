// Client Home Assistant minimal : REST seulement, sans WebSocket ni minuterie (pas d'états en direct, décision du 29/10).
// L'URL et le jeton viennent de cimaise.v1 (prefs.haUrl, prefs.haToken) ; ils ne passent jamais dans un message d'erreur.

export interface HaConfig { url: string; token: string; }
export interface Scene { id: string; name: string; area: string | null; }
export interface HaError extends Error { code: 'config' | 'invalid' | 'unreachable' | 'unauthorized' | 'http' | 'format'; status?: number; }
export interface HttpRequest { method: string; url: string; headers: { [k: string]: string }; body?: string; timeoutMs?: number; }
export interface HttpResponse { status: number; body: string; }
export type Http = (req: HttpRequest, cb: (err: Error | null, res?: HttpResponse) => void) => { abort(): void } | void;
export type Callback<T> = (err: HaError | null, value?: T) => void;

var TIMEOUT_MS = 4000;
var SCENE_ID = /^scene\.[a-z0-9_]+$/;

function fail(code: HaError['code'], msg: string, status?: number): HaError {
  var e = new Error(msg) as HaError;
  e.code = code;
  if (status !== undefined) e.status = status;
  return e;
}

export function haConfigFromPrefs(prefs: { [k: string]: any } | null | undefined): HaConfig | null {
  if (!prefs || typeof prefs.haUrl !== 'string' || typeof prefs.haToken !== 'string' || !prefs.haUrl || !prefs.haToken) return null;
  return { url: prefs.haUrl.replace(/\/+$/, ''), token: prefs.haToken };
}

function send(http: Http, cfg: HaConfig | null, method: string, path: string, body: any, cb: Callback<string>) {
  if (!cfg) return cb(fail('config', 'Home Assistant non configuré (adresse ou jeton absent)'));
  var headers: { [k: string]: string } = { Authorization: 'Bearer ' + cfg.token };
  var txt: string | undefined;
  if (body !== undefined) { headers['Content-Type'] = 'application/json'; txt = JSON.stringify(body); }
  http({ method: method, url: cfg.url + path, headers: headers, body: txt, timeoutMs: TIMEOUT_MS }, function (err, res) {
    if (err || !res) return cb(fail('unreachable', 'Home Assistant injoignable'));
    if (res.status === 401 || res.status === 403) return cb(fail('unauthorized', 'Jeton Home Assistant refusé', res.status));
    if (res.status < 200 || res.status >= 300) return cb(fail('http', 'Home Assistant : erreur HTTP ' + res.status, res.status));
    cb(null, res.body);
  });
}

export function ping(http: Http, cfg: HaConfig | null, cb: Callback<void>) {
  send(http, cfg, 'GET', '/api/', undefined, function (err) { cb(err); });
}

// Scènes (scene.*) avec leur pièce : un GET /api/states puis un seul POST /api/template pour toutes les pièces.
// Si le modèle échoue, les scènes restent listées, sans pièce.
export function listScenes(http: Http, cfg: HaConfig | null, cb: Callback<Scene[]>) {
  send(http, cfg, 'GET', '/api/states', undefined, function (err, body) {
    if (err) return cb(err);
    var states: any;
    try { states = JSON.parse(body as string); } catch (e) { return cb(fail('format', 'Réponse Home Assistant illisible')); }
    if (!states || typeof states.length !== 'number') return cb(fail('format', 'Réponse Home Assistant illisible'));
    var scenes: Scene[] = [];
    for (var i = 0; i < states.length; i++) {
      var s = states[i], id = s && s.entity_id;
      if (typeof id !== 'string' || !SCENE_ID.test(id)) continue;
      var fn = s.attributes && s.attributes.friendly_name;
      scenes.push({ id: id, name: typeof fn === 'string' && fn ? fn : id, area: null });
    }
    if (!scenes.length) return cb(null, scenes);
    var calls: string[] = [];
    for (var j = 0; j < scenes.length; j++) calls.push("area_name('" + scenes[j].id + "')");
    send(http, cfg, 'POST', '/api/template', { template: '{{ [' + calls.join(', ') + '] | tojson }}' }, function (e2, out) {
      if (!e2) {
        try {
          var areas = JSON.parse(out as string);
          for (var k = 0; k < scenes.length; k++) if (typeof areas[k] === 'string' && areas[k]) scenes[k].area = areas[k];
        } catch (e) { /* pas de pièce */ }
      } else if (e2.code === 'unauthorized' || e2.code === 'unreachable') return cb(e2);
      cb(null, scenes);
    });
  });
}

export function activateScene(http: Http, cfg: HaConfig | null, id: string, cb: Callback<void>) {
  if (!SCENE_ID.test(id)) return cb(fail('invalid', 'Identifiant de scène invalide'));
  send(http, cfg, 'POST', '/api/services/scene/turn_on', { entity_id: id }, function (err) { cb(err); });
}
