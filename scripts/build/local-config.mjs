// Prépare la copie À EMPAQUETER d'une app : y ajoute local-config.js (URL et jeton Home Assistant lus dans ha.env ; URL et clé
// Overseerr lues dans overseerr.env) et le branche dans index.html avant app.js. Jamais appelé par le build : apps/tv/dist reste
// sans jeton. Avec overseerr.env, l'origine Overseerr est aussi déclarée (<access origin>) dans le config.xml de la copie seulement.
// Avec unsplash.env (UNSPLASH_ACCESS_KEY), la clé est posée en mémoire (window.__cimaiseUnsplash) et les origines
// api.unsplash.com et images.unsplash.com sont déclarées dans le config.xml de la copie (fond d'écran de l'accueil).
// Usage : node scripts/build/local-config.mjs <dossier-app> <dossier-copie> [ha.env] [overseerr.env] [unsplash.env]
// Sans fichier lisible et complet, la copie est identique à la source. Rien n'est jamais affiché.
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [src, dst, envFile = '.local/ha.env', ovEnvFile, usEnvFile] = process.argv.slice(2);
if (!src || !dst) { console.error('usage : local-config.mjs <dossier-app> <dossier-copie> [ha.env] [overseerr.env] [unsplash.env]'); process.exit(2); }

rmSync(dst, { recursive: true, force: true });
cpSync(src, dst, { recursive: true });

function readEnv(file, keys) {
  if (!file) return null;
  try {
    const env = {};
    for (const l of readFileSync(file, 'utf8').split('\n')) { const i = l.indexOf('='); if (i > 0) env[l.slice(0, i).trim()] = l.slice(i + 1).trim(); }
    return keys.every((k) => env[k]) ? env : null;
  } catch { return null; }
}
const env = readEnv(envFile, ['HA_URL', 'HA_TOKEN']);
const ov = readEnv(ovEnvFile, ['OVERSEERR_URL', 'OVERSEERR_API_KEY']);
const us = readEnv(usEnvFile, ['UNSPLASH_ACCESS_KEY']);

if (!env && !ov && !us) { console.log('local-config : ni ha.env, ni overseerr.env, ni unsplash.env complet, paquet sans pré-remplissage'); process.exit(0); }

let code = '';
// Pré-remplit seulement les valeurs vides : la saisie manuelle des Réglages reste prioritaire.
if (env) code += `try{var k='cimaise.v1',d=JSON.parse(localStorage.getItem(k)||'null')||{version:2,prefs:{}};d.prefs=d.prefs||{};if(!d.prefs.haUrl)d.prefs.haUrl=${JSON.stringify(env.HA_URL)};if(!d.prefs.haToken)d.prefs.haToken=${JSON.stringify(env.HA_TOKEN)};localStorage.setItem(k,JSON.stringify(d));}catch(e){}\n`;
// Overseerr : en mémoire seulement (window), jamais dans localStorage.
if (ov) code += `window.__cimaiseOverseerr={url:${JSON.stringify(ov.OVERSEERR_URL)},key:${JSON.stringify(ov.OVERSEERR_API_KEY)}};\n`;
// Unsplash : clé d'accès en mémoire seulement, comme Overseerr.
if (us) code += `window.__cimaiseUnsplash={key:${JSON.stringify(us.UNSPLASH_ACCESS_KEY)}};\n`;
writeFileSync(join(dst, 'local-config.js'), code);
const idx = join(dst, 'index.html');
const html = readFileSync(idx, 'utf8');
if (!/<script src="app\.js"><\/script>/.test(html)) { console.error('local-config : <script src="app.js"> introuvable dans index.html'); process.exit(1); }
writeFileSync(idx, html.replace('<script src="app.js"></script>', '<script src="local-config.js"></script>\n<script src="app.js"></script>'));

const origins = [];
if (ov) {
  try { origins.push(new URL(ov.OVERSEERR_URL).origin); } catch { console.error('local-config : OVERSEERR_URL illisible'); process.exit(1); }
}
if (us) origins.push('https://api.unsplash.com', 'https://images.unsplash.com');
const cfg = join(dst, 'config.xml');
if (origins.length && existsSync(cfg)) {
  const xml = readFileSync(cfg, 'utf8');
  if (!xml.includes('</widget>')) { console.error('local-config : </widget> introuvable dans config.xml'); process.exit(1); }
  writeFileSync(cfg, xml.replace('</widget>', origins.map((o) => `  <access origin="${o}" subdomains="false"/>\n`).join('') + '</widget>'));
}
console.log('local-config :' + (env ? ' Home Assistant pré-rempli' : '') + (ov ? ' Overseerr configuré (origine déclarée)' : '') + (us ? ' Unsplash configuré (origines déclarées)' : '') + ' dans la copie empaquetée');
