# Bilan — Apps intégrées (corrections)

Fait :
- tests/app.test.mjs : nouveau test « masquer les Scènes retire la rangée, sans nouvelle requête vers Home Assistant ». Départ : Scènes activées, rangée affichée (réponse HA simulée via l'option `haReply` du mock XHR) ; interrupteur sur Masqué, fermeture des Réglages : rangée disparue, compteur de requêtes inchangé.
- packages/launcher/src/modules/registry.ts : le commentaire dit honnêtement que `chunk` et `settings` sont documentaires et liste ce qu'il faut câbler dans apps/tv/src/index.ts pour un nouveau module (Overseerr).
- `npm run check` : 629 tests, 0 échec.

Non fait : le câblage générique par le registre (openInternal / onModuleSettings / chargement de chunk lisant MODULES) — choix de documenter plutôt que refactorer, comme le permettait la carte.
