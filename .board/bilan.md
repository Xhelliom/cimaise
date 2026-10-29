# Bilan

## Fait
- Premier rendu minimal, marques intermédiaires (storageRead, catalogLoaded, homeBuilt, firstPaint, interactive, painted) au diagnostic.
- Cause du max de latence enregistrée ; pré-décodage des logos.
- Dernier correctif : le pré-décodage ne retire plus l'entrée `unpainted`, il la marque. L'appui qui amène le logo à l'écran consigne `1re peinture logo <fichier> (pré-décodé)` (ou sans mention si non pré-décodé). Tests : rAF factice flushé avant l'appui, + cas sans rAF. docs/decisions.md aligné. `npm run check` vert (417 tests).

## Pas fait
- Mesures sur la Frame : à faire par Stéphane (firstPaint < 300 ms, max < 100 ms). Un max élevé avec « (pré-décodé) » dira que le pré-décodage n'aide pas.
