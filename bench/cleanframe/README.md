# Bench CleanFrame (référence de mesure)

HANDOFF §6 bis, étape 2 : CleanFrame **tel quel**, pour comparer son démarrage à la page vide
puis à cimaise sur la Frame 2019. Rien n'est optimisé. Hors `packages/launcher`.

- Source : https://github.com/nthnclrk/CleanFrame, commit figé `58ac92a7b8f80047ca26e5b7097f5e1616762db0` (MIT).
- `node bench/cleanframe/build.mjs` récupère ce commit dans `work/` (ignoré par git), applique les trois
  seules modifications ci-dessous et écrit `dist/cleanframe-bench.wgt` (ignoré par git, **non signé**,
  sans SDK ni Docker). Prérequis : `git` et le réseau au premier lancement.
- `LICENSE` et `THIRD_PARTY_NOTICES.md` (MIT) sont conservés ici et dans le `.wgt`.

## Modifications de `config.xml`

| Champ | Amont | Bench | Pourquoi |
|---|---|---|---|
| `required_version` | `6.5` | `5.0` | La Frame 2019 est en Tizen 5.0 ; sinon l'installation est probablement refusée (HANDOFF §3). |
| `application id` / `package` | `nClrkHome1.FrameHome` / `nClrkHome1` | `cmbnchcf01.CleanFrameBench` / `cmbnchcf01` | Identité distincte de cimaise (`cimaise0011.Cimaise`) et de l'amont ; 10 caractères alphanumériques. |
| `widget id` | `https://local.frame-home/app` | `https://local.cimaise-bench/cleanframe` | Idem. |
| `<name>` | `CleanFrame` | `CleanFrame (bench)` | Repérable dans la liste d'apps. |

## Non testé

Aucune installation sur la TV : il faut signer avec le packager officiel (`tizen package`, jamais à la main)
avant `sdb install`. Si Tizen 5 refuse le `.wgt` (privilèges, APIs absentes de l'amont), le noter dans
`docs/tv-status.md` ; les privilèges amont sont laissés intacts.
