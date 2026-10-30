# Bilan : module Overseerr, tuile du Dock et rangées « du moment »

## Fait
- **Chunk `overseerr.js`** (`apps/tv/src/chunks/overseerr.ts`) : injecté à la 1re ouverture de la tuile seulement, jamais au
  démarrage ni si le module est masqué ; il porte l'écran, le client, le XHR et son CSS (injecté en `<style>`, `app.css` inchangé).
- **Tuile Overseerr** dans le Dock (`catalog/defaults.ts`, `tileId: 'overseerr'` au registre) ; masquée tant que non configuré ;
  ajoutée en tête d'un catalogue déjà enregistré dès que le module est activé (`addNewTiles`), sans revenir si on la retire.
- **Écran** (`packages/overseerr/src/ui/home.ts`) : « Films du moment » / « Séries du moment », deux `VirtualList` 240×360
  (≤ 9 tuiles DOM par rangée), page suivante à 8 titres de la fin, doublons écartés, titres en français, affiches TMDB `w185`
  (jamais plus grandes que l'affichage), images libérées en quittant l'écran. Badges Disponible / Partiel / Demandé / En attente
  (pastille `vbadge` ajoutée à `VirtualList`).
- **Aperçu sur l'instance réelle** : `scripts/dev/server.mjs` lit `.local/overseerr.env` et relaie les XHR (`/__overseerr/…`,
  GET seulement, Overseerr n'envoyant pas de CORS). Vérifié dans Chromium : tuile → écran sans rechargement (aucun index.html ni
  app.js redemandé), 0 requête Overseerr/TMDB au démarrage, pages 1 films + séries puis page 2 au défilement, badge « Disponible »
  vu (Astérix), 0 image restante après Retour. 4 captures publiées sur la carte.
- **Poids** : `overseerr.js` 14,1 Ko min (5,4 Ko gzip) ; `app.js` 38,22 → 39,10 Ko (+0,88 Ko, +0,2 Ko gzip) ; `app.css` inchangé.
- Tests : `tests/overseerr-ui.test.mjs` (6), app (2 nouveaux), registre (1) ; `npm run check` vert (678 tests). Entrée dans
  `docs/decisions.md`. Clé absente du diff, de `dist/` et du `.wgt` (grep : 0).

## Pas fait / à noter
- **Pas essayé sur la Frame.** Point à surveiller : les affiches viennent de `image.tmdb.org`, origine non déclarée en
  `<access origin>` (la sonde n'a testé que l'origine Overseerr) ; si les rangées s'affichent sans affiches, c'est là.
- Entrée sur une affiche ne fait rien : la fiche (et « Demander ») est le lot suivant (`onOpen` prévu dans l'écran).
- Pastilles « Rechercher » / « Mes demandes » de la maquette non posées : elles n'ouvriraient rien.
- Une page ne se met pas en cache : chaque ouverture redemande les deux premières pages (≈ 2 requêtes).
