Issue : codé

Fait :
- `CIMAISE_TV=tv2` (lu par scripts/tizen/lib.sh) → `.local/tizen.env.tv2`, paquets dans `dist/tv2/`, ligne « cible : TV2 » affichée ; toute autre valeur refusée ; profil `cimaise` refusé pour TV2.
- package.sh : `REQUIRED_VERSION` (4.0 pour TV2, exigée) écrit dans la copie empaquetée seulement ; apps/tv/config.xml inchangé.
- install.sh : n'installe que les paquets du dossier de sa cible (pas d'installation croisée Frame/TV2). launch.sh et list-apps.sh suivent la cible.
- setup-profile.sh + add-profile.mjs : ajoute `cimaise-tv2` à profiles.xml sans toucher au profil actif ni au profil `cimaise` (sauvegarde profiles.xml.avant-cimaise-tv2).
- .local/tizen.env.tv2 réécrit (ancien gardé en tizen.env.tv2.avant-2026-11-08) ; modèle scripts/tizen/tizen.env.tv2.example ; README des scripts à jour ; 26 tests ajoutés à test.sh (tout vert).
- Vérifié : package + install + launch sur TV2, Stéphane voit l'accueil cimaise et la télécommande répond. Paquet Frame refait (non installé) : empreintes auteur/distributeur identiques au paquet Samsung du 30/10, required_version 5.0.

Pas fait : rien de ce qui était demandé. Non testé sur TV2 : lancement d'apps natives, Plex/AVPlay, Home Assistant (certificat public Tizen).
