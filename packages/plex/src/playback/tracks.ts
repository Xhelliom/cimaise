import { Stream } from '../api/types';
import { ClientProfile, FRAME_2019_PROFILE, findEntry } from './profile';

// Réglages du lecteur (voir tv-core/langprefs) : mode 'vo' (défaut) | 'fr' | 'custom' + listes ordonnées du mode personnalisé.
// audioLang / subLang : choix explicite (série, menu du lecteur) qui prime sur le mode ; subLang '' = coupés (sauf piste forcée).
export interface TrackPrefs { mode?: string; audioList?: string[]; subList?: string[]; audioLang?: string; subLang?: string; }
export interface Tracks { audio: Stream | null; subtitle: Stream | null; }

// Plex renvoie des codes ISO 639-2 à trois lettres ; on accepte aussi les codes à deux lettres et les variantes bibliographiques.
var LANG: { [k: string]: string } = {
  fr: 'fra', fre: 'fra', en: 'eng', es: 'spa', de: 'deu', ger: 'deu', it: 'ita', pt: 'por', ja: 'jpn', ko: 'kor', zh: 'zho', chi: 'zho',
  nl: 'nld', dut: 'nld', ru: 'rus', ar: 'ara'
};
export function normalizeLang(code: string | undefined): string {
  if (!code) return '';
  var c = code.toLowerCase();
  return LANG.hasOwnProperty(c) ? LANG[c] : c;
}

function ofType(streams: Stream[] | undefined, type: number): Stream[] {
  var out: Stream[] = [];
  if (streams) for (var i = 0; i < streams.length; i++) if (streams[i].streamType === type) out.push(streams[i]);
  return out;
}

// Meilleure piste d'un lot : critère le plus fort d'abord (codec lisible, puis indicateur « défaut »), sinon la première.
function best(pool: Stream[], score: (s: Stream) => number): Stream | null {
  var top: Stream | null = null, topScore = -1;
  for (var i = 0; i < pool.length; i++) {
    var sc = score(pool[i]);
    if (sc > topScore) { top = pool[i]; topScore = sc; }
  }
  return top;
}

function inLang(pool: Stream[], lang: string): Stream[] {
  var out: Stream[] = [];
  for (var i = 0; i < pool.length; i++) if (normalizeLang(pool[i].languageCode) === lang) out.push(pool[i]);
  return out;
}

// Version originale : Plex ne donne PAS la langue d'origine d'un média (vérifié sur le serveur : la fiche n'a que « Country »,
// les pistes n'ont que leur langue et « default »). On prend donc la piste audio marquée « default » dans le fichier (celle que le
// muxeur a désignée, presque toujours la VO), à défaut la première piste. Limite : un fichier dont la piste par défaut est un doublage
// (ou sans indicateur, avec le doublage en premier) donne un faux « VO ». '' = langue inconnue.
export function originalLang(streams: Stream[] | undefined): string {
  var audios = ofType(streams, 2), i: number;
  for (i = 0; i < audios.length; i++) if (audios[i].default) return normalizeLang(audios[i].languageCode);
  return audios.length ? normalizeLang(audios[0].languageCode) : '';
}

// Audio : le choix explicite de la série d'abord ; sinon selon le mode — VO ; français s'il existe sinon VO ; première langue de la liste
// personnalisée présente sinon VO. Dans la langue retenue : un codec lisible par la TV d'abord, puis « default ».
// Sous-titres : langues voulues dans l'ordre (choix explicite, sinon mode : VO → français puis anglais, sauf si l'audio est français ;
// français → français si l'audio ne l'est pas ; personnalisé → liste, seulement si l'audio n'est dans aucune langue de la liste audio).
// Pour chaque langue : piste complète (lisible en direct d'abord : SRT avant ASS/PGS/VobSub, sans la version malentendants,
// interne avant externe), puis forcée. Aucune trouvée (ou aucune voulue) : la piste « forcée » de la langue de l'audio, s'il y en a une.
// Les indicateurs « default » et « selected » des sous-titres sont ignorés : ils reflètent le fichier ou le dernier choix de l'appareil précédent.
export function chooseTracks(streams: Stream[] | undefined, prefs: TrackPrefs, profile?: ClientProfile): Tracks {
  var p = profile || FRAME_2019_PROFILE;
  var mode = prefs.mode === 'fr' || prefs.mode === 'custom' ? prefs.mode : 'vo';
  var audios = ofType(streams, 2), vo = originalLang(streams), pool: Stream[] = [], i: number;
  var score = function (s: Stream) { return (findEntry(p.audio, s.codec) ? 2 : 0) + (s.default ? 1 : 0); };
  var wants: string[] = [];
  if (prefs.audioLang) wants = [normalizeLang(prefs.audioLang)];
  else if (mode === 'fr') wants = ['fra'];
  else if (mode === 'custom') for (i = 0; prefs.audioList && i < prefs.audioList.length; i++) wants.push(normalizeLang(prefs.audioList[i]));
  for (i = 0; i < wants.length && !pool.length; i++) pool = inLang(audios, wants[i]);
  if (!pool.length && vo) pool = inLang(audios, vo);
  if (!pool.length) pool = audios;
  var audio = best(pool, score);
  var lang = audio && audio.languageCode ? normalizeLang(audio.languageCode) : vo;

  var subs = ofType(streams, 3);
  function playable(s: Stream): boolean { return !!findEntry(s.key ? p.subtitles.external : p.subtitles.embedded, s.codec); }
  var subScore = function (s: Stream) { return (playable(s) ? 4 : 0) + (s.hearingImpaired ? 0 : 2) + (s.key ? 0 : 1); };

  var subLangs: string[] = [], k: number;
  if (prefs.subLang !== undefined) subLangs = prefs.subLang ? [normalizeLang(prefs.subLang)] : [];
  else if (mode === 'fr') { if (lang !== 'fra') subLangs = ['fra']; }
  else if (mode === 'custom') {
    var understood = false;
    for (k = 0; prefs.audioList && k < prefs.audioList.length; k++) if (lang && normalizeLang(prefs.audioList[k]) === lang) understood = true;
    if (!understood) for (k = 0; prefs.subList && k < prefs.subList.length; k++) subLangs.push(normalizeLang(prefs.subList[k]));
  } else if (lang !== 'fra') subLangs = ['fra', 'eng'];

  var subtitle: Stream | null = null;
  function split(l: string, forcedOnes: boolean): Stream[] {
    var out: Stream[] = [], all = inLang(subs, l);
    for (var n = 0; n < all.length; n++) if (!!all[n].forced === forcedOnes) out.push(all[n]);
    return out;
  }
  for (k = 0; k < subLangs.length && !subtitle; k++) subtitle = best(split(subLangs[k], false), subScore);
  for (k = 0; k < subLangs.length && !subtitle; k++) subtitle = best(split(subLangs[k], true), subScore);
  if (!subtitle && lang) {
    subtitle = best(split(lang, true), function (s) { return playable(s) ? 1 : 0; });
  }
  return { audio: audio, subtitle: subtitle };
}
