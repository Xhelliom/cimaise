# Bilan — Reprendre / Depuis le début

**Fait**
- Fiche entamée : deux boutons « Reprendre S1 E8 · 12:34 » (focus initial) et « Depuis le début » ; sinon un seul « Lire ». Un titre vu en entier (viewOffset >= durée) affiche « Lire » seul (garde rétablie).
- Le lecteur ne pose plus la question. Il reçoit une intention : 0 (depuis le début), `RESUME` (-1, défini dans `ui/context.ts`) ou une position.
- Correctif position périmée (option A) : « Reprendre » et Entrée sur un épisode passent `RESUME` ; le lecteur lit le `viewOffset` du `full` qu'il récupère déjà sur le serveur (jamais le cache de la fiche, TTL 30 min). Position serveur ≥ durée ou absente → départ à 0.
- Commentaire de `player.ts` corrigé.
- Tests : fiche entamée / non entamée / vue en entier ; lecteur sans question ; cache à 100000 vs serveur à 3082192 → départ à la valeur du serveur ; RESUME sans position serveur → 0.
- Fixture `ondeck.json` : durée de l'épisode 300 corrigée (438099 → 1438099), la position 600000 la dépassait.
- `npm run check` vert (515 tests).

**Reste / à noter**
- Un `onPlay` externe reçoit désormais `RESUME` (-1) au lieu d'une position en ms pour une reprise ; aucun appelant externe n'existe dans le repo.
- Non vérifié sur la TV.
