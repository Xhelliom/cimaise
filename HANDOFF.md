# HANDOFF — Cimaise : launcher custom + client Plex optimisé pour Samsung The Frame 2019

> Document de démarrage pour un agent de code (Claude Code ou équivalent) et pour Stéphane.
> À placer à la racine du nouveau repo. À relire avant chaque session.
> Nom du projet : **cimaise** (la cimaise est le rail où l'on accroche les tableaux dans une galerie).

---

## 1. Contexte et objectif

**Propriétaire :** Stéphane, développeur TypeScript/Node, C#/.NET, Python. Homelab Proxmox avec Plex et Home Assistant.

**TV cible :** Samsung The Frame 2019, série **LS03R**, **Tizen 5.0**. Modèle exact et firmware à relever (étape M0).

**Problème :** le Smart Hub est devenu lent, et l'app Plex officielle est lourde.

**Objectif :** une app Web Tizen signée, installée en mode développeur, qui offre :
1. un **écran d'accueil personnel**, léger et pensé pour la télécommande (inspiré de CleanFrame) ;
2. un **client Plex optimisé**, intégré à cet accueil ;
3. à terme, des **widgets servis depuis le homelab** (Home Assistant, etc.).

**Critère n°1 : la légèreté.** La TV est de 2019, avec un processeur et une mémoire limités. Chaque fonctionnalité, image, police ou dépendance doit justifier son coût en temps de démarrage, en mémoire et en fluidité. **À choisir entre une option et la vitesse, on choisit la vitesse.** Voir §6 bis (budget et protocole de mesure).

**Contraintes non négociables :**
- **Le mode Art natif de la Frame est conservé.** On ne touche pas à son fonctionnement.
- **Pas de root, pas d'exploit, pas de firmware modifié**, pas de factory reset, pas de downgrade.
- **Pas de réassignation native du bouton Home** dans le périmètre initial (voir §9).
- Netflix, Disney+, Canal+, etc. restent des **raccourcis vers les apps natives** : leur DRM impose l'app certifiée.

---

## 2. Décisions déjà prises

| Sujet | Décision | Raison |
|---|---|---|
| Nombre de repos | **Un monorepo** | Code partagé (navigation, lecteur, adaptateur Tizen), une seule identité de signature, une seule installation |
| Plex : app séparée ou module ? | **Module livré dans la même app `.wgt`** | Passage accueil → Plex instantané, sans relancer une app Tizen ; le module reste isolé pour pouvoir être packagé seul plus tard |
| Point de départ | **Copie de CleanFrame** (licence MIT), restructurée **et allégée** | Base de navigation et de mise en page déjà éprouvée sur une Frame ; conserver `LICENSE` et `THIRD_PARTY_NOTICES`. On ne reprend que ce qui sert : un style figé plutôt qu'un catalogue d'options |
| Priorité | **Légèreté avant personnalisation** | La TV de 2019 est le goulot ; une interface rapide avec peu d'options vaut mieux qu'une interface riche et lente |
| Langage | **TypeScript compilé en ES5** | Le moteur web de Tizen 5 est ancien ; CleanFrame impose déjà un runtime ES5 |
| Lecteur vidéo | **AVPlay** (`webapis.avplay`), pas `<video>` | Lecteur natif Samsung : 4K, HEVC, HDR, pistes audio |
| Bouton Home | **Hors périmètre** au départ | Le hack de CleanFrame utilise des opérations natives non documentées, testées sur Tizen 9 uniquement |
| Démarrage | Autorun de la dernière app (réglage officiel) | Sans risque ; le retour Home ramène au Smart Hub, c'est accepté |
| Boîtier externe | Écarté pour ce projet | Choix assumé : solution logicielle sur la TV elle-même |

---

## 3. Ce qu'on sait de CleanFrame (référence)

Source : https://github.com/nthnclrk/CleanFrame (MIT). Testé **uniquement** sur une Frame 2024 (LS03D), **Tizen 9.0**, ARMv7 32 bits, firmware 2130.0.

- `app/index.html` charge l'adaptateur de la TV, les catalogues et `main.js`.
- `main.js` : mises en page List et Dock, pile de panneaux, focus, préférences, minuteries de fond d'écran.
- `device.js` : découverte des apps installées et appels Tizen. **Tout le code spécifique à la TV reste dans cet adaptateur.**
- Préférences en `localStorage`, clé `cleanframe.home.v1`.
- Scène logique 1920×1080, mise à l'échelle uniforme ; à vérifier aussi en 1280×720.
- Effets de verre et flous **précalculés** en images : la TV n'anime que `transform` et `opacity`.
- `config.xml` déclare `required_version="6.5"`. **À abaisser pour Tizen 5.0**, sinon l'installation sera probablement refusée.
- Signature : **utiliser le packager officiel du SDK**. Une signature XML faite à la main a été rejetée par la TV.
- Installation : sur la TV de référence, `sdb install` n'a fait que transférer le fichier ; il a fallu appeler `vd_appinstall`, vérifier « install completed », puis confirmer la présence de l'app dans la liste.
- IDs d'apps de la TV de référence : Netflix `org.tizen.netflix-app`, YouTube `9Ur5IzDKqV.TizenYouTube`. **Ne jamais les recopier : relire ceux de notre TV.**
- L'éditeur d'apps sait retirer et réordonner, mais pas ajouter une app arbitraire : il faut étendre le catalogue.

---

## 4. Architecture cible

```
cimaise/
├─ apps/
│  └─ tv/                    # App Web Tizen : config.xml, index.html, build vers .wgt
├─ packages/
│  ├─ tv-core/               # Partagé : moteur de focus D-pad, gestion des touches,
│  │                         #   adaptateur Tizen (device), wrapper AVPlay, stockage
│  ├─ launcher/              # Accueil (port de CleanFrame) : catalogue d'apps, mises en page, réglages
│  ├─ plex/                  # Client Plex : API, auth, écrans, lecture
│  └─ widgets-bridge/        # Pont postMessage entre la coquille et les iframes distantes (phase 2)
├─ server/                   # Optionnel, phase 2 : widgets servis depuis le homelab
├─ mocks/                    # Faux `tizen.*` et `webapis.avplay` pour le navigateur
├─ scripts/                  # package, signature, install, launch, lecture de la liste d'apps
├─ docs/
│  ├─ tv-status.md           # Ce qui est observé sur NOTRE TV (modèle, firmware, résultats)
│  └─ decisions.md           # Journal des décisions
├─ .local/                   # IGNORÉ PAR GIT : certificats, mots de passe, IP, DUID, IDs d'apps
├─ LICENSE, THIRD_PARTY_NOTICES.md (CleanFrame repris)
└─ HANDOFF.md
```

**Navigation entre modules :** un routeur interne à une seule page (accueil → Plex → lecteur), sans recharger. Bouton Retour : on dépile les panneaux ; à la racine, on ne quitte pas l'app sans confirmation.

**Build :**
- TypeScript, avec une **cible ES5 réelle** : `tsc --target ES5`, ou Babel/SWC avec preset ES5 et polyfills ciblés. Attention : esbuild ne transforme pas tout vers l'ES5 ; s'en servir pour le bundling, pas pour le passage en ES5.
- Aucun framework lourd. Rendu DOM direct ou micro-bibliothèque, à valider sur la TV.
- Un seul bundle JS et une seule feuille CSS dans le `.wgt` ; images optimisées.
- Polices : uniquement des polices libres (CleanFrame utilise Manrope, Geist, Newsreader).

**Aperçu navigateur :** comme CleanFrame, un serveur local avec les flèches, Entrée et Échap pour simuler la télécommande. Les mocks de `tizen.*` et d'AVPlay **signalent** l'absence de TV, ils ne simulent jamais un succès.

---

## 5. Client Plex — spécification

### 5.1 Périmètre du MVP
1. Connexion par **code PIN** (l'utilisateur valide sur plex.tv depuis son téléphone).
2. Choix du serveur (découverte via plex.tv), avec préférence pour l'**adresse locale**.
3. Accueil minimal : **En cours**, **Ajoutés récemment**, **Bibliothèques**.
4. Navigation dans une bibliothèque : grille d'affiches virtualisée.
5. Fiche d'un film ou d'une série : saisons, épisodes, résumé, durée, progression.
6. **Lecture directe** via AVPlay, avec reprise de la lecture.
7. Remontée de la progression au serveur, pour que « Reprendre » marche partout.

Hors MVP : recherche, playlists, musique (Plexamp existe), multi-utilisateurs gérés, téléchargements.

### 5.2 API Plex à utiliser
> Non documentée officiellement mais stable et utilisée par les clients tiers. **Vérifier chaque appel contre le vrai serveur du homelab** avant de s'y fier.

- **En-têtes communs :** `X-Plex-Token`, `X-Plex-Client-Identifier` (UUID stable, généré une fois et stocké), `X-Plex-Product`, `X-Plex-Version`, `X-Plex-Platform`, `X-Plex-Device`, `Accept: application/json`.
- **Auth :** création d'un PIN, affichage du code à l'écran, puis interrogation périodique jusqu'à obtenir le token (API v2 de plex.tv).
- **Serveurs :** liste des ressources du compte sur plex.tv ; choisir une connexion `local` joignable.
- **Bibliothèques :** `/library/sections`, puis `/library/sections/{id}/all`, **paginé** avec `X-Plex-Container-Start` et `X-Plex-Container-Size`.
- **Accueil :** `/library/onDeck` et `/library/recentlyAdded` (ou les hubs, si plus légers à vérifier).
- **Détail :** `/library/metadata/{id}` et `/library/metadata/{id}/children`.
- **Images :** **toujours** passer par le transcodeur photo (`/photo/:/transcode`, avec largeur, hauteur et URL de l'image). C'est probablement le plus gros gain de performance.
- **Lecture directe :** URL de la partie média (`/library/parts/...`) avec le token.
- **Transcodage :** demande de décision au transcodeur universel, puis flux HLS si nécessaire.
- **Progression :** `/:/timeline` pendant la lecture (lecture, pause, arrêt, position) ; marquer vu ou non vu via les endpoints de scrobble.

### 5.3 Lecture directe ou transcodage
- Déclarer un **profil client** de ce que la Frame 2019 sait lire, à établir par des tests réels en M0/M3 : conteneurs, H.264, HEVC, HDR10, AAC, AC3, E-AC3, etc.
- **Lecture directe en priorité.** Transcodage si le conteneur, le codec ou les sous-titres l'imposent.
- **Sous-titres :** SRT en lecture directe ; PGS et ASS → transcodage avec sous-titres incrustés.

### 5.4 Lecteur AVPlay
- Inclure `$WEBAPIS/webapis/webapis.js` et déclarer les privilèges requis dans `config.xml` (à vérifier dans la doc Samsung pour Tizen 5).
- Cycle : `open` → `setListener` → `setDisplayRect` → `prepareAsync` → `play` ; `pause`, `seekTo`, `stop`, `close`.
- Pistes : `getTotalTrackInfo` et `setSelectTrack` pour l'audio et les sous-titres.
- Interface du lecteur : barre de progression, ±10 s, choix des pistes ; masquée automatiquement.
- Gérer suspension et reprise de l'app (visibilitychange) : sauvegarder la position, puis `stop`/`close` proprement.
- Garder un **lien de secours vers l'app Plex officielle** pour les fichiers qui échouent.

### 5.5 Règles de performance (valables pour tout le repo)
- Listes et grilles **virtualisées** : seuls les éléments visibles existent dans le DOM.
- Images à la taille exacte d'affichage, via le transcodeur photo ; chargement différé et préchargement de la ligne suivante.
- Cache local des métadonnées (avec durée de vie), et affichage immédiat du cache pendant la mise à jour.
- Animations limitées à `transform` et `opacity` ; aucun flou en temps réel.
- Mesurer sur la TV : temps jusqu'au premier affichage de l'accueil, temps d'ouverture d'une bibliothèque, latence entre touche et mouvement du focus.

---

## 6. Launcher — adaptations par rapport à CleanFrame

**Allègement par rapport à CleanFrame :**
- **Style figé** : une seule mise en page (List ou Dock, à choisir), pas d'axes d'apparence multiples ; on n'embarque que les ressources de ce style.
- **Une seule police**, une ou deux graisses maximum, en sous-ensemble (caractères latins seulement).
- **Deux ou trois fonds d'écran** au maximum, compressés à la résolution réelle d'affichage, ou un fond uni. Pas de rotation, ou très espacée.
- **Matériaux de verre** : uniquement ceux du style retenu, ou remplacés par des aplats semi-transparents si la mesure montre un coût.
- **Catalogue d'apps en cache** : la découverte via l'API d'inventaire ne tourne pas au démarrage, seulement à la demande depuis les réglages.
- **Horloge à la minute**, aucune autre minuterie active à l'écran d'accueil.

**Fonctionnel :**
- Catalogue d'apps **dynamique et extensible** : ajout d'une app découverte sur la TV, avec ID, nom et icône.
- Raccourcis cibles (IDs à relire sur notre TV) : **Plex intégré** (module interne), Plex officiel en secours, Netflix, YouTube, Disney+, Canal+, etc., selon ce qui est installé.
- Un raccourci « Smart Hub Samsung », pour garder une sortie vers l'accueil d'origine.
- Garder les points forts de CleanFrame : mises en page List et Dock, fonds d'écran, horloge, réglages.
- Migrer les préférences vers une nouvelle clé (`cimaise.v1`), avec un schéma versionné.

---

## 6 bis. Légèreté : budget et protocole de mesure

### Principes
- **Mesurer avant d'optimiser, et mesurer sur la TV.** Les temps mesurés dans Chromium sur un ordinateur, même bridé, ne sont que des comparaisons de développement.
- **Démarrage en deux temps** : premier affichage avec l'accueil minimal (raccourcis + heure), puis chargement différé du reste (fond d'écran, réglages, module Plex, widgets).
- **Chargement à la demande** : le module Plex n'est chargé qu'à la première ouverture ; les réglages aussi.
- **Zéro dépendance runtime lourde.** Toute bibliothèque ajoutée doit être justifiée dans `docs/decisions.md`, avec son poids.
- **DOM minimal** : listes virtualisées, éléments hors écran retirés, pas de filtres CSS en temps réel (`backdrop-filter`, `filter: blur`), ombres sobres.
- **Mémoire** : images décodées à la taille d'affichage, jamais plus grandes ; libérer les images des écrans quittés.
- **Persistance en arrière-plan** : vérifier si la TV garde l'app en mémoire après le lancement d'une autre app ; si oui, la réouverture doit être quasi instantanée, et on privilégie ce chemin.

### Budget de départ (à ajuster après la première mesure en M1)
| Indicateur | Cible |
|---|---|
| Taille du `.wgt` (launcher seul, sans le module Plex) | < 1,5 Mo |
| JS initial (avant chargement différé) | < 100 Ko minifié |
| Premier affichage de l'accueil, à froid | proche du temps d'une page vide (écart < 0,5 s) |
| Réouverture depuis l'arrière-plan | < 0,5 s |
| Latence touche → déplacement du focus | imperceptible (< 100 ms) |
| Ouverture d'une bibliothèque Plex (premier écran d'affiches) | < 1 s avec le cache, < 2 s sans |

### Protocole de mesure (dès M1, puis à chaque jalon)
1. Installer une **page vide** signée et mesurer son temps d'ouverture à froid sur la Frame : c'est la **référence plancher** imposée par Tizen.
2. Installer **CleanFrame tel quel** (adapté à Tizen 5) et mesurer de la même façon.
3. Comparer : si l'écart est faible, le goulot est Tizen et l'allègement n'apporte que peu ; s'il est important, appliquer le §6 et remesurer.
4. Instrumenter l'app : horodatages (`Date.now()` au chargement du script, au premier affichage, à l'accueil interactif), affichés dans un écran de diagnostic caché et consignés dans `docs/tv-status.md`.
5. Mesurer à chaque fois : à froid après une coupure, à froid après un redémarrage de l'app, et à la réouverture depuis l'arrière-plan.

---

## 7. Phase 2 — widgets du homelab

- La coquille locale garde **seule** les appels `tizen.*`.
- Les widgets sont chargés depuis le homelab dans des **iframes** : dashboard Home Assistant, météo, calendrier, état des serveurs, contrôle de Plexamp.
- Pont `postMessage` avec une **liste blanche d'actions** (par exemple `launchApp`, `openPlexItem`) et une vérification de l'origine.
- **Repli local** si le serveur est injoignable : l'accueil et les raccourcis restent utilisables.
- LAN uniquement. Déclarer les origines dans `config.xml`. Vérifier tôt si la TV accepte HTTPS avec un certificat auto-signé ; sinon HTTP sur le LAN.
- Idée pour plus tard, côté Home Assistant et non dans l'app : piloter le mode Art (choix d'œuvre, bascule) avec `samsungtvws` depuis le homelab.

---

## 8. Jalons

| Jalon | Contenu | Validé quand |
|---|---|---|
| **M0 — Reconnaissance de la TV** | Relever modèle et firmware (Paramètres → Assistance → À propos de ce téléviseur) ; activer le mode développeur (Apps → pavé numérique 1-2-3-4-5, IP de l'ordinateur) ; couper l'alimentation au mur s'il faut ; connexion `sdb` sur le port 26101 ; capacités (`sdb capability`) ; liste des apps installées et de leurs IDs ; user agent du moteur web | Tout est consigné dans `docs/tv-status.md` |
| **M1 — Chaîne complète « hello world »** | Certificats Samsung (auteur + distributeur avec le DUID de la TV) ; app minimale ; `required_version` adapté à Tizen 5 ; signature officielle ; installation ; lancement | Une page s'affiche sur la Frame et répond à la télécommande. **Valide toute la chaîne avant d'investir dans le code.** Mesures de référence prises : page vide et CleanFrame tel quel (§6 bis) |
| **M2 — Launcher** | Port de CleanFrame dans `packages/launcher`, en TypeScript compilé ES5 ; catalogue dynamique ; lancement des apps réelles | Netflix et une autre app se lancent depuis l'accueil |
| **M3 — Plex MVP** | §5.1 complet | Un film se lit en lecture directe et la reprise fonctionne depuis un autre appareil |
| **M4 — Plex robuste** | Transcodage, sous-titres, pistes, mesures de performance | Les cas courants de la bibliothèque passent sans l'app officielle |
| **M5 — Widgets** | §7 | Un widget Home Assistant s'affiche, avec repli si le serveur est coupé |
| **M6 — Bouton Home (recherche seulement)** | Voir §9 | Décision documentée, aucune écriture native sans accord explicite |

---

## 9. Bouton Home natif : hors périmètre, à documenter seulement

CleanFrame réassigne le bouton Home avec un assistant .NET qui appelle des opérations natives non documentées (réglages `db/appfw/home_appid`, `db/appfw/startup_appid`, `db/appfw/booting_appid_backup`, `db/first_screen/type`, `db/menu/smart_hub/ontvsetting/auto_start`). Il a été testé sur **Tizen 9 uniquement**, avec un runtime .NET 6 présent sur la TV.

Pour notre Tizen 5 :
- **lecture seule** au mieux : vérifier si un runtime et des opérations équivalents existent ;
- **aucune écriture** sans accord explicite de Stéphane, une sauvegarde des valeurs d'origine et une restauration testée ;
- si cela demande le root, de désactiver des garde-fous ou de modifier la politique de sécurité : **on abandonne**.

---

## 10. Règles pour l'agent

- **Ne jamais** : factory reset, downgrade, root, modifications du menu de service, écriture de réglages natifs, redirection de ports sur le routeur.
- Annoncer chaque action qui touche la TV (installation, lancement, redémarrage) et demander à Stéphane ce qu'il voit à l'écran. **Ne jamais déduire un succès d'une simple réponse du SDK.**
- Pour ce qui n'est visible que sur la TV : donner le chemin du menu et demander une photo recadrée ou le texte tapé.
- **Secrets dans `.local/` uniquement** : certificats, mots de passe, IP, DUID, token Plex. Jamais dans Git ni dans les logs.
- Garder l'**identité de l'app et le certificat auteur stables**, sinon les mises à jour sur place échouent.
- Tenir `docs/tv-status.md` en séparant bien **observé physiquement**, **réponse du SDK** et **non testé**.
- Travail sur l'interface : d'abord dans l'aperçu navigateur, avec les mocks.
- **Légèreté** : toute fonctionnalité ou ressource ajoutée doit indiquer son coût (poids, effet sur le démarrage). En cas de doute, ne pas l'ajouter et demander. Ne jamais dépasser le budget du §6 bis sans le signaler.

---

## 11. Questions ouvertes

1. Modèle exact, firmware et version réelle du moteur web de la Frame (M0).
2. La TV accepte-t-elle une app avec `required_version` abaissé, et quel est le minimum accepté ?
3. AVPlay sous Tizen 5 : codecs, HDR, pistes et sous-titres réellement gérés.
4. HTTPS auto-signé accepté par la TV ou non (phase 2).
5. L'autorun de la dernière app rouvre-t-il bien notre app après le mode Art et après une coupure de courant ?
6. ~~Nom définitif du projet.~~ Tranché : **cimaise**.
7. Écart réel entre une page vide et CleanFrame sur la Frame 2019 : c'est cette mesure qui dira jusqu'où pousser l'allègement.
8. La TV garde-t-elle l'app en mémoire en arrière-plan, et combien de temps ?

---

## 12. Sources

- CleanFrame : https://github.com/nthnclrk/CleanFrame (notamment `docs/development.md`, `docs/agent-tv-setup-guide.md`, `docs/tv-status.md`)
- cleanyourtv, rapport Tizen : https://github.com/Gathin23/cleanyourtv/blob/main/docs/devices/samsung-tizen.md
- Samsung, SDK TV : https://developer.samsung.com/smarttv/develop/getting-started/setting-up-sdk/installing-tv-sdk.html
- Samsung, certificats : https://developer.samsung.com/smarttv/develop/getting-started/setting-up-sdk/creating-certificates.html
- Samsung, connexion d'une TV : https://developer.samsung.com/smarttv/develop/getting-started/using-sdk/tv-device.html
- Samsung, exemple de lancement d'app : https://github.com/SamsungDForum/LaunchApp
- Samsung, télécommande : https://developer.samsung.com/smarttv/develop/guides/user-interaction/remote-control.html
- Samsung, API TV Window : https://developer.samsung.com/smarttv/develop/api-references/tizen-web-device-api-references/tvwindow-api.html
- Samsung, API Application : https://developer.samsung.com/smarttv/develop/api-references/tizen-web-device-api-references/application-api.html
