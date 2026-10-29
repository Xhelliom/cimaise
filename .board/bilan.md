# Bilan — pastille Smart Hub + indicateur Réseau

Fait :
- Pastille Smart Hub : lance l'app cible des préférences (`prefs.smartHubApp`, vide par défaut, aucun ID en dur), repli `hide()` vers le Smart Hub.
- Réseau : plus de pastille ; alerte « Réseau coupé » non focalisable, visible seulement si coupé, par événement (`webapis.network`), cachée hors TV.
- Privilège `network.public` déclaré ; méthode, sources et réserves dans `docs/decisions.md`.
- `npm run check` : 359 tests verts.

Pas fait / à valider sur la TV (non lancé) :
- Que `hide()` ramène bien au Smart Hub (source : forum, pas la doc officielle).
- Quelle app cible convient (Eden ?) ; aucun écran de réglage pour poser l'ID (hors carte).
- Privilège `network.public` et délai de détection (30-40 s si le routeur tombe).
