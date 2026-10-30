# Bilan — sous-titres sans incrustation (ASS / mov_text)

**Fait** (commits 0c099db code + tests, caa9407 audit/doc)
- Sonde lecture seule `scripts/plex/probe-subs.mjs` : seules les pistes SRT externes ont une clé ; ASS, mov_text, SRT internes n'en ont pas (501/400).
- Essai `subtitles=sidecar` autorisé par Stéphane (`scripts/plex/probe-sidecar.mjs`) : ASS → SRT servi par `/library/streams/N` ; mov_text → aucune piste renvoyée (reste incrusté).
- Code : profil `subtitles.converted = [ass, ssa]`, `decidePlayback` (`subtitleMode: 'converted'`, lecture directe), `requestSubtitleSidecar`, lecteur (URL du SRT converti → `setExternalSubtitlePath`). Tests ajoutés ; `npm run check` vert (601 tests).
- Audit avant/après dans `docs/plex-audit.md` : épisodes en transcodage avec sous-titres français 380 → 277 (−103), films 46 → 44.

**Pas fait**
- Observation sur la Frame (SRT interne, SRT externe, ASS converti) : en attente de Stéphane ; `docs/tv-status.md` à remplir avec ses mots. Tant que ce n'est pas vu, `confirmed` reste à false.
- mov_text : non convertible via sidecar ; reste incrusté.
