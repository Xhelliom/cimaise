# Bilan

Fait :
- Cache de stockage : seules les lectures de démarrage (`startup`) sont mises en cache ; tout load-puis-save relit localStorage (un chunk ne perd plus ses sauvegardes) ; test à deux copies du module.
- Pré-décodage des logos par couche cachée (`.predecode`) après leur pose, avant le premier appui ; test ajouté (tests/home.test.mjs).
- Mesures dans l'aperçu (Chromium 155 headless, 1920×1080, CPU ×1 et ×4, 3 passes, 20 appuis) sur bda1917 et HEAD, tableau avant/après dans docs/decisions.md. Marques et ligne « cause du max » lues au diagnostic : firstPaint 6–34 ms, max 33–57 ms, cause « inconnue » (ni logo ni fondu ni GC).
- `npm run check` vert.

Pas fait / limite : l'aperçu ne reproduit pas la TV (avant déjà 8–34 ms de firstPaint et max ≤ 57 ms, contre 583 ms et 298 ms sur la Frame) ; il ne prouve donc ni gain ni atteinte des cibles. Mesure TV (Stéphane) à consigner dans decisions.md et tv-status.md.
