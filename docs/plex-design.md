# Design du module Plex

Référence : la structure de Plex Web, relevée sur le serveur du homelab (Chrome headless en conteneur, 1920×1080, certificat HTTPS par IP ignoré pour la capture seulement). Aucun asset ni code de Plex n'est repris : on reprend l'organisation des écrans, pas leur habillage. Les captures montrent la bibliothèque personnelle de Stéphane : elles ne sont **pas** dans git (copie locale dans `.local/plex-captures/`, livrées sur la carte).

Les captures : `plex-web-1-accueil`, `plex-web-2-bibliotheque`, `plex-web-3a-fiche-film`, `plex-web-3b-fiche-serie`, `plex-web-3c-saison-episodes`, `plex-web-4-lecteur`.

Légende des sources : **mesuré** = lu dans le DOM de Plex Web (styles calculés, URLs d'images) ; **vérifié serveur** = appel réel au serveur du homelab ; **proposé** = choix de conception pour la TV, à valider sur la Frame (M1).

Plex Web est une disposition de bureau (texte de 13 à 14 px, poster de 165 px). Une TV se lit à 3 m : on garde la **structure**, pas les tailles. Tout ce qui suit est exprimé dans la scène logique 1920×1080 de cimaise (une unité = un pixel de scène).

## Disposition

Plex Web (mesuré, 1920×1080) : barre du haut de 56 px, menu latéral de 268 px, contenu à partir de x = 308, affiches de 165×247 (rapport 2:3) avec un pas de 195 px en largeur et 357 px en hauteur, vignettes d'épisode de 360 px de large (16:9) au pas de 390 px.

Transposition TV (proposé) : **pas de menu latéral** ; on reprend la navigation du Dock v2, des pastilles en haut à droite (`Accueil`, `Films`, `Séries`…, 84 px de haut, `top: 100px`, `right: 120px`). Marge de 120 px à gauche et à droite, comme le Dock.

| Écran | Structure Plex Web | Disposition TV à 1920×1080 |
|---|---|---|
| Accueil | Hubs horizontaux : En cours, Ajoutés récemment, puis les bibliothèques | Titre de hub à y = 200 (40 px/500) ; rangée d'affiches 240×360 à y = 270, pas de 288, x = 120 ; 5 affiches entières + 1 qui dépasse à droite ; le hub suivant (titre à y = 760) dépasse en bas, comme la 2ᵉ rangée du Dock. Défilement de la rangée par `transform: translateX` |
| Bibliothèque | Grille d'affiches, tri et compteur en tête | Puce de tri + compteur à y = 130 (28 px) ; grille de **6 colonnes** de 240 px, écart de 48 px (6×240 + 5×48 = 1680 = 1920 − 2×120) ; pas de rangée 480 (360 + 72 de libellés + 48) ; première rangée à y = 200, la deuxième visible, la troisième qui dépasse. Virtualisation : rangées visibles ± 1 = environ 24 nœuds ; pages de 36 éléments (`X-Plex-Container-Size=36`) |
| Fiche film ou série | Affiche à gauche, titre, méta, boutons, résumé ; puis saisons et épisodes | Affiche 360×540 à (120, 140) ; colonne texte à x = 520, largeur 960 ; titre 72 px/500 ; méta (âge, année, durée) 28 px ; boutons Lecture / Reprendre ensuite (pastille de 72 px) ; résumé 30 px/300, 3 lignes maximum. **Série** : saisons en pastilles (0 image) à y = 640, puis épisodes en vignettes 16:9 de 360×203, pas de 408, à y = 740 |
| Lecteur | Barre du haut (retour), barre du bas de 96 px : titre et temps à gauche, transport au centre (−10, lecture, +30, stop), options à droite ; fine ligne de progression ambre | AVPlay dessine la vidéo sous le HTML : **aucune surface opaque plein écran**. Bandeau du bas de 220 px en aplat `rgba(11,11,13,.8)`, masqué après 4 s sans touche (fondu d'`opacity`). Titre 40 px, barre de progression de 8 px à y = 1000, temps 28 px, boutons ronds de 96 px : −10 s, lecture/pause, +10 s, pistes audio et sous-titres |

Remarque sur la capture du lecteur : le Chrome headless du conteneur n'a pas de GPU vidéo, l'image reste noire avec le cercle de chargement. C'est la disposition des contrôles qui sert de référence, pas la vidéo.

## Tailles d’images

Toujours via le transcodeur photo (`/photo/:/transcode`, voir HANDOFF §5.2). Plex Web lui-même demande une image **1,45 fois plus grande** que son affichage (240×360 pour une affiche de 165×247) : c'est pour les écrans à haute densité. La scène de la TV est à 1:1, donc on demande **exactement la taille d'affichage**.

| Usage | Affichage | Appel (mesuré côté Plex Web, poids vérifié sur le serveur) | Poids JPEG |
|---|---|---|---|
| Affiche de grille, de hub, de saison | 240×360 | `/photo/:/transcode?width=240&height=360&minSize=1&upscale=1&url=<thumb>` | 18,7 Ko |
| Affiche de fiche | 360×540 | `width=360&height=540` | 35,5 Ko |
| Vignette d'épisode 16:9 | 360×203 | `width=360&height=203` | non mesuré |
| Fond précalculé, voir « Effets coûteux » | 1920×1080, flou | `width=480&height=270&blur=60`, mis à l'échelle ×4 | 5,0 Ko |
| Fond plein écran net, à éviter | 1920×1080 | `width=1920&height=1080` | 274,6 Ko |

Règles :
- Mémoire décodée : 240×360×4 octets = 345 Ko par affiche ; 24 affiches dans le DOM ≈ 8 Mo. À la sortie de l'écran, on retire l'`<img>` (libération des images, HANDOFF §6 bis).
- `thumb` et `art` viennent de `/library/metadata/{id}` ; le numéro final de l'URL (horodatage) sert de clé de cache.
- Chargement différé : seules les rangées visibles chargent ; préchargement de la rangée suivante uniquement.
- Pas de `minSize` ou `upscale` oubliés : sans `upscale=1`, une petite source ne serait pas agrandie.

## Couleurs

Plex Web : fond sombre gris neutre, texte `#eeeeee`, accent ambre `#e5a00d` (anneau de focus, bouton Lecture, lien actif ; mesuré). Fonds de page teintés par l'œuvre (voir « Effets coûteux »).

Palette cimaise pour le module Plex (proposé, **mêmes jetons que le Dock v2**, pas ceux de Plex) :

| Rôle | Valeur | Origine |
|---|---|---|
| Fond | `#0b0b0d` | Dock v2 |
| Texte | `#ffffff` | Dock v2 |
| Texte secondaire | `rgba(255,255,255,.6)` | Dock v2 (`.date`) |
| Surface (puces, cartes) | `rgba(255,255,255,.07)` + anneau interne `inset 0 0 0 2px rgba(255,255,255,.1)` | Dock v2 (`.bac`) |
| Anneau de focus | `rgba(255,255,255,.92)` | Dock v2 (`.tuile.focus`) |
| Action principale (Lecture), progression | `#e5a00d` (texte `#1f1f1f`) | accent Plex, seule couleur de marque conservée |
| Fond d'affiche manquante | `#2b2b2e` | aplat, sans image |

## Typographie

Plex Web utilise la pile système (`-apple-system, Segoe UI, Roboto, …`, 14 px de base ; mesuré). cimaise garde **Outfit**, déjà retenue (woff2 latin de 19,5 Ko, graisses 300 et 500 seulement, voir `packages/launcher/mockups/COUTS.md`). Aucune police ajoutée.

| Élément | Taille | Graisse |
|---|---|---|
| Titre de fiche | 72 px | 500 |
| Titre de hub | 40 px | 500 |
| Titre d'affiche, boutons, pastilles | 28 à 34 px | 500 |
| Sous-titre d'affiche (année, épisode), résumé | 24 à 30 px | 300 |

Minimum 24 px pour tout texte lu à distance. Les titres non latins (par exemple coréen dans la bibliothèque) retombent sur la police système : accepté, le sous-ensemble Outfit reste latin.

## Focus

Plex Web (mesuré) : anneau ambre de 1 px (`box-shadow: 0 0 0 1px #e5a00d`) plus une ombre `0 0 4px rgba(0,0,0,.3)`, coins de 4 px, pastille de lecture et case à cocher qui apparaissent au survol, transition `color .2s`. Pas d'agrandissement.

Focus télécommande pour cimaise (proposé, calqué sur le Dock v2) :

| Élément | Repos | Focus |
|---|---|---|
| Affiche, vignette d'épisode | coins 12 px | `transform: scale(1.1)` en .2 s, anneau `box-shadow: 0 0 0 6px rgba(255,255,255,.92)` (rayon de flou 0), `z-index` au-dessus des voisines |
| Pastille (menu, tri, saison) | `rgba(255,255,255,.08)` + anneau interne | fond `rgba(255,255,255,.9)`, texte `#111`, sans anneau (comme `.pastille:focus`) |
| Bouton Lecture / Reprendre | `#e5a00d`, texte `#1f1f1f` | fond `rgba(255,255,255,.9)`, texte `#111` |
| Contrôle du lecteur | disque transparent | disque `rgba(255,255,255,.9)`, icône `#111` |

Comportement : le focus ne déclenche pas de mise en page (`scale` seul, les voisines ne bougent pas) ; le focus se rappelle par rangée au retour (Retour dépile, la rangée retrouve son dernier élément) ; la case à cocher « vu » de Plex Web est remplacée par un petit repère statique (point ambre) sur les éléments non vus.

## Effets coûteux

Mesurés sur Plex Web ; aucun `backdrop-filter` n'a été relevé sur les écrans capturés. L'animation du changement de fond n'est pas visible sur une capture statique : sa durée n'a **pas été mesurée**.

| Effet de Plex Web | Coût pour la Frame 2019 | Équivalent léger cimaise |
|---|---|---|
| Flou du fond : image de l'œuvre rendue dans une couche plein écran 1920×1080 (`background-image: blob:`) sur chaque fiche | Image 1080p décodée (≈ 8 Mo) plus un flou calculé côté navigateur | Fond précalculé **par le transcodeur photo** : `/photo/:/transcode?width=480&height=270&blur=60&url=<art>` (5 Ko, flou fait par le serveur, vérifié), affiché à 1920×1080 par mise à l'échelle ; aucun `filter: blur`. Si l'œuvre n'a pas d'`art`, aplat `#0b0b0d` |
| Dégradés de fond : 4 `radial-gradient(circle farthest-side)` aux 4 coins, teintés d'après l'affiche, qui changent d'une fiche à l'autre | Dégradés repeints à chaque changement, fondu de couleur | Les 4 couleurs viennent de `UltraBlurColors` (`topLeft`, `topRight`, `bottomRight`, `bottomLeft`, vérifié sur le serveur : 0 octet d'image) ; un **seul** `radial-gradient` teinté par calque comme le Dock v2, **2 calques** dont on ne fait varier que l'`opacity` (0,6 s). Repli sans `UltraBlurColors` : le fond flou précalculé ci-dessus |
| Ombres : `box-shadow: 0 0 4px rgba(0,0,0,.3)` sur chaque carte, `filter: drop-shadow(0 2px 2px rgba(0,0,0,.3))` sur les icônes | Un flou par carte (24 cartes) ; `filter` sur chaque icône | Aucune ombre floue : l'anneau de focus est un `box-shadow` à rayon de flou 0, statique, sur **un seul** élément ; icônes à plat |
| Cartes translucides superposées au fond teinté (`rgba(30,30,30,.6)` sur les avis, bandeaux) | Mélange alpha de chaque pixel avec le dégradé animé | Aplat opaque `#1f1f1f` hors du Dock ; le seul translucide autorisé est celui du Dock (`.bac`, `.pastille`), sur fond fixe |
| Plein écran du lecteur : barres du haut et du bas, ombrage sur l'image | Plein écran composé sur la vidéo | Un seul bandeau en bas, aplat `rgba(11,11,13,.8)`, `opacity` seulement ; rien en haut hors retour ; aucune surface sur l'image tant que les contrôles sont masqués |
| Défilement horizontal des rangées (Plex Web : défilement natif et boutons ‹ ›) | Repeint des rangées | `transform: translateX` par pas d'une page ; rangée virtualisée, voisines hors écran retirées |

## Harmonisation avec le Dock v2

Référence : `packages/launcher/mockups/dock.html` et `mockups.css`. Le module Plex reprend, sans les redéfinir :

- les jetons de fond, texte et surface du Dock (voir « Couleurs ») ;
- Outfit 300/500, interlettrage négatif sur les grands titres ;
- les marges de 120 px, les pastilles du haut, le rayon de 36 px pour les grandes tuiles (12 px pour les affiches) ;
- le focus : `scale`, anneau blanc de 6 px, pastille inversée ;
- le mécanisme de fond : 2 calques plein écran, teinte écrite sur le calque caché puis fondu d'`opacity` ;
- la contrainte « on n'anime que `transform` et `opacity` ».

Seule différence : l'ambre `#e5a00d` pour l'action principale et la progression, qui rappelle la tuile « Plex intégré » du Dock (`#e5a00d`).

À valider sur la TV (M1) : coût mémoire des 2 calques de fond avec 24 affiches décodées ; sinon réduire les calques à 960×540, comme prévu dans `COUTS.md`.
