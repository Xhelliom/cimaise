
## Reprise : styles des titres de pièce et scènes choisies
- Fait : règles CSS `.reglages .ligne.titre` (discret, 64 px, non sélectionnable via pointer-events:none, puce de compteur atténuée) et `.reglages .ligne.choisie` (aplat + liseré gauche, en plus du ✓) dans packages/launcher/src/settings/screen.ts ; test de la feuille de style dans tests/scenes-settings.test.mjs. `npm run check` vert (613 tests).
- Non fait : aucun rendu sur la TV réelle (non vérifié physiquement).
