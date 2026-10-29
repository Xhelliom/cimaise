// Audit de la bibliothèque Plex : lecture directe ou transcodage pour chaque film et chaque épisode (M4). Hors gate npm :
//   node scripts/plex/audit.mjs [--json]
// Applique packages/plex/src/playback (profil Frame 2019 + decidePlayback) aux fiches complètes du VRAI serveur.
// Lecture seule : le transport refuse tout sauf GET/HEAD, aucune décision de transcodage n'est demandée.
// Sortie anonymisée : comptes et pourcentages uniquement, ni titre, ni chemin, ni jeton, ni IP.
import { call, loadClient, loadEnv, makeRedact, nodeHttp } from './lib.mjs';

process.env.PLEX_ENV_FILE = process.env.PLEX_ENV_FILE || '/home/swetterwald/git/cimaise/.local/plex.env';
const env = loadEnv();
const redact = makeRedact(env);
const api = await loadClient(['plex/src/api/request', 'plex/src/playback/index']);
const ID = { clientId: env.PLEX_CLIENT_ID, product: 'Cimaise', version: '0.0.0', platform: 'Tizen', device: 'Frame' };
const BATCH = 40, PARALLEL = 4;

const get = (ref, path, extra) => call((cb) => api.serverGet(nodeHttp, ID, ref, path, extra || null, cb));

// Compteurs nommés : { clé: nombre }.
const bag = () => Object.create(null);
const inc = (b, k, n = 1) => { b[k] = (b[k] || 0) + n; };

async function listKeys(ref, section, type) {
  const keys = [];
  for (let start = 0; ; start += 500) {
    const [err, j] = await get(ref, '/library/sections/' + section.key + '/all?type=' + type,
      { 'X-Plex-Container-Start': String(start), 'X-Plex-Container-Size': '500' });
    if (err) throw new Error('liste de la section : ' + err.message);
    const c = (j && j.MediaContainer) || {}, list = c.Metadata || [];
    for (const it of list) keys.push(it.ratingKey);
    if (!list.length || keys.length >= (c.totalSize || 0)) return keys;
  }
}

// Fiches complètes (Media/Part/Stream) par lots : /library/metadata/{a,b,c}.
async function fetchItems(ref, keys, onItem) {
  const batches = [];
  for (let i = 0; i < keys.length; i += BATCH) batches.push(keys.slice(i, i + BATCH));
  let next = 0, errors = 0;
  async function worker() {
    while (next < batches.length) {
      const b = batches[next++];
      const [err, j] = await get(ref, '/library/metadata/' + b.join(','));
      if (err) { errors += b.length; continue; }
      for (const it of (j && j.MediaContainer && j.MediaContainer.Metadata) || []) onItem(it);
    }
  }
  await Promise.all(Array.from({ length: PARALLEL }, worker));
  return errors;
}

const SUB_KIND = { srt: 'SRT', subrip: 'SRT', ass: 'ASS/SSA', ssa: 'ASS/SSA', pgs: 'PGS', hdmv_pgs_subtitle: 'PGS', vobsub: 'VobSub', dvd_subtitle: 'VobSub' };
function subKind(s) { return (SUB_KIND[(s.codec || '').toLowerCase()] || 'autre (' + (s.codec || '?') + ')') + (s.key ? ' externe' : ' interne'); }
function hdrKind(vs) {
  if (!vs) return 'sans piste vidéo';
  if (vs.DOVIPresent) return 'Dolby Vision profil ' + vs.DOVIProfile + (vs.colorTrc === 'smpte2084' ? ' (+HDR10)' : '');
  if (vs.colorTrc === 'smpte2084') return 'HDR10';
  if (vs.colorTrc === 'arib-std-b67') return 'HLG';
  return 'SDR';
}
function mbpsBucket(kbps) {
  if (!kbps) return 'inconnu';
  const m = kbps / 1000;
  return m <= 10 ? '≤ 10 Mb/s' : m <= 20 ? '10–20 Mb/s' : m <= 40 ? '20–40 Mb/s' : m <= 80 ? '40–80 Mb/s' : '> 80 Mb/s';
}
function resBucket(m) {
  const w = m.width || 0;
  return w > 1920 ? '4K' : w > 1280 ? '1080p' : w > 720 ? '720p' : w ? 'SD' : 'inconnue';
}

function newStats() {
  return {
    items: 0, noMedia: 0, multiVersion: 0, direct: 0, transcode: 0,
    reasons: bag(), reasonDetail: bag(), soleReason: bag(), combos: bag(),
    container: bag(), vcodec: bag(), vprofile: bag(), h264HighLevel: 0, resolution: bag(), hdr: bag(), bitrate: bag(), bitrateTranscode: bag(),
    audioChosen: bag(), audioAny: bag(), audioLangs: bag(), audioTrackCount: bag(), frAudio: 0, frOnlyUnsupported: 0, chosenNotFr: 0,
    subTracks: bag(), subItems: bag(), subFr: bag(), forced: 0, withFrSubDirect: 0, withFrSubTranscode: 0, withFrSub: 0,
    frSubOnlyMakesTranscode: 0
  };
}

function audit(st, it) {
  st.items++;
  if (!it.Media || !it.Media.length) { st.noMedia++; return; }
  if (it.Media.length > 1) st.multiVersion++;
  let plan;
  try { plan = api.decidePlayback(it, {}); } catch (e) { st.noMedia++; return; }
  const m = plan.media, part = plan.part, streams = part.Stream || [];
  const vs = streams.find((s) => s.streamType === 1);
  const audios = streams.filter((s) => s.streamType === 2), subs = streams.filter((s) => s.streamType === 3);

  st[plan.mode]++;
  if (plan.mode === 'transcode') {
    const codes = Array.from(new Set(plan.reasons.map((r) => r.code)));
    for (const c of codes) inc(st.reasons, c);
    if (codes.length === 1) inc(st.soleReason, codes[0]);
    inc(st.combos, codes.sort().join(' + '));
    for (const r of plan.reasons) {
      const d = r.code === 'container' ? (m.container || part.container || '?')
        : r.code === 'video-codec' ? m.videoCodec || '?'
        : r.code === 'audio-codec' ? (plan.audio && plan.audio.codec) || m.audioCodec || '?'
        : r.code === 'subtitle-format' ? (plan.subtitle && plan.subtitle.codec) || '?'
        : r.code === 'video-profile' ? (m.videoCodec + ' ' + (vs && vs.bitDepth) + ' bits')
        : r.code === 'hdr' ? hdrKind(vs)
        : r.code === 'resolution' ? resBucket(m) : r.code;
      inc(st.reasonDetail, r.code + ' : ' + d);
    }
    inc(st.bitrateTranscode, mbpsBucket(m.bitrate));
  }

  inc(st.container, m.container || part.container || '?');
  inc(st.vcodec, m.videoCodec || '?');
  if (vs) inc(st.vprofile, (m.videoCodec || '?') + ' ' + (vs.profile || '?') + (vs.bitDepth ? ' ' + vs.bitDepth + ' bits' : ''));
  if (vs && m.videoCodec === 'h264' && vs.level > 51) st.h264HighLevel++;
  inc(st.resolution, resBucket(m));
  inc(st.hdr, hdrKind(vs));
  inc(st.bitrate, mbpsBucket(m.bitrate));

  // Audio : piste retenue par chooseTracks, toutes les pistes, langues.
  inc(st.audioChosen, (plan.audio && plan.audio.codec) || m.audioCodec || 'aucune');
  inc(st.audioTrackCount, audios.length >= 3 ? '3 et plus' : String(audios.length));
  const codecsSeen = new Set(), langsSeen = new Set();
  for (const a of audios) { codecsSeen.add(a.codec || '?'); langsSeen.add(api.normalizeLang(a.languageCode) || 'non renseignée'); }
  for (const c of codecsSeen) inc(st.audioAny, c);
  for (const l of langsSeen) inc(st.audioLangs, l);
  const fr = audios.filter((a) => api.normalizeLang(a.languageCode) === 'fra');
  if (fr.length) st.frAudio++;
  if (fr.length && !fr.some((a) => api.findEntry(api.FRAME_2019_PROFILE.audio, a.codec))) st.frOnlyUnsupported++;
  if (plan.audio && api.normalizeLang(plan.audio.languageCode) !== 'fra') st.chosenNotFr++;

  // Sous-titres : pistes par format, présence par fiche, et scénario « j'active les sous-titres français ».
  const kinds = new Set();
  for (const s of subs) { const k = subKind(s); inc(st.subTracks, k); kinds.add(k); if (s.forced) st.forced++; }
  if (!kinds.size) inc(st.subItems, 'aucun sous-titre');
  for (const k of kinds) inc(st.subItems, k);
  const frSubs = subs.filter((s) => api.normalizeLang(s.languageCode) === 'fra' && !s.forced);
  if (frSubs.length) {
    st.withFrSub++;
    const pick = frSubs.find((s) => /^(srt|subrip)$/i.test(s.codec || '')) || frSubs[0];
    inc(st.subFr, subKind(pick));
    const p2 = api.decidePlayback(it, { subtitleId: pick.id });
    if (p2.mode === 'direct') st.withFrSubDirect++;
    else { st.withFrSubTranscode++; if (plan.mode === 'direct') st.frSubOnlyMakesTranscode++; }
  }
}

const pct = (n, d) => (d ? (100 * n / d).toFixed(1).replace('.', ',') + ' %' : '—');
function table(title, b, total, limit = 12) {
  const rows = Object.entries(b).sort((x, y) => y[1] - x[1]);
  console.log('\n' + title);
  for (const [k, n] of rows.slice(0, limit)) console.log('  ' + String(n).padStart(6) + '  ' + pct(n, total).padStart(8) + '  ' + k);
  if (rows.length > limit) console.log('  … ' + (rows.length - limit) + ' autre(s) valeur(s), ' + rows.slice(limit).reduce((s, r) => s + r[1], 0) + ' au total');
}

function report(label, st) {
  const n = st.items - st.noMedia;
  console.log('\n══ ' + label + ' : ' + st.items + ' fiche(s), ' + n + ' avec média' + (st.multiVersion ? ', ' + st.multiVersion + ' à plusieurs versions' : ''));
  console.log('  lecture directe : ' + st.direct + ' (' + pct(st.direct, n) + ')   transcodage : ' + st.transcode + ' (' + pct(st.transcode, n) + ')');
  table('raisons du transcodage (une fiche peut en cumuler ; % des transcodages)', st.reasons, st.transcode);
  table('raison unique (% des transcodages)', st.soleReason, st.transcode);
  table('combinaisons (% des transcodages)', st.combos, st.transcode);
  table('détail des raisons (% des transcodages)', st.reasonDetail, st.transcode, 20);
  table('débit des fiches transcodées', st.bitrateTranscode, st.transcode);
  table('conteneur', st.container, n);
  table('codec vidéo', st.vcodec, n);
  table('profil vidéo', st.vprofile, n);
  console.log('\n  h264 au-delà du niveau 5.1 (hors décision) : ' + st.h264HighLevel);
  table('définition', st.resolution, n);
  table('plage dynamique', st.hdr, n);
  table('débit global (hors décision : le profil ne borne pas le débit)', st.bitrate, n);
  table('codec audio de la piste retenue par défaut', st.audioChosen, n);
  table('codecs audio présents (fiches ayant au moins une piste de ce codec)', st.audioAny, n);
  table('nombre de pistes audio', st.audioTrackCount, n);
  table('langues audio présentes (fiches ayant au moins une piste)', st.audioLangs, n);
  console.log('\n  fiches avec une piste française : ' + st.frAudio + ' (' + pct(st.frAudio, n) + ')');
  console.log('  … dont aucune piste française lisible en direct : ' + st.frOnlyUnsupported + ' (' + pct(st.frOnlyUnsupported, n) + ')');
  console.log('  piste retenue par défaut non française : ' + st.chosenNotFr + ' (' + pct(st.chosenNotFr, n) + ')');
  table('pistes de sous-titres par format (nombre de pistes)', st.subTracks, null);
  table('fiches par format de sous-titres présent', st.subItems, n);
  console.log('\n  pistes forcées : ' + st.forced);
  console.log('  fiches avec sous-titres français (non forcés) : ' + st.withFrSub + ' (' + pct(st.withFrSub, n) + ')');
  table('format du sous-titre français retenu (SRT préféré)', st.subFr, st.withFrSub);
  console.log('\n  sous-titres français activés → direct : ' + st.withFrSubDirect + ' (' + pct(st.withFrSubDirect, st.withFrSub) + '), transcodage : ' +
    st.withFrSubTranscode + ' (' + pct(st.withFrSubTranscode, st.withFrSub) + ')');
  console.log('  … dont fiches en direct sans sous-titres que les sous-titres font transcoder : ' + st.frSubOnlyMakesTranscode);
}

async function main() {
  const [e1, servers] = await call((cb) => api.getServers(nodeHttp, ID, env.PLEX_TOKEN, cb));
  if (e1) throw new Error('getServers : ' + e1.message);
  const server = servers.filter((s) => s.owned)[0] || servers[0];
  const [e2, ref] = await call((cb) => api.chooseConnection(nodeHttp, ID, server, cb));
  if (e2) throw new Error('chooseConnection : ' + e2.message);
  const [e3, sections] = await call((cb) => api.getSections(nodeHttp, ID, ref, cb));
  if (e3) throw new Error('getSections : ' + e3.message);

  const out = {};
  for (const [label, type, plexType] of [['Films', 'movie', 1], ['Épisodes', 'show', 4]]) {
    const st = newStats();
    const secs = sections.filter((s) => s.type === type);
    let errors = 0;
    for (const s of secs) {
      const keys = await listKeys(ref, s, plexType);
      errors += await fetchItems(ref, keys, (it) => audit(st, it));
    }
    out[label] = st;
    report(label + ' (' + secs.length + ' bibliothèque(s))' + (errors ? ' — ' + errors + ' fiche(s) illisible(s)' : ''), st);
  }
  if (process.argv.includes('--json')) console.log('\n' + JSON.stringify(out));
}

try { await main(); } catch (e) { console.error('échec : ' + redact(e.stack || e.message)); process.exit(1); }
