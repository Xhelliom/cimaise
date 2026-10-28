import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, writeFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const run = (cmd, args, env) => spawnSync(cmd, args, { encoding: 'utf8', env: { ...process.env, ...env } });

before(() => {
  const r = run('npm', ['run', 'build']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test('build produit un seul bundle JS et une seule feuille CSS', () => {
  const files = readdirSync('apps/tv/dist').filter((f) => /\.(js|css)$/.test(f));
  assert.deepEqual(files.sort(), ['app.css', 'app.js']);
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
