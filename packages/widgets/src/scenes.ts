// Scènes choisies pour l'accueil : modèle pur (choix, filtre par pièce et par lettres, ordre) et chargement qui ne remonte jamais d'erreur.
// Préférences dans cimaise.v1 : haUrl, haToken (ha.ts) et haScenes (identifiants, dans l'ordre d'affichage).
import { Scene, Http, haConfigFromPrefs, listScenes } from './ha';
import { loadStored, saveStored } from '../../tv-core/src/storage';

export var MAX_SCENES = 6;
var SCENE_ID = /^scene\.[a-z0-9_]+$/;

export function normalizeChosen(v: any): string[] {
  var out: string[] = [];
  if (!v || typeof v.length !== 'number') return out;
  for (var i = 0; i < v.length && out.length < MAX_SCENES; i++) {
    if (typeof v[i] === 'string' && SCENE_ID.test(v[i]) && out.indexOf(v[i]) < 0) out.push(v[i]);
  }
  return out;
}

// Minuscules sans accents : la recherche par lettres ne dépend ni de la casse ni des accents.
export function fold(s: string): string {
  return s.toLowerCase()
    .replace(/[àáâãäå]/g, 'a').replace(/ç/g, 'c').replace(/[èéêë]/g, 'e').replace(/[ìíîï]/g, 'i')
    .replace(/ñ/g, 'n').replace(/[òóôõö]/g, 'o').replace(/[ùúûü]/g, 'u').replace(/[ýÿ]/g, 'y');
}

// Pièces présentes, triées ; les scènes sans pièce n'apparaissent que sous « toutes ».
export function areasOf(scenes: Scene[]): string[] {
  var out: string[] = [];
  for (var i = 0; i < scenes.length; i++) if (scenes[i].area && out.indexOf(scenes[i].area as string) < 0) out.push(scenes[i].area as string);
  return out.sort(function (a, b) { return fold(a) < fold(b) ? -1 : fold(a) > fold(b) ? 1 : 0; });
}

// Scènes triées par nom, de la pièce donnée (null = toutes), dont le nom contient toutes les lettres/mots saisis.
export function filterScenes(scenes: Scene[], area: string | null, query: string): Scene[] {
  var words = fold(query).split(/\s+/), out: Scene[] = [];
  for (var i = 0; i < scenes.length; i++) {
    var s = scenes[i];
    if (area !== null && s.area !== area) continue;
    var n = fold(s.name), ok = true;
    for (var w = 0; w < words.length; w++) if (words[w] && n.indexOf(words[w]) < 0) ok = false;
    if (ok) out.push(s);
  }
  return out.sort(function (a, b) { return fold(a.name) < fold(b.name) ? -1 : fold(a.name) > fold(b.name) ? 1 : 0; });
}

export function addChosen(chosen: string[], id: string): string[] {
  if (chosen.indexOf(id) >= 0 || chosen.length >= MAX_SCENES || !SCENE_ID.test(id)) return chosen;
  return chosen.concat([id]);
}

export function removeChosen(chosen: string[], id: string): string[] {
  var i = chosen.indexOf(id), r = chosen.slice(0);
  if (i >= 0) r.splice(i, 1);
  return r;
}

export function moveChosen(chosen: string[], i: number, dir: number): string[] {
  var j = i + dir, r = chosen.slice(0);
  if (i < 0 || j < 0 || i >= r.length || j >= r.length) return r;
  var t = r[i]; r[i] = r[j]; r[j] = t;
  return r;
}

// Scènes choisies, dans l'ordre choisi, celles que Home Assistant ne connaît plus étant omises.
export function resolveChosen(chosen: string[], scenes: Scene[]): Scene[] {
  var out: Scene[] = [];
  for (var i = 0; i < chosen.length; i++) {
    for (var j = 0; j < scenes.length; j++) if (scenes[j].id === chosen[i]) { out.push(scenes[j]); break; }
  }
  return out;
}

// Accueil : rien à afficher (tableau vide, jamais d'erreur) si Home Assistant n'est pas configuré, qu'aucune scène n'est choisie
// ou que la requête échoue ; la rangée n'apparaît alors pas et l'accueil reste intact.
export function quickScenes(http: Http, prefs: { [k: string]: any } | null | undefined, cb: (scenes: Scene[]) => void): void {
  var cfg = haConfigFromPrefs(prefs), chosen = normalizeChosen(prefs && prefs.haScenes);
  if (!cfg || !chosen.length) { cb([]); return; }
  listScenes(http, cfg, function (err, all) { cb(err || !all ? [] : resolveChosen(chosen, all)); });
}

export function saveHaConfig(url: string, token: string, store?: Storage): void {
  var s = loadStored(store);
  s.prefs.haUrl = url;
  s.prefs.haToken = token;
  saveStored(s, store);
}

export function saveHaScenes(ids: string[], store?: Storage): void {
  var s = loadStored(store);
  s.prefs.haScenes = normalizeChosen(ids);
  saveStored(s, store);
}

// Adresse saisie à la télécommande : espaces retirés, « http:// » ajouté sans schéma, pas de « / » final ; vide reste vide.
export function normalizeUrl(v: string): string {
  var u = v.replace(/\s+/g, '');
  if (!u) return '';
  if (!/^https?:\/\//i.test(u)) u = 'http://' + u;
  return u.replace(/\/+$/, '');
}
