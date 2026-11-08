Issue : partiel

Fait :
- Premier rendu : une tuile à logo n'a que sa couleur de marque ; logo posé en fondu d'opacity 150 ms (mention « officiel »
  comprise) ; nom si pas de logo, si le logo échoue (onerror, tout de suite), ou si la tuile est encore muette 3 s après le
  début du chargement des logos (enrich). Marques diagnostic `logos` et `noms en repli ×N`.
- Critère 1 rempli : **aucun nom avant le logo, vu par Stéphane à froid sur la Frame** (et sur TV2) après le correctif.
- Critère 2 couvert par les tests (logo en échec → nom ; app sans logo → nom) ; non provoqué sur la TV.
- firstPaint sur la Frame : +449 ms contre +583 ms au dernier relevé → pas de recul.
- Correctifs en route : le délai de 400 ms compté depuis le premier rendu pouvait échoir pendant le script de démarrage ;
  compté depuis enrich, TV2 (photo du diagnostic) montrait encore les 7 noms ≈ 200 ms (logos à 1,3 s) ; porté à 3 s.
  Sur la Frame les logos arrivent ≈ 690 ms après enrich.
- Tests 761/761 ; app.js 40,55 Ko / 100. Installé sur Frame et TV2. Commits ffe24a2, 461e451, 3d07893, 9190312 et suivant.

Pas fait :
- Latence touche→focus sur la Frame non relevée (aucun appui avant la touche 0 sur la photo) : le critère 3 reste à
  compléter. Dernier relevé sur la Frame : max 298 ms. Dans l'aperçu : identique avant/après.
