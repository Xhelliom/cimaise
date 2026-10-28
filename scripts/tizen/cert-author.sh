#!/usr/bin/env bash
# Génère le certificat auteur (CLI). Le mot de passe est lu dans l'environnement du
# conteneur (AUTHOR_PASSWORD de .local/tizen.env) : ni argument, ni historique, ni log.
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
load_env
require_vars AUTHOR_PASSWORD
run_in_container bash -c 'tizen certificate -a cimaise -p "$AUTHOR_PASSWORD" -f author'
