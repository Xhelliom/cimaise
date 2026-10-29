// Échoue si un fichier JS contient de la syntaxe ES2015+. Sans argument : le bundle de l'app.
import { spawnSync } from 'node:child_process';

const files = process.argv.length > 2 ? process.argv.slice(2) : ['apps/tv/dist/*.js', 'apps/blank/dist/*.js'];
const r = spawnSync('node_modules/.bin/es-check', ['es5', ...files], { stdio: 'inherit' });
process.exit(r.status === null ? 1 : r.status);
