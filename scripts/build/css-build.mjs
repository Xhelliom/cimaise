// Build CSS partagé par build.mjs et ses tests. target chrome56 : esbuild n'écrit alors ni #rrggbbaa ni inset
// (moteur de la Frame encore inconnu, voir docs/decisions.md).
import { build } from 'esbuild';

export const CSS_TARGET = 'chrome56';

export function buildCss(entry, outdir) {
  return build({
    entryPoints: { app: entry },
    bundle: true,
    minify: true,
    target: CSS_TARGET,
    outdir,
    loader: { '.woff2': 'file' }, // la police référencée par le CSS est copiée telle quelle dans dist/fonts/
    assetNames: 'fonts/[name]',
    logLevel: 'warning',
  });
}
