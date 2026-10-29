// Point d'entrée du module Réglages : chargé à la première ouverture (pastille Réglages) par le routeur,
// jamais importé depuis l'index du launcher (donc absent du bundle initial).
export { createSettings, SettingsOptions } from './screen';
export { AppEntry, DiscoveredApp, PALETTE, removeAt, moveItem, setTint, nextTint, notInCatalog, addDiscovered } from './model';
