# Bilan — Essai B, étape 1 : app native vide sur la Frame

**Résultat : installation ACCEPTÉE, lancement NON abouti.**

Fait :
- Chaîne native Tizen 5.0 ajoutée à l'image Docker : rootstrap IoT-Headed 5.0 armel + GCC 6.2 + NativeCLI. Il n'existe pas de rootstrap TV public. Coût : +1,35 Go de SDK, image de 9,80 à 11,92 Go. Prérequis apt : python2.7, libpython2.7, libncurses5, make.
- Sonde `apps/native-probe/` (`org.cimaise.sondenative`, C, aucun privilège, ni vconf ni dlopen) et script `scripts/tizen/native-probe.sh`. Le `.tpk` (29,7 Ko) est signé avec les mêmes certificats que cimaise (empreintes vérifiées).
- Sur la Frame : install « completed » (`pkg_type[tpk]`) et app **vue par Stéphane**. Au lancement, `was_execute` répond « resumed » et l'écran **charge à l'infini** (vu par Stéphane) : le texte n'apparaît jamais. Stéphane est sorti avec Home ou Retour.
- Désinstallation : `sdb uninstall` et `0 vd_appuninstall` → `closed`. **Stéphane a supprimé la sonde depuis le menu de la TV**, et `applist` confirme son absence. cimaise001.Cimaise est intact.
- Consigné : `docs/tv-status.md` (observé / SDK / non testé), `docs/decisions.md`, `docs/home-button.md` (résultat de l'étape 1).

Non fait / à noter :
- Cause du chargement infini non départagée, faute de logs (`logcat` et `appinfo` sont `closed`) : refus d'exécution du natif signé public, ABI des bibliothèques EFL, ou fenêtre. Une sonde suivante est proposée dans `docs/home-button.md` ; elle est à décider.
- Stéphane a aussi supprimé **cimaise-blank** (`cimaiseblk.Blank`) en même temps (il l'a confirmé). À réinstaller pour la mesure plancher M1.
- L'install a été envoyée deux fois par erreur (la 2ᵉ est une mise à jour, sans effet).
- L'image a été construite sous le tag `cimaise-tizen:5.6-native` pour ne pas gêner les autres sessions. Le tag par défaut `cimaise-tizen:5.6` sera reconstruit par `build-image.sh` après la fusion.
- Aucun réglage TV écrit, aucune commande sdb hors de la liste du script.
