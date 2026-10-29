# Bilan — miniature d'aperçu sur la barre de progression (BIF)

Fait :
- Parseur BIF ES5 (`playback/bif.ts`), chargement de l'index uniquement à l'entrée du focus sur la barre, une seule image 320×180 (URL d'objet révoquée au changement), tout libéré en quittant la barre / fermant la barre / quittant le lecteur. Même comportement en transcodage.
- Correctif (critère 3) : `hasPreviewIndex` ne teste plus que `indexes` (liste séparée par des virgules contenant « sd »). `hasThumbnail` (pochette intégrée, pas un index BIF) ne déclenche plus de GET 404 : repli direct sur l'heure seule. `hasThumbnail` retiré du type `Part`.
- Tests : les 4 tests utilisent `indexes: 'sd'` ; nouveau test : part avec seulement `hasThumbnail: '1'` → aucun téléchargement, heure seule. `npm run check` vert (543 tests).

Non fait :
- Taille téléchargée et mémoire non mesurées : aucune part du serveur n'a encore d'index ; en attente que Stéphane génère les miniatures. Le chemin `/library/parts/{id}/indexes/sd` reste à confirmer sur un vrai index.

## Reprise : test d'abort durci
- Fait : `previewSetup` garde les objets `r` renvoyés par `httpBinary` (`p.handles`). Le test « quitter la barre pendant le téléchargement l'interrompt » vérifie `handles[0].aborted === true` juste après `down`, puis qu'une réponse tardive n'affiche aucune image. Mutation vérifiée : sans `bifReq.abort()` le test échoue.
- Code du lecteur inchangé. `npm run check` vert (543 tests).
- Non fait : mesures de taille et de mémoire (en attente de Stéphane, consigne).
