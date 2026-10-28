# Fonctions communes aux scripts Tizen. À sourcer, pas à exécuter.
# Tout ce qui est secret ou propre à la TV vient de .local/tizen.env (ignoré par git).

TIZEN_SCRIPTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$TIZEN_SCRIPTS_DIR/../.." && pwd)"
LOCAL_DIR="${CIMAISE_LOCAL_DIR:-$REPO_ROOT/.local}"
ENV_FILE="$LOCAL_DIR/tizen.env"
IMAGE="${CIMAISE_TIZEN_IMAGE:-cimaise-tizen:5.6}"
DOCKER="${DOCKER:-docker}"

die() { echo "erreur : $*" >&2; exit 1; }

# Charge .local/tizen.env sans jamais l'afficher.
load_env() {
  [ -f "$ENV_FILE" ] || die "$ENV_FILE introuvable (copier scripts/tizen/tizen.env.example vers .local/tizen.env)"
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
}

require_vars() {
  local v
  for v in "$@"; do
    [ -n "${!v:-}" ] || die "variable $v absente de $ENV_FILE"
  done
}

# Construit l'image si elle n'existe pas encore.
ensure_image() {
  "$DOCKER" image inspect "$IMAGE" >/dev/null 2>&1 && return 0
  echo "image $IMAGE absente : construction (plusieurs minutes)…" >&2
  "$DOCKER" build --build-arg "TIZEN_UID=$(id -u)" -t "$IMAGE" \
    -f "$TIZEN_SCRIPTS_DIR/docker/Dockerfile" "$TIZEN_SCRIPTS_DIR/docker" >&2
}

# Exécute une commande dans le conteneur : réseau hôte (sdb → TV:26101),
# dépôt monté sur /work, données du SDK (profils de signature) dans .local/.
# Le secret n'est jamais passé en argument : le conteneur reçoit l'env-file.
run_in_container() {
  ensure_image
  mkdir -p "$LOCAL_DIR/tizen-studio-data"
  local envopt=()
  [ -f "$ENV_FILE" ] && envopt=(--env-file "$ENV_FILE")
  "$DOCKER" run --rm -i --network host \
    "${envopt[@]}" \
    -v "$REPO_ROOT:/work" \
    -v "$LOCAL_DIR/tizen-studio-data:/home/tizen/tizen-studio-data" \
    -w /work "$IMAGE" "$@"
}

# Cible sdb « IP:port » de la TV.
tv_target() { echo "${TV_IP}:${TV_PORT:-26101}"; }

sdb_connect() {
  run_in_container sdb connect "$(tv_target)"
}
