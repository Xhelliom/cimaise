// Fond d'écran Unsplash de l'accueil : modèle, tirage du jour (une requête par jour au plus), couche photo de l'accueil,
// section « Fond d'écran » des Réglages, clé dans la copie empaquetée seulement.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';
import { build } from 'esbuild';

let W, H, S, V, dir, es5Dir;
async function bundle(es5Dir, rel, name) {
  const out = join(dir, name + '.cjs');
  await build({ entryPoints: [join(es5Dir, rel)], bundle: true, format: 'cjs', target: 'es5', outfile: out, logLevel: 'warning' });
  return createRequire(import.meta.url)(out);
}
before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'wp-'));
  es5Dir = join(dir, 'es5');
  const t = spawnSync('node_modules/.bin/tsc', ['-p', 'packages/launcher/tsconfig.json', '--outDir', es5Dir], { encoding: 'utf8' });
  assert.equal(t.status, 0, t.stdout + t.stderr);
  // Avec report() du même paquet : la ligne « fond » du diagnostic se lit dans les tests du tirage.
  writeFileSync(join(es5Dir, 'wp-diag.js'), "export * from './launcher/src/wallpaper/index.js';\nexport { report } from './tv-core/src/diag.js';\n");
  W = await bundle(es5Dir, 'wp-diag.js', 'wp');
  writeFileSync(join(es5Dir, 'home-diag.js'), "export * from './launcher/src/home/index.js';\nexport { report } from './tv-core/src/diag.js';\n");
  H = await bundle(es5Dir, 'home-diag.js', 'home');
  S = await bundle(es5Dir, 'launcher/src/settings/index.js', 'settings');
  V = await bundle(es5Dir, 'launcher/src/settings/wallpaper.js', 'wpview');
});

const RAW = 'https://images.unsplash.com/photo-123?ixid=abc&ixlib=rb-4.1.0';
const photoJson = (o = {}) => ({
  id: 'p1', width: 6000, height: 4000, urls: { raw: RAW },
  user: { name: 'Ana Pix', username: 'anapix', links: { html: 'https://unsplash.com/@anapix' } },
  links: { download_location: 'https://api.unsplash.com/photos/p1/download?ixid=abc' }, ...o,
});

// --- modèle ---
test('modèle : défauts (thème Wallpapers, paysage), mot vide = retour au thème', () => {
  const d = W.normalizeWallpaper(undefined);
  assert.equal(d.source, 'topic');
  assert.equal(d.topicTitle, 'Wallpapers');
  assert.equal(d.portrait, false);
  assert.equal(W.normalizeWallpaper({ source: 'query', query: '   ' }).source, 'topic');
  assert.equal(W.normalizeWallpaper({ source: 'query', query: ' montagne   brume ' }).query, 'montagne brume');
  assert.equal(W.dayKey(new Date(2026, 10, 8, 23, 59)), '2026-11-08');
});

test('modèle : tirage paysage par défaut, orientation libre si portrait ; filtre de contenu strict', () => {
  const p = W.normalizeWallpaper({ topicId: 'nat' });
  assert.equal(W.randomPath(p), '/photos/random?topics=nat&orientation=landscape&content_filter=high');
  assert.equal(W.randomPath({ ...p, portrait: true }), '/photos/random?topics=nat&content_filter=high');
  assert.equal(W.randomPath(W.normalizeWallpaper({ source: 'query', query: 'montagne brume' })), '/photos/random?query=montagne%20brume&orientation=landscape&content_filter=high');
});

test('modèle : image demandée à la taille de l’écran via imgix (recadrée), portrait entier à la hauteur de l’écran', () => {
  assert.equal(W.imageUrl(RAW, false), RAW + '&w=1920&h=1080&fit=crop&q=70&fm=jpg&jpeg-progressive=false');
  assert.equal(W.imageUrl(RAW, true), RAW + '&h=1080&fit=max&q=70&fm=jpg&jpeg-progressive=false');
  assert.equal(W.httpUrl(W.imageUrl(RAW, false)), W.imageUrl(RAW, false).replace('https://', 'http://'));
  assert.equal(W.readDaily({ url: RAW + '&w=1920&h=1080&fit=crop&q=70&fm=jpg' }).url, W.imageUrl(RAW, false), 'image mémorisée en progressif : rejouée en JPEG de base');
});

test('modèle : réponse Unsplash -> image du jour (auteur, liens utm, download_location) ; réponse étrangère refusée', () => {
  const p = W.normalizeWallpaper({});
  const c = W.parsePhoto(photoJson(), p, '2026-11-08');
  assert.equal(c.author, 'Ana Pix');
  assert.equal(c.authorUrl, 'https://unsplash.com/@anapix?utm_source=cimaise&utm_medium=referral');
  assert.equal(c.dl, 'https://api.unsplash.com/photos/p1/download?ixid=abc');
  assert.equal(c.portrait, false);
  assert.equal(c.tracked, false);
  assert.match(c.url, /fit=crop/);
  // Portrait seulement si l'option est active ET la photo plus haute que large.
  assert.equal(W.parsePhoto(photoJson({ width: 3000, height: 4500 }), p, 'x').portrait, false);
  const pp = W.parsePhoto(photoJson({ width: 3000, height: 4500 }), { ...p, portrait: true }, 'x');
  assert.equal(pp.portrait, true);
  assert.match(pp.url, /fit=max/);
  assert.equal(W.parsePhoto(photoJson({ urls: { raw: 'https://evil.example/x.jpg' } }), p, 'x'), null);
  assert.equal(W.parsePhoto({ errors: ['Rate Limit Exceeded'] }, p, 'x'), null);
});

test('modèle : thèmes officiels, doublons de titre précisés ; cache de 30 jours', () => {
  const l = W.parseTopics([
    { id: 'a', slug: 'wallpapers', title: 'Wallpapers' }, { id: 'b', slug: 'nature', title: 'Nature' },
    { id: 'c', slug: 'illustration-wallpapers', title: 'Wallpapers' }, { bad: 1 },
  ]);
  assert.deepEqual(l.map((t) => t.title), ['Wallpapers', 'Nature', 'Wallpapers (illustration)']);
  const now = Date.now();
  assert.equal(W.readTopics({ at: now - 31 * 864e5, list: l }, now), null);
  assert.equal(W.readTopics({ at: now - 864e5, list: l }, now).length, 3);
  assert.equal(W.packagedKey({}), '');
  assert.equal(W.packagedKey({ __cimaiseUnsplash: { key: 'K' } }), 'K');
});

// --- tirage du jour ---
function memStore(prefs) {
  const m = new Map();
  if (prefs) m.set('cimaise.v1', JSON.stringify({ version: 4, prefs }));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), prefs: () => JSON.parse(m.get('cimaise.v1') || '{"prefs":{}}').prefs };
}
function harness({ prefs, reply = () => ({ status: 200, body: JSON.stringify(photoJson()) }), key = 'KEY', day = '2026-11-08T10:00:00' } = {}) {
  const store = memStore(prefs), reqs = [], shown = [];
  const h = {
    store, reqs, shown, now: new Date(day),
    run() {
      W.refreshWallpaper({
        key, store, now: () => h.now,
        http: (req, cb) => { reqs.push(req); const r = reply(req); if (r instanceof Error) cb(r); else cb(null, r); },
        show: (p, onShown) => { shown.push(p); if (p && h.autoShow !== false) onShown && onShown(); },
      });
    },
  };
  return h;
}
const randoms = (h) => h.reqs.filter((r) => r.url.includes('/photos/random'));
const downloads = (h) => h.reqs.filter((r) => r.url.includes('/download'));

test('tirage : sans clé, aucun appel et fond teinté', () => {
  const h = harness({ key: '' });
  h.run();
  assert.equal(h.reqs.length, 0);
  assert.deepEqual(h.shown, [null]);
  assert.match(W.report(), /^fond: pas de clé Unsplash dans le paquet$/m);
});

test('tirage : source Désactivé, aucun appel et fond teinté', () => {
  const h = harness({ prefs: { wallpaper: { source: 'off' } } });
  h.run();
  assert.equal(h.reqs.length, 0);
  assert.deepEqual(h.shown, [null]);
});

test('diagnostic : la ligne « fond tirage » dit le résultat de l’appel, même en échec (HTTP n, réseau, délai, réponse illisible)', () => {
  const cas = [
    [() => ({ status: 401, body: '{}' }), /^fond tirage: échec : HTTP 401 \(\d+ ms\)$/m],
    [() => new Error('réseau'), /^fond tirage: échec : réseau \(\d+ ms\)$/m],
    [() => new Error('délai dépassé'), /^fond tirage: échec : délai dépassé \(\d+ ms\)$/m],
    [() => ({ status: 200, body: '<html>' }), /^fond tirage: échec : réponse illisible \(\d+ ms\)$/m],
    [undefined, /^fond tirage: HTTP 200 \(\d+ ms\)$/m],
  ];
  for (const [reply, re] of cas) { const h = harness(reply ? { reply } : {}); h.run(); assert.match(W.report(), re); }
  const h = harness(); h.run(); h.run();
  assert.match(W.report(), /^fond tirage: aucun, image du 2026-11-08 en cache$/m);
});

test('tirage : UNE requête par jour, avec la clé en Client-ID ; résultat mémorisé dans cimaise.v1 avec sa date', () => {
  const h = harness();
  h.run();
  assert.equal(randoms(h).length, 1);
  assert.equal(randoms(h)[0].headers.Authorization, 'Client-ID KEY');
  assert.match(randoms(h)[0].url, /^https:\/\/api\.unsplash\.com\/photos\/random\?topics=bo8jQKTaE0Y&orientation=landscape/);
  assert.ok(randoms(h)[0].timeoutMs > 0);
  const c = h.store.prefs().wallpaperDay;
  assert.equal(c.day, '2026-11-08');
  assert.equal(c.author, 'Ana Pix');
  assert.equal(h.shown[0].author, 'Ana Pix');
  h.run(); h.run();
  assert.equal(randoms(h).length, 1, 'même jour : image en cache, aucune requête');
  assert.equal(h.shown.length, 3);
  h.now = new Date('2026-11-09T07:00:00');
  h.run();
  assert.equal(randoms(h).length, 2, 'nouveau jour : nouvelle image');
});

test('tirage : download_location appelé une seule fois, quand l’image est affichée', () => {
  const h = harness();
  h.autoShow = false;
  h.run();
  assert.equal(downloads(h).length, 0, 'pas encore affichée');
  h.autoShow = true;
  h.run(); h.run();
  assert.equal(downloads(h).length, 1);
  assert.equal(downloads(h)[0].headers.Authorization, 'Client-ID KEY');
  assert.equal(h.store.prefs().wallpaperDay.tracked, true);
});

test('tirage : changer un réglage remplace l’image du jour', () => {
  const h = harness();
  h.run();
  const s = h.store.prefs();
  s.wallpaper = { source: 'query', query: 'montagne brume' };
  h.store.setItem('cimaise.v1', JSON.stringify({ version: 4, prefs: s }));
  h.run();
  assert.equal(randoms(h).length, 2);
  assert.match(randoms(h)[1].url, /query=montagne%20brume/);
  s.wallpaper.portrait = true;
  h.store.setItem('cimaise.v1', JSON.stringify({ version: 4, prefs: { ...h.store.prefs(), wallpaper: s.wallpaper } }));
  h.run();
  assert.equal(randoms(h).length, 3);
  assert.doesNotMatch(randoms(h)[2].url, /orientation/);
});

test('tirage : hors ligne, l’image d’hier ; sans image d’hier, fond teinté ; jamais d’exception', () => {
  const h = harness({ reply: () => ({ status: 200, body: JSON.stringify(photoJson()) }) });
  h.run();
  const hier = h.shown[0].url;
  h.now = new Date('2026-11-09T07:00:00');
  for (const fail of [() => new Error('réseau'), () => ({ status: 403, body: 'Rate Limit Exceeded' }), () => ({ status: 200, body: 'pas du json' })]) {
    const g = harness({ prefs: h.store.prefs(), reply: fail, day: '2026-11-09T07:00:00' });
    g.run();
    assert.equal(g.shown[0].url, hier);
  }
  const vide = harness({ reply: () => new Error('réseau') });
  vide.run();
  assert.deepEqual(vide.shown, [null]);
});

test('« Changer d’image » : nouveau tirage au prochain affichage, l’ancienne image reste en secours', () => {
  const h = harness();
  h.run();
  const avant = h.shown[0].url;
  W.skipWallpaper(h.store);
  h.run();
  assert.equal(randoms(h).length, 2, 'nouveau tirage le même jour');
  const g = harness({ prefs: h.store.prefs(), reply: () => new Error('réseau') });
  W.skipWallpaper(g.store);
  g.run();
  assert.equal(g.shown[0].url, avant, 'hors ligne : image en cache gardée');
});

test('Réglages : ligne « Changer d’image » (Entrée), inactive si la source est désactivée', () => {
  let next = 0;
  const view = V.createWallpaperView(sfakeDoc(), { value: W.normalizeWallpaper({}), onChange() {}, topics: (cb) => cb(null, TOPICS), onNext: () => next++ }, () => {});
  assert.ok(texts(view.render()).includes('Changer d’image'));
  ['down', 'down', 'down', 'enter'].forEach((k) => view.press(k));
  assert.equal(next, 1);
  assert.match(view.status(), /prochain affichage/);
  ['up', 'up', 'up', 'left', 'down', 'down', 'down', 'enter'].forEach((k) => view.press(k));
  assert.equal(next, 1);
  assert.match(view.status(), /désactivée/);
});

test('thèmes : un seul GET /topics, puis le cache (pas d’appel à la seconde ouverture)', () => {
  const store = memStore({}), reqs = [];
  const http = (req, cb) => { reqs.push(req); cb(null, { status: 200, body: JSON.stringify([{ id: 'a', slug: 'wallpapers', title: 'Wallpapers' }, { id: 'b', slug: 'nature', title: 'Nature' }]) }); };
  let got;
  W.loadTopics(http, 'KEY', (e, l) => { got = l; }, store);
  W.loadTopics(http, 'KEY', (e, l) => { got = l; }, store);
  assert.equal(reqs.length, 1);
  assert.match(reqs[0].url, /^https:\/\/api\.unsplash\.com\/topics\?/);
  assert.deepEqual(got.map((t) => t.title), ['Wallpapers', 'Nature']);
});

test('aucune minuterie dans le tirage (rien ne tourne à l’accueil)', () => {
  const src = readFileSync('packages/launcher/src/wallpaper/daily.ts', 'utf8') + readFileSync('packages/launcher/src/wallpaper/model.ts', 'utf8');
  assert.ok(!/setTimeout|setInterval/.test(src));
});

// --- couche photo de l'accueil ---
function fakeDoc() {
  const imgs = [];
  const mk = (tag) => {
    const el = {
      tag, children: [], parent: null, className: '', textContent: '', attrs: {}, offsetWidth: 1, style: {},
      appendChild(c) { if (c.parent) c.parent.removeChild(c); c.parent = el; el.children.push(c); return c; },
      insertBefore(c, ref) { c.parent = el; const i = el.children.indexOf(ref); el.children.splice(i < 0 ? el.children.length : i, 0, c); return c; },
      removeChild(c) { el.children.splice(el.children.indexOf(c), 1); c.parent = null; return c; },
      setAttribute(k, v) { el.attrs[k] = v; },
      removeAttribute(k) { delete el.attrs[k]; },
    };
    Object.defineProperty(el, 'firstChild', { get: () => el.children[0] || null });
    Object.defineProperty(el, 'parentNode', { get: () => el.parent });
    if (tag === 'img') imgs.push(el);
    return el;
  };
  return { createElement: mk, createTextNode: (t) => ({ ...mk('#text'), textContent: t }), head: mk('head'), imgs };
}
const walk = (el) => [el, ...el.children.flatMap(walk)];
const text = (el) => walk(el).filter((x) => !x.children.length).map((x) => x.textContent).join('');
function timers() {
  const t = { list: [], set(fn, ms) { t.list.push({ fn, ms, live: true }); return t.list.length - 1; }, clear(h) { if (t.list[h]) t.list[h].live = false; } };
  t.flush = () => t.list.filter((x) => x.live && x.ms < 60000).forEach((x) => { x.live = false; x.fn(); });
  return t;
}
function mountHome() {
  const doc = fakeDoc(), tm = timers();
  const p = H.createHome({ catalog: [{ id: 'a', name: 'A', color: '#e50914', type: 'tv' }], doc, timer: tm, now: () => new Date('2026-11-08T10:00:00'), launchApp() {}, onPastille() {}, watchNetwork: () => () => {} });
  return { p, doc, tm, photos: () => p.el.children.filter((c) => c.className.split(' ')[0] === 'photo') };
}
const PH = { url: RAW + '&w=1920', author: 'Ana Pix', authorUrl: 'https://unsplash.com/@anapix?utm_source=cimaise&utm_medium=referral', portrait: false };

test('accueil : aucune couche photo sans demande ; posée hors DOM puis en fondu, sous l’en-tête, avec crédit et liens utm', () => {
  const { p, doc, photos } = mountHome();
  assert.equal(photos().length, 0);
  let shown = 0;
  p.setPhoto(PH, () => shown++);
  assert.equal(photos().length, 0, 'rien avant le chargement');
  assert.equal(doc.imgs.length, 1);
  assert.equal(doc.imgs[0].attrs.src, PH.url);
  doc.imgs[0].onload();
  assert.equal(shown, 1);
  const layer = photos()[0];
  assert.equal(layer.className, 'photo vu');
  const kids = p.el.children;
  assert.ok(kids.indexOf(layer) < kids.findIndex((c) => c.className === 'entete'), 'la photo passe sous le contenu');
  const credit = walk(layer).find((x) => x.className === 'credit');
  assert.equal(text(credit), 'Photo : Ana Pix / Unsplash');
  const links = walk(credit).filter((x) => x.tag === 'a').map((a) => a.attrs.href);
  assert.deepEqual(links, [PH.authorUrl, 'https://unsplash.com/?utm_source=cimaise&utm_medium=referral']);
  assert.ok(walk(layer).some((x) => x.className === 'voile'));
  assert.match(H.report(), /fond: \d+×\d+|fond: 0×0/);
});

test('accueil : même image = rien de neuf ; nouvelle image en fondu, l’ancienne retirée après ; null = retour à la teinte', () => {
  const { p, doc, tm, photos } = mountHome();
  p.setPhoto(PH); doc.imgs[0].onload();
  p.setPhoto(PH);
  assert.equal(doc.imgs.length, 1, 'même URL : aucun rechargement');
  p.setPhoto({ ...PH, url: RAW + '&w=2', portrait: true }); doc.imgs[1].onload();
  assert.equal(photos().length, 2);
  assert.equal(photos()[1].className, 'photo portrait vu');
  tm.flush();
  assert.equal(photos().length, 1);
  p.setPhoto(null);
  tm.flush();
  assert.equal(photos().length, 0);
});

test('accueil : image illisible (hors ligne, pas en cache) : aucune couche, aucune erreur', () => {
  const { p, doc, photos } = mountHome();
  let shown = 0;
  p.setPhoto(PH, () => shown++);
  assert.match(H.report(), /^fond: image en chargement…$/m);
  assert.doesNotThrow(() => doc.imgs[0].onerror());
  assert.match(H.report(), /^fond: https illisible après \d+ ms$/m);
  assert.equal(photos().length, 0);
  assert.equal(shown, 0);
});

test('accueil : image https illisible → un seul essai sur l’adresse http, posée avec le crédit ; le diagnostic le dit', () => {
  const { p, doc, photos } = mountHome();
  let shown = 0;
  const alt = PH.url.replace('https:', 'http:');
  p.setPhoto({ ...PH, alt }, () => shown++);
  doc.imgs[0].onerror();
  assert.equal(doc.imgs.length, 2);
  assert.equal(doc.imgs[1].attrs.src, alt);
  doc.imgs[1].onload();
  assert.equal(photos().length, 1);
  assert.equal(shown, 1);
  assert.match(H.report(), /^fond: par http \(https illisible après \d+ ms\) : /m);
  const b = mountHome();
  b.p.setPhoto({ ...PH, alt });
  b.doc.imgs[0].onerror(); b.doc.imgs[1].onerror();
  assert.equal(b.doc.imgs.length, 2, 'pas de boucle');
  assert.equal(b.photos().length, 0);
  assert.match(H.report(), /^fond: https illisible après \d+ ms, http aussi illisible après \d+ ms$/m);
});

test('démarrage : la photo n’est demandée qu’après l’événement load (une image en cours retarde load)', () => {
  const src = readFileSync('apps/tv/src/index.ts', 'utf8');
  assert.match(src, /readyState === 'complete'\) refreshPhoto\(\);\s*else window\.addEventListener\('load'/);
  assert.equal((src.match(/^\s*refreshPhoto\(\);\s*$/gm) || []).length, 0, 'aucun appel nu au démarrage');
});

test('package.sh : refuse un dossier dont l’index.html charge un script absent (paquet des sources, 08/11)', () => {
  const sh = readFileSync('scripts/tizen/package.sh', 'utf8');
  assert.match(sh, /index\.html le charge/);
  assert.ok(sh.indexOf('index.html le charge') < sh.indexOf('local-config.mjs'), 'refus avant toute copie');
  assert.ok(!existsSync('apps/tv/app.js'), 'apps/tv (sources) ne doit pas contenir app.js');
});

test('accueil : une demande dépassée (réglage changé pendant le chargement) n’est jamais posée', () => {
  const { p, doc, photos } = mountHome();
  p.setPhoto(PH);
  p.setPhoto(null);
  doc.imgs[0].onload();
  assert.equal(photos().length, 0);
});

test('CSS : seule l’opacity de la couche est animée, aucun flou ni filtre', () => {
  const css = readFileSync('packages/launcher/src/home/home.css', 'utf8').split('\n').filter((l) => /\.photo/.test(l)).join('\n');
  assert.match(css, /\.home \.photo\{[^}]*transition:opacity/);
  assert.ok(!/filter|blur/.test(css));
  assert.match(css, /\.home \.photo img\{[^}]*width:1920px;height:1080px/);
});

// --- Réglages ---
function sfakeDoc() {
  const mk = (tag) => {
    const el = {
      tag, children: [], parent: null, className: '', textContent: '', attrs: {}, style: {},
      appendChild(c) { c.parent = el; el.children.push(c); return c; },
      removeChild(c) { el.children.splice(el.children.indexOf(c), 1); c.parent = null; return c; },
      setAttribute(k, v) { el.attrs[k] = v; },
      removeAttribute(k) { delete el.attrs[k]; },
    };
    Object.defineProperty(el, 'firstChild', { get: () => el.children[0] || null });
    return el;
  };
  return { createElement: mk, head: mk('head') };
}
const texts = (el) => [el.textContent, ...el.children.flatMap(texts)].filter(Boolean);
const TOPICS = [{ id: 'bo8jQKTaE0Y', title: 'Wallpapers' }, { id: 'nat', title: 'Nature' }, { id: 'arch', title: 'Architecture' }];

function openSettings(wp) {
  const panel = S.createSettings({ catalog: [{ id: 'a', name: 'A', tint: S.PALETTE[0] }], listInstalledApps() {}, onChange() {}, onClose() {}, doc: sfakeDoc(), modules: [{ id: 'plex', name: 'Plex', enabled: true, hasSettings: true }], wp });
  return { panel, press: (...ks) => ks.forEach((k) => panel.onKey(k)) };
}

test('Réglages : « Fond d’écran » tout en haut seulement avec une clé ; sans clé la liste ne change pas', () => {
  assert.ok(!texts(openSettings(undefined).panel.el).includes('Fond d’écran'));
  const changes = [];
  const r = openSettings({ value: W.normalizeWallpaper({}), onChange: (v) => changes.push(v), topics: (cb) => cb(null, TOPICS) });
  assert.ok(texts(r.panel.el).includes('Fond d’écran'));
  r.press('up', 'up', 'up', 'up', 'up', 'enter');
  const t = texts(r.panel.el);
  assert.ok(t.includes('Source') && t.includes('Recherche') && t.includes('Photos en portrait'), t.join('|'));
  assert.ok(t.some((x) => /Thème : Wallpapers/.test(x)));
  assert.ok(t.includes('Non'), 'portrait : Non par défaut');
  r.press('back');
  assert.ok(texts(r.panel.el).includes('Réglages'));
});

test('Réglages : la source se parcourt aux flèches (Désactivé, thèmes) et chaque choix est enregistré', () => {
  const changes = [];
  let asked = 0;
  const view = V.createWallpaperView(sfakeDoc(), { value: W.normalizeWallpaper({}), onChange: (x) => changes.push({ ...x }), topics: (cb) => { asked++; cb(null, TOPICS); } }, () => {});
  const v = { open: () => view.open(), status: () => view.status(), press: (...ks) => ks.forEach((k) => view.press(k)) };
  v.open();
  assert.equal(asked, 1);
  v.press('right');
  assert.equal(changes.at(-1).topicTitle, 'Nature');
  v.press('right');
  assert.equal(changes.at(-1).topicId, 'arch');
  v.press('right');
  assert.equal(changes.length, 2, 'au bout de la liste (sans recherche saisie) : rien');
  v.press('left', 'left', 'left');
  assert.equal(changes.at(-1).source, 'off');
  assert.match(v.status(), /prochain affichage/);
  v.press('down', 'down', 'right');
  assert.equal(changes.at(-1).portrait, true);
  v.press('left');
  assert.equal(changes.at(-1).portrait, false);
});

test('Réglages : thèmes indisponibles (hors ligne) : la section reste utilisable avec le thème courant', () => {
  const changes = [];
  const v = V.createWallpaperView(sfakeDoc(), { value: W.normalizeWallpaper({}), onChange: (x) => changes.push(x), topics: (cb) => cb(new Error('réseau')) }, () => {});
  v.open();
  assert.match(v.status(), /Thèmes indisponibles/);
  v.press('left');
  assert.equal(changes.at(-1).source, 'off');
});

test('Réglages : le module est dans le chunk Réglages, pas dans le bundle initial du launcher', async () => {
  const r = await build({ entryPoints: [join(es5Dir, 'launcher/src/index.js')], bundle: true, write: false, format: 'iife', target: 'es5', minify: true, logLevel: 'warning' });
  assert.ok(!/Photos en portrait/.test(r.outputFiles[0].text));
});

// --- clé dans la copie empaquetée seulement ---
test('unsplash.env : clé en mémoire (window), origines api. et images.unsplash.com déclarées dans la copie seulement', () => {
  const d = mkdtempSync(join(tmpdir(), 'wpcfg-')), app = join(d, 'app'), stage = join(d, 'stage');
  mkdirSync(app);
  writeFileSync(join(app, 'index.html'), '<html><body><script src="app.js"></script></body></html>');
  writeFileSync(join(app, 'app.js'), '1');
  writeFileSync(join(app, 'config.xml'), '<widget>\n  <name>x</name>\n</widget>\n');
  const KEY = 'FAKE-UNSPLASH-KEY-0123456789';
  writeFileSync(join(d, 'unsplash.env'), `UNSPLASH_ACCESS_KEY=${KEY}\n`);
  const r = spawnSync('node', ['scripts/build/local-config.mjs', app, stage, join(d, 'x.env'), join(d, 'y.env'), join(d, 'unsplash.env')], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(!(r.stdout + r.stderr).includes(KEY), 'clé dans la sortie du script');
  const w = {}, m = new Map();
  vm.runInNewContext(readFileSync(join(stage, 'local-config.js'), 'utf8'), { window: w, localStorage: { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) } });
  assert.equal(w.__cimaiseUnsplash.key, KEY);
  assert.equal(m.size, 0, 'jamais dans localStorage');
  const xml = readFileSync(join(stage, 'config.xml'), 'utf8');
  assert.match(xml, /<access origin="https:\/\/api\.unsplash\.com" subdomains="false"\/>/);
  assert.match(xml, /<access origin="https:\/\/images\.unsplash\.com" subdomains="false"\/>/);
  assert.match(xml, /<access origin="http:\/\/images\.unsplash\.com" subdomains="false"\/>\n<\/widget>/, 'repli http de la Frame');
  assert.ok(!readFileSync('apps/tv/config.xml', 'utf8').includes('unsplash'), 'origine Unsplash commitée');
  assert.ok(!existsSync(join(app, 'local-config.js')), 'source modifiée');
});
