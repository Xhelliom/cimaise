# Bilan
Fait : fiche entamée = « Reprendre [S1 E8] · 12:34 » + « Depuis le début » (focus initial sur Reprendre, gauche/droite pour passer de l'un à l'autre) ; non entamée = un seul « Lire ». Le lecteur (`createPlayerPanel(arg, item, startMs)`) démarre directement à la position transmise, plus de question. Liste d'épisodes : Entrée reprend à `viewOffset`. `onPlay(item, startMs?)` reçoit la position.
Tests : lecteur sans question, fiche entamée (2 boutons), non entamée (1), épisode entamé depuis la liste. `npm run check` vert.
Non fait : rien de restant ; à valider visuellement sur la Frame (alignement des deux boutons).
