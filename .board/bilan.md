# Bilan

Fait : package `cimaise001` / id `cimaise001.Cimaise` partout, privilèges application.launch et application.info documentés dans docs/decisions.md, package.sh/install.sh sans espaces (testés), aucun ID d'app TV committé.
Correctif : tests/wgt.test.mjs ne lit plus bench/cleanframe/work (fichier généré, ignoré par git) ; il vérifie apps/tv et apps/blank. Le bench reste vérifié par tests/bench-cleanframe.test.mjs (/^[A-Za-z0-9]{10}$/ après son propre build).
Vérifié : `node --test tests/wgt.test.mjs` passe seul après `rm -rf bench/cleanframe/work` ; `npm run check` vert (180 tests).
Reste : rien dans la carte. L'installation sur la TV reste à confirmer par Stéphane.
