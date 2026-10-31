# Bilan — Firefox + xdg-utils dans l'image Tizen

Fait :
- `scripts/tizen/docker/Dockerfile` : xdg-utils + Firefox du dépôt APT Mozilla (clé signée, `signed-by`, priorité 1000 contre le renvoi snap d'Ubuntu), `ENV BROWSER=firefox`, bac à sable non touché, et **`USER tizen` en dernière instruction** (l'image dérivée manuelle tournait en root).
- `docs/m1-procedure.md` §5 : connexion dans le Firefox de noVNC, avertissement de bac à sable attendu, BindException 4794 (fermer et relancer), rappel USER tizen.
- `scripts/tizen/test.sh` : 3 contrôles statiques du Dockerfile (Mozilla signé + xdg-utils, pas de désactivation du sandbox, dernier USER = tizen).
- `npm run check` : vert (728 tests).

Non fait / non testé : la construction réelle de l'image (réseau + Docker) et l'ouverture effective de Firefox dans noVNC n'ont pas été exécutées ici ; à vérifier par `build-image.sh` puis `cert-manager.sh`.
La cause racine est bien l'absence de xdg-open/navigateur dans l'image ; la BindException n'en est qu'une conséquence (serveur de rappel resté ouvert), documentée sans changement de code.

## Vérification réelle (2026-10-31)
- `scripts/tizen/build-image.sh` : image reconstruite (`cimaise-tizen:5.6`, id 8c4272b0a143, ≠ e0d54cad de l'ancienne).
- Dans l'image : `whoami` = tizen, `firefox --version` = Mozilla Firefox 159.0 (+ avertissement « Sandbox: CanCreateUserNamespace() clone() failure: EPERM », sandbox non désactivé), `xdg-open` = /usr/bin/xdg-open, `BROWSER=firefox`.
- `env -u DISPLAY scripts/tizen/cert-manager.sh --port 6082` : Certificate Manager affiché sur :77 ; `docker exec -u tizen -e DISPLAY=:77 <conteneur> xdg-open https://example.org` → une fenêtre « Example Domain — Mozilla Firefox » s'ouvre à côté du Certificate Manager (capture X du Xvfb : `.board/captures/xdg-open-firefox-novnc.png`, prise avec xwd installé temporairement dans le conteneur, pas dans l'image).
- Non testé : le clic réel sur la connexion Samsung (pas d'identifiants) ; la visualisation dans le navigateur de Stéphane.
