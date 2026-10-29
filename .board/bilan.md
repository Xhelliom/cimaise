# Bilan — Tuiles à l'écran : 4 / 5 / 6

Fait :
- Réglages : ligne « Tuiles à l'écran » (4 / 5 / 6) sous « Affichage de l'accueil », même section ; gauche/droite (borné) ou Entrée (4→5→6→4) ; appliqué tout de suite à l'accueil (`setTiles`, sans reconstruire les tuiles).
- Géométrie déduite : largeur = (bac − marges − écarts) / n, hauteur au même ratio 378×216 ; 5 et 6 = classes `n5` / `n6` (aucune classe à 4), logos 120 / 96 px, monogramme 88 / 72 px, rayons concentriques conservés. Aucun asset, aucune minuterie.
- Mode grille : n colonnes. Mode une rangée : les n premières tuiles entières sans défilement, puis défilement avec la suivante esquissée.
- Stockage `cimaise.v1` passé en schéma v2 (migration v0→v1→v2, `prefs.homeTiles`, défaut 4) ; `loadHomeTiles` / `saveHomeTiles`.
- Tests ajoutés/adaptés : home (modèle, 4/5/6 grille et rangée, setTiles, CSS lisibilité, persistance), settings, app (bout en bout), tv-core (migration). `npm run check` vert (344 tests).

Changement de comportement à signaler : en mode une rangée la tuile passe de 370 à 378 px (4 tuiles exactement entières, au lieu de ~3,5). « Affichage de l'accueil » est maintenant 2 crans au-dessus de Découvrir (tests adaptés).

Non fait : aucun rendu visuel publié (pas de capture réalisée).
