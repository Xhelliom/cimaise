# Bilan : logo Overseerr sur la tuile du Dock

## Fait
- `packages/launcher/src/catalog/known-apps/logos/overseerr.png` : logotype large du projet Overseerr (`public/logo_full.svg`, sct/overseerr, branche `develop`, commit `98ea135`, licence MIT), recoloré en **une encre blanche** (pastille en dégradé passée en blanc, ombre et reflet retirés), 320 × 68 px, PNG 8 bits à palette (pngquant, 64 couleurs) : **2 878 octets**.
- Entrée dans `known-apps/index.ts` : `names: ['overseerr']`, `bg: '#4f65f5'` (fin du dégradé du logo), `ink: '#ffffff'` (contraste ≈ 4,4 : 1, testé par la règle « ≥ 2,5 » existante ; encre du PNG vérifiée par la palette).
- Provenance, licence, traitement et poids consignés dans `THIRD_PARTY_NOTICES.md`.
- Tests : fond Overseerr et URL du logo (`tests/known-apps.test.mjs`) ; `npm run check` complet : 728 tests OK, ES5 et CSS OK.
- Aperçu navigateur : logo blanc sur la tuile bleu-violet (capture `dock-tuile-overseerr.png` publiée sur la carte). Dans le cadre de logo de la tuile (216 × 130), le logotype fait 216 × 46, comme YouTube et France.tv qui sont aussi larges.
- Frame : empaqueté, signé, installé et lancé. Réponse du SDK seulement (« install completed », app présente, « launched ») ; consigné dans `docs/tv-status.md`.

## Pas fait / en attente
- **Ce que montre l'écran de la Frame** : à confirmer par Stéphane (le SDK ne prouve pas l'affichage).
