# Bilan — bibliothèque de logos et descriptions

## Fait
- 20 apps connues (`packages/launcher/src/catalog/known-apps/`) : 19 logos Wikimedia Commons (PNG 256 px, palette, 0,7 à 4,7 Ko chacun) + pictogramme Smart Hub dessiné pour le projet (Samsung n'a pas de logo libre pour Smart Hub / mode Art), description d'une ligne en français.
- Rattachement par nom (casse, accents, « + »/« plus », ponctuation, suffixes « officiel », « app »), jamais par ID.
- Ordre : icône TV, puis logo bibliothèque, puis monogramme (`applyIcon`, statut `logo` dans le diagnostic).
- Dock : logo + description sous le titre. Réglages → Découvrir : logo + nom + description ; inconnues = monogramme.
- Build : dossier `logos/` copié dans `dist/` (jamais bundlé) ; aperçu navigateur sert `/app/logos/`.
- Provenance : `THIRD_PARTY_NOTICES.md` (nouveau, à la racine).
- `npm run check` : vert (212+ tests).

## Poids
- Logos : 57,0 Ko. `.wgt` : 43,0 → 102,3 Ko (budget 1,5 Mo).
- `app.js` : 18 038 → 21 050 o (+3 012 o) : ce n'est PAS « inchangé » ; c'est la table nom→logo/description, nécessaire au Dock au premier affichage. Aucune image dans le JS. `settings.js` : +3,0 Ko (copie de la table, chunk séparé).

## Non fait / à noter
- Rendu visuel du Dock non vérifié : le navigateur n'a pas pu joindre l'aperçu local. Position de `.desc` (top 646 px) et coins arrondis des images à contrôler sur l'aperçu/TV.
- Logo « Max » = « HBO Max (2025) » (seul disponible sur Commons).
- Statut des logos : « domaine public (logo de texte) » côté Commons, mais marques déposées ; retrait documenté dans les notices.
- Descriptions affichées seulement dans le Dock et la liste Découvrir (pas sur les lignes du catalogue).
