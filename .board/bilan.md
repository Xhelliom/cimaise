# Bilan

**Fait**
- Package `cimaise001` (id `cimaise001.Cimaise`) ; tests de longueur 10 car. : `wgt.test.mjs` (apps/tv, apps/blank), `bench-cleanframe.test.mjs` (bench).
- Privilèges `application.launch` et `application.info` ajoutés et documentés (docs/decisions.md).
- `package.sh` : sortie réduite à `[A-Za-z0-9._-]` (`CleanFrame (bench).wgt` → `CleanFrame-bench.wgt`).
- `install.sh` : refuse avec un message clair tout .wgt au nom hors `[A-Za-z0-9._-]`, avant tout appel à la TV.
- `scripts/tizen/test.sh` : cas du repli vd_appinstall forcé (commande journalisée sans caractère spécial), refus du nom non sûr, test 7 bis mis à jour.
- docs/decisions.md : phrase sur les tests corrigée.
- `scripts/tizen/test.sh` vert ; `npm run check` vert (180 pass).

**Non fait / à confirmer**
- Privilèges et installation réelle non testés sur la TV.
- `.local/tizen.env` (APP_ID) à mettre à jour à la main.
