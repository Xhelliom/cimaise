import { loadStored, saveStored } from './storage';

// Langues par défaut du lecteur (Réglages) et mémoire par série. Même clé de stockage que le reste (prefs.*), version inchangée :
// une clé absente ou invalide retombe sur le défaut. Codes ISO 639-2 (ceux de Plex) ; '' = sous-titres coupés.
export interface LangPrefs { audioLang: string; subLang: string; }

export var DEFAULT_AUDIO_LANG = 'fra';
export var DEFAULT_SUB_LANG = '';
export var SERIES_MAX = 200;

export var LANG_CHOICES: Array<{ code: string; label: string }> = [
  { code: 'fra', label: 'Français' }, { code: 'eng', label: 'Anglais' }, { code: 'jpn', label: 'Japonais' },
  { code: 'spa', label: 'Espagnol' }, { code: 'deu', label: 'Allemand' }, { code: 'ita', label: 'Italien' }
];

export function langLabel(code: string): string {
  for (var i = 0; i < LANG_CHOICES.length; i++) if (LANG_CHOICES[i].code === code) return LANG_CHOICES[i].label;
  return code ? code.toUpperCase() : 'Langue inconnue';
}

function str(v: any, dflt: string): string { return typeof v === 'string' ? v : dflt; }

export function loadLangPrefs(store?: Storage): LangPrefs {
  var p = loadStored(store).prefs;
  return { audioLang: str(p.plexAudioLang, DEFAULT_AUDIO_LANG) || DEFAULT_AUDIO_LANG, subLang: str(p.plexSubLang, DEFAULT_SUB_LANG) };
}

export function saveLangPrefs(patch: { audioLang?: string; subLang?: string }, store?: Storage): void {
  var d = loadStored(store);
  if (patch.audioLang !== undefined) d.prefs.plexAudioLang = patch.audioLang;
  if (patch.subLang !== undefined) d.prefs.plexSubLang = patch.subLang;
  saveStored(d, store);
}

// Réglages globaux, surchargés par le choix retenu pour la série (champ par champ).
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
  delete m[seriesKey]; // réinséré en dernier : le plus récent
  m[seriesKey] = next;
  var keys = Object.keys(m);
  for (var i = 0; i < keys.length - SERIES_MAX; i++) delete m[keys[i]];
  d.prefs.plexSeries = m;
  saveStored(d, store);
}
