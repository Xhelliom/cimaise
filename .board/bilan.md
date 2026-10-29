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
- **Captures non publiées** : l'outil `publish_file` de collie-board et son skill ne sont pas disponibles dans cette session. Fichiers prêts dans `.board/captures/`.
- Démarrage en deux temps : le Dock v2 construit fond, titre et pastilles dès le premier affichage (pas de `enhance()` dans `home/`) ; seuls police et touches média restent différées. À trancher si on veut re-différer le décor.
- Pastilles Smart Hub et Réseau : inertes (non spécifiées). Erreur de lancement (ID absent, hors TV) : ouvre le diagnostic caché.
- Le halo de teinte ne change pas quand le focus est sur une pastille (comportement de `home/`, non touché).
