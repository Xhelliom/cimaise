# Bilan : maquette Overseerr léger à valider (accueil + fiche)

## Fait
- Maquette statique dans `packages/overseerr/mockups/` (aperçu seulement, jamais dans le .wgt), servie par `npm run dev` sous
  `/mockups/overseerr/` (route ajoutée à `scripts/dev/server.mjs`, lien dans l'index des maquettes) :
  - `accueil.html` : « Films du moment » / « Séries du moment », 2 rangées de 7 affiches, badges en pilule, focus aux flèches ;
  - `fiche.html` : 4 états par `#demander`, `#demande`, `#attente`, `#disponible` ; Entrée sur « Demander » → badge « Demandé » (rien n'est envoyé).
- Style : ardoise `#0f172a`, accent indigo `#6366f1`, affiches arrondies, badges pilule (vert / indigo / ambre), Outfit déjà livrée.
  **Aucun `backdrop-filter`, `filter` ni `blur()`**, aucune image, une seule ombre (anneau de focus à rayon 0), animations `transform` seules (testé).
- **Coût CSS : 3 439 o brut, 2 813 o minifié, 1 029 o gzip** (+14,6 % de `app.css` minifié si repris tel quel ; chargé avec le chunk Overseerr). Détail : `packages/overseerr/mockups/COUTS.md`.
- Captures 1920×1080 : 6 de la maquette (dans git, `captures/`), 4 de la vraie instance Overseerr 1.33.2 et 3 planches côte à côte
  (Overseerr à gauche, maquette à droite) dans `.local/overseerr-captures/` (hors git : montrent l'instance du homelab). Tout est publié sur la carte.
- Tests : `tests/overseerr-mockups.test.mjs` (6) ; `npm run check` vert (660 tests).

## Pas fait / à noter
- Captures Overseerr : prises en Chromium headless après une **connexion par token Plex** (`POST /api/v1/auth/plex`, ouverture de session,
  seule écriture) ; aucune demande envoyée. `overseerr-accueil.png` montre les pseudos d'autres utilisateurs (Demandes récentes) : publiée sur la carte
  locale seulement, les planches utilisent la page Films à la place.
- Affiches factices (dégradés) : coût des vraies affiches TMDB estimé, pas mesuré à l'écran (≈ 4,8 Mo décodés pour 14 affiches w185).
- Non tranché, à décider au câblage : couleur de teinte de la fiche (Overseerr ne la fournit pas), choix des saisons pour une série, place de « Lire dans Plex ».
- Rien n'est câblé (lot suivant, après validation du style par Stéphane).
