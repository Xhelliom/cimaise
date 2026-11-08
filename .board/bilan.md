Issue : partiel

## Smart Hub : icône de cimaise au format tuile paysage

**Fait**
- Format vérifié dans la doc Samsung : 117×117 = icône « de test » (Design Q&A, Q3) ; icône des apps publiées =
  512×423, PNG 24 bits RVB (App Icons and Screenshots). Rien sur l'`<icon>` de `config.xml`.
- `apps/tv/icon.png` refaite en 512×423 RVB (source `packages/launcher/brand/icon.svg`) : 37 092 o (+31 444 o), consigné dans
  `docs/decisions.md` ; `config.xml` passé en version 0.0.2 ; `npm run check` vert.
- Frame (TV2 non touchée) : installation par-dessus, redémarrage complet, installation en 0.0.2, puis — avec l'accord explicite
  de Stéphane — désinstallation depuis la TV et installation propre. Tout est consigné dans `docs/tv-status.md`.
- Comparaison avant/après et les deux icônes publiées sur la carte.

**Pas fait / pourquoi**
- Critère 2 non rempli : Stéphane voit toujours une tuile verticale (il pense voir l'icône carrée ; photo demandée pour
  trancher). Hypothèse : tuile de format fixe pour les apps hors Store sur le Smart Hub 2019 ; non confirmée.
- Variante 1:1 transparente prête (hors dépôt) mais pas encore essayée.
- Désinstallation : jeton Plex et réglages perdus (accepté par Stéphane) ; reconnexion Plex par PIN à refaire.
