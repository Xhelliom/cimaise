# Bilan — Scènes Home Assistant (Réglages)
Fait :
- Recherche : Entrée ouvre le clavier à l'écran de tv-core (plus d'<input>) ; le filtre suit la saisie, compteur en direct ; valider ou Retour ramène à la liste en gardant la requête.
- Pièces : liste déroulante (Entrée ouvre, Retour ferme, « Toutes » en tête, compteur par pièce) ; flèches gauche/droite retirées.
- Liste : « Toutes » = groupée par pièce avec titres (non focalisables, « Sans pièce » en dernier) ; une pièce = seulement elle ; choisies en tête, marquées « ✓ n » ; scènes `unavailable` masquées (Scene.state lu dans ha.ts) et ignorées des compteurs.
- Tests : 100 scènes / 12 pièces, clavier, indisponibles, groupement (tests/scenes-settings, tests/scenes). `npm run check` vert (609 tests).
Non fait / à noter :
- Défaut = « Toutes » (groupé), pas une pièce présélectionnée : à trancher si Stéphane veut une pièce par défaut.
- Virtualisation : fenêtrage existant de la section conservé (~9 lignes dans le DOM), pas VirtualList de tv-core (liste verticale de lignes, grille de tuiles).
- Chiffres/touches couleur du clavier non branchés (pas de chemin keycode dans les Réglages).
- Non vérifié sur la TV.
