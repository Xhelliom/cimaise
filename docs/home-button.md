# Bouton Home natif — étude (HANDOFF §9)

> **Exploration, recherche seulement.** Ce document conclut sans rien écrire sur la TV.
> Aucune action n'a été exécutée sur la Frame. Les vérifications proposées (§6) sont en
> **lecture seule** et destinées à l'orchestrateur, avec l'accord de Stéphane — pas à l'agent.

## La question

CleanFrame sait faire de son launcher la cible du bouton Home sur une Frame 2024 (Tizen 9).
Peut-on faire pareil pour que le bouton Home de la télécommande ouvre **cimaise** sur la Frame
2019 (LS03R, Tizen 5.0), dans les limites du §9 (pas de root, pas d'exploit, pas de
modification de la politique de sécurité) ? Et sinon, quelles voies officielles restent ?

## Le mécanisme Tizen en dessous (pourquoi le Home est redirigeable)

> Recoupé depuis le travail couchroot S90D — la source de référence citée par CleanFrame
> (`scripts/native-home/README.md`, voir Sources). C'est ce qui explique *pourquoi* les trois
> écritures de `Control.cs` suffisent.

- **Le bouton Home n'est pas codé en dur sur le Smart Hub.** Dans le firmware, le handler du
  bouton Home physique appelle `ContextProduct::LaunchHomeApp`, qui **résout** l'opération
  app-control `http://tizen.org/appcontrol/operation/main` via `app_operation_get_current_app`.
  L'app qui répond à cette opération est l'« app Home » effective.
- **L'enregistrement autorisant** de cette résolution est la ligne de l'opération main dans
  **`/opt/dbspace/user/5001/.appsvc.db`** (SQLite, par utilisateur). Ligne d'origine relevée sur la
  TV de référence : `http://tizen.org/appcontrol/operation/main | NULL | NULL | com.samsung.tv.csfs`
  — c'est-à-dire « Samsung Home ». Rediriger le bouton = changer l'app par défaut de cette
  opération (`app_operation_set_current_app`) ; l'assignation **survit au reboot** (vérifié
  reboot par reboot sur S90D).
- **Chaque écriture de l'`apply` pilote une chose distincte** :

  | Écriture | Ce qu'elle pilote |
  |---|---|
  | `app_operation_set_current_app(operation/main, appid)` | Le **bouton Home** physique (ligne `.appsvc.db`) |
  | `db/appfw/home_appid` = appid | Ce que **`app-boot-manager` choisit au boot** (constaté dans le binaire) |
  | `db/menu/smart_hub/ontvsetting/auto_start` = 1 | **Foreground vs background** de l'app au boot (0 = arrière-plan) |

- **`startup_appid` seul ne suffit pas** : sur S90D, écrire seulement `db/appfw/startup_appid` n'a
  rien établi — Samsung l'a remis à `org.tizen.tv-viewer` au reboot. C'est le couple
  `home_appid` + `auto_start=1` qui établit le boot ; c'est ensuite **Samsung lui-même** qui met à
  jour les valeurs dérivées `startup_appid` / `booting_appid_backup` vers la nouvelle app.
- **`db/first_screen/type` n'est pas modifié** par l'apply (reste `com.samsung.tv.csfs`) : la sortie
  vers le Smart Hub reste possible explicitement (pastille de sortie dans l'app).
- **Pourquoi il faut du code natif** : `libvconf.so.0` (réglages `db/...`) et les app-operations TV
  (`libcapi-appfw-app-operation-tv.so.0`) sont des API C natives. L'API Web `tizen.application`
  n'expose que `launch` / `hide` / `getCurrentApplication` — rien n'écrit l'opération `main` ni les
  clés `db/`. Impossible de le faire depuis l'app web : il faut exécuter un petit programme **sur la
  TV**, en tant qu'utilisateur SDK (UID 901).

## Ce que fait CleanFrame (Tizen 9) — mécanisme

Source : `scripts/native-home/` du dépôt CleanFrame (`Control.cs`, `run.py`, `README.md`,
les scripts `query/inspect/apply/restore.sh`), commit `58ac92a`.

**Un assistant .NET 6 à usage unique.** Un petit programme C# (`Control.cs`, cible `net6.0`,
assembly `CleanFrameHomeControl`) est compilé **hors TV** avec le SDK Microsoft, puis poussé sur
le téléviseur par la connexion développeur `sdb`. Il ne tourne **pas** à l'intérieur de
CleanFrame et ne reste pas résident : c'est un outil de développement lancé à la main. Le dépôt
ne contient que la source ; le binaire compilé, la base de restauration (`original.json`) et
l'adresse de la TV restent privés.

**Il appelle des bibliothèques natives Tizen par P/Invoke** (`DllImport`), pas une API publique :

| Bibliothèque | Fonction utilisée | Rôle |
|---|---|---|
| `libbundle.so.0` | `bundle_create/_free` | construit un « bundle » d'app-control |
| `libaul.so.0` | `aul_svc_set_operation`, `aul_get_default_app` | **lit** quelle app répond à l'opération « main » (= l'app Home effective) |
| `libcapi-appfw-app-operation-tv.so.0` | `app_operation_set_current_app` | **écrit** l'app par défaut d'une opération (réassigne Home) |
| `libvconf.so.0` | `vconf_get_str/_int`, `vconf_set_str/_int` | lit/écrit les réglages `db/...` |
| `libapp-context-manager-common.so` | `util_is_appbooting_supported_webapp_byappid` | vérifie que l'app est éligible au démarrage |
| `libc` | `getuid` | contrôle l'UID (doit être 901, l'utilisateur SDK) |

**Les réglages touchés.** L'assistant lit cinq valeurs pour l'instantané et la restauration :

- `db/appfw/home_appid` — app associée au Home ;
- `db/appfw/startup_appid` — app de démarrage ;
- `db/appfw/booting_appid_backup` — sauvegarde de l'app de boot ;
- `db/first_screen/type` — type de premier écran ;
- `db/menu/smart_hub/ontvsetting/auto_start` — exécution auto du Smart Hub (entier 0/1).

À l'**application** (`apply`), il n'écrit en réalité que **trois** choses :
1. l'opération Home par défaut → son propre appid (`app_operation_set_current_app`) ;
2. `db/appfw/home_appid` → son propre appid (`vconf_set_str`) ;
3. `db/menu/smart_hub/ontvsetting/auto_start` → `1` (`vconf_set_int`).

Les autres clés (`startup_appid`, `booting_appid_backup`, `first_screen/type`) servent à
**détecter un changement d'état** et à **restaurer** ; elles ne sont pas réécrites à l'apply.
Chaque écriture est relue pour confirmation ; tout échec déclenche une restauration immédiate.

**Garde-fous du code** (il refuse de s'exécuter sinon) : process 32 bits et `getuid()==901`
(utilisateur SDK, **pas root**) ; firmware exactement `T-PTMDUABC-0090-2130.0` (la Frame 2024 de
référence) ; app installée dans `/opt/usr/apps/nClrkHome1` et jugée « boot-supported » ;
instantané d'origine non vide et inchangé depuis la prise de référence.

**Comment il s'exécute sur la TV.** Le `README` parle d'un « package-name command workaround »
pour exécuter en tant qu'utilisateur SDK (UID 901) via la connexion `sdb`. En clair :
CleanFrame fait passer son assistant par une **faille d'injection non documentée du tooling
d'installation d'app** du mode développeur. C'est précisément ce que le HANDOFF §9 range dans
« opérations natives non documentées » et ce que le §10 interdit (« pas d'exploit »). CleanFrame
revendique ne pas demander root ni modifier la politique de sécurité ; il n'empêche que le canal
d'exécution est un détournement, pas une API prévue pour ça.

**Prérequis** : la TV doit embarquer un **runtime .NET 6** utilisable (`/usr/bin/dotnet`,
`/usr/share/dotnet/shared/Microsoft.NETCore.App/...`). Tizen 9 (Frame 2024) le fournit.

**Portée réelle, selon les propres preuves de CleanFrame** (`docs/compatibility.md`) :
Home natif n'est confirmé que sur **Tizen 9** (LS03D firmware 2130.0) et rapporté par des
contributeurs sur **Tizen 6.5 / Chromium 85** (PR #2, #5). Le validateur d'instantané exige des
valeurs d'origine **non vides** ; il ne sait pas restaurer une clé absente ni un Home
initialement vide. Revue croisée avec les travaux « native Home » du projet couchroot (S90D).

## Transposition à Tizen 5.0 (Frame 2019 LS03R)

Trois verrous, du plus dur au plus mou.

**1. Le canal d'exécution est un exploit → interdit par le §9/§10.**
Même si tout le reste était favorable, la voie CleanFrame repose sur une injection dans le
tooling d'installation pour exécuter du code natif en tant qu'utilisateur SDK. C'est hors
périmètre par principe, indépendamment de la version de Tizen. **C'est le point bloquant.**

**2. Runtime .NET sur un téléviseur de 2019 : douteux, non vérifié.**
Tizen .NET existe depuis Tizen 4, mais la présence d'un `dotnet` **exécutable et compatible .NET 6**
sur une Frame 2019 de production n'est pas établie. .NET 6 cible normalement Tizen 6+. Un build
.NET 3.1 a été évoqué par un contributeur CleanFrame mais **jamais vérifié**. À confirmer par une
lecture sur la TV (§6) — mais même présent, le verrou 1 reste.

**3. Pas d'API Web équivalente, pas de lecture sans privilège.**
- L'API **Tizen Web Device** (Application API) sait **lancer** et **masquer** une app, pas
  réassigner le Home ni changer l'app de démarrage. Aucune API Web publique n'écrit `home_appid`.
- `vconf` **n'est pas exposé** aux applications Web. Lire ou écrire `db/appfw/home_appid` depuis
  cimaise est impossible par l'API Web.
- Lire ces clés « sans privilège partenaire » suppose de toute façon une **exécution sur l'appareil**
  (`vconftool get`, via le shell développeur) — ce n'est pas une opération de l'app, et l'écriture
  réclamerait des privilèges plateforme/partenaire que le SDK public ne donne pas.

### Ce qui est observé sur NOTRE TV (lecture seule, 2026-10-31)

Exécuté depuis le PC, via `sdb` (sessions uniques, aucune écriture sur la TV — HANDOFF §10).

**1. Le shell sdb est un dispatcheur à liste blanche, pas un shell.**

| Commande envoyée | Réponse |
|---|---|
| `sdb shell id`, `0 id`, `0 uname -m`, `0 cat /etc/tizen-release`, `0 ls …`, `0 vconftool get <5 clés Home>` | **`closed`** — commandes arbitraires refusées |
| `0 mkdir -p <dir existante>` | **`closed`** (le `|| true` du repli d'`install.sh` le masquait) |
| `0 applist` | OK — liste des apps complète |
| `0 vd_appinstall cfhi01.Cfhi cfhi.tpk` (fichier inexistant) | Tentative d'install réelle : « download failed[16] » — la commande est vivante |
| `0 appinstall tpk cfhi.tpk` (fichier inexistant) | « Package not found [-5] » — `appinstall` existe aussi, résout dans `/home/owner/share/tmp/sdk_tools/` |
| `0 loglevel`, `0 logcat`, `0 log`, `0 syslog`, `0 appinfo <id>` | **`closed`** — pas de log système, pas d'état d'app via sdb |

**2. Les backticks ne passent pas non plus (test marqueur, 31/10).**
`0 vd_appinstall "cfhi01.Cfhi" "cfhi.tpk\`id; echo MARKER_HOME_42\`.tpk"` → **`closed`**, sans
marqueur dans la sortie. Contrôles : un nom propre produit une tentative d'install (le chemin est
échoé par la TV), un nom avec un espace produit une réponse vide. La rejection arrive **avant**
toute exécution : la TV valide la chaîne de commande (commandes connues + forme) et ne la passe
jamais dans un shell avec les arguments bruts. Le « package-name command workaround » de CleanFrame
(substitution de commandes dans le nom de tpk) n'a donc **aucun support** sur ce firmware — même
conclusion que sur Tizen 4.0 (CleanFrame PR #8), cette fois **prouvée par expérience** et non par
inférence.

Conséquences :

- **Le verrou 1 est tranché sur notre TV** : aucune exécution de code arbitraire via sdb — ni
  commande, ni injection par argument. Impossible de pousser puis faire tourner un helper (C ou
  .NET) par ce canal.
- Le seul autre canal d'exécution est l'app elle-même (paquet `.wgt` signé, installé par le chemin
  officiel) — mais une app web n'a que l'API Web : ni `vconf`, ni app-operations (verrou 3). Les
  deux canaux sont fermés.
- Le runtime .NET, les clés `vconf` et les libs natives ne sont plus vérifiables via sdb, mais ce
  n'est plus bloquant : les canaux d'exécution sont morts avant elles.
- `appinfo` étant `closed`, l'état « en cours d'exécution » d'une app n'est **pas interrogeable**
  via sdb : le seul capteur « l'utilisateur est (ou non) sur cimaise » est l'app elle-même (voir
  « L'objectif « bouton Home = cimaise » » plus bas).

**Conclusion de faisabilité (tranchée le 2026-10-31 par expérience)** : réassigner le bouton Home
vers cimaise sur la Frame 2019 **dans les limites du §9 n'est pas possible**. Le canal d'exécution
sdb est définitivement fermé sur ce firmware (liste blanche stricte, backticks rejetés avant
exécution), et aucune API Web n'écrit l'opération `main` ni les clés `db/`. Les verrous 2 et 3
(runtime .NET probablement absent, zéro preuve sur Tizen 5 — CleanFrame note « Not tested » pour la
Frame 2019 QE55LS03R) ne sont plus atteignables de toute façon. Aucune écriture n'a été faite sur
la TV ; rien à restaurer.

## Les voies officielles (recensement)

| Voie | Ce qu'elle fait | Pour cimaise |
|---|---|---|
| **« Exécution automatique de la dernière application »** (réglage Samsung) | Au démarrage, rouvre la dernière app utilisée au lieu du Smart Hub | **Retenu** (HANDOFF §2). Rend cimaise « collante » au boot si c'était la dernière app. Ne touche pas au bouton Home. |
| Bouton **Home** de la télécommande | Ramène **toujours** au Smart Hub Samsung ; aucun réglage officiel ne le redirige | Accepté comme sortie (§2). Pas de contournement officiel. |
| Bouton **Retour** pendant cimaise | Géré par l'app : dépile les panneaux ; à la racine, confirmation puis sortie | Déjà implémenté (`docs/decisions.md`). |
| **Pastille « Smart Hub »** dans cimaise | Sortie volontaire : lance l'app d'accueil, sinon `getCurrentApplication().hide()` (app gardée en mémoire) | Déjà implémenté ; réouverture rapide depuis l'arrière-plan. |
| Réglages Samsung d'écran d'accueil / démarrage | Hors « autorun dernière app », pas de réglage public pour imposer une app au Home | Rien d'exploitable de plus. |

**Comportement Home/Retour avec cimaise en arrière-plan.** Quand une autre app est lancée
depuis cimaise (ou via `hide()`), l'hypothèse de travail (HANDOFF §11 Q8, non vérifiée sur la TV)
est que la TV garde cimaise en mémoire, d'où une réouverture quasi instantanée. Le bouton Home
continue de mener au Smart Hub ; c'est de là que l'utilisateur relance cimaise (ou via l'autorun
au prochain démarrage). Ce couple **autorun + persistance mémoire** est la meilleure approximation
officielle d'un « Home = cimaise », sans jamais réassigner le bouton.

## L'objectif « bouton Home = cimaise » — approximation HA (idée, 2026-10-31)

> Objectif exprimé (31/10) : que le bouton Home physique mène à cimaise plutôt qu'au Smart Hub. La
> réassignation native étant prouvée impossible sur cette TV (section « Transposition »), la voie
> restante est une **approximation pilotée depuis l'homelab** (périmètre phase 2, HANDOFF §7).
> **Statut : idée à valider, rien d'implémenté.**

**Ce qui est détectable ou non (état des lieux 31/10) :**

| Signal | Détectable ? | Moyens |
|---|---|---|
| « Le Smart Hub est affiché » (en soi) | **Non** | Aucune API publique n'expose l'app au premier plan ; logs système et `appinfo` refusés par le shell sdb (testés 31/10, `closed`) |
| « L'utilisateur a quitté cimaise » | **Oui** | L'app elle-même est le capteur (ci-dessous) ; `appinfo` étant fermé, c'est le seul capteur possible |

**Architecture proposée (cimaise = capteur, HA = cerveau) :**

1. cimaise envoie des **événements** (HTTP LAN, vers l'homelab) :
   - `visibilitychange` → visible : `cimaise:foreground` ;
   - `visibilitychange` → hidden : `cimaise:hidden` ;
   - lancement volontaire d'une autre app depuis cimaise : `cimaise:launch:<id>` (l'utilisateur a voulu partir) ;
   - cas limite : si la TV tue l'app au hidden (persistance en mémoire non vérifiée, HANDOFF §11 Q8),
     l'événement peut être perdu → HA raisonne par **timeout** (aucun `foreground` depuis X s + TV
     allumée = quitté) ; un heartbeat 15 s optionnel en paranoïa.
2. Automatisation HA : *TV allumée* + *cimaise hidden (ou timeout)* + *pas de `launch` volontaire*
   + *N secondes* → **lancer cimaise** (intégration `samsungtv` / port 8001).

**Résultat ressenti** : touche Home → Smart Hub → cimaise revient après N secondes. Le bouton Home
*sert* à revenir à cimaise, sans réassignation.

**Le réglage à trancher (N)** : 3-5 s = ressenti « bouton » mais envahissant si l'utilisateur
parcourt le Smart Hub (HA ne voit pas ses touches) ; 15 s = jamais envahissant, moins « bouton ».
Le repli reste le statut quo : un clic sur cimaise depuis le Smart Hub, réouverture < 0,5 s.

**Coût (légèreté, §6 bis)** : événements ponctuels sur le LAN (~1 ko de JS), aucune minuterie
permanente obligatoire, rien au démarrage ; bien dans le budget.

**Ce que ça ne donne pas** : aucun signal « touche Home » propre (logs fermés) ; l'auto-retour est
une inférence (quitté + pas de lancement volontaire), pas une interception du bouton.

## Voie B — helper natif en paquet Tizen (idée 2026-10-31, non testée)

> Exploration web du 31/10 (docs SDK Samsung/Tizen, repo officiel `Samsung/tizen-docs`).
> Statut : **idée à tester**, rien d'exécuté sur la TV.

Le shell sdb étant fermé, l'autre façon de faire tourner du code natif sur la TV est de
l'installer **en tant que paquet** : le canal d'installation officiel (`sdb install` /
`vd_appinstall`) fonctionne déjà chez nous tous les jours — aucune astuce de shell nécessaire.

- **App native C (`.tpk` avec `tizen-manifest.xml`)** : le runtime applicatif natif Tizen existe
  sur les TV Samsung depuis 2014 (section « TV Legacy Platform » des docs SDK) ; une Frame 2019
  Tizen 5 a donc bien un runtime natif. Un helper C (~50 lignes) :
  1. lit les 5 clés Home via `vconf_get_str/_int` (`libvconf.so.0`, base de tous les réglages
     Samsung, présente sur toute TV) et l'app par défaut de l'opération main ;
  2. sauvegarde l'instantané d'origine dans le stockage de l'app ;
  3. `apply` : `vconf_set_str(db/appfw/home_appid)`, `vconf_set_int(auto_start, 1)`, et
     `app_operation_set_current_app(operation/main, appid)` via `dlopen("libcapi-appfw-app-operation-tv.so.0")`
     (échec gracieux si la lib est absente sur Tizen 5) — chaque écriture **relu** ;
  4. `restore` : remise exacte des valeurs d'origine, relue.

  Pilotage depuis cimaise : `tizen.application.launch(<helper>)` (privilège public), résultat lu
  dans un fichier partagé et affiché dans les réglages ; restauration en un bouton.
- **Variante .NET (TizenFX)** : type d'app TV documenté (même approche par P/Invoke) — mais exige le
  **runtime .NET embarqué** sur la TV (présent sur Tizen 9, inconnu et peu probable sur Tizen 5).
  La variante C n'a aucune dépendance de runtime.
- **Points d'incertitude (chacun testable avec échec sûr)** :
  1. l'install d'un `.tpk` natif signé avec notre certificat public est-elle acceptée ? (standard
     Tizen ; l'install elle-même le dira) ;
  2. les écritures `vconf` sont-elles acceptées depuis une app de niveau **public** ? La doc liste
     le privilège `http://tizen.org/privilege/systemsettings` (public : « read and write
     unrestricted system settings ») et vconf n'apparaît dans aucune liste d'API
     « security-sensitive » ; le contrôle est par clé (privilège par défaut public selon l'audit
     couchroot S90D). Si refus : l'écriture échoue, rien n'est modifié.
  3. `libcapi-appfw-app-operation-tv.so.0` existe-t-elle sur Tizen 5 et accepte-t-elle l'appel ?
     (présente sur Tizen 9 ; `dlopen` → échec gracieux sinon.) C'est elle qui pilote le vrai bouton
     ; `home_appid` + `auto_start` pilotes le boot.
- **Écartés par la doc** : API Web (aucun setter d'opération — confirmé dans la reference
  Application API), `SmartHubConfig` .NET (lecture seule `Country`/`Server`), WebAssembly et NaCl
  (sandbox sans accès aux libs système), `inputgenerator`/`keygrab` (privilèges platform, hors
  certificat public).
- **Coût** : toolchain cross Tizen 5 (armv7l) + sysroot à installer dans l'image Docker
  (téléchargement SDK, local) ; helper ≈ quelques Ko ; rien n'est écrit sur la TV tant que
  l'expérience n'est pas approuvée.

**Télécommande custom (exploration 31/10)** : les codes IR sont mappés à des comportements fixes
dans le firmware (un Flirc/IR ne peut pas changer ce que fait le bouton Home) ; « app channels »
(app mappée sur un numéro de canal) introuvable sur les modèles 2019 ; Bixby « ouvre <app> »
non vérifié pour une app développeur. La seule télécommande custom utile est **hors IR** : un
bouton physique (Zigbee/ESPHome) ou un raccourci qui déclenche l'automatisation HA « lancer
cimaise » (voie A ci-dessus).

## Risques

- **CleanFrame natif tel quel** : exploit du tooling d'installation (interdit §9/§10) ; écrit des
  réglages système ; sans runtime .NET présent, échoue ; restauration dépendante du **même**
  transport SDB que l'application (pas de repli indépendant vérifié) ; validateur incapable de
  restaurer une valeur d'origine vide/absente — risque de laisser le Home dans un état non prévu
  sur une TV dont l'état initial diffère de la référence.
- **Toute écriture de `db/appfw/*`** sort du §9 et exige l'accord explicite de Stéphane, une
  sauvegarde testée et une restauration prouvée — non réunis ici.

## Recommandation

**Rester sur les voies officielles et ne pas réassigner le bouton Home.** Concrètement :

1. Conserver **« exécution automatique de la dernière application »** comme mécanisme de
   démarrage (déjà décidé), et **vérifier** qu'il rouvre bien cimaise après le mode Art et après
   coupure de courant (HANDOFF §11 Q5 — c'est une carte de test TV, pas du natif).
2. Soigner la **réouverture depuis l'arrière-plan** (pastille Smart Hub via `hide()`, budget
   §6 bis < 0,5 s) : c'est le vrai ressenti « revenir à cimaise », et il est 100 % officiel.
3. **Ne pas** porter l'assistant .NET de CleanFrame : canal d'exécution interdit, runtime
   probablement absent, zéro preuve sur Tizen 5.
4. **Lecture seule et test marqueur exécutés (31/10)** : le shell sdb est en liste blanche stricte
   et les backticks sont rejetés avant exécution sur notre TV — la question du canal est tranchée,
   pas de voie propre. Aucune expérience supplémentaire n'est nécessaire.

### Questions qui appartiennent à Stéphane (à trancher, pas décidées ici)

- **Q-A.** La piste est objectivement close (canal d'exécution prouvé fermé par expérience, 31/10) :
  validation formelle de la clôture. Le « Home = cimaise » se limite alors au couple autorun +
  réouverture arrière-plan (et, optionnel, lancement externe depuis Home Assistant).
- **Q-B.** Le couple « autorun + réouverture arrière-plan » est-il un ressenti suffisant, ou
  valide-t-on l'approximation HA (capteur cimaise + auto-retour, section dédiée ci-dessus) pour la
  phase 2 ? Y compris le choix de N (délai d'auto-retour : 3-5 s « bouton » ou 15 s « discret »).

## Vérifications en lecture seule proposées (orchestrateur + accord de Stéphane)

> **Exécutées le 2026-10-31** (voir « Ce qui est observé sur NOTRE TV » plus haut) : shell sdb en
> liste blanche (`id`/`cat`/`ls`/`vconftool` → `closed`, `0 applist`/`0 vd_appinstall`/`0
> appinstall` → vivants) et test marqueur par backticks → `closed` avant exécution. Les checks
> restants (dotnet, clés vconf, libs) sont injoignables sur cette TV ; le firmware est celui relevé
> en M0 (QE49LS03RAUXXC, T-MSMDEUC-1500.9). Aucune écriture sur la TV.
>
> **À exécuter par l'orchestrateur, pas par l'agent.** Toutes en lecture. Aucune n'écrit de
> réglage, n'installe, ne lance ni ne redémarre quoi que ce soit. Prérequis : mode développeur
> activé et `sdb` déjà connecté à la TV (hors périmètre de cette carte). Si une commande renvoie
> une erreur de droits, **s'arrêter** : c'est l'information recherchée (pas de voie propre).

```sh
# 1. Identité et droits du shell développeur (doit être l'utilisateur SDK, pas root)
sdb shell id
sdb shell uname -m                       # 32 vs 64 bits

# 2. Modèle et firmware réels de la Frame 2019 (à reporter dans docs/tv-status.md)
sdb shell "sed -n '/^Model=/p;/^Version=/p' /etc/prd_info.ini"
sdb shell cat /etc/tizen-release

# 3. Présence (ou non) d'un runtime .NET utilisable
sdb shell "ls -d /usr/share/dotnet/shared/Microsoft.NETCore.App/* 2>/dev/null || echo 'aucun .NET'"
sdb shell "ls -l /usr/bin/dotnet 2>/dev/null || echo 'pas de dotnet'"

# 4. Valeurs actuelles des réglages Home (LECTURE SEULE — 'get', jamais 'set')
sdb shell "for k in db/appfw/home_appid db/appfw/startup_appid db/appfw/booting_appid_backup db/first_screen/type db/menu/smart_hub/ontvsetting/auto_start; do vconftool get \"\$k\"; done"
```

Ce qu'on en déduit : §3 vide ⇒ la voie CleanFrame est de toute façon inexécutable ici ; §4
documente l'état d'origine (utile *si un jour* Stéphane autorisait une expérience réversible, hors
de cette carte). **Rien de tout cela ne doit être écrit en retour.**

## Sources

- CleanFrame, dossier `scripts/native-home/` (`Control.cs`, `run.py`, `README.md`,
  `query/inspect/apply/restore.sh`), commit `58ac92a` — https://github.com/nthnclrk/CleanFrame
- CleanFrame, `docs/compatibility.md` (preuves par TV ; Frame 2019 QE55LS03R Tizen 5.0 : Home
  natif « Not tested ») et `docs/interaction-behaviour.md` (sortie Smart Hub, Back).
- Projet couchroot, travaux « native Home » S90D (revue croisée citée par CleanFrame) —
  https://github.com/splitcipher/couchroot
- HANDOFF.md du présent dépôt : §2 (autorun retenu), §9 (recherche seulement), §10 (interdits),
  §11 Q5/Q8 (autorun et persistance à vérifier).
- `docs/decisions.md` du présent dépôt : gestion Retour, pastille Smart Hub via `hide()`.
- `docs/tv-status.md` du présent dépôt : réponse du SDK de la sonde sdb du 2026-10-31 (shell libre
  `closed`, `0 applist` OK) et relevé M0 du modèle/firmware (QE49LS03RAUXXC, T-MSMDEUC-1500.9).

## Voie B — étape 1 : résultat (2026-10-31)

> Sonde `org.cimaise.sondenative` : app C vide, sans privilège ni vconf ni `dlopen`, signée avec le
> profil cimaise inchangé. Détails dans `docs/tv-status.md` et `docs/decisions.md`.

- **Installation : acceptée.** Notre certificat public (auteur + distributeur) suffit pour
  installer un `.tpk` natif (`pkg_type[tpk]`, « install completed », app vue dans Apps par Stéphane).
  L'incertitude n° 1 de la Voie B est levée côté installation.
- **Lancement : non abouti.** Chargement sans fin à l'écran, texte jamais affiché, pas de fermeture
  automatique ; `was_execute` répond « resumed » au lieu de « launched ». Le code de l'app n'a donc
  probablement jamais tourné. Faute de logs (`logcat` et `appinfo` sont `closed`), la cause n'est
  pas départagée : (a) la TV refuse d'exécuter un binaire natif signé par un certificat public,
  (b) plantage au chargement des bibliothèques (rootstrap IoT 5.0 ≠ TV), (c) fenêtre EFL non
  affichée par le compositeur de la TV.
- **Désinstallation via sdb : refusée** (`closed`) ; suppression manuelle depuis la TV.

### Sonde v2 : sans fenêtre, lancée par un lanceur web (2026-10-31)

But : séparer « le code natif s'exécute-t-il ? » de « la fenêtre s'affiche-t-elle ? ». La sonde
1.0.1 ne crée aucune fenêtre ; elle doit vivre 60 s puis se fermer seule. Le lanceur web jetable
`cmzlanceur.Lanceur` la lance par `tizen.application.launch` et relève `getAppsContext`
(journal photographié par Stéphane, publié sur la carte).

- Le processus est **créé** : le contexte 3140 apparaît 0,5 s après `launch`, et le premier
  `launch` répond « succès », mais seulement après 5 s.
- Il **ne se ferme jamais seul** : le même contexte 3140 est encore présent environ 5 min après
  son lancement (essai 2, jusqu'à t+90 s). La minuterie de 60 s ne s'est donc pas déclenchée, et
  le code applicatif n'atteint pas sa boucle d'événements. Un second `launch` sur ce processus
  bloqué → `UnknownError : Unknown error.`
- **Ce que cela tranche pour la v1** : le chargement infini ne venait pas de l'affichage de la
  fenêtre EFL (hypothèse c), puisque la v2 sans fenêtre se bloque pareil. Restent (a) un refus
  d'exécution du natif signé par un certificat public, appliqué en laissant le processus en
  suspens, ou (b) un blocage au chargement ou à l'initialisation (appfw/ecore du rootstrap IoT 5.0
  ≠ TV). Ces deux causes ne sont pas départageables sans logs.
- Réserve : tout repose sur `getAppsContext` (le contexte existe), pas sur une trace de
  l'exécution du code.

**Conséquence pour la Voie B** : sur cette Frame, avec notre certificat public, **aucun code natif
n'a été vu s'exécuter**. Les étapes suivantes (lecture de vconf, `app_operation_*`) supposent un
code qui tourne : elles sont **bloquées**. Pour aller plus loin, il faudrait une sonde qui prouve
l'exécution par un effet observable sans logs, par exemple un binaire libc seul qui se termine
aussitôt (le contexte doit alors disparaître). Même en cas de succès, (a) reste plausible pour
tout ce qui touche à l'UI ou aux bibliothèques TV. À décider par Stéphane ; recommandation :
**clore la Voie B** et garder les voies officielles (autorun et réouverture depuis l'arrière-plan).

## Autres pistes après la Voie B (2026-10-31)

> Point de départ : la réaffectation du bouton Home est impossible sur cette Frame (canal sdb fermé,
> Voie B bloquée : le natif signé avec un certificat public ne s'exécute pas). Restent des pistes
> **sans code natif ni réglage écrit**. Rien n'a été exécuté sur la TV pour cette liste : chaque
> « à tester » est une manipulation à faire par Stéphane ou une future carte.

| # | Piste | Faisable (Frame 2019, Tizen 5.0, certificat public) ? | Coût | À tester sur la TV |
|---|---|---|---|---|
| 1 | **Touches de la télécommande enregistrées par cimaise** (`tizen.tvinputdevice.registerKey` : touches de couleur, chiffres, ChannelUp/Down, etc.) | **Oui, mais seulement quand cimaise a le focus.** La touche ne parvient à l'app qu'au premier plan : elle ne peut pas *ramener* à cimaise depuis le Smart Hub ou Netflix. Utile comme raccourci *dans* cimaise (par exemple Rouge = Plex). Home, Retour, Volume et les touches dédiées (Netflix, Prime…) ne sont pas enregistrables. | Quasi nul (privilège `tv.inputdevice` déjà déclaré, quelques lignes de JS) | Liste réelle des touches avec `getSupportedKeys()` sur la Frame |
| 2 | **Position épinglée dans la barre du Smart Hub** (appui long sur la tuile cimaise → Déplacer, en première position) | **Oui**, réglage utilisateur officiel. Au mieux Home → OK (deux appuis), si le focus se pose sur la première tuile à l'ouverture de la barre. | Nul | Où se pose le focus quand on presse Home : première tuile, dernière app ou « Source » ? |
| 3 | **Autorun au démarrage** (« Exécution automatique de la dernière application », déjà retenu §2) | **Oui**, réglage officiel. Agit à l'allumage seulement, pas sur le bouton Home. | Nul | HANDOFF §11 Q5 : cimaise revient-il après le mode Art, et après une coupure de courant ? |
| 4 | **Home une seconde fois / Retour depuis le Smart Hub** | **Probable** : sur Tizen, la barre Home s'affiche *par-dessus* l'app courante. Un second Home ou Retour la referme et laisse cimaise au premier plan, si cimaise était l'app en cours et qu'elle est restée en mémoire (Q8). Ce n'est pas un « aller à cimaise » depuis une autre app, mais un retour quasi instantané si on a pressé Home par erreur. | Nul | Depuis cimaise : Home, puis Home (ou Retour) → cimaise revient-elle, et en combien de temps ? Même essai après avoir lancé Netflix depuis cimaise |
| 5 | **Lancement par le réseau via Home Assistant** (API Smart View de Samsung, `POST http://<TV>:8001/api/v2/applications/<appId>`, ou intégration `samsungtv` / `samsungtvws`) | **Plausible, non vérifié** pour une app installée en mode développeur. Si cela fonctionne, *n'importe quel* déclencheur devient un « bouton cimaise » : bouton Zigbee à côté de la télécommande, widget sur le téléphone, tag NFC, assistant vocal via HA. | Côté homelab seulement ; rien dans cimaise | Un seul appel depuis le PC (autorisation de l'appareil à accepter une fois à l'écran), puis Stéphane dit si cimaise s'ouvre |
| 6 | **Retour automatique via HA** (cimaise signale « masquée » ; après N s sans lancement volontaire, HA relance cimaise par la piste 5) | **Dépend de la piste 5.** Ressenti : Home → Smart Hub → cimaise revient seule après N s. HA ne voit pas les touches : N trop court gêne la navigation dans le Smart Hub (Q-B, choix de N : 3-5 s ou 15 s). | Environ 1 Ko de JS (événements ponctuels), pas de minuterie permanente ; une automatisation HA | La piste 5, puis vérifier que l'événement « masquée » part bien (persistance Q8) |
| 7 | **Bixby, à la voix** (« Ouvre cimaise ») | **Incertain** : Bixby TV ouvre les apps installées par leur nom, mais une app développeur n'est peut-être pas indexée. La disponibilité de Bixby en français sur ce modèle est aussi à confirmer. | Nul | Dire « Ouvre cimaise » au micro de la télécommande |
| 8 | **SmartThings : routine ou scène qui lance l'app** | **Incertain** : l'app SmartThings sait lancer des apps sur la TV, probablement celles du Store seulement. Une routine pourrait être déclenchée par un bouton SmartThings. | Nul (compte Samsung) | Dans l'app SmartThings : la fiche de la TV liste-t-elle cimaise parmi les apps lançables ? |
| 9 | **HDMI-CEC depuis un autre appareil** (par exemple un Raspberry Pi relié en HDMI) | **Non utile** : CEC sait allumer la TV, changer de source et envoyer des touches, mais pas lancer une app Tizen. Une suite de touches simulées (Home, flèches, OK) est fragile, car elle dépend de l'ordre de la barre. | Matériel en plus, fragile | — (écarté) |
| 10 | **Télécommande IR universelle, Flirc, touches dédiées** | **Non** : les codes IR ont une fonction fixe dans le firmware, et les touches Netflix, Prime, etc. ne sont pas réaffectables officiellement. | — | — (écarté) |

**Lecture d'ensemble.**
- Pour un vrai « bouton qui amène à cimaise » depuis n'importe où, la seule piste sérieuse est la
  **5** (bouton physique ou vocal via HA), éventuellement prolongée par la **6** (retour automatique).
  Les deux dépendent d'un test unique et inoffensif : la TV accepte-t-elle le lancement réseau d'une
  app développeur ?
- Sans homelab, le mieux qu'on puisse avoir : **2 + 3 + 4** (cimaise en tête de barre, autorun,
  retour par Home ou Retour), tous gratuits et officiels, à vérifier à la main.
- La **1** améliore l'usage *dans* cimaise, pas le retour à cimaise.

**Choix de la prochaine carte : à Stéphane.** Candidates : (a) test du lancement réseau (piste 5),
(b) essais manuels 2 + 3 + 4 + 7 + 8 consignés dans `docs/tv-status.md`, (c) raccourcis de touches
dans cimaise (piste 1).

### Piste 5 testée : lancement par le réseau (2026-10-31)

`POST http://<TV>:8001/api/v2/applications/cimaise001.Cimaise` (API Smart View, HTTP, sans jeton)
→ `true`, et **cimaise s'est ouverte à l'écran** (vu par Stéphane). L'API connaît l'app développeur
(`GET` → `running:false`, et ce champ ne bouge pas après l'ouverture : il n'est pas fiable). Une demande
d'autorisation au nom de « Home Assistant » s'est affichée au même moment ; Stéphane l'a acceptée.
Détails dans `docs/tv-status.md`.

**Conséquence** : un « bouton cimaise » externe est **faisable** sans code natif ni réglage système.
Il suffit d'un script ou d'une automatisation Home Assistant qui fait ce `POST` (ou le service de
l'intégration `samsungtv`), déclenché par un bouton Zigbee, un widget, un tag NFC ou la voix. La
piste 6 (retour automatique) devient elle aussi possible. À trancher par Stéphane pour la prochaine
carte : quel déclencheur (bouton physique, widget…), et s'il veut aussi le retour automatique,
avec quel délai N.

**Non prouvé à ce stade (piste 5)**, levé le 2026-11-07 (voir « Piste 5 prouvée dans les trois états ») : (1) le `POST` n'a été essayé que dans un seul état de la TV,
pas pendant que Netflix ou le Smart Hub est au premier plan ; c'est pourtant le cas d'usage du « bouton
cimaise ». (2) On ne sait pas si cimaise a été ouverte par l'appel du PC ou par Home Assistant, qui
s'est manifesté au même moment. Test proposé, avec l'accord de Stéphane : Netflix au premier plan,
puis le même `POST` depuis le PC, et il dit ce qu'il voit. Rappel : la piste 1 (touches) ne vaut que
quand cimaise a le focus ; la piste 5 ne dépend pas de cimaise ; la piste 6 demande environ 1 Ko de JS
dans cimaise, en plus de la 5.

### Piste 5 prouvée dans les trois états (2026-11-07)

Tests annoncés un par un, résultat dit par Stéphane (détails et réponses HTTP dans `docs/tv-status.md`).

| État de la TV avant l'appel | Déclencheur | Ce que Stéphane a vu | Délai ressenti | Autorisation à l'écran |
|---|---|---|---|---|
| Netflix au premier plan | `POST` Smart View depuis le PC | cimaise s'ouvre, **reprend son état** | < 2 s | Non |
| Smart Hub ouvert (après Home) | `POST` Smart View depuis le PC | cimaise s'ouvre, **reprend son état** | < 2 s | Non |
| cimaise déjà au premier plan | `POST` Smart View depuis le PC | **Rien** : même écran, même focus | — | Non |
| Netflix au premier plan | HA `media_player.play_media` (type `app`) | cimaise s'ouvre, **reprend son état**, après acceptation | < 2 s | **Oui**, « Home Assistant » |

**Conclusions.**
- **La piste 5 tient dans chaque état testé.** Depuis Netflix ou le Smart Hub, cimaise revient en
  moins de 2 s, sans repartir à froid (elle était restée en mémoire). Si elle est déjà affichée,
  l'appel ne fait rien : un appui en trop sur le « bouton cimaise » est sans effet, pas de relance.
- La réponse HTTP du `POST` arrive au bout d'environ 5,2 s, **après** l'affichage : un script ne doit
  pas attendre cette réponse pour enchaîner, et ne doit pas en déduire un succès.
- Le doute du 31/10 est levé : le `POST` du PC ouvre cimaise seul, sans autorisation. La demande
  « Home Assistant » vient de la connexion WebSocket de l'intégration `samsungtv_smart`.
- **Voie HA à retenir : `rest_command` (le même `POST` Smart View, HTTP, sans jeton)**, appelé par un
  script déclenché par le bouton. Raisons : aucune autorisation à l'écran, ne dépend ni du jeton
  WebSocket de l'intégration ni de son état, un seul appel. Le service natif
  `media_player.play_media` de `samsungtv_smart` (`media_content_type: app`,
  `media_content_id: cimaise001.Cimaise`) **fonctionne aussi**, mais il a fait apparaître une
  demande d'autorisation et n'a ouvert cimaise qu'après acceptation. Comme c'est déjà la deuxième
  fois (31/10, 07/11), il ne convient pas pour un bouton sans regarder l'écran tant qu'on ne sait pas
  pourquoi le jeton n'est pas conservé. L'intégration native `samsungtv` n'est pas utilisable en
  l'état : son entrée pour la Frame est « ignorée » dans HA.
- Exemple de configuration pour la carte qui créera le bouton (**rien n'a été créé dans HA**) :
  `rest_command: { cimaise: { url: "http://<IP de la Frame>:8001/api/v2/applications/cimaise001.Cimaise", method: post, timeout: 10 } }`.

### Détecter l'app au premier plan (TV Plus qui se lance tout seul)

- **HA ne le voit pas.** Avec TV Plus à l'écran, `media_player.samsung_the_frame` affiche
  `source`/`app_id` = `TV/HDMI`, exactement comme avec Netflix, le Smart Hub ou cimaise.
  `samsungtv_smart` n'a aucune liste d'apps configurée (`source_list` = `TV`, `HDMI`).
- **L'API Smart View non plus.** Les IDs de TV Plus relevés dans `0 applist`
  (`com.samsung.tv.tvPlusDeeplinker`, `com.samsung.tv.tvplus`) donnent 404 : l'API ne l'expose pas.
  Pour les apps qu'elle connaît, `visible` reste toujours à `false`, et `running` ne suit pas l'écran
  (`false` pour cimaise affichée, `true` pour Netflix, Plex et YouTube quelle que soit l'app à
  l'écran). Ajouter des apps à la liste de `samsungtv_smart` ne changerait donc rien, puisqu'il
  s'appuie sur ces mêmes champs (non testé).
- **Côté cimaise (non essayé, aucun changement de l'app) :** `tizen.application.getAppsContext()`
  liste les apps **en cours**, sans dire laquelle est au premier plan (le lanceur jetable du 31/10
  l'a montré : un contexte reste listé même sans fenêtre). Il ne suffit pas à dire « TV Plus est à
  l'écran ». Le signal fiable est celui de cimaise elle-même : `visibilitychange` / page masquée
  (piste 6). Croisé avec `getAppsContext()` (contexte TV Plus présent ou non), cimaise pourrait
  signaler à HA « masquée, et TV Plus tourne » : environ 1 Ko de JS, à décider.
- **Réponse : non, HA ne peut pas savoir aujourd'hui que TV Plus est au premier plan.** Pour relancer
  cimaise quand TV Plus prend la main, il faut que cimaise signale qu'elle est masquée (piste 6), puis
  que HA fasse le `rest_command` ci-dessus. Le fait que l'appel ne fasse rien quand cimaise est déjà
  affichée rend une relance « en trop » sans danger. Non testé : SmartThings, qui exposerait
  peut-être l'app au premier plan.

### Piste 6 codée : cimaise prévient HA quand elle est masquée (2026-11-08, commit d943598)

**Ce que fait l'app** (`packages/widgets/src/presence.ts`, branché dans `apps/tv/src/index.ts`) :
un seul écouteur `visibilitychange`, posé au démarrage, qui ne lit la config HA (`haUrl`, `haToken`
de `cimaise.v1`, pré-remplis par `.local/ha.env` au packaging) qu'au moment de l'événement. Sans
config, il n'envoie rien et ne lance aucune minuterie.

| Moment | Événement HA | `data` |
|---|---|---|
| page masquée (`document.hidden` → true) | `cimaise_hidden` | `{ at, seq: 0, tvplus, netflix, youtube, plex }` |
| ~3 s plus tard, si toujours masquée | `cimaise_hidden` | idem, `seq: 1` (TV Plus peut démarrer après le masquage) |
| page de nouveau visible | `cimaise_visible` | `{ at }` ; annule la salve `seq: 1` en attente |

- `at` : `Date.now()` de la TV (ms) ; HA ajoute son propre `time_fired`.
- `tvplus` / `netflix` / `youtube` / `plex` : booléens tirés de `tizen.application.getAppsContext()`
  (apps **en cours**, pas « au premier plan »), par motif d'ID relevé dans l'applist de la Frame :
  `^com.samsung.tv.tvplus` (couvre `tvPlusDeeplinker` et `tvplus`), `netflix`, `youtube$|.cobalt-yt$`,
  `.plex$`. `null` si `getAppsContext` est absent, lève (aperçu navigateur) ou appelle son rappel d'erreur : « inconnu », jamais `false`.
- **Transport : XHR asynchrone (`POST /api/events/<type>`, en-tête `Authorization: Bearer`, délai 2 s),
  pas `sendBeacon`.** `sendBeacon` ne peut pas poser d'en-tête `Authorization`, et HA n'accepte pas le
  jeton en paramètre d'URL pour `/api/events` : il est inutilisable ici. Le XHR synchrone est écarté
  aussi : HA éteint ou injoignable bloquerait la page pendant tout le délai de connexion.
  Contrepartie : si Tizen gèle la page dès qu'elle est masquée, le XHR asynchrone (et le rappel de
  `getAppsContext`) ne partent pas. C'est ce que la mesure ci-dessous doit trancher.
- Coût : +1 320 o sur `app.js` minifié (47 365 → 48 685 o). Une minuterie ponctuelle de 3 s,
  injectée par l'app (le package `widgets` reste sans minuterie), aucune minuterie permanente.

**Mesure sur la Frame : en cours.** Protocole : écoute de `cimaise_hidden` et `cimaise_visible` dans
HA (Outils de développement → Événements, et un abonnement WebSocket en lecture seule côté PC), puis
(1) Home → Smart Hub sans rien lancer, (2) Home → TV Plus lancé à la main, (3) retour à cimaise.
Pour chaque cas : seq 0 et seq 1 reçus ou non, et valeurs de `tvplus`, `netflix`, `youtube`, `plex`.
