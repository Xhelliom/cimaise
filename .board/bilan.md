Issue : codé

- Valeurs réelles relevées sur le serveur (lecture seule, jeton masqué) avec `scripts/plex/list-content-ratings.mjs` :
  Films G, PG, PG-13, R, NC-17, TV-14, TV-MA, Not Rated, Passed ; Séries TV-Y, TV-Y7, TV-PG, TV-14, TV-MA, Not Rated.
  Aucun code FR sur ce serveur. Table + comptages consignés dans docs/decisions.md (entrée du 2026-11-07).
- Fonction pure `ageLabel()` (packages/plex/src/ui/age.ts) : US cinéma/TV, FR, DE, UK ; inconnu (Not Rated, Passed…) → null.
- Fiche (detail.ts) : pastille sobre (contour) après année · durée ; code inconnu → masquée + événement « âge inconnu <code> »
  dans le diagnostic. Série : contentRating de la série.
- Tests : table complète + fiche (PG-13, TV-MA, Not Rated, code jamais affiché). `npm run check` vert (739 tests).
- Coût : +0,8 Ko sur le chunk différé plex.js, +0,2 Ko CSS, 0 sur le JS initial.

Pas fait :
- Pastille sur une « fiche d'épisode » : il n'en existe pas, un épisode ouvre toujours la fiche de sa série (qui montre
  l'âge de la série, conforme à la demande).
- TV-14 → « -12 ans » est approximatif, à confirmer par Stéphane.
- Pas d'installation ni de mesure sur la Frame (hors carte). Capture : rendu navigateur avec le CSS réel (fiche-age.jpg).
