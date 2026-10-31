# Bilan — Firefox + xdg-utils dans l'image Tizen

Fait :
- `scripts/tizen/docker/Dockerfile` : xdg-utils + Firefox du dépôt APT Mozilla (clé signée, `signed-by`, priorité 1000 contre le renvoi snap d'Ubuntu), `ENV BROWSER=firefox`, bac à sable non touché, et **`USER tizen` en dernière instruction** (l'image dérivée manuelle tournait en root).
- `docs/m1-procedure.md` §5 : connexion dans le Firefox de noVNC, avertissement de bac à sable attendu, BindException 4794 (fermer et relancer), rappel USER tizen.
- `scripts/tizen/test.sh` : 3 contrôles statiques du Dockerfile (Mozilla signé + xdg-utils, pas de désactivation du sandbox, dernier USER = tizen).
- `npm run check` : vert (728 tests).

Non fait / non testé : la construction réelle de l'image (réseau + Docker) et l'ouverture effective de Firefox dans noVNC n'ont pas été exécutées ici ; à vérifier par `build-image.sh` puis `cert-manager.sh`.
La cause racine est bien l'absence de xdg-open/navigateur dans l'image ; la BindException n'en est qu'une conséquence (serveur de rappel resté ouvert), documentée sans changement de code.
