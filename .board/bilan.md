Issue : codé

Fait (tests et documentation, aucun code de l'app modifié, rien d'écrit dans HA ni sur la TV) :
- HA en lecture : la Frame est gérée par `samsungtv_smart` (custom, ollo69 v0.14.5), entité `media_player.samsung_the_frame` ; l'entrée native `samsungtv` de la Frame est ignorée.
- `POST` Smart View testé dans les 3 états, vu par Stéphane : depuis Netflix ou le Smart Hub, cimaise revient en < 2 s en reprenant son état ; si cimaise est déjà affichée, rien ne se passe. Pas d'autorisation demandée.
- Un appel HA `media_player.play_media` (type app) : cimaise s'ouvre (< 2 s), mais seulement après qu'une demande d'autorisation « Home Assistant » a été acceptée → voie retenue : `rest_command` (le POST Smart View).
- TV Plus au premier plan : HA affiche `TV/HDMI` comme partout ailleurs ; l'API Smart View renvoie 404 pour TV Plus ; `running`/`visible` non fiables (confirmé). HA ne peut pas savoir que TV Plus est à l'écran ; il faudrait que cimaise signale qu'elle est masquée (piste 6).
- Consigné dans docs/tv-status.md (observé / réponses HTTP / non testé) et conclu dans docs/home-button.md.

Pas fait (hors périmètre de cette carte) : création du `rest_command` dans HA, test du POST lancé depuis HA lui-même, mode Art / veille, SmartThings, `getAppsContext()` (simple analyse, l'app n'a pas été modifiée).
