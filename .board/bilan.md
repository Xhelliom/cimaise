# Bilan — latence du focus dans le Dock
Fait : sonde keydown→2 rAF (min/méd/max des 20 derniers, diagnostic touche 0) ; teinte différée de 150 ms (focus immédiat) ; calques de teinte en 960×540 mis à l'échelle ; will-change sur tuiles et calques ; titre/description en hauteur fixe ; docs/decisions.md ; tests ajoutés ; npm run check vert (314 tests).
Pas fait : mesure avant/après dans l'aperçu (le navigateur de la session n'atteint pas localhost) ; pré-décodage des logos (pas de mesure qui le justifie). Mesure TV à faire par Stéphane.
