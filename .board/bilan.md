# Bilan — sous-titres sans incrustation (ASS / mov_text)

**Fait**
- `scripts/plex/probe-subs.mjs` : sonde en lecture seule (GET) du vrai serveur ; constat consigné dans `docs/plex-audit.md`.
- Constat : seules les pistes SRT *externes* (3 035) ont une `key` servie en SRT. Les 346 ASS, 79 mov_text et les 17 435 SRT internes n'ont aucune `key` ;
  `/library/streams/{id}` répond 501 pour elles, `/video/:/transcode/universal/subtitles` répond 400 en GET.

**Non fait — arrêt volontaire (décision qui revient à Stéphane)**
- Obtenir un SRT depuis un ASS/mov_text exige très probablement une décision de transcodage avec `subtitles=sidecar` : une écriture serveur (session), alors que la carte demande une vérification en lecture seule. Je n'ai pas décidé à sa place.
- Vérification sur la Frame du SRT interne (`setSelectTrack`) et externe (`setExternalSubtitlePath`) : exige la TV et Stéphane, non faite ; `docs/tv-status.md` inchangé.
- `decidePlayback` / profil non modifiés ; audit non relancé (pas d'« après » à mesurer) ; `npm run check` non relancé (aucun code applicatif changé).

**Question** : autorises-tu un essai avec décision `subtitles=sidecar` (session arrêtée aussitôt, comme pour l'essai audio) ? Sinon, alternative : extraire les ASS hors de l'app (côté homelab).
