# Bilan — mesures Plex dans le diagnostic

Fait : durées « bibliothèque (cache) », « bibliothèque (réseau) », « fiche », « lecture (Entrée → 1re image) » (10 dernières, min/médiane/max)
dans la section « Plex » du diagnostic (touche 0), plus « mémoire JS » si `performance.memory` existe. Aucune minuterie, aucune requête.
Marques dans packages/plex/src/ui/{library,detail,player}.ts ; stockage et rapport dans packages/tv-core/src/diag.ts.
Non fait : les valeurs réelles sur la TV (à relever par Stéphane, touche 0, puis à consigner dans docs/tv-status.md).
Choix : « cache » = réponse rendue pendant l'appel (même périmée) ; « 1re image » = 1er `oncurrentplaytime` AVPlay ;
avec question de reprise, la durée part du choix. playback/ et le wrapper AVPlay non touchés.
