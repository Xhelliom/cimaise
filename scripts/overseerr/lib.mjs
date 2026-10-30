// Outillage partagé des scripts Overseerr (hors gate npm) : lecture de .local/overseerr.env, build du client, transport Node.
// LECTURE SEULE : le transport refuse toute méthode autre que GET/HEAD, donc aucune demande (POST /request) ne peut partir.
// La clé et l'hôte ne sortent jamais de ce module : tout texte affiché passe par redact().
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

// .local n'existe pas dans un worktree : OVERSEERR_ENV_FILE, sinon .local du repo, sinon celui du checkout principal.
export function loadEnv() {
  const cands = [process.env.OVERSEERR_ENV_FILE, join(ROOT, '.local/overseerr.env'), join(ROOT, '../../../../git/cimaise/.local/overseerr.env')].filter(Boolean);
  for (const p of cands) {
    let txt;
    try { txt = readFileSync(p, 'utf8'); } catch (e) { continue; }
    const env = {};
    for (const l of txt.split('\n')) { const i = l.indexOf('='); if (i > 0) env[l.slice(0, i).trim()] = l.slice(i + 1).trim(); }
    for (const k of ['OVERSEERR_URL', 'OVERSEERR_API_KEY']) if (!env[k]) throw new Error(k + ' absent de ' + p.replace(/.*\//, '…/'));
    return { url: env.OVERSEERR_URL.replace(/\/+$/, ''), key: env.OVERSEERR_API_KEY };
  }
  throw new Error('overseerr.env introuvable (définir OVERSEERR_ENV_FILE)');
}

export function makeRedact(cfg) {
  const host = new URL(cfg.url).host;
  return (s) => String(s).split(cfg.key).join('<clé>').split(host).join('<hôte>');
}

// Compile le client réel (tsc ES5 puis bundle CJS), comme tests/overseerr-api.test.mjs.
export async function loadClient() {
  const dir = mkdtempSync(join(tmpdir(), 'overseerr-'));
  try {
    const es5 = join(dir, 'es5');
    const t = spawnSync(join(ROOT, 'node_modules/.bin/tsc'), ['-p', join(ROOT, 'packages/overseerr/tsconfig.json'), '--outDir', es5], { encoding: 'utf8' });
    if (t.status !== 0) throw new Error('tsc : ' + t.stdout + t.stderr);
    const out = join(dir, 'overseerr.cjs');
    await build({ entryPoints: [join(es5, 'overseerr/src/index.js')], bundle: true, format: 'cjs', target: 'es5', outfile: out, logLevel: 'warning' });
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

// GET brut (captures) via le même transport en lecture seule.
export const getJson = (cfg, path) => call((cb) => nodeHttp({ method: 'GET', url: cfg.url + '/api/v1' + path, headers: { Accept: 'application/json', 'X-Api-Key': cfg.key } }, cb))
  .then(([err, res]) => {
    if (err) throw err;
    if (res.status !== 200) throw new Error('HTTP ' + res.status + ' sur ' + path.replace(/\?.*/, ''));
    return JSON.parse(res.body);
  });
