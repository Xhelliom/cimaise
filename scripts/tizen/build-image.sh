#!/usr/bin/env bash
# (Re)construit l'image Docker du SDK Tizen.
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
"$DOCKER" build --build-arg "TIZEN_UID=$(id -u)" -t "$IMAGE" \
  -f "$TIZEN_SCRIPTS_DIR/docker/Dockerfile" "$TIZEN_SCRIPTS_DIR/docker"
