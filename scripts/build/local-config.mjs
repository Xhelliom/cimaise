// Prépare la copie À EMPAQUETER d'une app : y ajoute local-config.js (URL et jeton Home Assistant lus dans ha.env) et
// le branche dans index.html avant app.js. Jamais appelé par le build : apps/tv/dist reste sans jeton.
// Usage : node scripts/build/local-config.mjs <dossier-app> <dossier-copie> [ha.env]
// Sans ha.env lisible et complet (HA_URL + HA_TOKEN), la copie est identique à la source. Rien n'est jamais affiché.
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [src, dst, envFile = '.local/ha.env'] = process.argv.slice(2);
if (!src || !dst) { console.error('usage : local-config.mjs <dossier-app> <dossier-copie> [ha.env]'); process.exit(2); }

rmSync(dst, { recursive: true, force: true });
cpSync(src, dst, { recursive: true });

let env = null;
try {
  env = {};
  for (const l of readFileSync(envFile, 'utf8').split('\n')) { const i = l.indexOf('='); if (i > 0) env[l.slice(0, i).trim()] = l.slice(i + 1).trim(); }
  if (!env.HA_URL || !env.HA_TOKEN) env = null;
} catch { env = null; }

if (!env) { console.log('local-config : pas de ha.env complet, paquet sans pré-remplissage Home Assistant'); process.exit(0); }

// Pré-remplit seulement les valeurs vides : la saisie manuelle des Réglages reste prioritaire.
writeFileSync(join(dst, 'local-config.js'), `try{var k='cimaise.v1',d=JSON.parse(localStorage.getItem(k)||'null')||{version:2,prefs:{}};d.prefs=d.prefs||{};if(!d.prefs.haUrl)d.prefs.haUrl=${JSON.stringify(env.HA_URL)};if(!d.prefs.haToken)d.prefs.haToken=${JSON.stringify(env.HA_TOKEN)};localStorage.setItem(k,JSON.stringify(d));}catch(e){}\n`);
const idx = join(dst, 'index.html');
const html = readFileSync(idx, 'utf8');
if (!/<script src="app\.js"><\/script>/.test(html)) { console.error('local-config : <script src="app.js"> introuvable dans index.html'); process.exit(1); }
writeFileSync(idx, html.replace('<script src="app.js"></script>', '<script src="local-config.js"></script>\n<script src="app.js"></script>'));
console.log('local-config : Home Assistant pré-rempli dans la copie empaquetée');
