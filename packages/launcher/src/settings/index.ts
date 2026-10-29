// Point d'entrée du module Réglages : chargé à la première ouverture (pastille Réglages) par le routeur,
// jamais importé depuis l'index du launcher (donc absent du bundle initial).
export { createSettings, SettingsOptions } from './screen';
export { HaSettings } from './scenes';
export { AppEntry, DiscoveredApp, PALETTE, removeAt, moveItem, setTint, nextTint, notInCatalog, addDiscovered, scrollOffset, ROW_H, VIEW_H } from './model';
export { fillIds } from '../catalog/model';
