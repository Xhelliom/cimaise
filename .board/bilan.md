# Bilan — wrapper AVPlay (tv-core)

Fait :
- `packages/tv-core/src/player/avplay.ts` : `createPlayer()`, seul point d'appel à `webapis.avplay` (cycle complet, pause/seek/±10 s, pistes audio/texte, sous-titres, événements, visibilitychange → `onSuspend(position, url)` puis stop/close). Exporté par `tv-core`.
- `tests/player.test.mjs` : 13 tests sur fausse API injectée (cycle, reprise, pistes, événements, erreurs, visibilitychange, absence de TV).
- `docs/decisions.md` : section AVPlay (inclusion `$WEBAPIS/webapis/webapis.js`, privilèges `developer.samsung.com/privilege/avplay` + `tizen.org/privilege/internet`).

Non fait / pourquoi :
- `config.xml` et `index.html` NON modifiés : la carte demande de documenter, et aucun écran n'appelle encore le lecteur. À faire avec le premier écran de lecture (M3).
- Privilèges non vérifiés sur la TV ni contre la doc Samsung en ligne (hors ligne).

Checks : `node --test --test-concurrency=1 tests/*.test.mjs` 94/94. `npm test` en parallèle a 2-4 échecs aléatoires (course sur `apps/tv/dist` entre tests de build), reproduits sur la base sans mes changements : hors carte.
