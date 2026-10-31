// Aperçu navigateur : sert apps/tv avec les mocks injectés (jamais écrits dans dist/ ni dans le .wgt).
// Chaque requête recompile depuis les sources : recharger la page suffit.
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('../../', import.meta.url));
const bundle = async (entry, extra = {}) =>
  (await build({ absWorkingDir: root, entryPoints: [entry], bundle: true, write: false, format: 'iife', logLevel: 'silent', ...extra })).outputFiles[0].text;

// Session Plex de l'aperçu : le jeton vit dans .local/plex.env (jamais dans git). Ce script, servi en local seulement,
// l'écrit dans le stockage de l'app comme le fera la connexion par PIN. Sans plex.env : vide, le module Plex le dit.
let plexSession;
const plexSessionScript = async () => {
  plexSession ??= (async () => {
    try {
      const { call, loadClient, loadEnv, nodeHttp } = await import('../plex/lib.mjs');
      const env = loadEnv(), api = await loadClient();
      const id = { clientId: env.PLEX_CLIENT_ID, product: 'Cimaise', version: '0.0.0', platform: 'Tizen', device: 'Frame' };
      const [, servers] = await call((cb) => api.getServers(nodeHttp, id, env.PLEX_TOKEN, cb));
      const server = servers.find((x) => x.owned) ?? servers[0];
      const [err, ref] = await call((cb) => api.chooseConnection(nodeHttp, id, server, cb));
      if (err) throw err;
      return `try{var k='cimaise.v1',d=JSON.parse(localStorage.getItem(k)||'null')||{version:1,prefs:{}};d.prefs=d.prefs||{};d.prefs.plexSession=${JSON.stringify(ref)};d.prefs.plexClientId=${JSON.stringify(env.PLEX_CLIENT_ID)};localStorage.setItem(k,JSON.stringify(d));}catch(e){}`;
    } catch (e) {
      return `console.warn(${JSON.stringify('[aperçu] pas de session Plex : ' + String(e.message).replace(/\S{24,}/g, '…'))});`;
    }
  })();
  return [await plexSession, 'text/javascript'];
};

// Home Assistant dans l'aperçu : HA refuse le cross-origin (préflight OPTIONS 403, pas de cors_allowed_origins) alors que la TV
// passe sans souci. Le script servi pointe donc prefs.haUrl sur le relais /__ha/ de CE serveur (même origine) ; le relais ajoute
// le jeton de .local/ha.env (chemin absolu, ou HA_ENV_FILE) CÔTÉ SERVEUR. Le navigateur ne reçoit jamais le jeton : prefs.haToken
// n'est qu'un marqueur non secret (le client exige une valeur non vide), et tout Authorization entrant est ignoré.
const HA_ENV = '/home/swetterwald/git/cimaise/.local/ha.env';
const readHaEnv = () => {
  const env = {};
  for (const l of readFileSync(process.env.HA_ENV_FILE || HA_ENV, 'utf8').split('\n')) { const i = l.indexOf('='); if (i > 0) env[l.slice(0, i).trim()] = l.slice(i + 1).trim(); }
  if (!env.HA_URL || !env.HA_TOKEN) throw new Error('HA_URL ou HA_TOKEN absent');
  return { url: env.HA_URL.replace(/\/+$/, ''), token: env.HA_TOKEN };
};
const haSessionScript = async () => {
  try {
    readHaEnv();
    return [`try{var k='cimaise.v1',d=JSON.parse(localStorage.getItem(k)||'null')||{version:1,prefs:{}};d.prefs=d.prefs||{};d.prefs.haUrl=location.origin+'/__ha';d.prefs.haToken='relais-apercu';localStorage.setItem(k,JSON.stringify(d));}catch(e){}`, 'text/javascript'];
  } catch (e) {
    return [`console.warn('[aperçu] pas de session Home Assistant (ha.env illisible ou incomplet)');`, 'text/javascript'];
  }
};
const haProxy = (req, res) => {
  let ha;
  try { ha = readHaEnv(); } catch { res.writeHead(503).end('ha.env absent'); return; }
  const path = req.url.slice('/__ha'.length);
  if (!/^\/api\//.test(path) || path.includes('..')) { res.writeHead(404).end('introuvable'); return; }
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const headers = { authorization: 'Bearer ' + ha.token };
    if (req.headers['content-type']) headers['content-type'] = req.headers['content-type'];
    const body = chunks.length && req.method !== 'GET' && req.method !== 'HEAD' ? Buffer.concat(chunks) : undefined;
    fetch(ha.url + path, { method: req.method, headers, body, signal: AbortSignal.timeout(8000) })
      .then(async (r) => {
        const out = Buffer.from((await r.text()).split(ha.token).join('…'));
        res.writeHead(r.status, { 'content-type': r.headers.get('content-type') || 'application/json', 'cache-control': 'no-store' }).end(out);
      })
      .catch(() => res.writeHead(502).end("Home Assistant injoignable depuis l'aperçu"));
  });
};

// Overseerr dans l'aperçu : adresse et clé viennent de .local/overseerr.env (jamais de git ni du build). Overseerr n'envoie
// pas d'en-tête CORS (la TV passe par <access origin>) : le script servi réécrit les XHR vers son origine en /__overseerr/…,
// relayées ici. Lecture seule : le relais refuse tout sauf GET (pas de demande envoyée depuis l'aperçu). Les réglages saisis
// dans l'aperçu priment : adresse et clé ne sont écrites dans cimaise.v1 que si elles y manquent.
const OV_ENV = '/home/swetterwald/git/cimaise/.local/overseerr.env';
const readOvEnv = () => {
  const env = {};
  for (const l of readFileSync(process.env.OVERSEERR_ENV_FILE || OV_ENV, 'utf8').split('\n')) { const i = l.indexOf('='); if (i > 0) env[l.slice(0, i).trim()] = l.slice(i + 1).trim(); }
  if (!env.OVERSEERR_URL || !env.OVERSEERR_API_KEY) throw new Error('OVERSEERR_URL ou OVERSEERR_API_KEY absent');
  return { url: env.OVERSEERR_URL.replace(/\/+$/, ''), key: env.OVERSEERR_API_KEY };
};
const overseerrSessionScript = async () => {
  try {
    const ov = readOvEnv(), origin = new URL(ov.url).origin;
    return [`try{var k='cimaise.v1',d=JSON.parse(localStorage.getItem(k)||'null')||{version:1,prefs:{}};d.prefs=d.prefs||{};if(!d.prefs.overseerrUrl||!d.prefs.overseerrKey){d.prefs.overseerrUrl=${JSON.stringify(ov.url)};d.prefs.overseerrKey=${JSON.stringify(ov.key)};localStorage.setItem(k,JSON.stringify(d));}}catch(e){}
(function(){var o=XMLHttpRequest.prototype.open,p=${JSON.stringify(origin)};XMLHttpRequest.prototype.open=function(m,u){if(typeof u==='string'&&u.indexOf(p+'/')===0)arguments[1]='/__overseerr'+u.slice(p.length);return o.apply(this,arguments);};})();`, 'text/javascript'];
  } catch (e) {
    return [`console.warn('[aperçu] pas d\\'Overseerr (overseerr.env illisible ou incomplet)');`, 'text/javascript'];
  }
};
const overseerrProxy = (req, res) => {
  if (req.method !== 'GET') { res.writeHead(405).end('aperçu : lecture seule'); return; }
  let ov;
  try { ov = readOvEnv(); } catch { res.writeHead(503).end('overseerr.env absent'); return; }
  const headers = { accept: 'application/json' };
  if (req.headers['x-api-key']) headers['x-api-key'] = req.headers['x-api-key'];
  fetch(new URL(ov.url).origin + req.url.slice('/__overseerr'.length), { headers })
    .then(async (r) => res.writeHead(r.status, { 'content-type': r.headers.get('content-type') || 'application/json', 'cache-control': 'no-store' }).end(Buffer.from(await r.arrayBuffer())))
    .catch(() => res.writeHead(502).end('Overseerr injoignable depuis l\'aperçu'));
};

const SHELL = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>cimaise — aperçu</title>
<style>
html,body{margin:0;height:100%;background:#111;overflow:hidden}
#scene{position:absolute;left:50%;top:50%;border:0;background:#000;transform-origin:center;margin:0}
#hud{position:fixed;left:8px;top:8px;z-index:2;color:#9f9;font:14px monospace;background:#000a;padding:2px 6px}
</style></head><body>
<div id="hud"></div>
<!-- scène 1920×1080 (touche S : 1280×720) ; R recharge ; flèches/Entrée/Échap=Retour -->
<iframe id="scene" src="/app/index.html" width="1920" height="1080"></iframe>
<script src="/__mocks/preview.js"></script>
</body></html>`;

const routes = {
  '/': async () => [SHELL, 'text/html'],
  '/__mocks/mocks.js': async () => [await bundle('mocks/src/index.ts'), 'text/javascript'],
  '/__mocks/plex-session.js': plexSessionScript,
  '/__mocks/ha-session.js': haSessionScript,
  '/__mocks/overseerr-session.js': overseerrSessionScript,
  '/__mocks/preview.js': async () => [await bundle('mocks/src/preview.ts'), 'text/javascript'],
  '/app/index.html': async () => [
    readFileSync(`${root}apps/tv/index.html`, 'utf8').replace('<head>', '<head>\n<script src="/__mocks/mocks.js"></script>\n<script src="/__mocks/plex-session.js"></script>\n<script src="/__mocks/ha-session.js"></script>\n<script src="/__mocks/overseerr-session.js"></script>'),
    'text/html',
  ],
  '/app/app.js': async () => [await bundle('apps/tv/src/index.ts'), 'text/javascript'],
  '/demo/virtual': async () => [readFileSync(`${root}packages/tv-core/demo/virtual.html`, 'utf8'), 'text/html'],
  '/demo/virtual.js': async () => [await bundle('packages/tv-core/demo/virtual.ts'), 'text/javascript'],
  // Démo de l'accueil Dock v2 (packages/launcher/demo) : aperçu seulement.
  '/demo/home': async () => [readFileSync(`${root}packages/launcher/demo/home.html`, 'utf8'), 'text/html'],
  '/demo/home.js': async () => [await bundle('packages/launcher/demo/home.ts'), 'text/javascript'],
  '/demo/home.css': async () => [await bundle('packages/launcher/src/home/home.css', { external: ['*.woff2'] }), 'text/css'],
  '/demo/fonts/outfit-latin.woff2': async () => [readFileSync(`${root}packages/launcher/src/home/fonts/outfit-latin.woff2`), 'font/woff2'],
  '/app/plex.js': async () => [await bundle('apps/tv/src/chunks/plex.ts'), 'text/javascript'],
  '/app/settings.js': async () => [await bundle('apps/tv/src/chunks/settings.ts'), 'text/javascript'],
  '/app/overseerr.js': async () => [await bundle('apps/tv/src/chunks/overseerr.ts'), 'text/javascript'],
  '/app/fonts/outfit-latin.woff2': async () => [readFileSync(`${root}packages/launcher/src/home/fonts/outfit-latin.woff2`), 'font/woff2'],
  '/app/app.css': async () => [await bundle('apps/tv/src/style.css', { external: ['*.woff2'] }), 'text/css'],
};

// Maquettes statiques de packages/launcher/mockups et, sous /mockups/overseerr/ et /mockups/plex/, de packages/<module>/mockups
// (aperçu seulement, jamais dans le .wgt).
const MIME = { html: 'text/html', css: 'text/css', woff2: 'font/woff2', jpg: 'image/jpeg' };
const BINARY = new Set(['woff2', 'jpg']);
const mockupRoute = (url) => {
  const m = /^\/mockups\/(?:(overseerr|plex)\/)?([\w-]*(?:\.(html|css|woff2|jpg))?)$/.exec(url);
  if (!m) return null;
  const name = m[2] || (m[1] ? 'accueil.html' : 'index.html');
  const file = `${root}packages/${m[1] || 'launcher'}/mockups/${name}`;
  if (!existsSync(file)) return null;
  const ext = name.split('.').pop();
  return async () => [readFileSync(file, BINARY.has(ext) ? undefined : 'utf8'), MIME[ext]];
};

// Logos d'apps (packages/launcher/src/catalog/known-apps/logos) : /app/logos/<nom>.png (et /demo/logos/ pour la démo de l'accueil), noms simples seulement.
const logoRoute = (url) => {
  const m = /^\/(?:app|demo)\/logos\/([\w-]+\.png)$/.exec(url);
  const file = m && `${root}packages/launcher/src/catalog/known-apps/logos/${m[1]}`;
  return file && existsSync(file) ? async () => [readFileSync(file), 'image/png'] : null;
};

export function startDevServer({ port = 5173 } = {}) {
  const srv = createServer(async (req, res) => {
    const url = (req.url ?? '/').split('?')[0];
    if (url.startsWith('/__overseerr/')) { overseerrProxy(req, res); return; }
    if (url.startsWith('/__ha/')) { haProxy(req, res); return; }
    const route = routes[url] ?? mockupRoute(url) ?? logoRoute(url);
    if (!route) { res.writeHead(404).end('introuvable'); return; }
    try {
      const [body, type] = await route();
      res.writeHead(200, { 'content-type': `${type}; charset=utf-8`, 'cache-control': 'no-store' }).end(body);
    } catch (e) {
      res.writeHead(500).end(String(e));
    }
  });
  return new Promise((ok) => srv.listen(port, '127.0.0.1', () => ok(srv)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const srv = await startDevServer({ port: Number(process.env.PORT ?? 5173) });
  console.log(`Aperçu : http://127.0.0.1:${srv.address().port}/`);
}
