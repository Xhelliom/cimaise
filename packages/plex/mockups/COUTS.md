# Maquette des finitions Plex (30/10) : coût (1920×1080)

Aperçu : `npm run dev` puis http://127.0.0.1:5173/mockups/plex/ (accueil), `fiche.html`, `lecteur.html` et `lecteur.html#pause`.
Flèches pour déplacer le focus ; accueil : `#zone-index` (`#0-1` = roue dentée, `#2-6` = rangée défilée) ; fiche : Entrée sur
« Reprendre » ouvre le lecteur, `#2` focalise « Marquer vu » ; lecteur : Entrée sur le bouton central bascule lecture / pause.
Captures : `captures/maquette-plex-*.png` (1920×1080, données factices). Les captures avant/après sur la bibliothèque du homelab
(module actuel de l'aperçu, puis maquette avec les vraies affiches et le vrai fond du transcodeur) montrent la bibliothèque
personnelle : **pas dans git** (`.local/plex-finitions-captures/`), livrées sur la carte.

Demandé le 30/10, maquetté :
1. **Lecteur** : ▶ / ❚❚ en icônes CSS au lieu de « Lecture » / « Pause » ; grand ❚❚ semi-transparent au centre en pause ; bouton
   focalisé en indigo `#6366f1` (accent Overseerr) ; titre + « finit à HH:MM » sur la même ligne, au-dessus de la barre ; −10 / +10 de
   part et d'autre du bouton central, Audio et Sous-titres à droite. Le libellé « Pause » en ambre disparaît (le grand ❚❚ le remplace).
2. **Accueil** : champ « Rechercher un film, une série… » en tête (720 px), roue dentée à côté (Réglages, au lieu de la rangée
   « Réglages ») ; onglets en pilules Accueil · Films · Séries (bibliothèques, au lieu des carrés gris) ; puis En cours (progression
   dans l'affiche) et Ajoutés récemment.
3. **Fiche** : fond = art de l'œuvre **flouté et assombri par le transcodeur photo de Plex** ; Reprendre (indigo, ▶) / Depuis le début /
   Marquer vu (✓) en pastilles de 88 px, sous une jauge « 26 min vues · reste 1 h 49 ».
4. **Focus homogène** : partout le même anneau blanc de 6 px à rayon de flou 0 + `scale(1.06)` (affiches, pastilles, roue, boutons du
   lecteur) ; **indice de débordement** : fondu statique au bord + chevron, « 7 sur 8 » à côté du titre de rangée.

Accent : l'ambre `#e5a00d` du module (Lecture, progression) devient l'indigo d'Overseerr partout, pour un seul accent dans l'app.
**À confirmer** : c'est un choix de la maquette, pas une demande explicite.

## Aucun flou CSS

Aucun `filter`, `backdrop-filter` ni `blur()` dans `plex.css` ni dans les pages (testé). Le seul flou est calculé **par le serveur** :

`/photo/:/transcode?width=480&height=270&blur=20&opacity=35&background=0b0b0d&minSize=1&upscale=1&url=<art>`

Vérifié le 30/10 sur le serveur du homelab (Bohemian Rhapsody) : 200, JPEG **3 850 o**. `opacity` + `background` sont acceptés : le
serveur assombrit l'image lui-même, donc **pas de voile CSS** par-dessus. `fond-factice.jpg` (2 648 o, 480×270) imite cette sortie
pour la maquette ; il a été généré une fois hors ligne (canvas), ce n'est pas un rendu de la TV.

## Coût CSS

`plex.css` de la maquette : **7 496 o brut, 6 129 o minifié (esbuild), 1 817 o gzip**, autonome (police, base, trois écrans).
Pour comparaison, `packages/plex/src/plex.css` actuel fait 13 342 o minifié (2 763 o gzip), chargé avec le chunk Plex (pas dans le
CSS initial).

Par finition, minifié, à ajouter au module si elle est retenue :

| Finition | Règles | Coût |
|---|---|---|
| Focus homogène | `.f`, `.f.focus` | 119 o (remplace les variantes actuelles : anneau, pastille inversée) |
| Icônes ▶ ❚❚ loupe ✓ | bordures CSS, 0 image, 0 glyphe de police | 655 o |
| Pastilles, bouton rond | `.pil`, `.rond` | 329 o |
| En-tête Rechercher + roue, onglets | `.tete`, `.cherche`, `.onglets` | 361 o (+ roue en SVG inline : 461 o, 192 o gzip, dans le JS) |
| Indice de débordement | 2 fondus + chevrons par rangée | 532 o |
| Fiche (fond, jauge, actions) | `.fond`, `.prog`, `.actions` … | 974 o |
| Lecteur (grand ❚❚, ligne titre + fin) | `.grand`, `.ligne`, `.fin` | 660 o (lecteur complet : 1 985 o) |

Estimation à l'intégration : **+1,5 à +2 Ko minifié** sur le chunk Plex une fois retirées les règles remplacées (carrés des
bibliothèques, rangée Réglages, `.plex-pl-state`, focus inversés). `app.js` et `app.css` initiaux : **inchangés** (tout vit dans le
chunk Plex chargé à la première ouverture).

## Coût images et rendu

| Écran | Images | DOM (maquette) | Effets |
|---|---|---|---|
| accueil.html | aucune nouvelle (affiches 240×360 inchangées) ; roue = SVG inline | DOM : 103 éléments (dont 9 pour la roue SVG ; 2 rangées × 8 affiches non virtualisées dans la maquette) | `transform` seul (`scale` du focus, `translateX` de la rangée) ; 2 fondus `linear-gradient` statiques par rangée, peints une fois, composés au-dessus de la rangée qui défile : **à mesurer sur la Frame** |
| fiche.html | fond 480×270 (3,9 Ko JPEG, 0,5 Mo décodé) au lieu de l'art net 1920×1080 (367 Ko JPEG, 8,3 Mo décodé, mesuré) ; affiche 360×540 inchangée | DOM : 18 éléments | `scale` du bouton focalisé ; aucun voile, aucun dégradé (l'assombrissement est dans le JPEG) |
| lecteur.html | 0 (la vidéo AVPlay est sous le HTML ; `.video` ne sert qu'à la maquette) | DOM : 23 éléments | `opacity` du calque de contrôles et du grand ❚❚ ; dégradé du bas déjà présent dans le module (renforcé : `.85` → `0` sur 460 px) |

Variante possible si le fond paraît trop pâteux : `width=960&height=540&blur=40` = 10,6 Ko (mesuré), 2 Mo décodé. Non retenue.

## Pas chiffré, à vérifier sur la Frame

- Coût réel des 2 fondus de bord pendant le défilement d'une rangée (repli : chevron seul, sans fondu, 0 dégradé).
- Le fond de fiche change à chaque fiche : prévoir le fondu d'`opacity` entre 2 calques déjà décrit dans `docs/plex-design.md`.
- La roue dentée en SVG inline sur le moteur de Tizen 5 (repli : glyphe dessiné en CSS).
- JS de la maquette (≈ 0,9 Ko accueil, ≈ 0,6 Ko fiche, ≈ 0,6 Ko lecteur) : démonstration seulement, hors budget produit.
