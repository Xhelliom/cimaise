import { loadStored, saveStored } from '../../../tv-core/src/storage';
import { HomeMode, normalizeMode, normalizeTiles } from './model';

// Préférence dans cimaise.v1 (prefs.homeMode) ; toute valeur inconnue retombe sur la grille.
export function loadHomeMode(store?: Storage): HomeMode { return normalizeMode(loadStored(store).prefs.homeMode); }

export function saveHomeMode(mode: HomeMode, store?: Storage): void {
  var s = loadStored(store);
  s.prefs.homeMode = mode;
  saveStored(s, store);
}

// Préférence dans cimaise.v1 (prefs.homeTiles) : 4, 5 ou 6 ; toute autre valeur retombe sur 4.
export function loadHomeTiles(store?: Storage): number { return normalizeTiles(loadStored(store).prefs.homeTiles); }

export function saveHomeTiles(n: number, store?: Storage): void {
  var s = loadStored(store);
  s.prefs.homeTiles = normalizeTiles(n);
  saveStored(s, store);
}

// Préférence dans cimaise.v1 (prefs.smartHubApp) : ID de l'app TV que la pastille Smart Hub lance. Vide = repli (quitter vers le Smart Hub).
// Jamais d'ID en dur : relevé sur la TV (HANDOFF §3).
export function loadSmartHubTarget(store?: Storage): string {
  var v = loadStored(store).prefs.smartHubApp;
  return typeof v === 'string' ? v : '';
}

export function saveSmartHubTarget(id: string, store?: Storage): void {
  var s = loadStored(store);
  s.prefs.smartHubApp = id;
  saveStored(s, store);
}
