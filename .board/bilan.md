# Bilan — actualiser la fiche Plex en sortant du lecteur

Fait :
- `data.progressed` corrige sur place la fiche, la liste d'épisodes du parent et « En cours » avec la position quittée, puis les marque périmés (`cache.set(..., stale)`) : affichage immédiat, puis relecture serveur.
- La position locale est gardée 60 s (clé `o:` du cache, partagée entre écrans) et réappliquée aux réponses serveur (fiche, épisodes, « En cours ») : un serveur en retard ne l'écrase pas.
- Tests : plex-ui (film et épisode, serveur en retard), plex-progress adapté. `npm run check` vert (602 tests).

Non fait : rien de bloquant. Non vérifié sur la TV (recette ci-dessous).
