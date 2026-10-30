# Bilan : la Frame joint-elle Overseerr en HTTPS ?

**Oui.** Sur la Frame, la sonde donne 200 sur les trois essais (Stéphane : « Tout 200 ») : image /favicon.ico,
XHR /api/v1/status sans clé, XHR /api/v1/discover/movies avec X-Api-Key. Let's Encrypt YR2 est accepté par Tizen 5 ;
l'absence de CORS côté Overseerr (pré-vol OPTIONS → 405 depuis le PC) ne bloque pas l'app empaquetée. Pas de repli http/LoadBalancer.

## Fait
- Sonde dans le diagnostic caché (0 puis 2), dans le chunk différé settings.js (+2,1 Ko) ; app.js ne gagne que l'aiguillage de la touche 2.
  Lecture seule (GET uniquement), clé jamais affichée.
- Touches 1 et 2 enregistrées auprès de tvinputdevice à l'ouverture du diagnostic (seul 0 l'était).
- `<access origin>` d'Overseerr + `window.__cimaiseOverseerr` injectés **dans la copie empaquetée seulement** (local-config.mjs,
  4e argument passé par package.sh) : ni l'URL ni la clé dans git, apps/tv/dist ou les logs (vérifié, testé).
- Construit, contenu de apps/tv/dist et du .wgt vérifié, signé, installé (SDK : install completed), lancé ; résultat vu par Stéphane.
- docs/tv-status.md (observé / SDK / non testé) et docs/decisions.md ; 637 tests OK (`npm run check`).

## Pas fait
- Essai **sans** `<access origin>` : non tenté (Plex marche sans ; une install de plus pour Stéphane). Noté « non testé ».
- Temps de réponse sur la TV : non relevés (Stéphane a répondu « Tout 200 » sans les chiffres).
- Aucune route d'écriture d'Overseerr appelée (hors carte).
