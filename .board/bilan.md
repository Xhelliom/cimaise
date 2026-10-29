# Bilan — écran Réglages du launcher
Fait : packages/launcher/src/settings (model.ts pur, screen.ts, index.ts), tests/settings.test.mjs. `npm run check` vert (108 tests).
- Retrait, réordonnancement (saisie + haut/bas), couleur (palette de 8), ajout depuis la découverte (id, nom, icône) : testés.
- Découverte seulement sur Entrée du bouton ; l'erreur (ex. NO_TIZEN) s'affiche telle quelle.
- Module non importé par l'index du launcher : absent du bundle initial (testé). Charge par `createSettings(opts)` via le routeur.
Non fait / hypothèses :
- Le catalogue (AppEntry) et `listInstalledApps` n'existaient pas dans le dépôt : injectés par `SettingsOptions` (listInstalledApps à rappels, onChange pour persister). La carte de branchement devra les fournir.
- Pas de rendu visuel publié (aucune capture faite) ; styles injectés par le module (<style>) au premier affichage.
- apps/tv non touché.
