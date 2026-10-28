import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';

let server, base;
before(async () => {
  const { startDevServer } = await import('../scripts/dev/server.mjs');
  server = await startDevServer({ port: 0 });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const get = async (p) => {
  const r = await fetch(base + p);
  return { status: r.status, type: r.headers.get('content-type') ?? '', text: await r.text() };
};

// Exécute le bundle de mocks dans un faux window et renvoie ce window.
const loadMocks = async () => {
  const code = (await get('/__mocks/mocks.js')).text;
  const els = [];
  const el = () => ({ style: {}, setAttribute() {}, appendChild(c) { els.push(c); } });
  const document = {
    createElement: el, body: el(), documentElement: el(),
    addEventListener() {}, readyState: 'complete',
  };
  const logs = [];
  const window = { document, console: { error: (...a) => logs.push(a.join(' ')), log() {}, warn() {} } };
  window.window = window;
  vm.runInNewContext(code, { ...window, window, console: window.console });
  return { window, logs, els };
};

test('la page d’aperçu est servie avec scène 1920×1080 et bascule 1280×720', async () => {
  const r = await get('/');
  assert.equal(r.status, 200);
  assert.match(r.text, /1920/);
  assert.match(r.text, /1280/);
  assert.match(r.text, /<iframe[^>]+src="\/app\/index\.html"/);
});

test('l’app est servie avec les mocks injectés avant tout script', async () => {
  const r = await get('/app/index.html');
  assert.equal(r.status, 200);
  const m = r.text.indexOf('/__mocks/mocks.js');
  const a = r.text.indexOf('app.js');
  assert.ok(m >= 0 && a > m, r.text);
  assert.equal((await get('/app/app.js')).status, 200);
  assert.equal((await get('/app/app.css')).status, 200);
});

test('tout appel tizen.* lève et signale l’absence de TV', async () => {
  const { window, logs, els } = await loadMocks();
  assert.throws(() => window.tizen.application.getCurrentApplication(), /pas de TV/i);
  assert.throws(() => window.tizen.tvinputdevice.registerKey('Back'), /pas de TV/i);
  assert.ok(logs.some((l) => /tizen\.application\.getCurrentApplication/.test(l)), logs.join('|'));
  assert.ok(els.length > 0, 'signal visible dans le DOM');
});

test('tout appel webapis.avplay lève et ne simule jamais un succès', async () => {
  const { window, logs } = await loadMocks();
  assert.throws(() => window.webapis.avplay.open('http://x/y.mkv'), /pas de TV/i);
  assert.throws(() => window.webapis.avplay.play(), /pas de TV/i);
  assert.ok(logs.some((l) => /webapis\.avplay\.open/.test(l)));
});

test('les mocks n’entrent pas dans le build .wgt', () => {
  const r = spawnSync('npm', ['run', 'build'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  for (const f of readdirSync('apps/tv/dist')) {
    assert.doesNotMatch(readFileSync(`apps/tv/dist/${f}`, 'utf8'), /CIMAISE_MOCK|appel sans effet dans l’aperçu/i, f);
  }
  assert.doesNotMatch(readFileSync('apps/tv/index.html', 'utf8'), /mock/i);
  assert.doesNotMatch(readFileSync('apps/tv/src/index.ts', 'utf8'), /mock/i);
});

// Fausse coquille : un document dont dispatchEvent déclenche les écouteurs capture de la fenêtre,
// puis ceux de l'app (comme un vrai iframe). Chaque keydown reçu par l'app est compté.
const remoteHarness = async () => {
  const { build } = await import('esbuild');
  const out = await build({ entryPoints: ['mocks/src/remote.ts'], bundle: true, write: false, format: 'iife', globalName: 'R', logLevel: 'silent' });
  const R = vm.runInNewContext(out.outputFiles[0].text + ';R');
  const received = [];
  const winL = [];
  const appL = [];
  let dispatches = 0;
  const doc = {
    createEvent: () => ({ initEvent() {} }),
    dispatchEvent(ev) {
      if (++dispatches > 50) throw new Error('boucle de ré-émission');
      ev.preventDefault = ev.preventDefault ?? (() => {});
      ev.stopImmediatePropagation = () => { ev.stopped = true; };
      for (const l of winL) { l(ev); if (ev.stopped) return; }
      for (const l of appL) l(ev);
      received.push(ev.keyCode);
    },
  };
  let onLoad;
  const frame = {
    contentDocument: doc,
    contentWindow: { addEventListener: (_t, l) => winL.push(l), focus() {} },
    addEventListener: (_t, l) => { onLoad = l; },
  };
  const top = { l: null, addEventListener(_t, l) { this.l = l; } };
  const hud = [];
  R.attach(top, frame, { hud: (n) => hud.push(n), reload() {}, toggleSize() {} });
  onLoad();
  const ev = (key, keyCode) => ({ key, keyCode, preventDefault() {}, stopImmediatePropagation() { this.stopped = true; } });
  return { received, hud, doc, winL, top, ev };
};

test('une touche pressée dans la coquille = exactement un keydown reçu par l’app', async () => {
  const h = await remoteHarness();
  h.top.l(h.ev('ArrowDown', 40));
  h.top.l(h.ev('Enter', 13));
  h.top.l(h.ev('Escape', 27));
  assert.deepEqual(h.received, [40, 13, 10009]);
});

test('Échap pressée dans l’iframe = un seul keydown, keyCode 10009 ; les autres touches natives passent telles quelles', async () => {
  const h = await remoteHarness();
  const appSees = [];
  h.winL; // l'écouteur capture de la fenêtre de l'iframe est h.winL[0]
  const native = (key, keyCode) => {
    const e = h.ev(key, keyCode);
    h.winL[0](e);
    if (!e.stopped) appSees.push(e.keyCode); // l'événement natif atteint l'app sauf s'il est remplacé
  };
  native('Escape', 27);
  native('ArrowLeft', 37);
  assert.deepEqual(h.received, [10009]); // synthétique pour Échap uniquement
  assert.deepEqual(appSees, [37]);       // Échap native (27) supprimée, flèche native conservée
});

test('aperçu : le bundle servi avec les mocks remplit #clock et #marks et pose l’écouteur Entrée', async () => {
  const mocks = (await get('/__mocks/mocks.js')).text;
  const app = (await get('/app/app.js')).text;
  const made = [];
  const el = () => ({ style: {}, textContent: '', setAttribute() {}, appendChild(c) { made.push(c); }, parentNode: null });
  const clock = el(), marks = el(), listeners = {};
  const document = {
    createElement: el, body: el(), documentElement: el(), readyState: 'complete',
    getElementById: (id) => ({ clock, marks }[id]),
    addEventListener: (t, f) => { listeners[t] = f; },
  };
  const logs = [];
  const window = { document, console: { error: (...a) => logs.push(a.join(' ')), log() {}, warn() {} } };
  window.window = window;
  const ctx = vm.createContext({ ...window, window, setTimeout() {}, Date, console: window.console });
  vm.runInContext(mocks, ctx);
  vm.runInContext(app, ctx);
  assert.match(clock.textContent, /^\d\d:\d\d$/);
  assert.match(marks.textContent, /scriptLoaded/);
  assert.match(marks.textContent, /interactive/);
  assert.equal(typeof listeners.keydown, 'function');
  assert.ok(logs.some((l) => /registerKey/.test(l)), 'le mock doit rester bruyant : ' + logs.join('|'));
});
