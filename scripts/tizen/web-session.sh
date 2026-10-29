#!/usr/bin/env bash
# Exécuté DANS le conteneur par cert-manager.sh --web : serveur X virtuel + openbox + x11vnc + noVNC,
# puis le Certificate Manager au premier plan. Le mot de passe VNC arrive par l'env (CIMAISE_VNC_PW),
# jamais en argument. Tout s'arrête avec le Certificate Manager.
set -uo pipefail
: "${CIMAISE_VNC_PW:?}"; PORT="${CIMAISE_WEB_PORT:-6080}"; RES="${CIMAISE_WEB_RES:-1600x1000}"
export DISPLAY=:77 GDK_BACKEND=x11
D="$(mktemp -d)"; pids=()
cleanup() { kill "${pids[@]}" 2>/dev/null; rm -rf "$D"; }
trap cleanup EXIT
Xvfb "$DISPLAY" -screen 0 "${RES}x24" -nolisten tcp >/dev/null 2>&1 & pids+=($!)
for _ in $(seq 50); do [ -S /tmp/.X11-unix/X77 ] && break; sleep 0.2; done
openbox >/dev/null 2>&1 & pids+=($!)
x11vnc -storepasswd "$CIMAISE_VNC_PW" "$D/pw" >/dev/null 2>&1
x11vnc -display "$DISPLAY" -rfbauth "$D/pw" -rfbport 5977 -localhost -forever -shared -quiet >/dev/null 2>&1 & pids+=($!)
websockify --web /usr/share/novnc "$PORT" localhost:5977 >/dev/null 2>&1 & pids+=($!)
/home/tizen/tizen-studio/tools/certificate-manager/certificate-manager
