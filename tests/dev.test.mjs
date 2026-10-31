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
  window.setTimeout = (f, ms) => timers.push({ f, ms }); // l'accueil passe par window.setTimeout
  window.clearTimeout = () => {};
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
  for (const f of readdirSync('apps/tv/dist', { recursive: true }).filter((f) => /\.(js|css|html|xml)$/.test(f))) {
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

test('aperçu : le bundle servi avec les mocks affiche l’accueil et pose l’écouteur ; les mocks restent bruyants', async () => {
  const mocks = (await get('/__mocks/mocks.js')).text;
  const app = (await get('/app/app.js')).text;
  const el = () => {
    const e = { style: {}, textContent: '', className: '', children: [], parentNode: null, setAttribute() {} };
    e.appendChild = (c) => { e.children.push(c); c.parentNode = e; return c; };
    e.removeChild = (c) => { e.children.splice(e.children.indexOf(c), 1); return c; };
    return e;
  };
  const root = el(), listeners = {}, timers = [];
  const document = {
    createElement: el, body: el(), documentElement: el(), readyState: 'complete',
    getElementById: (id) => (id === 'root' ? root : null),
    addEventListener: (t, f) => { listeners[t] = f; },
  };
  const logs = [];
  const window = { document, console: { error: (...a) => logs.push(a.join(' ')), log() {}, warn() {} } };
  window.window = window;
  window.setTimeout = (f, ms) => timers.push({ f, ms }); // l'accueil passe par window.setTimeout
  window.clearTimeout = () => {};
  const ctx = vm.createContext({ ...window, window, setTimeout: (f, ms) => timers.push({ f, ms }), clearTimeout() {}, Date, console: window.console });
  vm.runInContext(mocks, ctx);
  vm.runInContext(app, ctx);
  assert.equal(root.children.length, 1, 'accueil affiché');
  const horloge = (n) => (n.className === 'horloge' ? n : n.children.map(horloge).find(Boolean));
  assert.match(horloge(root.children[0]).textContent, /^\d\d:\d\d$/);
  assert.equal(typeof listeners.keydown, 'function');
  timers.filter((t) => t.ms === 0).forEach((t) => t.f()); // chargement différé
  assert.ok(logs.some((l) => /registerKey/.test(l)), 'le mock doit rester bruyant : ' + logs.join('|'));
});

test('aperçu : sert les logos d’apps sous /app/logos/, rien d’autre que des PNG de la bibliothèque', async () => {
  const r = await fetch(base + '/app/logos/netflix.png');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type') ?? '', /image\/png/);
  assert.equal((await fetch(base + '/app/logos/../index.ts')).status, 404);
  assert.equal((await fetch(base + '/app/logos/inconnu.png')).status, 404);
});

// Home Assistant refuse le cross-origin : l'aperçu passe par le relais /__ha/, qui ajoute le jeton côté serveur.
test('aperçu : relais Home Assistant — jeton ajouté côté serveur, jamais renvoyé au navigateur', async () => {
  const { createServer } = await import('node:http');
  const { mkdtempSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const TOKEN = 'SECRET-TOKEN-0123456789';
  const seen = [];
  const ha = createServer((req, res) => {
    let b = ''; req.on('data', (c) => (b += c));
    req.on('end', () => {
      seen.push({ m: req.method, u: req.url, auth: req.headers.authorization, b });
      // un HA bavard qui renverrait le jeton dans le corps
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify([{ entity_id: 'scene.film', state: 'x', echo: req.headers.authorization }]));
    });
  });
  await new Promise((ok) => ha.listen(0, '127.0.0.1', ok));
  const dir = mkdtempSync(`${tmpdir()}/ha-`);
  writeFileSync(`${dir}/ha.env`, `HA_URL=http://127.0.0.1:${ha.address().port}/\nHA_TOKEN=${TOKEN}\n`);
  process.env.HA_ENV_FILE = `${dir}/ha.env`;
  try {
    const sess = await get('/__mocks/ha-session.js');
    assert.doesNotMatch(sess.text, new RegExp(TOKEN));
    assert.match(sess.text, /haUrl=location\.origin\+'\/__ha'/);
    const g = await fetch(`${base}/__ha/api/states`, { headers: { authorization: 'Bearer faux' } });
    const body = await g.text();
    assert.equal(g.status, 200);
    assert.doesNotMatch(body, new RegExp(TOKEN));
    for (const [k, v] of g.headers) assert.doesNotMatch(`${k}: ${v}`, new RegExp(TOKEN));
    const p = await fetch(`${base}/__ha/api/services/scene/turn_on`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"entity_id":"scene.film"}' });
    assert.doesNotMatch(await p.text(), new RegExp(TOKEN));
    assert.deepEqual(seen.map((x) => [x.m, x.u, x.auth]), [['GET', '/api/states', `Bearer ${TOKEN}`], ['POST', '/api/services/scene/turn_on', `Bearer ${TOKEN}`]]);
    assert.equal(seen[1].b, '{"entity_id":"scene.film"}');
    assert.equal((await fetch(`${base}/__ha/auth/token`)).status, 404);
    process.env.HA_ENV_FILE = `${dir}/absent.env`;
    assert.equal((await fetch(`${base}/__ha/api/states`)).status, 503);
  } finally {
    delete process.env.HA_ENV_FILE;
    ha.close();
  }
});
