import { Callback, Http, Identity, ServerRef } from '../api/types';
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

// Paramètres communs de la décision et du flux HLS. directStream=1 : le transcodeur ne retouche que les pistes qui l'exigent.
function transcodeQuery(id: Identity, server: ServerRef, plan: PlaybackPlan, session: string): string {
  var burn = plan.subtitleMode === 'burned' && plan.subtitle;
  return query([
    ['path', '/library/metadata/' + plan.ratingKey], ['mediaIndex', plan.mediaIndex], ['partIndex', 0],
    ['protocol', 'hls'], ['fastSeek', 1], ['directPlay', 0], ['directStream', 1], ['location', 'lan'],
    ['audioStreamID', plan.audio ? plan.audio.id : 0],
    ['subtitles', burn ? 'burn' : 'none'], ['subtitleStreamID', burn ? plan.subtitle!.id : 0],
    ['session', session],
    ['X-Plex-Client-Identifier', id.clientId], ['X-Plex-Product', id.product], ['X-Plex-Version', id.version],
    ['X-Plex-Platform', id.platform], ['X-Plex-Device', id.device], ['X-Plex-Token', server.token]
  ]);
}

// Demande la décision du transcodeur universel, puis donne l'URL du flux HLS à passer à AVPlay.
// Forme de la réponse (generalDecisionCode) : documentation communautaire, NON vérifiée sur le serveur (la décision crée une session côté serveur,
// interdit pendant la vérification en lecture seule) ; à confirmer à la première lecture transcodée (M4).
export function requestTranscode(http: Http, id: Identity, server: ServerRef, plan: PlaybackPlan, session: string, cb: Callback<{ url: string }>) {
  if (plan.mode !== 'transcode') { cb(new Error('plan de lecture directe : pas de transcodage à demander')); return null; }
  try { assertPlexDirect(server); } catch (e) { cb(e as Error); return null; }
  var q = transcodeQuery(id, server, plan, session);
  return serverGet(http, id, server, '/video/:/transcode/universal/decision?' + q, null, function (err, j) {
    if (err) return cb(err);
    var c = j && j.MediaContainer;
    if (!c || typeof c.generalDecisionCode !== 'number') return cb(new Error('réponse de décision invalide'));
    if (c.generalDecisionCode >= 2000) return cb(new Error('transcodage refusé : ' + (c.generalDecisionText || 'code ' + c.generalDecisionCode)));
    cb(null, { url: server.uri + '/video/:/transcode/universal/start.m3u8?' + q });
  });
}
