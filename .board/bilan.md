# Bilan
Fait : un seul `focus` visible. `VirtualList.setActive()` (tv-core) : une liste inactive marque sa sélection `mark` (repère discret) au lieu de `focus`. Branché dans l'accueil Plex (rangée active) et la fiche (saisons/épisodes). CSS : repère discret sur Bibliothèques/saisons (l'anneau d'« Films » n'était pas conditionné à la rangée active).
Tests ajoutés (tests/plex-ui.test.mjs) : 1 seul focus à l'accueil et position mémorisée par rangée ; 1 seul focus sur la fiche série ; alignement des marges gauches (120 px, lu dans le CSS). La grille n'a qu'une liste. `npm run check` : vert (192 tests).
Non fait : pas de capture ni de vérification sur la Frame (alignement vérifié par le CSS seulement : rangée 96+24 = titres 120).

## Défilement vertical
`relayout()` remonte la couche de LIFT = 160 px de plus dès la 2e rangée : la rangée précédente (tuiles jusqu'à y = 702 dans son cadre) finit à −18 px, entièrement hors écran ; le titre actif est à y = 40. Test : parcours des 3 rangées, bandes calculées depuis les transforms et le CSS. Non vérifié sur la Frame.
