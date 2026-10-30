# Bilan : maquette des finitions Plex à valider à l'œil

## Fait
- **Maquette statique** `packages/plex/mockups/` (accueil, fiche, lecteur + `plex.css`), servie par l'aperçu sous `/mockups/plex/`
  (route ajoutée dans `scripts/dev/server.mjs`, lien dans l'index des maquettes). Rien dans le module réel ni dans le `.wgt`.
- **Lecteur** : ▶ / ❚❚ en icônes CSS (bordures, sans image ni glyphe), grand ❚❚ semi-transparent au centre en pause, bouton focalisé
  indigo `#6366f1`, titre + « finit à HH:MM » sur une ligne au-dessus de la barre, −10 / +10 autour du bouton central.
- **Accueil** : champ Rechercher en tête, roue dentée (Réglages) à côté, onglets en pilules Accueil · Films · Séries à la place des
  carrés, puis En cours (progression dans l'affiche) et Ajoutés récemment.
- **Fiche** : fond flou **calculé par le transcodeur photo de Plex** (`blur=20&opacity=35&background=0b0b0d`, vérifié sur le serveur :
  3,9 Ko, l'assombrissement est fait par le serveur, donc pas de voile CSS) ; Reprendre / Depuis le début / Marquer vu en pastilles 88 px.
- **Focus homogène** (anneau blanc 6 px à rayon 0 + `scale(1.06)`, une seule règle) et **indice de débordement** (fondu statique +
  chevron au bord, « 7 sur 8 » à côté du titre de rangée).
- **Aucun flou CSS** : ni `filter`, ni `backdrop-filter`, ni `blur()`, ni `text-shadow` (testé dans `tests/plex-mockups.test.mjs`, 7 tests).
- **Coût noté** dans `packages/plex/mockups/COUTS.md` : CSS de la maquette 6,1 Ko min (1,8 Ko gzip), détail par finition, estimation
  +1,5 à +2 Ko sur le chunk Plex à l'intégration, app.js/app.css initiaux inchangés ; fond 480×270 (0,5 Mo décodé) au lieu de l'art net
  (367 Ko JPEG, 8,3 Mo décodé). Entrée dans `docs/decisions.md`.
- **Captures 1920×1080** : avant (module actuel dans l'aperçu, bibliothèque du homelab) / après (maquette avec les vraies affiches et le
  vrai fond du transcodeur) pour lecteur, accueil et fiche, plus 4 planches côte à côte : publiées sur la carte, gardées hors git dans
  `.local/plex-finitions-captures/`. Captures factices de la maquette dans `packages/plex/mockups/captures/` (dans git).

## Pas fait / à noter
- **Pas câblé** dans le module Plex : c'est une maquette à valider. Rien essayé sur la Frame (coût des fondus de bord au défilement,
  roue dentée en SVG inline sur Tizen 5 : à mesurer au câblage).
- **Lecteur « avant »** : AVPlay n'existe pas dans l'aperçu (le mock lève « Lecture impossible ») ; la capture avant remet la barre telle
  que `player.ts` la dessine en pause (mêmes classes, libellés « Lecture » / « Pause »), avec l'art de l'œuvre à la place de la vidéo.
- **Accent** : l'ambre du module devient l'indigo d'Overseerr partout (progression comprise) ; c'est un choix de la maquette, à confirmer.
- L'onglet « Accueil » a été ajouté devant Films · Séries pour montrer où l'on est : à retirer si non voulu.
