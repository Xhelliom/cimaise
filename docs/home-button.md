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

**Non prouvé à ce stade (piste 5)** : (1) le `POST` n'a été essayé que dans un seul état de la TV,
pas pendant que Netflix ou le Smart Hub est au premier plan ; c'est pourtant le cas d'usage du « bouton
cimaise ». (2) On ne sait pas si cimaise a été ouverte par l'appel du PC ou par Home Assistant, qui
s'est manifesté au même moment. Test proposé, avec l'accord de Stéphane : Netflix au premier plan,
puis le même `POST` depuis le PC, et il dit ce qu'il voit. Rappel : la piste 1 (touches) ne vaut que
quand cimaise a le focus ; la piste 5 ne dépend pas de cimaise ; la piste 6 demande environ 1 Ko de JS
dans cimaise, en plus de la 5.
