// Écran lecteur du module Plex (HANDOFF §5.4) : bouton Lire de la fiche, reprise, contrôles, pistes, masquage automatique,
// Retour, suspension, erreur + Plex officiel. Faux AVPlay (via la fabrique injectée), faux serveur, DOM factice : aucune TV.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';

let ui;
before(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'plexplayer-'));
  const es5 = join(dir, 'es5');
  const t = spawnSync('node_modules/.bin/tsc', ['-p', 'packages/plex/tsconfig.json', '--outDir', es5], { encoding: 'utf8' });
  assert.equal(t.status, 0, t.stdout + t.stderr);
  const out = join(dir, 'ui.cjs');
  await build({ stdin: { resolveDir: es5, contents: "export * from './plex/src/index.js'; export * as diag from './tv-core/src/diag.js';" }, bundle: true, format: 'cjs', target: 'es5', outfile: out, logLevel: 'warning' });
  ui = createRequire(import.meta.url)(out);
});

const fx = (n) => readFileSync('tests/fixtures/plex/' + n + '.json', 'utf8');
const SERVER = { uri: 'https://192-0-2-10.' + '0'.repeat(32) + '.plex.direct:32400', token: 'FAKE-SERVER-TOKEN' };
const ID = { clientId: 'test-client-uuid', product: 'Cimaise', version: '0.0.0', platform: 'Tizen', device: 'Frame' };
const DUR = 6164384;
const MOVIE = { ratingKey: '100', type: 'movie', title: 'Titre de film 1', thumb: '/t' };

function makeDoc() {
  const mk = (tag) => {
    let cn = '';
    const attrs = {};
    const el = {
      tag, children: [], parentNode: null, style: {}, textContent: '',
      get className() { return cn; }, set className(v) { cn = v; },
      classList: {
        add: (c) => { if (!cn.split(' ').includes(c)) cn = (cn + ' ' + c).trim(); },
        remove: (c) => { cn = cn.split(' ').filter((x) => x && x !== c).join(' '); },
        contains: (c) => cn.split(' ').includes(c),
      },
      appendChild(c) { if (c.parentNode) c.parentNode.removeChild(c); c.parentNode = el; el.children.push(c); return c; },
      removeChild(c) { el.children.splice(el.children.indexOf(c), 1); c.parentNode = null; return c; },
      setAttribute(k, v) { attrs[k] = String(v); },
      getAttribute: (k) => (k in attrs ? attrs[k] : null),
      removeAttribute(k) { delete attrs[k]; },
      getElementsByTagName(t) { const o = []; (function w(n) { n.children.forEach((c) => { if (c.tag === t) o.push(c); w(c); }); })(el); return o; },
      addEventListener() {}, removeEventListener() {},
    };
    return el;
  };
  return { createElement: mk, hidden: false, addEventListener() {}, removeEventListener() {} };
}
const walk = (n, f) => { f(n); n.children.forEach((c) => walk(c, f)); };
const byClass = (n, cls) => { const o = []; walk(n, (x) => { if (x.classList && x.classList.contains(cls)) o.push(x); }); return o; };
const texts = (n) => { const o = []; walk(n, (x) => { if (x.textContent) o.push(x.textContent); }); return o; };
const has = (n, re) => texts(n).some((t) => re.test(t));

function fakeHttp(meta) {
  const calls = [];
  const http = (req, cb) => {
    calls.push(req);
    const body = /\/library\/metadata\/\d+$/.test(req.url) ? meta() : '';
    setImmediate(() => cb(null, { status: 200, body }));
    return { abort() {} };
  };
  http.calls = calls;
  http.timelines = () => calls.filter((c) => /\/:\/timeline/.test(c.url));
  http.scrobbles = () => calls.filter((c) => /\/:\/scrobble/.test(c.url));
  return http;
}
const withOffset = (off) => () => {
  const j = JSON.parse(fx('metadata'));
  if (off) j.MediaContainer.Metadata[0].viewOffset = off;
  return JSON.stringify(j);
};
const param = (req, k) => new URL(req.url).searchParams.get(k);
const flush = () => new Promise((r) => setTimeout(r, 10));

function fakeTimers() {
  let now = 0, id = 0; const q = [];
  return {
    now: () => now,
    setTimeout: (f, ms) => { q.push({ id: ++id, at: now + ms, f }); return id; },
    clearTimeout: (i) => { const k = q.findIndex((x) => x.id === i); if (k >= 0) q.splice(k, 1); },
    advance(ms) {
      const end = now + ms;
      for (;;) {
        q.sort((a, b) => a.at - b.at);
        if (!q.length || q[0].at > end) break;
        const t = q.shift(); now = t.at; t.f();
      }
      now = end;
    },
  };
}

// Faux lecteur AVPlay ; `open` ne répond que si le test l'ordonne (p.ready()).
function fakePlayer() {
  const p = {
    calls: [], pos: 0, tracks: [
      { kind: 'audio', index: 1, info: { language: 'fra' } },
      { kind: 'audio', index: 2, info: { language: 'eng' } },
      { kind: 'text', index: 3, info: { track_lang: 'eng' } },
    ],
    open(url, o, done) { p.calls.push('open'); p.url = url; p.openOpts = o; p.done = done; },
    ready() { p.done(null); },
    play() { p.calls.push('play'); }, pause() { p.calls.push('pause'); },
    forward() { p.calls.push('forward'); }, rewind() { p.calls.push('rewind'); },
    seekTo(ms) { p.calls.push('seekTo:' + ms); },
    stop() { p.calls.push('stop'); }, close() { p.calls.push('close'); }, destroy() { p.calls.push('destroy'); },
    getState() { return 'PLAYING'; }, getPosition() { return p.pos; }, getDuration() { return DUR; },
    getTracks() { return p.tracks; },
    selectTrack(k, i) { p.calls.push('select:' + k + i); },
    setSubtitlesVisible(v) { p.calls.push('subs:' + v); },
  };
  p.factory = (o) => { p.events = o; return p; };
  return p;
}

function setup(over = {}) {
  const pushed = []; let pops = 0;
  const timers = fakeTimers();
  const http = fakeHttp(over.meta || withOffset(0));
  const player = fakePlayer();
  const store = (() => { const m = {}; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; }, key: (i) => Object.keys(m)[i] || null, get length() { return Object.keys(m).length; } }; })();
  const arg = {
    doc: makeDoc(), http, store, session: SERVER, id: ID, now: () => 1000, timers,
    nav: { push: (x) => pushed.push(x), pop: () => { pops++; } },
    createPlayer: player.factory,
    ...over.arg,
  };
  return { arg, pushed, pops: () => pops, timers, http, player };
}
async function started(over) {
  const s = setup(over);
  const panel = ui.createPlayerPanel(s.arg, MOVIE);
  await flush();
  return { ...s, panel };
}
const ui_of = (panel) => byClass(panel.el, 'plex-pl-ui')[0];

test('fiche : Lire pousse l’écran lecteur, sans message « pas branché »', async () => {
  const s = setup();
  const d = ui.createDetailPanel(s.arg, MOVIE);
  await flush();
  assert.equal(d.onKey('enter'), true);
  assert.equal(s.pushed.length, 1);
  assert.ok(byClass(s.pushed[0].el, 'plex-player').length + (s.pushed[0].el.classList.contains('plex-player') ? 1 : 0) > 0);
  assert.ok(!has(d.el, /pas encore branché/));
});

test('lecture directe : URL de la partie avec le jeton, sans reprise quand viewOffset est nul', async () => {
  const s = await started();
  assert.equal(s.player.calls[0], 'open');
  assert.ok(s.player.url.startsWith(SERVER.uri + '/library/parts/11/1700000000/file.mkv?'));
  assert.equal(new URL(s.player.url).searchParams.get('X-Plex-Token'), SERVER.token);
  assert.ok(!s.player.openOpts.startMs);
});

test('reprise : viewOffset > 0 propose « Reprendre à hh:mm:ss » / « Depuis le début » avant d’ouvrir', async () => {
  const s = await started({ meta: withOffset(3082192) });
  assert.deepEqual(s.player.calls, [], 'rien n’est lu avant le choix');
  assert.ok(has(s.panel.el, /^Reprendre à 00:51:22$/));
  assert.ok(has(s.panel.el, /^Depuis le début$/));
  s.panel.onKey('enter');
  assert.equal(s.player.openOpts.startMs, 3082192);
});

test('reprise : « Depuis le début » ouvre à zéro', async () => {
  const s = await started({ meta: withOffset(3082192) });
  s.panel.onKey('right');
  s.panel.onKey('enter');
  assert.ok(!s.player.openOpts.startMs);
});

test('reprise : Retour pendant la question revient à la fiche sans rien ouvrir', async () => {
  const s = await started({ meta: withOffset(3082192) });
  assert.equal(s.panel.onKey('back'), true);
  assert.equal(s.pops(), 1);
  assert.deepEqual(s.player.calls.filter((c) => c === 'open'), []);
});

test('contrôles : ±10 s, Entrée et touches média pour pause / lecture', async () => {
  const s = await started();
  s.player.ready(); s.player.calls.length = 0;
  s.panel.onKey('left'); s.panel.onKey('right');
  assert.deepEqual(s.player.calls, ['rewind', 'forward']);
  s.player.calls.length = 0;
  s.panel.onKey('enter');
  assert.deepEqual(s.player.calls, ['pause']);
  s.panel.onKey('enter');
  assert.deepEqual(s.player.calls, ['pause', 'play']);
  s.panel.onKey('pause'); s.panel.onKey('play');
  s.panel.onKey('playpause'); s.panel.onKey('playpause');
  assert.deepEqual(s.player.calls.slice(2), ['pause', 'play', 'pause', 'play']);
  s.player.calls.length = 0;
  s.panel.onKey('rewind'); s.panel.onKey('forward');
  assert.deepEqual(s.player.calls, ['rewind', 'forward']);
});

test('interface : barre (transform), temps, masquage après 3 s, réaffichage à la touche, jamais masquée en pause', async () => {
  const s = await started();
  s.player.ready();
  const bar = byClass(s.panel.el, 'plex-pl-bar')[0];
  s.player.pos = DUR / 4;
  s.player.events.onTime(DUR / 4);
  assert.equal(bar.style.transform, 'scaleX(0.25)');
  assert.ok(has(s.panel.el, /^00:25:41 \/ 01:42:44$/), texts(s.panel.el).join('|'));
  assert.ok(ui_of(s.panel).classList.contains('on'), 'visible au début');
  s.timers.advance(2900);
  assert.ok(ui_of(s.panel).classList.contains('on'));
  s.timers.advance(200);
  assert.ok(!ui_of(s.panel).classList.contains('on'), 'masquée après 3 s');
  s.panel.onKey('right');
  assert.ok(ui_of(s.panel).classList.contains('on'), 'réaffichée par une touche');
  s.panel.onKey('enter');   // pause
  s.timers.advance(10000);
  assert.ok(ui_of(s.panel).classList.contains('on'), 'en pause elle reste');
  s.panel.onKey('enter');   // lecture
  s.timers.advance(3100);
  assert.ok(!ui_of(s.panel).classList.contains('on'));
});

test('pistes : Haut ouvre le choix audio / sous-titres, setSelectTrack via le lecteur, sous-titres désactivables', async () => {
  const s = await started();
  s.player.ready(); s.player.calls.length = 0;
  s.panel.onKey('up');
  const menu = byClass(s.panel.el, 'plex-pl-menu')[0];
  assert.ok(menu.classList.contains('on'));
  assert.ok(has(menu, /fra/) && has(menu, /eng/));
  assert.ok(has(menu, /Désactivés/));
  s.timers.advance(5000);
  assert.ok(menu.classList.contains('on'), 'le menu n’est pas masqué par la minuterie');
  // ordre : audio fra, audio eng, [sous-titres] Désactivés, text eng
  s.panel.onKey('down');
  s.panel.onKey('enter');
  assert.deepEqual(s.player.calls, ['select:audio2']);
  assert.ok(!menu.classList.contains('on'), 'menu refermé après le choix');
  s.player.calls.length = 0;
  s.panel.onKey('up');
  for (let i = 0; i < 3; i++) s.panel.onKey('down');
  s.panel.onKey('enter');
  assert.deepEqual(s.player.calls, ['subs:true', 'select:text3']);
  s.panel.onKey('up');
  for (let i = 0; i < 2; i++) s.panel.onKey('down');
  s.panel.onKey('enter');
  assert.deepEqual(s.player.calls.slice(2), ['subs:false']);
});

test('Retour pendant le menu de pistes ferme le menu seulement', async () => {
  const s = await started();
  s.player.ready();
  s.panel.onKey('up');
  s.panel.onKey('back');
  assert.equal(s.pops(), 0);
  assert.ok(!byClass(s.panel.el, 'plex-pl-menu')[0].classList.contains('on'));
});

test('Retour : arrêt propre (timeline stopped, stop/close du lecteur) et retour à la fiche', async () => {
  const s = await started();
  s.player.ready();
  s.player.pos = 42000;
  assert.equal(s.panel.onKey('back'), true);
  assert.equal(s.pops(), 1);
  assert.ok(s.player.calls.includes('destroy'));
  const last = s.http.timelines().pop();
  assert.equal(param(last, 'state'), 'stopped');
  assert.equal(param(last, 'time'), '42000');
  s.panel.onKey('back');
  assert.equal(s.pops(), 1, 'un seul dépilement');
});

test('touche stop : même arrêt propre', async () => {
  const s = await started();
  s.player.ready();
  s.panel.onKey('stop');
  assert.equal(s.pops(), 1);
});

test('visibilitychange : position sauvegardée côté serveur puis retour à la fiche', async () => {
  const s = await started();
  s.player.ready();
  s.player.events.onSuspend(777000, s.player.url);
  const last = s.http.timelines().pop();
  assert.equal(param(last, 'state'), 'stopped');
  assert.equal(param(last, 'time'), '777000');
  assert.equal(s.pops(), 1);
});

test('fin du flux : vu, scrobble, retour à la fiche', async () => {
  const s = await started();
  s.player.ready();
  s.player.events.onEnd();
  assert.equal(s.http.scrobbles().length, 1);
  assert.equal(s.pops(), 1);
});

test('erreur de lecture : message clair, Plex officiel proposé et ouvert (app trouvée par le catalogue, pas d’ID ici)', async () => {
  let opened = 0;
  const s = await started({ arg: { officialApp: () => ({ open: (done) => { opened++; done(null); } }) } });
  s.player.ready();
  s.player.events.onError(new Error('AVPlay : erreur de lecture PLAYER_ERROR_NOT_SUPPORTED_FILE'));
  assert.ok(has(s.panel.el, /Lecture impossible/));
  assert.ok(has(s.panel.el, /^Ouvrir Plex officiel$/));
  assert.ok(s.player.calls.includes('destroy'), 'lecteur libéré');
  assert.equal(param(s.http.timelines().pop(), 'state'), 'stopped');
  assert.equal(s.panel.onKey('enter'), true);
  assert.equal(opened, 1);
});

test('erreur de lecture : Retour revient à la fiche ; sans app Plex officielle, pas de bouton', async () => {
  const s = await started({ arg: { officialApp: () => null } });
  s.player.ready();
  s.player.events.onError(new Error('boom'));
  assert.ok(has(s.panel.el, /Lecture impossible/));
  assert.ok(!has(s.panel.el, /Ouvrir Plex officiel/));
  assert.ok(has(s.panel.el, /Retour/));
  s.panel.onKey('back');
  assert.equal(s.pops(), 1);
});

test('erreur à l’ouverture (prepareAsync) : même écran d’erreur', async () => {
  const s = await started();
  s.player.done(new Error('prepare'));
  assert.ok(has(s.panel.el, /Lecture impossible/));
});

test('hors TV : le vrai lecteur signale l’absence de webapis, aucune lecture simulée', async () => {
  globalThis.window = {};
  try {
    const s = setup({ arg: { createPlayer: undefined } });
    const panel = ui.createPlayerPanel(s.arg, MOVIE);
    await flush();
    assert.ok(has(panel.el, /Lecture impossible/));
    assert.ok(has(panel.el, /pas de TV/), texts(panel.el).join('|'));
  } finally { delete globalThis.window; }
});

test('fiche introuvable côté serveur : erreur claire plutôt qu’un écran noir', async () => {
  const s = await started({ meta: () => JSON.stringify({ MediaContainer: { size: 1, Metadata: [{ ratingKey: '100', type: 'movie', title: 'x' }] } }) });
  assert.ok(has(s.panel.el, /Lecture impossible/));
  assert.ok(!s.player.calls.includes('open'));
});

// --- Décision lecture directe / transcodage (playback/decide) ---------------------------------------------------
const sample = (name) => {
  const s = JSON.parse(readFileSync('tests/fixtures/plex/media-samples.json', 'utf8')).find((x) => x.name === name);
  assert.ok(s, name);
  return JSON.stringify({ MediaContainer: s.MediaContainer });
};
const mode = (panel) => byClass(panel.el, 'plex-pl-mode')[0].textContent;

test('décision : média compatible → lecture directe, URI plex.direct, mode et raison affichés', async () => {
  const s = await started({ meta: () => sample('mp4-h264-aac') });
  assert.equal(s.player.calls[0], 'open');
  assert.ok(s.player.url.startsWith(SERVER.uri + '/library/parts/'), s.player.url);
  assert.ok(!/transcode/.test(s.player.url));
  s.player.ready();
  assert.match(mode(s.panel), /^Lecture directe : /);
});

test('décision : audio DTS non pris en charge → transcodage HLS (décision demandée au serveur), raison affichée', async () => {
  const s = setup({ meta: () => sample('mkv-h264-dts') });
  const base = s.http;
  const http = (req, cb) => {
    if (/transcode\/universal\/decision/.test(req.url)) { http.calls.push(req); setImmediate(() => cb(null, { status: 200, body: JSON.stringify({ MediaContainer: { generalDecisionCode: 1000 } }) })); return { abort() {} }; }
    return base(req, cb);
  };
  http.calls = base.calls; http.timelines = base.timelines; http.scrobbles = base.scrobbles;
  s.arg.http = http;
  const panel = ui.createPlayerPanel(s.arg, MOVIE);
  await flush();
  assert.ok(http.calls.some((c) => /transcode\/universal\/decision/.test(c.url)), texts(panel.el).join('|') + http.calls.map((c) => c.url).join(' '));
  assert.match(s.player.url, /\/video\/:\/transcode\/universal\/start\.m3u8\?/);
  assert.equal(new URL(s.player.url).searchParams.get('protocol'), 'hls');
  s.player.ready();
  assert.match(mode(panel), /^Transcodage : .*dca/);
});

test('décision : codec non pris en charge → transcodage ; refus du serveur → erreur claire', async () => {
  const s = setup({ meta: () => sample('mkv-av1-opus') });
  const base = s.http;
  const http = (req, cb) => {
    if (/transcode\/universal\/decision/.test(req.url)) { setImmediate(() => cb(null, { status: 200, body: JSON.stringify({ MediaContainer: { generalDecisionCode: 2000, generalDecisionText: 'non' } }) })); return { abort() {} }; }
    return base(req, cb);
  };
  s.arg.http = http;
  const panel = ui.createPlayerPanel(s.arg, MOVIE);
  await flush();
  assert.ok(!s.player.calls.includes('open'));
  assert.ok(has(panel.el, /Lecture impossible.*transcodage refusé/));
});

test('décision : pistes par défaut appliquées après la préparation (audio et sous-titre forcé)', async () => {
  const s = await started({ meta: () => sample('mkv-h264-ac3-srt-force') });
  s.player.calls.length = 0;
  s.player.tracks = [
    { kind: 'audio', index: 1, info: {} }, { kind: 'audio', index: 2, info: {} }, { kind: 'text', index: 3, info: {} },
  ];
  s.player.ready();
  assert.ok(s.player.calls.some((c) => /^select:audio\d$/.test(c)), s.player.calls.join());
});

test('décision : URI du serveur sans plex.direct refusée sans fuite de l’adresse', async () => {
  const s = setup({ meta: () => sample('mp4-h264-aac'), arg: { session: { uri: 'https://192.0.2.10:32400', token: 'T' } } });
  const panel = ui.createPlayerPanel(s.arg, MOVIE);
  await flush();
  assert.ok(has(panel.el, /plex\.direct/));
  assert.ok(!texts(panel.el).join('|').includes('192.0.2.10'));
  assert.ok(!s.player.calls.includes('open'));
});

test('mesures : Entrée sur Lire → première image (1er onTime après l’ouverture), une seule mesure', async () => {
  const real = Date.now; let t = 1000; Date.now = () => t;
  try {
    ui.diag.resetMeasures();
    const s = setup();
    const panel = ui.createPlayerPanel(s.arg, MOVIE);
    t = 1300; await flush(); s.player.ready();
    assert.equal(ui.diag.measureStats('lecture'), null, 'pas avant la première image');
    t = 1900; s.player.events.onTime(10);
    t = 2500; s.player.events.onTime(1010);
    assert.deepEqual(ui.diag.measureStats('lecture'), { n: 1, min: 900, median: 900, max: 900 });
    panel.destroy();
  } finally { Date.now = real; }
});

test('mesures : avec la question de reprise, la durée part du choix de l’utilisateur', async () => {
  const real = Date.now; let t = 1000; Date.now = () => t;
  try {
    ui.diag.resetMeasures();
    const s = setup({ meta: withOffset(3000000) });
    const panel = ui.createPlayerPanel(s.arg, MOVIE);
    t = 1200; await flush();
    t = 9000; panel.onKey('enter');            // « Reprendre » choisi 8 s plus tard
    s.player.ready();
    t = 9400; s.player.events.onTime(3000000);
    assert.equal(ui.diag.measureStats('lecture').max, 400);
    panel.destroy();
  } finally { Date.now = real; }
});
