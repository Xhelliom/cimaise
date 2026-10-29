# Bilan — La tuile EST la marque

Fait :
- 19 logotypes LARGES (Wikimedia Commons, provenance dans THIRD_PARTY_NOTICES.md) remplacent les icônes carrées : PNG transparents ≤ 320×160, 1,5 à 4,5 Ko chacun, 52 Ko au total (< 15 Ko/logo ; .wgt 107 Ko).
- Fond de tuile = fond naturel du logo (`bg` dans known-apps) : Netflix/YouTube/Disney+/Deezer… blancs, Canal+/Plex/Spotify noirs, Prime/Paramount/Max bleus (versions monochromes blanches inversées pour Prime, Paramount, Plex, Max — documenté).
- Logo centré à 64 % de la largeur / 60 % de la hauteur de la tuile, sans cadre ni arrondi, identique à 4/5/6 tuiles (CSS en %).
- Sans logo (Smart Hub, apps inconnues) : nom en grand (Outfit) sur la couleur de l'app. Icône de la TV : dernier recours, sans cadre.
- La teinte du fond d'écran suit toujours la couleur de l'app.
- Réglages : tuiles d'apps élargies (112×64), même logo/fond.
- Tests adaptés/ajoutés ; `npm run check` vert (348 tests).
- Captures avant/après (4, 5, 6 tuiles) + planche des 19 logos publiées sur la carte.

À signaler :
- La puce « Couleur » des Réglages ne change plus le fond d'une tuile à logo (elle teinte le fond d'écran) ; les apps sans logo gardent leur couleur.
- `smarthub.png` supprimé : Smart Hub affiche son nom.
- Rendu vérifié dans Chromium seulement, pas sur la TV.
