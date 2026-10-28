import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';

let core;
before(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'player-'));
  const es5Dir = join(dir, 'es5');
  const t = spawnSync('node_modules/.bin/tsc', ['-p', 'packages/tv-core/tsconfig.json', '--outDir', es5Dir], { encoding: 'utf8' });
  assert.equal(t.status, 0, t.stdout + t.stderr);
  const out = join(dir, 'core.cjs');
  await build({ entryPoints: [join(es5Dir, 'index.js')], bundle: true, format: 'cjs', target: 'es5', outfile: out, logLevel: 'warning' });
  core = createRequire(import.meta.url)(out);
});

// Fausse API AVPlay : journalise les appels, réussit de façon synchrone.
function fakeApi(over = {}) {
  const calls = [];
  let time = 0;
  const api = {
    calls,
    open: (u) => calls.push('open:' + u),
    setListener: (l) => { api.listener = l; calls.push('setListener'); },
    setDisplayRect: (...r) => calls.push('rect:' + r.join(',')),
    prepareAsync: (ok) => { calls.push('prepareAsync'); ok(); },
    play: () => calls.push('play'),
    pause: () => calls.push('pause'),
    seekTo: (ms, ok) => { calls.push('seekTo:' + ms); time = ms; ok(); },
    stop: () => calls.push('stop'),
    close: () => calls.push('close'),
    getCurrentTime: () => time,
    getDuration: () => 100000,
    getState: () => 'PLAYING',
    getTotalTrackInfo: () => [
      { index: 0, type: 'VIDEO', extra_info: '{}' },
      { index: 1, type: 'AUDIO', extra_info: '{"language":"fra"}' },
      { index: 2, type: 'TEXT', extra_info: '{"track_lang":"eng"}' },
    ],
    setSelectTrack: (t, i) => calls.push('select:' + t + i),
    setSilentSubtitle: (b) => calls.push('silent:' + b),
    setTime: (t) => { time = t; },
    ...over,
  };
  return api;
}

function fakeDoc() {
  const ls = [];
  return {
    hidden: false,
    addEventListener: (n, f) => ls.push([n, f]),
    removeEventListener: (n, f) => ls.splice(ls.findIndex((x) => x[1] === f), 1),
    fire(n) { ls.filter((x) => x[0] === n).forEach((x) => x[1]()); },
    count: () => ls.length,
  };
}

test('cycle : open → setListener → setDisplayRect → prepareAsync → play', () => {
  const api = fakeApi();
  const p = core.createPlayer({ api, doc: fakeDoc() });
  let res = 'pending';
  p.open('http://x/a.mkv', { rect: { x: 0, y: 0, w: 1280, h: 720 } }, (e) => { res = e; });
  assert.equal(res, null);
  assert.deepEqual(api.calls, ['open:http://x/a.mkv', 'setListener', 'rect:0,0,1280,720', 'prepareAsync', 'play']);
});

test('reprise : seekTo avant play', () => {
  const api = fakeApi();
  const p = core.createPlayer({ api, doc: fakeDoc() });
  p.open('u', { startMs: 5000 }, () => {});
  assert.deepEqual(api.calls.slice(-2), ['seekTo:5000', 'play']);
});

test('pause, play, stop, close', () => {
  const api = fakeApi();
  const p = core.createPlayer({ api, doc: fakeDoc() });
  p.open('u', {}, () => {});
  api.calls.length = 0;
  p.pause(); p.play(); p.stop(); p.close();
  assert.deepEqual(api.calls, ['pause', 'play', 'stop', 'stop', 'close']);
});

test('±10 s bornés à [0, durée]', () => {
  const api = fakeApi();
  const p = core.createPlayer({ api, doc: fakeDoc() });
  p.open('u', {}, () => {});
  api.setTime(95000); p.forward();
  api.setTime(4000); p.rewind();
  api.setTime(50000); p.forward();
  assert.deepEqual(api.calls.filter((c) => c.startsWith('seekTo')), ['seekTo:100000', 'seekTo:0', 'seekTo:60000']);
});

test('pistes audio/texte listées, sélection et sous-titres', () => {
  const api = fakeApi();
  const p = core.createPlayer({ api, doc: fakeDoc() });
  assert.deepEqual(p.getTracks(), [
    { kind: 'audio', index: 1, info: { language: 'fra' } },
    { kind: 'text', index: 2, info: { track_lang: 'eng' } },
  ]);
  p.selectTrack('audio', 1); p.selectTrack('text', 2); p.setSubtitlesVisible(false);
  assert.deepEqual(api.calls, ['select:AUDIO1', 'select:TEXT2', 'silent:true']);
});

test('événements : buffering, temps, fin, erreur, sous-titre', () => {
  const api = fakeApi(), ev = [];
  const p = core.createPlayer({
    api, doc: fakeDoc(),
    onBuffering: (b, pc) => ev.push('buf:' + b + pc), onTime: (t) => ev.push('t:' + t), onEnd: () => ev.push('end'),
    onError: (e) => ev.push('err:' + e.message), onSubtitle: (s, d) => ev.push('sub:' + s + d),
  });
  p.open('u', {}, () => {});
  const l = api.listener;
  l.onbufferingstart(); l.onbufferingprogress(40); l.onbufferingcomplete();
  l.oncurrentplaytime(1234); l.onstreamcompleted(); l.onerror('PLAYER_ERROR_CONNECTION_FAILED'); l.onsubtitlechange(2000, 'hi');
  assert.deepEqual(ev, ['buf:true0', 'buf:true40', 'buf:false100', 't:1234', 'end',
    'err:AVPlay : erreur de lecture PLAYER_ERROR_CONNECTION_FAILED', 'sub:hi2000']);
});

test('échec de prepareAsync : erreur remontée, lecteur fermé, pas de play', () => {
  const api = fakeApi({ prepareAsync: (ok, ko) => ko('PLAYER_ERROR_INVALID_URI') });
  const p = core.createPlayer({ api, doc: fakeDoc() });
  let res;
  p.open('u', {}, (e) => { res = e; });
  assert.match(res.message, /PLAYER_ERROR_INVALID_URI/);
  assert.ok(!api.calls.includes('play'));
  assert.deepEqual(api.calls.slice(-2), ['stop', 'close']);
});

test('exception synchrone de open : erreur au rappel', () => {
  const api = fakeApi({ open: () => { throw new Error('boom'); } });
  const p = core.createPlayer({ api, doc: fakeDoc() });
  let res;
  p.open('u', {}, (e) => { res = e; });
  assert.equal(res.message, 'boom');
});

test('visibilitychange masqué : position sauvegardée puis stop/close', () => {
  const api = fakeApi(), doc = fakeDoc(), saved = [];
  const p = core.createPlayer({ api, doc, onSuspend: (pos, url) => saved.push([pos, url]) });
  p.open('http://x/a.mkv', {}, () => {});
  api.setTime(42000);
  api.calls.length = 0;
  doc.hidden = true; doc.fire('visibilitychange');
  assert.deepEqual(saved, [[42000, 'http://x/a.mkv']]);
  assert.deepEqual(api.calls, ['stop', 'close']);
  // une seconde notification ne referme pas deux fois
  doc.fire('visibilitychange');
  assert.deepEqual(api.calls, ['stop', 'close']);
});

test('visibilitychange visible ou lecteur non ouvert : rien', () => {
  const api = fakeApi(), doc = fakeDoc(), saved = [];
  const p = core.createPlayer({ api, doc, onSuspend: (pos) => saved.push(pos) });
  doc.hidden = true; doc.fire('visibilitychange');
  p.open('u', {}, () => {});
  doc.hidden = false; api.calls.length = 0; doc.fire('visibilitychange');
  assert.deepEqual(saved, []);
  assert.deepEqual(api.calls, []);
});

test('destroy retire l’écouteur et ferme', () => {
  const api = fakeApi(), doc = fakeDoc();
  const p = core.createPlayer({ api, doc });
  p.open('u', {}, () => {});
  p.destroy();
  assert.equal(doc.count(), 0);
  assert.deepEqual(api.calls.slice(-2), ['stop', 'close']);
});

test('sans TV : getWebapis signale l’absence, aucune lecture simulée', () => {
  globalThis.window = {};
  try {
    const p = core.createPlayer({ doc: fakeDoc() });
    let res;
    p.open('u', {}, (e) => { res = e; });
    assert.equal(res.code, 'NO_WEBAPIS');
  } finally { delete globalThis.window; }
});

test('docs/decisions.md documente webapis.js et les privilèges AVPlay', () => {
  const d = readFileSync('docs/decisions.md', 'utf8');
  assert.match(d, /\$WEBAPIS\/webapis\/webapis\.js/);
  assert.match(d, /http:\/\/developer\.samsung\.com\/privilege\/avplay/);
  assert.match(d, /http:\/\/tizen\.org\/privilege\/internet/);
});
