# Bilan — bouton Home natif (exploration, HANDOFF §9)

## Fait (cette reprise)
- Étude du mécanisme CleanFrame (clone du dépôt, lecture de `scripts/native-home/` :
  `Control.cs`, `run.py`, `README.md`, scripts shell) et de ses preuves (`docs/compatibility.md`).
- Livré **`docs/home-button.md`** (publié aussi comme livrable sur la carte) :
  1. Mécanisme Tizen 9 : assistant .NET 6 one-shot, P/Invoke dans les libs natives Tizen
     (aul/vconf/app-operation), les 5 réglages `db/...`, ce qui est **lu** vs **écrit** à l'apply,
     garde-fous, et le fait que l'exécution passe par une **injection non documentée** du tooling
     d'installation (= exploit interdit §9/§10). Prérequis runtime .NET 6. Sources citées.
  2. Transposition Tizen 5.0 : **impossible dans les limites du §9** — canal = exploit interdit ;
     runtime .NET probablement absent sur une TV 2019 (non vérifié) ; pas d'API Web pour
     réassigner/lire le Home ; vconf non exposé au Web. CleanFrame note lui-même « Not tested »
     sur la Frame 2019 (QE55LS03R, Tizen 5.0).
  3. Voies officielles recensées : autorun « dernière application », comportement Home/Retour,
     pastille Smart Hub via `hide()`, persistance mémoire — aucun réglage public pour rediriger
     le bouton Home.
  4. Risques, **recommandation** (rester officiel, ne pas porter l'assistant), questions laissées
     à Stéphane (Q-A/Q-B), et **commandes de vérification en lecture seule** pour l'orchestrateur.
- 3 cartes de suivi filées sur le board (status backlog, non démarrées), découlant de la conclusion :
  - Relever en lecture seule le runtime .NET et les réglages Home (§6 du doc).
  - Vérifier l'autorun après mode Art / coupure courant (HANDOFF §11 Q5).
  - Mesurer la réouverture depuis l'arrière-plan (budget §6 bis).

## Non fait / réserve (volontaire)
- **Aucune action sur la TV** (exploration, §9 respecté). Les vérifications en lecture seule
  restent à exécuter par l'orchestrateur, avec l'accord de Stéphane — hors de cette carte.
- La présence/absence réelle d'un runtime .NET et les valeurs d'origine des réglages Home sur
  *notre* Frame ne sont donc **pas** confirmées ; c'est l'objet de la carte de suivi dédiée.

## Pas de recette
Carte d'exploration : le livrable est un document, rien de visible/actionnable n'a changé dans l'app.
