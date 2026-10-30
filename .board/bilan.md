# Bilan : focus homogène, indice de débordement des rangées, installation sur la Frame (30/10)

## Fait (commit 379e40e)
- **Focus homogène** dans tout le module Plex : anneau blanc net 6 px + `scale(1.06)`, transition sur `transform` seulement.
  Repris : affiches (accueil, grille, épisodes, recherche), pastilles de saison, lettres, serveurs, réglages, dernières recherches,
  menu Audio/Sous-titres et dialogue du lecteur (plus aucune « pastille inversée » blanche). Exceptions voulues : barre de
  progression du lecteur (anneau sans scale, elle porte le curseur), repère du clavier (anneau sans scale, déjà translaté).
  Saisons : la pastille passe sur le libellé (la tuile porte son translate en ligne) ; réglages : lignes placées par `top`.
- **Indice de débordement** : chevron › sur disque sombre au bord droit, fondu d'opacité, tant que des éléments suivent hors
  écran ; rangées de l'accueil, saisons et épisodes de la fiche, recherche. Porté par `VirtualList` (option `edge`, classe
  `shown` touchée au changement seulement). Pas de dégradé de bord ni de compteur « 7 sur 8 » (coût, cf. `docs/decisions.md`).
- Tests : +3 (débordement dans `virtual.test`, règles de focus et chevron dans `plex-ui.test`) ; `npm run check` OK (710 tests).
- **Latence (aperçu, CPU ×4, vraie bibliothèque)** : accueil méd 20–22 → 16–18 ms, max 34–36 → 30–34 ; grille 24/37 → 25/37 ;
  fiche 13/31 → 14/29. Inchangée (bruit). Tableau dans `docs/decisions.md`.
- Poids : `app.css` +734 o min, `plex.js` +324 o, `app.js` +147 o. Aucune image.
- `package.sh apps/tv/dist` → `dist/cimaise.wgt` signé ; **installé sur la Frame** : « install completed » + app présente
  dans la liste (réponse du SDK). Captures avant/après publiées sur la carte (`focus-*.png`), recette écrite.

## Pas fait / pas vérifié
- **Vu par Stéphane : en attente.** Le SDK dit installé ; rien n'est confirmé à l'écran.
- **Latence sur la Frame : pas mesurée** (aperçu seulement, qui ne reproduit pas le coût de la TV). À relever : touche 0 après
  ~20 appuis dans l'accueil Plex.
- Lecteur en lecture réelle non capturé (pas d'AVPlay dans l'aperçu) : seul le dialogue d'échec a été vu.
- Note : le worktree n'a pas de `.local` ; empaquetage et installation via un relais docker qui monte en lecture seule le
  `.local` du checkout principal (dossier `.local/` vide créé ici comme point de montage, ignoré par git).
