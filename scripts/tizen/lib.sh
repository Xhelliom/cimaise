# Fonctions communes aux scripts Tizen. À sourcer, pas à exécuter.
# Tout ce qui est secret ou propre à la TV vient de .local/tizen.env (ou .local/tizen.env.tv2 avec CIMAISE_TV=tv2).

TIZEN_SCRIPTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$TIZEN_SCRIPTS_DIR/../.." && pwd)"
LOCAL_DIR="${CIMAISE_LOCAL_DIR:-$REPO_ROOT/.local}"
IMAGE="${CIMAISE_TIZEN_IMAGE:-cimaise-tizen:5.6}"
DOCKER="${DOCKER:-docker}"
# Options `docker run` supplémentaires (ex. affichage X11) ; un script les remplit avant run_in_container.
DOCKER_RUN_EXTRA=()

die() { echo "erreur : $*" >&2; exit 1; }

# Cible TV. Sans CIMAISE_TV : la Frame, comportement d'origine (.local/tizen.env, paquets dans dist/).
# CIMAISE_TV=tv2 : .local/tizen.env.tv2, paquets dans dist/tv2/ (jamais d'installation croisée).
# Liste fermée : toute autre valeur est refusée, pour ne jamais retomber par erreur sur une autre TV.
case "${CIMAISE_TV:-}" in
  "")  ENV_FILE="$LOCAL_DIR/tizen.env"; DIST_REL=dist ;;
  tv2) ENV_FILE="$LOCAL_DIR/tizen.env.tv2"; DIST_REL=dist/tv2 ;;
  *)   die "CIMAISE_TV=« $CIMAISE_TV » inconnue : laisser vide (Frame) ou tv2" ;;
esac
DIST_DIR="$REPO_ROOT/$DIST_REL"

# Charge le fichier d'env de la cible sans jamais l'afficher.
load_env() {
  [ -f "$ENV_FILE" ] || die "$ENV_FILE introuvable (copier scripts/tizen/tizen.env.example vers $ENV_FILE)"
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
  # TV2 refuse la signature Samsung : son env doit désigner un autre profil que « cimaise » (celui de la Frame).
  if [ "${CIMAISE_TV:-}" = tv2 ]; then
    [ -n "${SIGN_PROFILE:-}" ] && [ "$SIGN_PROFILE" != cimaise ] \
      || die "$ENV_FILE : SIGN_PROFILE doit être le profil TV2 (cimaise-tv2), pas « ${SIGN_PROFILE:-} »"
    echo "cible : TV2 (${TV_IP:-?}), profil ${SIGN_PROFILE}, paquets dans $DIST_REL/" >&2
  fi
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
  # .local hors du dépôt (worktree, CIMAISE_LOCAL_DIR) : le profil de signature référence
  # /work/.local/certs/… ; on monte donc LOCAL_DIR à cet endroit.
  local localopt=()
  [ "$(realpath -m "$LOCAL_DIR")" = "$REPO_ROOT/.local" ] || localopt=(-v "$LOCAL_DIR:/work/.local")
  "$DOCKER" run --rm -i --network host \
    "${envopt[@]}" \
    "${localopt[@]}" \
    "${DOCKER_RUN_EXTRA[@]}" \
    -v "$REPO_ROOT:/work" \
    -v "$LOCAL_DIR/tizen-studio-data:/home/tizen/tizen-studio-data" \
    -w /work "$IMAGE" "$@"
}

# Le serveur sdb (port 26099) meurt avec le conteneur, et avec lui la connexion
# `sdb connect`. Toute séquence qui parle à la TV doit donc tenir dans UN SEUL
# conteneur : sdb_session lance `sdb connect` puis le script, dans le même `docker run`.
# TV_IP, TV_PORT et APP_ID viennent de l'env-file ; les arguments arrivent en $1, $2…
# Dans le script, `$T` désigne la cible « IP:port » et `sdb -s "$T"` la TV.
sdb_session() {
  local script="$1"; shift
  run_in_container bash -c '
    set -uo pipefail
    T="${TV_IP}:${TV_PORT:-26101}"
    sdb connect "$T" >&2
    '"$script" _ "$@"
}
