# scripts/tizen

SDK Tizen dans Docker (voir `docs/decisions.md`) ; procédure pas à pas : `docs/m1-procedure.md`.
Réglages et secrets lus dans `.local/` (modèle : `tizen.env.example`).

- `build-image.sh` : construit l'image `cimaise-tizen` (`docker/Dockerfile`).
- `tizen`, `sdb` : wrappers de la CLI dans le conteneur (`--network host`).
- `cert-author.sh` : génère le certificat auteur (mot de passe lu dans `.local/`).
- `cert-manager.sh` : ouvre le Certificate Manager Samsung (X11/XWayland, ou `--web` noVNC sans DISPLAY) ; range les `.p12` dans `.local/certs/`.
- `setup-profile.sh` : crée le profil de signature à partir de `.local/` (avec `CIMAISE_TV=tv2` : ajoute `cimaise-tv2`, voir plus bas).
- `add-profile.mjs` : ajoute un profil à `profiles.xml` sans toucher au profil actif (utilisé pour TV2).
- `package.sh` : package + signature du `.wgt`.
- `install.sh` : `sdb install`, puis `vd_appinstall` si besoin, vérification dans la liste.
- `launch.sh` : lance une app sur la TV.
- `list-apps.sh` : liste les apps installées et leurs IDs.
- `native-probe.sh` : sonde native « Voie B » (`.tpk` C vide, `apps/native-probe/`) et son lanceur web jetable (`apps/native-launcher/`) : build, install, launch, build-lanceur, install-lanceur, launch-lanceur, uninstall (refusé par la TV : supprimer depuis le menu), list.
- `test.sh` : vérifie les wrappers (sans TV).
- `lib.sh` : fonctions communes.

## Deux TV : la Frame (défaut) et TV2

Sans variable, tout vise **la Frame** : `.local/tizen.env`, profil Samsung `cimaise`, paquets dans `dist/`. Rien n'a changé pour elle.

Avec `CIMAISE_TV=tv2`, les mêmes scripts visent **TV2** (UE49NU7175, Tizen 4.0) :

| | Frame (défaut) | `CIMAISE_TV=tv2` |
|---|---|---|
| Réglages | `.local/tizen.env` | `.local/tizen.env.tv2` (modèle : `tizen.env.tv2.example`) |
| Profil de signature | `cimaise` (Samsung, profil actif) | `cimaise-tv2` (auteur Tizen + distributeur public du SDK) |
| `required_version` | celui de `apps/tv/config.xml` (5.0) | `REQUIRED_VERSION=4.0`, écrit dans la **copie** empaquetée seulement |
| Paquets | `dist/*.wgt` | `dist/tv2/*.wgt` |

```sh
npm run build                                        # apps/tv/dist, commun aux deux TV
CIMAISE_TV=tv2 scripts/tizen/setup-profile.sh        # une fois : ajoute cimaise-tv2 à profiles.xml
CIMAISE_TV=tv2 scripts/tizen/package.sh apps/tv/dist
CIMAISE_TV=tv2 scripts/tizen/install.sh
CIMAISE_TV=tv2 scripts/tizen/launch.sh
CIMAISE_TV=tv2 scripts/tizen/list-apps.sh
```

Garde-fous :
- toute autre valeur de `CIMAISE_TV` est refusée (pas de repli silencieux vers une autre TV) ;
- avec `tv2`, chaque script affiche `cible : TV2 (IP), profil …` et refuse `SIGN_PROFILE=cimaise` ; `package.sh` exige `REQUIRED_VERSION` ;
- `install.sh` n'accepte que les paquets du dossier de sa cible : un `.wgt` de `dist/` est refusé pour TV2, un de `dist/tv2/` pour la Frame.

Pourquoi TV2 a son propre profil : elle refuse la chaîne Samsung 2025 (118012) et accepte l'auteur Tizen + le distributeur
public historique du SDK (`docs/decisions.md`, 2026-11-08). `setup-profile.sh` (avec `tv2`) écrit ce profil directement dans
`.local/tizen-studio-data/profile/profiles.xml` via `add-profile.mjs`, **sans changer le profil actif ni le profil `cimaise`**
(sauvegarde : `profiles.xml.avant-cimaise-tv2`) : `tizen security-profiles add` y avait écrit des chemins `.pwd` inexistants.
L'auteur `.local/certs/tv2-tizen-author.p12` est l'identité de l'app sur TV2 : ne pas le recréer, sinon les mises à jour échouent.
