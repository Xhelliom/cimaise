# Bilan — décision lecture directe / transcodage (HANDOFF §5.3)

**Fait** (`packages/plex/src/playback/`, branche `board/decider-lecture-directe-ou-transcodage-pour-chaq`)
- `profile.ts` : profil Frame 2019, chaque entrée `confirmed: false` (« supposé, à confirmer sur la TV »).
- `tracks.ts` : audio de la langue préférée (codec lisible d'abord), sous-titres off sauf forcés.
- `decide.ts` : `decidePlayback` → mode, raisons codées + phrase, version/partie, pistes ; PGS/ASS/VobSub → transcodage incrusté.
- `urls.ts` : URL directe et sous-titre externe sur l'URI `*.plex.direct` (IP refusée), `requestTranscode` (décision puis URL HLS).
- 12 fiches réelles anonymisées (`tests/fixtures/plex/media-samples.json`, script `scripts/plex/capture-media-fixtures.mjs`, lecture seule).
- 41 tests (`tests/plex-playback.test.mjs`) ; `npm run check` vert (285 tests). Doc : `docs/decisions.md`.

**Pas fait / à confirmer**
- Réponse réelle de `/video/:/transcode/universal/decision` non vérifiée (ouvre une session serveur, interdit en lecture seule).
- Aucun Dolby Vision dans la bibliothèque : branche testée sur fiche modifiée.
- Profil entièrement supposé, rien testé sur la TV.
- Module non branché à `ui/player.ts` (hors carte).
