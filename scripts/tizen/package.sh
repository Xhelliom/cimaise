#!/usr/bin/env bash
# Empaquette et signe APP_DIR en .wgt avec le packager officiel (`tizen package`).
# Sortie : dist/<nom>.wgt (dist/tv2/ avec CIMAISE_TV=tv2), nom réduit à [A-Za-z0-9._-] (espaces → « - », reste supprimé ; ignoré par git). Usage : package.sh [dossier-app]
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
load_env
require_vars SIGN_PROFILE
# TV2 (Tizen 4.0) refuse required_version="5.0" du config.xml source : la cible doit fixer la sienne.
if [ "${CIMAISE_TV:-}" = tv2 ]; then require_vars REQUIRED_VERSION; fi
APP_DIR="${1:-${APP_DIR:-}}"
[ -n "$APP_DIR" ] || die "APP_DIR absent (argument ou $ENV_FILE)"
[ -f "$REPO_ROOT/$APP_DIR/config.xml" ] || die "$APP_DIR/config.xml introuvable"
mkdir -p "$DIST_DIR"
# Copie à empaqueter : si .local/ha.env existe, elle reçoit local-config.js (URL + jeton Home Assistant pré-remplis).
# Le jeton ne vit que dans cette copie et dans le .wgt (dist/, ignoré par git) ; la copie est supprimée à la sortie.
STAGE="$DIST_DIR/.stage-app"
trap 'rm -rf "$STAGE"' EXIT
# Idem pour .local/overseerr.env (URL + clé de la sonde Overseerr, et <access origin> ajouté au config.xml de la copie)
# et .local/unsplash.env (clé du fond d'écran de l'accueil ; origines api. et images.unsplash.com déclarées dans la copie).
node "$REPO_ROOT/scripts/build/local-config.mjs" "$REPO_ROOT/$APP_DIR" "$STAGE" "$LOCAL_DIR/ha.env" "$LOCAL_DIR/overseerr.env" "$LOCAL_DIR/unsplash.env"
# REQUIRED_VERSION (env de la cible, ex. 4.0 pour TV2) : réécrit dans la COPIE seulement ; le config.xml source ne bouge pas.
if [ -n "${REQUIRED_VERSION:-}" ]; then
  [[ "$REQUIRED_VERSION" =~ ^[0-9]+\.[0-9]+$ ]] || die "REQUIRED_VERSION « $REQUIRED_VERSION » invalide (ex. 4.0)"
  grep -q 'required_version="[^"]*"' "$STAGE/config.xml" || die "required_version introuvable dans $APP_DIR/config.xml"
  sed -i -E "s/required_version=\"[^\"]*\"/required_version=\"$REQUIRED_VERSION\"/" "$STAGE/config.xml"
  echo "required_version=$REQUIRED_VERSION dans la copie empaquetée" >&2
fi
run_in_container tizen package -t wgt -s "$SIGN_PROFILE" -o "/work/$DIST_REL" -- "/work/$DIST_REL/.stage-app"
# Le packager nomme la sortie d'après <name> : la TV relit la ligne vd_appinstall dans son shell, donc
# espaces et parenthèses sont interdits. Espaces → « - », tout caractère hors [A-Za-z0-9._-] supprimé.
for f in "$DIST_DIR"/*.wgt; do
  [ -e "$f" ] || continue
  b="$(basename "$f")"; safe="${b// /-}"; safe="$(printf '%s' "$safe" | LC_ALL=C tr -cd 'A-Za-z0-9._-')"
  [ "$safe" = "$b" ] && continue
  # $f porte un nom non sûr : seul le packager vient de l'écrire ; il remplace la version précédente de $safe.
  mv -f "$f" "$DIST_DIR/$safe"
done
ls "$DIST_DIR"/*.wgt >/dev/null 2>&1 || die "aucun .wgt produit"
