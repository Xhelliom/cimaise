# Bilan

**Fait** : le chunk Réglages transmet désormais le mode de l'accueil. `SettingsArg` déclare `mode?: HomeMode` et `onMode?`, et `createPanel` les passe à `createSettings` (apps/tv/src/chunks/settings.ts). Sur la TV, la ligne « Affichage de l'accueil » reflète le mode courant, et la basculer appelle `saveHomeMode` puis `home.setMode`.

**Test** : tests/app.test.mjs passe par le vrai chunk. Il ouvre les Réglages, bascule la ligne Affichage, vérifie que `prefs.homeMode` vaut `rangee` dans `cimaise.v1` et que l'accueil passe en `rangee`. Il rouvre les Réglages (« Une rangée » affiché), rebascule, et contrôle le retour à `grille`. Le test échoue sans le correctif. `npm run check` : 329/329.

**Reste** : rien sur cette carte.
