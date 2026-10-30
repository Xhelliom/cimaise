// Surveille côté serveur les sessions de transcodage et de lecture pendant un essai sur la TV (lecture seule, GET).
//   node scripts/plex/watch-transcode.mjs [secondes=900] [pas=2]
// Une ligne à chaque changement : décisions vidéo/audio, progression, état et position (viewOffset) de la lecture. Ni jeton ni IP.
import { call, loadClient, loadEnv, makeRedact, nodeHttp } from './lib.mjs';

process.env.PLEX_ENV_FILE = process.env.PLEX_ENV_FILE || '/home/swetterwald/git/cimaise/.local/plex.env';
const env = loadEnv();
const redact = makeRedact(env);
const api = await loadClient(['plex/src/api/request']);
const ID = { clientId: env.PLEX_CLIENT_ID, product: 'Cimaise', version: '0.0.0', platform: 'Tizen', device: 'Frame' };
const [e1, servers] = await call((cb) => api.getServers(nodeHttp, ID, env.PLEX_TOKEN, cb));
if (e1) throw new Error(redact(e1.message));
const [e2, ref] = await call((cb) => api.chooseConnection(nodeHttp, ID, servers.filter((s) => s.owned)[0] || servers[0], cb));
if (e2) throw new Error(redact(e2.message));
const get = (p) => call((cb) => api.serverGet(nodeHttp, ID, ref, p, null, cb));
const total = Number(process.argv[2] || 900), step = Number(process.argv[3] || 2);
let last = '';
const t0 = Date.now();
for (let t = 0; t <= total; t += step) {
  const [, ts] = await get('/transcode/sessions');
  const [, st] = await get('/status/sessions');
  const T = ((ts && ts.MediaContainer.TranscodeSession) || []).map((x) => ['T', x.videoDecision, x.audioDecision, x.audioCodec, 'prog=' + (x.progress || 0).toFixed(1), 'min=' + x.minOffsetAvailable, 'max=' + x.maxOffsetAvailable].join(' '));
  const S = ((st && st.MediaContainer.Metadata) || []).map((m) => ['S', m.ratingKey, m.Player && m.Player.state, 'viewOffset=' + m.viewOffset, m.TranscodeSession ? 'ts=' + m.TranscodeSession.videoDecision + '/' + m.TranscodeSession.audioDecision : 'direct'].join(' '));
  const line = redact(T.concat(S).join(' | ') || '(aucune session)');
  if (line.replace(/prog=[\d.]+|min=\S+|max=\S+/g, '') !== last.replace(/prog=[\d.]+|min=\S+|max=\S+/g, '') || t % 20 === 0) console.log(String(Math.round((Date.now() - t0) / 1000)).padStart(4) + 's', line);
  last = line;
  await new Promise((r) => setTimeout(r, step * 1000));
}
