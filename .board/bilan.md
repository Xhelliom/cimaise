# Bilan — brancher le vrai Dock, le catalogue et les réglages dans apps/tv

## Fait
- `apps/tv/src/index.ts` : `home/` (Dock v2) alimenté par `loadCatalog()` ; Entrée = `device.launchApp` (via `home/`), type `interne` (Plex intégré) = chunk Plex par le routeur ; pastille Réglages = chunk settings ; `onChange` → `saveCatalog` + `home.setCatalog`.
- `apps/tv/src/chunks/settings.ts` : vrai écran `settings/` + adaptateur AppEntry↔CatalogEntry (conserve `type` et `todo`) ; erreur synchrone hors TV ramenée au rappel d'erreur.
- Supprimés : `home.ts`, `tiles.ts`, `settings.ts`, et `tint.ts` (seulement utilisé par l'ancien home). `launcher/src/index.ts` exporte catalog + home (settings reste hors bundle initial).
- CSS : `style.css` importe `home/home.css` ; police Outfit en `dist/fonts/` (loader `file` d'esbuild, `build.mjs`), routes de l'aperçu et `wgt.test` ajustés. Police décorative toujours différée (`body.late`).
- Tailles : app.js 15,68 Ko (budget 100), settings.js 5,03 Ko (différé), plex.js 0,26 Ko, .wgt 32,17 Ko (budget 1,5 Mo). apps/blank inchangé (app.js 8,30 Ko, .wgt 4,82 Ko, aucun fichier touché).
- Tests : `app.test.mjs` réécrit (catalogue, lancement, réglages → accueil, persistance, retrait/déplacement) ; `build/dev/wgt` adaptés. `npm run check` : 150 tests verts.
- Captures : `.board/captures/` (accueil, réglages, accueil après changement de couleur : tuile 1 passée de jaune à rouge).

## Pas fait / à noter
- **Captures non publiées** : aucun outil `publish_file` de collie-board n'existe dans cette session (ToolSearch « publish_file » : aucun résultat ; pas de serveur MCP ni de skill collie-board, aucune URL ni jeton pour le curl). Aucun appel n'a donc été tenté : pas de message d'erreur à citer. Fichiers prêts (locaux, `.board/` est ignoré par git) : `.board/captures/accueil.jpg`, `reglages.jpg`, `accueil-apres-reglage-couleur.jpg`. À publier depuis une session qui dispose de l'outil.
- Démarrage en deux temps : **volontairement conservé tel quel**. Le Dock v2 fait partie du premier affichage : fond = aplat CSS (`#0b0b0d`, aucune image), titre et pastilles = une dizaine de `div`. Coût négligeable (app.js 15,68 Ko, ni image ni flou) ; différer le décor ferait apparaître un accueil nu puis le décor, sans gain mesurable, et demanderait de modifier `home/`, hors carte. Restent différés (`setTimeout 0`) : police décorative et touches média ; réglages et Plex en chunks.
- Pastilles Smart Hub et Réseau : inertes (non spécifiées). Erreur de lancement (ID absent, hors TV) : ouvre le diagnostic caché.
- Le halo de teinte ne change pas quand le focus est sur une pastille (comportement de `home/`, non touché).
