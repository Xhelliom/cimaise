# Bouton Home natif — étude (HANDOFF §9)

> **Exploration, recherche seulement.** Ce document conclut sans rien écrire sur la TV.
> Aucune action n'a été exécutée sur la Frame. Les vérifications proposées (§6) sont en
> **lecture seule** et destinées à l'orchestrateur, avec l'accord de Stéphane — pas à l'agent.

## La question

CleanFrame sait faire de son launcher la cible du bouton Home sur une Frame 2024 (Tizen 9).
Peut-on faire pareil pour que le bouton Home de la télécommande ouvre **cimaise** sur la Frame
2019 (LS03R, Tizen 5.0), dans les limites du §9 (pas de root, pas d'exploit, pas de
modification de la politique de sécurité) ? Et sinon, quelles voies officielles restent ?

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

**Conclusion de faisabilité :** réassigner le Home vers cimaise sur la Frame 2019 **dans les
limites du §9 est impossible aujourd'hui**. La seule méthode connue (CleanFrame) passe par un
exploit interdit, exige un runtime .NET probablement absent, et n'a **jamais** été testée sur
Tizen 5 (CleanFrame lui-même note « Not tested » pour la Frame 2019 QE55LS03R).

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
4. **Lecture seule optionnelle** : si Stéphane veut lever le doute sur le runtime .NET et l'état
   des réglages Home de *sa* TV, l'orchestrateur peut exécuter les commandes du §6 (reads only),
   avec son accord. Résultat attendu : confirmer qu'il n'y a pas de voie propre, et classer la
   question.

### Questions qui appartiennent à Stéphane (à trancher, pas décidées ici)

- **Q-A.** Accepte-t-il de clore définitivement la piste « bouton Home » (recommandé), ou veut-il
  d'abord la lecture seule du §6 pour objectiver l'absence de runtime/API ?
- **Q-B.** Le couple « autorun + réouverture arrière-plan » est-il un ressenti suffisant, ou
  faut-il investiguer une piste **hors app** (par ex. piloter la TV depuis Home Assistant, HANDOFF §7) ?

## Vérifications en lecture seule proposées (orchestrateur + accord de Stéphane)

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
