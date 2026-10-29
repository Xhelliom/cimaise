import { loadStored, saveStored } from './storage';

// Langues du lecteur Plex (Réglages du module Plex) et mémoire par série. Même clé de stockage que le reste (prefs.plexLang,
// prefs.plexSeries) ; une clé absente ou invalide retombe sur le défaut. Codes ISO 639-2 (ceux de Plex).
//   mode 'vo'     : audio en version originale ; sous-titres français (anglais à défaut), aucun si la VO est le français ;
//   mode 'fr'     : audio français s'il existe, sinon VO + sous-titres français ;
//   mode 'custom' : audioList (ordre de préférence) ; subList (ordre de préférence), seulement si l'audio n'est pas dans audioList.
// audioLang / subLang : choix propre à la série (prime sur le mode) ; subLang '' = sous-titres coupés. Absents = suivre le mode.
export type LangMode = 'vo' | 'fr' | 'custom';
export interface LangPrefs { mode: LangMode; audioList: string[]; subList: string[]; audioLang?: string; subLang?: string; }

export var LANG_MODES: LangMode[] = ['vo', 'fr', 'custom'];
export var DEFAULT_MODE: LangMode = 'vo';
export var DEFAULT_AUDIO_LIST = ['fra'];
export var DEFAULT_SUB_LIST = ['fra'];
export var LIST_MAX = 3;
export var SERIES_MAX = 200;

export var LANG_CHOICES: Array<{ code: string; label: string }> = [
  { code: 'fra', label: 'Français' }, { code: 'eng', label: 'Anglais' }, { code: 'jpn', label: 'Japonais' },
  { code: 'spa', label: 'Espagnol' }, { code: 'deu', label: 'Allemand' }, { code: 'ita', label: 'Italien' }
];

export function langLabel(code: string): string {
  for (var i = 0; i < LANG_CHOICES.length; i++) if (LANG_CHOICES[i].code === code) return LANG_CHOICES[i].label;
  return code ? code.toUpperCase() : 'Langue inconnue';
}

function langList(v: any, dflt: string[]): string[] {
  if (!v || typeof v.length !== 'number') return dflt.slice(0);
  var out: string[] = [];
  for (var i = 0; i < v.length && out.length < LIST_MAX; i++) if (typeof v[i] === 'string' && v[i] && out.indexOf(v[i]) < 0) out.push(v[i]);
  return out;
}

export function loadLangPrefs(store?: Storage): LangPrefs {
  var p = loadStored(store).prefs.plexLang;
  if (!p || typeof p !== 'object') p = {};
  var audio = langList(p.audio, DEFAULT_AUDIO_LIST);
  return {
    mode: LANG_MODES.indexOf(p.mode) >= 0 ? p.mode : DEFAULT_MODE,
    audioList: audio.length ? audio : DEFAULT_AUDIO_LIST.slice(0),
    subList: langList(p.subs, DEFAULT_SUB_LIST)
  };
}

export function saveLangPrefs(patch: { mode?: LangMode; audioList?: string[]; subList?: string[] }, store?: Storage): void {
  var d = loadStored(store), cur = loadLangPrefs(store);
  d.prefs.plexLang = {
    mode: patch.mode !== undefined ? patch.mode : cur.mode,
    audio: patch.audioList !== undefined ? patch.audioList : cur.audioList,
    subs: patch.subList !== undefined ? patch.subList : cur.subList
  };
  saveStored(d, store);
}

// Réglages du module, surchargés par le choix retenu pour la série (champ par champ).
export function langPrefsFor(seriesKey: string | undefined, store?: Storage): LangPrefs {
  var base = loadLangPrefs(store);
  var m = seriesKey ? loadStored(store).prefs.plexSeries : null;
  var s = m && typeof m === 'object' ? m[seriesKey as string] : null;
  if (s && typeof s === 'object') {
    if (typeof s.audioLang === 'string' && s.audioLang) base.audioLang = s.audioLang;
    if (typeof s.subLang === 'string') base.subLang = s.subLang;
  }
  return base;
}

// Retient le choix pour la série ; au-delà de SERIES_MAX séries, les plus anciennes sont oubliées.
export function rememberSeries(seriesKey: string, patch: { audioLang?: string; subLang?: string }, store?: Storage): void {
  var d = loadStored(store);
  var m: { [k: string]: any } = d.prefs.plexSeries && typeof d.prefs.plexSeries === 'object' ? d.prefs.plexSeries : {};
  var cur = m[seriesKey] || {}, next: { audioLang?: string; subLang?: string } = {};
  if (cur.audioLang !== undefined) next.audioLang = cur.audioLang;
  if (cur.subLang !== undefined) next.subLang = cur.subLang;
  if (patch.audioLang !== undefined) next.audioLang = patch.audioLang;
  if (patch.subLang !== undefined) next.subLang = patch.subLang;
  m[seriesKey] = next;
  // Ordre de récence explicite (les clés numériques de Plex ne gardent pas l'ordre d'insertion dans un objet) : plus ancien en tête.
  var prev = d.prefs.plexSeriesOrder, order: string[] = [], i: number;
  if (prev && typeof prev.length === 'number') for (i = 0; i < prev.length; i++) if (typeof prev[i] === 'string' && prev[i] !== seriesKey && m[prev[i]]) order.push(prev[i]);
  var known: { [k: string]: boolean } = {};
  for (i = 0; i < order.length; i++) known[order[i]] = true;
  var orphans = Object.keys(m).filter(function (k) { return k !== seriesKey && !known[k]; }); // sans ordre connu : considérées plus anciennes
  order = orphans.concat(order);
  order.push(seriesKey);
  while (order.length > SERIES_MAX) delete m[order.shift() as string];
  d.prefs.plexSeries = m;
  d.prefs.plexSeriesOrder = order;
  saveStored(d, store);
}
