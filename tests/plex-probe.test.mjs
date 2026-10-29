// Sonde formats (écran caché du diagnostic) : choix des fiches, essai de lecture directe, export, aucune écriture serveur.
// Faux AVPlay, faux serveur, horloge manuelle : aucune TV.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';

let px;
before(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'plexprobe-'));
  const es5 = join(dir, 'es5');
  const t = spawnSync('node_modules/.bin/tsc', ['-p', 'packages/plex/tsconfig.json', '--outDir', es5], { encoding: 'utf8' });
  assert.equal(t.status, 0, t.stdout + t.stderr);
  const out = join(dir, 'px.cjs');
  await build({ stdin: { resolveDir: es5, contents: "export * from './plex/src/index.js';" }, bundle: true, format: 'cjs', target: 'es5', outfile: out, logLevel: 'warning' });
  px = createRequire(import.meta.url)(out);
});

const SERVER = { uri: 'https://192-0-2-10.' + '0'.repeat(32) + '.plex.direct:32400', token: 'FAKE-SERVER-TOKEN' };
const ID = { clientId: 'c', product: 'Cimaise', version: '0.0.0', platform: 'Tizen', device: 'Frame' };

// Fiche complète synthétique : conteneur, vidéo (codec, largeur, extra), audio, sous-titres.
let seq = 0;
function item({ container = 'mp4', v = 'h264', w = 1920, vs = {}, a = 'aac', subs = [] } = {}) {
  const rk = String(++seq);
  return {
    ratingKey: rk, type: 'movie', title: 'T' + rk,
    Media: [{ id: seq, container, videoCodec: v, audioCodec: a, width: w, Part: [{ id: seq, key: '/library/parts/' + rk + '/file', container, Stream: [
      { id: 1, streamType: 1, codec: v, width: w, ...vs },
      { id: 2, streamType: 2, codec: a, selected: true },
      ...subs.map((c, i) => ({ id: 10 + i, streamType: 3, codec: c })),
    ] }] }],
  };
}

test('pickSamples : une fiche par catégorie, la plus isolée, sans ID en dur', () => {
  const items = [
    item({ container: 'avi', v: 'mpeg4' }),
    item({ container: 'mkv', v: 'h264', a: 'dca' }),                       // aussi mkv-h264 + dts
    item({ container: 'mkv', v: 'h264' }),                                  // mkv-h264 pur
    item({ v: 'h264', vs: { level: 52 } }),
    item({ v: 'h264', vs: { bitDepth: 10 } }),
    item({ v: 'hevc', w: 1920, vs: { bitDepth: 10 } }),
    item({ v: 'hevc', w: 3840, vs: { bitDepth: 10, colorTrc: 'smpte2084' } }), // hevc-4k + hdr10
    item({ v: 'hevc', w: 3840, vs: { DOVIPresent: true, DOVIProfile: 8 } }),
    item({ v: 'hevc', w: 3840, vs: { DOVIPresent: true, DOVIProfile: 5 } }),
    item({ v: 'av1' }),
    item({ a: 'ac3' }), item({ a: 'eac3' }), item({ a: 'truehd' }), item({ a: 'opus' }), item({ a: 'flac' }), item({ a: 'mp2' }),
    item({ subs: ['srt'] }),
  ];
  const s = px.pickSamples(items);
  assert.deepEqual(Object.keys(s).sort(), px.CATEGORIES.map((c) => c.id).sort());
  assert.equal(s['mkv-h264'].ratingKey, items[2].ratingKey);
  assert.equal(s['dts'].ratingKey, items[1].ratingKey);
  assert.equal(s['hdr10'].ratingKey, items[6].ratingKey);
  assert.equal(s['dv8'].ratingKey, items[7].ratingKey);
  assert.equal(s['avi-asp'].part, '/library/parts/' + items[0].ratingKey + '/file');
});

test('pickSamples : catégorie sans fiche absente ; SRT externe ne compte pas', () => {
  const ext = item({ subs: ['srt'] });
  ext.Media[0].Part[0].Stream[2].key = '/library/streams/9';
  const s = px.pickSamples([ext, item({ container: 'avi', v: 'mpeg4' })]);
  assert.equal(s['srt'], undefined);
  assert.equal(s['av1'], undefined);
  assert.ok(s['avi-asp']);
});

// Horloge manuelle ; AVPlay factice dont le comportement dépend de l'URL (clé de fiche).
function clock() {
  let t = 0, id = 0; const q = new Map();
  return {
    now: () => t, setTimeout: (fn, ms) => { q.set(++id, { at: t + ms, fn }); return id; }, clearTimeout: (i) => q.delete(i),
    run() { // joue toutes les échéances dans l'ordre
      for (;;) {
        let best = null;
        for (const [i, e] of q) if (!best || e.at < best[1].at) best = [i, e];
        if (!best) return;
        q.delete(best[0]); t = best[1].at; best[1].fn();
      }
    },
  };
}
function fakeFactory(behaviour, log) {
  return (o) => {
    let pos = 0;
    const pl = {
      open(url, _opts, done) {
        log.push('open:' + url);
        const key = /parts\/(\w+)\//.exec(url)[1], b = behaviour[key] || 'ok';
        if (b === 'prepare-fail') return done(new Error('AVPlay : PLAYER_ERROR_NOT_SUPPORTED_FILE'));
        if (b === 'hang') return;
        if (b === 'async-error') { done(null); setTimeout(() => o.onError(new Error('AVPlay : erreur de lecture PLAYER_ERROR_INVALID_OPERATION')), 0); return; }
        done(null);
        if (b === 'ok') pl._adv = true;
      },
      getPosition: () => { const r = pl._adv ? pos : 0; pos += 2500; return r; },
      destroy() { log.push('destroy'); },
    };
    return pl;
  };
}

test('runProbe : succès, échec avec code, délai (temps figé, pas de réponse), aucune fiche', () => {
  const samples = {
    ac3: { category: 'ac3', ratingKey: '1', part: '/library/parts/1/file', container: 'mkv', vcodec: 'h264', acodec: 'ac3' },
    dts: { category: 'dts', ratingKey: '2', part: '/library/parts/2/file', container: 'mkv', vcodec: 'h264', acodec: 'dca' },
    flac: { category: 'flac', ratingKey: '3', part: '/library/parts/3/file', container: 'mkv', vcodec: 'h264', acodec: 'flac' },
    opus: { category: 'opus', ratingKey: '4', part: '/library/parts/4/file', container: 'mkv', vcodec: 'h264', acodec: 'opus' },
    av1: { category: 'av1', ratingKey: '5', part: '/library/parts/5/file', container: 'mkv', vcodec: 'av1', acodec: 'aac' },
  };
  const c = clock(), log = [], seen = [];
  const fake = fakeFactory({ 1: 'ok', 2: 'prepare-fail', 3: 'frozen', 4: 'hang', 5: 'async-error' }, log);
  let results = null;
  // setTimeout global utilisé par le faux pour l'erreur asynchrone : on le branche sur l'horloge.
  const realST = global.setTimeout; global.setTimeout = (fn, ms) => c.setTimeout(fn, ms);
  try {
    px.runProbe({ server: SERVER, samples, createPlayer: fake, timers: c, onResult: (r) => seen.push(r.id) }, (r) => { results = r; });
    c.run();
  } finally { global.setTimeout = realST; }
  const by = Object.fromEntries(results.map((r) => [r.id, r]));
  assert.equal(results.length, px.CATEGORIES.length);
  assert.equal(by.ac3.status, 'ok');
  assert.equal(by.dts.status, 'fail'); assert.match(by.dts.code, /PLAYER_ERROR_NOT_SUPPORTED_FILE/);
  assert.equal(by.flac.status, 'timeout');
  assert.equal(by.opus.status, 'timeout'); assert.ok(by.opus.ms >= 15000);
  assert.equal(by.av1.status, 'fail'); assert.match(by.av1.code, /INVALID_OPERATION/);
  assert.equal(by.truehd.status, 'none');
  assert.ok(seen.length === results.length);
  // une URL de partie avec le jeton, rien d'autre ; chaque lecteur est détruit (stop/close)
  assert.ok(log.filter((l) => l.startsWith('open:')).every((l) => l.startsWith('open:' + SERVER.uri + '/library/parts/') && l.includes('X-Plex-Token=')));
  assert.equal(log.filter((l) => l === 'destroy').length, 5);
});

test('runProbe : refuse une IP brute, annulation sans rappel', () => {
  const c = clock(), log = [];
  let n = 0;
  px.runProbe({ server: { uri: 'https://192.0.2.10:32400', token: 't' }, samples: { ac3: { category: 'ac3', ratingKey: '1', part: '/library/parts/1/file', container: 'mkv', vcodec: 'h264', acodec: 'ac3' } },
    createPlayer: fakeFactory({}, log), timers: c }, () => { n++; });
  c.run();
  assert.equal(log.length, 0, 'aucune ouverture sans hôte plex.direct');
  const cancel = px.runProbe({ server: SERVER, samples: { ac3: { category: 'ac3', ratingKey: '1', part: '/library/parts/1/file', container: 'mkv', vcodec: 'h264', acodec: 'ac3' } },
    createPlayer: fakeFactory({ 1: 'hang' }, log), timers: c }, () => { n += 10; });
  cancel(); c.run();
  assert.equal(n, 1);
});

test('export : JSON stocké sous cimaise.probe.v1, ligne compacte', () => {
  const rs = [
    { id: 'ac3', label: 'Audio AC3', status: 'ok', code: '+5000 ms', ms: 5100, ratingKey: '1', sample: 'mkv/h264/ac3' },
    { id: 'dts', label: 'Audio DTS', status: 'fail', code: 'PLAYER_ERROR_NOT_SUPPORTED_FILE', ms: 300, ratingKey: '2', sample: 'mkv/h264/dca' },
    { id: 'flac', label: 'Audio FLAC', status: 'timeout', code: 'temps figé', ms: 5000, ratingKey: '3', sample: '' },
    { id: 'av1', label: 'AV1', status: 'none', code: 'aucune fiche', ms: 0, ratingKey: '', sample: '' },
  ];
  const mem = {}; const store = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = v; } };
  assert.equal(px.saveProbe(rs, 42, store), true);
  const j = JSON.parse(mem['cimaise.probe.v1']);
  assert.equal(j.v, 1); assert.equal(j.at, 42);
  assert.deepEqual(j.results.map((r) => [r.id, r.s]), [['ac3', 'ok'], ['dts', 'fail'], ['flac', 'timeout'], ['av1', 'none']]);
  assert.equal(px.compact(rs), 'ac3=OK dts=KO:NOT_SUPPORTED_FILE flac=TO av1=--');
  assert.doesNotMatch(mem['cimaise.probe.v1'], /FAKE|token/i);
});

// DOM factice minimal (comme les autres tests d'écran)
function makeDoc() {
  const mk = (tag) => { let cn = ''; const el = { tag, children: [], parentNode: null, style: {}, textContent: '',
    get className() { return cn; }, set className(v) { cn = v; },
    appendChild(c) { c.parentNode = el; el.children.push(c); return c; }, removeChild(c) { el.children.splice(el.children.indexOf(c), 1); return c; } }; return el; };
  return { createElement: mk, hidden: false, addEventListener() {}, removeEventListener() {} };
}
const allText = (n) => [n.textContent, ...n.children.map(allText)].join('\n');

test('panneau : découverte, sonde automatique, tableau, export ; que des GET, jamais de timeline', () => {
  const lib = [item({ container: 'mkv', v: 'h264', a: 'ac3' }), item({ container: 'avi', v: 'mpeg4' })];
  const requests = [];
  const http = (req, cb) => {
    requests.push(req.method + ' ' + req.url);
    const send = (mc) => setTimeout(() => cb(null, { status: 200, body: JSON.stringify({ MediaContainer: mc }) }), 0);
    if (req.url.includes('/library/sections/1/all')) send({ totalSize: 2, Metadata: lib.map((i) => ({ ratingKey: i.ratingKey, type: 'movie', title: i.title, Media: [{ container: i.Media[0].container, videoCodec: i.Media[0].videoCodec, audioCodec: i.Media[0].audioCodec, width: 1920 }] })) });
    else if (req.url.includes('/library/sections')) send({ Directory: [{ key: '1', title: 'Films', type: 'movie' }] });
    else if (req.url.includes('/library/metadata/')) send({ Metadata: lib });
    else send({});
    return { abort() {} };
  };
  const c = clock(), log = [];
  const mem = {}; const store = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = v; }, removeItem() {} };
  const panel = px.createProbePanel({ nav: { push() {}, pop() {} }, doc: makeDoc(), http, store, session: SERVER, id: ID, timers: c, createPlayer: fakeFactory({}, log) });
  return new Promise((resolve) => {
    const realST = global.setTimeout;
    const iv = setInterval(() => {
      c.run();
      if (mem['cimaise.probe.v1']) {
        clearInterval(iv);
        const txt = allText(panel.el);
        assert.match(txt, /AVI MPEG-4 ASP · OK/);
        assert.match(txt, /Audio AC3 · OK/);
        assert.match(txt, /AV1 · aucune fiche/);
        assert.match(txt, /exporté/);
        assert.match(txt, /avi-asp=OK/);
        assert.ok(requests.every((r) => r.startsWith('GET ')), requests.join('\n'));
        assert.ok(!requests.some((r) => /timeline|scrobble/.test(r)));
        resolve();
      }
    }, 5);
  });
});

test('câblage : touche 1 depuis le diagnostic, script read-probe.sh', () => {
  const idx = readFileSync('apps/tv/src/index.ts', 'utf8');
  assert.match(idx, /isDiagOpen\(\)/);
  assert.match(idx, /createProbePanel/);
  assert.match(readFileSync('packages/tv-core/src/diag.ts', 'utf8'), /Sonde formats/);
  assert.ok(statSync('scripts/tizen/read-probe.sh').mode & 0o100, 'exécutable');
  assert.equal(spawnSync('bash', ['-n', 'scripts/tizen/read-probe.sh']).status, 0);
});
