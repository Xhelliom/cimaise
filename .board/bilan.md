# Bilan — remontée de la progression au serveur

## Fait
- `packages/plex/src/progress.ts` : `createProgress` (horloge et transport injectables). `/:/timeline` à chaque changement d'état (playing/paused) et toutes les 10 s ; `stopped` à l'arrêt avec la position (reste côté serveur pour « Reprendre ») ; scrobble dès 90 % ou fin de flux, une seule fois (retenté tant qu'il échoue). Erreurs réseau et transport qui lève : sans effet, nouvel essai au tick suivant. En-têtes X-Plex-* complets via `serverGet`.
- Caches : `Cache.remove`, `Data.progressed` (fiche `m:` corrigée sur place : viewOffset / viewCount ; « En cours », saison et série invalidés). Fiche et accueil se rechargent à `resume()`.
- Tests : `tests/plex-progress.test.mjs` (11), faux serveur et horloge simulée, aucun accès réseau. `npm run check` vert (223 tests).

## Non fait / à noter
- Aucun écran de lecture n'existe encore (`onPlay` est un stub) : `createProgress` n'est donc branché à aucun lecteur. Le raccordement (AVPlay onTime/onEnd/onSuspend → `playing/paused/stop`, puis `data.progressed` dans `onFinish`) relève de la carte du lecteur.
- Le `stopped` final n'est pas retenté s'il échoue (rien ne suit) ; la dernière timeline à 10 s max reste côté serveur.
- Pas de test DOM du rechargement au `resume()` (vérifié par typecheck et tests existants seulement).
- Validation réelle sur la TV avec Stéphane.
