#!/usr/bin/env bash
# Empaquette et signe APP_DIR en .wgt avec le packager officiel (`tizen package`).
# Sortie : dist/<nom>.wgt, nom réduit à [A-Za-z0-9._-] (espaces → « - », reste supprimé ; ignoré par git). Usage : package.sh [dossier-app]
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
load_env
require_vars SIGN_PROFILE
APP_DIR="${1:-${APP_DIR:-}}"
[ -n "$APP_DIR" ] || die "APP_DIR absent (argument ou .local/tizen.env)"
[ -f "$REPO_ROOT/$APP_DIR/config.xml" ] || die "$APP_DIR/config.xml introuvable"
mkdir -p "$REPO_ROOT/dist"
# Copie à empaqueter : si .local/ha.env existe, elle reçoit local-config.js (URL + jeton Home Assistant pré-remplis).
# Le jeton ne vit que dans cette copie et dans le .wgt (dist/, ignoré par git) ; la copie est supprimée à la sortie.
STAGE="$REPO_ROOT/dist/.stage-app"
trap 'rm -rf "$STAGE"' EXIT
node "$REPO_ROOT/scripts/build/local-config.mjs" "$REPO_ROOT/$APP_DIR" "$STAGE" "$LOCAL_DIR/ha.env"
run_in_container tizen package -t wgt -s "$SIGN_PROFILE" -o /work/dist -- "/work/dist/.stage-app"
# Le packager nomme la sortie d'après <name> : la TV relit la ligne vd_appinstall dans son shell, donc
# espaces et parenthèses sont interdits. Espaces → « - », tout caractère hors [A-Za-z0-9._-] supprimé.
for f in "$REPO_ROOT"/dist/*.wgt; do
  [ -e "$f" ] || continue
  b="$(basename "$f")"; safe="${b// /-}"; safe="$(printf '%s' "$safe" | LC_ALL=C tr -cd 'A-Za-z0-9._-')"
  [ "$safe" = "$b" ] && continue
  # $f porte un nom non sûr : seul le packager vient de l'écrire ; il remplace la version précédente de $safe.
  mv -f "$f" "$REPO_ROOT/dist/$safe"
done
ls "$REPO_ROOT"/dist/*.wgt >/dev/null 2>&1 || die "aucun .wgt produit"
