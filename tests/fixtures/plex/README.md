# Fixtures Plex

Réponses **réelles** du serveur du homelab et de plex.tv, réduites et anonymisées par
`scripts/plex/capture-fixtures.mjs` (lecture seule, liste blanche de champs) : titres et résumés remplacés,
identifiants renumérotés, hôtes en plages de documentation (192.0.2.0/24, 203.0.113.0/24, hash `0…0`),
jetons factices. Quelques valeurs numériques sont forcées pour les tests (ex. `viewOffset` de onDeck).
Ne pas éditer à la main : relancer le script (il échoue si un secret ou un hôte réel subsiste).

`pin-*.json` sont écrits à la main : créer un PIN écrit chez plex.tv, ce que la vérification s'interdit.
