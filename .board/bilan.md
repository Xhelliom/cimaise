Issue : partiel

Codé, testé, installé sur la Frame ; reste à faire : Stéphane doit confirmer à l'écran (critère « vu par Stéphane »).

Fait (08/11/2026) :
- Pilule « Âge » dans chaque bibliothèque, à côté de « Tri » et « Non vus » : Entrée fait défiler Tous → Tous publics → -10 ans → -12 ans.
  Mémorisée par bibliothèque (prefs.plexLibrary[clé].age, sans changer le schéma ; « Tous » retire le champ).
- Grille filtrée par le serveur (contentRating=… sur /all et /firstCharacter) : compteur, pagination et barre alpha justes.
  Vérifié sur le vrai serveur (scripts/plex/probe-age-filter.mjs). Le filtre est sensible à la casse : les codes viennent des
  classifications présentes dans la bibliothèque (≈ 1 Ko, en cache 1 h), triées par la table d'age.ts.
- Rangées « En cours » / « Ajoutés récemment » filtrées localement ; non classés masqués dès qu'un âge est choisi.
- Sur « Tous » : mêmes URL, mêmes clés de cache, aucune requête de plus (testé).
- Tests : codes par âge sur les valeurs réelles du serveur, défilement de la pilule, mémorisation, rangées, cas sans code. npm run check vert (753).
- Coût : plex.js +2,1 Ko minifié (+0,7 Ko gzip), app.js inchangé (docs/decisions.md).
- Aperçu navigateur sur le vrai serveur : captures age-series-rangees.jpg et age-series-grille.jpg publiées sur la carte.
- Frame : install.sh → « install completed » + app présente (côté SDK seulement, consigné dans docs/tv-status.md).

Pas fait / à noter :
- Pas encore vu sur la Frame par Stéphane.
- Classification issue de l'agent de métadonnées : quelques séries ados (Malcolm, Doctor Who, Bref…) sont TV-PG et passent en « -10 ans ».
