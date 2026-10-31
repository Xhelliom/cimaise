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

## Latence du focus dans le Dock (2026-10-29)

- **Constat (Frame, 29/10).** Légère latence quand le focus passe d'une app à l'autre. Budget §6 bis : touche → focus < 100 ms.
- **Mesure.** `keyLatency()` (tv-core/diag) part du `keydown` et s'arrête à la 2e `requestAnimationFrame` ; min/médiane/max des 20 derniers déplacements dans le diagnostic (touche 0), ligne « latence touche→frame ». Coût : une paire de rAF par touche, quelques octets. **Mesure TV à faire par Stéphane** : appuyer ~20 fois sur gauche/droite dans le Dock, puis touche 0.
- **Avant/après (aperçu, mesure d'ordinateur).** Chromium 155 sans écran (nix, rendu logiciel), 1920×1080, 20 appuis gauche/droite espacés de 400 ms dans le Dock, lecture de la ligne du diagnostic (touche 0). « Avant » = 6f83cbf avec la seule sonde `keyLatency` ajoutée (teinte écrite à chaque déplacement) ; « après » = HEAD.

  | | CPU normal (min / méd / max) | CPU ralenti ×4 |
  |---|---|---|
  | Avant | 17 / 27 / 40 ms | 13 / 31 / 37 ms |
  | Après | 20 / 26 / 31 ms | 8 / 26 / 55 ms |

  **Lecture honnête :** sur ordinateur, tout est déjà à 1–2 frames (< 60 ms) avant comme après ; l'écart est dans le bruit. Le rendu logiciel d'un navigateur sans GPU ne reproduit pas le coût de rastérisation de la Frame : ces chiffres ne prouvent ni gain ni perte. La mesure qui compte est celle de la TV (Stéphane : ~20 appuis, puis touche 0).
- **Changements (suspects 1, 2, 4, sans mesure préalable sur la TV).**
  - Teinte : le focus bouge immédiatement ; la teinte n'est écrite qu'après 150 ms sans mouvement (`TINT_DELAY_MS`), donc plus de réécriture du dégradé à chaque appui rapide.
  - Calques de teinte rastérisés en 960×540 puis `transform: scale(2)` (4× moins de pixels ; le dégradé est lisse, rendu identique), `will-change: opacity`.
  - Tuiles : `will-change: transform` (12 couches au plus). Titre (120 px) et description (30 px) en hauteur fixe pour éviter la remise en page au changement de texte.
  - Non touché : logos (pré-décodage), faute de mesure indiquant un coût. À reprendre si la mesure TV reste > 100 ms.
- Rendu Dock v2 inchangé (mêmes tailles, couleurs, transitions) ; tests : `tests/home.test.mjs`, `tests/tv-core.test.mjs`.

## Pastille Smart Hub et indicateur Réseau (2026-10-29)

- **Smart Hub : méthode retenue.** La pastille lance l'app cible lue dans les préférences (`prefs.smartHubApp`, vide par défaut, **aucun ID en dur**) via `launchApp` ; sans cible, ou si le lancement échoue, repli sur `tizen.application.getCurrentApplication().hide()`, qui masque l'app et ramène à l'écran d'où elle a été lancée (le Smart Hub), l'app restant en mémoire (réouverture rapide, §6 bis). `exit()` est écarté comme premier choix : il tue l'app et coûte un démarrage à froid. Candidats d'ID relevés sur la TV (`.local/tv-apps.txt`, non commités) : une app « Eden » et une app de réglages ; **non testés** : aucune doc Samsung ne nomme l'app de l'accueil, à valider avec Stéphane sur la TV. Pas de bouton de réglage pour l'ID dans cette carte : la préférence se pose à la main tant que l'ID n'est pas validé.
  - **Réserve.** Que `hide()` ramène bien au Smart Hub sur TV vient d'un avis de forum, pas de la doc officielle (qui décrit seulement « hides the application ») : **non testé sur la Frame**.
  - Sources : [Samsung, Application API](https://developer.samsung.com/smarttv/develop/api-references/tizen-web-device-api-references/application-api.html) ; [Samsung, Terminating Applications](https://developer.samsung.com/smarttv/develop/guides/fundamentals/terminating-applications.html) ; [Tizen, Application API 6.5 (TV)](https://docs.tizen.org/application/web/api/6.5/device_api/tv/tizen/application.html).
- **Réseau : indicateur « Réseau coupé ».** Plus une pastille : élément non focalisable, caché sauf si le réseau est coupé. `webapis.network.addNetworkStateChangeListener` (événements `GATEWAY_DISCONNECTED` / `GATEWAY_CONNECTED`), état initial par `isConnectedToGateway()`, aucune minuterie. Écoute retirée à la destruction de l'accueil. Hors TV : l'API est absente (le mock signale), l'indicateur reste caché.
  - **Privilège** : `http://developer.samsung.com/privilege/network.public` ajouté à `apps/tv/config.xml` (exigé par la doc Samsung pour la Network API). **Non testé sur la TV.**
  - **Réserves de la doc/forums** : la FAQ Samsung dit que le détail de l'interface active n'est pas pris en charge (on ne l'utilise pas) ; la détection peut prendre 30 à 40 s quand c'est le routeur qui tombe. Coût : ~0,5 Ko de JS, un nœud DOM.
  - Source : [Samsung, Checking Network Status](https://developer.samsung.com/smarttv/develop/guides/fundamentals/checking-network-status.html) ; [Samsung, Network API](https://developer.samsung.com/smarttv/develop/api-references/samsung-product-api-references/network-api.html).

## Sonde formats (2026-10-29)

- **Écran caché** : diagnostic (touche 0), puis touche 1. Chunk `plex.js` (aucun octet de plus au JS initial hors une ligne du diagnostic). Cherche seul, par GET, une fiche réelle par catégorie (AVI MPEG-4 ASP, MKV H.264, H.264 > 5.1, H.264 10 bits, HEVC Main 10 1080p, HEVC 4K, HDR10, DV 8, DV 5, AV1, audio AC3/E-AC3/DTS/TrueHD/Opus/FLAC/MP2, SRT interne), préférant la fiche qui ne coche que cette catégorie ; pas d'ID en dur. Fiches complètes chargées pour au plus 8 fiches par « signature » de la liste (conteneur, codecs, définition) et 400 au total : une catégorie rare peut donc sortir « aucune fiche » sans être absente de la bibliothèque.
- **Essai** : AVPlay `open → prepareAsync → play`, ~5 s, le temps doit avancer d'au moins 1 s ; sinon échec (code AVPlay), délai (15 s sans réponse, ou temps figé). Aucune écriture serveur : ni timeline, ni scrobble. Le son est audible pendant la sonde. Le profil `FRAME_2019_PROFILE` n'est pas modifié.
- **Résultats** : tableau à l'écran, JSON dans `localStorage` (`cimaise.probe.v1`), ligne compacte (`id=OK`, `id=KO:code`, `id=TO`, `id=--`) pour une photo. `scripts/tizen/read-probe.sh` tente de le relire par sdb : **meilleur effort, non testé sur la TV** (le stockage web d'une app n'est pas forcément lisible) ; sinon photographier la ligne compacte.
- **Non testé sur la TV** : tout l'écran. Le résultat de la sonde, une fois lancée, va dans `docs/tv-status.md` (« Observé physiquement »).

## Sous-titres et pistes audio (2026-10-29, HANDOFF §5.3–5.4)

- **Rendu des sous-titres par la page.** AVPlay ne dessine jamais les sous-titres : il n'envoie que leur texte par `onsubtitlechange`, et `setSilentSubtitle(true)` coupe ces événements. Le lecteur ne le fait donc jamais à l'ouverture : `setSubtitlesVisible(true)` quand une piste de texte est choisie, `false` quand les sous-titres sont coupés. Le texte vient de `onsubtitlechange` et s'affiche dans `.plex-pl-sub` (52 px, ombre portée statique, aucun flou, effacé à l'expiration de l'événement). Un seul chemin pour l'interne et l'externe. SRT externe : `setExternalSubtitlePath` avant `prepareAsync`, puis dernière piste TEXT sélectionnée. **Non testé sur la TV** : que les événements arrivent bien (non silencieux), que le rendu natif ne double pas l'affichage de la page, et que la piste externe soit bien la dernière ; si non, repli à décider (rendu natif, ou SRT récupéré et minuté par nous).
- **Choix de la piste** (`chooseTracks`) : avec une langue de sous-titres, piste complète de la langue (SRT lisible d'abord, sans version malentendants, interne avant externe), sinon sa piste forcée ; sans langue, seule une piste forcée dans la langue de l'audio s'active (seule). PGS/ASS/VobSub, quand rien de lisible n'existe dans la langue : transcodage, `subtitles=burn`.
- **Changement de piste en cours de lecture** : en place (`setSelectTrack`) si direct → direct sans fichier externe ; sinon le flux est relancé à la position courante (le sous-titre externe ne se pose qu'avant `prepareAsync`, le transcodage grave pistes et sous-titres).
- **Préférences** : `prefs.plexAudioLang` (défaut `fra`), `prefs.plexSubLang` (défaut `''` = aucun), `prefs.plexSeries[ratingKey série] = {audioLang?, subLang?}` (par langue, pas par identifiant de piste ; 200 séries max, les plus anciennes oubliées ; ordre de récence explicite dans `prefs.plexSeriesOrder`, car les ratingKeys numériques ne gardent pas l'ordre d'insertion d'un objet). Schéma `cimaise.v1` inchangé (clés optionnelles). Choisir une piste forcée retient « sous-titres coupés » (le forcé s'active seul).
- **Coût** : aucun octet dans le JS initial (les Réglages lisent/écrivent les langues dans leur chunk différé : +~0,4 Ko ; le lecteur est dans `plex.js`). Aucune dépendance.

## Premier affichage et pics de latence (2026-10-29, HANDOFF §6 bis)

- **Avant (mesuré par Stéphane sur la Frame, diagnostic).** `scriptLoaded +0 → firstPaint +583 ms` (page vide : +3 ms ; budget : écart < 0,5 s). Latence touche→frame sur 20 appuis : médiane 18 ms, **max 298 ms**.
- **Constat.** `firstPaint` est posé en fin de script : les 583 ms sont du travail **synchrone** du démarrage, pas de la peinture. Suspects relevés dans le code : trois lectures de `localStorage` (catalogue, mode, tuiles), un `<img>` par logo créé et lancé dès la construction, calcul et écriture de la teinte (dégradé) au premier `paint()`. La police Outfit n'était déjà pas bloquante (`body.late`, `@font-face` ne télécharge qu'à l'usage) ; `font-display: swap` ajouté en ceinture.
- **Marques intermédiaires** (diagnostic, touche 0, dans l'ordre) : `storageRead`, `catalogLoaded`, `homeBuilt`, `firstPaint`, `interactive`, puis après la peinture `painted` (2 `requestAnimationFrame`) et `enriched`. Elles départagent les suspects sur la TV sans nouvelle build.
- **Premier rendu minimal.** `localStorage` lu une seule fois au démarrage (`tv-core/storage`, lectures `startup` uniquement : catalogue, mode, tuiles). Chaque bundle (app.js, plex.js, settings.js) a sa propre copie du module, donc son cache : toute lecture suivie d'une écriture relit le stockage, pour ne pas écraser ce qu'un autre bundle a enregistré (jeton Plex, serveur, langues). `createHome({ deferRich: true })` : tuiles avec leur nom sur leur fond, sans `<img>`, sans teinte ni description. `enrich()`, après la 1re peinture : teinte, description, puis logos **chargés hors DOM** et posés à la place du nom une fois prêts (un échec laisse le nom). Même rendu final, aucune dépendance, aucun octet de ressource en plus (JS initial 26,79 Ko / 100 Ko).
- **Pics de latence : cause enregistrée, puis traitée.** Chaque appui consigne les événements survenus pendant sa fenêtre (`logo <fichier>` au chargement d'un logo, `1re peinture logo <fichier>` quand un appui amène à l'écran un logo pas encore peint, `fondu` au début du fondu de teinte) et un `GC probable` si le tas JS (`performance.memory`, si exposé) a diminué. Le diagnostic affiche « cause du max : max N ms (…) ». Chromium 63 n'a pas `img.decode()` : une image n'est décodée qu'à sa première peinture, donc un logo posé dans une tuile hors écran serait décodé sur l'appui qui l'amène à l'écran (suspect n°1 du max de 298 ms). **Traitement : pré-décodage par couche cachée.** Dès qu'un logo est chargé et posé, une copie est peinte une fois dans `.predecode` (300×130 px, `clip` 1 px, opacité .01, sans événements), puis retirée après deux `requestAnimationFrame` ; tout cela se passe après le premier rendu (`enrich()`), avant le premier appui. Le fondu de teinte n'a lieu que 150 ms après l'arrêt du focus (déjà le cas). Coût : un nœud `<img>` éphémère par logo, ~0,3 Ko de JS, aucune ressource en plus.
- **Avant/après, aperçu bridé** (Chromium 155 sans écran, nix, rendu logiciel, 1920×1080, CPU ralenti ×4 ou non, 3 passes à froid chacune, 20 appuis gauche/droite espacés de 400 ms dans le Dock, lecture du diagnostic à la touche 0). « Avant » = bda1917, « après » = HEAD ; ms, passes séparées par « / ».

  | | CPU ×1 avant | CPU ×1 après | CPU ×4 avant | CPU ×4 après | Cible |
  |---|---|---|---|---|---|
  | storageRead / catalogLoaded | (marque absente) | 1 / 1 | (absente) | 1–2 / 1–3 | |
  | homeBuilt | (absente) | 6 / 6 / 6 | (absente) | 33 / 25 / 30 | |
  | **firstPaint** | 9 / 8 / 8 | 6 / 6 / 6 | 32 / 32 / 34 | 33 / 25 / 30 | < 300 |
  | painted / enriched | (absentes) | 22–29 / 23–30 | (absentes) | 72/66/76 / 78/70/77 | |
  | latence min / méd | 17–18 / 23–25 | 12–17 / 24–25 | 16–19 / 25–26 | 14–22 / 24–33 | |
  | **latence max** | 43 / 32 / 44 | 41 / 33 / 55 | 57 / 45 / 33 | 44 / 37 / 37 | < 100 |
  | cause du max | (absente) | inconnue ×3 | (absente) | inconnue ×3 | |

  « inconnue » = aucun événement (`logo`, `1re peinture logo`, `fondu`) ni baisse du tas dans la fenêtre du plus long appui : le pic de l'aperçu n'est ni la 1re peinture d'un logo (celle-ci est consignée au moment où une tuile à logo entre à l'écran), ni le fondu. L'événement `logo <fichier>` (onload) ne prouve pas le décodage : seule `1re peinture logo <fichier>` désigne un appui qui l'a déclenché. Le pré-décodage n'efface pas cette entrée (il ne prouve pas le décodage sur Chromium 63) : il la marque, et l'appui qui amène le logo à l'écran consigne `1re peinture logo <fichier> (pré-décodé)`, ou sans la mention si le logo n'avait pas été pré-décodé.
- **Lecture honnête : l'aperçu ne reproduit pas le coût de la TV.** Sur la Frame : firstPaint +583 ms et max 298 ms. Dans l'aperçu, **avant** déjà : firstPaint 8–34 ms et max 32–57 ms, sous les deux cibles. Le ralentissement ×4 du CPU ne rapproche pas ces chiffres de ceux de la TV (×17 d'écart sur le premier affichage) : ce qui coûte sur la TV (disque `localStorage`, décodage logiciel des PNG, rastérisation sans GPU, démarrage du moteur) n'est pas simulé. L'écart avant/après dans l'aperçu (firstPaint 32 → 25–33 ms à ×4, max 33–57 → 37–44 ms) est dans le bruit : il ne prouve ni gain ni perte et n'établit pas que la cible est atteinte. Il montre seulement que le premier rendu minimal et le pré-décodage ne coûtent rien (le pré-décodage tombe dans `painted`→`enriched`, +4 à +6 ms à ×4) et que les marques sont bien produites.
- **À mesurer sur la Frame par Stéphane** : diagnostic (touche 0) après un démarrage à froid → marques `storageRead`, `catalogLoaded`, `homeBuilt`, `firstPaint` (cible < 300 ms) ; puis ~20 appuis gauche/droite dans le Dock et la ligne « cause du max » (cible < 100 ms). Si le max reste élevé, elle dit s'il s'agit d'un `logo`, du `fondu` ou d'un `GC probable` ; avec `1re peinture logo … (pré-décodé)`, le pré-décodage n'a pas évité le décodage (la copie 1 px ne décode pas l'image pleine taille) : à abandonner ou à refaire autrement ; sans la mention, le logo n'avait pas été pré-décodé ; consigner les chiffres ici et dans `docs/tv-status.md`.
- Tests : `tests/app.test.mjs`, `tests/home.test.mjs`, `tests/tv-core.test.mjs`.

## Home Assistant (widgets) : accès rapide aux scènes, REST seulement — 29/10
- **Décision de Stéphane** : l'accueil n'a qu'un accès rapide à des scènes Home Assistant. Pas d'états en direct, donc **pas de WebSocket permanente** ni de minuterie (plus léger).
- `packages/widgets` : client ES5 sans dépendance, XHR, délai de 4 s. `GET /api/` (ping) ; `GET /api/states` filtré sur `scene.*` (nom convivial) ; pièces via **un seul** `POST /api/template` (`area_name`) ; activation `POST /api/services/scene/turn_on {entity_id}`. Erreurs à code : `config`, `unreachable`, `unauthorized`, `http`, `format`, `invalid`. Poids ajouté au bundle : 0 tant que l'accueil n'importe pas le package (non branché dans cette carte).
- URL et jeton : `prefs.haUrl` / `prefs.haToken` de `cimaise.v1`. En aperçu, `/__mocks/ha-session.js` les injecte depuis `.local/ha.env` (chemin absolu, ou `HA_ENV_FILE`) ; jamais dans le build ni git ni un message d'erreur.
- À savoir : l'appel REST depuis la TV (ou l'aperçu) est inter-origine et porte un en-tête `Authorization` : Home Assistant doit autoriser l'origine de l'app (`http: cors_allowed_origins`). Non testé sur la TV ni contre le vrai serveur.
- Tests : `tests/widgets.test.mjs` (faux serveur).

## Scènes Home Assistant sur l'accueil — 29/10
- **Rangée de pastilles** au-dessus du Dock (3 à 6, 6 au plus) : nom + point, aplats, aucun flou, `transform`/`opacity` seulement. Haut depuis le Dock y monte, Haut encore va aux pastilles Réglages ; Bas redescend. Entrée : la pastille s'allume tout de suite, puis « ✓ » 1,5 s (une minuterie ponctuelle, aucune au repos) ; erreur : message discret « Scène : cause » (jamais le jeton).
- **Absente** si Home Assistant n'est pas configuré, qu'aucune scène n'est choisie, ou qu'il est injoignable / refuse le jeton (`quickScenes` ne remonte pas d'erreur) : aucun nœud dans l'accueil.
- **Chargement différé** : requête lancée après la 1re peinture (`afterPaint`), et à la fermeture des Réglages si quelque chose a changé. Coût : app.js 26,8 → 33 Ko (budget 100 Ko), `settings.js` +~6 Ko ; aucune ressource, aucune dépendance.
- **Réglages → « Scènes Home Assistant »** : adresse et jeton (champ `<input>` : le clavier à l'écran de la TV s'ouvre au focus ; Entrée valide, Retour annule ; le jeton n'est jamais affiché), pièce (Toutes puis chaque pièce), recherche par lettres (sans casse ni accents, validée par Entrée), scènes choisies en tête avec Monter / Descendre / Retirer, puis candidates (Ajouter). Choix dans `prefs.haScenes` (ids, ordre d'affichage).
- **À vérifier sur la TV** : le clavier à l'écran sur un `<input>` (non testé), et la recherche qui n'est pas « en direct » (filtre à la validation) pour ne pas perdre le focus du champ.

## Pré-remplissage local de Home Assistant dans le paquet — 29/10
- **Problème** : le jeton longue durée (~180 caractères) est pénible à saisir au clavier de la TV.
- **Décision** : `scripts/tizen/package.sh` passe par `scripts/build/local-config.mjs` : si `.local/ha.env` (`HA_URL`, `HA_TOKEN`) existe, une **copie** de l'app (`dist/.stage-app`, supprimée à la sortie) reçoit `local-config.js`, branché avant `app.js`. Au démarrage il écrit `haUrl`/`haToken` dans `cimaise.v1` **seulement s'ils sont vides** ; la saisie manuelle (Réglages → Scènes) reste possible et prioritaire. Sans `ha.env` complet, le paquet est identique à avant.
- **Compromis assumé** : le jeton est **en clair dans le paquet installé sur la TV** (le `.wgt` signé reste dans `dist/`, ignoré par git, et ne part que vers la TV de Stéphane). Il l'est de toute façon dans `localStorage` une fois saisi ; ne jamais partager ce `.wgt`. Pour révoquer : supprimer le jeton dans Home Assistant (profil), puis réinstaller un paquet sans `ha.env`.
- **Garde-fous** : `apps/tv/dist` (build), git et les logs ne contiennent jamais le jeton (le script n'affiche rien de `ha.env`) ; `tests/local-config.test.mjs` le vérifie. Effacer les deux champs dans Réglages fait revenir le pré-remplissage au lancement suivant.
- **Coût** : 0 octet pour le bundle ; ~0,3 Ko de script synchrone avant `app.js`, uniquement dans le paquet local.

## Langues du lecteur : réglages du module Plex, mode « VO sous-titrée » — 29/10
- **Déplacement** : les langues audio / sous-titres quittent les Réglages globaux (retirés de `settings.js`) et vivent dans **Plex → Réglages** (4ᵉ rangée de l'accueil Plex, chargée avec `plex.js`). Prefs : `prefs.plexLang = { mode, audio[], subs[] }` ; `prefs.plexSeries` inchangé.
- **Migration (schéma `cimaise.v1`, version 2 → 3)** : `plexAudioLang` / `plexSubLang`, s'ils existent, deviennent `plexLang` en mode `custom` (`audio: [a]`, `subs: [s]` ou `[]`), les anciennes clés sont supprimées ; sans ancien réglage, rien n'est écrit et le défaut s'applique. **Limite** : l'ancien modèle affichait les sous-titres même avec l'audio choisi ; le mode `custom` ne les affiche que si l'audio n'est dans aucune langue comprise (anglais audio + sous-titres fr migré = plus de sous-titres ; passer en « VO sous-titrée »).
- **Modes** (défaut `vo`) : **VO sous-titrée** = audio VO ; sous-titres français, à défaut anglais, aucun si la VO est le français. **Français si disponible** = audio français sinon VO + sous-titres français (pas de repli anglais). **Personnalisé** = jusqu'à 3 langues audio ordonnées (1ʳᵉ présente ; sinon VO), jusqu'à 3 langues de sous-titres ordonnées, utilisées seulement si l'audio retenu n'est pas dans la liste audio. Dans tous les modes : à défaut de sous-titre complet voulu, la piste **forcée de la langue de l'audio** est activée ; une piste complète en SRT passe avant PGS/ASS/VobSub de même langue (lecture directe), et sans version malentendants.
- **Choix par série** : le choix manuel dans le lecteur (`audioLang` / `subLang` de la série) prime sur le mode pour tous ses épisodes.
- **Détermination de la VO** (`originalLang`, `playback/tracks.ts`) : Plex ne fournit **pas** la langue d'origine d'un média — vérifié en lecture seule sur le serveur (fiche film/série : seul `Country` ; pistes : `languageCode`, `default`, `forced`, aucun champ « langue d'origine » ; le pays n'est pas utilisé, un film américain peut être tourné en français et inversement). Règle : la piste audio marquée **« default »** du fichier, sinon la **première** piste audio. **Limites** : un fichier dont la piste par défaut est un doublage (fixture `mkv-h264-ac3-vobsub` : eng + fra par défaut) donne un faux « VO » ; langue de piste absente → VO inconnue (sous-titres fr puis en, forcés ignorés). Le choix de la série ou le menu du lecteur permet de corriger.
- **Coût** : aucune dépendance ; panneau de réglages ~1,5 Ko dans `plex.js` (chargé à la demande), `settings.js` allégé du sélecteur de langues.
- Tests : `tests/plex-playback.test.mjs` (VO anglaise + sous-titres fr, film français, VO sans sous-titres fr → en, SRT avant PGS/ASS, forcés, modes `fr` et `custom`, choix de série) sur les fixtures réelles anonymisées ; `tests/tv-core.test.mjs` (migration v2 → v3) ; `tests/plex-ui.test.mjs` (panneau).

## Recherche dans le module Plex — 30/10
- **Forme réelle vérifiée (lecture seule, vrai serveur)** : `GET /hubs/search?query=…&limit=12&sectionId=1,2` → `MediaContainer.Hub[]` (un rayon par type : `movie`, `show`, `episode`, `track`, `actor`…, `Metadata` absent si vide). Les rayons `actor`/`director`/`genre` portent des `Directory` (étiquettes à filtre), pas des fiches : **acteurs non montrés** (ouvrir un acteur demanderait une vue de bibliothèque filtrée, hors périmètre). Mesuré en LAN : 50–300 ms ; sans `sectionId` la musique répond aussi (filtrée par type côté client).
- **Principe** : le clavier n'attend jamais le réseau. Films et séries : **index local** des titres (`ui/search-index.ts`), construit en arrière-plan 1,5 s après l'affichage de l'accueil (pages de 100, 40 ms entre deux), interrogeable pendant sa construction, mis en cache (`searchidx`, 6 h puis reconstruction en arrière-plan). Forme stockée `[titre, année, type, ratingKey, horodatage d'affiche]` : **46 octets/titre** mesurés sur le vrai serveur (497 titres = 23 Ko) → ~160 Ko pour 3 400 titres (test < 300 Ko). Correspondance : casse, accents, ligatures, ponctuation, article de tête ignoré, chaque mot saisi en début de mot ; classement début de titre > mots enchaînés > mots dispersés, puis titre court. Recherche 0,2–1 ms pour 497 titres (< 20 ms testé pour 3 400).
- **Chronologie d'une frappe** : caractère affiché (synchrone) → +0 ms résultats locaux en texte → +150 ms vignettes (une seule fois la frappe calmée) → +400 ms sans frappe et ≥ 2 caractères : `/hubs/search` (épisodes, et films/séries que l'index ne couvre pas) ; toute frappe annule la requête en vol ; détruire l'écran annule tout.
- **Navigation** : bouton « Rechercher » en haut à droite de l'accueil Plex (Haut depuis la 1re rangée) ; clavier à gauche, `Droite` au bord du clavier ou « valider » passe aux résultats, `Gauche` au bord des résultats revient au clavier. Entrée ouvre la fiche (un épisode ouvre sa série sur cet épisode). Retour dépile : l'écran de recherche est conservé par le routeur (saisie, focus). Dernières recherches : `prefs.plexSearches` (5, sans doublon, retenues à l'ouverture d'un résultat ou à « valider »), proposées champ vide. Pas de migration : champ optionnel de `cimaise.v1`.
- **Mesures du diagnostic (section Plex)** : `frappe → caractère` (coût synchrone de la frappe), `frappe → 1ers résultats`, `frappe → complément serveur`. Objectifs : < 50 ms et < 800 ms. **Mesure TV à faire par Stéphane.**
- **Coût** : plex.js +~13 Ko (chunk différé), app.js inchangé, app.css +~1,5 Ko (clavier + recherche), aucune dépendance. `Keyboard.canMove(key)` ajouté à tv-core (faux au bord) pour passer la main aux résultats.
- **Non fait** : touches de couleur / chiffres du clavier (`handleKeyCode`) pas branchés au routeur (hors carte).

## Logo : piste verre-2, icône de l'app (2026-10-30)

**Décision.** Stéphane retient **verre-2** (`packages/launcher/brand/logo.svg` 2,4 Ko, `tile.svg` 9 Ko : sans
filtre, texte en tracés). Les sources et explorations restent dans `packages/launcher/brand/` et ne sont jamais
dans le `.wgt` (testé : `tests/wgt.test.mjs`). Seule l'icône finale y entre.

**Icône.** `apps/tv/icon.png` = `logo.svg` rendu en **117×117** (resvg) puis optimisé (oxipng `-o max --strip all`) :
5 648 octets (l'ancien aplat : 230 octets).

**Source de la taille (vérifiée le 2026-10-30).** Les modèles de projet Web TV du SDK Tizen, lus dans l'image
`cimaise-tizen:5.6` (`/home/tizen/tizen-studio/platforms/tizen-5.0/tv-samsung/samples/Template/Web/Basic/Empty/project/icon.png`,
idem Tizen_Blank, Caph/*, et en 5.5 et 8.0), ont tous un `icon.png` de **117×117** (en-tête PNG lu), référencé par
`<icon src="icon.png"/>` : même taille et même déclaration que chez nous. Le guide Samsung « App Icons and Screenshots »
(developer.samsung.com/smarttv/design/app-icons-and-screenshots.html) ne parle pas de l'icône de `config.xml` : il ne
fixe que les icônes de store du Seller Office (1920×1080 logo + fond, 512×423), hors périmètre. Une page Samsung
(Design Q&A) décrit 117×117 comme l'icône « de test » ; je n'ai pu la lire qu'en résumé de recherche : seule la source
du modèle est établie. Non testé sur la TV : si le Smart Hub l'affiche flou, régénérer en 512×512 (`resvg -w 512 -h 512`).

**Coût.** `.wgt` non signé : 141 648 → 147 150 octets (**+5 502 octets**, +5,4 Ko ; 143,7 Ko / budget 1,5 Mo).
Aucun effet sur le JS initial ni sur le démarrage (image lue par le Smart Hub, jamais par l'app).
Afficher le logo dans l'accueil : hors périmètre, à proposer séparément avec son coût.

## Overseerr joignable en HTTPS depuis la Frame : sonde avant tout écran (2026-10-30)

**Question (risque n°1 du module Overseerr).** La Frame (Tizen 5, magasins de certificats de 2019) peut-elle appeler
Overseerr derrière le proxy inverse du homelab, en HTTPS Let's Encrypt (intermédiaire **YR2**), alors qu'Overseerr
n'envoie **aucun en-tête CORS** ? Depuis le PC (2026-10-30) : `GET /api/v1/status` 200 sans clé, `GET /api/v1/discover/movies`
200 avec `X-Api-Key`, mais `OPTIONS` (pré-vol d'un navigateur, à cause de `X-Api-Key`) → **405** sans `Access-Control-*` :
un navigateur ordinaire bloquerait les deux XHR.

**Réponse : oui.** Sur la Frame, les trois essais de la sonde donnent 200 (Stéphane, voir `docs/tv-status.md`). Donc la
chaîne YR2 → ISRG Root X1 est acceptée par Tizen 5, et le moteur de l'app empaquetée **n'applique pas CORS** à cette origine
déclarée (ou ne fait pas de pré-vol) : ni en-tête CORS côté Overseerr ni proxy intermédiaire ne sont nécessaires.
**Pas de repli LAN en http** : aucun LoadBalancer à exposer.

**Ce qui est requis dans `config.xml`.** Testé avec `<access origin="https://<hôte Overseerr>" subdomains="false"/>` et **sans**
`<tizen:content-security-policy>` (aucune CSP n'était déclarée, comme pour Plex). **Non testé sans `<access>`** : le
module Plex joint `*.plex.direct` sans aucun `<access>`, donc l'élément n'est peut-être pas nécessaire ; on le garde (déclarer
les origines du LAN est la règle du HANDOFF §7) tant qu'aucun essai ne prouve le contraire.
- **Le domaine n'est pas commité.** URL et clé restent dans `.local/overseerr.env`. `scripts/build/local-config.mjs` (appelé par
  `package.sh` avec un 4e argument) ajoute `<access origin>` au `config.xml` **de la copie empaquetée** et écrit dans
  `local-config.js` `window.__cimaiseOverseerr = { url, key }` (en mémoire, **jamais dans localStorage**). `apps/tv/config.xml`,
  `apps/tv/dist`, git et les logs ne contiennent ni l'URL ni la clé (`tests/local-config.test.mjs`). Même compromis que pour
  Home Assistant : la clé est dans le `.wgt` (dist/, ignoré par git).

**Sonde.** Diagnostic caché (touche **0**) puis touche **2**. Code dans `packages/widgets/src/overseerr-probe.ts`, servi par le
chunk différé `settings.js` (+2,1 Ko minifié) : **app.js inchangé hors 3 lignes** (touche 2, enregistrement de 1 et 2). Trois GET à la
suite, lecture seule :
1. image `/favicon.ico` (aucun CORS : TLS + réseau seuls) ;
2. XHR `/api/v1/status` sans clé (requête simple) ;
3. XHR `/api/v1/discover/movies?page=1` avec `X-Api-Key` (en-tête non standard → pré-vol hors TV).
Image OK + XHR à 0 aurait désigné CORS ; tout à 0, TLS ou réseau. Affiche code, temps, erreur ; la clé n'est jamais affichée.
- **Touches 1 et 2** : seul 0 était enregistré auprès de `tvinputdevice` au démarrage ; 1 et 2 le sont désormais à l'ouverture
  du diagnostic (sans cela, la TV ne les livre pas à l'app ; la touche 1 de la sonde formats en dépendait aussi).
- **Pas de minuterie** dans le paquet widgets (règle testée) : l'image n'a pas de délai propre ; les XHR ont un `timeout` de 15 s.

**Empaquetage depuis un worktree.** `.local` est un lien vers celui du dépôt principal ; le conteneur ne voit pas sa cible.
On passe `DOCKER=<wrapper>` qui ajoute `-v <.local principal>:<même chemin>` à `docker run` (aucune copie des certificats).
Retirer le lien après coup : `tests/structure.test.mjs` (`git check-ignore .local/x`) échoue tant qu'il existe.

## Client API Overseerr (`packages/overseerr`) : films et séries du moment, recherche, demande (2026-10-30)

**Forme.** Sur le modèle de `packages/plex/src/api` : transport `Http` injectable (XHR sur la TV, avec corps pour le POST),
rappels à la Node, aucune dépendance, tsc ES5. Les résultats bruts (MovieResult/TvResult, ~25 champs de `mediaInfo`) sont
ramenés à un `Title` léger : `{ id (TMDB), mediaType, title, year, posterPath, overview, availability }` ; `title`/`name` et
`releaseDate`/`firstAirDate` unifiés ; les **personnes** (recherche, tendances) sont retirées.
- **Routes** (vérifiées sur l'instance 1.33.2 par `scripts/overseerr/verify.mjs`, lecture seule) : `discoverMovies`,
  `discoverTv`, `trending` (`/discover/movies|tv|trending?page=N[&language=fr]`), `search` (`/search?page=N&query=…`),
  `requestMedia` (`POST /request`). Pagination TMDB : 20 par page, `page`, `totalPages`, `totalResults`.
- **Encodage strict de la recherche.** Overseerr répond **400** (« must be url encoded… reserved characters ») si la requête
  garde `! ' ( ) *`, qu'`encodeURIComponent` ne code pas : « l'été » et « star wars (1977)! » refusés, acceptés une fois
  codés en `%27 %28 %29 %21 %2A` (`strictEncode`). Texte vide : page vide sans requête.
- **Doublons entre pages.** TMDB répète des titres d'une page à la suivante (stable : 2 entre p1 et p2, 4 entre p2 et p3 de
  `/discover/movies`). `appendTitles` fusionne sans doublon (clé type + id) : à utiliser par la future grille.
- **Clé refusée = 403**, pas 401 (`{"error":"You do not have permission to access this endpoint"}`). En lecture, la clé API
  (administrateur) ouvre toutes les routes : 403 en GET → `unauthorized` ; 403 en POST → `forbidden` (droit ou quota).
  409 → `exists` (déjà demandé, d'après le code d'Overseerr, **non observé**). La clé n'apparaît dans aucun message.
- **Badge** (`mediaInfo.status`, doc OpenAPI de l'instance) : 2 « En attente » (approbation), 3 « Demandé » (approuvé, en
  cours), 4 « Partiellement disponible », 5 « Disponible » ; 1 (inconnu), absent ou code non listé → pas de badge.
  Observés en réel : 1, 3, 4, 5 (aucun 2 : les demandes de la clé admin sont approuvées d'office).
- **Demande** : `{ mediaType, mediaId: <id TMDB> }`, plus `seasons: "all"` pour une série. **Jamais envoyée** : forme
  vérifiée contre la doc OpenAPI de l'instance (`/api-docs/swagger-ui-init.js` : mediaType et mediaId requis, seasons
  accepte "all", réponse 201 MediaRequest) et contre des demandes existantes (`GET /request`, même schéma). Le transport des
  scripts refuse tout autre verbe que GET/HEAD (testé). Une demande faite avec la clé API est attribuée à l'administrateur.
- **Affiches** : `posterUrl(path, 'w185' | 'w300')` vers `image.tmdb.org`, jamais l'original (w185 10 Ko, w300 22 Ko,
  original 570 Ko sur un même titre). Non essayé depuis la Frame ; repli : `/imageproxy/tmdb/t/p/` de l'instance.
- **Configuration** : `overseerrConfigFrom(prefs)` lit `prefs.overseerrUrl` / `prefs.overseerrKey` (cimaise.v1, saisis dans
  les Réglages au lot suivant), sinon `window.__cimaiseOverseerr` (copie empaquetée, sonde). Les scripts lisent
  `.local/overseerr.env`.
- **Fixtures** (`tests/fixtures/overseerr/`) : réponses réelles réduites par `scripts/overseerr/capture-fixtures.mjs`, liste
  blanche de champs ; titres, résumés, affiches et identifiants remplacés (titre + statut révéleraient la bibliothèque).

**Poids.** 5,2 Ko minifié (2,2 Ko gzip). Le module n'est importé par aucune entrée : `app.js` et les chunks sont inchangés ;
il sera servi par un chunk chargé à la demande, hors JS initial.

## Maquette Overseerr léger, à valider avant câblage (2026-10-30)

Maquette statique `packages/overseerr/mockups/` (accueil Films / Séries du moment, fiche avec badges Disponible / Demandé / En attente et
bouton Demander), servie sous `/mockups/overseerr/`. Style proposé : ardoise `#0f172a`, accent indigo `#6366f1`, affiches arrondies, badges
en pilule ; aucun flou ni filtre, une seule ombre (anneau de focus à rayon 0), `transform` seul animé. Coût : **2,8 Ko de CSS minifié
(1,0 Ko gzip)**, 0 image, 0 police ajoutée (fiche : `packages/overseerr/mockups/COUTS.md`). Le fond d'œuvre plein écran d'Overseerr est
remplacé par un calque `radial-gradient` statique. Captures de comparaison avec l'instance : hors git (`.local/overseerr-captures/`).
**En attente de la validation du style par Stéphane.**

## Réglages Overseerr : adresse, clé API, bouton Tester (2026-10-30)

- **Module déclaré** dans `packages/launcher/src/modules/registry.ts` : `overseerr`, `configured` = `prefs.overseerrUrl` et
  `prefs.overseerrKey` non vides. Masqué tant que non configuré ; l'interrupteur Activé / Masqué de « Apps intégrées » vaut comme
  pour Plex et Scènes. **Pas encore de tuile** (`tileId: null`) : les écrans Overseerr ne sont pas câblés, une tuile n'ouvrirait rien.
- **Saisie** au clavier à l'écran de tv-core, avec une disposition `technique` ajoutée : touche **maj** (capitales), `. - / :` à la
  place des accents, `=` et `_`. La clé de l'instance fait 68 caractères (capitales, minuscules, chiffres, `=`) : l'ancien
  clavier ABC ne pouvait pas la taper. Disposition par défaut inchangée (recherche Plex, Scènes).
- **Stockage** : `saveOverseerrConfig(url, key)` écrit les deux champs ensemble dans `cimaise.v1` (l'adresse par défaut
  `https://overseerr.wetter.land` devient explicite dès la première saisie). La clé est masquée (`••••••••`) hors saisie,
  jamais dans un message ni une trace, jamais dans le dépôt.
- **Tester** : `GET /api/v1/status` **sans clé** (joignable, version), puis `GET /api/v1/settings/about` avec la clé
  (route d'administration : 403 avec une mauvaise clé, 401 sans ; ne renvoie ni pseudo ni courriel, contrairement à
  `/auth/me`). Vérifié le 30/10 contre l'instance (1.33.2). Affiche « Overseerr 1.33.2 joignable, clé acceptée (N médias). »
- **Retour** de la section d'un module : l'interrupteur relit l'état enregistré (`moduleEnabled`), la saisie de la clé le fait
  passer à Activé sans rouvrir les Réglages.

**Poids.** `settings.js` +5,1 Ko minifié (+1,7 Ko gzip) : section, appel authentifié du client, test ; le transport XHR de la
sonde est réutilisé. `app.js` +0,6 Ko (entrée du registre, disposition technique du clavier). Rien au démarrage : aucune
requête Overseerr tant que l'utilisateur ne presse pas « Tester ».

## Module Overseerr : tuile du Dock et rangées « du moment » (2026-10-30)

- **Chunk `overseerr.js`**, injecté à la première ouverture de la tuile, jamais au démarrage ni si le module est masqué
  (garde `moduleEnabled` avant `pushLazy`). Il apporte l'écran (`packages/overseerr/src/ui/home.ts`), le client (discover
  movies/tv), son transport XHR et **son CSS**, injecté en `<style>` à la première ouverture (comme les Réglages) : `app.css`
  ne bouge pas.
- **Tuile** : entrée interne `overseerr` (indigo `#6366f1`) dans le catalogue par défaut, masquée tant qu'Overseerr n'est pas
  configuré. Pour un catalogue déjà enregistré, `addNewTiles` la pose en tête dès que le module est activé (au démarrage, avec
  les préférences déjà lues, ou en fermant les Réglages). Retirer une tuile masquant son module, une tuile absente d'un module
  activé n'a jamais été posée : aucune trace à garder, et une tuile retirée ne revient pas.
- **Écran** (maquette validée) : « Films du moment » et « Séries du moment », deux `VirtualList` horizontales 240×360 (≤ 9
  tuiles dans le DOM par rangée). Une page TMDB (20 titres) par rangée à l'ouverture, la suivante quand le focus arrive à
  8 titres de la fin (une requête en vol au plus) ; doublons d'une page à l'autre écartés (`appendTitles`). Titres en français
  (`language=fr`).
- **Affiches** : TMDB `w185` (≈ 10 Ko, 185×278 décodé ≈ 206 Ko) affichées en 240×360 ; `w342` serait plus grande que
  l'affichage. Les images ne sont posées que sur les tuiles visibles + 1 de marge, retirées en quittant l'écran.
- **Badges** : `vbadge` ajouté à `VirtualList` (pastille créée à la demande, comme la barre de progression) : Disponible et
  Partiel (vert), Demandé (indigo), En attente (ambre), rien pour un titre jamais demandé. Le zoom du focus porte sur l'affiche
  (la tuile est placée par un transform en ligne).
- **Aperçu** : `scripts/dev/server.mjs` lit `.local/overseerr.env`, écrit adresse et clé dans `cimaise.v1` si elles y manquent,
  et relaie les XHR vers l'origine Overseerr par `/__overseerr/…` (Overseerr n'envoie pas d'en-tête CORS). **GET seulement** :
  aucune demande ne peut partir de l'aperçu.

**Poids.** `overseerr.js` **14,1 Ko minifié (5,4 Ko gzip)**. `app.js` 38,22 → 39,10 Ko (**+0,88 Ko**, +0,2 Ko gzip : entrée du
catalogue, branche d'ouverture, `addNewTiles`, badge de `VirtualList`). `app.css` inchangé. Démarrage : aucune requête Overseerr,
aucun chunk ; une écriture du catalogue une seule fois, le jour où la tuile est posée.

**Non vérifié sur la Frame** : chargement des affiches `image.tmdb.org` (aucune `<access origin>` déclarée pour TMDB ; la sonde
n'a testé que l'origine Overseerr), fluidité du défilement, latence du focus.

## Overseerr : recherche au clavier à l'écran (2026-10-30)

**Décision.** Pastille « Rechercher » en haut à droite de l'accueil Overseerr (Haut depuis « Films du moment »), qui empile un
écran de recherche (`packages/overseerr/src/ui/search.ts`) dans le même chunk `overseerr.js`.

- **Clavier** : celui de `tv-core` (`createKeyboard`), le même que la recherche Plex et les Réglages, **importé, pas recopié** ;
  son CSS est déjà dans `app.css`. esbuild en embarque une copie dans chaque chunk qui l'utilise (≈ 3,7 Ko minifié), comme pour
  `plex.js` et `settings.js` : le code source reste unique.
- **Requête** : `GET /search` après **400 ms** de silence (comme la recherche Plex côté serveur), 2 caractères au moins. Un
  déplacement sur le clavier relance aussi le silence : au D-pad, aller d'une lettre à l'autre dépasse souvent 400 ms et chaque
  lettre partait en requête (vu dans l'aperçu : « al » puis « alien ») ; après correction, une seule requête pour « alien ».
  « Valider » envoie sans attendre. Une réponse d'un texte dépassé est ignorée.
- **Résultats** : films et séries mêlés dans l'ordre d'Overseerr, grille `createGrid` virtualisée 2 colonnes (≤ 10 tuiles dans
  le DOM), affiches `w185` à leur taille native 185×278, badge de disponibilité (le même `badgeFor` que l'accueil, déplacé dans
  `ui/badge.ts`), « Film · 2019 » / « Série · 2021 » sous l'affiche pour distinguer les deux. Page suivante à 6 titres de la fin.
- **Retour** n'est jamais consommé par l'écran : le routeur dépile et l'accueil Overseerr reprend (sur la pastille).
- Un seul repère de focus à l'écran : celui du clavier s'efface quand les résultats ont la main.

**Poids.** `overseerr.js` 14,1 → **22,1 Ko minifié** (5,4 → **8,3 Ko gzip**), dont le clavier ≈ 3,7 Ko. `app.js` 39,10 → 39,13 Ko
(passage de `nav` au chunk). `app.css` inchangé. Rien au démarrage : le chunk n'est chargé qu'à l'ouverture de la tuile.

**Non vérifié sur la Frame** : latence de frappe et de la grille.

## Overseerr : fiche d'un titre et bouton « Demander » (2026-10-30)

**Décision.** Entrée sur une affiche (rangées « du moment » ou résultats de recherche) empile la fiche
(`packages/overseerr/src/ui/detail.ts`, dans le chunk `overseerr.js`), d'après la maquette validée.

- **Contenu** : affiche, « Film · 1994 » / « Série · 2021 », titre, badge, résumé, tous tirés du `Title` déjà chargé :
  **aucune requête à l'ouverture**. Pas de durée ni de genres (il faudrait `GET /movie/{id}` ou `/tv/{id}` par fiche).
  Affiche TMDB `w300` (≈ 22 Ko, 300×450 décodé) en 400×600, libérée en quittant la fiche. Teinte fixe indigo (un dégradé
  statique) : Overseerr ne donne pas la couleur de l'affiche.
- **Demander** : bouton seul focalisable, montré seulement si le titre n'a jamais été demandé (`none`). `POST /request`
  `{mediaType, mediaId}`, plus `seasons: "all"` pour une série (dit à l'écran : « Toutes les saisons »). Une demande à la fois
  (« Envoi… »). Badge après réponse : le statut de la demande tranche (2 approuvée → « Demandé », 1 → « En attente »), sauf média
  déjà (partiellement) disponible ; une demande refusée (3) le dit.
- **Badge sans recharger** : la disponibilité apprise est retenue par type + id TMDB (`rememberAvailability`), lue au rendu de
  chaque tuile (`currentAvailability`) ; les rangées et la recherche relient leurs tuiles en reprenant la main (`refresh`). Un même
  titre présent dans la recherche et dans une rangée change donc partout, sans requête.
- **Erreurs lisibles** : 401 « Clé API refusée : la vérifier dans Réglages > Apps intégrées » ; 403 « Demande refusée par
  Overseerr (droit ou quota) » ; 409, ou 202 sans demande créée (série dont toutes les saisons sont déjà demandées, d'après le
  code d'Overseerr, **non observé**) → « Déjà demandé » et badge « Demandé » ; réseau → « Overseerr injoignable : réessayer » ;
  autre → « Échec de la demande : HTTP n ». Le bouton reste pour réessayer, sauf « Déjà demandé ». La clé n'est dans aucun message.
- Une demande partie n'est pas abandonnée si l'on quitte la fiche : sa réponse met encore le badge à jour.
- **Aperçu** : le relais refuse le POST (« Échec de la demande : HTTP 405 ») ; l'état « Demandé » des captures vient d'une
  réponse simulée dans la page. **La première vraie demande part de la Frame.**

**Poids.** `overseerr.js` 22,1 → **26,4 Ko minifié** (8,3 → **9,3 Ko gzip**), CSS de la fiche compris. `app.js` et `app.css`
inchangés. Rien au démarrage.

## Maquette des finitions Plex, à valider avant câblage (2026-10-30)

Maquette statique `packages/plex/mockups/` (accueil, fiche, lecteur), servie sous `/mockups/plex/`, d'après les finitions demandées par
Stéphane le 30/10 : lecteur en icônes ▶ / ❚❚ (CSS, sans glyphe de police), grand ❚❚ au centre en pause, bouton focalisé indigo, titre +
« finit à HH:MM » au-dessus de la barre ; accueil avec Rechercher en tête, roue dentée à côté (Réglages), onglets en pilules
Accueil · Films · Séries à la place des carrés des bibliothèques ; fiche avec fond flou ; focus homogène (anneau blanc 6 px à rayon 0 +
`scale(1.06)`) et indice de débordement des rangées (fondu statique + chevron, « 7 sur 8 »).

**Flou côté serveur seulement.** Le fond de fiche est `/photo/:/transcode?width=480&height=270&blur=20&opacity=35&background=0b0b0d`
(vérifié sur le serveur : 3,9 Ko JPEG, assombrissement compris, donc pas de voile CSS). Aucun `filter`/`backdrop-filter` (testé).
Coût : 6,1 Ko de CSS minifié pour la maquette autonome, **+1,5 à +2 Ko estimés** sur le chunk Plex à l'intégration ; app.js et app.css
initiaux inchangés (fiche : `packages/plex/mockups/COUTS.md`). L'ambre du module devient l'indigo d'Overseerr : **à confirmer**.
Captures avant/après sur la bibliothèque : hors git (`.local/plex-finitions-captures/`). **En attente de la validation de Stéphane.**

## Lecteur Plex : finitions de la maquette câblées (2026-10-30)

Câblé dans `packages/plex/src/ui/player.ts` d'après la maquette validée : bouton lecture / pause en icône (▶ en pause, ❚❚ en lecture,
dessinées en bordures CSS comme dans la maquette : ni image, ni glyphe de police, ni SVG) ; grand ❚❚ semi-transparent au centre pendant
la pause (fondu d'`opacity`, visible même barre fermée) ; bouton focalisé indigo `#6366f1` + anneau blanc net ; titre et « finit à HH:MM »
sur la même ligne au-dessus de la barre ; ▶/❚❚ rond au centre, Audio / Sous-titres / Épisode suivant en pastilles à droite. Le libellé
« Pause » en ambre disparaît (la ligne d'état ne sert plus qu'aux erreurs, à gauche).

**Heure de fin juste après un saut.** En pause, AVPlay n'émet plus `oncurrentplaytime` : la page retient la position visée par la rafale
et peint barre, temps et « finit à » dès que le saut part (rafale terminée ou Entrée sur la barre) ; une rafale annulée (Retour, focus
qui quitte la barre) ne change rien, un saut refusé repeint la position réelle. Aucune modification du wrapper AVPlay ni de la logique
de lecture.

**Pas repris** : les boutons −10 / +10 de la maquette (nouveaux boutons = nouvelle navigation, hors demande) ; la barre de progression
reste ambre (bascule d'accent encore « à confirmer »).

**Poids.** `plex.css` est importé dans `app.css` (feuille unique) : `app.css` 20 122 → **21 073 o** minifié (+951 o, +183 o gzip),
chargé au démarrage ; `plex.js` 90 374 → **90 692 o** (+318 o, chunk différé). `app.js` inchangé. Aucune image.

## Accueil Plex : en-tête Rechercher + roue dentée, onglets des bibliothèques (2026-10-30)

Câblé dans `packages/plex/src/ui/home.ts` d'après la maquette validée : en tête, « Rechercher un film, une série… » (pastille de 720 px,
loupe en CSS) et une roue dentée qui ouvre les Réglages Plex ; dessous, des onglets en pilules « Accueil » (page courante, indigo, non
focalisable) puis une pilule par bibliothèque vidéo (Films · Séries · …) qui ouvre sa grille ; puis En cours et Ajoutés récemment.
La rangée « Bibliothèques » (carrés gris) et la rangée « Réglages » disparaissent.

**Navigation.** Haut depuis la 1re rangée → onglets (s'il y en a) → en-tête ; Haut dans l'en-tête est retenu. Gauche / Droite bornés dans
l'en-tête (Rechercher ↔ roue) et dans les onglets ; Bas redescend d'un niveau. Sans rangée ni bibliothèque (chargement, serveur muet),
le focus est sur Rechercher. L'en-tête est dans la couche qui défile : sous la 1re rangée, il sort de l'écran et les positions des
rangées sont celles d'avant (décalage `HEAD` = 96 px seulement sur la 1re).

**Roue dentée en CSS** (6 blocs : 4 barres = 8 dents, un disque, un trou), et non en SVG inline comme dans la maquette : pas de risque
de rendu SVG sur Tizen 5, et testable dans le DOM factice. Focus homogène de la maquette sur l'en-tête et les onglets (anneau blanc net
+ `scale(1.06)`) ; le focus des affiches est inchangé.

**Pas fait.** Pas de défilement horizontal des onglets : au-delà d'environ 7 bibliothèques vidéo, les dernières sortiraient de l'écran.
Pas d'indice de débordement ni de « 1 sur 8 » sur les rangées (autre finition de la maquette, hors demande).

**Poids.** `app.css` 21 073 → **22 128 o** minifié (+1 055 o, +192 o gzip ; les règles des carrés « Bibliothèques » sont retirées) ;
`plex.js` 90 692 → **91 839 o** (+1 147 o, chunk différé). `app.js` inchangé. Aucune image. DOM de l'accueil : la rangée Réglages
(1 tuile) et la rangée Bibliothèques (2 à 3 tuiles virtualisées) laissent place à 12 blocs d'en-tête et 1 + n pilules.

## Fiche Plex : Marquer vu / non vu, fond flou du transcodeur, boutons de la maquette (2026-10-30)

**Marquer vu / non vu.** Troisième bouton de la fiche, après Lire/Reprendre et Depuis le début (Gauche/Droite entre les trois).
Il agit sur ce que lit Lire : le film, ou l'épisode visé d'une série (« Lire S1 E4 » → « Marquer vu » marque S1 E4). Libellé
« Marquer non vu » quand l'élément est compté vu sans reprise en cours. `/:/scrobble` ou `/:/unscrobble` (`packages/plex/src/api/media.ts`),
une demande à la fois. **Vérifié le 30/10 sur le serveur du homelab** (film non vu de la bibliothèque, avec les fonctions du module) :
scrobble → `viewCount` 1 et `lastViewedAt` posé, `viewOffset` absent ; unscrobble → `viewCount` et `lastViewedAt` retirés (état
d'origine rétabli). C'est l'état que lisent les autres clients ; l'app Plex officielle elle-même n'a **pas** été regardée.

**Mise à jour sans recharger.** À la réponse du serveur, `data.marked` (même mécanisme que `data.progressed`, partie commune `touch`) :
position locale dans le cache (`o:`, 60 s) avec `unseen` pour un non vu (le `viewCount` ancien du serveur est retiré), fiche et liste
des épisodes corrigées sur place, série et saisons marquées à redemander, l'élément **retiré de « En cours »** dans les deux cas. La fiche
se repeint aussitôt (Reprendre → Lire, coche de l'épisode), puis redemande la série (à suivre, compte de vus) et les saisons. En cas
d'échec : message, rien ne change (pas d'affichage optimiste qui mentirait).

**Saison entière : pas fait.** Le serveur l'accepte (`/:/scrobble?key=<saison>`), mais il n'y a pas de geste simple à la télécommande :
Entrée sur une saison sert déjà (la saison suit le focus), et une zone de plus entre saisons et épisodes allongerait le chemin Bas. À
trancher : bouton « Saison vue » au bout de la rangée des saisons, ou appui long.

**Fond.** `<img>` plein écran sous la fiche : `/photo/:/transcode?width=480&height=270&…&blur=20&opacity=35&background=0b0b0d&url=<art>`
(flou et assombrissement faits par le serveur, ≈ 4 Ko, 0,5 Mo décodé), mis à l'échelle en 1920×1080. **Aucun `filter` ni `blur()`**
dans le CSS (testé). Fondu d'`opacity` de 0,4 s une fois l'image chargée, `src` retiré en quittant la fiche. Sans `art` : fond uni.

**Boutons.** Pastilles de 88 px de la maquette : Reprendre/Lire en indigo `#6366f1` avec ▶, Depuis le début et Marquer vu en aplat
`rgba(255,255,255,.12)`, ✓ ; icônes en bordures CSS sur `::before` (0 nœud, 0 image) ; focus = anneau blanc net de 6 px + `scale(1.06)`,
comme le lecteur et l'accueil. Barre de progression de la fiche passée à l'indigo. Pas repris de la maquette : la ligne « FILM · 2025 »
et le texte « 22 min vues · reste 1 h 24 ».

**Poids.** `app.css` 22 128 → **22 653 o** minifié (+525 o, +87 o gzip) ; `plex.js` 91 839 → **93 609 o** (+1 770 o, chunk différé).
`app.js` inchangé. DOM de la fiche : +2 nœuds (fond, bouton). Une image de plus par fiche (≈ 4 Ko).

## Plex : focus homogène et indice de débordement des rangées (2026-10-30)

**Focus homogène** (maquette du 30/10) dans tout le module : anneau blanc net de 6 px (`box-shadow` à rayon de flou 0) +
`scale(1.06)`, transition sur `transform` seulement. Repris partout où le focus était différent : affiches de l'accueil, de la grille
et des épisodes (`scale(1.1)` + anneau à 92 % → 1.06 + blanc), affiches de la recherche (1.08, 4 px), pastilles de saison, lettres de la
barre alphabétique, serveurs (connexion), réglages, dernières recherches, menu Audio / Sous-titres et dialogue du lecteur (tous en
« pastille inversée » blanche jusque-là). Un test vérifie que chaque règle de focus de `plex.css` porte cet anneau et n'a pas d'aplat
blanc. Exceptions : la **barre de progression** du lecteur garde l'anneau (6 px) sans scale (elle porte le curseur et la miniature) ;
le **repère du clavier** (tv-core) prend l'anneau sans scale (il glisse déjà par un transform en ligne).

Deux contraintes de structure : une tuile virtualisée porte son `translate3d` en style en ligne, donc le scale d'une **pastille de
saison** va au libellé (qui porte désormais la pastille) ; les **lignes des Réglages** étaient placées par `translate3d` en ligne,
elles le sont maintenant par `top` (posé une fois à la création, aucun coût par appui) pour laisser le transform au focus.

**Indice de débordement** : chevron blanc sur un disque sombre (56 px) au bord droit d'une rangée, en fondu d'`opacity`, tant que des
éléments suivent hors de l'écran ; il disparaît quand le dernier est entier à l'écran. Rangées de l'accueil, saisons et épisodes de
la fiche, rangées de la recherche. **Pas de dégradé de bord** (la maquette en avait un : coût de composition non mesuré sur la Frame,
repli prévu par `COUTS.md`) et **pas de compteur « 7 sur 8 »** (texte réécrit à chaque appui). Porté par `VirtualList` (option
`edge`) : la classe `shown` n'est touchée que lorsque l'état change, pas à chaque appui (testé).

**Latence touche → frame** (diagnostic, aperçu Chromium, CPU ×4, 20 appuis par série, vraie bibliothèque du homelab) :

| Écran | Avant (min / méd / max ms) | Après |
|---|---|---|
| Accueil (3 séries) | 7–8 / 20–22 / 34–36 | 6–7 / 16–18 / 30–34 |
| Bibliothèque (grille) | 7 / 24 / 37 | 7 / 25 / 37 |
| Fiche (boutons) | 2 / 13 / 31 | 7 / 14 / 29 |

Écart dans le bruit : inchangée dans l'aperçu. **Sur la Frame (Stéphane, 30/10, après installation)** : max **≈ 66 ms** dans
l'accueil Plex (« genre 66 ms », budget < 100 ms tenu ; min et médiane non relevés) ; aucune mesure Frame d'avant n'existe pour cet écran. Focus homogène et
chevron vus à l'écran, conformes.

**Poids.** `app.css` 22 653 → **23 387 o** minifié (+734 o, +104 o gzip) ; `plex.js` 93 609 → **93 933 o** (+324 o, chunk différé) ;
`app.js` 40 074 → **40 221 o** (+147 o : `VirtualList` est partagée avec l'accueil). DOM : +1 nœud par rangée. Aucune image.

**Accent : jaune Plex au lieu de l'indigo (2026-10-30, demande de Stéphane après l'avoir vu sur la Frame).** La bascule ambre → indigo
de la maquette était « à confirmer » ; Stéphane préfère le jaune Plex `#e5a00d`. Repassés au jaune : bouton Lire/Reprendre de la fiche,
jauge de la fiche, onglet « Accueil » courant, bouton focalisé du lecteur. Texte et icônes (▶, ❚❚, qui suivent `currentColor`) en
noir `#111` sur le jaune, comme l'app Plex : le blanc y serait peu lisible. Le reste du module (barres de progression, coches « vu »)
était déjà en jaune : un seul accent. Coût : quelques octets.

## Bibliothèque Plex : tri (Ajout récent, Titre, Année) et filtre « Non vus » (2026-10-30)

Deux pilules en haut à droite de la grille, atteintes par **Haut depuis la première ligne** : « Tri : … » (OK fait défiler Ajout
récent → Titre → Année) et « Non vus » (OK bascule, jaune Plex quand actif). **Tri et filtre faits par le serveur**
(`sort=addedAt:desc|titleSort|year:desc`, `unwatched=1`) : la pagination virtualisée par `X-Plex-Container-*` est inchangée, la
grille repart de la page 0 (`VirtualList.reset()`), les requêtes du choix précédent sont annulées. Chaque combinaison a ses
pages en cache (clé d'origine gardée pour titre sans filtre). Pas de menu déroulant : une pilule qui défile coûte un nœud de moins
et aucune pile de panneau.

**Vérifié sur le serveur du homelab (30/10)** : 413 films → 259 non vus, 85 séries → 30 (séries = au moins un épisode non vu) ;
pages de 36 parcourues deux fois pour chaque tri : aucun doublon, ordre stable (à année égale, le serveur départage par titre :
`year:desc` suffit). `/firstCharacter?unwatched=1` somme exactement au total filtré, dans l'ordre du tri par titre : la **barre
alphabétique reste active en « Titre + Non vus »** avec cet index filtré ; elle est **masquée** en tri par ajout ou par année
(ses lettres n'y auraient pas de sens).

Choix mémorisés **par bibliothèque** dans `cimaise.v1` : `prefs.plexLibrary[clé de section] = { sort: 'added'|'title'|'year',
unwatched }`, champ ajouté sans changer le schéma (absent ou inconnu = titre, tout). Défaut inchangé : tri par titre.

Coût : `plex.js` +2,1 Ko (chargé à la demande), `app.js` +95 o (`reset` de `VirtualList`), `app.css` +476 o ; deux nœuds DOM ;
une lecture du stockage à l'ouverture d'une bibliothèque, une écriture par changement. Aucune image, aucune minuterie.

## Accueil Plex : rangée « Pas encore vus » (2026-10-31)

Troisième rangée, **après « Ajoutés récemment »** : les ajouts récents non vus, films et séries. Source :
`/library/recentlyAdded?unwatched=1`. **Vérifié sur le serveur du homelab (31/10)** : 50 entrées (13 films, 8 saisons, 29 albums),
**0 vue** (contre 25 sans le filtre) ; une saison commencée reste tant qu'un épisode n'est pas vu ; `type=` est ignoré par cet
endpoint, la musique est donc écartée côté client comme pour « Ajoutés récemment ». Garde-fou local en plus du serveur : toute
entrée vue en entier (`viewCount`, ou `viewedLeafCount = leafCount`) est retirée, et un élément marqué vu ou lu jusqu'au bout sur la
TV quitte la rangée tout de suite (correction du cache, sans attendre le serveur). Rangée **masquée si vide**. Même cache et même
rafraîchissement que « Ajoutés récemment » (clé `unseen`, 5 min, cache affiché d'abord).

**Coût : une requête de plus à l'ouverture de l'accueil** (aucune si le cache a moins de 5 min), ≈ **116 Ko de JSON** sur notre
serveur (même ordre que `recentlyAdded`), réduits par `slim` avant le cache. DOM : une rangée virtualisée de plus (chevron
compris), dont les images ne se chargent que lorsqu'elle est à une rangée du focus. `plex.js` +≈0,6 Ko (chunk différé). Aucune
minuterie.
