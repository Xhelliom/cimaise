# Bilan — Certificate Manager dans un navigateur (mode web)

**Fait**
- `cert-manager.sh` : mode web (Xvfb 1600×1000, openbox, x11vnc, noVNC), défaut sans `DISPLAY`, URL + mot de passe aléatoire affichés une fois (commits af5cad3, fdfa66e).
- Vérification réelle dans un Chromium headless sur la VM : mot de passe saisi dans la page noVNC, fenêtre Certificate Manager visible, clic sur « + » jusqu'au choix Tizen / Samsung. Capture du navigateur : `.board/captures/certificate-manager-novnc.png`.
- `docs/m1-procedure.md` §5 corrigé (DISPLAY limité au mode hôte, navigateur Samsung « non testé », résultat du run navigateur) ; `docs/decisions.md` : mot de passe VNC visible via `docker inspect` pendant l'exécution, accepté sur la VM.

**Pas fait**
- Choix Samsung et suite, connexion au compte Samsung, création des certificats : volontairement non faits (compte de Stéphane). Les certificats vers `.local/certs/` restent non vérifiés de bout en bout.
- Pas vu par Stéphane dans son propre navigateur.
- Détail noté : le bandeau « Password is required » reste affiché avec `autoconnect=1`.
