# Bilan — accès rapide aux scènes Home Assistant

## Fait
- **Accueil** : rangée de pastilles scène (3 à 6, 6 au plus) au-dessus du Dock, aplats sans flou. Haut depuis le Dock y monte, Haut → pastilles Réglages, Bas redescend. Entrée : pastille allumée aussitôt, puis « ✓ » ; erreur → message discret. `createHome.setScenes()` / `onScene`.
- **Absente** si Home Assistant est coupé, refuse le jeton ou n'est pas configuré (`quickScenes` dans `packages/widgets`, testé) : aucun nœud, accueil intact.
- **Réglages → « Scènes Home Assistant »** (`settings/scenes.ts`) : adresse et jeton, filtre par pièce, recherche par lettres, ajout, ordre réglable (Monter/Descendre/Retirer), 6 au plus.
- **Différé** : requête après la 1re peinture et à la fermeture des Réglages ; app.js 33 Ko / 100.
- Tests : `tests/scenes.test.mjs` (modèle), `scenes-home.test.mjs` (accueil), `scenes-settings.test.mjs` (Réglages). `npm run check` vert (460 tests).

## À noter / pas fait
- Saisie de l'adresse, du jeton et de la recherche : `<input>` natif (clavier à l'écran de la TV au focus). **Non testé sur la TV** ; la recherche filtre à la validation (Entrée), pas à chaque lettre.
- Non testé contre le vrai Home Assistant (CORS : `cors_allowed_origins`, voir `docs/decisions.md`).
- Aucun rendu visuel produit (pas de capture à publier).
