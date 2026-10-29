# Bilan

Fait :
- Cache de stockage : seules les lectures de démarrage (`startup`: catalogue, mode, tuiles) sont mises en cache ; tout load-puis-save relit localStorage, donc une sauvegarde d'un chunk (jeton Plex, serveur, langues) n'est plus écrasée par app.js. Test à deux copies du module ajouté (tests/tv-core.test.mjs).
- Affirmation « décodé » corrigée (icon.ts, docs/decisions.md) : Chromium 63 décode à la peinture ; marqué « non résolu », la ligne « cause du max » le confirmera sur la TV.
- `npm run check` vert (414 tests).

Non fait : pré-décodage réel des logos (calque caché) ; mesures avant/après sur la TV (Stéphane).
