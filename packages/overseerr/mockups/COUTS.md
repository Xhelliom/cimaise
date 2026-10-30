# Maquette Overseerr léger : coût (1920×1080)

Aperçu : `npm run dev` puis http://127.0.0.1:5173/mockups/overseerr/ (accueil) et `fiche.html#demander`, `#demande`, `#attente`, `#disponible`.
Flèches pour déplacer le focus, Entrée pour ouvrir la fiche ; sur la fiche, Entrée sur « Demander » passe le badge à « Demandé » (rien n'est envoyé), Échap revient à l'accueil.
Captures : `captures/maquette-overseerr-*.png` (1920×1080). Les captures d'Overseerr et les planches côte à côte montrent l'instance du homelab : **pas dans git** (`.local/overseerr-captures/`), livrées sur la carte.

Style : alternative légère à Overseerr. Fond ardoise `#0f172a`, surfaces `#1e293b`, accent indigo `#6366f1` (pastille active, bouton Demander, badge Demandé), affiches arrondies (16 px, 20 px sur la fiche), badges en pilule : Disponible vert `#22c55e`, Demandé indigo, En attente ambre `#f59e0b`. Police Outfit déjà livrée (300/500), aucune police ajoutée.

## Coût CSS

`overseerr.css` : **3 439 o brut, 2 813 o minifié (esbuild), 1 029 o gzip**. Pour comparaison, `app.css` actuel fait 19 239 o minifié : +14,6 % si tout est repris tel quel. Une partie redouble des règles déjà présentes (pastilles, `@font-face`, `html,body`) : l'intégration réelle devrait coûter moins de 2,5 Ko minifié, chargée avec le chunk Overseerr (pas dans le JS ni le CSS initial).

| Maquette | Police | Fond | DOM | Effets |
|---|---|---|---|---|
| accueil.html — Films / Séries du moment | Outfit 300/500, déjà livrée | uni `#0f172a`, 0 o | DOM : 34 éléments (en-tête, 3 pastilles, 2 rangées × 7 affiches, 6 badges) | `transform` seul : `scale(1.08)` de l'affiche focalisée (0,2 s), `translateX` de la rangée (0,25 s) ; anneau de focus `box-shadow` 6 px à rayon de flou 0, sur un seul élément |
| fiche.html — badge Disponible / Demandé / En attente, bouton Demander | idem | 1 calque `radial-gradient` statique teinté par l'affiche, 0 o, peint une fois (pas d'animation) | DOM : 16 éléments | `transform: scale(1.05)` du bouton focalisé + anneau 6 px ; aucun flou |

Aucun `backdrop-filter`, aucun `filter`, aucun `blur()`, aucune ombre floue, aucune image (les affiches sont des dégradés factices). Overseerr, lui, pose un fond d'œuvre plein écran (image 1080p + dégradé par-dessus) et une affiche par carte avec ombre : c'est ce que remplacent le calque de teinte unique et l'anneau à rayon 0.

## Ce que la maquette ne chiffre pas encore

- **Affiches réelles** : TMDB `w185` (≈ 10 Ko) pour les rangées, `w300` (≈ 22 Ko) pour la fiche (mesures du 30/10, `posterUrl`). Décodées : 240×360×4 = 345 Ko par affiche ; 2 rangées × 7 = ≈ 4,8 Mo. Virtualisation et libération comme pour Plex (`docs/plex-design.md`).
- **Teinte de la fiche** : couleur à tirer de l'affiche ; Overseerr ne la fournit pas (Plex a `UltraBlurColors`). Repli : teinte indigo fixe. À trancher au câblage.
- **Série** : « Demander » choisit les saisons dans Overseerr ; non maquetté (demande de toutes les saisons, ou écran de choix, à décider).
- JS de la maquette (≈ 0,6 Ko accueil, ≈ 2,7 Ko fiche, données comprises) : démonstration seulement, hors budget produit.
