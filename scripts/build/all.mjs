// Construit les deux cibles : l'app cimaise (apps/tv) et la page vide de référence (apps/blank, mesure plancher M1).
import { spawnSync } from 'node:child_process';

const targets = [
  { app: 'apps/tv', wgt: 'cimaise' },
  { app: 'apps/blank', wgt: 'blank' },
];
for (const t of targets) {
  for (const s of ['build', 'wgt', 'size-report']) {
    const r = spawnSync('node', [`scripts/build/${s}.mjs`], {
      stdio: 'inherit',
      env: { ...process.env, CIMAISE_APP: t.app, CIMAISE_WGT: t.wgt },
    });
    if (r.status !== 0) process.exit(r.status ?? 1);
  }
}
