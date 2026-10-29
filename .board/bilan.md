# Bilan — client Plex vérifié contre le vrai serveur

**Fait**
- `scripts/plex/verify.mjs` (+ `lib.mjs`) : appelle chaque fonction du client sur le vrai serveur, lecture seule (GET/HEAD uniquement), sortie sans secret. Passe : « tout est conforme ».
- `scripts/plex/capture-fixtures.mjs` : régénère les fixtures depuis des réponses réelles, anonymisées par liste blanche, avec garde-fou anti-secret.
- Client corrigé : `Server.owned`, champs d'épisode et `year` sur `Item`, `getHubs` + type `Hub`.
- Fixtures remplacées par des réponses réelles anonymisées (sauf `pin-*.json`, manuels : créer un PIN écrit chez plex.tv).
- Écarts et résumé consignés dans `docs/decisions.md`. `npm run check` vert (152 tests).

**Pas fait / à noter**
- Choix du serveur possédé vs partagé : laissé à l'UI (`owned` exposé).
- `recentlyAdded` mélange musique, saisons et films : à filtrer côté UI.
- Acceptation du certificat plex.direct par Tizen 5 : non testé sur la TV.
- Le gate `npm run check` n'exécute pas verify.mjs (réseau, secrets).
