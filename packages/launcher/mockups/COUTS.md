# Fiches coût des maquettes d'accueil (1920×1080)

Aperçu : `npm run dev` puis http://127.0.0.1:5173/mockups/. Aucune image, aucun flou, aucun `backdrop-filter`. Le Dock (retenu par Stéphane) a été refait d'après la référence cleanyourtv `focus-2-up-netflix` (livrable `reference-focus-2-up-netflix.png`) ; List et Art restent des aplats tonals violets.

Partagé par les 3 : **Police** Outfit (SIL OFL 1.1, licence relue dans google/fonts, `OFL.txt` livrée à côté), variable, sous-ensemble latin + accents français, axe de graisse limité à 300–500 (les maquettes n'utilisent que 300 et 500), **19 520 o** (woff2). CSS : 3,6 Ko non minifié, un seul fichier.

**Police : Outfit remplace Roboto Flex.** Outfit est la police de la référence : géométrique, chiffres fins et ronds, ce qui rend l'horloge en graisse 300 lisible de loin ; Roboto Flex, plus neutre, rendait l'horloge lourde. Coût : 19,5 Ko contre 13,2 Ko (+6,3 Ko), sous la limite de 30 Ko du test. Roboto Flex est retirée (woff2 supprimé), une seule police reste dans le dépôt. List et Art passent à Outfit, graisse 700 → 500.

| Maquette | Police | Fond | DOM | Effets |
|---|---|---|---|---|
| list.html — List sobre | Outfit, 2 graisses (300, 500) | uni `#141218`, 0 o | DOM : 30 éléments (8 lignes × 3) | `transform` + couleur sur le focus ; aucune ombre, aucun flou |
| dock.html — Dock v2 (référence) | idem (300, 500) | `#0b0b0d` + 2 calques en dégradé radial teinté, 0 o (CSS pur) | DOM : 21 éléments (2 calques, salutation, horloge, séparateur, date, 3 pastilles, titre, bac, 6 tuiles) | `transform` (tuile, 0,2 s) + `opacity` (calques, 0,6 s) ; anneau de focus `box-shadow` statique 6 px, 1 seule ombre ; aucun flou |
| art.html — Art discret | idem (300, 500) | uni `#0c0b0f`, 0 o | DOM : 20 éléments (8 pastilles × 2) | `transform` + opacité (repos 0,55) ; aucune ombre, aucun flou |

## Dock v2 : coût du changement de teinte

- Deux calques plein écran superposés (`.fond`), chacun un `radial-gradient` unique. Au changement de focus, la couleur de l'app est écrite sur le calque **caché** (opacité 0), puis on ne fait varier que son `opacity` (0 → 1, 0,6 s) ; l'ancien calque est éteint après le fondu. Ni `transition` ni animation sur `color` ou `background`.
- Coût : 2 calques de 1920×1080 = 2 textures composées (≈ 8 Mo chacune en RGBA, à confirmer sur la TV) ; le dégradé est rastérisé une fois à l'écriture, puis seul le compositeur fait le fondu. Risque principal : mémoire GPU de la Frame 2019 ; si la mesure M1 le montre, réduire les calques à 960×540 mis à l'échelle (un dégradé flou n'y perd rien).
- Aucun flou : le halo vient du dégradé lui-même. Ombres : une seule, l'anneau de la tuile focalisée, statique (`box-shadow` 0 de rayon de flou).
- Le focus d'une tuile = `transform: scale(1.1)` + anneau ; les voisines ne bougent pas (le scale ne déclenche pas de mise en page). La 2ᵉ rangée dépasse du bas de l'écran, comme dans la référence.
- JS de la maquette : ≈ 1 Ko, uniquement pour la démonstration (flèches, `#N` dans l'URL pour les captures) ; hors budget produit.

Remarques : les tuiles sont des monogrammes texte sur la couleur de marque, **aucun logo de marque n'est commité** (les vraies icônes viendront de l'inventaire de la TV, à chiffrer à part). Les couleurs de marque Plex, Netflix, YouTube, Disney+ et Canal+ sont approximatives. Google Sans Flex non retenu (licence).

Licence : `OFL.txt` (Outfit, OFL 1.1) livrée à côté de `outfit-latin.woff2`, comme l'OFL l'exige. Graisses : deux seulement (300 horloge/titres, 500 libellés).
