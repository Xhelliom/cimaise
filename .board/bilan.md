# Bilan — Certificate Manager dans un navigateur

**Fait**
- Mode web par défaut sans DISPLAY (ou `--web`) : Xvfb 1600×1000 + openbox + x11vnc + noVNC, URL par IP et mot de passe aléatoire affiché une fois ; certificats toujours rangés dans `.local/certs/` ; `docs/m1-procedure.md` §5 à jour ; capture noVNC dans `.board/captures/`.
- Correctif 1 : `web-session.sh` n'écrit plus le mot de passe VNC en argument (`x11vnc -storepasswd` retiré) ; `printf` (builtin) → fichier 0600 → `-passwdfile`. Test ajouté dans `test.sh` (aucune commande ne reçoit `CIMAISE_VNC_PW`, pas de `-storepasswd`/`-rfbauth`).
- Correctif 2 : le Certificate Manager est lancé depuis un répertoire temporaire (mode web et mode hôte), donc plus de `workspace/` Eclipse dans le dépôt ; le `workspace/` parasite est supprimé. Tests ajoutés.
- Correctif 3 : mode `--neko` retiré (cert-manager.sh, test.sh, README, m1-procedure §5, decisions.md). Hors carte ; à proposer en carte séparée si voulu.
- `npm run check` : vert (150 tests, 0 échec).

**Non fait / limites**
- Le correctif `-passwdfile` et le `cd` temporaire sont vérifiés par tests statiques (docker simulé) ; non rejoués dans un vrai conteneur après coup.
- Connexion au compte Samsung et création réelle des certificats : non testées (c'est à Stéphane de les faire).
