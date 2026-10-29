# Bilan — CSS compatible avec le moteur de la TV

**Fait**
- `gap` remplacé dans les feuilles de l'app, user agent dans le diagnostic (commit d832831).
- Reprise : le CSS livré (`apps/tv/dist/app.css`) contenait des `#rrggbbaa` et pouvait recevoir `inset`. Le build CSS (`scripts/build/css-build.mjs`) fixe `target: 'chrome56'` ; `check:css` lit aussi `apps/*/dist/**/*.css` et refuse les couleurs à 8 chiffres ; tests dans `tests/css-compat.test.mjs`. Choix noté dans `docs/decisions.md`.
- `npm run check` vert (310 tests), plus aucun `#rrggbbaa` dans `dist/app.css`.

**Pas fait / à suivre**
- Le user agent réel de la Frame reste à relever (touche 0) ; `chrome56` est prudent, à relever si le moteur est plus récent.
- Rien vérifié sur la TV elle-même.
