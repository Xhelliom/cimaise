# Bilan — sous-titres et pistes audio

## Fait (cette reprise)
- Critère 1 corrigé : `avplay.ts` n'appelle plus `setSilentSubtitle(true)` à l'ouverture (il coupait `onsubtitlechange`). Le lecteur Plex appelle `setSubtitlesVisible(true)` quand une piste de texte (interne ou externe) est choisie, `false` quand les sous-titres sont coupés, en échec ou transcodés (incrustés).
- Faux AVPlay des tests : n'émet plus `onsubtitlechange` en mode silencieux ; test qui aurait attrapé le bug (`tests/player.test.mjs`), test Plex adapté (`subs:true` après le choix de piste).
- `rememberSeries` : ordre de récence explicite (`prefs.plexSeriesOrder`) au lieu de l'ordre des clés d'objet ; test avec clés numériques. `docs/decisions.md` corrigé.
- `npm run check` : 404 tests verts.

## Non fait / réserve
- Non testé sur la TV : arrivée des événements `onsubtitlechange` en mode non silencieux, absence de double affichage natif + page, piste externe = dernière piste TEXT.
