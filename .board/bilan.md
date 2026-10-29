# Bilan

**Fait**
- YouTube : le PNG avait un rectangle blanc plein (le recoloriage une encre avait rempli le triangle). Triangle recreusé en transparent (même palette, 2,4 Ko) : le rouge de la tuile apparaît. Test sur les pixels de la ligne centrale.
- Plex officiel : cause racine = deux normaliseurs en égalité stricte (`nameKey` pour logo/tuile, `norm` de `fillIds` pour l'ID), aucun ne connaissait « ＆ » ni les noms longs. Un seul normaliseur (NFKC, casse, accents, ponctuation, « & »→and), alias par app (`names`), début de nom sûr (`starts`, limité à plex/youtube/netflix/spotify/deezer/twitch), et `sameApp` partagé par `fillIds`.
- Tests avec les noms réels (sans ID) ; `npm run check` passe (466 tests).

**Non fait**
- Aucun rendu navigateur à 4/5/6 tuiles : pas de navigateur dans cet environnement. Le logo est le même PNG mis à l'échelle quel que soit le nombre de tuiles ; à confirmer d'un coup d'œil sur la Frame ou l'aperçu.
- Logo non remplacé par le SVG officiel (pas d'accès réseau) : le triangle a été recreusé à la main, proportions approchées.
