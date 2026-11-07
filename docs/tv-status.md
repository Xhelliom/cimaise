# État de NOTRE TV (Samsung The Frame 2019, LS03R, Tizen 5.0)

Modèle exact et firmware : à relever en M0.

## Observé physiquement

Ce qui a été vu à l'écran ou constaté sur la TV.

- **Sous-titres sur la Frame, lecture directe (2026-10-30, build 0c099db + caa9407).** Stéphane a joué trois épisodes avec un sous-titre actif. Question posée pour chacun : texte affiché, synchrone avec la voix, toujours là après un saut (±10 s et saut long). Réponse de Stéphane (choix « OK partout » dans les trois cas, sans autre commentaire) :
  - SRT interne : *Bluey* S1E1, piste anglaise → « OK partout » ;
  - SRT externe : *Rick and Morty* S1E5 → « OK partout » ;
  - ASS converti en SRT par le serveur (sidecar) : *The Bear* S3E1, piste anglaise → « OK partout ».
  - *Ce que j'en déduis* (non dit par lui) : les trois chemins `setSelectTrack`, `setExternalSubtitlePath` et ASS → SRT sidecar fonctionnent sans transcodage. Pas de mesure de décalage ni de message d'erreur relevés ; mov_text, SSA, PGS, VobSub non testés.

- **Overseerr en HTTPS depuis la Frame (2026-10-30).** Paquet avec `<access origin>` de l'hôte Overseerr (Let's Encrypt, intermédiaire YR2, aucun en-tête CORS côté serveur). Diagnostic (0) puis Sonde Overseerr (2). Question posée : que montrent les 3 lignes (image /favicon.ico, XHR /api/v1/status sans clé, XHR /api/v1/discover/movies avec X-Api-Key) ? Réponse de Stéphane : « **Tout 200** » (choix « image 200, status 200 (version 1.33.2), discover 200 (N films) »), sans recopier les temps ni le nombre de films.
  - *Ce que j'en déduis* (non dit par lui) : Tizen 5 accepte la chaîne Let's Encrypt YR2, et l'app empaquetée n'est pas bloquée par l'absence de CORS ni par le pré-vol 405. Temps de réponse non relevés.

- **Overseerr : fiche et « Demander » depuis la Frame (2026-10-30, build 3fc810f).** Questions posées : la fiche d'un film sans badge s'ouvre-t-elle et que dit l'écran après « Demander » ; au retour, badge sur l'affiche et demande visible dans Overseerr ; une série demandée couvre-t-elle toutes les saisons. Réponses de Stéphane (choix proposés, sans autre commentaire) : « **Demande envoyée** » ; « **Badge + vu dans Overseerr** » ; « **Toutes les saisons** ». Titres demandés non relevés.
  - *Ce que j'en déduis* (non dit par lui) : `POST /api/v1/request` passe depuis l'app empaquetée (pré-vol compris), la réponse 201 est lue, le badge des rangées change sans requête, `seasons: "all"` est accepté ; les affiches TMDB (w185, w300) s'affichent probablement sur la Frame (le choix « fiche cassée, affiche absente » n'a pas été pris ; pas confirmé explicitement). Temps de réponse non mesurés ; erreurs (clé refusée, 409) non provoquées sur la TV.

- **Voie B, étape 1 : app native C (.tpk) vide sur la Frame (2026-10-31).** Paquet `org.cimaise.sondenative` (distinct de cimaise), signé avec le profil `cimaise` habituel, sans aucun privilège. Questions posées à Stéphane et réponses (choix proposés) :
  - après l'installation, « Sonde native » est-elle visible dans Apps ? → « **Vue** » ;
  - après le lancement (`was_execute`), que montre l'écran ? → « **Rien ou erreur** », précisé par écrit : « **ça charge à l'infini** ». Le texte attendu (« cimaise — sonde native OK ») ne s'est jamais affiché, et l'app ne s'est pas fermée seule au bout de 30 s ;
  - sortie avec Home ou Retour → « **Sorti** », écran revenu à la normale ;
  - suppression depuis la TV (menu Apps → Réglages → Supprimer, sdb ayant refusé) → « **Supprimée** ». Stéphane a aussi supprimé **`cimaise-blank`** (`cimaiseblk.Blank`, page vide de référence pour M1) dans la même opération (il l'a confirmé). À réinstaller si on refait la mesure plancher.
  - *Ce que j'en déduis* (non dit par lui) : **l'installation d'un .tpk natif signé avec notre certificat public est acceptée**, mais **le lancement n'aboutit pas** : le lanceur de la TV attend une fenêtre qui n'arrive jamais. Le processus n'a sans doute jamais atteint `app_create`, sinon la minuterie de 30 s l'aurait fermé. Causes possibles, non départagées faute de logs (`logcat` et `appinfo` sont `closed`) : refus d'exécution d'un binaire natif signé par un certificat public, plantage au chargement (bibliothèques EFL/appfw du rootstrap IoT 5.0 différentes de celles de la TV), ou fenêtre EFL non prise en charge par le compositeur de la TV.

- **Voie B, sonde v2 : app native sans fenêtre et lanceur web (2026-10-31).** La sonde `org.cimaise.sondenative` 1.0.1 ne crée aucune fenêtre ; elle doit rester vivante 60 s puis se fermer seule. Elle est lancée depuis un lanceur web jetable, `cmzlanceur.Lanceur`. Ce lanceur appelle `tizen.application.launch`, relève `getAppsContext` à intervalles réguliers et garde un journal qui survit à la sortie. Deux photos de l'écran ont été envoyées par Stéphane et publiées sur la carte : `sonde-native-journal-essai1.jpg` et `sonde-native-journal-essai2-90s.jpg`.
  - **Essai 1** (14:41:04, lanceur v0.0.1, relevés jusqu'à 30 s) : « avant : sonde absente des 41 apps en cours » ; la sonde est « EN COURS (contextId 3140) » de t+0,5 s à t+30 s ; « launch : succès (callback) » n'arrive qu'à **+5,0 s**.
  - **Essai 2** (14:44:33, lanceur v0.0.2, relevés jusqu'à 90 s) : dès le démarrage du lanceur, la sonde est « EN COURS (contextId **3140**) », c'est-à-dire le même contexte que l'essai 1, 3,5 min plus tôt. On lit ensuite « launch : ÉCHEC : UnknownError : Unknown error. » à +5,4 s, puis « EN COURS (contextId 3140) » à chaque relevé jusqu'à **t+90 s** inclus (t+55, 58, 62 et 65 s compris).
  - Écran : le lanceur est resté affiché pendant l'essai 2, sans écran de chargement (réponse de Stéphane, choix proposé, puis précisé par écrit : « je n'ai vu que le journal défiler »).
  - **Écart à noter** : entre les deux essais, Stéphane avait répondu « avant : sonde absente » à une question sur un nouvel appui sur OK. La photo de l'essai 2 montre au contraire le contexte 3140 toujours présent. C'est la photo qui est retenue.
  - Suppression : Stéphane a supprimé « Sonde native » et « Lanceur sonde » depuis le menu de la TV → « supprimées ».
  - *Ce que j'en déduis* (non dit par lui) : le même contexte 3140 a existé pendant au moins 5 min environ (14:41:04 → 14:46:03), alors que le code de la sonde se ferme à 60 s. **La minuterie de la sonde n'a donc jamais fonctionné.** Le processus est créé et enregistré, mais le code applicatif n'atteint pas sa boucle d'événements : il reste bloqué avant ou dans `ui_app_main`, ou n'est jamais exécuté. Cela explique aussi la v1 : le chargement infini n'était pas un problème d'affichage de fenêtre EFL, puisque la v2, sans fenêtre, se bloque de la même façon. Réserve : cette conclusion repose sur `getAppsContext`, qui dit que le contexte existe, pas ce que fait le processus. Aucune trace de l'exécution du code n'a été obtenue (pas de logs).

- **Lancement de cimaise par le réseau (API Smart View, port 8001), 2026-10-31 vers 15:01.** Un seul appel `POST /api/v2/applications/cimaise001.Cimaise` depuis le PC. Réponse de Stéphane, par écrit : « il y a eu une demande d'autorisation de Home Assistant, j'ai accepté, et ça a ouvert cimaise ».
  - *Ce que j'en déduis* (non dit par lui) : la Frame **accepte de lancer une app installée en mode développeur par le réseau**, ce qui rend possible un « bouton cimaise » externe (piste 5 de `docs/home-button.md`). La demande d'autorisation portait le nom « Home Assistant », pas celui de l'appel du PC : l'intégration `samsungtv` du homelab s'est sans doute connectée au même moment. **En acceptant, Stéphane a ajouté Home Assistant aux appareils autorisés de la TV.** C'est un réglage modifié par lui à l'écran, réversible dans le gestionnaire des appareils connectés. Reste à confirmer : que cimaise a bien été ouverte par l'appel du PC plutôt que par Home Assistant, et le délai entre l'appel et l'affichage.

- **Finitions Plex 2 sur la Frame (2026-11-07, build e995ee8).** Questions posées après l'installation et le lancement (22:12). Réponses de Stéphane (choix proposés, sans titre relevé) :
  - bibliothèque Films : qu'y a-t-il au-dessus de la grille ? → « **Les deux rangées** » (« En cours » et « Ajoutés récemment ») ;
  - bibliothèque Séries : même question → « **Les deux rangées** » ;
  - fiche d'un film : comment l'âge est-il affiché ? → « **En clair** » (du type « Tous publics », « -12 ans ») ; titre et texte exact non relevés ;
  - ouverture d'une bibliothèque, écran Diagnostic (valeurs recopiées par écrit) : « cache 19 et 20 ms », « réseau méd 202 max 202 ».
  - *Ce que j'en déduis* (non dit par lui) : le budget du §6 bis est tenu avec une large marge (cache ≈ 20 ms pour < 1 s, réseau ≈ 0,2 s pour < 2 s). La mesure va de l'ouverture du panneau aux premières affiches posées dans la grille : elle ne compte ni le décodage des images ni le chargement des rangées de tête. Une seule mesure réseau et deux en cache, sur une bibliothèque non précisée (c'est Films qui était demandé).

## Réponse du SDK

Ce que `sdb`, le packager ou le SDK ont répondu. Ne prouve pas un succès visible.

- **2026-11-07, Finitions Plex 2 (rangées en tête de bibliothèque, âge en clair)** : `npm run build` sur `e995ee8` (wgt non signé 170 Ko, `plex.js` 101 Ko en chunk différé) ; `package.sh apps/tv/dist` depuis le worktree, avec `CIMAISE_LOCAL_DIR` pointant vers le `.local` du dépôt principal → `dist/cimaise.wgt` signé (182 Ko) ; `install.sh` → « install completed » (2,6 s), `cmd_ret:0`, app présente ; `launch.sh` → « launched » (0,3 s).

- **2026-10-31, API Smart View (port 8001, HTTP)** : `GET /api/v2/` → 200 (`modelName` QE49LS03RAUXXC, `model` 19_MUSEM_FRAME, `version` 2.0.25, `TokenAuthSupport` true, `developerMode` 1 ; identifiants masqués). `GET /api/v2/applications/cimaise001.Cimaise` → 200, `{"running":false,"visible":false,"version":"0.0.1"}` : l'API connaît l'app développeur. `POST` sur la même URL à 15:01:02 → `true`, HTTP 200, en 5,2 s. `GET` relu 4 s plus tard → toujours `"running":false` : cet indicateur ne reflète pas l'affichage (voir « Observé »).
- **2026-10-31, Voie B sonde v2 et lanceur** : `native-probe.sh build` → `dist/org.cimaise.sondenative-1.0.1-arm.tpk` (29,1 Ko ; dépend de `libcapi-appfw-application.so.0`, `libecore.so.1`, libc ; ni elementary ni evas). `native-probe.sh build-lanceur` → `dist/cmzlanceur.wgt` (9,9 Ko, puis 10,0 Ko en v0.0.2), signés avec le profil `cimaise`. `install` et `install-lanceur` (puis la mise à jour du lanceur en v0.0.2) → « install completed », `cmd_ret:0` (1,3 s environ) et les deux apps présentes dans `0 applist`. `launch-lanceur` → « launched » (0,2 s), deux fois. La sonde n'a pas été lancée par sdb en v2. `0 applist` relu après la suppression manuelle : ni `org.cimaise.sondenative` ni `cmzlanceur.Lanceur`, et `cimaise001.Cimaise` présent.
- **2026-10-31, Voie B étape 1 (sonde native `org.cimaise.sondenative`)** : `native-probe.sh build` → `dist/org.cimaise.sondenative-1.0.0-arm.tpk` (29,7 Ko ; ELF32 ARM, EABI5, v7 ; dépend de `libcapi-appfw-application.so.0`, `libelementary/evas/ecore.so.1`, libc), signé avec les **mêmes** certificats que `cimaise.wgt` (empreintes SHA-256 auteur et distributeur identiques). `native-probe.sh install` : `sdb install` → `pkg_type[tpk]`, « install completed », `cmd_ret:0` (1,3 s), « Sonde native » présente dans `0 applist`. Par erreur, la commande a été lancée deux fois : la seconde est une mise à jour (`val[update]`), elle aussi « install completed ». `native-probe.sh launch` (`0 was_execute`) → « launch start » puis « **resumed** » (5,3 s), alors que cimaise répond « launched ». Désinstallation : `sdb uninstall` → **`closed`**, `0 vd_appuninstall <pkg>` → **`closed`** (refusés par la liste blanche), d'où la suppression depuis le menu de la TV. `0 applist` relu ensuite : sonde absente, `cimaise001.Cimaise` présent, `cimaiseblk.Blank` absent (supprimé à la main, voir « Observé »). Aucune autre commande sdb, aucun réglage écrit.
- **2026-10-31, sondes sdb lecture seule (bouton Home, `docs/home-button.md`)** : aucune écriture sur la TV. Le shell sdb est un **dispatcheur à liste blanche**, pas un shell : `id`, `uname`, `cat`, `ls`, `mkdir`, `vconftool get` (5 clés Home) → **`closed`** ; `0 applist`, `0 vd_appinstall`, `0 appinstall` → vivants (tentatives réelles d'install sur fichiers inexistants : « download failed[16] », « Package not found [-5] »). Test marqueur par backticks dans le nom de tpk (`` `id; echo MARKER` ``) → `closed` **sans marqueur** : la TV valide la chaîne de commande avant exécution — le « package-name command workaround » de CleanFrame n'a aucun support sur ce firmware. Probes complémentaires : `loglevel`, `logcat`, `log`, `syslog`, `appinfo` → `closed` (pas de log système ni d'état « running » lisible via sdb). Piste Home native close : aucune voie d'exécution ni d'API pour écrire l'opération `main` ni les clés `db/`.
- **2026-10-31, logo Overseerr sur la tuile du Dock** : `package.sh apps/tv/dist` (depuis le worktree, wrapper `DOCKER` de `docs/decisions.md`) → `dist/cimaise.wgt` signé (185 Ko, contient `logos/overseerr.png`) ; `install.sh` → « install completed » (3,1 s) et app présente ; `launch.sh` → « launched ». Ce que montre l'écran : en attente de Stéphane.
- **2026-10-30, fiche Overseerr** : `package.sh apps/tv/dist` → `dist/cimaise.wgt` signé ; `install.sh` → « install completed » (3,5 s) et app présente ; `launch.sh` → « launched ».
- **2026-10-30, sonde Overseerr** : `package.sh` (copie de `apps/tv/dist` + `local-config.js` + `<access origin>`) → `dist/cimaise.wgt` signé (author + distributor) ; `install.sh` → « install completed » (vd_appinstall, 3,8 s) et `cimaise001.Cimaise` dans la liste ; `launch.sh` → « launched ».

## Non testé

Hypothèses et points à vérifier (voir HANDOFF §11).

- Modèle exact, firmware, version du moteur web
- `required_version` minimal accepté
- Codecs, HDR, pistes et sous-titres sous AVPlay
- HTTPS auto-signé (phase 2). HTTPS **Let's Encrypt** (Overseerr) : observé OK, voir plus haut.
- Overseerr **sans** `<access origin>` dans `config.xml` (Plex fonctionne sans) ; temps de réponse d'Overseerr sur la TV
- Affiches TMDB (`image.tmdb.org`, w185/w300) chargées par la Frame : pas confirmé explicitement, probable d'après l'essai de la fiche du 30/10 (voir plus haut). Repli possible : `/imageproxy/tmdb/t/p/` de l'instance (200 depuis le PC), via le 3e argument de `posterUrl`.
- Autorun après le mode Art et après coupure de courant
- Persistance de l'app en arrière-plan

- **Sous-titres et pistes (lecteur Plex)** : rendu maison des sous-titres, SRT externe par `setExternalSubtitlePath`, menu des pistes, relance du flux au changement de piste, langues par défaut : **non testé sur la TV**, uniquement avec faux AVPlay (voir `docs/decisions.md`, « Sous-titres et pistes audio »).

## Banc d'essai des formats (AVPlay) — à remplir devant la Frame

Échantillons **proposés** d'après le vrai serveur Plex (lecture seule, 2026-10-29). Les colonnes **Observé** et **Confirmé** restent vides tant que rien n'a été vu à l'écran (HANDOFF §10). « Attendu » = décision actuelle de `FRAME_2019_PROFILE` / `decidePlayback`, qui est une hypothèse, pas un résultat.

Un échantillon par cas quand c'est possible, choisi pour n'isoler qu'une variable (H.264 8 bits ≤ L4.1 pour les cas audio et sous-titres). Bibliothèque : AVI/MPEG-4 677 fiches, HEVC Main 10 4K 115, HDR10 70, DV p8 111, H.264 > L5.1 17, AC3 908, E-AC3 1457, Opus 19, FLAC 3.

| Cas | Échantillon (ratingKey) | Conteneur / codecs / niveau | Attendu (profil actuel) | Observé | Confirmé |
|---|---|---|---|---|---|
| AVI + MPEG-4 ASP | Kaamelott S4E99 (3387), 7 min ; alternative How I Met Your Mother S3E12 (2924) | avi, mpeg4 Advanced Simple L5, 640×352, ac3 5.1 / mp3 ; SRT externe sur 2924 | Transcodage (avi absent du profil) ; à tester en direct, puis ajouter `avi` et `mpeg4` si lu | | |
| HEVC Main 10 4K | The Bear S1E7 (17264), 20 min ; alternative Futurama S8E4 (14902) | mkv, hevc Main 10 L153, 3840×2160 SDR, eac3 5.1 | Direct | | |
| HDR10 | Still Up S1E5 (15252), 26 min ; alternative Widow's Bay S1E9 (30913) | mkv, hevc Main 10 L150, smpte2084, eac3 5.1 | Direct | | |
| Dolby Vision profil 8 (repli HDR10) | Hacks S4E10 (26018), 32 min ; alternative Hacks S5E1 (30773) | mkv, hevc Main 10 L153, DV p8 (compat 1 = HDR10), eac3 5.1 | Direct (seul le profil 5 est exclu) | | |
| H.264 niveau > 5.1 | Rick and Morty S1E5 (3763), 20 min ; alternative S1E6 (3764) | mp4, h264 High L5.2, 1280×720, aac stéréo, SRT externe en/fr | Direct (le niveau n'est pas vérifié par `decidePlayback`) | | |
| AC3 | Futurama S7E19 (2744), 20 min ; alternative Les Cités d'or S1E6 (32157) | mkv, h264 High L4.1, ac3 5.1 | Direct | | |
| E-AC3 | Bluey S3E39 (26265), 6 min ; alternative S3E1 (19745) | mkv, h264 High L4.0 1080p, eac3 5.1 fra/eng | Direct | | |
| Opus | **Aucun sans AV1.** Andor S1E2 (10025), 36 min : opus 5.1 mais vidéo AV1 L8 | mkv, av1 Main, opus 5.1 | Transcodage (opus et av1 absents) ; un échec ne dirait pas lequel des deux est en cause | | |
| FLAC | C'est arrivé près de chez vous (31451), 96 min ; alternative : FLAC secondaire dans IT: Welcome to Derry S1E4 (26408) | mkv, h264 High L4.1, flac stéréo fra | Transcodage (flac absent) | | |
| SRT interne | Bluey S1E1 (19691), 7 min ; alternative S1E2 (19692) | mkv, h264 L4.0, aac/eac3, 2 SRT internes en | Direct, `setSelectTrack` | | « OK partout » (Stéphane, 2026-10-30) : affiché, synchrone, survit aux sauts | Oui (`confirmed` : srt interne) |
| SRT externe | Rick and Morty S1E5 (3763), 20 min ; alternative Bluey S1E1 (19691) | mp4 ou mkv, SRT externes en/fr | Direct, `setExternalSubtitlePath` | | « OK partout » (Stéphane, 2026-10-30) : affiché, synchrone, survit aux sauts | Oui (`confirmed` : srt externe) |
| ASS converti en SRT (sidecar) | The Bear S3E1 (18301), 37 min ; alternatives S3E3 (18293), S3E5 (18299) | mkv, ASS interne en, lecture directe de la vidéo ; le serveur sert la piste en SRT (`/library/streams/N`), passée à `setExternalSubtitlePath` | Direct, sous-titres affichés (serveur : SRT confirmé 200 le 2026-10-30) | | « OK partout » (Stéphane, 2026-10-30) : affiché, synchrone, survit aux sauts | Oui (`confirmed` : ass converti ; ssa non vu) |

Cas sans échantillon propre : **Opus** seul (voir ligne). Rappel : un cas dont le lecteur échoue n'est retiré du profil qu'après observation à l'écran ; sinon `confirmed` reste à false.

## TV2 — banc d'essai Tizen 4 (pas une cible) : pourquoi la page vide signée est refusée (2026-10-31)

TV2 : UE49NU7175 (2018), `platform_version:4.0` (`sdb capability`), logiciel T-KTM2LDEUC-1360.0 (photo de Stéphane, 29/10).
Page vide `cimaiseblk.Blank`, profil Samsung « cimaise » : **installée sur la Frame**, **refusée par TV2**.

### Ce que disent les codes

Le code décimal est la forme courte de `install failed[118, -NN]` affiché par `sdb`/`tizen install` : 118 = échec d'installation, -NN = étape qui a refusé.

| Code | Forme longue | Signification | Source |
|---|---|---|---|
| **118019** | `[118, -19], reason: Parsing error` | Le `config.xml` est rejeté à la lecture, avant toute vérification de signature. | Vu sur **notre Frame** le 29/10 (package de 9 caractères, `docs/decisions.md`) ; [forum Samsung](https://forum.developer.samsung.com/t/install-failed-118-19-reason-parsing-error/20482) |
| **118012** | `[118, -12], reason: Check certificate error` (souvent suivi de `Invalid certificate chain with certificate in signature :<-3>`) | Le paquet est lu et décompressé, puis la **chaîne de certificats** de la signature n'est pas reconnue par la TV. | [forum Samsung, 118012](https://forum.developer.samsung.com/t/tizen-install-to-tv-error-code-118012/19689) ; [forum Samsung, chaîne invalide](https://forum.developer.samsung.com/t/check-certificate-error-invalid-certificate-chain/38782) ; [TizenBrew #239](https://github.com/reisxd/TizenBrew/issues/239) (TV 2017, Tizen 3, même texte) |

- **118019 avec `required_version="5.0"` : expliqué.** TV2 est en 4.0 ; une app qui exige 5.0 est refusée à la lecture du `config.xml`. Rien à corriger côté signature.
- **118012 avec `required_version="4.0"` : la lecture passe** (l'installation atteint 23 %), c'est la **vérification du certificat** qui échoue.

### Ce qui a été vérifié (lecture seule, sur le poste, 31/10)

- Le DUID de TV2 est **bien** dans le certificat distributeur (`URN:tizen:deviceid`, à côté de celui de la Frame) et dans le profil. Ce n'est donc pas un oubli de DUID.
- Certificats du profil : distributeur émis par `VD DEVELOPER Public CA Class` (racine `VD DEVELOPER Public Root Class`), auteur par `Samsung VD Author CA` (racine `Tizen Developers Root Class`). **Les deux CA intermédiaires datent de juin 2025** (17/06/2025 et 19/06/2025). Certificats valides du 29/10/2026 au 29/10/2027. Signature RSA-SHA512.
- Samsung a répondu en septembre 2026 ([Tizen.Issues #139](https://github.com/Samsung/Tizen.Issues/issues/139), appareil Tizen 5.5, même erreur « Invalid certificate chain ») : **la racine des certificats a changé ; les anciens modèles font confiance à l'ancienne racine et ne peuvent pas vérifier les certificats émis aujourd'hui ; les serveurs de l'ancienne CA sont retirés.** Seule voie annoncée : une mise à jour du firmware qui renouvelle le magasin de confiance, pour les modèles encore suivis.

### Hypothèses (de la plus probable à la moins probable)

1. **Nouvelle CA Samsung inconnue de TV2 (probable).** Le firmware 1360 de TV2 ne connaît pas la chaîne de 2025 ; la Frame (T-MSMDEUC-1500.9) la connaît. Tout colle : DUID présent, lecture du paquet passée, refus à l'étape certificat, réponse de Samsung. *Non vérifié* : le texte complet de l'erreur sur TV2 (on n'a que le code), ni l'existence d'un firmware plus récent pour TV2.
2. **Horloge de TV2 fausse (peu probable, vérifiable en 10 s).** Les certificats ne sont valides qu'à partir du 29/10/2026 09:06 UTC ; une TV en retard les verrait « pas encore valides ».
3. **Algorithme SHA-512 non géré par Tizen 4 (peu probable).** Le packager actuel signe en RSA-SHA512 ; aucune source trouvée ne le relie à -12. À ne creuser que si 1 et 2 tombent.

Écarté : DUID manquant ; certificat « Tizen » au lieu de « Samsung » (le profil est bien Samsung, privilège Public) ; `required_version` (corrigé par l'essai en 4.0).

### Prochain test proposé (demande l'accord de Stéphane, une seule installation)

1. **Sans action sur la TV** : Stéphane lit l'heure et la date de TV2, et regarde si une mise à jour existe (Paramètres → Assistance → Mise à jour du logiciel → Mettre à jour maintenant ; ne pas l'installer sans décision).
2. **Une installation** de la page vide en `required_version="4.0"` (copie temporaire du `config.xml`, `apps/blank` non modifié), avec l'IP de TV2 passée par une **copie temporaire** de `.local/tizen.env.tv2` (jamais `.local/tizen.env`), en gardant **toute la sortie** de `sdb install` / `vd_appinstall` : on cherche `Invalid certificate chain …<-3>` (confirme l'hypothèse 1) ou `expired / not yet valid` (hypothèse 2).
3. Lecture : chaîne invalide + aucune mise à jour du firmware → TV2 ne pourra plus installer d'app signée aujourd'hui ; on arrête le banc Tizen 4.

### Questions pour Stéphane

- Faire la mise à jour du firmware de TV2 si elle existe ? (Mise à jour officielle Samsung, pas un firmware modifié ; mais irréversible, et TV2 ne servirait alors plus de témoin « Tizen 4 d'origine ».)
- Si TV2 ne peut pas être débloquée : abandonner le banc Tizen 4 ? Il n'est pas une cible ; la Frame installe déjà.

### Ce que ça dit pour la Frame

La Frame accepte la nouvelle chaîne aujourd'hui. Risque à garder en tête : si un jour il faut **recréer** le certificat auteur, ce sera forcément avec la nouvelle CA (l'ancienne n'existe plus) ; garder `.local/SamsungCertificate/` sauvegardé, c'est l'identité de l'app (HANDOFF §10).
- Voie B : **où** se bloque le code natif. Le processus est créé (contexte présent plus de 5 min), mais la minuterie de 60 s ne se déclenche jamais. Les hypothèses restent ouvertes, faute de logs (`logcat` et `appinfo` sont `closed`) : refus d'exécution d'un natif signé par un certificat public, initialisation d'appfw ou d'ecore bloquée (rootstrap IoT 5.0 différent de la TV), ou `main` jamais atteint. Non testés : un binaire sans appfw (libc seule) ; une sonde qui laisse une trace lisible depuis le web ; la signification exacte de « UnknownError » au second `launch` ; ce que devient le processus après la suppression de l'app (supprimé avec elle selon toute vraisemblance, non vérifié).
