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
  assert.deepEqual(api.calls, ['open:http://x/a.mkv', 'setListener', 'rect:0,0,1280,720', 'silent:true', 'prepareAsync', 'play']);
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

function fakeTimers() {
  let t = 0, id = 0; const q = [];
  return {
    setTimeout: (fn, ms) => { q.push({ id: ++id, at: t + ms, fn }); return id; },
    clearTimeout: (i) => { const k = q.findIndex((x) => x.id === i); if (k >= 0) q.splice(k, 1); },
    advance(ms) { t += ms; q.filter((x) => x.at <= t).forEach((x) => { q.splice(q.indexOf(x), 1); x.fn(); }); },
  };
}
const seeks = (api) => api.calls.filter((c) => c.startsWith('seekTo'));
function opened(over = {}, opts = {}) {
  const api = fakeApi(over), timers = fakeTimers();
  const p = core.createPlayer({ api, doc: fakeDoc(), timers, ...opts });
  p.open('u', {}, () => {});
  api.calls.length = 0;
  return { api, timers, p };
}

test('un appui : un seek de ±10 s après 400 ms de silence', () => {
  const { api, timers, p } = opened();
  api.setTime(50000); p.forward();
  assert.deepEqual(seeks(api), []);
  timers.advance(399); assert.deepEqual(seeks(api), []);
  timers.advance(1); assert.deepEqual(seeks(api), ['seekTo:60000']);
  api.setTime(60000); p.rewind(); timers.advance(400);
  assert.deepEqual(seeks(api), ['seekTo:60000', 'seekTo:50000']);
});

test('rafale de 30 appuis : un seul seek, pas accéléré 10/30/60 s', () => {
  const { api, timers, p } = opened({ getDuration: () => 10000000 });
  const pending = [];
  p.destroy();
  const q = core.createPlayer({ api, doc: fakeDoc(), timers, onSeekPending: (t) => pending.push(t) });
  q.open('u', {}, () => {}); api.calls.length = 0;
  for (let i = 0; i < 30; i++) { q.forward(); timers.advance(100); }
  assert.deepEqual(seeks(api), []);
  timers.advance(400);
  // 3×10 + 3×30 + 24×60 s
  assert.deepEqual(seeks(api), ['seekTo:' + (3 * 10000 + 3 * 30000 + 24 * 60000)]);
  assert.equal(pending[0], 10000);
  assert.equal(pending[29], 3 * 10000 + 3 * 30000 + 24 * 60000);
  assert.equal(pending[30], null);
});

test('jamais deux seeks en vol : le suivant attend le rappel, le dernier gagne', () => {
  let ok; const log = [];
  const { api, timers, p } = opened({ seekTo: (ms, s) => { log.push(ms); ok = s; } });
  p.seekTo(10000); p.seekTo(20000); p.seekTo(30000);
  assert.deepEqual(log, [10000]);
  ok(); assert.deepEqual(log, [10000, 30000]);
  ok(); ok(); assert.deepEqual(log, [10000, 30000]);
  // appui pendant un seek en vol : part après le rappel, depuis la cible en vol
  p.seekTo(40000); p.forward(); timers.advance(400);
  assert.deepEqual(log, [10000, 30000, 40000]);
  ok(); assert.deepEqual(log, [10000, 30000, 40000, 50000]);
});

test('cible bornée à [0, durée − 5 s]', () => {
  const { api, timers, p } = opened();
  api.setTime(95000); p.forward(); timers.advance(400);
  api.setTime(4000); p.rewind(); timers.advance(400);
  p.seekTo(999999); p.seekTo(-5);
  assert.deepEqual(seeks(api), ['seekTo:95000', 'seekTo:0', 'seekTo:95000', 'seekTo:0']);
});

test('erreur de seek : non fatale, lecteur ouvert, seek suivant possible', () => {
  let fail = true; const errs = [], seekErrs = [];
  const { api, timers, p } = opened(
    { seekTo: function (ms, ok, ko) { this.calls.push('seekTo:' + ms); fail ? ko('PLAYER_ERROR_SEEK_FAILED') : ok(); } },
    { onError: (e) => errs.push(e.message), onSeekError: (e) => seekErrs.push(e.message) });
  p.forward(); timers.advance(400);
  assert.equal(errs.length, 0);
  assert.match(seekErrs[0], /SEEK_FAILED/);
  assert.ok(!api.calls.includes('stop') && !api.calls.includes('close'));
  fail = false; p.forward(); timers.advance(400);
  assert.equal(seeks(api).length, 2);
});

test('rappel d\'erreur puis onerror SEEK_FAILED sans seek en vol : lecteur ouvert, pas d\'onError', () => {
  const errs = [], seekErrs = [];
  const { api, timers, p } = opened(
    { seekTo: function (ms, ok, ko) { this.calls.push('seekTo:' + ms); ko('PLAYER_ERROR_SEEK_FAILED'); } },
    { onError: (e) => errs.push(e.message), onSeekError: (e) => seekErrs.push(e.message) });
  p.forward(); timers.advance(400);
  assert.equal(seekErrs.length, 1);
  api.listener.onerror('PLAYER_ERROR_SEEK_FAILED');
  assert.equal(errs.length, 0);
  assert.equal(seekErrs.length, 1);
  assert.ok(!api.calls.includes('stop') && !api.calls.includes('close'));
});

test('onerror SEEK_FAILED du listener : non fatal, libère le seek en vol', () => {
  const errs = [], seekErrs = [];
  const { api, timers, p } = opened({ seekTo: function (ms) { this.calls.push('seekTo:' + ms); } },
    { onError: (e) => errs.push(e.message), onSeekError: (e) => seekErrs.push(e.message) });
  p.seekTo(10000); p.seekTo(20000);
  api.listener.onerror('PLAYER_ERROR_SEEK_FAILED');
  assert.equal(errs.length, 0); assert.equal(seekErrs.length, 1);
  assert.deepEqual(seeks(api), ['seekTo:10000', 'seekTo:20000']);
  api.listener.onerror('PLAYER_ERROR_CONNECTION_FAILED');
  assert.equal(errs.length, 1);
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

test('sous-titre externe : chemin posé après open et avant prepareAsync ; un refus n’arrête pas la lecture', () => {
  const api = fakeApi({ setExternalSubtitlePath: (u) => api.calls.push('ext:' + u) });
  const p = core.createPlayer({ api, doc: fakeDoc() });
  let err = 'pas rappelé';
  p.open('http://v', { subtitleUrl: 'http://s.srt' }, (e) => { err = e; });
  assert.equal(err, null);
  const c = api.calls;
  assert.ok(c.indexOf('open:http://v') < c.indexOf('ext:http://s.srt') && c.indexOf('ext:http://s.srt') < c.indexOf('prepareAsync'), c.join());
  const ev = [];
  const api2 = fakeApi({ setExternalSubtitlePath: () => { throw new Error('refusé'); } });
  const p2 = core.createPlayer({ api: api2, doc: fakeDoc(), onSubtitleError: (e) => ev.push(e.message), onError: (e) => ev.push('FATAL ' + e.message) });
  p2.open('http://v', { subtitleUrl: 'http://s.srt' }, (e) => { err = e; });
  assert.equal(err, null);
  assert.ok(api2.calls.includes('play'));
  assert.deepEqual(ev, ['refusé']);
});

test('sous-titres : le rendu natif est coupé à l’ouverture (le texte vient des événements onsubtitlechange)', () => {
  const api = fakeApi();
  const p = core.createPlayer({ api, doc: fakeDoc() });
  p.open('u', {}, () => {});
  assert.ok(api.calls.includes('silent:true'));
});
