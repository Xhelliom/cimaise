import { loadStored, saveStored } from '../../../tv-core/src/storage';
import { HomeMode, normalizeMode } from './model';

// Préférence dans cimaise.v1 (prefs.homeMode) ; toute valeur inconnue retombe sur la grille.
export function loadHomeMode(store?: Storage): HomeMode { return normalizeMode(loadStored(store).prefs.homeMode); }

export function saveHomeMode(mode: HomeMode, store?: Storage): void {
  var s = loadStored(store);
  s.prefs.homeMode = mode;
  saveStored(s, store);
}
