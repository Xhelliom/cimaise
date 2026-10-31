// Réglages > Apps intégrées > Overseerr : adresse et clé au clavier à l'écran (disposition technique), bouton Tester,
// clé jamais affichée hors saisie, interrupteur relu au retour (la saisie peut rendre le module « configuré »).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';

let S;
before(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ov-set-'));
  const es5 = join(dir, 'es5');
  const t = spawnSync('node_modules/.bin/tsc', ['-p', 'packages/launcher/tsconfig.json', '--outDir', es5], { encoding: 'utf8' });
  assert.equal(t.status, 0, t.stdout + t.stderr);
  const out = join(dir, 'settings.cjs');
  await build({ entryPoints: [join(es5, 'launcher/src/settings/index.js')], bundle: true, format: 'cjs', target: 'es5', outfile: out, logLevel: 'warning' });
  S = createRequire(import.meta.url)(out);
  const out2 = join(dir, 'ov.cjs');
  await build({ entryPoints: [join(es5, 'launcher/src/settings/overseerr.js')], bundle: true, format: 'cjs', target: 'es5', outfile: out2, logLevel: 'warning' });
  S.normalizeOverseerrUrl = createRequire(import.meta.url)(out2).normalizeOverseerrUrl;
});

function fakeDoc() {
  const mk = (tag) => {
    const el = {
      tag, children: [], parent: null, className: '', textContent: '', attrs: {}, style: {}, value: '',
      appendChild(c) { c.parent = el; el.children.push(c); return c; },
      removeChild(c) { el.children.splice(el.children.indexOf(c), 1); c.parent = null; return c; },
      setAttribute(k, v) { el.attrs[k] = v; }, addEventListener() {}, focus() {}, blur() {},
    };
    Object.defineProperty(el, 'firstChild', { get: () => el.children[0] || null });
    Object.defineProperty(el, 'parentNode', { get: () => el.parent });
    return el;
  };
  return { createElement: mk, head: mk('head') };
}
const texts = (el) => [el.textContent, ...el.children.flatMap(texts)].filter(Boolean);

function open(ov = {}) {
  const doc = fakeDoc(), log = { cfg: [], tests: 0, enabled: false };
  const panel = S.createSettings({
    doc, catalog: [], listInstalledApps: (ok) => ok([]), onChange() {}, onClose() { log.closed = true; },
    modules: [{ id: 'plex', name: 'Plex intégré', enabled: true, hasSettings: true }, { id: 'overseerr', name: 'Overseerr', enabled: false, hasSettings: true }],
    onModule() {}, onModuleSettings() {},
    moduleEnabled: (id) => (id === 'overseerr' ? log.enabled : true),
    ov: {
      url: 'https://overseerr.wetter.land', key: '',
      onConfig: (u, k) => { log.cfg.push([u, k]); log.enabled = !!(u && k); },
      test: (u, k, cb) => { log.tests++; (log.impl || ((c) => c(null, 'Overseerr 1.33.2 joignable, clé acceptée (771 médias).')))(cb); },
      ...ov,
    },
  });
  const press = (...ks) => ks.forEach((k) => assert.equal(panel.onKey(k), true, k));
  const enter = () => press('up', 'up', 'up', 'enter', 'down', 'right', 'enter');   // Apps intégrées > Overseerr > Réglages
  const t = () => texts(panel.el);
  // Saisie au clavier technique : tout effacer, puis chaque caractère atteint au D-pad depuis le coin haut gauche.
  const GRID = ['abcdefghij', 'klmnopqrst', 'uvwxyz.-/:', '0123456789'];
  const home = () => { for (let i = 0; i < 6; i++) panel.onKey('up'); for (let i = 0; i < 12; i++) panel.onKey('left'); };
  const bottom = (n) => { home(); for (let i = 0; i < 4; i++) panel.onKey('down'); for (let i = 0; i < n; i++) panel.onKey('right'); panel.onKey('enter'); };
  const type = (s) => {
    bottom(4);                                   // tout effacer
    let upper = false;
    for (const ch of s) {
      const lo = ch.toLowerCase(), isUp = ch !== lo;
      if (/[a-z]/.test(lo) && isUp !== upper) { bottom(0); upper = isUp; }   // maj
      if (ch === '=') { bottom(1); continue; }
      const r = GRID.findIndex((g) => g.includes(lo));
      home();
      for (let i = 0; i < r; i++) panel.onKey('down');
      for (let i = 0; i < GRID[r].indexOf(lo); i++) panel.onKey('right');
      panel.onKey('enter');
    }
    bottom(6);                                   // valider
  };
  return { panel, log, press, enter, t, type };
}

test('Apps intégrées : Overseerr masqué au départ ; sa section montre l\'adresse par défaut et la clé non définie', () => {
  const { t, enter, press, log } = open();
  press('up', 'up', 'up', 'enter');
  assert.ok(t().includes('Overseerr') && t().includes('Masqué'));
  press('down', 'right', 'enter');
  assert.ok(t().includes('Adresse') && t().includes('https://overseerr.wetter.land'));
  assert.ok(t().includes('Clé API') && t().includes('Non définie'));
  assert.ok(t().includes('Tester la connexion'));
  press('back', 'back', 'back');
  assert.ok(log.closed);
  void enter;
});

test('clé saisie au clavier à l\'écran (capitales, chiffres, =) : enregistrée avec l\'adresse, jamais affichée ensuite ; le module passe Activé', () => {
  const { t, enter, press, type, log } = open();
  enter();
  press('down', 'enter');                        // Clé API : le clavier s'ouvre
  assert.ok(t().includes('maj'));
  type('MTc2Ab9=');
  assert.deepEqual(log.cfg.at(-1), ['https://overseerr.wetter.land', 'MTc2Ab9=']);
  assert.ok(!t().some((x) => x.includes('MTc2Ab9')), 'la clé n’est pas affichée');
  assert.ok(t().includes('••••••••'));
  press('back');                                 // retour à Apps intégrées : l'interrupteur suit l'état enregistré
  assert.ok(t().includes('Activé'));
});

test('adresse saisie : normalisée (https:// ajouté, / final retiré) ; Retour dans le clavier annule sans enregistrer', () => {
  const { t, enter, press, type, log } = open();
  enter();
  press('enter');
  type('ov.lan/');
  assert.deepEqual(log.cfg.at(-1), ['https://ov.lan', '']);
  assert.ok(t().includes('https://ov.lan'));
  press('enter');                                // rouvre le clavier sur l'adresse
  press('back');                                 // annule
  assert.equal(log.cfg.length, 1);
  assert.ok(!log.closed);
  assert.equal(S.normalizeOverseerrUrl(' http://a.b:5055// '), 'http://a.b:5055');
  assert.equal(S.normalizeOverseerrUrl(''), '');
});

test('clé fournie par le paquet : « Fournie par le paquet » affiché, jamais la clé ; Tester est permis sans saisie', () => {
  const { t, enter, press, log } = open({ packaged: true });
  enter();
  assert.ok(t().includes('Fournie par le paquet'));
  assert.ok(!t().includes('Non définie') && !t().includes('••••••••'));
  press('down', 'down', 'enter');
  assert.equal(log.tests, 1);
});

test('Tester : sans clé, rien n\'est appelé ; avec clé, le résultat s\'affiche ; une erreur s\'affiche aussi', () => {
  const a = open();
  a.enter();
  a.press('down', 'down', 'enter');
  assert.equal(a.log.tests, 0);
  assert.ok(a.t().some((x) => /Renseigne/.test(x)));
  const b = open({ key: 'k' });
  b.enter();
  b.press('down', 'down', 'enter');
  assert.equal(b.log.tests, 1);
  assert.ok(b.t().some((x) => /1\.33\.2 joignable, clé acceptée/.test(x)));
  b.log.impl = (cb) => cb(new Error('clé API refusée'));
  b.press('enter');
  assert.ok(b.t().some((x) => x === 'Échec : clé API refusée'));
});
