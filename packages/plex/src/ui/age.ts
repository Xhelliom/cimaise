// Âge en clair (signalétique CSA) à partir du contentRating Plex. Table construite sur les valeurs réellement présentes
// sur le serveur du homelab (docs/decisions.md, 07/11), plus les codes FR/DE/UK courants. Code inconnu : null (rien affiché).
var TP = 'Tous publics';
var AGE: { [code: string]: string } = {
  // US cinéma (MPA)
  'g': TP, 'pg': '-10 ans', 'pg-13': '-12 ans', 'r': '-16 ans', 'nc-17': '-18 ans',
  // US TV
  'tv-y': TP, 'tv-g': TP, 'tv-y7': '-10 ans', 'tv-y7-fv': '-10 ans', 'tv-pg': '-10 ans', 'tv-14': '-12 ans', 'tv-ma': '-16 ans',
  // FR (fr/… ou nu) : U/TP = tous publics
  'u': TP, 'tp': TP, '10': '-10 ans', '12': '-12 ans', '16': '-16 ans', '18': '-18 ans',
  // DE (FSK) : 0 et 6 tous publics
  '0': TP, '6': TP,
  // UK (BBFC) : U et PG tous publics, 12A ≈ -12
  '12a': '-12 ans', '15': '-16 ans', 'r18': '-18 ans'
};
// UK PG (« parental guidance ») est plus doux que le PG américain mais porte le même code : on garde la lecture US,
// la plus présente sur le serveur. Seul le préfixe de pays explicite gb/ ou uk/ donne « Tous publics ».
var UK_PG: { [c: string]: number } = { 'gb/pg': 1, 'uk/pg': 1 };

export function ageLabel(code?: string | null): string | null {
  if (!code) return null;
  var c = String(code).replace(/^\s+|\s+$/g, '').toLowerCase();
  if (UK_PG[c]) return TP;
  var bare = c.replace(/^[a-z]{2}\//, '').replace(/^fsk\s*/, '');
  return AGE.hasOwnProperty(bare) ? AGE[bare] : null;
}
