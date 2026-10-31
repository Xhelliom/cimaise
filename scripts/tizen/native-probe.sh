#!/usr/bin/env bash
# Sonde native « Voie B », étape 1 (docs/home-button.md) : un .tpk C vide, signé avec NOTRE profil.
# Paquet distinct de cimaise : org.cimaise.sondenative (cimaise001.Cimaise n'est jamais touché).
#
# Usage : native-probe.sh build|install|launch|uninstall|list
#   build      compile (rootstrap IoT-Headed 5.0, armv7l) et signe → dist/org.cimaise.sondenative-*.tpk
#   install    sdb install ; repli vd_appinstall ; puis vérifie la présence dans applist
#   launch     was_execute
#   uninstall  sdb uninstall ; puis vérifie l'ABSENCE dans applist
#   list       applist filtrée (sonde + cimaise)
#
# Liste blanche sdb de ce script (rien d'autre n'est envoyé à la TV) : connect, install, push vers
# sdk_tools, uninstall (« closed » sur notre TV), « shell 0 vd_appinstall », « shell 0 vd_appuninstall », « shell 0 applist », « shell 0 was_execute ».
# Aucune réponse du SDK ne vaut succès : Stéphane confirme ce qu'il voit à l'écran.
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

PKG=org.cimaise.sondenative
SRC=apps/native-probe
ROOTSTRAP=iot-headed-5.0-device.core
STAGE_REL=dist/.stage-native

tpk_file() { ls -t "$REPO_ROOT"/dist/"$PKG"-*.tpk 2>/dev/null | head -n1; }

cmd="${1:-}"
case "$cmd" in
  build)
    load_env
    require_vars SIGN_PROFILE
    STAGE="$REPO_ROOT/$STAGE_REL"
    rm -rf "$STAGE"; mkdir -p "$STAGE"
    trap 'rm -rf "$STAGE"' EXIT
    cp -r "$REPO_ROOT/$SRC/." "$STAGE/"
    run_in_container bash -c '
      set -euo pipefail
      cd "/work/$1"
      tizen build-native -a arm -c gcc -r "$2" -C Release -- "/work/$1"
      tizen package -t tpk -s "$3" -- "/work/$1/Release"
      ls -l Release/*.tpk
      cp Release/*.tpk /work/dist/
    ' _ "$STAGE_REL" "$ROOTSTRAP" "$SIGN_PROFILE"
    F="$(tpk_file)"; [ -f "$F" ] || die "aucun .tpk produit"
    case "$(basename "$F")" in *[!A-Za-z0-9._-]*) die "nom de .tpk non sûr : $(basename "$F")";; esac
    echo "OK : $F ($(stat -c %s "$F") octets)"
    ;;
  install)
    load_env
    require_vars TV_IP
    F="$(tpk_file)"; [ -f "$F" ] || die ".tpk introuvable (lancer « native-probe.sh build »)"
    sdb_session '
      F="/work/dist/$1"; P="$2"; R=/home/owner/share/tmp/sdk_tools
      echo "→ sdb install (transfert + installation)"
      OUT="$(sdb -s "$T" install "$F" 2>&1 || true)"; echo "$OUT"
      if ! grep -qi "install completed" <<<"$OUT"; then
        echo "→ pas de « install completed » : repli vd_appinstall"
        sdb -s "$T" push "$F" "$R/$1" || { echo "erreur : push échoué" >&2; exit 1; }
        OUT="$(sdb -s "$T" shell 0 vd_appinstall "$P" "$R/$1" 2>&1 || true)"; echo "$OUT"
      fi
      echo "→ applist (filtrée)"
      sdb -s "$T" shell 0 applist 2>&1 | grep -i -- "$P" || echo "(sonde ABSENTE de la liste)"
    ' "$(basename "$F")" "$PKG"
    echo "Réponse du SDK ci-dessus. Seul l'écran de la TV fait foi."
    ;;
  launch)
    load_env; require_vars TV_IP
    sdb_session 'sdb -s "$T" shell 0 was_execute "$1"' "$PKG"
    echo "Commande envoyée. Regarder la TV."
    ;;
  uninstall)
    load_env; require_vars TV_IP
    sdb_session '
      P="$1"
      echo "→ sdb uninstall $P"
      sdb -s "$T" uninstall "$P" 2>&1 || true
      echo "→ repli : shell 0 vd_appuninstall $P"
      sdb -s "$T" shell 0 vd_appuninstall "$P" 2>&1 | grep -v "uninstalling\[" || true
      echo "→ applist (filtrée)"
      if sdb -s "$T" shell 0 applist 2>&1 | grep -i -- "$P"; then echo "(sonde ENCORE présente)"; else echo "(sonde absente de la liste)"; fi
    ' "$PKG"
    ;;
  list)
    load_env; require_vars TV_IP
    sdb_session 'sdb -s "$T" shell 0 applist 2>&1 | grep -iE -- "sondenative|cimaise" || echo "(aucune)"'
    ;;
  *) die "usage : native-probe.sh build|install|launch|uninstall|list";;
esac
