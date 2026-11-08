#!/usr/bin/env bash
# Enregistre le profil de signature (certificats auteur + distributeur) dans .local/tizen-studio-data.
# À lancer une fois après avoir créé les certificats.
# Frame (défaut) : `tizen security-profiles add`, certificats Samsung, profil « cimaise » (actif).
# CIMAISE_TV=tv2 : ajoute le profil de .local/tizen.env.tv2 (« cimaise-tv2 ») directement dans profiles.xml,
# sans changer le profil actif ni le profil « cimaise » (voir add-profile.mjs).
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
load_env
require_vars SIGN_PROFILE AUTHOR_CERT AUTHOR_PASSWORD DISTRIBUTOR_CERT DISTRIBUTOR_PASSWORD
if [ "${CIMAISE_TV:-}" = tv2 ]; then
  mkdir -p "$LOCAL_DIR/tizen-studio-data/profile"
  # Les mots de passe sont lus dans l'environnement (chargé par load_env), jamais passés en argument.
  node "$TIZEN_SCRIPTS_DIR/add-profile.mjs" "$LOCAL_DIR/tizen-studio-data/profile/profiles.xml"
  run_in_container tizen security-profiles list
  exit 0
fi
# Les mots de passe restent dans l'environnement du conteneur ; `bash -c` les lit
# là-bas pour qu'ils n'apparaissent ni dans nos logs ni dans notre ligne de commande.
run_in_container bash -c '
  tizen security-profiles remove -n "$SIGN_PROFILE" >/dev/null 2>&1 || true
  tizen security-profiles add -n "$SIGN_PROFILE" \
    -a "$AUTHOR_CERT" -p "$AUTHOR_PASSWORD" \
    -d "$DISTRIBUTOR_CERT" -dp "$DISTRIBUTOR_PASSWORD"
  tizen security-profiles list
'
