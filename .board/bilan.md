# Bilan : client API Overseerr (`packages/overseerr`)

## Fait
- Paquet `packages/overseerr` (TypeScript → ES5, sans dépendance, transport XHR injectable, rappels), sur le modèle du client Plex :
  `discoverMovies`, `discoverTv`, `trending`, `search`, `requestMedia`, `availability` / `availabilityLabel` (badge),
  `posterUrl` (w185/w300 seulement), `appendTitles` (fusion de pages sans doublon), `overseerrConfigFrom` (Réglages puis copie empaquetée).
- Vérifié en lecture seule contre la vraie instance (1.33.2) : `node scripts/overseerr/verify.mjs` → « Tout est conforme ».
  Trois constats réels intégrés au client :
  - recherche : `! ' ( ) *` non encodés → 400 ; encodage strict ajouté (`strictEncode`) ;
  - clé refusée → **403** et non 401 : mappé sur `unauthorized` en lecture ;
  - TMDB répète 2 à 4 titres d'une page à l'autre : `appendTitles` les retire.
- **Aucune vraie demande envoyée.** POST /request vérifié contre la doc OpenAPI de l'instance et des demandes existantes (GET) ;
  le transport des scripts refuse tout verbe autre que GET/HEAD (testé).
- Fixtures anonymisées (`scripts/overseerr/capture-fixtures.mjs`, liste blanche, titres/ids/affiches remplacés, contrôle hôte/clé),
  17 tests unitaires (dont bundle ES5 par es-check) ; `npm run check` vert (654 tests).
- Poids : **5,2 Ko minifié (2,2 Ko gzip)**, importé par aucune entrée : `app.js` et les chunks inchangés.
- docs/decisions.md (entrée du 30/10), docs/tv-status.md (affiches TMDB sur la Frame : non testé).

## Pas fait
- Aucun écran ni chunk : le module n'est branché nulle part (lots suivants : Réglages pour la clé, écran Overseerr).
- Saisie de la clé dans les Réglages : hors carte (lot suivant) ; le client lit déjà `prefs.overseerrUrl` / `prefs.overseerrKey`.
- Affiches `image.tmdb.org` depuis la Frame : non essayé (repli `/imageproxy/` de l'instance prévu par `posterUrl`).
- Réponses 409 (déjà demandé) et 403 sur POST : mappées d'après le code d'Overseerr, jamais observées (écriture interdite).
- Statut 2 (« En attente ») jamais observé en réel : les demandes de la clé admin sont approuvées d'office ; couvert par test.
