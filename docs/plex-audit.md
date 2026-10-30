# Audit de la bibliothèque Plex : lecture directe ou transcodage (2026-10-29)

**Question.** Avant M4 (« les cas courants passent sans l'app officielle ») : quelle part de la bibliothèque la Frame 2019 lirait
en direct, et pourquoi le reste doit-il être transcodé ?

**Méthode.** `node scripts/plex/audit.mjs` (hors gate npm, lecture seule : GET uniquement, aucune décision de transcodage demandée)
lit la fiche complète (Media/Part/Stream) de **chaque film et chaque épisode**, puis applique `decidePlayback` avec le profil
`FRAME_2019_PROFILE` et les choix par défaut (audio français si présent, sous-titres coupés sauf piste forcée).
Le profil est **entièrement supposé** (doc Samsung, rien n'est confirmé sur la TV) : ces chiffres disent ce que *notre code*
déciderait, pas ce que la TV lit vraiment.

## Résultat

| | Films (412) | Épisodes (3 010) |
|---|---|---|
| Lecture directe | **86,7 %** (357) | **75,7 %** (2 280) |
| Transcodage | 13,3 % (55) | 24,3 % (730) |
| … avec sous-titres français activés¹ | 17,4 % | 21,6 % |

¹ Parmi les fiches qui ont des sous-titres français (61 % des films, 58 % des épisodes). Activer ces sous-titres fait basculer
en transcodage 13 films et 102 épisodes qui étaient en lecture directe.

### Raisons du transcodage (% des fiches transcodées ; une fiche peut en cumuler)

| Raison | Films | Épisodes | Détail |
|---|---|---|---|
| Conteneur + codec vidéo | 25,5 % | **90,8 %** | AVI avec MPEG-4 Part 2 (Xvid/DivX), SD, ≤ 10 Mb/s |
| Codec audio seul | **54,5 %** | 3,8 % | DTS surtout (28 films, 27 épisodes) ; Opus, FLAC, TrueHD, MP2 |
| Codec vidéo AV1 | 7,3 % | 3,0 % | 4 films, 22 épisodes (AV1 10 bits) |
| Sous-titres (piste forcée) | 10,9 % | 1,4 % | ASS, PGS, VobSub, mov_text |
| HDR | — | 0,7 % | Dolby Vision profil 5 (sans base HDR10) |
| Profil vidéo | 1,8 % | — | H.264 10 bits (Hi10P) |
| Débit | 0 | 0 | Le profil ne borne pas le débit ; aucune fiche > 80 Mb/s, 2 épisodes entre 40 et 80 Mb/s |

Le transcodage est presque toujours **léger** : 71 % des films et 96 % des épisodes transcodés sont à ≤ 10 Mb/s,
et le cas audio seul ne demande que l'audio (vidéo copiée).

### Ce qui passe en direct, mais reste à prouver sur la TV
- HEVC Main 10 : 31 % des films, 15 % des épisodes. 4K : 23 % des films.
- HDR10 : 8 % des films ; **Dolby Vision profil 8 avec base HDR10** : 7 % des films, 2,7 % des épisodes
  (la Frame 2019 ne lit pas le Dolby Vision : on compte sur le repli HDR10).
- H.264 au-delà du niveau 5.1 : 17 épisodes (le profil ne vérifie pas le niveau).
- Audio E-AC3 / AC3 : 47 % des films, 64 % des épisodes.

### Sous-titres

| Fiches ayant au moins une piste… | Films | Épisodes |
|---|---|---|
| SRT externe | 71,4 % | 61,9 % |
| SRT interne | 41,7 % | 52,6 % |
| PGS | 12,6 % | 0,8 % |
| ASS/SSA | 2,7 % | 5,3 % |
| VobSub | 4,4 % | 0,4 % |
| Aucun sous-titre | 19,7 % | 21,6 % |

Sous-titre français choisi quand on l'active (SRT préféré) : SRT externe 54 % / 52 %, SRT interne 39 % / 42 %,
ASS 0,8 % / **5,9 %** (103 épisodes), PGS + VobSub 5,2 % / 0 %.

### Langues audio

| Fiches ayant une piste… | Films | Épisodes |
|---|---|---|
| anglaise | 74,5 % | 63,9 % |
| française | 24,5 % | 27,2 % |
| langue non renseignée | 14,1 % | 23,3 % |
| autre (ita, spa, deu…) | < 5 % chacune | < 3 % chacune |

74 % des films et 81 % des épisodes n'ont qu'une piste audio. 15 films n'ont leur version française que dans un codec non lu en direct (DTS surtout) :
la VF y impose un transcodage audio. La bibliothèque est surtout en VO : 76 % des films et 73 % des épisodes partent
sur une piste non française.

## Options pour M4

1. **Tester le profil sur la TV avant d'écrire le transcodage.** Ajouter AVI/MPEG-4 ASP au profil s'ils sont lisibles :
   la fiche des formats Samsung 2019 mentionne AVI, DivX et MPEG-4 ASP (à confirmer avec AVPlay). Si c'est le cas, le transcodage
   des épisodes passe de 24 % à environ 2 %. Sans cette preuve, tout le reste du profil est aussi supposé.
2. **Transcodage de l'audio seul**, vidéo copiée (le `directStream=1` déjà prévu) : couvre DTS/Opus/FLAC/TrueHD, soit
   l'essentiel des films transcodés. `requestTranscode` n'a jamais été appelé : réponse de décision, HLS dans AVPlay,
   avance rapide et reprise restent à valider.
3. **Sous-titres texte sans incrustation** : servir les ASS et mov_text en SRT (conversion par le serveur) au lieu de les
   incruster. Les PGS et VobSub restent incrustés : c'est rare ici.
4. **Agir sur les fichiers**, côté homelab : refaire l'audio des films DTS en AC3/E-AC3, réencoder les AVI et l'AV1.
   C'est hors de l'app et ça touche la bibliothèque de Stéphane : ce choix lui revient.

## Recommandation : 3 chantiers prioritaires

1. **Banc d'essai des formats sur la Frame** : un échantillon par cas (AVI/MPEG-4 ASP, HEVC Main 10 4K, HDR10, DV profil 8,
   H.264 niveau > 5.1, AC3/E-AC3, SRT interne et externe, Opus, FLAC), lu par AVPlay en direct, le résultat noté dans
   `docs/tv-status.md` et dans `confirmed` du profil. **Pourquoi d'abord** : c'est le seul chantier qui peut retirer
   d'un coup 22 % des épisodes du transcodage, et il valide les 76–87 % de lecture directe dont dépend tout le reste.
2. **Premier transcodage réel, audio seul** : appeler la décision du transcodeur, lire le HLS dans AVPlay, avance/recul,
   reprise, remontée de la progression, arrêt de la session. **Pourquoi** : 62 % des films transcodés le sont pour l'audio
   (DTS d'abord), c'est le transcodage le moins cher pour le serveur, et il ouvre la voie aux autres (AVI s'il échoue, AV1).
3. **Sous-titres sans incrustation** : vérifier SRT interne (`setSelectTrack`) et externe sur la TV, puis convertir ASS
   et mov_text en SRT. **Pourquoi** : aujourd'hui, activer les sous-titres français fait transcoder 102 épisodes et
   13 films lus en direct sans eux ; l'incrustation coûte au serveur et fige les sous-titres.

## Questions pour Stéphane
- Le banc d'essai (chantier 1) demande des extraits de fichiers sur la TV : tu préfères des fichiers témoins hors bibliothèque,
  ou des fiches réelles choisies par l'audit (par identifiant, jamais par titre dans le dépôt) ?
- Acceptes-tu de retravailler les fichiers (DTS → AC3, AVI, AV1) côté homelab (option 4), ou l'app doit-elle tout absorber ?
- Le serveur Plex a-t-il un transcodage matériel ? Il décide si l'AV1 4K (4 films) est tenable ou doit rester sur l'app officielle.

## Premier transcodage réel, audio seul (2026-10-29, `scripts/plex/capture-transcode.mjs`)

Écriture serveur assumée : une session de transcodage, arrêtée aussitôt (`/video/:/transcode/universal/stop` → 200).
Film MKV H.264 + DTS (dca) à 8,8 Mb/s.

- **Décision.** Sans `X-Plex-Client-Profile-Name`, le serveur répond `400 Bad Request` (HTML) à toute requête, quels que soient les autres paramètres.
  Avec `Generic` seul : `generalDecisionCode 2000`, `transcodeDecisionCode 4005` « No conversion profile found for protocol hls ».
  Il faut en plus `X-Plex-Client-Profile-Extra=add-transcode-target(type=videoProfile&context=streaming&protocol=hls&container=mpegts&videoCodec=h264,hevc&audioCodec=aac,ac3)` :
  réponse `200`, `generalDecisionCode 1001` « Direct play not available; Conversion OK. » (pas 1000), avec `Metadata[0].Media[0].Part[0].Stream`.
- **Vidéo copiée.** Un `maxVideoBitrate` (même 20 000 kb/s pour une source à 8,8 Mb/s) ou une `videoResolution` fait ré-encoder la vidéo (`videoDecision=transcode`,
  vitesse 2,5×). Sans eux : `videoDecision=copy`, `audioDecision=transcode`, DTS → AAC 5.1, vitesse 4–9×. Le client les omet donc pour un transcodage audio seul.
- **Flux.** `start.m3u8` : liste de variantes (`application/vnd.apple.mpegurl`) pointant `session/<id>/base/index.m3u8`, segments MPEG-TS de 1 s.
- **À observer sur la Frame** : lecture, avance/recul, reprise, progression et arrêt de la session à la sortie.

### Essai sur la Frame (2026-10-29) : Bohemian Rhapsody (MKV H.264 + DTS, transcodé audio seul)

**Observé physiquement par Stéphane :**
- le film se lance et se lit, le son est bon (DTS → AAC, vidéo copiée) ;
- avancer et reculer de 10 s fonctionnent ;
- **progression : la position quittée sur la Frame apparaît sur un autre appareil Plex** ;
- quitter puis rouvrir le film : la reprise fonctionne ;
- **défaut : l'image est étirée sur tout l'écran** au lieu d'avoir des bandes noires en haut et en bas.

**Non testé :** l'arrêt de la session à la sortie (le relevé `watch-transcode.mjs` n'a montré aucune
session Cimaise : il tournait sur un cycle expiré ou n'a pas capté l'essai, à refaire) ; le saut long ; la lecture directe d'un film 2.39.

**Correctif (non encore revu sur la TV) :** AVPlay étire l'image au rectangle de `setDisplayRect`. Le lecteur appelle maintenant
`setDisplayMethod('PLAYER_DISPLAY_MODE_LETTER_BOX')` après `setDisplayRect` et avant `prepareAsync`, pour la lecture directe comme pour le HLS
(non fatal si absent). Le nom de la constante vient de la doc Samsung, de mémoire : à confirmer par l'effet à l'écran.
Rapport d'aspect du flux : la liste de variantes du transcodeur annonce `RESOLUTION=1920x808`, identique au fichier source (pas de SAR/DAR modifié
côté serveur). Paquet refait depuis `apps/tv/dist` (148 Ko, contenu vérifié) et réinstallé ; à revoir : Bohemian Rhapsody et un film 2.39 en lecture directe.

**Défaut observé par Stéphane : image figée autour du menu Sous-titres** (Bohemian Rhapsody, HLS). Elle est repartie après un saut en arrière.
Cause NON établie (on ne sait pas si le menu a seulement été ouvert ou si une piste a été choisie). Lecture du code, sans correction :
- ouvrir le menu ne touche pas à AVPlay (`openMenu` peint seulement la liste du plan) ; choisir une piste relance le flux (`relaunch` : « Chargement… », arrêt de l'ancienne session, nouvelle décision) ;
- en revanche Entrée (ou Pause) met la lecture en **pause** et ouvre la barre (`playKey`) : si Stéphane a atteint le bouton Sous-titres ainsi, l'image figée est la pause, et le saut arrière l'a peut-être relancée.
À départager avec Stéphane : touche utilisée pour ouvrir la barre (Entrée ou Haut/Bas), présence du mot « Pause » à l'écran, piste choisie ou non. Le relevé serveur n'a rien capté à ce moment.

**Précision de Stéphane sur le gel (observée physiquement) :** menu Sous-titres ouvert, aucune piste, choix de « Aucun » → le lecteur a **rechargé**, puis l'image s'est
figée ; elle est repartie après un saut en arrière. Deux défauts :
1. **Corrigé (test : « choisir la piste déjà active … »).** Choisir la piste déjà active (« Aucun » sans sous-titre actif) relançait une décision et un rechargement
   pour rien : `choose()` ne fait plus rien si l'entrée est déjà courante.
2. **Gel après rechargement d'une session transcodée : cause établie côté serveur (relevé du 2026-10-29, TV injoignable pendant la mesure), correctif non encore vu sur la TV.**
   Une session à un offset renvoie une liste de lecture **sur toute la durée du film** : 523 segments de 10 s numérotés depuis 0, `#EXT-X-START:TIME-OFFSET=<offset>`.
   Les segments avant l'offset sont des **stubs vides de 188 octets** (premier segment resté à 188 o pendant 25 s pour un offset de 1234 s, contre 8,4 Mo en 1,8 s
   à l'offset 0 ; contenu réel vers le segment 123, ex. 17 Mo pour le 300ᵉ). Le lecteur supposait un flux commençant à l'offset (temps AVPlay + offset, aucun seekTo) :
   si AVPlay démarre en début de liste, il lit des segments vides, d'où l'image figée ; un saut arrière tombe sur de vrais segments. Le test serveur « session réutilisée
   vs nouvelle session » est identique : l'identifiant de session n'est pas en cause.
   Correctif : la ligne de temps AVPlay est celle du film (`setTranscode(0, durée)`), la position de départ se rejoint par `seekTo` avant `play` (reprise, saut lointain,
   changement de piste). **À confirmer sur la Frame** (AVPlay honore-t-il déjà EXT-X-START ? sinon seekTo suffit ; dans les deux cas la position affichée doit être juste).
   Le journal d'état AVPlay pendant un gel n'a pas pu être relevé (TV injoignable).

### Essai de recette sur le code 88f58c0 (2026-10-30, paquet `apps/tv/dist`, `dist/cimaise.wgt` 147 836 o)

SDK : `install completed`, app présente, `launched` (ne prouve pas l'affichage). Surveillance : `node scripts/plex/watch-transcode.mjs 2400` démarrée avant le lancement.

**Observé physiquement par Stéphane** (sur Bohemian Rhapsody, transcodage vidéo copiée + audio AAC) :
- étape 0 : l'accueil de Cimaise s'affiche — OK ;
- étape 1 : reprise depuis le point enregistré — OK ;
- étape 2 : avance/recul ±10 s — OK.

**Vu par le script** (lecture seule, extrait) : session Cimaise `copy transcode aac`, `viewOffset` ≈ 2037 s au démarrage (reprise), puis ≈ 1426 s et ≈ 1500 s après des sauts, états `playing`/`paused` alternés.

**Pas encore observé** : choix d'une piste (rechargement sans gel, position juste), bandes du letterbox, sortie et disparition de la session côté serveur (critère 3).

**Observé physiquement par Stéphane (suite, 88f58c0)** : choix d'un sous-titre réel (rechargement) — « all good » ; bandes du letterbox — « all good ». Son message ne détaille pas séparément le gel et la position après rechargement : je les retiens comme OK sur la foi de « all good », sans mesure.
**Pas encore observé** : progression remontée sur un autre appareil, sortie et disparition de la session côté serveur.
