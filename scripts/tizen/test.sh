#!/usr/bin/env bash
# Tests des scripts Tizen avec un faux `docker` : aucun appel réseau, aucune TV.
# Usage : scripts/tizen/test.sh
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
TMP="$(mktemp -d)"
EXTRA_CLEAN=()
# Les .wgt déjà produits par l'opérateur dans dist/ sont mis à l'abri, puis restaurés à la sortie.
mkdir -p "$REPO/dist/tv2" "$TMP/dist-keep/tv2"
for f in "$REPO"/dist/*.wgt; do [ -e "$f" ] && mv "$f" "$TMP/dist-keep/"; done
for f in "$REPO"/dist/tv2/*.wgt; do [ -e "$f" ] && mv "$f" "$TMP/dist-keep/tv2/"; done
cleanup() {
  rm -f "$REPO"/dist/*.wgt "$REPO"/dist/tv2/*.wgt; rm -rf "${EXTRA_CLEAN[@]}"
  for f in "$TMP"/dist-keep/*.wgt; do [ -e "$f" ] && mv "$f" "$REPO/dist/"; done
  for f in "$TMP"/dist-keep/tv2/*.wgt; do [ -e "$f" ] && mv "$f" "$REPO/dist/tv2/"; done
  rm -rf "$TMP"
}
trap cleanup EXIT
FAILS=0
ok()   { echo "ok   - $1"; }
fail() { echo "FAIL - $1"; FAILS=$((FAILS+1)); }
skip() { echo "skip - $1"; }
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
  *applist*)         echo "${FAKE_APPLIST:-'Cimaise'  'cimaise001.Cimaise'}";;
esac
exit 0
FAKE
cat > "$TMP/fake/tizen" <<'FAKE'
#!/usr/bin/env bash
echo "TIZEN $FAKE_N $*" >> "$FAKE_LOG"
case "$1" in version) echo "Tizen CLI 2.5.25";; esac
# Comme le vrai packager : la sortie est nommée d'après <name> (ici avec espaces).
case "$1" in package) [ -n "${FAKE_WGT_DIR:-}" ] && touch "$FAKE_WGT_DIR/CleanFrame (bench).wgt"
  # Garde le config.xml de la copie empaquetée (chemin /work/… du conteneur → dépôt de l'hôte).
  src="${@: -1}"; cp "${src/#\/work/$FAKE_REPO}/config.xml" "$FAKE_DIR/staged-config.xml" 2>/dev/null;; esac
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
export FAKE_DIR="$TMP" FAKE_COUNT="$TMP/count" FAKE_REPO="$REPO"
export DOCKER="$TMP/bin/docker" FAKE_LOG="$TMP/docker.log"
export CIMAISE_LOCAL_DIR="$TMP/local"
SECRET=s3cr3t-pw-1234
cat > "$TMP/local/tizen.env" <<ENV
TV_IP=10.9.8.7
APP_ID=cimaise001.Cimaise
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
out="$("$HERE/list-apps.sh" 2>&1)"; [[ "$out" == *"cimaise001.Cimaise"* ]] && ok "list-apps" || fail "list-apps"
grep -q "10.9.8.7:26101" "$TMP/docker.log" && ok "IP/port lus depuis .local" || fail "IP/port lus depuis .local"

# 5. launch
: > "$TMP/docker.log"; "$HERE/launch.sh" >/dev/null 2>&1
grep -q "^SDB .* shell 0 was_execute cimaise001.Cimaise" "$TMP/docker.log" && ok "launch" || fail "launch"

# 6. install : succès, puis échec si « install completed » absent, puis repli vd_appinstall
mkdir -p "$REPO/dist"; touch "$REPO/dist/zz-test.wgt"
"$HERE/install.sh" "$REPO/dist/zz-test.wgt" >/dev/null 2>&1 && ok "install nominal" || fail "install nominal"
FAKE_INSTALL_OUT="transfer only" FAKE_VD_OUT="failed" "$HERE/install.sh" "$REPO/dist/zz-test.wgt" >/dev/null 2>&1 \
  && fail "install sans « install completed » doit échouer" || ok "install sans « install completed » échoue"
: > "$TMP/docker.log"
FAKE_INSTALL_OUT="transfer only" "$HERE/install.sh" "$REPO/dist/zz-test.wgt" >/dev/null 2>&1
grep -q "vd_appinstall cimaise001" "$TMP/docker.log" && ok "repli vd_appinstall" || fail "repli vd_appinstall"
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
mkdir -p "$REPO/apps/_t"; EXTRA_CLEAN+=("$REPO/apps/_t")
"$HERE/package.sh" apps/_t >/dev/null 2>&1 && fail "package sans config.xml" || ok "package sans config.xml échoue"
touch "$REPO/apps/_t/config.xml"
"$HERE/package.sh" apps/_t >/dev/null 2>&1   # échoue faute de .wgt produit par le faux docker : normal
grep -q "^TIZEN .* package -t wgt -s cimaise" "$TMP/docker.log" && ok "package appelle tizen package -s profil" || fail "package appelle tizen package -s profil"

# 7 bis. <name> avec espaces : package.sh nomme la sortie sans espace, install.sh l'installe
rm -f "$REPO"/dist/*.wgt; : > "$TMP/docker.log"; FAKE_WGT_DIR="$REPO/dist" "$HERE/package.sh" apps/_t >/dev/null 2>&1
[ -f "$REPO/dist/CleanFrame-bench.wgt" ] && ! ls "$REPO"/dist/*\ *.wgt >/dev/null 2>&1 && ok "package : sortie sans espace" || fail "package : sortie sans espace"
: > "$TMP/docker.log"; "$HERE/install.sh" >/dev/null 2>&1 && ok "install du .wgt produit" || fail "install du .wgt produit"
grep -q "^SDB .* install /work/dist/CleanFrame-bench.wgt" "$TMP/docker.log" && ok "install : sdb install du .wgt produit" || fail "install : sdb install du .wgt produit"
grep -q "^SDB .* vd_appinstall" "$TMP/docker.log" && fail "install : pas de repli vd_appinstall" || ok "install : pas de repli vd_appinstall"
# repli vd_appinstall forcé : la ligne journalisée ne contient ni espace ni caractère spécial du shell
: > "$TMP/docker.log"; FAKE_INSTALL_OUT="transfer only" "$HERE/install.sh" >/dev/null 2>&1
vd="$(grep '^SDB .* vd_appinstall' "$TMP/docker.log" | head -n1 | grep -o 'vd_appinstall.*')"
[[ "$vd" =~ ^vd_appinstall\ [A-Za-z0-9._-]+\ [A-Za-z0-9._/-]+/CleanFrame-bench\.wgt$ ]] && ok "repli vd_appinstall : aucun caractère spécial du shell" || fail "repli vd_appinstall : aucun caractère spécial du shell ($vd)"
rm -f "$REPO/dist/CleanFrame-bench.wgt"
# rebuild → repackage → reinstall : deux package.sh d'affilée, puis install.sh sans argument
FAKE_WGT_DIR="$REPO/dist" "$HERE/package.sh" apps/_t >/dev/null 2>&1
FAKE_WGT_DIR="$REPO/dist" "$HERE/package.sh" apps/_t >/dev/null 2>&1 && ok "package : deuxième passage réussit" || fail "package : deuxième passage réussit"
! ls "$REPO"/dist/*\ *.wgt >/dev/null 2>&1 && [ -f "$REPO/dist/CleanFrame-bench.wgt" ] && ok "package ×2 : aucun .wgt avec espace" || fail "package ×2 : aucun .wgt avec espace"
"$HERE/install.sh" >/dev/null 2>&1 && ok "install sans argument après package ×2" || fail "install sans argument après package ×2"
rm -f "$REPO/dist/CleanFrame-bench.wgt"
# un .wgt au nom non sûr est refusé avec un message clair, sans rien envoyer à la TV
: > "$TMP/docker.log"; touch "$REPO/dist/Clean Frame (bench).wgt"
out="$("$HERE/install.sh" "$REPO/dist/Clean Frame (bench).wgt" 2>&1)"; rc=$?
[ $rc -ne 0 ] && [[ "$out" == *"nom de .wgt invalide"* ]] && ok "install : .wgt au nom non sûr refusé" || fail "install : .wgt au nom non sûr refusé"
grep -q "^SDB" "$TMP/docker.log" && fail "install : rien envoyé à la TV si nom refusé" || ok "install : rien envoyé à la TV si nom refusé"
rm -f "$REPO/dist/Clean Frame (bench).wgt"

# 8. aucun secret dans les logs/arguments Docker ni dans la sortie
: > "$TMP/docker.log"
all="$("$HERE/setup-profile.sh" 2>&1; "$HERE/install.sh" "$REPO/dist/zz-test.wgt" 2>&1; "$HERE/list-apps.sh" 2>&1)"
grep "^DOCKER" "$TMP/docker.log" | grep -q "$SECRET" && fail "mot de passe absent des arguments docker" || ok "mot de passe absent des arguments docker"
[[ "$all" == *"$SECRET"* ]] && fail "mot de passe absent des sorties" || ok "mot de passe absent des sorties"
grep -q -- "^DOCKER .*--env-file" "$TMP/docker.log" && ok "secrets passés par env-file" || fail "secrets passés par env-file"

# 8 bis. cert-manager : ouvre le Certificate Manager sur l'affichage de l'hôte (X11/XWayland)
check "cert-manager.sh exécutable + syntaxe" bash -c "[ -x '$HERE/cert-manager.sh' ] && bash -n '$HERE/cert-manager.sh'"
: > "$TMP/docker.log"
out="$(env -u DISPLAY -u WAYLAND_DISPLAY CIMAISE_WEB_PORT=6099 "$HERE/cert-manager.sh" 2>&1)"; rc=$?
[ $rc -eq 0 ] && [[ "$out" == *"http://"*":6099/vnc.html"* ]] && ok "cert-manager sans DISPLAY → mode web, URL affichée" || fail "cert-manager sans DISPLAY → mode web, URL affichée"
pw="$(sed -n 's/^Mot de passe.*: //p' <<<"$out")"
[[ "$pw" =~ ^[A-Za-z0-9]{8}$ ]] && ok "mot de passe VNC affiché (8 caractères)" || fail "mot de passe VNC affiché (8 caractères)"
out2="$(env -u DISPLAY "$HERE/cert-manager.sh" --web 2>&1)"
[ "$pw" != "$(sed -n 's/^Mot de passe.*: //p' <<<"$out2")" ] && ok "mot de passe différent à chaque lancement" || fail "mot de passe différent à chaque lancement"
grep -q -- "^DOCKER run .*-e CIMAISE_VNC_PW " "$TMP/docker.log" && ! grep -q -- "$pw" "$TMP/docker.log" && ok "mot de passe VNC hors ligne de commande docker" || fail "mot de passe VNC hors ligne de commande docker"
grep -q -- "^DOCKER run .*web-session.sh" "$TMP/docker.log" && ok "mode web lance web-session.sh" || fail "mode web lance web-session.sh"
check "web-session.sh syntaxe" bash -n "$HERE/web-session.sh"
check "web-session.sh n'expose pas CIMAISE_VNC_PW en ligne de commande" bash -c "! grep -E '(storepasswd|-passwd [^f]|-rfbauth)' '$HERE/web-session.sh' && ! grep -E '^[^#]*(x11vnc|websockify|openbox|Xvfb)[^&]*CIMAISE_VNC_PW' '$HERE/web-session.sh'"
check "cert-manager (hôte) lance le Certificate Manager hors dépôt (pas de workspace/)" grep -q 'cd "$(mktemp -d)"' "$HERE/cert-manager.sh"
DF="$HERE/docker/Dockerfile"
check "Dockerfile : Firefox du dépôt Mozilla signé + xdg-utils" bash -c "grep -q 'packages.mozilla.org/apt' '$DF' && grep -q 'signed-by=' '$DF' && grep -Eq 'install .*firefox' '$DF' && grep -q 'xdg-utils' '$DF'"
check "Dockerfile : bac à sable de Firefox non désactivé" bash -c "! grep -Ev '^[[:space:]]*#' '$DF' | grep -Eiq 'MOZ_[A-Z_]*SANDBOX|no-sandbox'"
check "Dockerfile : termine sur USER tizen (pas de Certificate Manager en root)" bash -c "[ \"\$(grep -E '^USER ' '$DF' | tail -n1)\" = 'USER tizen' ]"
check "web-session.sh lance le Certificate Manager hors dépôt" grep -q 'cd "$D" && /home/tizen' "$HERE/web-session.sh"
# Le mode hôte monte /tmp/.X11-unix : sans serveur X11/XWayland (CI, machine sans session graphique), on saute.
if [ -d /tmp/.X11-unix ]; then
: > "$TMP/docker.log"
mkdir -p "$TMP/local/SamsungCertificate/cimaise"
echo fake > "$TMP/local/SamsungCertificate/cimaise/author.p12"
echo fake > "$TMP/local/SamsungCertificate/cimaise/distributor.p12"
touch "$TMP/xauth"
DISPLAY=:0 XAUTHORITY="$TMP/xauth" "$HERE/cert-manager.sh" >/dev/null 2>&1 && ok "cert-manager (affichage X11)" || fail "cert-manager (affichage X11)"
grep -q -- "^DOCKER run .*/tmp/.X11-unix" "$TMP/docker.log" && ok "cert-manager monte le socket X11" || fail "cert-manager monte le socket X11"
grep -q -- "^DOCKER run .*SamsungCertificate:/home/tizen/SamsungCertificate" "$TMP/docker.log" && ok "cert-manager monte ~/SamsungCertificate (persistant)" || fail "cert-manager monte ~/SamsungCertificate (persistant)"
grep -q -- "^DOCKER run .*DISPLAY=:0" "$TMP/docker.log" && ok "cert-manager transmet DISPLAY" || fail "cert-manager transmet DISPLAY"
grep -q -- "^DOCKER run .*XAUTHORITY" "$TMP/docker.log" && ok "cert-manager transmet l'autorisation X" || fail "cert-manager transmet l'autorisation X"
[ -f "$TMP/local/certs/author.p12" ] && [ -f "$TMP/local/certs/distributor.p12" ] && ok "cert-manager range author.p12 et distributor.p12 dans .local/certs" || fail "cert-manager range author.p12 et distributor.p12 dans .local/certs"

# 8 ter. L'auteur Tizen de la voie CLI déjà en place ne doit pas supplanter la paire Samsung
rm -rf "$TMP/local/certs"; mkdir -p "$TMP/local/certs" "$TMP/local/tizen-studio-data/keystore/author"
echo cli-author > "$TMP/local/certs/author.p12"
echo cli-author > "$TMP/local/tizen-studio-data/keystore/author/author.p12"
echo samsung-author > "$TMP/local/SamsungCertificate/cimaise/author.p12"
echo samsung-dist > "$TMP/local/SamsungCertificate/cimaise/distributor.p12"
DISPLAY=:0 XAUTHORITY="$TMP/xauth" "$HERE/cert-manager.sh" >/dev/null 2>&1
[ "$(cat "$TMP/local/certs/author.p12")" = samsung-author ] && [ "$(cat "$TMP/local/certs/distributor.p12")" = samsung-dist ] \
  && ok "cert-manager : la paire Samsung remplace l'auteur CLI" || fail "cert-manager : la paire Samsung remplace l'auteur CLI"
[ "$(cat "$TMP/local/certs/author.cli.p12" 2>/dev/null)" = cli-author ] && ok "cert-manager : auteur CLI sauvegardé en author.cli.p12" || fail "cert-manager : auteur CLI sauvegardé en author.cli.p12"
# distributeur Samsung sans auteur Samsung : l'auteur du keystore (CLI) n'est jamais pris
rm -rf "$TMP/local/certs" "$TMP/local/SamsungCertificate/cimaise"; mkdir -p "$TMP/local/certs"
mkdir -p "$TMP/local/SamsungCertificate/cimaise"; echo samsung-dist > "$TMP/local/SamsungCertificate/cimaise/distributor.p12"
DISPLAY=:0 XAUTHORITY="$TMP/xauth" "$HERE/cert-manager.sh" >/dev/null 2>&1
[ ! -e "$TMP/local/certs/author.p12" ] && ok "cert-manager : pas d'auteur du keystore quand un distributeur Samsung est présent" || fail "cert-manager : pas d'auteur du keystore sans paire Samsung"
else
  skip "cert-manager (affichage X11), cas 8 bis/ter : /tmp/.X11-unix absent"
fi

# 9 bis. Cible TV2 (CIMAISE_TV=tv2) : env, profil, dist/tv2 et required_version séparés ; défaut inchangé.
cat > "$TMP/local/tizen.env.tv2" <<ENV
TV_IP=10.2.2.2
APP_ID=cimaise001.Cimaise
APP_DIR=apps/tv
SIGN_PROFILE=cimaise-tv2
REQUIRED_VERSION=4.0
AUTHOR_CERT=/work/.local/certs/tv2-tizen-author.p12
AUTHOR_PASSWORD=$SECRET
DISTRIBUTOR_CERT=/home/tizen/tizen-studio/tools/certificate-generator/certificates/distributor/sdk-public/tizen-distributor-signer.p12
DISTRIBUTOR_PASSWORD=$SECRET
ENV
out="$(CIMAISE_TV=frame2 "$HERE/list-apps.sh" 2>&1)"; rc=$?
[ $rc -ne 0 ] && [[ "$out" == *"inconnue"* ]] && ok "CIMAISE_TV inconnue → refus" || fail "CIMAISE_TV inconnue → refus"
: > "$TMP/docker.log"; CIMAISE_TV=tv2 "$HERE/list-apps.sh" >/dev/null 2>&1
grep -q "connect 10.2.2.2:26101" "$TMP/docker.log" && ! grep -q "10.9.8.7" "$TMP/docker.log" && ok "tv2 : IP lue dans tizen.env.tv2" || fail "tv2 : IP lue dans tizen.env.tv2"
grep -q -- "--env-file $TMP/local/tizen.env.tv2" "$TMP/docker.log" && ok "tv2 : env-file tizen.env.tv2" || fail "tv2 : env-file tizen.env.tv2"
: > "$TMP/docker.log"; CIMAISE_TV=tv2 "$HERE/launch.sh" >/dev/null 2>&1
grep -q "^SDB .* shell 0 was_execute cimaise001.Cimaise" "$TMP/docker.log" && grep -q "connect 10.2.2.2" "$TMP/docker.log" && ok "tv2 : launch" || fail "tv2 : launch"
# profil Samsung dans l'env TV2 : refusé avant tout appel
sed 's/^SIGN_PROFILE=.*/SIGN_PROFILE=cimaise/' "$TMP/local/tizen.env.tv2" > "$TMP/tv2-bad"; cp "$TMP/local/tizen.env.tv2" "$TMP/tv2-good"; cp "$TMP/tv2-bad" "$TMP/local/tizen.env.tv2"
: > "$TMP/docker.log"; CIMAISE_TV=tv2 "$HERE/package.sh" apps/_t >/dev/null 2>&1 && fail "tv2 : profil « cimaise » refusé" || { [ -s "$TMP/docker.log" ] && fail "tv2 : profil « cimaise » refusé (docker appelé)" || ok "tv2 : profil « cimaise » refusé"; }
cp "$TMP/tv2-good" "$TMP/local/tizen.env.tv2"
# package tv2 : profil cimaise-tv2, sortie dist/tv2, required_version 4.0 dans la copie, source intacte
printf '<widget>\n  <tizen:application id="cimaise001.Cimaise" package="cimaise001" required_version="5.0"/>\n</widget>\n' > "$REPO/apps/_t/config.xml"
src_sum="$(sha256sum "$REPO/apps/_t/config.xml")"
: > "$TMP/docker.log"; rm -f "$TMP/staged-config.xml"; FAKE_WGT_DIR="$REPO/dist/tv2" CIMAISE_TV=tv2 "$HERE/package.sh" apps/_t >/dev/null 2>&1 && ok "tv2 : package" || fail "tv2 : package"
grep -q "^TIZEN .* package -t wgt -s cimaise-tv2 -o /work/dist/tv2 -- /work/dist/tv2/.stage-app" "$TMP/docker.log" && ok "tv2 : profil cimaise-tv2, sortie dist/tv2" || fail "tv2 : profil cimaise-tv2, sortie dist/tv2"
grep -q 'required_version="4.0"' "$TMP/staged-config.xml" 2>/dev/null && ok "tv2 : required_version 4.0 dans la copie" || fail "tv2 : required_version 4.0 dans la copie"
[ "$(sha256sum "$REPO/apps/_t/config.xml")" = "$src_sum" ] && ok "tv2 : config.xml source inchangé" || fail "tv2 : config.xml source inchangé"
[ -f "$REPO/dist/tv2/CleanFrame-bench.wgt" ] && ! ls "$REPO"/dist/*.wgt >/dev/null 2>&1 && ok "tv2 : .wgt dans dist/tv2 seulement" || fail "tv2 : .wgt dans dist/tv2 seulement"
# sans REQUIRED_VERSION, le package TV2 est refusé
grep -v '^REQUIRED_VERSION' "$TMP/tv2-good" > "$TMP/local/tizen.env.tv2"
CIMAISE_TV=tv2 "$HERE/package.sh" apps/_t >/dev/null 2>&1 && fail "tv2 : REQUIRED_VERSION exigée" || ok "tv2 : REQUIRED_VERSION exigée"
cp "$TMP/tv2-good" "$TMP/local/tizen.env.tv2"
# install tv2 : prend dist/tv2 ; refuse un paquet de dist/ (Frame)
: > "$TMP/docker.log"; CIMAISE_TV=tv2 "$HERE/install.sh" >/dev/null 2>&1 && ok "tv2 : install" || fail "tv2 : install"
grep -q "^SDB .* install /work/dist/tv2/CleanFrame-bench.wgt" "$TMP/docker.log" && grep -q "connect 10.2.2.2" "$TMP/docker.log" && ok "tv2 : install du paquet dist/tv2 sur TV2" || fail "tv2 : install du paquet dist/tv2 sur TV2"
: > "$TMP/docker.log"; FAKE_INSTALL_OUT="transfer only" CIMAISE_TV=tv2 "$HERE/install.sh" >/dev/null 2>&1
grep -q "^SDB .* push /work/dist/tv2/CleanFrame-bench.wgt" "$TMP/docker.log" && ok "tv2 : repli vd_appinstall depuis dist/tv2" || fail "tv2 : repli vd_appinstall depuis dist/tv2"
: > "$TMP/docker.log"; out="$(CIMAISE_TV=tv2 "$HERE/install.sh" "$REPO/dist/zz-test.wgt" 2>&1)"
[[ "$out" == *"dist/tv2/"* ]] && ! grep -q "^SDB" "$TMP/docker.log" && ok "tv2 : paquet de la Frame refusé" || fail "tv2 : paquet de la Frame refusé"
: > "$TMP/docker.log"; "$HERE/install.sh" "$REPO/dist/tv2/CleanFrame-bench.wgt" >/dev/null 2>&1 && fail "Frame : paquet TV2 refusé" || ok "Frame : paquet TV2 refusé"
rm -f "$REPO/dist/tv2/CleanFrame-bench.wgt"
# défaut (Frame) inchangé : profil cimaise, sortie dist/, required_version non touché, aucune ligne « cible »
: > "$TMP/docker.log"; rm -f "$TMP/staged-config.xml"; out="$("$HERE/package.sh" apps/_t 2>&1)"
grep -q "^TIZEN .* package -t wgt -s cimaise -o /work/dist -- /work/dist/.stage-app" "$TMP/docker.log" && ok "Frame : package inchangé" || fail "Frame : package inchangé"
grep -q 'required_version="5.0"' "$TMP/staged-config.xml" 2>/dev/null && ok "Frame : required_version d'origine" || fail "Frame : required_version d'origine"
[[ "$out" != *"cible"* ]] && ok "Frame : sortie sans ligne cible" || fail "Frame : sortie sans ligne cible"
# setup-profile tv2 : ajoute cimaise-tv2, garde actif et profil « cimaise », sans afficher de secret
mkdir -p "$TMP/local/tizen-studio-data/profile"; PX="$TMP/local/tizen-studio-data/profile/profiles.xml"
printf '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n<profiles active="cimaise" version="3.1">\n<profile name="cimaise">\n<profileitem ca="" distributor="0" key="/work/.local/certs/author.p12" password="frame-pw" rootca=""/>\n</profile>\n</profiles>\n' > "$PX"
frame_block="$(sed -n '/<profile name="cimaise">/,/<\/profile>/p' "$PX")"
out="$(CIMAISE_TV=tv2 "$HERE/setup-profile.sh" 2>&1; CIMAISE_TV=tv2 "$HERE/setup-profile.sh" 2>&1)"
grep -q '<profiles active="cimaise"' "$PX" && ok "setup-profile tv2 : profil actif inchangé" || fail "setup-profile tv2 : profil actif inchangé"
[ "$(sed -n '/<profile name="cimaise">/,/<\/profile>/p' "$PX")" = "$frame_block" ] && ok "setup-profile tv2 : profil cimaise inchangé" || fail "setup-profile tv2 : profil cimaise inchangé"
[ "$(grep -c '<profile name="cimaise-tv2">' "$PX")" = 1 ] && grep -q 'key="/work/.local/certs/tv2-tizen-author.p12"' "$PX" && ok "setup-profile tv2 : un seul profil cimaise-tv2 (relançable)" || fail "setup-profile tv2 : un seul profil cimaise-tv2 (relançable)"
[[ "$out" != *"$SECRET"* ]] && ok "setup-profile tv2 : aucun mot de passe affiché" || fail "setup-profile tv2 : aucun mot de passe affiché"
grep "^DOCKER" "$TMP/docker.log" | grep -q "$SECRET" && fail "setup-profile tv2 : mot de passe hors arguments docker" || ok "setup-profile tv2 : mot de passe hors arguments docker"
[ -f "$PX.avant-cimaise-tv2" ] && ok "setup-profile tv2 : sauvegarde de profiles.xml" || fail "setup-profile tv2 : sauvegarde de profiles.xml"
sed -i 's/active="cimaise"/active="cimaise-tv2"/' "$PX"
CIMAISE_TV=tv2 "$HERE/setup-profile.sh" >/dev/null 2>&1 && fail "setup-profile tv2 : refuse de réécrire le profil actif" || ok "setup-profile tv2 : refuse de réécrire le profil actif"

# 9. rien de secret versionné
cd "$REPO" && ! git ls-files | grep -Eq '\.(p12|pfx|key|pem)$|(^|/)\.local/' && ok "aucun secret suivi par git" || fail "aucun secret suivi par git"

echo; [ $FAILS -eq 0 ] && echo "tout est vert" || { echo "$FAILS échec(s)"; exit 1; }
