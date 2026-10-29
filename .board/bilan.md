# Bilan — accueil Dock v2 (packages/launcher/src/home)

## Fait
- Bug du focus corrigé (`screen.ts`) : Haut a sa propre branche, plus de double `grid.move('up')` (11 → 7, pas 3). Test ajouté : rangée 3 → 2 → 1 → pastilles.
- Rebasé sur main. Conflits `device.ts` et `server.mjs` : launchApp de main conservé (NO_APP_ID, repli launchAppControl), mon doublon et son test supprimés.
- L'écran lit le catalogue de main (`CatalogEntry` : `color`, `type`). Un `type: 'interne'` (Plex intégré) appelle `openInternal(id)` (routeur) ; les autres passent par `device.launchApp`.
- `home.ts` (ancien accueil, utilisé par apps/tv) reste à côté de `home/` : démo et tests importent `home/index` explicitement ; apps/tv se construit toujours (tests de build verts).
- Routes `/demo/home*` (page, js, css, police) rétablies dans `scripts/dev/server.mjs`.
- `npm run check` : 146 tests verts.

## Pas fait / à noter
- apps/tv utilise encore l'ancien `home.ts` : le brancher sur le Dock v2 est une autre carte (les deux exportent `createHome`, donc `launcher/src/index.ts` n'exporte pas `home/`).
- Les Réglages travaillent encore sur `AppEntry` (tint) ; la démo convertit dans les deux sens.
- Aucun nouveau rendu visuel produit (rendu inchangé par rapport aux captures déjà publiées) ; latence mesurée dans le HUD de la démo.
