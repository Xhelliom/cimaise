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
    const body = /\/library\/metadata\/\d+(\?[^/]*)?$/.test(req.url) ? meta() : '';
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
// Laisse passer 10 ms puis vide les setImmediate en attente (les réponses du faux serveur) : un tour lent de la boucle ne fait plus échouer les tests.
const flush = () => new Promise((r) => setTimeout(() => { let n = 0; const go = () => (++n < 6 ? setImmediate(go) : r()); setImmediate(go); }, 10));

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
    calls: [], gen: 0, pos: 0, tracks: [
      { kind: 'audio', index: 1, info: { language: 'fra' } },
      { kind: 'audio', index: 2, info: { language: 'eng' } },
      { kind: 'text', index: 3, info: { track_lang: 'eng' } },
    ],
    open(url, o, done) { p.calls.push('open'); p.url = url; p.openOpts = o; p.done = done; },
    ready() { p.done(null); },
    play() { p.calls.push('play'); }, pause() { p.calls.push('pause'); },
    forward() { p.calls.push('forward'); }, rewind() { p.calls.push('rewind'); },
    seekTo(ms) { p.calls.push('seekTo:' + ms); },
    holdSeek(on) { p.hold = on; if (!on) p.calls.push('cancel'); }, commitSeek() { p.calls.push('commit'); }, cancelSeek() { p.calls.push('cancel'); },
    setTranscode(o, t) { p.transcode = o === null ? null : [o, t]; },
    stop() { p.calls.push('stop'); }, close() { p.gen++; p.calls.push('close'); }, destroy() { p.calls.push('destroy'); },
    getState() { return 'PLAYING'; }, getPosition() { return p.pos; }, getDuration() { return DUR; },
    getTracks() { return p.tracks; },
    selectTrack(k, i) { p.calls.push('select:' + k + i); },
    setSubtitlesVisible(v) { p.calls.push('subs:' + v); },
  };
  p.factory = (o) => { p.events = o; return p; };
  // Comme le vrai wrapper : les événements d'un flux fermé (close/release) sont ignorés.
  p.streamEvents = () => { const g = p.gen, w = {}; for (const k of Object.keys(p.events)) w[k] = (...a) => { if (g === p.gen) return p.events[k](...a); }; return w; };
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

test('reprise : le lecteur ne pose plus la question, il démarre à la position de l’appelant', async () => {
  const s = setup({ meta: withOffset(3082192) });
  const panel = ui.createPlayerPanel(s.arg, MOVIE, 3082192);
  await flush();
  assert.ok(!has(panel.el, /^Reprendre à/) && !has(panel.el, /^Depuis le début$/), 'aucune question');
  assert.equal(s.player.openOpts.startMs, 3082192);
  panel.destroy();
});

test('reprise : sans position transmise, le lecteur démarre à zéro même si le serveur a un viewOffset', async () => {
  const s = setup({ meta: withOffset(3082192) });
  const panel = ui.createPlayerPanel(s.arg, MOVIE, 0);
  await flush();
  assert.ok(!has(panel.el, /^Depuis le début$/));
  assert.ok(!s.player.openOpts.startMs);
  panel.destroy();
});

const ctl = (panel) => byClass(panel.el, 'plex-pl-ctl').filter((n) => !n.classList.contains('plex-pl-next'));
const focused = (panel) => ctl(panel).filter((n) => n.classList.contains('focus')).map((n) => n.textContent);
const jump = (panel) => byClass(panel.el, 'plex-pl-jump')[0];
const cursor = (panel) => byClass(panel.el, 'plex-pl-cursor')[0];
const trackFocused = (panel) => byClass(panel.el, 'plex-pl-track')[0].classList.contains('focus');
const barOn = (panel) => ui_of(panel).classList.contains('on');
const jumpOn = (panel) => jump(panel).classList.contains('on');

test('lecture : rien à l’écran, Gauche / Droite = sauts directs (avance accélérée du lecteur) sans ouvrir la barre', async () => {
  const s = await started();
  s.player.ready();
  s.timers.advance(5000);
  assert.ok(!barOn(s.panel), 'rien à l’écran pendant la lecture');
  s.player.calls.length = 0;
  s.panel.onKey('left'); s.panel.onKey('right');
  assert.deepEqual(s.player.calls, ['rewind', 'forward']);
  assert.ok(!barOn(s.panel), 'la barre de progression ne s’ouvre pas');
  s.panel.onKey('rewind'); s.panel.onKey('forward');
  assert.deepEqual(s.player.calls.slice(2), ['rewind', 'forward']);
  assert.ok(!s.player.hold, 'barre fermée : le saut part tout seul');
});

test('barre fermée : indicateur discret du cumul (« +10 s », « +1 min 50 », « −… »), heure visée dessous, disparaît après le saut', async () => {
  const s = await started();
  s.player.ready();
  s.player.pos = 600000;
  const J = jump(s.panel);
  assert.ok(!jumpOn(s.panel));
  s.player.events.onSeekPending(610000, 10000);
  assert.ok(jumpOn(s.panel) && !barOn(s.panel));
  assert.equal(byClass(J, 'plex-pl-jump-sum')[0].textContent, '+10 s');
  assert.match(byClass(J, 'plex-pl-jump-to')[0].textContent, /00:10:10/);
  s.player.events.onSeekPending(630000, 10000);
  assert.equal(byClass(J, 'plex-pl-jump-sum')[0].textContent, '+30 s');
  s.player.events.onSeekPending(710000, 30000);
  assert.equal(byClass(J, 'plex-pl-jump-sum')[0].textContent, '+1 min 50');
  assert.match(byClass(J, 'plex-pl-jump-to')[0].textContent, /30 s/, 'pas courant');
  s.player.events.onSeekPending(null);
  assert.ok(!jumpOn(s.panel), 'disparaît après le saut');
  s.player.events.onSeekPending(590000, -10000);
  assert.equal(byClass(J, 'plex-pl-jump-sum')[0].textContent, '−10 s');
  assert.ok(!barOn(s.panel));
});

test('barre fermée : Retour pendant la rafale l’annule (sans quitter), Retour ensuite quitte', async () => {
  const s = await started();
  s.player.ready(); s.player.calls.length = 0;
  s.panel.onKey('right');
  s.player.events.onSeekPending(610000, 10000);
  s.panel.onKey('back');
  assert.ok(s.player.calls.includes('cancel'));
  assert.equal(s.pops(), 0);
  s.player.events.onSeekPending(null);
  s.panel.onKey('back');
  assert.equal(s.pops(), 1);
});

test('Entrée = pause + barre visible, focus sur Lecture/Pause ; Entrée sur le bouton reprend', async () => {
  const s = await started();
  s.player.ready(); s.player.calls.length = 0;
  s.panel.onKey('enter');
  assert.deepEqual(s.player.calls, ['pause']);
  assert.ok(barOn(s.panel));
  assert.deepEqual(focused(s.panel), ['Lecture']);
  assert.deepEqual(ctl(s.panel).map((n) => n.textContent), ['Lecture', 'Audio', 'Sous-titres']);
  s.timers.advance(10000);
  assert.ok(barOn(s.panel), 'en pause la barre reste');
  s.panel.onKey('enter');
  assert.deepEqual(s.player.calls, ['pause', 'play']);
  assert.deepEqual(ctl(s.panel).map((n) => n.textContent)[0], 'Pause');
});

test('Haut ou Bas ouvrent la barre, focus sur la rangée de boutons ; pas d’emplacement vide pour « Épisode suivant » (film)', async () => {
  for (const key of ['up', 'down']) {
    const s = await started();
    s.player.ready(); s.player.calls.length = 0;
    s.panel.onKey(key);
    assert.ok(barOn(s.panel));
    assert.deepEqual(s.player.calls, [], 'la lecture continue');
    assert.deepEqual(focused(s.panel), ['Pause']);
    assert.ok(!trackFocused(s.panel));
    assert.equal(byClass(s.panel.el, 'plex-pl-next').length, 0, 'aucun emplacement vide');
    for (let i = 0; i < 6; i++) s.panel.onKey('right');
    assert.deepEqual(focused(s.panel), ['Sous-titres'], 'le focus s’arrête au dernier bouton réel');
  }
});

test('Retour : ferme la barre, puis quitte le lecteur au second appui', async () => {
  const s = await started();
  s.player.ready();
  s.panel.onKey('down');
  s.panel.onKey('back');
  assert.ok(!barOn(s.panel));
  assert.equal(s.pops(), 0);
  s.panel.onKey('back');
  assert.equal(s.pops(), 1);
});

test('barre : masquage après 4 s sans touche, relancé par une touche, jamais pendant un sous-menu ni en pause', async () => {
  const s = await started();
  s.player.ready();
  s.panel.onKey('down');
  s.timers.advance(3900);
  assert.ok(barOn(s.panel));
  s.panel.onKey('right'); // une touche relance les 4 s
  s.timers.advance(3900);
  assert.ok(barOn(s.panel));
  s.timers.advance(200);
  assert.ok(!barOn(s.panel), 'masquée après 4 s');
  s.panel.onKey('down'); s.panel.onKey('right'); s.panel.onKey('enter'); // sous-menu Audio
  assert.ok(byClass(s.panel.el, 'plex-pl-menu')[0].classList.contains('on'));
  s.timers.advance(20000);
  assert.ok(barOn(s.panel) && byClass(s.panel.el, 'plex-pl-menu')[0].classList.contains('on'), 'sous-menu ouvert : pas de masquage');
  s.panel.onKey('back');
  assert.ok(barOn(s.panel), 'Retour ferme le sous-menu seulement');
  assert.equal(s.pops(), 0);
  s.timers.advance(4100);
  assert.ok(!barOn(s.panel), 'sous-menu refermé : le masquage reprend');
});

test('barre : temps écoulé, restant, « Se termine à HH h MM », progression en transform', async () => {
  const start = new Date(2026, 0, 1, 20, 0, 0).getTime();
  const s = await started({ arg: { now: () => start } });
  s.player.ready();
  s.player.events.onTime(DUR / 4);
  assert.equal(byClass(s.panel.el, 'plex-pl-bar')[0].style.transform, 'scaleX(0.25)');
  assert.ok(has(s.panel.el, /^00:25:41$/), texts(s.panel.el).join('|'));
  assert.ok(has(s.panel.el, /^−01:17:03$/));
  // reste 4 623 s (1 h 17 min 03) → 21 h 17
  assert.ok(has(s.panel.el, /^Se termine à 21 h 17$/), texts(s.panel.el).join('|'));
});

test('sous-menu Audio : langue, codec, piste active cochée ; Haut/Bas, Entrée choisit et le ferme', async () => {
  const s = await started();
  s.player.ready(); s.player.calls.length = 0;
  openSub(s.panel, 'audio');
  const menu = byClass(s.panel.el, 'plex-pl-menu')[0];
  assert.ok(menu.classList.contains('on'));
  assert.ok(has(menu, /fra/) && has(menu, /eng/));
  assert.ok(!has(menu, /^Aucun$/), 'pas d’« Aucun » pour l’audio');
  s.panel.onKey('down');
  s.panel.onKey('enter');
  assert.deepEqual(s.player.calls, ['select:audio2']);
  assert.ok(!menu.classList.contains('on'), 'sous-menu refermé après le choix');
  assert.ok(barOn(s.panel), 'la barre reste');
});

test('sous-menu Sous-titres : « Aucun » inclus, choix en place, texte rendu puis effacé', async () => {
  const s = await started();
  s.player.ready(); s.player.calls.length = 0;
  openSub(s.panel, 'sub');
  const menu = byClass(s.panel.el, 'plex-pl-menu')[0];
  assert.ok(has(menu, /^✓ Aucun$/) || has(menu, /^Aucun$/));
  // ordre : Aucun, text eng
  s.panel.onKey('down'); s.panel.onKey('enter');
  assert.deepEqual(s.player.calls, ['select:text3', 'subs:true']);
  s.player.events.onSubtitle('Texte', 1000);
  assert.equal(byClass(s.panel.el, 'plex-pl-sub')[0].textContent, 'Texte');
  openSub(s.panel, 'sub');
  s.panel.onKey('enter'); // Aucun
  assert.equal(byClass(s.panel.el, 'plex-pl-sub')[0].textContent, '');
});

test('focus sur la barre de progression (Haut depuis les boutons) : même saut, vidéo continue, rien ne part tout seul', async () => {
  const s = await started();
  s.player.ready(); s.player.calls.length = 0;
  s.panel.onKey('down');
  s.panel.onKey('up');
  assert.ok(trackFocused(s.panel));
  assert.deepEqual(focused(s.panel), []);
  assert.equal(s.player.hold, true, 'le lecteur garde la cible au lieu de sauter');
  s.panel.onKey('right'); s.panel.onKey('right');
  assert.deepEqual(s.player.calls, ['forward', 'forward'], 'mêmes touches, même accélération (côté lecteur)');
  assert.ok(!s.player.calls.includes('pause'), 'la vidéo continue');
  // position visée affichée : curseur et heure au-dessus
  s.player.events.onSeekPending(DUR / 2, 10000);
  assert.equal(cursor(s.panel).style.transform, 'translateX(840px)');
  assert.match(byClass(s.panel.el, 'plex-pl-cursor-time')[0].textContent, /^00:51:22$/);
  assert.ok(!jumpOn(s.panel), 'l’indicateur discret est réservé à la barre fermée');
  assert.equal(byClass(s.panel.el, 'plex-pl-preview').length, 1, 'emplacement de l’aperçu réservé');
  s.timers.advance(20000);
  assert.ok(barOn(s.panel), 'cible en attente : la barre ne se masque pas');
  s.player.calls.length = 0;
  s.panel.onKey('enter');
  assert.deepEqual(s.player.calls, ['commit'], 'Entrée confirme : un seul saut');
  s.player.events.onSeekPending(null);
  assert.ok(barOn(s.panel), 'la barre reste affichée après le saut');
});

test('focus sur la barre de progression : Retour annule la cible (la barre reste), Retour ensuite ferme la barre', async () => {
  const s = await started();
  s.player.ready();
  s.panel.onKey('down'); s.panel.onKey('up');
  s.panel.onKey('right');
  s.player.events.onSeekPending(DUR / 2, 10000);
  s.player.calls.length = 0;
  s.panel.onKey('back');
  assert.deepEqual(s.player.calls, ['cancel']);
  s.player.events.onSeekPending(null);
  assert.ok(barOn(s.panel) && trackFocused(s.panel));
  assert.ok(!cursor(s.panel).classList.contains('on'), 'curseur effacé');
  assert.equal(s.pops(), 0);
  s.panel.onKey('back');
  assert.ok(!barOn(s.panel));
  assert.equal(s.pops(), 0);
  assert.equal(s.player.hold, false);
});

test('focus sur la barre : Bas revient aux boutons (cible abandonnée) ; Entrée sans cible = pause', async () => {
  const s = await started();
  s.player.ready(); s.panel.onKey('down'); s.panel.onKey('up');
  s.player.calls.length = 0;
  s.panel.onKey('enter');
  assert.deepEqual(s.player.calls, ['pause']);
  s.panel.onKey('right');
  s.player.calls.length = 0;
  s.panel.onKey('down');
  assert.deepEqual(s.player.calls, ['cancel']);
  assert.ok(!trackFocused(s.panel));
  assert.equal(s.player.hold, false);
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


// --- Sous-titres et pistes (HANDOFF §5.3–5.4) ------------------------------------------------------------------

const prefsStore = (store, prefs) => store.setItem('cimaise.v1', JSON.stringify({ version: 3, prefs }));
const storedPrefs = (store) => JSON.parse(store.getItem('cimaise.v1')).prefs;
const DECISION = JSON.stringify({ MediaContainer: { generalDecisionCode: 1000 } });
// Serveur factice qui accepte aussi la décision de transcodage (journalisée dans http.calls).
function withDecision(s) {
  const base = s.http;
  const http = (req, cb) => {
    if (/transcode\/universal\/decision/.test(req.url)) { http.calls.push(req); setImmediate(() => cb(null, { status: 200, body: DECISION })); return { abort() {} }; }
    return base(req, cb);
  };
  http.calls = base.calls; http.timelines = base.timelines; http.scrobbles = base.scrobbles;
  s.arg.http = http;
}
const EPISODE = { ratingKey: '100', type: 'episode', title: 'Épisode 1', grandparentRatingKey: '900' };
async function playing(name, prefs, over = {}) {
  const s = setup({ meta: () => sample(name), ...over });
  if (prefs) prefsStore(s.arg.store, prefs);
  if (over.transcode) withDecision(s);
  const panel = ui.createPlayerPanel(s.arg, over.item || MOVIE);
  await flush();
  return { ...s, panel };
}
const subLine = (panel) => byClass(panel.el, 'plex-pl-sub')[0];
const menuTexts = (panel) => byClass(byClass(panel.el, 'plex-pl-menu')[0], 'plex-pl-opt').map((o) => o.textContent);
// Ouvre le sous-menu (barre fermée ou ouverte) : Bas → rangée de boutons, 3× Gauche → Lecture/Pause, puis Droite jusqu'au bouton.
function openSub(panel, kind) {
  panel.onKey('down');
  for (let i = 0; i < 3; i++) panel.onKey('left');
  panel.onKey('right'); if (kind === 'sub') panel.onKey('right');
  panel.onKey('enter');
}
function choose(panel, kind, re) { openSub(panel, kind); pick(panel, re); }
// Descend jusqu'à l'entrée de menu dont le texte correspond, puis Entrée.
function pick(panel, re) {
  const opts = menuTexts(panel), i = opts.findIndex((t) => re.test(t));
  assert.ok(i >= 0, re + ' absent du menu : ' + opts.join(' | '));
  for (let k = 0; k < i; k++) panel.onKey('down');
  panel.onKey('enter');
}

test('sous-titres : SRT interne choisi par défaut (choix de la série : audio anglais, sous-titres français) → setSelectTrack sur la bonne piste AVPlay', async () => {
  const s = await playing('mkv-h264-ac3-srt-externe', { plexSeries: { 900: { audioLang: 'eng', subLang: 'fra' } } }, { item: EPISODE });
  s.player.tracks = [
    { kind: 'audio', index: 1, info: {} }, { kind: 'audio', index: 2, info: {} },
    { kind: 'text', index: 3, info: {} }, { kind: 'text', index: 4, info: {} }, { kind: 'text', index: 5, info: {} },
  ];
  s.player.calls.length = 0;
  s.player.ready();
  assert.ok(s.player.calls.includes('select:audio2'), s.player.calls.join());
  assert.ok(s.player.calls.includes('select:text3'), s.player.calls.join());
  assert.ok(!s.player.openOpts.subtitleUrl);
});

test('sous-titres : SRT externe → URL du fichier passée à l’ouverture (setExternalSubtitlePath), lecture directe', async () => {
  const s = await playing('mkv-h264-ac3-pgs', {});
  assert.ok(s.player.url.startsWith(SERVER.uri + '/library/parts/'), s.player.url);
  assert.ok(s.player.openOpts.subtitleUrl.startsWith(SERVER.uri + '/library/streams/'), s.player.openOpts.subtitleUrl);
  assert.equal(new URL(s.player.openOpts.subtitleUrl).searchParams.get('X-Plex-Token'), SERVER.token);
});

test('sous-titres : rendu maison des événements AVPlay, en bas, nettoyé, effacé à l’expiration, jamais flou', async () => {
  const s = await playing('mkv-h264-ac3-pgs', {});
  s.player.ready();
  assert.equal(subLine(s.panel).textContent, '');
  s.player.events.onSubtitle('<i>Bonjour</i>\n{\\an8}tout le monde', 2000);
  assert.equal(subLine(s.panel).textContent, 'Bonjour\ntout le monde');
  s.timers.advance(1999);
  assert.equal(subLine(s.panel).textContent, 'Bonjour\ntout le monde');
  s.timers.advance(2);
  assert.equal(subLine(s.panel).textContent, '');
  s.player.events.onSubtitle('Un', 1000);
  s.player.events.onSubtitle('Deux', 1000);
  assert.equal(subLine(s.panel).textContent, 'Deux', 'le nouveau texte remplace l’ancien');
  const css = readFileSync('packages/plex/src/plex.css', 'utf8');
  const rule = css.match(/\.plex-pl-sub\{[^}]*\}/);
  assert.ok(rule, 'règle .plex-pl-sub');
  assert.doesNotMatch(rule[0], /blur|filter/);
  assert.match(rule[0], /font-size:(4[4-9]|[5-9]\d)px/, 'lisible à 3 m');
});

test('sous-titres : rien n’est affiché quand les sous-titres sont coupés (événements d’une piste non choisie ignorés)', async () => {
  const s = await playing('mp4-h264-aac', { plexLang: { mode: 'custom', audio: ['eng'], subs: ['fra'] } }); // audio compris : aucun sous-titre
  s.player.ready();
  s.player.events.onSubtitle('Texte', 2000);
  assert.equal(subLine(s.panel).textContent, '');
});

test('sous-titres : un sous-titre externe refusé par AVPlay n’arrête pas la lecture, le lecteur l’indique', async () => {
  const s = await playing('mkv-h264-ac3-pgs', {});
  s.player.ready();
  s.player.events.onSubtitleError(new Error('AVPlay : refusé'));
  assert.ok(has(s.panel.el, /Sous-titres indisponibles/));
  assert.ok(!has(s.panel.el, /Lecture impossible/));
});

test('sous-titres : externe refusé pendant l’ouverture → aucune piste interne choisie à la place, message une fois la lecture lancée', async () => {
  const s = await playing('mkv-h264-ac3-pgs', {});
  s.player.tracks = [{ kind: 'audio', index: 1, info: {} }, { kind: 'text', index: 2, info: {} }];
  s.player.events.onSubtitleError(new Error('AVPlay : refusé')); // synchrone dans open(), avant le prêt
  s.player.calls.length = 0;
  s.player.ready();
  assert.ok(!s.player.calls.some((c) => /^select:text/.test(c)), s.player.calls.join());
  assert.ok(has(s.panel.el, /Sous-titres indisponibles/));
  s.player.events.onSubtitle('Interne', 1000);
  assert.equal(subLine(s.panel).textContent, '');
});

test('PGS / VobSub / ASS : transcodage avec sous-titres incrustés, demandé au serveur (subtitles=burn)', async () => {
  const s = await playing('mkv-h264-ac3-vobsub', { plexLang: { mode: 'custom', audio: ['jpn'], subs: ['eng'] } }, { transcode: true });
  const req = s.arg.http.calls.find((c) => /transcode\/universal\/decision/.test(c.url));
  assert.ok(req, 'décision demandée');
  assert.equal(param(req, 'subtitles'), 'burn');
  assert.equal(param(req, 'subtitleStreamID'), '8303');
  assert.match(s.player.url, /start\.m3u8\?/);
  s.player.ready();
  assert.match(mode(s.panel), /^Transcodage : .*vobsub/);
  assert.ok(!s.player.openOpts.subtitleUrl, 'pas de sous-titre AVPlay : ils sont dans l’image');
});

test('menu des pistes : audio et sous-titres avec langue, codec et « forcés », piste courante marquée', async () => {
  const s = await playing('mkv-h264-ac3-srt-force', {});
  s.player.ready();
  openSub(s.panel, 'audio');
  const a = menuTexts(s.panel);
  assert.ok(a.some((t) => /^✓ Français · AC3/.test(t)), a.join(' | '));
  assert.ok(a.some((t) => /^Anglais · AC3/.test(t)));
  assert.ok(!a.some((t) => /SRT|Aucun/.test(t)), 'audio seulement');
  s.panel.onKey('back');
  openSub(s.panel, 'sub');
  const m = menuTexts(s.panel);
  assert.ok(m.some((t) => /^✓ Français · SRT · forcés/.test(t)), 'forcé actif seul par défaut : ' + m.join(' | '));
  assert.ok(m.some((t) => /^Aucun$/.test(t)));
  assert.ok(!m.some((t) => /AC3/.test(t)), 'sous-titres seulement');
});

test('menu : sous-titres forcés actifs seuls (sélection interne + affichage) sans rien demander', async () => {
  const s = await playing('mkv-h264-ac3-srt-force', {});
  s.player.tracks = [{ kind: 'audio', index: 1, info: {} }, { kind: 'audio', index: 2, info: {} }, { kind: 'text', index: 3, info: {} }, { kind: 'text', index: 4, info: {} }];
  s.player.ready();
  assert.ok(s.player.calls.includes('select:text3'), s.player.calls.join());
  s.player.events.onSubtitle('Traduction', 1500);
  assert.equal(subLine(s.panel).textContent, 'Traduction');
});

test('menu : changer de sous-titre interne en direct se fait en place (setSelectTrack), sans relancer le flux', async () => {
  const s = await playing('mkv-h264-ac3-srt-force', {});
  s.player.tracks = [{ kind: 'audio', index: 1, info: {} }, { kind: 'audio', index: 2, info: {} }, { kind: 'text', index: 3, info: {} }, { kind: 'text', index: 4, info: {} }];
  s.player.ready(); s.player.calls.length = 0;
  choose(s.panel, 'sub', /Français · SRT$/);
  assert.deepEqual(s.player.calls.filter((c) => c !== 'subs:true'), ['select:text4']);
  s.player.events.onSubtitle('Texte', 1000);
  assert.equal(subLine(s.panel).textContent, 'Texte');
  choose(s.panel, 'sub', /Aucun/);
  assert.equal(subLine(s.panel).textContent, '', 'désactivés : ligne effacée');
  s.player.events.onSubtitle('Encore', 1000);
  assert.equal(subLine(s.panel).textContent, '');
});

test('menu : choisir un SRT externe relance le flux à la position courante avec le fichier de sous-titres', async () => {
  const s = await playing('mkv-h264-ac3-pgs', {});
  s.player.ready(); s.player.pos = 321000; s.player.calls.length = 0;
  choose(s.panel, 'sub', /Français · SRT · externe/);
  assert.ok(s.player.calls.includes('open'), s.player.calls.join());
  assert.equal(s.player.openOpts.startMs, 321000);
  assert.ok(s.player.openOpts.subtitleUrl);
  s.player.ready();
  assert.ok(!has(s.panel.el, /Lecture impossible/));
});

test('menu : choisir un sous-titre PGS relance en transcodage incrusté à la position courante', async () => {
  const s = await playing('mkv-h264-ac3-pgs', {}, { transcode: true });
  s.player.ready(); s.player.pos = 100000; s.player.calls.length = 0;
  choose(s.panel, 'sub', /Anglais · PGS · incrustés/);
  await flush();
  const req = s.arg.http.calls.filter((c) => /transcode\/universal\/decision/.test(c.url)).pop();
  assert.ok(req, 'décision demandée');
  assert.equal(param(req, 'subtitles'), 'burn');
  assert.match(s.player.url, /start\.m3u8/);
  assert.equal(param(req, 'offset'), '100');
  assert.ok(!s.player.openOpts.startMs, 'transcodé : le flux démarre à l’offset');
  assert.equal(s.player.transcode[0], 100000); assert.ok(s.player.transcode[1] > 0);
});

test('séries : le choix de piste est retenu pour les autres épisodes (langue, pas identifiant de piste)', async () => {
  const s = await playing('mkv-h264-ac3-srt-force', {}, { item: EPISODE });
  s.player.ready();
  choose(s.panel, 'audio', /Anglais/);
  choose(s.panel, 'sub', /Français · SRT$/);
  assert.deepEqual(storedPrefs(s.arg.store).plexSeries['900'], { audioLang: 'eng', subLang: 'fra' });
  // Autre épisode de la même série : mêmes choix sans toucher au menu.
  const t = setup({ meta: () => sample('mkv-h264-ac3-srt-force'), arg: { store: s.arg.store } });
  const panel = ui.createPlayerPanel(t.arg, { ...EPISODE, ratingKey: '101' });
  await flush();
  t.player.tracks = [{ kind: 'audio', index: 1, info: {} }, { kind: 'audio', index: 2, info: {} }, { kind: 'text', index: 3, info: {} }, { kind: 'text', index: 4, info: {} }];
  t.player.ready();
  assert.ok(t.player.calls.includes('select:audio2') && t.player.calls.includes('select:text4'), t.player.calls.join());
  // Une autre série garde les réglages globaux (audio français, forcé seul).
  const u = setup({ meta: () => sample('mkv-h264-ac3-srt-force'), arg: { store: s.arg.store } });
  ui.createPlayerPanel(u.arg, { ...EPISODE, grandparentRatingKey: '777' });
  await flush();
  u.player.tracks = t.player.tracks;
  u.player.ready();
  assert.ok(u.player.calls.includes('select:audio1') && u.player.calls.includes('select:text3'), u.player.calls.join());
});

test('séries : désactiver les sous-titres est retenu aussi ; un film ne laisse aucune mémoire de série', async () => {
  const s = await playing('mkv-h264-ac3-srt-force', {}, { item: EPISODE });
  s.player.ready();
  choose(s.panel, 'sub', /Aucun/);
  assert.equal(storedPrefs(s.arg.store).plexSeries['900'].subLang, '');
  const m = await playing('mkv-h264-ac3-srt-force', {});
  m.player.ready();
  choose(m.panel, 'audio', /Anglais/);
  assert.equal(storedPrefs(m.arg.store).plexSeries, undefined);
});

// --- Transcodage fiable : session, sauts lointains, erreurs (carte « transcodage HLS fiable ») -----------------

const urls = (s, re) => s.arg.http.calls.filter((c) => re.test(c.url));
const STOP = /transcode\/universal\/stop/, DECISION_URL = /transcode\/universal\/decision/;

test('transcodage : session stable par lecture, arrêtée en quittant le lecteur (Retour)', async () => {
  const s = await playing('mkv-h264-dts', {}, { transcode: true });
  s.player.ready();
  const session = param(urls(s, DECISION_URL)[0], 'session');
  assert.ok(session && session !== ID.clientId, 'session propre à la lecture');
  assert.equal(urls(s, STOP).length, 0, 'pas d’arrêt pendant la lecture');
  s.panel.onKey('back');
  assert.equal(urls(s, STOP).length, 1);
  assert.equal(param(urls(s, STOP)[0], 'session'), session);
  s.panel.destroy();
  assert.equal(urls(s, STOP).length, 1, 'un seul arrêt');
});

test('transcodage : arrêt de la session aussi sur erreur du lecteur, Plex officiel proposé', async () => {
  const s = await playing('mkv-h264-dts', {}, { transcode: true, arg: { officialApp: () => ({ open: (d) => d(null) }) } });
  s.player.ready();
  s.player.events.onError(new Error('AVPlay : erreur de lecture PLAYER_ERROR_CONNECTION_FAILED'));
  assert.equal(urls(s, STOP).length, 1);
  assert.ok(has(s.panel.el, /Lecture impossible/));
  assert.ok(has(s.panel.el, /^Ouvrir Plex officiel$/));
});

test('transcodage : lecture directe → aucune session, aucun arrêt, pas d’en-tête de session sur la timeline', async () => {
  const s = await started({ meta: () => sample('mp4-h264-aac') });
  s.player.ready();
  assert.equal(s.player.transcode, null);
  s.panel.onKey('back');
  assert.equal(urls(s, STOP).length, 0);
  assert.ok(s.http.timelines().length > 0);
  for (const t of s.http.timelines()) assert.equal(t.headers['X-Plex-Session-Identifier'], undefined);
});

test('transcodage : la timeline indique la session de transcodage au serveur', async () => {
  const s = await playing('mkv-h264-dts', {}, { transcode: true });
  await flush();
  s.player.ready();
  const session = param(urls(s, DECISION_URL)[0], 'session');
  const t = s.arg.http.timelines();
  assert.ok(t.length > 0);
  for (const x of t) assert.equal(x.headers['X-Plex-Session-Identifier'], session);
});

test('transcodage : saut lointain → la session est arrêtée puis relancée à la nouvelle position (même session), sans seekTo', async () => {
  const s = await playing('mkv-h264-dts', {}, { transcode: true });
  s.player.ready();
  assert.equal(s.player.transcode[0], 0); assert.ok(s.player.transcode[1] > 0);
  const session = param(urls(s, DECISION_URL)[0], 'session');
  s.player.calls.length = 0;
  s.player.events.onFarSeek(3600000);
  await flush();
  const calls = s.arg.http.calls;
  const iStop = calls.findIndex((c) => STOP.test(c.url)), iDec = calls.findIndex((c, i) => i > 0 && DECISION_URL.test(c.url) && param(c, 'offset') === '3600');
  assert.ok(iStop >= 0 && iDec > iStop, 'arrêt avant la nouvelle décision : ' + calls.map((c) => c.url.split('?')[0].split('/').pop()).join());
  assert.equal(param(calls[iDec], 'session'), session);
  assert.equal(param(calls[iStop], 'session'), session);
  assert.ok(s.player.calls.includes('open'));
  assert.ok(!s.player.calls.some((c) => /^seekTo/.test(c)));
  assert.equal(param({ url: s.player.url }, 'offset'), '3600');
  assert.ok(!s.player.openOpts.startMs, 'le flux démarre déjà à la position demandée');
  assert.equal(s.player.transcode[0], 3600000); assert.ok(s.player.transcode[1] > 0);
  s.player.ready();
  assert.match(mode(s.panel), /^Transcodage/);
  s.panel.onKey('back');
  assert.equal(urls(s, STOP).length, 2, 'le dernier flux est arrêté à la sortie');
});

test('transcodage : reprise à une position → le flux est demandé avec cet offset', async () => {
  const s = setup({ meta: () => { const j = JSON.parse(sample('mkv-h264-dts')); j.MediaContainer.Metadata[0].viewOffset = 1800000; return JSON.stringify(j); } });
  withDecision(s);
  const panel = ui.createPlayerPanel(s.arg, MOVIE, 1800000);
  await flush();
  assert.equal(param(urls(s, DECISION_URL)[0], 'offset'), '1800');
  assert.equal(s.player.transcode[0], 1800000); assert.ok(s.player.transcode[1] > 0);
});

test('transcodage : serveur occupé (503) → message clair et repli vers Plex officiel, session arrêtée', async () => {
  const s = setup({ meta: () => sample('mkv-h264-dts'), arg: { officialApp: () => ({ open: (d) => d(null) }) } });
  const base = s.http;
  const http = (req, cb) => {
    if (DECISION_URL.test(req.url)) { http.calls.push(req); setImmediate(() => cb(null, { status: 503, body: '' })); return { abort() {} }; }
    return base(req, cb);
  };
  http.calls = base.calls; http.timelines = base.timelines; http.scrobbles = base.scrobbles;
  s.arg.http = http;
  const panel = ui.createPlayerPanel(s.arg, MOVIE);
  await flush();
  assert.ok(has(panel.el, /Lecture impossible.*occupé/));
  assert.ok(has(panel.el, /^Ouvrir Plex officiel$/));
  assert.equal(urls(s, STOP).length, 1);
  assert.ok(!s.player.calls.includes('open'));
});

test('transcodage : codec refusé par le transcodeur → message et repli, session arrêtée', async () => {
  const s = setup({ meta: () => sample('mkv-av1-opus'), arg: { officialApp: () => ({ open: (d) => d(null) }) } });
  const base = s.http;
  const http = (req, cb) => {
    if (DECISION_URL.test(req.url)) { http.calls.push(req); setImmediate(() => cb(null, { status: 200, body: JSON.stringify({ MediaContainer: { generalDecisionCode: 2000, generalDecisionText: 'Codec non supporté' } }) })); return { abort() {} }; }
    return base(req, cb);
  };
  http.calls = base.calls; http.timelines = base.timelines; http.scrobbles = base.scrobbles;
  s.arg.http = http;
  const panel = ui.createPlayerPanel(s.arg, MOVIE);
  await flush();
  assert.ok(has(panel.el, /Lecture impossible.*refusé.*Codec non supporté/));
  assert.ok(has(panel.el, /^Ouvrir Plex officiel$/));
  assert.equal(urls(s, STOP).length, 1);
});

// Relance (saut lointain) : l'ancien flux, coupé, ne doit ni afficher d'erreur ni quitter le lecteur avant la nouvelle décision.
for (const [name, fire] of [['onerror', (ev) => ev.onError(new Error('AVPlay : erreur de lecture PLAYER_ERROR_CONNECTION_FAILED'))], ['onstreamcompleted', (ev) => ev.onEnd()]]) {
  test('transcodage : saut lointain, ' + name + ' de l’ancien flux avant la nouvelle décision → lecture reprise, pas d’erreur, session intacte', async () => {
    const s = await playing('mkv-h264-dts', {}, { transcode: true });
    s.player.ready();
    s.player.calls.length = 0;
    const old = s.player.streamEvents();
    const base = s.arg.http, held = [];
    const http = (req, cb) => {
      if (DECISION_URL.test(req.url) && param(req, 'offset') === '3600') { http.calls.push(req); held.push(() => base({ url: req.url, headers: req.headers, method: req.method }, cb)); return { abort() {} }; }
      return base(req, cb);
    };
    http.calls = base.calls; http.timelines = base.timelines; http.scrobbles = base.scrobbles;
    s.arg.http = http;
    s.player.events.onFarSeek(3600000);
    await flush();
    assert.ok(s.player.calls.includes('stop') && s.player.calls.includes('close'), 'ancien flux coupé');
    assert.equal(urls(s, STOP).length, 1);
    fire(old);                             // l'ancien flux réagit à l'arrêt de sa session
    await flush();
    assert.ok(!has(s.panel.el, /Lecture impossible/), 'pas d’écran d’erreur');
    assert.equal(s.pops(), 0, 'le lecteur n’est pas quitté');
    assert.equal(urls(s, STOP).length, 1, 'la nouvelle session n’est pas arrêtée');
    held.forEach((f) => f());
    await flush();
    assert.equal(param({ url: s.player.url }, 'offset'), '3600');
    s.player.ready();
    assert.match(mode(s.panel), /^Transcodage/);
    assert.equal(urls(s, STOP).length, 1);
  });
}

// Erreur signalée par le seul onerror d'AVPlay pendant prepareAsync (sans rappel d'erreur de prepare) : écran d'erreur, repli, session arrêtée.
test('transcodage : onerror pendant le premier prepareAsync (sans rappel d’erreur) → erreur, Plex officiel, session arrêtée', async () => {
  const s = await playing('mkv-h264-dts', {}, { transcode: true, arg: { officialApp: () => ({ open: (d) => d(null) }) } });
  assert.ok(has(s.panel.el, /Chargement/));
  s.player.events.onError(new Error('AVPlay : erreur de lecture PLAYER_ERROR_CONNECTION_FAILED'));
  assert.ok(has(s.panel.el, /Lecture impossible/));
  assert.ok(has(s.panel.el, /^Ouvrir Plex officiel$/));
  assert.equal(urls(s, STOP).length, 1);
});

test('transcodage : onerror pendant le chargement qui suit un saut lointain → erreur, Plex officiel, session arrêtée', async () => {
  const s = await playing('mkv-h264-dts', {}, { transcode: true, arg: { officialApp: () => ({ open: (d) => d(null) }) } });
  s.player.ready();
  s.player.events.onFarSeek(3600000);
  await flush();
  assert.equal(param({ url: s.player.url }, 'offset'), '3600');
  assert.ok(has(s.panel.el, /Chargement/));
  const before = urls(s, STOP).length;
  s.player.events.onError(new Error('AVPlay : erreur de lecture PLAYER_ERROR_CONNECTION_FAILED'));
  assert.ok(has(s.panel.el, /Lecture impossible/));
  assert.ok(has(s.panel.el, /^Ouvrir Plex officiel$/));
  assert.equal(urls(s, STOP).length, before + 1);
});

test('reprise : intention RESUME → départ à la position du serveur, pas à celle (en cache) de la fiche', async () => {
  const s = setup({ meta: withOffset(3082192) });
  const stale = { ...MOVIE, viewOffset: 100000 };
  const panel = ui.createPlayerPanel(s.arg, stale, ui.RESUME);
  await flush();
  assert.equal(s.player.openOpts.startMs, 3082192);
  panel.destroy();
});

test('reprise : RESUME sur un titre dont le serveur n’a plus de position → départ à zéro', async () => {
  const s = setup({ meta: withOffset(0) });
  const panel = ui.createPlayerPanel(s.arg, { ...MOVIE, viewOffset: 100000 }, ui.RESUME);
  await flush();
  assert.ok(!s.player.openOpts.startMs);
  panel.destroy();
});

test('rafale lancée pendant qu’un saut est en vol : le cumul part de la cible, pas de la position AVPlay', async () => {
  const s = await started();
  s.player.ready();
  s.player.pos = 600000;
  const J = jump(s.panel);
  // 1re rafale terminée : le seek (vers 620 s) est en vol, AVPlay est encore à 600 s.
  s.player.events.onSeekPending(610000, 10000);
  s.player.events.onSeekPending(620000, 10000);
  s.player.events.onSeekPending(null);
  // 2e rafale : tv-core part de la cible en vol (620 s) → 630 s au premier appui.
  s.player.events.onSeekPending(630000, 10000);
  assert.equal(byClass(J, 'plex-pl-jump-sum')[0].textContent, '+10 s');
  s.player.events.onSeekPending(650000, 20000);
  assert.equal(byClass(J, 'plex-pl-jump-sum')[0].textContent, '+30 s');
});

test('barre ouverte en pause : « Se termine à » recalculé chaque minute, arrêté à la reprise et à la fermeture', async () => {
  let now = new Date(2026, 0, 1, 20, 0, 0).getTime();
  const s = await started({ arg: { now: () => now } });
  s.player.ready();
  s.player.events.onTime(DUR / 4); // reste 1 h 17 min 03 → 21 h 17
  s.panel.onKey('enter'); // pause + barre
  assert.ok(has(s.panel.el, /^Se termine à 21 h 17$/));
  now += 60000;
  s.timers.advance(60000);
  assert.ok(has(s.panel.el, /^Se termine à 21 h 18$/), texts(s.panel.el).join('|'));
  now += 60000;
  s.timers.advance(60000);
  assert.ok(has(s.panel.el, /^Se termine à 21 h 19$/));
  s.panel.onKey('enter'); // reprise : plus de minuterie
  now += 120000;
  s.timers.advance(120000);
  assert.ok(!has(s.panel.el, /^Se termine à 21 h 21$/), 'reprise : plus de recalcul');
  s.panel.onKey('enter'); // pause à nouveau, puis fermeture
  s.panel.onKey('back');
  assert.ok(!barOn(s.panel));
  now += 60000;
  s.timers.advance(60000);
  assert.ok(!has(s.panel.el, /^Se termine à 21 h 22$/), 'barre fermée : minuterie arrêtée');
});

// ---- Miniature d'aperçu (index BIF) ----
function makeBif(stamps, { mult = 1000 } = {}) {
  const frames = stamps.map((_, i) => Buffer.from([0xff, 0xd8, i, 0xff, 0xd9]));
  const head = Buffer.alloc(64);
  Buffer.from([0x89, 0x42, 0x49, 0x46, 0x0d, 0x0a, 0x1a, 0x0a]).copy(head);
  head.writeUInt32LE(0, 8); head.writeUInt32LE(stamps.length, 12); head.writeUInt32LE(mult, 16);
  const table = Buffer.alloc((stamps.length + 1) * 8);
  let off = 64 + table.length;
  stamps.forEach((t, i) => { table.writeUInt32LE(t, i * 8); table.writeUInt32LE(off, i * 8 + 4); off += frames[i].length; });
  table.writeUInt32LE(0xffffffff, stamps.length * 8); table.writeUInt32LE(off, stamps.length * 8 + 4);
  const b = Buffer.concat([head, table, ...frames]);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.length);
}

test('BIF : parseur ES5 (DataView), image la plus proche, rejet des index invalides', () => {
  const b = ui.parseBif(makeBif([0, 10, 20, 30]));
  assert.equal(b.count, 4);
  const at = (ms) => new Uint8Array(ui.bifFrameBytes(b, ms))[2];
  assert.equal(at(0), 0); assert.equal(at(4000), 0); assert.equal(at(6000), 1); assert.equal(at(5000), 0);
  assert.equal(at(25000), 2); assert.equal(at(26000), 3); assert.equal(at(999999), 3);
  const sec = ui.parseBif(makeBif([0, 1, 2], { mult: 0 }));
  assert.equal(sec.mult, 1000, 'multiplicateur absent = 1000 ms');
  assert.equal(ui.parseBif(new ArrayBuffer(10)), null);
  const bad = new Uint8Array(makeBif([0, 10])); bad[0] = 0;
  assert.equal(ui.parseBif(bad.buffer), null);
  const trunc = makeBif([0, 10, 20]).slice(0, 70);
  assert.equal(ui.parseBif(trunc), null);
});

const withIndex = (flag) => () => {
  const j = JSON.parse(fx('metadata'));
  Object.assign(j.MediaContainer.Metadata[0].Media[0].Part[0], flag);
  return JSON.stringify(j);
};
function previewSetup(flag, binary) {
  const urls = { made: [], revoked: [] };
  const reqs = [];
  const handles = [];
  const httpBinary = (req, cb) => {
    reqs.push(req);
    const r = { aborted: false, abort() { r.aborted = true; } };
    handles.push(r);
    setImmediate(() => { if (!r.aborted) binary(cb, req); });
    return r;
  };
  const s = setup({ meta: withIndex(flag), arg: {
    httpBinary, blobUrl: { create: (buf) => { const u = 'blob:' + new Uint8Array(buf)[2]; urls.made.push(u); return u; }, revoke: (u) => urls.revoked.push(u) },
  } });
  return { s, urls, reqs, handles };
}
const okBif = (cb) => cb(null, { status: 200, body: makeBif([0, 10, 20, 30]) });
const previewOf = (panel) => byClass(panel.el, 'plex-pl-preview')[0];
async function onTrack(over) {
  const p = previewSetup(over.flag, over.binary || okBif);
  const panel = ui.createPlayerPanel(p.s.arg, MOVIE);
  await flush();
  p.s.player.ready();
  p.panel = panel;
  return p;
}

test('aperçu : rien n’est téléchargé tant que le focus n’est pas sur la barre ; chargé à l’entrée, URL du serveur avec jeton', async () => {
  const p = await onTrack({ flag: { indexes: 'sd' } });
  p.panel.onKey('up'); // barre ouverte, focus sur les boutons
  await flush();
  assert.equal(p.reqs.length, 0);
  p.panel.onKey('up'); // focus sur la barre
  await flush();
  assert.equal(p.reqs.length, 1);
  assert.equal(p.reqs[0].url, SERVER.uri + '/library/parts/11/indexes/sd');
  assert.equal(p.reqs[0].headers['X-Plex-Token'], SERVER.token);
});

test('aperçu : une seule image à la fois (la plus proche), URL révoquée au changement, rien sans cible', async () => {
  const p = await onTrack({ flag: { indexes: 'sd' } });
  p.panel.onKey('up'); p.panel.onKey('up');
  await flush();
  const E = p.s.player.events, pv = previewOf(p.panel);
  E.onSeekPending(4000, 4000);
  assert.deepEqual(p.urls.made, ['blob:0']);
  assert.ok(pv.classList.contains('on') && pv.style.backgroundImage.includes('blob:0'));
  E.onSeekPending(5000, 1000); // même image : rien de neuf
  assert.deepEqual(p.urls.made, ['blob:0']);
  E.onSeekPending(21000, 16000);
  assert.deepEqual(p.urls.made, ['blob:0', 'blob:2']);
  assert.deepEqual(p.urls.revoked, ['blob:0']);
  E.onSeekPending(null);
  assert.deepEqual(p.urls.revoked, ['blob:0', 'blob:2']);
  assert.ok(!pv.classList.contains('on'));
});

test('aperçu : l’index est libéré en quittant la barre, à la fermeture de la barre et en quittant le lecteur', async () => {
  const p = await onTrack({ flag: { indexes: 'sd' } });
  p.panel.onKey('up'); p.panel.onKey('up');
  await flush();
  p.s.player.events.onSeekPending(11000, 11000);
  assert.equal(p.urls.made.length, 1);
  p.panel.onKey('down'); // retour aux boutons
  assert.deepEqual(p.urls.revoked, ['blob:1'], 'image révoquée');
  assert.ok(!previewOf(p.panel).classList.contains('on'));
  // L'index était bien libéré : un nouvel accès à la barre le recharge.
  p.panel.onKey('up'); await flush();
  assert.equal(p.reqs.length, 2);
  p.s.player.events.onSeekPending(11000, 0);
  assert.equal(p.urls.made.length, 2);
  p.panel.onKey('back'); // annule la cible
  p.s.player.events.onSeekPending(null);
  p.panel.onKey('back'); // ferme la barre
  p.panel.onKey('up'); p.panel.onKey('up'); await flush();
  assert.equal(p.reqs.length, 3, 'rechargé après fermeture de la barre');
  p.s.player.events.onSeekPending(21000, 10000);
  const live = p.urls.made.length - p.urls.revoked.length;
  assert.equal(live, 1, 'une seule URL vivante');
  p.panel.destroy();
  assert.equal(p.urls.made.length, p.urls.revoked.length, 'plus aucune URL à la sortie du lecteur');
});

test('aperçu : quitter la barre pendant le téléchargement l’interrompt', async () => {
  const late = [];
  const p = previewSetup({ indexes: 'sd' }, (cb) => late.push(cb)); // réponse libérée à la main
  const panel = ui.createPlayerPanel(p.s.arg, MOVIE);
  await flush(); p.s.player.ready();
  panel.onKey('up'); panel.onKey('up');
  assert.equal(p.reqs.length, 1);
  assert.equal(p.handles[0].aborted, false);
  panel.onKey('down');
  assert.equal(p.handles[0].aborted, true, 'abort() appelé dès la sortie de la barre');
  // Réponse tardive d'un transport qui ignore l'abort : aucune image.
  await flush();
  late.forEach((cb) => cb(null, { status: 200, body: makeBif([0, 10, 20, 30]) }));
  p.s.player.events.onSeekPending(11000, 0);
  assert.equal(p.urls.made.length, 0, 'aucune image après abort');
  assert.ok(!previewOf(panel).classList.contains('on'));
  panel.destroy();
  assert.equal(p.reqs.length, 1);
});

test('aperçu : sans index (part non analysée) aucun téléchargement, seule l’heure visée s’affiche', async () => {
  const p = await onTrack({ flag: {} });
  p.panel.onKey('up'); p.panel.onKey('up');
  await flush();
  p.s.player.events.onSeekPending(61000, 1000);
  assert.equal(p.reqs.length, 0);
  assert.equal(p.urls.made.length, 0);
  assert.equal(byClass(p.panel.el, 'plex-pl-cursor-time')[0].textContent, '00:01:01');
  assert.ok(!previewOf(p.panel).classList.contains('on'));
});

test('aperçu : une part avec seulement hasThumbnail (pochette intégrée) ne télécharge rien, heure seule', async () => {
  const p = await onTrack({ flag: { hasThumbnail: '1' } });
  p.panel.onKey('up'); p.panel.onKey('up');
  await flush();
  p.s.player.events.onSeekPending(61000, 1000);
  assert.equal(p.reqs.length, 0);
  assert.equal(p.urls.made.length, 0);
  assert.equal(byClass(p.panel.el, 'plex-pl-cursor-time')[0].textContent, '00:01:01');
  assert.ok(!previewOf(p.panel).classList.contains('on'));
});

test('aperçu : index en erreur ou invalide → repli sur l’heure seule, sans nouvelle tentative pendant le même focus', async () => {
  for (const binary of [(cb) => cb(null, { status: 404, body: new ArrayBuffer(0) }), (cb) => cb(null, { status: 200, body: new ArrayBuffer(100) }), (cb) => cb(new Error('réseau'))]) {
    const p = await onTrack({ flag: { indexes: 'sd' }, binary });
    p.panel.onKey('up'); p.panel.onKey('up');
    await flush();
    p.s.player.events.onSeekPending(61000, 1000);
    p.s.player.events.onSeekPending(71000, 10000);
    assert.equal(p.urls.made.length, 0);
    assert.equal(p.reqs.length, 1);
    assert.equal(byClass(p.panel.el, 'plex-pl-cursor-time')[0].textContent, '00:01:11');
    p.panel.destroy();
  }
});
