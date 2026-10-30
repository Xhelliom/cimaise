
## Correction : focus en mode « Toutes » et menu des pièces
- Fait : `settle()` dans `scenes.ts` ramène `sel` sur la ligne focalisable la plus proche (jamais un titre) après ajout, retrait, fermeture du clavier et à chaque rendu ; après un ajout le focus passe à la candidate suivante.
- Fait : le menu des pièces omet les pièces dont toutes les scènes sont indisponibles (plus de « 0 »).
- Tests ajoutés : ajout en mode groupé (focus hors titre), retrait/fermeture du clavier, pièce 100 % indisponible. `npm run check` vert (612 tests).
- Reste : rien dans la carte ; à valider à l'œil sur la Frame.
