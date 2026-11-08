Issue : codé

Codé, testé, installé et lancé sur la Frame ; vu par Stéphane (« Tout est conforme » pour Films, Séries, puis l'accueil et la reprise dans les bibliothèques, consigné dans docs/tv-status.md).

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
- Frame : install.sh → « install completed » + app présente ; launch.sh → « launched » ; Stéphane : « Tout est conforme » (Films et Séries).

Suite demandée par Stéphane (« j'aurais bien mis la pilule dès l'accueil ») :
- Pilule « Âge » au bout de la ligne Rechercher · roue dentée · onglets de l'accueil Plex ; filtre local des rangées En cours,
  Ajoutés récemment, Pas encore vus ; non classés masqués, rangée vide masquée, bandeau suit (vidé si plus rien).
- Les saisons n'ont pas de classification sur le serveur : jugées sur leur série (séries permises de chaque bibliothèque de
  séries, ≈ 21 à 55 Ko selon l'âge, en cache 1 h ; rien sur « Tous »).
- Choix de Stéphane : l'âge de l'accueil est le défaut des bibliothèques, un choix propre à une bibliothèque reste prioritaire.
- Mémorisé dans prefs.plexHomeAge (absent = Tous). Tests ajoutés ; npm run check vert (757). plex.js +2,4 Ko minifié, app.css +0,2 Ko.
- Frame : « install completed » + « launched » ; Stéphane : « Tout est conforme » (accueil et reprise dans les bibliothèques).
- Capture : age-accueil-moins10.jpg publiée sur la carte.

Pas fait / à noter :
- Classification issue de l'agent de métadonnées : quelques séries ados (Malcolm, Doctor Who, Bref…) sont TV-PG et passent en « -10 ans ».
