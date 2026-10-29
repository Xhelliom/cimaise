import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const workspaces = ['apps/tv', 'apps/blank', 'packages/tv-core', 'packages/launcher', 'packages/plex', 'packages/widgets-bridge', 'packages/widgets', 'mocks', 'scripts'];

test('chaque workspace a package.json et src/index.ts (sauf scripts)', () => {
  for (const w of workspaces) {
    assert.ok(existsSync(w + '/package.json'), w + '/package.json');
    if (w !== 'scripts') assert.ok(existsSync(w + '/src/index.ts'), w + '/src/index.ts');
  }
});

test('racine déclare les workspaces', () => {
  const root = JSON.parse(readFileSync('package.json', 'utf8'));
  for (const w of workspaces) assert.ok(root.workspaces.includes(w) || root.workspaces.includes(w.replace(/[^/]+$/, '*')), w);
});

test('aucune dépendance runtime', () => {
  for (const w of ['.', ...workspaces]) {
    const p = JSON.parse(readFileSync(w + '/package.json', 'utf8'));
    assert.equal(Object.keys(p.dependencies || {}).length, 0, w);
  }
});

test('docs et dossiers du HANDOFF §4', () => {
  for (const f of ['docs/tv-status.md', 'docs/decisions.md']) assert.ok(existsSync(f), f);
  const st = readFileSync('docs/tv-status.md', 'utf8');
  for (const h of ['Observé physiquement', 'Réponse du SDK', 'Non testé']) assert.match(st, new RegExp('^## ' + h, 'm'));
  assert.match(readFileSync('docs/decisions.md', 'utf8'), /Plex/);
});

test('.local/ est ignoré par git', () => {
  execFileSync('git', ['check-ignore', '.local/x']);
});
