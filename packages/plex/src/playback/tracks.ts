import { Stream } from '../api/types';
import { ClientProfile, FRAME_2019_PROFILE, findEntry } from './profile';

export interface TrackPrefs { audioLang?: string; }
export interface Tracks { audio: Stream | null; subtitle: Stream | null; }

export var DEFAULT_AUDIO_LANG = 'fra';

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

// Audio : langue préférée si elle existe, sinon toutes les pistes ; dans le lot, un codec lisible par la TV d'abord.
// Sous-titres : coupés, sauf une piste « forcée » dans la langue de l'audio choisi (traduit les passages étrangers).
// Les indicateurs « default » et « selected » des sous-titres sont ignorés : ils reflètent le fichier ou le dernier choix de l'appareil précédent.
export function chooseTracks(streams: Stream[] | undefined, prefs: TrackPrefs, profile?: ClientProfile): Tracks {
  var p = profile || FRAME_2019_PROFILE;
  var want = normalizeLang(prefs.audioLang || DEFAULT_AUDIO_LANG);
  var audios = ofType(streams, 2), pool: Stream[] = [];
  for (var i = 0; i < audios.length; i++) if (normalizeLang(audios[i].languageCode) === want) pool.push(audios[i]);
  if (!pool.length) pool = audios;
  var audio = best(pool, function (s) { return (findEntry(p.audio, s.codec) ? 2 : 0) + (s.default ? 1 : 0); });

  var lang = audio && audio.languageCode ? normalizeLang(audio.languageCode) : want;
  var forced: Stream[] = [], subs = ofType(streams, 3);
  for (var k = 0; k < subs.length; k++) if (subs[k].forced && normalizeLang(subs[k].languageCode) === lang) forced.push(subs[k]);
  var subtitle = best(forced, function (s) { return findEntry(s.key ? p.subtitles.external : p.subtitles.embedded, s.codec) ? 1 : 0; });
  return { audio: audio, subtitle: subtitle };
}
