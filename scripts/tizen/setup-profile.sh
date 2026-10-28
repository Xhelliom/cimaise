#!/usr/bin/env bash
# Enregistre le profil de signature (certificats auteur + distributeur Samsung)
# dans .local/tizen-studio-data. À lancer une fois après avoir créé les certificats.
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
load_env
require_vars SIGN_PROFILE AUTHOR_CERT AUTHOR_PASSWORD DISTRIBUTOR_CERT DISTRIBUTOR_PASSWORD
# Les mots de passe restent dans l'environnement du conteneur ; `bash -c` les lit
# là-bas pour qu'ils n'apparaissent ni dans nos logs ni dans notre ligne de commande.
run_in_container bash -c '
  tizen security-profiles remove -n "$SIGN_PROFILE" >/dev/null 2>&1 || true
  tizen security-profiles add -n "$SIGN_PROFILE" \
    -a "$AUTHOR_CERT" -p "$AUTHOR_PASSWORD" \
    -d "$DISTRIBUTOR_CERT" -dp "$DISTRIBUTOR_PASSWORD"
  tizen security-profiles list
'
