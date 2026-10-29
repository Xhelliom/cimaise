# Bilan — CSS compatible Tizen 5

Fait :
- Diagnostic (touche 0) : ligne `userAgent:` ajoutée à `report()` (packages/tv-core/src/diag.ts).
- home.css : `gap` remplacé par `grid-gap` (.rail) et `>*+*{margin-left}` (.heure, .pastilles). Rendu inchangé (mockups non touchés).
- `scripts/build/check-css.mjs` (liste noire : gap, row/column-gap, aspect-ratio, inset, clamp/min/max, :is/:where/:has, backdrop-filter), branché dans `npm run check` (`check:css`). Aucune devDependency.
- Tests : tests/css-compat.test.mjs (gap flex/grid refusé, grid-gap accepté, autres règles) + test user agent. docs/decisions.md mis à jour.
- npm run check : vert (308 tests).

Non fait / à signaler :
- Le user agent réel reste à relever sur la TV (question M0).
- Hors carte : si la TV est bien en Chromium 56 (Tizen 5.0), CSS Grid (Chrome 57+) pourrait ne pas y être pris en charge du tout ; à confirmer avec le user agent.
- Pas de capture d'écran publiée : rendu non modifié visuellement, aperçu Chrome non rejoué.
