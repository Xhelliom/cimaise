# Bilan — Sonde formats

Fait : écran caché « Sonde formats » (diagnostic → touche 0 puis 1), sonde automatique d'une fiche par catégorie (18 catégories), tableau + JSON `cimaise.probe.v1` + ligne compacte pour photo, `scripts/tizen/read-probe.sh`. Aucune écriture serveur (GET seulement, pas de timeline). Profil non modifié. `npm run check` vert (374 tests, dont 7 nouveaux dans tests/plex-probe.test.mjs).

Pas fait / réserves : rien n'a été lancé sur la TV (non testé). `read-probe.sh` est un meilleur effort non vérifié ; repli = ligne compacte à l'écran. Une catégorie rare peut sortir « aucune fiche » à cause du plafond d'échantillonnage (8 fiches par signature, 400 au total). Le son est audible pendant la sonde. Les tests ont été écrits après le code (pas de phase « rouge » préalable).
