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
  const sent = [];
  let fire;
  const doc = { hidden: false, addEventListener(t, f) { assert.equal(t, 'visibilitychange'); fire = f; } };
  w.watchPresence({
    http: (req, cb) => { sent.push(req); cb(null, { status: 200, body: '' }); },
    config: () => ('cfg' in opts ? opts.cfg : CFG),
    doc, now: () => 1000,
  });
  return { sent, set(hidden) { doc.hidden = hidden; fire(); } };
}
const body = (r) => JSON.parse(r.body);

test('masquée : un seul cimaise_hidden seq 0, SYNCHRONE, sans délai, tvplus null, avec jeton', () => {
  const h = harness();
  h.set(true);
  assert.equal(h.sent.length, 1);
  assert.equal(h.sent[0].method, 'POST');
  assert.equal(h.sent[0].url, 'http://ha.lan:8123/api/events/cimaise_hidden');
  assert.equal(h.sent[0].headers.Authorization, 'Bearer FAKE-TOKEN');
  assert.equal(h.sent[0].sync, true);
  assert.equal(h.sent[0].timeoutMs, undefined);
  assert.deepEqual(body(h.sent[0]), { at: 1000, seq: 0, tvplus: null });
});

test('retour au premier plan : cimaise_visible asynchrone (délai 2 s)', () => {
  const h = harness();
  h.set(true); h.set(false);
  assert.equal(h.sent.length, 2);
  assert.equal(h.sent[1].url, 'http://ha.lan:8123/api/events/cimaise_visible');
  assert.equal(h.sent[1].sync, false);
  assert.equal(h.sent[1].timeoutMs, 2000);
  assert.deepEqual(body(h.sent[1]), { at: 1000 });
});

test('sans config HA : aucune requête', () => {
  const h = harness({ cfg: null });
  h.set(true); h.set(false);
  assert.equal(h.sent.length, 0);
});

test('xhrHttp sync : open(async=false), pas de timeout posé, échec réseau → erreur sans lever', () => {
  const calls = [];
  class FakeXHR {
    open(m, u, a) { calls.push(['open', a]); }
    setRequestHeader() {}
    set timeout(v) { calls.push(['timeout', v]); }
    send() { if (FakeXHR.fail) throw new Error('NetworkError'); this.status = 201; this.responseText = '{}'; }
  }
  globalThis.XMLHttpRequest = FakeXHR;
  try {
    let res;
    w.xhrHttp({ method: 'POST', url: 'http://x/', headers: {}, body: '{}', sync: true, timeoutMs: 500 }, (e, r) => { res = [e, r]; });
    assert.deepEqual(calls, [['open', false]]);
    assert.equal(res[0], null);
    assert.equal(res[1].status, 201);
    FakeXHR.fail = true;
    w.xhrHttp({ method: 'POST', url: 'http://x/', headers: {}, sync: true }, (e) => { res = [e]; });
    assert.ok(res[0] instanceof Error);
  } finally { delete globalThis.XMLHttpRequest; }
});

test("l'app branche watchPresence sans minuterie ni getAppsContext", () => {
  const app = readFileSync('apps/tv/src/index.ts', 'utf8');
  assert.match(app, /watchPresence\(\{ http: xhrHttp, config: function \(\) \{ return haConfigFromPrefs\(loadStored\(\)\.prefs\); \} \}\);/);
  const src = readFileSync('packages/widgets/src/presence.ts', 'utf8').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(src, /setTimeout|getAppsContext|seq: 1|tizen\./);
  assert.doesNotMatch(readFileSync('packages/tv-core/src/device.ts', 'utf8'), /getAppsContext/);
});
