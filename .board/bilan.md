Issue : partiel

Fait (commit d943598) :
- cimaise envoie à Home Assistant `cimaise_hidden` (seq 0 au masquage, seq 1 ~3 s plus tard si toujours masquée) et `cimaise_visible` au retour, avec tvplus/netflix/youtube/plex tirés de getAppsContext (motifs d'ID relevés sur la Frame).
- XHR asynchrone avec en-tête Authorization, pas sendBeacon (il ne peut pas porter ce jeton). Sans config HA : rien, aucune minuterie.
- Coût : +1 320 o sur app.js minifié ; une minuterie ponctuelle de 3 s, injectée par l'app ; aucune minuterie permanente.
- 6 tests unitaires (tests/presence.test.mjs) ; npm run check : 804/804.
- Format, choix du transport et protocole consignés dans docs/home-button.md (« Piste 6 codée »).

Pas fait :
- Vérification sur la Frame (critères 1 et 2) : l'image Docker du SDK Tizen avait disparu de la machine, sa reconstruction (téléchargement des paquets Samsung) bloque l'empaquetage et l'installation. Rien n'est encore installé : on ne sait donc pas si seq 0 et seq 1 partent une fois la page masquée, ni si tvplus est juste.
