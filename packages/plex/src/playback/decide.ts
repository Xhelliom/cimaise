import { Item, Media, Part, Stream } from '../api/types';
import { ClientProfile, FRAME_2019_PROFILE, findEntry } from './profile';
import { chooseTracks, TrackPrefs } from './tracks';

export type ReasonCode = 'multi-part' | 'container' | 'video-codec' | 'video-profile' | 'resolution' | 'hdr' | 'audio-codec' | 'subtitle-format';
export interface Reason { code: ReasonCode; text: string; }
// off : aucun sous-titre ; embedded/external : lus par AVPlay ; burned : incrustés par le transcodeur.
export type SubtitleMode = 'off' | 'embedded' | 'external' | 'burned';

export interface DecideOptions extends TrackPrefs {
  profile?: ClientProfile;
  // Choix explicite de l'utilisateur : identifiant de piste ; subtitleId null = sous-titres coupés. Absent = choix par défaut.
  audioId?: number;
  subtitleId?: number | null;
}

export interface PlaybackPlan {
  ratingKey: string;
  mode: 'direct' | 'transcode';
  reasons: Reason[];
  // Phrase lisible : pourquoi ce mode.
  reason: string;
  mediaIndex: number;
  media: Media;
  part: Part;
  audio: Stream | null;
  subtitle: Stream | null;
  subtitleMode: SubtitleMode;
}

function streamsOf(part: Part, type: number): Stream[] {
  var out: Stream[] = [], all = part.Stream || [];
  for (var i = 0; i < all.length; i++) if (all[i].streamType === type) out.push(all[i]);
  return out;
}
function byId(list: Stream[], id: number | null | undefined): Stream | null {
  for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
  return null;
}

// Transferts « HDR ou large gamme » que la TV pourrait ne pas afficher ; ceux du profil passent.
var WIDE_TRC = ['smpte2084', 'arib-std-b67', 'smpte428'];

function evaluate(item: Item, media: Media, mediaIndex: number, opts: DecideOptions, profile: ClientProfile): PlaybackPlan {
  var part = media.Part![0], reasons: Reason[] = [];
  function add(code: ReasonCode, text: string) { reasons.push({ code: code, text: text }); }

  var tracks = chooseTracks(part.Stream, opts, profile);
  if (opts.audioId !== undefined) tracks.audio = byId(streamsOf(part, 2), opts.audioId) || tracks.audio;
  if (opts.subtitleId === null) tracks.subtitle = null;
  else if (opts.subtitleId !== undefined) tracks.subtitle = byId(streamsOf(part, 3), opts.subtitleId) || tracks.subtitle;
  var audio = tracks.audio, subtitle = tracks.subtitle;

  if (media.Part!.length > 1) add('multi-part', 'fichier en ' + media.Part!.length + ' parties (AVPlay ne les enchaîne pas)');

  var container = (media.container || part.container || '').toLowerCase();
  if (!findEntry(profile.containers, container)) add('container', 'conteneur ' + (container || 'inconnu') + ' non pris en charge');

  var vcodec = media.videoCodec, venc = findEntry(profile.video, vcodec), vs = streamsOf(part, 1)[0];
  if (!venc) add('video-codec', 'codec vidéo ' + (vcodec || 'inconnu') + ' non pris en charge');
  else {
    if (vs && vs.bitDepth && vs.bitDepth > venc.maxBitDepth) add('video-profile', vcodec + ' en ' + vs.bitDepth + ' bits (maximum ' + venc.maxBitDepth + ')');
    if (media.width && media.height && (media.width > venc.maxWidth || media.height > venc.maxHeight)) {
      add('resolution', 'définition ' + media.width + '×' + media.height + ' au-delà de ' + venc.maxWidth + '×' + venc.maxHeight);
    }
    var trc = vs && vs.colorTrc;
    if (vs && vs.DOVIPresent && vs.DOVIProfile !== undefined && profile.unsupportedDolbyVisionProfiles.indexOf(vs.DOVIProfile) >= 0) {
      add('hdr', 'Dolby Vision profil ' + vs.DOVIProfile + ' non pris en charge');
    } else if (trc && WIDE_TRC.indexOf(trc) >= 0 && !findEntry(profile.hdr, trc)) {
      add('hdr', 'HDR ' + trc + ' non pris en charge');
    }
  }

  var acodec = audio ? audio.codec : media.audioCodec;
  if (acodec && !findEntry(profile.audio, acodec)) add('audio-codec', 'audio ' + acodec + ' non pris en charge');

  var supportedSub = false;
  if (subtitle) {
    supportedSub = !!findEntry(subtitle.key ? profile.subtitles.external : profile.subtitles.embedded, subtitle.codec);
    if (!supportedSub) add('subtitle-format', 'sous-titres ' + (subtitle.codec || 'inconnus') + ' : incrustés dans la vidéo par le transcodeur');
  }

  var direct = reasons.length === 0, mode: 'direct' | 'transcode' = direct ? 'direct' : 'transcode';
  var subtitleMode: SubtitleMode = !subtitle ? 'off' : !direct ? 'burned' : subtitle.key ? 'external' : 'embedded';

  var reason: string;
  if (direct) {
    var bits = [container, vcodec];
    if (vs && vs.colorTrc === 'smpte2084') bits.push('HDR10');
    else if (vs && vs.colorTrc === 'arib-std-b67') bits.push('HLG');
    if (acodec) bits.push(acodec);
    if (subtitle) bits.push('sous-titres ' + subtitle.codec + (subtitle.key ? ' externes' : ' internes'));
    reason = 'Lecture directe : ' + bits.join(', ') + ' (supposés lisibles par la TV)';
  } else {
    var texts: string[] = [];
    for (var i = 0; i < reasons.length; i++) texts.push(reasons[i].text);
    // Sous-titres choisis alors que le transcodage a une autre cause : ils sont incrustés aussi.
    if (subtitle && supportedSub) texts.push('sous-titres ' + subtitle.codec + ' incrustés avec le reste');
    reason = 'Transcodage : ' + texts.join(' ; ');
  }
  return { ratingKey: item.ratingKey, mode: mode, reasons: reasons, reason: reason, mediaIndex: mediaIndex, media: media, part: part, audio: audio, subtitle: subtitle, subtitleMode: subtitleMode };
}

// Décide lecture directe ou transcodage à partir de la fiche /library/metadata/{id} (Media/Part/Stream).
// Parmi plusieurs versions, la première lisible en direct l'emporte, sinon celle qui demande le moins de transformations.
export function decidePlayback(item: Item, opts: DecideOptions): PlaybackPlan {
  var profile = opts.profile || FRAME_2019_PROFILE, medias = item.Media || [];
  if (!medias.length) throw new Error('aucun média dans cette fiche');
  var best: PlaybackPlan | null = null;
  for (var i = 0; i < medias.length; i++) {
    if (!medias[i].Part || !medias[i].Part!.length) continue;
    var plan = evaluate(item, medias[i], i, opts, profile);
    if (plan.mode === 'direct') return plan;
    if (!best || plan.reasons.length < best.reasons.length) best = plan;
  }
  if (!best) throw new Error('aucune partie jouable dans cette fiche');
  return best;
}
