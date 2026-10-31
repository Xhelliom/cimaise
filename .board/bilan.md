# Bilan : badges techniques de la fiche Plex (30/10)

Rien de tout ça n'existait sur la base (a90b55f).

## Fait
- `packages/plex/src/playback/badges.ts` : `techBadges(item, prefs)` lit Media/Stream et appelle **`decidePlayback`** avec les
  **mêmes réglages de langue que le lecteur** (`langPrefsFor`) : même version, même piste audio, mêmes sous-titres, donc
  « Lecture directe » / « Transcodé » est ce que fera Lire, par construction. Pilules : définition (4K/1080p/720p/SD),
  Dolby Vision / HDR10 / HLG, canaux de la piste audio retenue (Mono, Stéréo, 5.1, 7.1), « Audio FR · EN », « Sous-titres FR · EN +N »
  (3 langues max), puis le mode (vert direct, ambre transcodé).
- `ui/detail.ts` : ligne méta + pilules sous le titre, recalculées à l'arrivée de la fiche complète seulement (pas à chaque touche).
  Rien pour une série ou une fiche sans Stream. Texte seul, **aucune image**.
- Coût : plex.js +1,7 Ko (chunk différé), app.css +0,4 Ko, JS initial inchangé.
- Tests : 3 dans `tests/plex-playback.test.mjs` (fiches réelles anonymisées), 1 dans `tests/plex-ui.test.mjs`. `npm test` : 717/717.

## Vérifié sur le vrai serveur (`node scripts/plex/verify-badges.mjs`, lecture seule)
| Cas | Faits | Pilules | Lecteur |
|---|---|---|---|
| 4K HDR (10 Things I Hate About You) | 3840×2076, HEVC smpte2084, AC3 6 ch, sous-titres PGS seuls | 4K · HDR10 · 5.1 · Audio EN · Sous-titres EN · AR · BG +6 · **Transcodé** | Transcodage : PGS incrustés |
| 4K Dolby Vision (28 Years Later) | 3840×1392, HEVC DOVI p8, DTS/TrueHD/AC3, SRT | 4K · Dolby Vision · 5.1 · Audio FR · EN · Sous-titres FR · EN · **Lecture directe** | Direct : piste AC3 choisie |
| DTS (Ad Astra) | H.264 1080p, DTS seul 6 ch, SRT | 1080p · 5.1 · Audio EN · Sous-titres EN · FR · **Transcodé** | Transcodage : audio dca |
| SRT (21) | HEVC 1080p, AC3, SRT externe | 1080p · 5.1 · Audio EN · Sous-titres EN · NL · CS +9 · **Lecture directe** | Direct |

Captures (aperçu navigateur, vrai serveur) publiées sur la carte : `fiche-4k-hdr10-pgs`, `fiche-4k-dolby-vision-direct`,
`fiche-dts-transcode`, `fiche-srt-direct`.

## Pas fait / limites
- **Pas vu sur la Frame** : vérifié dans l'aperçu Chromium uniquement.
- Un fichier qui a une piste DTS **et** une piste lisible (28 Years Later) est annoncé « Lecture directe » : c'est ce que fait
  le lecteur (il prend la piste AC3). La pilule « 5.1 » est celle de la piste retenue, pas forcément la meilleure du fichier.
- Dolby Vision profil 8 affiché « Dolby Vision » alors que la TV lira la base HDR10 : la pilule décrit le fichier, pas l'affichage.
- Série : pas de pilules (la liste des épisodes n'a pas les Stream ; les demander coûterait une requête par épisode).
