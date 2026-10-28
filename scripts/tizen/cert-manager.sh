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

# Rangement dans .local/certs/.
# cert-add-on range author.p12 / distributor.p12 dans ~/SamsungCertificate/<profil>/ (monté sur .local/).
# Pour une TV Samsung, auteur et distributeur doivent venir du MÊME profil Samsung : si un profil
# contient les deux, cette paire prime sur tout author.p12 déjà présent (typiquement l'auteur Tizen
# de cert-author.sh, inutilisable avec un distributeur Samsung). L'ancien fichier, s'il diffère,
# est sauvegardé en author.cli.p12 (distributor.old.p12 pour le distributeur), jamais écrasé en silence.
SC="$LOCAL_DIR/SamsungCertificate"
KS="$LOCAL_DIR/tizen-studio-data/keystore"
CERTS="$LOCAL_DIR/certs"
install_cert() { # $1 = source, $2 = nom cible, $3 = nom de sauvegarde si la cible diffère
  if [ -e "$CERTS/$2" ]; then
    cmp -s "$1" "$CERTS/$2" && return 0
    local bak="$CERTS/$3"; [ -e "$bak" ] && bak="$bak.$(date +%s)"
    mv "$CERTS/$2" "$bak" && chmod 600 "$bak" && echo "sauvegardé : .local/certs/$2 → ${bak#"$LOCAL_DIR/"} (ne va pas avec le profil Samsung)" >&2
  fi
  cp "$1" "$CERTS/$2" && chmod 600 "$CERTS/$2" && echo "copié : .local/certs/$2" >&2
}
pair=""
if [ -d "$SC" ]; then
  while IFS= read -r d; do
    if [ -f "$d/author.p12" ] && [ -f "$d/distributor.p12" ]; then pair="$d"; break; fi
  done < <(find "$SC" -mindepth 1 -maxdepth 2 -type d -print 2>/dev/null | sort)
fi
if [ -n "$pair" ]; then
  install_cert "$pair/author.p12" author.p12 author.cli.p12
  install_cert "$pair/distributor.p12" distributor.p12 distributor.old.p12
elif [ -d "$KS" ] && ! find "$SC" -name '*distributor*.p12' 2>/dev/null | grep -q .; then
  # Pas de profil Samsung : repli sur le keystore du SDK, en ne copiant que ce qui manque.
  for name in author distributor; do
    src="$(find "$KS" -name "*$name*.p12" -print 2>/dev/null | head -n1 || true)"
    [ -n "$src" ] && [ ! -e "$CERTS/$name.p12" ] && install_cert "$src" "$name.p12" "$name.old.p12"
  done
elif [ -d "$SC" ]; then
  echo "avertissement : aucun profil Samsung complet (author.p12 + distributor.p12 dans le même dossier) sous .local/SamsungCertificate/ ; rien copié" >&2
fi
for f in author.p12 distributor.p12; do
  [ -f "$LOCAL_DIR/certs/$f" ] || echo "à faire : .local/certs/$f absent (le créer dans le Certificate Manager ; cert-add-on range par défaut dans ~/SamsungCertificate/<profil>/, monté sur .local/SamsungCertificate)" >&2
done
exit 0
