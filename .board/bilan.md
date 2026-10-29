# Bilan — remontée de la progression de lecture

**Fait** (commit 5e8f090 + celui-ci)
- `packages/plex/src/progress.ts` : timeline `/:/timeline` toutes les 10 s et à chaque changement d'état, scrobble à 90 %, échecs réseau sans effet (nouvel essai au tick suivant).
- Caches « En cours » et fiche corrigés par `Data.progressed`, rechargés par les panneaux au `resume()`.
- Tests : `tests/plex-progress.test.mjs` (horloge simulée, faux serveur) et, ajoutés ici dans `tests/plex-ui.test.mjs`, trois tests de rechargement par les panneaux (accueil → `/library/onDeck` redemandé et réaffiché ; fiche film → « Reprendre » + barre ; fiche série → fiche et épisodes de la saison courante redemandés). Vérifié : retirer `loadDeck()`, `loadMeta()` ou `loadEpisodes(curSeason)` du `resume()` fait échouer ces tests.
- `npm run check` : 226 tests verts. Aucun appel vers un vrai serveur.

**Reste** : le branchement à AVPlay (lecture réelle) et la validation des vrais appels timeline/scrobble se feront sur la TV avec Stéphane.
