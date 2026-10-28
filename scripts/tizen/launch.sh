#!/usr/bin/env bash
# Lance APP_ID (ou l'ID donné en argument) sur la TV. Usage : launch.sh [app-id]
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
load_env
require_vars TV_IP
ID="${1:-${APP_ID:-}}"
[ -n "$ID" ] || die "APP_ID absent"
sdb_connect >/dev/null
run_in_container sdb -s "$(tv_target)" shell 0 was_execute "$ID"
echo "Commande envoyée. Regarder la TV : le SDK ne prouve pas que l'app s'affiche."
