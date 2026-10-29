// Rapport de taille vs budget (HANDOFF §6 bis) : JS initial (app.js) < 100 Ko minifié, .wgt < 1,5 Mo.
// Les chunks (chargés à la demande) sont listés à part, hors budget du JS initial.
import { statSync, readdirSync } from 'node:fs';

const app = process.env.CIMAISE_APP ?? 'apps/tv';
const name = process.env.CIMAISE_WGT ?? 'cimaise';
const budget = Number(process.env.CIMAISE_JS_BUDGET_BYTES || 100 * 1024);
const wgtBudget = 1.5 * 1024 * 1024;
const kb = (n) => (n / 1024).toFixed(2) + ' Ko';
const size = (p) => statSync(p).size;

const files = readdirSync(`${app}/dist`).sort();
let ok = true;
const js = size(`${app}/dist/app.js`);
console.log(`[${app}] app.js  ${kb(js)} / budget ${kb(budget)}`);
for (const f of files) {
  if (f === 'app.js') continue;
  console.log(`[${app}] ${f}  ${kb(size(`${app}/dist/${f}`))}${/^(?!app).*\.js$/.test(f) ? '  (chunk différé, hors JS initial)' : ''}`);
}
if (js > budget) { console.error(`Budget JS dépassé de ${kb(js - budget)}`); ok = false; }
else console.log('Budget JS respecté');
try {
  const w = size(`${app}/build/${name}-unsigned.wgt`);
  console.log(`[${app}] ${name}-unsigned.wgt  ${kb(w)} / budget ${kb(wgtBudget)}`);
  if (w > wgtBudget) { console.error(`Budget .wgt dépassé de ${kb(w - wgtBudget)}`); ok = false; }
} catch { /* .wgt absent : rapport du JS seul */ }
process.exit(ok ? 0 : 1);
