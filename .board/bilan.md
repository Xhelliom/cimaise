# Bilan — Certificate Manager en mode web

## Fait
- Relancé pour de vrai, sur le code de fdfa66e : `env -u DISPLAY scripts/tizen/cert-manager.sh --port 6081` (conteneur cimaise-tizen:5.6). URL + mot de passe affichés, fenêtre « Tizen Certificate Manager » visible sur Xvfb 1600×1000.
- Authentification vérifiée via websockify (chemin noVNC) avec un client RFB scripté : mauvais mot de passe refusé (SecurityResult=1), bon mot de passe accepté.
- Capture `.board/captures/certificate-manager-novnc.png` refaite depuis cette session VNC (1600×1000).
- Aucun `workspace/` dans le dépôt après coup ; conteneur arrêté (le mien uniquement).
- `docs/m1-procedure.md` §5 : ne dit plus « observé par Stéphane », liste ce qui a été vérifié, quand, comment, et ce qui ne l'est pas ; « bureau gris » corrigé en « fond noir ».

## Non fait / pourquoi
- Pas ouvert dans un vrai navigateur : le Chrome de l'agent n'atteint pas la VM (page d'erreur sur localhost et sur l'IP LAN). Le client scripté suit le même chemin websocket + RFB, mais le rendu noVNC lui-même n'est pas vérifié.
- Clics dans la fenêtre, connexion Samsung et création de certificats non testés (compte Samsung : jamais touché).
