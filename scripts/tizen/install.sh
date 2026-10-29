#!/usr/bin/env bash
# Installe un .wgt sur la TV puis vérifie que l'app y figure.
# Ne conclut JAMAIS au succès sur la seule réponse du SDK : le script exige
# « install completed » ET la présence de APP_ID dans la liste ; Stéphane confirme à l'écran.
# Toute la séquence (connect, install, repli, liste) tourne dans UN conteneur : voir sdb_session.
# Usage : install.sh [fichier.wgt]
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
load_env
require_vars TV_IP APP_ID
WGT="${1:-$(ls -t "$REPO_ROOT"/dist/*.wgt 2>/dev/null | head -n1)}"
[ -f "${WGT:-}" ] || die ".wgt introuvable (lancer package.sh d'abord)"
[ "$(dirname "$(realpath "$WGT")")" = "$REPO_ROOT/dist" ] || die "le .wgt doit être dans dist/"

# La TV relit la commande vd_appinstall dans son shell : seul [A-Za-z0-9._-] est sûr dans le nom.
case "$(basename "$WGT")" in
  *[!A-Za-z0-9._-]*) die "nom de .wgt invalide « $(basename "$WGT") » : seuls A-Z a-z 0-9 . _ - sont acceptés (relancer package.sh)";;
esac

sdb_session '
  WGT="/work/dist/$1"; APP="$2"
  PKG_ID="${APP%%.*}"
  REMOTE_DIR=/home/owner/share/tmp/sdk_tools
  echo "→ sdb install (transfert)"
  OUT="$(sdb -s "$T" install "$WGT" 2>&1 || true)"
  echo "$OUT"
  if ! grep -qi "install completed" <<<"$OUT"; then
    echo "→ pas de « install completed » : repli vd_appinstall"
    sdb -s "$T" shell 0 mkdir -p "$REMOTE_DIR" || true
    sdb -s "$T" push "$WGT" "$REMOTE_DIR/$1" || { echo "erreur : push échoué" >&2; exit 1; }
    OUT="$(sdb -s "$T" shell 0 vd_appinstall "$PKG_ID" "$REMOTE_DIR/$1" 2>&1 || true)"
    echo "$OUT"
    grep -qi "install completed" <<<"$OUT" || { echo "erreur : « install completed » absent : installation non confirmée" >&2; exit 1; }
  fi
  echo "→ vérification de la présence de l'\''app dans la liste"
  LIST="$(sdb -s "$T" shell 0 applist 2>&1 || true)"
  grep -q -- "$APP" <<<"$LIST" || { echo "erreur : $APP absent de la liste des apps de la TV" >&2; exit 1; }
' "$(basename "$WGT")" "$APP_ID"
echo "OK côté SDK : install completed + app présente. À confirmer sur l'écran de la TV."
