
## Correctif saisie (Réglages → Scènes)
- Fait : `apps/tv/src/index.ts` ignore 0/1 (diagnostic, sonde) quand la cible est un INPUT/TEXTAREA ; `settings/screen.ts` ne re-rend plus pendant la saisie (le champ garde son focus) ; `settings/scenes.ts` rend les flèches au champ (renvoie false), seuls Entrée/Retour sont consommés.
- Tests : flèches pendant la saisie (champ non détaché, non consommées) ; 0/1 dans un champ n'ouvrent ni diagnostic ni sonde. `npm run check` vert (462 tests).
- Reste : rien. Non vérifié sur la TV réelle (clavier à l'écran).
