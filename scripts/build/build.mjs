// Chaîne de build (HANDOFF §4) : tsc fait le passage réel en ES5 (modules ES conservés),
// esbuild ne fait que le bundling/minification (il ne sait pas abaisser vers l'ES5).
import { execFileSync } from 'node:child_process';
import { rmSync, mkdirSync, existsSync, readdirSync, copyFileSync, readFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { build } from 'esbuild';

// CIMAISE_APP : dossier de l'app (tsconfig.json, src/index.ts) ; CIMAISE_OUT : dossier de sortie.
const app = process.env.CIMAISE_APP ?? 'apps/tv';
const outDir = process.env.CIMAISE_OUT ?? `${app}/dist`;
const es5Dir = process.env.CIMAISE_OUT ? `${outDir}.es5` : `${app}/build/es5`;

rmSync(outDir, { recursive: true, force: true });
rmSync(es5Dir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

execFileSync('node_modules/.bin/tsc', ['-p', `${app}/tsconfig.json`, '--outDir', es5Dir], { stdio: 'inherit' });

// rootDir à la racine (code partagé de packages/) : l'entrée suit alors l'arborescence du dépôt.
const base = existsSync(`${es5Dir}/index.js`) ? es5Dir : join(es5Dir, app, 'src');
// Entrées : le bundle initial (app.js) et un chunk par fichier de src/chunks/ (chargé à la demande).
const entryPoints = { app: `${base}/index.js` };
if (existsSync(`${base}/chunks`)) {
  for (const f of readdirSync(`${base}/chunks`)) if (f.endsWith('.js')) entryPoints[basename(f, '.js')] = `${base}/chunks/${f}`;
}
await build({
  entryPoints,
  bundle: true,
  format: 'iife',
  target: 'es5',
  minify: true,
  outdir: outDir,
  logLevel: 'warning',
});
if (existsSync(`${app}/src/style.css`)) {
  await build({
    entryPoints: { app: `${app}/src/style.css` },
    bundle: true,
    minify: true,
    outdir: outDir,
    external: ['*.woff2'], // la police est copiée telle quelle (assets) et référencée par url relative
    logLevel: 'warning',
  });
}
// Fichiers copiés tels quels dans dist/ : package.json de l'app, clé "cimaise.assets" (chemins relatifs à l'app).
const pkg = existsSync(`${app}/package.json`) ? JSON.parse(readFileSync(`${app}/package.json`, 'utf8')) : {};
for (const a of pkg.cimaise?.assets ?? []) copyFileSync(join(app, a), join(outDir, basename(a)));
