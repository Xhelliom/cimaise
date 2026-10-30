# Bilan : accueil Plex, roue dentée, Rechercher en tête, onglets Films · Séries (30/10)

## Fait
- `packages/plex/src/ui/home.ts` : en-tête « Rechercher un film, une série… » + roue dentée (ouvre les Réglages Plex) ; onglets en
  pilules « Accueil » (page courante) puis une par bibliothèque, Entrée ouvre la grille de cette bibliothèque ; rangées « Bibliothèques »
  et « Réglages » retirées ; En cours et Ajoutés récemment restent les rangées principales.
- D-pad : Haut depuis la 1re rangée → onglets → en-tête (Haut retenu tout en haut) ; Gauche/Droite bornés (Rechercher ↔ roue, onglets) ;
  Bas redescend d'un niveau ; sans contenu, focus sur Rechercher.
- `packages/plex/src/plex.css` : en-tête, loupe et roue dentée en CSS (0 image, 0 SVG), onglets, focus homogène ; règles des carrés
  retirées. Pas de `gap` flex (refusé pour Tizen 5).
- Tests : `tests/plex-ui.test.mjs` (onglets depuis le cache, Films puis Séries ouvrent la bonne section, nouveau test de navigation
  de l'en-tête, focus sur Rechercher sans contenu, Réglages par la roue) et `tests/plex-search.test.mjs` adaptés.
  `npm run check` : 703 tests OK, ES5 OK, CSS OK.
- Captures 1920×1080 du vrai panneau (vrai CSS, fixtures, affiches factices) publiées sur la carte : `accueil-plex-rangee.png`,
  `accueil-plex-onglet.png`, `accueil-plex-rechercher.png`, `accueil-plex-roue.png`, `accueil-plex-defile.png`.
- Coût dans `docs/decisions.md` : `app.css` +1 055 o minifié (+192 o gzip), `plex.js` +1 147 o, `app.js` inchangé.

## Pas fait
- **Rien essayé sur la Frame** : captures dans Chromium headless.
- Onglets sans défilement horizontal (au-delà d'environ 7 bibliothèques vidéo, débordement).
- « Accueil » n'est pas focalisable (on y est déjà) : écart volontaire avec la maquette, où il l'était.
- Indice de débordement et « 1 sur 8 » des rangées (autre finition de la maquette) : hors demande.
