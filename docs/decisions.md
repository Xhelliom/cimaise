# Journal des décisions

Toute dépendance runtime ajoutée doit être justifiée ici, avec son poids.

## Décisions initiales (HANDOFF §2)

- **Un monorepo** : code partagé (navigation, lecteur, adaptateur Tizen), une seule identité de signature, une seule installation.
- **Plex = module de la même app `.wgt`** : passage accueil → Plex instantané ; module isolé pour pouvoir être packagé seul plus tard.
- **Point de départ : copie de CleanFrame (MIT)**, restructurée et allégée ; conserver `LICENSE` et `THIRD_PARTY_NOTICES`.
- **Priorité : légèreté avant personnalisation.** La TV de 2019 est le goulot.
- **Langage : TypeScript compilé en ES5.** Le moteur web de Tizen 5 est ancien.
- **Lecteur vidéo : AVPlay** (`webapis.avplay`), pas `<video>`.
- **Bouton Home : hors périmètre** au départ (opérations natives non documentées, testées sur Tizen 9 uniquement).
- **Démarrage : autorun de la dernière app** (réglage officiel) ; le retour Home ramène au Smart Hub.
- **Boîtier externe écarté** : solution logicielle sur la TV elle-même.
