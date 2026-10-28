#!/usr/bin/env bash
# Exécute une commande sdb sur la TV configurée, après `sdb connect`, dans le même conteneur.
# Usage : sdb-tv.sh devices | capability | shell 0 … (la cible -s IP:port est ajoutée)
# Ne pas utiliser `scripts/tizen/sdb connect` seul : la connexion meurt avec le conteneur.
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
load_env
require_vars TV_IP
sdb_session 'case "$1" in devices) sdb devices;; *) sdb -s "$T" "$@";; esac' "$@"
