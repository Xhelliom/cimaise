import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';

let pb;
before(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'plexplayback-'));
  const es5Dir = join(dir, 'es5');
  const t = spawnSync('node_modules/.bin/tsc', ['-p', 'packages/plex/tsconfig.json', '--outDir', es5Dir], { encoding: 'utf8' });
  assert.equal(t.status, 0, t.stdout + t.stderr);
  const out = join(dir, 'playback.cjs');
  await build({ entryPoints: [join(es5Dir, 'plex/src/playback/index.js')], bundle: true, format: 'cjs', target: 'es5', outfile: out, logLevel: 'warning' });
  pb = createRequire(import.meta.url)(out);
});

// Fixtures : fiches RÉELLES (Media/Part/Stream) anonymisées par scripts/plex/capture-media-fixtures.mjs.
const samples = JSON.parse(readFileSync('tests/fixtures/plex/media-samples.json', 'utf8'));
const item = (name) => {
  const s = samples.find((x) => x.name === name);
  assert.ok(s, 'fixture absente : ' + name);
  return JSON.parse(JSON.stringify(s.MediaContainer.Metadata[0]));
};
const codes = (plan) => plan.reasons.map((r) => r.code);
const ID = { clientId: 'test-client-uuid', product: 'Cimaise', version: '0.0.0', platform: 'Tizen', device: 'Frame' };
const SERVER = { uri: 'https://192-0-2-10.' + '0'.repeat(32) + '.plex.direct:32400', token: 'FAKE-SERVER-TOKEN' };

// --- Profil ---------------------------------------------------------------------------------------------------

test('profil : chaque entrée est marquée supposée (rien n’est confirmé sans test sur la TV)', () => {
  const P = pb.FRAME_2019_PROFILE;
  assert.match(P.model, /LS03R/);
  const all = [].concat(P.containers, P.video, P.hdr, P.audio, P.subtitles.embedded, P.subtitles.external);
  assert.ok(all.length >= 10);
  for (const e of all) {
    assert.equal(typeof e.name, 'string');
    assert.equal(e.confirmed, false, e.name + ' ne doit pas être confirmé');
    assert.match(pb.confirmationLabel(e), /supposé, à confirmer sur la TV/);
  }
  assert.equal(pb.confirmationLabel({ name: 'x', confirmed: true }), 'confirmé sur la TV');
});

test('profil : couvre MKV/MP4/TS, H.264/HEVC, HDR10, AAC/AC3/E-AC3/MP3, SRT ; pas DTS ni TrueHD ni AV1', () => {
  const P = pb.FRAME_2019_PROFILE;
  const names = (l) => l.map((e) => e.name);
  for (const c of ['mkv', 'mp4', 'mpegts']) assert.ok(names(P.containers).indexOf(c) >= 0, c);
  for (const c of ['h264', 'hevc']) assert.ok(names(P.video).indexOf(c) >= 0, c);
  assert.ok(names(P.hdr).indexOf('smpte2084') >= 0);
  for (const c of ['aac', 'ac3', 'eac3', 'mp3']) assert.ok(names(P.audio).indexOf(c) >= 0, c);
  for (const c of ['dca', 'truehd', 'opus', 'flac']) assert.equal(names(P.audio).indexOf(c), -1, c);
  assert.equal(names(P.video).indexOf('av1'), -1);
  assert.deepEqual(names(P.subtitles.embedded), ['srt']);
  assert.deepEqual(names(P.subtitles.external), ['srt']);
  const hevc = P.video.find((e) => e.name === 'hevc'), h264 = P.video.find((e) => e.name === 'h264');
  assert.equal(hevc.maxBitDepth, 10);
  assert.equal(h264.maxBitDepth, 8);
  assert.ok(hevc.maxWidth >= 3840 && hevc.maxHeight >= 2160);
});

// --- Pistes par défaut ----------------------------------------------------------------------------------------

test('pistes : audio de la langue préférée (fra) même si la piste par défaut est autre', () => {
  const it = item('mkv-h264-ac3-srt-externe'); // audio fra (défaut) + eng
  const streams = it.Media[0].Part[0].Stream;
  const eng = streams.filter((s) => s.streamType === 2 && s.languageCode === 'eng')[0];
  const t = pb.chooseTracks(streams, { audioLang: 'eng' });
  assert.equal(t.audio.id, eng.id);
  assert.equal(pb.chooseTracks(streams, {}).audio.languageCode, 'fra', 'langue préférée par défaut : fra');
  assert.equal(pb.chooseTracks(streams, { audioLang: 'fr' }).audio.languageCode, 'fra', 'code à 2 lettres accepté');
});

test('pistes : langue préférée absente → piste par défaut du fichier', () => {
  const streams = item('mkv-h264-dts').Media[0].Part[0].Stream; // une seule piste audio, eng
  assert.equal(pb.chooseTracks(streams, { audioLang: 'jpn' }).audio.languageCode, 'eng');
});

test('pistes : dans la langue préférée, préfère un codec que la TV lit', () => {
  const streams = item('mkv-h264-ac3-vobsub').Media[0].Part[0].Stream; // ac3/eng puis aac/fra
  const aac = streams.filter((s) => s.codec === 'aac')[0];
  assert.equal(pb.chooseTracks(streams, { audioLang: 'fra' }).audio.id, aac.id);
  const dtsLike = [{ id: 1, streamType: 2, codec: 'dca', languageCode: 'fra' }, { id: 2, streamType: 2, codec: 'ac3', languageCode: 'fra' }];
  assert.equal(pb.chooseTracks(dtsLike, {}).audio.id, 2);
});

test('pistes : sous-titres coupés par défaut (même si une piste est « défaut » ou « sélectionnée »)', () => {
  const streams = item('mkv-h264-ac3-srt-externe').Media[0].Part[0].Stream;
  assert.equal(pb.chooseTracks(streams, {}).subtitle, null);
  const mp4 = item('mp4-h264-aac').Media[0].Part[0].Stream; // srt externe marquée selected par le serveur
  assert.ok(mp4.some((s) => s.streamType === 3 && s.selected));
  assert.equal(pb.chooseTracks(mp4, {}).subtitle, null);
});

test('pistes : sous-titres forcés activés quand leur langue est celle de l’audio choisi', () => {
  const t = pb.chooseTracks(item('mkv-h264-ac3-srt-force').Media[0].Part[0].Stream, {});
  assert.equal(t.audio.languageCode, 'fra');
  assert.equal(t.subtitle.forced, true);
  assert.equal(t.subtitle.languageCode, 'fra');
  const hdr = pb.chooseTracks(item('mkv-hevc-hdr10').Media[0].Part[0].Stream, {});
  assert.equal(hdr.subtitle.forced, true);
});

test('pistes : forcés d’une autre langue que l’audio ignorés ; forcé srt préféré à un forcé image', () => {
  const streams = [
    { id: 1, streamType: 2, codec: 'ac3', languageCode: 'fra' },
    { id: 2, streamType: 3, codec: 'srt', languageCode: 'eng', forced: true },
  ];
  assert.equal(pb.chooseTracks(streams, {}).subtitle, null);
  streams.push({ id: 3, streamType: 3, codec: 'pgs', languageCode: 'fra', forced: true }, { id: 4, streamType: 3, codec: 'srt', languageCode: 'fra', forced: true });
  assert.equal(pb.chooseTracks(streams, {}).subtitle.id, 4);
  streams.pop();
  assert.equal(pb.chooseTracks(streams, {}).subtitle.id, 3);
});

test('pistes : fichier sans audio ni sous-titres', () => {
  const t = pb.chooseTracks([{ id: 1, streamType: 1, codec: 'h264' }], {});
  assert.equal(t.audio, null);
  assert.equal(t.subtitle, null);
  assert.deepEqual(pb.chooseTracks(undefined, {}), { audio: null, subtitle: null });
});

// --- Décision : lecture directe -------------------------------------------------------------------------------

test('décision : MP4 H.264/AAC → lecture directe, raison expliquée', () => {
  const plan = pb.decidePlayback(item('mp4-h264-aac'), {});
  assert.equal(plan.mode, 'direct');
  assert.deepEqual(plan.reasons, []);
  assert.match(plan.reason, /^Lecture directe/);
  assert.match(plan.reason, /mp4/);
  assert.match(plan.reason, /h264/);
  assert.match(plan.reason, /aac/);
  assert.equal(plan.subtitleMode, 'off');
  assert.equal(plan.audio.codec, 'aac');
});

test('décision : MKV HEVC E-AC3 avec SRT interne et externe → direct, SRT choisi à la demande', () => {
  const it = item('mkv-hevc-eac3-srt-interne-et-externe');
  const streams = it.Media[0].Part[0].Stream;
  const emb = streams.filter((s) => s.codec === 'srt' && !s.key && s.languageCode === 'spa')[0];
  const ext = streams.filter((s) => s.codec === 'srt' && s.key)[0];
  assert.equal(pb.decidePlayback(it, { audioLang: 'eng' }).mode, 'direct');
  const a = pb.decidePlayback(it, { audioLang: 'eng', subtitleId: emb.id });
  assert.equal(a.mode, 'direct');
  assert.equal(a.subtitleMode, 'embedded');
  assert.equal(a.subtitle.id, emb.id);
  const b = pb.decidePlayback(it, { audioLang: 'eng', subtitleId: ext.id });
  assert.equal(b.mode, 'direct');
  assert.equal(b.subtitleMode, 'external');
});

test('décision : HEVC HDR10 (smpte2084) en MKV → direct, HDR10 cité dans la raison', () => {
  const plan = pb.decidePlayback(item('mkv-hevc-hdr10'), {});
  assert.equal(plan.mode, 'direct');
  assert.match(plan.reason, /HDR10/);
  assert.equal(plan.subtitleMode, 'embedded', 'sous-titre forcé fra (srt interne)');
});

test('décision : SRT externe + audio AC3 → direct', () => {
  const it = item('mkv-h264-ac3-srt-externe');
  const ext = it.Media[0].Part[0].Stream.filter((s) => s.key)[0];
  const plan = pb.decidePlayback(it, { subtitleId: ext.id });
  assert.equal(plan.mode, 'direct');
  assert.equal(plan.subtitleMode, 'external');
});

test('décision : sous-titres explicitement coupés (subtitleId null) malgré un forcé', () => {
  const plan = pb.decidePlayback(item('mkv-h264-ac3-srt-force'), { subtitleId: null });
  assert.equal(plan.subtitle, null);
  assert.equal(plan.subtitleMode, 'off');
});

// --- Décision : transcodage -----------------------------------------------------------------------------------

test('décision : audio DTS → transcodage, raison audio-codec', () => {
  const plan = pb.decidePlayback(item('mkv-h264-dts'), {});
  assert.equal(plan.mode, 'transcode');
  assert.deepEqual(codes(plan), ['audio-codec']);
  assert.match(plan.reason, /^Transcodage/);
  assert.match(plan.reason, /dca/);
});

test('décision : TrueHD imposé → transcodage audio ; par défaut la piste AC3 anglaise (lisible) est préférée', () => {
  const it = item('mkv-h264-truehd-pgs');
  const streams = it.Media[0].Part[0].Stream;
  const truehd = streams.filter((s) => s.codec === 'truehd')[0], ac3 = streams.filter((s) => s.codec === 'ac3')[0];
  const forced = pb.decidePlayback(it, { audioId: truehd.id });
  assert.equal(forced.mode, 'transcode');
  assert.deepEqual(codes(forced), ['audio-codec']);
  const dflt = pb.decidePlayback(it, {});
  assert.equal(dflt.mode, 'direct');
  assert.equal(dflt.audio.id, ac3.id);
});

test('décision : PGS demandé → transcodage avec sous-titres incrustés', () => {
  const it = item('mkv-h264-ac3-pgs');
  const pgs = it.Media[0].Part[0].Stream.filter((s) => s.codec === 'pgs')[0];
  assert.equal(pb.decidePlayback(it, {}).mode, 'direct', 'PGS présent mais non choisi : lecture directe');
  const plan = pb.decidePlayback(it, { subtitleId: pgs.id });
  assert.equal(plan.mode, 'transcode');
  assert.deepEqual(codes(plan), ['subtitle-format']);
  assert.equal(plan.subtitleMode, 'burned');
  assert.match(plan.reason, /pgs/);
  assert.match(plan.reason, /incrust/);
});

test('décision : ASS et VobSub demandés → transcodage avec incrustation', () => {
  const ass = item('mkv-h264-ac3-ass');
  const a = pb.decidePlayback(ass, { subtitleId: ass.Media[0].Part[0].Stream.filter((s) => s.codec === 'ass')[0].id });
  assert.equal(a.mode, 'transcode');
  assert.equal(a.subtitleMode, 'burned');
  const vob = item('mkv-h264-ac3-vobsub');
  const b = pb.decidePlayback(vob, { subtitleId: vob.Media[0].Part[0].Stream.filter((s) => s.codec === 'vobsub')[0].id });
  assert.equal(b.mode, 'transcode');
  assert.deepEqual(codes(b), ['subtitle-format']);
});

test('décision : AVI MPEG-4 → transcodage (conteneur et codec vidéo), plusieurs raisons', () => {
  const plan = pb.decidePlayback(item('avi-mpeg4-mp3'), {});
  assert.equal(plan.mode, 'transcode');
  assert.deepEqual(codes(plan), ['container', 'video-codec']);
  assert.match(plan.reason, /avi/);
  assert.match(plan.reason, /mpeg4/);
});

test('décision : AV1 + Opus → transcodage (vidéo et audio)', () => {
  const plan = pb.decidePlayback(item('mkv-av1-opus'), {});
  assert.equal(plan.mode, 'transcode');
  assert.deepEqual(codes(plan), ['video-codec', 'audio-codec']);
});

test('décision : sous-titre image/ASS en plus d’un audio non lisible → les deux raisons', () => {
  const it = item('mkv-h264-truehd-pgs');
  const pgs = it.Media[0].Part[0].Stream.filter((s) => s.codec === 'pgs')[0];
  const truehd = it.Media[0].Part[0].Stream.filter((s) => s.codec === 'truehd')[0];
  assert.deepEqual(codes(pb.decidePlayback(it, { audioId: truehd.id, subtitleId: pgs.id })), ['audio-codec', 'subtitle-format']);
});

// --- Décision : branches limites (fiches construites à partir d’une fiche réelle) ------------------------------

function variant(mutate) {
  const it = item('mp4-h264-aac');
  mutate(it, it.Media[0], it.Media[0].Part[0], it.Media[0].Part[0].Stream[0]);
  return pb.decidePlayback(it, {});
}

test('décision : H.264 10 bits (Hi10P) → transcodage, raison video-profile', () => {
  assert.deepEqual(codes(variant((it, m, p, v) => { v.bitDepth = 10; })), ['video-profile']);
});

test('décision : HEVC 10 bits accepté, 12 bits refusé', () => {
  assert.equal(variant((it, m, p, v) => { m.videoCodec = 'hevc'; v.codec = 'hevc'; v.bitDepth = 10; }).mode, 'direct');
  assert.deepEqual(codes(variant((it, m, p, v) => { m.videoCodec = 'hevc'; v.codec = 'hevc'; v.bitDepth = 12; })), ['video-profile']);
});

test('décision : définition au-delà de la TV → transcodage, raison resolution', () => {
  assert.deepEqual(codes(variant((it, m) => { m.width = 7680; m.height = 4320; })), ['resolution']);
  assert.equal(variant((it, m) => { m.width = 3840; m.height = 2160; }).mode, 'direct');
});

test('décision : Dolby Vision profil 5 (sans base HDR10) → transcodage, raison hdr ; DV profil 8 accepté', () => {
  const dv = (profile) => variant((it, m, p, v) => { m.videoCodec = 'hevc'; v.codec = 'hevc'; v.colorTrc = 'smpte2084'; v.DOVIPresent = true; v.DOVIProfile = profile; });
  assert.deepEqual(codes(dv(5)), ['hdr']);
  assert.equal(dv(8).mode, 'direct');
});

test('décision : fonction de transfert HDR inconnue → transcodage ; SDR et HLG acceptés', () => {
  assert.deepEqual(codes(variant((it, m, p, v) => { v.colorTrc = 'smpte428'; })), ['hdr']);
  assert.equal(variant((it, m, p, v) => { v.colorTrc = 'arib-std-b67'; }).mode, 'direct');
  assert.equal(variant((it, m, p, v) => { v.colorTrc = 'bt709'; }).mode, 'direct');
});

test('décision : fichier en plusieurs parties → transcodage (AVPlay n’enchaîne pas les parties)', () => {
  const plan = variant((it, m, p) => { m.Part.push(JSON.parse(JSON.stringify(p))); });
  assert.equal(plan.mode, 'transcode');
  assert.deepEqual(codes(plan), ['multi-part']);
});

test('décision : plusieurs versions → la première lisible en direct est retenue', () => {
  const it = item('avi-mpeg4-mp3');
  const good = item('mp4-h264-aac').Media[0];
  it.Media.push(good);
  const plan = pb.decidePlayback(it, {});
  assert.equal(plan.mode, 'direct');
  assert.equal(plan.mediaIndex, 1);
  assert.equal(plan.media.id, good.id);
});

test('décision : plusieurs versions toutes illisibles → celle qui a le moins de raisons', () => {
  const it = item('avi-mpeg4-mp3');
  const dts = item('mkv-h264-dts').Media[0];
  it.Media.unshift(it.Media[0]);
  it.Media[0] = JSON.parse(JSON.stringify(it.Media[1]));
  it.Media.push(dts);
  const plan = pb.decidePlayback(it, {});
  assert.equal(plan.mode, 'transcode');
  assert.equal(plan.mediaIndex, 2);
  assert.deepEqual(codes(plan), ['audio-codec']);
});

test('décision : aucune partie jouable → transcodage impossible, erreur explicite', () => {
  const it = item('mp4-h264-aac');
  it.Media = [];
  assert.throws(() => pb.decidePlayback(it, {}), /aucun média/i);
  const it2 = item('mp4-h264-aac');
  it2.Media[0].Part = [];
  assert.throws(() => pb.decidePlayback(it2, {}), /aucune partie/i);
});

test('décision : fiche sans Stream (liste de bibliothèque) → repli sur les champs du Media', () => {
  const it = item('mp4-h264-aac');
  delete it.Media[0].Part[0].Stream;
  assert.equal(pb.decidePlayback(it, {}).mode, 'direct');
  const it2 = item('mp4-h264-aac');
  delete it2.Media[0].Part[0].Stream;
  it2.Media[0].audioCodec = 'dca';
  assert.deepEqual(codes(pb.decidePlayback(it2, {})), ['audio-codec']);
});

test('décision : jeu complet des fixtures — verdict attendu pour chacune', () => {
  const expected = {
    'mp4-h264-aac': 'direct', 'mkv-h264-ac3-srt-externe': 'direct', 'mkv-hevc-eac3-srt-interne-et-externe': 'direct', 'mkv-hevc-hdr10': 'direct',
    'mkv-h264-dts': 'transcode', 'mkv-h264-truehd-pgs': 'direct', 'mkv-h264-ac3-pgs': 'direct',
    'mkv-h264-ac3-ass': 'transcode', // audio ita + sous-titre ASS forcé ita : activé par défaut, donc incrusté
    'mkv-h264-ac3-srt-force': 'direct', 'mkv-h264-ac3-vobsub': 'direct', 'avi-mpeg4-mp3': 'transcode', 'mkv-av1-opus': 'transcode',
  };
  assert.ok(samples.length >= 5 && samples.length <= 12);
  for (const s of samples) assert.equal(pb.decidePlayback(item(s.name), {}).mode, expected[s.name], s.name);
});

// --- URL de lecture directe -----------------------------------------------------------------------------------

test('URL directe : construite sur l’URI plex.direct, avec le jeton', () => {
  const plan = pb.decidePlayback(item('mp4-h264-aac'), {});
  const url = pb.directPlaybackUrl(SERVER, plan);
  assert.equal(url, SERVER.uri + plan.part.key + '?X-Plex-Token=FAKE-SERVER-TOKEN');
  assert.match(url, /^https:\/\/192-0-2-10\.0{32}\.plex\.direct:32400\/library\/parts\//);
});

test('URL directe : refuse une IP ou un hôte hors plex.direct, sans l’afficher', () => {
  const plan = pb.decidePlayback(item('mp4-h264-aac'), {});
  for (const uri of ['http://192.0.2.10:32400', 'https://192.0.2.10:32400', 'https://example.com:32400', 'https://evil.plex.direct.example.com', 'https://x@192.0.2.10/.plex.direct']) {
    assert.throws(() => pb.directPlaybackUrl({ uri, token: 'T' }, plan), (e) => /plex\.direct/.test(e.message) && e.message.indexOf('192.0.2.10') < 0, uri);
  }
  assert.throws(() => pb.directPlaybackUrl(SERVER, pb.decidePlayback(item('avi-mpeg4-mp3'), {})), /transcodage/i, 'plan de transcodage : pas d’URL directe');
});

test('URL du sous-titre externe : plex.direct + jeton ; interne ou sans sous-titre : null', () => {
  const it = item('mkv-h264-ac3-srt-externe');
  const ext = it.Media[0].Part[0].Stream.filter((s) => s.key)[0];
  const plan = pb.decidePlayback(it, { subtitleId: ext.id });
  assert.equal(pb.subtitleUrl(SERVER, plan), SERVER.uri + ext.key + '?X-Plex-Token=FAKE-SERVER-TOKEN');
  assert.equal(pb.subtitleUrl(SERVER, pb.decidePlayback(it, {})), null);
  const emb = item('mkv-hevc-hdr10');
  assert.equal(pb.subtitleUrl(SERVER, pb.decidePlayback(emb, {})), null, 'forcé interne');
  assert.throws(() => pb.subtitleUrl({ uri: 'http://192.0.2.10:32400', token: 'T' }, plan), /plex\.direct/);
});

// --- Transcodage : décision du transcodeur universel puis URL HLS ---------------------------------------------

function fakeHttp(res) {
  const calls = [];
  const http = (req, cb) => {
    calls.push(req);
    setImmediate(() => cb(null, typeof res === 'function' ? res(req) : res));
    return { abort() {} };
  };
  http.calls = calls;
  return http;
}
const sync = (fn) => new Promise((resolve) => fn((err, v) => resolve([err, v])));
const OK_DECISION = { status: 200, body: JSON.stringify({ MediaContainer: { generalDecisionCode: 1000, generalDecisionText: 'ok' } }) };

test('transcodage : GET decision puis URL start.m3u8 avec les mêmes paramètres', async () => {
  const it = item('mkv-h264-dts');
  const plan = pb.decidePlayback(it, {});
  const http = fakeHttp(OK_DECISION);
  const [err, r] = await sync((cb) => pb.requestTranscode(http, ID, SERVER, plan, 'sess-1', cb));
  assert.equal(err, null);
  assert.equal(http.calls.length, 1);
  const call = http.calls[0];
  assert.equal(call.method, 'GET');
  assert.ok(call.url.startsWith(SERVER.uri + '/video/:/transcode/universal/decision?'));
  assert.equal(call.headers['X-Plex-Token'], 'FAKE-SERVER-TOKEN');
  assert.ok(r.url.startsWith(SERVER.uri + '/video/:/transcode/universal/start.m3u8?'));
  const q = new URL(r.url).searchParams, d = new URL(call.url).searchParams;
  assert.deepEqual([...q].sort(), [...d].sort(), 'décision et lecture partagent les paramètres');
  assert.equal(q.get('path'), '/library/metadata/' + it.ratingKey);
  assert.equal(q.get('protocol'), 'hls');
  assert.equal(q.get('directPlay'), '0');
  assert.equal(q.get('mediaIndex'), '0');
  assert.equal(q.get('partIndex'), '0');
  assert.equal(q.get('session'), 'sess-1');
  assert.equal(q.get('audioStreamID'), String(plan.audio.id));
  assert.equal(q.get('subtitles'), 'none');
  assert.equal(q.get('subtitleStreamID'), '0');
  assert.equal(q.get('X-Plex-Token'), 'FAKE-SERVER-TOKEN');
  assert.equal(q.get('X-Plex-Client-Identifier'), 'test-client-uuid');
  assert.equal(q.get('X-Plex-Platform'), 'Tizen');
});

test('transcodage : PGS → subtitles=burn avec l’identifiant de la piste', async () => {
  const it = item('mkv-h264-ac3-pgs');
  const pgs = it.Media[0].Part[0].Stream.filter((s) => s.codec === 'pgs')[0];
  const plan = pb.decidePlayback(it, { subtitleId: pgs.id });
  const [err, r] = await sync((cb) => pb.requestTranscode(fakeHttp(OK_DECISION), ID, SERVER, plan, 's', cb));
  assert.equal(err, null);
  const q = new URL(r.url).searchParams;
  assert.equal(q.get('subtitles'), 'burn');
  assert.equal(q.get('subtitleStreamID'), String(pgs.id));
});

test('transcodage : choisit mediaIndex de la version retenue', async () => {
  const it = item('avi-mpeg4-mp3');
  it.Media.push(item('mkv-h264-dts').Media[0]);
  const plan = pb.decidePlayback(it, {});
  const [, r] = await sync((cb) => pb.requestTranscode(fakeHttp(OK_DECISION), ID, SERVER, plan, 's', cb));
  assert.equal(new URL(r.url).searchParams.get('mediaIndex'), '1');
});

test('transcodage : décision refusée par le serveur, HTTP en erreur, corps invalide, plan direct', async () => {
  const plan = pb.decidePlayback(item('mkv-h264-dts'), {});
  const refused = { status: 200, body: JSON.stringify({ MediaContainer: { generalDecisionCode: 2000, generalDecisionText: 'Impossible' } }) };
  let [err] = await sync((cb) => pb.requestTranscode(fakeHttp(refused), ID, SERVER, plan, 's', cb));
  assert.match(err.message, /Impossible/);
  [err] = await sync((cb) => pb.requestTranscode(fakeHttp({ status: 500, body: '' }), ID, SERVER, plan, 's', cb));
  assert.equal(err.status, 500);
  [err] = await sync((cb) => pb.requestTranscode(fakeHttp({ status: 200, body: '{}' }), ID, SERVER, plan, 's', cb));
  assert.match(err.message, /décision/i);
  const direct = pb.decidePlayback(item('mp4-h264-aac'), {});
  const http = fakeHttp(OK_DECISION);
  [err] = await sync((cb) => pb.requestTranscode(http, ID, SERVER, direct, 's', cb));
  assert.match(err.message, /directe/i);
  assert.equal(http.calls.length, 0, 'aucune requête pour un plan direct');
});

test('transcodage : refuse un serveur hors plex.direct avant toute requête', async () => {
  const plan = pb.decidePlayback(item('mkv-h264-dts'), {});
  const http = fakeHttp(OK_DECISION);
  const [err] = await sync((cb) => pb.requestTranscode(http, ID, { uri: 'http://192.0.2.10:32400', token: 'T' }, plan, 's', cb));
  assert.match(err.message, /plex\.direct/);
  assert.equal(http.calls.length, 0);
});

test('aucun secret ni IP réelle dans les fixtures de médias', () => {
  const txt = readFileSync('tests/fixtures/plex/media-samples.json', 'utf8');
  assert.doesNotMatch(txt, /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/);
  assert.doesNotMatch(txt, /X-Plex-Token|"file"\s*:/);
});
