// Accueil Dock v2 : écran principal du launcher. Le CSS (home.css) et la police (fonts/) se branchent à part.
export { createHome, HomeOptions, HomePanel, PastilleName } from './screen';
export { greeting, formatClock, formatDate, hexToRgb, tintGradient, tileInk, tileBox, railOffset, pageShift, rowOffset, rowTileLeft, rowTileW, tileW, tileH, normalizeMode, normalizeTiles, TILES_CHOICES, DEFAULT_TILES, HomeMode, DEFAULT_MODE, COLS, PAD, GAP, BAC_W, PEEK } from './model';
export { loadHomeMode, saveHomeMode, loadHomeTiles, saveHomeTiles, loadSmartHubTarget, saveSmartHubTarget } from './mode';
