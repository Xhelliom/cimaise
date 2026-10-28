#!/usr/bin/env bash
# Ouvre le Certificate Manager de Tizen Studio (extension Samsung) sur l'affichage de l'hôte,
# via X11 ou XWayland (DISPLAY). Stéphane s'y connecte lui-même à son compte Samsung :
# ce script ne saisit ni identifiant ni mot de passe.
# À la fermeture, les .p12 créés sont rangés dans .local/certs/ (author.p12, distributor.p12).
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

[ -n "${DISPLAY:-}" ] || die "DISPLAY absent : lancer ce script depuis une session graphique (sous Wayland il faut XWayland ; sur NixOS : programs.xwayland.enable, ou xwayland-satellite)"
[ -d /tmp/.X11-unix ] || die "/tmp/.X11-unix absent : aucun serveur X11/XWayland à joindre"

mkdir -p "$LOCAL_DIR/certs" "$LOCAL_DIR/SamsungCertificate"
# Le conteneur partage le réseau et le nom de l'hôte (les entrées Xauthority sont par nom d'hôte).
DOCKER_RUN_EXTRA=(--hostname "$(hostname)" -e "DISPLAY=$DISPLAY" -e GDK_BACKEND=x11
  -e "GTK_THEME=Adwaita" -v /tmp/.X11-unix:/tmp/.X11-unix:ro
  -v "$LOCAL_DIR/SamsungCertificate:/home/tizen/SamsungCertificate")
if [ -n "${XAUTHORITY:-}" ] && [ -f "$XAUTHORITY" ]; then
  DOCKER_RUN_EXTRA+=(-e XAUTHORITY=/tmp/.Xauthority -v "$XAUTHORITY:/tmp/.Xauthority:ro")
elif [ -f "$HOME/.Xauthority" ]; then
  DOCKER_RUN_EXTRA+=(-e XAUTHORITY=/tmp/.Xauthority -v "$HOME/.Xauthority:/tmp/.Xauthority:ro")
fi

echo "Ouverture du Certificate Manager sur $DISPLAY… (fermer la fenêtre pour terminer)" >&2
run_in_container /home/tizen/tizen-studio/tools/certificate-manager/certificate-manager || \
  echo "avertissement : le Certificate Manager s'est terminé avec une erreur" >&2

# Rangement dans .local/certs/ : on ne copie que ce qui manque, sans jamais écraser.
# cert-add-on range author.p12 / distributor.p12 dans ~/SamsungCertificate/<profil>/ (monté sur .local/) ;
# le keystore du SDK sert de repli.
SC="$LOCAL_DIR/SamsungCertificate"
KS="$LOCAL_DIR/tizen-studio-data/keystore"
copy_new() { # $1 = fichier source, $2 = nom cible
  [ -f "$1" ] && [ ! -e "$LOCAL_DIR/certs/$2" ] || return 0
  cp "$1" "$LOCAL_DIR/certs/$2" && chmod 600 "$LOCAL_DIR/certs/$2" && echo "copié : .local/certs/$2" >&2
}
if [ -d "$SC" ] || [ -d "$KS" ]; then
  dist="$(find "$SC" "$KS" -name '*distributor*.p12' -print 2>/dev/null | head -n1 || true)"
  auth="$(find "$SC" "$KS" -name '*.p12' ! -name '*distributor*' -print 2>/dev/null | head -n1 || true)"
  [ -n "$auth" ] && copy_new "$auth" author.p12
  [ -n "$dist" ] && copy_new "$dist" distributor.p12
fi
for f in author.p12 distributor.p12; do
  [ -f "$LOCAL_DIR/certs/$f" ] || echo "à faire : .local/certs/$f absent (le créer dans le Certificate Manager ; cert-add-on range par défaut dans ~/SamsungCertificate/<profil>/, monté sur .local/SamsungCertificate)" >&2
done
exit 0
