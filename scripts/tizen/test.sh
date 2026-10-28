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

# Faux docker : journalise les arguments, simule les réponses de sdb.
mkdir -p "$TMP/bin" "$TMP/local" "$TMP/repo"
cat > "$TMP/bin/docker" <<'FAKE'
#!/usr/bin/env bash
echo "$*" >> "$FAKE_LOG"
case "$1" in image) exit 0;; esac
case "$*" in
  *"sdb version"*)   echo "Smart Development Bridge version 4.2.25";;
  *"tizen version"*) echo "Tizen CLI 2.5.25";;
  *"install /work/dist/"*) echo "${FAKE_INSTALL_OUT:-install completed}";;
  *vd_appinstall*)   echo "${FAKE_VD_OUT:-install completed}";;
  *applist*)         echo "${FAKE_APPLIST:-'Cimaise'  'cimaise00.Cimaise'}";;
esac
exit 0
FAKE
chmod +x "$TMP/bin/docker"
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
grep -q -- "--network host" "$TMP/docker.log" && ok "réseau hôte" || fail "réseau hôte"

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
grep -q "was_execute cimaise00.Cimaise" "$TMP/docker.log" && ok "launch" || fail "launch"

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

# 7. package : refuse un dossier sans config.xml, sinon appelle tizen package -s <profil>
mkdir -p "$REPO/apps/_t"; trap 'rm -rf "$TMP" "$REPO/dist/zz-test.wgt" "$REPO/apps/_t"' EXIT
"$HERE/package.sh" apps/_t >/dev/null 2>&1 && fail "package sans config.xml" || ok "package sans config.xml échoue"
touch "$REPO/apps/_t/config.xml"
"$HERE/package.sh" apps/_t >/dev/null 2>&1   # échoue faute de .wgt produit par le faux docker : normal
grep -q "tizen package -t wgt -s cimaise" "$TMP/docker.log" && ok "package appelle tizen package -s profil" || fail "package appelle tizen package -s profil"

# 8. aucun secret dans les logs/arguments Docker ni dans la sortie
: > "$TMP/docker.log"
all="$("$HERE/setup-profile.sh" 2>&1; "$HERE/install.sh" "$REPO/dist/zz-test.wgt" 2>&1; "$HERE/list-apps.sh" 2>&1)"
grep -q "$SECRET" "$TMP/docker.log" && fail "mot de passe absent des arguments docker" || ok "mot de passe absent des arguments docker"
[[ "$all" == *"$SECRET"* ]] && fail "mot de passe absent des sorties" || ok "mot de passe absent des sorties"
grep -q -- "--env-file" "$TMP/docker.log" && ok "secrets passés par env-file" || fail "secrets passés par env-file"

# 9. rien de secret versionné
cd "$REPO" && ! git ls-files | grep -Eq '\.(p12|pfx|key|pem)$|(^|/)\.local/' && ok "aucun secret suivi par git" || fail "aucun secret suivi par git"

echo; [ $FAILS -eq 0 ] && echo "tout est vert" || { echo "$FAILS échec(s)"; exit 1; }
