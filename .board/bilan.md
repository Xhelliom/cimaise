# Bilan — premier affichage de l'accueil et pics de latence

Fait : marques intermédiaires (storageRead, catalogLoaded, homeBuilt, firstPaint, interactive, painted, enriched) ; premier rendu minimal
(1 seule lecture localStorage, tuiles avec nom, logos/teinte/description différés via `enrich()`, logos chargés hors DOM) ; cause du max de
latence enregistrée (événement logo/fondu, GC probable) et affichée au diagnostic ; `font-display: swap`. Avant/après dans docs/decisions.md.
`npm run check` passe (413 tests).

Pas fait : mesure « après » (aucun navigateur ni TV ici). Les cibles (firstPaint < 300 ms, max < 100 ms) sont à vérifier par Stéphane sur la Frame ;
la cause exacte des 583 ms n'est qu'une hypothèse (suspects listés) tant que les nouvelles marques n'ont pas été lues sur la TV.
