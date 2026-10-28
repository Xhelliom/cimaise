# scripts/tizen

SDK Tizen dans Docker (voir `docs/decisions.md`) ; procédure pas à pas : `docs/m1-procedure.md`.
Réglages et secrets lus dans `.local/` (modèle : `tizen.env.example`).

- `build-image.sh` : construit l'image `cimaise-tizen` (`docker/Dockerfile`).
- `tizen`, `sdb` : wrappers de la CLI dans le conteneur (`--network host`).
- `setup-profile.sh` : crée le profil de signature à partir de `.local/`.
- `package.sh` : package + signature du `.wgt`.
- `install.sh` : `sdb install`, puis `vd_appinstall` si besoin, vérification dans la liste.
- `launch.sh` : lance une app sur la TV.
- `list-apps.sh` : liste les apps installées et leurs IDs.
- `test.sh` : vérifie les wrappers (sans TV).
- `lib.sh` : fonctions communes.
