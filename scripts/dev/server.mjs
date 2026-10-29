// Aperçu navigateur : sert apps/tv avec les mocks injectés (jamais écrits dans dist/ ni dans le .wgt).
// Chaque requête recompile depuis les sources : recharger la page suffit.
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('../../', import.meta.url));
const bundle = async (entry, extra = {}) =>
  (await build({ absWorkingDir: root, entryPoints: [entry], bundle: true, write: false, format: 'iife', logLevel: 'silent', ...extra })).outputFiles[0].text;

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
  '/__mocks/preview.js': async () => [await bundle('mocks/src/preview.ts'), 'text/javascript'],
  '/app/index.html': async () => [
    readFileSync(`${root}apps/tv/index.html`, 'utf8').replace('<head>', '<head>\n<script src="/__mocks/mocks.js"></script>'),
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
  '/app/fonts/outfit-latin.woff2': async () => [readFileSync(`${root}packages/launcher/src/home/fonts/outfit-latin.woff2`), 'font/woff2'],
  '/app/app.css': async () => [await bundle('apps/tv/src/style.css', { external: ['*.woff2'] }), 'text/css'],
};

// Maquettes statiques de packages/launcher/mockups (aperçu seulement, jamais dans le .wgt).
const MIME = { html: 'text/html', css: 'text/css', woff2: 'font/woff2' };
const mockupRoute = (url) => {
  const m = /^\/mockups\/([\w-]*(?:\.(html|css|woff2))?)$/.exec(url);
  if (!m) return null;
  const name = m[1] || 'index.html';
  const file = `${root}packages/launcher/mockups/${name}`;
  if (!existsSync(file)) return null;
  const ext = name.split('.').pop();
  return async () => [readFileSync(file, ext === 'woff2' ? undefined : 'utf8'), MIME[ext]];
};

export function startDevServer({ port = 5173 } = {}) {
  const srv = createServer(async (req, res) => {
    const url = (req.url ?? '/').split('?')[0];
    const route = routes[url] ?? mockupRoute(url);
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
