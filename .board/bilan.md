# Bilan
Fait : un seul `focus` visible. `VirtualList.setActive()` (tv-core) : une liste inactive marque sa sélection `mark` (repère discret) au lieu de `focus`. Branché dans l'accueil Plex (rangée active) et la fiche (saisons/épisodes). CSS : repère discret sur Bibliothèques/saisons (l'anneau d'« Films » n'était pas conditionné à la rangée active).
Tests ajoutés (tests/plex-ui.test.mjs) : 1 seul focus à l'accueil et position mémorisée par rangée ; 1 seul focus sur la fiche série ; alignement des marges gauches (120 px, lu dans le CSS). La grille n'a qu'une liste. `npm run check` : vert (192 tests).
Non fait : pas de capture ni de vérification sur la Frame (alignement vérifié par le CSS seulement : rangée 96+24 = titres 120).
