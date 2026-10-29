import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, writeFileSync, mkdtempSync, readFileSync, statSync } from 'node:fs';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const run = (cmd, args, env) => spawnSync(cmd, args, { encoding: 'utf8', env: { ...process.env, ...env } });

before(() => {
  const r = run('npm', ['run', 'build']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test('build produit un bundle initial, une seule feuille CSS et un chunk par module différé', () => {
  const files = readdirSync('apps/tv/dist').filter((f) => /\.(js|css)$/.test(f));
  assert.deepEqual(files.sort(), ['app.css', 'app.js', 'plex.js', 'settings.js']);
  assert.deepEqual(readdirSync('apps/blank/dist').filter((f) => /\.(js|css)$/.test(f)).sort(), ['app.css', 'app.js']);
});

test('Plex et réglages ne sont pas dans le JS initial mais dans leur chunk', () => {
  const app = readFileSync('apps/tv/dist/app.js', 'utf8');
  assert.ok(!app.includes('module en construction'), 'panneau Plex dans app.js');
  assert.ok(!app.includes('Découvrir les apps installées'), 'panneau réglages dans app.js');
  assert.ok(readFileSync('apps/tv/dist/plex.js', 'utf8').includes('module en construction'));
  assert.ok(readFileSync('apps/tv/dist/settings.js', 'utf8').includes('couvrir les apps install'));
});

test('budgets : JS initial < 100 Ko, .wgt < 1,5 Mo, pour les deux cibles', () => {
  for (const [app, wgt] of [['apps/tv', 'cimaise'], ['apps/blank', 'blank']]) {
    assert.ok(statSync(`${app}/dist/app.js`).size < 100 * 1024, app);
    assert.ok(statSync(`${app}/build/${wgt}-unsigned.wgt`).size < 1.5 * 1024 * 1024, app);
  }
});

test('la vérification ES5 passe sur la sortie', () => {
  const r = run('node', ['scripts/build/check-es5.mjs']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test('la vérification ES5 échoue sur de l’ES2015+', () => {
  const dir = mkdtempSync(join(tmpdir(), 'es5-'));
  const f = join(dir, 'bad.js');
  writeFileSync(f, 'const f = (x) => `${x}`; f(1);');
  const r = run('node', ['scripts/build/check-es5.mjs', f]);
  assert.notEqual(r.status, 0);
});

test('le rapport de taille s’affiche et signale un dépassement', () => {
  const ok = run('node', ['scripts/build/size-report.mjs']);
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  assert.match(ok.stdout, /app\.js/);
  assert.match(ok.stdout, /100/);
  const over = run('node', ['scripts/build/size-report.mjs'], { CIMAISE_JS_BUDGET_BYTES: '1' });
  assert.notEqual(over.status, 0);
  assert.match(over.stdout + over.stderr, /dépass/i);
});

test('la sortie ne contient pas de syntaxe ES2015+ après minification', () => {
  assert.doesNotMatch(readFileSync('apps/tv/dist/app.js', 'utf8'), /=>|\bconst\b|\blet\b/);
});

test('la chaîne tsc → esbuild abaisse une fixture ES2015+ en ES5 qui s’exécute correctement', () => {
  const out = join(mkdtempSync(join(tmpdir(), 'fixture-')), 'dist');
  const b = run('node', ['scripts/build/build.mjs'], { CIMAISE_APP: 'tests/fixtures/es5-app', CIMAISE_OUT: out });
  assert.equal(b.status, 0, b.stdout + b.stderr);
  const bundle = join(out, 'app.js');
  const code = readFileSync(bundle, 'utf8');
  assert.doesNotMatch(code, /=>|\bconst\b|\blet\b|\bclass\b|`/);
  const es5 = run('node', ['scripts/build/check-es5.mjs', bundle]);
  assert.equal(es5.status, 0, es5.stdout + es5.stderr);
  const sandbox = { __out: {} };
  vm.runInNewContext(code, sandbox);
  assert.equal(sandbox.__out.value, 'total=26'); // 10 + 4 + (2+4+6)
});
