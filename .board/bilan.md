# Bilan : recherche Overseerr avec le clavier à l'écran

## Fait
- **Pastille « Rechercher »** sur l'accueil Overseerr (Haut depuis « Films du moment »), Entrée empile l'écran de recherche
  (`packages/overseerr/src/ui/search.ts`, dans le chunk `overseerr.js` ; `nav.push` passé par `apps/tv/src/index.ts`).
- **Clavier réutilisé, pas copié** : `createKeyboard` de `tv-core/src/keyboard`, le même module que la recherche Plex et les
  Réglages (test : `search.ts` importe tv-core et ne contient aucune disposition de touches).
- **Requête après une pause de frappe** : 400 ms de silence, 2 caractères minimum ; un déplacement sur le clavier relance le
  silence (sinon chaque lettre partait au D-pad : vu dans l'aperçu, corrigé, puis 0 requête pendant la frappe et 1 seule pour
  « alien ») ; « valider » envoie tout de suite ; réponse d'un texte dépassé ignorée.
- **Résultats mêlés films/séries avec badge** : grille virtualisée 2 colonnes, affiches w185 natives, badge de disponibilité
  (`badgeFor` partagé, déplacé dans `ui/badge.ts`), « Film · année » / « Série · année » sous l'affiche, pagination.
- **Retour ramène à l'écran Overseerr** : jamais consommé par la recherche, le routeur dépile (vérifié dans l'aperçu).
- Tests : `tests/overseerr-search.test.mjs` (8). `npm run check` vert (686 tests). Entrée dans `docs/decisions.md`.
- Poids : `overseerr.js` 14,1 → 22,1 Ko min (8,3 Ko gzip), clavier compris ; `app.js` +0,03 Ko ; `app.css` inchangé.
- 4 captures de l'aperçu sur l'instance réelle publiées sur la carte.

## Pas fait / à noter
- **Pas essayé sur la Frame** (latence de frappe, grille).
- Entrée sur un résultat ne fait rien : la fiche / « Demander » est un autre lot (`onOpen` déjà relayé).
- Pas de « dernières recherches » (la recherche Plex en a) : non demandé.
