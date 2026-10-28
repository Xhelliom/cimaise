// Chaîne de build (HANDOFF §4) : tsc fait le passage réel en ES5 (modules ES conservés),
// esbuild ne fait que le bundling/minification (il ne sait pas abaisser vers l'ES5).
import { execFileSync } from 'node:child_process';
import { rmSync, mkdirSync, existsSync } from 'node:fs';
import { build } from 'esbuild';

// CIMAISE_APP : dossier de l'app (tsconfig.json, src/index.ts) ; CIMAISE_OUT : dossier de sortie.
const app = process.env.CIMAISE_APP ?? 'apps/tv';
const outDir = process.env.CIMAISE_OUT ?? `${app}/dist`;
const es5Dir = process.env.CIMAISE_OUT ? `${outDir}.es5` : `${app}/build/es5`;

rmSync(outDir, { recursive: true, force: true });
rmSync(es5Dir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

execFileSync('node_modules/.bin/tsc', ['-p', `${app}/tsconfig.json`, '--outDir', es5Dir], { stdio: 'inherit' });

await build({
  entryPoints: { app: `${es5Dir}/index.js` },
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
    logLevel: 'warning',
  });
}
