# Bilan
Fait :
- Dockerfile (scripts/tizen/docker) : commentaire corrigé (l'image embarque Xvfb/openbox/x11vnc/noVNC pour le Certificate Manager).
- test.sh : les cas 8 bis (partie X11) et 8 ter sont sautés avec un message « skip » quand /tmp/.X11-unix est absent ; test.sh vérifié des deux façons (présent : tout vert ; absent simulé : skip + tout vert).
Cause : cert-manager.sh (mode hôte) refuse à raison sans /tmp/.X11-unix ; c'est le test qui supposait un serveur X sur la machine.
Non fait : rien.
