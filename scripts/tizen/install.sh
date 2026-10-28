#!/usr/bin/env bash
# Installe un .wgt sur la TV puis vérifie que l'app y figure.
# Ne conclut JAMAIS au succès sur la seule réponse du SDK : le script exige
# « install completed » ET la présence de APP_ID dans la liste ; Stéphane confirme à l'écran.
# Usage : install.sh [fichier.wgt]
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
load_env
require_vars TV_IP APP_ID
WGT="${1:-$(ls -t "$REPO_ROOT"/dist/*.wgt 2>/dev/null | head -n1)}"
[ -f "${WGT:-}" ] || die ".wgt introuvable (lancer package.sh d'abord)"
WGT_NAME="$(basename "$WGT")"
[ "$(dirname "$(realpath "$WGT")")" = "$REPO_ROOT/dist" ] || die "le .wgt doit être dans dist/"
TARGET="$(tv_target)"
PKG_ID="${APP_ID%%.*}"
REMOTE_DIR=/home/owner/share/tmp/sdk_tools

echo "→ connexion à la TV (${TARGET})"
sdb_connect

echo "→ sdb install (transfert)"
OUT="$(run_in_container sdb -s "$TARGET" install "/work/dist/$WGT_NAME" 2>&1 || true)"
echo "$OUT"

if ! grep -qi "install completed" <<<"$OUT"; then
  echo "→ pas de « install completed » : repli vd_appinstall"
  run_in_container sdb -s "$TARGET" shell 0 mkdir -p "$REMOTE_DIR" || true
  run_in_container sdb -s "$TARGET" push "/work/dist/$WGT_NAME" "$REMOTE_DIR/$WGT_NAME"
  OUT="$(run_in_container sdb -s "$TARGET" shell 0 vd_appinstall "$PKG_ID" "$REMOTE_DIR/$WGT_NAME" 2>&1 || true)"
  echo "$OUT"
  grep -qi "install completed" <<<"$OUT" || die "« install completed » absent : installation non confirmée"
fi

echo "→ vérification de la présence de l'app dans la liste"
LIST="$(run_in_container sdb -s "$TARGET" shell 0 applist 2>&1 || true)"
grep -q -- "$APP_ID" <<<"$LIST" || die "$APP_ID absent de la liste des apps de la TV"
echo "OK côté SDK : install completed + app présente. À confirmer sur l'écran de la TV."
