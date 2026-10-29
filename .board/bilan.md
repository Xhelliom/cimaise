# Bilan — client Home Assistant minimal

## Fait
- `packages/widgets` : client REST ES5 (ping, liste des scènes avec pièce en un POST /api/template groupé, activation), délai 4 s, erreurs explicites (config, injoignable, jeton refusé, HTTP, format).
- Config lue depuis `cimaise.v1` (`haUrl`, `haToken`) ; aperçu : injection depuis `.local/ha.env` (chemin absolu / `HA_ENV_FILE`) via `/__mocks/ha-session.js`.
- Tests contre un faux serveur (`tests/widgets.test.mjs`) ; `npm run check` vert (438 tests).

## Pas fait / à noter
- Pas d'interface sur l'accueil (hors carte) : le client n'est pas branché, donc coût nul dans le bundle.
- Non testé contre le vrai Home Assistant ni sur la TV. CORS : `cors_allowed_origins` à régler côté HA.
- `package-lock.json` mis à jour (nouveau workspace).
