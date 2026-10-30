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
// Ancien défaut (audio français sinon piste par défaut, sous-titres coupés) : les tests de décision (codec, transcodage) n'en dépendent pas.
const LEGACY = { mode: 'fr', subLang: '' };
const codes = (plan) => plan.reasons.map((r) => r.code);
const ID = { clientId: 'test-client-uuid', product: 'Cimaise', version: '0.0.0', platform: 'Tizen', device: 'Frame' };
const SERVER = { uri: 'https://192-0-2-10.' + '0'.repeat(32) + '.plex.direct:32400', token: 'FAKE-SERVER-TOKEN' };

// --- Profil ---------------------------------------------------------------------------------------------------

test('profil : seules les entrées vues sur la Frame sont confirmées (sous-titres SRT interne/externe et ASS converti, 2026-10-30)', () => {
  const P = pb.FRAME_2019_PROFILE;
  assert.match(P.model, /LS03R/);
  const all = [].concat(P.containers, P.video, P.hdr, P.audio, P.subtitles.embedded, P.subtitles.external);
  assert.ok(all.length >= 10);
  for (const e of all) {
    assert.equal(typeof e.name, 'string');
    const seen = P.subtitles.embedded.concat(P.subtitles.external).indexOf(e) >= 0;
    assert.equal(e.confirmed, seen, e.name + (seen ? ' vu sur la TV' : ' ne doit pas être confirmé'));
    assert.match(pb.confirmationLabel(e), seen ? /confirmé sur la TV/ : /supposé, à confirmer sur la TV/);
  }
  assert.equal(P.subtitles.converted.find((x) => x.name === 'ass').confirmed, true);
  assert.equal(P.subtitles.converted.find((x) => x.name === 'ssa').confirmed, false, 'ssa non vu');
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
  assert.deepEqual(names(P.subtitles.converted), ['ass', 'ssa']);
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
  assert.equal(pb.chooseTracks(streams, LEGACY).audio.languageCode, 'fra', 'langue préférée par défaut : fra');
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
  assert.equal(pb.chooseTracks(dtsLike, LEGACY).audio.id, 2);
});

test('pistes : sous-titres coupés par défaut (même si une piste est « défaut » ou « sélectionnée »)', () => {
  const streams = item('mkv-h264-ac3-srt-externe').Media[0].Part[0].Stream;
  assert.equal(pb.chooseTracks(streams, LEGACY).subtitle, null);
  const mp4 = item('mp4-h264-aac').Media[0].Part[0].Stream; // srt externe marquée selected par le serveur
  assert.ok(mp4.some((s) => s.streamType === 3 && s.selected));
  assert.equal(pb.chooseTracks(mp4, LEGACY).subtitle, null);
});

test('pistes : sous-titres forcés activés quand leur langue est celle de l’audio choisi', () => {
  const t = pb.chooseTracks(item('mkv-h264-ac3-srt-force').Media[0].Part[0].Stream, LEGACY);
  assert.equal(t.audio.languageCode, 'fra');
  assert.equal(t.subtitle.forced, true);
  assert.equal(t.subtitle.languageCode, 'fra');
  const hdr = pb.chooseTracks(item('mkv-hevc-hdr10').Media[0].Part[0].Stream, LEGACY);
  assert.equal(hdr.subtitle.forced, true);
});

test('pistes : forcés d’une autre langue que l’audio ignorés ; forcé srt préféré à un forcé image', () => {
  const streams = [
    { id: 1, streamType: 2, codec: 'ac3', languageCode: 'fra' },
    { id: 2, streamType: 3, codec: 'srt', languageCode: 'eng', forced: true },
  ];
  assert.equal(pb.chooseTracks(streams, LEGACY).subtitle, null);
  streams.push({ id: 3, streamType: 3, codec: 'pgs', languageCode: 'fra', forced: true }, { id: 4, streamType: 3, codec: 'srt', languageCode: 'fra', forced: true });
  assert.equal(pb.chooseTracks(streams, LEGACY).subtitle.id, 4);
  streams.pop();
  assert.equal(pb.chooseTracks(streams, LEGACY).subtitle.id, 3);
});

test('pistes : fichier sans audio ni sous-titres', () => {
  const t = pb.chooseTracks([{ id: 1, streamType: 1, codec: 'h264' }], LEGACY);
  assert.equal(t.audio, null);
  assert.equal(t.subtitle, null);
  assert.deepEqual(pb.chooseTracks(undefined, LEGACY), { audio: null, subtitle: null });
});

// --- Décision : lecture directe -------------------------------------------------------------------------------

test('décision : MP4 H.264/AAC → lecture directe, raison expliquée', () => {
  const plan = pb.decidePlayback(item('mp4-h264-aac'), LEGACY);
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
  const plan = pb.decidePlayback(item('mkv-hevc-hdr10'), LEGACY);
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
  const plan = pb.decidePlayback(item('mkv-h264-dts'), LEGACY);
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
  const dflt = pb.decidePlayback(it, LEGACY);
  assert.equal(dflt.mode, 'direct');
  assert.equal(dflt.audio.id, ac3.id);
});

test('décision : PGS demandé → transcodage avec sous-titres incrustés', () => {
  const it = item('mkv-h264-ac3-pgs');
  const pgs = it.Media[0].Part[0].Stream.filter((s) => s.codec === 'pgs')[0];
  assert.equal(pb.decidePlayback(it, LEGACY).mode, 'direct', 'PGS présent mais non choisi : lecture directe');
  const plan = pb.decidePlayback(it, { subtitleId: pgs.id });
  assert.equal(plan.mode, 'transcode');
  assert.deepEqual(codes(plan), ['subtitle-format']);
  assert.equal(plan.subtitleMode, 'burned');
  assert.match(plan.reason, /pgs/);
  assert.match(plan.reason, /incrust/);
});

test('décision : ASS demandé → lecture directe, SRT converti par le serveur (sidecar), pas d’incrustation', () => {
  const ass = item('mkv-h264-ac3-ass');
  const id = ass.Media[0].Part[0].Stream.filter((s) => s.codec === 'ass')[0].id;
  const a = pb.decidePlayback(ass, { subtitleId: id });
  assert.equal(a.mode, 'direct');
  assert.deepEqual(codes(a), []);
  assert.equal(a.subtitleMode, 'converted');
  assert.match(a.reason, /ass/);
  assert.match(a.reason, /SRT/);
  assert.equal(pb.subtitleUrl(SERVER, a), null, 'l’URL vient de la décision sidecar, pas de la fiche');
  // Autre cause de transcodage (ici l’audio) : les sous-titres sont incrustés avec le reste.
  const dts = item('mkv-h264-dts'), st = dts.Media[0].Part[0].Stream;
  st.push({ id: 9001, streamType: 3, codec: 'ass', languageCode: 'eng', index: 9 });
  const b = pb.decidePlayback(dts, { subtitleId: 9001 });
  assert.equal(b.mode, 'transcode');
  assert.equal(b.subtitleMode, 'burned');
});

test('décision : VobSub et mov_text demandés → transcodage avec incrustation (pas convertibles)', () => {
  const vob = item('mkv-h264-ac3-vobsub');
  const b = pb.decidePlayback(vob, { subtitleId: vob.Media[0].Part[0].Stream.filter((s) => s.codec === 'vobsub')[0].id });
  assert.equal(b.mode, 'transcode');
  assert.deepEqual(codes(b), ['subtitle-format']);
  const mp4 = item('mp4-h264-aac');
  mp4.Media[0].Part[0].Stream.push({ id: 9002, streamType: 3, codec: 'mov_text', languageCode: 'fra', index: 9 });
  const c = pb.decidePlayback(mp4, { subtitleId: 9002 });
  assert.equal(c.mode, 'transcode');
  assert.equal(c.subtitleMode, 'burned');
});

test('sidecar : la requête de décision d’un plan converti demande subtitles=sidecar sur la piste', () => {
  const ass = item('mkv-h264-ac3-ass'), s = ass.Media[0].Part[0].Stream.filter((x) => x.codec === 'ass')[0];
  const plan = pb.decidePlayback(ass, { subtitleId: s.id });
  const q = new URLSearchParams(pb.transcodeQuery(ID, SERVER, plan, 'sess-s', 0));
  assert.equal(q.get('subtitles'), 'sidecar');
  assert.equal(q.get('subtitleStreamID'), String(s.id));
});

test('sidecar : requestSubtitleSidecar rend l’URL SRT de la piste convertie (clé de la décision + jeton)', async () => {
  const ass = item('mkv-h264-ac3-ass'), s = ass.Media[0].Part[0].Stream.filter((x) => x.codec === 'ass')[0];
  const plan = pb.decidePlayback(ass, { subtitleId: s.id });
  const body = { MediaContainer: { generalDecisionCode: 1001, Metadata: [{ Media: [{ Part: [{ Stream: [
    { id: 1, streamType: 1, codec: 'h264' }, { id: 77, streamType: 3, codec: 'srt', format: 'srt', key: '/library/streams/77', selected: true, location: 'sidecar-subs' }] }] }] }] } };
  const http = fakeHttp({ status: 200, body: JSON.stringify(body) });
  const [err, url] = await sync((cb) => pb.requestSubtitleSidecar(http, ID, SERVER, plan, 'sess-s', cb));
  assert.equal(err, null);
  assert.equal(url, SERVER.uri + '/library/streams/77?X-Plex-Token=FAKE-SERVER-TOKEN');
  assert.ok(http.calls[0].url.startsWith(SERVER.uri + '/video/:/transcode/universal/decision?'));
  assert.equal(new URL(http.calls[0].url).searchParams.get('subtitles'), 'sidecar');
  // Réponse sans piste SRT à clé : erreur claire.
  body.MediaContainer.Metadata[0].Media[0].Part[0].Stream.pop();
  const [err2] = await sync((cb) => pb.requestSubtitleSidecar(fakeHttp({ status: 200, body: JSON.stringify(body) }), ID, SERVER, plan, 's2', cb));
  assert.match(err2.message, /sous-titres/);
  const [err3] = await sync((cb) => pb.requestSubtitleSidecar(http, ID, SERVER, pb.decidePlayback(item('mkv-h264-ac3-srt-externe'), LEGACY), 's3', cb));
  assert.ok(err3, 'plan non converti : refusé');
});

test('décision : AVI MPEG-4 → transcodage (conteneur et codec vidéo), plusieurs raisons', () => {
  const plan = pb.decidePlayback(item('avi-mpeg4-mp3'), LEGACY);
  assert.equal(plan.mode, 'transcode');
  assert.deepEqual(codes(plan), ['container', 'video-codec']);
  assert.match(plan.reason, /avi/);
  assert.match(plan.reason, /mpeg4/);
});

test('décision : AV1 + Opus → transcodage (vidéo et audio)', () => {
  const plan = pb.decidePlayback(item('mkv-av1-opus'), LEGACY);
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
  return pb.decidePlayback(it, LEGACY);
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
  const plan = pb.decidePlayback(it, LEGACY);
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
  const plan = pb.decidePlayback(it, LEGACY);
  assert.equal(plan.mode, 'transcode');
  assert.equal(plan.mediaIndex, 2);
  assert.deepEqual(codes(plan), ['audio-codec']);
});

test('décision : aucune partie jouable → transcodage impossible, erreur explicite', () => {
  const it = item('mp4-h264-aac');
  it.Media = [];
  assert.throws(() => pb.decidePlayback(it, LEGACY), /aucun média/i);
  const it2 = item('mp4-h264-aac');
  it2.Media[0].Part = [];
  assert.throws(() => pb.decidePlayback(it2, LEGACY), /aucune partie/i);
});

test('décision : fiche sans Stream (liste de bibliothèque) → repli sur les champs du Media', () => {
  const it = item('mp4-h264-aac');
  delete it.Media[0].Part[0].Stream;
  assert.equal(pb.decidePlayback(it, LEGACY).mode, 'direct');
  const it2 = item('mp4-h264-aac');
  delete it2.Media[0].Part[0].Stream;
  it2.Media[0].audioCodec = 'dca';
  assert.deepEqual(codes(pb.decidePlayback(it2, LEGACY)), ['audio-codec']);
});

test('décision : jeu complet des fixtures — verdict attendu pour chacune', () => {
  const expected = {
    'mp4-h264-aac': 'direct', 'mkv-h264-ac3-srt-externe': 'direct', 'mkv-hevc-eac3-srt-interne-et-externe': 'direct', 'mkv-hevc-hdr10': 'direct',
    'mkv-h264-dts': 'transcode', 'mkv-h264-truehd-pgs': 'direct', 'mkv-h264-ac3-pgs': 'direct',
    'mkv-h264-ac3-ass': 'direct', // audio ita + sous-titre ASS forcé ita : activé par défaut, converti en SRT par le serveur (sidecar)
    'mkv-h264-ac3-srt-force': 'direct', 'mkv-h264-ac3-vobsub': 'direct', 'avi-mpeg4-mp3': 'transcode', 'mkv-av1-opus': 'transcode',
  };
  assert.ok(samples.length >= 5 && samples.length <= 12);
  for (const s of samples) assert.equal(pb.decidePlayback(item(s.name), LEGACY).mode, expected[s.name], s.name);
});

// --- URL de lecture directe -----------------------------------------------------------------------------------

test('URL directe : construite sur l’URI plex.direct, avec le jeton', () => {
  const plan = pb.decidePlayback(item('mp4-h264-aac'), LEGACY);
  const url = pb.directPlaybackUrl(SERVER, plan);
  assert.equal(url, SERVER.uri + plan.part.key + '?X-Plex-Token=FAKE-SERVER-TOKEN');
  assert.match(url, /^https:\/\/192-0-2-10\.0{32}\.plex\.direct:32400\/library\/parts\//);
});

test('URL directe : refuse une IP ou un hôte hors plex.direct, sans l’afficher', () => {
  const plan = pb.decidePlayback(item('mp4-h264-aac'), LEGACY);
  for (const uri of ['http://192.0.2.10:32400', 'https://192.0.2.10:32400', 'https://example.com:32400', 'https://evil.plex.direct.example.com', 'https://x@192.0.2.10/.plex.direct']) {
    assert.throws(() => pb.directPlaybackUrl({ uri, token: 'T' }, plan), (e) => /plex\.direct/.test(e.message) && e.message.indexOf('192.0.2.10') < 0, uri);
  }
  assert.throws(() => pb.directPlaybackUrl(SERVER, pb.decidePlayback(item('avi-mpeg4-mp3'), LEGACY)), /transcodage/i, 'plan de transcodage : pas d’URL directe');
});

test('URL du sous-titre externe : plex.direct + jeton ; interne ou sans sous-titre : null', () => {
  const it = item('mkv-h264-ac3-srt-externe');
  const ext = it.Media[0].Part[0].Stream.filter((s) => s.key)[0];
  const plan = pb.decidePlayback(it, { subtitleId: ext.id });
  assert.equal(pb.subtitleUrl(SERVER, plan), SERVER.uri + ext.key + '?X-Plex-Token=FAKE-SERVER-TOKEN');
  assert.equal(pb.subtitleUrl(SERVER, pb.decidePlayback(it, LEGACY)), null);
  const emb = item('mkv-hevc-hdr10');
  assert.equal(pb.subtitleUrl(SERVER, pb.decidePlayback(emb, LEGACY)), null, 'forcé interne');
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
const REAL = JSON.parse(readFileSync('tests/fixtures/plex/transcode-decision.json', 'utf8'));
const OK_DECISION = { status: 200, body: JSON.stringify({ MediaContainer: { generalDecisionCode: 1000, generalDecisionText: 'ok' } }) };

test('transcodage : GET decision puis URL start.m3u8 avec les mêmes paramètres', async () => {
  const it = item('mkv-h264-dts');
  const plan = pb.decidePlayback(it, LEGACY);
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
  const plan = pb.decidePlayback(it, LEGACY);
  const [, r] = await sync((cb) => pb.requestTranscode(fakeHttp(OK_DECISION), ID, SERVER, plan, 's', cb));
  assert.equal(new URL(r.url).searchParams.get('mediaIndex'), '1');
});

test('transcodage : décision refusée par le serveur, HTTP en erreur, corps invalide, plan direct', async () => {
  const plan = pb.decidePlayback(item('mkv-h264-dts'), LEGACY);
  const refused = { status: 200, body: JSON.stringify({ MediaContainer: { generalDecisionCode: 2000, generalDecisionText: 'Impossible' } }) };
  let [err] = await sync((cb) => pb.requestTranscode(fakeHttp(refused), ID, SERVER, plan, 's', cb));
  assert.match(err.message, /Impossible/);
  [err] = await sync((cb) => pb.requestTranscode(fakeHttp({ status: 500, body: '' }), ID, SERVER, plan, 's', cb));
  assert.equal(err.status, 500);
  [err] = await sync((cb) => pb.requestTranscode(fakeHttp({ status: 200, body: '{}' }), ID, SERVER, plan, 's', cb));
  assert.match(err.message, /décision/i);
  const direct = pb.decidePlayback(item('mp4-h264-aac'), LEGACY);
  const http = fakeHttp(OK_DECISION);
  [err] = await sync((cb) => pb.requestTranscode(http, ID, SERVER, direct, 's', cb));
  assert.match(err.message, /directe/i);
  assert.equal(http.calls.length, 0, 'aucune requête pour un plan direct');
});

test('transcodage : refuse un serveur hors plex.direct avant toute requête', async () => {
  const plan = pb.decidePlayback(item('mkv-h264-dts'), LEGACY);
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

// --- Sous-titres et pistes (HANDOFF §5.3–5.4) : fiches réelles anonymisées --------------------------------------

test('sous-titres : langue choisie → SRT interne en lecture directe (setSelectTrack)', () => {
  const plan = pb.decidePlayback(item('mkv-h264-ac3-srt-externe'), { audioLang: 'eng', subLang: 'fra' });
  assert.equal(plan.mode, 'direct');
  assert.equal(plan.subtitleMode, 'embedded');
  assert.equal(plan.subtitle.codec, 'srt');
  assert.equal(plan.subtitle.languageCode, 'fra');
  assert.ok(!plan.subtitle.key);
});

test('sous-titres : seul un SRT externe existe dans la langue → lecture directe, URL du fichier à côté', () => {
  const plan = pb.decidePlayback(item('mkv-h264-ac3-pgs'), { audioLang: 'eng', subLang: 'fra' });
  assert.equal(plan.mode, 'direct');
  assert.equal(plan.subtitleMode, 'external');
  const url = pb.subtitleUrl(SERVER, plan);
  assert.ok(url.startsWith(SERVER.uri + '/library/streams/'), url);
  assert.equal(new URL(url).searchParams.get('X-Plex-Token'), SERVER.token);
});

test('sous-titres : un SRT lisible l’emporte sur ASS/PGS de la même langue (pas de transcodage inutile)', () => {
  const ass = pb.decidePlayback(item('mkv-h264-ac3-ass'), { audioLang: 'ita', subLang: 'eng' });
  assert.equal(ass.mode, 'direct');
  assert.equal(ass.subtitle.codec, 'srt');
  assert.equal(ass.subtitleMode, 'external');
  const pgs = pb.decidePlayback(item('mkv-h264-truehd-pgs'), { audioLang: 'fra', subLang: 'eng' });
  assert.equal(pgs.subtitle.codec, 'srt');
});

test('sous-titres : ASS seul dans la langue → lecture directe, SRT converti par le serveur (subtitles=sidecar)', () => {
  const plan = pb.decidePlayback(item('mkv-h264-ac3-ass'), { audioLang: 'eng', subLang: 'ita' });
  assert.equal(plan.mode, 'direct');
  assert.equal(plan.subtitleMode, 'converted');
  assert.deepEqual(codes(plan), []);
  assert.equal(plan.subtitle.codec, 'ass');
  assert.equal(plan.subtitle.forced, undefined, 'la piste complète est préférée à la piste forcée');
});

test('sous-titres : VobSub et PGS seuls → incrustés par le transcodeur, id de piste dans la requête', async () => {
  for (const [name, audio, sub, id] of [['mkv-h264-ac3-vobsub', 'fra', 'eng', 8303], ['mkv-av1-opus', 'eng', 'fra', 12304]]) {
    const plan = pb.decidePlayback(item(name), { audioLang: audio, subLang: sub });
    assert.equal(plan.mode, 'transcode', name);
    assert.equal(plan.subtitleMode, 'burned', name);
    const http = fakeHttp(OK_DECISION);
    const [err, r] = await sync((cb) => pb.requestTranscode(http, ID, SERVER, plan, 's', cb));
    assert.equal(err, null);
    const q = new URL(http.calls[0].url).searchParams;
    assert.equal(q.get('subtitles'), 'burn');
    assert.equal(q.get('subtitleStreamID'), String(plan.subtitle.id));
    assert.equal(plan.subtitle.id, id, name);
    assert.match(r.url, /start\.m3u8/);
  }
});

test('sous-titres : la langue demandée donne la piste complète (même langue que l’audio comprise)', () => {
  assert.equal(pb.decidePlayback(item('mkv-h264-ac3-srt-force'), { audioLang: 'fra', subLang: 'fra' }).subtitle.id, 10304);
  assert.equal(pb.decidePlayback(item('mkv-h264-ac3-srt-force'), { audioLang: 'eng', subLang: 'fra' }).subtitle.id, 10304);
  assert.equal(pb.decidePlayback(item('mkv-h264-dts'), { subLang: 'jpn' }).subtitle, null, 'langue absente : coupés');
});

test('sous-titres : défaut « aucun » → coupés, sauf piste forcée dans la langue de l’audio (s’active seule)', () => {
  assert.equal(pb.decidePlayback(item('mkv-h264-ac3-srt-force'), LEGACY).subtitle.id, 10303);
  assert.equal(pb.decidePlayback(item('mkv-h264-ac3-srt-force'), { subLang: '' }).subtitle.id, 10303);
  assert.equal(pb.decidePlayback(item('mp4-h264-aac'), LEGACY).subtitle, null);
  assert.equal(pb.decidePlayback(item('mp4-h264-aac'), LEGACY).subtitleMode, 'off');
});

test('pistes : audio de la langue demandée, repli sur la première piste si elle n’existe pas', () => {
  assert.equal(pb.decidePlayback(item('mkv-h264-ac3-srt-force'), { audioLang: 'eng' }).audio.id, 10302);
  assert.equal(pb.decidePlayback(item('mkv-h264-ac3-srt-force'), { audioLang: 'jpn' }).audio.id, 10301);
});

test('pistes : étiquettes du menu (langue, codec, forcés, incrustés)', () => {
  const plan = pb.decidePlayback(item('mkv-h264-ac3-ass'), LEGACY);
  const e = pb.trackEntries(plan);
  const audio = e.filter((x) => x.kind === 'audio').map((x) => x.label);
  assert.deepEqual(audio, ['Audio · Italien · AC3', 'Audio · Anglais · AC3']);
  const subs = e.filter((x) => x.kind === 'subtitle').map((x) => x.label);
  assert.equal(subs[0], 'Sous-titres · Désactivés');
  assert.ok(subs.includes('Sous-titres · Italien · ASS · forcés · incrustés'), subs.join('|'));
  assert.ok(subs.includes('Sous-titres · Anglais · SRT · externe'), subs.join('|'));
  assert.equal(e.filter((x) => x.current).length, 2, 'audio courant + sous-titres courant');
});

// --- Transcodage fiable : session, reprise, qualité, erreurs (carte « transcodage HLS fiable ») -----------------

test('transcodage : audio seul (DTS) → vidéo copiée (directStream), pas d’incrustation, aucun plafond de débit ni de définition', async () => {
  const plan = pb.decidePlayback(item('mkv-h264-dts'), LEGACY);
  assert.deepEqual(codes(plan), ['audio-codec']);
  const [, r] = await sync((cb) => pb.requestTranscode(fakeHttp(OK_DECISION), ID, SERVER, plan, 's', cb));
  const q = new URL(r.url).searchParams;
  assert.equal(q.get('directStream'), '1');
  assert.equal(q.get('subtitles'), 'none');
  // Vérifié sur le serveur : un maxVideoBitrate ou une videoResolution, même larges, font ré-encoder la vidéo (videoDecision=transcode).
  assert.equal(q.get('maxVideoBitrate'), null);
  assert.equal(q.get('videoResolution'), null);
  assert.equal(q.get('offset'), '0');
  assert.equal(r.audioOnly, true);
});

test('transcodage : plan avec vidéo à ré-encoder → débit LAN et définition d’origine plafonnés', async () => {
  const plan = pb.decidePlayback(item('mkv-av1-opus'), LEGACY);
  assert.ok(codes(plan).includes('video-codec'));
  const [, r] = await sync((cb) => pb.requestTranscode(fakeHttp(OK_DECISION), ID, SERVER, plan, 's', cb));
  const q = new URL(r.url).searchParams;
  assert.equal(q.get('maxVideoBitrate'), '20000');
  assert.ok(/^\d+x\d+$/.test(q.get('videoResolution')));
  assert.equal(r.audioOnly, false);
});

// Réponses réelles du serveur (tests/fixtures/plex/transcode-decision.json).
test('transcodage : profil client Generic + cible HLS déclarée (sans eux le serveur répond 400 puis 4005)', async () => {
  const plan = pb.decidePlayback(item('mkv-h264-dts'), LEGACY);
  const [, r] = await sync((cb) => pb.requestTranscode(fakeHttp(OK_DECISION), ID, SERVER, plan, 's', cb));
  const q = new URL(r.url).searchParams;
  assert.equal(q.get('X-Plex-Client-Profile-Name'), 'Generic');
  const extra = q.get('X-Plex-Client-Profile-Extra');
  assert.match(extra, /add-transcode-target\(.*protocol=hls.*container=mpegts.*videoCodec=h264,hevc.*audioCodec=aac,ac3.*\)/);
});

test('transcodage : décision réelle 1001 « Conversion OK » acceptée, URL start.m3u8 du même flux', async () => {
  const plan = pb.decidePlayback(item('mkv-h264-dts'), LEGACY);
  assert.equal(REAL.ok.MediaContainer.generalDecisionCode, 1001);
  const http = fakeHttp({ status: 200, body: JSON.stringify(REAL.ok) });
  const [err, r] = await sync((cb) => pb.requestTranscode(http, ID, SERVER, plan, 'sess-9', cb));
  assert.equal(err, null);
  assert.equal(r.audioOnly, true);
  assert.equal(new URL(r.url).searchParams.get('session'), 'sess-9');
  // Le flux principal est une liste de variantes : AVPlay suit l'URL relative session/<id>/base/index.m3u8.
  assert.match(REAL.master, /^#EXTM3U\n#EXT-X-STREAM-INF:.*\nsession\/SESSION\/base\/index\.m3u8\n$/);
});

test('transcodage : la session réelle copie la vidéo et ne transcode que l’audio (DTS → AAC)', () => {
  const s = REAL.session;
  assert.deepEqual([s.videoDecision, s.audioDecision, s.sourceAudioCodec, s.audioCodec, s.container, s.protocol], ['copy', 'transcode', 'dca', 'aac', 'mpegts', 'hls']);
  const st = REAL.ok.MediaContainer.Metadata[0].Media[0].Part[0].Stream;
  assert.equal(st.filter((x) => x.streamType === 2)[0].codec, 'aac');
});

test('transcodage : refus réel 4005 (aucun profil HLS) → erreur lisible avec le texte du serveur', async () => {
  const plan = pb.decidePlayback(item('mkv-h264-dts'), LEGACY);
  const [err] = await sync((cb) => pb.requestTranscode(fakeHttp({ status: 200, body: JSON.stringify(REAL.noHlsTarget) }), ID, SERVER, plan, 's', cb));
  assert.match(err.message, /refusé.*Neither direct play nor conversion/);
  const [err2] = await sync((cb) => pb.requestTranscode(fakeHttp({ status: 400, body: REAL.noProfile }), ID, SERVER, plan, 's', cb));
  assert.equal(err2.status, 400);
});

test('transcodage : reprise à une position (offset en secondes) dans la décision et le flux', async () => {
  const plan = pb.decidePlayback(item('mkv-h264-dts'), LEGACY);
  const http = fakeHttp(OK_DECISION);
  const [, r] = await sync((cb) => pb.requestTranscode(http, ID, SERVER, plan, 's', cb, 3723500));
  assert.equal(new URL(r.url).searchParams.get('offset'), '3723');
  assert.equal(new URL(http.calls[0].url).searchParams.get('offset'), '3723');
});

test('transcodage : vidéo non copiable (AV1, sous-titres incrustés) → audioOnly faux', async () => {
  const plan = pb.decidePlayback(item('mkv-av1-opus'), LEGACY);
  const [, r] = await sync((cb) => pb.requestTranscode(fakeHttp(OK_DECISION), ID, SERVER, plan, 's', cb));
  assert.equal(r.audioOnly, false);
});

test('transcodage : session différente à chaque lecture, stable pour une même lecture', () => {
  const a = pb.newTranscodeSession(ID), b = pb.newTranscodeSession(ID);
  assert.notEqual(a, b);
  assert.match(a, /^[A-Za-z0-9-]+$/);
  assert.ok(a.indexOf('test-client-uuid') >= 0);
});

test('transcodage : arrêt de session = GET /video/:/transcode/universal/stop?session=…, jeton en en-tête', async () => {
  const http = fakeHttp({ status: 200, body: '' });
  const [err] = await sync((cb) => pb.stopTranscode(http, ID, SERVER, 'sess-9', cb));
  assert.equal(err, null);
  const c = http.calls[0];
  assert.equal(c.method, 'GET');
  assert.ok(c.url.startsWith(SERVER.uri + '/video/:/transcode/universal/stop?'));
  assert.equal(new URL(c.url).searchParams.get('session'), 'sess-9');
  assert.equal(c.headers['X-Plex-Token'], 'FAKE-SERVER-TOKEN');
  const [err2] = await sync((cb) => pb.stopTranscode(fakeHttp({ status: 500, body: '' }), ID, SERVER, 's', cb));
  assert.ok(err2, 'l’échec est rendu, jamais levé');
});

test('transcodage : erreurs du serveur → message clair (occupé, refusé, injoignable), sans adresse', async () => {
  const plan = pb.decidePlayback(item('mkv-h264-dts'), LEGACY);
  let [err] = await sync((cb) => pb.requestTranscode(fakeHttp({ status: 503, body: '' }), ID, SERVER, plan, 's', cb));
  assert.match(err.message, /occupé/);
  [err] = await sync((cb) => pb.requestTranscode(fakeHttp({ status: 429, body: '' }), ID, SERVER, plan, 's', cb));
  assert.match(err.message, /occupé/);
  const refused = { status: 200, body: JSON.stringify({ MediaContainer: { generalDecisionCode: 2000, generalDecisionText: 'Codec non supporté' } }) };
  [err] = await sync((cb) => pb.requestTranscode(fakeHttp(refused), ID, SERVER, plan, 's', cb));
  assert.match(err.message, /refus.*Codec non supporté/);
  [err] = await sync((cb) => pb.requestTranscode(fakeHttp({ status: 500, body: '' }), ID, SERVER, plan, 's', cb));
  assert.match(err.message, /transcodage/i);
  assert.equal(err.status, 500);
  assert.ok(!err.message.includes('192'));
});

// --- Langues : modes « VO sous-titrée » (défaut), « Français si disponible », « Personnalisé » -------------------

const pick = (name, prefs) => {
  const t = pb.chooseTracks(item(name).Media[0].Part[0].Stream, prefs);
  return { audio: t.audio && t.audio.languageCode, sub: t.subtitle && { lang: t.subtitle.languageCode, codec: t.subtitle.codec, forced: !!t.subtitle.forced, ext: !!t.subtitle.key } };
};

test('VO : la piste audio « default » du fichier ; à défaut la première ; langue inconnue → vide', () => {
  const s = (id, lang, def) => ({ id, streamType: 2, codec: 'ac3', languageCode: lang, default: def });
  assert.equal(pb.originalLang(item('mkv-av1-opus').Media[0].Part[0].Stream), 'eng', 'fra en premier mais eng « default »');
  assert.equal(pb.originalLang([s(1, 'fra'), s(2, 'eng')]), 'fra', 'aucun « default » : la première');
  assert.equal(pb.originalLang([{ id: 1, streamType: 1 }]), '');
  assert.equal(pb.originalLang(undefined), '');
});

test('mode VO (défaut) : film VO anglaise → audio anglais + sous-titres français (SRT externe)', () => {
  assert.deepEqual(pick('mkv-h264-dts', {}), { audio: 'eng', sub: { lang: 'fra', codec: 'srt', forced: false, ext: true } });
  assert.deepEqual(pick('mkv-h264-dts', { mode: 'vo' }), pick('mkv-h264-dts', {}), 'le défaut est « vo »');
  // limite documentée : ici la piste « default » du fichier est le doublage français, c’est donc elle que le mode VO prend
  assert.equal(pick('mkv-h264-ac3-vobsub', {}).audio, 'fra');
});

test('mode VO : film français → audio français, aucun sous-titre complet (seulement le forcé)', () => {
  const r = pick('mkv-h264-ac3-srt-force', {});
  assert.equal(r.audio, 'fra');
  assert.deepEqual(r.sub, { lang: 'fra', codec: 'srt', forced: true, ext: false }, 'forcé de la langue de l’audio, jamais la piste complète');
  const sans = [{ id: 1, streamType: 2, codec: 'ac3', languageCode: 'fra', default: true }, { id: 2, streamType: 3, codec: 'srt', languageCode: 'fra' }, { id: 3, streamType: 3, codec: 'srt', languageCode: 'eng' }];
  assert.equal(pb.chooseTracks(sans, {}).subtitle, null, 'VO française : aucun sous-titre');
});

test('mode VO : sans sous-titres français → anglais ; SRT préféré à ASS / PGS de même langue', () => {
  // VO italienne, pas de sous-titres français : anglais, en SRT externe (lecture directe) plutôt qu’en ASS
  assert.deepEqual(pick('mkv-h264-ac3-ass', {}), { audio: 'ita', sub: { lang: 'eng', codec: 'srt', forced: false, ext: true } });
  // VO anglaise : le français SRT interne passe avant les deux pistes PGS françaises
  assert.deepEqual(pick('mkv-av1-opus', {}), { audio: 'eng', sub: { lang: 'fra', codec: 'srt', forced: false, ext: false } });
  const pgsSeul = [{ id: 1, streamType: 2, codec: 'ac3', languageCode: 'eng', default: true }, { id: 2, streamType: 3, codec: 'pgs', languageCode: 'fra' }, { id: 3, streamType: 3, codec: 'srt', languageCode: 'eng', key: '/x' }];
  assert.equal(pb.chooseTracks(pgsSeul, {}).subtitle.id, 2, 'le français, même en PGS, avant l’anglais');
  pgsSeul.push({ id: 4, streamType: 3, codec: 'srt', languageCode: 'fra', key: '/y' });
  assert.equal(pb.chooseTracks(pgsSeul, {}).subtitle.id, 4, 'SRT avant PGS dans la même langue');
});

test('mode VO : sous-titres forcés de la langue de l’audio activés quand rien d’autre n’est choisi', () => {
  const streams = [
    { id: 1, streamType: 2, codec: 'ac3', languageCode: 'eng', default: true },
    { id: 2, streamType: 3, codec: 'srt', languageCode: 'eng', forced: true },
    { id: 3, streamType: 3, codec: 'srt', languageCode: 'deu', forced: true },
  ];
  assert.equal(pb.chooseTracks(streams, {}).subtitle.id, 2, 'aucun français ni anglais complet : le forcé anglais (langue de l’audio)');
  assert.equal(pb.chooseTracks(streams, { subLang: '' }).subtitle.id, 2, 'sous-titres coupés : le forcé reste');
  assert.equal(pick('mkv-hevc-hdr10', {}).sub.forced, true, 'film français réel : forcé français');
});

test('mode « Français si disponible » : audio français sinon VO + sous-titres français', () => {
  const fr = { mode: 'fr' };
  assert.deepEqual(pick('mkv-h264-ac3-srt-externe', fr), { audio: 'fra', sub: null }, 'doublage français : aucun sous-titre');
  assert.equal(pick('mkv-av1-opus', fr).audio, 'fra', 'fra existe même si la VO est eng');
  assert.deepEqual(pick('mkv-h264-dts', fr), { audio: 'eng', sub: { lang: 'fra', codec: 'srt', forced: false, ext: true } }, 'pas de français : VO + sous-titres fr');
  assert.deepEqual(pick('mkv-h264-ac3-ass', fr).sub, { lang: 'ita', codec: 'ass', forced: true, ext: false }, 'pas de sous-titres français : pas d’anglais de repli dans ce mode, seulement le forcé de l’audio');
});

test('mode Personnalisé : langues audio dans l’ordre, sous-titres seulement si l’audio n’est pas compris', () => {
  const c = (audioList, subList) => ({ mode: 'custom', audioList, subList });
  // anglais compris : audio anglais (2e choix, la 1re absente), aucun sous-titre
  assert.deepEqual(pick('mkv-h264-ac3-srt-externe', c(['jpn', 'eng'], ['fra'])), { audio: 'eng', sub: null });
  // aucune langue de la liste n’existe : VO, et sous-titres de la liste dans l’ordre
  assert.deepEqual(pick('mkv-h264-dts', c(['jpn'], ['spa', 'fra'])), { audio: 'eng', sub: { lang: 'fra', codec: 'srt', forced: false, ext: true } });
  // liste de sous-titres vide : seulement les forcés
  assert.equal(pick('mkv-h264-dts', c(['jpn'], [])).sub, null);
  assert.equal(pick('mkv-h264-ac3-ass', c(['eng'], ['fra'])).audio, 'eng');
  assert.equal(pick('mkv-h264-ac3-ass', c(['eng'], ['fra'])).sub, null, 'audio compris (eng) : aucun');
});

test('choix de la série (audioLang / subLang) : prime sur le mode', () => {
  const r = pb.chooseTracks(item('mkv-h264-ac3-srt-externe').Media[0].Part[0].Stream, { mode: 'vo', audioLang: 'eng', subLang: 'fra' });
  assert.equal(r.audio.languageCode, 'eng');
  assert.equal(r.subtitle.languageCode, 'fra');
  assert.equal(pb.chooseTracks(item('mkv-h264-dts').Media[0].Part[0].Stream, { mode: 'vo', subLang: '' }).subtitle, null, 'coupés pour cette série');
});
