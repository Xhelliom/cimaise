Issue : codé

Fait (commit c11095b, puis docs) : les dix commits de board/launcher-fond-d-ecran-unsplash-du-jour-sur-l-acc absents de main, un par un.
- 73ddfa5, photo après load : repris (apps/tv/src/index.ts). Précaution, pas correctif : le chargement infini du 08/11 venait d'un paquet des sources ; il n'est pas prouvé que Tizen attende load. +0,1 Ko (app.js 48,0 Ko).
- 73ddfa5, « http d'abord » et 5d65d92, repli http : NON repris. Le 10/11 (763ef5c) fait https d'abord puis un essai http dans setPhoto, origine http déclarée dans la copie empaquetée : même cas couvert, sans passer en clair sur une TV qui valide le certificat. Les lignes de diagnostic « fond état » de 5d65d92 sont remplacées par « fond tirage » / « fond » du 10/11.
- f88de0c, test : repris (window.addEventListener dans le faux contexte, test de l'ordre load).
- 3dd3a08, garde-fou package.sh : repris (refus si un script local de l'index.html manque, avant toute copie), plus un test dans scripts/tizen/test.sh et un dans tests/. Vérifié pour de vrai : package.sh apps/tv → refusé.
- b3e3b2c, c0dcfe6, eaf4526, c92d4ac, mesures et tv-status : reportés dans docs/tv-status.md et docs/decisions.md (195 Ko, 763 ms, 7,9 Mo décodés, tas JS 9,5/9,5 Mo, firstPaint +299 ms, latence 17/30/85 ms ; cause réelle du chargement infini), en signalant ce que le 10/11 a changé.
- 678707a, bilan : rien à reprendre ; APP_DIR=apps/tv/dist est bien en place dans .local/tizen.env du dépôt principal.
- 652d86c (.board/wrapup.md de l'ancienne carte) : non repris, propre à cette carte.
- npm run check : 808/808. scripts/tizen/test.sh : tout vert.

Sur la Frame (build c11095b, installé par-dessus, mêmes certificats) — réponses de Stéphane : accueil normal sans chargement infini, photo et crédit affichés, Plex toujours relié, ligne « fond » : « par http (https illisible…) ».

Pas fait :
- Un seul lancement constaté ; firstPaint, latence et chiffres de la ligne « fond » non relevés avec ce build.
- La branche board/launcher-fond-d-ecran-unsplash-du-jour-sur-l-acc n'est pas supprimée (à faire par Stéphane s'il le souhaite : plus rien d'utile dedans).
