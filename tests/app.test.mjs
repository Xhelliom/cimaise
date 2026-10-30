// App cimaise (apps/tv) exécutée dans un DOM factice : premier affichage minimal, chargement différé,
// retour à la racine. Le bundle et les chunks sont construits en mémoire (pas de dist/ : pas de course avec les autres tests).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';

const code = {};
before(async () => {
  const es5 = join(mkdtempSync(join(tmpdir(), 'app-')), 'es5');
  const t = spawnSync('node_modules/.bin/tsc', ['-p', 'apps/tv/tsconfig.json', '--outDir', es5], { encoding: 'utf8' });
  assert.equal(t.status, 0, t.stdout + t.stderr);
  for (const [name, p] of [['app', 'index'], ['plex', 'chunks/plex'], ['settings', 'chunks/settings']]) {
    const r = await build({ entryPoints: [join(es5, `apps/tv/src/${p}.js`)], bundle: true, write: false, format: 'iife', target: 'es5', logLevel: 'silent' });
    code[name] = r.outputFiles[0].text;
  }
});

function el(tag) {
  const e = { tag, children: [], parentNode: null, style: {}, className: '', textContent: '', offsetWidth: 0 };
  e.appendChild = (c) => { if (c.parentNode) c.parentNode.removeChild(c); c.parentNode = e; e.children.push(c); if (e.onAppend) e.onAppend(c); return c; };
  e.removeChild = (c) => { e.children.splice(e.children.indexOf(c), 1); c.parentNode = null; return c; };
  e.removeAttribute = () => {};
  e.setAttribute = () => {};
  Object.defineProperty(e, 'firstChild', { get: () => e.children[0] || null });
  e.getElementsByTagName = () => [];
  return e;
}
const find = (n, cls, out = []) => { if ((n.className || '').split(' ').includes(cls)) out.push(n); n.children.forEach((c) => find(c, cls, out)); return out; };

function boot({ failChunk, stored, launched } = {}) {
  const body = el('body'), head = el('head'), root = el('div');
  const loaded = [];
  head.onAppend = (s) => {
    if (s.tag !== 'script') return;
    loaded.push(s.src);
    Promise.resolve().then(() => {
      if (failChunk === s.src) { s.onerror(); return; }
      vm.runInContext(code[s.src.replace('.js', '')], ctx);
      s.onload();
    });
  };
  const listeners = [];
  const timers = [];
  const exits = [];
  const store = {};
  let reads = 0, xhrSent = 0;
  if (stored) store['cimaise.v1'] = JSON.stringify(stored);
  const document = {
    body, head, createElement: el,
    getElementById: (id) => (id === 'root' ? root : null),
    addEventListener: (t, f) => t === 'keydown' && listeners.push(f),
  };
  const ctx = vm.createContext({
    document, Date, console, Promise, Error,
    XMLHttpRequest: function () { this.open = () => {}; this.setRequestHeader = () => {}; this.send = () => { xhrSent++; }; this.abort = () => {}; }, // ne répond jamais
    setTimeout: (f, ms) => { timers.push({ f, ms }); return timers.length; },
    clearTimeout: () => {},
    localStorage: { getItem: (k) => { reads++; return k in store ? store[k] : null; }, setItem: (k, v) => { store[k] = v; } },
    tizen: { tvinputdevice: { registerKey() {} }, application: { launch: (id) => launched && launched.push(id), getCurrentApplication: () => ({ exit: () => exits.push(1) }) } },
  });
  ctx.window = ctx;
  vm.runInContext(code.app, ctx);
  const key = (keyCode) => listeners.forEach((f) => f({ keyCode }));
  const keyOn = (keyCode, target) => listeners.forEach((f) => f({ keyCode, target }));
  const tick = () => new Promise((r) => setImmediate(r));
  const flush = () => { const t = timers.splice(0).filter((x) => x.ms === 0); t.forEach((x) => x.f()); }; // minuteries différées (0 ms)
  return { root, body, loaded, key, keyOn, tick, flush, exits, store, reads: () => reads, xhr: () => xhrSent };
}
const LEFT = 37, UP = 38, RIGHT = 39, DOWN = 40, OK = 13, BACK = 10009;

test('premier affichage minimal : horloge et tuiles du catalogue, police décorative pas encore demandée', () => {
  const a = boot();
  assert.equal(find(a.root, 'horloge').length, 1);
  assert.match(find(a.root, 'horloge')[0].textContent, /^\d\d:\d\d$/);
  assert.equal(find(a.root, 'tuile').length, 7, 'catalogue par défaut');
  assert.notEqual(a.body.className, 'late');
  assert.deepEqual(a.loaded, [], 'aucun chunk au démarrage');
});

test('chargement différé : après le premier affichage, police et touches média', () => {
  const a = boot();
  a.flush();
  assert.equal(find(a.root, 'titre')[0].textContent, 'Plex intégré');
  assert.equal(find(a.root, 'pastille').length, 2);
  assert.equal(a.body.className, 'late');
  assert.deepEqual(a.loaded, [], 'Plex et réglages restent à la demande');
});

test('le focus suit les flèches et le titre suit le focus', () => {
  const a = boot();
  a.flush();
  a.key(RIGHT); a.key(RIGHT);
  assert.equal(find(a.root, 'titre')[0].textContent, 'Netflix');
  // Netflix a un logo de bibliothèque : la tuile n'a plus de monogramme, on la repère par son rang.
  assert.deepEqual(find(a.root, 'tuile').map((n, i) => (n.className === 'tuile focus' ? i : -1)).filter((i) => i >= 0), [2]);
  a.key(DOWN);
  assert.equal(find(a.root, 'titre')[0].textContent, 'Smart Hub'); // dernière rangée incomplète
});

test('Plex intégré : entrée interne ouverte par le routeur, chunk chargé à la première ouverture seulement', async () => {
  const a = boot();
  a.flush();
  a.key(OK);
  assert.deepEqual(a.loaded, ['plex.js']);
  await a.tick();
  assert.equal(find(a.root, 'plex-panel').length, 1);
  assert.equal(find(a.root, 'home').length, 0, 'seul le panneau du dessus est dans le DOM');
  a.key(BACK);
  assert.equal(find(a.root, 'plex-panel').length, 0);
  assert.equal(find(a.root, 'home').length, 1);
  a.key(OK); await a.tick();
  assert.deepEqual(a.loaded, ['plex.js'], 'chunk déjà enregistré : pas de second script');
  assert.equal(find(a.root, 'plex-panel').length, 1);
});

test('Entrée sur une tuile avec ID lance l’app via l’adaptateur TV (tizen.application.launch)', () => {
  const launched = [];
  const a = boot({ launched, stored: { version: 1, prefs: { catalog: { version: 1, entries: [
    { id: 'plex', name: 'Plex intégré', color: '#e5a00d', type: 'interne' },
    { id: 'org.test.netflix', name: 'Netflix', color: '#e50914', type: 'tv' },
  ] } } } });
  a.key(RIGHT); a.key(OK);
  assert.deepEqual(launched, ['org.test.netflix']);
  assert.deepEqual(a.loaded, [], 'une app TV ne charge aucun chunk');
});

const texts = (n) => [n.textContent, ...n.children.flatMap(texts)];

test('Réglages : pastille atteinte par Haut, vrai écran dans le chunk settings chargé à l’ouverture', async () => {
  const a = boot();
  a.flush();
  a.key(UP);
  assert.equal(find(a.root, 'pastille')[0].className, 'pastille focus');
  assert.equal(find(a.root, 'tuile').filter((n) => n.className === 'tuile focus').length, 0);
  a.key(OK);
  assert.deepEqual(a.loaded, ['settings.js']);
  await a.tick();
  const panel = find(a.root, 'reglages')[0];
  assert.ok(panel);
  assert.ok(texts(panel).includes('Découvrir les apps installées'));
  assert.ok(texts(panel).includes('Netflix'));
});

async function openSettings(a) {
  a.flush(); a.key(UP); a.key(OK); await a.tick();
}

test('Réglages → accueil : une couleur changée est persistée (la tuile d’une app connue garde sa couleur de marque)', async () => {
  const a = boot();
  await openSettings(a);
  a.key(DOWN); a.key(OK); // 1re app, puce « Couleur » : teinte suivante de la palette
  a.key(BACK);
  assert.equal(find(a.root, 'reglages').length, 0);
  assert.equal(find(a.root, 'tuile')[0].style.background, '#e5a00d', 'Plex intégré : jaune Plex de la bibliothèque, la couleur teinte le fond d’écran');
  const saved = JSON.parse(a.store['cimaise.v1']).prefs.catalog.entries;
  assert.equal(saved[0].color, '#e50914');
  assert.equal(saved[0].type, 'interne', 'le type interne survit à l’aller-retour des réglages');
});

test('Réglages → accueil : retirer et réordonner changent les tuiles et le catalogue persisté', async () => {
  const a = boot();
  await openSettings(a);
  a.key(DOWN); a.key(DOWN); // Plex officiel
  a.key(RIGHT); a.key(RIGHT); a.key(OK); // puce « Retirer »
  a.key(BACK);
  assert.equal(find(a.root, 'tuile').length, 6);
  assert.equal(JSON.parse(a.store['cimaise.v1']).prefs.catalog.entries.length, 6);
  a.key(UP); a.key(OK); await a.tick(); // retour aux réglages
  a.key(DOWN); a.key(DOWN); a.key(RIGHT); a.key(OK); a.key(UP); a.key(OK); a.key(BACK); // « Déplacer » Netflix vers le haut
  const saved = JSON.parse(a.store['cimaise.v1']).prefs.catalog.entries.map((e) => e.name);
  assert.deepEqual(saved.slice(0, 3), ['Netflix', 'Plex intégré', 'YouTube']);
});

test('Réglages : la découverte hors TV signale l’erreur sans rien changer', async () => {
  const a = boot();
  await openSettings(a);
  a.key(OK); // « Découvrir » : le faux tizen n’a pas getAppsInfo
  assert.ok(texts(find(a.root, 'reglages')[0]).some((t) => /Inventaire|getAppsInfo|impossible|absent/i.test(t)));
  assert.equal(a.store['cimaise.v1'], undefined);
});

test('un chunk qui ne charge pas laisse l’accueil en place', async () => {
  const a = boot({ failChunk: 'plex.js' });
  a.flush();
  a.key(OK);
  await a.tick();
  assert.equal(find(a.root, 'home').length, 1);
  assert.equal(find(a.root, 'plex-panel').length, 0);
});

test('Retour à la racine demande confirmation avant de quitter', () => {
  const a = boot();
  a.flush();
  a.key(BACK);
  assert.equal(a.exits.length, 0, 'pas de sortie sans confirmation');
  assert.equal(find(a.root, 'exit-confirm').length, 1);
  a.key(OK); // focus sur « Rester »
  assert.equal(a.exits.length, 0);
  assert.equal(find(a.root, 'exit-confirm').length, 0);
  assert.equal(find(a.root, 'home').length, 1);
  a.key(BACK); a.key(RIGHT); a.key(OK); // « Quitter »
  assert.equal(a.exits.length, 1);
});

test('tuile sans ID : message, pas de diagnostic ; le diagnostic reste accessible par la touche 0', () => {
  const a = boot();
  a.flush();
  a.key(RIGHT); a.key(OK);
  assert.equal(a.body.children.find((c) => c.tag === 'pre'), undefined);
  assert.match(JSON.stringify(find(a.root, 'message').map((m) => m.textContent)), /ID inconnu, va dans Réglages/);
  a.key(48);
  const pre = a.body.children.find((c) => c.tag === 'pre');
  assert.ok(pre);
  assert.match(pre.textContent, /scriptLoaded[\s\S]*firstPaint[\s\S]*interactive/);
});

test('l’app ne dépend d’aucun mock, ni des anciens fichiers provisoires', () => {
  assert.doesNotMatch(readFileSync('apps/tv/src/index.ts', 'utf8'), /mock/i);
  for (const f of ['home.ts', 'tiles.ts', 'settings.ts', 'tint.ts']) assert.ok(!existsSync('packages/launcher/src/' + f), f);
});

test('Réglages → accueil : la ligne Affichage bascule en une rangée, persistée dans cimaise.v1 et appliquée à l’accueil', async () => {
  const a = boot();
  await openSettings(a);
  assert.ok(texts(find(a.root, 'reglages')[0]).includes('Grille'));
  a.key(UP); a.key(UP); a.key(OK); // ligne « Affichage de l’accueil »
  assert.ok(texts(find(a.root, 'reglages')[0]).includes('Une rangée'));
  assert.equal(JSON.parse(a.store['cimaise.v1']).prefs.homeMode, 'rangee');
  a.key(BACK);
  assert.equal(find(a.root, 'home')[0].className.split(' ')[1], 'rangee');
  a.key(UP); a.key(UP); a.key(OK); await a.tick(); // les Réglages reprennent le mode courant
  assert.ok(texts(find(a.root, 'reglages')[0]).includes('Une rangée'));
  a.key(UP); a.key(UP); a.key(OK); a.key(BACK);
  assert.equal(JSON.parse(a.store['cimaise.v1']).prefs.homeMode, 'grille');
  assert.equal(find(a.root, 'home')[0].className.split(' ')[1], 'grille');
});

test('Réglages → accueil : « Tuiles à l’écran » appliqué tout de suite, persisté dans cimaise.v1, repris à la réouverture', async () => {
  const a = boot();
  await openSettings(a);
  a.key(UP); // ligne « Tuiles à l’écran »
  a.key(RIGHT); a.key(RIGHT);
  assert.ok(texts(find(a.root, 'reglages')[0]).includes('6'));
  assert.equal(JSON.parse(a.store['cimaise.v1']).prefs.homeTiles, 6);
  a.key(BACK);
  assert.ok(find(a.root, 'home')[0].className.split(' ').includes('n6'));
  a.key(UP); a.key(OK); await a.tick();
  assert.ok(texts(find(a.root, 'reglages')[0]).includes('6'), 'les Réglages reprennent la valeur courante');
  a.key(UP); a.key(LEFT); a.key(LEFT); a.key(BACK);
  assert.equal(JSON.parse(a.store['cimaise.v1']).prefs.homeTiles, 4);
  assert.ok(!find(a.root, 'home')[0].className.split(' ').some((c) => /^n\d$/.test(c)));
});

// --- premier affichage (HANDOFF §6 bis) : marques intermédiaires, rendu minimal, le reste différé ---
const imgs = (n, out = []) => { if (n.tag === 'img') out.push(n); n.children.forEach((c) => imgs(c, out)); return out; };

test('premier affichage : le stockage n’est lu qu’une fois, aucun logo ni teinte avant la 1re peinture', () => {
  const a = boot();
  assert.equal(a.reads(), 1, 'une seule lecture de localStorage au démarrage');
  assert.equal(imgs(a.root).length, 0, 'logos différés');
  for (const f of find(a.root, 'fond')) assert.equal(f.style.background, undefined, 'teinte différée');
  assert.ok(find(a.root, 'tuile').every((t) => t.textContent), 'chaque tuile porte son nom');
});

test('premier affichage : marques intermédiaires dans le diagnostic, dans l’ordre', () => {
  const a = boot();
  a.key(48);
  const txt = a.body.children.find((c) => c.tag === 'pre').textContent;
  assert.match(txt, /storageRead: \+\d+ ms\ncatalogLoaded: \+\d+ ms\nhomeBuilt: \+\d+ ms\nfirstPaint: \+\d+ ms\ninteractive: \+\d+ ms/);
  assert.doesNotMatch(txt, /enriched/, 'rien de différé avant la peinture');
});

test('après la peinture : marques painted puis enriched, teinte posée', () => {
  const a = boot();
  a.flush();
  assert.equal(a.body.className, 'late');
  assert.ok(find(a.root, 'fond').some((f) => f.style.background), 'teinte posée');
  a.key(48);
  assert.match(a.body.children.find((c) => c.tag === 'pre').textContent, /interactive: [^\n]*\npainted: [^\n]*\nenriched: /);
});

test('0 ou 1 tapé dans un champ de saisie : ni diagnostic ni sonde', () => {
  const a = boot();
  a.flush();
  const pressIn = (keyCode) => a.keyOn(keyCode, { tagName: 'INPUT' });
  pressIn(48); pressIn(96);
  assert.equal(a.body.children.find((c) => c.tag === 'pre'), undefined, 'diagnostic fermé');
  a.key(48); // hors champ : le diagnostic s'ouvre toujours
  assert.ok(a.body.children.find((c) => c.tag === 'pre'));
  pressIn(49); pressIn(97);
  assert.equal(find(a.root, 'plex-panel').length, 0);
  assert.ok(a.body.children.find((c) => c.tag === 'pre'), 'diagnostic toujours ouvert, sonde non lancée');
});

// --- Apps intégrées : modules masqués ou activés depuis les Réglages ---
const HA = { haUrl: 'http://ha.local:8123', haToken: 'tok', haScenes: ['scene.film'] };

test('Plex masqué : ni tuile ni ouverture, le chunk plex.js n’est jamais chargé', async () => {
  const a = boot({ stored: { version: 4, prefs: { modules: { plex: false } } } });
  a.flush();
  assert.equal(find(a.root, 'tuile').length, 6, 'catalogue par défaut sans Plex intégré');
  assert.ok(!find(a.root, 'titre').some((n) => n.textContent === 'Plex intégré'));
  a.key(OK); a.key(RIGHT); a.key(OK); await a.tick();
  assert.deepEqual(a.loaded, [], 'aucun chunk Plex, ni au démarrage ni à l’usage de l’accueil');
});

test('Scènes masquées : aucune requête vers Home Assistant ; activées (ou par défaut si configuré) : la requête part', () => {
  const hidden = boot({ stored: { version: 4, prefs: { ...HA, modules: { scenes: false } } } });
  hidden.flush();
  assert.equal(hidden.xhr(), 0, 'module masqué : Home Assistant n’est jamais interrogé');
  const dflt = boot({ stored: { version: 4, prefs: { ...HA } } });
  dflt.flush();
  assert.ok(dflt.xhr() >= 1, 'configuré et non masqué : activé par défaut');
  const unconfigured = boot();
  unconfigured.flush();
  assert.equal(unconfigured.xhr(), 0, 'Home Assistant non configuré : rien à interroger');
});

test('Réglages > Apps intégrées : masquer Plex retire la tuile sans charger plex.js ; réactiver la rend', async () => {
  const a = boot();
  await openSettings(a);
  a.key(UP); a.key(UP); a.key(UP); a.key(OK);          // Apps intégrées
  assert.ok(texts(find(a.root, 'reglages')[0]).includes('Activé'));
  a.key(OK);                                            // Plex intégré : Masqué
  a.key(BACK); a.key(BACK);
  assert.equal(find(a.root, 'reglages').length, 0);
  assert.equal(find(a.root, 'tuile').length, 6);
  const saved = JSON.parse(a.store['cimaise.v1']);
  assert.equal(saved.version, 4);
  assert.equal(saved.prefs.modules.plex, false);
  assert.ok(saved.prefs.catalog.entries.some((e) => e.id === 'plex'), 'l’entrée reste au catalogue : couleur et rang conservés');
  a.key(UP); a.key(OK); await a.tick();                 // retour aux Réglages
  a.key(UP); a.key(UP); a.key(UP); a.key(OK); a.key(OK); // Plex intégré : Activé
  a.key(BACK); a.key(BACK);
  assert.equal(find(a.root, 'tuile').length, 7);
  assert.equal(JSON.parse(a.store['cimaise.v1']).prefs.modules.plex, true);
  assert.deepEqual(a.loaded, ['settings.js'], 'plex.js n’a jamais été chargé');
});

test('Réglages > Apps intégrées : activer les Scènes interroge Home Assistant à la fermeture ; les masquer retire la rangée', async () => {
  const a = boot({ stored: { version: 4, prefs: { ...HA, modules: { scenes: false } } } });
  a.flush();
  await openSettings(a);
  a.key(UP); a.key(UP); a.key(UP); a.key(OK); a.key(DOWN); a.key(OK); // Scènes : Activé
  assert.equal(a.xhr(), 0);
  a.key(BACK); a.key(BACK);
  assert.ok(a.xhr() >= 1, 'la rangée suit l’interrupteur à la fermeture');
  assert.equal(JSON.parse(a.store['cimaise.v1']).prefs.modules.scenes, true);
});

test('Réglages > Apps intégrées : les réglages de Plex (langues) restent accessibles même masqué', async () => {
  const a = boot({ stored: { version: 4, prefs: { modules: { plex: false } } } });
  await openSettings(a);
  a.key(UP); a.key(UP); a.key(UP); a.key(OK);
  assert.ok(texts(find(a.root, 'reglages')[0]).includes('Masqué'));
  a.key(RIGHT); a.key(OK);                              // chip « Réglages » : ouverture explicite
  assert.deepEqual(a.loaded, ['settings.js', 'plex.js'], 'chargé seulement sur demande explicite');
  await a.tick();
  assert.equal(find(a.root, 'plex-settings').length, 1);
  a.key(BACK);
  assert.equal(find(a.root, 'reglages').length, 1, 'retour aux Réglages');
  assert.equal(find(a.root, 'tuile').length, 0);
});
