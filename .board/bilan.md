# Bilan — pourquoi TV2 (Tizen 4) refuse la page signée (31/10)

Exploration, aucun code. Rien de tout ça n'existait sur la base (0e765a9).

## Fait
- `docs/tv-status.md`, section « TV2 » : sens des codes avec sources.
  118019 = `[118, -19] Parsing error`, le `config.xml` est rejeté (required_version 5.0 > Tizen 4.0) ;
  118012 = `[118, -12] Check certificate error`, la chaîne de certificats de la signature n'est pas reconnue.
- Vérifié en lecture seule sur le poste : le DUID de TV2 est bien dans le certificat distributeur ;
  les CA intermédiaires Samsung qui ont émis nos certificats datent de juin 2025.
- Cause probable : TV2 ne connaît pas la nouvelle racine Samsung (réponse de Samsung, Tizen.Issues #139, sept. 2026).
  Hypothèses secondaires : horloge de TV2, SHA-512. Prochain test et questions pour Stéphane dans la note.
- Carte de suite créée : « TV2 : relever la raison complète du refus 118012 (chaîne de certificats ?) ».

## Pas fait, et pourquoi
- Aucune action sur TV2 : il faut l'accord de Stéphane (c'est la carte de suite).
- Texte complet de l'erreur de TV2 non vu : on n'a que les codes.
- `.local/tizen.env` non modifié (ni aucun autre fichier de `.local/`).
