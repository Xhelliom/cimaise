# Bilan

## Fait
- Cartes précédentes (package `cimaise001`, privilèges `application.launch`/`application.info`, test de longueur des 3 config.xml, sortie sans espace) : déjà dans la branche.
- Correctif critère 3 : `scripts/tizen/package.sh` remplace désormais le `.wgt` sûr précédent (`mv -f`) au lieu de s'arrêter ; plus de `.wgt` avec espaces laissé dans `dist/`.
- Test ajouté dans `scripts/tizen/test.sh` : `package.sh` deux fois de suite, aucun `.wgt` avec espace, puis `install.sh` sans argument réussit.
- `npm run check` vert (180 tests).

## Non fait
- Rien de la carte. Le garde-fou « refuse d'écraser » est supprimé : seul le fichier au nom non sûr, qu'écrit le packager, déclenche le renommage, donc il ne peut pas venir d'une autre source.
