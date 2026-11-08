Issue : partiel

## Smart Hub : icône de cimaise au format tuile paysage

**Fait**
- Format vérifié dans la doc Samsung : 117×117 = icône « de test » (Design Q&A, Q3) ; icône des apps publiées =
  512×423, PNG 24 bits RVB (App Icons and Screenshots).
- `apps/tv/icon.png` = tuile verre-2 **avec le mot « cimaise »**, recadrée en 512×423 RVB (source
  `packages/launcher/brand/icon-tuile.svg`, à partir de `tile.svg`) : **29 175 o** (+23 527 o vs 117×117) ; `.wgt` signé
  215 189 o. Variantes essayées et gardées en source : `icon.svg` (symbole seul, 512×423), `icon-carre.svg` (1:1 transparente).
- Sur la Frame (TV2 non touchée) : installations par-dessus, redémarrage, version 0.0.2, puis désinstallation **avec l'accord
  explicite de Stéphane** et installation propre ; puis variantes par-dessus. Tout est consigné dans `docs/tv-status.md` et
  `docs/decisions.md`.
- **Vu par Stéphane** : la tuile 512×423 avec le mot s'affiche sans déformation et « le texte rend bien » (la 16:9 était écrasée).

**Pas fait / pourquoi**
- La tuile cimaise reste **moins allongée** que celles de Netflix, Plex, etc. Le Smart Hub met l'icône d'une app hors Store
  dans une tuile de format fixe ≈ 512×423 ; les tuiles plus larges des apps du Store viennent sans doute des visuels du Seller
  Office. Hors d'atteinte avec `config.xml`, à ma connaissance. Stéphane accepte le résultat « pour cette fois ».
- La désinstallation a effacé le jeton Plex et les réglages : reconnexion Plex par code PIN à refaire.
