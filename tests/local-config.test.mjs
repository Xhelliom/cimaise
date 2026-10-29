// Pré-remplissage local de Home Assistant dans le paquet (jamais dans le build commité, ni git, ni les logs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';

const TOKEN = 'FAKE-LOCAL-TOKEN-abcdef0123456789';
const URL_HA = 'http://ha.example.lan:8123';
const sandboxDir = () => mkdtempSync(join(tmpdir(), 'localcfg-'));
const mkApp = (d) => {
  const app = join(d, 'app'); mkdirSync(app);
  writeFileSync(join(app, 'index.html'), '<html><body><script src="$WEBAPIS/webapis/webapis.js"></script>\n<script src="app.js"></script></body></html>');
  writeFileSync(join(app, 'app.js'), '1');
  return app;
};
const run = (...a) => spawnSync('node', ['scripts/build/local-config.mjs', ...a], { encoding: 'utf8' });

test('génère local-config.js et le branche avant app.js, sans toucher à la source', () => {
  const d = sandboxDir(), app = mkApp(d), stage = join(d, 'stage');
  const env = join(d, 'ha.env'); writeFileSync(env, `HA_URL=${URL_HA}\nHA_URL_ALT=http://x\nHA_TOKEN=${TOKEN}\n`);
  const r = run(app, stage, env);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(!(r.stdout + r.stderr).includes(TOKEN), 'jeton dans la sortie du script');
  const html = readFileSync(join(stage, 'index.html'), 'utf8');
  assert.match(html, /<script src="local-config\.js"><\/script>\s*<script src="app\.js">/);
  assert.ok(!existsSync(join(app, 'local-config.js')), 'source modifiée');
  assert.ok(!readFileSync(join(app, 'index.html'), 'utf8').includes('local-config'));
  assert.ok(existsSync(join(stage, 'app.js')), 'copie incomplète');
});

test('local-config.js pré-remplit haUrl/haToken vides, sans écraser une saisie manuelle', () => {
  const d = sandboxDir(), app = mkApp(d), stage = join(d, 'stage');
  const env = join(d, 'ha.env'); writeFileSync(env, `HA_URL=${URL_HA}\nHA_TOKEN=${TOKEN}\n`);
  assert.equal(run(app, stage, env).status, 0);
  const code = readFileSync(join(stage, 'local-config.js'), 'utf8');
  const play = (initial) => {
    const m = new Map(initial === null ? [] : [['cimaise.v1', JSON.stringify(initial)]]);
    const localStorage = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v) };
    vm.runInNewContext(code, { localStorage });
    return JSON.parse(m.get('cimaise.v1'));
  };
  assert.deepEqual(play(null).prefs, { haUrl: URL_HA, haToken: TOKEN });
  assert.equal(play({ version: 2, prefs: { theme: 'x' } }).prefs.theme, 'x');
  const manual = play({ version: 2, prefs: { haUrl: 'http://moi', haToken: 'MIEN' } }).prefs;
  assert.equal(manual.haUrl, 'http://moi');
  assert.equal(manual.haToken, 'MIEN');
  // Saisie manuelle effacée par l'utilisateur = vide : le pré-remplissage revient (documenté).
  assert.equal(play({ version: 2, prefs: { haUrl: '', haToken: '' } }).prefs.haToken, TOKEN);
});

test('ha.env absent ou incomplet : rien n’est généré, le paquet reste sans jeton', () => {
  const d = sandboxDir(), app = mkApp(d);
  const r1 = run(app, join(d, 's1'), join(d, 'absent.env'));
  assert.equal(r1.status, 0);
  assert.ok(!existsSync(join(d, 's1', 'local-config.js')));
  assert.ok(!readFileSync(join(d, 's1', 'index.html'), 'utf8').includes('local-config'));
  const env = join(d, 'ha.env'); writeFileSync(env, 'HA_URL=http://x\n');
  const r2 = run(app, join(d, 's2'), env);
  assert.equal(r2.status, 0);
  assert.ok(!existsSync(join(d, 's2', 'local-config.js')));
});

test('le build commité ne contient aucune trace de jeton ni de local-config', () => {
  const walk = (p, out = []) => { for (const e of readdirSync(p)) { const f = join(p, e); statSync(f).isDirectory() ? walk(f, out) : out.push(f); } return out; };
  for (const dir of ['apps/tv', 'scripts', 'packages']) for (const f of walk(dir)) {
    if (f.includes('node_modules') || f.includes('/dist/') || f.includes('/build/') || /\.(png|woff2|svg)$/.test(f)) continue;
    assert.ok(!/local-config\.js/.test(readFileSync(f, 'utf8')) || /scripts\/(build|tizen)\//.test(f), 'référence inattendue : ' + f);
  }
  for (const f of ['apps/tv/dist/index.html', 'apps/tv/dist/app.js']) if (existsSync(f)) assert.ok(!readFileSync(f, 'utf8').includes('local-config'), f);
  assert.ok(!existsSync('apps/tv/dist/local-config.js'));
  const tracked = spawnSync('git', ['ls-files'], { encoding: 'utf8' }).stdout.split('\n');
  assert.ok(!tracked.some((f) => /(^|\/)local-config\.js$|ha\.env$/.test(f)), 'fichier de jeton suivi par git');
});

test('package.sh stage la copie, ne la laisse pas dans dist/ et n’affiche pas le jeton', () => {
  const sh = readFileSync('scripts/tizen/package.sh', 'utf8');
  assert.match(sh, /local-config\.mjs/);
  assert.match(sh, /trap /);
  assert.match(sh, /ha\.env/);
  assert.ok(!/echo[^\n]*HA_TOKEN/.test(sh), 'jeton affiché');
});

test('le compromis est documenté dans docs/decisions.md', () => {
  assert.match(readFileSync('docs/decisions.md', 'utf8'), /local-config\.js[\s\S]*jeton[\s\S]*paquet/i);
});
