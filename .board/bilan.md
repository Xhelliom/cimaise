# Bilan : fiche Plex, Marquer vu / non vu, fond flou et boutons de la maquette (30/10)

## Fait
- `packages/plex/src/ui/detail.ts` : 3ᵉ bouton « Marquer vu » / « Marquer non vu » (film, ou l'épisode que lit Lire pour une série),
  Gauche/Droite entre Lire/Reprendre · Depuis le début · Marquer vu ; scrobble/unscrobble de `api/media.ts`, une demande à la fois ;
  échec → message, rien ne change.
- `packages/plex/src/ui/data.ts` : `data.marked` (même mécanisme que `progressed`, partie commune `touch`) : fiche, liste des
  épisodes et « En cours » à jour sans recharger ; un non vu retire le compteur ancien du serveur pendant 60 s.
- Fond : art flouté et assombri **par le transcodeur photo** (480×270, `blur=20&opacity=35&background=0b0b0d`), fondu d'opacité,
  libéré en quittant. **Aucun flou CSS** (testé dans `tests/plex-ui.test.mjs`).
- Boutons de la maquette : pastilles 88 px, Reprendre indigo ▶, ✓ sur Marquer vu, focus anneau blanc + scale ; icônes en CSS.
- **Vérifié sur le serveur du homelab** avec les fonctions du module : film non vu → scrobble → `viewCount` 1 → unscrobble → état
  d'origine (aucune trace laissée). Détail et coûts dans `docs/decisions.md`.
- Tests : 4 nouveaux + 1 adapté ; `npm run check` OK (707 tests, ES5, CSS). Coût : `app.css` +525 o min, `plex.js` +1 770 o, `app.js` 0.
- Captures 1920×1080 du vrai panneau (vrai CSS, données et images factices, Chromium headless) publiées :
  `fiche-plex-film-marquer.png`, `fiche-plex-film-vu.png`, `fiche-plex-serie-marquer.png`.

## Pas fait
- **Saison entière** : pas de geste simple à la télécommande (Entrée sur une saison est déjà pris, une zone de plus allonge Bas) ;
  le serveur l'accepte. Proposition dans `docs/decisions.md`.
- **App Plex officielle pas regardée** : le changement est vérifié côté serveur, que lisent tous les clients ; à confirmer à l'œil (recette).
- Rien essayé sur la Frame. Marquer un épisode autre que celui de Lire n'est pas possible (Entrée sur une vignette lance la lecture).
- Pas repris de la maquette : la ligne « FILM · 2025 » et « 22 min vues · reste 1 h 24 ».
