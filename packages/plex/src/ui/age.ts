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

// ---- Filtre par âge d'une bibliothèque ----
// Rang de chaque libellé (plus petit = plus jeune public). Code inconnu ou non classé : -1 (masqué dès qu'un âge est choisi).
var RANK: { [label: string]: number } = { 'Tous publics': 0, '-10 ans': 1, '-12 ans': 2, '-16 ans': 3, '-18 ans': 4 };
export function ageRank(code?: string | null): number {
  var l = ageLabel(code);
  return l && RANK.hasOwnProperty(l) ? RANK[l] : -1;
}

// Choix proposés sur la pilule, dans l'ordre où Entrée les fait défiler. `max` : rang le plus élevé gardé ; absent = tout.
export interface AgeFilter { id: string; label: string; max?: number; }
export var AGE_FILTERS: AgeFilter[] = [
  { id: 'all', label: 'Tous' },
  { id: 'tp', label: 'Tous publics', max: 0 },
  { id: '10', label: '-10 ans', max: 1 },
  { id: '12', label: '-12 ans', max: 2 }
];
export function ageFilter(id?: string | null): AgeFilter {
  for (var i = 0; i < AGE_FILTERS.length; i++) if (AGE_FILTERS[i].id === id) return AGE_FILTERS[i];
  return AGE_FILTERS[0];
}
// Titre gardé par le filtre (séries : la classification de la série ; un épisode porte la même, vérifié le 08/11).
export function ageAllowed(code: string | null | undefined, f: AgeFilter): boolean {
  if (f.max === undefined) return true;
  var r = ageRank(code);
  return r >= 0 && r <= f.max;
}
// Codes à passer au serveur (contentRating=…) : parmi les classifications présentes dans la bibliothèque, telles que le
// serveur les écrit (filtre sensible à la casse), celles que la table ci-dessus place à cet âge ou moins. null = pas de filtre.
export function ageCodes(present: string[], f: AgeFilter): string[] | null {
  if (f.max === undefined) return null;
  var out: string[] = [];
  for (var i = 0; i < present.length; i++) if (ageAllowed(present[i], f) && out.indexOf(present[i]) < 0) out.push(present[i]);
  return out;
}
