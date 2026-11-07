# Bilan — Essai B, étape 1 : app native vide sur la Frame

**Résultat : installation ACCEPTÉE ; le code natif ne s'exécute pas (le processus est créé, puis reste bloqué).**

Critères :
- Résultat clair : un `.tpk` natif signé avec notre profil (certificats auteur et distributeur inchangés, empreintes identiques à celles de cimaise) **s'installe** (« install completed », `pkg_type[tpk]`, app vue par Stéphane dans Apps).
- Lancement vu par Stéphane : **oui, mais en échec**. v1 (avec fenêtre) : chargement infini, texte jamais affiché. v2 (sans fenêtre, lancée par un lanceur web) : Stéphane a photographié le journal. Le processus est créé (`contextId 3140`) mais ne s'arrête jamais seul : il est encore vivant environ 5 min après le lancement, alors que le code se ferme à 60 s. Le second `launch` → `UnknownError`.
- Désinstallation : faite par **Stéphane depuis le menu de la TV**, car `sdb uninstall` et `0 vd_appuninstall` répondent `closed`. `native-probe.sh list` confirme ensuite : sonde et lanceur absents, `cimaise001.Cimaise` présent.
- Aucun réglage TV écrit. Aucune commande sdb hors de la liste du script. cimaise intacte.

Ce que ça tranche : le chargement infini de la v1 ne venait pas de l'affichage de la fenêtre. Restent deux causes possibles, non départageables sans logs : la TV refuse d'exécuter un natif signé par un certificat public, ou l'initialisation d'appfw/ecore bloque (rootstrap IoT 5.0 différent de la TV). Les étapes suivantes de la Voie B (vconf, app_operation) sont **bloquées**. Recommandation consignée dans `docs/home-button.md` : clore la Voie B. Décision à prendre par Stéphane.

Livré :
- Image Docker : chaîne native Tizen 5.0 (rootstrap IoT-Headed 5.0 armel + GCC 6.2 + NativeCLI ; apt : python2.7, libpython2.7, libncurses5, make). Coût : +1,35 Go de SDK, image de 9,80 à 11,92 Go. Pas de rootstrap TV public. Construite sous le tag `cimaise-tizen:5.6-native` ; `build-image.sh` reconstruira `cimaise-tizen:5.6` après la fusion.
- `apps/native-probe/` (sonde v2, la v1 reste dans le commit bf1a1a6), `apps/native-launcher/` (lanceur jetable avec deux privilèges publics, application.launch et application.info), `scripts/tizen/native-probe.sh`. `lib.sh` monte `.local` quand il est hors du dépôt (cas d'un worktree).
- Consigné : `docs/tv-status.md` (observé, SDK, non testé), `docs/home-button.md`, `docs/decisions.md`. Photos des deux journaux publiées sur la carte.

À noter :
- Stéphane a aussi supprimé **cimaise-blank** lors de la première suppression. À réinstaller pour la mesure plancher M1.
- La v1 a été installée deux fois par erreur (la seconde est une mise à jour, sans effet).
- Une réponse intermédiaire (« avant : sonde absente ») contredit la photo de l'essai 2 ; c'est la photo qui est retenue.

## Suite : autres pistes pour le bouton Home (question de Stéphane)

Ajouté à `docs/home-button.md`, section « Autres pistes après la Voie B » : dix pistes non natives, avec pour chacune la faisabilité sur la Frame 2019, le coût et ce qu'il faudrait tester. Rien n'a été exécuté sur la TV et aucun réglage n'a été écrit. Seule piste vers un vrai « bouton cimaise » depuis n'importe où : le lancement réseau via Home Assistant (piste 5), éventuellement avec retour automatique (piste 6). Il faut d'abord vérifier que la TV accepte de lancer une app développeur par le réseau. Sans homelab : cimaise en tête de barre, autorun, retour par Home ou Retour (pistes 2, 3, 4). Prochaine carte à choisir par Stéphane : (a) test réseau, (b) essais manuels, (c) raccourcis de touches dans cimaise.

## Piste 5 testée (à la demande de Stéphane) : lancement réseau → OK

Un `POST /api/v2/applications/cimaise001.Cimaise` (API Smart View, port 8001) → `true`, et **cimaise s'est ouverte** (vu par Stéphane). Une demande d'autorisation « Home Assistant » s'est affichée en même temps et Stéphane l'a acceptée (Home Assistant fait désormais partie des appareils autorisés de la TV ; c'est réversible). Le « bouton cimaise » externe via Home Assistant est donc faisable. Prochaine carte à choisir : le déclencheur (bouton Zigbee, widget, NFC, voix) et, éventuellement, le retour automatique (délai N).
