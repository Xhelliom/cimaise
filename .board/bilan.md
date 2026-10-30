# Bilan : bibliothèque Plex, tri et filtre « Non vus » (30/10)

## Fait
- **Pilules** en haut à droite de la grille (Haut depuis la première ligne) : « Tri : Ajout récent / Titre / Année » (OK fait
  défiler) et « Non vus » (OK bascule, jaune quand actif). Gauche/Droite entre elles, Bas revient à la grille.
- **Côté serveur** : `sort=addedAt:desc|titleSort|year:desc` et `unwatched=1` ; pagination `X-Plex-Container-*` intacte,
  grille remise en haut (`VirtualList.reset()`), requêtes de l'ancien choix annulées, cache distinct par combinaison.
- **Barre alphabétique cohérente** : en tri par titre, index `/firstCharacter` filtré comme la grille (`?unwatched=1`) ;
  masquée en tri par ajout ou par année.
- **Mémorisé par bibliothèque** dans `cimaise.v1` (`prefs.plexLibrary`), retrouvé à la réouverture ; défaut : titre, tout.
- Compteur « N non vus » ; « Tout a été vu. » si le filtre ne laisse rien.
- **Vérifié sur le vrai serveur** : 413 → 259 films non vus, 85 → 30 séries ; tous les tris parcourus page par page sans
  doublon ; index filtré = total filtré. Détails et coûts dans `docs/decisions.md`.
- Tests : +3 dans `plex-ui.test` (tri/filtre/pagination/barre, réponse abandonnée, mémorisation) ; `npm run check` OK (713).
- Poids : `plex.js` +2,1 Ko, `app.js` +95 o, `app.css` +476 o.
- Aperçu navigateur sur la vraie bibliothèque : 5 captures publiées sur la carte (`tri-*.jpg`), recette écrite.

## Pas fait
- **Pas vu sur la Frame** : ni empaqueté ni installé (non demandé ici). Latence non remesurée (aucune minuterie ni travail
  ajouté par appui dans la grille ; seul un changement de tri recharge).
- Les pages en cache (10 min) ne sont pas invalidées quand on marque un titre vu : en « Non vus », il peut rester affiché
  jusqu'à l'expiration ou au prochain changement de choix (même comportement que la coche « vu » existante).
