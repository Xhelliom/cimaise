# État de NOTRE TV (Samsung The Frame 2019, LS03R, Tizen 5.0)

Modèle exact et firmware : à relever en M0.

## Observé physiquement

Ce qui a été vu à l'écran ou constaté sur la TV.

_(rien pour l'instant)_

## Réponse du SDK

Ce que `sdb`, le packager ou le SDK ont répondu. Ne prouve pas un succès visible.

_(rien pour l'instant)_

## Non testé

Hypothèses et points à vérifier (voir HANDOFF §11).

- Modèle exact, firmware, version du moteur web
- `required_version` minimal accepté
- Codecs, HDR, pistes et sous-titres sous AVPlay
- HTTPS auto-signé (phase 2)
- Autorun après le mode Art et après coupure de courant
- Persistance de l'app en arrière-plan

- **Sous-titres et pistes (lecteur Plex)** : rendu maison des sous-titres, SRT externe par `setExternalSubtitlePath`, menu des pistes, relance du flux au changement de piste, langues par défaut : **non testé sur la TV**, uniquement avec faux AVPlay (voir `docs/decisions.md`, « Sous-titres et pistes audio »).

## Banc d'essai des formats (AVPlay) — à remplir devant la Frame

Échantillons **proposés** d'après le vrai serveur Plex (lecture seule, 2026-10-29). Les colonnes **Observé** et **Confirmé** restent vides tant que rien n'a été vu à l'écran (HANDOFF §10). « Attendu » = décision actuelle de `FRAME_2019_PROFILE` / `decidePlayback`, qui est une hypothèse, pas un résultat.

Un échantillon par cas quand c'est possible, choisi pour n'isoler qu'une variable (H.264 8 bits ≤ L4.1 pour les cas audio et sous-titres). Bibliothèque : AVI/MPEG-4 677 fiches, HEVC Main 10 4K 115, HDR10 70, DV p8 111, H.264 > L5.1 17, AC3 908, E-AC3 1457, Opus 19, FLAC 3.

| Cas | Échantillon (ratingKey) | Conteneur / codecs / niveau | Attendu (profil actuel) | Observé | Confirmé |
|---|---|---|---|---|---|
| AVI + MPEG-4 ASP | Kaamelott S4E99 (3387), 7 min ; alternative How I Met Your Mother S3E12 (2924) | avi, mpeg4 Advanced Simple L5, 640×352, ac3 5.1 / mp3 ; SRT externe sur 2924 | Transcodage (avi absent du profil) ; à tester en direct, puis ajouter `avi` et `mpeg4` si lu | | |
| HEVC Main 10 4K | The Bear S1E7 (17264), 20 min ; alternative Futurama S8E4 (14902) | mkv, hevc Main 10 L153, 3840×2160 SDR, eac3 5.1 | Direct | | |
| HDR10 | Still Up S1E5 (15252), 26 min ; alternative Widow's Bay S1E9 (30913) | mkv, hevc Main 10 L150, smpte2084, eac3 5.1 | Direct | | |
| Dolby Vision profil 8 (repli HDR10) | Hacks S4E10 (26018), 32 min ; alternative Hacks S5E1 (30773) | mkv, hevc Main 10 L153, DV p8 (compat 1 = HDR10), eac3 5.1 | Direct (seul le profil 5 est exclu) | | |
| H.264 niveau > 5.1 | Rick and Morty S1E5 (3763), 20 min ; alternative S1E6 (3764) | mp4, h264 High L5.2, 1280×720, aac stéréo, SRT externe en/fr | Direct (le niveau n'est pas vérifié par `decidePlayback`) | | |
| AC3 | Futurama S7E19 (2744), 20 min ; alternative Les Cités d'or S1E6 (32157) | mkv, h264 High L4.1, ac3 5.1 | Direct | | |
| E-AC3 | Bluey S3E39 (26265), 6 min ; alternative S3E1 (19745) | mkv, h264 High L4.0 1080p, eac3 5.1 fra/eng | Direct | | |
| Opus | **Aucun sans AV1.** Andor S1E2 (10025), 36 min : opus 5.1 mais vidéo AV1 L8 | mkv, av1 Main, opus 5.1 | Transcodage (opus et av1 absents) ; un échec ne dirait pas lequel des deux est en cause | | |
| FLAC | C'est arrivé près de chez vous (31451), 96 min ; alternative : FLAC secondaire dans IT: Welcome to Derry S1E4 (26408) | mkv, h264 High L4.1, flac stéréo fra | Transcodage (flac absent) | | |
| SRT interne | Bluey S1E1 (19691), 7 min ; alternative S1E2 (19692) | mkv, h264 L4.0, aac/eac3, 2 SRT internes en | Direct, `setSelectTrack` | | |
| SRT externe | Rick and Morty S1E5 (3763), 20 min ; alternative Bluey S1E1 (19691) | mp4 ou mkv, SRT externes en/fr | Direct, `setExternalSubtitlePath` | | |

Cas sans échantillon propre : **Opus** seul (voir ligne). Rappel : un cas dont le lecteur échoue n'est retiré du profil qu'après observation à l'écran ; sinon `confirmed` reste à false.
