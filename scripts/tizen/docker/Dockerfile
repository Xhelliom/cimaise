# Image Tizen Studio CLI pour cimaise (voir docs/decisions.md, « SDK Tizen via Docker »).
# Contient `tizen` et `sdb` ; aucune interface graphique, aucun secret.
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
