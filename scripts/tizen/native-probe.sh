#!/usr/bin/env bash
# Sonde native « Voie B » (docs/home-button.md) : un .tpk C vide, signé avec NOTRE profil, et un
# lanceur web jetable qui le lance par l'API officielle et regarde s'il tourne.
# Paquets distincts de cimaise : org.cimaise.sondenative (natif) et cmzlanceur.Lanceur (web).
# cimaise001.Cimaise n'est jamais touché.
#
# Usage : native-probe.sh <commande>
#   build            compile (rootstrap IoT-Headed 5.0, armv7l) et signe → dist/org.cimaise.sondenative-*.tpk
#   install          installe le .tpk ; vérifie la présence dans applist
#   launch           was_execute de la sonde
#   build-lanceur    signe apps/native-launcher → dist/cmzlanceur.wgt
#   install-lanceur  installe le lanceur ; vérifie la présence dans applist
#   launch-lanceur   was_execute du lanceur
#   uninstall        sdb uninstall puis vd_appuninstall (tous deux « closed » sur notre TV : supprimer
#                    depuis le menu de la TV) ; vérifie l'ABSENCE dans applist
#   list             applist filtrée (sonde, lanceur, cimaise)
#
# Liste blanche sdb de ce script (rien d'autre n'est envoyé à la TV) : connect, install, push vers
# sdk_tools, uninstall, « shell 0 vd_appinstall », « shell 0 vd_appuninstall », « shell 0 applist »,
# « shell 0 was_execute ». Aucune réponse du SDK ne vaut succès : Stéphane confirme à l'écran.
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

PKG=org.cimaise.sondenative
SRC=apps/native-probe
ROOTSTRAP=iot-headed-5.0-device.core
STAGE_REL=dist/.stage-native
LANCEUR_ID=cmzlanceur.Lanceur
LANCEUR_SRC=apps/native-launcher
LANCEUR_STAGE_REL=dist/.stage-lanceur
LANCEUR_WGT=cmzlanceur.wgt

tpk_file() { ls -t "$REPO_ROOT"/dist/"$PKG"-*.tpk 2>/dev/null | head -n1; }

safe_name() {
  case "$(basename "$1")" in *[!A-Za-z0-9._-]*) die "nom de paquet non sûr : $(basename "$1")";; esac
}

# install_pkg <fichier dans dist/> <id de paquet pour vd_appinstall> <motif applist>
install_pkg() {
  safe_name "$1"
  sdb_session '
    F="/work/dist/$1"; P="$2"; M="$3"; R=/home/owner/share/tmp/sdk_tools
    echo "→ sdb install (transfert + installation)"
    OUT="$(sdb -s "$T" install "$F" 2>&1 || true)"
    grep -v -e "installing\[" -e "install_percent" <<<"$OUT"
    if ! grep -qi "install completed" <<<"$OUT"; then
      echo "→ pas de « install completed » : repli vd_appinstall"
      sdb -s "$T" push "$F" "$R/$1" || { echo "erreur : push échoué" >&2; exit 1; }
      OUT="$(sdb -s "$T" shell 0 vd_appinstall "$P" "$R/$1" 2>&1 || true)"
      grep -v -e "installing\[" -e "install_percent" <<<"$OUT"
    fi
    echo "→ applist (filtrée)"
    sdb -s "$T" shell 0 applist 2>&1 | grep -i -- "$M" || echo "($M ABSENT de la liste)"
  ' "$(basename "$1")" "$2" "$3"
  echo "Réponse du SDK ci-dessus. Seul l'écran de la TV fait foi."
}

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
    safe_name "$F"
    echo "OK : $F ($(stat -c %s "$F") octets)"
    ;;
  install)
    load_env; require_vars TV_IP
    F="$(tpk_file)"; [ -f "$F" ] || die ".tpk introuvable (lancer « native-probe.sh build »)"
    install_pkg "$F" "$PKG" "$PKG"
    ;;
  launch)
    load_env; require_vars TV_IP
    sdb_session 'sdb -s "$T" shell 0 was_execute "$1"' "$PKG"
    echo "Commande envoyée. Regarder la TV."
    ;;
  build-lanceur)
    load_env; require_vars SIGN_PROFILE
    STAGE="$REPO_ROOT/$LANCEUR_STAGE_REL"
    rm -rf "$STAGE"; mkdir -p "$STAGE"
    trap 'rm -rf "$STAGE"' EXIT
    cp -r "$REPO_ROOT/$LANCEUR_SRC/." "$STAGE/"
    # Le packager nomme le .wgt d'après <name> (« Lanceur sonde ») : on le sort dans un dossier dédié
    # puis on le renomme en un nom sûr.
    run_in_container bash -c '
      set -euo pipefail
      rm -rf /work/dist/.out-lanceur; mkdir -p /work/dist/.out-lanceur
      tizen package -t wgt -s "$2" -o /work/dist/.out-lanceur -- "/work/$1"
      mv /work/dist/.out-lanceur/*.wgt "/work/dist/$3"
      rmdir /work/dist/.out-lanceur
    ' _ "$LANCEUR_STAGE_REL" "$SIGN_PROFILE" "$LANCEUR_WGT"
    echo "OK : dist/$LANCEUR_WGT ($(stat -c %s "$REPO_ROOT/dist/$LANCEUR_WGT") octets)"
    ;;
  install-lanceur)
    load_env; require_vars TV_IP
    [ -f "$REPO_ROOT/dist/$LANCEUR_WGT" ] || die "dist/$LANCEUR_WGT introuvable (lancer « native-probe.sh build-lanceur »)"
    install_pkg "$REPO_ROOT/dist/$LANCEUR_WGT" "${LANCEUR_ID%%.*}" "$LANCEUR_ID"
    ;;
  launch-lanceur)
    load_env; require_vars TV_IP
    sdb_session 'sdb -s "$T" shell 0 was_execute "$1"' "$LANCEUR_ID"
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
    sdb_session 'sdb -s "$T" shell 0 applist 2>&1 | grep -iE -- "sondenative|cmzlanceur|cimaise" || echo "(aucune)"'
    ;;
  *) die "usage : native-probe.sh build|install|launch|build-lanceur|install-lanceur|launch-lanceur|uninstall|list";;
esac
