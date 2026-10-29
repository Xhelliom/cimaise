# Bilan — avance/recul rapides du lecteur

Cause racine : le wrapper AVPlay (`tv-core/src/player/avplay.ts`) lançait un `seekTo` natif à chaque appui, sans attendre le précédent, et `forward/rewind` lisaient `getCurrentTime()` (périmé pendant un seek en vol). Une rafale d'appuis enchaînait donc des seeks concurrents → PLAYER_ERROR_SEEK_FAILED, que le listener `onerror` traitait comme fatal (écran « Lecture impossible »). Le correctif est dans le wrapper partagé, pas dans l'UI.

Fait :
- Appuis ± cumulés (pas 10 s ×3, 30 s ×3, puis 60 s), un seul seek après 400 ms de silence ; position visée affichée sur la barre (`onSeekPending`).
- Un seul seek en vol ; les suivants sont fusionnés (le dernier gagne) et partent au rappel.
- Cible bornée à [0, durée − 5 s].
- Erreur de seek (rappel ou `onerror` *SEEK*) : non fatale, `onSeekError` → message discret « Déplacement impossible », lecture intacte.
- Tests dans `tests/player.test.mjs` (appuis rapides, seek pendant seek, hors bornes, erreurs). `npm run check` : 300 tests OK.

Non fait : pas de test sur la TV réelle (à valider par Stéphane : rafale longue sur Avancer).
