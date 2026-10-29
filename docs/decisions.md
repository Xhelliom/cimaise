# Journal des décisions

Toute dépendance runtime ajoutée doit être justifiée ici, avec son poids.

## Décisions initiales (HANDOFF §2)

- **Un monorepo** : code partagé (navigation, lecteur, adaptateur Tizen), une seule identité de signature, une seule installation.
- **Plex = module de la même app `.wgt`** : passage accueil → Plex instantané ; module isolé pour pouvoir être packagé seul plus tard.
- **Point de départ : copie de CleanFrame (MIT)**, restructurée et allégée ; conserver `LICENSE` et `THIRD_PARTY_NOTICES`.
- **Priorité : légèreté avant personnalisation.** La TV de 2019 est le goulot.
- **Langage : TypeScript compilé en ES5.** Le moteur web de Tizen 5 est ancien.
- **Lecteur vidéo : AVPlay** (`webapis.avplay`), pas `<video>`.
- **Bouton Home : hors périmètre** au départ (opérations natives non documentées, testées sur Tizen 9 uniquement).
- **Démarrage : autorun de la dernière app** (réglage officiel) ; le retour Home ramène au Smart Hub.
- **Boîtier externe écarté** : solution logicielle sur la TV elle-même.

## SDK Tizen via Docker (2026-10-28)

**Décision.** Sur la machine de dev (NixOS, pas de Tizen Studio), la CLI `tizen` et `sdb`
tournent dans une image Docker versionnée dans le repo : `scripts/tizen/docker/Dockerfile`
(Ubuntu 22.04 + Tizen Studio CLI), lancée en `--network host` pour joindre la TV sur le
port 26101. Les wrappers `scripts/tizen/tizen` et `scripts/tizen/sdb` cachent le `docker run`.

**Pourquoi.** Tizen Studio n'est pas packagé pour NixOS et son installeur suppose un
Linux classique. Une image épinglée est reproductible et ne touche pas au système.

**Versions choisies (pour Tizen 5.0, Frame 2019 LS03R).**
- Tizen Studio **5.6** (installeur CLI officiel, `web-cli_Tizen_Studio_5.6_ubuntu-64.bin`) :
  `tizen` 2.5.25, `sdb` 4.2.36 (après installation des extensions).
- Extension Samsung TV : `TV-SAMSUNG-Public-WebAppDevelopment` (« TV Extensions-10.0 »).
  Vérifié dans l'image : `platforms/tizen-5.0/tv-samsung` (et `tizen-3.0` … `tizen-9.0`) sont présents, donc Tizen 5.0 est couvert. C'est la **seule** extension TV proposée par Tizen Studio 5.6 ; les anciennes extensions
  par année (TV 5.0…) n'y sont plus listées. Les apps web ciblent les TV anciennes via
  `required_version` dans `config.xml` : il faudra le mettre à `5.0` (voir HANDOFF §3).
  **Non testé sur la TV** : seule l'installation réelle (M1) dira si le `.wgt` produit
  par cette extension est accepté par Tizen 5.0.
- `cert-add-on` (« Samsung Certificate Extension ») : profils auteur + distributeur Samsung.

**Secrets.** Tout ce qui est secret ou propre à la TV (IP, DUID, certificats, mots de passe,
profils, IDs d'apps) vit dans `.local/` (ignoré par git). Les scripts lisent
`.local/tizen.env` ; les mots de passe passent au conteneur par `--env-file`, jamais
sur la ligne de commande de l'hôte, dans l'historique du shell ni dans les logs
(dans le conteneur, `tizen` reçoit le mot de passe via `-p`). Les profils de signature sont dans
`.local/tizen-studio-data/`.

**Coût.** Image ~ 8,7 Go sur disque (`cimaise-tizen:5.6`), construite une fois (`scripts/tizen/build-image.sh`). Aucun
impact sur l'app (outillage de dev uniquement).

## Chaîne de build TypeScript → ES5 (2026-10-28)

**Décision.** `tsc` (cible ES5 réelle, modules ES conservés) abaisse la syntaxe ; `esbuild` ne sert
qu'à bundler et minifier (format IIFE) ; `es-check es5` vérifie la sortie. Résultat : `apps/tv/dist/app.js`
+ `app.css`, un seul de chaque. `npm run build` enchaîne le build et le rapport de taille (échec si
`app.js` > 100 Ko, budget HANDOFF §6 bis ; surchargeable par `CIMAISE_JS_BUDGET_BYTES`).
Scripts : `build`, `typecheck`, `check:es5`, `check` (tout + tests).

**devDependencies (aucune dépendance runtime).**
- `typescript` : déjà présent ; passage ES5.
- `esbuild` 0.28 : bundling/minification, ~12 Mo sur disque (binaire natif), hors `.wgt`.
- `es-check` 9.x : vérifie qu'aucune syntaxe ES2015+ ne reste, ~0,4 Mo, hors `.wgt`.

**Limite.** Seule la syntaxe est vérifiée : les API ES2015+ (Promise, Map…) ne sont pas détectées
par es-check ; polyfills ciblés à ajouter au besoin, avec leur poids ici.

## Identité et `config.xml` de l'app (2026-10-28)

**Décision.** `apps/tv/config.xml` : application `cimaise001.Cimaise`, package `cimaise001`,
widget id `https://local.cimaise/app`, profil `tv-samsung`, `required_version="5.0"`.
L'identité est **définitive** (un changement casse les mises à jour sur place).

**`required_version`.** Tizen refuse une app dont la version requise dépasse celle de la TV ;
la Frame 2019 est en 5.0, donc 5.0 est la valeur minimale plausible couvrant `tvinputdevice`
et AVPlay (CleanFrame amont : 6.5). Non testé sur la TV : si l'installation est refusée
(« version not supported »), essayer 4.0 puis 3.0 et le noter dans `docs/tv-status.md`.

**Privilèges.** Seulement `http://tizen.org/privilege/tv.inputdevice` (touches média). Chaque
privilège ajouté plus tard doit venir avec la fonctionnalité qui l'exige.

**Empaquetage.** `npm run build` écrit `apps/tv/dist/` (dossier à signer par `scripts/tizen/package.sh`,
`APP_DIR=apps/tv/dist`) et `apps/tv/build/cimaise-unsigned.wgt` (zip non signé), puis affiche la taille
(budget 1,5 Mo). Aucune dépendance ajoutée. Page vide de référence : 3,19 Ko au premier build.
Icône `icon.png` : 117×117 uni, 230 octets.

## Routeur à pile de panneaux et chargement différé (2026-10-28)

**Décision.** `packages/tv-core/src/router` : pile de panneaux (`push`/`pop`/`replace`), un seul panneau dans le DOM
(les recouverts sont retirés, `suspend`/`resume` ; les dépilés sont détruits et leurs `<img>` perdent leur `src`).
Retour (`back`, 10009 normalisé) dépile ; à la racine il ouvre une confirmation de sortie, la sortie passe par
`exitApp()` de l'adaptateur device. Zéro dépendance, ~1 Ko minifié estimé.

**Chargement différé.** `lazy(loader)` à rappels (pas de `Promise` : cible ES5 sans polyfill), chargement unique partagé,
nouvel essai après échec. Dans le bundle unique actuel, le chargeur appelle `done(init())` : on diffère l'initialisation,
pas le réseau. Un chunk séparé (injection de `<script>`) ne se justifiera que si la mesure en M3 montre que le module Plex
pèse sur le premier affichage ; esbuild en IIFE ne scinde pas, ce serait un second bundle ES5 chargé par `lazy`.

## Client API Plex : XMLHttpRequest, rappels, transport injectable (2026-10-28)

**Décision.** `packages/plex/src/api` : fonctions typées à rappels `(err, valeur)` (pas de `Promise` : cible ES5 sans polyfill),
transport `Http` injectable. Implémentation réelle : **XMLHttpRequest** (`xhr.ts`), pas `fetch`.

**Pourquoi XHR.** Le moteur web de Tizen 5 est un Chromium ancien : `fetch` y existe mais sans `AbortController` ni délai d'expiration ;
l'annulation du flux PIN et les délais exigent `abort()` et `timeout`, que XHR fournit sans polyfill. Non testé sur la TV
(à confirmer en M3 ; remplaçable en ne changeant que `xhr.ts`).

**Jeton.** En-tête `X-Plex-Token` pour les appels API ; dans l'URL seulement pour les images (transcodeur photo) et la lecture
directe, où `<img>`/AVPlay ne peuvent pas poser d'en-tête. Identifiant client : UUID v4 dans `cimaise.v1` (`prefs.plexClientId`).

**Connexion.** Locales d'abord, puis directes distantes, puis relais ; première qui répond à `/identity`.

**Statut.** Fixtures `tests/fixtures/plex/` écrites à la main, **non vérifiées contre un vrai serveur** ; aucune dépendance ajoutée.

## Wrapper AVPlay `tv-core/src/player` (2026-10-28)

**Décision.** `packages/tv-core/src/player/avplay.ts` : `createPlayer()` est le seul point d'appel à `webapis.avplay`
(via `getWebapis()` de l'adaptateur device). Rappels `(err)`, pas de `Promise`. Cycle `open` → `setListener` →
`setDisplayRect` → `prepareAsync` → (`seekTo` de reprise) → `play` ; `pause`, `seekTo`, `forward`/`rewind` (±10 s bornés à la durée),
`stop`, `close` ; pistes via `getTotalTrackInfo` (audio et texte) et `setSelectTrack`, `setSilentSubtitle` pour masquer les sous-titres ;
événements buffering, temps courant, fin, erreur, sous-titre.

**visibilitychange.** Quand le document devient masqué avec un flux ouvert : `onSuspend(positionMs, url)` est appelé (pour
sauvegarder la reprise), puis `stop` et `close`. Pas de reprise automatique : c'est à l'appelant de rouvrir avec `startMs`.

**Hors TV.** `getWebapis()` lève `NO_WEBAPIS` ; le mock d'aperçu lève aussi. Aucune lecture n'est jamais simulée.
Tests : fausse API injectée par `opts.api`, uniquement dans `tests/player.test.mjs`.

**Inclusion de `webapis.js` (à faire avec le premier écran qui lit).** Dans `apps/tv/index.html`, avant `app.js` :
`<script src="$WEBAPIS/webapis/webapis.js"></script>`. Le chemin `$WEBAPIS` n'est résolu que sur la TV ; dans l'aperçu navigateur
il renvoie une 404, que le mock `webapis` (qui signale l'absence) couvre. Non ajouté ici : aucun écran n'appelle encore le lecteur.

**Privilèges `config.xml` (à ajouter avec cet écran).** Selon la doc Samsung (guide AVPlay / API Product) :
`http://developer.samsung.com/privilege/avplay` (obligatoire pour `webapis.avplay`) et `http://tizen.org/privilege/internet`
(flux réseau, déjà exigé pour les appels Plex). `tv.inputdevice` (touches média) est déjà déclaré. **À vérifier sur la TV** :
non testé, je n'ai pas pu confirmer la liste exacte pour Tizen 5.0 depuis la doc hors ligne ; si l'installation est refusée,
lire le message de `sdb`/`vd_appinstall` et ajuster.

**Coût.** ~2 Ko minifié estimé, zéro dépendance.

## apps/tv devient l'app cimaise ; page vide en cible séparée `apps/blank` (2026-10-29)

**Décision.** `apps/tv` = accueil Dock (`cimaise001.Cimaise`, identité inchangée). La page vide de référence (mesure plancher M1,
HANDOFF §6 bis) est déplacée telle quelle dans `apps/blank` avec **sa propre identité** `cimaiseblk.Blank` (package `cimaiseblk`,
widget `https://local.cimaise/blank`) : les deux s'installent côte à côte. `npm run build` (`scripts/build/all.mjs`) produit
`apps/tv/build/cimaise-unsigned.wgt` et `apps/blank/build/blank-unsigned.wgt`.

**Démarrage en deux temps.** Premier affichage : horloge + 6 tuiles (aplats, police système, aucun fond). Puis, par `setTimeout(0)` :
fond teinté (2 calques, fondu d'`opacity`), salutation, date, titre, pastille Réglages, police Outfit (`body.late` ; `@font-face` ne
télécharge qu'au premier usage, donc rien avant), enregistrement des touches média. Horodatages `tv-core` (`scriptLoaded`,
`firstPaint`, `interactive`) et diagnostic caché (Entrée sur une tuile sans action) conservés ; les réglages affichent aussi le rapport.

**Chunks séparés.** Plex et réglages sont des bundles ES5 distincts (`plex.js`, `settings.js`, un par fichier de `apps/tv/src/chunks/`),
injectés par `chunkLoader` (tv-core) via le hook `lazy` du routeur à la première ouverture : ils ne sont pas dans le JS initial
(contrairement au « même bundle » envisagé le 2026-10-28 : le gain réseau/parse est réel et coûte ~0,3 Ko par chunk). Le panneau Plex
est un provisoire (M3). Retour à la racine : confirmation de sortie du routeur.

**Coût mesuré (build, non mesuré sur la TV).** JS initial 11,72 Ko minifié (budget 100 Ko) ; `.wgt` cimaise 28,58 Ko (budget 1,5 Mo),
dont police Outfit 19,06 Ko + OFL.txt 4,29 Ko ; `.wgt` blank 4,82 Ko. `npm test` passe en `--test-concurrency=1` : plusieurs fichiers
reconstruisaient `dist/` en parallèle et se marchaient dessus.

## Certificate Manager : mode web (noVNC) (2026-10-29)

**Problème.** `cert-manager.sh` exigeait un `DISPLAY` local ; la VM `dev` (Incus) n'a pas de session graphique et se pilote en SSH.

**Mode web (défaut sans `DISPLAY`, ou `--web`).** Dans le conteneur (`scripts/tizen/web-session.sh`) : Xvfb 1600×1000, openbox,
x11vnc (lié à localhost, mot de passe) et noVNC/websockify sur le port `--port N` / `CIMAISE_WEB_PORT` (6080 par défaut, réseau hôte).
Mot de passe de 8 caractères tiré au hasard à chaque lancement, affiché une fois dans le terminal, passé au conteneur par l'environnement
(jamais en argument : x11vnc le lit dans un fichier 0600 temporaire du conteneur, via `-passwdfile` ; jamais dans un fichier du dépôt ni un log). Coût : 4 paquets apt (xvfb, openbox, x11vnc, novnc + websockify) dans
l'image des outils, sans effet sur l'app TV.


Le mot de passe VNC transite par l'environnement du conteneur (`-e CIMAISE_VNC_PW`) : il est donc lisible par `docker inspect` tant que le conteneur tourne. Acceptable sur la VM (usage personnel, mot de passe à usage unique renouvelé à chaque lancement, jamais écrit dans git ni un log).

## Client Plex vérifié contre le vrai serveur (2026-10-29)

**Méthode.** `node scripts/plex/verify.mjs` (hors gate npm, secrets lus dans `.local/plex.env`, jamais affichés) compile
le client réel et appelle chaque fonction sur le serveur du homelab. Transport en lecture seule (GET/HEAD, tout le reste
est refusé) ; `sendTimeline`, `scrobble`, `unscrobble` ne sont jamais envoyés, seulement construits contre un faux transport.
`scripts/plex/capture-fixtures.mjs` régénère `tests/fixtures/plex/` (liste blanche, titres remplacés, identifiants renumérotés,
échec si un secret ou un hôte réel subsiste). `pin-*.json` restent manuels (créer un PIN écrit chez plex.tv).

**Résultat : tout conforme** — plex.tv `resources`, `/identity`, `sections`, `all` paginé (en-têtes `X-Plex-Container-*`
honorés, `totalSize` et `offset` présents), `onDeck`, `recentlyAdded`, `/hubs`, `/hubs/sections/{id}`, `metadata`, `children`
(saisons puis épisodes), transcodeur photo (JPEG 300×450 réellement reçu, ~25 Ko), partie média en HEAD (200, `video/x-matroska`).

**Écarts réel/types, corrigés.**
- `Server.owned` manquait : le compte voit plusieurs serveurs (le sien et un partagé) et rien ne permettait de les distinguer. Ajouté ; le choix du serveur reste à l'UI (non tranché ici).
- `Item` ignorait les champs des épisodes (`grandparentTitle`, `grandparentRatingKey`, `grandparentThumb`, `parentTitle`, `parentIndex`) et `year` : sans eux, « En cours » ne peut pas afficher la série. Ajoutés (optionnels).
- Les hubs n'étaient pas couverts : ajout de `getHubs(…, sectionKey | null, cb)` et du type `Hub`. `/hubs` ne renvoie que des descripteurs ; `/hubs/sections/{id}` embarque les éléments (`Metadata`) et couvre « en cours », « ajoutés récemment », etc. par bibliothèque.
- Fixtures écrites à la main (IP nues, `http`, un seul serveur) remplacées par des réponses réelles anonymisées.

**Connexion.** plex.tv renvoie pour chaque serveur trois connexions, toutes en `https://<ip>.<hash>.plex.direct:<port>` : locale
(32400), distante directe (32400), relais (8443). Le client les ordonne déjà local > distante > relais ; la locale `*.plex.direct`
répond avec un certificat valide. Le même serveur en `https://<ip>:32400` (`PLEX_SERVER_URL`) échoue en `ERR_TLS_CERT_ALTNAME_INVALID` :
**ne jamais construire d'URL à partir d'une IP, toujours utiliser `uri` tel que fourni par plex.tv.** Non testé sur la TV : l'acceptation
de la chaîne de certificats plex.direct par Tizen 5 reste à observer (M3).

**À noter, non corrigé (hors carte).**
- `/library/recentlyAdded` mélange films, saisons et albums de toutes les bibliothèques (musique hors MVP) : filtrer par `type` côté UI, ou passer par `/hubs/sections/{id}` par bibliothèque.
- Les entrées de `recentlyAdded` de type `season`/`album` n'ont pas de `Media` : seul un film ou un épisode est lisible.
- `provides` d'un lecteur peut contenir `client,player` ; le filtre `server` actuel l'écarte correctement.

## Écrans du module Plex (2026-10-29)

**Structure.** `packages/plex/src/ui/` : `home` (rangées En cours / Ajoutés récemment / Bibliothèques, `createRow` de tv-core),
`library` (grille 6 colonnes, `createGrid`, pages de 36 par `X-Plex-Container-Start/Size`), `detail` (film ou série : saisons en
pastilles sans image, épisodes 360×203), `data` (cache d'abord, puis réseau), `cache` (une clé Storage par entrée + index,
durée de vie par type : accueil 5 min, pages 10 min, fiches 30 min, bibliothèques 1 h ; périmé mais < 24 h = affiché pendant la
mise à jour ; plafond 120 entrées, éviction du plus ancien, stockage plein toléré), `images` (240×360, 360×540, 360×203, toujours
`/photo/:/transcode`). CSS `packages/plex/src/plex.css` (importé par `style.css`, +~2,5 Ko dans `app.css`). `plex.js` : 18,7 Ko (chunk différé).
tv-core : `VirtualList.release()/restore()` (images retirées en quittant l'écran, rendues au retour).

**Session.** Lue dans `prefs.plexSession` (`{uri, token}`) du stockage `cimaise.v1`. La connexion par PIN n'est pas dans ces écrans :
sans session, le panneau le dit. L'aperçu (`npm run dev`) écrit cette session depuis `.local/plex.env` via `/__mocks/plex-session.js`
(jamais dans le build ni dans git).

**Mesure dans l'aperçu, contre le vrai serveur** (Chromium 1920×1080 en conteneur, LAN, 412 films) : Entrée sur « Films » →
pages de 36 reçues et rendues : **55 à 70 ms** ; 12 premières affiches chargées : **737 ms** la première fois (transcodeur photo
à froid), **88 ms** ensuite ; réouverture avec cache chaud : **2 à 3 ms**, sans attendre le réseau. Budget M3 (< 1 s avec cache,
< 2 s sans) tenu **dans Chromium sur PC** ; à refaire sur la Frame. DOM de la grille après 8 lignes : 24 tuiles, 73 nœuds,
18 images, toutes en `width=240&height=360`.

**Non fait.** Puces de tri, pastilles du haut, repère « non vu » et progression sur les affiches, fond flou de la fiche ;
lecture AVPlay (message clair), connexion PIN, choix du serveur (le premier du compte).

## Connexion Plex par PIN, vérifiée contre le vrai plex.tv (2026-10-29)

**Écran.** `packages/plex/src/ui/login.ts` (chunk `plex.js`, toujours différé) : sans `prefs.plexToken`, code PIN en 260 px avec « Va sur plex.tv/link » ;
sinon directement la recherche du serveur. Serveur unique ou mémorisé (`prefs.plexServer`) : choisi sans demander ; sinon liste. Connexion locale joignable
d'abord (`chooseConnection`). Session dans `prefs.plexSession` ; avec une session, `createPlexPanel` ouvre l'accueil sans appel plex.tv. Un 401 de plex.tv
efface le token et relance le PIN. Aucun token dans les logs (test dédié).

**Essai réel dans l'aperçu** (`npm run dev`, Chromium 1920×1080 dans le conteneur Playwright v1.49, `plex-session.js` bloqué pour cette exécution seulement,
aucun fichier du dépôt modifié ; journal réseau filtré sur plex.tv, URL sans paramètres) :
1. Ouverture de Plex : `POST /api/v2/pins` puis `GET /api/v2/pins/{id}` à +2,4 s, +4,8 s, +7,2 s (2 s d'intervalle + latence, car la suivante est planifiée à la réponse).
   Code réel de 4 caractères affiché (lisible, centré, dans les marges).
2. Retour : l'écran est fermé, la requête en vol est abandonnée (`net::ERR_ABORTED`), **aucune requête ensuite** pendant 6 s.
3. **Non fait — demande l'opérateur** : valider le code sur plex.tv/link avec le compte de Stéphane. Le chemin après le token (serveur, locale préférée, session
   stockée, réouverture directe) n'est prouvé que contre les fixtures et le faux transport.

**Écart avec la réalité.** `expiresIn` réel = 900 s (les fixtures disaient 1500/1800) : corrigé dans `pin-*.json`. Le délai du client (15 min) était déjà bon.
La réponse réelle a des champs en plus (`qr`, `trusted`, `location`, `expiresAt`…), ignorés. Les `pin-*.json` restent écrits à la main (créer un PIN écrit chez plex.tv).

## Package à 10 caractères et privilèges de lancement (2026-10-29)

**Constat sur la Frame.** La page vide (`cimaiseblk`) et CleanFrame (`cmbnchcf01`) s'installent ; cimaise était refusée
(`install failed[118, -19], reason: Parsing error`) : `cimaise00` fait 9 caractères, Tizen exige exactement 10.
**Décision.** Package `cimaise001`, application `cimaise001.Cimaise`. L'app n'ayant jamais été installée, aucune mise à jour sur place
n'est cassée ; l'identité redevient définitive. Le package fait 10 caractères alphanumériques, vérifié par `wgt.test.mjs` (apps/tv et apps/blank) et `bench-cleanframe.test.mjs` (bench).
`.local/tizen.env` (APP_ID) doit être mis à jour à la main ; aucun ID d'app de la TV n'est versionné.

**Privilèges.** Ajoutés dans `apps/tv/config.xml` : `http://tizen.org/privilege/application.launch` (`tizen.application.launch` et `launchAppControl`,
utilisés par `device.launchApp`) et `http://tizen.org/privilege/application.info` (`tizen.application.getAppsInfo`, inventaire à la demande depuis Réglages).
D'après la doc Tizen Application API ; **non testé sur la TV** (à confirmer au prochain lancement d'une app depuis l'accueil).

**Empaquetage.** `package.sh` réduit le nom de sortie à `[A-Za-z0-9._-]` (espaces → `-`, reste supprimé : `CleanFrame (bench).wgt` → `CleanFrame-bench.wgt`). Raison : le repli `vd_appinstall` est relu par le shell de la TV, où espaces et parenthèses cassent la commande ; c'est le chemin de la TV de référence. `install.sh` refuse avec un message clair tout `.wgt` au nom différent. Testé (faux packager, repli forcé) dans `scripts/tizen/test.sh`, que `npm run check` n'exécute pas.

## Réglages défilants, découverte filtrée, message de lancement (2026-10-29)

**Retour de la Frame.** Liste des Réglages figée (focus hors écran), découverte ≈300 entrées, tuiles par défaut sans ID → diagnostic.
- **Défilement.** Réglages et découverte : une couche `.liste` déplacée par un seul `transform: translateY` (déplacement minimal, `scrollOffset`), lignes de 108 px, 7 visibles ; le DOM est fenêtré (≈ 11 lignes max, aucun nœud pour les 300 apps). Pas de `VirtualList` de tv-core : elle est taillée pour des tuiles image/titre, ces lignes portent des puces et un état de saisie. Coût : aucun poids ajouté notable, pas de minuterie.
- **Filtre.** `device.listInstalledApps` ne garde que `show` vrai (`ApplicationInformation.show`) et trie par nom. **Non testé sur la TV** : si `show` était absent de la réponse, la liste serait vide (message « Aucune app trouvée »).
- **Complétion des ID.** À chaque découverte, `fillIds` renseigne l'ID des entrées sans ID dont le nom (casse/accents ignorés) ou l'alias (`NAME_ALIASES`, ex. « Plex officiel » → « Plex ») correspond ; une app n'est attribuée qu'une fois, jamais si son ID est déjà au catalogue. Les apps déjà au catalogue restent listées, marquées « Au catalogue ». Aucun ID de TV n'est versionné.
- **Échec de lancement.** L'accueil affiche un message de 4 s (« Netflix : ID inconnu, va dans Réglages → Découvrir », ou « … : lancement impossible »), jamais le diagnostic.
- **Diagnostic.** Reste accessible par la touche **0** (clavier ou télécommande, enregistrée via `tvinputdevice`), depuis n'importe quel écran. L'ancien déclencheur (Entrée non traitée) est retiré.

## Écran lecteur Plex sur AVPlay (2026-10-29)

**Où.** `packages/plex/src/ui/player.ts`, ouvert par Lire (fiche et épisodes). Seul appel à AVPlay : le wrapper `createPlayer` de `tv-core`. Coût : aucune dépendance, aucune minuterie hors lecture (masquage 3 s + timeline 10 s), animations `opacity`/`transform` seulement. Le module reste dans le chunk `plex.js`.
- **Reprise.** La fiche est relue directement auprès du serveur (pas le cache) pour le `viewOffset`, puis « Reprendre à hh:mm:ss » / « Depuis le début ».
- **Contrôles.** Gauche/droite ±10 s, Entrée et touches média pause/lecture, Haut = pistes (`getTotalTrackInfo`/`setSelectTrack`, « Désactivés » via `setSilentSubtitle`), Retour/Stop = arrêt propre (timeline `stopped`, `stop`/`close`). `visibilitychange` : position envoyée puis retour à la fiche.
- **Erreur.** Message clair + « Ouvrir Plex officiel » ; l'app est cherchée **par nom** dans le catalogue (`apps/tv/src/index.ts`), jamais par ID. Hors TV, le wrapper lève « webapis est absent » : aucune lecture simulée.
- **Vidéo sous la page.** En lecture, `html`, `body`, `.plex-shell` et le lecteur passent en fond transparent (`html.plex-live`) pour laisser voir la couche AVPlay. **Non testé sur la TV.**

**Script et privilèges.** `apps/tv/index.html` inclut `$WEBAPIS/webapis/webapis.js` avant `app.js` (doc Samsung, AVPlay API). Privilège ajouté : `http://tizen.org/privilege/internet` (flux réseau et XHR vers le serveur Plex). D'après la doc Samsung AVPlay, **aucun privilège `avplay` n'existe** : seul `http://developer.samsung.com/privilege/drmplay` (`setDrm`, `getUID`) est cité ; non déclaré, la lecture DRM est hors périmètre. `internet` n'est pas cité sur cette page : choix issu de la doc Tizen générale. **Non testé sur la TV** ; si la lecture échoue pour un refus d'accès, relire le journal avant d'ajouter un privilège.

## Lecture directe ou transcodage (2026-10-29)

**Où.** `packages/plex/src/playback/` : `profile.ts` (profil de la Frame 2019), `tracks.ts` (pistes par défaut), `decide.ts` (`decidePlayback`), `urls.ts` (URL directe, sous-titre externe, décision + HLS). Non branché à l'écran lecteur (carte suivante). Coût : aucune dépendance, aucun octet dans le bundle tant que rien ne l'importe.
- **Profil (supposé).** MKV/MP4/MPEG-TS ; H.264 8 bits et HEVC 8/10 bits jusqu'à 4096×2304 ; HDR10 et HLG ; AAC, AC3, E-AC3, MP3 ; SRT interne et externe. Tout est `confirmed: false` (« supposé, à confirmer sur la TV ») d'après la doc Samsung des TV 2019, aucun test de lecture. Hors profil donc transcodés : AVI/MPEG-4, AV1, H.264 10 bits, DTS, TrueHD, FLAC, Opus, Dolby Vision profil 5, PGS/ASS/VobSub.
- **Décision.** Par version (`Media`) : conteneur, codec/bits/définition/HDR de la vidéo, codec de la piste audio **choisie**, format du sous-titre **choisi**, parties multiples. La première version lisible en direct gagne, sinon celle qui a le moins de raisons. Chaque raison a un code et un texte (`plan.reason`). Un sous-titre non texte (PGS, ASS, VobSub) → transcodage avec incrustation (`subtitles=burn`) ; un SRT choisi alors que le transcodage a une autre cause est incrusté aussi (pas de sous-titres HLS séparés).
- **Pistes.** Audio : langue préférée (`fra`, codes à 2 lettres acceptés), sinon toutes ; dans le lot, codec lisible d'abord (ex. un AC3 de secours est préféré à un TrueHD), puis indicateur « défaut ». Sous-titres : coupés, sauf un sous-titre **forcé** dans la langue de l'audio choisi ; `default`/`selected` des sous-titres ignorés (ils reflètent le fichier ou le dernier appareil).
- **URL.** Construites sur l'URI `*.plex.direct` de `chooseConnection`, jamais une IP : `assertPlexDirect` lève sinon, sans citer l'URI. Lecture directe = `/library/parts/…?X-Plex-Token=`. Transcodage = `GET /video/:/transcode/universal/decision` (code ≥ 2000 → erreur) puis `start.m3u8` avec les mêmes paramètres (`directPlay=0`, `directStream=1`, `protocol=hls`, `audioStreamID`, `subtitleStreamID`).
- **Vérifié sur le vrai serveur** (lecture seule, `scripts/plex/capture-media-fixtures.mjs`) : forme de `Media`/`Part`/`Stream` sur 12 films variés (`tests/fixtures/plex/media-samples.json`, anonymisés) ; `languageCode` ISO 639-2, `forced` booléen, `key` présent seulement sur les sous-titres externes, `colorTrc` = `smpte2084` en HDR10. Aucun Dolby Vision dans la bibliothèque : champs `DOVIPresent`/`DOVIProfile` non vus, branche testée sur fiche modifiée.
- **Non vérifié.** La réponse de `/video/:/transcode/universal/decision` (la décision ouvre une session côté serveur : interdit en lecture seule), les paramètres exacts acceptés par le transcodeur pour une Frame, et tout ce que lit réellement la TV. À confirmer en M3/M4.

## Lire depuis la fiche d'une série (2026-10-29)

- **Vérifié sur le vrai serveur** (lecture seule, `scripts/plex/capture-show-fixtures.mjs`, fixtures `show-ondeck.json` et `show-finished.json`) : `GET /library/metadata/{série}?includeOnDeck=1` renvoie dans la série une clé `OnDeck` dont `Metadata` est **un seul objet épisode** (pas un tableau), avec `parentRatingKey`, `parentIndex`, `index` et `Media`. Série entamée : OnDeck = l'épisode suivant. Série **jamais vue** : OnDeck = le premier épisode. Série **terminée** : pas de clé `OnDeck`. `detail.ts` accepte objet ou tableau, et retombe sur le premier épisode quand `OnDeck` est absent : la forme réelle n'a pas demandé de correction.
- Depuis « En cours », l'épisode visé reste la cible de Lire, même si le serveur renvoie autre chose comme « à suivre ». Le lecteur refuse `show` et `season` (message explicite, aucune requête).

## Compatibilité CSS avec le moteur web de la TV (2026-10-29)

- **Constat (Frame, 29/10).** Les tuiles du Dock étaient collées : `gap` n'est pas pris en charge par le moteur de Tizen 5. Remplacé dans `home.css` par `grid-gap` (grille) et `>*+*{margin-left}` (flex), rendu identique ; les maquettes (`mockups.css`) ne sont pas concernées.
- **Contrôle.** `scripts/build/check-css.mjs`, lancé par `npm run check` (`check:css`), liste noire maison : `gap`, `row/column-gap`, `aspect-ratio`, `inset`, `clamp/min/max()`, `:is/:where/:has`, `backdrop-filter`. **Aucune devDependency ajoutée** (doiuse + browserslist pèseraient des dizaines de paquets pour une liste de sept règles). Coût runtime : nul.
- **Feuille livrée.** Le CSS minifié par esbuild sans `target` réécrivait `rgba()` en `#rrggbbaa` (Chrome 62+) et `top/right/bottom/left:0` en `inset` (Chrome 87). Le build CSS (`scripts/build/css-build.mjs`) fixe `target: 'chrome56'`, choix prudent tant que le user agent de la TV n'est pas relevé (M0) ; à relever si le moteur s'avère plus récent. `check:css` lit aussi `apps/*/dist/**/*.css` (après le build) et refuse les couleurs à 8 chiffres ; test : `tests/css-compat.test.mjs`.
- **Moteur réel.** Le user agent est affiché dans le diagnostic (touche 0) : à relever sur la TV pour clore la question M0.
