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

// Géométrie du bac (px de la scène 1920×1080), identique à home.css.
export var COLS = 4;
export var SCREEN_H = 1080;
export var BAC_TOP = 690;
export var PAD = 28;
export var TILE_H = 216;
export var GAP = 40;
export var SAFE = 40; // marge basse : anneau 6 px + agrandissement 1,1 (≈ 11 px) + respiration

// Bord haut / bas de la tuile i, en px d'écran, bac non défilé.
export function tileBox(i: number): { top: number; bottom: number } {
  var top = BAC_TOP + PAD + Math.floor(i / COLS) * (TILE_H + GAP);
  return { top: top, bottom: top + TILE_H };
}

// Décalage vertical (>= 0) du rail pour que la rangée focalisée tienne entièrement à l'écran.
export function railOffset(row: number): number {
  var bottom = PAD + row * (TILE_H + GAP) + TILE_H;
  var o = bottom + SAFE - (SCREEN_H - BAC_TOP);
  return o > 0 ? o : 0;
}
