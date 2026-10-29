# Bilan — catalogue d'apps et lancement via l'adaptateur
Fait :
- tv-core/device.ts : `launchApp(id, onOk, onErr)` (launch, repli launchAppControl) et `listInstalledApps(onOk, onErr)` (getAppsInfo → id, nom, icône). NO_TIZEN hors TV, NO_APP_ID si ID vide, LAUNCH_FAILED / LIST_FAILED ; aucun succès simulé.
- packages/launcher/src/catalog (model, defaults, store, index) : CatalogEntry {id, name, color, icon?, type 'interne'|'tv', todo?}, catalogue par défaut (Plex intégré, Plex officiel, Netflix, YouTube, Disney+, Canal+, Smart Hub) avec IDs TV vides marqués « ID à relever en M0 », persistance dans `cimaise.v1` (prefs.catalog versionné, migration v0 → v1), addApp / removeApp / moveApp, `launchEntry` (erreur claire sans ID).
- Tests : tests/catalog.test.mjs (nouveau), 2 tests ajoutés dans tests/tv-core.test.mjs. `npm run check` vert (131 tests).
Non fait / à noter :
- Le catalogue n'est pas exporté par l'index du launcher (noms `DiscoveredApp` en conflit avec settings/model.ts, bundle initial inchangé) et l'écran Réglages / l'accueil ne l'utilisent pas encore : branchement = autre carte (settings/model.ts garde son propre AppEntry avec `tint`).
- Aucun rendu visuel : rien à publier.
