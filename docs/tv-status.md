# État de NOTRE TV (Samsung The Frame 2019, LS03R, Tizen 5.0)

Modèle exact et firmware : à relever en M0.

## Observé physiquement

Ce qui a été vu à l'écran ou constaté sur la TV.

_(rien pour l'instant)_

## Réponse du SDK

Ce que `sdb`, le packager ou le SDK ont répondu. Ne prouve pas un succès visible.

_(rien pour l'instant)_

## Non testé

Hypothèses et points à vérifier (voir HANDOFF §11).

- Modèle exact, firmware, version du moteur web
- `required_version` minimal accepté
- Codecs, HDR, pistes et sous-titres sous AVPlay
- HTTPS auto-signé (phase 2)
- Autorun après le mode Art et après coupure de courant
- Persistance de l'app en arrière-plan

- **Sous-titres et pistes (lecteur Plex)** : rendu maison des sous-titres, SRT externe par `setExternalSubtitlePath`, menu des pistes, relance du flux au changement de piste, langues par défaut : **non testé sur la TV**, uniquement avec faux AVPlay (voir `docs/decisions.md`, « Sous-titres et pistes audio »).
