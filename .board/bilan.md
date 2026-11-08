Issue : partiel

Fait (commits 2faf55a, 41a7d95, puis la doc) :
- Fond Unsplash du jour sur l'accueil : une requête /photos/random par jour au plus (et par jeu de réglages), image en cache dans cimaise.v1 ; posée après la 1re peinture et enrich(), fondu d'opacity, voile CSS, aucun flou.
- Réglages › Fond d'écran (n'apparaît qu'avec une clé) : Source (Désactivé / thèmes de l'API /topics, en cache 30 j / Recherche libre), Recherche au clavier à l'écran, Photos en portrait (Non par défaut), et « Changer d'image », demandé par Stéphane en cours de carte.
- Règles Unsplash : crédit « Photo : auteur / Unsplash » avec liens utm, download_location appelé une fois quand l'image s'affiche.
- Sans clé : aucun appel, fond teinté. Hors ligne : image d'hier si le cache HTTP l'a, sinon fond teinté, sans erreur (testé).
- Clé dans .local/unsplash.env, injectée dans la copie empaquetée seulement (local-config.mjs), origines api. et images.unsplash.com déclarées dans la copie.
- Diagnostic (touche 0) : ligne « fond » (taille, poids, durée, mémoire décodée estimée, tas JS avant/après). Coût dans docs/decisions.md : app.js +5,5 Ko (47,4 Ko), image de 200 à 613 Ko selon la photo, 7,9 Mo décodés en 1920×1080.
- 798 tests OK, ES5 et CSS OK. Installé sur la Frame (install completed + app présente).

Pas fait / à confirmer :
- Pas vu par Stéphane sur la Frame : photo, lisibilité, fondu, firstPaint, latence et ligne « fond » sont à relever sur la TV. Les mesures de l'aperçu ne valent pas pour la TV : l'onglet était en arrière-plan.
- Le choix 1920×1080 ou 1280×720 dépend de cette mesure sur la Frame.
