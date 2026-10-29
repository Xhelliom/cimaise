# Bilan — maquette Dock v2 (d'après la référence cleanyourtv)

Fait :
- `packages/launcher/mockups/dock.html` refait : salutation (Bonsoir, petites capitales espacées), horloge 20:45 graisse 300, séparateur, date, 3 pastilles focalisables (Réglages, Smart Hub, Réseau), titre de l'app focalisée, bac arrondi de tuiles 16:9 (4 par rangée, 2ᵉ rangée dépasse), focus = scale 1,1 + anneau, fond sombre teinté.
- Teinte : 2 calques `.fond` superposés ; la couleur est écrite sur le calque caché, seul `opacity` est animé (0,6 s). Aucune transition de couleur/background, aucun flou, aucun logo (monogrammes + couleur).
- Police : Outfit (OFL, variable, latin, 300–500) 19,5 Ko remplace Roboto Flex (supprimée) ; List/Art suivent (700 → 500). Justifié dans COUTS.md.
- COUTS.md à jour (police, DOM 21, effets, coût du fondu). Tests ajoutés dans tests/mockups.test.mjs (éléments, fondu opacity, pas de logo/flou, 2 graisses, captures 1920×1080).
- Captures : `captures/maquette-dock-v2.png` (focus Netflix) et `captures/maquette-dock-v2-focus-disney.png` (teinte bleue), commitées.

Pas fait / pourquoi :
- Publication des captures sur la carte : l'outil `publish_file` (collie-board) n'est pas disponible dans cette session et aucune instruction curl n'était fournie. À publier : les 2 PNG ci-dessus.
- Capture « autre app » faite sur Disney+ (pas YouTube : trop proche du rouge de Netflix pour montrer la teinte).

Checks : `node --test --test-concurrency=1 tests/*.test.mjs` 98/98 ; typecheck, build, check:es5 OK. `npm run check` (tests en parallèle) a 2 échecs aléatoires (course sur `apps/tv/dist` entre tests de build), déjà connus et hors carte.
