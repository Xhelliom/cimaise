# Bilan

**Fait** : coches « vu », barre de progression, saison et épisode à suivre présélectionnés, mise à jour au retour de lecture (4f7e26f). Correctif : `home.ts` ne transmet l'épisode comme focus que depuis « En cours » ; « Ajoutés récemment » ouvre la série sans focus, la fiche choisit l'épisode à suivre (OnDeck, sinon premier non vu, sinon S1 E1).

**Test** : `tests/plex-ui.test.mjs` — accueil, les deux entrées (En cours → épisode transmis ; Ajoutés récemment → OnDeck de la série).

**Reste** : rien.
