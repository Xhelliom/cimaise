// Dock v2 : fonctions pures (texte, teinte, géométrie du bac). Aucun accès au DOM.
var DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
var MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

function pad(n: number): string { return n < 10 ? '0' + n : '' + n; }

export function greeting(hour: number): string {
  if (hour < 5) return 'Bonne nuit';
  if (hour < 12) return 'Bonjour';
  if (hour < 18) return 'Bon après-midi';
  return 'Bonsoir';
}

export function formatClock(d: Date): string { return pad(d.getHours()) + ':' + pad(d.getMinutes()); }

export function formatDate(d: Date): string { return DAYS[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()]; }

export function hexToRgb(hex: string): number[] {
  var h = hex.charAt(0) === '#' ? hex.slice(1) : hex;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

// Halo de la maquette : un seul dégradé radial, écrit sur le calque caché puis révélé par opacity.
export function tintGradient(hex: string): string {
  return 'radial-gradient(ellipse 70% 60% at 32% 42%,rgba(' + hexToRgb(hex).join(',') + ',.5),rgba(11,11,13,0) 75%)';
}

// Texte sombre sur une teinte claire (Plex jaune), blanc sinon.
export function tileInk(hex: string): string {
  var c = hexToRgb(hex);
  return (c[0] * 299 + c[1] * 587 + c[2] * 114) / 1000 > 150 ? '#1f1f1f' : '#fff';
}

// Mode d'affichage de l'accueil : grille (défaut, la page défile dès la 2e rangée) ou une rangée qui défile à droite.
export type HomeMode = 'grille' | 'rangee';
export var DEFAULT_MODE: HomeMode = 'grille';
export function normalizeMode(v: any): HomeMode { return v === 'rangee' ? 'rangee' : DEFAULT_MODE; }

// Tuiles à l'écran : 4 (défaut), 5 ou 6. Colonnes de la grille, et tuiles entières visibles en mode une rangée.
export var TILES_CHOICES = [4, 5, 6];
export var DEFAULT_TILES = 4;
export function normalizeTiles(v: any): number { return v === 5 || v === 6 ? v : DEFAULT_TILES; }

// Géométrie (px de la scène 1920×1080), identique à home.css.
export var COLS = 4;
export var SCREEN_H = 1080;
export var BAC_TOP = 690;
export var BAC_W = 1720;
export var BAC_H = 880;     // bac plus haut que l'écran : le bas est coupé par la scène, la page le remonte
export var SCROLL = 520;    // remontée de la page (transform) dès la 2e rangée : en-tête dehors, titre compact, bac à 170 px
export var PAD = 44;        // marge intérieure : anneau 6 px + agrandissement 1,1 (≈ 19 px) + respiration ; rayons concentriques
export var TILE_H = 216;   // hauteur à 4 tuiles ; les autres tailles gardent le ratio 378 × 216
export var GAP = 40;
export var SAFE = 40;       // marge basse
export var PEEK = 90;       // largeur visible de la tuile suivante en mode une rangée

// Largeur d'une tuile pour n colonnes (n tuiles + n-1 écarts remplissent le bac) ; hauteur au même ratio.
export function tileW(n: number): number { return (BAC_W - 2 * PAD - (n - 1) * GAP) / n; }
export function tileH(n: number): number { return Math.round(tileW(n) * TILE_H / tileW(COLS)); }
export function rowTileW(n: number): number { return Math.floor(tileW(n)); }

// Remontée de la page : 0 sur la première rangée (accueil d'origine), SCROLL ensuite.
export function pageShift(row: number): number { return row >= 1 ? SCROLL : 0; }

// Décalage vertical (>= 0) du rail pour que la rangée focalisée tienne entièrement dans le bac visible.
export function railOffset(row: number, n: number = COLS): number {
  var th = tileH(n);
  var bottom = PAD + row * (th + GAP) + th;
  var o = bottom + SAFE - (row >= 1 ? BAC_H : SCREEN_H - BAC_TOP);
  return o > 0 ? o : 0;
}

// Bord haut / bas de la tuile i (mode grille), en px d'écran, une fois la page et le rail décalés.
export function tileBox(i: number, n: number = COLS): { top: number; bottom: number } {
  var row = Math.floor(i / n), th = tileH(n);
  var top = BAC_TOP - pageShift(row) + PAD + row * (th + GAP) - railOffset(row, n);
  return { top: top, bottom: top + th };
}

// Mode une rangée : bord gauche de la tuile i dans le rail, et décalage horizontal (>= 0) du rail.
export function rowTileLeft(i: number, n: number = COLS): number { return PAD + i * (rowTileW(n) + GAP); }
// Les n premières tuiles tiennent entières, sans défilement ; au-delà, la tuile focalisée est calée à droite, la suivante esquissée.
export function rowOffset(i: number, total: number, n: number = COLS): number {
  var w = rowTileW(n);
  if (i < n || 2 * PAD + total * w + (total - 1) * GAP <= BAC_W) return 0; // tout tient : rien ne défile
  var right = rowTileLeft(i, n) + w;
  var limit = i < total - 1 ? BAC_W - GAP - PEEK : BAC_W - PAD;
  var o = right - limit;
  return o > 0 ? o : 0;
}
