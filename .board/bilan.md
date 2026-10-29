# Bilan

Cause racine : `VirtualList.setCount` (tv-core) ne reliait pas les tuiles déjà posées (seules les nouvelles étaient liées dans `update`). À nombre égal, rien n'était redessiné avant un déplacement de focus. Le suspect « réponse périmée » n'était pas la cause (l'annulation existait déjà).

Fait
- tv-core `setCount` relie les tuiles actives : corrige aussi accueil Plex (rangées), bibliothèque, Dock du lanceur.
- Fiche série : réponses d'une saison quittée ignorées, focus des épisodes au premier épisode, saison affichée après 300 ms de focus, style « sel » permanent (TileInfo.selected) distinct du focus.
- Tests : virtual.test.mjs, plex-ui.test.mjs. `npm run check` passe (353 tests).

Non fait
- Pas de capture visuelle (rendu TV non testé) ; le style `.sel` (fond + soulignement) est à valider sur la Frame.
- Focus remis à l'épisode « en cours » : inchangé (le target existant reste prioritaire).
