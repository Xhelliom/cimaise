// Accueil Dock v2 : écran principal du launcher. Le CSS (home.css) et la police (fonts/) se branchent à part.
export { createHome, HomeOptions, HomePanel, PastilleName } from './screen';
export { greeting, formatClock, formatDate, hexToRgb, tintGradient, tileInk, tileBox, railOffset, pageShift, rowOffset, rowTileLeft, normalizeMode, HomeMode, DEFAULT_MODE, COLS, PAD, BAC_W, ROW_TILE_W, PEEK } from './model';
export { loadHomeMode, saveHomeMode } from './mode';
