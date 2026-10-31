# Image Tizen Studio CLI pour cimaise (voir docs/decisions.md, « SDK Tizen via Docker »).
# Contient `tizen` et `sdb` ; aucun secret. Les paquets graphiques (Xvfb, openbox, x11vnc, noVNC) servent au seul Certificate Manager (cert-manager.sh).
FROM ubuntu:22.04

ARG DEBIAN_FRONTEND=noninteractive
ARG TIZEN_STUDIO_VERSION=5.6
ARG TIZEN_UID=1000

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ca-certificates curl wget unzip zip file pciutils \
      openjdk-17-jre-headless libssl3 libxml2-utils \
      libkrb5-3 zlib1g libncurses6 libfontconfig1 ca-certificates-java \
      rpm2cpio cpio libkf5itemmodels5 libkf5kiowidgets5 libkchart2 \
 && rm -rf /var/lib/apt/lists/*

RUN useradd --create-home --uid ${TIZEN_UID} --shell /bin/bash tizen
USER tizen
ENV HOME=/home/tizen
WORKDIR /home/tizen

# Installeur CLI officiel (sans GUI), épinglé sur une version.
RUN curl -fsSL -o /tmp/installer.bin \
      "https://download.tizen.org/sdk/Installer/tizen-studio_${TIZEN_STUDIO_VERSION}/web-cli_Tizen_Studio_${TIZEN_STUDIO_VERSION}_ubuntu-64.bin" \
 && chmod +x /tmp/installer.bin \
 && /tmp/installer.bin --accept-license /home/tizen/tizen-studio \
 && rm /tmp/installer.bin

ENV PATH="/home/tizen/tizen-studio/tools:/home/tizen/tizen-studio/tools/ide/bin:${PATH}"

# Extensions. Tizen Studio 5.6 n'expose plus qu'une seule extension TV Samsung
# (TV-SAMSUNG-Public = « TV Extensions-10.0 ») ; elle sert aussi les TV Tizen 5.0
# via `required_version` du config.xml. cert-add-on = extension de certificats
# Samsung (profils auteur + distributeur).
ARG TIZEN_PACKAGES=TV-SAMSUNG-Public-WebAppDevelopment,cert-add-on
RUN /home/tizen/tizen-studio/package-manager/package-manager-cli.bin install \
      --accept-license --no-java-check ${TIZEN_PACKAGES}

LABEL org.cimaise.tizen-studio="${TIZEN_STUDIO_VERSION}"

# Certificate Manager (SWT/GTK3) : bibliothèques graphiques pour l'afficher sur l'hôte
# via X11/XWayland (scripts/tizen/cert-manager.sh). Pas utilisées par la CLI.
USER root
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      libgtk-3-0 libwebkit2gtk-4.0-37 libcanberra-gtk3-module libxtst6 libgl1 \
      xauth adwaita-icon-theme fonts-dejavu-core \
 && rm -rf /var/lib/apt/lists/*
USER tizen

# Mode web de cert-manager.sh (VM sans session graphique) : serveur X virtuel, gestionnaire de
# fenêtres minimal, VNC et noVNC (HTML/JS statique + websockify).
USER root
RUN apt-get update \
 && apt-get install -y --no-install-recommends xvfb openbox x11vnc novnc websockify \
 && rm -rf /var/lib/apt/lists/*
USER tizen
