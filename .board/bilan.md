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

- Commit 383d9a1 (code, tests, bilan).
- Empaquetage (31/10, 10:48) : `scripts/tizen/package.sh apps/tv/dist` → `dist/cimaise.wgt` (181 957 octets), signé
  avec le certificat auteur habituel (identité d'app inchangée). Le profil de signature attend `/work/.local/certs` :
  copie temporaire de `certs/` dans le `.local/` du worktree, supprimée après l'installation.
- Installation sur la Frame (31/10) : `scripts/tizen/install.sh`.
  - **Réponse du SDK** : `app_id[cimaise001] install completed`, `cmd_ret:0`, app présente dans `applist`.
  - **Observé physiquement** : en attente de Stéphane.

## Pas fait / en attente
- **Critère 1, glissement sans trou ni saut** : non testé sur la TV, en attente du retour de Stéphane.
- **Critère 2, touche maintenue sans retard** : couvert par les tests et l'aperçu navigateur ; non testé sur la TV.
- **Critère 3, latence max < 100 ms au diagnostic (touche 0)** : non mesuré, en attente du relevé de Stéphane.
  Si le max dépasse 100 ms, il faudra baisser `SLIDE_MS` (list.ts), puis réempaqueter et réinstaller.
  Il n'y a pas de mesure « avant » sur la TV : la version précédente n'a pas été relevée avant l'installation.
- Pas de rendu publié : une capture fixe ne montre pas un glissement de 180 ms, et les transitions ne s'animent pas
  dans un onglet en arrière-plan.

## Retour de Stéphane
- (à compléter : glissement vu ou non, trou éventuel, ligne « latence touche→frame » et « cause du max »)
