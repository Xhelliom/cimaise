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

**Décision.** `apps/tv/config.xml` : application `cimaise00.Cimaise`, package `cimaise00`,
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

**Décision.** `apps/tv` = accueil Dock (`cimaise00.Cimaise`, identité inchangée). La page vide de référence (mesure plancher M1,
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
