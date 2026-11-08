Issue : codé

Fait (commit ffe24a2 + suivant) :
- Premier rendu : une tuile à logo n'a que sa couleur de marque, sans texte ; une app sans logo garde son nom.
- Logo posé une fois chargé, en fondu d'opacity 150 ms (transition CSS, classe `vu`) ; la mention « officiel » suit.
- Nom en repli : logo en échec (nouveau `onFailed` d'`applyIcon`), ou tuile encore muette 400 ms après le premier rendu
  (une seule minuterie ponctuelle) ; un logo arrivé ensuite remplace le nom.
- Tests mis à jour et ajoutés (760/760), typecheck, ES5, CSS, budget JS (app.js 40,45 Ko / 100) OK.
- Mesures avant/après dans l'aperçu bridé (CPU ×1 et ×4) : firstPaint et latence dans le bruit, pas de recul
  (tableau dans docs/decisions.md). Rendus publiés sur la carte : planche-avant/après.png, demarrage-avant/après.gif.
- Paquets signés et installés sur la Frame et sur TV2 : réponse du SDK seulement (« install completed »).

Pas fait / en attente :
- Validation à l'écran par Stéphane (lancement à froid sur la Frame) et mesure firstPaint/latence sur la TV (diagnostic,
  touche 0) : l'aperçu ne reproduit pas les coûts de la TV.
- Teinte du fond (dégradé) laissée dans enrich() : son coût au premier rendu n'est pas nul (suspect du firstPaint sur la Frame).
