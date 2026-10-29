# Bilan — fiche série : vus, progression, présélection

Fait :
- Coche « vu » (viewCount > 0) et fine barre de progression (viewOffset/duration) sur les vignettes d'épisode ; coche sur le bouton d'une saison entièrement vue (viewedLeafCount = leafCount). Tuile virtualisée : `done` et `progress` dans `TileInfo` (list.ts), CSS dans plex.css.
- À l'ouverture : saison + épisode « à suivre » (OnDeck, sinon premier non vu de la première saison non terminée, sinon S1 E1) sélectionnés et défilés ; focus initial sur Reprendre/Lire. Ne se rejoue plus après la première touche.
- Retour de lecture : saisons et épisodes rechargés (cache déjà invalidé par `progressed`), coches à jour.
- Tests : 4 nouveaux dans tests/plex-ui.test.mjs ; `npm run check` vert (519 tests).

Reste :
- Les fixtures réelles ne contiennent pas `viewCount` : les scripts de capture le conservent maintenant, mais je n'ai pas accès au serveur ; les tests utilisent des réponses construites à la main sur la forme réelle. À relancer `capture-fixtures.mjs` / `capture-show-fixtures.mjs` pour des fixtures réelles complètes.
