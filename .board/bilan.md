# Bilan — Relever les écrans Plex Web et en tirer une spec

**Fait**
- 4 écrans de Plex Web capturés en 1920×1080 (Chrome headless en conteneur Playwright, certificat ignoré pour la capture seulement, token passé par `--env-file`) : accueil, bibliothèque Films, fiche film, fiche série + saison/épisodes, lecteur. Copie locale dans `.local/plex-captures/` (ignoré par git, jamais committé).
- `docs/plex-design.md` : disposition, tailles d'images (poids vérifiés sur le serveur), couleurs, typographie Outfit, focus télécommande, tableau des effets coûteux avec équivalent léger (fond flou via `blur=` du transcodeur, `UltraBlurColors` + 2 calques en fondu d'opacity, aplats), harmonisation Dock v2.
- `tests/plex-design.test.mjs` (6 tests, écrits avant le doc et vus en échec) ; `npm run check` : 156/156.

**Pas fait / à savoir**
- Publication des captures sur la carte : l'outil `publish_file` n'existe pas dans cette session ; les PNG sont dans `.local/plex-captures/` du worktree, à publier à la main.
- Lecteur : Chrome headless sans GPU vidéo, image noire + spinner ; seule la disposition des contrôles est exploitable.
- Durée de l'animation de fond de Plex Web non mesurée (capture statique) ; poids d'une vignette 360×203 non mesuré. Tailles TV = propositions à valider sur la Frame (M1).
- Effet de bord : une lecture de « Kung Fu Panda » a été lancée ~15 s au début (profil Xhelliom) pour la capture du lecteur ; elle peut apparaître dans l'historique/activité du serveur.
