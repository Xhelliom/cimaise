// Essai ASSUMÉ (écriture serveur : une session de transcodage, arrêtée aussitôt) : une décision `subtitles=sidecar` sur une piste ASS ou mov_text
// donne-t-elle une clé de sous-titre servie en SRT ?   node scripts/plex/probe-sidecar.mjs [ass|mov_text]
// Sortie anonymisée : forme de la piste dans la réponse, statut et forme du corps récupéré ; jamais de texte de sous-titre, de jeton ni d'IP.
import { call, loadClient, loadEnv, makeRedact, nodeHttp } from './lib.mjs';
process.env.PLEX_ENV_FILE = process.env.PLEX_ENV_FILE || '/home/swetterwald/git/cimaise/.local/plex.env';
const env = loadEnv(), redact = makeRedact(env), codec = process.argv[2] || 'ass';
const api = await loadClient(['plex/src/api/request', 'plex/src/playback/index']);
const ID = { clientId: env.PLEX_CLIENT_ID, product: 'Cimaise', version: '0.0.0', platform: 'Tizen', device: 'Frame' };
const [, servers] = await call((cb) => api.getServers(nodeHttp, ID, env.PLEX_TOKEN, cb));
const [, ref] = await call((cb) => api.chooseConnection(nodeHttp, ID, servers.filter((s) => s.owned)[0] || servers[0], cb));
const get = (path, extra) => call((cb) => api.serverGet(nodeHttp, ID, ref, path, extra || null, cb));
const shape = (b) => /^\s*1\s*\r?\n\d\d:\d\d:\d\d,\d{3} --> /.test(b) ? 'SRT' : /^\[Script Info\]/i.test(b) ? 'ASS' : /^WEBVTT/.test(b) ? 'VTT' : 'autre : ' + b.slice(0, 80).replace(/\s+/g, ' ');

// Premier épisode dont la piste ASS/mov_text française (sinon quelconque) serait le seul obstacle à la lecture directe.
let plan = null, pick = null;
const [, secs] = await get('/library/sections');
outer: for (const s of secs.MediaContainer.Directory.filter((d) => d.type === 'show' || d.type === 'movie')) {
  const [, j] = await get('/library/sections/' + s.key + '/all?type=' + (s.type === 'movie' ? 1 : 4), { 'X-Plex-Container-Start': '0', 'X-Plex-Container-Size': '2000' });
  const keys = (j.MediaContainer.Metadata || []).map((m) => m.ratingKey);
  for (let i = 0; i < keys.length; i += 40) {
    const [e, k] = await get('/library/metadata/' + keys.slice(i, i + 40).join(','));
    if (e) continue;
    for (const it of k.MediaContainer.Metadata) {
      if (api.decidePlayback(it, {}).mode !== 'direct') continue;
      const st = ((it.Media[0].Part || [])[0] || {}).Stream || [];
      pick = st.find((x) => x.streamType === 3 && x.codec === codec && !x.key);
      if (pick) { plan = api.decidePlayback(it, { subtitleId: pick.id }); break outer; }
    }
  }
}
if (!plan) throw new Error('aucun épisode ' + codec + ' lisible en direct');
console.log('piste', codec, 'mode du plan', plan.mode, plan.reasons.map((r) => r.code).join(','));
let keyAfter = null;
const session = api.newTranscodeSession(ID);
const q = api.transcodeQuery(ID, ref, plan, session, 0).replace('subtitles=burn', 'subtitles=sidecar');
console.log('subtitles=sidecar dans la requête :', /subtitles=sidecar/.test(q));
const res = await fetch(ref.uri + '/video/:/transcode/universal/decision?' + q, { headers: { Accept: 'application/json' } });
const raw = await res.text();
console.log('décision', res.status);
try {
  const c = JSON.parse(raw).MediaContainer;
  console.log('codes', c.generalDecisionCode, c.generalDecisionText);
  const streams = c.Metadata[0].Media[0].Part[0].Stream.filter((s) => s.streamType === 3);
  console.log('pistes sous-titres dans la réponse :', streams.length, '; toutes pistes :', c.Metadata[0].Media[0].Part[0].Stream.map((s) => s.streamType + ':' + s.codec).join(' '));
  for (const s of streams) console.log('piste de la réponse', JSON.stringify({ codec: s.codec, format: s.format, key: s.key ? s.key.replace(/\d+/g, 'N').replace(/session\/[^/]+/, 'session/S') : null, selected: s.selected, decision: s.decision, location: s.location }));
  const sel = streams.find((s) => s.key && (s.id === pick.id || s.selected));
  if (sel) {
    const r = await fetch(ref.uri + sel.key + (sel.key.includes('?') ? '&' : '?') + 'X-Plex-Token=' + ref.token);
    const b = await r.text();
    console.log('corps de la clé :', r.status, b.length, 'o,', shape(b), '; id identique à la piste source :', sel.id === pick.id);
    keyAfter = ref.uri + sel.key + (sel.key.includes('?') ? '&' : '?') + 'X-Plex-Token=' + ref.token;
  }
} catch (e) { console.log(redact(raw).slice(0, 400)); }
const [es] = await call((cb) => api.stopTranscode(nodeHttp, ID, ref, session, cb));
console.log('stopTranscode ->', es ? 'ERREUR ' + redact(es.message) : 'ok');
if (keyAfter) { await new Promise((r) => setTimeout(r, 3000)); const r = await fetch(keyAfter); const b = await r.text(); console.log('corps de la clé après l’arrêt :', r.status, b.length, 'o,', shape(b)); }
