#!/usr/bin/env bash
# Tente de relire sur la TV le JSON de la sonde formats (localStorage, clé cimaise.probe.v1). Lecture seule.
# Meilleur effort, NON VÉRIFIÉ sur la TV : le stockage web d'une app Tizen n'est pas toujours lisible par sdb (TV de série, shell restreint).
# Si rien n'est trouvé, la sonde affiche la même chose à l'écran en ligne compacte (« id=OK id=KO:code … ») : la photographier.
# Usage : read-probe.sh [app-id]   (sinon APP_ID de .local/tizen.env)
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
load_env
require_vars TV_IP
ID="${1:-${APP_ID:-}}"
[ -n "$ID" ] || die "APP_ID absent"
out="$(sdb_session '
  pkg="${1%%.*}"
  dir="/opt/usr/home/owner/apps_rw/$pkg"
  sdb -s "$T" shell "find $dir -type f \( -iname \"*localstorage*\" -o -iname \"*.ldb\" -o -iname \"*.log\" \) 2>/dev/null" |
  tr -d "\r" | while read -r f; do
    [ -n "$f" ] && sdb -s "$T" shell "cat \"$f\"" 2>/dev/null | strings | grep -o "{\"v\":1,\"at\":[0-9]*,\"results\":\[[^]]*\]}" || true
  done | tail -n 1
' "$ID")"
if [ -n "$out" ]; then
  printf '%s\n' "$out"
else
  echo "Rien de lisible via sdb (normal sur une TV de série)." >&2
  echo "Relever la ligne compacte affichée au bas de l'écran « Sonde formats » (diagnostic : touche 0, puis 1) et la photographier." >&2
  exit 1
fi
