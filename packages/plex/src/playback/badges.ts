import { Item, Stream } from '../api/types';
import { decidePlayback, DecideOptions } from './decide';
import { normalizeLang } from './tracks';

// Pastilles techniques de la fiche, en texte seul : définition, HDR, canaux de la piste audio que lira le lecteur, langues audio,
// langues de sous-titres, puis « Lecture directe » ou « Transcodé ». La version et la piste audio sont celles que retient
// decidePlayback avec les mêmes réglages que le lecteur : la dernière pastille dit donc ce que fera Lire.
// Rien sans pistes (série, liste sans Stream) : la fiche ne devine pas.
export interface Badges { labels: string[]; mode: 'direct' | 'transcode'; }

// Code ISO 639-2 → libellé court ; les autres langues gardent leur code en majuscules.
var SHORT: { [k: string]: string } = {
  fra: 'FR', eng: 'EN', spa: 'ES', deu: 'DE', ita: 'IT', por: 'PT', jpn: 'JA', kor: 'KO', zho: 'ZH', nld: 'NL', rus: 'RU', ara: 'AR',
  bul: 'BG', ces: 'CS', cze: 'CS', dan: 'DA', ell: 'EL', gre: 'EL', fin: 'FI', heb: 'HE', hin: 'HI', hun: 'HU', isl: 'IS', ice: 'IS',
  nor: 'NO', pol: 'PL', ron: 'RO', rum: 'RO', srp: 'SR', swe: 'SV', tha: 'TH', tur: 'TR', ukr: 'UK'
};
var MAX_LANGS = 3;

function resolution(w: number, h: number): string {
  if (w >= 3200 || h >= 1800) return '4K';
  if (w >= 1700 || h >= 1000) return '1080p';
  if (w >= 1200 || h >= 700) return '720p';
  return w || h ? 'SD' : '';
}

function channels(n: number | undefined): string {
  if (!n) return '';
  return n === 1 ? 'Mono' : n === 2 ? 'Stéréo' : n >= 3 ? (n - 1) + '.1' : '';
}

// Langues distinctes d'un type de piste, dans l'ordre du fichier ; au-delà de MAX_LANGS : « +N ».
function langs(streams: Stream[], type: number): string {
  var out: string[] = [], i: number;
  for (i = 0; i < streams.length; i++) {
    if (streams[i].streamType !== type) continue;
    var c = normalizeLang(streams[i].languageCode);
    var l = c ? (SHORT.hasOwnProperty(c) ? SHORT[c] : c.toUpperCase()) : '';
    if (l && out.indexOf(l) < 0) out.push(l);
  }
  var more = out.length - MAX_LANGS;
  return out.slice(0, MAX_LANGS).join(' · ') + (more > 0 ? ' +' + more : '');
}

export function techBadges(item: Item, opts: DecideOptions): Badges | null {
  var plan;
  try { plan = decidePlayback(item, opts); } catch (e) { return null; }
  var streams = plan.part.Stream || [];
  if (!streams.length) return null;
  var v: Stream | null = null, out: string[] = [], i: number;
  for (i = 0; i < streams.length && !v; i++) if (streams[i].streamType === 1) v = streams[i];
  var res = resolution(plan.media.width || (v && v.width) || 0, plan.media.height || (v && v.height) || 0);
  if (res) out.push(res);
  if (v && v.DOVIPresent) out.push('Dolby Vision');
  else if (v && v.colorTrc === 'smpte2084') out.push('HDR10');
  else if (v && v.colorTrc === 'arib-std-b67') out.push('HLG');
  var ch = channels(plan.audio ? plan.audio.channels : plan.media.audioChannels);
  if (ch) out.push(ch);
  var a = langs(streams, 2);
  if (a) out.push('Audio ' + a);
  var s = langs(streams, 3);
  if (s) out.push('Sous-titres ' + s);
  out.push(plan.mode === 'direct' ? 'Lecture directe' : 'Transcodé');
  return { labels: out, mode: plan.mode };
}
