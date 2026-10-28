# Fiches coût des maquettes d'accueil (1920×1080)

Aperçu : `npm run dev` puis http://127.0.0.1:5173/mockups/. Langage commun : surfaces tonales unies (couleur source violette), grands rayons, texte grand, focus = changement de couleur + `transform: scale` + opacité. Aucune image, aucun flou.

Partagé par les 3 : **Police** Roboto Flex (OFL 1.1, licence relue dans google/fonts), variable, sous-ensemble latin + accents français, axe de graisse 400–700 (les maquettes n'utilisent que 400 et 700), autres axes fixés : **13220 o** (woff2). CSS : 2,3 Ko non minifié, en un seul fichier.

| Maquette | Police | Fond | DOM | Effets |
|---|---|---|---|---|
| list.html — List sobre | Roboto Flex, 2 graisses (400, 700) | uni `#141218`, 0 o | DOM : 30 éléments (8 lignes × 3) | `transform` + couleur sur le focus ; aucune ombre, aucun flou |
| dock.html — Dock en bas | idem (400, 700) | uni `#141218`, 0 o | DOM : 29 éléments (8 tuiles × 3) | `transform` + rayon + couleur sur le focus ; aucune ombre, aucun flou |
| art.html — Art discret | idem (400, 700) | uni `#0c0b0f`, 0 o | DOM : 20 éléments (8 pastilles × 2) | `transform` + opacité (repos 0,55) ; aucune ombre, aucun flou |

Remarques : les pastilles de l'icône sont des monogrammes texte (pas d'image ; les vraies icônes d'apps coûteront à part). Le focus change de couleur : à la TV, préférer deux calques superposés dont seule l'`opacity` varie si la mesure montre un coût de repeinture. Google Sans Flex n'a pas été retenu : Roboto Flex a une licence OFL confirmée et une forme proche.

Licence : `OFL.txt` (Roboto Flex, OFL 1.1) est livrée à côté de `roboto-flex-latin.woff2`, comme l'OFL l'exige. Graisses : deux seulement (400 corps, 700 titres/monogrammes).
