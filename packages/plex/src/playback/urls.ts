import { Callback, Http, Identity, PlexError, ServerRef } from '../api/types';
import { directPlayUrl } from '../api/media';
import { query, serverGet } from '../api/request';
import { PlaybackPlan } from './decide';

// Le jeton passe dans l'URL (AVPlay ne pose pas d'en-tête). L'URI du serveur doit être l'hôte *.plex.direct fourni par plex.tv :
// son certificat est valide, une IP brute échoue en TLS. Le message d'erreur n'affiche jamais l'URI (elle contient l'IP).
var PLEX_DIRECT = /^https:\/\/[^\/@?#]+\.plex\.direct(:\d+)?$/;
export function assertPlexDirect(server: ServerRef): void {
  if (!PLEX_DIRECT.test(server.uri)) throw new Error('l’URI du serveur doit être une adresse *.plex.direct fournie par plex.tv, jamais une IP');
}

export function directPlaybackUrl(server: ServerRef, plan: PlaybackPlan): string {
  if (plan.mode !== 'direct') throw new Error('plan de transcodage : pas d’URL de lecture directe');
  assertPlexDirect(server);
  return directPlayUrl(server, plan.part.key);
}

// URL du sous-titre externe choisi (pour setExternalSubtitlePath) ; null si le sous-titre est interne, absent ou incrusté.
export function subtitleUrl(server: ServerRef, plan: PlaybackPlan): string | null {
  if (plan.subtitleMode !== 'external' || !plan.subtitle || !plan.subtitle.key) return null;
  assertPlexDirect(server);
  return directPlayUrl(server, plan.subtitle.key);
}

// Débit vidéo maximal demandé au transcodeur (kb/s) : large pour un LAN, la Frame 4K décode jusque-là.
export var MAX_VIDEO_BITRATE = 20000;

var sessionCounter = 0;
// Identifiant de session de transcodage : un par lecture (le même sert à décision, flux, relances à un autre offset, arrêt et timeline).
export function newTranscodeSession(id: Identity): string {
  sessionCounter++;
  return 'cimaise-' + id.clientId + '-' + Date.now().toString(36) + sessionCounter.toString(36);
}

// Seul l'audio est transformé : la vidéo est copiée (directStream), le transcodeur ne ré-encode rien d'image.
export function isAudioOnlyTranscode(plan: PlaybackPlan): boolean {
  if (plan.subtitleMode === 'burned' || !plan.reasons.length) return false;
  for (var i = 0; i < plan.reasons.length; i++) if (plan.reasons[i].code !== 'audio-codec') return false;
  return true;
}

// Paramètres communs de la décision et du flux HLS. directStream=1 : le transcodeur ne retouche que les pistes qui l'exigent.
// offset : secondes, la session démarre à cette position (reprise, saut lointain).
function transcodeQuery(id: Identity, server: ServerRef, plan: PlaybackPlan, session: string, offsetMs: number): string {
  var burn = plan.subtitleMode === 'burned' && plan.subtitle;
  var m = plan.media;
  return query([
    ['path', '/library/metadata/' + plan.ratingKey], ['mediaIndex', plan.mediaIndex], ['partIndex', 0],
    ['protocol', 'hls'], ['fastSeek', 1], ['directPlay', 0], ['directStream', 1], ['location', 'lan'],
    ['audioStreamID', plan.audio ? plan.audio.id : 0],
    ['subtitles', burn ? 'burn' : 'none'], ['subtitleStreamID', burn ? plan.subtitle!.id : 0],
    ['maxVideoBitrate', MAX_VIDEO_BITRATE], ['videoResolution', m.width && m.height ? m.width + 'x' + m.height : '1920x1080'],
    ['offset', Math.max(0, Math.floor(offsetMs / 1000))], ['session', session],
    ['X-Plex-Client-Identifier', id.clientId], ['X-Plex-Product', id.product], ['X-Plex-Version', id.version],
    ['X-Plex-Platform', id.platform], ['X-Plex-Device', id.device], ['X-Plex-Token', server.token]
  ]);
}

// Message lisible pour un échec du transcodeur : serveur occupé, refus, autre. Jamais l'adresse du serveur.
function transcodeError(err: PlexError): PlexError {
  var st = err.status, e: PlexError;
  if (st === 503 || st === 429) e = new Error('le serveur Plex est occupé (trop de transcodages en cours), réessayer dans un instant') as PlexError;
  else if (st !== undefined) e = new Error('transcodage impossible sur le serveur Plex (' + err.message + ')') as PlexError;
  else e = new Error('transcodage impossible : ' + err.message) as PlexError;
  if (st !== undefined) e.status = st;
  return e;
}

// Arrête la session de transcodage côté serveur (sortie du lecteur, erreur, relance à un autre offset). L'échec est rendu, jamais bloquant.
export function stopTranscode(http: Http, id: Identity, server: ServerRef, session: string, cb: Callback<null>) {
  try { assertPlexDirect(server); } catch (e) { cb(e as Error); return null; }
  return serverGet(http, id, server, '/video/:/transcode/universal/stop?' + query([['session', session]]), null, function (err) { err ? cb(err) : cb(null, null); });
}

// Demande la décision du transcodeur universel, puis donne l'URL du flux HLS à passer à AVPlay.
// Forme de la réponse (generalDecisionCode) : documentation communautaire, NON vérifiée sur le serveur (la décision crée une session côté serveur,
// interdit pendant la vérification en lecture seule) ; à confirmer à la première lecture transcodée (M4).
export function requestTranscode(http: Http, id: Identity, server: ServerRef, plan: PlaybackPlan, session: string, cb: Callback<{ url: string; audioOnly: boolean }>, offsetMs?: number) {
  if (plan.mode !== 'transcode') { cb(new Error('plan de lecture directe : pas de transcodage à demander')); return null; }
  try { assertPlexDirect(server); } catch (e) { cb(e as Error); return null; }
  var q = transcodeQuery(id, server, plan, session, offsetMs || 0);
  return serverGet(http, id, server, '/video/:/transcode/universal/decision?' + q, null, function (err, j) {
    if (err) return cb(transcodeError(err));
    var c = j && j.MediaContainer;
    if (!c || typeof c.generalDecisionCode !== 'number') return cb(new Error('réponse de décision invalide'));
    if (c.generalDecisionCode >= 2000) return cb(new Error('transcodage refusé par le serveur : ' + (c.generalDecisionText || 'code ' + c.generalDecisionCode)));
    cb(null, { url: server.uri + '/video/:/transcode/universal/start.m3u8?' + q, audioOnly: isAudioOnlyTranscode(plan) });
  });
}
