#!/usr/bin/env bash
# Génère le certificat auteur (CLI) puis le copie dans .local/certs/author.p12 (AUTHOR_CERT).
# Le mot de passe est lu dans .local/tizen.env : il n'apparaît ni sur la ligne de commande
# de l'hôte, ni dans l'historique du shell, ni dans les logs. Dans le conteneur, `tizen`
# le reçoit via -p (visible par `ps` dans le conteneur, donc depuis l'hôte).
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
load_env
require_vars AUTHOR_PASSWORD
run_in_container bash -c '
  tizen certificate -a cimaise -p "$AUTHOR_PASSWORD" -f author
  mkdir -p /work/.local/certs
  cp "$HOME/tizen-studio-data/keystore/author/author.p12" /work/.local/certs/author.p12
  chmod 600 /work/.local/certs/author.p12'
