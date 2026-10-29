# Bilan — sous-titres et pistes audio (Plex)

## Fait
- SRT interne (setSelectTrack) et externe (setExternalSubtitlePath, rendu maison via onsubtitlechange, bas d'écran, sans flou).
- PGS/ASS/VobSub : transcodage avec sous-titres incrustés.
- Menu des pistes (Haut), langues par défaut dans Réglages, choix retenu par série, forcés automatiques.
- Correctif de cette passe : un refus de setExternalSubtitlePath pendant open() (mode encore « loading ») est mémorisé (`extFailed`) ; en mode externe après échec, aucune piste TEXT n'est choisie (plus de sous-titres internes par erreur) et « Sous-titres indisponibles » s'affiche au démarrage de la lecture. Test ajouté (fichier avec piste interne + refus). `npm run check` vert (403 tests).

## Non fait
- Rien de connu. Rendu réel sur la TV non vérifié (aucun accès TV ici).
