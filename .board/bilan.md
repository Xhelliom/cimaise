# Bilan : épisode suivant avec compte à rebours (30/10)

## Déjà là sur la base (a2602b6)
Carte de compte à rebours 10 s au marqueur `credits`, Entrée = lancer, Retour = annuler, enchaînement via `goNext`
(scrobble + progression close avant le suivant), « Vous regardez toujours ? » après 3 épisodes, rien sans épisode suivant
(`findNextEpisode` renvoie null pour un film ou le dernier épisode). Tests dans `tests/plex-player-next.test.mjs`.

## Fait sur cette carte
- **Repli sans marqueur** : la carte s'affiche 30 s avant la fin (`cardSpan`, `TAIL_MS` dans `packages/plex/src/ui/player.ts`),
  seulement si l'épisode dure plus d'une minute. Pas de bouton « Passer le générique » dans ce cas (pas de marqueur).
  Retour annule : l'épisode va jusqu'au bout puis revient à la fiche.
- **Libellé** : « Suivant : S01E02 — titre » (ellipse si trop long), « Dans N s », « OK : lancer maintenant · Retour : annuler ».
  Carte élargie de 540 à 720 px pour que le titre tienne. Coût : quelques octets de CSS, aucun nœud DOM ni minuterie en plus.
- Tests : 3 nouveaux (repli 30 s qui enchaîne, Retour qui laisse finir, rien sur un film ni le dernier épisode) ;
  `npm run check` vert, 713/713.
- Capture publiée : `carte-episode-suivant.png` (rendu Chromium, police de repli ; Outfit sur la TV).

## Pas fait
- Pas vu sur la Frame : à vérifier par Stéphane (recette sur la carte).
