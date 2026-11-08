// Ajoute (ou remplace) un profil de signature dans profiles.xml du SDK SANS toucher au profil actif ni aux autres profils.
// Sert à TV2 : `tizen security-profiles add` y a écrit des chemins .pwd inexistants (essai du 2026-11-08) ; le packager
// accepte en revanche les mots de passe en clair dans profiles.xml (fichier dans .local/, ignoré par git).
// Entrées : variables d'environnement SIGN_PROFILE, AUTHOR_CERT, AUTHOR_PASSWORD, DISTRIBUTOR_CERT, DISTRIBUTOR_PASSWORD
// (chargées depuis l'env-file de la cible par setup-profile.sh), jamais en argument. Rien de secret n'est affiché.
// Usage : node scripts/tizen/add-profile.mjs <chemin/profiles.xml>
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';

const file = process.argv[2];
const fail = (m) => { console.error(`add-profile : ${m}`); process.exit(1); };
if (!file) fail('usage : add-profile.mjs <profiles.xml>');
const env = process.env;
for (const k of ['SIGN_PROFILE', 'AUTHOR_CERT', 'AUTHOR_PASSWORD', 'DISTRIBUTOR_CERT', 'DISTRIBUTOR_PASSWORD']) if (!env[k]) fail(`variable ${k} absente`);
const name = env.SIGN_PROFILE;
if (!/^[A-Za-z0-9._-]+$/.test(name)) fail(`nom de profil invalide « ${name} »`);

const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const block =
  `<profile name="${name}">\n` +
  `<profileitem ca="" distributor="0" key="${esc(env.AUTHOR_CERT)}" password="${esc(env.AUTHOR_PASSWORD)}" rootca=""/>\n` +
  `<profileitem ca="" distributor="1" key="${esc(env.DISTRIBUTOR_CERT)}" password="${esc(env.DISTRIBUTOR_PASSWORD)}" rootca=""/>\n` +
  `<profileitem ca="" distributor="2" key="" password="" rootca=""/>\n` +
  `</profile>\n`;

let xml;
if (existsSync(file)) {
  xml = readFileSync(file, 'utf8');
  const active = (xml.match(/<profiles\b[^>]*\bactive="([^"]*)"/) || [])[1];
  if (active === name) fail(`« ${name} » est le profil actif : refus (le profil actif de la Frame ne doit pas changer)`);
  if (!xml.includes('</profiles>')) fail('</profiles> introuvable');
  const backup = `${file}.avant-${name}`;
  if (!existsSync(backup)) copyFileSync(file, backup); // première version d'origine, jamais écrasée
  const re = new RegExp(`<profile name="${name.replace(/[.]/g, '\\.')}">[\\s\\S]*?</profile>\\n?`);
  xml = re.test(xml) ? xml.replace(re, block) : xml.replace('</profiles>', `${block}</profiles>`);
} else {
  // Aucun profil encore : on crée le fichier SANS profil actif (le packager prend le profil passé par -s).
  xml = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n<profiles active="" version="3.1">\n${block}</profiles>\n`;
}
writeFileSync(file, xml, { mode: 0o600 });
console.log(`add-profile : profil « ${name} » écrit dans ${file} (profil actif inchangé)`);
