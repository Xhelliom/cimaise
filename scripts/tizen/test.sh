#!/usr/bin/env bash
# Tests des scripts Tizen avec un faux `docker` : aucun appel réseau, aucune TV.
# Usage : scripts/tizen/test.sh
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
FAILS=0
ok()   { echo "ok   - $1"; }
fail() { echo "FAIL - $1"; FAILS=$((FAILS+1)); }
check() { local name="$1"; shift; if "$@" >/dev/null 2>&1; then ok "$name"; else fail "$name"; fi; }

# Faux docker : journalise chaque `docker run` sous un numéro. Un `bash -c` est exécuté
# pour de bon (env-file chargé) avec un faux sdb/tizen en tête du PATH ; le faux sdb
# journalise « SDB <n° de conteneur> <args> », ce qui permet de vérifier que connect
# et les commandes suivantes partagent le même conteneur (le serveur sdb meurt avec lui).
mkdir -p "$TMP/bin" "$TMP/local" "$TMP/repo" "$TMP/fake"
cat > "$TMP/fake/sdb" <<'FAKE'
#!/usr/bin/env bash
echo "SDB $FAKE_N $*" >> "$FAKE_LOG"
# Comme le vrai serveur : sans `connect` dans CE conteneur, aucun appareil.
case "$1" in connect) touch "$FAKE_CONN"; echo "connected to $2"; exit 0;; esac
case "$1" in version) echo "Smart Development Bridge version 4.2.25"; exit 0;; esac
[ -f "$FAKE_CONN" ] || { echo "error: device not found"; exit 1; }
case "$*" in
  *version*)         echo "Smart Development Bridge version 4.2.25";;
  *"install /work/dist/"*) echo "${FAKE_INSTALL_OUT:-install completed}";;
  *vd_appinstall*)   echo "${FAKE_VD_OUT:-install completed}";;
  *applist*)         echo "${FAKE_APPLIST:-'Cimaise'  'cimaise00.Cimaise'}";;
esac
exit 0
FAKE
cat > "$TMP/fake/tizen" <<'FAKE'
#!/usr/bin/env bash
echo "TIZEN $FAKE_N $*" >> "$FAKE_LOG"
case "$1" in version) echo "Tizen CLI 2.5.25";; esac
exit 0
FAKE
chmod +x "$TMP/fake/sdb" "$TMP/fake/tizen"
cat > "$TMP/bin/docker" <<'FAKE'
#!/usr/bin/env bash
echo "DOCKER $*" >> "$FAKE_LOG"
case "$1" in image) exit 0;; esac
N=$(( $(cat "$FAKE_COUNT" 2>/dev/null || echo 0) + 1 )); echo $N > "$FAKE_COUNT"
export FAKE_N=$N FAKE_CONN="$FAKE_DIR/conn.$N" PATH="$FAKE_DIR/fake:$PATH"
args=("$@"); envf=""
for ((i=0;i<${#args[@]};i++)); do
  [ "${args[i]}" = "--env-file" ] && envf="${args[i+1]}"
  if [ "${args[i]}" = "bash" ]; then
    [ -n "$envf" ] && { set -a; . "$envf"; set +a; }
    exec "${args[@]:i}"
  fi
done
# commande directe (wrappers sdb / tizen) : après l'image
for ((i=0;i<${#args[@]};i++)); do
  case "${args[i]}" in sdb|tizen) exec "${args[@]:i}";; esac
done
exit 0
FAKE
chmod +x "$TMP/bin/docker"
export FAKE_DIR="$TMP" FAKE_COUNT="$TMP/count"
export DOCKER="$TMP/bin/docker" FAKE_LOG="$TMP/docker.log"
export CIMAISE_LOCAL_DIR="$TMP/local"
SECRET=s3cr3t-pw-1234
cat > "$TMP/local/tizen.env" <<ENV
TV_IP=10.9.8.7
APP_ID=cimaise00.Cimaise
APP_DIR=apps/tv
SIGN_PROFILE=cimaise
AUTHOR_CERT=/work/.local/certs/author.p12
AUTHOR_PASSWORD=$SECRET
DISTRIBUTOR_CERT=/work/.local/certs/distributor.p12
DISTRIBUTOR_PASSWORD=$SECRET
ENV

# 1. wrappers
out="$("$HERE/sdb" version)"; [[ "$out" == *"Smart Development Bridge"* ]] && ok "wrapper sdb version" || fail "wrapper sdb version"
out="$("$HERE/tizen" version)"; [[ "$out" == *"Tizen CLI"* ]] && ok "wrapper tizen version" || fail "wrapper tizen version"
grep -q -- "^DOCKER .*--network host" "$TMP/docker.log" && ok "réseau hôte" || fail "réseau hôte"

# 2. scripts présents, exécutables, syntaxe valide
for s in package install launch list-apps setup-profile; do
  check "$s.sh exécutable + syntaxe" bash -c "[ -x '$HERE/$s.sh' ] && bash -n '$HERE/$s.sh'"
done

# 3. sans .local/tizen.env : échec explicite
out="$(CIMAISE_LOCAL_DIR="$TMP/vide" "$HERE/list-apps.sh" 2>&1)"; rc=$?
[ $rc -ne 0 ] && [[ "$out" == *"tizen.env"* ]] && ok "env absent → erreur claire" || fail "env absent → erreur claire"

# 4. list-apps lit l'ID depuis la TV configurée
out="$("$HERE/list-apps.sh" 2>&1)"; [[ "$out" == *"cimaise00.Cimaise"* ]] && ok "list-apps" || fail "list-apps"
grep -q "10.9.8.7:26101" "$TMP/docker.log" && ok "IP/port lus depuis .local" || fail "IP/port lus depuis .local"

# 5. launch
: > "$TMP/docker.log"; "$HERE/launch.sh" >/dev/null 2>&1
grep -q "^SDB .* shell 0 was_execute cimaise00.Cimaise" "$TMP/docker.log" && ok "launch" || fail "launch"

# 6. install : succès, puis échec si « install completed » absent, puis repli vd_appinstall
mkdir -p "$REPO/dist"; touch "$REPO/dist/zz-test.wgt"; trap 'rm -rf "$TMP" "$REPO/dist/zz-test.wgt"' EXIT
"$HERE/install.sh" "$REPO/dist/zz-test.wgt" >/dev/null 2>&1 && ok "install nominal" || fail "install nominal"
FAKE_INSTALL_OUT="transfer only" FAKE_VD_OUT="failed" "$HERE/install.sh" "$REPO/dist/zz-test.wgt" >/dev/null 2>&1 \
  && fail "install sans « install completed » doit échouer" || ok "install sans « install completed » échoue"
: > "$TMP/docker.log"
FAKE_INSTALL_OUT="transfer only" "$HERE/install.sh" "$REPO/dist/zz-test.wgt" >/dev/null 2>&1
grep -q "vd_appinstall cimaise00" "$TMP/docker.log" && ok "repli vd_appinstall" || fail "repli vd_appinstall"
FAKE_APPLIST="rien" "$HERE/install.sh" "$REPO/dist/zz-test.wgt" >/dev/null 2>&1 \
  && fail "install app absente de la liste doit échouer" || ok "install app absente de la liste échoue"

# 6 bis. Le serveur sdb meurt avec le conteneur : connect et la commande qui suit doivent
# partager le MÊME conteneur (même n° dans le journal), pour chaque script qui parle à la TV.
same_container() { # $1 = motif de la commande après connect
  local n; n="$(grep "^SDB .* connect 10.9.8.7:26101" "$TMP/docker.log" | tail -n1 | cut -d' ' -f2)"
  [ -n "$n" ] && grep -q "^SDB $n .*$1" "$TMP/docker.log"
}
: > "$TMP/docker.log"; "$HERE/list-apps.sh" >/dev/null 2>&1
check "list-apps : connect + applist dans le même conteneur" same_container "shell 0 applist"
: > "$TMP/docker.log"; "$HERE/launch.sh" >/dev/null 2>&1
check "launch : connect + was_execute dans le même conteneur" same_container "was_execute"
: > "$TMP/docker.log"; "$HERE/sdb-tv.sh" devices >/dev/null 2>&1
check "sdb-tv devices : connect + devices dans le même conteneur" same_container "devices"
: > "$TMP/docker.log"; "$HERE/install.sh" "$REPO/dist/zz-test.wgt" >/dev/null 2>&1
check "install : connect + install dans le même conteneur" same_container "install /work/dist/zz-test.wgt"
check "install : applist dans le même conteneur que connect" same_container "shell 0 applist"
[ "$(grep -c '^DOCKER run' "$TMP/docker.log")" = 1 ] && ok "install : un seul docker run" || fail "install : un seul docker run"
: > "$TMP/docker.log"; FAKE_INSTALL_OUT="transfer only" "$HERE/install.sh" "$REPO/dist/zz-test.wgt" >/dev/null 2>&1
check "install (repli) : push dans le même conteneur" same_container "push /work/dist/zz-test.wgt"
check "install (repli) : vd_appinstall dans le même conteneur" same_container "shell 0 vd_appinstall"

# 7. package : refuse un dossier sans config.xml, sinon appelle tizen package -s <profil>
mkdir -p "$REPO/apps/_t"; trap 'rm -rf "$TMP" "$REPO/dist/zz-test.wgt" "$REPO/apps/_t"' EXIT
"$HERE/package.sh" apps/_t >/dev/null 2>&1 && fail "package sans config.xml" || ok "package sans config.xml échoue"
touch "$REPO/apps/_t/config.xml"
"$HERE/package.sh" apps/_t >/dev/null 2>&1   # échoue faute de .wgt produit par le faux docker : normal
grep -q "^TIZEN .* package -t wgt -s cimaise" "$TMP/docker.log" && ok "package appelle tizen package -s profil" || fail "package appelle tizen package -s profil"

# 8. aucun secret dans les logs/arguments Docker ni dans la sortie
: > "$TMP/docker.log"
all="$("$HERE/setup-profile.sh" 2>&1; "$HERE/install.sh" "$REPO/dist/zz-test.wgt" 2>&1; "$HERE/list-apps.sh" 2>&1)"
grep "^DOCKER" "$TMP/docker.log" | grep -q "$SECRET" && fail "mot de passe absent des arguments docker" || ok "mot de passe absent des arguments docker"
[[ "$all" == *"$SECRET"* ]] && fail "mot de passe absent des sorties" || ok "mot de passe absent des sorties"
grep -q -- "^DOCKER .*--env-file" "$TMP/docker.log" && ok "secrets passés par env-file" || fail "secrets passés par env-file"

# 8 bis. cert-manager : ouvre le Certificate Manager sur l'affichage de l'hôte (X11/XWayland)
check "cert-manager.sh exécutable + syntaxe" bash -c "[ -x '$HERE/cert-manager.sh' ] && bash -n '$HERE/cert-manager.sh'"
out="$(env -u DISPLAY -u WAYLAND_DISPLAY "$HERE/cert-manager.sh" 2>&1)"; rc=$?
[ $rc -ne 0 ] && [[ "$out" == *"DISPLAY"* ]] && ok "cert-manager sans affichage → erreur claire" || fail "cert-manager sans affichage → erreur claire"
: > "$TMP/docker.log"
mkdir -p "$TMP/local/tizen-studio-data/keystore/author"
echo fake > "$TMP/local/tizen-studio-data/keystore/author/cimaise.p12"
echo fake > "$TMP/local/tizen-studio-data/keystore/author/tizen-distributor-signer.p12"
touch "$TMP/xauth"
DISPLAY=:0 XAUTHORITY="$TMP/xauth" "$HERE/cert-manager.sh" >/dev/null 2>&1 && ok "cert-manager (affichage X11)" || fail "cert-manager (affichage X11)"
grep -q -- "^DOCKER run .*/tmp/.X11-unix" "$TMP/docker.log" && ok "cert-manager monte le socket X11" || fail "cert-manager monte le socket X11"
grep -q -- "^DOCKER run .*DISPLAY=:0" "$TMP/docker.log" && ok "cert-manager transmet DISPLAY" || fail "cert-manager transmet DISPLAY"
grep -q -- "^DOCKER run .*XAUTHORITY" "$TMP/docker.log" && ok "cert-manager transmet l'autorisation X" || fail "cert-manager transmet l'autorisation X"
[ -f "$TMP/local/certs/author.p12" ] && [ -f "$TMP/local/certs/distributor.p12" ] && ok "cert-manager range author.p12 et distributor.p12 dans .local/certs" || fail "cert-manager range author.p12 et distributor.p12 dans .local/certs"

# 9. rien de secret versionné
cd "$REPO" && ! git ls-files | grep -Eq '\.(p12|pfx|key|pem)$|(^|/)\.local/' && ok "aucun secret suivi par git" || fail "aucun secret suivi par git"

echo; [ $FAILS -eq 0 ] && echo "tout est vert" || { echo "$FAILS échec(s)"; exit 1; }
