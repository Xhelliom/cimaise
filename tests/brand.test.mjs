import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const dir = 'packages/launcher/brand/';
const svg = (n) => readFileSync(`${dir}logo-${n}.svg`, 'utf8');

test('3 pistes de logo SVG sources, carrées 512', () => {
  for (const n of [1, 2, 3]) {
    assert.ok(existsSync(`${dir}logo-${n}.svg`), `logo-${n}.svg`);
    assert.match(svg(n), /<svg[^>]*viewBox="0 0 512 512"/);
  }
});

test('fond plein, 2 couleurs + fond au plus, pas de texte ni d’effet', () => {
  for (const n of [1, 2, 3]) {
    const s = svg(n);
    assert.match(s, /<rect id="fond"[^>]*width="512"[^>]*height="512"/, 'fond plein');
    assert.match(s, /<g id="marque"/, 'marque isolée du fond');
    const colors = new Set((s.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).map((c) => c.toLowerCase()));
    assert.ok(colors.size <= 3, `n${n} couleurs : ${[...colors]}`);
    assert.doesNotMatch(s, /<text|<image|<filter|<script|opacity|<linearGradient|<radialGradient/);
  }
});

test('l’icône actuelle de l’app n’est pas touchée', () => {
  assert.equal(execFileSync('git', ['diff', '--name-only', 'HEAD', '--', 'apps/tv/icon.png', 'apps/tv/config.xml']).toString().trim(), '');
});
