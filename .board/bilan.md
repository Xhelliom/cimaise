# Bilan — 3 pistes de logo

## Fait
- 3 SVG sources à la main dans `packages/launcher/brand/logo-{1,2,3}.svg` (viewBox 512, fond plein `#0e0e12`, 2 couleurs : blanc cassé `#f3efe7` + ambre `#e3a94b`, sans texte ni effet) : 1 rail + cadre suspendu par deux fils ; 2 monogramme « c » (rail + cadre ouvert) ; 3 cadre dont le bord haut est un rail avec point d'accroche.
- Rendus publiés sur la carte : `planche-comparative.png` (512/128/64), `logo-<n>-icone-512.png`, `logo-<n>-tuile-dock.png` (tuile Dock normale + focus, avec mot « cimaise » en Outfit).
- `tests/brand.test.mjs` (SVG présents, fond plein, ≤ 3 couleurs, pas de texte/filtre, icône de l'app non modifiée). `npm run check` vert (407 tests).

## Non fait / réserve
- Icône de l'app NON remplacée (`apps/tv/icon.png` intacte) : Stéphane choisit d'abord.
- Le script de rendu (Playwright, hors repo) n'est pas versionné ; les PNG ne sont pas dans le repo, seulement publiés.
- Non testé sur la TV.
