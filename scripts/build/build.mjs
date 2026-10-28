// Chaîne de build (HANDOFF §4) : tsc fait le passage réel en ES5 (modules ES conservés),
// esbuild ne fait que le bundling/minification (il ne sait pas abaisser vers l'ES5).
import { execFileSync } from 'node:child_process';
import { rmSync, mkdirSync } from 'node:fs';
import { build } from 'esbuild';

const app = 'apps/tv';
const es5Dir = `${app}/build/es5`;

rmSync(`${app}/dist`, { recursive: true, force: true });
rmSync(`${app}/build`, { recursive: true, force: true });
mkdirSync(`${app}/dist`, { recursive: true });

execFileSync('node_modules/.bin/tsc', ['-p', `${app}/tsconfig.json`, '--outDir', es5Dir], { stdio: 'inherit' });

await build({
  entryPoints: { app: `${es5Dir}/index.js` },
  bundle: true,
  format: 'iife',
  target: 'es5',
  minify: true,
  outdir: `${app}/dist`,
  logLevel: 'warning',
});
await build({
  entryPoints: { app: `${app}/src/style.css` },
  bundle: true,
  minify: true,
  outdir: `${app}/dist`,
  logLevel: 'warning',
});
