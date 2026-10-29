# Bilan — audio et sous-titres : VO sous-titrée, réglages du module Plex

## Fait
- Réglages de langues déplacés des Réglages globaux vers **Plex → Réglages** (4ᵉ rangée de l'accueil Plex, `packages/plex/src/ui/settings.ts`).
- Migration du schéma `cimaise.v1` v2 → v3 (`plexAudioLang`/`plexSubLang` → `plexLang`, mode `custom`), testée.
- Modes : « VO sous-titrée » (défaut), « Français si disponible », « Personnalisé » (3 langues audio + 3 de sous-titres ordonnées) ; forcés de la langue de l'audio toujours activés ; SRT préféré à PGS/ASS de même langue (`playback/tracks.ts`).
- VO : Plex ne fournit pas de langue d'origine (vérifié sur le serveur, lecture seule) → piste audio « default », sinon la première. Règle et limites dans `docs/decisions.md`.
- Choix manuel par série toujours prioritaire. `npm run check` vert (511 tests).

## Non fait / à noter
- Migration : l'ancien « audio X + sous-titres Y toujours » n'existe plus (le mode Personnalisé n'affiche les sous-titres que si l'audio n'est pas compris) ; documenté.
- Non testé sur la TV (écran Réglages Plex, navigation télécommande) : à valider physiquement.
