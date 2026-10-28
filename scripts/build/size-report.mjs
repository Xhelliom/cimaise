// Rapport de taille du bundle vs budget (HANDOFF §6 bis : JS initial < 100 Ko minifié).
import { statSync } from 'node:fs';

const budget = Number(process.env.CIMAISE_JS_BUDGET_BYTES || 100 * 1024);
const row = (f) => ({ f, size: statSync(`apps/tv/dist/${f}`).size });
const kb = (n) => (n / 1024).toFixed(2) + ' Ko';

const js = row('app.js');
const css = row('app.css');
console.log(`${js.f}  ${kb(js.size)} / budget ${kb(budget)}`);
console.log(`${css.f}  ${kb(css.size)}`);
if (js.size > budget) {
  console.error(`Budget JS dépassé de ${kb(js.size - budget)}`);
  process.exit(1);
}
console.log('Budget JS respecté');
