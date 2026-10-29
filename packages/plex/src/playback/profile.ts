// Profil client de la Frame 2019 (LS03R, Tizen 5.0) pour la décision lecture directe / transcodage (HANDOFF §5.3).
// Noms de codecs et de conteneurs : ceux que Plex renvoie dans /library/metadata/{id}.
// Source : documentation Samsung des TV 2019 (formats vidéo/audio/sous-titres), lue, jamais vérifiée sur la TV.
// RIEN n'est confirmé : passer `confirmed` à true seulement après un test de lecture réel (M3/M4), en notant la date dans docs/tv-status.md.
export interface Entry { name: string; confirmed: boolean; note?: string; }
export interface VideoEntry extends Entry { maxWidth: number; maxHeight: number; maxBitDepth: number; }
export interface ClientProfile {
  model: string;
  containers: Entry[];
  video: VideoEntry[];
  // Fonctions de transfert acceptées telles quelles (colorTrc de Plex) ; le reste du HDR passe par le transcodeur.
  hdr: Entry[];
  audio: Entry[];
  subtitles: { embedded: Entry[]; external: Entry[] };
  // Profils Dolby Vision sans base HDR10 que la TV ne sait pas afficher.
  unsupportedDolbyVisionProfiles: number[];
}

var A = 'supposé, à confirmer sur la TV';

function e(name: string, note?: string): Entry {
  return note ? { name: name, confirmed: false, note: note } : { name: name, confirmed: false };
}
function v(name: string, maxWidth: number, maxHeight: number, maxBitDepth: number, note: string): VideoEntry {
  return { name: name, confirmed: false, note: note, maxWidth: maxWidth, maxHeight: maxHeight, maxBitDepth: maxBitDepth };
}

export var FRAME_2019_PROFILE: ClientProfile = {
  model: 'Samsung The Frame 2019 (LS03R), Tizen 5.0',
  containers: [
    e('mkv', 'Matroska : doc Samsung 2019'),
    e('mp4', 'MP4 : doc Samsung 2019'),
    e('mpegts', 'MPEG-TS : doc Samsung 2019')
  ],
  video: [
    v('h264', 4096, 2304, 8, 'High L5.1 ; pas de Hi10P (10 bits non listé en H.264)'),
    v('hevc', 4096, 2304, 10, 'Main et Main 10, jusqu’à 4K')
  ],
  hdr: [
    e('smpte2084', 'HDR10'),
    e('arib-std-b67', 'HLG')
  ],
  audio: [
    e('aac'), e('ac3'), e('eac3'), e('mp3'),
    // Volontairement absents : dca (DTS, retiré des TV Samsung depuis 2018), truehd, flac, opus → transcodage de l’audio.
  ],
  subtitles: {
    embedded: [e('srt', 'piste interne, sélectionnée par setSelectTrack')],
    external: [e('srt', 'fichier externe, chargé par setExternalSubtitlePath')]
  },
  unsupportedDolbyVisionProfiles: [5]
};

export function confirmationLabel(entry: Entry): string {
  return entry.confirmed ? 'confirmé sur la TV' : A;
}

export function findEntry<T extends Entry>(list: T[], name: string | undefined): T | null {
  if (!name) return null;
  for (var i = 0; i < list.length; i++) if (list[i].name === name) return list[i];
  return null;
}
