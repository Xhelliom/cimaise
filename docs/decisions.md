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
`.local/tizen.env` ; les mots de passe passent au conteneur par `--env-file`, jamais en
argument de commande ni dans les logs. Les profils de signature sont dans
`.local/tizen-studio-data/`.

**Coût.** Image ~ 8,7 Go sur disque (`cimaise-tizen:5.6`), construite une fois (`scripts/tizen/build-image.sh`). Aucun
impact sur l'app (outillage de dev uniquement).
