# Bilan — écran lecteur Plex sur AVPlay

**Fait** : `packages/plex/src/ui/player.ts` (reprise, ±10 s, pause/médias, pistes, masquage 3 s, Retour/Stop, visibilitychange, erreur + Plex officiel trouvé par nom),
branché sur Lire (fiche, épisodes) ; `webapis.js` dans `index.html` ; privilège `internet` ; documenté dans `docs/decisions.md`. `npm run check` vert (244 tests).

**Pas fait / non vérifié** : rien testé sur la TV (transparence de la page sur la couche vidéo, privilège `internet`, comportement réel d'AVPlay).
La doc Samsung ne cite aucun privilège `avplay` (seul `drmplay`, non utilisé). Le choix de pistes ne marque pas la piste courante (AVPlay ne l'expose pas simplement).
