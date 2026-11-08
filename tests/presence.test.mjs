import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';

let w;
const CFG = { url: 'http://ha.lan:8123', token: 'FAKE-TOKEN' };

before(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'presence-'));
  const es5 = join(dir, 'es5');
  const t = spawnSync('node_modules/.bin/tsc', ['-p', 'packages/widgets/tsconfig.json', '--outDir', es5], { encoding: 'utf8' });
  assert.equal(t.status, 0, t.stdout + t.stderr);
  const out = join(dir, 'w.cjs');
  await build({ entryPoints: [join(es5, 'widgets/src/index.js')], bundle: true, format: 'cjs', target: 'es5', outfile: out, logLevel: 'warning' });
  w = createRequire(import.meta.url)(out);
});

function harness(opts = {}) {
  const sent = [], timers = [];
  let fire;
  const doc = { hidden: false, addEventListener(t, f) { assert.equal(t, 'visibilitychange'); fire = f; } };
  const cfg = { v: 'cfg' in opts ? opts.cfg : CFG };
  w.watchPresence({
    http: (req, cb) => { sent.push(req); cb(null, { status: 200, body: '' }); },
    config: () => cfg.v,
    apps: 'apps' in opts ? opts.apps : (cb) => cb(opts.ids || []),
    doc, now: () => 1000,
    later: (f, ms) => { const h = { f, ms, on: true }; timers.push(h); return h; },
    cancel: (h) => { h.on = false; },
  });
  return { sent, timers, cfg, set(hidden) { doc.hidden = hidden; fire(); } };
}
const body = (r) => JSON.parse(r.body);

test('summarizeApps : TV Plus (2 IDs relevés), Netflix, YouTube (2 IDs), Plex ; null sans liste', () => {
  assert.deepEqual(w.summarizeApps(['com.samsung.tv.tvPlusDeeplinker']), { tvplus: true, netflix: false, youtube: false, plex: false });
  assert.equal(w.summarizeApps(['com.samsung.tv.tvplus']).tvplus, true);
  assert.deepEqual(w.summarizeApps(['org.tizen.netflix-app', '9Ur5IzDKqV.TizenYouTube', 'kIciSQlYEM.plex']), { tvplus: false, netflix: true, youtube: true, plex: true });
  assert.equal(w.summarizeApps(['com.samsung.tv.cobalt-yt']).youtube, true);
  assert.equal(w.summarizeApps(['com.samsung.tv.cobalt-ytkids', 'kIciSQlYEM.service']).youtube, false);
  assert.equal(w.summarizeApps(['kIciSQlYEM.service']).plex, false);
  assert.deepEqual(w.summarizeApps(null), { tvplus: null, netflix: null, youtube: null, plex: null });
});

test('masquée : cimaise_hidden seq 0 avec jeton, puis seq 1 après 3 s si toujours masquée', () => {
  const h = harness({ ids: ['com.samsung.tv.tvplus'] });
  h.set(true);
  assert.equal(h.sent.length, 1);
  assert.equal(h.sent[0].method, 'POST');
  assert.equal(h.sent[0].url, 'http://ha.lan:8123/api/events/cimaise_hidden');
  assert.equal(h.sent[0].headers.Authorization, 'Bearer FAKE-TOKEN');
  assert.deepEqual(body(h.sent[0]), { at: 1000, seq: 0, tvplus: true, netflix: false, youtube: false, plex: false });
  assert.equal(h.timers.length, 1);
  assert.equal(h.timers[0].ms, 3000);
  h.timers[0].f();
  assert.equal(h.sent.length, 2);
  assert.equal(body(h.sent[1]).seq, 1);
});

test('retour au premier plan : cimaise_visible et la 2e salve est annulée', () => {
  const h = harness();
  h.set(true);
  h.set(false);
  assert.equal(h.sent[1].url, 'http://ha.lan:8123/api/events/cimaise_visible');
  assert.deepEqual(body(h.sent[1]), { at: 1000 });
  assert.equal(h.timers[0].on, false);
  assert.equal(h.sent.length, 2);
});

test('sans config HA : aucune requête, aucune minuterie', () => {
  const h = harness({ cfg: null });
  h.set(true); h.set(false);
  assert.equal(h.sent.length, 0);
  assert.equal(h.timers.length, 0);
});

test('getAppsContext absent ou qui lève : événement envoyé quand même, champs nuls', () => {
  const a = harness({ apps: undefined });
  a.set(true);
  assert.equal(body(a.sent[0]).tvplus, null);
  const b = harness({ apps: () => { throw new Error('NO_TIZEN'); } });
  b.set(true);
  assert.equal(b.sent.length, 1);
  assert.equal(body(b.sent[0]).tvplus, null);
});

test("l'app branche watchPresence sur la config HA et getAppsContext passe par l'adaptateur", () => {
  const app = readFileSync('apps/tv/src/index.ts', 'utf8');
  assert.match(app, /watchPresence\(\{ http: xhrHttp, config: function \(\) \{ return haConfigFromPrefs/);
  assert.match(readFileSync('packages/tv-core/src/device.ts', 'utf8'), /getAppsContext/);
  assert.doesNotMatch(readFileSync('packages/widgets/src/presence.ts', 'utf8'), /tizen\./);
});
