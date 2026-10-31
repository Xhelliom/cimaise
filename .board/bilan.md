# Bilan — défilement animé des rangées (grille Films/Séries) (31/10)

Rien de tout ça n'existait sur la base (741f527) : la couche était déplacée sans transition.

## Fait
- `packages/tv-core/src/virtual/list.ts` : la couche glisse (`transform` seul, `translate3d`, 180 ms ease-out, `SLIDE_MS`)
  quand le focus pousse la fenêtre d'une ligne. Vaut pour la grille verticale **et** les rangées horizontales
  (accueil Plex, fiche, recherche, Overseerr), puisque tout passe par `VirtualList`.
- Touche maintenue : la durée est ramenée à 60 % de l'intervalle entre deux répétitions, et coupée sous 50 ms.
  Chaque glissement finit avant le suivant : pas de retard cumulé, et le décalage visible ne dépasse jamais une ligne.
- Pas de trou : la marge de virtualisation ±1 garde la ligne entrante (avec son image) et la ligne sortante dans le DOM.
- Sauts sans animation : barre alphabétique (`jumpTo`), `setFocus`, `reset`, `setCount`. La barre alphabétique ne change pas.
- La transition et le transform de la couche ne sont réécrits que lorsqu'ils changent. Coût : quelques lignes de JS, aucun asset.
- Tests ajoutés dans `tests/virtual.test.mjs` : glissement au pas, ligne entrante rendue, touche maintenue
  (raccourci, puis coupé), sauts sans animation, rangée horizontale. `npm run check` passe (728 tests, ES5, budgets).
- Vérifié dans l'aperçu navigateur (`/demo/virtual`) : une transition CSS de 180 ms est créée au pas,
  de 62 ms à une répétition toutes les 100 ms, et aucune à une répétition toutes les 30 ms.

## Pas fait
- **Latence touche→frame sur la Frame (avant/après), à mesurer par Stéphane** : diagnostic (touche 0), descendre
  et remonter dans une bibliothèque, relever le max. Si le max dépasse 100 ms, baisser `SLIDE_MS`.
  Je n'ai pas accès à la TV, donc ce critère reste ouvert. Le glissement lui-même reste à constater sur la TV.
- Pas de rendu publié : une capture fixe ne montre pas un glissement de 180 ms, et les transitions ne s'animent pas
  dans un onglet en arrière-plan.
- Pas de commit : les modifications sont dans l'arbre de travail de la branche.
