// Échoue si une feuille CSS de l'app emploie une propriété ou un sélecteur absent du moteur web de la TV
// (Tizen 5, Chromium ancien). Liste noire maison, sans dépendance. Sans argument : les feuilles de l'app.
import { readFileSync, globSync } from 'node:fs';

const RULES = [
  [/(^|[;{\s])gap\s*:/, 'gap (utiliser grid-gap en grid, des marges en flex)'],
  [/(^|[;{\s])(row|column)-gap\s*:/, 'row-gap/column-gap (utiliser grid-row-gap/grid-column-gap)'],
  [/aspect-ratio\s*:/, 'aspect-ratio'],
  [/(^|[;{\s])inset(-[a-z]+)?\s*:/, 'inset'],
  [/\b(clamp|min|max)\(/, 'clamp()/min()/max()'],
  [/:(is|where|has)\(/, ':is/:where/:has'],
  [/backdrop-filter\s*:/, 'backdrop-filter'],
];

const files = process.argv.length > 2 ? process.argv.slice(2)
  : ['packages/*/src/**/*.css', 'apps/*/src/**/*.css'].flatMap((g) => globSync(g));

let bad = 0;
for (const f of files) {
  const css = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  css.split('\n').forEach((line, i) => {
    for (const [re, why] of RULES) {
      if (re.test(line)) { console.error(f + ':' + (i + 1) + ': non pris en charge par Tizen 5 : ' + why); bad++; }
    }
  });
}
if (!files.length) { console.error('check-css : aucune feuille trouvée'); process.exit(1); }
process.exit(bad ? 1 : 0);
