Issue : partiel

## Smart Hub : icône de cimaise au format tuile paysage

**Fait**
- Format vérifié dans la doc Samsung (lue directement) : 117×117 = icône « de test » (Design Q&A, Q3) ; icône des apps
  publiées = **512×423, PNG 24 bits RVB** (App Icons and Screenshots). Rien sur l'`<icon>` de `config.xml` : extrapolation.
- `apps/tv/icon.png` refaite en 512×423 RVB sans alpha (source `packages/launcher/brand/icon.svg` : fond verre-2 plein
  cadre, symbole centré) : 37 092 octets (+31 444 o vs 117×117). Consigné dans `docs/decisions.md` ; test mis à jour ;
  `npm run check` vert (767 tests).

**Pas encore fait**
- Installation sur la Frame : en attente de la carte « Launcher : plus de nom d'app » (consigne de l'orchestrateur :
  ne pas installer avant qu'elle soit « done »).
- Vérification à l'œil par Stéphane de la tuile dans la barre du Smart Hub.
