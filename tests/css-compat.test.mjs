import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const run = (...files) => spawnSync('node', ['scripts/build/check-css.mjs', ...files], { encoding: 'utf8' });
const tmpCss = (css) => { const f = join(mkdtempSync(join(tmpdir(), 'css-')), 't.css'); writeFileSync(f, css); return f; };

test('CSS de l’app : aucune propriété hors cible', () => {
  const r = run();
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test('gap en flex : refusé', () => {
  const r = run(tmpCss('.a{display:flex;gap:10px}'));
  assert.notEqual(r.status, 0);
  assert.match(r.stderr + r.stdout, /gap/);
});

test('gap en grid : refusé aussi (grid-gap attendu)', () => {
  assert.notEqual(run(tmpCss('.a{display:grid;gap:10px}')).status, 0);
});

test('grid-gap accepté', () => {
  assert.equal(run(tmpCss('.a{display:grid;grid-gap:10px}')).status, 0);
});

test('autres fonctions récentes refusées', () => {
  for (const c of ['.a{aspect-ratio:1}', '.a{inset:0}', '.a{width:clamp(1px,2px,3px)}', ':is(a){x:y}', ':where(a){x:y}', '.a{backdrop-filter:blur(2px)}']) {
    assert.notEqual(run(tmpCss(c)).status, 0, c);
  }
});

test('commentaires ignorés', () => {
  assert.equal(run(tmpCss('/* gap:1px */ .a{margin:0}')).status, 0);
});

test('couleur #rrggbbaa refusée', () => {
  assert.notEqual(run(tmpCss('.a{background:#ffffff80}')).status, 0);
  assert.equal(run(tmpCss('.a{background:#ffffff;color:#abc}')).status, 0);
});

test('le build garde rgba() et les quatre côtés à 0 (ni #rrggbbaa ni inset)', async () => {
  const { buildCss } = await import('../scripts/build/css-build.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'cssb-'));
  const src = join(dir, 'style.css');
  writeFileSync(src, '.a{position:absolute;top:0;right:0;bottom:0;left:0;background:rgba(255,255,255,.5);border:1px solid rgba(0,0,0,.25)}');
  await buildCss(src, join(dir, 'out'));
  const out = join(dir, 'out', 'app.css');
  const css = (await import('node:fs')).readFileSync(out, 'utf8');
  assert.match(css, /rgba\(/);
  assert.doesNotMatch(css, /#[0-9a-f]{8}\b|inset/i);
  assert.equal(run(out).status, 0, css);
});
