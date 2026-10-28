#!/usr/bin/env bash
# Empaquette et signe APP_DIR en .wgt avec le packager officiel (`tizen package`).
# Sortie : dist/<nom>.wgt (ignoré par git). Usage : package.sh [dossier-app]
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
load_env
require_vars SIGN_PROFILE
APP_DIR="${1:-${APP_DIR:-}}"
[ -n "$APP_DIR" ] || die "APP_DIR absent (argument ou .local/tizen.env)"
[ -f "$REPO_ROOT/$APP_DIR/config.xml" ] || die "$APP_DIR/config.xml introuvable"
mkdir -p "$REPO_ROOT/dist"
run_in_container tizen package -t wgt -s "$SIGN_PROFILE" -o /work/dist -- "/work/$APP_DIR"
ls "$REPO_ROOT"/dist/*.wgt >/dev/null 2>&1 || die "aucun .wgt produit"
