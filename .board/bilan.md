# Bilan — Overseerr activé par défaut quand la clé vient du paquet

## Fait
- `packages/launcher/src/modules/registry.ts` : `configured()` d'Overseerr passe par `overseerrConfigFrom(p)` ; la clé
  injectée par `local-config.js` (`window.__cimaiseOverseerr`) suffit donc à activer le module et à poser sa tuile
  (`addNewTiles`) après une installation à neuf. Un « Masqué » explicite (`prefs.modules.overseerr = false`) reste prioritaire.
- Réglages > Apps intégrées > Overseerr : la ligne « Clé API » affiche « Fournie par le paquet » (jamais la clé) ;
  l'adresse affichée est celle du paquet si rien n'est saisi ; « Tester la connexion » marche sans saisie (le chunk
  Réglages ajoute la clé du paquet, la vue ne la reçoit jamais).
- Tests : repli dans `tests/modules.test.mjs` (activé, tuile ajoutée, masqué explicite respecté, paquet sans clé → masqué) ;
  affichage dans `tests/overseerr-settings.test.mjs`. `npm run check` : 731/731, app.js 40,06 Ko / 100 Ko.

## Pas fait
- Non vérifié sur la Frame : l'installation à neuf (désinstaller, réinstaller un paquet avec overseerr.env) demande
  d'agir sur la TV ; c'est la recette.
