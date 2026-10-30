// Sonde Overseerr (diagnostic, touche 2) : enchaînement image → status → discover, codes, erreurs, clé jamais affichée.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const mod = async () => {
  const r = await build({ entryPoints: ['packages/widgets/src/overseerr-probe.ts'], bundle: true, format: 'esm', write: false, platform: 'neutral' });
  return import('data:text/javascript,' + encodeURIComponent(r.outputFiles[0].text));
};
const CFG = { url: 'https://ov.example.test', key: 'SECRET-KEY' };

test('enchaîne image, status sans clé, discover avec X-Api-Key ; lecture seule (GET)', async () => {
  const { runOverseerrProbe, stepLine } = await mod();
  const reqs = [], steps = []; let t = 0, ended = false;
  const http = (req, cb) => { reqs.push(req); t += 40; cb(null, req.url.includes('status') ? { status: 200, body: '{"version":"1.33.2"}' } : { status: 200, body: '{"results":[1,2,3]}' }); };
  runOverseerrProbe(CFG, http, (u, cb) => { reqs.push({ img: u }); t += 10; cb(true); }, () => t, (s) => steps.push(s), () => { ended = true; });
  assert.ok(ended);
  assert.match(reqs[0].img, /^https:\/\/ov\.example\.test\/favicon\.ico/);
  assert.equal(reqs[1].url, 'https://ov.example.test/api/v1/status');
  assert.equal(reqs[1].headers['X-Api-Key'], undefined);
  assert.equal(reqs[2].url, 'https://ov.example.test/api/v1/discover/movies?page=1');
  assert.equal(reqs[2].headers['X-Api-Key'], 'SECRET-KEY');
  assert.ok(reqs.slice(1).every((r) => r.method === 'GET'));
  assert.deepEqual(steps.map((s) => s.code), [200, 200, 200]);
  assert.equal(steps[1].detail, 'version 1.33.2');
  assert.equal(steps[2].detail, '3 films');
  assert.equal(steps[1].ms, 40);
  assert.ok(steps.every((s) => !stepLine(s).includes('SECRET-KEY')));
});

test('erreur réseau et image refusée : code 0 et erreur affichée, la sonde va au bout', async () => {
  const { runOverseerrProbe, stepLine } = await mod();
  const steps = []; let ended = false;
  runOverseerrProbe(CFG, (req, cb) => cb(new Error('réseau')), (u, cb) => cb(false), () => 0, (s) => steps.push(s), () => { ended = true; });
  assert.ok(ended);
  assert.deepEqual(steps.map((s) => s.code), [0, 0, 0]);
  assert.match(stepLine(steps[1]), /aucun code · 0 ms · erreur : réseau/);
  assert.match(stepLine(steps[0]), /échec du chargement/);
});

test('configuration lue sur window, absente sans URL ou clé', async () => {
  const { overseerrConfig } = await mod();
  assert.deepEqual(overseerrConfig({ __cimaiseOverseerr: { url: 'https://a.test/', key: 'k' } }), { url: 'https://a.test', key: 'k' });
  assert.equal(overseerrConfig({ __cimaiseOverseerr: { url: 'https://a.test' } }), null);
  assert.equal(overseerrConfig({}), null);
});
