# Bilan — Épisode suivant, Passer l'intro / le générique, enchaînement automatique

Fait :
- Marqueurs : forme réelle vérifiée en lecture seule sur le serveur (`/library/metadata/{id}?includeMarkers=1` → `Marker: [{type: 'intro'|'credits', startTimeOffset, endTimeOffset, final?}]`, champ absent quand l'épisode n'en a pas ; `credits` finit souvent à la durée du fichier). `getMetadata(..., false, true)`, type `Marker`, `parseMarkers` (`playback/next.ts`).
- Épisode suivant : `findNextEpisode` (saison puis première de la saison suivante ; 1 à 3 requêtes, lancées après la fiche). Bouton « Épisode suivant » dans la barre, seulement s'il existe ; l'emplacement vide réservé est supprimé.
- Passer l'intro / le générique : bouton seul en bas à droite pendant le marqueur, Entrée (barre fermée) saute à la fin ; disparaît à la sortie. Générique qui va jusqu'à la fin du fichier : Entrée = fin de l'épisode (suivant s'il existe, sinon retour fiche, vu).
- Enchaînement : carte « Épisode suivant dans 10 s » au début du marqueur générique (ou à la fin du flux sans marqueur) ; Entrée lance tout de suite, Retour annule et reste sur la fin ; `progress.stop(true)` (timeline stopped + scrobble émis) avant d'ouvrir le suivant ; état partagé `Chain` entre lecteurs ; après 3 épisodes enchaînés sans touche : « Vous regardez toujours ? » (Continuer / Arrêter).
- Tests : `tests/plex-player-next.test.mjs` (19 tests, marqueurs factices, horloge simulée). Mutation vérifiée : sans le scrobble avant enchaînement, deux tests échouent. `npm run check` vert (562 tests).
- Ajustements de tests existants : regex du faux serveur (`?includeMarkers=1`), test de l'emplacement réservé, et `flush` durci (vide aussi les `setImmediate`) car l'ajout provoquait ~25 % d'échecs aléatoires d'un test de transcodage (timer de 10 ms trop juste).

Non fait / à savoir :
- Non essayé sur la TV (aucune action TV). Le scrobble est émis avant le suivant mais pas attendu (même mécanisme que la fin de lecture actuelle) ; un échec réseau n'est pas retenté après le changement de lecteur.
- Pendant la carte, Pause n'interrompt pas le compte à rebours.
