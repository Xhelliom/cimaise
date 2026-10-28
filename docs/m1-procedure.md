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
Il faut le **DUID** de la TV (sortie de `sdb capability`, champ `duid`), un compte Samsung, et le certificat se crée avec l'outil Samsung. Dans le conteneur il n'y a pas d'interface graphique : deux voies.
- **Voie CLI** (essayer d'abord) : `scripts/tizen/cert-author.sh` (lance `tizen certificate -a cimaise -f author` avec `AUTHOR_PASSWORD` lu dans `.local/tizen.env` : le mot de passe ne passe jamais par la ligne de commande ni l'historique du shell) génère le certificat **auteur** dans `~/tizen-studio-data/keystore` du conteneur, soit `.local/tizen-studio-data/keystore/author/`. Le certificat **distributeur** exige ton compte Samsung : la CLI ne sait pas le demander.
- **Voie Certificate Manager** (Tizen Studio sur une autre machine, ou VM) : Tools → Certificate Manager → créer un profil Samsung, type TV, « Author » puis « Distributor » ; se connecter à ton compte Samsung ; renseigner le **DUID** ; privilèges « Public ». Copier les `.p12` obtenus dans `.local/certs/` (`author.p12`, `distributor.p12`).
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
