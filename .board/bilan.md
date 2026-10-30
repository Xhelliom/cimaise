# Bilan — Apps intégrées (correction critère 3)

Fait :
- `el` sorti dans `packages/plex/src/ui/dom.ts` (sans dépendance) ; `context.ts` le ré-exporte.
- Le panneau des langues Plex (`ui/settings.ts`) ne dépend plus que de tv-core et de `dom.ts` ; il est servi par le chunk `settings.js`.
- `onModuleSettings('plex')` ouvre ce panneau sans jamais charger `plex.js`.
- Test inversé dans `tests/app.test.mjs` : Plex masqué, ses réglages s'ouvrent et `loaded` reste `['settings.js']`.
- Commentaires d'`apps/tv/src/index.ts` corrigés (tuile masquée remise en fin de catalogue, plus de « rang » conservé).
- `npm run check` : vert (628 tests).

Non fait : rien de restant dans le périmètre.
