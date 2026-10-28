// Aperçu navigateur : sert apps/tv avec les mocks injectés (jamais écrits dans dist/ ni dans le .wgt).
// Chaque requête recompile depuis les sources : recharger la page suffit.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
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
  '/app/app.css': async () => [await bundle('apps/tv/src/style.css'), 'text/css'],
};

export function startDevServer({ port = 5173 } = {}) {
  const srv = createServer(async (req, res) => {
    const route = routes[(req.url ?? '/').split('?')[0]];
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
