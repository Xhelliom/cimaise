# Bilan : Réglages Overseerr (adresse et clé API saisies sur la TV)

## Fait
- **Registre** (`packages/launcher/src/modules/registry.ts`) : module `overseerr`, `configured` = `overseerrUrl` et `overseerrKey`
  présents dans `cimaise.v1`. Masqué tant que non configuré, interrupteur Activé / Masqué comme Plex et Scènes.
- **Section Réglages › Apps intégrées › Overseerr** (`packages/launcher/src/settings/overseerr.ts`, chunk `settings.js`) :
  Adresse (défaut `https://overseerr.wetter.land`), Clé API (masquée `••••••••`), « Tester la connexion ».
- **Clavier à l'écran** (tv-core) : disposition `technique` ajoutée (maj, `. - / : = _`). Sans elle la clé (68 caractères,
  capitales et `=`) était impossible à taper. Disposition par défaut inchangée.
- **Tester** : `GET /api/v1/status` sans clé, puis `GET /api/v1/settings/about` avec la clé. Vérifié contre l'instance : 200/200
  avec la vraie clé (« 1.33.2 joignable, clé acceptée (771 médias) »), 403 → « Échec : clé API refusée » avec une fausse.
- **Persistance** : `saveOverseerrConfig` écrit adresse + clé ensemble ; relues après rechargement de l'app (aperçu : reload de la
  page, module toujours Activé, test réussi). En retour de section, l'interrupteur relit l'état (la saisie l'active aussitôt).
- **Correctif au passage** : le clavier à l'écran des Réglages (Scènes aussi) chevauchait le titre ; placé sous le titre.
- **Secrets** : clé absente du dépôt, de l'historique, de `dist/`, du `.wgt` et du journal du serveur d'aperçu (grep sur la vraie clé : 0) ;
  aucun `console.*` ; la clé n'apparaît dans aucun message d'erreur (testé).
- Tests : `tests/overseerr-settings.test.mjs` (4), + clavier (2), client (3), registre ; `npm run check` vert (669 tests).
- Poids : `settings.js` +5,1 Ko min (+1,7 Ko gzip), `app.js` +0,6 Ko (38,2 / 100 Ko). Aucune requête au démarrage.
- 6 captures 1920×1080 de l'aperçu publiées sur la carte ; entrée dans `docs/decisions.md`.

## Pas fait / à noter
- **Pas essayé sur la Frame** : saisie à la télécommande et test réel restent à faire (recette sur la carte).
- Les captures du test réel ont été prises dans Chromium avec `--disable-web-security` (Overseerr n'envoie pas d'en-tête CORS ;
  la TV passe par `<access origin>`, déjà vérifié « Tout 200 » par la sonde). Dans l'aperçu normal, « Tester » répond « injoignable ».
- Pas de tuile Overseerr sur l'accueil (`tileId: null`) : les écrans ne sont pas câblés, une tuile n'ouvrirait rien. Au câblage,
  ajouter tuile, chunk et garde `moduleEnabled` (voir l'en-tête du registre).
- Saisir 68 caractères au D-pad est long : si c'est trop pénible sur la TV, une saisie depuis le téléphone (page LAN) serait l'étape suivante.
