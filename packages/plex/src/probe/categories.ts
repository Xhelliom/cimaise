import { Item, Media, Stream } from '../api/types';

// Catégories sondées : une fiche réelle par catégorie, choisie dans la bibliothèque (jamais d'ID en dur).
// `match` lit la fiche complète (Media/Part/Stream) ; elle ne dit rien de ce que la TV sait lire : c'est la sonde qui le mesure.
export interface Category { id: string; label: string; audio: boolean; match(f: Facts): boolean; }

export interface Facts {
  container: string; vcodec: string; vprofile: string; width: number;
  video: Stream | null; audio: Stream | null; subs: Stream[];
}

function lower(s: string | undefined): string { return (s || '').toLowerCase(); }

// Piste audio lue par défaut : celle que AVPlay joue sans choix (marquée, sinon la première).
export function factsOf(item: Item): Facts | null {
  var m: Media | undefined = item.Media && item.Media[0];
  var part = m && m.Part && m.Part[0];
  if (!m || !part) return null;
  var all = part.Stream || [], video: Stream | null = null, audio: Stream | null = null, subs: Stream[] = [];
  for (var i = 0; i < all.length; i++) {
    var s = all[i];
    if (s.streamType === 1 && !video) video = s;
    else if (s.streamType === 2 && (!audio || (s.selected || s.default) && !(audio.selected || audio.default))) audio = s;
    else if (s.streamType === 3) subs.push(s);
  }
  return {
    container: lower(m.container || part.container), vcodec: lower(m.videoCodec), vprofile: lower(m.videoProfile),
    width: m.width || (video && video.width) || 0, video: video, audio: audio, subs: subs
  };
}

function audioIs(codecs: string[]): (f: Facts) => boolean {
  return function (f) { return !!f.audio && codecs.indexOf(lower(f.audio.codec)) >= 0; };
}
function bits(f: Facts): number { return (f.video && f.video.bitDepth) || 8; }
function dv(f: Facts, profile: number): boolean { return !!f.video && !!f.video.DOVIPresent && f.video.DOVIProfile === profile; }

export var CATEGORIES: Category[] = [
  { id: 'avi-asp', label: 'AVI MPEG-4 ASP', audio: false, match: function (f) { return f.container === 'avi' && f.vcodec === 'mpeg4'; } },
  { id: 'mkv-h264', label: 'MKV H.264', audio: false, match: function (f) { return f.container === 'mkv' && f.vcodec === 'h264'; } },
  { id: 'h264-l52', label: 'H.264 niveau > 5.1', audio: false, match: function (f) { return f.vcodec === 'h264' && !!f.video && Number(f.video.level) > 51; } },
  { id: 'h264-10b', label: 'H.264 10 bits', audio: false, match: function (f) { return f.vcodec === 'h264' && bits(f) >= 10; } },
  { id: 'hevc-m10-1080', label: 'HEVC Main 10 1080p', audio: false, match: function (f) { return f.vcodec === 'hevc' && bits(f) >= 10 && f.width > 1280 && f.width <= 1920; } },
  { id: 'hevc-4k', label: 'HEVC 4K', audio: false, match: function (f) { return f.vcodec === 'hevc' && f.width > 1920; } },
  { id: 'hdr10', label: 'HDR10', audio: false, match: function (f) { return !!f.video && f.video.colorTrc === 'smpte2084' && !f.video.DOVIPresent; } },
  { id: 'dv8', label: 'Dolby Vision profil 8', audio: false, match: function (f) { return dv(f, 8); } },
  { id: 'dv5', label: 'Dolby Vision profil 5', audio: false, match: function (f) { return dv(f, 5); } },
  { id: 'av1', label: 'AV1', audio: false, match: function (f) { return f.vcodec === 'av1'; } },
  { id: 'ac3', label: 'Audio AC3', audio: true, match: audioIs(['ac3']) },
  { id: 'eac3', label: 'Audio E-AC3', audio: true, match: audioIs(['eac3']) },
  { id: 'dts', label: 'Audio DTS', audio: true, match: audioIs(['dca', 'dts', 'dca-ma']) },
  { id: 'truehd', label: 'Audio TrueHD', audio: true, match: audioIs(['truehd']) },
  { id: 'opus', label: 'Audio Opus', audio: true, match: audioIs(['opus']) },
  { id: 'flac', label: 'Audio FLAC', audio: true, match: audioIs(['flac']) },
  { id: 'mp2', label: 'Audio MP2', audio: true, match: audioIs(['mp2']) },
  { id: 'srt', label: 'SRT interne', audio: true, match: function (f) {
    for (var i = 0; i < f.subs.length; i++) { var c = lower(f.subs[i].codec); if ((c === 'srt' || c === 'subrip') && !f.subs[i].key) return true; }
    return false;
  } }
];

export interface Sample { category: string; ratingKey: string; part: string; container: string; vcodec: string; acodec: string; }

// Une fiche par catégorie. On préfère la fiche qui ne coche que cette catégorie (une panne se rapporte alors à une seule cause),
// puis une fiche pas encore choisie. Les catégories sans fiche restent absentes du résultat.
export function pickSamples(items: Item[]): { [category: string]: Sample } {
  var cands: Array<{ item: Item; f: Facts; cats: string[] }> = [];
  for (var i = 0; i < items.length; i++) {
    var f = factsOf(items[i]);
    if (!f) continue;
    var cats: string[] = [];
    for (var c = 0; c < CATEGORIES.length; c++) if (CATEGORIES[c].match(f)) cats.push(CATEGORIES[c].id);
    if (cats.length) cands.push({ item: items[i], f: f, cats: cats });
  }
  var out: { [category: string]: Sample } = {}, used: { [key: string]: boolean } = {};
  for (var k = 0; k < CATEGORIES.length; k++) {
    var id = CATEGORIES[k].id, best: typeof cands[0] | null = null, bestScore = 1e9;
    for (var j = 0; j < cands.length; j++) {
      if (cands[j].cats.indexOf(id) < 0) continue;
      var score = cands[j].cats.length * 2 + (used[cands[j].item.ratingKey] ? 1 : 0);
      if (score < bestScore) { best = cands[j]; bestScore = score; }
    }
    if (!best) continue;
    used[best.item.ratingKey] = true;
    var part = best.item.Media![0].Part![0];
    out[id] = {
      category: id, ratingKey: best.item.ratingKey, part: part.key, container: best.f.container, vcodec: best.f.vcodec,
      acodec: best.f.audio ? lower(best.f.audio.codec) : ''
    };
  }
  return out;
}
