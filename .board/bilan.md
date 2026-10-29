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
