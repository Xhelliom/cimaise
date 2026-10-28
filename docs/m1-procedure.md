# Procédure M0 / M1 — de la TV à une page affichée

Pour Stéphane. Les scripts sont dans `scripts/tizen/` ; tout ce qui est secret va dans
`.local/` (jamais dans git). **À chaque étape « TV », dis-moi ce que tu vois à l'écran** :
une réponse du SDK ne prouve rien.

## 0. Préparer la machine

1. `scripts/tizen/build-image.sh` (une fois, plusieurs minutes, ~ 8,7 Go sur disque).
2. Vérifier : `scripts/tizen/tizen version` → `Tizen CLI 2.5.25` ; `scripts/tizen/sdb version` → `Smart Development Bridge version 4.2.x`.
3. `mkdir -p .local/certs && cp scripts/tizen/tizen.env.example .local/tizen.env`, puis éditer `.local/tizen.env` (IP de la TV, `APP_ID`, mots de passe plus tard). Pas de guillemets autour des valeurs.

## M0 — Reconnaissance de la TV

### 1. Modèle et firmware (sur la TV)
Paramètres → Assistance → À propos de ce téléviseur. **Regarder** : nom du modèle (attendu LS03R / The Frame 2019) et version du logiciel. Noter dans `docs/tv-status.md`, section « observé physiquement ».

### 2. Mode développeur (sur la TV)
1. Menu → Apps.
2. Taper au pavé numérique **1 2 3 4 5** (ou la télécommande virtuelle).
3. **Regarder** : une fenêtre « Mode développeur ». Mettre sur **On**, saisir l'**IP de ton ordinateur** (celle que la TV voit : `ip -4 addr`), valider.
4. Couper l'alimentation au mur ~ 30 s si la TV le demande, puis rallumer.
5. **Regarder** : le bandeau « Mode développeur » affiche toujours l'IP saisie en rouvrant Apps.

### 3. Connexion sdb (port 26101)
Mettre l'IP de la TV dans `.local/tizen.env` (`TV_IP`), puis :
```
scripts/tizen/sdb-tv.sh devices             # attendu : « connected to <IP>:26101 », puis la TV listée, état « device »
```
Pourquoi pas `scripts/tizen/sdb connect` puis `sdb devices` séparément : chaque appel du wrapper est un conteneur Docker éphémère, et le serveur sdb (port 26099) meurt avec lui, la connexion aussi. `sdb-tv.sh` (comme `install.sh`, `launch.sh`, `list-apps.sh`) fait `sdb connect` puis la commande **dans le même conteneur**.
Si « failed to connect » : IP de l'ordinateur mal saisie dans le mode développeur, ou TV non redémarrée.

### 4. Capacités, DUID, apps
```
scripts/tizen/sdb-tv.sh capability          # noter : version de plateforme, DUID (secret → .local/)
scripts/tizen/list-apps.sh                  # IDs des apps installées → à sauver dans .local/, pas dans git
```

Consigner dans `docs/tv-status.md` (sans IP ni DUID) : plateforme Tizen, résultat des commandes, en séparant « observé » / « réponse du SDK » / « non testé ». Le user agent du moteur web se relèvera plus tard depuis une page de test.

## M1 — Chaîne « hello world »

### 5. Certificats Samsung (auteur + distributeur)
Il faut le **DUID** de la TV (sortie de `sdb capability`, champ `duid`), un compte Samsung, et le certificat se crée avec l'outil Samsung. Deux voies.
- **Voie CLI** (essayer d'abord) : `scripts/tizen/cert-author.sh` (lance `tizen certificate -a cimaise -f author` avec `AUTHOR_PASSWORD` lu dans `.local/tizen.env` : le mot de passe n'apparaît jamais sur la ligne de commande de l'hôte, dans l'historique du shell ni dans les logs ; dans le conteneur, `tizen` le reçoit via `-p`) génère le certificat **auteur** puis le copie dans `.local/certs/author.p12`, le chemin attendu par `AUTHOR_CERT`. Le certificat **distributeur** exige ton compte Samsung : la CLI ne sait pas le demander.
- **Voie Certificate Manager** (`scripts/tizen/cert-manager.sh`, depuis une session graphique de l'hôte) : le Certificate Manager et l'extension Samsung sont déjà dans l'image (reconstruire avec `scripts/tizen/build-image.sh` si l'image date d'avant : elle ajoute GTK3). Le script affiche la fenêtre via X11, ou XWayland sous Wayland (`DISPLAY` doit être défini ; sur NixOS, `programs.xwayland.enable = true`). Pas à pas, **tu fais tout toi-même** (l'agent ne saisit jamais ton mot de passe Samsung) :
  1. `scripts/tizen/cert-manager.sh`. **Tu verras** : une fenêtre « Certificate Manager » (onglet App Signing, « There is no generated certificate profile »). Le script reste bloqué jusqu'à la fermeture de la fenêtre.
  2. Cliquer sur **+** (Certificate Profile). **Tu verras** : « Select the type of certificate profile », deux choix, Tizen et **Samsung**. Choisir **Samsung**.
  3. Étape 1 « Device Type » : **TV** → Next.
  4. Étape 2 « Certificate Profile » : nom `cimaise` → Next.
  5. Étape 3 « Author Certificate » : créer un nouveau certificat auteur (nom, mot de passe = `AUTHOR_PASSWORD`). Laisser le dossier **par défaut** (`~/SamsungCertificate/cimaise/` dans le conteneur) : il est monté sur `.local/SamsungCertificate/` de l'hôte, donc il survit à la fermeture du conteneur (lancé en `--rm`). **Garder ce certificat pour toujours.**
  6. Étape 4 « Distributor Certificate » (même dossier par défaut) : se connecter au **compte Samsung** (dans la fenêtre de connexion qui s'ouvre, c'est toi qui saisis tes identifiants), choisir privilège **Public**, saisir le **DUID** de la TV (`sdb-tv.sh capability`), mot de passe = `DISTRIBUTOR_PASSWORD` → Finish.
  7. Fermer la fenêtre. Le script cherche les `.p12` dans `.local/SamsungCertificate/` (puis dans le keystore du SDK) et les copie en `.local/certs/author.p12` et `distributor.p12` sans rien écraser, et signale ce qui manque. Si les fichiers portent un autre nom, les renommer à la main en `author.p12` et `distributor.p12`.
  - Si la connexion Samsung n'affiche pas de page (navigateur intégré absent) ou si la fenêtre ne s'ouvre pas, dis-moi le message exact.
  - Vérifié sans TV ni compte : fenêtre, choix Samsung et étape « Device Type : TV » s'affichent (sous Xvfb). **Non testé** : connexion Samsung, création des certificats, affichage sur ton écran Wayland réel.
Dans `.local/tizen.env` : renseigner `AUTHOR_PASSWORD`, `DISTRIBUTOR_PASSWORD`. **Garder ce certificat auteur pour toujours** : le changer casse les mises à jour sur place.

> Cette étape n'est pas testée : la création du certificat distributeur dépend de ton compte Samsung. Si tu bloques, dis-moi où.

### 6. Profil de signature
```
scripts/tizen/setup-profile.sh               # liste ensuite les profils : « cimaise » doit apparaître
```

### 7. App minimale et `config.xml`
Dans `apps/tv/` : `index.html` (une page avec du texte et un compteur de touches), `config.xml` avec :
- `<tizen:application id="cimaise00.Cimaise" package="cimaise00" required_version="5.0"/>` (HANDOFF §3 : **abaisser** `required_version`, sinon refus à l'installation) ;
- `<tizen:profile name="tv-samsung"/>`.
`APP_ID` dans `.local/tizen.env` doit correspondre à l'`id`. Ces fichiers sont l'objet d'une autre carte.

### 8. Package et signature
```
scripts/tizen/package.sh                     # produit dist/<nom>.wgt, signé par le packager officiel
```
Ne pas signer à la main (rejeté par la TV).

### 9. Installation (sur la TV, annoncée)
```
scripts/tizen/install.sh
```
Le script fait `sdb install`, puis `vd_appinstall` si « install completed » manque, puis vérifie que l'app est dans la liste. **Regarder la TV** : l'app apparaît dans la rangée Apps ? Dis-moi aussi les messages d'erreur éventuels.
- `Invalid certificate / signature` : DUID absent du certificat distributeur ;
- `version not supported` : `required_version` trop haut.

### 10. Lancement
```
scripts/tizen/launch.sh
```
**Regarder** : la page s'affiche ; les flèches/Entrée de la télécommande incrémentent le compteur. C'est le critère de validation de M1.

### 11. Mesures de référence (HANDOFF §6 bis)
Chronomètre l'ouverture à froid de la page vide, puis de CleanFrame adapté, et consigne dans `docs/tv-status.md`.
