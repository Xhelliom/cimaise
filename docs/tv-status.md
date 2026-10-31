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

## Réponse du SDK

Ce que `sdb`, le packager ou le SDK ont répondu. Ne prouve pas un succès visible.

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
