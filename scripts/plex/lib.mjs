// Outillage partagé des scripts Plex (hors gate npm) : lecture de .local/plex.env, build du client, transport Node.
// Le jeton ne sort jamais de ce module : tout texte affiché passe par redact().
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

// .local n'existe pas dans un worktree : PLEX_ENV_FILE, sinon .local du repo, sinon celui du checkout principal.
export function loadEnv() {
  const cands = [process.env.PLEX_ENV_FILE, join(ROOT, '.local/plex.env'), join(ROOT, '../../../../git/cimaise/.local/plex.env')].filter(Boolean);
  for (const p of cands) {
    let txt;
    try { txt = readFileSync(p, 'utf8'); } catch (e) { continue; }
    const env = {};
    for (const l of txt.split('\n')) { const i = l.indexOf('='); if (i > 0) env[l.slice(0, i).trim()] = l.slice(i + 1).trim(); }
    for (const k of ['PLEX_SERVER_URL', 'PLEX_CLIENT_ID', 'PLEX_TOKEN']) if (!env[k]) throw new Error(k + ' absent de ' + p.replace(/.*\//, '…/'));
    return env;
  }
  throw new Error('plex.env introuvable (définir PLEX_ENV_FILE)');
}

export function makeRedact(env) {
  const secrets = [env.PLEX_TOKEN, env.PLEX_CLIENT_ID].filter(Boolean);
  return (s) => {
    let out = String(s);
    for (const x of secrets) out = out.split(x).join('<secret>');
    return out
      .replace(/X-Plex-Token=[^&\s"]+/g, 'X-Plex-Token=<secret>')
      .replace(/\b\d{1,3}(?:[.-]\d{1,3}){3}\b/g, '<ip>')
      .replace(/\b[0-9a-f]{32}\b/g, '<hash>');
  };
}

// Compile le client réel (tsc ES5 puis bundle CJS), comme tests/plex-api.test.mjs.
export async function loadClient() {
  const dir = mkdtempSync(join(tmpdir(), 'plexverify-'));
  try {
    const es5 = join(dir, 'es5');
    const t = spawnSync(join(ROOT, 'node_modules/.bin/tsc'), ['-p', join(ROOT, 'packages/plex/tsconfig.json'), '--outDir', es5], { encoding: 'utf8' });
    if (t.status !== 0) throw new Error('tsc : ' + t.stdout + t.stderr);
    const out = join(dir, 'plex.cjs');
    await build({ entryPoints: [join(es5, 'plex/src/api/index.js')], bundle: true, format: 'cjs', target: 'es5', outfile: out, logLevel: 'warning' });
    return createRequire(import.meta.url)(out);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

// Transport Node (fetch) respectant le contrat Http du client. Lecture seule : GET/HEAD uniquement.
export const nodeHttp = (req, cb) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    setImmediate(() => cb(new Error('méthode ' + req.method + ' refusée : vérification en lecture seule')));
    return { abort() {} };
  }
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), req.timeoutMs || 10000);
  fetch(req.url, { method: req.method, headers: req.headers, signal: ctl.signal })
    .then((r) => r.text().then((body) => { clearTimeout(timer); cb(null, { status: r.status, body }); }))
    .catch((e) => { clearTimeout(timer); cb(new Error(e.name === 'AbortError' ? 'délai dépassé' : 'réseau : ' + ((e.cause && e.cause.code) || e.message))); });
  return { abort() { clearTimeout(timer); ctl.abort(); } };
};

export const call = (fn) => new Promise((res) => fn((err, v) => res([err, v])));
