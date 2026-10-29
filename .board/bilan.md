# Bilan — premier transcodage réel, audio seul (DTS)

Fait : requestTranscode appelé pour la première fois sur le vrai serveur (film MKV H.264 + DTS).
- Deux défauts trouvés et corrigés : sans X-Plex-Client-Profile-Name le serveur répond 400 HTML ; avec « Generic » seul, 4005 (pas de profil HLS) → profil étendu avec cible HLS/MPEG-TS (h264,hevc / aac,ac3).
- maxVideoBitrate et videoResolution font ré-encoder la vidéo : omis pour l'audio seul → videoDecision=copy, audio DTS → AAC 5.1.
- Forme réelle de la décision (1001 « Conversion OK », 2000/4005 refus, 400 HTML) : tests/fixtures/plex/transcode-decision.json + tests dans tests/plex-playback.test.mjs ; docs/plex-audit.md mis à jour.
- Session arrêtée par stopTranscode (200) ; script scripts/plex/capture-transcode.mjs. npm run check : vert.

Non fait : lecture sur la Frame (AVPlay HLS, avance/recul, reprise, progression, arrêt à la sortie, AAC dans le TS) — à observer par Stéphane, rien n'a été lancé sur la TV. Le code lecteur existant (session, offset, timeline, stop) n'a pas été modifié.

## Essai sur la Frame — BLOQUÉ (attente de Stéphane)
Fait : .wgt construit et signé, installé (« install completed », app présente) et lancé sur la Frame ; watch-transcode.mjs lancé et commité.
Non fait : lecture d'un film DTS, saut avant/arrière, sortie, reprise, progression. Raison précise : ces critères ne se voient que sur l'écran de la TV,
Stéphane n'a pas répondu à la demande d'observation, et le relevé serveur ne montre aucune session Cimaise. Rien n'est déduit du SDK.
Reste : Stéphane lit un film DTS (étapes sur la carte), puis on consigne ses observations et les lignes du script dans docs/plex-audit.md et on corrige ce qui casse.

## Correctif de packaging (message de l'orchestrateur)
Le premier .wgt (410 Ko) avait été empaqueté depuis apps/tv (sources + build/, app.js/app.css absents) : chargement infini sur la Frame.
Bonne commande : `npm run build && bash scripts/tizen/package.sh apps/tv/dist` (puis install.sh, launch.sh). Contenu vérifié avant installation :
app.js, app.css, plex.js, settings.js, index.html, local-config.js (exige .local/ha.env), config.xml, icon.png, logos/, fonts/ à la racine, ni src/ ni build/, 148 Ko.
Réinstallé et relancé ; attente de la confirmation visuelle de Stéphane (accueil), puis de l'essai DTS (Bohemian Rhapsody).

## État au 30/10 — bloqué : TV injoignable, critère 3 non observé

- **Fait (SDK / serveur / tests, pas vu sur la TV)** : letterbox (`setDisplayMethod`), « Aucun » sans rechargement, ligne de temps du film + `seekTo` (88f58c0, cause du gel établie côté serveur : liste HLS sur tout le film, segments vides de 188 o avant l'offset). `npm run check` : 569 tests verts.
- **Non observé** : les observations de Stéphane (reprise, ±10 s, progression) datent d'avant 88f58c0 et ne couvrent plus le code actuel. Letterbox, rechargement sans gel, position affichée, et **disparition de la session serveur à la sortie** : jamais vus. Le cycle `watch-transcode.mjs` n'a capté aucune session Cimaise (il a expiré).
- **Blocage** : la Frame ne répond ni au ping ni sur le port 26101 (éteinte, veille profonde ou IP changée). Paquet prêt : `dist/cimaise.wgt` (147 836 o, construit depuis `apps/tv/dist` au commit 88f58c0), non installé.
- **À faire dès que la TV répond** : annoncer, `install.sh` + `launch.sh`, lancer `node scripts/plex/watch-transcode.mjs 2400` pour tout l'essai, puis Stéphane : Bohemian Rhapsody depuis un point de reprise, ±, choix d'une piste (rechargement), gel/position, bandes du letterbox, sortie. Consigner ses constats et les lignes du script montrant la session disparaître.
