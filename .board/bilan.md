# Bilan — Certificate Manager dans un navigateur

## Fait
- `scripts/tizen/cert-manager.sh` : sans `DISPLAY` (ou `--web`) → mode web ; `--port N` / `CIMAISE_WEB_PORT` (6080 par défaut).
  Affiche une URL par IP de la VM (LAN, Tailscale) et un mot de passe VNC de 8 caractères tiré au hasard à chaque lancement, affiché une fois
  (passé au conteneur par l'environnement, jamais en argument, jamais écrit).
- `scripts/tizen/web-session.sh` (dans le conteneur) : Xvfb 1600×1000 + openbox + x11vnc (localhost) + noVNC/websockify, puis le Certificate Manager.
- `--neko` : affiche la fenêtre sur le X de neko (`DISPLAY=:99`). Vérifié : neko est en `--network host`, son Xorg accepte sans Xauthority le socket
  abstrait `@/tmp/.X11-unix/X99` (`xdotool getdisplaygeometry` → 1920×1080 depuis un conteneur jetable). Neko non touché. Détail dans `docs/decisions.md`.
- Dockerfile : + xvfb, openbox, x11vnc, novnc, websockify (image reconstruite).
- `docs/m1-procedure.md` §5 et `docs/decisions.md` mis à jour. Certificats toujours rangés dans `.local/certs/`.
- Tests : `scripts/tizen/test.sh` (mode web, URL, mot de passe 8 caractères, différent à chaque lancement, absent de la ligne docker ; `--neko`).

## Vérifié en réel
- Mode web lancé pour de bon : noVNC répond (HTTP 200), Stéphane a ouvert l'URL, saisi le mot de passe et confirmé « c'est bon » (fenêtre utilisable).

## Pas fait
- **Capture d'écran non publiée** : mon navigateur headless n'a pas pu naviguer, l'image n'a pas d'outil de capture (xwd/import) et le Chrome de Stéphane n'est pas pilotable
  vers la VM. Aucun fichier dans `.board/captures/`. À fournir par Stéphane (capture de la page noVNC) si elle est exigée.
- `--neko` : logique testée avec un faux docker et l'accès X vérifié ; l'ouverture réelle de la fenêtre dans neko n'a pas été essayée.
- Connexion au compte Samsung : non faite (réservée à Stéphane).
