Issue : codé

Fait :
- Maquette 2 variantes dans l'aperçu (packages/plex/mockups/bandeau.html, #a / #b), captures sur la vraie bibliothèque
  publiées sur la carte. Stéphane a choisi **A — bandeau haut** (il préfère la légèreté à B, plus immersif).
- Réalisation (e53bd5c) : packages/plex/src/ui/band.ts + home.ts. Bandeau de 480 px : titre (la série pour un épisode),
  « S1 · E8 — épisode » / « Saison 2 », année · durée · âge en clair (ageLabel), jauge « reste », 2 lignes de résumé.
  Image art 960×540 (transcodeur, nette) + dégradés CSS statiques, aucun flou ni filter. Une seule <img>, fondu par opacité,
  image après 300 ms de focus immobile, texte après 100 ms sans touche. En-tête sur une ligne, rangées dessous.
- Coût chiffré dans docs/decisions.md : JS initial inchangé, plex.js +3,1 Ko, CSS +2,4 Ko, 1 image décodée = 1,98 Mo,
  tas JS +0,14 Mo, +15 nœuds DOM, cache +9,5 Ko (résumés coupés à 200 caractères). Latence touche → image suivante
  inchangée en touche maintenue (12,7 contre 12,4 ms, médiane, aperçu CPU ralenti ×6).
- Tests : 5 tests du bandeau + tests de l'accueil adaptés ; npm run check vert (749 tests).
- Frame (11f9040, tv-status) : installé et lancé à 23:09 ; Stéphane voit le bandeau complet, qui suit le focus,
  « aussi fluide » qu'avant.
- Correction au passage : l'index de recherche en arrière-plan prenait arg.http (absent dans l'app) au lieu de c.http.

Pas fait / limites :
- Mémoire et latence pas mesurées sur la Frame : ressenti de Stéphane seulement ; les chiffres viennent de l'aperçu.
- Navigation de l'en-tête modifiée (une seule ligne) : Haut, Haut depuis la 1re rangée mène toujours à Rechercher.
- Variante B non réalisée ; elle ne demanderait qu'un changement de CSS.
