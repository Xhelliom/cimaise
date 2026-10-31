# Notices tierces

Le texte de CleanFrame (licence MIT, base du launcher) est conservé dans `bench/cleanframe/` (`LICENSE`, `THIRD_PARTY_NOTICES.md`).
Police Outfit : licence OFL, voir `packages/launcher/src/home/fonts/OFL.txt`.

## Logos d'apps (bibliothèque du launcher)

Dossier : `packages/launcher/src/catalog/known-apps/logos/` (copié tel quel dans `dist/logos/`, chargé à l'affichage seulement).

**Source :** Wikimedia Commons, fichiers SVG relevés le 2026-10-29 (la licence indiquée est celle que Commons affiche pour le fichier). `PD` : domaine public (logo de texte / formes simples) ; `CC0` : dédicace au domaine public.
**Marques :** les noms et logos restent la propriété de leurs titulaires. Ils servent uniquement à identifier les apps correspondantes sur la TV ; aucun partenariat ni approbation. Un logo à retirer à la demande de son titulaire : supprimer le fichier PNG et son entrée dans `known-apps/index.ts`.
**Traitement :** logotypes LARGES (horizontaux) rastérisés du SVG à 320 px de large au plus (160 px de haut au plus) sur fond transparent, PNG 8 bits à palette (≤ 64 couleurs, pngquant), moins de 8 Ko chacun. Le fond de la tuile est choisi dans `known-apps/index.ts` (`bg`) pour fusionner avec le logo. Seul changement du dessin : les logos sont **recolorés en une encre** (palette PNG remplacée, alpha et formes intacts) pour tenir sur la couleur de marque de la tuile : blanc pour `netflix`, `youtube` (triangle évidé), `disney`, `prime`, `paramount`, `max`, `arte`, `francetv`, `tf1`, `deezer`, `twitch`, `appletv`, `rakuten` ; noir pour `spotify`, `pluto` et `plex-integre.png` (Plex sur le jaune Plex). `canal.png`, `m6.png` et `plex.png` gardent leurs deux encres d'origine. `molotov.png` : logo fourni (PNG 1024 × 421, noir sur jaune #fecf21), recadré sur le logotype, fond jaune retiré (alpha dérivé de l'assombrissement), réduit à 320 px, PNG 8 bits à palette (32 niveaux d'alpha), moins de 8 Ko. La couleur de fond de chaque tuile (`bg`) est celle de la marque, dans `known-apps/index.ts`.

| Fichier | Source (Commons, « File: ») | Licence affichée | Page d'origine |
|---|---|---|---|
| `netflix.png` | Netflix 2015 logo.svg | Public domain ; marque déposée | <https://commons.wikimedia.org/wiki/File%3ANetflix_2015_logo.svg> |
| `youtube.png` | YouTube Logo 2017.svg | Public domain ; marque déposée | <https://commons.wikimedia.org/wiki/File%3AYouTube_Logo_2017.svg> |
| `disney.png` | Disney+ logo.svg | Public domain ; marque déposée | <https://commons.wikimedia.org/wiki/File%3ADisney%2B_logo.svg> |
| `canal.png` | Logo Canal+ 1995.svg | Public domain ; marque déposée | <https://commons.wikimedia.org/wiki/File%3ALogo_Canal%2B_1995.svg> |
| `prime.png` | Prime Video logo (2024).svg | Public domain ; marque déposée | <https://commons.wikimedia.org/wiki/File%3APrime_Video_logo_(2024).svg> |
| `plex.png` | Plex logo 2022.svg | Public domain ; marque déposée | <https://commons.wikimedia.org/wiki/File%3APlex_logo_2022.svg> |
| `plex-integre.png` | Plex logo 2022.svg (même fichier que `plex.png`) | Public domain ; marque déposée | <https://commons.wikimedia.org/wiki/File%3APlex_logo_2022.svg> |
| `molotov.png` | Logo Molotov.TV (noir sur jaune), fourni par Stéphane le 2026-10-29 (remplace l'ancien logo pris sur Commons, qui n'était pas le bon) | Marque déposée ; image fournie par le propriétaire du projet, usage d'identification uniquement | <https://cdn.jaimelesstartups.fr/wp-content/uploads/2019/02/logo-molotov-1024x421.png> |
| `arte.png` | Arte Logo 2011.svg | Public domain ; marque déposée | <https://commons.wikimedia.org/wiki/File%3AArte_Logo_2011.svg> |
| `francetv.png` | France.tv - logo 2022.svg | Public domain ; marque déposée | <https://commons.wikimedia.org/wiki/File%3AFrance.tv_-_logo_2022.svg> |
| `tf1.png` | Logo TF1+.svg | CC0 | <https://commons.wikimedia.org/wiki/File%3ALogo_TF1%2B.svg> |
| `m6.png` | Logo M6 (2020).svg | Public domain ; marque déposée | <https://commons.wikimedia.org/wiki/File%3ALogo_M6_(2020).svg> |
| `spotify.png` | Spotify logo with text.svg | CC0 | <https://commons.wikimedia.org/wiki/File%3ASpotify_logo_with_text.svg> |
| `deezer.png` | Deezer logo, 2023.svg | Public domain ; marque déposée | <https://commons.wikimedia.org/wiki/File%3ADeezer_logo%2C_2023.svg> |
| `twitch.png` | Twitch logo 2019.svg | Public domain ; marque déposée | <https://commons.wikimedia.org/wiki/File%3ATwitch_logo_2019.svg> |
| `appletv.png` | Apple TV logo.svg | Public domain ; marque déposée | <https://commons.wikimedia.org/wiki/File%3AApple_TV_logo.svg> |
| `pluto.png` | Pluto TV logo 2024.svg | Public domain ; marque déposée | <https://commons.wikimedia.org/wiki/File%3APluto_TV_logo_2024.svg> |
| `rakuten.png` | Rakuten TV logo.svg | Public domain ; marque déposée | <https://commons.wikimedia.org/wiki/File%3ARakuten_TV_logo.svg> |
| `max.png` | HBO Max (2025).svg | Public domain ; marque déposée | <https://commons.wikimedia.org/wiki/File%3AHBO_Max_(2025).svg> |
| `paramount.png` | Paramount+ logo.svg | Public domain ; marque déposée | <https://commons.wikimedia.org/wiki/File%3AParamount%2B_logo.svg> |
| `overseerr.png` | Projet Overseerr (sct/overseerr), `public/logo_full.svg`, branche `develop` au commit `98ea135`, relevé le 2026-10-31 | MIT (Copyright (c) 2020 sct) | <https://github.com/sct/overseerr/blob/develop/public/logo_full.svg> |

`overseerr.png` (hors Commons) : SVG 456 × 96 du projet Overseerr, sous licence MIT ; texte de la licence : <https://github.com/sct/overseerr/blob/develop/LICENSE>. Recoloré en une encre blanche (pastille en dégradé passée en blanc, ombre portée et reflet de l'arc retirés, formes intactes), rastérisé à 320 × 68 px (rsvg-convert), PNG 8 bits à palette (pngquant, 64 couleurs) : **2 878 octets**. Fond de tuile `#4f65f5`, couleur de fin du dégradé du logo.

Smart Hub n'a pas de logo : sa tuile affiche son nom (pictogramme maison original retiré, `smarthub.png` supprimé).
