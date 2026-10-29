import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const doc = readFileSync('docs/plex-design.md', 'utf8');
const section = (title) => {
  const m = new RegExp('^## ' + title + '[^\\n]*\\n([\\s\\S]*?)(?=^## |$(?![\\s\\S]))', 'm').exec(doc);
  assert.ok(m, 'section manquante : ' + title);
  return m[1];
};

test('couvre les 4 écrans et la disposition à 1920×1080', () => {
  const s = section('Disposition');
  for (const ecran of ['Accueil', 'Bibliothèque', 'Fiche', 'Lecteur']) assert.match(s, new RegExp(ecran));
  assert.match(s, /1920.?×.?1080/);
});

test('donne les tailles d’images pour le transcodeur photo', () => {
  const s = section('Tailles d’images');
  assert.match(s, /\/photo\/:\/transcode/);
  assert.match(s, /width=240&height=360/);
  assert.match(s, /\d+ ?Ko/);
});

test('couleurs en hexadécimal, police Outfit, états de focus', () => {
  assert.match(section('Couleurs'), /#[0-9a-f]{6}/i);
  assert.match(section('Typographie'), /Outfit/);
  assert.match(section('Focus'), /scale/);
});

test('chaque effet coûteux de Plex Web a son équivalent léger', () => {
  const s = section('Effets coûteux');
  const lignes = s.split('\n').filter((l) => l.startsWith('|') && !/^\|[-| ]+\|$/.test(l)).slice(1);
  assert.ok(lignes.length >= 3, 'au moins flou, dégradés, ombres');
  for (const l of lignes) assert.equal(l.split('|').length - 2, 3, 'effet | coût | équivalent léger : ' + l);
  for (const mot of [/flou/i, /dégradé/i, /ombre/i]) assert.match(s, mot);
  for (const l of lignes) assert.ok(l.split('|')[3].trim().length > 5, 'équivalent vide : ' + l);
});

test('harmonisé avec le Dock v2', () => {
  assert.match(section('Harmonisation'), /dock\.html/);
});

test('aucun secret ni capture dans git', () => {
  const suivis = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n');
  assert.deepEqual(suivis.filter((f) => /plex-web-.*\.png$/.test(f)), []);
  assert.doesNotMatch(doc, /X-Plex-Token[=:%3D]+\w{6,}/);
  assert.doesNotMatch(doc, /\b192\.168\.\d+\.\d+\b/);
  assert.doesNotMatch(doc, /2afc3690142a/);
});
