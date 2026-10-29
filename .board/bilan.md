# Bilan — recherche dans le Plex intégré

**Fait** (npm run check vert, 589 tests) : index local des titres (`packages/plex/src/ui/search-index.ts`), écran de recherche clavier + résultats en rangées virtualisées (`ui/search.ts`), complément serveur `/hubs/search` (épisodes) annulable, dernières recherches (`prefs.plexSearches`), bouton « Rechercher » sur l'accueil Plex, mesures `frappe` / `recherche` / `recherche-serveur` dans le diagnostic, `Keyboard.canMove`. Tests : `tests/plex-search.test.mjs` (13) + 1 dans `tests/keyboard.test.mjs`.

**Mesuré (Node, vrai serveur, lecture seule)** : index de 497 titres construit en 0,6 s, 23 Ko stockés (~46 o/titre, ~160 Ko pour 3 400) ; recherche locale 0,2–1 ms ; `/hubs/search` 50–314 ms.

**Pas fait / à faire par Stéphane** : mesures sur la TV (frappe → caractère < 50 ms, frappe → résultats < 800 ms) ; l'aperçu navigateur n'a pas pu être capturé ici (le navigateur n'atteint pas 127.0.0.1), donc aucune capture publiée ni mesure sur aperçu bridé. Acteurs non montrés (ce sont des étiquettes sans fiche). Touches de couleur/chiffres du clavier non branchées au routeur. Le test d'ouverture d'un épisode n'est pas couvert par un cas dédié.
