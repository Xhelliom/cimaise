# Bilan — transcodage HLS fiable dans le lecteur

## Fait
- Session de transcodage propre à chaque lecture (`newTranscodeSession`), réutilisée pour décision, flux, relances et timeline ; arrêtée par `/video/:/transcode/universal/stop` à la sortie (Retour, stop, fin, suspension), sur erreur du lecteur et sur échec de la décision.
- Reprise et sauts : `offset` (secondes) dans la décision et le flux ; le wrapper AVPlay (`setTranscode`, `onFarSeek`) compte en temps du film. Saut proche = `seekTo` relatif ; saut lointain (avant la session ou > 30 s au-delà du transcodé) = arrêt puis relance de la session à la nouvelle position.
- Qualité : `maxVideoBitrate=20000`, `videoResolution` = définition d'origine. Audio seul (DTS/Opus/FLAC/TrueHD) : `directStream=1`, vidéo copiée (`audioOnly` rendu par `requestTranscode`).
- Erreurs : serveur occupé (503/429), refus du transcodeur (code ≥ 2000), autre → message clair sans adresse + bouton « Ouvrir Plex officiel » (déjà en place).
- Timeline : en-tête `X-Plex-Session-Identifier` en transcodage uniquement.
- Tests (faux serveur, faux AVPlay, aucun transcodage réel) : plex-playback, plex-progress, player, plex-player. `npm run check` vert (422 tests).

## Non fait / à valider sur le vrai serveur et la TV
- `requestTranscode` n'a toujours jamais été appelé contre le vrai serveur (interdit en test auto). À vérifier : forme de la réponse de décision, que l'en-tête `X-Plex-Session-Identifier` suffit à signaler le transcodage dans la timeline, que `offset` décale bien les temps AVPlay à 0, le seuil de 30 s (`AHEAD_MS`), le HLS dans AVPlay.
- AVI / AV1 / Hi10P / DV p5 : passent par le même chemin (transcodage vidéo complet), non testés en réel.
