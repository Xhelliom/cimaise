// Capture la VRAIE réponse de décision du transcodeur universel pour un film DTS (écriture serveur assumée : une session, arrêtée aussitôt).
//   node scripts/plex/capture-transcode.mjs
// Sortie : forme de la réponse de décision, décision vidéo/audio de la session, liste de lecture ; ni jeton ni IP.
// Hors gate npm. Les fixtures tests/fixtures/plex/transcode-decision.json en sont tirées (à la main, anonymisées).
import { call, loadClient, loadEnv, makeRedact, nodeHttp } from './lib.mjs';

process.env.PLEX_ENV_FILE = process.env.PLEX_ENV_FILE || '/home/swetterwald/git/cimaise/.local/plex.env';
const env = loadEnv();
const redact = makeRedact(env);
const api = await loadClient(['plex/src/api/request', 'plex/src/playback/index']);
const ID = { clientId: env.PLEX_CLIENT_ID, product: 'Cimaise', version: '0.0.0', platform: 'Tizen', device: 'Frame' };
const [eS, servers] = await call((cb) => api.getServers(nodeHttp, ID, env.PLEX_TOKEN, cb));
if (eS) throw new Error(redact(eS.message));
const server = servers.filter((s) => s.owned)[0] || servers[0];
const [eC, ref] = await call((cb) => api.chooseConnection(nodeHttp, ID, server, cb));
if (eC) throw new Error(redact(eC.message));
const get = (path, extra) => call((cb) => api.serverGet(nodeHttp, ID, ref, path, extra || null, cb));

const [e1, secs] = await get('/library/sections');
if (e1) throw new Error(redact(e1.message));
const movies = secs.MediaContainer.Directory.filter((d) => d.type === 'movie');
let plan = null;
for (const s of movies) {
  const [e2, j] = await get('/library/sections/' + s.key + '/all?type=1', { 'X-Plex-Container-Start': '0', 'X-Plex-Container-Size': '300' });
  if (e2) continue;
  const keys = (j.MediaContainer.Metadata || []).map((m) => m.ratingKey);
  for (let i = 0; i < keys.length && !plan; i += 40) {
    const [e3, k] = await get('/library/metadata/' + keys.slice(i, i + 40).join(','));
    if (e3) continue;
    for (const it of k.MediaContainer.Metadata) {
      const p = api.decidePlayback(it, {});
      if (p.mode === 'transcode' && api.isAudioOnlyTranscode(p) && p.audio && /^(dca|dts)/i.test(p.audio.codec)) { plan = p; break; }
    }
  }
  if (plan) break;
}
if (!plan) throw new Error('aucun film DTS trouvé');
console.log('plan: audio', plan.audio.codec, 'conteneur', plan.media.container, 'vidéo', plan.media.videoCodec, 'débit', plan.media.bitrate);

const session = api.newTranscodeSession(ID);
const dUrl = ref.uri + '/video/:/transcode/universal/decision?' + api.transcodeQuery(ID, ref, plan, session, 0);
const shape = (v, d = 0) => v === null ? 'null' : Array.isArray(v) ? '[' + (v.length ? shape(v[0], d + 1) : '') + ']' : typeof v === 'object' ? '{' + Object.keys(v).map((k) => k + ':' + (d < 4 ? shape(v[k], d + 1) : typeof v[k])).join(',') + '}' : typeof v === 'string' ? JSON.stringify(v.length > 40 ? 'str' : v) : String(v);
const res = await fetch(dUrl, { headers: { Accept: 'application/json' } });
const raw = await res.text();
console.log('decision status', res.status, res.headers.get('content-type'));
try { console.log('decision shape:', redact(shape(JSON.parse(raw)))); console.log(redact(raw).slice(0, 1500)); } catch (e) { console.log(redact(raw).slice(0, 600)); }
if (res.ok) {
  const m3u = await fetch(dUrl.replace('decision', 'start.m3u8'), { headers: { Accept: '*/*' } });
  const body = await m3u.text();
  const md = JSON.parse(raw).MediaContainer.Metadata[0], med = md.Media[0], part = med.Part[0];
  const variant = body.split('\n').filter((l) => l && l[0] !== '#')[0];
  const sub = await (await fetch(dUrl.split('/video/')[0] + '/video/:/transcode/universal/' + variant + '?X-Plex-Token=' + ref.token)).text();
  console.log('VARIANT', redact(sub.split('\n').slice(0, 10).join('\n')));
  console.log('MEDIA', JSON.stringify({ keys: Object.keys(med), container: med.container, videoCodec: med.videoCodec, audioCodec: med.audioCodec, audioChannels: med.audioChannels, selected: med.selected, partKeys: Object.keys(part), decision: part.decision, pcontainer: part.container, streams: part.Stream.filter((x) => x.selected || x.streamType < 3).map((x) => ({ t: x.streamType, codec: x.codec, decision: x.decision, location: x.location, ch: x.channels, sel: x.selected })) }));
  console.log('start.m3u8 status', m3u.status, 'type', m3u.headers.get('content-type'));
  console.log(redact(body.split('\n').slice(0, 14).join('\n')));
}
if (res.ok) {
  await new Promise((r) => setTimeout(r, 4000));
  const ts = await (await fetch(ref.uri + '/transcode/sessions?X-Plex-Token=' + ref.token, { headers: { Accept: 'application/json' } })).json();
  console.log('SESSIONS', JSON.stringify((ts.MediaContainer.TranscodeSession || []).filter((x) => x.key.indexOf(session) >= 0).map((x) => ({ videoDecision: x.videoDecision, audioDecision: x.audioDecision, audioCodec: x.audioCodec, videoCodec: x.videoCodec, container: x.container, protocol: x.protocol, speed: x.speed, throttled: x.throttled, complete: x.complete, progress: x.progress, context: x.context, transcodeHwRequested: x.transcodeHwRequested, keys: Object.keys(x) }))));
}
const [es] = await call((cb) => api.stopTranscode(nodeHttp, ID, ref, session, cb));
console.log('stopTranscode ->', es ? 'ERREUR ' + redact(es.message) : 'ok');
